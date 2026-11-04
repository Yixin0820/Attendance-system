"""全局配置：全部从环境变量读取，默认值可本地零安装直接跑起来。"""

import secrets
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # -------- 应用 --------
    APP_NAME: str = "晚自习考勤管理系统 API"
    APP_VERSION: str = "v1.2.0-backend"
    DEBUG: bool = True

    # -------- 数据库 --------
    # 本地开发：sqlite:///./attendance.db
    # PostgreSQL：postgresql+psycopg://user:pass@127.0.0.1:5432/attendance
    DATABASE_URL: str = "sqlite:///./attendance.db"

    # SQLite 需要关闭同线程检查；PostgreSQL 不需要
    DB_ECHO: bool = False

    # -------- 安全 --------
    SECRET_KEY: str = "__dev_placeholder__"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12

    # -------- CORS（开发期放开本地前端） --------
    # 生产环境必须显式列出站点域名；本地开发另见 cors_origin_regex。
    CORS_ORIGINS: str = (
        "http://127.0.0.1:5173,http://localhost:5173,"
        "http://127.0.0.1:4173,http://localhost:4173,"
        "http://127.0.0.1:4180,http://localhost:4180"
    )

    # -------- 安全策略 --------
    PASSWORD_MIN_LENGTH: int = 8
    #: 同一「账号 + IP」在窗口内最多失败几次，超过锁定 LOGIN_LOCK_MINUTES 分钟
    LOGIN_MAX_FAILURES: int = 5
    LOGIN_LOCK_MINUTES: int = 10
    LOGIN_WINDOW_MINUTES: int = 10

    # -------- 文件上传 --------
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 10
    #: 附件扩展名白名单；服务端还会再校验一次文件头，防止改名绕过
    ALLOWED_UPLOAD_EXTENSIONS: str = ".jpg,.jpeg,.png,.pdf,.docx"

    @property
    def allowed_upload_extensions(self) -> set[str]:
        return {
            e.strip().lower()
            for e in self.ALLOWED_UPLOAD_EXTENSIONS.split(",")
            if e.strip().startswith(".")
        }

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def cors_origin_regex(self) -> str | None:
        """本机任意端口的页面都放行，避免改了端口号就被 CORS 拦下。

        仅 DEBUG 生效；生产环境只认 CORS_ORIGINS 里写死的域名。
        """
        if not self.DEBUG:
            return None
        return r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$"

    @property
    def db_url(self) -> str:
        return self.DATABASE_URL

    @property
    def dialect(self) -> Literal["sqlite", "postgresql", "other"]:
        if self.DATABASE_URL.startswith("sqlite"):
            return "sqlite"
        if self.DATABASE_URL.startswith("postgresql"):
            return "postgresql"
        return "other"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


@lru_cache(maxsize=1)
def jwt_key() -> str:
    """JWT 签名密钥（进程内固定，否则签发与校验会用到不同的密钥）。

    未显式配置 SECRET_KEY 时每次启动随机生成：
    - 避免把占位密钥误用到生产；
    - 重启后旧令牌失效，正合本地开发的预期。
    生产必须在 .env 中设置 SECRET_KEY，建议 `openssl rand -hex 32`。
    """
    settings = get_settings()
    if settings.SECRET_KEY == "__dev_placeholder__":
        return secrets.token_urlsafe(48)
    return settings.SECRET_KEY


settings = get_settings()
