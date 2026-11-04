"""系统键值配置的读写。

只有少量真正全局、需要长期维护的开关放这里（目前是考勤排次锚点）。
读取带默认值兜底，写操作会记录到审计日志由调用方负责。
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.constants import now_str
from app.models.entities import AppSetting


def get_setting(db: Session, key: str, default: str = "") -> str:
    row = db.get(AppSetting, key)
    return row.value if row is not None else default


def set_setting(db: Session, key: str, value: str, actor: str = "") -> AppSetting:
    row = db.get(AppSetting, key)
    if row is None:
        row = AppSetting(key=key)
        db.add(row)
    row.value = value
    row.updated_at = now_str()
    row.updated_by = actor
    db.commit()
    return row
