from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from apps.api.app.core.http import (
    NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
    NOT_FOUND_ERROR_STATUS_CODES,
    changes_from_payload,
    execute_http_action,
    require_authenticated_actor,
)
from apps.api.app.deps.db import get_db
from apps.api.app.domains.wiki.services.pages import (
    archive_wiki_page,
    create_wiki_page,
    get_wiki_page_detail,
    list_wiki_pages,
    restore_archived_wiki_page,
    restore_wiki_page_revision,
    search_wiki_pages,
    update_wiki_page,
)
from apps.api.app.schemas.wiki import (
    WikiPageCreate,
    WikiPageDetailOut,
    WikiPageIndexOut,
    WikiPageRestore,
    WikiPageSearchOut,
    WikiPageUpdate,
)

router = APIRouter(prefix="/wiki", tags=["wiki"])


@router.get("/pages", response_model=WikiPageIndexOut)
def get_wiki_pages(
    request: Request,
    include_archived: bool = False,
    db: Session = Depends(get_db),
) -> WikiPageIndexOut:
    require_authenticated_actor(request)
    return list_wiki_pages(db, include_archived=include_archived)


@router.get("/pages/search", response_model=WikiPageSearchOut)
def search_wiki_page_index(
    request: Request,
    q: str = Query(..., min_length=1, max_length=300),
    include_archived: bool = False,
    limit: int = Query(default=10, ge=1, le=25),
    db: Session = Depends(get_db),
) -> WikiPageSearchOut:
    require_authenticated_actor(request)
    return search_wiki_pages(
        db,
        query=q,
        include_archived=include_archived,
        limit=limit,
    )


@router.get("/pages/{page_id}", response_model=WikiPageDetailOut)
def get_wiki_page(
    page_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> WikiPageDetailOut:
    require_authenticated_actor(request)
    return execute_http_action(
        db,
        lambda: get_wiki_page_detail(db, page_id=page_id),
        handled_exceptions=NOT_FOUND_ERROR_STATUS_CODES,
    )


@router.post("/pages", response_model=WikiPageDetailOut, status_code=201)
def post_wiki_page(
    payload: WikiPageCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> WikiPageDetailOut:
    actor_id = require_authenticated_actor(request)
    return execute_http_action(
        db,
        lambda: create_wiki_page(db, actor_id=actor_id, payload=payload),
        commit=True,
        handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
    )


@router.patch("/pages/{page_id}", response_model=WikiPageDetailOut)
def patch_wiki_page(
    page_id: str,
    payload: WikiPageUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> WikiPageDetailOut:
    actor_id = require_authenticated_actor(request)
    changes = changes_from_payload(
        payload,
        empty_detail="Provide at least one wiki page field to update.",
    )
    return execute_http_action(
        db,
        lambda: update_wiki_page(
            db,
            page_id=page_id,
            actor_id=actor_id,
            changes=changes,
        ),
        commit=True,
        handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
    )


@router.post("/pages/{page_id}/revisions/{revision_id}/restore", response_model=WikiPageDetailOut)
def post_wiki_page_restore(
    page_id: str,
    revision_id: int,
    payload: WikiPageRestore,
    request: Request,
    db: Session = Depends(get_db),
) -> WikiPageDetailOut:
    require_authenticated_actor(request)
    return execute_http_action(
        db,
        lambda: restore_wiki_page_revision(
            db,
            page_id=page_id,
            revision_id=revision_id,
            actor_id=payload.restored_by,
        ),
        commit=True,
        handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
    )


@router.post("/pages/{page_id}/archive", response_model=WikiPageDetailOut)
def post_wiki_page_archive(
    page_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> WikiPageDetailOut:
    actor_id = require_authenticated_actor(request)
    return execute_http_action(
        db,
        lambda: archive_wiki_page(db, page_id=page_id, actor_id=actor_id),
        commit=True,
        handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
    )


@router.post("/pages/{page_id}/unarchive", response_model=WikiPageDetailOut)
def post_wiki_page_unarchive(
    page_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> WikiPageDetailOut:
    actor_id = require_authenticated_actor(request)
    return execute_http_action(
        db,
        lambda: restore_archived_wiki_page(db, page_id=page_id, actor_id=actor_id),
        commit=True,
        handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
    )
