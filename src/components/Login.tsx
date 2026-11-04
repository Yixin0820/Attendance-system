import { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  ShieldCheck,
  Settings2,
  ServerCog,
  ArrowRight,
  ArrowLeft,
  Lock,
  User,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  X,
  Wifi,
  WifiOff,
  RefreshCw,
} from 'lucide-react';
import type { Account, Role } from '../types';
import { ACCOUNTS, APP_VERSION, SCHOOL } from '../data';
import { useStore, verifyAccount } from '../store';
import { API_BASE, apiChangePassword } from '../lib/api';

const ROLES: {
  key: Role;
  label: string;
  icon: typeof ClipboardList;
  accent: string;
  description: string;
}[] = [
  {
    key: 'committee',
    label: '班委端',
    icon: ClipboardList,
    accent: 'from-blue-50 to-sky-50 text-blue-600',
    description: '登记班级出勤与请假情况',
  },
  {
    key: 'inspector',
    label: '查勤端',
    icon: ShieldCheck,
    accent: 'from-green-50 to-lime-50 text-green-600',
    description: '核查出勤、假条与值勤记录',
  },
  {
    key: 'admin',
    label: '管理端',
    icon: Settings2,
    accent: 'from-amber-50 to-orange-50 text-orange-600',
    description: '考勤管理与数据统计',
  },
  {
    key: 'ops',
    label: '运维端',
    icon: ServerCog,
    accent: 'from-purple-50 to-violet-50 text-purple-600',
    description: '系统配置与账号管理',
  },
];

export function Login() {
  const {
    login,
    logout,
    toast,
    passwords,
    remembered,
    setRemembered,
    changePassword,
    apiStatus,
    apiSignIn,
    recheckBackend,
  } = useStore();
  const [activeRole, setActiveRole] = useState<Role | null>(null);
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [forceAccount, setForceAccount] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);

  // 读取「记住密码」保存的账号
  useEffect(() => {
    if (remembered) {
      setAccount(remembered.username);
      setPassword(remembered.password);
      setRemember(true);
    }
  }, [remembered]);

  const roleAccounts = useMemo(
    () => ACCOUNTS.filter((a) => a.role === activeRole && a.enabled),
    [activeRole],
  );

  function openRole(role: Role) {
    setActiveRole(role);
    // 若记住的是本端账号则保留，否则清空密码
    const hit = remembered && ACCOUNTS.find((a) => a.username === remembered.username);
    if (hit && hit.role === role) {
      setAccount(remembered!.username);
      setPassword(remembered!.password);
      setRemember(true);
    } else {
      setAccount('');
      setPassword('');
      setRemember(false);
    }
    setError('');
  }

  /** 纯前端演示：用本地密码表校验 */
  function localLogin() {
    const found = verifyAccount(passwords, account, password);
    if (!found) {
      setError('账号或密码不正确');
      return;
    }
    if (found.role !== activeRole) {
      setError(`该账号属于「${ROLES.find((r) => r.key === found.role)?.label}」，请从对应入口登录`);
      return;
    }
    login(found);
    if (remember) setRemembered({ username: found.username, password });
    else setRemembered(null);
    toast(`欢迎回来，${found.name}`, 'success');
  }

  function handleLogin() {
    if (!account.trim() || !password) {
      setError('请输入账号与密码');
      return;
    }
    // 未启用后端或已确认连不上时用本地演示校验；探测中（checking）也先试后端，
    // 失败会自动回退本地，保证任何时候都能登录
    if (apiStatus === 'off' || apiStatus === 'offline') {
      localLogin();
      return;
    }
    setBusy(true);
    setError('');
    void apiSignIn(account.trim(), password).then((result) => {
      setBusy(false);
      if (result.ok) {
        if (result.account.role !== activeRole) {
          logout();
          setError(
            `该账号属于「${ROLES.find((r) => r.key === result.account.role)?.label}」，请从对应入口登录`,
          );
          return;
        }
        // 运维下发的临时口令：后端业务接口一律 423，必须先改密
        if (result.account.mustChangePassword) {
          setActiveRole(null);
          setForceAccount(result.account);
          setError('');
          return;
        }
        if (remember) setRemembered({ username: result.account.username, password });
        else setRemembered(null);
        toast(`欢迎回来，${result.account.name}`, 'success');
        return;
      }
      if (result.offline) {
        localLogin();
        return;
      }
      setError(result.error ?? '登录失败');
    });
  }

  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col bg-[#f0f2f5]">
      <header className="flex min-h-[60px] shrink-0 items-center justify-between gap-3 bg-[#1e3a5f] px-4 py-3 text-white sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/badge.png" alt={`${SCHOOL}校徽`} className="h-8 w-8 shrink-0 object-contain" />
          <span className="text-base font-semibold leading-snug sm:text-lg">晚自习考勤管理系统</span>
        </div>
        <span className="shrink-0 text-xs text-white/75" aria-label={`系统版本 ${APP_VERSION}`}>{APP_VERSION}</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <section className="w-full max-w-[680px]" aria-labelledby="login-role-title">
          <div className="mb-8 text-center">
            <h1 id="login-role-title" className="mb-2 text-[28px] font-semibold leading-tight text-[#1a1a1a]">
              选择登录身份
            </h1>
            <p className="text-[15px] text-[#666]">请选择您的身份以继续登录</p>
            {apiStatus === 'online' ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[12px] text-emerald-700">
                <Wifi size={12} /> 已连接后端服务，数据持久化保存
              </p>
            ) : apiStatus === 'offline' ? (
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[12px] text-amber-700">
                  <WifiOff size={12} /> 未连接后端（{API_BASE}），当前为本地演示数据
                </p>
                <button
                  type="button"
                  onClick={() => void recheckBackend()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 py-1 text-[12px] text-amber-700 hover:bg-amber-50"
                >
                  <RefreshCw size={12} /> 重新连接
                </button>
                <p className="w-full text-[11px] text-[#999]">
                  请先运行 start-all.bat（或 start-backend.bat）启动后端，再点「重新连接」
                </p>
              </div>
            ) : apiStatus === 'checking' ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1 text-[12px] text-ink-500">
                <RefreshCw size={12} className="animate-spin" /> 正在连接后端…
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-4 min-[601px]:grid-cols-2">
            {ROLES.map((r) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => openRole(r.key)}
                  aria-haspopup="dialog"
                  className="rounded-xl border border-[#e8e8e8] bg-white px-6 py-7 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-[#1e3a5f] hover:shadow-[0_4px_12px_rgba(30,58,95,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3a5f] focus-visible:ring-offset-4 motion-reduce:transform-none motion-reduce:transition-none"
                >
                  <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br ${r.accent}`}>
                    <Icon size={28} aria-hidden="true" />
                  </div>
                  <span className="mb-1 block text-[17px] font-semibold text-[#1a1a1a]">{r.label}</span>
                  <span className="block text-[13px] text-[#888]">{r.description}</span>
                </button>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="shrink-0 p-6 text-center text-[13px] text-[#999]">
        © {new Date().getFullYear()} 晚自习考勤管理系统 · {APP_VERSION}
      </footer>

      {activeRole && (
        <RoleLoginModal
          role={activeRole}
          accounts={roleAccounts}
          account={account}
          password={password}
          error={error}
          remember={remember}
          busy={busy}
          onRemember={setRemember}
          onAccount={(v) => { setAccount(v); setError(''); }}
          onPassword={(v) => { setPassword(v); setError(''); }}
          onClose={() => setActiveRole(null)}
          onLogin={handleLogin}
          onChangePassword={() => setShowChangePwd(true)}
        />
      )}

      {showChangePwd && (
        <ChangePasswordModal
          defaultAccount={account}
          onClose={() => setShowChangePwd(false)}
          onSubmit={(username, oldPwd, newPwd) => {
            const err = changePassword(username, oldPwd, newPwd);
            if (err) return err;
            toast('密码修改成功，请使用新密码登录', 'success');
            return null;
          }}
        />
      )}

      {forceAccount && (
        <ForceChangePasswordModal
          account={forceAccount}
          onCancel={() => {
            logout();
            setForceAccount(null);
            setPassword('');
          }}
          onDone={async (oldPwd, newPwd) => {
            try {
              await apiChangePassword(oldPwd, newPwd);
            } catch (e) {
              return e instanceof Error ? e.message : '修改失败，请稍后重试';
            }
            // 用新口令重新登录一次，顺带完成完整的数据加载
            const res = await apiSignIn(forceAccount.username, newPwd);
            if (!res.ok) return res.error ?? '重新登录失败，请用新密码登录';
            if (res.account.mustChangePassword) return '改密未生效，请联系运维';
            setForceAccount(null);
            setPassword(newPwd);
            toast('密码已更新，欢迎使用', 'success');
            return null;
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RoleLoginModal({
  role,
  accounts,
  account,
  password,
  error,
  remember,
  busy,
  onRemember,
  onAccount,
  onPassword,
  onClose,
  onLogin,
  onChangePassword,
}: {
  role: Role;
  accounts: { username: string; password: string; name: string; title: string }[];
  account: string;
  password: string;
  error: string;
  remember: boolean;
  busy: boolean;
  onRemember: (v: boolean) => void;
  onAccount: (v: string) => void;
  onPassword: (v: string) => void;
  onClose: () => void;
  onLogin: () => void;
  onChangePassword: () => void;
}) {
  const roleInfo = ROLES.find((r) => r.key === role)!;
  const Icon = roleInfo.icon;
  const [showList, setShowList] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 backdrop-blur-sm sm:items-center">
      <div className="animate-scaleIn max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-white p-6 shadow-card sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="btn-ghost p-1.5" aria-label="返回">
            <ArrowLeft size={18} />
          </button>
          <button onClick={onClose} className="btn-ghost p-1.5" aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="mt-2 text-center">
          <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${roleInfo.accent}`}>
            <Icon size={26} />
          </div>
          <h3 className="mt-3 text-lg font-semibold text-ink-900">{roleInfo.label} · 登录</h3>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="label">账号</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                className="input pl-9"
                placeholder="请输入账号"
                value={account}
                onChange={(e) => onAccount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onLogin()}
                autoComplete="username"
              />
            </div>
          </div>
          <div>
            <label className="label">密码</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="password"
                className="input pl-9"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => onPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onLogin()}
                autoComplete="current-password"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-600">
              <input
                type="checkbox"
                className="rounded border-ink-300"
                checked={remember}
                onChange={(e) => onRemember(e.target.checked)}
              />
              记住密码
            </label>
            <button
              onClick={onChangePassword}
              className="text-xs text-brand-600 underline decoration-dotted underline-offset-2 hover:text-brand-700"
            >
              修改密码
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-600">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <button
            onClick={onLogin}
            className="btn-primary w-full"
            disabled={!account.trim() || !password || busy}
          >
            {busy ? '登录中…' : <>登录进入 <ArrowRight size={16} /></>}
          </button>

          <button
            onClick={() => setShowList((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 text-xs text-ink-400 transition-colors hover:text-ink-700"
          >
            <KeyRound size={13} /> {showList ? '收起账号名单' : '查看本端账号名单'}
          </button>

          {showList && (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-ink-100 bg-ink-50 p-2">
              <div className="mb-1.5 px-1 text-[11px] text-ink-400">
                点击即可填入账号（密码为当前账号密码）
              </div>
              <div className="space-y-1">
                {accounts.map((a) => (
                  <button
                    key={a.username}
                    onClick={() => {
                      onAccount(a.username);
                      onPassword(a.password);
                    }}
                    className="flex w-full items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-left transition-colors hover:bg-ink-100"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-ink-800">{a.name}</span>
                      <span className="block truncate text-[11px] text-ink-400">{a.title}</span>
                    </span>
                    <span className="ml-2 shrink-0 rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-600">
                      {a.username}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChangePasswordModal({
  defaultAccount,
  onClose,
  onSubmit,
}: {
  defaultAccount: string;
  onClose: () => void;
  onSubmit: (username: string, oldPwd: string, newPwd: string) => string | null;
}) {
  const [username, setUsername] = useState(defaultAccount);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  function submit() {
    setError('');
    if (!username.trim() || !oldPwd || !newPwd) {
      setError('请填写完整信息');
      return;
    }
    if (newPwd !== confirmPwd) {
      setError('两次输入的新密码不一致');
      return;
    }
    const err = onSubmit(username, oldPwd, newPwd);
    if (err) {
      setError(err);
      return;
    }
    setDone(true);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink-900/40 backdrop-blur-sm sm:items-center">
      <div className="animate-scaleIn w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-card sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink-900">修改密码</h3>
          <button onClick={onClose} className="btn-ghost p-1.5" aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="mt-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
              <CheckCircle2 size={28} />
            </div>
            <p className="mt-3 text-sm text-ink-600">密码修改成功，下次请使用新密码登录。</p>
            <button onClick={onClose} className="btn-primary mt-6 w-full">好的</button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div>
              <label className="label">账号</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  className="input pl-9"
                  placeholder="请输入账号"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
            </div>
            <div>
              <label className="label">原密码</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="password"
                  className="input pl-9"
                  placeholder="请输入原密码"
                  value={oldPwd}
                  onChange={(e) => setOldPwd(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>
            <div>
              <label className="label">新密码</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="password"
                  className="input pl-9"
                  placeholder="请输入新密码"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div>
              <label className="label">确认新密码</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="password"
                  className="input pl-9"
                  placeholder="请再次输入新密码"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary flex-1">取消</button>
              <button onClick={submit} className="btn-primary flex-1">确认修改</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 首次登录强制改密（不可关闭）。
 * 运维批量下发随机口令后，后端除改密外的业务接口全部返回 423，
 * 这里必须改密成功才能进入系统，否则只能退出登录。
 */
function ForceChangePasswordModal({
  account,
  onCancel,
  onDone,
}: {
  account: Account;
  onCancel: () => void;
  onDone: (oldPwd: string, newPwd: string) => Promise<string | null>;
}) {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    if (!oldPwd || !newPwd) { setError('请填写完整信息'); return; }
    if (newPwd.length < 8) { setError('新密码至少 8 位'); return; }
    if (newPwd === oldPwd) { setError('新密码不能与原密码相同'); return; }
    if (newPwd !== confirmPwd) { setError('两次输入的新密码不一致'); return; }
    setBusy(true);
    const err = await onDone(oldPwd, newPwd);
    if (err) { setError(err); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-900/50 backdrop-blur-sm sm:items-center">
      <div className="animate-scaleIn w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-card sm:rounded-2xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <KeyRound size={24} />
        </div>
        <h3 className="mt-4 text-base font-semibold text-ink-900">请先修改初始密码</h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          账号 <span className="font-mono font-medium text-ink-700">{account.username}</span> 当前使用的是运维下发的临时口令，
          为保障数据安全，必须设置自己的新密码后才能使用系统。
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="label">临时口令</label>
            <input type="password" className="input" value={oldPwd}
              onChange={(e) => setOldPwd(e.target.value)} placeholder="请输入当前临时口令"
              autoComplete="current-password" />
          </div>
          <div>
            <label className="label">新密码</label>
            <input type="password" className="input" value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)} placeholder="至少 8 位，不要使用 123456 等弱口令"
              autoComplete="new-password" />
          </div>
          <div>
            <label className="label">确认新密码</label>
            <input type="password" className="input" value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              autoComplete="new-password" />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-600">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <button onClick={() => void submit()} className="btn-primary w-full"
            disabled={!oldPwd || !newPwd || !confirmPwd || busy}>
            {busy ? '正在修改…' : '确认修改并进入系统'}
          </button>
          <button onClick={onCancel} className="w-full text-center text-xs text-ink-400 hover:text-ink-700">
            暂不使用，退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
