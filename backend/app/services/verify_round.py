"""考勤排次：按「次」续排（与前端 src/data.ts 同一套规则）。

《查考勤排班表》只给出「第一次～第七次」七套分组，没有日期或星期映射。
规则：以「第一次」所在日期为锚点，之后每遇到一个有晚自习的日子就推进一轮，
第七次之后回到第一次循环；没有晚自习的日子不占轮次。
长假停课后想重新对齐，改锚点日期即可（存在 app_settings 表里）。
"""

from __future__ import annotations

from datetime import date, timedelta

from app.core.constants import (
    DEFAULT_VERIFY_ANCHOR_DATE,
    STUDY_WEEKDAYS,
    WEEKDAYS,
    weekday_of,
)

SETTING_KEY = "verifyAnchorDate"


def _parse(date_str: str) -> date | None:
    try:
        return date.fromisoformat(date_str)
    except (TypeError, ValueError):
        return None


def is_study_night(date_str: str) -> bool:
    return weekday_of(date_str) in STUDY_WEEKDAYS


def _study_nights_between(start: date, end: date) -> int:
    """[start, end) 之间的晚自习天数。"""
    n = 0
    cur = start
    while cur < end:
        if WEEKDAYS[cur.weekday()] in STUDY_WEEKDAYS:
            n += 1
        cur += timedelta(days=1)
    return n


def verify_round_of(date_str: str, anchor: str = DEFAULT_VERIFY_ANCHOR_DATE,
                    group_count: int = 7) -> int:
    """某天的排次序号（1～group_count）。非晚自习日或日期非法返回 0。"""
    if not is_study_night(date_str):
        return 0
    d = _parse(date_str)
    a = _parse(anchor)
    if d is None or a is None or group_count <= 0:
        return 0
    delta = _study_nights_between(a, d) if d >= a else -_study_nights_between(d, a)
    return ((delta % group_count) + group_count) % group_count + 1


def upcoming_rounds(count: int, from_date: str, anchor: str = DEFAULT_VERIFY_ANCHOR_DATE,
                    group_count: int = 7) -> list[dict]:
    """从 from_date（含）起最近 count 个晚自习日的排次。"""
    start = _parse(from_date)
    if start is None:
        return []
    out: list[dict] = []
    cur = start
    while len(out) < count:
        cur_str = cur.isoformat()
        seq = verify_round_of(cur_str, anchor, group_count)
        if seq:
            out.append({"date": cur_str, "seq": seq})
        cur += timedelta(days=1)
    return out
