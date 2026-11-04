"""排班纯函数单测：与前端 src/lib/roster.test.mjs 覆盖同一批规则。"""

from app.services.roster import (
    apply_swap_to_roster,
    conflicts_with_pending,
    get_swap_weeks,
    validate_swap,
)

THU_THIS = ("本周", "星期四", "查班")
WED_NEXT = ("下周", "星期三", "查班")
MON_PHONE = ("本周", "星期一", "查手机")

ROSTER = {
    THU_THIS: ["a", "b", "c"],
    WED_NEXT: ["d", "e", "f"],
    MON_PHONE: ["g", "h"],
}


def selection(**kwargs) -> dict:
    base = {
        "week": "本周", "targetWeek": "本周",
        "fromWeekday": "星期四", "fromType": "查班",
        "toWeekday": "星期三", "toType": "查班",
        "staffId": "a", "targetStaffId": "b",
    }
    base.update(kwargs)
    return base


def test_get_swap_weeks_defaults_to_source_week():
    assert get_swap_weeks({"week": "下周"}) == ("下周", "下周")
    assert get_swap_weeks({"week": "本周", "targetWeek": "下周"}) == ("本周", "下周")


def test_cross_week_selection_is_valid():
    swap = selection(targetWeek="下周", fromWeekday="星期四", toWeekday="星期三",
                     staffId="a", targetStaffId="d")
    assert validate_swap(ROSTER, swap) is None


def test_source_weekday_is_resolved_in_source_week_only():
    # 星期四只存在于本周；放到下周查应该找不到排班
    swap = selection(targetWeek="下周", fromWeekday="星期四", toWeekday="星期三",
                     staffId="a", targetStaffId="d")
    swapped = {THU_THIS: ROSTER[THU_THIS], WED_NEXT: ROSTER[WED_NEXT], MON_PHONE: ROSTER[MON_PHONE]}
    swapped.pop(THU_THIS)
    assert validate_swap(swapped, swap) == "来源或目标排班不存在，请重新选择"


def test_same_person_rejected():
    assert validate_swap(ROSTER, selection(staffId="a", targetStaffId="a")) == "请选择不同的有效值班人员"


def test_same_slot_rejected():
    swap = selection(targetWeek="本周", toWeekday="星期四", toType="查班", staffId="a",
                     targetStaffId="b")
    assert validate_swap(ROSTER, swap) == "来源班次与目标班次不能相同"


def test_duplicate_after_exchange_rejected():
    # a 同时在星期四查班与星期一查手机，把这两班互换会导致重复
    swap = selection(targetWeek="本周", fromWeekday="星期四", fromType="查班",
                     toWeekday="星期一", toType="查手机", staffId="a", targetStaffId="g")
    roster = dict(ROSTER)
    roster[MON_PHONE] = ["g", "a"]
    assert validate_swap(roster, swap) == "交换后会在同一班次重复安排人员，请重新选择"


def test_missing_staff_rejected():
    swap = selection(fromWeekday="星期四", fromType="查班", targetWeek="本周",
                     toWeekday="星期一", toType="查手机", staffId="a", targetStaffId="zz")
    assert validate_swap(ROSTER, swap) == "排班已变化，所选人员不在对应班次，请重新申请"


def test_apply_exchanges_both_sides_and_keeps_order():
    swap = selection(targetWeek="下周", toWeekday="星期三", staffId="a", targetStaffId="d")
    new, error = apply_swap_to_roster(ROSTER, swap)
    assert error is None
    assert new[THU_THIS] == ["d", "b", "c"]
    assert new[WED_NEXT] == ["a", "e", "f"]
    # 入参不被改写
    assert ROSTER[THU_THIS] == ["a", "b", "c"]


def test_apply_refuses_invalid_selection():
    swap = selection(staffId="a", targetStaffId="a")
    new, error = apply_swap_to_roster(ROSTER, swap)
    assert new is None
    assert error == "请选择不同的有效值班人员"


def test_pending_conflict_detection():
    pending = selection(targetWeek="下周", toWeekday="星期三", staffId="a", targetStaffId="d")
    same_target = selection(targetWeek="下周", toWeekday="星期三", staffId="b",
                            targetStaffId="d")
    different = selection(targetWeek="下周", toWeekday="星期三", staffId="c",
                          targetStaffId="e")
    assert conflicts_with_pending([pending], same_target) is True
    assert conflicts_with_pending([pending], different) is False
