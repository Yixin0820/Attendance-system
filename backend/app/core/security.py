"""口令哈希与 JWT 令牌签发/校验。

不使用 passlib：它对新版 bcrypt 有兼容层 warning；这里直接用官方 bcrypt API。
"""

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import jwt_key, settings


def hash_password(plain: str) -> str:
    """生成口令哈希（每次自动加盐）。"""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    """校验口令。哈希损坏或格式异常一律返回 False，不抛异常。"""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("ascii"))
    except (ValueError, TypeError, AttributeError):
        return False


#: 常见弱口令；改密与运维重置都会拒绝
WEAK_PASSWORDS = frozenset({
    "123456", "1234567", "12345678", "123456789", "1234567890",
    "111111", "000000", "666666", "888888", "66666666", "88888888",
    "password", "password1", "abc123", "qwerty", "qwerty123",
    "admin123", "admin888", "iloveyou", "letmein", "welcome",
})


def validate_new_password(new_password: str, old_password: str | None = None) -> None:
    """口令强度校验，失败抛 ValueError（由路由转成 400）。

    只做「不帮用户设弱口令」这一层，不强制大小写/符号组合——
    校内 45 个账号靠线下分发，过于复杂反而会被写在纸条上贴在电脑上。
    """
    if len(new_password) < settings.PASSWORD_MIN_LENGTH:
        raise ValueError(f"新口令至少 {settings.PASSWORD_MIN_LENGTH} 位")
    if new_password.strip() != new_password or " " in new_password:
        raise ValueError("新口令不能包含空格")
    if new_password.lower() in WEAK_PASSWORDS:
        raise ValueError("新口令过于简单，请更换")
    if len(set(new_password)) < 3:
        raise ValueError("新口令不能全部由同一个字符组成")
    if old_password is not None and new_password == old_password:
        raise ValueError("新口令不能与原口令相同")


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    """签发访问令牌。subject 为登录账号名。"""
    now = datetime.now(tz=timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, jwt_key(), algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """解析令牌；过期或签名错误返回 None。"""
    try:
        return jwt.decode(token, jwt_key(), algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
