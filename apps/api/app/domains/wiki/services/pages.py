from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.wiki_page import WikiPage
from apps.api.app.models.wiki_page_revision import WikiPageRevision
from apps.api.app.schemas.wiki import (
    WikiPageCreate,
    WikiPageDetailOut,
    WikiPageIndexOut,
    WikiPageRevisionOut,
    WikiPageSummaryOut,
)

MAX_RECENT_REVISIONS = 12


def _plain_text_from_markdown(markdown: str) -> str:
    text = markdown.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*>\s?", "", text, flags=re.MULTILINE)
    text = text.replace("*", " ").replace("_", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _word_count(markdown: str) -> int:
    plain_text = _plain_text_from_markdown(markdown)
    if not plain_text:
        return 0
    return len([token for token in plain_text.split(" ") if token])


def _summary_from_markdown(markdown: str) -> str:
    plain_text = _plain_text_from_markdown(markdown)
    if not plain_text:
        return "No page summary yet."

    words = plain_text.split(" ")
    if len(words) <= 24:
        return plain_text
    return f"{' '.join(words[:24])}..."


def _serialize_revision(revision: WikiPageRevision) -> WikiPageRevisionOut:
    return WikiPageRevisionOut(
        revision_id=revision.revision_id,
        version=revision.version,
        parent_page_id=revision.parent_page_id,
        title=revision.title,
        sort_order=revision.sort_order,
        change_summary=list(revision.change_summary or []),
        created_at=revision.created_at,
        created_by=revision.created_by,
        restored_from_revision_id=revision.restored_from_revision_id,
    )


def _serialize_summary(page: WikiPage, *, child_count: int) -> WikiPageSummaryOut:
    return WikiPageSummaryOut(
        page_id=page.page_id,
        parent_page_id=page.parent_page_id,
        title=page.title,
        summary=_summary_from_markdown(page.content_markdown),
        child_count=child_count,
        word_count=_word_count(page.content_markdown),
        sort_order=page.sort_order,
        created_at=page.created_at,
        created_by=page.created_by,
        updated_at=page.updated_at,
        updated_by=page.updated_by,
        version=page.version,
    )


def _load_page_or_raise(db: Session, *, page_id: str) -> WikiPage:
    page = db.get(WikiPage, page_id)
    if page is None:
        raise LookupError(f"Wiki page '{page_id}' was not found")
    return page


def _load_pages(db: Session) -> list[WikiPage]:
    return (
        db.execute(
            select(WikiPage).order_by(WikiPage.sort_order.asc(), WikiPage.title.asc(), WikiPage.page_id.asc())
        )
        .scalars()
        .all()
    )


def _child_count_by_parent_id(pages: list[WikiPage]) -> dict[str | None, int]:
    counts: dict[str | None, int] = {}
    for page in pages:
        counts[page.parent_page_id] = counts.get(page.parent_page_id, 0) + 1
    return counts


def _validate_parent_page(
    pages_by_id: dict[str, WikiPage],
    *,
    page_id: str | None,
    parent_page_id: str | None,
) -> None:
    if parent_page_id is None:
        return

    if parent_page_id not in pages_by_id:
        raise LookupError(f"Parent wiki page '{parent_page_id}' was not found")

    if page_id is not None and parent_page_id == page_id:
        raise ValueError("A wiki page cannot be its own parent")

    current_parent_id = parent_page_id
    visited: set[str] = set()

    while current_parent_id is not None:
        if current_parent_id in visited:
            raise ValueError("Wiki page hierarchy contains a cycle")
        visited.add(current_parent_id)

        if page_id is not None and current_parent_id == page_id:
            raise ValueError("A wiki page cannot move underneath one of its descendants")

        current_page = pages_by_id.get(current_parent_id)
        current_parent_id = current_page.parent_page_id if current_page is not None else None


def _next_sort_order(pages: list[WikiPage], *, parent_page_id: str | None) -> int:
    sibling_orders = [page.sort_order for page in pages if page.parent_page_id == parent_page_id]
    return (max(sibling_orders) if sibling_orders else 0) + 100


def _record_revision(
    db: Session,
    *,
    page: WikiPage,
    created_by: str,
    change_summary: list[str],
    restored_from_revision_id: int | None = None,
) -> None:
    db.add(
        WikiPageRevision(
            page_id=page.page_id,
            version=page.version,
            parent_page_id=page.parent_page_id,
            title=page.title,
            content_markdown=page.content_markdown,
            sort_order=page.sort_order,
            change_summary=change_summary,
            created_at=page.updated_at,
            created_by=created_by,
            restored_from_revision_id=restored_from_revision_id,
        )
    )


def _page_detail(db: Session, *, page: WikiPage) -> WikiPageDetailOut:
    pages = _load_pages(db)
    child_count = _child_count_by_parent_id(pages).get(page.page_id, 0)
    summary = _serialize_summary(page, child_count=child_count)
    revisions = (
        db.execute(
            select(WikiPageRevision)
            .where(WikiPageRevision.page_id == page.page_id)
            .order_by(WikiPageRevision.version.desc(), WikiPageRevision.revision_id.desc())
            .limit(MAX_RECENT_REVISIONS)
        )
        .scalars()
        .all()
    )
    return WikiPageDetailOut(
        **summary.model_dump(),
        content_markdown=page.content_markdown,
        recent_revisions=[_serialize_revision(revision) for revision in revisions],
    )


def _update_change_summary(
    *,
    previous_title: str,
    previous_parent_page_id: str | None,
    previous_content_markdown: str,
    previous_sort_order: int,
    page: WikiPage,
    pages_by_id: dict[str, WikiPage],
) -> list[str]:
    change_summary: list[str] = []

    if page.title != previous_title:
        change_summary.append(f"Renamed page to '{page.title}'.")

    if page.parent_page_id != previous_parent_page_id:
        if page.parent_page_id is None:
            change_summary.append("Moved page to the top level.")
        else:
            parent_title = pages_by_id[page.parent_page_id].title
            change_summary.append(f"Moved page under '{parent_title}'.")

    if page.sort_order != previous_sort_order:
        change_summary.append("Adjusted page ordering.")

    if page.content_markdown != previous_content_markdown:
        if not previous_content_markdown.strip() and page.content_markdown.strip():
            change_summary.append("Added page content.")
        elif previous_content_markdown.strip() and not page.content_markdown.strip():
            change_summary.append("Cleared page content.")
        else:
            change_summary.append("Updated page content.")

    return change_summary or ["Saved page changes."]


def list_wiki_pages(db: Session) -> WikiPageIndexOut:
    pages = _load_pages(db)
    child_counts = _child_count_by_parent_id(pages)
    return WikiPageIndexOut(
        pages=[_serialize_summary(page, child_count=child_counts.get(page.page_id, 0)) for page in pages]
    )


def get_wiki_page_detail(db: Session, *, page_id: str) -> WikiPageDetailOut:
    page = _load_page_or_raise(db, page_id=page_id)
    return _page_detail(db, page=page)


def create_wiki_page(
    db: Session,
    *,
    actor_id: str,
    payload: WikiPageCreate,
) -> WikiPageDetailOut:
    pages = _load_pages(db)
    pages_by_id = {page.page_id: page for page in pages}
    _validate_parent_page(pages_by_id, page_id=None, parent_page_id=payload.parent_page_id)

    now = datetime.now(timezone.utc)
    page = WikiPage(
        page_id=str(uuid4()),
        parent_page_id=payload.parent_page_id,
        title=payload.title,
        content_markdown=payload.content_markdown,
        sort_order=payload.sort_order if payload.sort_order is not None else _next_sort_order(
            pages,
            parent_page_id=payload.parent_page_id,
        ),
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )
    db.add(page)
    db.flush()
    _record_revision(
        db,
        page=page,
        created_by=actor_id,
        change_summary=["Created wiki page."],
    )
    db.flush()
    return _page_detail(db, page=page)


def update_wiki_page(
    db: Session,
    *,
    page_id: str,
    actor_id: str,
    changes: dict[str, object | None],
) -> WikiPageDetailOut:
    page = _load_page_or_raise(db, page_id=page_id)
    pages = _load_pages(db)
    pages_by_id = {entry.page_id: entry for entry in pages}

    next_parent_page_id = (
        changes["parent_page_id"] if "parent_page_id" in changes else page.parent_page_id
    )
    assert next_parent_page_id is None or isinstance(next_parent_page_id, str)
    _validate_parent_page(pages_by_id, page_id=page_id, parent_page_id=next_parent_page_id)

    previous_title = page.title
    previous_parent_page_id = page.parent_page_id
    previous_content_markdown = page.content_markdown
    previous_sort_order = page.sort_order

    effective_change = False

    if "title" in changes and changes["title"] != page.title:
        page.title = str(changes["title"])
        effective_change = True

    if "parent_page_id" in changes and changes["parent_page_id"] != page.parent_page_id:
        page.parent_page_id = next_parent_page_id
        effective_change = True

    if "content_markdown" in changes and changes["content_markdown"] != page.content_markdown:
        page.content_markdown = str(changes["content_markdown"])
        effective_change = True

    if "sort_order" in changes:
        next_sort_order = int(changes["sort_order"]) if changes["sort_order"] is not None else page.sort_order
        if next_sort_order != page.sort_order:
            page.sort_order = next_sort_order
            effective_change = True

    if not effective_change:
        return _page_detail(db, page=page)

    now = datetime.now(timezone.utc)
    page.updated_at = now
    page.updated_by = actor_id
    page.version += 1

    change_summary = _update_change_summary(
        previous_title=previous_title,
        previous_parent_page_id=previous_parent_page_id,
        previous_content_markdown=previous_content_markdown,
        previous_sort_order=previous_sort_order,
        page=page,
        pages_by_id=pages_by_id,
    )
    db.flush()
    _record_revision(db, page=page, created_by=actor_id, change_summary=change_summary)
    db.flush()
    return _page_detail(db, page=page)


def restore_wiki_page_revision(
    db: Session,
    *,
    page_id: str,
    revision_id: int,
    actor_id: str,
) -> WikiPageDetailOut:
    page = _load_page_or_raise(db, page_id=page_id)
    revision = db.get(WikiPageRevision, revision_id)
    if revision is None or revision.page_id != page_id:
        raise LookupError(f"Wiki page revision '{revision_id}' was not found")

    pages = _load_pages(db)
    pages_by_id = {entry.page_id: entry for entry in pages}
    _validate_parent_page(
        pages_by_id,
        page_id=page_id,
        parent_page_id=revision.parent_page_id,
    )

    now = datetime.now(timezone.utc)
    page.parent_page_id = revision.parent_page_id
    page.title = revision.title
    page.content_markdown = revision.content_markdown
    page.sort_order = revision.sort_order
    page.updated_at = now
    page.updated_by = actor_id
    page.version += 1

    db.flush()
    _record_revision(
        db,
        page=page,
        created_by=actor_id,
        change_summary=[f"Restored from revision {revision_id}."],
        restored_from_revision_id=revision_id,
    )
    db.flush()
    return _page_detail(db, page=page)
