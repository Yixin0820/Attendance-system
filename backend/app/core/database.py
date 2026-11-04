"""数据库引擎与会话。SQLite / PostgreSQL 只差一个 DATABASE_URL。"""

from collections.abc import Generator
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    """所有 ORM 模型的基类。"""


def _engine_kwargs() -> dict[str, Any]:
    if settings.dialect == "sqlite":
        return {"connect_args": {"check_same_thread": False}}
    # PostgreSQL：连接池按需调整
    return {"pool_pre_ping": True, "pool_size": 5, "max_overflow": 10}


engine: Engine = create_engine(settings.db_url, echo=settings.DB_ECHO, future=True, **_engine_kwargs())


if settings.dialect == "sqlite":

    @event.listens_for(Engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _connection_record):  # noqa: ANN001, ANN202
        """SQLite 默认不开启外键约束，这里逐连接打开。"""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False,
                            class_=Session)


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依赖：每个请求一个会话，结束后关闭。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
