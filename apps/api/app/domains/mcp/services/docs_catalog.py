from __future__ import annotations

import functools
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

from apps.api.app.config import settings

REPO_ROOT = Path(__file__).resolve().parents[6]
PRIMARY_DOC_PATHS = (
    Path("README.md"),
    Path("AGENTS.md"),
    Path("apps/api/README.md"),
    Path("apps/web/README.md"),
)
DOCS_GLOB = "docs/**/*.md"
TOKEN_RE = re.compile(r"[a-z0-9]+")


@dataclass(frozen=True)
class McpDocumentRecord:
    doc_id: str
    title: str
    text: str
    url: str

    @property
    def title_lower(self) -> str:
        return self.title.lower()

    @property
    def text_lower(self) -> str:
        return self.text.lower()


@dataclass(frozen=True)
class McpDocumentSearchResult:
    doc_id: str
    title: str
    url: str


def _normalize_text(value: str) -> str:
    return value.strip().lower()


def _tokenize(value: str) -> list[str]:
    return TOKEN_RE.findall(_normalize_text(value))


def _extract_title(text: str, fallback_path: Path) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip() or fallback_path.stem.replace("-", " ").title()
    return fallback_path.stem.replace("-", " ").title()


def _iter_document_paths() -> list[Path]:
    seen: set[Path] = set()
    paths: list[Path] = []

    for relative_path in PRIMARY_DOC_PATHS:
        absolute_path = REPO_ROOT / relative_path
        if absolute_path.exists() and absolute_path not in seen:
            seen.add(absolute_path)
            paths.append(absolute_path)

    for absolute_path in sorted((REPO_ROOT / "docs").glob("**/*.md")):
        if absolute_path.is_file() and absolute_path not in seen:
            seen.add(absolute_path)
            paths.append(absolute_path)

    return paths


def _repo_relative_path(absolute_path: Path) -> str:
    return absolute_path.relative_to(REPO_ROOT).as_posix()


def _normalize_remote_url(remote_url: str) -> str | None:
    normalized = remote_url.strip()
    if not normalized:
        return None
    if normalized.startswith("git@github.com:"):
        normalized = normalized.replace("git@github.com:", "https://github.com/", 1)
    if normalized.endswith(".git"):
        normalized = normalized[:-4]
    if normalized.startswith("https://github.com/"):
        return normalized.rstrip("/")
    return None


@functools.lru_cache(maxsize=1)
def _resolve_origin_url() -> str | None:
    if settings.MCP_DOCS_REPO_URL_OVERRIDE.strip():
        return settings.MCP_DOCS_REPO_URL_OVERRIDE.strip().rstrip("/")

    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    return _normalize_remote_url(result.stdout)


@functools.lru_cache(maxsize=1)
def _resolve_git_ref() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return "main"

    branch_name = result.stdout.strip()
    if not branch_name or branch_name == "HEAD":
        return "main"
    return branch_name


def _build_document_url(relative_path: str) -> str:
    origin_url = _resolve_origin_url()
    if origin_url is None:
        return f"ectrm://repo/{relative_path}"
    return f"{origin_url}/blob/{quote(_resolve_git_ref(), safe='/')}/{quote(relative_path, safe='/')}"


@functools.lru_cache(maxsize=1)
def list_repo_documents() -> tuple[McpDocumentRecord, ...]:
    records: list[McpDocumentRecord] = []

    for absolute_path in _iter_document_paths():
        text = absolute_path.read_text(encoding="utf-8")
        relative_path = _repo_relative_path(absolute_path)
        records.append(
            McpDocumentRecord(
                doc_id=relative_path,
                title=_extract_title(text, absolute_path),
                text=text,
                url=_build_document_url(relative_path),
            )
        )

    return tuple(records)


def search_repo_documents(query: str, *, limit: int | None = None) -> list[McpDocumentSearchResult]:
    normalized_query = _normalize_text(query)
    if not normalized_query:
        return []

    query_tokens = [token for token in _tokenize(normalized_query) if len(token) >= 2]
    scored_results: list[tuple[int, McpDocumentRecord]] = []

    for record in list_repo_documents():
        score = 0
        if normalized_query in record.title_lower:
            score += 100
        if normalized_query in record.text_lower:
            score += 20
        for token in query_tokens:
            score += record.title_lower.count(token) * 10
            score += record.text_lower.count(token)
        if score > 0:
            scored_results.append((score, record))

    scored_results.sort(key=lambda row: (-row[0], row[1].title, row[1].doc_id))
    capped_limit = limit or settings.MCP_DOCS_RESULT_LIMIT
    return [
        McpDocumentSearchResult(doc_id=record.doc_id, title=record.title, url=record.url)
        for _, record in scored_results[:capped_limit]
    ]


def fetch_repo_document(doc_id: str) -> McpDocumentRecord | None:
    normalized_id = doc_id.strip()
    if not normalized_id:
        return None

    for record in list_repo_documents():
        if record.doc_id == normalized_id:
            return record
    return None

