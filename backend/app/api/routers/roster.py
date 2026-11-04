"""排班查询。规则修改集中在 services/roster.py。"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_account, get_db
from app.core.constants import STUDY_WEEKDAYS
from app.models.entities import Shift
from app.schemas.roster import RosterOut, ShiftOut

router = APIRouter(prefix="/api/roster", tags=["排班"])


def _to_out(shift: Shift) -> ShiftOut:
    return ShiftOut(
        id=shift.id, week=shift.week, weekday=shift.weekday, type=shift.type,
        staff_ids=[m.staff_id for m in sorted(shift.members, key=lambda m: m.position)],
    )


@router.get("", response_model=RosterOut, summary="本周与下周排班")
def get_roster(
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> RosterOut:
    shifts = db.scalars(select(Shift).order_by(Shift.week, Shift.weekday, Shift.type)).all()
    current = [_to_out(s) for s in shifts if s.week == "本周"]
    nxt = [_to_out(s) for s in shifts if s.week == "下周"]
    return RosterOut(current=current, next=nxt)


@router.get("/weekdays", summary="有晚自习的星期")
def study_weekdays(account=Depends(get_current_account)) -> list[str]:
    return list(STUDY_WEEKDAYS)


@router.get("/slots", response_model=list[ShiftOut], summary="某干事在某周的全部班次")
def staff_slots(
    staff_id: str = Query(..., alias="staffId"),
    week: str = Query(default="本周"),
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[ShiftOut]:
    shifts = db.scalars(
        select(Shift).where(Shift.week == week).order_by(Shift.weekday, Shift.type)).all()
    return [_to_out(s) for s in shifts if any(m.staff_id == staff_id for m in s.members)]


@router.get("/candidates", response_model=list[ShiftOut], summary="目标周班次（供调班选择值班人员）")
def target_candidates(
    week: str = Query(default="下周"),
    weekday: str | None = Query(default=None),
    shift_type: str | None = Query(default=None, alias="shiftType"),
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[ShiftOut]:
    query = select(Shift).where(Shift.week == week)
    if weekday:
        query = query.where(Shift.weekday == weekday)
    if shift_type:
        query = query.where(Shift.type == shift_type)
    return [_to_out(s) for s in db.scalars(query.order_by(Shift.weekday, Shift.type)).all()]
