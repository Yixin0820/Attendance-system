"""基础数据：班级、教室、干事、假条核查分组、假条类别。

教室按日期计算：每周二自动化 1、2 班由 303 调整到 305，其余日期走默认教室。
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_account, get_db, require_roles
from app.core.config import settings
from app.core.constants import (
    DEFAULT_LEAVE_REASONS,
    DEFAULT_VERIFY_ANCHOR_DATE,
    STUDY_WEEKDAYS,
    UPLOAD_DEADLINE,
    today_str,
    weekday_of,
)
from app.models.entities import (
    ClassGroup,
    ClassroomRule,
    LeaveReason,
    Room,
    Staff,
    VerifyGroup,
    VerifyGroupMember,
)
from app.schemas.base import CamelModel
from app.schemas.meta import (
    BootstrapOut,
    ClassOut,
    LeaveReasonOut,
    RoomOut,
    StaffOut,
    VerifyGroupOut,
    VerifyRoundOut,
)
from app.services.settings import get_setting
from app.services.verify_round import (
    SETTING_KEY as ANCHOR_KEY,
    upcoming_rounds,
    verify_round_of,
)

router = APIRouter(prefix="/api/meta", tags=["基础数据"])

COLLEGE = "信息工程学院"
SCHOOL = "明德理工学院"
VERSION = "v1.2.0-backend"


# ------------------------------------------------------------------ #
# 教室计算
# ------------------------------------------------------------------ #
def classroom_for_class(db: Session, class_id: str, date: str) -> str:
    """某班某天的实际晚自习教室（含按星期的例外规则）。"""
    cls = db.get(ClassGroup, class_id)
    if cls is None:
        return ""
    weekday = weekday_of(date)
    rule = db.scalar(
        select(ClassroomRule).where(
            ClassroomRule.weekday == weekday, ClassroomRule.class_id == class_id))
    if rule:
        room = db.get(Room, rule.room_id)
        if room:
            return room.name
    return cls.base_room.name if cls.base_room else ""


def rooms_for_date(db: Session, date: str) -> list[dict]:
    """某一天的教室安排：按教室顺序分组，并标注学习部常用教室。"""
    weekday = weekday_of(date)
    rooms = db.scalars(select(Room).order_by(Room.sort_order)).all()
    rules = db.scalars(select(ClassroomRule).where(ClassroomRule.weekday == weekday)).all()
    override = {r.class_id: r.room_id for r in rules}

    grouped: dict[str, list[str]] = {r.id: [] for r in rooms}
    for cls in db.scalars(select(ClassGroup)).all():
        room_id = override.get(cls.id, cls.base_room_id)
        if room_id in grouped:
            grouped[room_id].append(cls.id)

    result: list[dict] = []
    for room in rooms:
        class_ids = grouped.get(room.id, [])
        note = room.note or (None if class_ids else "学习部常用教室")
        result.append({
            "id": room.id,
            "name": room.name,
            "classIds": class_ids,
            "college": room.college,
            "weeks": room.weeks,
            "note": note,
        })
    return result


# ------------------------------------------------------------------ #
# 路由
# ------------------------------------------------------------------ #
class VersionOut(CamelModel):
    version: str
    today: str
    upload_deadline: str


@router.get("/version", response_model=VersionOut, summary="系统版本与今日")
def version(account=Depends(get_current_account)) -> VersionOut:
    return VersionOut(version=VERSION, today=today_str(), upload_deadline=UPLOAD_DEADLINE)


@router.get("/bootstrap", response_model=BootstrapOut, summary="基础数据快照")
def bootstrap(
    class_id: str | None = Query(default=None, alias="classId"),
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> BootstrapOut:
    date = today_str()
    classes: list[ClassOut] = []
    for c in db.scalars(select(ClassGroup).order_by(ClassGroup.id)).all():
        classes.append(ClassOut(
            id=c.id, name=c.name, major=c.major, classroom=classroom_for_class(db, c.id, date),
            college=c.college, weeks=c.weeks, committee_name=c.committee_name, size=c.size,
        ))

    rooms = [RoomOut.model_validate(r) for r in rooms_for_date(db, date)]
    staff = [StaffOut.model_validate(s) for s in db.scalars(select(Staff).order_by(Staff.id)).all()]

    groups: list[VerifyGroupOut] = []
    for g in db.scalars(select(VerifyGroup).order_by(VerifyGroup.seq)).all():
        member_ids = [m.staff_id for m in g.members]
        groups.append(VerifyGroupOut(id=g.id, seq=g.seq, leader_id=g.leader_id, member_ids=member_ids))

    # 假条类别：系统内置 + 本班自定义（学委未传班级时只给内置）
    reasons = list(DEFAULT_LEAVE_REASONS)
    if class_id:
        customs = db.scalars(
            select(LeaveReason)
            .where(LeaveReason.class_id == class_id)
            .order_by(LeaveReason.sort_order)).all()
        reasons += [r.name for r in customs if r.name not in reasons]

    anchor = get_setting(db, ANCHOR_KEY, DEFAULT_VERIFY_ANCHOR_DATE) or DEFAULT_VERIFY_ANCHOR_DATE

    return BootstrapOut(
        version=VERSION, school=SCHOOL, college=COLLEGE, today=date,
        upload_deadline=UPLOAD_DEADLINE, study_weekdays=list(STUDY_WEEKDAYS),
        classes=classes, rooms=rooms, staff=staff, verify_groups=groups,
        leave_reasons=[LeaveReasonOut(id=f"r{n}", name=n) for n in reasons],
        verify_anchor_date=anchor, verify_round_today=verify_round_of(date, anchor),
    )


@router.get("/classes", response_model=list[ClassOut], summary="班级列表")
def list_classes(
    date: str | None = Query(default=None),
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[ClassOut]:
    date = date or today_str()
    return [
        ClassOut(
            id=c.id, name=c.name, major=c.major, classroom=classroom_for_class(db, c.id, date),
            college=c.college, weeks=c.weeks, committee_name=c.committee_name, size=c.size,
        )
        for c in db.scalars(select(ClassGroup).order_by(ClassGroup.id)).all()
    ]


@router.get("/rooms", response_model=list[RoomOut], summary="某天的教室安排")
def list_rooms(
    date: str | None = Query(default=None),
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[RoomOut]:
    return [RoomOut.model_validate(r) for r in rooms_for_date(db, date or today_str())]


@router.get("/staff", response_model=list[StaffOut], summary="学习部干事")
def list_staff(
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[StaffOut]:
    return [StaffOut.model_validate(s) for s in db.scalars(select(Staff).order_by(Staff.id)).all()]


@router.get("/verify-groups", response_model=list[VerifyGroupOut], summary="假条核查七轮分组")
def list_verify_groups(
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[VerifyGroupOut]:
    result = []
    for g in db.scalars(select(VerifyGroup).order_by(VerifyGroup.seq)).all():
        result.append(VerifyGroupOut(
            id=g.id, seq=g.seq, leader_id=g.leader_id,
            member_ids=[m.staff_id for m in g.members],
        ))
    return result


@router.get("/verify-schedule", response_model=list[VerifyRoundOut],
            summary="考勤排次（按「第一次」锚点依次续排）")
def verify_schedule(
    count: int = Query(default=7, ge=1, le=60),
    date: str | None = Query(default=None),
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[VerifyRoundOut]:
    anchor = get_setting(db, ANCHOR_KEY, DEFAULT_VERIFY_ANCHOR_DATE) or DEFAULT_VERIFY_ANCHOR_DATE
    start = date or today_str()
    groups = {g.seq: g.id for g in db.scalars(select(VerifyGroup)).all()}
    return [VerifyRoundOut(
        date=row["date"], seq=row["seq"], weekday=weekday_of(row["date"]),
        group_id=groups.get(row["seq"]),
    ) for row in upcoming_rounds(count, start, anchor)]


@router.get("/leave-reasons", response_model=list[LeaveReasonOut], summary="假条类别")
def list_leave_reasons(
    class_id: str | None = Query(default=None, alias="classId"),
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[LeaveReasonOut]:
    names = list(DEFAULT_LEAVE_REASONS)
    if class_id:
        for r in db.scalars(
            select(LeaveReason).where(LeaveReason.class_id == class_id)
            .order_by(LeaveReason.sort_order)).all():
            if r.name not in names:
                names.append(r.name)
    return [LeaveReasonOut(id=f"r{i}", name=n) for i, n in enumerate(names)]


class LeaveReasonIn(CamelModel):
    name: str


@router.post("/leave-reasons", response_model=list[LeaveReasonOut], summary="新增自定义假条类别")
def add_leave_reason(
    payload: LeaveReasonIn,
    class_id: str = Query(..., alias="classId"),
    account=Depends(require_roles("committee")),
    db: Session = Depends(get_db),
) -> list[LeaveReasonOut]:
    if not class_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="缺少班级")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="类别名称不能为空")
    exists = db.scalar(
        select(LeaveReason).where(LeaveReason.class_id == class_id, LeaveReason.name == name))
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该类别已存在")
    sort_seed = sum(1 for _ in db.scalars(
        select(LeaveReason).where(LeaveReason.class_id == class_id)).all())
    db.add(LeaveReason(id=f"lr{class_id}{sort_seed}", class_id=class_id, name=name,
                       sort_order=sort_seed))
    db.commit()
    return list_leave_reasons(class_id, account, db)


@router.delete("/leave-reasons/{name}", response_model=list[LeaveReasonOut], summary="删除自定义假条类别")
def remove_leave_reason(
    name: str,
    class_id: str = Query(..., alias="classId"),
    account=Depends(require_roles("committee")),
    db: Session = Depends(get_db),
) -> list[LeaveReasonOut]:
    row = db.scalar(
        select(LeaveReason).where(LeaveReason.class_id == class_id, LeaveReason.name == name))
    if row:
        db.delete(row)
        db.commit()
    return list_leave_reasons(class_id, account, db)
