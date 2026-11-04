"""排班在 ORM 与纯函数之间的转换层。

`roster.ts` 的纯函数只认 dict，这里负责把 Shift/ShiftMember 表读成 dict，
改动后再安全地写回（只更新受影响的两个班次，避免整表重写）。
"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.entities import Shift, ShiftMember
from app.services.roster import Roster


def load_roster(db: Session, weeks: tuple[str, ...] = ("本周", "下周")) -> Roster:
    """读取指定周次的排班，键为 (周次, 星期, 岗位)。"""
    shifts = db.scalars(select(Shift).where(Shift.week.in_(weeks))).all()
    roster: Roster = {}
    for s in shifts:
        ids = [m.staff_id for m in sorted(s.members, key=lambda m: m.position)]
        roster[(s.week, s.weekday, s.type)] = ids
    return roster


def save_roster(db: Session, old: Roster, new: Roster) -> None:
    """写回差异部分。只对人员列表发生变化的班次做替换。"""
    for key, members in new.items():
        if old.get(key) == members:
            continue
        week, weekday, shift_type = key
        shift = db.scalar(select(Shift).where(
            Shift.week == week, Shift.weekday == weekday, Shift.type == shift_type))
        if shift is None:
            continue
        db.execute(delete(ShiftMember).where(ShiftMember.shift_id == shift.id))
        for position, staff_id in enumerate(members):
            db.add(ShiftMember(shift_id=shift.id, staff_id=staff_id, position=position))
