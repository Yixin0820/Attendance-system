import { useState, type ReactNode } from 'react';
import {
  ClipboardList,
  ShieldCheck,
  Settings2,
  ServerCog,
  Bell,
  Search,
  ChevronLeft,
  History,
  CalendarDays,
  Users,
  ScrollText,
  Activity,
  BarChart3,
  Building2,
} from 'lucide-react';
import type { Role } from '../types';
import { COLLEGE, DEPARTMENT, SCHOOL, avatarChar } from '../data';
import { useStore } from '../store';

interface NavItem {
  key: string;
  label: string;
  icon: typeof ClipboardList;
}

interface RoleConfig {
  label: string;
  icon: typeof ClipboardList;
  nav: NavItem[];
}

const ROLE_CONFIG: Record<Role, RoleConfig> = {
  committee: {
    label: '班委端',
    icon: ClipboardList,
    nav: [
      { key: 'upload', label: '考勤上报', icon: ClipboardList },
      { key: 'history', label: '历史记录', icon: History },
    ],
  },
  inspector: {
    label: '查勤端',
    icon: ShieldCheck,
    nav: [
      { key: 'duty', label: '值勤', icon: ShieldCheck },
      { key: 'shift', label: '排班表', icon: CalendarDays },
      { key: 'view', label: '考勤查看', icon: BarChart3 },
    ],
  },
  admin: {
    label: '管理端',
    icon: Settings2,
    nav: [
      { key: 'overview', label: '考勤总览', icon: BarChart3 },
      { key: 'staff', label: '干事工作', icon: Users },
      { key: 'shift', label: '排班管理', icon: CalendarDays },
      { key: 'history', label: '历史查询', icon: History },
      { key: 'rooms', label: '教室安排', icon: Building2 },
    ],
  },
  ops: {
    label: '运维端',
    icon: ServerCog,
    nav: [
      { key: 'system', label: '系统状态', icon: Activity },
      { key: 'accounts', label: '账号管理', icon: Users },
      { key: 'logs', label: '操作日志', icon: ScrollText },
    ],
  },
};

export function Shell({
  role,
  active,
  onNavigate,
  onExit,
  children,
}: {
  role: Role;
  active: string;
  onNavigate: (key: string) => void;
  onExit: () => void;
  children: ReactNode;
}) {
  const { user, swaps, notices } = useStore();
  const cfg = ROLE_CONFIG[role];
  const [mobileNav, setMobileNav] = useState(false);

  const me = user?.name ?? '';
  /** 干事：待我回复的替班请求 + 未读的调班结果通知 */
  const mySwapTodo = swaps.filter((s) => s.status === 'pending' && s.targetStaffName === me).length;
  const unreadNotices = notices.filter((n) => n.toStaffName === me && !n.read).length;
  const pendingSwaps = mySwapTodo + unreadNotices;
  const displayName = user?.name ?? cfg.label;
  const displayTitle = user?.title ?? '';

  return (
    <div className="min-h-screen bg-ink-50">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-ink-100 bg-white transition-transform duration-300 lg:translate-x-0 ${
          mobileNav ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-ink-100 px-5">
          <img src="/badge.png" alt={`${SCHOOL}校徽`} className="h-9 w-9 object-contain" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-ink-900">晚自习考勤</div>
            <div className="truncate text-[10px] text-ink-400">
              {COLLEGE} · {DEPARTMENT}
            </div>
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="rounded-xl bg-ink-50 p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-medium text-sky-700">
                {avatarChar(displayName)}
              </div>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-medium text-ink-800">{displayName}</div>
                <div className="truncate text-[11px] text-ink-400">{displayTitle || cfg.label}</div>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {cfg.nav.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            const badge =
              item.key === 'shift' && role === 'inspector' && pendingSwaps > 0 ? pendingSwaps : 0;
            return (
              <button
                key={item.key}
                onClick={() => {
                  onNavigate(item.key);
                  setMobileNav(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive ? 'bg-ink-900 text-white shadow-soft' : 'text-ink-600 hover:bg-ink-50'
                }`}
              >
                <Icon size={17} className={isActive ? 'text-white' : 'text-ink-400'} />
                <span className="flex-1 text-left">{item.label}</span>
                {badge > 0 && (
                  <span
                    className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                      isActive ? 'bg-white text-ink-900' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-ink-100 p-4">
          <button onClick={onExit} className="btn-ghost w-full justify-start gap-3">
            <ChevronLeft size={16} />
            切换账号
          </button>
        </div>
      </aside>

      {mobileNav && (
        <div
          className="fixed inset-0 z-30 bg-ink-900/30 lg:hidden"
          onClick={() => setMobileNav(false)}
        />
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-ink-100 bg-white/80 px-5 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileNav(true)}
              className="btn-ghost p-2 lg:hidden"
              aria-label="菜单"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="relative hidden sm:block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                placeholder="搜索班级、学生、日期…"
                className="w-72 rounded-xl border border-ink-200 bg-ink-50 py-2 pl-9 pr-3 text-sm outline-none transition-all focus:border-ink-300 focus:bg-white"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-ghost relative p-2" aria-label="通知">
              <Bell size={18} />
              {pendingSwaps > 0 && role === 'inspector' && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                  {pendingSwaps}
                </span>
              )}
            </button>
            <div className="flex items-center gap-2.5 rounded-xl bg-ink-50 px-3 py-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-medium text-sky-700">
                {avatarChar(displayName)}
              </div>
              <span className="hidden text-sm font-medium text-ink-700 sm:block">{displayName}</span>
            </div>
          </div>
        </header>

        <main className="animate-fadeIn px-5 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
