"""考勤排次纯函数单测：与前端 src/lib/verify-round.test.mjs 覆盖同一批规则。"""

from app.core.constants import DEFAULT_VERIFY_ANCHOR_DATE
from app.services.verify_round import (
    is_study_night,
    upcoming_rounds,
    verify_round_of,
)

ANCHOR = DEFAULT_VERIFY_ANCHOR_DATE  # 2026-11-01，星期日


def test_anchor_day_is_round_one():
    assert verify_round_of(ANCHOR, ANCHOR) == 1


def test_only_nights_with_study_get_a_round():
    assert is_study_night("2026-11-01") is True     # 星期日
    assert is_study_night("2026-11-06") is False    # 星期五
    assert is_study_night("2026-11-07") is False    # 星期六
    assert verify_round_of("2026-11-06", ANCHOR) == 0
    assert verify_round_of("2026-11-07", ANCHOR) == 0


def test_rounds_advance_over_study_nights_only():
    assert verify_round_of("2026-11-02", ANCHOR) == 2
    assert verify_round_of("2026-11-03", ANCHOR) == 3
    assert verify_round_of("2026-11-04", ANCHOR) == 4
    assert verify_round_of("2026-11-05", ANCHOR) == 5
    assert verify_round_of("2026-11-08", ANCHOR) == 6
    assert verify_round_of("2026-11-09", ANCHOR) == 7
    assert verify_round_of("2026-11-10", ANCHOR) == 1


def test_wraps_after_round_seven():
    seq = [r["seq"] for r in upcoming_rounds(20, ANCHOR, ANCHOR)]
    assert seq[:14] == [1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6, 7]
    assert all(1 <= s <= 7 for s in seq)


def test_rounds_before_anchor_count_backwards():
    assert verify_round_of("2026-10-29", ANCHOR) == 7
    assert verify_round_of("2026-10-28", ANCHOR) == 6


def test_upcoming_only_returns_study_nights_in_order():
    rows = upcoming_rounds(7, ANCHOR, ANCHOR)
    assert len(rows) == 7
    assert all(is_study_night(r["date"]) for r in rows)
    assert [r["date"] for r in rows] == sorted(r["date"] for r in rows)


def test_invalid_input_is_safe():
    assert verify_round_of("not-a-date", ANCHOR) == 0
    assert verify_round_of(ANCHOR, "bad-anchor") == 0
    assert upcoming_rounds(3, "2026/11/01", ANCHOR) == []
