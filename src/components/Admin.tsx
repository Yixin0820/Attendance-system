import { useMemo, useState } from 'react';
import {
  BarChart3,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Download,
  Smartphone,
  Flag,
  RotateCcw,
  ShieldCheck,
  ClipboardCheck,
  Building2,
  Inbox,
  Printer,
} from 'lucide-react';
import { Card, PageHeader, StatCard, Badge, EmptyState, Modal, CertificateThumb } from './ui';
import {
  ATTENDANCE_HISTORY,
  CLASSES,
  classroomsForDate,
  classroomForClass,
  COLLEGE,
  SPARE_CLASSROOM,
  SPARE_ROOM_LABEL,
  STAFF,
  STUDY_WEEKDAYS,
  TODAY,
  TOTAL_EXPECTED,
  avatarChar,
  reasonColor,
  verifyGroupOf,
  weekdayOf,
} from '../data';
import { useStore } from '../store';
import { exportAttendanceXlsx } from '../lib/exportAttendance';
import type { ExportStyle } from '../lib/exportAttendance';
import { ExpectedChanges } from './ExpectedChanges';
import { VerifyGroupRoster } from './Inspector';
import type { AttendanceRecord, LeaveRecord, ShiftType, SwapRequest } from '../types';

/* ------------------------------------------------------------------ *
 * 考勤总览
 * ------------------------------------------------------------------ */

type TodoKey = 'certIssue' | 'lateUpload' | 'swap' | 'numberIssue' | 'phone' | 'expectedChange';

export function AdminOverview() {
  const { attendance: storedAttendance, swaps, expectedChanges, toast } = useStore();
  const attendance = useMemo(() => storedAttendance.filter((record) => record.date === TODAY)
    .map((record) => ({ ...record, classroom: classroomForClass(record.classId, TODAY) })), [storedAttendance]);
  const unreadExpectedChanges = expectedChanges.filter((change) => !change.acknowledged);
  const [openTodo, setOpenTodo] = useState<TodoKey | null>(null);

  const totalExpected = attendance.reduce((s, r) => s + r.expected, 0);
  const totalActual = attendance.reduce((s, r) => s + r.actual, 0);
  const totalLeave = attendance.reduce((s, r) => s + r.leaveCount, 0);
  const rate = totalExpected > 0 ? ((totalActual / totalExpected) * 100).toFixed(1) : '0.0';

  const certIssues = attendance.flatMap((r) =>
    r.leaves
      .filter((l) => l.hasIssue)
      .map((l) => ({ rec: r, leave: l })),
  );
  const lateClasses = attendance.filter((r) => r.lateUploaded);
  const numberIssues = attendance.filter((r) => r.numberIssue && !r.numberIssueCancelled);
  const phoneClasses = attendance.filter((r) => (r.phoneViolations?.length ?? 0) > 0);
  const phoneViolations = phoneClasses.flatMap((r) => r.phoneViolations ?? []);
  const submittedReviews = phoneViolations.filter((v) => (v.reviewFiles?.length ?? 0) > 0).length;
  /** 调班由同学自行确认，管理端只关注「调班变动」条数 */
  const doneSwaps = swaps.filter((s) => s.status === 'approved');

  const todos: { key: TodoKey; label: string; count: number; tone: 'danger' | 'warning' | 'info' }[] = [
    { key: 'certIssue', label: '项假条问题', count: certIssues.length, tone: 'danger' },
    { key: 'numberIssue', label: '个人数核对问题标记', count: numberIssues.length, tone: 'danger' },
    { key: 'phone', label: '人次玩手机记录', count: phoneViolations.length, tone: 'warning' },
    { key: 'lateUpload', label: '个班级补传', count: lateClasses.length, tone: 'warning' },
    { key: 'swap', label: '条调班变动', count: doneSwaps.length, tone: 'info' },
    { key: 'expectedChange', label: '条未读人数变更', count: unreadExpectedChanges.length, tone: 'warning' },
  ];
  const visibleTodos = todos.filter((t) => t.count > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="考勤总览" subtitle={`${TODAY}（${weekdayOf(TODAY)}）· 信息工程学院晚自习考勤`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="应到合计" value={totalExpected} />
        <StatCard label="实到合计" value={totalActual} tone="success" />
        <StatCard label="请假合计" value={totalLeave} tone="warning" />
        <StatCard label="出勤率" value={`${rate}%`} tone="brand" />
        <StatCard
          label="班级数"
          value={attendance.length}
          hint={`${CLASSES.length} 个班 · ${classroomsForDate(TODAY).filter((r) => r.classIds.length > 0).length} 间教室`}
        />
      </div>

      <div className={`grid grid-cols-1 gap-6 ${visibleTodos.length > 0 ? 'lg:grid-cols-3' : ''}`}>
        <Card className={`p-5 ${visibleTodos.length > 0 ? 'lg:col-span-2' : ''}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
            <BarChart3 size={16} /> 各班出勤率对比
          </div>
          <div className="mt-5 max-h-[420px] space-y-2.5 overflow-y-auto pr-1">
            {attendance.map((r) => {
              const pct = r.expected > 0 ? (r.actual / r.expected) * 100 : 0;
              return (
                <div key={r.classId} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 truncate text-xs text-ink-600">{r.className}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded-lg bg-ink-100">
                    <div
                      className="flex h-full items-center justify-end rounded-lg bg-gradient-to-r from-ink-700 to-ink-500 px-2 text-[11px] font-medium text-white"
                      style={{ width: `${pct}%` }}
                    >
                      {pct.toFixed(0)}%
                    </div>
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs text-ink-400">
                    {r.actual}/{r.expected}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {visibleTodos.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
              <AlertTriangle size={16} /> 待办事项（点击查看详情）
            </div>
            <div className="mt-4 space-y-2.5">
              {visibleTodos.map((t) => {
                const toneCls =
                  t.tone === 'danger'
                    ? 'border-rose-100 bg-rose-50/60 hover:bg-rose-50'
                    : t.tone === 'warning'
                    ? 'border-amber-100 bg-amber-50/60 hover:bg-amber-50'
                    : 'border-blue-100 bg-blue-50/60 hover:bg-blue-50';
                const textCls =
                  t.tone === 'danger'
                    ? 'text-rose-700'
                    : t.tone === 'warning'
                    ? 'text-amber-700'
                    : 'text-blue-700';
                return (
                  <button
                    key={t.key}
                    onClick={() => setOpenTodo(t.key)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${toneCls}`}
                  >
                    <div className={`flex items-center justify-between text-sm font-medium ${textCls}`}>
                      <span>
                        <span className="text-base font-semibold">{t.count}</span> {t.label}
                      </span>
                      <ChevronRight size={15} className="opacity-60" />
                    </div>
                    {t.key === 'phone' && (
                      <div className="mt-1 text-xs text-amber-700">
                        检讨已提交 {submittedReviews} · 待提交 {phoneViolations.length - submittedReviews}
                      </div>
                    )}
                    <div className="mt-0.5 text-[11px] text-ink-400">点击查看详情 →</div>
                  </button>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-4 text-sm font-semibold text-ink-800">
          今日各班详细考勤
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase text-ink-400">
                <th className="px-4 py-3 font-medium">班级</th>
                <th className="px-4 py-3 font-medium">教室</th>
                <th className="px-4 py-3 font-medium">应到</th>
                <th className="px-4 py-3 font-medium">实到</th>
                <th className="px-4 py-3 font-medium">请假</th>
                <th className="px-4 py-3 font-medium">上报</th>
                <th className="px-4 py-3 font-medium">假条核查</th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((r) => (
                <tr key={r.classId} className="border-b border-ink-50 hover:bg-ink-50">
                  <td className="px-4 py-3 font-medium text-ink-800">
                    {r.className}
                    {r.numberIssue && !r.numberIssueCancelled && (
                      <span className="ml-1 text-rose-500" title="人数问题">▲</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-500">{r.classroom}</td>
                  <td className="px-4 py-3 text-ink-600">{r.expected}</td>
                  <td className="px-4 py-3 text-emerald-600">{r.actual}</td>
                  <td className="px-4 py-3 text-amber-600">{r.leaveCount}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-xs text-ink-500">
                      <Clock size={13} /> {r.uploadedAt}
                      {r.lateUploaded && <Badge tone="warning">补传</Badge>}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.leaves.length === 0 ? (
                      <Badge tone="neutral">无请假</Badge>
                    ) : r.leaves.every((l) => l.checked) ? (
                      <Badge tone="success">已核查</Badge>
                    ) : (
                      <Badge tone="warning">待核查 {r.leaves.filter((l) => !l.checked).length}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5"><ExpectedChanges management /></Card>

      {openTodo && (
        <TodoDetailModal
          todo={openTodo}
          certIssues={certIssues}
          lateClasses={lateClasses}
          numberIssues={numberIssues}
          phoneClasses={phoneClasses}
          doneSwaps={doneSwaps}
          onClose={() => setOpenTodo(null)}
          onJumpToSwap={() => {
            setOpenTodo(null);
            toast('请前往左侧「排班管理」查看成功调班记录', 'info');
          }}
        />
      )}
    </div>
  );
}

function TodoDetailModal({
  todo,
  certIssues,
  lateClasses,
  numberIssues,
  phoneClasses,
  doneSwaps,
  onClose,
  onJumpToSwap,
}: {
  todo: TodoKey;
  certIssues: { rec: AttendanceRecord; leave: LeaveRecord }[];
  lateClasses: AttendanceRecord[];
  numberIssues: AttendanceRecord[];
  phoneClasses: AttendanceRecord[];
  doneSwaps: SwapRequest[];
  onClose: () => void;
  onJumpToSwap: () => void;
}) {
  if (todo === 'expectedChange') {
    return (
      <Modal title="应到人数变更待办" subtitle="仅确认已阅，不是审批，也不更改应到人数" onClose={onClose} width="max-w-2xl">
        <ExpectedChanges management unreadOnly />
      </Modal>
    );
  }

  if (todo === 'swap') {
    return (
      <Modal
        title="调班变动"
        subtitle={`共 ${doneSwaps.length} 条调班已生效，含本周与下周`}
        onClose={onClose}
        width="max-w-2xl"
        footer={
          <>
            <button onClick={onClose} className="btn-secondary">关闭</button>
            <button onClick={onJumpToSwap} className="btn-primary">查看排班管理</button>
          </>
        }
      >
        {doneSwaps.length === 0 ? (
          <EmptyState text="暂无调班变动" />
        ) : (
          <div className="space-y-2">
            {doneSwaps.map((s) => (
              <div key={s.id} className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{s.week ?? '本周'} → {s.targetWeek ?? s.week ?? '本周'}</Badge>
                  <Badge tone="success">已调班</Badge>
                  <span className="text-sm font-medium text-ink-800">
                    {s.staffName} → {s.targetStaffName}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-600">
                  {s.week ?? '本周'} {s.fromWeekday}（{s.fromType}） → {s.targetWeek ?? s.week ?? '本周'} {s.toWeekday}（{s.toType}） · {s.reason}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-400">
                  发起 {s.createdAt} · 同学回复 {s.reviewedAt ?? '—'}
                </p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    );
  }

  if (todo === 'certIssue') {
    return (
      <Modal title="假条问题明细" subtitle="按班级逐条列出，含核查干事" onClose={onClose} width="max-w-3xl">
        {certIssues.length === 0 ? (
          <EmptyState text="今日暂无假条问题" />
        ) : (
          <div className="space-y-2">
            {certIssues.map(({ rec, leave }) => (
              <div key={leave.id} className="rounded-xl border border-rose-100 bg-rose-50/50 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="danger">{rec.className}</Badge>
                  <span className="text-sm font-medium text-ink-800">{leave.studentName}</span>
                  <span className="text-xs text-ink-400">{leave.studentId}</span>
                  <span className={`chip border text-[11px] ${reasonColor(leave.reason)}`}>{leave.reason}</span>
                </div>
                <p className="mt-1.5 text-xs text-rose-700">
                  经学习部干事 <span className="font-medium">{leave.issueBy || '（未记录）'}</span> 核查：
                  {leave.issueDescription || '未提交说明'}
                </p>
                {leave.certificateFiles.length === 0 && (
                  <p className="mt-1 text-[11px] text-amber-600">该生未上传假条</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>
    );
  }

  if (todo === 'numberIssue') {
    return (
      <Modal title="人数核对问题标记" subtitle="查勤端线上标记，当日有效" onClose={onClose} width="max-w-2xl">
        {numberIssues.length === 0 ? (
          <EmptyState text="今日无人数问题标记" />
        ) : (
          <div className="space-y-2">
            {numberIssues.map((r) => (
              <div key={r.classId} className="rounded-xl border border-rose-100 bg-rose-50/50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
                  <Flag size={14} className="text-rose-500" /> {r.className}
                </div>
                <p className="mt-1 text-xs text-rose-700">{r.numberIssueNote || '（未填写说明）'}</p>
                <p className="mt-1 text-[11px] text-ink-400">标记人：{r.numberIssueBy}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    );
  }

  if (todo === 'phone') {
    return (
      <Modal title="玩手机记录" subtitle="逐人查看检讨提交状态与文件" onClose={onClose} width="max-w-2xl">
        {phoneClasses.length === 0 ? (
          <EmptyState text="今日暂无玩手机记录" />
        ) : (
          <div className="space-y-2">
            {phoneClasses.map((r) => (
              <div key={r.classId} className="rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
                  <Smartphone size={14} className="text-amber-500" /> {r.className}
                </div>
                <div className="mt-3 space-y-2">
                  {(r.phoneViolations ?? []).map((v) => {
                    const files = v.reviewFiles ?? [];
                    return (
                      <div key={v.studentName} className="rounded-lg border border-amber-100 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-ink-800">{v.studentName}</span>
                          <Badge tone={files.length > 0 ? 'success' : 'warning'}>
                            {files.length > 0 ? '检讨已提交' : '检讨待提交'}
                          </Badge>
                        </div>
                        {files.length > 0 && (
                          <>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {files.map((file) => <CertificateThumb key={file.id} file={file} />)}
                            </div>
                            <p className="mt-1.5 text-[11px] text-ink-400">
                              提交时间 {v.reviewAt ?? '—'} · 登记人 {v.reviewBy ?? '—'}
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal title="补传班级" subtitle="超过 20:59 上报的班级" onClose={onClose} width="max-w-2xl">
      {lateClasses.length === 0 ? (
        <EmptyState text="今日全部按时上报" />
      ) : (
        <div className="space-y-2">
          {lateClasses.map((r) => (
            <div key={r.classId} className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3">
              <span className="text-sm font-medium text-ink-800">{r.className}</span>
              <span className="text-xs text-amber-700">上报时间 {r.uploadedAt}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * 干事工作
 * ------------------------------------------------------------------ */

export function AdminStaff() {
  const { attendance, claimed, checkShifts, phoneShifts, verifyAnchorDate: anchor } = useStore();
  const [hoverIssue, setHoverIssue] = useState<string | null>(null);

  const todayWeekday = weekdayOf(TODAY);

  const records = useMemo(() => {
    const checkStaffIds = new Set(
      checkShifts.filter((sh) => sh.weekday === todayWeekday).flatMap((sh) => sh.staffIds),
    );
    return STAFF.filter((s) => checkStaffIds.has(s.id)).map((s) => {
      const classIds = Object.keys(claimed).filter((id) => claimed[id] === s.name);
      const recs = attendance.filter((r) => r.date === TODAY && classIds.includes(r.classId));
      const leaves = recs.flatMap((r) => r.leaves);
      const issues = leaves.filter((l) => l.hasIssue);
      return {
        staff: s,
        recs,
        checkedCount: leaves.filter((l) => l.checked).length,
        totalCount: leaves.length,
        issues,
      };
    });
  }, [attendance, claimed, checkShifts, todayWeekday]);

  /** 当日值班：查班 / 查手机按星期，考勤按「第一次」起的轮次推算。 */
  const dutyGroups = useMemo(() => {
    const idsOf = (list: { weekday: string; staffIds: string[] }[]) =>
      list.filter((sh) => sh.weekday === todayWeekday).flatMap((sh) => sh.staffIds);
    const group = verifyGroupOf(TODAY, anchor);
    return [
      { key: 'check', label: '查班', icon: ShieldCheck, ids: idsOf(checkShifts) },
      { key: 'phone', label: '查手机', icon: Smartphone, ids: idsOf(phoneShifts) },
      {
        key: 'attendance',
        label: group ? `考勤（第 ${group.seq} 次）` : '考勤（今日无晚自习）',
        icon: ClipboardCheck,
        ids: group ? [group.leaderId, ...group.memberIds] : [],
      },
    ];
  }, [checkShifts, phoneShifts, todayWeekday, anchor]);

  return (
    <div className="space-y-6">
      <PageHeader title="干事工作" subtitle="学习部干事工作完成状态" />

      <VerifyGroupRoster />

      {dutyGroups.map((g) => {
        const members = STAFF.filter((s) => g.ids.includes(s.id));
        const GroupIcon = g.icon;
        return (
          <div key={g.key} className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
              <GroupIcon size={16} /> {g.label}
              <Badge tone="neutral">{members.length} 人</Badge>
            </div>
            {members.length === 0 ? (
              <Card className="p-4 text-xs text-ink-400">今日无该岗位值班干事</Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {members.map((s) => {
                  const rec = g.key === 'check' ? records.find((r) => r.staff.id === s.id) : undefined;
                  return (
                    <Card key={s.id} className="p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-medium text-sky-700">
                          {avatarChar(s.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-ink-800">{s.name}</div>
                        </div>
                      </div>
                      {rec && rec.recs.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Badge tone={rec.checkedCount === rec.totalCount ? 'success' : 'warning'}>
                            核查 {rec.checkedCount}/{rec.totalCount}
                          </Badge>
                        </div>
                      )}
                      {rec && rec.recs.length > 0 && (
                        <p className="mt-2 truncate text-xs text-ink-400">
                          负责 {rec.recs.map((r) => r.className).join('、')}
                        </p>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-4 text-sm font-semibold text-ink-800">
          今日假条核查记录（点击「发现问题」查看具体内容）
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase text-ink-400">
                <th className="px-4 py-3 font-medium">干事</th>
                <th className="px-4 py-3 font-medium">核查班级</th>
                <th className="px-4 py-3 font-medium">核查进度</th>
                <th className="px-4 py-3 font-medium">发现问题</th>
                <th className="px-4 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-400">
                    今日暂无核查记录
                  </td>
                </tr>
              )}
              {records.map((r) => {
                const done = r.totalCount > 0 && r.checkedCount === r.totalCount;
                return (
                  <tr key={r.staff.id} className="border-b border-ink-50 hover:bg-ink-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-medium text-sky-700">
                          {avatarChar(r.staff.name)}
                        </span>
                        <span className="font-medium text-ink-800">{r.staff.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-600">
                      {r.recs.map((x) => x.className).join('、') || '—'}
                    </td>
                    <td className="px-4 py-3 text-ink-600">
                      {r.totalCount === 0 ? '—' : `${r.checkedCount}/${r.totalCount}`}
                    </td>
                    <td className="px-4 py-3">
                      {r.issues.length === 0 ? (
                        <span className="text-xs text-ink-400">0</span>
                      ) : (
                        <div className="relative inline-block">
                          <button
                            className="text-rose-600 underline decoration-dotted underline-offset-2"
                            onClick={() => setHoverIssue(hoverIssue === r.staff.id ? null : r.staff.id)}
                            onMouseEnter={() => setHoverIssue(r.staff.id)}
                            onMouseLeave={() => setHoverIssue(null)}
                          >
                            {r.issues.length}
                          </button>
                          {hoverIssue === r.staff.id && (
                            <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-xl border border-ink-100 bg-white p-3 text-left shadow-card">
                              <div className="mb-1.5 text-xs font-semibold text-ink-800">具体问题</div>
                              <div className="space-y-1.5">
                                {r.issues.map((l) => (
                                  <div key={l.id} className="text-[11px] text-ink-600">
                                    <span className="font-medium text-rose-600">{l.studentName}</span> ·{' '}
                                    {l.issueDescription || '未提交说明'}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.totalCount === 0 ? (
                        <Badge tone="neutral">未分配</Badge>
                      ) : done ? (
                        <Badge tone="success">已完成</Badge>
                      ) : (
                        <Badge tone="warning">进行中</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 排班管理与调班记录
 * ------------------------------------------------------------------ */

export function AdminShift() {
  const {
    checkShifts, phoneShifts,
    nextCheckShifts, nextPhoneShifts,
    swaps, resetRoster, toast,
  } = useStore();
  const [tab, setTab] = useState<ShiftType>('查班');
  const [week, setWeek] = useState<'本周' | '下周'>('本周');
  const [recordWeek, setRecordWeek] = useState<'全部' | '本周' | '下周'>('全部');

  /** 调班不再由管理端审核，只展示已成功的调班记录 */
  const approved = swaps.filter((s) =>
    s.status === 'approved' && (recordWeek === '全部' || (s.week ?? '本周') === recordWeek ||
      (s.targetWeek ?? s.week ?? '本周') === recordWeek),
  );

  const weekShifts = week === '本周'
    ? { 查班: checkShifts, 考勤: [], 查手机: phoneShifts }
    : { 查班: nextCheckShifts, 考勤: [], 查手机: nextPhoneShifts };
  const shifts = weekShifts[tab];

  return (
    <div className="space-y-6">
      <PageHeader
        title="排班管理"
        subtitle="查看排班表 · 成功调班记录"
        actions={
          <button
            onClick={() => {
              resetRoster();
              toast('已恢复原始排班表', 'info');
            }}
            className="btn-secondary"
          >
            <RotateCcw size={15} /> 恢复原表
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {tab !== '考勤' && <div className="flex w-fit gap-1 rounded-xl border border-ink-100 bg-ink-50 p-1">
            {(['本周', '下周'] as const).map((w) => (
              <button
                key={w}
                onClick={() => setWeek(w)}
                aria-pressed={week === w}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  week === w ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-800'
                }`}
              >
                {w}
              </button>
            ))}
          </div>}
          <div className="flex flex-wrap gap-2">
            {(['查班', '考勤', '查手机'] as ShiftType[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`chip border transition-all ${
                  tab === t ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-500 hover:bg-ink-50'
                }`}
              >
                {t === '查班' ? '查班表' : t === '考勤' ? '考勤表' : '查手机表'}
              </button>
            ))}
            {tab !== '考勤' && <span className="chip border border-ink-100 bg-ink-50 text-ink-400">第 2-18 周</span>}
          </div>

          {tab === '考勤' ? <VerifyGroupRoster /> : <Card className="overflow-hidden">
            <div className="border-b border-ink-100 px-5 py-4 text-sm font-semibold text-ink-800">
              {week}{tab === '查班' ? '查班表' : '查手机表'}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50/60">
                    {shifts.map((s) => (
                      <th key={s.id} className="px-4 py-3 text-left">
                        <div className="text-sm font-semibold text-ink-800">{s.weekday}</div>
                        <div className="text-[11px] font-normal text-ink-400">{s.type}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {shifts.map((s) => (
                      <td key={s.id} className="align-top px-4 py-3">
                        <div className="space-y-1">
                          {s.staffIds.map((id) => {
                            const st = STAFF.find((x) => x.id === id);
                            if (!st) return null;
                            return (
                              <div
                                key={id}
                                className="chip border border-ink-100 bg-ink-50 text-[11px] text-ink-600"
                              >
                                {st.name}
                              </div>
                            );
                          })}
                          {s.staffIds.length === 0 && (
                            <span className="text-xs text-ink-300">—</span>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>}
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-ink-800">成功调班记录</div>
            <Badge tone={approved.length > 0 ? 'success' : 'neutral'}>{approved.length} 条</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="成功调班记录周次筛选">
            {(['全部', '本周', '下周'] as const).map((w) => (
              <button
                key={w}
                onClick={() => setRecordWeek(w)}
                aria-pressed={recordWeek === w}
                className={`chip border transition-colors ${
                  recordWeek === w ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-500 hover:bg-ink-50'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {approved.length === 0 && (
              <EmptyState text={recordWeek === '全部' ? '暂无成功调班记录' : `${recordWeek}暂无成功调班记录`} />
            )}
            {approved.map((s) => (
              <div key={s.id} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink-800">
                    {s.staffName} → {s.targetStaffName}
                  </span>
                  <div className="flex shrink-0 gap-1.5">
                    <Badge tone="neutral">{s.week ?? '本周'} → {s.targetWeek ?? s.week ?? '本周'}</Badge>
                    <Badge tone="success">已调班</Badge>
                  </div>
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {s.week ?? '本周'} {s.fromWeekday}（{s.fromType}） → {s.targetWeek ?? s.week ?? '本周'} {s.toWeekday}（{s.toType}）
                </p>
                <p className="mt-0.5 text-[11px] text-ink-400">
                  发起 {s.createdAt} · 回复 {s.reviewedAt ?? '—'}
                </p>
                {s.reviewNote && (
                  <p className="mt-2 rounded-lg bg-white px-2 py-1 text-[11px] text-ink-500">
                    同学回复：{s.reviewNote}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-ink-400">
            调班由同学之间互相确认，管理端不再审核，此处仅展示已生效的调班结果。
          </p>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 历史查询（日历 + Excel 视图）
 * ------------------------------------------------------------------ */

export function AdminHistory() {
  const { attendance, reviewHistory } = useStore();
  /** 默认定位到「今天」所在的月份，避免日期显示错位 */
  const [viewMonth, setViewMonth] = useState(() => {
    const [y, m] = TODAY.split('-').map(Number);
    return new Date(y, m - 1, 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(TODAY);
  const [excelClass, setExcelClass] = useState<string | null>(null);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dates: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) dates.push(null);
  for (let d = 1; d <= daysInMonth; d++) dates.push(d);

  const dateStr = (d: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const hasRecord = (d: number) =>
    ATTENDANCE_HISTORY.some((h) => h.date === dateStr(d)) ||
    attendance.some((record) => record.date === dateStr(d));
  const getIssues = (d: number) =>
    ATTENDANCE_HISTORY.find((h) => h.date === dateStr(d))?.issues ?? 0;

  const rows = useMemo(() => attendance
    .filter((record) => record.date === selectedDate)
    .map((record) => ({ ...record, classroom: classroomForClass(record.classId, record.date) })),
  [attendance, selectedDate]);
  const selectedRecord = rows.length > 0
    ? {
        date: selectedDate!,
        weekday: weekdayOf(selectedDate!),
        totalExpected: rows.reduce((sum, record) => sum + record.expected, 0),
        totalActual: rows.reduce((sum, record) => sum + record.actual, 0),
        totalLeave: rows.reduce((sum, record) => sum + record.leaveCount, 0),
      }
    : ATTENDANCE_HISTORY.find((record) => record.date === selectedDate);

  return (
    <div className="space-y-6">
      <PageHeader title="历史查询" subtitle="按日期快速定位 · 点击班级名查看当日最终考勤表" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <div className="flex items-center justify-between">
            <button onClick={() => setViewMonth(new Date(year, month - 1, 1))} className="btn-ghost p-1.5">
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-semibold text-ink-800">
              {year} 年 {month + 1} 月
            </span>
            <button onClick={() => setViewMonth(new Date(year, month + 1, 1))} className="btn-ghost p-1.5">
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-ink-400">
            {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {dates.map((d, i) => {
              if (!d) return <div key={i} />;
              const ds = dateStr(d);
              const has = hasRecord(d);
              const issues = getIssues(d);
              const isSel = ds === selectedDate;
              return (
                <button
                  key={i}
                  onClick={() => has && setSelectedDate(ds)}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-all ${
                    isSel ? 'bg-ink-900 text-white' : has ? 'text-ink-700 hover:bg-ink-100' : 'text-ink-300'
                  }`}
                >
                  {d}
                  {has && !isSel && (
                    <span
                      className={`absolute bottom-1 h-1 w-1 rounded-full ${
                        issues > 0 ? 'bg-rose-500' : 'bg-emerald-500'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs text-ink-400">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> 正常</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" /> 有问题</span>
          </div>
          <p className="mt-3 text-[11px] text-ink-400">
            仅有晚自习的日期（{STUDY_WEEKDAYS.join('、')}）会有记录
          </p>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {selectedDate && selectedRecord ? (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="班级" value={CLASSES.length} />
                <StatCard label="应到" value={selectedRecord.totalExpected} />
                <StatCard label="实到" value={selectedRecord.totalActual} tone="success" />
                <StatCard label="请假" value={selectedRecord.totalLeave} tone="warning" />
              </div>
              <Card className="overflow-hidden">
                <div className="border-b border-ink-100 px-5 py-4 text-sm font-semibold text-ink-800">
                  {selectedDate}（{selectedRecord.weekday}）考勤详情 · 点击班级名查看最终考勤表
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink-100 text-left text-xs uppercase text-ink-400">
                        <th className="px-4 py-3 font-medium">班级</th>
                        <th className="px-4 py-3 font-medium">教室</th>
                        <th className="px-4 py-3 font-medium">应到</th>
                        <th className="px-4 py-3 font-medium">实到</th>
                        <th className="px-4 py-3 font-medium">请假</th>
                        <th className="px-4 py-3 font-medium">出勤率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-ink-400">该日期仅有历史汇总，暂无班级明细，不使用今日考勤推算。</td></tr>
                      )}
                      {rows.map((r) => (
                        <tr key={r.classId} className="border-b border-ink-50 hover:bg-ink-50">
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setExcelClass(r.classId)}
                              className="font-medium text-brand-600 underline decoration-dotted underline-offset-2 hover:text-brand-700"
                            >
                              {r.className}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-ink-500">{r.classroom}</td>
                          <td className="px-4 py-3 text-ink-600">{r.expected}</td>
                          <td className="px-4 py-3 text-emerald-600">{r.actual}</td>
                          <td className="px-4 py-3 text-amber-600">{r.leaveCount}</td>
                          <td className="px-4 py-3 text-ink-600">
                            {((r.actual / r.expected) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          ) : (
            <Card className="flex h-full items-center justify-center">
              <EmptyState text="选择左侧日期查看考勤记录" />
            </Card>
          )}
        </div>
      </div>

      {selectedDate === TODAY && (
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
            <Inbox size={16} /> 检讨存档（{TODAY}）
            <Badge tone={reviewHistory.length > 0 ? 'danger' : 'neutral'}>
              {reviewHistory.length} 份
            </Badge>
          </div>
          {reviewHistory.length === 0 ? (
            <p className="mt-3 text-xs text-ink-400">今日暂无检讨存档</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs uppercase text-ink-400">
                    <th className="px-4 py-3 font-medium">班级</th>
                    <th className="px-4 py-3 font-medium">教室</th>
                    <th className="px-4 py-3 font-medium">学生</th>
                    <th className="px-4 py-3 font-medium">份数</th>
                    <th className="px-4 py-3 font-medium">上传时间</th>
                    <th className="px-4 py-3 font-medium">登记人</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewHistory.map((h) => (
                    <tr key={h.id} className="border-b border-ink-50 hover:bg-ink-50">
                      <td className="px-4 py-3 text-ink-700">{h.className}</td>
                      <td className="px-4 py-3 text-ink-500">{classroomForClass(h.classId, h.date)}</td>
                      <td className="px-4 py-3 font-medium text-rose-600">{h.studentName}</td>
                      <td className="px-4 py-3 text-ink-600">{h.files.length}</td>
                      <td className="px-4 py-3 text-ink-500">{h.at}</td>
                      <td className="px-4 py-3 text-ink-500">{h.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {excelClass && rows.find((r) => r.classId === excelClass) && (
        <ExcelModal
          rec={rows.find((r) => r.classId === excelClass)!}
          date={selectedDate ?? TODAY}
          onClose={() => setExcelClass(null)}
        />
      )}
    </div>
  );
}

function ExcelModal({
  rec,
  date,
  onClose,
}: {
  rec: AttendanceRecord;
  date: string;
  onClose: () => void;
}) {
  const { toast } = useStore();
  const [exporting, setExporting] = useState(false);
  const grouped: Record<string, LeaveRecord[]> = {};
  rec.leaves.forEach((l) => {
    if (!grouped[l.reason]) grouped[l.reason] = [];
    grouped[l.reason].push(l);
  });

  async function exportOne(style: ExportStyle = 'styled') {
    if (exporting) return;
    setExporting(true);
    try {
      await exportAttendanceXlsx([rec], {
        date,
        title: `${rec.className}考勤表`,
        filename: `${rec.className}_${date}_考勤表${style === 'plain' ? '_黑白' : ''}`,
        style,
      });
      toast(`已生成 Excel（${style === 'plain' ? '纯黑白' : '美化'}版）并发起下载`, 'success');
    } catch {
      toast('Excel 导出失败，请重试', 'danger');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal
      title={`${rec.className} · ${date} 最终考勤表`}
      subtitle={`${rec.classroom} · 应到 ${rec.expected} / 实到 ${rec.actual} / 请假 ${rec.leaveCount}`}
      onClose={onClose}
      width="max-w-4xl"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">关闭</button>
          <button
            onClick={() => void exportOne('plain')}
            disabled={exporting}
            className="btn-secondary"
            title="无底色、黑字黑框，适合黑白打印与复印存档"
          >
            <Printer size={15} /> 黑白表
          </button>
          <button onClick={() => void exportOne('styled')} disabled={exporting} className="btn-primary">
            <Download size={15} /> {exporting ? '正在导出…' : '美化表'}
          </button>
        </>
      }
    >
      <div className="overflow-hidden rounded-xl border border-ink-200">
        <div className="flex items-center gap-2 border-b border-ink-200 bg-ink-50 px-3 py-2">
          <FileSpreadsheet size={15} className="text-emerald-600" />
          <span className="text-xs font-medium text-ink-700">{rec.className}_{date}_考勤表</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {['', 'A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c, i) => (
                  <th
                    key={i}
                    className="border border-ink-200 bg-ink-100/70 px-2 py-1.5 text-xs font-medium text-ink-500"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-ink-200 bg-ink-100/70 px-2 py-1.5 text-xs text-ink-500">1</td>
                <td className="border border-ink-200 px-2 py-1.5 font-medium">班级</td>
                <td className="border border-ink-200 px-2 py-1.5">{rec.className}</td>
                <td className="border border-ink-200 px-2 py-1.5 font-medium">教室</td>
                <td className="border border-ink-200 px-2 py-1.5">{rec.classroom}</td>
                <td className="border border-ink-200 px-2 py-1.5 font-medium">日期</td>
                <td className="border border-ink-200 px-2 py-1.5" colSpan={2}>{date}</td>
              </tr>
              <tr>
                <td className="border border-ink-200 bg-ink-100/70 px-2 py-1.5 text-xs text-ink-500">2</td>
                <td className="border border-ink-200 px-2 py-1.5 font-medium">应到</td>
                <td className="border border-ink-200 px-2 py-1.5">{rec.expected}</td>
                <td className="border border-ink-200 px-2 py-1.5 font-medium">实到</td>
                <td className="border border-ink-200 px-2 py-1.5">{rec.actual}</td>
                <td className="border border-ink-200 px-2 py-1.5 font-medium">请假</td>
                <td className="border border-ink-200 px-2 py-1.5" colSpan={2}>{rec.leaveCount}</td>
              </tr>
              <tr>
                <td className="border border-ink-200 bg-ink-100/70 px-2 py-1.5 text-xs text-ink-500">3</td>
                {['学号', '姓名', '请假类别', '事由', '假条状态', '核查情况', '备注'].map((h) => (
                  <td key={h} className="border border-ink-200 bg-ink-50 px-2 py-1.5 text-xs font-medium text-ink-600">
                    {h}
                  </td>
                ))}
              </tr>
              {rec.leaves.length === 0 && (
                <tr>
                  <td className="border border-ink-200 bg-ink-100/70 px-2 py-1.5 text-xs text-ink-500">4</td>
                  <td className="border border-ink-200 px-2 py-1.5 text-xs text-ink-400" colSpan={7}>
                    本班当日无请假人员
                  </td>
                </tr>
              )}
              {rec.leaves.map((l, i) => (
                <tr key={l.id}>
                  <td className="border border-ink-200 bg-ink-100/70 px-2 py-1.5 text-xs text-ink-500">{4 + i}</td>
                  <td className="border border-ink-200 px-2 py-1.5">{l.studentId}</td>
                  <td className="border border-ink-200 px-2 py-1.5">{l.studentName}</td>
                  <td className="border border-ink-200 px-2 py-1.5">{l.reason}</td>
                  <td className="border border-ink-200 px-2 py-1.5">{l.reasonDetail}</td>
                  <td className="border border-ink-200 px-2 py-1.5">
                    {l.certificateFiles.length > 0 ? '已传假条' : '假条待补'}
                  </td>
                  <td className="border border-ink-200 px-2 py-1.5">
                    {l.checked ? '已核查' : '待核查'}
                    {l.hasIssue && <span className="ml-1 text-rose-600">有问题</span>}
                  </td>
                  <td className="border border-ink-200 px-2 py-1.5">{l.extraNote || '—'}</td>
                </tr>
              ))}
              <tr>
                <td className="border border-ink-200 bg-ink-100/70 px-2 py-1.5 text-xs text-ink-500">
                  {4 + rec.leaves.length}
                </td>
                <td className="border border-ink-200 px-2 py-1.5 font-medium" colSpan={7}>
                  请假分类汇总：
                  {Object.entries(grouped)
                    .map(([reason, items]) => `${reason} ${items.length} 人`)
                    .join('　|　') || '无'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-400">
        合计校验：应到 {TOTAL_EXPECTED > 0 ? rec.expected : rec.expected} = 实到 {rec.actual} + 请假 {rec.leaveCount}
        {rec.expected - rec.actual !== rec.leaveCount && '（不一致，已由查勤端标记）'}
      </p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * 教室安排 —— 依据《信息工程学院晚自习教室安排》
 * ------------------------------------------------------------------ */

export function AdminRooms() {
  const [keyword, setKeyword] = useState('');
  const todayRooms = useMemo(() => classroomsForDate(TODAY), []);

  const rooms = useMemo(() => {
    const kw = keyword.trim();
    if (!kw) return todayRooms;
    return todayRooms.filter((r) => {
      const names = r.classIds.map((id) => CLASSES.find((c) => c.id === id)?.name ?? '');
      return r.name.includes(kw) || names.some((n) => n.includes(kw));
    });
  }, [keyword, todayRooms]);

  const teachingRooms = todayRooms.filter((r) => r.classIds.length > 0);
  const spareRooms = todayRooms.filter((r) => r.name === SPARE_CLASSROOM);

  return (
    <div className="space-y-6">
      <PageHeader
        title="教室安排"
        subtitle={`${COLLEGE} · ${TODAY}（${weekdayOf(TODAY)}）当天动态教室安排`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="教室总数" value={todayRooms.length} hint={`含备用教室 ${spareRooms.length} 间`} />
        <StatCard label="晚自习班级" value={CLASSES.length} tone="brand" />
        <StatCard label="专业数" value={new Set(CLASSES.map((c) => c.major)).size} />
        <StatCard label="应到合计" value={TOTAL_EXPECTED} tone="success" />
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
            <Building2 size={16} /> 教室 · 学院 · 班级 · 周次
          </div>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索教室 / 班级"
            className="w-56 rounded-xl border border-ink-200 px-3 py-1.5 text-xs outline-none focus:border-ink-400"
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs text-ink-400">
                <th className="px-4 py-3 font-medium">教室</th>
                <th className="px-4 py-3 font-medium">学院</th>
                <th className="px-4 py-3 font-medium">班级</th>
                <th className="px-4 py-3 font-medium">应到</th>
                <th className="px-4 py-3 font-medium">周次</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => {
                const classList = room.classIds
                  .map((id) => CLASSES.find((c) => c.id === id))
                  .filter((c): c is NonNullable<typeof c> => Boolean(c));
                const total = classList.reduce((s, c) => s + c.size, 0);
                return (
                  <tr key={room.id} className="border-b border-ink-100 last:border-0">
                    <td className="px-4 py-3 font-semibold text-ink-800">{room.name}</td>
                    <td className="px-4 py-3 text-ink-500">{room.college}</td>
                    <td className="px-4 py-3">
                      {classList.length === 0 ? (
                        <Badge tone="info">{room.note ?? SPARE_ROOM_LABEL}</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {classList.map((c) => (
                            <span
                              key={c.id}
                              className="rounded-lg bg-ink-50 px-2 py-1 text-xs text-ink-700"
                            >
                              {c.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-600">{classList.length === 0 ? '—' : total}</td>
                    <td className="px-4 py-3">
                      <Badge tone="brand">{room.weeks}</Badge>
                    </td>
                  </tr>
                );
              })}
              {rooms.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-ink-400">
                    没有匹配的教室或班级
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-ink-400">
          {TODAY} 共 {teachingRooms.length} 间晚自习教室，另有 {spareRooms.length} 间学习部常用教室；
          班级按当天安排展示，全部班级均属 {COLLEGE}。
        </p>
      </Card>
    </div>
  );
}
