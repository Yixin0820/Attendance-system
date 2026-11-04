"""排班（调班）纯函数。

从前端 src/lib/roster.ts 一比一移植，保证前后端校验规则完全一致。
这里只处理"周次 × 星期 × 岗位 → 人员列表"的字典，不碰 ORM，
因此可以直接单元测试，也不依赖数据库。

roster 的键是 `(周次, 星期, 岗位)`，值是人员 id 列表。
"""

from __future__ import annotations

from typing import Iterable, TypedDict

from app.core.constants import ALL_WEEKS


class SwapSelection(TypedDict, total=False):
    week: str
    targetWeek: str
    fromWeekday: str
    fromType: str
    toWeekday: str
    toType: str
    staffId: str
    targetStaffId: str


def normalize_selection(swap: SwapSelection) -> dict[str, str]:
    """把前端驼峰字段映射成一致的字典，同时兼容缺失字段。"""
    return {
        "week": swap.get("week") or "本周",
        "targetWeek": swap.get("targetWeek") or "下周",
        "fromWeekday": swap.get("fromWeekday") or "",
        "fromType": swap.get("fromType") or "",
        "toWeekday": swap.get("toWeekday") or "",
        "toType": swap.get("toType") or "",
        "staffId": swap.get("staffId") or "",
        "targetStaffId": swap.get("targetStaffId") or "",
    }


Roster = dict[tuple[str, str, str], list[str]]


def get_swap_weeks(swap: SwapSelection) -> tuple[str, str]:
    """来源周与目标周。目标周缺省时与来源周相同（兼容旧申请）。"""
    week = swap.get("week") or "本周"
    return week, swap.get("targetWeek") or week


def _is_week(week: str | None) -> bool:
    return week in ALL_WEEKS


def validate_swap(roster: Roster, selection: SwapSelection) -> str | None:
    """校验调班是否可行。返回 None 表示通过，否则返回可直接展示的错误文案。"""
    swap = normalize_selection(selection)
    if not _is_week(swap["week"]) or not _is_week(swap["targetWeek"]):
        return "请选择有效的来源周和目标周"
    if not swap["staffId"] or not swap["targetStaffId"] or swap["staffId"] == swap["targetStaffId"]:
        return "请选择不同的有效值班人员"

    week, target_week = swap["week"], swap["targetWeek"]
    if week == target_week and swap["fromWeekday"] == swap["toWeekday"] and swap["fromType"] == swap["toType"]:
        return "来源班次与目标班次不能相同"

    from_key = (week, swap["fromWeekday"], swap["fromType"])
    to_key = (target_week, swap["toWeekday"], swap["toType"])
    if from_key not in roster or to_key not in roster:
        return "来源或目标排班不存在，请重新选择"

    source = roster[from_key]
    target = roster[to_key]
    for members in (source, target):
        if any(not m for m in members) or len(set(members)) != len(members):
            return "班次存在无效或重复人员，请先修正排班"

    if swap["staffId"] not in source or swap["targetStaffId"] not in target:
        return "排班已变化，所选人员不在对应班次，请重新申请"
    if swap["targetStaffId"] in source or swap["staffId"] in target:
        return "交换后会在同一班次重复安排人员，请重新选择"
    return None


def apply_swap_to_roster(roster: Roster, selection: SwapSelection) -> tuple[Roster | None, str | None]:
    """双向互换来源与目标班次中的两人。

    返回 `(新排班, None)` 或 `(None, 错误文案)`；不修改入参。
    """
    error = validate_swap(roster, selection)
    if error:
        return None, error

    swap = normalize_selection(selection)
    week, target_week = swap["week"], swap["targetWeek"]
    new_roster = {key: list(ids) for key, ids in roster.items()}
    new_roster[(week, swap["fromWeekday"], swap["fromType"])] = [
        swap["targetStaffId"] if sid == swap["staffId"] else sid for sid in roster[(week, swap["fromWeekday"], swap["fromType"])]
    ]
    new_roster[(target_week, swap["toWeekday"], swap["toType"])] = [
        swap["staffId"] if sid == swap["targetStaffId"] else sid
        for sid in roster[(target_week, swap["toWeekday"], swap["toType"])]
    ]
    return new_roster, None


def assignments(selection: SwapSelection) -> list[tuple[str, str, str, str]]:
    """调班占用的两条排班：(周, 星期, 岗位, 人员id)。"""
    week, target_week = get_swap_weeks(selection)
    return [
        (week, selection.get("fromWeekday", ""), selection.get("fromType", ""), selection.get("staffId", "")),
        (target_week, selection.get("toWeekday", ""), selection.get("toType", ""), selection.get("targetStaffId", "")),
    ]


def conflicts_with_pending(pending: Iterable[SwapSelection], selection: SwapSelection) -> bool:
    """与已存在的待回应申请是否冲突（同一人同一班次）。"""
    selected = assignments(selection)
    for existing in pending:
        for a in assignments(existing):
            if a in selected:
                return True
    return False


def build_swap_notice(
    selection: SwapSelection,
    staff_name: str,
    target_staff_name: str,
    agree: bool,
    note: str,
) -> dict[str, str]:
    """生成发给发起人的结果通知（同意与拒绝都会生成）。"""
    week, target_week = get_swap_weeks(selection)
    source = f"{week}{selection.get('fromWeekday')}（{selection.get('fromType')}）"
    target = f"{target_week}{selection.get('toWeekday')}（{selection.get('toType')}）"
    if agree:
        detail = (
            f"{target_staff_name} 同意调班申请：你改为{target}值班，"
            f"{target_staff_name}改为{source}值班，双方排班已互换。"
        )
    else:
        detail = f"{target_staff_name} 无法替班：{source} → {target}，排班表保持不变。"
    return {
        "title": "调班申请已通过" if agree else "调班申请被婉拒",
        "detail": detail,
        "result": "approved" if agree else "rejected",
        "note": note,
    }
