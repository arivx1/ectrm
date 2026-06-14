from __future__ import annotations

import re
from dataclasses import dataclass
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
    WikiPageLinkOut,
    WikiPageRevisionOut,
    WikiPageSearchOut,
    WikiPageSearchResultOut,
    WikiPageSummaryOut,
)

MAX_RECENT_REVISIONS = 12
MAX_WIKI_SEARCH_LIMIT = 25
WIKI_LINK_SNIPPET_CHARS = 180
WIKI_SEARCH_SNIPPET_CHARS = 220
WIKI_PAGE_LINK_PATTERN = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")
WIKI_SEARCH_TOKEN_PATTERN = re.compile(r"[a-z0-9][a-z0-9_-]*", re.IGNORECASE)
WIKI_SEARCH_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "how",
    "i",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "our",
    "the",
    "this",
    "to",
    "what",
    "when",
    "where",
    "with",
}


@dataclass(frozen=True)
class WikiPageSearchMatch:
    page: WikiPage
    score: float
    snippet: str
    matched_terms: tuple[str, ...]
    match_reasons: tuple[str, ...]


def _normalize_wiki_link_value(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).casefold()


def _rewrite_wiki_links_for_renamed_page(
    markdown: str,
    *,
    page_id: str,
    previous_title: str,
    next_title: str,
) -> str:
    previous_title_key = _normalize_wiki_link_value(previous_title)

    def replace_link(match: re.Match[str]) -> str:
        label = match.group(1).strip()
        target = (match.group(2) or "").strip()
        label_key = _normalize_wiki_link_value(label)
        target_key = _normalize_wiki_link_value(target)

        if target:
            if target == page_id:
                next_label = next_title if label_key == previous_title_key else label
                return f"[[{next_label}|{page_id}]]"
            if target_key == previous_title_key:
                return f"[[{label}|{page_id}]]"
            return match.group(0)

        if label_key == previous_title_key:
            return f"[[{next_title}|{page_id}]]"
        return match.group(0)

    return WIKI_PAGE_LINK_PATTERN.sub(replace_link, markdown)


def _parse_wiki_page_links(markdown: str) -> list[WikiPageLinkOut]:
    links: list[WikiPageLinkOut] = []

    for match in WIKI_PAGE_LINK_PATTERN.finditer(markdown):
        label = match.group(1).strip()
        target = (match.group(2) or label).strip()
        links.append(
            WikiPageLinkOut(
                label=label,
                target=target,
                snippet=_wiki_link_snippet(markdown, match=match, label=label, target=target),
            ),
        )

    return links


def _wiki_link_snippet(
    markdown: str,
    *,
    match: re.Match[str],
    label: str,
    target: str,
) -> str:
    line_start = markdown.rfind("\n", 0, match.start()) + 1
    line_end = markdown.find("\n", match.end())
    if line_end < 0:
        line_end = len(markdown)

    context = _plain_text_from_markdown(markdown[line_start:line_end])
    if not context:
        return label or target

    if len(context) <= WIKI_LINK_SNIPPET_CHARS:
        return context

    match_index = _find_first_match_index(context, [label, target])
    start = max(0, match_index - 60)
    end = min(len(context), start + WIKI_LINK_SNIPPET_CHARS)
    start = max(0, end - WIKI_LINK_SNIPPET_CHARS)
    snippet = context[start:end].strip()
    if start > 0:
        snippet = f"...{snippet}"
    if end < len(context):
        snippet = f"{snippet}..."
    return snippet or label or target


def _normalize_search_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).casefold()


def _tokenize_wiki_search_query(query: str) -> list[str]:
    tokens: list[str] = []
    seen: set[str] = set()

    for match in WIKI_SEARCH_TOKEN_PATTERN.finditer(query):
        token = match.group(0).casefold()
        if len(token) < 2 or token in WIKI_SEARCH_STOP_WORDS or token in seen:
            continue
        seen.add(token)
        tokens.append(token)

    return tokens


def _plain_text_from_markdown(markdown: str) -> str:
    text = markdown.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
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


def _plain_text_without_wiki_link_labels(markdown: str) -> str:
    return _plain_text_from_markdown(WIKI_PAGE_LINK_PATTERN.sub(" ", markdown))


def _first_unique_values(values: list[str]) -> tuple[str, ...]:
    seen: set[str] = set()
    unique_values: list[str] = []
    for value in values:
        normalized = _normalize_search_text(value)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique_values.append(value)
    return tuple(unique_values)


def _find_first_match_index(text: str, candidates: list[str]) -> int:
    normalized_text = _normalize_search_text(text)
    best_index: int | None = None

    for candidate in candidates:
        normalized_candidate = _normalize_search_text(candidate)
        if not normalized_candidate:
            continue

        next_index = normalized_text.find(normalized_candidate)
        if next_index < 0:
            continue
        if best_index is None or next_index < best_index:
            best_index = next_index

    return best_index if best_index is not None else 0


def _wiki_search_snippet(page: WikiPage, *, normalized_query: str, tokens: list[str]) -> str:
    plain_text = _plain_text_from_markdown(page.content_markdown)
    if not plain_text:
        return page.title

    candidates = [normalized_query, *tokens]
    match_index = _find_first_match_index(plain_text, candidates)
    start = max(0, match_index - 70)
    end = min(len(plain_text), start + WIKI_SEARCH_SNIPPET_CHARS)
    start = max(0, end - WIKI_SEARCH_SNIPPET_CHARS)
    snippet = plain_text[start:end].strip()
    if start > 0:
        snippet = f"...{snippet}"
    if end < len(plain_text):
        snippet = f"{snippet}..."
    return snippet or page.title


def _score_wiki_page_for_query(
    page: WikiPage,
    *,
    query: str,
    tokens: list[str],
) -> WikiPageSearchMatch | None:
    normalized_query = _normalize_search_text(query)
    title_text = page.title
    content_text = _plain_text_without_wiki_link_labels(page.content_markdown)
    link_text = " ".join(
        f"{link.label} {link.target}" for link in _parse_wiki_page_links(page.content_markdown)
    )
    page_id_text = page.page_id

    normalized_title = _normalize_search_text(title_text)
    normalized_content = _normalize_search_text(content_text)
    normalized_links = _normalize_search_text(link_text)
    normalized_page_id = _normalize_search_text(page_id_text)

    score = 0.0
    matched_terms: list[str] = []
    match_reasons: list[str] = []

    if normalized_query:
        if normalized_query == normalized_page_id:
            score += 140
            matched_terms.append(query.strip())
            match_reasons.append("page_id")
        elif normalized_query in normalized_page_id:
            score += 80
            matched_terms.append(query.strip())
            match_reasons.append("page_id")

        if normalized_query in normalized_title:
            score += 120
            matched_terms.append(query.strip())
            match_reasons.append("title phrase")
        if normalized_query in normalized_content:
            score += 70
            matched_terms.append(query.strip())
            match_reasons.append("content phrase")
        if normalized_query in normalized_links:
            score += 34
            matched_terms.append(query.strip())
            match_reasons.append("wiki link")

    for token in tokens:
        token_score = 0.0
        if token in normalized_page_id:
            token_score += 48
        if token in normalized_title:
            token_score += 36
        if token in normalized_links:
            token_score += 24
        if token in normalized_content:
            token_score += 10

        if token_score <= 0:
            continue

        score += token_score
        matched_terms.append(token)

        if token in normalized_title:
            match_reasons.append("title")
        elif token in normalized_links:
            match_reasons.append("wiki link")
        elif token in normalized_page_id:
            match_reasons.append("page_id")
        else:
            match_reasons.append("content")

    if score <= 0:
        return None

    if page.archived_at is not None:
        score -= 12

    return WikiPageSearchMatch(
        page=page,
        score=round(max(score, 0.0), 2),
        snippet=_wiki_search_snippet(page, normalized_query=normalized_query, tokens=tokens),
        matched_terms=_first_unique_values(matched_terms),
        match_reasons=_first_unique_values(match_reasons),
    )


def rank_wiki_pages_for_query(
    pages: list[WikiPage],
    *,
    query: str,
    limit: int = 10,
) -> list[WikiPageSearchMatch]:
    normalized_query = query.strip()
    bounded_limit = max(1, min(limit, MAX_WIKI_SEARCH_LIMIT))
    tokens = _tokenize_wiki_search_query(normalized_query)

    if not normalized_query or not tokens:
        recent_pages = sorted(
            pages,
            key=lambda page: (
                page.archived_at is None,
                page.updated_at,
                -page.sort_order,
                page.title.casefold(),
            ),
            reverse=True,
        )
        return [
            WikiPageSearchMatch(
                page=page,
                score=0.0,
                snippet=_wiki_search_snippet(page, normalized_query="", tokens=[]),
                matched_terms=(),
                match_reasons=("recent",),
            )
            for page in recent_pages[:bounded_limit]
        ]

    matches = [
        match
        for page in pages
        if (match := _score_wiki_page_for_query(page, query=normalized_query, tokens=tokens))
        is not None
    ]
    matches.sort(
        key=lambda match: (
            match.score,
            match.page.archived_at is None,
            match.page.updated_at,
            -match.page.sort_order,
            match.page.title.casefold(),
        ),
        reverse=True,
    )
    return matches[:bounded_limit]


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
        links=_parse_wiki_page_links(page.content_markdown),
        child_count=child_count,
        word_count=_word_count(page.content_markdown),
        sort_order=page.sort_order,
        created_at=page.created_at,
        created_by=page.created_by,
        updated_at=page.updated_at,
        updated_by=page.updated_by,
        is_archived=page.archived_at is not None,
        archived_at=page.archived_at,
        archived_by=page.archived_by,
        version=page.version,
    )


def _serialize_search_result(
    match: WikiPageSearchMatch,
    *,
    child_count: int,
) -> WikiPageSearchResultOut:
    return WikiPageSearchResultOut(
        page=_serialize_summary(match.page, child_count=child_count),
        score=match.score,
        snippet=match.snippet,
        matched_terms=list(match.matched_terms),
        match_reasons=list(match.match_reasons),
    )


def _load_page_or_raise(db: Session, *, page_id: str) -> WikiPage:
    page = db.get(WikiPage, page_id)
    if page is None:
        raise LookupError(f"Wiki page '{page_id}' was not found")
    return page


def _load_pages(db: Session, *, include_archived: bool = True) -> list[WikiPage]:
    statement = select(WikiPage)
    if not include_archived:
        statement = statement.where(WikiPage.archived_at.is_(None))
    return (
        db.execute(
            statement.order_by(WikiPage.sort_order.asc(), WikiPage.title.asc(), WikiPage.page_id.asc())
        )
        .scalars()
        .all()
    )


def _is_archived(page: WikiPage) -> bool:
    return page.archived_at is not None


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

    if _is_archived(pages_by_id[parent_page_id]):
        raise ValueError("Archived wiki pages cannot accept child pages")

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


def _load_descendant_pages(pages_by_id: dict[str, WikiPage], *, root_page_id: str) -> list[WikiPage]:
    descendants: list[WikiPage] = []
    queue = [root_page_id]

    while queue:
        current_page_id = queue.pop(0)
        current_children = [
            page for page in pages_by_id.values() if page.parent_page_id == current_page_id
        ]
        current_children.sort(key=lambda page: (page.sort_order, page.title, page.page_id))
        descendants.extend(current_children)
        queue.extend(page.page_id for page in current_children)

    return descendants


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
    pages = [
        entry
        for entry in _load_pages(db)
        if _is_archived(entry) == _is_archived(page)
    ]
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


def list_wiki_pages(
    db: Session,
    *,
    include_archived: bool = False,
) -> WikiPageIndexOut:
    pages = _load_pages(db, include_archived=include_archived)
    active_pages = [page for page in pages if not _is_archived(page)]
    archived_pages = [page for page in pages if _is_archived(page)]
    active_child_counts = _child_count_by_parent_id(active_pages)
    archived_child_counts = _child_count_by_parent_id(archived_pages)
    return WikiPageIndexOut(
        pages=[
            _serialize_summary(
                page,
                child_count=(
                    archived_child_counts.get(page.page_id, 0)
                    if _is_archived(page)
                    else active_child_counts.get(page.page_id, 0)
                ),
            )
            for page in pages
        ]
    )


def search_wiki_pages(
    db: Session,
    *,
    query: str,
    include_archived: bool = False,
    limit: int = 10,
) -> WikiPageSearchOut:
    normalized_query = query.strip()
    pages = _load_pages(db, include_archived=include_archived)
    matches = rank_wiki_pages_for_query(pages, query=normalized_query, limit=limit)
    active_child_counts = _child_count_by_parent_id([page for page in pages if not _is_archived(page)])
    archived_child_counts = _child_count_by_parent_id([page for page in pages if _is_archived(page)])

    return WikiPageSearchOut(
        query=normalized_query,
        result_count=len(matches),
        results=[
            _serialize_search_result(
                match,
                child_count=(
                    archived_child_counts.get(match.page.page_id, 0)
                    if _is_archived(match.page)
                    else active_child_counts.get(match.page.page_id, 0)
                ),
            )
            for match in matches
        ],
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
        archived_at=None,
        archived_by=None,
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
    if _is_archived(page):
        raise ValueError("Archived wiki pages must be restored before editing")
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
    rewritten_link_pages: list[WikiPage] = []

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

    if page.title != previous_title:
        for linked_page in pages:
            rewritten_content = _rewrite_wiki_links_for_renamed_page(
                linked_page.content_markdown,
                page_id=page.page_id,
                previous_title=previous_title,
                next_title=page.title,
            )
            if rewritten_content == linked_page.content_markdown:
                continue

            linked_page.content_markdown = rewritten_content
            if linked_page.page_id != page.page_id:
                rewritten_link_pages.append(linked_page)

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

    for linked_page in rewritten_link_pages:
        linked_page.updated_at = now
        linked_page.updated_by = actor_id
        linked_page.version += 1

    db.flush()
    _record_revision(db, page=page, created_by=actor_id, change_summary=change_summary)
    for linked_page in rewritten_link_pages:
        _record_revision(
            db,
            page=linked_page,
            created_by=actor_id,
            change_summary=[f"Updated wiki links for renamed page '{page.title}'."],
        )
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
    if _is_archived(page):
        raise ValueError("Archived wiki pages must be restored before applying a revision")
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


def archive_wiki_page(
    db: Session,
    *,
    page_id: str,
    actor_id: str,
) -> WikiPageDetailOut:
    page = _load_page_or_raise(db, page_id=page_id)
    if _is_archived(page):
        return _page_detail(db, page=page)

    pages = _load_pages(db)
    pages_by_id = {entry.page_id: entry for entry in pages}
    target_pages = [page, *_load_descendant_pages(pages_by_id, root_page_id=page_id)]
    now = datetime.now(timezone.utc)
    root_title = page.title

    for target_page in target_pages:
        target_page.archived_at = now
        target_page.archived_by = actor_id
        target_page.updated_at = now
        target_page.updated_by = actor_id
        target_page.version += 1
        _record_revision(
            db,
            page=target_page,
            created_by=actor_id,
            change_summary=[
                "Archived page."
                if target_page.page_id == page_id
                else f"Archived with parent page '{root_title}'."
            ],
        )

    db.flush()
    return _page_detail(db, page=page)


def restore_archived_wiki_page(
    db: Session,
    *,
    page_id: str,
    actor_id: str,
) -> WikiPageDetailOut:
    page = _load_page_or_raise(db, page_id=page_id)
    if not _is_archived(page):
        return _page_detail(db, page=page)

    pages = _load_pages(db)
    pages_by_id = {entry.page_id: entry for entry in pages}
    if page.parent_page_id is not None:
        parent_page = pages_by_id.get(page.parent_page_id)
        if parent_page is not None and _is_archived(parent_page):
            raise ValueError("Restore the archived parent page before restoring this page")

    target_pages = [page, *_load_descendant_pages(pages_by_id, root_page_id=page_id)]
    now = datetime.now(timezone.utc)
    root_title = page.title

    for target_page in target_pages:
        target_page.archived_at = None
        target_page.archived_by = None
        target_page.updated_at = now
        target_page.updated_by = actor_id
        target_page.version += 1
        _record_revision(
            db,
            page=target_page,
            created_by=actor_id,
            change_summary=[
                "Restored page from archive."
                if target_page.page_id == page_id
                else f"Restored with parent page '{root_title}'."
            ],
        )

    db.flush()
    return _page_detail(db, page=page)
