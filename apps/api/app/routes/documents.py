from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_operations_role
from apps.api.app.core.auth import is_settlement_role
from apps.api.app.core.http import execute_http_action
from apps.api.app.core.http import NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES
from apps.api.app.core.http import NOT_FOUND_ERROR_STATUS_CODES
from apps.api.app.core.http import require_actor_role
from apps.api.app.core.http import require_authenticated_actor
from apps.api.app.core.http import VALIDATION_ERROR_STATUS_CODES
from apps.api.app.deps.db import get_db
from apps.api.app.domains.integrations.services.gmail_inbox import (
    GmailInboxIntegrationError,
    get_gmail_inbox_message_detail,
    import_gmail_inbox_documents,
    list_gmail_inbox_messages,
)
from apps.api.app.domains.documents.services.document_action_execution import execute_document_action_plan
from apps.api.app.domains.documents.services.ingestion import get_document_ingestion
from apps.api.app.domains.documents.services.ingestion import get_document_page_preview_path
from apps.api.app.domains.documents.services.ingestion import get_document_source_file_details
from apps.api.app.domains.documents.services.ingestion import ingest_pdf_document
from apps.api.app.domains.documents.services.ingestion import list_document_ingestions
from apps.api.app.domains.documents.services.ingestion import build_document_processor_runtime_settings
from apps.api.app.domains.documents.services.ingestion import list_document_schema_registry
from apps.api.app.domains.documents.services.ingestion import reprocess_document_ingestion
from apps.api.app.domains.documents.services.ingestion import run_document_processing_job
from apps.api.app.domains.documents.services.ingestion import update_document_ingestion
from apps.api.app.domains.documents.services.ingestion import update_document_ingestion_page
from apps.api.app.schemas.document import DocumentIngestionOut
from apps.api.app.schemas.document import DocumentGmailInboxBrowseResultOut
from apps.api.app.schemas.document import DocumentGmailInboxMessageDetailOut
from apps.api.app.schemas.document import DocumentGmailInboxImportRequest
from apps.api.app.schemas.document import DocumentGmailInboxImportResultOut
from apps.api.app.schemas.document import DocumentIngestionPageUpdate
from apps.api.app.schemas.document import DocumentIngestionProcessRequest
from apps.api.app.schemas.document import DocumentProcessorSelection
from apps.api.app.schemas.document import DocumentProcessorRuntimeSettingsOut
from apps.api.app.schemas.document import DocumentIngestionUpdate
from apps.api.app.schemas.document import DocumentSchemaRegistryOut

router = APIRouter(prefix="/documents", tags=["documents"])


def _can_execute_document_actions(role: str | None) -> bool:
    return is_operations_role(role) or is_settlement_role(role)


@router.get("/settings", response_model=DocumentProcessorRuntimeSettingsOut)
def get_document_processor_settings(
    request: Request,
) -> DocumentProcessorRuntimeSettingsOut:
    require_authenticated_actor(request)
    return build_document_processor_runtime_settings()


@router.get("/schema-registry", response_model=DocumentSchemaRegistryOut)
def get_document_schema_registry(
    request: Request,
) -> DocumentSchemaRegistryOut:
    require_authenticated_actor(request)
    return list_document_schema_registry()


@router.get("", response_model=list[DocumentIngestionOut])
def get_documents(
    request: Request,
    limit: int = Query(default=50, ge=1, le=250),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[DocumentIngestionOut]:
    require_authenticated_actor(request)
    return list_document_ingestions(db, limit=limit, offset=offset)


@router.get("/gmail/messages", response_model=DocumentGmailInboxBrowseResultOut)
def get_gmail_messages(
    request: Request,
    query: str | None = Query(default=None, max_length=500),
    page_size: int = Query(default=20, ge=1, le=50),
    page_token: str | None = Query(default=None, max_length=500),
    db: Session = Depends(get_db),
) -> DocumentGmailInboxBrowseResultOut:
    require_authenticated_actor(request)

    try:
        return list_gmail_inbox_messages(
            db,
            query_override=query,
            page_size=page_size,
            page_token=page_token,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except GmailInboxIntegrationError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.get("/gmail/messages/{message_id}", response_model=DocumentGmailInboxMessageDetailOut)
def get_gmail_message_detail(
    message_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> DocumentGmailInboxMessageDetailOut:
    require_authenticated_actor(request)

    try:
        return get_gmail_inbox_message_detail(
            db,
            message_id=message_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except GmailInboxIntegrationError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.get("/{document_id}", response_model=DocumentIngestionOut)
def get_document(
    document_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> DocumentIngestionOut:
    require_authenticated_actor(request)

    def load_document() -> DocumentIngestionOut:
        return get_document_ingestion(db, document_id=document_id)

    return execute_http_action(
        db,
        load_document,
        handled_exceptions=NOT_FOUND_ERROR_STATUS_CODES,
    )


@router.patch("/{document_id}", response_model=DocumentIngestionOut)
def patch_document(
    document_id: str,
    payload: DocumentIngestionUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DocumentIngestionOut:
    actor_id = require_authenticated_actor(request)
    changes = payload.model_dump(exclude_unset=True)

    def update_document() -> DocumentIngestionOut:
        return update_document_ingestion(
            db,
            document_id=document_id,
            actor_id=actor_id,
            changes=changes,
        )

    return execute_http_action(
        db,
        update_document,
        commit=True,
        handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
    )


@router.patch("/{document_id}/pages/{page_id}", response_model=DocumentIngestionOut)
def patch_document_page(
    document_id: str,
    page_id: int,
    payload: DocumentIngestionPageUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> DocumentIngestionOut:
    actor_id = require_authenticated_actor(request)
    changes = payload.model_dump(exclude_unset=True)

    def update_page() -> DocumentIngestionOut:
        return update_document_ingestion_page(
            db,
            document_id=document_id,
            page_id=page_id,
            actor_id=actor_id,
            changes=changes,
        )

    return execute_http_action(
        db,
        update_page,
        commit=True,
        handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
    )


@router.get("/{document_id}/pages/{page_id}/preview")
def get_document_page_preview(
    document_id: str,
    page_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> FileResponse:
    require_authenticated_actor(request)

    def load_preview_path() -> str:
        return get_document_page_preview_path(
            db,
            document_id=document_id,
            page_id=page_id,
        )

    preview_path = execute_http_action(
        db,
        load_preview_path,
        handled_exceptions=NOT_FOUND_ERROR_STATUS_CODES,
    )
    return FileResponse(
        preview_path,
        media_type="image/png",
        filename=f"document-{document_id}-page-{page_id}.png",
    )


@router.get("/{document_id}/source")
def get_document_source(
    document_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> FileResponse:
    require_authenticated_actor(request)

    def load_source_file() -> tuple[str, str, str]:
        source_path, media_type, filename = get_document_source_file_details(
            db,
            document_id=document_id,
        )
        return str(source_path), media_type, filename

    source_path, media_type, filename = execute_http_action(
        db,
        load_source_file,
        handled_exceptions=NOT_FOUND_ERROR_STATUS_CODES,
    )
    return FileResponse(
        source_path,
        media_type=media_type or "application/pdf",
        filename=filename,
    )


@router.post("/uploads", response_model=DocumentIngestionOut, status_code=status.HTTP_201_CREATED)
async def post_document_upload(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    display_name: str | None = Form(default=None),
    processor_provider: DocumentProcessorSelection | None = Form(default=None),
    processor_model: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> DocumentIngestionOut:
    actor_id = require_authenticated_actor(request)
    payload = await file.read()

    def ingest_document() -> DocumentIngestionOut:
        return ingest_pdf_document(
            db,
            actor_id=actor_id,
            filename=file.filename or "document.pdf",
            content_type=file.content_type,
            payload=payload,
            display_name=display_name,
            processor_provider=processor_provider,
            processor_model=processor_model,
        )

    document = execute_http_action(
        db,
        ingest_document,
        commit=True,
        handled_exceptions=VALIDATION_ERROR_STATUS_CODES,
    )
    background_tasks.add_task(
        run_document_processing_job,
        request.app.state.session_factory,
        document_id=document.document_id,
    )
    return document


@router.post("/{document_id}/reprocess", response_model=DocumentIngestionOut, status_code=status.HTTP_202_ACCEPTED)
def post_document_reprocess(
    document_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    payload: DocumentIngestionProcessRequest | None = Body(default=None),
    db: Session = Depends(get_db),
) -> DocumentIngestionOut:
    actor_id = require_authenticated_actor(request)
    changes = payload.model_dump(exclude_unset=True) if payload is not None else {}

    def reprocess_document() -> DocumentIngestionOut:
        return reprocess_document_ingestion(
            db,
            document_id=document_id,
            actor_id=actor_id,
            processor_provider=changes.get("processor_provider"),
            processor_model=changes.get("processor_model"),
            processor_provider_specified="processor_provider" in changes,
            processor_model_specified="processor_model" in changes,
        )

    document = execute_http_action(
        db,
        reprocess_document,
        commit=True,
        handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
    )
    background_tasks.add_task(
        run_document_processing_job,
        request.app.state.session_factory,
        document_id=document_id,
    )
    return document


@router.post("/imports/gmail", response_model=DocumentGmailInboxImportResultOut, status_code=status.HTTP_202_ACCEPTED)
def post_gmail_document_import(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: DocumentGmailInboxImportRequest | None = Body(default=None),
    db: Session = Depends(get_db),
) -> DocumentGmailInboxImportResultOut:
    actor_id = require_authenticated_actor(request)
    changes = payload.model_dump(exclude_unset=True) if payload is not None else {}

    try:
        result = import_gmail_inbox_documents(
            db,
            actor_id=actor_id,
            query_override=changes.get("query"),
            max_messages_override=changes.get("max_messages"),
        )
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except GmailInboxIntegrationError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    for imported_document in result.imported_documents:
        background_tasks.add_task(
            run_document_processing_job,
            request.app.state.session_factory,
            document_id=imported_document.document_id,
        )
    return result


@router.post("/{document_id}/execute-action-plan", response_model=DocumentIngestionOut)
def post_execute_document_action_plan(
    document_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> DocumentIngestionOut:
    actor_id = require_actor_role(
        request,
        predicate=_can_execute_document_actions,
        detail="Only OPERATIONS, ACCOUNTING, ACCOUNTANT, SETTLEMENT, OPS_ADMIN, or ADMIN sessions can execute document actions.",
    )

    def execute_action() -> DocumentIngestionOut:
        return execute_document_action_plan(
            db,
            document_id=document_id,
            actor_id=actor_id,
        )

    return execute_http_action(
        db,
        execute_action,
        commit=True,
        handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
    )
