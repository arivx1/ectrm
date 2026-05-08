from __future__ import annotations

from pathlib import Path
from typing import Any, get_args

from fastapi.routing import APIRoute
from sqlalchemy import func, inspect, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.schema import Table

from apps.api.app.config import settings
from apps.api.app.domains.operations.services.database_overview import build_database_overview
from apps.api.app.models import Base
from apps.api.app.schemas.assistant import AssistantWorkspace

APP_CONTEXT_INTROSPECTION_TOOL_NAMES: tuple[str, ...] = (
    "get_application_catalog",
    "get_data_schema_catalog",
    "search_codebase",
    "read_codebase_file",
)

REPO_ROOT = Path(__file__).resolve().parents[6]
ALLOWED_CODEBASE_DIRECTORY_ROOTS: dict[str, tuple[Path, ...]] = {
    "api": (
        REPO_ROOT / "apps" / "api" / "app",
        REPO_ROOT / "apps" / "api" / "tests",
        REPO_ROOT / "apps" / "api" / "alembic",
    ),
    "web": (
        REPO_ROOT / "apps" / "web" / "src",
        REPO_ROOT / "apps" / "web" / "tests",
    ),
    "docs": (REPO_ROOT / "docs" / "engineering",),
}
ALLOWED_CODEBASE_FILES: tuple[Path, ...] = (
    REPO_ROOT / "AGENTS.md",
    REPO_ROOT / "README.md",
    REPO_ROOT / "Makefile",
    REPO_ROOT / "package.json",
    REPO_ROOT / "tsconfig.app.json",
)
DENIED_CODEBASE_SEGMENTS = frozenset(
    {
        ".git",
        ".venv",
        "__pycache__",
        "build",
        "coverage",
        "dist",
        "node_modules",
    }
)
DENIED_CODEBASE_SUFFIXES = frozenset(
    {
        ".cer",
        ".crt",
        ".db",
        ".key",
        ".pem",
        ".pfx",
        ".p12",
        ".pyc",
        ".sqlite",
    }
)
ALLOWED_CODEBASE_TEXT_SUFFIXES = frozenset(
    {
        "",
        ".css",
        ".js",
        ".json",
        ".jsx",
        ".md",
        ".psql",
        ".py",
        ".sql",
        ".toml",
        ".ts",
        ".tsx",
        ".txt",
        ".yaml",
        ".yml",
    }
)
MAX_CODEBASE_FILE_BYTES = 512_000
MAX_CODEBASE_READ_LINES = 200


def build_application_access_summary() -> str:
    workspace_names = ", ".join(get_args(AssistantWorkspace))
    return "\n".join(
        [
            "Use explicit read-only app introspection surfaces when the user asks how ECTRM is built or wired.",
            "- Application topology, routes, workspaces, docs, and code roots: get_application_catalog",
            "- Database tables, columns, primary keys, and relationships: get_data_schema_catalog",
            "- Managed-agent roster, hierarchy, and build recipe: list_managed_agents and get_managed_agent_profile",
            "- Repo code and documentation search: search_codebase and read_codebase_file",
            "- Live business records and operator counts remain available through the domain read tools and get_workspace_summary",
            f"- Known workspaces: {workspace_names}",
            "Keep business writes behind typed services, governed actions, and action-request review.",
        ]
    )


def build_application_catalog(db: Session) -> dict[str, Any]:
    from apps.api.app.domains.http import HTTP_ROUTE_REGISTRATIONS

    route_groups = []
    total_route_count = 0
    for registration in HTTP_ROUTE_REGISTRATIONS:
        routes = [
            _serialize_api_route(route)
            for route in registration.router.routes
            if isinstance(route, APIRoute)
        ]
        total_route_count += len(routes)
        route_groups.append(
            {
                "domain": registration.domain,
                "name": registration.name,
                "route_count": len(routes),
                "routes": routes,
            }
        )

    return {
        "application": {
            "name": "E/CTRM API",
            "version": settings.APP_VERSION,
        },
        "database_overview": build_database_overview(db).model_dump(mode="json"),
        "workspace_catalog": list(get_args(AssistantWorkspace)),
        "route_group_count": len(route_groups),
        "route_count": total_route_count,
        "route_groups": route_groups,
        "schema_modules": _list_schema_modules(),
        "frontend_workspace_modules": _list_frontend_workspace_modules(),
        "codebase_roots": _list_codebase_roots(),
        "documentation_entry_points": _documentation_entry_points(),
        "introspection_tools": {
            "application_catalog": "get_application_catalog",
            "data_schema_catalog": "get_data_schema_catalog",
            "managed_agent_roster": ["list_managed_agents", "get_managed_agent_profile"],
            "codebase_search": "search_codebase",
            "codebase_read": "read_codebase_file",
        },
    }


def build_data_schema_catalog(
    db: Session,
    *,
    table_name: str | None = None,
) -> dict[str, Any]:
    inspector = inspect(db.get_bind())
    existing_tables = [
        table
        for table in Base.metadata.sorted_tables
        if inspector.has_table(table.name, schema=table.schema)
    ]

    if table_name is not None:
        normalized_table_name = table_name.strip().lower()
        target_table = next(
            (
                table
                for table in existing_tables
                if table.name.lower() == normalized_table_name
            ),
            None,
        )
        if target_table is None:
            return {
                "found": False,
                "table_name": table_name,
                "database_overview": build_database_overview(db).model_dump(mode="json"),
            }
        table_payload = _serialize_table_schema(target_table)
        table_payload["record_count"] = _count_table_records(db, target_table)
        return {
            "found": True,
            "table_name": target_table.name,
            "database_overview": build_database_overview(db).model_dump(mode="json"),
            "relationship_count": len(table_payload["foreign_keys"]),
            "table": table_payload,
        }

    tables = [_serialize_table_schema(table) for table in existing_tables]
    return {
        "database_overview": build_database_overview(db).model_dump(mode="json"),
        "table_count": len(tables),
        "relationship_count": sum(len(table["foreign_keys"]) for table in tables),
        "tables": tables,
    }


def search_codebase(
    *,
    query: str,
    scope: str,
    limit: int,
    path_prefix: str | None = None,
) -> dict[str, Any]:
    normalized_scope = _normalize_codebase_scope(scope)
    normalized_query = query.strip()
    if not normalized_query:
        raise ValueError("query must not be empty.")

    target_paths = _iter_searchable_codebase_paths(scope=normalized_scope, path_prefix=path_prefix)
    items: list[dict[str, Any]] = []
    truncated = False
    query_lower = normalized_query.lower()
    for path in target_paths:
        for line_number, line in enumerate(_read_allowed_text_file(path).splitlines(), start=1):
            if query_lower not in line.lower():
                continue
            items.append(
                {
                    "path": _relative_repo_path(path),
                    "line_number": line_number,
                    "snippet": line.strip(),
                }
            )
            if len(items) >= limit:
                truncated = True
                break
        if truncated:
            break

    return {
        "query": normalized_query,
        "scope": normalized_scope,
        "path_prefix": path_prefix,
        "count": len(items),
        "truncated": truncated,
        "items": items,
        "searched_roots": [
            _relative_repo_path(path)
            for path in _roots_for_scope(normalized_scope)
        ],
    }


def read_codebase_file(
    *,
    path: str,
    start_line: int = 1,
    end_line: int | None = None,
) -> dict[str, Any]:
    if start_line < 1:
        raise ValueError("start_line must be at least 1.")
    resolved_path = _resolve_allowed_codebase_path(path)
    if end_line is not None and end_line < start_line:
        raise ValueError("end_line must be greater than or equal to start_line.")

    lines = _read_allowed_text_file(resolved_path).splitlines()
    total_lines = len(lines)
    if total_lines and start_line > total_lines:
        raise ValueError(f"start_line {start_line} exceeds {total_lines} total lines in {_relative_repo_path(resolved_path)}.")
    requested_end_line = end_line if end_line is not None else min(total_lines, start_line + MAX_CODEBASE_READ_LINES - 1)
    actual_end_line = min(total_lines, requested_end_line, start_line + MAX_CODEBASE_READ_LINES - 1)
    selected_lines = lines[start_line - 1 : actual_end_line]
    numbered_content = "\n".join(
        f"{line_number}: {line}"
        for line_number, line in enumerate(selected_lines, start=start_line)
    )

    return {
        "path": _relative_repo_path(resolved_path),
        "start_line": start_line,
        "end_line": actual_end_line,
        "requested_end_line": requested_end_line,
        "total_lines": total_lines,
        "truncated": actual_end_line < requested_end_line or len(selected_lines) >= MAX_CODEBASE_READ_LINES,
        "content": numbered_content,
    }


def _serialize_api_route(route: APIRoute) -> dict[str, Any]:
    return {
        "path": route.path,
        "methods": sorted(
            method
            for method in (route.methods or set())
            if method not in {"HEAD", "OPTIONS"}
        ),
        "name": route.name,
        "tags": list(route.tags or []),
    }


def _serialize_table_schema(table: Table) -> dict[str, Any]:
    model_name = _model_name_by_table_key().get((table.schema, table.name))
    foreign_keys = [
        {
            "constrained_columns": [element.parent.name for element in constraint.elements],
            "referred_table": constraint.elements[0].column.table.name if constraint.elements else None,
            "referred_columns": [element.column.name for element in constraint.elements],
        }
        for constraint in table.foreign_key_constraints
    ]
    return {
        "table_name": table.name,
        "schema": table.schema,
        "model_name": model_name,
        "column_count": len(table.columns),
        "primary_key": [column.name for column in table.primary_key.columns],
        "columns": [
            {
                "name": column.name,
                "type": str(column.type),
                "nullable": column.nullable,
                "primary_key": bool(column.primary_key),
                "foreign_key_targets": [
                    f"{foreign_key.column.table.name}.{foreign_key.column.name}"
                    for foreign_key in column.foreign_keys
                ],
            }
            for column in table.columns
        ],
        "foreign_keys": foreign_keys,
    }


def _model_name_by_table_key() -> dict[tuple[str | None, str], str]:
    return {
        (mapper.local_table.schema, mapper.local_table.name): mapper.class_.__name__
        for mapper in Base.registry.mappers
    }


def _count_table_records(db: Session, table: Table) -> int:
    return int(db.execute(select(func.count()).select_from(table)).scalar_one())


def _documentation_entry_points() -> list[str]:
    entries = [
        REPO_ROOT / "README.md",
        REPO_ROOT / "AGENTS.md",
        REPO_ROOT / "docs" / "engineering" / "platform-blueprint.md",
        REPO_ROOT / "docs" / "engineering" / "local-development.md",
        REPO_ROOT / "docs" / "engineering" / "ai-workflow.md",
        REPO_ROOT / "docs" / "engineering" / "agent-autonomy-rubric.md",
        REPO_ROOT / "docs" / "engineering" / "agent-knowledge-base.md",
        REPO_ROOT / "docs" / "engineering" / "human-agent-authority-matrix.md",
        REPO_ROOT / "docs" / "engineering" / "agent-action-request-contract.md",
    ]
    return [_relative_repo_path(path) for path in entries if path.exists()]


def _list_schema_modules() -> list[str]:
    schema_root = REPO_ROOT / "apps" / "api" / "app" / "schemas"
    return [
        _relative_repo_path(path)
        for path in sorted(schema_root.glob("*.py"))
        if path.is_file()
    ]


def _list_frontend_workspace_modules() -> list[str]:
    workspace_root = REPO_ROOT / "apps" / "web" / "src" / "workspaces"
    items: list[str] = []
    for path in sorted(workspace_root.iterdir()):
        if path.name in DENIED_CODEBASE_SEGMENTS:
            continue
        if path.is_dir():
            items.append(_relative_repo_path(path))
            continue
        if path.is_file() and path.suffix in ALLOWED_CODEBASE_TEXT_SUFFIXES:
            items.append(_relative_repo_path(path))
    return items


def _list_codebase_roots() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for scope, roots in ALLOWED_CODEBASE_DIRECTORY_ROOTS.items():
        for root in roots:
            items.append({"scope": scope, "path": _relative_repo_path(root)})
    for path in ALLOWED_CODEBASE_FILES:
        items.append({"scope": "config", "path": _relative_repo_path(path)})
    return items


def _normalize_codebase_scope(scope: str | None) -> str:
    normalized_scope = (scope or "all").strip().lower()
    if normalized_scope not in {"all", *ALLOWED_CODEBASE_DIRECTORY_ROOTS.keys()}:
        raise ValueError("scope must be one of all, api, web, or docs.")
    return normalized_scope


def _roots_for_scope(scope: str) -> tuple[Path, ...]:
    if scope == "all":
        return tuple(
            root
            for roots in ALLOWED_CODEBASE_DIRECTORY_ROOTS.values()
            for root in roots
        ) + ALLOWED_CODEBASE_FILES
    return ALLOWED_CODEBASE_DIRECTORY_ROOTS[scope]


def _iter_searchable_codebase_paths(
    *,
    scope: str,
    path_prefix: str | None,
) -> list[Path]:
    narrowed_root: Path | None = None
    if path_prefix is not None:
        narrowed_root = _resolve_allowed_codebase_path(path_prefix, allow_directories=True)

    paths: list[Path] = []
    roots = (narrowed_root,) if narrowed_root is not None else _roots_for_scope(scope)
    for root in roots:
        if root.is_file():
            if _is_searchable_codebase_file(root):
                paths.append(root)
            continue
        for path in sorted(root.rglob("*")):
            if _is_searchable_codebase_file(path):
                paths.append(path)
    return paths


def _resolve_allowed_codebase_path(path: str, *, allow_directories: bool = False) -> Path:
    normalized_path = path.strip()
    if not normalized_path:
        raise ValueError("path must not be empty.")
    candidate = (REPO_ROOT / normalized_path).resolve()
    if REPO_ROOT not in candidate.parents and candidate != REPO_ROOT:
        raise ValueError("path must stay inside the repository root.")
    if any(part in DENIED_CODEBASE_SEGMENTS for part in candidate.parts):
        raise ValueError("path points to a blocked repo location.")
    if candidate.suffix.lower() in DENIED_CODEBASE_SUFFIXES:
        raise ValueError("path points to a blocked file type.")
    if candidate.name.startswith(".env"):
        raise ValueError("environment files are not readable through assistant tools.")

    allowed_roots = tuple(
        root
        for roots in ALLOWED_CODEBASE_DIRECTORY_ROOTS.values()
        for root in roots
    )
    is_allowed = candidate in ALLOWED_CODEBASE_FILES or any(
        candidate == root or root in candidate.parents
        for root in allowed_roots
    )
    if not is_allowed:
        raise ValueError("path is outside the published assistant codebase roots.")
    if not candidate.exists():
        raise ValueError("path does not exist.")
    if candidate.is_dir() and not allow_directories:
        raise ValueError("path must reference a file.")
    if candidate.is_dir():
        return candidate
    if candidate.suffix.lower() not in ALLOWED_CODEBASE_TEXT_SUFFIXES:
        raise ValueError("path is not a published readable text file.")
    return candidate


def _is_searchable_codebase_file(path: Path) -> bool:
    if not path.is_file():
        return False
    if path.suffix.lower() not in ALLOWED_CODEBASE_TEXT_SUFFIXES:
        return False
    if any(part in DENIED_CODEBASE_SEGMENTS for part in path.parts):
        return False
    if path.name.startswith(".env") or path.suffix.lower() in DENIED_CODEBASE_SUFFIXES:
        return False
    return True


def _read_allowed_text_file(path: Path) -> str:
    data = path.read_bytes()
    if len(data) > MAX_CODEBASE_FILE_BYTES:
        raise ValueError(
            f"{_relative_repo_path(path)} is larger than the published assistant read limit of {MAX_CODEBASE_FILE_BYTES} bytes."
        )
    if b"\x00" in data:
        raise ValueError(f"{_relative_repo_path(path)} is not a readable text file.")
    return data.decode("utf-8", errors="replace")


def _relative_repo_path(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()
