from typing import Literal

from app.schemas.base import CamelModel

Week = Literal["本周", "下周"]
ShiftType = Literal["查班", "查手机"]


class ShiftOut(CamelModel):
    id: str
    week: str
    weekday: str
    type: str
    staff_ids: list[str] = []


class RosterOut(CamelModel):
    current: list[ShiftOut] = []
    next: list[ShiftOut] = []
