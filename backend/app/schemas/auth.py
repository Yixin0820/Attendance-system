from datetime import datetime

from app.schemas.base import CamelModel


class LoginIn(CamelModel):
    username: str
    password: str


class ChangePasswordIn(CamelModel):
    old_password: str
    new_password: str


class AccountOut(CamelModel):
    username: str
    role: str
    name: str
    title: str
    enabled: bool
    #: 运维下发随机口令后为 True；前端须弹强制改密页
    must_change_password: bool = False
    class_id: str | None = None
    staff_id: str | None = None


class TokenOut(CamelModel):
    access_token: str
    token_type: str = "bearer"
    account: AccountOut


class OkOut(CamelModel):
    ok: bool = True
    message: str = ""

    at: datetime | None = None
