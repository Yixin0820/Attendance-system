"""考勤相关的领域计算：应到人数取值、出勤、深夜/补传判定。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.constants import UPLOAD_DEADLINE, now_str
from app.models.entities import AttendanceRecord, ExpectedChange


def effective_expected(db: Session, class_row) -> int:
    """当前应到人数。

    等于班级基础人数，学委提交过变更则取最后一次变更后的值
    （持续生效直到下次修改），不受日期影响。
    """
    change = db.scalar(
        select(ExpectedChange)
        .where(ExpectedChange.class_id == class_row.id)
        .order_by(ExpectedChange.created_at.desc(), ExpectedChange.id.desc()))
    return change.to_count if change else class_row.size


def is_late(now_text: str) -> bool:
    """超过 20:59 上传算补传。"""
    try:
        uploaded = datetime.strptime(now_text[-5:], "%H:%M")
        deadline = datetime.strptime(UPLOAD_DEADLINE, "%H:%M")
    except (ValueError, TypeError):
        return False
    return uploaded > deadline


def get_or_create(db: Session, class_row, date: str, classroom: str) -> AttendanceRecord:
    row = db.scalar(select(AttendanceRecord).where(
        AttendanceRecord.class_id == class_row.id, AttendanceRecord.date == date))
    if row is None:
        row = AttendanceRecord(
            id=f"ar{class_row.id}{date.replace('-', '')}",
            class_id=class_row.id, class_name=class_row.name, classroom=classroom,
            date=date, expected=effective_expected(db, class_row),
            actual=class_row.size, leave_count=0, uploaded_at=now_str(),
        )
        db.add(row)
        db.flush()
    return row


def eager_record(db: Session, record_id: str) -> AttendanceRecord | None:
    return db.scalars(
        select(AttendanceRecord)
        .options(
            joinedload(AttendanceRecord.leaves),
            joinedload(AttendanceRecord.phone_violations))
        .where(AttendanceRecord.id == record_id)).unique().first()
