from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from apps.api.app.core.http_exception_handlers import register_http_exception_handlers
from apps.api.app.core.http_session_middleware import handle_http_session_request
from apps.api.app.core.logging import configure_logging
from apps.api.app.core.public_runtime_settings import build_public_runtime_settings
from apps.api.app.config import settings
from apps.api.app.deps.db import get_db
from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.http import include_http_routers
from apps.api.app.domains.mcp.services import MCP_MOUNT_PATH
from apps.api.app.domains.mcp.services import mount_mcp_http_app
from apps.api.app.schemas.runtime_settings import PublicRuntimeSettingsOut

configure_logging()

app = FastAPI(title="E/CTRM API", version=settings.APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_origin_regex=settings.cors_allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-correlation-id"],
)

app.state.session_factory = SessionLocal
app.state.started_at = datetime.now(timezone.utc)

include_http_routers(app)
mount_mcp_http_app(app)
register_http_exception_handlers(app)


@app.middleware("http")
async def add_correlation_id(request: Request, call_next):
    return await handle_http_session_request(
        request,
        call_next,
        mcp_mount_path=MCP_MOUNT_PATH,
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/version")
def version():
    return {"version": settings.APP_VERSION}


@app.get("/settings/public", response_model=PublicRuntimeSettingsOut)
def public_runtime_settings(db: Session = Depends(get_db)) -> PublicRuntimeSettingsOut:
    return build_public_runtime_settings(db)
