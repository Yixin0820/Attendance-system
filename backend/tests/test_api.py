"""端到端接口测试：认证、权限、考勤上报、应到变更、教室规则、跨周调班。"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from tests.conftest import login

TODAY = date.today().isoformat()


def _this_week_weekday(target: str) -> str:
    """本周某个星期的日期（用于验证周二教室例外）。"""
    today = date.fromisoformat(TODAY)
    monday = today - timedelta(days=today.weekday())
    labels = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
    return (monday + timedelta(days=labels.index(target))).isoformat()


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_login_rejects_wrong_password(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "账号或密码不正确"


def test_unauthenticated_bootstrap_rejected(client):
    client.headers.pop("Authorization", None)
    assert client.get("/api/meta/bootstrap").status_code == 401


def test_bootstrap_shape(client):
    login(client, "admin")
    data = client.get("/api/meta/bootstrap").json()
    assert len(data["classes"]) == 16
    assert len(data["staff"]) == 27
    assert len(data["verifyGroups"]) == 7
    assert data["studyWeekdays"] == ["星期一", "星期二", "星期三", "星期四", "星期日"]
    # 七轮分组每组必须是 组长 + 3 名组员
    assert all(len(g["memberIds"]) == 3 for g in data["verifyGroups"])


def test_tuesday_classroom_override(client):
    login(client, "admin")
    tuesday = _this_week_weekday("星期二")
    monday = _this_week_weekday("星期一")
    rooms_tue = {r["name"]: r["classIds"] for r in
                 client.get("/api/meta/rooms", params={"date": tuesday}).json()}
    rooms_mon = {r["name"]: r["classIds"] for r in
                 client.get("/api/meta/rooms", params={"date": monday}).json()}
    classes = {c["id"]: c["name"] for c in client.get("/api/meta/classes").json()}
    k09 = next(i for i, n in classes.items() if n == "自动化2026级1班")
    assert "明理楼305" in rooms_tue
    assert k09 in rooms_tue["明理楼305"]
    assert k09 in rooms_mon["明理楼303"]
    # 学习部常用教室始终存在且不排班级
    spare = next(r for r in client.get("/api/meta/rooms", params={"date": tuesday}).json()
                 if r["name"] == "明理楼301")
    assert spare["note"] == "学习部常用教室" and spare["classIds"] == []


def test_committee_submits_own_class_only(client):
    login(client, "xw01")
    payload = {
        "classId": "k01",
        "date": TODAY,
        "expected": 999,  # 服务端应忽略前端传入的应到人数
        "actual": 30,
        "leaves": [{
            "studentName": "王小明", "studentId": "20260199", "reason": "病假",
            "reasonDetail": "发烧", "certificateFileIds": [],
        }],
    }
    resp = client.post("/api/attendance/submit", json=payload)
    assert resp.status_code == 200, resp.text
    record = resp.json()
    assert record["expected"] == 32  # 软件工程2026级1班基础人数
    assert record["leaveCount"] == 1
    assert record["leaves"][0]["studentName"] == "王小明"

    # 不能上报别的班
    resp = client.post("/api/attendance/submit", json={**payload, "classId": "k02"})
    assert resp.status_code == 403


def test_admin_cannot_submit_attendance(client):
    login(client, "admin")
    resp = client.post("/api/attendance/submit", json={
        "classId": "k01", "date": TODAY, "expected": 32, "actual": 32, "leaves": []})
    assert resp.status_code == 403


def test_expected_change_flow(client):
    login(client, "xw02")
    # 原因必填
    resp = client.post("/api/attendance/expected-changes",
                       json={"classId": "k02", "toCount": 29, "reason": "  "})
    assert resp.status_code == 400

    resp = client.post("/api/attendance/expected-changes",
                       json={"classId": "k02", "toCount": 29, "reason": "转专业学生离班"})
    assert resp.status_code == 200, resp.text
    change_id = resp.json()["id"]
    assert resp.json()["acknowledged"] is False
    # id 会作为路径参数使用，不能含空格/冒号等需转义的字符
    assert change_id == change_id.strip()
    assert all(ch.isalnum() or ch in "-_" for ch in change_id), change_id

    expected = client.get("/api/attendance/expected", params={"classId": "k02"}).json()
    assert expected["expected"] == 29
    assert expected["baseSize"] == 31

    # 持续生效：再次上报时使用新应到
    client.post("/api/attendance/submit",
                json={"classId": "k02", "date": TODAY, "expected": 999, "actual": 28, "leaves": []})
    records = client.get("/api/attendance", params={"classId": "k02"}).json()
    assert records[0]["expected"] == 29

    # 管理端确认已阅
    login(client, "admin")
    todos = client.get("/api/attendance/expected-changes").json()
    assert any(t["id"] == change_id and not t["acknowledged"] for t in todos)
    ack = client.post(f"/api/attendance/expected-changes/{change_id}/acknowledge").json()
    assert ack["acknowledged"] is True
    assert ack["acknowledgedBy"] == "管理员"


def _staff_id_by_name(client, name: str) -> str:
    staff = client.get("/api/meta/staff").json()
    return next(s["id"] for s in staff if s["name"] == name)


@pytest.fixture()
def swap_pair(client):
    login(client, "admin")
    return {
        "leader": _staff_id_by_name(client, "王浩然"),
        "partner": _staff_id_by_name(client, "刘梓萱"),
    }


def test_cross_week_swap_updates_both_weeks(client, swap_pair):
    login(client, "gs01")  # 王浩然

    # 本周星期一查班（王浩然） ↔ 下周星期四查班（刘梓萱）
    payload = {
        "staffId": swap_pair["leader"], "staffName": "王浩然",
        "targetStaffId": swap_pair["partner"], "targetStaffName": "刘梓萱",
        "week": "本周", "targetWeek": "下周",
        "fromWeekday": "星期一", "fromType": "查班",
        "toWeekday": "星期四", "toType": "查班",
        "reason": "周四有课设答辩",
    }
    created = client.post("/api/swaps", json=payload)
    assert created.status_code == 200, created.text
    swap_id = created.json()["id"]

    before = client.get("/api/roster").json()
    assert swap_pair["leader"] in _staff_of(before["current"], "星期一", "查班")
    assert swap_pair["leader"] not in _staff_of(before["next"], "星期四", "查班")

    # 只有被指定的替班同学可以回应
    login(client, "gs10")  # 随便另一个干事
    assert client.post(f"/api/swaps/{swap_id}/respond", json={"agree": True}).status_code == 403

    login(client, "gs10")  # placeholder: ensure header reset works
    login(client, _username_for_staff(client, "刘梓萱"))
    agree = client.post(f"/api/swaps/{swap_id}/respond", json={"agree": True, "note": "没问题"})
    assert agree.status_code == 200, agree.text
    assert agree.json()["status"] == "approved"

    after = client.get("/api/roster").json()
    assert swap_pair["partner"] in _staff_of(after["current"], "星期一", "查班")
    assert swap_pair["leader"] not in _staff_of(after["current"], "星期一", "查班")
    assert swap_pair["leader"] in _staff_of(after["next"], "星期四", "查班")
    assert swap_pair["partner"] not in _staff_of(after["next"], "星期四", "查班")

    notices = client.get("/api/swaps/notices", params={"staffId": swap_pair["leader"]}).json()
    assert notices and notices[0]["result"] == "approved"
    assert "排班已互换" in notices[0]["detail"]


def test_rejected_swap_keeps_roster_unchanged(client, swap_pair):
    login(client, "gs06")  # 杨宇航
    # 杨宇航同时在本周星期一查班与本周星期四查班 → 交换后同一班次会重复安排
    dup_payload = {
        "staffId": _staff_id_by_name(client, "杨宇航"), "staffName": "杨宇航",
        "targetStaffId": swap_pair["partner"], "targetStaffName": "刘梓萱",
        "week": "本周", "targetWeek": "本周",
        "fromWeekday": "星期一", "fromType": "查班",
        "toWeekday": "星期四", "toType": "查班",
        "reason": "冲突演示",
    }
    assert client.post("/api/swaps", json=dup_payload).status_code == 409

    # 换成不受前面用例影响的一对：李思远（星期二查班）↔ 张子涵（星期三查班）
    login(client, _username_for_staff(client, "李思远"))
    payload = {
        "staffId": _staff_id_by_name(client, "李思远"), "staffName": "李思远",
        "targetStaffId": _staff_id_by_name(client, "张子涵"), "targetStaffName": "张子涵",
        "week": "本周", "targetWeek": "本周",
        "fromWeekday": "星期二", "fromType": "查班",
        "toWeekday": "星期三", "toType": "查班",
        "reason": "周二有事，想换到星期三",
    }
    created = client.post("/api/swaps", json=payload)
    assert created.status_code == 200, created.text
    swap_id = created.json()["id"]

    before = client.get("/api/roster").json()
    login(client, _username_for_staff(client, "张子涵"))
    rejected = client.post(f"/api/swaps/{swap_id}/respond", json={"agree": False})
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"

    # 拒绝不改动排班表
    assert before == client.get("/api/roster").json()

    notices = client.get("/api/swaps/notices",
                         params={"staffId": _staff_id_by_name(client, "李思远")}).json()
    assert notices[0]["result"] == "rejected"
    assert "排班表保持不变" in notices[0]["detail"]


def _staff_of(shifts, weekday: str, shift_type: str) -> list[str]:
    return next(s["staffIds"] for s in shifts if s["weekday"] == weekday and s["type"] == shift_type)


def _username_for_staff(client, staff_name: str) -> str:
    login(client, "ops")
    staff_id = _staff_id_by_name(client, staff_name)
    accounts = client.get("/api/ops/accounts").json()
    return next(a["username"] for a in accounts if a["staffId"] == staff_id)
