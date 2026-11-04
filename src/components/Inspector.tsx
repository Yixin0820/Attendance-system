import { useMemo, useRef, useState } from 'react';
import {
  ClipboardCheck,
  ShieldCheck,
  FileBarChart,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ArrowLeft,
  ThumbsUp,
  RotateCcw,
  Smartphone,
  MoreHorizontal,
  Search,
  Flag,
  X,
  Users,
  CalendarDays,
  Send,
  Clock,
  MessageSquareWarning,
  Eye,
  Camera,
  Image as ImageIcon,
  Inbox,
  Bell,
  History,
  FileText,
  FileCheck2,
  Download,
} from 'lucide-react';
import {
  Card,
  PageHeader,
  StatCard,
  Badge,
  EmptyState,
  Modal,
  CertificateThumb,
} from './ui';
import {
  CLASSES,
  classroomsForDate,
  classroomForClass,
  VERIFY_GROUPS,
  upcomingVerifyRounds,
  SPARE_CLASSROOM,
  STAFF,
  STUDY_WEEKDAYS,
  TODAY,
  hasImageCertificate,
  presentRoster,
  reasonColor,
  weekdayOf,
} from '../data';
import { useStore } from '../store';
import { exportAttendanceXlsx } from '../lib/exportAttendance';
import type { ExportStyle } from '../lib/exportAttendance';
import { ExportStyleDialog } from './ExportStyleDialog';
import { ExpectedChanges } from './ExpectedChanges';
import type {
  AttendanceRecord,
  CertificateFile,
  LeaveRecord,
  Shift,
  ShiftType,
} from '../types';

type DutyView =
  | 'home'
  | 'check'
  | 'check-detail'
  | 'phone'
  | 'phone-class'
  | 'verify-select'
  | 'verify-list'
  | 'verify-class'
  | 'verify-done'
  | 'report';

/* ------------------------------------------------------------------ *
 * 值勤首页
 * ------------------------------------------------------------------ */

export function InspectorDuty() {
  const { user, attendance: storedAttendance, updateLeave, toggleNumberIssue, cancelNumberIssue,
    togglePhoneViolation, pushLog, toast } = useStore();
  const attendance = useMemo(() => storedAttendance.filter((record) => record.date === TODAY)
    .map((record) => ({ ...record, classroom: classroomForClass(record.classId, TODAY) })), [storedAttendance]);
  const [exporting, setExporting] = useState(false);

  const [view, setView] = useState<DutyView>('home');
  const [activeClassroom, setActiveClassroom] = useState<string | null>(null);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [selectedForVerify, setSelectedForVerify] = useState<string[]>([]);
  const [verifyIdx, setVerifyIdx] = useState(0);
  const [blockedModal, setBlockedModal] = useState<{ className: string; count: number } | null>(null);
  const [issueNote, setIssueNote] = useState('');
  const [exportDialog, setExportDialog] = useState(false);

  const me = user?.name ?? '干事';

  const classroomGroups = useMemo(() => {
    return classroomsForDate(TODAY).map((room) => {
      const recs = attendance.filter((r) => room.classIds.includes(r.classId));
      return {
        room,
        recs,
        expected: recs.reduce((s, r) => s + r.expected, 0),
        actual: recs.reduce((s, r) => s + r.actual, 0),
        leave: recs.reduce((s, r) => s + r.leaveCount, 0),
      };
    }).filter((g) => g.room.name !== SPARE_CLASSROOM);
  }, [attendance]);

  const activeRec = attendance.find((r) => r.classId === activeClassId) ?? null;

  async function exportReport(style: ExportStyle = 'styled') {
    if (exporting) return;
    setExporting(true);
    try {
      await exportAttendanceXlsx(attendance, { date: TODAY, style });
      toast(`已生成 Excel（${style === 'plain' ? '纯黑白' : '美化'}版）并发起下载`, 'success');
    } catch {
      toast('Excel 导出失败，请重试', 'danger');
    } finally {
      setExporting(false);
    }
  }

  /** 「尚有未核查项」拦截弹窗，作为浮层叠加在当前页面上 */
  const blockedNode = blockedModal ? (
    <Modal
      title="尚有未核查项"
      subtitle="请完成勾选后再提交"
      onClose={() => setBlockedModal(null)}
      width="max-w-md"
      footer={
        <button onClick={() => setBlockedModal(null)} className="btn-primary">
          返回继续核查
        </button>
      }
    >
      <div className="space-y-3 text-sm text-ink-600">
        <p>
          以下班级仍有 <span className="font-semibold text-rose-600">{blockedModal.count}</span> 名同学未勾选核查：
        </p>
        <p className="rounded-xl bg-ink-50 px-3 py-2 text-xs">{blockedModal.className}</p>
        <p className="text-xs text-ink-400">
          未勾选就点击「核查下一个班级」时，已操作内容会自动保存，但该班在目录页将显示为「尚有未核查项」。
        </p>
      </div>
    </Modal>
  ) : null;

  if (view === 'home') {
    return (
      <div className="space-y-6">
        <PageHeader title="值勤" subtitle={`今日 ${TODAY}（${weekdayOf(TODAY)}）· 当班干事：${me}`} />
        <ExpectedChanges />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DutyCard
            icon={ClipboardCheck}
            title="查班"
            desc="按教室查看应到 / 实到 / 请假汇总"
            accent="from-blue-50 to-sky-50 text-blue-600"
            onClick={() => setView('check')}
          />
          <DutyCard
            icon={Smartphone}
            title="查手机"
            desc="查看已到人员 · 标记玩手机"
            accent="from-violet-50 to-purple-50 text-violet-600"
            onClick={() => setView('phone')}
          />
          <DutyCard
            icon={ShieldCheck}
            title="假条核查"
            desc="勾选班级 · 逐班核查假条"
            accent="from-emerald-50 to-teal-50 text-emerald-600"
            onClick={() => setView('verify-select')}
          />
          <DutyCard
            icon={FileBarChart}
            title="今日考勤表生成"
            desc="汇总全部班级考勤一览"
            accent="from-amber-50 to-orange-50 text-amber-600"
            onClick={() => setView('report')}
          />
        </div>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
            <Users size={16} /> 今日教室分布（{classroomGroups.length} 间 · {CLASSES.length} 个班）
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {classroomGroups.map((g) => (
              <div key={g.room.id} className="rounded-xl border border-ink-100 px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-ink-800">{g.room.name}</span>
                  <span className="text-[10px] text-ink-400">{g.room.weeks}</span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-ink-400">
                  {g.recs.map((r) => r.className).join(' · ') || g.room.note}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  /* ---------------- 查班 ---------------- */

  if (view === 'check') {
    return (
      <div className="space-y-6">
        <PageHeader
          title="查班"
          subtitle="按今日动态教室安排查看考勤汇总"
          actions={
            <button onClick={() => setView('home')} className="btn-ghost">
              <ArrowLeft size={16} /> 返回
            </button>
          }
        />
        <ExpectedChanges />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {classroomGroups.map(({ room, recs, expected, actual, leave }) => (
            <Card key={room.id} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-[11px] font-semibold text-white">
                    {room.name.replace('明理楼', '')}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-ink-800">{room.name}</span>
                      <Badge tone="brand">{room.weeks}</Badge>
                    </div>
                    <div className="truncate text-xs text-ink-400">
                      {recs.map((r) => r.className).join(' · ') || room.note}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setActiveClassroom(room.name)}
                  className="btn-ghost p-1.5"
                  title="查看各班具体考勤情况"
                  aria-label="查看各班具体考勤情况"
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <MiniStat label="应到" value={expected} tone="text-ink-800" bg="bg-ink-50" />
                <MiniStat label="实到" value={actual} tone="text-emerald-600" bg="bg-emerald-50" />
                <MiniStat label="请假" value={leave} tone="text-amber-600" bg="bg-amber-50" />
              </div>
              {recs.some((r) => r.numberIssue && !r.numberIssueCancelled) && (
                <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-600">
                  <Flag size={12} /> 含人数问题标记
                </div>
              )}
            </Card>
          ))}
        </div>

        {activeClassroom && (
          <ClassroomDetailModal
            classroom={activeClassroom}
            recs={attendance.filter((r) => r.classroom === activeClassroom)}
            onClose={() => setActiveClassroom(null)}
            onSelectClass={(id) => {
              setActiveClassId(id);
              setActiveClassroom(null);
              setView('check-detail');
            }}
          />
        )}
      </div>
    );
  }

  if (view === 'check-detail' && activeRec) {
    const diff = activeRec.expected - activeRec.actual;
    const mismatch = diff !== activeRec.leaveCount;
    const marked = Boolean(activeRec.numberIssue && !activeRec.numberIssueCancelled);
    const note = issueNote || activeRec.numberIssueNote || '';
    const setNote = setIssueNote;

    return (
      <div className="space-y-6">
        <PageHeader
          title={`${activeRec.className} 考勤详情`}
          subtitle={`${activeRec.classroom} · 上报 ${activeRec.uploadedAt}${activeRec.lateUploaded ? ' · 补传' : ''}`}
          actions={
            <button
              onClick={() => {
                setView('check');
                setActiveClassId(null);
              }}
              className="btn-ghost"
            >
              <ArrowLeft size={16} /> 返回查班
            </button>
          }
        />

        <div className="grid grid-cols-3 gap-4">
          <StatCard label="应到" value={activeRec.expected} />
          <StatCard label="实到" value={activeRec.actual} tone="success" />
          <StatCard label="请假" value={activeRec.leaveCount} tone="warning" />
        </div>

        <ExpectedChanges classId={activeRec.classId} />

        {mismatch && (
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <MessageSquareWarning size={20} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-ink-800">人数核对不一致</div>
                <p className="mt-1 text-xs text-ink-500">
                  应到 {activeRec.expected} − 实到 {activeRec.actual} = {diff} 人，但请假名单为{' '}
                  {activeRec.leaveCount} 条，差 {Math.abs(diff - activeRec.leaveCount)} 人。
                </p>
                {!marked ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <input
                      className="input flex-1 min-w-[200px]"
                      placeholder="问题说明（后期可补充）"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <button
                      onClick={() => {
                        toggleNumberIssue(activeRec.classId, note || '人数核对不一致', me);
                        pushLog('标记人数问题', activeRec.className, 'warn');
                        toast('已标记问题，将计入当日总结', 'warning');
                      }}
                      className="btn-primary"
                    >
                      <Flag size={15} /> 标记问题
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <div className="rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2 text-xs text-rose-700">
                      已标记：{activeRec.numberIssueNote || '（未填写说明）'} · 标记人 {activeRec.numberIssueBy}
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <input
                        className="input flex-1 min-w-[200px]"
                        placeholder="补充 / 修改说明"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <button
                        onClick={() => {
                          toggleNumberIssue(activeRec.classId, note || '人数核对不一致', me);
                          toast('说明已更新', 'success');
                        }}
                        className="btn-secondary"
                      >
                        提交说明
                      </button>
                      <button
                        onClick={() => {
                          cancelNumberIssue(activeRec.classId);
                          toast('已取消标记，不计入当日总结', 'success');
                        }}
                        className="btn-ghost text-rose-600"
                      >
                        <X size={15} /> 取消标记
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        <Card className="p-5">
          <div className="mb-3 text-sm font-semibold text-ink-800">请假名单（按理由归类）</div>
          <LeaveGroupList leaves={activeRec.leaves} />
        </Card>
      </div>
    );
  }

  /* ---------------- 查手机 ---------------- */

  if (view === 'phone') {
    return (
      <PhoneCheck
        groups={classroomGroups.map((g) => ({
          room: g.room.name,
          recs: g.recs,
          expected: g.expected,
          actual: g.actual,
          leave: g.leave,
        }))}
        onBack={() => setView('home')}
        onOpenClass={(id) => {
          setActiveClassId(id);
          setView('phone-class');
        }}
      />
    );
  }

  if (view === 'phone-class' && activeRec) {
    return (
      <PhoneClassDetail
        rec={activeRec}
        onBack={() => setView('phone')}
        onToggle={(name) => togglePhoneViolation(activeRec.classId, name)}
      />
    );
  }

  /* ---------------- 假条核查 ---------------- */

  if (view === 'verify-select') {
    return (
      <VerifySelect
        selected={selectedForVerify}
        setSelected={setSelectedForVerify}
        onBack={() => setView('home')}
        onStart={() => {
          setVerifyIdx(0);
          setView('verify-list');
        }}
      />
    );
  }

  if (view === 'verify-list') {
    return (
      <div className="space-y-6">
        <PageHeader
          title="假条核查 · 目录页"
          subtitle={`已勾选 ${selectedForVerify.length} 个班级`}
          actions={
            <button onClick={() => setView('home')} className="btn-ghost">
              <ArrowLeft size={16} /> 返回
            </button>
          }
        />
        <div className="space-y-3">
          {selectedForVerify.map((classId, idx) => {
            const cls = CLASSES.find((c) => c.id === classId);
            const rec = attendance.find((r) => r.classId === classId);
            if (!rec) return null;
            const status = classVerifyStatus(rec);
            return (
              <Card key={classId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                      status === 'done'
                        ? 'bg-emerald-100 text-emerald-600'
                        : status === 'partial'
                        ? 'bg-amber-100 text-amber-600'
                        : 'bg-ink-100 text-ink-500'
                    }`}
                  >
                    {status === 'done' ? <CheckCircle2 size={16} /> : idx + 1}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink-800">{cls?.name}</div>
                    <div className="text-xs text-ink-400">
                      请假 {rec.leaveCount} 人 ·{' '}
                      {rec.leaves.filter((l) => l.checked).length} 已核
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {status === 'done' && (
                    <Badge tone="success"><CheckCircle2 size={14} /> 已核查</Badge>
                  )}
                  {status === 'partial' && (
                    <Badge tone="warning"><Clock size={14} /> 尚有未核查项</Badge>
                  )}
                  {status === 'pending' && <span className="text-xs text-ink-400">待核查</span>}
                  <button
                    onClick={() => {
                      setVerifyIdx(idx);
                      setView('verify-class');
                    }}
                    className="btn-secondary"
                  >
                    核查 <ArrowRight size={15} />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => {
              const pending = selectedForVerify
                .map((id) => attendance.find((r) => r.classId === id))
                .filter((r): r is AttendanceRecord => Boolean(r))
                .filter((r) => r.leaves.some((l) => !l.checked));
              if (pending.length > 0) {
                setBlockedModal({
                  className: pending.map((r) => r.className).join('、'),
                  count: pending.reduce((s, r) => s + r.leaves.filter((l) => !l.checked).length, 0),
                });
                return;
              }
              setView('verify-done');
            }}
            className="btn-primary"
          >
            完成全部核查 <CheckCircle2 size={16} />
          </button>
        </div>
        {blockedNode}
      </div>
    );
  }

  if (view === 'verify-class') {
    const classId = selectedForVerify[verifyIdx];
    const rec = attendance.find((r) => r.classId === classId);
    if (!rec) return null;
    const isLast = verifyIdx >= selectedForVerify.length - 1;
    const unchecked = rec.leaves.filter((l) => !l.checked);

    function toggleChecked(l: LeaveRecord) {
      updateLeave(rec!.classId, l.id, { checked: !l.checked });
    }
    function toggleIssue(l: LeaveRecord) {
      updateLeave(rec!.classId, l.id, {
        hasIssue: !l.hasIssue,
        issueBy: !l.hasIssue ? me : undefined,
      });
    }
    function setIssueDesc(l: LeaveRecord, desc: string) {
      updateLeave(rec!.classId, l.id, { issueDescription: desc });
    }

    return (
      <div className="space-y-6">
        <PageHeader
          title={`核查 · ${rec.className}`}
          subtitle={`第 ${verifyIdx + 1} / ${selectedForVerify.length} 个班 · 勾选已核，有疑问可标记并填写描述`}
          actions={
            <button onClick={() => setView('verify-list')} className="btn-ghost">
              <ArrowLeft size={16} /> 回目录页
            </button>
          }
        />

        <Card className="p-5">
          {rec.leaves.length === 0 ? (
            <EmptyState text="本班今日无请假人员" />
          ) : (
            <div className="space-y-4">
              {groupLeaves(rec.leaves).map(([reason, items]) => (
                <div key={reason} className="rounded-xl border border-ink-100 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`chip border text-xs ${reasonColor(reason)}`}>{reason}</span>
                    <span className="text-xs text-ink-400">{items.length} 人</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((l) => (
                      <div
                        key={l.id}
                        className={`rounded-xl border p-3 transition-all ${
                          l.hasIssue ? 'border-rose-200 bg-rose-50/50' : 'border-ink-100 bg-white'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            onClick={() => toggleChecked(l)}
                            aria-label="勾选已核查"
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                              l.checked
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-ink-300 bg-white'
                            }`}
                          >
                            {l.checked && <CheckCircle2 size={16} />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-ink-800">{l.studentName}</span>
                              <span className="text-xs text-ink-400">{l.studentId}</span>
                            </div>
                            <div className="text-xs text-ink-400">{l.reasonDetail || '—'}</div>
                          </div>
                          <button
                            onClick={() => toggleIssue(l)}
                            className={`chip border shrink-0 transition-all ${
                              l.hasIssue
                                ? 'border-rose-200 bg-rose-100 text-rose-600'
                                : 'border-ink-200 text-ink-500 hover:bg-ink-50'
                            }`}
                          >
                            <AlertTriangle size={13} /> {l.hasIssue ? '有问题' : '标记问题'}
                          </button>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {l.certificateFiles.length === 0 ? (
                            <Badge tone="warning">未上传假条</Badge>
                          ) : (
                            l.certificateFiles.map((f) => <CertificateThumb key={f.id} file={f} />)
                          )}
                        </div>

                        {l.extraNote && (
                          <div className="mt-2 rounded-md bg-amber-50/60 px-2.5 py-1.5 text-xs text-amber-700">
                            班委备注：{l.extraNote}
                          </div>
                        )}

                        {l.hasIssue && (
                          <input
                            className="input mt-2"
                            placeholder="请描述具体问题（管理端可见）"
                            defaultValue={l.issueDescription ?? ''}
                            onBlur={(e) => setIssueDesc(l, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') setIssueDesc(l, (e.target as HTMLInputElement).value);
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => setView('verify-list')} className="btn-secondary">
            回目录页
          </button>
          {isLast ? (
            <button
              onClick={() => {
                const pending = selectedForVerify
                  .map((id) => attendance.find((r) => r.classId === id))
                  .filter((r): r is AttendanceRecord => Boolean(r))
                  .filter((r) => r.leaves.some((l) => !l.checked));
                if (pending.length > 0) {
                  setBlockedModal({
                    className: pending.map((r) => r.className).join('、'),
                    count: pending.reduce((s, r) => s + r.leaves.filter((l) => !l.checked).length, 0),
                  });
                  return;
                }
                setView('verify-done');
              }}
              className="btn-primary"
            >
              完成全部核查 <CheckCircle2 size={16} />
            </button>
          ) : (
            <button
              onClick={() => {
                // 未勾完也允许离开，已操作内容自动保存，目录页会显示「尚有未核查项」
                if (unchecked.length > 0) {
                  toast(`已保存 ${rec.leaves.length - unchecked.length} 条核查结果，该班尚有 ${unchecked.length} 项未核查`, 'warning');
                }
                setVerifyIdx((i) => i + 1);
                setView('verify-list');
              }}
              className="btn-primary"
            >
              核查下一个班级 <ArrowRight size={16} />
            </button>
          )}
        </div>
        {blockedNode}
      </div>
    );
  }

  if (view === 'verify-done') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <div className="animate-scaleIn text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            <ThumbsUp size={40} />
          </div>
          <h2 className="mt-6 text-2xl font-semibold text-ink-900">辛苦了。</h2>
          <p className="mt-2 text-sm text-ink-500">所有班级假条已核查完毕，问题项已同步至管理端。</p>
          <button onClick={() => setView('home')} className="btn-primary mt-8">
            <RotateCcw size={15} /> 返回值勤首页
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- 今日考勤表生成 ---------------- */

  if (view === 'report') {
    const totalExpected = attendance.reduce((s, r) => s + r.expected, 0);
    const totalActual = attendance.reduce((s, r) => s + r.actual, 0);
    const totalLeave = attendance.reduce((s, r) => s + r.leaveCount, 0);
    const issues = attendance.flatMap((r) => r.leaves).filter((l) => l.hasIssue);
    const numberIssues = attendance.filter((r) => r.numberIssue && !r.numberIssueCancelled);
    const phoneIssues = attendance.reduce((s, r) => s + (r.phoneViolations?.length ?? 0), 0);

    return (
      <div className="space-y-6">
        <PageHeader
          title="今日考勤表生成"
          subtitle={`${TODAY}（${weekdayOf(TODAY)}）· 全部 ${attendance.length} 个班级`}
          actions={
            <div className="flex gap-2">
              <button onClick={() => setView('home')} className="btn-ghost">
                <ArrowLeft size={16} /> 返回
              </button>
              <button
                onClick={() => setExportDialog(true)}
                disabled={exporting}
                className="btn-primary"
              >
                <Download size={15} /> {exporting ? '正在导出…' : '导出 Excel（.xlsx）'}
              </button>
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="班级总数" value={attendance.length} />
          <StatCard label="应到合计" value={totalExpected} />
          <StatCard label="实到合计" value={totalActual} tone="success" />
          <StatCard label="请假合计" value={totalLeave} tone="warning" />
          <StatCard label="出勤率" value={totalExpected > 0 ? `${((totalActual / totalExpected) * 100).toFixed(1)}%` : '—'} tone="brand" />
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-ink-100 px-5 py-4 text-sm font-semibold text-ink-800">
            各班考勤汇总
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs uppercase text-ink-400">
                  <th className="px-4 py-3 font-medium">班级</th>
                  <th className="px-4 py-3 font-medium">应到</th>
                  <th className="px-4 py-3 font-medium">实到</th>
                  <th className="px-4 py-3 font-medium">请假</th>
                  <th className="px-4 py-3 font-medium" style={{ minWidth: 260 }}>请假分类明细</th>
                  <th className="px-4 py-3 font-medium">核查</th>
                  <th className="px-4 py-3 font-medium">玩手机人数</th>
                  <th className="px-4 py-3 font-medium" style={{ minWidth: 180 }}>玩手机人员名单</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((r) => {
                  const grouped = groupLeaves(r.leaves);
                  const phones = r.phoneViolations ?? [];
                  return (
                    <tr key={r.classId} className="border-b border-ink-50 align-top hover:bg-ink-50">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-ink-800">
                        {r.className}
                        {r.numberIssue && !r.numberIssueCancelled && (
                          <span className="ml-1 text-rose-500" title="人数问题标记">▲</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-600">{r.expected}</td>
                      <td className="px-4 py-3 text-emerald-600">{r.actual}</td>
                      <td className="px-4 py-3 text-amber-600">{r.leaveCount}</td>
                      <td className="px-4 py-3">
                        {grouped.length === 0 ? (
                          <span className="text-xs text-ink-400">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {grouped.map(([reason, items]) => (
                              <span key={reason} className={`chip border text-[11px] ${reasonColor(reason)}`}>
                                {reason}({items.map((l) => l.studentName).join('/')})
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.leaves.length === 0 ? (
                          <Badge tone="neutral">无请假</Badge>
                        ) : r.leaves.every((l) => l.checked) ? (
                          <Badge tone="success">已核查</Badge>
                        ) : (
                          <Badge tone="warning">
                            待核查 {r.leaves.filter((l) => !l.checked).length}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {phones.length > 0 ? (
                          <Badge tone="danger">{phones.length} 人</Badge>
                        ) : (
                          <span className="text-xs text-ink-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-600">
                        {phones.length === 0 ? (
                          <span className="text-ink-400">无</span>
                        ) : (
                          phones.map((v) => v.studentName).join('、')
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <div className="text-sm font-semibold text-ink-800">当日问题记录（次日清零）</div>
            <div className="mt-3 space-y-2">
              {issues.length === 0 && numberIssues.length === 0 && phoneIssues === 0 && (
                <EmptyState text="今日暂无问题记录" />
              )}
              {numberIssues.map((r) => (
                <div key={r.classId} className="rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-2 text-xs text-rose-700">
                  <span className="font-medium">{r.className}</span> · 人数核对问题 ·{' '}
                  {r.numberIssueNote || '（无说明）'}（标记人 {r.numberIssueBy}）
                </div>
              ))}
              {issues.map((l) => (
                <div key={l.id} className="rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-2 text-xs text-rose-700">
                  <span className="font-medium">{l.studentName}</span> · 假条问题 ·{' '}
                  {l.issueDescription || '（未填写描述）'}
                </div>
              ))}
              {phoneIssues > 0 && (
                <div className="rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2 text-xs text-amber-700">
                  查手机共标记 {phoneIssues} 人次
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-sm font-semibold text-ink-800">请假理由分布</div>
            <div className="mt-4 space-y-2.5">
              {Object.entries(
                attendance
                  .flatMap((r) => r.leaves)
                  .reduce<Record<string, number>>((acc, l) => {
                    acc[l.reason] = (acc[l.reason] ?? 0) + 1;
                    return acc;
                  }, {}),
              )
                .sort((a, b) => b[1] - a[1])
                .map(([reason, count]) => (
                  <div key={reason} className="flex items-center gap-3">
                    <span className={`chip border w-20 justify-center ${reasonColor(reason)}`}>{reason}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded-lg bg-ink-100">
                      <div
                        className="h-full rounded-lg bg-ink-700"
                        style={{ width: `${(count / totalLeave) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs text-ink-500">{count}</span>
                  </div>
                ))}
              {totalLeave === 0 && <EmptyState text="今日无请假记录" />}
            </div>
          </Card>
        </div>
        {exportDialog && (
          <ExportStyleDialog
            busy={exporting}
            subtitle={`${TODAY} · 共 ${attendance.length} 个班级`}
            onClose={() => setExportDialog(false)}
            onPick={(style) => {
              setExportDialog(false);
              void exportReport(style);
            }}
          />
        )}
      </div>
    );
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * 查手机
 * ------------------------------------------------------------------ */

function PhoneCheck({
  groups,
  onBack,
  onOpenClass,
}: {
  groups: { room: string; recs: AttendanceRecord[]; expected: number; actual: number; leave: number }[];
  onBack: () => void;
  onOpenClass: (classId: string) => void;
}) {
  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const openGroup = groups.find((g) => g.room === openRoom) ?? null;
  const allRecs = useMemo(() => groups.flatMap((g) => g.recs), [groups]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="查手机"
        subtitle="按教室查看已到人员 · 勾选玩手机的同学"
        actions={
          <button onClick={onBack} className="btn-ghost">
            <ArrowLeft size={16} /> 返回
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((g) => {
          const violations = g.recs.reduce((s, r) => s + (r.phoneViolations?.length ?? 0), 0);
          return (
            <Card key={g.room} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-[11px] font-semibold text-white">
                    {g.room.replace('明理楼', '')}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-ink-800">{g.room}</span>
                      <Badge tone="brand">
                        {classroomsForDate(TODAY).find((r) => r.name === g.room)?.weeks ?? ''}
                      </Badge>
                    </div>
                    <div className="truncate text-xs text-ink-400">
                      {g.recs.map((r) => r.className).join(' · ')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {violations > 0 && <Badge tone="danger">{violations} 人</Badge>}
                  <button
                    onClick={() => setOpenRoom(g.room)}
                    className="btn-ghost p-1.5"
                    title="查看各教室 / 各班详情"
                    aria-label="查看详情"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <MiniStat label="已到" value={g.actual} tone="text-emerald-600" bg="bg-emerald-50" />
                <MiniStat label="请假" value={g.leave} tone="text-amber-600" bg="bg-amber-50" />
              </div>
            </Card>
          );
        })}
      </div>

      {openGroup && (
        <Modal
          title={`${openGroup.room} · 班级详情`}
          subtitle="选择班级查看已到人员名单"
          onClose={() => setOpenRoom(null)}
          width="max-w-lg"
        >
          <div className="space-y-3">
            {openGroup.recs.map((r) => (
              <button
                key={r.classId}
                onClick={() => {
                  setOpenRoom(null);
                  onOpenClass(r.classId);
                }}
                className="flex w-full items-center justify-between rounded-xl border border-ink-100 px-4 py-3 text-left transition-colors hover:bg-ink-50"
              >
                <div>
                  <div className="text-sm font-medium text-ink-800">{r.className}</div>
                  <div className="text-xs text-ink-400">
                    已到 {r.actual} 人 · 请假 {r.leaveCount} 人
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(r.phoneViolations?.length ?? 0) > 0 && (
                    <Badge tone="danger">{r.phoneViolations!.length} 人玩手机</Badge>
                  )}
                  <ChevronRight size={16} className="text-ink-400" />
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      <ReviewZone recs={allRecs} />
    </div>
  );
}

/**
 * 检讨存放专区 —— 放在所有教室下方
 * 已被标记「玩手机」的同学在此上传检讨，支持相册多选 / 拍照，与考勤一样写入历史记录。
 */
function ReviewZone({ recs }: { recs: AttendanceRecord[] }) {
  const { user, uploadReview, removeReviewFile, reviewHistory, toast } = useStore();
  const me = user?.name ?? '干事';
  const [showHistory, setShowHistory] = useState(false);
  const [viewing, setViewing] = useState<{ name: string; files: CertificateFile[] } | null>(null);

  const items = useMemo(
    () =>
      recs.flatMap((r) =>
        (r.phoneViolations ?? []).map((v) => ({
          rec: r,
          violation: v,
        })),
      ),
    [recs],
  );

  function pickFiles(rec: AttendanceRecord, studentName: string, list: FileList) {
    const files: CertificateFile[] = Array.from(list).map((f, i) => ({
      id: `rv${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      name: f.name,
      url: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
    }));
    uploadReview(rec.classId, studentName, files, me);
    toast(`已上传 ${studentName} 的检讨 ${files.length} 份`, 'success');
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
          <Inbox size={16} /> 检讨存放专区
          <Badge tone={items.length > 0 ? 'danger' : 'neutral'}>{items.length} 人待交</Badge>
        </div>
        <button onClick={() => setShowHistory((v) => !v)} className="btn-ghost text-xs">
          <History size={14} /> {showHistory ? '收起历史记录' : `历史记录（${reviewHistory.length}）`}
        </button>
      </div>

      {showHistory && (
        <div className="mt-4 space-y-2 rounded-xl bg-ink-50 p-3">
          {reviewHistory.length === 0 ? (
            <p className="text-xs text-ink-400">暂无检讨存档记录</p>
          ) : (
            reviewHistory.map((h) => (
              <div
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs"
              >
                <span className="text-ink-700">
                  <span className="font-medium">{h.date}</span> · {h.className} ·{' '}
                  <span className="font-medium text-rose-600">{h.studentName}</span> · {h.files.length} 份
                </span>
                <span className="text-ink-400">
                  {h.at} · {h.by}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="mt-4">
        {items.length === 0 ? (
          <EmptyState text="今日暂无被标记玩手机的同学" />
        ) : (
          <div className="space-y-2">
            {items.map(({ rec, violation }) => {
              const files = violation.reviewFiles ?? [];
              const done = files.length > 0;
              return (
                <div
                  key={`${rec.classId}-${violation.studentName}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                        done ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                      }`}
                    >
                      {violation.studentName[0]}
                    </div>
                    <div className="min-w-0 leading-tight">
                      <div className="truncate text-sm font-medium text-ink-800">
                        {violation.studentName}
                      </div>
                      <div className="truncate text-[11px] text-ink-400">
                        {rec.className} · {rec.classroom}
                        {done && ` · ${violation.reviewAt} 已交`}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {done ? (
                      <>
                        <Badge tone="success"><FileCheck2 size={12} /> 已交检讨</Badge>
                        <button
                          onClick={() =>
                            setViewing({ name: violation.studentName, files })
                          }
                          className="chip border border-ink-200 bg-white text-[11px] text-ink-600 hover:bg-ink-100"
                        >
                          <Eye size={12} /> 查看
                        </button>
                      </>
                    ) : (
                      <Badge tone="warning">检讨待交</Badge>
                    )}
                    <ReviewPickButtons
                      onPick={(list) => pickFiles(rec, violation.studentName, list)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {viewing && (
        <Modal
          title={`${viewing.name} 的检讨`}
          onClose={() => setViewing(null)}
          width="max-w-lg"
        >
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {viewing.files.map((f) =>
              f.url ? (
                <a
                  key={f.id}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group overflow-hidden rounded-xl border border-ink-100"
                >
                  <img
                    src={f.url}
                    alt={f.name}
                    className="h-24 w-full object-cover transition-transform group-hover:scale-105"
                  />
                </a>
              ) : (
                <div
                  key={f.id}
                  className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl border border-ink-100 bg-ink-50 text-[10px] text-ink-400"
                >
                  <FileText size={18} />
                  <span className="max-w-full truncate px-1">{f.name}</span>
                </div>
              ),
            )}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => {
                // 删除最后一份（用于误传时回退）
                const last = viewing.files[viewing.files.length - 1];
                const target = items.find((i) => i.violation.studentName === viewing.name);
                if (last && target) {
                  removeReviewFile(target.rec.classId, viewing.name, last.id);
                  toast('已删除最后一份检讨', 'info');
                }
                setViewing(null);
              }}
              className="btn-ghost text-xs text-rose-600"
            >
              删除最后一份
            </button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

/** 检讨上传：相册多选 + 拍照 */
function ReviewPickButtons({ onPick }: { onPick: (files: FileList) => void }) {
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        onClick={() => gallery.current?.click()}
        className="chip border border-ink-200 bg-white text-[11px] text-ink-600 hover:bg-ink-100"
      >
        <ImageIcon size={12} /> 相册（多选）
      </button>
      <button
        onClick={() => camera.current?.click()}
        className="chip border border-ink-200 bg-white text-[11px] text-ink-600 hover:bg-ink-100"
      >
        <Camera size={12} /> 拍照
      </button>
      <input
        ref={gallery}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onPick(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onPick(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );
}

function PhoneClassDetail({
  rec,
  onBack,
  onToggle,
}: {
  rec: AttendanceRecord;
  onBack: () => void;
  onToggle: (name: string) => void;
}) {
  const [q, setQ] = useState('');
  const present = useMemo(() => presentRoster(rec), [rec]);
  const filtered = useMemo(
    () => (q.trim() ? present.filter((n) => n.includes(q.trim())) : present),
    [present, q],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`查手机 · ${rec.className}`}
        subtitle={`${rec.classroom} · 已到 ${rec.actual} 人，勾选玩手机的同学`}
        actions={
          <button onClick={onBack} className="btn-ghost">
            <ArrowLeft size={16} /> 返回
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="应到" value={rec.expected} />
        <StatCard label="已到" value={rec.actual} tone="success" />
        <StatCard
          label="玩手机"
          value={rec.phoneViolations?.length ?? 0}
          tone={(rec.phoneViolations?.length ?? 0) > 0 ? 'danger' : 'default'}
        />
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-ink-800">已到人员名单</div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input w-56 pl-9"
              placeholder="查找同学姓名"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState text="没有匹配的同学" />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((name) => {
              const bad = (rec.phoneViolations ?? []).some((v) => v.studentName === name);
              return (
                <button
                  key={name}
                  onClick={() => onToggle(name)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${
                    bad
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-ink-100 bg-white text-ink-700 hover:border-ink-300'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                      bad ? 'border-rose-500 bg-rose-500 text-white' : 'border-ink-300'
                    }`}
                  >
                    {bad && <Smartphone size={12} />}
                  </span>
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 假条核查 · 选班
 * ------------------------------------------------------------------ */

function VerifySelect({
  selected,
  setSelected,
  onBack,
  onStart,
}: {
  selected: string[];
  setSelected: (s: string[]) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const { attendance, claimed, claimClasses, user } = useStore();
  const me = user?.name ?? '';

  function toggle(id: string) {
    if (claimed[id] && claimed[id] !== me) return;
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const remaining = CLASSES.filter((c) => !claimed[c.id] || claimed[c.id] === me).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="假条核查 · 选择班级"
        subtitle={`勾选今日要核查的班级（班级不可重复，剩余 ${remaining} 个班未分配）`}
        actions={
          <button onClick={onBack} className="btn-ghost">
            <ArrowLeft size={16} /> 返回
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {CLASSES.map((c) => {
          const sel = selected.includes(c.id);
          const rec = attendance.find((r) => r.classId === c.id);
          const takenByOther = Boolean(claimed[c.id] && claimed[c.id] !== me);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              disabled={takenByOther}
              className={`flex items-center justify-between rounded-2xl border p-4 text-left transition-all ${
                takenByOther
                  ? 'cursor-not-allowed border-ink-100 bg-ink-50 opacity-60'
                  : sel
                  ? 'border-ink-900 bg-ink-900 text-white shadow-card'
                  : 'border-ink-100 bg-white hover:border-ink-300'
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-medium ${
                    sel ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-600'
                  }`}
                >
                  {sel ? <CheckCircle2 size={16} /> : c.name.slice(-4, -3)}
                </div>
                <div className={`min-w-0 ${sel ? 'text-white' : 'text-ink-700'}`}>
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="text-xs opacity-70">
                    {takenByOther ? `${claimed[c.id]} 已认领` : `请假 ${rec?.leaveCount ?? 0} 人`}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-soft">
        <span className="text-sm text-ink-500">
          已选 {selected.length} / {CLASSES.length} 班
        </span>
        <button
          onClick={() => {
            claimClasses(selected, me);
            onStart();
          }}
          disabled={selected.length === 0}
          className="btn-primary"
        >
          <ShieldCheck size={16} /> 开始核查
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 排班表
 * ------------------------------------------------------------------ */

export function VerifyGroupRoster() {
  const { verifyAnchorDate } = useStore();
  const upcoming = upcomingVerifyRounds(7, TODAY, verifyAnchorDate);
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-4">
          <div className="text-sm font-semibold text-ink-800">查考勤 · 七轮核验分组</div>
          <p className="mt-1 text-xs text-ink-500">
            每轮 1 名组长 + 3 名成员。以「第一次」{verifyAnchorDate} 为起点，
            每遇到一个有晚自习的日子就推进一轮，第七次之后回到第一次循环；没有晚自习的日子不占轮次。
            考勤岗位按次续排，不参与调班。
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-400">
              <tr><th className="px-4 py-3">次</th><th className="px-4 py-3">组长</th><th className="px-4 py-3">成员（3 人）</th></tr>
            </thead>
            <tbody>
              {VERIFY_GROUPS.map((group) => (
                <tr key={group.id} className="border-b border-ink-50">
                  <td className="whitespace-nowrap px-4 py-3">第 {group.seq} 次</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{STAFF.find((staff) => staff.id === group.leaderId)?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-600">{group.memberIds.map((id) => STAFF.find((staff) => staff.id === id)?.name ?? '—').join('、')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-4">
          <div className="text-sm font-semibold text-ink-800">接下来 7 个晚自习的排次</div>
          <p className="mt-1 text-xs text-ink-500">按「第一次」起依次推进，今天所在的一行已高亮。</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-400">
              <tr>
                <th className="px-4 py-3">日期</th>
                <th className="px-4 py-3">星期</th>
                <th className="px-4 py-3">次</th>
                <th className="px-4 py-3">组长</th>
                <th className="px-4 py-3">成员（3 人）</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((row) => {
                const isToday = row.date === TODAY;
                return (
                  <tr key={row.date} className={`border-b border-ink-50 ${isToday ? 'bg-brand-50/60' : ''}`}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-ink-800">
                      {row.date}
                      {isToday && <span className="ml-1.5 text-[11px] text-brand-600">今天</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-500">{weekdayOf(row.date)}</td>
                    <td className="whitespace-nowrap px-4 py-3">第 {row.seq} 次</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{STAFF.find((s) => s.id === row.group.leaderId)?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-ink-600">{row.group.memberIds.map((id) => STAFF.find((s) => s.id === id)?.name ?? '—').join('、')}</td>
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

export function InspectorShift() {
  const { user, checkShifts, phoneShifts, nextCheckShifts,
    nextPhoneShifts, swaps, notices, requestSwap, respondSwap, markNoticeRead, toast } = useStore();
  const [week, setWeek] = useState<'本周' | '下周'>('本周');
  const [tab, setTab] = useState<ShiftType>('查班');
  const [showSwap, setShowSwap] = useState(false);
  const me = user?.name ?? '';

  const weekShifts = week === '本周'
    ? { 查班: checkShifts, 考勤: [], 查手机: phoneShifts }
    : { 查班: nextCheckShifts, 考勤: [], 查手机: nextPhoneShifts };
  const shifts = weekShifts[tab];
  const maxRows = Math.max(...shifts.map((s) => s.staffIds.length), 1);
  const mySwaps = swaps.filter((s) => s.staffName === me);
  /** 别人发给我、等我回复的替班请求 */
  const incoming = swaps.filter((s) => s.status === 'pending' && s.targetStaffName === me);
  const myNotices = notices.filter((n) => n.toStaffName === me);

  return (
    <div className="space-y-6">
      <PageHeader
        title="排班表"
        subtitle={tab === '考勤' ? '七轮核验分组 · 按次续排' : `${week}值班安排 · ${tab}表`}
        actions={
          <button disabled={tab === '考勤'} title={tab === '考勤' ? '考勤按次续排，不参与调班' : undefined} onClick={() => setShowSwap(true)} className="btn-primary">
            <Send size={15} /> 申请调班
          </button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {tab !== '考勤' && <select aria-label="排班周次" className="input w-28" value={week} onChange={(e) => setWeek(e.target.value as '本周' | '下周')}>
          <option value="本周">本周</option><option value="下周">下周</option>
        </select>}
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
      </div>

      {tab === '考勤' ? <VerifyGroupRoster /> : (
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60">
                <th className="w-14 px-4 py-3 text-left text-xs font-medium text-ink-400">序号</th>
                {shifts.map((s) => (
                  <th key={s.id} className="px-4 py-3 text-left">
                    <div className="text-sm font-semibold text-ink-800">{s.weekday}</div>
                    <div className="text-[11px] font-normal text-ink-400">{s.type}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxRows }).map((_, r) => (
                <tr key={r} className="border-b border-ink-50">
                  <td className="px-4 py-2.5 text-xs text-ink-400">{r + 1}</td>
                  {shifts.map((s) => {
                    const sid = s.staffIds[r];
                    const staff = STAFF.find((x) => x.id === sid);
                    if (!staff) return <td key={s.id} className="px-4 py-2.5" />;
                    const isMe = staff.name === me;
                    return (
                      <td key={s.id} className="px-4 py-2.5">
                        <span
                          className={`chip border ${
                            isMe
                              ? 'border-brand-200 bg-brand-50 font-medium text-brand-700'
                              : 'border-ink-100 bg-ink-50 text-ink-600'
                          }`}
                        >
                          {staff.name}
                          {isMe && <span className="text-[10px] opacity-70">（我）</span>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      )}

      {incoming.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
            <Bell size={16} /> 待我回复的替班请求（{incoming.length}）
          </div>
          <div className="mt-3 space-y-3">
            {incoming.map((s) => (
              <div key={s.id} className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                <div className="text-sm font-medium text-ink-800">
                  {s.staffName} 向你申请调班（{s.week ?? '本周'} → {s.targetWeek ?? s.week ?? '本周'}）
                </div>
                <div className="mt-0.5 text-xs text-ink-500">
                  {s.week ?? '本周'} {s.fromWeekday}（{s.fromType}） → {s.targetWeek ?? s.week ?? '本周'} {s.toWeekday}（{s.toType}） · {s.reason}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(s.fromType === '考勤' || s.toType === '考勤') && (
                    <p className="w-full text-xs text-amber-700">考勤按次续排、不参与调班，请直接拒绝并让对方改申请查班 / 查手机班次。</p>
                  )}
                  <button
                    disabled={s.fromType === '考勤' || s.toType === '考勤'}
                    onClick={() => {
                      if (s.fromType === '考勤' || s.toType === '考勤') return;
                      if (respondSwap(s.id, true)) toast('已同意调班，双方排班已互换', 'success');
                    }}
                    className="btn-primary text-xs"
                  >
                    <ThumbsUp size={14} /> 同意
                  </button>
                  <button
                    onClick={() => {
                      if (respondSwap(s.id, false, '不方便，无法调班')) toast('已拒绝，排班表保持不变', 'info');
                    }}
                    className="btn-secondary text-xs"
                  >
                    <X size={14} /> 不同意
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {myNotices.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
            <Bell size={16} /> 调班申请结果通知（{myNotices.length}）
          </div>
          <div className="mt-3 space-y-2">
            {myNotices.map((n) => (
              <div
                key={n.id}
                className={`rounded-xl border px-3 py-2 ${
                  n.result === 'approved'
                    ? 'border-emerald-100 bg-emerald-50/60'
                    : 'border-rose-100 bg-rose-50/60'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`text-sm font-medium ${
                      n.result === 'approved' ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {n.title}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-400">{n.createdAt}</span>
                    {!n.read && (
                      <button
                        onClick={() => markNoticeRead(n.id)}
                        className="chip border border-ink-200 bg-white text-[11px] text-ink-500"
                      >
                        标记已读
                      </button>
                    )}
                  </div>
                </div>
                {swaps.filter((swap) => swap.id === n.swapId).map((swap) => (
                  <p key={swap.id} className="mt-1 text-xs text-ink-600">
                    {swap.week ?? '本周'} {swap.fromWeekday}（{swap.fromType}） → {swap.targetWeek ?? swap.week ?? '本周'} {swap.toWeekday}（{swap.toType}）
                  </p>
                ))}
                <p className="mt-1 text-xs text-ink-600">{n.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
          <CalendarDays size={16} /> 我的调班申请
        </div>
        {mySwaps.length === 0 ? (
          <p className="mt-3 text-xs text-ink-400">暂无调班申请</p>
        ) : (
          <div className="mt-3 space-y-2">
            {mySwaps.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-100 px-3 py-2">
                <div className="text-xs text-ink-600">
                  {s.week ?? '本周'} {s.fromWeekday}（{s.fromType}） → {s.targetWeek ?? s.week ?? '本周'} {s.toWeekday}（{s.toType}）
                  <span className="ml-2 text-ink-400">
                    替班同学：{s.targetStaffName} · {s.reason}
                  </span>
                </div>
                <Badge
                  tone={s.status === 'pending' ? 'warning' : s.status === 'approved' ? 'success' : 'danger'}
                >
                  {s.status === 'pending'
                    ? '等待同学回应'
                    : s.status === 'approved'
                    ? '同学已同意'
                    : '同学未同意'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showSwap && (
        <SwapModal
          shiftsByWeek={{ 本周: [...checkShifts, ...phoneShifts], 下周: [...nextCheckShifts, ...nextPhoneShifts] }}
          initialWeek={week}
          me={me}
          onCancel={() => setShowSwap(false)}
          onSubmit={(r) => {
            if (requestSwap({ ...r, staffName: me, staffId: STAFF.find((s) => s.name === me)?.id ?? '' })) {
              setShowSwap(false);
              toast(`已向 ${r.targetStaffName} 发送调班申请（${r.week} → ${r.targetWeek}）`, 'success');
            }
          }}
        />
      )}
    </div>
  );
}

function SwapModal({
  shiftsByWeek,
  initialWeek,
  me,
  onCancel,
  onSubmit,
}: {
  shiftsByWeek: Record<'本周' | '下周', Shift[]>;
  initialWeek: '本周' | '下周';
  me: string;
  onCancel: () => void;
  onSubmit: (r: {
    week: '本周' | '下周';
    targetWeek: '本周' | '下周';
    fromWeekday: string;
    fromType: ShiftType;
    toWeekday: string;
    toType: ShiftType;
    reason: string;
    targetStaffId: string;
    targetStaffName: string;
  }) => void;
}) {
  const [week, setWeek] = useState(initialWeek);
  const [targetWeek, setTargetWeek] = useState(initialWeek);
  const myId = STAFF.find((s) => s.name === me)?.id ?? '';
  const mySlots = shiftsByWeek[week].filter((s) => s.type !== '考勤' && s.staffIds.includes(myId));
  const mySlot = mySlots[0];
  const [fromSlotId, setFromSlotId] = useState(mySlot?.id ?? '');
  const selectedFrom = mySlots.find((s) => s.id === fromSlotId) ?? mySlot;
  const fromWeekday = selectedFrom?.weekday ?? '';
  const fromType = selectedFrom?.type ?? '查班';
  const [toWeekday, setToWeekday] = useState<string>(STUDY_WEEKDAYS[1]);
  const [toType, setToType] = useState<ShiftType>(mySlot?.type ?? '查班');
  const [reason, setReason] = useState('');
  const [targetId, setTargetId] = useState('');

  const targetSlot = shiftsByWeek[targetWeek].find((s) => s.type !== '考勤' && s.weekday === toWeekday && s.type === toType);
  const candidates = STAFF.filter((s) => s.id !== myId && targetSlot?.staffIds.includes(s.id) &&
    !selectedFrom?.staffIds.includes(s.id));
  const validTarget = candidates.some((s) => s.id === targetId);
  const sameSlot = week === targetWeek && fromWeekday === toWeekday && fromType === toType;
  const validSwap = !!selectedFrom && !!targetSlot && validTarget && !sameSlot &&
    fromType !== '考勤' && toType !== '考勤' && !targetSlot.staffIds.includes(myId);

  return (
    <Modal
      title="申请调班"
      subtitle="向所选班次的值班同学申请调班；同意后双方互换班次，结果会通知申请人"
      onClose={onCancel}
      width="max-w-lg"
      footer={
        <>
          <button onClick={onCancel} className="btn-secondary">取消</button>
          <button
            onClick={() => {
              if (!validSwap) return;
              onSubmit({
                week,
                targetWeek,
                fromWeekday,
                fromType,
                toWeekday,
                toType,
                reason: reason.trim() || '未填写原因',
                targetStaffId: targetId,
                targetStaffName: STAFF.find((s) => s.id === targetId)?.name ?? '',
              });
            }}
            disabled={!validSwap}
            className="btn-primary"
          >
            发送给同学 <Send size={15} />
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-600">
          申请人：<span className="font-medium text-ink-800">{me}</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="swap-source-week">来源周</label>
            <select id="swap-source-week" className="input" value={week} onChange={(e) => { setWeek(e.target.value as '本周' | '下周'); setFromSlotId(''); setTargetId(''); }}>
              <option value="本周">本周</option><option value="下周">下周</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="swap-target-week">目标周</label>
            <select id="swap-target-week" className="input" value={targetWeek} onChange={(e) => { setTargetWeek(e.target.value as '本周' | '下周'); setTargetId(''); }}>
              <option value="本周">本周</option><option value="下周">下周</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-ink-500">考勤按「第一次」起依次续排，不参与调班；查班和查手机支持本周 / 下周与跨周互换。</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">我的原班次</label>
            <select className="input" value={selectedFrom?.id ?? ''} onChange={(e) => { setFromSlotId(e.target.value); setTargetId(''); }}>
              {mySlots.length === 0 && <option value="">本周次没有我的值班</option>}
              {mySlots.map((s) => <option key={s.id} value={s.id}>{s.weekday} · {s.type}</option>)}
            </select>
          </div>
          <div>
            <label className="label">调至</label>
            <div className="flex gap-2">
              <select className="input" value={toWeekday} onChange={(e) => { setToWeekday(e.target.value); setTargetId(''); }}>
                {STUDY_WEEKDAYS.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
              <select className="input w-24" value={toType} onChange={(e) => { setToType(e.target.value as ShiftType); setTargetId(''); }}>
                <option value="查班">查班</option>
                <option value="考勤" disabled>考勤（不参与调班）</option>
                <option value="查手机">查手机</option>
              </select>
            </div>
          </div>
        </div>
        <div>
          <label className="label">请谁帮忙替班</label>
          <select className="input" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">请选择同学…</option>
            {candidates.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}（{s.role}）
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-ink-400">
            仅显示目标周所选日期和岗位的值班同学；同意后按来源周 → 目标周互换班次。{candidates.length === 0 && '当前没有可调班的同学，请选择其他班次。'}
          </p>
        </div>
        <div>
          <label className="label">调班原因</label>
          <textarea
            className="input min-h-[80px] resize-none"
            placeholder="请说明调班原因…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * 考勤查看
 * ------------------------------------------------------------------ */

export function InspectorView() {
  const { attendance: storedAttendance } = useStore();
  const attendance = useMemo(() => storedAttendance.filter((record) => record.date === TODAY)
    .map((record) => ({ ...record, classroom: classroomForClass(record.classId, TODAY) })), [storedAttendance]);
  const [q, setQ] = useState('');
  const [openClass, setOpenClass] = useState<string | null>(null);
  const openRec = attendance.find((r) => r.classId === openClass) ?? null;

  const list = q.trim()
    ? attendance.filter((r) => r.className.includes(q.trim()) || r.classroom.includes(q.trim()))
    : attendance;

  return (
    <div className="space-y-6">
      <PageHeader
        title="考勤查看"
        subtitle="查看各班学委提供的考勤情况"
        actions={
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input w-52 pl-9"
              placeholder="搜索班级 / 教室"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {list.map((r) => (
          <Card key={r.classId} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink-800">{r.className}</div>
                <div className="text-xs text-ink-400">
                  {r.classroom} · 上报 {r.uploadedAt}
                  {r.lateUploaded && <span className="ml-1 text-amber-500">补传</span>}
                </div>
              </div>
              <Badge tone={r.leaveCount > 0 ? 'warning' : 'success'}>
                {r.leaveCount > 0 ? `${r.leaveCount}人请假` : '全员到齐'}
              </Badge>
            </div>
            <div className="mt-3"><ExpectedChanges classId={r.classId} /></div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <MiniStat label="应到" value={r.expected} tone="text-ink-800" bg="bg-ink-50" />
              <MiniStat label="实到" value={r.actual} tone="text-emerald-600" bg="bg-emerald-50" />
              <MiniStat label="请假" value={r.leaveCount} tone="text-amber-600" bg="bg-amber-50" />
            </div>
            {r.leaves.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {groupLeaves(r.leaves).map(([reason, items]) => (
                  <span key={reason} className={`chip border text-[11px] ${reasonColor(reason)}`}>
                    {reason} {items.length}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => setOpenClass(r.classId)}
              className="btn-secondary mt-4 w-full text-xs"
            >
              <Eye size={14} /> 查看请假名单与假条
            </button>
          </Card>
        ))}
      </div>

      {openRec && (
        <Modal
          title={`${openRec.className} · 请假名单`}
          subtitle={`${openRec.classroom} · 共 ${openRec.leaveCount} 人请假，可点「查看假条」看学委上传的假条`}
          onClose={() => setOpenClass(null)}
          width="max-w-2xl"
        >
          <LeaveGroupList leaves={openRec.leaves} />
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 公共组件
 * ------------------------------------------------------------------ */

function DutyCard({
  icon: Icon,
  title,
  desc,
  accent,
  onClick,
}: {
  icon: typeof ClipboardCheck;
  title: string;
  desc: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border border-ink-100 bg-white p-6 text-left shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-card"
    >
      <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${accent}`}>
        <Icon size={26} />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 text-sm text-ink-500">{desc}</p>
      <div className="mt-4 flex items-center gap-1 text-sm font-medium text-ink-700 transition-all group-hover:gap-2">
        进入 <ArrowRight size={15} />
      </div>
    </button>
  );
}

function MiniStat({ label, value, tone, bg }: { label: string; value: number; tone: string; bg: string }) {
  return (
    <div className={`rounded-xl ${bg} p-3 text-center`}>
      <div className={`text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-0.5 text-xs text-ink-400">{label}</div>
    </div>
  );
}

function ClassroomDetailModal({
  classroom,
  recs,
  onClose,
  onSelectClass,
}: {
  classroom: string;
  recs: AttendanceRecord[];
  onClose: () => void;
  onSelectClass: (id: string) => void;
}) {
  const [sel, setSel] = useState(recs[0]?.classId ?? '');
  const rec = recs.find((r) => r.classId === sel);

  return (
    <Modal
      title={`${classroom} · 各班具体考勤情况`}
      subtitle="选择班级查看当日学委上报的考勤表"
      onClose={onClose}
      width="max-w-xl"
    >
      <div className="flex flex-wrap gap-2">
        {recs.map((r) => (
          <button
            key={r.classId}
            onClick={() => setSel(r.classId)}
            className={`chip border transition-all ${
              sel === r.classId ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-500'
            }`}
          >
            {r.className}
          </button>
        ))}
      </div>
      {rec && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="应到" value={rec.expected} tone="text-ink-800" bg="bg-ink-50" />
            <MiniStat label="实到" value={rec.actual} tone="text-emerald-600" bg="bg-emerald-50" />
            <MiniStat label="请假" value={rec.leaveCount} tone="text-amber-600" bg="bg-amber-50" />
          </div>
          <LeaveGroupList leaves={rec.leaves} compact />
          <button onClick={() => onSelectClass(rec.classId)} className="btn-primary w-full">
            查看完整考勤 <ArrowRight size={15} />
          </button>
        </div>
      )}
    </Modal>
  );
}

function LeaveGroupList({ leaves, compact = false }: { leaves: LeaveRecord[]; compact?: boolean }) {
  const [viewing, setViewing] = useState<LeaveRecord | null>(null);
  if (leaves.length === 0) return <EmptyState text="本班今日无请假人员" />;
  return (
    <div className="space-y-3">
      {groupLeaves(leaves).map(([reason, items]) => (
        <div key={reason} className="rounded-xl border border-ink-100 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className={`chip border text-xs ${reasonColor(reason)}`}>{reason}</span>
            <span className="text-xs text-ink-400">{items.length} 人</span>
          </div>
          <div className="space-y-2">
            {items.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-medium text-ink-600 shadow-soft">
                    {l.studentName[0]}
                  </div>
                  <div className="min-w-0 leading-tight">
                    <div className="text-sm font-medium text-ink-800">{l.studentName}</div>
                    {!compact && <div className="text-xs text-ink-400">{l.reasonDetail}</div>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {l.hasIssue && <Badge tone="danger">问题</Badge>}
                  {hasImageCertificate(l) ? (
                    <Badge tone="success">已传假条</Badge>
                  ) : (
                    <Badge tone="warning">假条待补</Badge>
                  )}
                  {l.checked ? <Badge tone="info">已核查</Badge> : <Badge tone="neutral">待核查</Badge>}
                  <button
                    onClick={() => setViewing(l)}
                    className="chip border border-ink-200 bg-white text-[11px] text-ink-600 transition-colors hover:bg-ink-100"
                  >
                    <Eye size={12} /> 查看假条
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {viewing && (
        <CertificateViewer
          title={`${viewing.studentName} 的假条`}
          subtitle={viewing.reasonDetail || viewing.reason}
          files={viewing.certificateFiles}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

/** 假条 / 检讨查看弹窗（可点开放大） */
function CertificateViewer({
  title,
  subtitle,
  files,
  onClose,
}: {
  title: string;
  subtitle?: string;
  files: CertificateFile[];
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState<string | null>(null);
  const images = files.filter((f) => f.url);
  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose} width="max-w-lg">
      {files.length === 0 ? (
        <EmptyState text="该同学暂未上传假条（状态为「假条待补」）" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {files.map((f) => (
              <button
                key={f.id}
                onClick={() => f.url && setZoom(f.url)}
                className="group overflow-hidden rounded-xl border border-ink-100 bg-ink-50"
              >
                {f.url ? (
                  <img src={f.url} alt={f.name} className="h-24 w-full object-cover transition-transform group-hover:scale-105" />
                ) : (
                  <div className="flex h-24 flex-col items-center justify-center gap-1 text-[10px] text-ink-400">
                    <FileText size={18} />
                    <span className="max-w-full truncate px-1">{f.name}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
          {images.length === 0 && (
            <p className="mt-3 text-[11px] text-ink-400">
              上传的是非图片文件（如 PDF / Word），可在下方文件名列表中查看。
            </p>
          )}
        </>
      )}
      {zoom && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-900/80 p-6"
          onClick={() => setZoom(null)}
        >
          <img src={zoom} alt="假条大图" className="max-h-[85vh] max-w-full rounded-xl bg-white object-contain" />
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

function groupLeaves(leaves: LeaveRecord[]): [string, LeaveRecord[]][] {
  const g: Record<string, LeaveRecord[]> = {};
  leaves.forEach((l) => {
    if (!g[l.reason]) g[l.reason] = [];
    g[l.reason].push(l);
  });
  return Object.entries(g);
}

type VerifyStatus = 'done' | 'partial' | 'pending';

function classVerifyStatus(rec: AttendanceRecord): VerifyStatus {
  if (rec.leaves.length === 0) return 'done';
  const checked = rec.leaves.filter((l) => l.checked).length;
  if (checked === rec.leaves.length) return 'done';
  if (checked > 0) return 'partial';
  return 'pending';
}

