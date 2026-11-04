import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Clock,
  CheckCircle2,
  Plus,
  Trash2,
  FileText,
  History,
  Users,
  Layers,
  X,
  Link2,
  FileCheck2,
  FileX2,
  AlertTriangle,
  Tag,
  Camera,
} from 'lucide-react';
import { Card, PageHeader, StatCard, Badge, EmptyState, Modal, CertificateThumb } from './ui';
import {
  CLASSES,
  DEFAULT_LEAVE_REASONS,
  TODAY,
  UPLOAD_DEADLINE,
  WEEK_RANGE,
  TIMEZONE_LABEL,
  beijingParts,
  classroomForClass,
  hasImageCertificate,
  reasonColor,
  weekdayOf,
} from '../data';
import { useStore } from '../store';
import type { CertificateFile, LeaveRecord } from '../types';

/** 本地编辑用的请假条目 */
interface LeaveEntry extends Omit<LeaveRecord, 'certificateFiles'> {
  certificateFiles: CertificateFile[];
}

/** 截止判断按北京时间，不依赖设备本地时区（新疆常用 UTC+6「新疆时间」） */
function isPastDeadline(): boolean {
  const { hours, minutes } = beijingParts();
  const [h, m] = UPLOAD_DEADLINE.split(':').map(Number);
  return hours * 60 + minutes > h * 60 + m;
}

export function CommitteeUpload() {
  const { user, attendance, submitAttendance, changeExpected, expectedChanges, toast } = useStore();
  const classId = user?.classId ?? CLASSES[0].id;
  const cls = CLASSES.find((c) => c.id === classId)!;
  const rec = attendance.find((r) => r.classId === classId);
  const classroom = classroomForClass(classId, TODAY);

  /** 应到人数可修改，修改后持续生效直到下一次修改，且必须填写原因 */
  const expected = rec?.expected ?? cls.size;
  const [expectedDraft, setExpectedDraft] = useState(String(expected));
  const [expectedReason, setExpectedReason] = useState('');
  const [showExpected, setShowExpected] = useState(false);
  const [actual, setActual] = useState(rec?.actual ?? cls.size);
  const [entries, setEntries] = useState<LeaveEntry[]>(() => (rec?.leaves ?? []) as LeaveEntry[]);
  const [uploaded, setUploaded] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [customReasons, setCustomReasons] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`reasons_${classId}`) ?? '[]');
    } catch {
      return [];
    }
  });

  const allReasons = useMemo(
    () => [...DEFAULT_LEAVE_REASONS, ...customReasons],
    [customReasons],
  );

  useEffect(() => {
    if (rec) {
      setActual(rec.actual);
      setEntries(rec.leaves as LeaveEntry[]);
      setExpectedDraft(String(rec.expected));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  /** 本班当日玩手机名单（查勤端查手机结果） */
  const phoneList = rec?.phoneViolations ?? [];
  const myExpectedHistory = expectedChanges.filter((c) => c.classId === classId).slice(0, 5);

  function confirmExpected() {
    const next = Number(expectedDraft);
    const error = changeExpected(classId, next, expectedReason, user?.name ?? cls.committeeName);
    if (error) {
      toast(error, 'warning');
      return;
    }
    setShowExpected(false);
    setExpectedReason('');
    toast(`应到人数已改为 ${next}，修改原因已同步查勤端与管理端`, 'success');
  }

  const leaveCount = entries.length;
  const late = isPastDeadline();
  const mismatch = expected - actual !== leaveCount;

  const reasonGroups = useMemo(() => {
    const g: Record<string, LeaveEntry[]> = {};
    entries.forEach((e) => {
      if (!g[e.reason]) g[e.reason] = [];
      g[e.reason].push(e);
    });
    return g;
  }, [entries]);

  function persistReasons(next: string[]) {
    setCustomReasons(next);
    // file:// 打开时部分浏览器会禁用 localStorage，失败也不能影响主流程
    try {
      localStorage.setItem(`reasons_${classId}`, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function addCustomReason(label: string) {
    if (label && !allReasons.includes(label)) persistReasons([...customReasons, label]);
  }

  /** 删除自定义类别（内置类别不允许删除） */
  function removeCustomReason(label: string) {
    if (DEFAULT_LEAVE_REASONS.includes(label)) return;
    persistReasons(customReasons.filter((r) => r !== label));
  }

  function removeEntry(id: string) {
    setEntries((p) => p.filter((e) => e.id !== id));
  }

  function submit() {
    submitAttendance(classId, expected, actual, entries as LeaveRecord[], late);
    setUploaded(true);
    toast(late ? '已提交（标记为补传）' : '上报成功，已同步至查勤端与管理端', late ? 'warning' : 'success');
  }

  const pendingCount = entries.filter((e) => !hasImageCertificate(e)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="考勤上报"
        subtitle={`${cls.name} · ${classroom} · ${TODAY}（${weekdayOf(TODAY)}）· 截止 ${UPLOAD_DEADLINE}（${TIMEZONE_LABEL}）`}
        actions={
          uploaded ? (
            <Badge tone="success"><CheckCircle2 size={14} /> 已上报</Badge>
          ) : (
            <Badge tone={late ? 'danger' : 'warning'}>
              <Clock size={14} /> {late ? '已超时 · 补传' : '上报中'}
            </Badge>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="今日应到" value={expected} />
        <StatCard label="今日实到" value={actual} tone="success" />
        <StatCard label="请假人数" value={leaveCount} tone="warning" />
        <StatCard
          label="上报状态"
          value={uploaded ? '已提交' : '待提交'}
          tone={uploaded ? 'success' : 'brand'}
          hint={pendingCount > 0 ? `${pendingCount} 人假条待补` : '假条已齐'}
        />
      </div>

      {mismatch && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            人数核对提示：应到 {expected} − 实到 {actual} = {expected - actual} 人，当前请假条目为{' '}
            {leaveCount} 条，两者不一致。请确认是否漏填或人数有误（查勤端可对此做问题标记）。
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <h3 className="text-sm font-semibold text-ink-800">人数填写</h3>
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="label">今日应到人数</label>
                <button
                  onClick={() => {
                    setExpectedDraft(String(expected));
                    setShowExpected(true);
                  }}
                  className="btn-secondary px-2 py-1 text-[11px]"
                >
                  修改应到
                </button>
              </div>
              <input
                type="number"
                value={expected}
                readOnly
                disabled
                className="input cursor-not-allowed bg-ink-50 text-ink-500"
              />
              <p className="mt-1 text-[11px] text-ink-400">
                基础人数 {cls.size} 人；修改需填写原因，修改后保持生效直至下次修改
              </p>
              {myExpectedHistory.length > 0 && (
                <ul className="mt-2 space-y-1 text-[11px] text-ink-500">
                  {myExpectedHistory.map((c) => (
                    <li key={c.id}>
                      {c.date}：{c.from} → {c.to} 人（{c.reason}）
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <label className="label">今日实到人数</label>
              <input
                type="number"
                min={0}
                value={actual}
                onChange={(e) => setActual(Number(e.target.value))}
                className="input"
              />
            </div>
            <div className="rounded-xl bg-ink-50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-500">应到 − 实到</span>
                <span className="font-semibold text-ink-800">{Math.max(0, expected - actual)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-ink-500">当前请假条目</span>
                <span className="font-semibold text-ink-800">{leaveCount}</span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink-800">请假名单（按理由归类）</h3>
            <button onClick={() => setShowBatch(true)} className="btn-primary">
              <Layers size={15} /> 批量添加请假
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {Object.keys(reasonGroups).length === 0 && (
              <EmptyState text="暂无请假记录，点击右上角「批量添加请假」" />
            )}
            {Object.entries(reasonGroups).map(([reason, items]) => {
              const shared = items.some((i) => i.sharedCertificate);
              return (
                <div key={reason} className="rounded-xl border border-ink-100 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`chip border ${reasonColor(reason)}`}>{reason}</span>
                    <span className="text-xs text-ink-400">{items.length} 人</span>
                    {shared && (
                      <span className="chip border border-blue-100 bg-blue-50 text-blue-500">
                        <Link2 size={11} /> 统一假条
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {items.map((d) => (
                      <div key={d.id} className="rounded-lg bg-ink-50 px-3 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-medium text-ink-600 shadow-soft">
                              {d.studentName[0] ?? '?'}
                            </div>
                            <div className="min-w-0 leading-tight">
                              <div className="text-sm font-medium text-ink-800">{d.studentName}</div>
                              <div className="truncate text-xs text-ink-400">
                                {d.studentId || '—'} · {d.reasonDetail || '—'}
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {hasImageCertificate(d) ? (
                              <Badge tone="success"><FileCheck2 size={12} /> 已传假条</Badge>
                            ) : (
                              <Badge tone="warning"><FileX2 size={12} /> 假条待补</Badge>
                            )}
                            <button
                              onClick={() => removeEntry(d.id)}
                              className="btn-ghost p-1.5 text-ink-400 hover:text-rose-500"
                              aria-label="删除"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        {d.extraNote && (
                          <div className="mt-2 rounded-md bg-amber-50/60 px-2.5 py-1.5 text-xs text-amber-700">
                            <span className="font-medium">班委备注：</span>{d.extraNote}
                          </div>
                        )}

                        {d.certificateFiles.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {d.certificateFiles.map((f) => (
                              <CertificateThumb key={f.id} file={f} />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink-800">当日本班玩手机名单公示</h3>
          <Badge tone={phoneList.length ? 'danger' : 'success'}>
            {phoneList.length ? `${phoneList.length} 人` : '平安夜'}
          </Badge>
        </div>
        {phoneList.length === 0 ? (
          <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            恭喜你，这是一个“平安夜”。
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {phoneList.map((v) => (
              <div key={v.studentName} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-50 px-3 py-2">
                <span className="text-sm text-ink-800">{v.studentName}</span>
                <span className="text-xs text-ink-400">
                  {v.reviewFiles?.length
                    ? `检讨已交（${v.reviewAt ?? '—'} · ${v.reviewBy ?? '—'}）`
                    : '检讨待交'}
                </span>
              </div>
            ))}
            <p className="text-[11px] text-ink-400">名单由查勤端查手机结果同步，供班委每日记录与督促。</p>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button className="btn-secondary"><FileText size={15} /> 存为草稿</button>
        <button onClick={submit} className="btn-primary">
          <Upload size={16} /> {late ? '提交（补传）' : '提交上报'}
        </button>
      </div>

      {showExpected && (
        <Modal
          title="修改应到人数"
          subtitle="需填写修改原因；保存后一直生效，直到下次修改"
          onClose={() => setShowExpected(false)}
          footer={
            <>
              <button onClick={() => setShowExpected(false)} className="btn-secondary">取消</button>
              <button
                onClick={confirmExpected}
                disabled={!expectedReason.trim() || Number(expectedDraft) === expected}
                className="btn-primary"
              >
                保存修改
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="label">当前应到人数</label>
              <p className="text-sm text-ink-600">{expected} 人（基础人数 {cls.size} 人）</p>
            </div>
            <div>
              <label className="label">修改后的应到人数</label>
              <input
                type="number"
                min={0}
                value={expectedDraft}
                onChange={(e) => setExpectedDraft(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">修改原因（必填）</label>
              <textarea
                value={expectedReason}
                onChange={(e) => setExpectedReason(e.target.value)}
                placeholder="例如：转专业学生减少 2 人"
                className="input min-h-[80px]"
              />
              <p className="mt-1 text-[11px] text-ink-400">
                保存后当日显示在查勤端，并在管理端作为待阅提醒
              </p>
            </div>
          </div>
        </Modal>
      )}

      {showBatch && (
        <BatchLeaveModal
          allReasons={allReasons}
          customReasons={customReasons}
          onCancel={() => setShowBatch(false)}
          onAdd={(list) => {
            setEntries((p) => [...p, ...list]);
            setShowBatch(false);
            toast(`已添加 ${list.length} 条请假记录`, 'success');
          }}
          onAddCustomReason={addCustomReason}
          onRemoveCustomReason={removeCustomReason}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

type CertMode = 'unified' | 'individual' | 'late';

interface StudentRow {
  id: string;
  name: string;
  sid: string;
  note: string;
}

function BatchLeaveModal({
  allReasons,
  customReasons,
  onCancel,
  onAdd,
  onAddCustomReason,
  onRemoveCustomReason,
}: {
  allReasons: string[];
  customReasons: string[];
  onCancel: () => void;
  onAdd: (entries: LeaveEntry[]) => void;
  onAddCustomReason: (label: string) => void;
  onRemoveCustomReason: (label: string) => void;
}) {
  const [reason, setReason] = useState(allReasons[0]);
  const [reasonDetail, setReasonDetail] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([{ id: 's1', name: '', sid: '', note: '' }]);
  const [certMode, setCertMode] = useState<CertMode>('unified');
  const [unifiedFiles, setUnifiedFiles] = useState<CertificateFile[]>([]);
  const [perStudentFiles, setPerStudentFiles] = useState<Record<string, CertificateFile[]>>({});
  const [showNewReason, setShowNewReason] = useState(false);
  const [newReason, setNewReason] = useState('');

  function updateStudent(id: string, field: keyof Omit<StudentRow, 'id'>, val: string) {
    setStudents((p) => p.map((s) => (s.id === id ? { ...s, [field]: val } : s)));
  }
  function addStudentRow() {
    setStudents((p) => [...p, { id: `s${Date.now()}${p.length}`, name: '', sid: '', note: '' }]);
  }
  function removeStudentRow(id: string) {
    setStudents((p) => p.filter((s) => s.id !== id));
  }

  function filesFromList(list: FileList | null, existing: CertificateFile[]): CertificateFile[] {
    if (!list) return existing;
    return [
      ...existing,
      ...Array.from(list).map((f, i) => ({
        id: `f${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
        name: f.name,
        url: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
        // 保留原始文件对象，连上后端时由 store 上传并换成服务端附件 id
        file: f,
      })),
    ];
  }

  function removeUnifiedFile(id: string) {
    setUnifiedFiles((p) => p.filter((f) => f.id !== id));
  }
  function removeStudentFile(sid: string, fid: string) {
    setPerStudentFiles((p) => ({ ...p, [sid]: (p[sid] || []).filter((f) => f.id !== fid) }));
  }

  function submit() {
    const valid = students.filter((s) => s.name.trim());
    if (valid.length === 0) return;

    const entries: LeaveEntry[] = valid.map((s) => {
      const files =
        certMode === 'unified'
          ? unifiedFiles
          : certMode === 'individual'
          ? perStudentFiles[s.id] || []
          : [];
      return {
        id: `e${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        studentName: s.name.trim(),
        studentId: s.sid.trim(),
        reason,
        reasonDetail: reasonDetail.trim(),
        extraNote: s.note.trim(),
        sharedCertificate: certMode === 'unified',
        certificateLate: certMode === 'late' || files.length === 0,
        certificateFiles: files,
        checked: false,
        hasIssue: false,
      };
    });
    onAdd(entries);
  }

  function confirmNewReason() {
    const label = newReason.trim();
    if (label) {
      onAddCustomReason(label);
      setReason(label);
      setShowNewReason(false);
      setNewReason('');
    }
  }

  return (
    <Modal
      title="批量添加请假"
      subtitle="同理由的同学可一次性批量录入，标签会自动保存供下次复用"
      onClose={onCancel}
      footer={
        <>
          <button onClick={onCancel} className="btn-secondary">取消</button>
          <button
            onClick={submit}
            disabled={students.every((s) => !s.name.trim())}
            className="btn-primary"
          >
            确认添加（{students.filter((s) => s.name.trim()).length} 人）
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="label">请假类别标签</label>
          <div className="flex flex-wrap items-center gap-2">
            {allReasons.map((r) => {
              const deletable = customReasons.includes(r);
              return (
                <span
                  key={r}
                  className={`chip border transition-all ${
                    reason === r
                      ? 'border-ink-900 bg-ink-900 text-white'
                      : `border-ink-200 text-ink-500 ${reasonColor(r).split(' ')[1] ?? ''}`
                  }`}
                >
                  <button onClick={() => setReason(r)}>{r}</button>
                  {deletable && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveCustomReason(r);
                        if (reason === r) setReason(allReasons[0]);
                      }}
                      className="ml-0.5 opacity-60 transition-opacity hover:opacity-100"
                      aria-label={`删除类别 ${r}`}
                      title="删除该自定义类别"
                    >
                      <X size={11} />
                    </button>
                  )}
                </span>
              );
            })}
            <button
              onClick={() => setShowNewReason(true)}
              className="chip border border-dashed border-ink-300 text-ink-400 hover:bg-ink-50"
            >
              <Plus size={12} /> 自定义
            </button>
          </div>
          {showNewReason && (
            <div className="mt-2 flex gap-2">
              <input
                className="input flex-1"
                placeholder="输入新标签名称，如「考研自习」"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmNewReason()}
              />
              <button onClick={confirmNewReason} className="btn-primary">保存</button>
            </div>
          )}
          <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-400">
            <Tag size={11} /> 自定义标签会保存在本机，下次登录可继续复用
          </p>
        </div>

        <div>
          <label className="label">请假详细说明（整批通用）</label>
          <textarea
            className="input min-h-[64px] resize-none"
            placeholder="请简述请假原因…"
            value={reasonDetail}
            onChange={(e) => setReasonDetail(e.target.value)}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="label mb-0">请假学生名单</label>
            <button onClick={addStudentRow} className="btn-ghost p-1.5 text-xs text-ink-500">
              <Plus size={13} /> 添加一人
            </button>
          </div>
          <div className="space-y-2">
            {students.map((s) => (
              <div key={s.id} className="rounded-xl border border-ink-100 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="input"
                    placeholder="姓名"
                    value={s.name}
                    onChange={(e) => updateStudent(s.id, 'name', e.target.value)}
                  />
                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      placeholder="学号"
                      value={s.sid}
                      onChange={(e) => updateStudent(s.id, 'sid', e.target.value)}
                    />
                    {students.length > 1 && (
                      <button
                        onClick={() => removeStudentRow(s.id)}
                        className="btn-ghost p-2 text-ink-400 hover:text-rose-500"
                        aria-label="移除"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
                <input
                  className="input mt-2"
                  placeholder="额外说明（可选，没有可空着）"
                  value={s.note}
                  onChange={(e) => updateStudent(s.id, 'note', e.target.value)}
                />
                {certMode === 'individual' && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(perStudentFiles[s.id] || []).map((f) => (
                      <span
                        key={f.id}
                        className="inline-flex items-center gap-1 rounded-md bg-ink-50 px-2 py-1 text-[11px] text-ink-500"
                      >
                        <FileText size={11} /> {f.name}
                        <button
                          onClick={() => removeStudentFile(s.id, f.id)}
                          className="text-ink-300 hover:text-rose-400"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                    <FilePickButtons
                      label={`${s.name || '该生'} 的假条`}
                      onPick={(list) =>
                        setPerStudentFiles((p) => ({
                          ...p,
                          [s.id]: filesFromList(list, p[s.id] || []),
                        }))
                      }
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="label">假条上传方式</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <ModeCard
              active={certMode === 'unified'}
              onClick={() => setCertMode('unified')}
              icon={Link2}
              title="统一假条上传"
              desc="本类别共用这一份（可多张）"
            />
            <ModeCard
              active={certMode === 'individual'}
              onClick={() => setCertMode('individual')}
              icon={FileText}
              title="分别上传假条"
              desc="本类别每人独立，可各传多张"
            />
            <ModeCard
              active={certMode === 'late'}
              onClick={() => setCertMode('late')}
              icon={Clock}
              title="后续补传假条"
              desc="暂不上传，标记待补"
            />
          </div>

          {certMode === 'unified' && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {unifiedFiles.map((f) => (
                <span
                  key={f.id}
                  className="inline-flex items-center gap-1 rounded-md bg-ink-50 px-2 py-1 text-[11px] text-ink-500"
                >
                  <FileText size={11} /> {f.name}
                  <button onClick={() => removeUnifiedFile(f.id)} className="text-ink-300 hover:text-rose-400">
                    <X size={11} />
                  </button>
                </span>
              ))}
              <FilePickButtons
                label="选择图片 / 文件"
                onPick={(list) => setUnifiedFiles((p) => filesFromList(list, p))}
              />
            </div>
          )}
          {certMode === 'late' && (
            <p className="mt-2 text-xs text-amber-600">
              选择后本批同学状态将显示为「假条待补」，请尽快补传。
            </p>
          )}
        </div>
      </div>

    </Modal>
  );
}

/**
 * 上传按钮组：手机端「相册」可调起相册并多选，「拍照」直接调起摄像头。
 */
function FilePickButtons({
  label,
  onPick,
}: {
  label: string;
  onPick: (files: FileList) => void;
}) {
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        onClick={() => gallery.current?.click()}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-ink-300 px-2 py-1 text-[11px] text-ink-400 hover:bg-ink-50"
      >
        <Plus size={11} /> {label}（相册多选）
      </button>
      <button
        onClick={() => camera.current?.click()}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-ink-300 px-2 py-1 text-[11px] text-ink-400 hover:bg-ink-50"
      >
        <Camera size={11} /> 拍照
      </button>

      {/* 相册：不加 capture，手机端弹出「相册 / 拍照 / 文件」选择，支持多选 */}
      <input
        ref={gallery}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.jpg,.jpeg,.png,.heic"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onPick(e.target.files);
          e.target.value = '';
        }}
      />
      {/* 拍照：capture="environment" 直接调起摄像头 */}
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

function ModeCard({
  active,
  onClick,
  icon: Icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Link2;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition-all ${
        active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-600 hover:bg-ink-50'
      }`}
    >
      <Icon size={16} className="mb-1" />
      <div className="text-sm font-medium">{title}</div>
      <div className={`text-[11px] ${active ? 'text-white/70' : 'text-ink-400'}`}>{desc}</div>
    </button>
  );
}

/* ------------------------------------------------------------------ */

export function CommitteeHistory() {
  const { user, attendance } = useStore();
  const classId = user?.classId ?? CLASSES[0].id;
  const cls = CLASSES.find((c) => c.id === classId)!;
  const rec = attendance.find((r) => r.classId === classId);

  const rows = useMemo(() => {
    const out = [
      { date: TODAY, expected: rec?.expected ?? cls.size, actual: rec?.actual ?? cls.size, leave: rec?.leaveCount ?? 0, late: rec?.lateUploaded ?? false },
      { date: '2026-10-26', expected: cls.size, actual: cls.size - 2, leave: 2, late: false },
      { date: '2026-10-25', expected: cls.size, actual: cls.size - 1, leave: 1, late: false },
      { date: '2026-10-22', expected: cls.size, actual: cls.size, leave: 0, late: false },
      { date: '2026-10-21', expected: cls.size, actual: cls.size - 3, leave: 3, late: true },
      { date: '2026-10-20', expected: cls.size, actual: cls.size - 1, leave: 1, late: false },
      { date: '2026-10-19', expected: cls.size, actual: cls.size - 2, leave: 2, late: false },
    ];
    return out;
  }, [cls.size, rec]);

  const totalLeave = rows.reduce((s, r) => s + r.leave, 0);
  const avgRate = (
    (rows.reduce((s, r) => s + r.actual / r.expected, 0) / rows.length) *
    100
  ).toFixed(1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="历史记录"
        subtitle={`${cls.name} · ${WEEK_RANGE} · 本学期上报历史`}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="累计上报" value={rows.length} hint="近 7 个晚自习" />
        <StatCard label="补传次数" value={rows.filter((r) => r.late).length} tone="warning" hint="请尽量按时上报" />
        <StatCard label="平均出勤率" value={`${avgRate}%`} tone="success" />
        <StatCard label="累计请假" value={totalLeave} tone="brand" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-ink-100 px-5 py-4 text-sm font-semibold text-ink-800">
          <History size={16} /> 上报记录
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase text-ink-400">
                <th className="px-5 py-3 font-medium">日期</th>
                <th className="px-5 py-3 font-medium">应到</th>
                <th className="px-5 py-3 font-medium">实到</th>
                <th className="px-5 py-3 font-medium">请假</th>
                <th className="px-5 py-3 font-medium">出勤率</th>
                <th className="px-5 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.date} className="border-b border-ink-50 transition-colors hover:bg-ink-50">
                  <td className="px-5 py-3">
                    <div className="font-medium text-ink-800">{h.date}</div>
                    <div className="text-xs text-ink-400">{weekdayOf(h.date)}</div>
                  </td>
                  <td className="px-5 py-3 text-ink-600">{h.expected}</td>
                  <td className="px-5 py-3 text-ink-600">{h.actual}</td>
                  <td className="px-5 py-3 text-ink-600">{h.leave}</td>
                  <td className="px-5 py-3 text-ink-600">
                    {((h.actual / h.expected) * 100).toFixed(1)}%
                  </td>
                  <td className="px-5 py-3">
                    {h.late ? <Badge tone="warning">补传</Badge> : <Badge tone="success">已上报</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
          <Users size={16} /> 出勤率趋势
        </div>
        <div className="mt-6 flex h-44 items-end justify-between gap-2">
          {rows
            .slice()
            .reverse()
            .map((r) => {
              const rate = (r.actual / r.expected) * 100;
              return (
                <div key={r.date} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-[11px] font-medium text-ink-500">{rate.toFixed(0)}%</span>
                  <div className="flex w-full items-end justify-center">
                    <div
                      className="w-full max-w-[36px] rounded-t-lg bg-gradient-to-t from-ink-800 to-ink-500 transition-all"
                      style={{ height: `${Math.max(8, rate * 1.4)}px` }}
                    />
                  </div>
                  <span className="text-[11px] text-ink-400">{r.date.slice(5)}</span>
                </div>
              );
            })}
        </div>
      </Card>
    </div>
  );
}
