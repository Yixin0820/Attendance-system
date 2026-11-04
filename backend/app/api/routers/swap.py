"""调班申请、指定同学回应、结果通知。

支持跨周：来源周与目标周可以不同（如本周四 ↔ 下周三）。
校验规则与前端 src/lib/roster.ts 共用同一套纯函数。
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_account, get_db, require_roles
from app.core.constants import now_str
from app.models.entities import Staff, SwapNotice, SwapRequest
from app.schemas.swap import (
    RespondIn,
    SwapIn,
    SwapNoticeOut,
    SwapOut,
)
from app.services import roster as roster_rules
from app.services.roster_io import load_roster, save_roster

router = APIRouter(prefix="/api/swaps", tags=["调班"])


def _selection(swap: SwapRequest | SwapIn) -> dict:
    return {
        "week": swap.week, "targetWeek": swap.target_week,
        "fromWeekday": swap.from_weekday, "fromType": swap.from_type,
        "toWeekday": swap.to_weekday, "toType": swap.to_type,
        "staffId": swap.staff_id, "targetStaffId": swap.target_staff_id,
    }


def _to_out(swap: SwapRequest) -> SwapOut:
    return SwapOut(
        id=swap.id, staff_id=swap.staff_id, staff_name=swap.staff_name,
        target_staff_id=swap.target_staff_id, target_staff_name=swap.target_staff_name,
        week=swap.week, target_week=swap.target_week,
        from_weekday=swap.from_weekday, from_type=swap.from_type,
        to_weekday=swap.to_weekday, to_type=swap.to_type,
        reason=swap.reason, status=swap.status, created_at=swap.created_at,
        review_note=swap.review_note, reviewed_at=swap.reviewed_at)


@router.get("", response_model=list[SwapOut], summary="调班申请列表")
def list_swaps(
    staff_id: str | None = Query(default=None, alias="staffId"),
    mine: bool = Query(default=False),
    status_filter: str | None = Query(default=None, alias="status"),
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[SwapOut]:
    query = select(SwapRequest)
    if mine and account.staff_id:
        query = query.where(
            (SwapRequest.staff_id == account.staff_id)
            | (SwapRequest.target_staff_id == account.staff_id))
    elif staff_id:
        query = query.where(
            (SwapRequest.staff_id == staff_id) | (SwapRequest.target_staff_id == staff_id))
    if status_filter:
        query = query.where(SwapRequest.status == status_filter)
    rows = db.scalars(query.order_by(SwapRequest.created_at.desc())).all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=SwapOut, summary="发起调班申请")
def create_swap(
    payload: SwapIn,
    account=Depends(require_roles("inspector")),
    db: Session = Depends(get_db),
) -> SwapOut:
    if not account.staff_id or payload.staff_id != account.staff_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="只能使用本人干事账号发起调班申请")

    initiator = db.get(Staff, payload.staff_id)
    target = db.get(Staff, payload.target_staff_id)
    if initiator is None or target is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请选择有效的值班人员")
    if initiator.name != payload.staff_name or target.name != payload.target_staff_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="值班人员信息不匹配")
    if not payload.reason.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写调班原因")

    roster = load_roster(db)
    selection = _selection(payload)
    error = roster_rules.validate_swap(roster, selection)
    if error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=error)

    pending = [
        _selection(p) for p in db.scalars(
            select(SwapRequest).where(SwapRequest.status == "pending")).all()]
    if roster_rules.conflicts_with_pending(pending, selection):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="该人员班次已有待回应调班申请，请勿重复或冲突申请")

    swap = SwapRequest(
        id=f"sw{uuid.uuid4().hex[:8]}",
        staff_id=initiator.id, staff_name=initiator.name,
        target_staff_id=target.id, target_staff_name=target.name,
        week=payload.week, target_week=payload.target_week or payload.week,
        from_weekday=payload.from_weekday, from_type=payload.from_type,
        to_weekday=payload.to_weekday, to_type=payload.to_type,
        reason=payload.reason.strip(), status="pending", created_at=now_str())
    db.add(swap)
    db.commit()
    return _to_out(swap)


@router.post("/{swap_id}/respond", response_model=SwapOut, summary="指定的替班同学回应申请")
def respond_swap(
    swap_id: str,
    payload: RespondIn,
    account=Depends(require_roles("inspector")),
    db: Session = Depends(get_db),
) -> SwapOut:
    swap = db.get(SwapRequest, swap_id)
    if swap is None or swap.status != "pending":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="申请不存在或已经回应")
    if not account.staff_id or account.staff_id != swap.target_staff_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅指定的替班同学可以回应申请")

    reviewed_at = now_str()
    if payload.agree:
        roster = load_roster(db)
        new_roster, error = roster_rules.apply_swap_to_roster(roster, _selection(swap))
        if error:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=error)
        save_roster(db, roster, new_roster)

    swap.status = "approved" if payload.agree else "rejected"
    swap.reviewed_at = reviewed_at
    swap.review_note = (payload.note or "").strip() or ("同意替班" if payload.agree else "不方便，无法替班")

    notice_data = roster_rules.build_swap_notice(
        _selection(swap), swap.staff_name, swap.target_staff_name, payload.agree, swap.review_note)
    db.add(SwapNotice(
        id=f"sn{uuid.uuid4().hex[:8]}", swap_id=swap.id,
        to_staff_id=swap.staff_id, to_staff_name=swap.staff_name,
        title=notice_data["title"], detail=notice_data["detail"],
        result=notice_data["result"], created_at=reviewed_at, read=False))
    db.commit()
    return _to_out(swap)


@router.get("/notices", response_model=list[SwapNoticeOut], summary="调班结果通知")
def list_notices(
    staff_id: str | None = Query(default=None, alias="staffId"),
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> list[SwapNoticeOut]:
    query = select(SwapNotice)
    owner = staff_id or account.staff_id
    if owner:
        query = query.where(SwapNotice.to_staff_id == owner)
    rows = db.scalars(query.order_by(SwapNotice.created_at.desc())).all()
    return [SwapNoticeOut.model_validate(r) for r in rows]


@router.post("/notices/{notice_id}/read", summary="标记通知已读")
def read_notice(
    notice_id: str,
    account=Depends(get_current_account),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    row = db.get(SwapNotice, notice_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="通知不存在")
    if account.staff_id and row.to_staff_id != account.staff_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="不能操作他人的通知")
    row.read = True
    db.commit()
    return {"ok": True}
