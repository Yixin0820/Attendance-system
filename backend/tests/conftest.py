"""测试夹具：每个用例一个独立的临时 SQLite 文件库。

这样既不污染开发用的 attendance.db，又能用真实 ORM 走完整条链路。
"""

from __future__ import annotations

import os
import pathlib
import tempfile

import pytest

tmp_dir = tempfile.mkdtemp(prefix="attendance-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{pathlib.Path(tmp_dir, 'test.db').as_posix()}"
os.environ["UPLOAD_DIR"] = str(pathlib.Path(tmp_dir, "uploads"))
os.environ["SECRET_KEY"] = "test-secret-key-please-do-not-use-in-production-0123"


@pytest.fixture(scope="session")
def app():
    from app.core.database import Base, engine
    from app.core.config import get_settings

    get_settings.cache_clear()
    from app.main import create_app

    application = create_app()
    Base.metadata.create_all(bind=engine)
    yield application


@pytest.fixture(scope="session")
def seeded(app):
    from app.seed.run_seed import seed

    seed(force=True)
    return True


@pytest.fixture()
def client(app, seeded):
    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        yield c


@pytest.fixture()
def db(app, seeded):
    from app.core.database import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def login(client, username: str, password: str = "123456") -> dict:
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["accessToken"]
    client.headers.update({"Authorization": f"Bearer {payload['accessToken']}"})
    return payload["account"]
