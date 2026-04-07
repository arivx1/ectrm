from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.domains.documents.services.ingestion import get_document_ingestion
from apps.api.app.domains.documents.services.ingestion import get_document_page_preview_path
from apps.api.app.domains.documents.services.ingestion import ingest_pdf_document
from apps.api.app.domains.documents.services.ingestion import list_document_ingestions
from apps.api.app.domains.documents.services.ingestion import list_document_schema_registry
from apps.api.app.domains.documents.services.ingestion import reprocess_document_ingestion
from apps.api.app.domains.documents.services.ingestion import run_document_processing_job
from apps.api.app.domains.documents.services.ingestion import update_document_ingestion
from apps.api.app.domains.documents.services.ingestion import update_document_ingestion_page
from apps.api.app.schemas.document import DocumentIngestionOut
from apps.api.app.schemas.document import DocumentIngestionPageUpdate
from apps.api.app.schemas.document import DocumentIngestionUpdate
from apps.api.app.schemas.document import DocumentSchemaRegistryOut

router = APIRouter(prefix="/documents", tags=["documents"])


def _require_authenticated_actor(request: Request) -> str:
    actor_id = getattr(request.state, "actor_id", None)
    if not actor_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")
    return actor_id


@router.get("/schema-registry", response_model=DocumentSchemaRegistryOut)
def get_document_schema_registry(
    request: Request,
) -> DocumentSchemaRegistryOut:
    _require_authenticated_actor(request)
    return list_document_schema_registry()


@router.get("", response_model=list[DocumentIngestionOut])
def get_documents(
    request: Request,
    limit: int = Query(default=50, ge=1, le=250),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[DocumentIngestionOut]:
    _require_authenticated_actor(request)
    return list_document_ingestions(db, limit=limit, offset=offset)


@router.get("/{document_id}", response_model=DocumentIngestionOut)
def get_document(
    document_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> DocumentIngestionOut:
    _require_authenticated_actor(request)
    try:
        return get_document_ingestion(db, document_id=document_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/{document_id}", response_model=DocumentIngestionOut)
def patch_document(
    document_id: str,
    payload: DocumentIngestionUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DocumentIngestionOut:
    actor_id = _require_authenticated_actor(request)
    changes = payload.model_dump(exclude_unset=True)
    try:
        document = update_document_ingestion(
            db,
            document_id=document_id,
            actor_id=actor_id,
            changes=changes,
        )
        db.commit()
        return document
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.patch("/{document_id}/pages/{page_id}", response_model=DocumentIngestionOut)
def patch_document_page(
    document_id: str,
    page_id: int,
    payload: DocumentIngestionPageUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DocumentIngestionOut:
    actor_id = _require_authenticated_actor(request)
    changes = payload.model_dump(exclude_unset=True)
    try:
        document = update_document_ingestion_page(
            db,
            document_id=document_id,
            page_id=page_id,
            actor_id=actor_id,
            changes=changes,
        )
        db.commit()
        return document
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.get("/{document_id}/pages/{page_id}/preview")
def get_document_page_preview(
    document_id: str,
    page_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> FileResponse:
    _require_authenticated_actor(request)
    try:
        preview_path = get_document_page_preview_path(
            db,
            document_id=document_id,
            page_id=page_id,
        )
        return FileResponse(
            preview_path,
            media_type="image/png",
            filename=f"document-{document_id}-page-{page_id}.png",
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/uploads", response_model=DocumentIngestionOut, status_code=status.HTTP_201_CREATED)
async def post_document_upload(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    display_name: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> DocumentIngestionOut:
    actor_id = _require_authenticated_actor(request)
    try:
        payload = await file.read()
        document = ingest_pdf_document(
            db,
            actor_id=actor_id,
            filename=file.filename or "document.pdf",
            content_type=file.content_type,
            payload=payload,
            display_name=display_name,
        )
        db.commit()
        background_tasks.add_task(
            run_document_processing_job,
            request.app.state.session_factory,
            document_id=document.document_id,
        )
        return document
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.post("/{document_id}/reprocess", response_model=DocumentIngestionOut, status_code=status.HTTP_202_ACCEPTED)
def post_document_reprocess(
    document_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> DocumentIngestionOut:
    actor_id = _require_authenticated_actor(request)
    try:
        document = reprocess_document_ingestion(
            db,
            document_id=document_id,
            actor_id=actor_id,
        )
        db.commit()
        background_tasks.add_task(
            run_document_processing_job,
            request.app.state.session_factory,
            document_id=document_id,
        )
        return document
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise
