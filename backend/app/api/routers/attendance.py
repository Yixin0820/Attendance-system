"""考勤上报、假条核查、应到人数变更、玩手机与检讨。"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_account, get_db, require_roles
from app.api.routers.meta import classroom_for_class
from app.core.constants import now_str, stamp_str, today_str
from app.models.entities import (
    Attachment,
    AttendanceRecord,
    ClassGroup,
    ExpectedChange,
    LeaveRecord,
    PhoneViolation,
    ReviewRecord,
    Staff,
)
from app.schemas.attendance import (
    AttendanceIn,
    AttendanceOut,
    CertificateFileOut,
    ExpectedChangeIn,
    ExpectedChangeOut,
    LeaveOut,
    LeaveVerifyIn,
    NumberIssueIn,
    PhoneViolationOut,
    ReviewIn,
    ReviewOut,
    TogglePhoneIn,
)
from app.services.attendance import eager_record, effective_expected, is_late

router = APIRouter(prefix="/api/attendance", tags=["考勤"])


# ------------------------------------------------------------------ #
# 序列化
# ------------------------------------------------------------------ #
def _attachments(db: Session, owner_type: str, owner_id: str) -> list[CertificateFileOut]:
    rows = db.scalars(
        select(Attachment)
        .where(Attachment.owner_type == owner_type, Attachment.owner_id == owner_id)
        .order_by(Attachment.id)).all()
    return [CertificateFileOut(id=r.id, name=r.name, url=f"/api/files/{r.id}") for r in rows]


def _leave_out(db: Session, leave: LeaveRecord) -> LeaveOut:
    return LeaveOut(
        id=leave.id, student_name=leave.student_name, student_id=leave.student_id,
        reason=leave.reason, reason_detail=leave.reason_detail, extra_note=leave.extra_note,
        shared_certificate=leave.shared_certificate, certificate_late=leave.certificate_late,
        certificate_files=_attachments(db, "leave", leave.id),
        checked=leave.checked, has_issue=leave.has_issue,
        issue_description=leave.issue_description, issue_by=leave.issue_by,
    )


def _violations_out(db: Session, record: AttendanceRecord) -> list[PhoneViolationOut]:
    return [
        PhoneViolationOut(
            student_name=v.student_name,
            review_files=_attachments(db, "violation", v.id),
            review_at=v.review_at, review_by=v.review_by,
        )
        for v in sorted(record.phone_violations, key=lambda v: v.student_name)
    ]


def _record_out(db: Session, record: AttendanceRecord) -> AttendanceOut:
    return AttendanceOut(
        id=record.id, class_id=record.class_id, class_name=record.class_name,
        classroom=record.classroom, date=record.date, expected=record.expected,
        actual=record.actual, leave_count=record.leave_count,
        late_uploaded=record.late_uploaded, uploaded_at=record.uploaded_at,
        number_issue=record.number_issue, number_issue_note=record.number_issue_note,
        number_issue_cancelled=record.number_issue_cancelled,
        number_issue_by=record.number_issue_by,
        leaves=[_leave_out(db, l) for l in sorted(record.leaves, key=lambda x: x.sort_order)],
        phone_violations=_violations_out(db, record),
    )


# ------------------------------------------------------------------ #
# 查询
# ------------------------------------------------------------------ #
@router.get("", response_model=list[AttendanceOut], summary="查询考勤记录")
def list_attendance(
    date: str | None = Query(default=None),
    class_id: str | None = Query(default=None, alias="classId"),
    class_name: str | None = Query(default=None),
    start_date: str | None = Query(default=None, alias="startDate"),
    end_date: str | None = Query(default=None, alias="endDate"),
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[AttendanceOut]:
    query = select(AttendanceRecord).options(
        joinedload(AttendanceRecord.leaves),
        joinedload(AttendanceRecord.phone_violations))
    if class_id:
        query = query.where(AttendanceRecord.class_id == class_id)
    if class_name:
        query = query.where(AttendanceRecord.class_name.like(f"%{class_name}%"))
    if date:
        query = query.where(AttendanceRecord.date == date)
    else:
        if start_date:
            query = query.where(AttendanceRecord.date >= start_date)
        if end_date:
            query = query.where(AttendanceRecord.date <= end_date)
    # joinedload 了一条以上的集合关系，必须 unique() 后再取结果
    rows = db.scalars(query.order_by(
        AttendanceRecord.date.desc(), AttendanceRecord.class_id)).unique().all()
    return [_record_out(db, r) for r in rows]


@router.get("/expected", summary="某班当前应到人数")
def read_expected(
    class_id: str = Query(..., alias="classId"),
    date: str | None = Query(default=None),
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> dict:
    cls = db.get(ClassGroup, class_id)
    if cls is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")
    return {
        "classId": class_id,
        "baseSize": cls.size,
        "expected": effective_expected(db, cls),
        "classroom": classroom_for_class(db, class_id, date or today_str()),
    }


# ------------------------------------------------------------------ #
# 学委上报
# ------------------------------------------------------------------ #
@router.post("/submit", response_model=AttendanceOut, summary="上报当日考勤（学委）")
def submit_attendance(
    payload: AttendanceIn,
    account=Depends(require_roles("committee")),
    db: Session = Depends(get_db),
) -> AttendanceOut:
    if account.class_id != payload.class_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能上报本班考勤")

    cls = db.get(ClassGroup, payload.class_id)
    if cls is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")

    record = db.scalar(select(AttendanceRecord).where(
        AttendanceRecord.class_id == payload.class_id,
        AttendanceRecord.date == payload.date))
    uploaded_at = now_str()
    if record is None:
        record = AttendanceRecord(
            id=f"ar{payload.class_id}{payload.date.replace('-', '')}",
            class_id=payload.class_id, class_name=cls.name,
            classroom=classroom_for_class(db, payload.class_id, payload.date),
            date=payload.date, uploaded_at=uploaded_at)
        db.add(record)
        db.flush()

    # 应到人数由服务端判定：以基础人数与学委变更记录为准，不信任前端传入值
    record.expected = effective_expected(db, cls)
    record.actual = payload.actual
    record.uploaded_at = uploaded_at
    record.late_uploaded = is_late(uploaded_at)

    # 覆盖式保存假条：先清理旧记录与旧附件，再写新的
    old_leaves = list(record.leaves)
    if old_leaves:
        for old in old_leaves:
            db.execute(delete(Attachment).where(
                Attachment.owner_type == "leave", Attachment.owner_id == old.id))
        db.execute(delete(LeaveRecord).where(LeaveRecord.attendance_id == record.id))
        db.flush()

    for index, item in enumerate(payload.leaves):
        leave = LeaveRecord(
            id=item.id or f"lv{record.id}{index}{uuid.uuid4().hex[:6]}",
            attendance_id=record.id, sort_order=index,
            student_name=item.student_name, student_id=item.student_id,
            reason=item.reason, reason_detail=item.reason_detail,
            extra_note=item.extra_note, shared_certificate=item.shared_certificate,
            certificate_late=item.certificate_late)
        db.add(leave)
        db.flush()
        for file_id in item.certificate_file_ids:
            row = db.get(Attachment, file_id)
            if row is not None:
                row.owner_type = "leave"
                row.owner_id = leave.id
    db.flush()
    record.leave_count = len(payload.leaves)
    db.commit()
    # 让后续序列化重新读取关系，避免沿用提交前的空集合
    db.expire_all()
    fresh = eager_record(db, record.id)
    return _record_out(db, fresh) if fresh else _record_out(db, record)


# ------------------------------------------------------------------ #
# 人数问题标记 / 应到人数变更
# ------------------------------------------------------------------ #
@router.patch("/{record_id}/number-issue", response_model=AttendanceOut, summary="标记或取消人数问题")
def set_number_issue(
    record_id: str,
    payload: NumberIssueIn,
    account=Depends(require_roles("inspector", "admin")),
    db: Session = Depends(get_db),
) -> AttendanceOut:
    record = db.get(AttendanceRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="记录不存在")
    name = account.name
    if account.staff_id:
        staff = db.get(Staff, account.staff_id)
        name = staff.name if staff else name
    if payload.cancel:
        record.number_issue = False
        record.number_issue_cancelled = True
        record.number_issue_note = payload.note or None
        record.number_issue_by = name
    else:
        record.number_issue = True
        record.number_issue_cancelled = False
        record.number_issue_note = payload.note or None
        record.number_issue_by = name
    db.commit()
    return _record_out(db, record)


@router.post("/expected-changes", response_model=ExpectedChangeOut, summary="修改应到人数（必填原因）")
def create_expected_change(
    payload: ExpectedChangeIn,
    account=Depends(require_roles("committee")),
    db: Session = Depends(get_db),
) -> ExpectedChangeOut:
    if account.class_id != payload.class_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能修改本班应到人数")
    cls = db.get(ClassGroup, payload.class_id)
    if cls is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")

    reason = payload.reason.strip()
    if not reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写修改原因")
    if payload.to_count < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="应到人数不能为负")

    current = effective_expected(db, cls)
    if payload.to_count == current:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="应到人数没有变化，无需修改")

    row = ExpectedChange(
        id=f"ec{cls.id}{stamp_str()}{uuid.uuid4().hex[:4]}",
        class_id=cls.id, class_name=cls.name, date=today_str(),
        from_count=current, to_count=payload.to_count,
        reason=reason, by=account.name, created_at=now_str(), acknowledged=False)
    db.add(row)
    db.commit()
    return ExpectedChangeOut.model_validate(row)


@router.get("/expected-changes", response_model=list[ExpectedChangeOut], summary="应到人数变更记录")
def list_expected_changes(
    class_id: str | None = Query(default=None, alias="classId"),
    date: str | None = Query(default=None),
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[ExpectedChangeOut]:
    query = select(ExpectedChange)
    if class_id:
        query = query.where(ExpectedChange.class_id == class_id)
    if date:
        query = query.where(ExpectedChange.date == date)
    rows = db.scalars(query.order_by(ExpectedChange.created_at.desc())).all()
    return [ExpectedChangeOut.model_validate(r) for r in rows]


@router.post("/expected-changes/{change_id}/acknowledge", response_model=ExpectedChangeOut,
             summary="管理端确认已阅（留痕，非审批）")
def acknowledge_change(
    change_id: str,
    account=Depends(require_roles("admin", "ops")),
    db: Session = Depends(get_db),
) -> ExpectedChangeOut:
    row = db.get(ExpectedChange, change_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="变更记录不存在")
    row.acknowledged = True
    row.acknowledged_at = now_str()
    row.acknowledged_by = account.name
    db.commit()
    return ExpectedChangeOut.model_validate(row)


# ------------------------------------------------------------------ #
# 玩手机名单与检讨
# ------------------------------------------------------------------ #
@router.post("/{record_id}/phone-violations", response_model=AttendanceOut,
             summary="勾选或取消玩手机人员（查手机干事）")
def toggle_phone_violation(
    record_id: str,
    payload: TogglePhoneIn,
    account=Depends(require_roles("inspector")),
    db: Session = Depends(get_db),
) -> AttendanceOut:
    record = db.get(AttendanceRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="记录不存在")
    name = payload.student_name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写姓名")

    existing = db.scalar(select(PhoneViolation).where(
        PhoneViolation.attendance_id == record_id, PhoneViolation.student_name == name))
    if existing:
        db.execute(delete(Attachment).where(
            Attachment.owner_type == "violation", Attachment.owner_id == existing.id))
        db.delete(existing)
    else:
        db.add(PhoneViolation(
            id=f"pv{record_id}{uuid.uuid4().hex[:8]}",
            attendance_id=record_id, student_name=name))
    db.commit()
    db.refresh(record)
    return _record_out(db, record)


@router.post("/{record_id}/phone-violations/{student_name}/review", response_model=AttendanceOut,
             summary="上传检讨文件（同时写入存档）")
def upload_review(
    record_id: str,
    student_name: str,
    payload: ReviewIn,
    account=Depends(require_roles("inspector")),
    db: Session = Depends(get_db),
) -> AttendanceOut:
    record = db.get(AttendanceRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="记录不存在")
    violation = db.scalar(select(PhoneViolation).where(
        PhoneViolation.attendance_id == record_id, PhoneViolation.student_name == student_name))
    if violation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="该同学不在玩手机名单中")

    name = account.name
    if account.staff_id:
        staff = db.get(Staff, account.staff_id)
        name = staff.name if staff else name
    at = now_str()

    for file_id in payload.file_ids:
        row = db.get(Attachment, file_id)
        if row is None:
            continue
        row.owner_type = "violation"
        row.owner_id = violation.id
    violation.review_at = at
    violation.review_by = name

    db.add(ReviewRecord(
        id=f"rv{record_id}{uuid.uuid4().hex[:8]}",
        date=record.date, class_id=record.class_id, class_name=record.class_name,
        classroom=record.classroom, student_name=student_name, at=at, by=name))
    db.commit()
    db.refresh(record)
    return _record_out(db, record)


@router.get("/reviews", response_model=list[ReviewOut], summary="检讨存档")
def list_reviews(
    class_id: str | None = Query(default=None, alias="classId"),
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[ReviewOut]:
    query = select(ReviewRecord)
    if class_id:
        query = query.where(ReviewRecord.class_id == class_id)
    rows = db.scalars(query.order_by(ReviewRecord.at.desc())).all()
    return [
        ReviewOut(id=r.id, date=r.date, class_id=r.class_id, class_name=r.class_name,
                  classroom=r.classroom, student_name=r.student_name,
                  files=_attachments(db, "violation", _review_files_key(db, r)),
                  at=r.at, by=r.by)
        for r in rows
    ]


def _review_files_key(db: Session, review: ReviewRecord) -> str:
    """检讨存档与实际违规记录共用同一批附件，这里找回对应的 violation id。"""
    violation = db.scalar(select(PhoneViolation).join(AttendanceRecord).where(
        PhoneViolation.student_name == review.student_name,
        AttendanceRecord.class_id == review.class_id,
        AttendanceRecord.date == review.date))
    return violation.id if violation else f"none-{review.id}"


# ------------------------------------------------------------------ #
# 假条核查
# ------------------------------------------------------------------ #
@router.post("/leaves/{leave_id}/verify", response_model=LeaveOut, summary="干事核查假条")
def verify_leave(
    leave_id: str,
    payload: LeaveVerifyIn,
    account=Depends(require_roles("inspector", "admin")),
    db: Session = Depends(get_db),
) -> LeaveOut:
    leave = db.get(LeaveRecord, leave_id)
    if leave is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="假条不存在")
    name = account.name
    if account.staff_id:
        staff = db.get(Staff, account.staff_id)
        name = staff.name if staff else name
    leave.checked = payload.checked
    leave.has_issue = payload.has_issue
    leave.issue_description = payload.issue_description or None
    leave.issue_by = name if payload.has_issue else None
    db.commit()
    return _leave_out(db, leave)
