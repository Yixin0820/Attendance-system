"""从 seed_data.json 灌入基础数据。

用法：

    python -m app.seed.run_seed            # 已有数据时跳过
    python -m app.seed.run_seed --force    # 清空重建

seed_data.json 由仓库根目录的 `node scripts/export-seed.mjs` 生成，
来源是前端 src/data.ts，保证两端基础数据一致。
"""

from __future__ import annotations

import argparse
import base64
import json
import pathlib
import sys
from urllib.parse import unquote

from sqlalchemy import select

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.constants import now_str
from app.core.security import hash_password
from app.models.entities import (
    Account,
    Attachment,
    AttendanceRecord,
    ClassGroup,
    ClassroomRule,
    LeaveReason,
    LeaveRecord,
    Room,
    Shift,
    ShiftMember,
    Staff,
    SwapRequest,
    VerifyGroup,
    VerifyGroupMember,
)

SEED_FILE = pathlib.Path(__file__).with_name("seed_data.json")


def load_payload() -> dict:
    if not SEED_FILE.exists():
        print(f"种子文件不存在：{SEED_FILE}", file=sys.stderr)
        print("请先在项目根目录执行：node scripts/export-seed.mjs", file=sys.stderr)
        raise SystemExit(2)
    return json.loads(SEED_FILE.read_text(encoding="utf-8"))


def write_data_uri(db, file_id: str, file_name: str, data_uri: str, owner_type: str,
                   owner_id: str) -> None:
    """把前端内联的占位假条（data URI）落成真实文件，并登记为附件。"""
    storage_root = pathlib.Path(settings.UPLOAD_DIR)
    try:
        header, _, encoded = data_uri.partition(",")
        suffix = ".svg" if "svg" in header else ".bin"
        raw = base64.b64decode(encoded) if ";base64" in header else unquote(encoded).encode("utf-8")
    except Exception:  # noqa: BLE001 - 占位图损坏不应阻断灌数
        return

    relative = f"{owner_type}/{file_id}{suffix}"
    target = storage_root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw)
    db.add(Attachment(
        id=file_id, owner_type=owner_type, owner_id=owner_id,
        name=file_name or "假条", storage_key=relative,
        content_type="image/svg+xml" if suffix == ".svg" else "application/octet-stream",
        size=len(raw), uploaded_at="导入"))


def seed(force: bool = False) -> None:
    payload = load_payload()
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        existing = db.scalar(select(ClassGroup))
        if existing and not force:
            print("数据库已有班级数据；如需重建请加 --force")
            return
        if force:
            # 依赖关系从子到父逐个清空，避免外键报错
            for table in reversed(Base.metadata.sorted_tables):
                db.execute(table.delete())
            db.commit()
            # 上面 `existing` 已把 k01 载入 identity map，清库后它仍占位；
            # 不清空会和接下来新建的同主键对象冲突（SQLAlchemy 告警并静默替换）
            db.expunge_all()

        for r in payload["rooms"]:
            db.add(Room(id=r["id"], name=r["name"], college=r["college"], weeks=r["weeks"],
                        note=r["note"], sort_order=r["sortOrder"]))

        for c in payload["classes"]:
            db.add(ClassGroup(id=c["id"], name=c["name"], major=c["major"], college=c["college"],
                              weeks=c["weeks"], committee_name=c["committeeName"], size=c["size"],
                              base_room_id=c["baseRoomId"]))
        db.flush()

        for r in payload["classroomRules"]:
            db.add(ClassroomRule(id=r["id"], weekday=r["weekday"], class_id=r["classId"],
                                 room_id=r["roomId"]))

        for s in payload["staff"]:
            db.add(Staff(id=s["id"], name=s["name"], role=s["role"], phone=s["phone"]))
        db.flush()

        for g in payload["verifyGroups"]:
            db.add(VerifyGroup(id=g["id"], seq=g["seq"], leader_id=g["leaderId"]))
        db.flush()
        for g in payload["verifyGroups"]:
            for index, staff_id in enumerate(g["memberIds"]):
                db.add(VerifyGroupMember(id=f"{g['id']}m{index}", group_id=g["id"],
                                         staff_id=staff_id))

        # 排班同时生成本周与下周两份：下周是调班的目标周
        for index, s in enumerate(payload["shifts"]):
            for week in ("本周", "下周"):
                shift_id = f"{'cur' if week == '本周' else 'nxt'}{index}"
                db.add(Shift(id=shift_id, week=week, weekday=s["weekday"], type=s["type"]))
        db.flush()
        for index, s in enumerate(payload["shifts"]):
            for week, prefix in (("本周", "cur"), ("下周", "nxt")):
                shift_id = f"{prefix}{index}"
                for position, staff_id in enumerate(s["staffIds"]):
                    db.add(ShiftMember(shift_id=shift_id, staff_id=staff_id, position=position))

        for a in payload["accounts"]:
            db.add(Account(username=a["username"], password_hash=hash_password(a["password"]),
                           role=a["role"], name=a["name"], title=a["title"],
                           enabled=a["enabled"], class_id=a["classId"], staff_id=a["staffId"]))

        for name in payload["leaveReasons"]:
            db.add(LeaveReason(id=f"sys{name}", class_id=None, name=name, sort_order=0))
        db.flush()

        # 演示考勤按"运行种子当天"落日期，避免过几天打开还是旧日期
        today = now_str()[:10]
        for rec in payload["attendance"]:
            db.add(AttendanceRecord(
                id=rec["id"], class_id=rec["classId"], class_name=rec["className"],
                classroom=rec["classroom"], date=today, expected=rec["expected"],
                actual=rec["actual"], leave_count=rec["leaveCount"],
                late_uploaded=rec["lateUploaded"], uploaded_at=rec["uploadedAt"]))
        db.flush()
        for rec in payload["attendance"]:
            for leave in rec["leaves"]:
                db.add(LeaveRecord(
                    id=leave["id"], attendance_id=rec["id"], sort_order=0,
                    student_name=leave["studentName"], student_id=leave["studentId"],
                    reason=leave["reason"], reason_detail=leave["reasonDetail"],
                    extra_note=leave["extraNote"], shared_certificate=leave["sharedCertificate"],
                    certificate_late=leave["certificateLate"], checked=leave["checked"],
                    has_issue=leave["hasIssue"], issue_description=leave["issueDescription"],
                    issue_by=leave["issueBy"]))
                for f in leave["certificateFiles"]:
                    if f.get("dataUri"):
                        write_data_uri(db, f["id"], f["name"], f["dataUri"], "leave", leave["id"])

        for s in payload["swaps"]:
            db.add(SwapRequest(
                id=s["id"], staff_id=s["staffId"], staff_name=s["staffName"],
                target_staff_id=s["targetStaffId"], target_staff_name=s["targetStaffName"],
                week=s["week"], target_week=s["targetWeek"], from_weekday=s["fromWeekday"],
                from_type=s["fromType"], to_weekday=s["toWeekday"], to_type=s["toType"],
                reason=s["reason"], status=s["status"], review_note=s["reviewNote"],
                created_at=s["createdAt"], reviewed_at=s["reviewedAt"]))

        db.commit()
        print("已写入：")
        print(f"  教室 {len(payload['rooms'])} · 班级 {len(payload['classes'])} · "
              f"教室例外 {len(payload['classroomRules'])}")
        print(f"  干事 {len(payload['staff'])} · 排班 {len(payload['shifts'])}（本周/下周各一份）"
              f" · 核查分组 {len(payload['verifyGroups'])}")
        print(f"  账号 {len(payload['accounts'])} · 今日考勤 {len(payload['attendance'])}"
              f" · 调班种子 {len(payload['swaps'])}")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="导入晚自习考勤系统基础数据")
    parser.add_argument("--force", action="store_true", help="清空已有数据后重建")
    args = parser.parse_args()
    seed(force=args.force)


if __name__ == "__main__":
    main()
