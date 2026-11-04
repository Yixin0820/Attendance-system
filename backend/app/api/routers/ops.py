"""运维端：账号管理与审计日志。"""

from __future__ import annotations

import secrets
import uuid
from datetime import date
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_roles
from app.core.constants import (
    DEFAULT_PASSWORD,
    DEFAULT_VERIFY_ANCHOR_DATE,
    now_str,
    today_str,
)
from app.core.security import hash_password, validate_new_password, verify_password
from app.models.entities import Account, AppLog, AppSetting, ClassGroup, Staff
from app.schemas.base import CamelModel
from app.services.settings import get_setting, set_setting
from app.services.verify_round import (
    SETTING_KEY as ANCHOR_KEY,
    is_study_night,
    verify_round_of,
)

def _parse_date(value: str):
    """'YYYY-MM-DD' -> date，非法返回 None。"""
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None

router = APIRouter(prefix="/api/ops", tags=["运维"])


@lru_cache(maxsize=1)
def _default_hash() -> str:
    """默认口令的哈希，用于判断是否还在用初始口令（比较哈希值即可，不需要携带盐再算一次）。"""
    return hash_password(DEFAULT_PASSWORD)


def _is_default_password(password_hash: str) -> bool:
    return verify_password(DEFAULT_PASSWORD, password_hash)


class AccountOut(CamelModel):
    username: str
    role: str
    name: str
    title: str
    enabled: bool
    class_id: str | None = None
    staff_id: str | None = None
    password_hint: str = ""
    must_change_password: bool = False


class ToggleIn(CamelModel):
    enabled: bool


class ResetPasswordIn(CamelModel):
    new_password: str


class BulkResetIn(CamelModel):
    """批量重置范围。role 为空表示所有启用账号。"""

    role: str | None = None


#: 去掉了 I/O/0/1 等易混淆字符，方便线下口头或纸条分发
_PWD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def random_password(length: int = 10) -> str:
    while True:
        value = "".join(secrets.choice(_PWD_ALPHABET) for _ in range(length))
        if len(set(value)) >= 3:
            return value


@router.get("/accounts", response_model=list[AccountOut], summary="账号清单")
def list_accounts(
    account=Depends(require_roles("ops", "admin")),
    db: Session = Depends(get_db),
) -> list[AccountOut]:
    rows = db.scalars(select(Account).order_by(Account.username)).all()
    return [
        AccountOut(
            username=a.username, role=a.role, name=a.name, title=a.title,
            enabled=a.enabled, class_id=a.class_id, staff_id=a.staff_id,
            # 只暴露"是否仍在使用初始口令"，不返回哈希，也不返回明文
            password_hint="初始口令" if _is_default_password(a.password_hash) else "已修改",
            must_change_password=a.must_change_password)
        for a in rows
    ]


@router.patch("/accounts/{username}/enabled", response_model=AccountOut, summary="启用或停用账号")
def toggle_account(
    username: str,
    payload: ToggleIn,
    account=Depends(require_roles("ops", "admin")),
    db: Session = Depends(get_db),
) -> AccountOut:
    row = db.get(Account, username)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在")
    if row.username == account.username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能停用当前登录账号")
    row.enabled = payload.enabled
    db.add(AppLog(id=f"log{uuid.uuid4().hex[:12]}", at=now_str(), actor=account.username,
                  role=account.role, action="toggle_account",
                  detail=f"{username} 状态改为 {'启用' if payload.enabled else '停用'}"))
    db.commit()
    return AccountOut(username=row.username, role=row.role, name=row.name, title=row.title,
                      enabled=row.enabled, class_id=row.class_id, staff_id=row.staff_id,
                      must_change_password=row.must_change_password)


@router.post("/accounts/{username}/reset-password", summary="重置账号口令")
def reset_password(
    username: str,
    payload: ResetPasswordIn,
    account=Depends(require_roles("ops", "admin")),
    db: Session = Depends(get_db),
) -> dict[str, bool | str]:
    row = db.get(Account, username)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账号不存在")
    new_password = (payload.new_password or "").strip()
    try:
        validate_new_password(new_password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    row.password_hash = hash_password(new_password)
    # 运维下发的口令只是临时凭证，用户首次登录必须自己改掉
    row.must_change_password = True
    db.add(AppLog(id=f"log{uuid.uuid4().hex[:12]}", at=now_str(), actor=account.username,
                  role=account.role, action="reset_password",
                  detail=f"重置 {username} 的口令，并标记为首次登录须改密"))
    db.commit()
    return {"ok": True, "message": f"已重置 {username} 的口令，该账号下次登录须先修改密码"}


@router.post("/accounts/reset-random", summary="批量重置为随机口令（一次性下发）")
def reset_random(
    payload: BulkResetIn,
    account=Depends(require_roles("ops")),
    db: Session = Depends(get_db),
) -> dict:
    """上线前把所有 123456 换成随机口令。

    返回的明文清单**只在本次响应里出现一次**（口令只存 bcrypt 哈希），
    运维必须立刻导出保存并线下分发；所有账号同时被标记为首次登录须改密。
    """
    query = select(Account).where(Account.enabled.is_(True))
    if payload.role:
        if payload.role not in {"committee", "inspector", "admin", "ops"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的角色")
        query = query.where(Account.role == payload.role)
    rows = db.scalars(query.order_by(Account.username)).all()
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="没有符合条件的启用账号")

    items: list[dict[str, str]] = []
    for row in rows:
        plain = random_password()
        row.password_hash = hash_password(plain)
        row.must_change_password = True
        items.append({"username": row.username, "name": row.name,
                      "role": row.role, "password": plain})
    db.add(AppLog(id=f"log{uuid.uuid4().hex[:12]}", at=now_str(), actor=account.username,
                  role=account.role, action="bulk_reset_password",
                  detail=f"批量重置 {len(items)} 个账号为随机口令，并标记首次登录须改密"))
    db.commit()
    return {"ok": True, "count": len(items), "items": items}


@router.get("/logs", summary="审计日志")
def list_logs(
    limit: int = Query(default=100, le=500),
    account=Depends(require_roles("ops", "admin")),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = db.scalars(select(AppLog).order_by(AppLog.id.desc()).limit(limit)).all()
    return [{"at": r.at, "actor": r.actor, "role": r.role, "action": r.action,
             "detail": r.detail} for r in rows]


@router.get("/summary", summary="运维端概览数据")
def summary(
    account=Depends(require_roles("ops", "admin")),
    db: Session = Depends(get_db),
) -> dict:
    anchor = get_setting(db, ANCHOR_KEY, DEFAULT_VERIFY_ANCHOR_DATE) or DEFAULT_VERIFY_ANCHOR_DATE
    return {
        "classes": len(db.scalars(select(ClassGroup)).all()),
        "staff": len(db.scalars(select(Staff)).all()),
        "accounts": len(db.scalars(select(Account)).all()),
        "verifyAnchorDate": anchor,
        "verifyRoundToday": verify_round_of(today_str(), anchor),
    }


class SettingIn(CamelModel):
    key: str
    value: str


@router.get("/settings", summary="系统配置项")
def list_settings(
    account=Depends(require_roles("ops", "admin")),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = db.scalars(select(AppSetting).order_by(AppSetting.key)).all()
    known = {ANCHOR_KEY}
    out = [{"key": r.key, "value": r.value, "updatedAt": r.updated_at, "updatedBy": r.updated_by}
           for r in rows]
    # 未落库的项也返回，前端才能显示当前生效的默认值
    for key in known:
        if not any(o["key"] == key for o in out):
            out.append({"key": key, "value": _default_of(key), "updatedAt": "", "updatedBy": ""})
    return out


def _default_of(key: str) -> str:
    return DEFAULT_VERIFY_ANCHOR_DATE if key == ANCHOR_KEY else ""


@router.put("/settings", summary="修改系统配置")
def update_setting(
    payload: SettingIn,
    account=Depends(require_roles("ops", "admin")),
    db: Session = Depends(get_db),
) -> dict:
    key = payload.key.strip()
    if key != ANCHOR_KEY:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的配置项")
    value = payload.value.strip()
    if not _parse_date(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写合法日期 YYYY-MM-DD")
    if not is_study_night(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"{value} 不是有晚自习的日子（星期一/二/三/四/日）")
    set_setting(db, key, value, actor=account.username)
    db.add(AppLog(id=f"log{uuid.uuid4().hex[:12]}", at=now_str(), actor=account.username,
                  role=account.role, action="update_setting",
                  detail=f"考勤排次锚点改为 {value}"))
    db.commit()
    return {"ok": True, "key": key, "value": value}
