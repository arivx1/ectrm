from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from functools import lru_cache
from time import perf_counter
from typing import Any, Iterable, cast

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.schemas.document import (
    DocumentProcessorProvider,
    DocumentProcessorProviderStatusOut,
    DocumentProcessorRuntimeSettingsOut,
    DocumentProcessorSelection,
)

from .document_ingestion_common import clean_optional_text
from .document_ingestion_review import normalize_header_fields, normalize_table_blocks
from .schema_registry import build_document_schema_registry, list_supported_document_kinds

PROVIDER_LABELS: dict[DocumentProcessorProvider, str] = {
    "openai": "GPT",
    "anthropic": "Claude",
    "google": "Gemini",
}

PROVIDER_SETUP_ENV_VARS: dict[DocumentProcessorProvider, str] = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GOOGLE_API_KEY",
}

DEFAULT_DOCUMENT_PROCESSOR_MODEL_OPTIONS: dict[DocumentProcessorProvider, tuple[str, ...]] = {
    "openai": ("gpt-5", "gpt-5-mini", "gpt-5-nano"),
    "anthropic": ("claude-sonnet-4-0", "claude-opus-4-0"),
    "google": ("gemini-2.5-pro", "gemini-2.5-flash"),
}

VALID_DOCUMENT_PROCESSOR_PROVIDERS: tuple[DocumentProcessorProvider, ...] = (
    "openai",
    "anthropic",
    "google",
)
VALID_DOCUMENT_PROCESSOR_SELECTIONS: tuple[DocumentProcessorSelection, ...] = (
    "builtin",
    "openai",
    "anthropic",
    "google",
)

logger = get_logger(__name__)
OPENAI_DOCUMENT_RESPONSE_FORMAT_NAME = "document_page_analysis"
OPENAI_INPUT_FILE_MAX_BYTES = 50 * 1024 * 1024
OPENAI_FILE_UPLOAD_PURPOSE = "user_data"


@dataclass(frozen=True)
class DocumentProcessorProviderConfig:
    provider: DocumentProcessorProvider
    label: str
    api_key: str
    model: str
    model_options: tuple[str, ...]
    base_url: str
    configured: bool
    enabled: bool
    is_default: bool
    setup_env_var: str


@dataclass(frozen=True)
class DocumentProcessorPageResult:
    page_number: int
    document_kind: str
    document_subtype: str | None
    confidence: float | None
    header_fields: list[dict[str, object]]
    table_blocks: list[dict[str, object]]
    warnings: list[str]
    partial: bool = False


@dataclass(frozen=True)
class DocumentProcessorOutcome:
    provider: DocumentProcessorProvider
    model: str
    pages: list[DocumentProcessorPageResult]


@dataclass(frozen=True)
class _OpenAIInputFile:
    content: dict[str, Any]
    uploaded_file_id: str | None = None


class _ProcessorField(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field_key: str
    label: str | None = Field(default=None, max_length=120)
    value: str = Field(min_length=1, max_length=500)
    confidence: float | None = Field(default=None, ge=0, le=1)


class _ProcessorTableBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template_key: str | None = Field(default=None, max_length=64)
    title: str | None = Field(default=None, max_length=160)
    columns: list[str] = Field(default_factory=list, max_length=24)
    rows: list[dict[str, str | None]] = Field(default_factory=list, max_length=250)
    header_row_detected: bool = False
    confidence: float | None = Field(default=None, ge=0, le=1)

    @field_validator("rows", mode="before")
    @classmethod
    def _normalize_cell_rows(cls, value: object) -> object:
        if not isinstance(value, list):
            return value

        normalized_rows: list[object] = []
        for row in value:
            if isinstance(row, dict) and isinstance(row.get("cells"), list):
                row_values: dict[str, object] = {}
                for cell in row["cells"]:
                    if not isinstance(cell, dict):
                        continue
                    column = clean_optional_text(cell.get("column"))
                    if column is not None:
                        row_values[column] = cell.get("value")
                normalized_rows.append(row_values)
            else:
                normalized_rows.append(row)
        return normalized_rows


class _ProcessorPageAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    page_number: int = Field(ge=1)
    document_kind: str = Field(min_length=3, max_length=64)
    document_subtype: str | None = Field(default=None, max_length=128)
    confidence: float | None = Field(default=None, ge=0, le=1)
    header_fields: list[_ProcessorField] = Field(default_factory=list, max_length=64)
    table_blocks: list[_ProcessorTableBlock] = Field(default_factory=list, max_length=24)
    warnings: list[str] = Field(default_factory=list, max_length=24)


class _ProcessorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pages: list[_ProcessorPageAnalysis] = Field(default_factory=list, max_length=250)


def build_document_processor_runtime_settings() -> DocumentProcessorRuntimeSettingsOut:
    provider_configs = list_document_processor_configs()
    effective_default_provider = determine_effective_document_processor_provider(provider_configs)
    return DocumentProcessorRuntimeSettingsOut(
        enabled=bool(settings.DOCUMENT_AI_ENABLED and effective_default_provider),
        default_provider=normalize_document_processor_default_provider(settings.DOCUMENT_AI_DEFAULT_PROVIDER),
        effective_default_provider=effective_default_provider,
        configured_provider_count=sum(1 for config in provider_configs if config.configured),
        providers=[
            DocumentProcessorProviderStatusOut(
                provider=config.provider,
                label=config.label,
                enabled=config.enabled,
                configured=config.configured,
                is_default=config.is_default,
                default_model=config.model,
                available_models=list(config.model_options),
                base_url=config.base_url,
                setup_env_var=config.setup_env_var,
            )
            for config in provider_configs
        ],
    )


def list_document_processor_configs() -> list[DocumentProcessorProviderConfig]:
    default_provider = normalize_document_processor_default_provider(settings.DOCUMENT_AI_DEFAULT_PROVIDER)
    return [
        _build_provider_config(
            provider="openai",
            default_provider=default_provider,
            api_key=settings.OPENAI_API_KEY,
            model=(settings.DOCUMENT_AI_OPENAI_MODEL or settings.OPENAI_MODEL),
            model_options=settings.DOCUMENT_AI_OPENAI_MODEL_OPTIONS,
            base_url=settings.OPENAI_BASE_URL,
        ),
        _build_provider_config(
            provider="anthropic",
            default_provider=default_provider,
            api_key=settings.ANTHROPIC_API_KEY,
            model=(settings.DOCUMENT_AI_ANTHROPIC_MODEL or settings.ANTHROPIC_MODEL),
            model_options=settings.DOCUMENT_AI_ANTHROPIC_MODEL_OPTIONS,
            base_url=settings.ANTHROPIC_BASE_URL,
        ),
        _build_provider_config(
            provider="google",
            default_provider=default_provider,
            api_key=settings.GOOGLE_API_KEY,
            model=(settings.DOCUMENT_AI_GOOGLE_MODEL or settings.GOOGLE_MODEL),
            model_options=settings.DOCUMENT_AI_GOOGLE_MODEL_OPTIONS,
            base_url=settings.GOOGLE_BASE_URL,
        ),
    ]


def determine_effective_document_processor_provider(
    provider_configs: Iterable[DocumentProcessorProviderConfig],
) -> DocumentProcessorProvider | None:
    configs = list(provider_configs)
    default_provider = normalize_document_processor_default_provider(settings.DOCUMENT_AI_DEFAULT_PROVIDER)
    preferred = next((config for config in configs if config.provider == default_provider and config.configured), None)
    if preferred is not None:
        return preferred.provider
    fallback = next((config for config in configs if config.configured), None)
    return fallback.provider if fallback is not None else None


def normalize_document_processor_default_provider(value: str) -> DocumentProcessorProvider:
    normalized = value.strip().lower()
    if normalized in VALID_DOCUMENT_PROCESSOR_PROVIDERS:
        return cast(DocumentProcessorProvider, normalized)
    return "openai"


def normalize_document_processor_provider(value: str | None) -> DocumentProcessorProvider | None:
    normalized = clean_optional_text(value, lowercase=True)
    if normalized is None:
        return None
    if normalized not in VALID_DOCUMENT_PROCESSOR_PROVIDERS:
        raise ValueError(
            f"Document processor provider '{value}' is not supported. "
            f"Expected one of: {', '.join(VALID_DOCUMENT_PROCESSOR_PROVIDERS)}."
        )
    return cast(DocumentProcessorProvider, normalized)


def normalize_document_processor_selection(value: str | None) -> DocumentProcessorSelection | None:
    normalized = clean_optional_text(value, lowercase=True)
    if normalized is None:
        return None
    if normalized not in VALID_DOCUMENT_PROCESSOR_SELECTIONS:
        raise ValueError(
            f"Document processor option '{value}' is not supported. "
            f"Expected one of: {', '.join(VALID_DOCUMENT_PROCESSOR_SELECTIONS)}."
        )
    return cast(DocumentProcessorSelection, normalized)


def resolve_requested_document_processor(
    requested_provider: str | None = None,
    requested_model: str | None = None,
) -> tuple[DocumentProcessorSelection | None, str | None]:
    normalized_selection = normalize_document_processor_selection(requested_provider)
    if normalized_selection == "builtin":
        if clean_optional_text(requested_model) is not None:
            raise ValueError("Built-in parsing does not accept a processing model selection.")
        return "builtin", None

    normalized_provider = normalize_document_processor_provider(normalized_selection)
    if normalized_provider is not None:
        if not settings.DOCUMENT_AI_ENABLED:
            raise ValueError("Document AI processing is disabled on this API.")
        config = next(
            candidate for candidate in list_document_processor_configs() if candidate.provider == normalized_provider
        )
        if not config.configured:
            raise ValueError(f"{config.label} is not configured for document processing on this API.")
        return config.provider, resolve_requested_document_processor_model(config, requested_model)

    config = _resolve_runtime_document_processor_config(None)
    if config is None:
        return None, None
    return config.provider, resolve_requested_document_processor_model(config, requested_model)


def resolve_requested_document_processor_model(
    config: DocumentProcessorProviderConfig,
    requested_model: str | None,
) -> str:
    normalized_model = clean_optional_text(requested_model)
    if normalized_model is None:
        return config.model

    if normalized_model not in config.model_options:
        raise ValueError(
            f"{config.label} model '{normalized_model}' is not available for document processing on this API."
        )
    return normalized_model


def run_document_processor_analysis(
    *,
    filename: str,
    payload: bytes,
    pages: list[DocumentIngestionPage],
    processor_provider: str | None,
) -> tuple[DocumentProcessorOutcome | None, list[str]]:
    normalized_selection = normalize_document_processor_selection(processor_provider)
    if normalized_selection == "builtin":
        return None, []

    config = _resolve_runtime_document_processor_config(processor_provider)
    if config is None:
        if normalized_selection is not None:
            provider = normalize_document_processor_provider(normalized_selection)
            label = PROVIDER_LABELS.get(provider, str(processor_provider)) if provider else str(processor_provider)
            return None, [f"{label} was selected for document processing, but it is not configured on this API."]
        return None, []

    try:
        if config.provider == "openai":
            analysis = _generate_openai_document_analysis(
                provider=config,
                model=config.model,
                filename=filename,
                payload=payload,
                pages=pages,
            )
        elif config.provider == "anthropic":
            analysis = _generate_anthropic_document_analysis(
                provider=config,
                model=config.model,
                filename=filename,
                pages=pages,
            )
        else:
            analysis = _generate_google_document_analysis(
                provider=config,
                model=config.model,
                filename=filename,
                pages=pages,
            )
    except Exception as exc:
        return None, [f"{config.label} document processing failed: {exc}"]

    normalized_pages: list[DocumentProcessorPageResult] = []
    normalization_warnings: list[str] = []
    page_count = len(pages)
    seen_page_numbers: set[int] = set()
    for page_analysis in analysis.pages:
        if page_analysis.page_number > page_count:
            normalization_warnings.append(
                f"{config.label} returned page {page_analysis.page_number}, but the uploaded PDF has {page_count} pages."
            )
            continue
        if page_analysis.page_number in seen_page_numbers:
            normalization_warnings.append(
                f"{config.label} returned duplicate analysis for page {page_analysis.page_number}; only the first result was applied."
            )
            continue
        seen_page_numbers.add(page_analysis.page_number)
        page_result = _normalize_page_analysis(page_analysis, provider=config.provider)
        normalized_pages.append(page_result)

    returned_page_numbers = {page.page_number for page in normalized_pages}
    missing_page_numbers = [page_number for page_number in range(1, page_count + 1) if page_number not in returned_page_numbers]
    if missing_page_numbers:
        normalization_warnings.append(
            f"{config.label} did not return page analysis for pages {', '.join(str(page_number) for page_number in missing_page_numbers)}."
        )

    if not normalized_pages:
        return None, [f"{config.label} returned no usable page analysis for this document.", *normalization_warnings]

    return (
        DocumentProcessorOutcome(
            provider=config.provider,
            model=config.model,
            pages=normalized_pages,
        ),
        normalization_warnings,
    )


def _resolve_runtime_document_processor_config(
    requested_provider: str | None,
) -> DocumentProcessorProviderConfig | None:
    if not settings.DOCUMENT_AI_ENABLED:
        return None

    provider_configs = {config.provider: config for config in list_document_processor_configs()}
    normalized_provider = normalize_document_processor_provider(requested_provider)
    if normalized_provider is not None:
        config = provider_configs[normalized_provider]
        return config if config.configured else None

    effective_default_provider = determine_effective_document_processor_provider(provider_configs.values())
    if effective_default_provider is None:
        return None
    return provider_configs[effective_default_provider]


def _build_provider_config(
    *,
    provider: DocumentProcessorProvider,
    default_provider: DocumentProcessorProvider,
    api_key: str,
    model: str,
    model_options: str,
    base_url: str,
) -> DocumentProcessorProviderConfig:
    normalized_model = model.strip()
    configured = bool(api_key.strip() and normalized_model)
    return DocumentProcessorProviderConfig(
        provider=provider,
        label=PROVIDER_LABELS[provider],
        api_key=api_key.strip(),
        model=normalized_model,
        model_options=build_document_processor_model_options(
            provider=provider,
            default_model=normalized_model,
            configured_model_options=model_options,
        ),
        base_url=base_url.strip(),
        configured=configured,
        enabled=bool(settings.DOCUMENT_AI_ENABLED and configured),
        is_default=provider == default_provider,
        setup_env_var=PROVIDER_SETUP_ENV_VARS[provider],
    )


def build_document_processor_model_options(
    *,
    provider: DocumentProcessorProvider,
    default_model: str,
    configured_model_options: str,
) -> tuple[str, ...]:
    seen_models: set[str] = set()
    normalized_models: list[str] = []

    def include(value: str | None) -> None:
        normalized_value = clean_optional_text(value)
        if not normalized_value or normalized_value in seen_models:
            return
        seen_models.add(normalized_value)
        normalized_models.append(normalized_value)

    include(default_model)
    for value in configured_model_options.split(","):
        include(value)
    for value in DEFAULT_DOCUMENT_PROCESSOR_MODEL_OPTIONS[provider]:
        include(value)

    return tuple(normalized_models)


def _generate_openai_document_analysis(
    *,
    provider: DocumentProcessorProviderConfig,
    model: str,
    filename: str,
    payload: bytes,
    pages: list[DocumentIngestionPage],
) -> _ProcessorResponse:
    prompt = _build_openai_document_prompt(filename=filename, page_count=len(pages))
    response_payload: dict[str, Any]
    openai_file: _OpenAIInputFile | None = None
    with httpx.Client(timeout=settings.DOCUMENT_AI_TIMEOUT_SECONDS) as client:
        openai_file = _build_openai_input_file(
            client=client,
            provider=provider,
            filename=filename,
            payload=payload,
        )
        try:
            response_payload = _post_json(
                url=f"{provider.base_url.rstrip('/')}/responses",
                headers={
                    "Authorization": f"Bearer {provider.api_key}",
                    "Content-Type": "application/json",
                },
                payload={
                    "model": model,
                    "max_output_tokens": settings.DOCUMENT_AI_MAX_OUTPUT_TOKENS,
                    "instructions": _document_processor_system_prompt(),
                    "input": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "input_text",
                                    "text": prompt,
                                },
                                openai_file.content,
                            ],
                        }
                    ],
                    "text": {"format": _build_openai_text_format()},
                },
                provider_label=provider.label,
                timeout_seconds=settings.DOCUMENT_AI_TIMEOUT_SECONDS,
                client=client,
            )
        finally:
            if openai_file is not None and openai_file.uploaded_file_id is not None:
                _delete_openai_uploaded_file(
                    client=client,
                    provider=provider,
                    file_id=openai_file.uploaded_file_id,
                )
    return _parse_document_processor_response(
        _extract_openai_document_response_text(response_payload, provider_label=provider.label),
        provider_label=provider.label,
    )


def _generate_anthropic_document_analysis(
    *,
    provider: DocumentProcessorProviderConfig,
    model: str,
    filename: str,
    pages: list[DocumentIngestionPage],
) -> _ProcessorResponse:
    prompt = _build_text_document_prompt(filename=filename, page_count=len(pages), pages=pages)
    response_payload = _post_json(
        url=f"{provider.base_url.rstrip('/')}/v1/messages",
        headers={
            "x-api-key": provider.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        payload={
            "model": model,
            "max_tokens": settings.DOCUMENT_AI_MAX_OUTPUT_TOKENS,
            "system": _document_processor_system_prompt(),
            "messages": [
                {
                    "role": "user",
                    "content": [{"type": "text", "text": prompt}],
                }
            ],
        },
        provider_label=provider.label,
        timeout_seconds=settings.DOCUMENT_AI_TIMEOUT_SECONDS,
    )
    return _parse_document_processor_response(
        _extract_anthropic_text(response_payload.get("content", [])),
        provider_label=provider.label,
    )


def _generate_google_document_analysis(
    *,
    provider: DocumentProcessorProviderConfig,
    model: str,
    filename: str,
    pages: list[DocumentIngestionPage],
) -> _ProcessorResponse:
    prompt = _build_text_document_prompt(filename=filename, page_count=len(pages), pages=pages)
    response_payload = _post_json(
        url=f"{provider.base_url.rstrip('/')}/models/{model}:generateContent",
        headers={
            "x-goog-api-key": provider.api_key,
            "Content-Type": "application/json",
        },
        payload={
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}],
                }
            ],
            "systemInstruction": {
                "parts": [{"text": _document_processor_system_prompt()}],
            },
            "generationConfig": {
                "maxOutputTokens": settings.DOCUMENT_AI_MAX_OUTPUT_TOKENS,
                "responseMimeType": "application/json",
            },
        },
        provider_label=provider.label,
        timeout_seconds=settings.DOCUMENT_AI_TIMEOUT_SECONDS,
    )
    prompt_feedback = response_payload.get("promptFeedback", {})
    block_reason = prompt_feedback.get("blockReason")
    if block_reason:
        raise ValueError(f"{provider.label} blocked the document-processing request: {block_reason}.")

    candidates = response_payload.get("candidates", [])
    if not candidates:
        raise ValueError(f"{provider.label} returned no candidates.")
    candidate = candidates[0]
    content = candidate.get("content", {})
    parts = content.get("parts", []) if isinstance(content, dict) else []
    return _parse_document_processor_response(
        _extract_google_text(parts),
        provider_label=provider.label,
    )


def _normalize_page_analysis(
    page_analysis: _ProcessorPageAnalysis,
    *,
    provider: DocumentProcessorProvider,
) -> DocumentProcessorPageResult:
    warnings: list[str] = []
    partial = False
    document_kind = _normalize_document_kind(page_analysis.document_kind)
    source = f"{provider}:document_ai"

    raw_header_fields = []
    for field in page_analysis.header_fields:
        raw_header_fields.append(
            {
                "field_key": field.field_key,
                "label": field.label,
                "value": field.value,
                "confidence": field.confidence,
                "source": source,
            }
        )

    raw_table_blocks: list[dict[str, object]] = []
    for block in page_analysis.table_blocks:
        raw_table_blocks.append(
            {
                "template_key": _normalize_template_key(block.template_key, document_kind=document_kind, warnings=warnings),
                "title": block.title,
                "columns": block.columns,
                "rows": block.rows,
                "header_row_detected": block.header_row_detected,
                "source": source,
            }
        )

    try:
        header_fields = normalize_header_fields(raw_header_fields, document_kind=document_kind)
    except ValueError as exc:
        warnings.append(f"Header-field normalization failed on page {page_analysis.page_number}: {exc}")
        header_fields = []
        partial = True

    try:
        table_blocks = normalize_table_blocks(raw_table_blocks, document_kind=document_kind)
    except ValueError as exc:
        warnings.append(f"Table normalization failed on page {page_analysis.page_number}: {exc}")
        raw_table_blocks = [{**block, "template_key": None} for block in raw_table_blocks]
        table_blocks = normalize_table_blocks(raw_table_blocks, document_kind=document_kind)
        partial = True

    cleaned_model_warnings = [clean_optional_text(item) for item in page_analysis.warnings if clean_optional_text(item)]
    if cleaned_model_warnings:
        partial = True
    warnings.extend(cleaned_model_warnings)
    return DocumentProcessorPageResult(
        page_number=page_analysis.page_number,
        document_kind=document_kind,
        document_subtype=clean_optional_text(page_analysis.document_subtype),
        confidence=page_analysis.confidence,
        header_fields=header_fields,
        table_blocks=table_blocks,
        warnings=[warning for warning in warnings if warning],
        partial=partial,
    )


def _normalize_document_kind(value: str) -> str:
    normalized = value.strip().upper()
    return normalized if normalized in list_supported_document_kinds() else "UNKNOWN"


def _normalize_template_key(
    value: str | None,
    *,
    document_kind: str,
    warnings: list[str],
) -> str | None:
    template_key = clean_optional_text(value, lowercase=True)
    if template_key is None:
        return None

    registry = build_document_schema_registry()
    schema = next((entry for entry in registry.document_kinds if entry.document_kind == document_kind), None)
    valid_template_keys = {template.template_key for template in schema.table_templates} if schema is not None else set()
    if valid_template_keys and template_key not in valid_template_keys:
        warnings.append(
            f"Unsupported template '{template_key}' was ignored for document kind '{document_kind}'."
        )
        return None
    return template_key


def _document_processor_system_prompt() -> str:
    return (
        "You normalize uploaded business documents into page-level JSON for an internal review workflow. "
        "Return JSON only, with no markdown fences, prose, or commentary."
    )


def _build_openai_document_prompt(*, filename: str, page_count: int) -> str:
    return (
        f"Filename: {filename}\n"
        f"Page count: {page_count}\n\n"
        f"{_document_schema_instructions()}\n\n"
        "Read the attached PDF directly. Return one page object for every page in the PDF.\n"
        f"{_document_response_contract()}"
    )


def _build_text_document_prompt(
    *,
    filename: str,
    page_count: int,
    pages: list[DocumentIngestionPage],
) -> str:
    page_payload = [
        {
            "page_number": page.page_number,
            "text_source": str((page.classification_payload or {}).get("text_source") or "none"),
            "raw_text": page.raw_text or "",
            "heuristic_document_kind": page.document_kind,
        }
        for page in pages
    ]
    return (
        f"Filename: {filename}\n"
        f"Page count: {page_count}\n\n"
        f"{_document_schema_instructions()}\n\n"
        "The PDF contents below were extracted from earlier OCR/text parsing. "
        "Use them as the source material for page-level classification and extraction.\n\n"
        f"Document text by page:\n{json.dumps(page_payload, ensure_ascii=True)}\n\n"
        f"{_document_response_contract()}"
    )


def _document_schema_instructions() -> str:
    registry = build_document_schema_registry()
    lines: list[str] = [
        "Supported document kinds and preferred field keys:",
    ]
    for kind in registry.document_kinds:
        header_fields = ", ".join(field.field_key for field in kind.header_fields) or "none"
        table_templates = ", ".join(template.template_key for template in kind.table_templates) or "none"
        extraction_objects = ", ".join(
            f"{entry.object_key}->{entry.canonical_table or entry.source_object_type or 'semantic_object'}"
            for entry in kind.extraction_objects
        ) or "none"
        lines.append(
            f"- {kind.document_kind}: fields [{header_fields}]; table templates [{table_templates}]; "
            f"extraction objects [{extraction_objects}]"
        )
    lines.append(
        "Use the supported field keys and template keys when they fit. "
        "If a field is useful but unsupported, create a short snake_case key."
    )
    lines.append(
        "Extract only values supported by the document. Preserve table rows as table_blocks when the schema exposes a "
        "matching table template; downstream normalization, validation, and business writes are handled by ECTRM."
    )
    lines.append(
        "If the page is unclear, set document_kind to UNKNOWN and leave fields or tables empty."
    )
    lines.append(
        "If the page is readable but does not fit any supported kind, set document_kind to OTHER instead of forcing the nearest typed category."
    )
    return "\n".join(lines)


def _document_response_contract() -> str:
    return (
        "Return valid JSON with this exact top-level shape:\n"
        "{\n"
        '  "pages": [\n'
        "    {\n"
        '      "page_number": 1,\n'
        '      "document_kind": "INVOICE",\n'
        '      "document_subtype": null,\n'
        '      "confidence": 0.94,\n'
        '      "header_fields": [\n'
        '        {"field_key": "invoice_number", "label": "Invoice Number", "value": "INV-1007", "confidence": 0.95}\n'
        "      ],\n"
        '      "table_blocks": [\n'
        '        {"template_key": "line_items", "title": "Charges", "columns": ["description", "quantity", "line_amount"], "rows": [{"cells": [{"column": "description", "value": "WTI April"}, {"column": "quantity", "value": "1000"}, {"column": "line_amount", "value": "79250"}]}], "header_row_detected": true, "confidence": 0.92}\n'
        "      ],\n"
        '      "warnings": []\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "Requirements:\n"
        f"- Include every page number from 1 through the uploaded page count exactly once.\n"
        "- Keep values as strings.\n"
        "- Do not invent data that is not supported by the document.\n"
        "- Do not return markdown fences or any prose outside the JSON payload."
    )


@lru_cache(maxsize=1)
def _build_openai_text_format() -> dict[str, Any]:
    return {
        "type": "json_schema",
        "name": OPENAI_DOCUMENT_RESPONSE_FORMAT_NAME,
        "schema": _build_openai_document_response_schema(),
        "strict": True,
    }


def _nullable(schema: dict[str, Any]) -> dict[str, Any]:
    return {"anyOf": [schema, {"type": "null"}]}


def _array_schema(items: dict[str, Any], *, max_items: int | None = None) -> dict[str, Any]:
    schema: dict[str, Any] = {"type": "array", "items": items}
    if max_items is not None:
        schema["maxItems"] = max_items
    return schema


def _object_schema(properties: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


def _build_openai_document_response_schema() -> dict[str, Any]:
    string_schema = {"type": "string"}
    confidence_schema = _nullable({"type": "number", "minimum": 0, "maximum": 1})

    table_cell_schema = _object_schema(
        {
            "column": {"type": "string", "maxLength": 120},
            "value": _nullable({"type": "string", "maxLength": 500}),
        }
    )
    table_row_schema = _object_schema(
        {
            "cells": _array_schema(table_cell_schema, max_items=64),
        }
    )
    table_block_schema = _object_schema(
        {
            "template_key": _nullable({"type": "string", "maxLength": 64}),
            "title": _nullable({"type": "string", "maxLength": 160}),
            "columns": _array_schema(string_schema, max_items=24),
            "rows": _array_schema(table_row_schema, max_items=250),
            "header_row_detected": {"type": "boolean"},
            "confidence": confidence_schema,
        }
    )
    field_schema = _object_schema(
        {
            "field_key": string_schema,
            "label": _nullable({"type": "string", "maxLength": 120}),
            "value": {"type": "string", "maxLength": 500},
            "confidence": confidence_schema,
        }
    )
    page_schema = _object_schema(
        {
            "page_number": {"type": "integer", "minimum": 1},
            "document_kind": {"type": "string", "minLength": 3, "maxLength": 64},
            "document_subtype": _nullable({"type": "string", "maxLength": 128}),
            "confidence": confidence_schema,
            "header_fields": _array_schema(field_schema, max_items=64),
            "table_blocks": _array_schema(table_block_schema, max_items=24),
            "warnings": _array_schema(string_schema, max_items=24),
        }
    )
    return _object_schema(
        {
            "pages": _array_schema(page_schema, max_items=250),
        }
    )


def _build_pdf_data_url(payload: bytes) -> str:
    encoded = base64.b64encode(payload).decode("ascii")
    return f"data:application/pdf;base64,{encoded}"


def _build_openai_input_file(
    *,
    client: httpx.Client,
    provider: DocumentProcessorProviderConfig,
    filename: str,
    payload: bytes,
) -> _OpenAIInputFile:
    inline_file_max_bytes = settings.DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES
    if len(payload) <= inline_file_max_bytes:
        return _OpenAIInputFile(
            content={
                "type": "input_file",
                "filename": filename,
                "file_data": _build_pdf_data_url(payload),
            }
        )

    file_id = _upload_openai_input_file(
        client=client,
        provider=provider,
        filename=filename,
        payload=payload,
    )
    return _OpenAIInputFile(
        content={
            "type": "input_file",
            "file_id": file_id,
        },
        uploaded_file_id=file_id,
    )


def _upload_openai_input_file(
    *,
    client: httpx.Client,
    provider: DocumentProcessorProviderConfig,
    filename: str,
    payload: bytes,
) -> str:
    if len(payload) > OPENAI_INPUT_FILE_MAX_BYTES:
        raise ValueError(
            f"{provider.label} only accepts document input files up to 50 MB."
        )

    url = f"{provider.base_url.rstrip('/')}/files"
    started_at = perf_counter()
    try:
        response = client.post(
            url,
            headers={
                "Authorization": f"Bearer {provider.api_key}",
            },
            data={"purpose": OPENAI_FILE_UPLOAD_PURPOSE},
            files={"file": (filename, payload, "application/pdf")},
        )
    except httpx.HTTPError as exc:
        log_outbound_request(
            logger,
            provider=provider.label,
            method="POST",
            url=url,
            status_code=getattr(getattr(exc, "response", None), "status_code", None),
            duration_ms=(perf_counter() - started_at) * 1000,
            error=exc.__class__.__name__,
        )
        raise ValueError(f"{provider.label} file upload failed: {exc}") from exc

    if response.is_error:
        detail = _extract_provider_error_message(provider.label, response)
        log_outbound_request(
            logger,
            provider=provider.label,
            method="POST",
            url=url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error=detail,
        )
        raise ValueError(f"{provider.label} file upload failed: {detail}")

    log_outbound_request(
        logger,
        provider=provider.label,
        method="POST",
        url=url,
        status_code=response.status_code,
        duration_ms=(perf_counter() - started_at) * 1000,
    )
    response_payload = cast(dict[str, Any], response.json())
    file_id = clean_optional_text(response_payload.get("id"))
    if file_id is None:
        raise ValueError(f"{provider.label} file upload did not return a file ID.")
    return file_id


def _delete_openai_uploaded_file(
    *,
    client: httpx.Client,
    provider: DocumentProcessorProviderConfig,
    file_id: str,
) -> None:
    url = f"{provider.base_url.rstrip('/')}/files/{file_id}"
    started_at = perf_counter()
    try:
        response = client.delete(
            url,
            headers={
                "Authorization": f"Bearer {provider.api_key}",
            },
        )
    except httpx.HTTPError as exc:
        log_outbound_request(
            logger,
            provider=provider.label,
            method="DELETE",
            url=url,
            status_code=getattr(getattr(exc, "response", None), "status_code", None),
            duration_ms=(perf_counter() - started_at) * 1000,
            error=exc.__class__.__name__,
        )
        return

    if response.is_error:
        detail = _extract_provider_error_message(provider.label, response)
        log_outbound_request(
            logger,
            provider=provider.label,
            method="DELETE",
            url=url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error=detail,
        )
        return

    log_outbound_request(
        logger,
        provider=provider.label,
        method="DELETE",
        url=url,
        status_code=response.status_code,
        duration_ms=(perf_counter() - started_at) * 1000,
    )


def _parse_document_processor_response(response_text: str, *, provider_label: str) -> _ProcessorResponse:
    if not response_text.strip():
        raise ValueError(f"{provider_label} returned an empty document-processing response.")
    try:
        payload = json.loads(_extract_json_object(response_text))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{provider_label} did not return valid JSON for document processing.") from exc
    try:
        return _ProcessorResponse.model_validate(payload)
    except ValidationError as exc:
        raise ValueError(f"{provider_label} returned document JSON that did not match the expected shape.") from exc


def _extract_json_object(response_text: str) -> str:
    stripped = response_text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.startswith("json"):
            stripped = stripped[4:].strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return stripped
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end > start:
        return stripped[start : end + 1]
    return stripped


def _extract_openai_text(response_payload: dict[str, Any]) -> str:
    output_text = response_payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    texts: list[str] = []
    for item in response_payload.get("output", []):
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if isinstance(content, dict) and content.get("type") == "output_text" and content.get("text"):
                texts.append(str(content["text"]).strip())
    return "\n".join(text for text in texts if text).strip()


def _extract_openai_document_response_text(
    response_payload: dict[str, Any],
    *,
    provider_label: str,
) -> str:
    status = clean_optional_text(response_payload.get("status"), lowercase=True)
    if status == "incomplete":
        incomplete_details = response_payload.get("incomplete_details", {})
        reason = clean_optional_text(
            incomplete_details.get("reason") if isinstance(incomplete_details, dict) else None
        )
        detail = f"{provider_label} returned incomplete structured output."
        if reason:
            detail += f" Reason: {reason}."
        raise ValueError(detail)

    for item in response_payload.get("output", []):
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if isinstance(content, dict) and content.get("type") == "refusal":
                refusal = clean_optional_text(content.get("refusal")) or "The request was refused."
                raise ValueError(f"{provider_label} refused the document-processing request: {refusal}")

    response_text = _extract_openai_text(response_payload)
    if response_text:
        return response_text

    raise ValueError(f"{provider_label} returned no structured document output.")


def _extract_anthropic_text(content_blocks: Any) -> str:
    return "\n".join(
        block.get("text", "").strip()
        for block in content_blocks
        if isinstance(block, dict) and block.get("type") == "text" and block.get("text")
    ).strip()


def _extract_google_text(parts: Any) -> str:
    return "\n".join(
        part.get("text", "").strip()
        for part in parts
        if isinstance(part, dict) and part.get("text")
    ).strip()


def _post_json(
    *,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    provider_label: str,
    timeout_seconds: int,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    started_at = perf_counter()
    owns_client = client is None
    request_client = client or httpx.Client(timeout=timeout_seconds)
    try:
        response = request_client.post(url, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        log_outbound_request(
            logger,
            provider=provider_label,
            method="POST",
            url=url,
            status_code=getattr(getattr(exc, "response", None), "status_code", None),
            duration_ms=(perf_counter() - started_at) * 1000,
            error=exc.__class__.__name__,
        )
        raise ValueError(f"{provider_label} request failed: {exc}") from exc
    finally:
        if owns_client:
            request_client.close()

    if response.is_error:
        detail = _extract_provider_error_message(provider_label, response)
        log_outbound_request(
            logger,
            provider=provider_label,
            method="POST",
            url=url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error=detail,
        )
        raise ValueError(detail)

    log_outbound_request(
        logger,
        provider=provider_label,
        method="POST",
        url=url,
        status_code=response.status_code,
        duration_ms=(perf_counter() - started_at) * 1000,
    )
    return cast(dict[str, Any], response.json())


def _extract_provider_error_message(provider_label: str, response: httpx.Response) -> str:
    default_message = f"{provider_label} request failed with status {response.status_code}."
    try:
        payload = response.json()
    except ValueError:
        payload = None

    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()
        detail = payload.get("detail")
        if isinstance(detail, str) and detail.strip():
            return detail.strip()
    return default_message
