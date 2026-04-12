from __future__ import annotations

import unittest

from fastapi import HTTPException, status

from apps.api.app.core.http import execute_http_action
from apps.api.app.core.http import NOT_FOUND_ERROR_STATUS_CODES
from apps.api.app.core.http import VALIDATION_ERROR_STATUS_CODES


def _raise(exc: Exception):
    raise exc


class _RecordingSession:
    def __init__(self) -> None:
        self.commit_count = 0
        self.rollback_count = 0

    def commit(self) -> None:
        self.commit_count += 1

    def rollback(self) -> None:
        self.rollback_count += 1


class HttpCoreTests(unittest.TestCase):
    def test_execute_http_action_commits_and_returns_result(self) -> None:
        session = _RecordingSession()

        result = execute_http_action(session, lambda: {"status": "ok"}, commit=True)

        self.assertEqual(result, {"status": "ok"})
        self.assertEqual(session.commit_count, 1)
        self.assertEqual(session.rollback_count, 0)

    def test_execute_http_action_maps_handled_exception_and_rolls_back(self) -> None:
        session = _RecordingSession()

        with self.assertRaises(HTTPException) as context:
            execute_http_action(
                session,
                lambda: _raise(LookupError("missing record")),
                commit=True,
                handled_exceptions=NOT_FOUND_ERROR_STATUS_CODES,
            )

        self.assertEqual(context.exception.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(context.exception.detail, "missing record")
        self.assertEqual(session.commit_count, 0)
        self.assertEqual(session.rollback_count, 1)

    def test_execute_http_action_preserves_http_exception_and_rolls_back(self) -> None:
        session = _RecordingSession()

        with self.assertRaises(HTTPException) as context:
            execute_http_action(
                session,
                lambda: _raise(HTTPException(status_code=status.HTTP_409_CONFLICT, detail="conflict")),
                commit=True,
            )

        self.assertEqual(context.exception.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(context.exception.detail, "conflict")
        self.assertEqual(session.commit_count, 0)
        self.assertEqual(session.rollback_count, 1)

    def test_execute_http_action_reraises_unhandled_exception_after_rollback(self) -> None:
        session = _RecordingSession()

        with self.assertRaises(RuntimeError):
            execute_http_action(
                session,
                lambda: _raise(RuntimeError("boom")),
                commit=True,
                handled_exceptions=VALIDATION_ERROR_STATUS_CODES,
            )

        self.assertEqual(session.commit_count, 0)
        self.assertEqual(session.rollback_count, 1)

    def test_execute_http_action_does_not_rollback_non_transactional_queries(self) -> None:
        session = _RecordingSession()

        with self.assertRaises(HTTPException) as context:
            execute_http_action(
                session,
                lambda: _raise(ValueError("bad filter")),
                handled_exceptions=VALIDATION_ERROR_STATUS_CODES,
            )

        self.assertEqual(context.exception.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)
        self.assertEqual(context.exception.detail, "bad filter")
        self.assertEqual(session.commit_count, 0)
        self.assertEqual(session.rollback_count, 0)


if __name__ == "__main__":
    unittest.main()
