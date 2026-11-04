import { useEffect, useMemo, useState } from 'react';
import {
  Users,
  ScrollText,
  Activity,
  ShieldCheck,
  Database,
  Cpu,
  HardDrive,
  Search,
  KeyRound,
  CheckCircle2,
  XCircle,
  CalendarDays,
  Save,
} from 'lucide-react';
import { Card, PageHeader, StatCard, Badge, EmptyState } from './ui';
import {
  ACCOUNTS,
  CLASSES,
  classroomsForDate,
  DEFAULT_PASSWORD,
  STAFF,
  TODAY,
  VERIFY_GROUPS,
  isStudyNight,
  upcomingVerifyRounds,
  weekdayOf,
} from '../data';
import { useStore } from '../store';
import type { Role } from '../types';

const TABS: { key: Role; label: string }[] = [
  { key: 'committee', label: '学委账号' },
  { key: 'inspector', label: '干事账号' },
  { key: 'admin', label: '管理账号' },
  { key: 'ops', label: '运维账号' },
];

export function OpsSystem() {
  const { attendance, swaps, logs } = useStore();
  const online = ACCOUNTS.filter((a) => a.enabled).length;

  return (
    <div className="space-y-6">
      <PageHeader title="系统状态" subtitle="服务运行状态与资源监控" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="系统状态" value="运行中" tone="success" hint="演示数据 · 前端内存态" />
        <StatCard label="账号总数" value={ACCOUNTS.length} tone="brand" hint={`启用 ${online} 个`} />
        <StatCard label="今日操作" value={logs.length || 12} />
        <StatCard label="平均响应" value="86ms" tone="success" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
            <Activity size={16} /> 服务状态
          </div>
          <div className="mt-4 space-y-3">
            {[
              { name: '考勤上报服务', status: '正常', uptime: '99.98%' },
              { name: '假条存储', status: '正常', uptime: '99.99%' },
              { name: '实时同步', status: '正常', uptime: '99.95%' },
              { name: '推送通知', status: '正常', uptime: '99.92%' },
            ].map((s) => (
              <div key={s.name} className="flex items-center justify-between rounded-xl border border-ink-100 p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium text-ink-800">{s.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-ink-400">{s.uptime}</span>
                  <Badge tone="success">{s.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
            <Cpu size={16} /> 资源占用
          </div>
          <div className="mt-4 space-y-4">
            <ResourceBar icon={Cpu} label="CPU 使用率" value={34} suffix="%" />
            <ResourceBar icon={HardDrive} label="内存使用率" value={62} suffix="%" />
            <ResourceBar icon={Database} label="存储占用" value={48} suffix="%" tone="warning" />
            <ResourceBar icon={Activity} label="网络带宽" value={21} suffix="%" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <div className="text-xs text-ink-400">班级 / 教室</div>
          <div className="mt-1 text-lg font-semibold text-ink-800">
            {CLASSES.length} 个班 · {classroomsForDate(TODAY).length} 间教室
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-ink-400">学习部干事 / 核查分组</div>
          <div className="mt-1 text-lg font-semibold text-ink-800">
            {STAFF.length} 人 · {VERIFY_GROUPS.length} 个组
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-ink-400">今日考勤 / 调班</div>
          <div className="mt-1 text-lg font-semibold text-ink-800">
            {attendance.length} 条 · {swaps.length} 条申请
          </div>
        </Card>
      </div>

      <VerifyAnchorCard />

      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
          <ShieldCheck size={16} /> 安全状态
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-ink-100 p-4">
            <div className="text-xs text-ink-400">数据权限隔离</div>
            <div className="mt-1 flex items-center gap-2">
              <Badge tone="success">已启用</Badge>
              <span className="text-xs text-ink-500">学委仅见本班</span>
            </div>
          </div>
          <div className="rounded-xl border border-ink-100 p-4">
            <div className="text-xs text-ink-400">异常登录拦截</div>
            <div className="mt-1 text-lg font-semibold text-ink-800">今日 0 次</div>
          </div>
          <div className="rounded-xl border border-ink-100 p-4">
            <div className="text-xs text-ink-400">数据备份</div>
            <div className="mt-1 text-sm text-ink-600">最近备份：今日 03:00</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/** 考勤排次锚点：改「第一次」的日期，之后的排次整体重新对齐 */
function VerifyAnchorCard() {
  const { verifyAnchorDate, setVerifyAnchorDate, apiActive, toast } = useStore();
  const [value, setValue] = useState(verifyAnchorDate);
  const [saving, setSaving] = useState(false);

  useEffect(() => setValue(verifyAnchorDate), [verifyAnchorDate]);

  const dirty = value !== verifyAnchorDate;
  const invalid = !isStudyNight(value);

  const save = async () => {
    if (invalid) return;
    setSaving(true);
    await setVerifyAnchorDate(value);
    setSaving(false);
    toast(`排次锚点已改为 ${value}`, 'success');
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
        <CalendarDays size={16} /> 考勤排次锚点
      </div>
      <p className="mt-1 text-xs text-ink-500">
        考勤按「次」续排：以这个日期为「第一次」，之后每遇到一个有晚自习的日子推进一轮，
        第七次之后回到第一次。长假停课后想重新对齐，改这里即可。
        {!apiActive && '当前未连接后端，改动只保存在这台设备。'}
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="verify-anchor">「第一次」日期</label>
          <input
            id="verify-anchor"
            type="date"
            className="input w-48"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <button className="btn-primary" disabled={!dirty || invalid || saving} onClick={save}>
          <Save size={15} /> {saving ? '保存中…' : '保存'}
        </button>
        {dirty && (
          <button className="btn-ghost" onClick={() => setValue(verifyAnchorDate)}>取消</button>
        )}
      </div>
      {invalid && (
        <p className="mt-2 text-xs text-amber-700">
          {value} 不是有晚自习的日子（星期一 / 二 / 三 / 四 / 日），请换一个日期。
        </p>
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-400">
            <tr>
              <th className="px-4 py-2">日期</th>
              <th className="px-4 py-2">星期</th>
              <th className="px-4 py-2">次</th>
            </tr>
          </thead>
          <tbody>
            {upcomingVerifyRounds(7, value || TODAY, value).map((row) => (
              <tr key={row.date} className="border-b border-ink-50">
                <td className="px-4 py-2">{row.date}</td>
                <td className="px-4 py-2 text-ink-500">{weekdayOf(row.date)}</td>
                <td className="px-4 py-2">第 {row.seq} 次</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ResourceBar({
  icon: Icon,
  label,
  value,
  suffix,
  tone = 'default',
}: {
  icon: typeof Cpu;
  label: string;
  value: number;
  suffix: string;
  tone?: 'default' | 'warning';
}) {
  const color = tone === 'warning' ? 'bg-amber-500' : 'bg-ink-700';
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-ink-600">
          <Icon size={15} className="text-ink-400" /> {label}
        </span>
        <span className="font-medium text-ink-800">{value}{suffix}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function OpsAccounts() {
  const { passwords } = useStore();
  const [tab, setTab] = useState<Role>('committee');
  const [q, setQ] = useState('');
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ACCOUNTS.map((a) => [a.username, a.enabled])),
  );

  const counts = useMemo(() => {
    return {
      committee: ACCOUNTS.filter((a) => a.role === 'committee').length,
      inspector: ACCOUNTS.filter((a) => a.role === 'inspector').length,
      admin: ACCOUNTS.filter((a) => a.role === 'admin').length,
      ops: ACCOUNTS.filter((a) => a.role === 'ops').length,
    } as Record<Role, number>;
  }, []);

  const list = ACCOUNTS.filter((a) => a.role === tab).filter((a) => {
    if (!q.trim()) return true;
    const k = q.trim().toLowerCase();
    return (
      a.username.toLowerCase().includes(k) ||
      a.name.toLowerCase().includes(k) ||
      a.title.toLowerCase().includes(k)
    );
  });

  function toggle(username: string) {
    setEnabled((p) => ({ ...p, [username]: !p[username] }));
  }

  function exportAccounts() {
    const header = ['账号', '密码', '角色', '姓名', '说明'];
    const rows = ACCOUNTS.map((a) => [
      a.username,
      passwords[a.username] ?? a.password,
      { committee: '班委端', inspector: '查勤端', admin: '管理端', ops: '运维端' }[a.role],
      a.name,
      a.title,
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '晚自习考勤系统_账号清单.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="账号管理"
        subtitle={`共 ${ACCOUNTS.length} 个账号 · 统一初始密码 ${DEFAULT_PASSWORD}`}
        actions={
          <button onClick={exportAccounts} className="btn-primary">
            <KeyRound size={15} /> 导出账号清单
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`chip border transition-all ${
              tab === t.key ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-500 hover:bg-ink-50'
            }`}
          >
            {t.label}
            <span className={`text-xs ${tab === t.key ? 'opacity-70' : 'opacity-50'}`}>
              {counts[t.key]}
            </span>
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input w-52 pl-9"
            placeholder="搜索账号 / 姓名"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase text-ink-400">
                <th className="px-4 py-3 font-medium">账号</th>
                <th className="px-4 py-3 font-medium">密码</th>
                <th className="px-4 py-3 font-medium">姓名</th>
                <th className="px-4 py-3 font-medium">说明</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8">
                    <EmptyState text="没有匹配的账号" />
                  </td>
                </tr>
              )}
              {list.map((a) => {
                const on = enabled[a.username];
                return (
                  <tr key={a.username} className="border-b border-ink-50 hover:bg-ink-50">
                    <td className="px-4 py-3">
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-xs text-ink-700">
                        {a.username}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-500">
                      {passwords[a.username] ?? a.password}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink-800">{a.name}</td>
                    <td className="px-4 py-3 text-ink-600">{a.title}</td>
                    <td className="px-4 py-3">
                      {on ? <Badge tone="success">启用</Badge> : <Badge tone="danger">已禁用</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggle(a.username)}
                        className={`chip border transition-colors ${
                          on
                            ? 'border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100'
                            : 'border-emerald-100 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        }`}
                      >
                        {on ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
                        {on ? '禁用' : '启用'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
          <Users size={16} /> 假条核查分组（依据《查考勤排班表》）
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {VERIFY_GROUPS.map((g) => {
            const leader = STAFF.find((s) => s.id === g.leaderId);
            const members = g.memberIds
              .map((id) => STAFF.find((s) => s.id === id)?.name)
              .filter(Boolean);
            return (
              <div key={g.id} className="rounded-xl border border-ink-100 p-3">
                <div className="text-xs font-medium text-ink-500">第 {g.seq} 次</div>
                <div className="mt-1 text-sm font-semibold text-ink-800">
                  组长：{leader?.name ?? '—'}
                </div>
                <div className="mt-1 text-xs text-ink-400">组员：{members.join('、')}</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function OpsLogs() {
  const { logs } = useStore();
  const fallback = [
    { time: '21:15:32', user: '程浩然', action: '补传考勤', target: '自动化2026级3班', level: 'warn' },
    { time: '20:55:08', user: '李思远', action: '查班', target: '明理楼318', level: 'info' },
    { time: '20:50:21', user: '软件工程2026级2班学委', action: '上报考勤', target: '软件工程2026级2班', level: 'info' },
    { time: '20:48:03', user: '林浩宇', action: '假条核查', target: '软件工程2026级1班', level: 'info' },
    { time: '19:30:00', user: '管理员', action: '通过调班申请', target: '郭明轩', level: 'warn' },
    { time: '14:22:08', user: '运维', action: '系统巡检', target: '全量服务', level: 'info' },
  ] as { time: string; user: string; action: string; target: string; level: string }[];

  const rows = logs.length > 0 ? logs : fallback;

  return (
    <div className="space-y-6">
      <PageHeader title="操作日志" subtitle="系统操作记录与审计追踪" />
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-3">
          <ScrollText size={16} className="text-ink-500" />
          <span className="text-sm font-semibold text-ink-800">操作日志</span>
          <Badge tone="neutral">{rows.length} 条</Badge>
        </div>
        <div className="divide-y divide-ink-50">
          {rows.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-ink-50">
              <span className="w-20 font-mono text-xs text-ink-400">{l.time}</span>
              <span
                className={`h-2 w-2 rounded-full ${
                  l.level === 'warn' ? 'bg-amber-500' : l.level === 'error' ? 'bg-rose-500' : 'bg-ink-300'
                }`}
              />
              <span className="w-40 truncate text-sm font-medium text-ink-800">{l.user}</span>
              <span className="flex-1 text-sm text-ink-600">
                {l.action} · <span className="text-ink-400">{l.target}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
