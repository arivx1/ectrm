from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from apps.api.app.domains.mcp.services.oauth import MCP_OAUTH_LOGIN_PATH
from apps.api.app.domains.mcp.services.oauth import MCP_OAUTH_WHOAMI_PATH
from apps.api.app.domains.mcp.services.server import build_mcp_runtime_status


class McpRuntimeStatusOut(BaseModel):
    enabled: bool
    mount_path: str
    server_name: str
    transport: str
    tool_names: list[str]
    document_count: int
    docs_public: bool
    auth_mode: str
    oauth_issuer_url: str | None = None
    required_scopes: list[str] = Field(default_factory=list)
    login_methods: list[str] = Field(default_factory=list)


router = APIRouter(tags=["mcp"])


@router.get("/mcp-status", response_model=McpRuntimeStatusOut)
def get_mcp_status() -> McpRuntimeStatusOut:
    return McpRuntimeStatusOut(**build_mcp_runtime_status())


@router.api_route(f"/mcp{MCP_OAUTH_LOGIN_PATH}", methods=["GET", "POST"])
async def handle_mcp_login(request: Request):
    provider = getattr(request.app.state, "mcp_oauth_provider", None)
    if provider is None:
        raise HTTPException(status_code=404, detail="MCP OAuth login is not configured.")
    return await provider.handle_login_request(request)


@router.get(f"/mcp{MCP_OAUTH_WHOAMI_PATH}")
async def handle_mcp_whoami(request: Request):
    provider = getattr(request.app.state, "mcp_oauth_provider", None)
    if provider is None:
        raise HTTPException(status_code=404, detail="MCP OAuth runtime is not configured.")
    return await provider.handle_whoami_request(request)


__all__ = ["McpRuntimeStatusOut", "router"]
