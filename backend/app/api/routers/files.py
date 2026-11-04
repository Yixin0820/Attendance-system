"""附件上传与读取（假条图片、检讨文件）。

当前实现落到本地磁盘 UPLOAD_DIR；换成对象存储时只需替换
`_write` / `_read_path` 两个函数，路由不需要改。
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_password_changed
from app.core.config import settings
from app.core.constants import now_str
from app.models.entities import Attachment

router = APIRouter(prefix="/api/files", tags=["文件"])

#: 扩展名 -> (文件头魔数, 服务端判定的 MIME)
#: MIME 一律由服务端决定，不信任客户端上传的 Content-Type（可伪造成 text/html）
_FILE_TYPES: dict[str, tuple[bytes, str]] = {
    ".jpg": (b"\xff\xd8\xff", "image/jpeg"),
    ".jpeg": (b"\xff\xd8\xff", "image/jpeg"),
    ".png": (b"\x89PNG\r\n\x1a\n", "image/png"),
    ".pdf": (b"%PDF-", "application/pdf"),
    ".docx": (b"PK\x03\x04", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
}


def validate_upload(name: str, data: bytes) -> tuple[str, str]:
    """扩展名白名单 + 文件头校验，返回 (安全的扩展名, 服务端 MIME)。"""
    suffix = Path(name).suffix.lower()
    allowed = settings.allowed_upload_extensions
    if suffix not in allowed or suffix not in _FILE_TYPES:
        hint = "、".join(sorted(allowed))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件类型（{suffix or '无扩展名'}），仅允许：{hint}",
        )
    magic, mime = _FILE_TYPES[suffix]
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="文件内容为空")
    if not data.startswith(magic):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="文件内容与扩展名不符，请确认文件没有被改名")
    # docx 本质是 zip，只验 PK 头会让任意 zip 混进来
    if suffix == ".docx" and b"word/document.xml" not in data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="不是有效的 docx 文档")
    return suffix, mime


def storage_root() -> Path:
    root = Path(settings.UPLOAD_DIR)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _write(owner_type: str, safe_suffix: str, data: bytes) -> str:
    """写入磁盘，返回相对 storage_root 的存储键。

    扩展名来自服务端白名单校验结果，不直接采用上传文件名，
    避免出现 .php / .html 之类可被静态服务器执行的文件落盘。
    """
    key = f"{owner_type}/{uuid.uuid4().hex}{safe_suffix}"
    target = storage_root() / key
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return key


def absolute_path(row: Attachment) -> Path:
    return storage_root() / row.storage_key


@router.post("/upload", summary="上传单个文件")
async def upload_file(
    file: UploadFile = File(...),
    owner_type: str = "temp",
    account=Depends(require_password_changed),
    db: Session = Depends(get_db),
) -> dict:
    if owner_type not in {"leave", "review", "violation", "temp"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的附件类型")

    data = await file.read()
    limit = settings.MAX_UPLOAD_MB * 1024 * 1024
    if len(data) > limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"文件超过 {settings.MAX_UPLOAD_MB}MB 限制")

    name = file.filename or "unnamed"
    suffix, mime = validate_upload(name, data)
    row = Attachment(
        id=uuid.uuid4().hex[:24],
        owner_type=owner_type if owner_type != "temp" else "pending",
        owner_id="",
        name=Path(name).name[:255],
        storage_key=_write(owner_type, suffix, data),
        content_type=mime,
        size=len(data),
        uploaded_at=now_str(),
    )
    db.add(row)
    db.commit()
    return {"id": row.id, "name": row.name, "url": f"/api/files/{row.id}"}


@router.get("/{file_id}", summary="读取附件内容")
def read_file(file_id: str, db: Session = Depends(get_db)) -> FileResponse:
    # 下载接口只校验出来是合法附件即可：真正的授权在业务数据上做（假条属于哪个班）
    row = db.get(Attachment, file_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")
    path = absolute_path(row)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="文件已丢失")
    return FileResponse(path, media_type=row.content_type, filename=row.name)


@router.delete("/{file_id}", summary="删除尚未归属的附件")
def delete_file(
    file_id: str,
    account=Depends(require_password_changed),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    row = db.get(Attachment, file_id)
    if row is None:
        return {"ok": True}
    if row.owner_type != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该附件已关联记录，不能在文件接口删除")
    path = absolute_path(row)
    db.delete(row)
    db.commit()
    if path.exists():
        os.remove(path)
    return {"ok": True}
