"""启动入口：注册路由、CORS、健康检查与基础数据初始化。"""

from fastapi import APIRouter, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.api.deps import require_password_changed
from app.api.routers import attendance, auth, files, meta, ops, roster, swap
from app.core.config import settings
from app.models import Base

health = APIRouter(tags=["健康检查"])

#: 这些值说明「还没配置密钥」，生产环境不允许带着它们启动
_WEAK_SECRETS = frozenset({"", "__dev_placeholder__", "change-me", "secret", "changeme"})


def _check_production_safety() -> None:
    """启动自检：把「本地能跑但上线会出事」的配置挡在启动阶段。

    最关键的一条：多 worker 部署时如果不显式设置 SECRET_KEY，每个进程会各自
    生成一个随机密钥，A 进程签发的令牌到 B 进程验签失败 —— 表现为「登录成功
    但下一个请求就 401」，而且只在多进程时才复现，很难排查。
    """
    if settings.DEBUG:
        if settings.SECRET_KEY in _WEAK_SECRETS:
            print("[警告] 未设置 SECRET_KEY，当前为开发模式，进程重启后旧令牌会失效。")
        return

    if settings.SECRET_KEY in _WEAK_SECRETS:
        raise RuntimeError(
            "生产环境必须设置 SECRET_KEY（DEBUG=false 时不允许使用占位值）。\n"
            "生成方式：python -c \"import secrets;print(secrets.token_urlsafe(48))\"\n"
            "然后写入 backend/.env：SECRET_KEY=<生成的值>"
        )
    if "sqlite" in settings.db_url:
        print("[警告] 生产模式仍在用 SQLite，建议改为 PostgreSQL 并跑 Alembic 迁移。")


def _ensure_sqlite_columns(engine) -> None:
    """本地开发库随代码升级：create_all 只建「不存在的表」，不会给已有表补列。

    老库如果少了 must_change_password，登录会直接 500（no such column），
    而用户往往只看到前端「未连接后端」。这里在启动时做一次轻量自愈；
    生产 PostgreSQL 一律走 Alembic，不进这个分支。
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    patches = {
        "accounts": {"must_change_password": "BOOLEAN NOT NULL DEFAULT 0"},
    }
    with engine.begin() as conn:
        for table, columns in patches.items():
            if table not in tables:
                continue  # 全新库由 create_all 一次建全
            existing = {c["name"] for c in inspector.get_columns(table)}
            for column, ddl in columns.items():
                if column not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
                    print(f"[提示] 本地数据库已补齐列 {table}.{column}")


def _assert_schema_ready(engine) -> None:
    """PostgreSQL 不做 create_all：表结构由 Alembic 负责，缺表就明确报错。"""
    from sqlalchemy import inspect

    try:
        existing = set(inspect(engine).get_table_names())
    except Exception as exc:  # 连不上库也要给出可执行的提示
        raise RuntimeError(
            f"无法连接数据库：{exc}\n请检查 DATABASE_URL 与数据库容器是否已就绪。") from exc

    if not existing:
        raise RuntimeError(
            "数据库是空的，请先执行迁移：\n"
            "  docker compose -f docker-compose.prod.yml run --rm api alembic upgrade head\n"
            "  docker compose -f docker-compose.prod.yml run --rm api python -m app.seed.run_seed"
        )


@health.get("/api/health", summary="健康检查")
def health_check() -> dict[str, str]:
    return {"status": "ok", "version": settings.APP_VERSION}


def create_app():
    from fastapi import FastAPI

    from app.core.database import engine

    _check_production_safety()

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    # SQLite 本地开发直接建表；生产环境用 Alembic 迁移
    if settings.dialect == "sqlite":
        Base.metadata.create_all(bind=engine)
        _ensure_sqlite_columns(engine)
    else:
        _assert_schema_ready(engine)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health)
    # 登录 / 改密 / 当前账号必须始终可用，否则强制改密的用户会把自己锁死
    app.include_router(auth.router)
    guard = [Depends(require_password_changed)]
    for router in (meta.router, roster.router, attendance.router, swap.router, ops.router):
        app.include_router(router, dependencies=guard)
    # 附件读取走 <img src>（浏览器不带 Authorization），保持只读；
    # 上传与删除在 files.py 内部单独挂守卫。
    app.include_router(files.router)
    return app


app = create_app()
