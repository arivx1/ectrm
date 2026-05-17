from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from apps.api.app.schemas._validation import normalize_optional_text, normalize_required_text


def _normalize_markdown(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")


class WikiPageRevisionOut(BaseModel):
    revision_id: int
    version: int
    parent_page_id: str | None
    title: str
    sort_order: int
    change_summary: list[str] = Field(default_factory=list)
    created_at: datetime
    created_by: str
    restored_from_revision_id: int | None


class WikiPageLinkOut(BaseModel):
    label: str
    target: str


class WikiPageSummaryOut(BaseModel):
    page_id: str
    parent_page_id: str | None
    title: str
    summary: str
    links: list[WikiPageLinkOut] = Field(default_factory=list)
    child_count: int
    word_count: int
    sort_order: int
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    is_archived: bool
    archived_at: datetime | None
    archived_by: str | None
    version: int


class WikiPageDetailOut(WikiPageSummaryOut):
    content_markdown: str
    recent_revisions: list[WikiPageRevisionOut] = Field(default_factory=list)


class WikiPageIndexOut(BaseModel):
    pages: list[WikiPageSummaryOut] = Field(default_factory=list)


class WikiPageSearchResultOut(BaseModel):
    page: WikiPageSummaryOut
    score: float
    snippet: str
    matched_terms: list[str] = Field(default_factory=list)
    match_reasons: list[str] = Field(default_factory=list)


class WikiPageSearchOut(BaseModel):
    query: str
    result_count: int
    results: list[WikiPageSearchResultOut] = Field(default_factory=list)


class WikiPageCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    parent_page_id: str | None = Field(default=None, max_length=36)
    content_markdown: str = Field(default="", max_length=100_000)
    sort_order: int | None = Field(default=None, ge=0, le=1_000_000)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return normalize_required_text(value, field_name="title")

    @field_validator("parent_page_id")
    @classmethod
    def normalize_parent_page_id(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="parent_page_id")

    @field_validator("content_markdown")
    @classmethod
    def normalize_content_markdown(cls, value: str) -> str:
        return _normalize_markdown(value)


class WikiPageUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    parent_page_id: str | None = Field(default=None, max_length=36)
    content_markdown: str | None = Field(default=None, max_length=100_000)
    sort_order: int | None = Field(default=None, ge=0, le=1_000_000)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="title")

    @field_validator("parent_page_id")
    @classmethod
    def normalize_parent_page_id(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="parent_page_id")

    @field_validator("content_markdown")
    @classmethod
    def normalize_content_markdown(cls, value: str | None) -> str | None:
        return _normalize_markdown(value) if value is not None else None


class WikiPageRestore(BaseModel):
    restored_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("restored_by")
    @classmethod
    def normalize_restored_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="restored_by")
