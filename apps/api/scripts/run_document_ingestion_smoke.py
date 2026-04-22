from __future__ import annotations

import argparse
import json
import os
import random
import string
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal, cast

import fitz
import httpx


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
API_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
REPO_ROOT = os.path.abspath(os.path.join(API_DIR, "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from apps.api.app.config import settings

SmokeMode = Literal["builtin", "openai-inline", "openai-uploaded"]

DEFAULT_MODES: tuple[SmokeMode, ...] = ("builtin", "openai-inline", "openai-uploaded")
PROCESSING_STATUSES = {"UPLOADED", "PROCESSING"}
MODE_CHOICES = set(DEFAULT_MODES)
ENV_API_BASE = "ECTRM_DOCUMENT_SMOKE_API_BASE"
ENV_ACCESS_TOKEN = "ECTRM_DOCUMENT_SMOKE_ACCESS_TOKEN"
ENV_IDENTIFIER = "ECTRM_DOCUMENT_SMOKE_IDENTIFIER"
ENV_PASSWORD = "ECTRM_DOCUMENT_SMOKE_PASSWORD"
ENV_USE_SINGLE_USER_SESSION = "ECTRM_DOCUMENT_SMOKE_USE_SINGLE_USER_SESSION"
ASCII_ALPHABET = string.ascii_letters + string.digits


@dataclass(frozen=True)
class SmokeFixture:
    mode: SmokeMode
    path: Path
    size_bytes: int
    requested_processor_provider: str
    expected_transport: str
    page_count: int


@dataclass(frozen=True)
class SmokeResult:
    mode: SmokeMode
    path: str
    size_bytes: int
    requested_processor_provider: str
    expected_transport: str
    document_id: str | None
    upload_status: str | None
    final_status: str | None
    page_count: int
    dominant_document_kind: str | None
    recorded_processor_provider: str | None
    recorded_processor_model: str | None
    processor_trace_provider: str | None
    processor_trace_applied: bool
    processor_trace_partial: bool
    processing_errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Upload deterministic smoke PDFs through the document-ingestion API and validate "
            "the built-in parser, OpenAI inline PDF path, and OpenAI uploaded-file path."
        )
    )
    parser.add_argument(
        "--api-base",
        default=os.getenv(ENV_API_BASE, "http://127.0.0.1:8000"),
        help=f"Base URL for the running API. Defaults to ${ENV_API_BASE} or the local API port.",
    )
    parser.add_argument(
        "--mode",
        dest="modes",
        action="append",
        choices=sorted(MODE_CHOICES),
        default=[],
        help="Smoke mode to run. Repeat to run a subset. Defaults to builtin, openai-inline, openai-uploaded.",
    )
    parser.add_argument(
        "--artifact-dir",
        type=Path,
        default=Path(REPO_ROOT) / "tmp" / "pdfs" / "document-ingestion-smoke",
        help="Directory where generated PDFs and optional JSON summaries are written.",
    )
    parser.add_argument(
        "--json-output",
        type=Path,
        help="Optional path for a JSON summary of the generated fixtures and smoke results.",
    )
    parser.add_argument(
        "--inline-threshold-bytes",
        type=int,
        default=settings.DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES,
        help=(
            "Threshold used to size the generated OpenAI fixtures. "
            "Override this if the target API uses a different DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES value."
        ),
    )
    parser.add_argument(
        "--uploaded-buffer-bytes",
        type=int,
        default=1_048_576,
        help="Extra bytes to add beyond the inline threshold when generating the uploaded-file fixture.",
    )
    parser.add_argument(
        "--poll-interval-seconds",
        type=float,
        default=2.0,
        help="How often to poll /documents/{id} while background processing is running.",
    )
    parser.add_argument(
        "--processing-timeout-seconds",
        type=float,
        default=max(180.0, float(settings.DOCUMENT_AI_TIMEOUT_SECONDS + 60)),
        help="How long to wait for each uploaded document to leave UPLOADED/PROCESSING state.",
    )
    parser.add_argument(
        "--request-timeout-seconds",
        type=float,
        default=max(30.0, float(settings.DOCUMENT_AI_TIMEOUT_SECONDS)),
        help="HTTP timeout for each request to the API.",
    )
    parser.add_argument(
        "--fixtures-only",
        action="store_true",
        help="Only generate the smoke PDFs and summary metadata; do not contact the API.",
    )
    parser.add_argument(
        "--access-token",
        default=os.getenv(ENV_ACCESS_TOKEN),
        help=f"Existing bearer token. Defaults to ${ENV_ACCESS_TOKEN} when set.",
    )
    parser.add_argument(
        "--identifier",
        default=os.getenv(ENV_IDENTIFIER),
        help=f"Identifier for /auth/session. Defaults to ${ENV_IDENTIFIER} when set.",
    )
    parser.add_argument(
        "--password",
        default=os.getenv(ENV_PASSWORD),
        help=f"Password for /auth/session. Defaults to ${ENV_PASSWORD} when set.",
    )
    parser.add_argument(
        "--use-single-user-session",
        action="store_true",
        default=_env_truthy(os.getenv(ENV_USE_SINGLE_USER_SESSION)),
        help=(
            "Request /auth/single-user-session instead of using /auth/session. "
            f"Defaults to ${ENV_USE_SINGLE_USER_SESSION}=true."
        ),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    modes = tuple(cast(SmokeMode, mode) for mode in (args.modes or list(DEFAULT_MODES)))

    if args.inline_threshold_bytes < 0:
        raise SystemExit("--inline-threshold-bytes must be >= 0")
    if args.uploaded_buffer_bytes < 1:
        raise SystemExit("--uploaded-buffer-bytes must be >= 1")
    if args.poll_interval_seconds <= 0:
        raise SystemExit("--poll-interval-seconds must be > 0")
    if args.processing_timeout_seconds <= 0:
        raise SystemExit("--processing-timeout-seconds must be > 0")
    if args.request_timeout_seconds <= 0:
        raise SystemExit("--request-timeout-seconds must be > 0")
    if (args.identifier and not args.password) or (args.password and not args.identifier):
        raise SystemExit("Provide both --identifier and --password together.")

    artifact_dir = args.artifact_dir.expanduser().resolve()
    artifact_dir.mkdir(parents=True, exist_ok=True)

    fixtures = build_smoke_fixtures(
        artifact_dir=artifact_dir,
        modes=modes,
        inline_threshold_bytes=args.inline_threshold_bytes,
        uploaded_buffer_bytes=args.uploaded_buffer_bytes,
    )

    summary: dict[str, Any] = {
        "api_base": args.api_base.rstrip("/"),
        "inline_threshold_bytes": args.inline_threshold_bytes,
        "fixtures_only": bool(args.fixtures_only),
        "fixtures": [asdict_fixture(fixture) for fixture in fixtures],
        "results": [],
    }

    print_fixture_summary(fixtures)
    if args.fixtures_only:
        write_summary_if_requested(summary=summary, output_path=args.json_output)
        return 0

    with httpx.Client(timeout=args.request_timeout_seconds, follow_redirects=True) as client:
        access_token = authenticate(client, args)
        runtime_settings = fetch_document_settings(client, api_base=args.api_base, access_token=access_token)
        summary["runtime_settings"] = runtime_settings
        validate_runtime_settings(runtime_settings=runtime_settings, modes=modes)

        results = [
            run_smoke_mode(
                client,
                api_base=args.api_base,
                access_token=access_token,
                fixture=fixture,
                processing_timeout_seconds=args.processing_timeout_seconds,
                poll_interval_seconds=args.poll_interval_seconds,
            )
            for fixture in fixtures
        ]
        summary["results"] = [asdict(result) for result in results]
        write_summary_if_requested(summary=summary, output_path=args.json_output)
        print_result_summary(results)
        return 1 if any(result.issues for result in results) else 0


def build_smoke_fixtures(
    *,
    artifact_dir: Path,
    modes: tuple[SmokeMode, ...],
    inline_threshold_bytes: int,
    uploaded_buffer_bytes: int,
) -> list[SmokeFixture]:
    fixtures: list[SmokeFixture] = []
    for mode in modes:
        if mode == "builtin":
            path = artifact_dir / "builtin-parser-smoke.pdf"
            size_bytes, page_count = write_small_smoke_pdf(path, title="Built-in Parser Smoke PDF")
            fixtures.append(
                SmokeFixture(
                    mode=mode,
                    path=path,
                    size_bytes=size_bytes,
                    requested_processor_provider="builtin",
                    expected_transport="builtin-only",
                    page_count=page_count,
                )
            )
            continue

        if mode == "openai-inline":
            path = artifact_dir / "openai-inline-smoke.pdf"
            size_bytes, page_count = write_small_smoke_pdf(path, title="OpenAI Inline Smoke PDF")
            fixtures.append(
                SmokeFixture(
                    mode=mode,
                    path=path,
                    size_bytes=size_bytes,
                    requested_processor_provider="openai",
                    expected_transport="inline-file-data",
                    page_count=page_count,
                )
            )
            continue

        path = artifact_dir / "openai-uploaded-smoke.pdf"
        target_bytes = inline_threshold_bytes + uploaded_buffer_bytes
        size_bytes, page_count = write_large_smoke_pdf(path, min_size_bytes=target_bytes)
        fixtures.append(
            SmokeFixture(
                mode=mode,
                path=path,
                size_bytes=size_bytes,
                requested_processor_provider="openai",
                expected_transport="uploaded-file-id",
                page_count=page_count,
            )
        )
    return fixtures


def write_small_smoke_pdf(path: Path, *, title: str) -> tuple[int, int]:
    document = fitz.open()
    try:
        first_page = document.new_page(width=612, height=792)
        first_page.insert_textbox(
            fitz.Rect(48, 48, 564, 744),
            (
                f"{title}\n\n"
                "Document Type: Trade Confirmation\n"
                "Counterparty: ACME Energy\n"
                "Trade ID: T-1001\n"
                "Confirmation Number: CNF-T-1001\n"
                "Commodity: Henry Hub Natural Gas\n"
                "Delivery Window: 2026-05-01 to 2026-05-31\n"
                "Volume: 1000 MMBtu/day\n"
                "Price: 3.25 USD/MMBtu\n"
                "Settlement Terms: Net 15\n"
                "Notes: This deterministic PDF exists to validate the document ingestion smoke harness.\n\n"
                "Line Items\n"
                "Date | Quantity | Unit | Price\n"
                "2026-05-01 | 1000 | MMBtu | 3.25\n"
                "2026-05-02 | 1000 | MMBtu | 3.25\n"
                "2026-05-03 | 1000 | MMBtu | 3.25\n"
            ),
            fontsize=11,
            fontname="helv",
        )

        second_page = document.new_page(width=612, height=792)
        second_page.insert_textbox(
            fitz.Rect(48, 48, 564, 744),
            (
                "Supporting Notes\n\n"
                "Buyer: ACME Energy Trading\n"
                "Seller: North Desk Supply\n"
                "Scheduling Contact: ops-confirmations@example.com\n"
                "Payment Currency: USD\n"
                "Price Unit: USD/MMBtu\n"
                "Special Instructions: Smoke harness sample only.\n"
            ),
            fontsize=11,
            fontname="helv",
        )

        payload = document.tobytes()
        path.write_bytes(payload)
        return len(payload), document.page_count
    finally:
        document.close()


def write_large_smoke_pdf(path: Path, *, min_size_bytes: int) -> tuple[int, int]:
    document = fitz.open()
    try:
        lead_page = document.new_page(width=612, height=792)
        lead_page.insert_textbox(
            fitz.Rect(48, 48, 564, 744),
            (
                "OpenAI Uploaded-File Smoke PDF\n\n"
                "Document Type: Trade Confirmation\n"
                "Counterparty: ACME Energy\n"
                "Trade ID: T-1002\n"
                "Confirmation Number: CNF-T-1002\n"
                "Commodity: Henry Hub Natural Gas\n"
                "Delivery Window: 2026-06-01 to 2026-06-30\n"
                "Volume: 1250 MMBtu/day\n"
                "Price: 3.40 USD/MMBtu\n"
                "Purpose: Force a PDF above the inline threshold so the OpenAI Files API path is exercised.\n"
                "The semantic content is intentionally compact so the fixture validates file upload transport\n"
                "without inflating the model context window.\n"
            ),
            fontsize=11,
            fontname="helv",
        )
        appendix_page = document.new_page(width=612, height=792)
        appendix_page.insert_textbox(
            fitz.Rect(48, 48, 564, 744),
            (
                "Appendix\n\n"
                "Uploaded-file smoke fixtures use deterministic byte padding after the PDF EOF marker.\n"
                "That keeps the document readable while pushing the file over the inline threshold.\n"
            ),
            fontsize=11,
            fontname="helv",
        )
        payload = document.tobytes()
        if len(payload) < min_size_bytes:
            padding_length = min_size_bytes - len(payload)
            payload += b"\n% smoke-padding-begin\n" + (b"0" * padding_length)
        path.write_bytes(payload)
        return len(payload), document.page_count
    finally:
        document.close()


def authenticate(client: httpx.Client, args: argparse.Namespace) -> str:
    access_token = clean_optional_text(args.access_token)
    if access_token:
        return access_token

    api_base = args.api_base.rstrip("/")
    if args.use_single_user_session:
        payload = request_json(client, "POST", f"{api_base}/auth/single-user-session")
        return str(payload["access_token"])

    identifier = clean_optional_text(args.identifier)
    password = clean_optional_text(args.password)
    if identifier and password:
        payload = request_json(
            client,
            "POST",
            f"{api_base}/auth/session",
            json_payload={"identifier": identifier, "password": password},
        )
        return str(payload["access_token"])

    single_user_response = client.post(f"{api_base}/auth/single-user-session")
    if single_user_response.status_code < 400:
        payload = cast(dict[str, Any], single_user_response.json())
        return str(payload["access_token"])

    raise SystemExit(
        "Authentication failed. Pass --access-token, provide --identifier and --password, "
        "or enable single-user auth and rerun with --use-single-user-session."
    )


def fetch_document_settings(
    client: httpx.Client,
    *,
    api_base: str,
    access_token: str,
) -> dict[str, Any]:
    payload = request_json(
        client,
        "GET",
        f"{api_base.rstrip('/')}/documents/settings",
        access_token=access_token,
    )
    return cast(dict[str, Any], payload)


def validate_runtime_settings(*, runtime_settings: dict[str, Any], modes: tuple[SmokeMode, ...]) -> None:
    providers = {
        str(provider.get("provider")): provider
        for provider in cast(list[dict[str, Any]], runtime_settings.get("providers") or [])
    }
    if any(mode.startswith("openai") for mode in modes):
        openai = providers.get("openai")
        if openai is None:
            raise SystemExit("The API did not report an OpenAI document-processing provider.")
        if not bool(openai.get("configured")):
            raise SystemExit(
                "OpenAI document processing is not configured on this API. "
                "Set OPENAI_API_KEY (and related model settings) or run only --mode builtin."
            )


def run_smoke_mode(
    client: httpx.Client,
    *,
    api_base: str,
    access_token: str,
    fixture: SmokeFixture,
    processing_timeout_seconds: float,
    poll_interval_seconds: float,
) -> SmokeResult:
    display_name = f"{fixture.mode} smoke {int(time.time())}"
    with fixture.path.open("rb") as handle:
        uploaded_document = request_json(
            client,
            "POST",
            f"{api_base.rstrip('/')}/documents/uploads",
            access_token=access_token,
            files={"file": (fixture.path.name, handle, "application/pdf")},
            form_data={
                "display_name": display_name,
                "processor_provider": fixture.requested_processor_provider,
            },
        )

    upload_status = text_value(uploaded_document.get("status"))
    document_id = text_value(uploaded_document.get("document_id"))
    if document_id is None:
        return SmokeResult(
            mode=fixture.mode,
            path=str(fixture.path),
            size_bytes=fixture.size_bytes,
            requested_processor_provider=fixture.requested_processor_provider,
            expected_transport=fixture.expected_transport,
            document_id=None,
            upload_status=upload_status,
            final_status=None,
            page_count=fixture.page_count,
            dominant_document_kind=None,
            recorded_processor_provider=None,
            recorded_processor_model=None,
            processor_trace_provider=None,
            processor_trace_applied=False,
            processor_trace_partial=False,
            issues=["Upload response did not include a document_id."],
        )

    final_document = poll_for_document_completion(
        client,
        api_base=api_base,
        access_token=access_token,
        document_id=document_id,
        processing_timeout_seconds=processing_timeout_seconds,
        poll_interval_seconds=poll_interval_seconds,
    )
    return summarize_result(fixture=fixture, upload_status=upload_status, document=final_document)


def poll_for_document_completion(
    client: httpx.Client,
    *,
    api_base: str,
    access_token: str,
    document_id: str,
    processing_timeout_seconds: float,
    poll_interval_seconds: float,
) -> dict[str, Any]:
    deadline = time.monotonic() + processing_timeout_seconds
    latest = request_json(
        client,
        "GET",
        f"{api_base.rstrip('/')}/documents/{document_id}",
        access_token=access_token,
    )
    while text_value(latest.get("status")) in PROCESSING_STATUSES:
        if time.monotonic() >= deadline:
            raise RuntimeError(
                f"Timed out waiting for document {document_id} to finish processing after "
                f"{processing_timeout_seconds:.1f} seconds."
            )
        time.sleep(poll_interval_seconds)
        latest = request_json(
            client,
            "GET",
            f"{api_base.rstrip('/')}/documents/{document_id}",
            access_token=access_token,
        )
    return latest


def summarize_result(
    *,
    fixture: SmokeFixture,
    upload_status: str | None,
    document: dict[str, Any],
) -> SmokeResult:
    processor_trace = cast(dict[str, Any] | None, document.get("processor_trace"))
    dominant_document_kind = text_value(cast(dict[str, Any], document.get("analysis_summary") or {}).get("dominant_document_kind"))
    warnings = collect_document_warnings(document)

    result = SmokeResult(
        mode=fixture.mode,
        path=str(fixture.path),
        size_bytes=fixture.size_bytes,
        requested_processor_provider=fixture.requested_processor_provider,
        expected_transport=fixture.expected_transport,
        document_id=text_value(document.get("document_id")),
        upload_status=upload_status,
        final_status=text_value(document.get("status")),
        page_count=int(document.get("page_count") or fixture.page_count),
        dominant_document_kind=dominant_document_kind,
        recorded_processor_provider=text_value(document.get("processor_provider")),
        recorded_processor_model=text_value(document.get("processor_model")),
        processor_trace_provider=text_value(processor_trace.get("provider")) if processor_trace else None,
        processor_trace_applied=bool(processor_trace.get("applied")) if processor_trace else False,
        processor_trace_partial=bool(processor_trace.get("partial")) if processor_trace else False,
        processing_errors=[str(value) for value in cast(list[Any], document.get("processing_errors") or [])],
        warnings=warnings,
        issues=validate_result(fixture=fixture, document=document),
    )
    return result


def validate_result(*, fixture: SmokeFixture, document: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    status = text_value(document.get("status"))
    processor_provider = text_value(document.get("processor_provider"))
    processor_trace = cast(dict[str, Any] | None, document.get("processor_trace"))
    processing_errors = cast(list[Any], document.get("processing_errors") or [])

    if status != "ANALYZED":
        issues.append(f"Expected final status ANALYZED but received {status or 'unknown'}.")
    if processing_errors:
        issues.append(f"Document reported processing_errors={processing_errors}.")
    if processor_provider != fixture.requested_processor_provider:
        issues.append(
            "Recorded processor_provider "
            f"{processor_provider or 'unknown'} does not match requested {fixture.requested_processor_provider}."
        )

    if fixture.mode == "builtin":
        if processor_trace is not None:
            issues.append("Built-in mode should not produce a document-level processor_trace.")
    else:
        if processor_trace is None:
            issues.append("OpenAI smoke mode did not return a document-level processor_trace.")
        else:
            if text_value(processor_trace.get("provider")) != "openai":
                issues.append(
                    "OpenAI smoke mode returned processor_trace.provider="
                    f"{text_value(processor_trace.get('provider')) or 'unknown'}."
                )
            if not bool(processor_trace.get("applied")):
                issues.append("OpenAI smoke mode completed without processor_trace.applied=true.")

    return issues


def collect_document_warnings(document: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    processor_trace = cast(dict[str, Any] | None, document.get("processor_trace"))
    if processor_trace is not None:
        warnings.extend(str(value) for value in cast(list[Any], processor_trace.get("warnings") or []))

    for page in cast(list[dict[str, Any]], document.get("pages") or []):
        warnings.extend(str(value) for value in cast(list[Any], page.get("processing_warnings") or []))
        page_trace = cast(dict[str, Any] | None, page.get("processor_trace"))
        if page_trace is not None:
            warnings.extend(str(value) for value in cast(list[Any], page_trace.get("warnings") or []))
    return dedupe_preserving_order(warnings)


def request_json(
    client: httpx.Client,
    method: str,
    url: str,
    *,
    access_token: str | None = None,
    json_payload: dict[str, Any] | None = None,
    form_data: dict[str, str] | None = None,
    files: dict[str, Any] | None = None,
) -> dict[str, Any]:
    headers: dict[str, str] = {}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    response = client.request(
        method,
        url,
        headers=headers,
        json=json_payload,
        data=form_data,
        files=files,
    )
    if response.status_code >= 400:
        detail: Any
        try:
            detail = response.json()
        except ValueError:
            detail = response.text
        raise RuntimeError(
            f"{method} {url} failed with status {response.status_code}: {detail}"
        )
    payload = response.json()
    if not isinstance(payload, dict):
        raise RuntimeError(f"{method} {url} returned a non-object JSON payload.")
    return cast(dict[str, Any], payload)


def print_fixture_summary(fixtures: list[SmokeFixture]) -> None:
    print("Generated smoke fixtures:")
    for fixture in fixtures:
        print(
            f"- {fixture.mode}: path={fixture.path} size_bytes={fixture.size_bytes} "
            f"pages={fixture.page_count} provider={fixture.requested_processor_provider} "
            f"expected_transport={fixture.expected_transport}"
        )


def print_result_summary(results: list[SmokeResult]) -> None:
    print("\nDocument ingestion smoke results:")
    for result in results:
        status_label = "PASS" if not result.issues else "FAIL"
        print(
            f"- [{status_label}] {result.mode}: document_id={result.document_id} "
            f"upload_status={result.upload_status} final_status={result.final_status} "
            f"provider={result.recorded_processor_provider} model={result.recorded_processor_model} "
            f"trace_provider={result.processor_trace_provider} trace_applied={result.processor_trace_applied} "
            f"trace_partial={result.processor_trace_partial} warnings={len(result.warnings)}"
        )
        if result.processing_errors:
            print(f"  processing_errors={result.processing_errors}")
        if result.warnings:
            print(f"  warnings={result.warnings}")
        if result.issues:
            print(f"  issues={result.issues}")


def write_summary_if_requested(*, summary: dict[str, Any], output_path: Path | None) -> None:
    if output_path is None:
        return
    resolved_path = output_path.expanduser().resolve()
    resolved_path.parent.mkdir(parents=True, exist_ok=True)
    resolved_path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"\nWrote smoke summary to {resolved_path}")


def asdict_fixture(fixture: SmokeFixture) -> dict[str, Any]:
    payload = asdict(fixture)
    payload["path"] = str(fixture.path)
    return payload


def dedupe_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return deduped


def text_value(value: Any) -> str | None:
    if isinstance(value, str):
        normalized = value.strip()
        return normalized or None
    return None


def clean_optional_text(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _env_truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


if __name__ == "__main__":
    raise SystemExit(main())
