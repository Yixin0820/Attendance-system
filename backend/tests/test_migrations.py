"""迁移健康检查：保证 Alembic 脚本与 ORM 模型始终一致。

生产环境用 PostgreSQL + Alembic（不再 create_all），如果有人改了模型却忘了生成迁移，
上线后就会「表结构与代码不符」。这条测试在临时 SQLite 库上跑一遍 upgrade，
再用 autogenerate 比对，任何漂移都会在本地/CI 阶段就暴露。
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _run_alembic(args: list[str], db_path: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db_path}"}
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR, env=env, capture_output=True, text=True, timeout=180,
    )


@pytest.mark.slow()
def test_migrations_match_models():
    pytest.importorskip("alembic")
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "migrate.db"

        up = _run_alembic(["upgrade", "head"], str(db_path))
        assert up.returncode == 0, f"alembic upgrade 失败：\n{up.stdout}\n{up.stderr}"

        # 迁移建出来的表应覆盖所有 ORM 模型
        from app.core.database import Base
        from app.models import entities  # noqa: F401

        engine = create_engine(f"sqlite:///{db_path}")
        with engine.connect() as conn:
            ctx = MigrationContext.configure(conn)
            diff = compare_metadata(ctx, Base.metadata)
            missing_from_db = [d for d in diff if "add_column" in str(d) or "add_table" in str(d)]
            assert not missing_from_db, f"模型与迁移不一致：{missing_from_db}"

            tables = set(inspect(conn).get_table_names())
            expected = set(Base.metadata.tables.keys())
            assert expected - tables == set(), f"迁移缺少表：{expected - tables}"
        engine.dispose()
