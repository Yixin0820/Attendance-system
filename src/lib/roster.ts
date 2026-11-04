import type { Account, Shift, Staff, SwapNotice, SwapRequest } from '../types';

export type RosterWeek = '本周' | '下周';
export type Roster = Record<RosterWeek, Shift[]>;
export type SwapInput = Omit<SwapRequest, 'id' | 'status' | 'createdAt'>;
type SwapActor = Pick<Account, 'role' | 'enabled' | 'staffId'> | null;
type SwapStaff = Pick<Staff, 'id' | 'name'>;
type SwapSelection = Pick<SwapRequest,
  'week' | 'targetWeek' | 'fromWeekday' | 'fromType' | 'toWeekday' | 'toType' | 'staffId' | 'targetStaffId'>;

export interface RosterState {
  roster: Roster;
  swaps: SwapRequest[];
  notices: SwapNotice[];
}

type Failure = { ok: false; error: string };
export type RosterResult = { ok: true; state: RosterState } | Failure;

export function getSwapWeeks(swap: Pick<SwapRequest, 'week' | 'targetWeek'>) {
  const week = swap.week ?? '本周';
  return { week, targetWeek: swap.targetWeek ?? week };
}

function isWeek(week: RosterWeek | undefined): boolean {
  return week === undefined || week === '本周' || week === '下周';
}

/** 提交和同意时复用同一套排班校验，不修改输入。 */
export function validateSwap(roster: Roster, swap: SwapSelection): string | null {
  if (!isWeek(swap.week) || !isWeek(swap.targetWeek)) return '请选择有效的来源周和目标周';
  if (!swap.staffId || !swap.targetStaffId || swap.staffId === swap.targetStaffId) {
    return '请选择不同的有效值班人员';
  }
  const { week, targetWeek } = getSwapWeeks(swap);
  if (week === targetWeek && swap.fromWeekday === swap.toWeekday && swap.fromType === swap.toType) {
    return '来源班次与目标班次不能相同';
  }
  const fromMatches = roster[week].filter((s) => s.weekday === swap.fromWeekday && s.type === swap.fromType);
  const toMatches = roster[targetWeek].filter((s) => s.weekday === swap.toWeekday && s.type === swap.toType);
  if (fromMatches.length !== 1 || toMatches.length !== 1) {
    return '来源或目标排班不存在或重复，请重新选择';
  }
  const from = fromMatches[0];
  const to = toMatches[0];
  if ([from, to].some((s) => s.staffIds.some((id) => !id) || new Set(s.staffIds).size !== s.staffIds.length)) {
    return '班次存在无效或重复人员，请先修正排班';
  }
  if (!from.staffIds.includes(swap.staffId) || !to.staffIds.includes(swap.targetStaffId)) {
    return '排班已变化，所选人员不在对应班次，请重新申请';
  }
  if (from.staffIds.includes(swap.targetStaffId) || to.staffIds.includes(swap.staffId)) {
    return '交换后会在同一班次重复安排人员，请重新选择';
  }
  return null;
}

export function applySwapToRoster(roster: Roster, swap: SwapSelection): { ok: true; roster: Roster } | Failure {
  const error = validateSwap(roster, swap);
  if (error) return { ok: false, error };
  const { week, targetWeek } = getSwapWeeks(swap);
  const exchange = (currentWeek: RosterWeek) => roster[currentWeek].map((shift) => {
    if (currentWeek === week && shift.weekday === swap.fromWeekday && shift.type === swap.fromType) {
      return { ...shift, staffIds: shift.staffIds.map((id) => id === swap.staffId ? swap.targetStaffId : id) };
    }
    if (currentWeek === targetWeek && shift.weekday === swap.toWeekday && shift.type === swap.toType) {
      return { ...shift, staffIds: shift.staffIds.map((id) => id === swap.targetStaffId ? swap.staffId : id) };
    }
    return shift;
  });
  return {
    ok: true,
    roster: {
      本周: week === '本周' || targetWeek === '本周' ? exchange('本周') : roster.本周,
      下周: week === '下周' || targetWeek === '下周' ? exchange('下周') : roster.下周,
    },
  };
}

function assignments(swap: SwapSelection) {
  const { week, targetWeek } = getSwapWeeks(swap);
  return [
    [week, swap.fromWeekday, swap.fromType, swap.staffId],
    [targetWeek, swap.toWeekday, swap.toType, swap.targetStaffId],
  ];
}

function canAct(actor: SwapActor, staffId: string): boolean {
  return !!actor?.enabled && actor.role === 'inspector' && !!staffId && actor.staffId === staffId;
}

export function createSwapRequest(
  state: RosterState,
  input: SwapInput,
  actor: SwapActor,
  staff: readonly SwapStaff[],
  metadata: { id: string; createdAt: string },
): RosterResult {
  if (!canAct(actor, input.staffId)) return { ok: false, error: '只能使用本人干事账号发起调班申请' };
  const initiator = staff.find((s) => s.id === input.staffId);
  const target = staff.find((s) => s.id === input.targetStaffId);
  if (!initiator || !target || initiator.name !== input.staffName || target.name !== input.targetStaffName) {
    return { ok: false, error: '值班人员信息不匹配，请重新选择' };
  }
  if (!input.reason.trim()) return { ok: false, error: '请填写调班原因' };
  const error = validateSwap(state.roster, input);
  if (error) return { ok: false, error };
  const selected = assignments(input);
  const occupied = state.swaps.some((swap) => swap.status === 'pending' &&
    assignments(swap).some((a) => selected.some((b) => a.every((value, i) => value === b[i]))));
  if (occupied) return { ok: false, error: '该人员班次已有待回应调班申请，请勿重复或冲突申请' };
  const { week, targetWeek } = getSwapWeeks(input);
  const swap: SwapRequest = {
    id: metadata.id,
    createdAt: metadata.createdAt,
    status: 'pending',
    staffId: initiator.id,
    staffName: initiator.name,
    targetStaffId: target.id,
    targetStaffName: target.name,
    week,
    targetWeek,
    fromWeekday: input.fromWeekday,
    fromType: input.fromType,
    toWeekday: input.toWeekday,
    toType: input.toType,
    reason: input.reason.trim(),
  };
  return { ok: true, state: { ...state, swaps: [swap, ...state.swaps] } };
}

/** 拒绝不依赖当前排班；同意必须重新校验并一次返回双向交换、状态和通知。 */
export function respondSwapRequest(
  state: RosterState,
  id: string,
  agree: boolean,
  actor: SwapActor,
  metadata: { noticeId: string; reviewedAt: string; note?: string },
): RosterResult {
  const swap = state.swaps.find((s) => s.id === id);
  if (!swap || swap.status !== 'pending') return { ok: false, error: '申请不存在或已经回应' };
  if (!canAct(actor, swap.targetStaffId)) return { ok: false, error: '仅指定的替班同学可以回应申请' };
  let roster = state.roster;
  if (agree) {
    const result = applySwapToRoster(roster, swap);
    if (!result.ok) return result;
    roster = result.roster;
  }
  const status = agree ? 'approved' : 'rejected';
  const { week, targetWeek } = getSwapWeeks(swap);
  const from = `${week}${swap.fromWeekday}（${swap.fromType}）`;
  const to = `${targetWeek}${swap.toWeekday}（${swap.toType}）`;
  const notice: SwapNotice = {
    id: metadata.noticeId,
    swapId: swap.id,
    toStaffName: swap.staffName,
    title: agree ? '调班申请已通过' : '调班申请被婉拒',
    detail: agree
      ? `${swap.targetStaffName} 同意调班申请：你改为${to}值班，${swap.targetStaffName}改为${from}值班，双方排班已互换。`
      : `${swap.targetStaffName} 无法替班：${from} → ${to}，排班表保持不变。`,
    result: status,
    createdAt: metadata.reviewedAt,
    read: false,
  };
  return {
    ok: true,
    state: {
      roster,
      swaps: state.swaps.map((s) => s.id === id ? {
        ...s,
        status,
        reviewNote: metadata.note ?? (agree ? '同意替班' : '不方便，无法替班'),
        reviewedAt: metadata.reviewedAt,
      } : s),
      notices: [notice, ...state.notices],
    },
  };
}
