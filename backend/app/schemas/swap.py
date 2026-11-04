from app.schemas.base import CamelModel


class SwapIn(CamelModel):
    staff_id: str
    staff_name: str
    target_staff_id: str
    target_staff_name: str
    week: str = "本周"
    target_week: str = "本周"
    from_weekday: str
    from_type: str
    to_weekday: str
    to_type: str
    reason: str


class SwapOut(CamelModel):
    id: str
    staff_id: str
    staff_name: str
    target_staff_id: str
    target_staff_name: str
    week: str
    target_week: str
    from_weekday: str
    from_type: str
    to_weekday: str
    to_type: str
    reason: str
    status: str
    created_at: str
    review_note: str | None = None
    reviewed_at: str | None = None


class RespondIn(CamelModel):
    agree: bool
    note: str | None = None


class SwapNoticeOut(CamelModel):
    id: str
    swap_id: str
    to_staff_name: str
    title: str
    detail: str
    result: str
    created_at: str
    read: bool
