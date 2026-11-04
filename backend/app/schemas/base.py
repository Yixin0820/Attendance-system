"""Pydantic 基类：Python 侧用 snake_case，对外 JSON 用 camelCase（与前端一致）。"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """FastAPI 默认按 alias 序列化响应，因此对外字段自动变成驼峰。

    请求体同时接受驼峰原样传入；`populate_by_name=True` 让服务端代码
    仍可用 `obj.staff_id` 这样的 snake_case 属性访问。
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        protected_namespaces=(),
        from_attributes=True,
    )
