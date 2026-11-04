from app.schemas.base import CamelModel


class ClassOut(CamelModel):
    id: str
    name: str
    major: str
    classroom: str
    college: str
    weeks: str
    committee_name: str
    size: int


class RoomOut(CamelModel):
    id: str
    name: str
    class_ids: list[str] = []
    college: str
    weeks: str
    note: str | None = None


class StaffOut(CamelModel):
    id: str
    name: str
    role: str
    phone: str


class VerifyGroupOut(CamelModel):
    id: str
    seq: int
    leader_id: str
    member_ids: list[str] = []


class LeaveReasonOut(CamelModel):
    id: str
    name: str


class VerifyRoundOut(CamelModel):
    """某一天的考勤排次。seq 为 0 表示当天没有晚自习。"""

    date: str
    seq: int
    weekday: str
    group_id: str | None = None


class BootstrapOut(CamelModel):
    """一次性取到的基础数据快照，前端用它初始化本地缓存。"""

    version: str
    school: str
    college: str
    today: str
    upload_deadline: str
    study_weekdays: list[str]
    classes: list[ClassOut]
    rooms: list[RoomOut]
    staff: list[StaffOut]
    verify_groups: list[VerifyGroupOut]
    leave_reasons: list[LeaveReasonOut]
    # 考勤按「次」续排：锚点即「第一次」的日期，round_today 是今天的排次（0 = 今日无晚自习）
    verify_anchor_date: str
    verify_round_today: int
