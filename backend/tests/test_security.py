"""P0 安全加固回归测试：登录限流、首次登录强制改密、上传白名单、口令策略。

注意：conftest 用的是 session 级共享临时库，因此涉及改账号状态的用例一律
使用独立的探针账号并在结束后清理，避免污染 test_api.py 的 123456 登录。
"""
from __future__ import annotations

import pytest

from app.api.routers.ops import random_password
from app.core.security import hash_password, validate_new_password
from app.models.entities import Account, Attachment, LoginAttempt

_PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
# 不是完整 docx，但足以覆盖「PK 头 + word/document.xml」这条服务端校验
_DOCX_LIKE = b"PK\x03\x04" + b"\x00" * 32 + b"word/document.xml" + b"\x00" * 32


def auth_header(client, username: str = "ops", password: str = "123456") -> dict[str, str]:
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['accessToken']}"}


@pytest.fixture()
def clean_attempts(db):
    yield
    db.query(LoginAttempt).delete()
    db.commit()


@pytest.fixture()
def probe_user(client, db):
    """一个与真实 45 个账号完全隔离的探针账号。"""
    name = "security_probe_user"
    old = db.get(Account, name)
    if old is not None:
        db.delete(old)
        db.commit()
    row = Account(
        username=name, password_hash=hash_password("TempPass2026"),
        role="committee", name="安全测试", title="", enabled=True,
        must_change_password=True,
    )
    db.add(row)
    db.commit()
    yield name
    current = db.get(Account, name)
    if current is not None:
        db.delete(current)
    db.query(LoginAttempt).filter(LoginAttempt.key.like(f"{name}|%")).delete()
    db.commit()


# --------------------------------------------------------------------- #
# 登录限流
# --------------------------------------------------------------------- #
def test_login_locks_after_repeated_failures(client, db, clean_attempts):
    from app.core.config import settings

    body = {"username": "brute_force_user", "password": "definitely-wrong"}
    for _ in range(settings.LOGIN_MAX_FAILURES):
        resp = client.post("/api/auth/login", json=body)
        assert resp.status_code == 401

    resp = client.post("/api/auth/login", json=body)
    assert resp.status_code == 429
    assert "锁定" in resp.json()["detail"]

    # 锁定按「账号 + IP」隔离，不能把别人一起锁死
    ok = client.post("/api/auth/login", json={"username": "ops", "password": "123456"})
    assert ok.status_code == 200

    db.query(LoginAttempt).filter(
        LoginAttempt.key.like("brute_force_user|%")).delete()
    db.commit()


def test_successful_login_clears_failures(client, db, clean_attempts):
    body = {"username": "ops", "password": "wrong-once"}
    assert client.post("/api/auth/login", json=body).status_code == 401
    assert client.post("/api/auth/login",
                       json={"username": "ops", "password": "123456"}).status_code == 200
    assert db.query(LoginAttempt).filter(
        LoginAttempt.key.like("ops|%")).count() == 0


# --------------------------------------------------------------------- #
# 首次登录强制改密
# --------------------------------------------------------------------- #
def test_force_password_change_flow(client, db, probe_user, clean_attempts):
    resp = client.post("/api/auth/login",
                       json={"username": probe_user, "password": "TempPass2026"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["account"]["mustChangePassword"] is True
    headers = {"Authorization": f"Bearer {data['accessToken']}"}

    # 除登录/改密/me 外，业务接口一律 423
    assert client.get("/api/meta/bootstrap", headers=headers).status_code == 423
    assert client.get("/api/auth/me", headers=headers).status_code == 200

    # 弱口令必须被拒
    weak = client.post("/api/auth/password", headers=headers,
                       json={"oldPassword": "TempPass2026", "newPassword": "12345678"})
    assert weak.status_code == 400

    changed = client.post("/api/auth/password", headers=headers,
                          json={"oldPassword": "TempPass2026", "newPassword": "MyNewPass2026"})
    assert changed.status_code == 200, changed.text
    assert client.get("/api/meta/bootstrap", headers=headers).status_code == 200

    again = client.post("/api/auth/login",
                        json={"username": probe_user, "password": "MyNewPass2026"})
    assert again.status_code == 200
    assert again.json()["account"]["mustChangePassword"] is False


def test_ops_reset_marks_must_change(client, db, probe_user):
    row = db.get(Account, probe_user)
    row.must_change_password = False
    db.commit()

    headers = auth_header(client)
    bad = client.post(f"/api/ops/accounts/{probe_user}/reset-password",
                      headers=headers, json={"newPassword": "123456"})
    assert bad.status_code == 400

    ok = client.post(f"/api/ops/accounts/{probe_user}/reset-password",
                     headers=headers, json={"newPassword": "ResetPass2026"})
    assert ok.status_code == 200, ok.text
    db.refresh(row)
    assert row.must_change_password is True


# --------------------------------------------------------------------- #
# 上传白名单
# --------------------------------------------------------------------- #
@pytest.mark.parametrize("filename,content", [
    ("virus.exe", b"MZ\x90\x00"),
    ("page.html", b"<script>alert(1)</script>"),
    ("fake.png", b"this is definitely not a png"),
    ("fake.docx", b"PK\x03\x04not a real word document"),
    ("no-extension", _PNG),
])
def test_upload_rejects_unsafe_files(client, filename, content):
    headers = auth_header(client)
    resp = client.post(
        "/api/files/upload?owner_type=leave", headers=headers,
        files={"file": (filename, content, "application/octet-stream")},
    )
    assert resp.status_code == 400, f"{filename} 不应被接受：{resp.text}"


def test_upload_accepts_valid_files_and_forces_server_mime(client, db):
    headers = auth_header(client)
    for name, content, expected_mime in [
        ("leave.png", _PNG, "image/png"),
        ("review.docx", _DOCX_LIKE,
         "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ]:
        resp = client.post(
            "/api/files/upload?owner_type=review", headers=headers,
            # 故意谎报 Content-Type，服务端必须不信任它
            files={"file": (name, content, "text/html")},
        )
        assert resp.status_code == 200, resp.text
        row = db.get(Attachment, resp.json()["id"])
        assert row is not None
        assert row.content_type == expected_mime
        assert row.storage_key.endswith(".png" if name.endswith(".png") else ".docx")
        db.delete(row)
        db.commit()


# --------------------------------------------------------------------- #
# 口令策略与随机口令
# --------------------------------------------------------------------- #
@pytest.mark.parametrize("bad", [
    "123456", "12345678", "password", "aaaaaaaaaa", "Has Space 123",
])
def test_weak_passwords_rejected(bad):
    with pytest.raises(ValueError):
        validate_new_password(bad)


def test_password_rules():
    validate_new_password("Tarim2026KQ")
    with pytest.raises(ValueError):
        validate_new_password("SamePass123", old_password="SamePass123")


def test_random_password_is_usable():
    for _ in range(20):
        value = random_password()
        assert len(value) == 10
        assert value.isupper() or value.isdigit() or value.isalnum()
        validate_new_password(value)  # 不应抛
