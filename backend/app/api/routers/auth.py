"""登录、当前账号、修改密码。"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_account, get_db
from app.core.constants import now_str
from app.core.security import (
    create_access_token,
    hash_password,
    validate_new_password,
    verify_password,
)
from app.models.entities import Account, AppLog
from app.schemas.auth import AccountOut, ChangePasswordIn, LoginIn, TokenOut
from app.services import login_guard

router = APIRouter(prefix="/api/auth", tags=["认证"])

_FAILURE = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号或密码不正确")


@router.post("/login", response_model=TokenOut, summary="登录并返回访问令牌")
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)) -> TokenOut:
    username = payload.username.strip()
    key = login_guard.client_key(request, username)
    login_guard.check_locked(db, key)

    # 按 username 唯一命中；账号不存在时也走一次哈希比对，避免时序侧信道区分
    account = db.get(Account, username)
    if account is None or not verify_password(payload.password, account.password_hash):
        hash_password(payload.password)
        login_guard.record_failure(db, key)
        raise _FAILURE
    if not account.enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被停用")

    login_guard.clear(db, key)
    token = create_access_token(username, {"role": account.role})
    db.add(AppLog(
        id=uuid.uuid4().hex[:24],
        at=now_str(), actor=account.username, role=account.role,
        action="login", detail=f"{account.name} 登录系统",
    ))
    db.commit()
    # 账号对象在 commit 后仍可用；标记必须回给前端，由前端弹出强制改密页
    return TokenOut(access_token=token, account=AccountOut.model_validate(account))


@router.get("/me", response_model=AccountOut, summary="当前登录账号")
def me(account: Account = Depends(get_current_account)) -> AccountOut:
    return AccountOut.model_validate(account)


@router.post("/password", summary="修改自己的密码")
def change_password(
    payload: ChangePasswordIn,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> dict[str, bool | str]:
    if not verify_password(payload.old_password, account.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="原密码不正确")
    try:
        validate_new_password(payload.new_password, payload.old_password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    was_forced = account.must_change_password
    account.password_hash = hash_password(payload.new_password)
    account.must_change_password = False
    db.add(AppLog(
        id=uuid.uuid4().hex[:24],
        at=now_str(), actor=account.username, role=account.role,
        action="change_password",
        detail=f"{account.name} 修改了密码" + ("（首次登录强制改密）" if was_forced else ""),
    ))
    db.commit()
    return {"ok": True, "message": "密码已更新"}
