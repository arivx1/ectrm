from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from apps.api.app.config import settings

from .document_ingestion_common import PREVIEW_IMAGE_EXTENSION
from .document_ingestion_common import PREVIEW_SUBDIRECTORY


def stored_pdf_absolute_path(storage_key: str) -> Path:
    return settings.DOCUMENT_STORAGE_ROOT / storage_key


def load_stored_pdf_bytes(storage_key: str) -> bytes:
    absolute_path = stored_pdf_absolute_path(storage_key)
    if not absolute_path.exists():
        raise ValueError(f"Stored PDF '{storage_key}' could not be found")
    return absolute_path.read_bytes()


def store_pdf_bytes(*, document_id: str, payload: bytes) -> str:
    storage_root = settings.DOCUMENT_STORAGE_ROOT
    storage_root.mkdir(parents=True, exist_ok=True)
    stored_name = f"{document_id}.pdf"
    relative_path = Path(datetime.now(timezone.utc).strftime("%Y/%m/%d")) / stored_name
    absolute_path = storage_root / relative_path
    absolute_path.parent.mkdir(parents=True, exist_ok=True)
    absolute_path.write_bytes(payload)
    return relative_path.as_posix()


def document_page_preview_relative_path(*, document_id: str, page_number: int) -> Path:
    return Path(PREVIEW_SUBDIRECTORY) / document_id / f"page-{page_number:03d}{PREVIEW_IMAGE_EXTENSION}"


def document_page_preview_absolute_path(*, document_id: str, page_number: int) -> Path:
    return settings.DOCUMENT_STORAGE_ROOT / document_page_preview_relative_path(
        document_id=document_id,
        page_number=page_number,
    )


def document_page_preview_exists(*, document_id: str, page_number: int) -> bool:
    return document_page_preview_absolute_path(document_id=document_id, page_number=page_number).exists()


def delete_document_page_preview(*, document_id: str, page_number: int) -> None:
    preview_path = document_page_preview_absolute_path(document_id=document_id, page_number=page_number)
    try:
        preview_path.unlink()
    except FileNotFoundError:
        return
