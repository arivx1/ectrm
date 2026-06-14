from __future__ import annotations

from dataclasses import dataclass


PROTECTED_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
PUBLIC_WRITE_PATHS = frozenset(
    {
        "/auth/session",
        "/auth/bootstrap-admin",
        "/auth/single-user-session",
        "/auth/google-session",
        "/messages/workspace/posts",
    }
)
ADMIN_PATH_PREFIXES = ("/admin", "/users")
AUTHENTICATED_READ_PATH_PREFIXES = (
    "/accruals",
    "/confirmations",
    "/deliveries",
    "/events",
    "/integrations",
    "/operations/workspace-summary",
    "/operations/trade-attention-candidates",
    "/operations/work-items",
    "/option-exposures",
    "/positions",
    "/reference",
    "/reports",
    "/settlement",
    "/shipments",
    "/truck-movements",
    "/trades",
    "/user-events",
    "/wiki",
)


@dataclass(frozen=True, slots=True)
class HttpAuthClassification:
    method: str
    path: str
    source_surface: str
    is_admin_path: bool
    is_mcp_transport_path: bool
    is_protected_read: bool
    is_protected_write: bool


def is_public_write_path(request_path: str) -> bool:
    return request_path in PUBLIC_WRITE_PATHS or (
        request_path.startswith("/codex/tasks/") and request_path.endswith("/callback")
    )


def is_mcp_transport_path(request_path: str, *, mcp_mount_path: str) -> bool:
    return request_path == mcp_mount_path or request_path.startswith(f"{mcp_mount_path}/")


def source_surface_for_request(request_path: str, *, mcp_mount_path: str) -> str:
    if is_mcp_transport_path(request_path, mcp_mount_path=mcp_mount_path):
        return "mcp.http"
    return "http"


def requires_authenticated_read(method: str, request_path: str) -> bool:
    return method.upper() == "GET" and request_path.startswith(AUTHENTICATED_READ_PATH_PREFIXES)


def classify_http_auth_request(
    method: str,
    request_path: str,
    *,
    mcp_mount_path: str,
) -> HttpAuthClassification:
    normalized_method = method.upper()
    mcp_transport_path = is_mcp_transport_path(request_path, mcp_mount_path=mcp_mount_path)
    return HttpAuthClassification(
        method=normalized_method,
        path=request_path,
        source_surface=source_surface_for_request(request_path, mcp_mount_path=mcp_mount_path),
        is_admin_path=request_path.startswith(ADMIN_PATH_PREFIXES),
        is_mcp_transport_path=mcp_transport_path,
        is_protected_read=requires_authenticated_read(normalized_method, request_path),
        is_protected_write=(
            normalized_method in PROTECTED_METHODS
            and not is_public_write_path(request_path)
            and not mcp_transport_path
        ),
    )
