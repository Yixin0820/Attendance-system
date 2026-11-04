/**
 * 一键启动 / 自检 / 联调验证（跨平台，不依赖 cmd 语法、curl 或 timeout）。
 *
 *   node scripts/start-all.mjs                  启动后端 + 前端并打开浏览器
 *   node scripts/start-all.mjs --no-browser    同上但不打开浏览器（服务器/自动化用）
 *   node scripts/start-all.mjs --check         只做环境自检，不启动服务
 *   node scripts/start-all.mjs --verify        启动后端并跑完联调检查后自动停止
 *   node scripts/start-all.mjs --smoke         完整启动前后端，验证页面可访问后自动停止
 *   node scripts/start-all.mjs --backend-only  只启动后端并保持运行
 *   node scripts/start-all.mjs --frontend-only 只启动前端（要求后端已在运行）
 *
 * 旧版 start-all.bat 依赖 curl / timeout / goto / 中文 UTF-8 批处理，
 * 在被重定向的控制台或不同代码页下极易失败；这里统一用 Node 重写。
 */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = path.join(ROOT, 'backend');
const IS_WIN = process.platform === 'win32';
const VENV_PY = path.join(BACKEND, '.venv', IS_WIN ? 'Scripts' : 'bin', IS_WIN ? 'python.exe' : 'python');
const DB_FILE = path.join(BACKEND, 'attendance.db');
const LOG_FILE = path.join(BACKEND, 'server.log');
const API = 'http://127.0.0.1:8000';
const HEALTH = `${API}/api/health`;
const FRONTEND = 'http://127.0.0.1:4180/';
const NPM = IS_WIN ? 'npm.cmd' : 'npm';
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

const args = new Set(process.argv.slice(2));
const CHECK = args.has('--check');
const VERIFY = args.has('--verify');
const SMOKE = args.has('--smoke');
const NO_BROWSER = args.has('--no-browser') || CHECK || VERIFY || SMOKE;
const BACKEND_ONLY = args.has('--backend-only');
const FRONTEND_ONLY = args.has('--frontend-only');

const C = {
  ok: (s) => `\u001b[32m${s}\u001b[0m`,
  bad: (s) => `\u001b[31m${s}\u001b[0m`,
  dim: (s) => `\u001b[90m${s}\u001b[0m`,
};
const stamp = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });
const log = (msg) => console.log(`[${stamp()}] ${msg}`);
const fail = (msg) => { console.error(`\n[启动失败] ${msg}\n`); process.exit(1); };

function run(cmd, argv, opts = {}) {
  return spawnSync(cmd, argv, {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    stdio: opts.silent ? 'pipe' : 'inherit',
    shell: opts.shell ?? false,
    windowsHide: true,
    ...opts,
  });
}

function runOk(cmd, argv, opts = {}) {
  const r = run(cmd, argv, opts);
  return r.status === 0 && !r.error;
}

async function httpJson(url, init = {}, timeoutMs = 2000) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  let body = null;
  try { body = await res.json(); } catch { /* 非 JSON 接口 */ }
  return { status: res.status, headers: res.headers, body };
}

async function isHealthy() {
  try {
    const r = await httpJson(HEALTH, {}, 1500);
    return r.status === 200 && r.body?.status === 'ok';
  } catch {
    return false;
  }
}

function logTail(lines = 25) {
  if (!existsSync(LOG_FILE)) return '（无 server.log）';
  const text = readFileSync(LOG_FILE, 'utf8').trimEnd().split(/\r?\n/);
  return text.slice(-lines).join('\n');
}

/** 打印环境体检报告，返回是否具备启动条件。 */
function diagnose() {
  const rows = [];
  const add = (name, ok, hint) => rows.push({ name, ok, hint });

  add('项目根目录', existsSync(path.join(ROOT, 'package.json')), ROOT);
  add('Node.js', (() => { const r = run('node', ['--version'], { silent: true }); return r.status === 0; })(), process.version);
  add('前端依赖 node_modules', existsSync(path.join(ROOT, 'node_modules')), '缺失时执行 npm install');
  add('前端构建产物 dist/index.html', existsSync(path.join(ROOT, 'dist', 'index.html')), '缺失时执行 npm run build');

  let pyVersion = '未安装';
  let venvOk = existsSync(VENV_PY);
  if (venvOk) {
    const r = run(VENV_PY, ['--version'], { silent: true });
    pyVersion = (r.stdout || r.stderr || '').trim() || '未知';
  } else {
    const r = run('python', ['--version'], { silent: true });
    pyVersion = (r.stdout || r.stderr || '').trim() || pyVersion;
  }
  add('后端虚拟环境 .venv', venvOk, venvOk ? pyVersion : '首次启动会自动创建（需 Python 3.11+）');

  let depsOk = false;
  if (venvOk) {
    depsOk = runOk(VENV_PY, [
      '-c', 'import fastapi, uvicorn, sqlalchemy, jwt, bcrypt, pydantic_settings, alembic, multipart',
    ], { cwd: BACKEND, silent: true });
  }
  add('后端 Python 依赖', depsOk, depsOk ? '齐全' : '缺失时会自动 pip install -r requirements.txt');
  add('数据库 attendance.db', existsSync(DB_FILE), existsSync(DB_FILE) ? '已存在' : '首次启动会自动导入种子数据');

  return rows;
}

function printDiagnose(rows) {
  console.log('\n===== 运行环境自检 =====');
  for (const r of rows) {
    console.log(`  ${r.ok ? C.ok('[OK]  ') : C.bad('[缺失]')} ${r.name.padEnd(28, ' ')} ${C.dim(r.hint)}`);
  }
  console.log('');
}

/** 确保 venv、依赖、种子数据齐全。 */
function ensureBackendFiles() {
  if (!existsSync(VENV_PY)) {
    log('[1/5] 首次运行：创建 Python 虚拟环境...');
    if (!runOk('python', ['-m', 'venv', '.venv'], { cwd: BACKEND })) {
      fail('创建 .venv 失败。请安装 Python 3.11+ 并勾选 "Add python.exe to PATH"，然后重试。');
    }
  } else {
    log('[1/5] 虚拟环境已就绪');
  }

  const depsReady = runOk(VENV_PY, [
    '-c', 'import fastapi, uvicorn, sqlalchemy, jwt, bcrypt, pydantic_settings, alembic, multipart',
  ], { cwd: BACKEND, silent: true });
  if (!depsReady) {
    log('[2/5] 安装后端依赖（首次约 1-3 分钟）...');
    const mirrors = [
      ['-i', 'https://pypi.tuna.tsinghua.edu.cn/simple'],
      [],
    ];
    let installed = false;
    for (const extra of mirrors) {
      if (runOk(VENV_PY, ['-m', 'pip', 'install', '-r', 'requirements.txt', ...extra], { cwd: BACKEND })) {
        installed = true;
        break;
      }
      log('      镜像源失败，改用官方源重试...');
    }
    if (!installed) fail('依赖安装失败。请检查网络，或手动执行：backend\\.venv\\Scripts\\python.exe -m pip install -r backend\\requirements.txt');
  } else {
    log('[2/5] 后端依赖齐全');
  }

  if (!existsSync(DB_FILE)) {
    log('[3/5] 首次运行：导入基础数据...');
    if (!runOk(VENV_PY, ['-m', 'app.seed.run_seed', '--force'], { cwd: BACKEND })) {
      fail('种子数据导入失败，请查看上方报错。');
    }
  } else {
    log('[3/5] 数据库已存在');
  }
}

/** 启动 uvicorn，日志写 backend/server.log。返回子进程。 */
function startUvicorn() {
  log('[4/5] 启动后端 API ...');
  const out = createWriteStream(LOG_FILE, { flags: 'w' });
  out.write(`===== ${new Date().toISOString()} uvicorn =====\n`);
  const child = spawn(VENV_PY, [
    '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000',
  ], { cwd: BACKEND, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

  const forward = (chunk) => {
    const text = chunk.toString('utf8');
    out.write(text);
    for (const line of text.split(/\r?\n/)) {
      if (/error|traceback|exception|address already in use|Uvicorn running|Application startup complete/i.test(line)) {
        console.log(`  ${C.dim('backend>')} ${line.trim()}`);
      }
    }
  };
  child.stdout.on('data', forward);
  child.stderr.on('data', forward);
  return child;
}

async function waitHealthy(child, maxSeconds = 40) {
  const deadline = Date.now() + maxSeconds * 1000;
  let dot = 0;
  while (Date.now() < deadline) {
    if (await isHealthy()) return true;
    if (child && child.exitCode !== null) return false;
    await new Promise((r) => setTimeout(r, 1000));
    dot += 1;
    if (dot % 5 === 0) log(`      仍在等待后端就绪（${dot}s）...`);
  }
  return false;
}

function ensureFrontendFiles() {
  if (!existsSync(path.join(ROOT, 'node_modules'))) {
    log('      未找到 node_modules，正在 npm install ...');
    if (!runOk(NPM, ['install'], { shell: IS_WIN })) fail('npm install 失败，请检查 Node.js 与网络。');
  }
  if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    log('[5/5] 未找到前端构建产物，正在构建前端 ...');
    if (!runOk(process.execPath, [VITE_BIN, 'build'])) fail('前端构建失败，请查看上方报错。');
  } else {
    log('[5/5] 前端构建产物已就绪');
  }
}

function killTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  try {
    if (IS_WIN) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else child.kill('SIGTERM');
  } catch { /* 已退出 */ }
}

function openBrowser() {
  if (NO_BROWSER) return;
  try {
    if (IS_WIN) {
      const p = spawn('cmd.exe', ['/c', `start "" ${FRONTEND}`], { detached: true, stdio: 'ignore', windowsHide: true });
      p.unref();
    } else {
      const p = spawn('xdg-open', [FRONTEND], { detached: true, stdio: 'ignore' });
      p.unref();
    }
  } catch {
    log(`      无法自动打开浏览器，请手动访问 ${FRONTEND}`);
  }
}

/** 联调验证：health / docs / CORS / 登录 / 元数据。 */
async function runVerify() {
  const checks = [];
  const push = (name, ok, detail = '') => checks.push({ name, ok, detail });

  try {
    const h = await httpJson(HEALTH);
    push('健康检查 /api/health', h.status === 200 && h.body?.status === 'ok', `HTTP ${h.status} ${JSON.stringify(h.body)}`);
    const d = await fetch(`${API}/api/docs`, { signal: AbortSignal.timeout(3000) });
    push('接口文档 /api/docs', d.status === 200, `HTTP ${d.status}`);
    const cors = await fetch(HEALTH, {
      headers: { Origin: FRONTEND.replace(/\/$/, '') },
      signal: AbortSignal.timeout(3000),
    });
    const allow = cors.headers.get('access-control-allow-origin');
    push('CORS 放行 4180 前端', Boolean(allow), allow ?? '未返回 Access-Control-Allow-Origin');
    const login = await httpJson(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ops', password: '123456' }),
    }, 5000);
    const token = login.body?.accessToken;
    push('登录接口 /api/auth/login', login.status === 200 && Boolean(token), `HTTP ${login.status}`);
    const boot = await httpJson(`${API}/api/meta/bootstrap`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }, 3000);
    push('元数据 /api/meta/bootstrap', boot.status === 200, `HTTP ${boot.status}`);
  } catch (err) {
    push('联调请求', false, String(err));
  }
  return checks;
}

async function main() {
  console.log('\n============================================');
  console.log('  晚自习考勤管理系统 · 完整模式（前后端联调）');
  console.log('============================================\n');

  const rows = diagnose();
  if (CHECK) {
    printDiagnose(rows);
    log(`后端当前状态：${(await isHealthy()) ? C.ok('已运行') : '未运行（start-all.bat 会拉起）'}`);
    log(`完整日志：${LOG_FILE}`);
    return;
  }

  // 先看 8000 是否已有本系统在跑，避免重复启动导致端口冲突
  let backendChild = null;
  let reused = false;
  if (await isHealthy()) {
    log('[0/5] 检测到后端已在运行，直接复用');
    reused = true;
  } else if (FRONTEND_ONLY) {
    log('[0/5] --frontend-only：跳过后端启动（前端将使用本地演示数据）');
  } else {
    printDiagnose(rows);
    ensureBackendFiles();
    backendChild = startUvicorn();
    const ready = await waitHealthy(backendChild);
    if (!ready) {
      console.error('\n后端未能就绪，server.log 末尾：\n');
      console.error(logTail());
      killTree(backendChild);
      fail('后端 40 秒未就绪。常见原因：8000 端口被占用、依赖缺失、Python 版本过低。详见上方日志。');
    }
    log(C.ok('[4/5] 后端已就绪') + `  ${API}/api/docs`);
  }

  if (VERIFY) {
    const checks = await runVerify();
    console.log('\n===== 联调验证 =====');
    for (const c of checks) console.log(`  ${c.ok ? C.ok('[PASS]') : C.bad('[FAIL]')} ${c.name.padEnd(28, ' ')} ${C.dim(c.detail)}`);
    const allOk = checks.every((c) => c.ok);
    console.log('');
    log(allOk ? C.ok('全部通过') : C.bad('存在失败项，请对照 backend/server.log 排查'));
    if (!allOk) {
      console.error('\n----- backend/server.log 末尾 -----\n');
      console.error(logTail());
    }
    if (!reused) killTree(backendChild);
    process.exit(allOk ? 0 : 1);
  }

  const children = [];
  if (backendChild) children.push(backendChild);

  if (!BACKEND_ONLY) {
    ensureFrontendFiles();
    log(`[5/5] 启动前端 ${FRONTEND}`);
    // 直接跑 Vite 的 JS 入口，绕开 npm.cmd / cmd.exe，启动与停止都更干净
    const fe = spawn(process.execPath,
      [VITE_BIN, 'preview', '--port', '4180', '--host', '127.0.0.1'],
      { cwd: ROOT, stdio: 'inherit', windowsHide: true });
    children.push(fe);
    fe.on('error', (err) => { console.error('前端启动失败：', err); });
    if (!SMOKE) setTimeout(openBrowser, 2500);
  }

  const shutdown = (code = 0) => {
    console.log('\n正在停止服务...');
    for (const c of children) killTree(c);
    process.exit(code);
  };
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  for (const c of children) c.on('exit', (code) => {
    if (code && code !== 0) console.log(`\n子进程退出（code=${code}），详情见 backend/server.log`);
    shutdown(code ? 1 : 0);
  });

  if (SMOKE) {
    let pageOk = false;
    for (let i = 0; i < 25; i += 1) {
      try {
        const r = await fetch(FRONTEND, { signal: AbortSignal.timeout(2000) });
        if (r.status === 200) { pageOk = true; break; }
      } catch { /* 前端还在启动 */ }
      await new Promise((r) => setTimeout(r, 800));
    }
    const apiOk = await isHealthy();
    log(`前端页面 ${FRONTEND}：${pageOk ? C.ok('可访问') : C.bad('不可访问')}`);
    log(`后端接口 ${HEALTH}：${apiOk ? C.ok('已就绪') : C.bad('未就绪')}`);
    log(pageOk && apiOk ? C.ok('端到端冒烟测试通过') : C.bad('端到端冒烟测试失败'));
    shutdown(pageOk && apiOk ? 0 : 1);
  }

  console.log('\n服务已启动。按 Ctrl+C 或关闭本窗口即可停止全部服务。\n');
  // 保持进程存活；任一子进程退出即整体退出
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
