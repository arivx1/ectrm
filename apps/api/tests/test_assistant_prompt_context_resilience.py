from __future__ import annotations

import unittest

from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from starlette.requests import Request

from apps.api.app.domains.assistant.services.organization_context_registry import (
    list_published_organization_context_prompt_sections,
)
from apps.api.app.domains.assistant.services.prompt_context import (
    _load_active_wiki_page_matches_for_prompt,
    _load_active_wiki_pages_for_prompt,
    _safe_count,
    _safe_count_active,
    _safe_count_where,
)
from apps.api.app.main import _attach_correlation_header
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.trade import Trade
from apps.api.app.models.wiki_page import WikiPage


class _FailingSession:
    def __init__(self) -> None:
        self.rollback_count = 0

    def execute(self, *_args, **_kwargs):
        raise SQLAlchemyError("boom")

    def rollback(self) -> None:
        self.rollback_count += 1


def _build_request(origin: str | None = None) -> Request:
    headers = []
    if origin is not None:
        headers.append((b"origin", origin.encode("utf-8")))
    request = Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/assistant/respond",
            "raw_path": b"/assistant/respond",
            "query_string": b"",
            "headers": headers,
            "client": ("testclient", 50000),
            "server": ("testserver", 80),
            "root_path": "",
        }
    )
    request.state.correlation_id = "corr-123"
    return request


class AssistantPromptContextResilienceTests(unittest.TestCase):
    def test_organization_context_registry_rolls_back_swallowed_sql_errors(self) -> None:
        session = _FailingSession()

        sections = list_published_organization_context_prompt_sections(session)

        self.assertEqual(sections, {})
        self.assertEqual(session.rollback_count, 1)

    def test_safe_count_rolls_back_swallowed_sql_errors(self) -> None:
        session = _FailingSession()

        count = _safe_count(session, ReferenceBook)

        self.assertIsNone(count)
        self.assertEqual(session.rollback_count, 1)

    def test_safe_count_active_rolls_back_swallowed_sql_errors(self) -> None:
        session = _FailingSession()

        count = _safe_count_active(session, ReferenceBook)

        self.assertIsNone(count)
        self.assertEqual(session.rollback_count, 1)

    def test_safe_count_active_does_not_rollback_when_model_has_no_is_active(self) -> None:
        session = _FailingSession()

        count = _safe_count_active(session, Trade)

        self.assertIsNone(count)
        self.assertEqual(session.rollback_count, 0)

    def test_safe_count_where_rolls_back_swallowed_sql_errors(self) -> None:
        session = _FailingSession()

        count = _safe_count_where(session, ReferenceBook, ReferenceBook.is_active.is_(True))

        self.assertIsNone(count)
        self.assertEqual(session.rollback_count, 1)

    def test_wiki_prompt_grounding_rolls_back_swallowed_sql_errors(self) -> None:
        session = _FailingSession()

        pages = _load_active_wiki_pages_for_prompt(session)

        self.assertIsNone(pages)
        self.assertEqual(session.rollback_count, 1)

    def test_query_aware_wiki_prompt_grounding_rolls_back_swallowed_sql_errors(self) -> None:
        session = _FailingSession()

        matches = _load_active_wiki_page_matches_for_prompt(session, query="cash handoff")

        self.assertIsNone(matches)
        self.assertEqual(session.rollback_count, 1)

    def test_attach_correlation_header_preserves_allowed_cors_origin(self) -> None:
        request = _build_request("http://localhost:5173")
        response = JSONResponse({"ok": False}, status_code=500)

        updated_response = _attach_correlation_header(request, response)

        self.assertEqual(updated_response.headers["x-correlation-id"], "corr-123")
        self.assertEqual(updated_response.headers["access-control-allow-origin"], "http://localhost:5173")
        self.assertEqual(updated_response.headers["access-control-allow-credentials"], "true")
        self.assertEqual(updated_response.headers["access-control-expose-headers"], "x-correlation-id")

    def test_attach_correlation_header_skips_disallowed_cors_origin(self) -> None:
        request = _build_request("http://example.com")
        response = JSONResponse({"ok": False}, status_code=500)

        updated_response = _attach_correlation_header(request, response)

        self.assertEqual(updated_response.headers["x-correlation-id"], "corr-123")
        self.assertNotIn("access-control-allow-origin", updated_response.headers)


if __name__ == "__main__":
    unittest.main()
