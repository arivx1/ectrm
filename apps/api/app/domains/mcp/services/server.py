import json
from contextlib import asynccontextmanager
from typing import Any, Callable

from fastapi import FastAPI
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from mcp.types import ToolAnnotations
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.core.request_context import reset_request_identity
from apps.api.app.core.request_context import set_request_identity
from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.mcp.services.docs_catalog import fetch_repo_document
from apps.api.app.domains.mcp.services.docs_catalog import list_repo_documents
from apps.api.app.domains.mcp.services.docs_catalog import search_repo_documents
from apps.api.app.domains.mcp.services.oauth import EctrmMcpOAuthProvider
from apps.api.app.domains.mcp.services.oauth import build_mcp_auth_settings
from apps.api.app.domains.mcp.services.oauth import current_mcp_access_token
from apps.api.app.domains.mcp.services.oauth import mcp_oauth_enabled
from apps.api.app.domains.mcp.services.oauth import mcp_oauth_login_methods
from apps.api.app.domains.mcp.services.oauth import mcp_oauth_required_scopes

MCP_MOUNT_PATH = "/mcp"
MCP_TOOL_NAMES = ("search", "fetch")


def _json_text_result(payload: dict[str, Any]) -> str:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=True)


def _run_with_mcp_identity(tool_name: str, handler: Callable[..., str], *args: object) -> str:
    token = current_mcp_access_token()
    identity_token = set_request_identity(
        actor_id=token.user_id if token is not None else None,
        role=token.role if token is not None else None,
        session_id=token.session_id if token is not None else None,
        request_method="POST",
        request_path=f"{MCP_MOUNT_PATH}/tools/{tool_name}",
    )
    try:
        return handler(*args)
    finally:
        reset_request_identity(identity_token)


def _search_docs(query: str) -> str:
    results = search_repo_documents(query)
    return _json_text_result(
        {
            "results": [
                {
                    "id": result.doc_id,
                    "title": result.title,
                    "url": result.url,
                }
                for result in results
            ]
        }
    )


def _fetch_doc(id: str) -> str:
    record = fetch_repo_document(id)
    if record is None:
        raise ToolError(f"Unknown document id '{id}'.")

    return _json_text_result(
        {
            "id": record.doc_id,
            "title": record.title,
            "text": record.text,
            "url": record.url,
            "metadata": {
                "source": "repo-doc",
                "document_count": len(list_repo_documents()),
            },
        }
    )


def _search_docs_tool(query: str) -> str:
    return _run_with_mcp_identity("search", _search_docs, query)


def _fetch_doc_tool(id: str) -> str:
    return _run_with_mcp_identity("fetch", _fetch_doc, id)


def build_mcp_server(*, session_factory: Callable[[], Session] | None = None) -> FastMCP:
    # Keep the first external MCP slice closed over checked-in docs only.
    oauth_provider = None
    server_kwargs: dict[str, Any] = {
        "stateless_http": True,
        "json_response": True,
        "streamable_http_path": "/",
    }
    if mcp_oauth_enabled():
        auth_settings = build_mcp_auth_settings(mount_path=MCP_MOUNT_PATH)
        oauth_provider = EctrmMcpOAuthProvider(
            session_factory=session_factory or SessionLocal,
            issuer_url=str(auth_settings.issuer_url),
            required_scopes=mcp_oauth_required_scopes(),
        )
        server_kwargs["auth"] = auth_settings

    server = FastMCP(
        settings.MCP_SERVER_NAME,
        instructions=settings.MCP_SERVER_INSTRUCTIONS,
        auth_server_provider=oauth_provider,
        **server_kwargs,
    )
    server.oauth_provider = oauth_provider

    server.tool(
        name="search",
        description="Use this when you need to search ECTRM product and engineering documentation by keyword or phrase.",
        annotations=ToolAnnotations(
            title="Search ECTRM Docs",
            readOnlyHint=True,
            openWorldHint=False,
        ),
    )(_search_docs_tool)
    server.tool(
        name="fetch",
        description="Use this when you already know a document id and need the full ECTRM document text for citation or detailed reading.",
        annotations=ToolAnnotations(
            title="Fetch ECTRM Doc",
            readOnlyHint=True,
            openWorldHint=False,
        ),
    )(_fetch_doc_tool)
    return server


def clear_mcp_server_cache() -> None:
    return None


def get_mcp_lowlevel_server(*, session_factory: Callable[[], Session] | None = None):
    return build_mcp_server(session_factory=session_factory)._mcp_server


def mount_mcp_http_app(app: FastAPI) -> bool:
    if not settings.MCP_ENABLED:
        return False
    if getattr(app.state, "mcp_http_app_mounted", False):
        return True

    server = build_mcp_server(session_factory=getattr(app.state, "session_factory", SessionLocal))
    app.mount(MCP_MOUNT_PATH, server.streamable_http_app())
    app.state.mcp_http_app_mounted = True
    app.state.mcp_server = server
    app.state.mcp_oauth_provider = getattr(server, "oauth_provider", None)
    if not getattr(app.state, "mcp_session_manager_lifespan_wrapped", False):
        existing_lifespan = app.router.lifespan_context

        @asynccontextmanager
        async def _mcp_lifespan(inner_app: FastAPI):
            async with existing_lifespan(inner_app):
                if getattr(server, "_session_manager", None) is None:
                    server.streamable_http_app()
                context = server.session_manager.run()
                await context.__aenter__()
                inner_app.state.mcp_session_manager_context = context
                try:
                    yield
                finally:
                    await context.__aexit__(None, None, None)
                    inner_app.state.mcp_session_manager_context = None
                    server._session_manager = None

        app.router.lifespan_context = _mcp_lifespan
        app.state.mcp_session_manager_lifespan_wrapped = True

    return True


def build_mcp_runtime_status() -> dict[str, Any]:
    oauth_active = settings.MCP_ENABLED and mcp_oauth_enabled()
    return {
        "enabled": settings.MCP_ENABLED,
        "mount_path": MCP_MOUNT_PATH,
        "server_name": settings.MCP_SERVER_NAME,
        "transport": "streamable-http",
        "tool_names": list(MCP_TOOL_NAMES) if settings.MCP_ENABLED else [],
        "document_count": len(list_repo_documents()),
        "docs_public": True,
        "auth_mode": settings.MCP_AUTH_MODE if settings.MCP_ENABLED else "none",
        "oauth_issuer_url": (settings.MCP_OAUTH_ISSUER_URL.strip() or None) if oauth_active else None,
        "required_scopes": mcp_oauth_required_scopes() if oauth_active else [],
        "login_methods": mcp_oauth_login_methods() if oauth_active else [],
    }
