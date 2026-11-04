import { useState } from 'react';
import { TODAY } from '../data';
import { useStore } from '../store';
import { Badge, EmptyState } from './ui';

export function ExpectedChanges({
  classId,
  management = false,
  unreadOnly = false,
}: {
  classId?: string;
  management?: boolean;
  unreadOnly?: boolean;
}) {
  const { expectedChanges, acknowledgeExpectedChange, toast } = useStore();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const changes = expectedChanges
    .filter((change) => (management || change.date === TODAY) &&
      (!classId || change.classId === classId) && (!unreadOnly || !change.acknowledged))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!changes.length) {
    return management ? <EmptyState text={unreadOnly ? '暂无待阅人数变更' : '暂无应到人数变更记录'} /> : null;
  }

  async function acknowledge(id: string) {
    if (pendingId !== null) return;
    setPendingId(id);
    try {
      await acknowledgeExpectedChange(id);
      toast('已确认已阅；不涉及审批或人数修改', 'success');
    } catch {
      toast('确认已阅失败，请重试', 'danger');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section aria-label={management ? '应到人数变更与已阅记录' : '今日应到人数变更原因'} className="space-y-2">
      <div className="text-xs font-medium text-ink-600">
        {management ? '人数变更记录 · 仅确认已阅，不审批或回退人数' : '今日应到人数变更原因'}
      </div>
      {changes.map((change) => (
        <div key={change.id} className="rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-800">
              {change.className} · {change.from} → {change.to} 人
            </span>
            {management && <Badge tone={change.acknowledged ? 'success' : 'warning'}>{change.acknowledged ? '已阅' : '待阅'}</Badge>}
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-xs text-amber-800">变更原因：{change.reason}</p>
          <p className="mt-1 text-[11px] text-ink-400">生效日期 {change.date} · {change.by} · {change.createdAt}</p>
          {management && !change.acknowledged && (
            <button
              className="btn-secondary mt-2 text-xs"
              disabled={pendingId !== null}
              onClick={() => void acknowledge(change.id)}
            >
              {pendingId === change.id ? '正在确认…' : '确认已阅'}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
