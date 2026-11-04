/**
 * 打包成「双击即可打开」的单文件 HTML。
 * 把 CSS / JS / 校徽全部内嵌进一个 html，不需要任何服务器，也不受浏览器代理影响。
 *
 * 用法：node scripts/build-standalone.mjs
 * 产物：dist-standalone/index.html
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const OUT_DIR = join(root, 'dist-standalone');

await build({
  root,
  base: './',
  logLevel: 'warn',
  build: {
    outDir: 'dist-standalone',
    emptyOutDir: true,
    assetsInlineLimit: 100 * 1024 * 1024,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
});

let html = readFileSync(join(OUT_DIR, 'index.html'), 'utf-8');

/**
 * 注意：必须用「函数形式」的 replacer。
 * 若用字符串，源码里出现的 $& / $` / $' 会被当成替换模式，导致产物被污染。
 */
const literal = (s) => () => s;

/* ---- 内嵌 CSS ---- */
const cssPath = join(OUT_DIR, 'app.css');
if (existsSync(cssPath)) {
  const css = readFileSync(cssPath, 'utf-8');
  html = html.replace(
    /<link[^>]*rel="stylesheet"[^>]*>/g,
    literal(`<style>\n${css}\n</style>`),
  );
}

/* ---- 内嵌 JS（普通 script，file:// 下不会被 CORS 拦截） ---- */
const jsPath = join(OUT_DIR, 'app.js');
const js = readFileSync(jsPath, 'utf-8');
// 防止 JS 里出现 </script> 提前闭合标签
const safeJs = js.replace(/<\/script/gi, '<\\/script');
html = html.replace(
  /<script[^>]*src="[^"]*app\.js"[^>]*><\/script>/g,
  literal(`<script>\n${safeJs}\n</script>`),
);

/* ---- 校徽内嵌为 data URI ---- */
const svgPath = join(root, 'public', 'logo.svg');
if (existsSync(svgPath)) {
  const svg = readFileSync(svgPath, 'utf-8');
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
  html = html.split('/logo.svg').join(dataUri);
}

const badgePath = join(root, 'public', 'badge.png');
if (existsSync(badgePath)) {
  const png = readFileSync(badgePath);
  const dataUri = `data:image/png;base64,${png.toString('base64')}`;
  html = html.split('/badge.png').join(dataUri);
}

/* ---- 兜底：把仍然外链的 favicon 去掉 ---- */
html = html.replace(/<link[^>]*rel="icon"[^>]*>/g, '');

/* ---- 把 <style> 挪到 <head>，避免首屏无样式闪一下 ---- */
const styleMatch = html.match(/<style>[\s\S]*?<\/style>/);
if (styleMatch) {
  html = html.replace(styleMatch[0], literal(''));
  html = html.replace('<head>', literal(`<head>\n    ${styleMatch[0]}`));
}

/**
 * 关键：内联的普通 script 会「立即执行」。
 * Vite 原本把它放在 <head>，那时 <div id="root"> 还没被解析，
 * React 会报 #299（找不到挂载节点）。必须挪到 </body> 之前。
 */
const scriptMatch = html.match(/<script>[\s\S]*?<\/script>/);
if (scriptMatch) {
  html = html.replace(scriptMatch[0], literal(''));
  html = html.replace('</body>', literal(`${scriptMatch[0]}\n  </body>`));
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'index.html'), html, 'utf-8');

/* ---- 自检：不允许残留任何外链 ---- */
const leftovers = [
  ...html.matchAll(/<script[^>]*\ssrc=/gi),
  ...html.matchAll(/<link[^>]*rel=["']?(stylesheet|modulepreload)/gi),
  ...html.matchAll(/<img[^>]*src=["'](?!data:)/gi),
];
if (leftovers.length > 0) {
  console.error('[FAIL] 仍有外链资源：', leftovers.map((m) => m[0]));
  process.exit(1);
}

const sizeKB = (Buffer.byteLength(html, 'utf-8') / 1024).toFixed(0);
console.log(`\n[OK] 单文件已生成：dist-standalone/index.html (${sizeKB} KB)`);
console.log('直接双击该文件即可在浏览器中打开，无需启动任何服务。\n');
