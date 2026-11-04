"""登录失败限流与临时锁定。

按「账号 + 客户端 IP」计数，落库存储：生产可能跑多个 uvicorn worker，
进程内计数换个进程就能绕过。时间统一用北京时间，与审计日志格式一致。
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.constants import now_str
from app.models.entities import AppLog, LoginAttempt

_TZ = timezone(timedelta(hours=8))
_FMT = "%Y-%m-%d %H:%M"


def _now() -> datetime:
    return datetime.now(tz=_TZ)


def _fmt(dt: datetime) -> str:
    return dt.strftime(_FMT)


def client_key(request: Request, username: str) -> str:
    """生成限流键。nginx 反代后 request.client.host 恒为 127.0.0.1，
    因此优先读代理传来的 X-Forwarded-For，否则所有用户会共用一个计数桶。
    """
    host = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if forwarded:
        host = forwarded
    return f"{username.strip().lower()}|{host}"


def check_locked(db: Session, key: str) -> None:
    """仍在锁定期内直接 429；锁定已过期则清掉旧记录。"""
    row = db.get(LoginAttempt, key)
    if row is None or not row.locked_until:
        return
    if row.locked_until > now_str():
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"登录失败次数过多，账号已临时锁定，请于 {row.locked_until} 后重试",
        )
    db.delete(row)
    db.commit()


def record_failure(db: Session, key: str) -> None:
    """记一次失败；达到阈值则锁定，并写一条审计日志。"""
    now = _now()
    row = db.get(LoginAttempt, key)
    if row is None:
        row = LoginAttempt(key=key, failures=0, locked_until="", updated_at=_fmt(now))
        db.add(row)
    elif row.updated_at:
        try:
            last = datetime.strptime(row.updated_at, _FMT).replace(tzinfo=_TZ)
        except ValueError:
            last = now
        if now - last > timedelta(minutes=settings.LOGIN_WINDOW_MINUTES):
            row.failures = 0
            row.locked_until = ""

    row.failures += 1
    row.updated_at = _fmt(now)
    if row.failures >= settings.LOGIN_MAX_FAILURES:
        row.locked_until = _fmt(now + timedelta(minutes=settings.LOGIN_LOCK_MINUTES))
        row.failures = 0  # 锁定期结束后重新计数，避免一次爆发永久锁死
        db.add(AppLog(
            id=f"log{uuid.uuid4().hex[:12]}",
            at=now_str(), actor=key.split("|")[0], role="",
            action="login_locked",
            detail=f"{key} 连续登录失败 {settings.LOGIN_MAX_FAILURES} 次，锁定至 {row.locked_until}",
        ))
    db.commit()


def clear(db: Session, key: str) -> None:
    """登录成功后清空该键的失败记录。"""
    row = db.get(LoginAttempt, key)
    if row is not None:
        db.delete(row)
        db.commit()
