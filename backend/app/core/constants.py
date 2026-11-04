"""共享常量与工具：角色、排班类型、星期、周次、时间格式化。

与前端 src/data.ts / src/types.ts 保持一致，避免两端语义漂移。
"""

from datetime import datetime, timedelta, timezone

ROLE_COMMITTEE = "committee"
ROLE_INSPECTOR = "inspector"
ROLE_ADMIN = "admin"
ROLE_OPS = "ops"
ALL_ROLES = (ROLE_COMMITTEE, ROLE_INSPECTOR, ROLE_ADMIN, ROLE_OPS)

SHIFT_CHECK = "查班"
SHIFT_PHONE = "查手机"
ALL_SHIFT_TYPES = (SHIFT_CHECK, SHIFT_PHONE)

WEEKDAYS = ("星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日")

#: 有晚自习的星期（依据《晚自习查班表》）
STUDY_WEEKDAYS = ("星期一", "星期二", "星期三", "星期四", "星期日")

WEEK_THIS = "本周"
WEEK_NEXT = "下周"
ALL_WEEKS = (WEEK_THIS, WEEK_NEXT)

UPLOAD_DEADLINE = "20:59"
DEFAULT_LEAVE_REASONS = ("病假", "事假")
#: 考勤「第一次」所在的晚自习日期（锚点）。与前端 src/data.ts 保持一致，可在运维端覆盖。
DEFAULT_VERIFY_ANCHOR_DATE = "2026-11-01"
#: 考勤分组轮数（第七次之后回到第一次）
VERIFY_GROUP_COUNT = 7
#: 账号初始口令（与前端 data.ts 的 DEFAULT_PASSWORD 一致）
DEFAULT_PASSWORD = "123456"


def weekday_of(date_str: str) -> str:
    """'2026-11-03' -> '星期二'。日期非法时返回空串。"""
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
    except (TypeError, ValueError):
        return ""
    return WEEKDAYS[d.weekday()]


def today_str() -> str:
    return datetime.now(tz=timezone(timedelta(hours=8))).strftime("%Y-%m-%d")


def now_str() -> str:
    """'YYYY-MM-DD HH:mm'，与前端展示格式一致。"""
    return datetime.now(tz=timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M")


def stamp_str() -> str:
    """'YYYYMMDDHHmmss'，用于拼接主键。

    注意：`now_str()` 含空格与冒号，不能直接拼进 id——
    含空格的 id 出现在路径参数里会被 URL 解析截断，导致按 id 查询失败。
    """
    return datetime.now(tz=timezone(timedelta(hours=8))).strftime("%Y%m%d%H%M%S")


def has_study_night(date_str: str) -> bool:
    return weekday_of(date_str) in STUDY_WEEKDAYS
