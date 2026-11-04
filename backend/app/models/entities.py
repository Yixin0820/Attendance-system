"""ORM 数据模型。

设计原则：
1. 不用数据库方言特有类型（不用 JSONB / ARRAY），PostgreSQL 与 SQLite 共用同一套模型；
2. 多对多关系一律走关联表，方便按人反查班次；
3. 所有"可变的业务快照"（如考勤里的教室名、应到人数）落到具体记录上，
   后续修改基础数据不会改写历史。
"""

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _pk() -> Mapped[str]:
    """统一的主键定义（业务侧生成的有序字符串 id，与前端一致）。"""
    return mapped_column(String(40), primary_key=True)


def _created_at() -> Mapped[datetime]:
    """创建时间。用 awareness 明确的 UTC 时间，避免依赖 utcnow()。"""
    return mapped_column(DateTime(timezone=True),
                         default=lambda: datetime.now(tz=timezone.utc), nullable=False)


# --------------------------------------------------------------------- #
# 账号
# --------------------------------------------------------------------- #
class Account(Base):
    __tablename__ = "accounts"

    username: Mapped[str] = mapped_column(String(64), primary_key=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    #: 运维重置/批量下发随机口令后置为 True；登录后除改密接口外一律 423，改密成功自动清除
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false())

    class_id: Mapped[str | None] = mapped_column(
        String(40), ForeignKey("classes.id"), nullable=True)
    staff_id: Mapped[str | None] = mapped_column(
        String(40), ForeignKey("staff.id"), nullable=True)

    created_at: Mapped[datetime] = _created_at()

    group_class: Mapped["ClassGroup | None"] = relationship(back_populates="accounts")
    staff: Mapped["Staff | None"] = relationship(back_populates="account")


# --------------------------------------------------------------------- #
# 教室 / 班级
# --------------------------------------------------------------------- #
class Room(Base):
    """教室行。一门教室可容纳多个班级；301 为学习部常用教室（无班级）。"""

    __tablename__ = "rooms"

    id: Mapped[str] = _pk()
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    college: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    weeks: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    note: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    classes: Mapped[list["ClassGroup"]] = relationship(back_populates="base_room")


class ClassGroup(Base):
    """班级。base_room 为教室安排表中的默认教室；按星期的例外见 ClassroomRule。"""

    __tablename__ = "classes"

    id: Mapped[str] = _pk()
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    major: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    college: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    weeks: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    committee_name: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    size: Mapped[int] = mapped_column(Integer, nullable=False, default=30)

    base_room_id: Mapped[str | None] = mapped_column(
        String(40), ForeignKey("rooms.id"), nullable=True)

    base_room: Mapped["Room | None"] = relationship(back_populates="classes")
    accounts: Mapped[list["Account"]] = relationship(back_populates="group_class")


class ClassroomRule(Base):
    """按星期生效的教室例外。例：每周二自动化 1、2 班由 303 调到 305。"""

    __tablename__ = "classroom_rules"
    __table_args__ = (UniqueConstraint("weekday", "class_id", name="uq_rule_weekday_class"),)

    id: Mapped[str] = _pk()
    weekday: Mapped[str] = mapped_column(String(8), nullable=False)
    class_id: Mapped[str] = mapped_column(String(40), ForeignKey("classes.id"), nullable=False)
    room_id: Mapped[str] = mapped_column(String(40), ForeignKey("rooms.id"), nullable=False)

    class_: Mapped["ClassGroup"] = relationship(foreign_keys=[class_id])
    room: Mapped["Room"] = relationship(foreign_keys=[room_id])


# --------------------------------------------------------------------- #
# 学习部干事
# --------------------------------------------------------------------- #
class Staff(Base):
    __tablename__ = "staff"

    id: Mapped[str] = _pk()
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    role: Mapped[str] = mapped_column(String(8), nullable=False, default="干事")  # 组长 / 干事
    phone: Mapped[str] = mapped_column(String(32), nullable=False, default="")

    account: Mapped["Account | None"] = relationship(back_populates="staff")


class VerifyGroup(Base):
    """假条核查分组（《查考勤排班表》第 N 次）：组长 + 3 名组员。"""

    __tablename__ = "verify_groups"

    id: Mapped[str] = _pk()
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    leader_id: Mapped[str] = mapped_column(String(40), ForeignKey("staff.id"), nullable=False)

    leader: Mapped["Staff"] = relationship(foreign_keys=[leader_id])
    members: Mapped[list["VerifyGroupMember"]] = relationship(
        back_populates="group", cascade="all, delete-orphan")


class VerifyGroupMember(Base):
    __tablename__ = "verify_group_members"
    __table_args__ = (UniqueConstraint("group_id", "staff_id", name="uq_group_staff"),)

    id: Mapped[str] = _pk()
    group_id: Mapped[str] = mapped_column(
        String(40), ForeignKey("verify_groups.id", ondelete="CASCADE"), nullable=False)
    staff_id: Mapped[str] = mapped_column(String(40), ForeignKey("staff.id"), nullable=False)

    group: Mapped["VerifyGroup"] = relationship(back_populates="members")
    staff: Mapped["Staff"] = relationship()


# --------------------------------------------------------------------- #
# 排班
# --------------------------------------------------------------------- #
class Shift(Base):
    """一格排班：某周、某星期、某岗位。"""

    __tablename__ = "shifts"
    __table_args__ = (UniqueConstraint("week", "weekday", "type", name="uq_shift_slot"),)

    id: Mapped[str] = _pk()
    week: Mapped[str] = mapped_column(String(4), nullable=False)      # 本周 / 下周
    weekday: Mapped[str] = mapped_column(String(8), nullable=False)
    type: Mapped[str] = mapped_column(String(8), nullable=False)      # 查班 / 查手机

    members: Mapped[list["ShiftMember"]] = relationship(
        back_populates="shift", cascade="all, delete-orphan",
        order_by="ShiftMember.position")


class ShiftMember(Base):
    __tablename__ = "shift_members"

    shift_id: Mapped[str] = mapped_column(
        String(40), ForeignKey("shifts.id", ondelete="CASCADE"), primary_key=True)
    staff_id: Mapped[str] = mapped_column(
        String(40), ForeignKey("staff.id"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    shift: Mapped["Shift"] = relationship(back_populates="members")
    staff: Mapped["Staff"] = relationship()


# --------------------------------------------------------------------- #
# 调班
# --------------------------------------------------------------------- #
class SwapRequest(Base):
    __tablename__ = "swap_requests"

    id: Mapped[str] = _pk()
    staff_id: Mapped[str] = mapped_column(String(40), ForeignKey("staff.id"), nullable=False)
    staff_name: Mapped[str] = mapped_column(String(64), nullable=False)
    target_staff_id: Mapped[str] = mapped_column(
        String(40), ForeignKey("staff.id"), nullable=False)
    target_staff_name: Mapped[str] = mapped_column(String(64), nullable=False)

    week: Mapped[str] = mapped_column(String(4), nullable=False, default="本周")
    target_week: Mapped[str] = mapped_column(String(4), nullable=False, default="本周")
    from_weekday: Mapped[str] = mapped_column(String(8), nullable=False)
    from_type: Mapped[str] = mapped_column(String(8), nullable=False)
    to_weekday: Mapped[str] = mapped_column(String(8), nullable=False)
    to_type: Mapped[str] = mapped_column(String(8), nullable=False)

    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)
    reviewed_at: Mapped[str | None] = mapped_column(String(32), nullable=True)

    initiator: Mapped["Staff"] = relationship(foreign_keys=[staff_id])
    target: Mapped["Staff"] = relationship(foreign_keys=[target_staff_id])
    notices: Mapped[list["SwapNotice"]] = relationship(
        back_populates="swap", cascade="all, delete-orphan")


class SwapNotice(Base):
    """调班结果通知。同意与拒绝都会发给发起人。"""

    __tablename__ = "swap_notices"

    id: Mapped[str] = _pk()
    swap_id: Mapped[str] = mapped_column(
        String(40), ForeignKey("swap_requests.id", ondelete="CASCADE"), nullable=False)
    to_staff_id: Mapped[str] = mapped_column(String(40), ForeignKey("staff.id"), nullable=False)
    to_staff_name: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False, default="")
    result: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)
    read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    swap: Mapped["SwapRequest"] = relationship(back_populates="notices")


# --------------------------------------------------------------------- #
# 应到人数变更
# --------------------------------------------------------------------- #
class ExpectedChange(Base):
    """学委调整应到人数的留痕记录。管理端仅确认已阅（非审批、不回退）。"""

    __tablename__ = "expected_changes"

    id: Mapped[str] = _pk()
    class_id: Mapped[str] = mapped_column(String(40), ForeignKey("classes.id"), nullable=False)
    class_name: Mapped[str] = mapped_column(String(64), nullable=False)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    from_count: Mapped[int] = mapped_column(Integer, nullable=False)
    to_count: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)
    acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    acknowledged_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(64), nullable=True)


# --------------------------------------------------------------------- #
# 考勤
# --------------------------------------------------------------------- #
class AttendanceRecord(Base):
    """某班某天的考勤上报。"""

    __tablename__ = "attendance_records"
    __table_args__ = (UniqueConstraint("class_id", "date", name="uq_attendance_class_date"),)

    id: Mapped[str] = _pk()
    class_id: Mapped[str] = mapped_column(String(40), ForeignKey("classes.id"), nullable=False)
    class_name: Mapped[str] = mapped_column(String(64), nullable=False)
    classroom: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    date: Mapped[str] = mapped_column(String(10), nullable=False)

    expected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    actual: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    leave_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    late_uploaded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    uploaded_at: Mapped[str] = mapped_column(String(32), nullable=False, default="")

    number_issue: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    number_issue_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    number_issue_cancelled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    number_issue_by: Mapped[str | None] = mapped_column(String(64), nullable=True)

    leaves: Mapped[list["LeaveRecord"]] = relationship(
        back_populates="attendance", cascade="all, delete-orphan")
    phone_violations: Mapped[list["PhoneViolation"]] = relationship(
        back_populates="attendance", cascade="all, delete-orphan")


class LeaveRecord(Base):
    __tablename__ = "leave_records"

    id: Mapped[str] = _pk()
    attendance_id: Mapped[str] = mapped_column(
        String(40), ForeignKey("attendance_records.id", ondelete="CASCADE"), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    student_name: Mapped[str] = mapped_column(String(64), nullable=False)
    student_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    reason_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    shared_certificate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    certificate_late: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    checked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_issue: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    issue_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    issue_by: Mapped[str | None] = mapped_column(String(64), nullable=True)

    attendance: Mapped["AttendanceRecord"] = relationship(back_populates="leaves")


class PhoneViolation(Base):
    """查手机阶段被标记的同学及其检讨。"""

    __tablename__ = "phone_violations"
    __table_args__ = (UniqueConstraint("attendance_id", "student_name", name="uq_phone_student"),)

    id: Mapped[str] = _pk()
    attendance_id: Mapped[str] = mapped_column(
        String(40), ForeignKey("attendance_records.id", ondelete="CASCADE"), nullable=False)
    student_name: Mapped[str] = mapped_column(String(64), nullable=False)
    review_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    review_by: Mapped[str | None] = mapped_column(String(64), nullable=True)

    attendance: Mapped["AttendanceRecord"] = relationship(back_populates="phone_violations")


class ReviewRecord(Base):
    """检讨存档：写入历史记录，不受当天记录被覆盖的影响。"""

    __tablename__ = "review_records"

    id: Mapped[str] = _pk()
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    class_id: Mapped[str] = mapped_column(String(40), ForeignKey("classes.id"), nullable=False)
    class_name: Mapped[str] = mapped_column(String(64), nullable=False)
    classroom: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    student_name: Mapped[str] = mapped_column(String(64), nullable=False)
    at: Mapped[str] = mapped_column(String(32), nullable=False)
    by: Mapped[str] = mapped_column(String(64), nullable=False, default="")


# --------------------------------------------------------------------- #
# 附件（假条图片 / 检讨文件共用）
# --------------------------------------------------------------------- #
class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[str] = _pk()
    owner_type: Mapped[str] = mapped_column(String(16), nullable=False)  # leave / review / violation
    owner_id: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    content_type: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    uploaded_at: Mapped[str] = mapped_column(String(32), nullable=False, default="")


# --------------------------------------------------------------------- #
# 假条类别
# --------------------------------------------------------------------- #
class LeaveReason(Base):
    """学委端可增删的假条类别；class_id 为空表示系统内置。"""

    __tablename__ = "leave_reasons"
    __table_args__ = (UniqueConstraint("class_id", "name", name="uq_reason_scope_name"),)

    id: Mapped[str] = _pk()
    class_id: Mapped[str | None] = mapped_column(
        String(40), ForeignKey("classes.id", ondelete="CASCADE"), nullable=True)
    name: Mapped[str] = mapped_column(String(32), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


# --------------------------------------------------------------------- #
# 审计日志
# --------------------------------------------------------------------- #
class AppLog(Base):
    __tablename__ = "app_logs"

    id: Mapped[str] = _pk()
    at: Mapped[str] = mapped_column(String(32), nullable=False)
    actor: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False, default="")


class LoginAttempt(Base):
    """登录失败计数与临时锁定。

    落库而不是放进程内存：生产环境可能跑多个 uvicorn worker，
    内存计数会让攻击者换个进程就绕过限流。
    """

    __tablename__ = "login_attempts"

    #: "账号|客户端IP"，例如 "ops|127.0.0.1"
    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: 北京时间 "YYYY-MM-DD HH:mm"，空串表示未锁定
    locked_until: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    updated_at: Mapped[str] = mapped_column(String(32), nullable=False, default="")


class AppSetting(Base):
    """系统级键值配置。

    只放「全局且需要长期维护」的少量开关，例如考勤排次的锚点日期。
    不用的原因：把这类值写死在代码里，学期中途遇到长假停课想重新对齐就得改代码重新发版。
    """

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    updated_by: Mapped[str] = mapped_column(String(64), nullable=False, default="")
