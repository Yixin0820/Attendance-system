"""路由依赖：数据库会话、JWT 当前用户、角色守卫。"""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.entities import Account

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

CredentialsError = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="登录状态已失效，请重新登录",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_account(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Account:
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise CredentialsError
    account = db.get(Account, payload["sub"])
    if not account:
        raise CredentialsError
    if not account.enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被停用")
    return account


def require_password_changed(account: Account = Depends(get_current_account)) -> Account:
    """首次登录强制改密：除登录/改密/当前账号外，业务接口一律 423。

    单独的依赖而不是塞进 get_current_account，是为了让 /api/auth/password
    和 /api/auth/me 仍然可用，否则用户连改密接口都调不到。
    """
    if account.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="请先修改初始口令后再使用系统",
        )
    return account


def require_roles(*roles: str):
    """生成角色守卫： committee / inspector / admin / ops。"""

    def _guard(account: Account = Depends(get_current_account)) -> Account:
        if roles and account.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="当前身份无权执行该操作")
        return account

    return _guard


def actor_of(account: Account):
    """调班服务的调用者描述，对应前端 roster.ts 的 SwapActor。"""
    return {
        "username": account.username,
        "role": account.role,
        "enabled": account.enabled,
        "staff_id": account.staff_id,
        "name": account.name,
    }


def get_staff_account(db: Session, staff_id: str) -> Account | None:
    return db.scalar(select(Account).where(Account.staff_id == staff_id))
