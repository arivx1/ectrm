from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from time import perf_counter
from typing import Any, cast

import httpx
from pydantic import ValidationError

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request
from apps.api.app.schemas.external_data import (
    MarketNewsTaggingImpactIn,
    MarketNewsTaggingItemOut,
    MarketNewsTaggingLocationIn,
    MarketNewsTaggingRequest,
)

MARKET_NEWS_AI_PROVIDER_LABEL = "MARKET_NEWS_AI"
VALID_MARKET_NEWS_AI_PROVIDERS = ("openai", "anthropic")
MARKET_NEWS_AI_PROVIDER_LABELS = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
}
MARKET_NEWS_AI_SETUP_ENV_VARS = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}
VALID_MARKET_NEWS_DIRECTIONS = frozenset({"up", "down", "neutral"})
VALID_MARKET_NEWS_HORIZONS = frozenset(
    {"immediate", "near_term", "mid_term", "long_term", "very_long_term"}
)
VALID_MARKET_NEWS_LOCATION_SCOPES = frozenset(
    {"region", "country", "state", "province", "territory", "city", "unspecified"}
)

MARKET_NEWS_AI_TAGGING_INSTRUCTIONS = """\
You classify commodity-market news headlines for ECTRM users.

Principle: deterministic first, AI second. Each item includes deterministic tags.
Keep those tags unless the headline provides a clear commodity-market signal that
changes or completes them.

Return JSON only with this shape:
{"items":[{"id":"...","supply":{"direction":"up|down|neutral","horizon":"immediate|near_term|mid_term|long_term|very_long_term","confidence":0.0,"rationale":"..."},"demand":{"direction":"up|down|neutral","horizon":"immediate|near_term|mid_term|long_term|very_long_term","confidence":0.0,"rationale":"..."},"market_location":{"label":"...","scope":"region|country|state|province|territory|city|unspecified","confidence":0.0,"rationale":"..."}}]}

Rules:
- Supply means physical availability, production, output, capacity, inventories,
  exports, shipments, harvest, herd, or disruptions to those flows.
- Demand means consumption, imports, buying, load, orders, or industrial/consumer
  use.
- Do not infer supply or demand from a price, futures, stock, share, or revenue
  move by itself. Use neutral unless a physical supply or demand driver is named.
- "Output hits record", "production rises", "inventories build", "exports expand",
  and "more cattle/livestock" are supply up.
- Outages, disease, drought, dry spells, strikes, sanctions, blocked exports,
  damaged infrastructure, or supply risks are supply down.
- If the headline names a country, region, state, province, territory, or city,
  tag that market location. Otherwise keep Unspecified.
- If an effect is neutral, keep a valid horizon anyway; the UI hides it.
- Immediate is for current/spot events and active disruptions. Near term is for
  current supply/demand conditions. Mid term is seasonal, quarterly, or annual.
  Long term is investments, projects, facilities, and capacity buildout. Very
  long term is multi-year, climate, transition, or decade-scale effects.
"""

logger = get_logger(__name__)


async def build_market_news_ai_tags(request: MarketNewsTaggingRequest) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc)
    provider = _resolve_market_news_ai_provider()
    provider_label = MARKET_NEWS_AI_PROVIDER_LABELS[provider]
    model = _resolve_market_news_ai_model(provider)
    warnings: list[str] = []

    if not settings.MARKET_NEWS_AI_TAGGING_ENABLED:
        return _empty_response(generated_at, provider, model, ["Market news AI tagging is disabled."])

    if not _market_news_ai_api_key(provider):
        return _empty_response(
            generated_at,
            provider,
            model,
            [f"{MARKET_NEWS_AI_SETUP_ENV_VARS[provider]} is not configured."],
        )

    if not model:
        return _empty_response(
            generated_at,
            provider,
            model,
            [f"No {provider_label} model is configured for market news tagging."],
        )

    if provider == "anthropic":
        response_payload = await _post_anthropic_tagging_request(
            request=_build_anthropic_request_payload(model=model, request=request),
            warnings=warnings,
        )
        response_text = _extract_anthropic_text(response_payload.get("content", [])) if response_payload else ""
    else:
        response_payload = await _post_openai_tagging_request(
            request=_build_openai_request_payload(model=model, request=request),
            warnings=warnings,
        )
        response_text = _extract_openai_text(response_payload) if response_payload else ""

    if response_payload is None:
        return _empty_response(generated_at, provider, model, warnings)

    if not response_text:
        warnings.append(f"{provider_label} did not return market news tagging text.")
        return _empty_response(generated_at, provider, model, warnings)

    raw_payload = _parse_json_object(response_text, warnings, provider_label=provider_label)
    if raw_payload is None:
        return _empty_response(generated_at, provider, model, warnings)

    items = _validate_model_items(raw_payload, request, warnings, provider_label=provider_label)
    return {
        "generated_at": generated_at,
        "provider": provider,
        "model": model,
        "items": items,
        "warnings": warnings,
    }


def _empty_response(
    generated_at: datetime,
    provider: str,
    model: str | None,
    warnings: list[str],
) -> dict[str, Any]:
    return {
        "generated_at": generated_at,
        "provider": provider,
        "model": model or None,
        "items": [],
        "warnings": warnings,
    }


def _resolve_market_news_ai_provider() -> str:
    normalized = settings.MARKET_NEWS_AI_TAGGING_PROVIDER.strip().lower()
    return normalized if normalized in VALID_MARKET_NEWS_AI_PROVIDERS else "openai"


def _resolve_market_news_ai_model(provider: str) -> str:
    configured_model = settings.MARKET_NEWS_AI_TAGGING_MODEL.strip()
    if configured_model:
        return configured_model
    if provider == "anthropic":
        return settings.ANTHROPIC_MODEL.strip()
    return settings.OPENAI_MODEL.strip()


def _market_news_ai_api_key(provider: str) -> str:
    if provider == "anthropic":
        return settings.ANTHROPIC_API_KEY.strip()
    return settings.OPENAI_API_KEY.strip()


def _market_news_tagging_input_payload(request: MarketNewsTaggingRequest) -> dict[str, Any]:
    return {
        "commodity": request.commodity,
        "items": [
            {
                "id": item.id,
                "title": item.title,
                "source": item.source,
                "published_at": item.published_at.isoformat() if item.published_at else None,
                "deterministic": item.deterministic.model_dump(mode="json"),
            }
            for item in request.items
        ],
    }


def _build_openai_request_payload(
    *,
    model: str,
    request: MarketNewsTaggingRequest,
) -> dict[str, Any]:
    return {
        "model": model,
        "instructions": MARKET_NEWS_AI_TAGGING_INSTRUCTIONS,
        "max_output_tokens": settings.MARKET_NEWS_AI_TAGGING_MAX_OUTPUT_TOKENS,
        "text": {"format": {"type": "text"}},
        "input": [
            {
                "role": "user",
                "content": json.dumps(_market_news_tagging_input_payload(request), separators=(",", ":")),
            }
        ],
    }


def _build_anthropic_request_payload(
    *,
    model: str,
    request: MarketNewsTaggingRequest,
) -> dict[str, Any]:
    return {
        "model": model,
        "max_tokens": settings.MARKET_NEWS_AI_TAGGING_MAX_OUTPUT_TOKENS,
        "system": MARKET_NEWS_AI_TAGGING_INSTRUCTIONS,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(_market_news_tagging_input_payload(request), separators=(",", ":")),
                    }
                ],
            }
        ],
    }


async def _post_openai_tagging_request(
    *,
    request: dict[str, Any],
    warnings: list[str],
) -> dict[str, Any] | None:
    url = f"{settings.OPENAI_BASE_URL.rstrip('/')}/responses"
    started_at = perf_counter()
    try:
        async with httpx.AsyncClient(timeout=settings.MARKET_NEWS_AI_TAGGING_TIMEOUT_SECONDS) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY.strip()}",
                    "Content-Type": "application/json",
                },
                json=request,
            )
    except httpx.HTTPError as exc:
        log_outbound_request(
            logger,
            provider=MARKET_NEWS_AI_PROVIDER_LABEL,
            method="POST",
            url=url,
            status_code=getattr(getattr(exc, "response", None), "status_code", None),
            duration_ms=(perf_counter() - started_at) * 1000,
            error=exc.__class__.__name__,
        )
        warnings.append(f"OpenAI market news tagging request failed: {exc}")
        return None

    if response.is_error:
        detail = _extract_provider_error_message(response, provider_label="OpenAI")
        log_outbound_request(
            logger,
            provider=MARKET_NEWS_AI_PROVIDER_LABEL,
            method="POST",
            url=url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error=detail,
        )
        warnings.append(detail)
        return None

    log_outbound_request(
        logger,
        provider=MARKET_NEWS_AI_PROVIDER_LABEL,
        method="POST",
        url=url,
        status_code=response.status_code,
        duration_ms=(perf_counter() - started_at) * 1000,
    )
    try:
        return cast(dict[str, Any], response.json())
    except ValueError:
        warnings.append("OpenAI market news tagging response was not valid JSON.")
        return None


async def _post_anthropic_tagging_request(
    *,
    request: dict[str, Any],
    warnings: list[str],
) -> dict[str, Any] | None:
    url = f"{settings.ANTHROPIC_BASE_URL.rstrip('/')}/v1/messages"
    started_at = perf_counter()
    try:
        async with httpx.AsyncClient(timeout=settings.MARKET_NEWS_AI_TAGGING_TIMEOUT_SECONDS) as client:
            response = await client.post(
                url,
                headers={
                    "x-api-key": settings.ANTHROPIC_API_KEY.strip(),
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=request,
            )
    except httpx.HTTPError as exc:
        log_outbound_request(
            logger,
            provider=MARKET_NEWS_AI_PROVIDER_LABEL,
            method="POST",
            url=url,
            status_code=getattr(getattr(exc, "response", None), "status_code", None),
            duration_ms=(perf_counter() - started_at) * 1000,
            error=exc.__class__.__name__,
        )
        warnings.append(f"Anthropic market news tagging request failed: {exc}")
        return None

    if response.is_error:
        detail = _extract_provider_error_message(response, provider_label="Anthropic")
        log_outbound_request(
            logger,
            provider=MARKET_NEWS_AI_PROVIDER_LABEL,
            method="POST",
            url=url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error=detail,
        )
        warnings.append(detail)
        return None

    log_outbound_request(
        logger,
        provider=MARKET_NEWS_AI_PROVIDER_LABEL,
        method="POST",
        url=url,
        status_code=response.status_code,
        duration_ms=(perf_counter() - started_at) * 1000,
    )
    try:
        return cast(dict[str, Any], response.json())
    except ValueError:
        warnings.append("Anthropic market news tagging response was not valid JSON.")
        return None


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


def _extract_anthropic_text(content_blocks: Any) -> str:
    return "\n".join(
        block.get("text", "").strip()
        for block in content_blocks
        if isinstance(block, dict) and block.get("type") == "text" and block.get("text")
    ).strip()


def _extract_provider_error_message(response: httpx.Response, *, provider_label: str) -> str:
    default_message = f"{provider_label} market news tagging failed with status {response.status_code}."
    try:
        payload = response.json()
    except ValueError:
        return response.text.strip() or default_message

    error = payload.get("error")
    if isinstance(error, dict):
        message = error.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()
    if isinstance(error, str) and error.strip():
        return error.strip()
    return default_message


def _parse_json_object(value: str, warnings: list[str], *, provider_label: str) -> dict[str, Any] | None:
    normalized = value.strip()
    fenced_match = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", normalized, flags=re.DOTALL | re.IGNORECASE)
    if fenced_match:
        normalized = fenced_match.group(1).strip()

    try:
        payload = json.loads(normalized)
    except json.JSONDecodeError as exc:
        warnings.append(f"{provider_label} market news tagging output was not valid JSON: {exc.msg}.")
        return None

    if not isinstance(payload, dict):
        warnings.append(f"{provider_label} market news tagging output must be a JSON object.")
        return None
    return payload


def _validate_model_items(
    payload: dict[str, Any],
    request: MarketNewsTaggingRequest,
    warnings: list[str],
    *,
    provider_label: str,
) -> list[dict[str, Any]]:
    raw_items = payload.get("items")
    if not isinstance(raw_items, list):
        warnings.append(f"{provider_label} market news tagging output did not include an items list.")
        return []

    requested_items = {item.id: item for item in request.items}
    tagged_items: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for raw_item in raw_items:
        normalized_item = _normalize_model_item(raw_item, requested_items, warnings, provider_label=provider_label)
        if normalized_item is None:
            continue
        item_id = normalized_item["id"]
        if item_id in seen_ids:
            warnings.append(f"{provider_label} returned duplicate market news tag id {item_id!r}.")
            continue
        seen_ids.add(item_id)
        tagged_items.append(normalized_item)

    return tagged_items


def _normalize_model_item(
    raw_item: Any,
    requested_items: dict[str, Any],
    warnings: list[str],
    *,
    provider_label: str,
) -> dict[str, Any] | None:
    if not isinstance(raw_item, dict):
        warnings.append(f"{provider_label} returned a non-object market news tag item.")
        return None

    item_id = raw_item.get("id")
    if not isinstance(item_id, str) or item_id not in requested_items:
        warnings.append(f"{provider_label} returned a market news tag for an unknown headline.")
        return None

    baseline = requested_items[item_id].deterministic
    supply = _normalize_impact(
        raw_item.get("supply"),
        baseline.supply,
        "supply",
        item_id,
        warnings,
        provider_label=provider_label,
    )
    demand = _normalize_impact(
        raw_item.get("demand"),
        baseline.demand,
        "demand",
        item_id,
        warnings,
        provider_label=provider_label,
    )
    market_location = _normalize_location(
        raw_item.get("market_location"),
        baseline.market_location,
        item_id,
        warnings,
        provider_label=provider_label,
    )
    if supply is None or demand is None or market_location is None:
        return None

    try:
        return MarketNewsTaggingItemOut.model_validate(
            {
                "id": item_id,
                "supply": supply,
                "demand": demand,
                "market_location": market_location,
            }
        ).model_dump(mode="json")
    except ValidationError as exc:
        warnings.append(f"{provider_label} returned invalid market news tags for {item_id!r}: {exc.errors()[0]['msg']}.")
        return None


def _normalize_impact(
    raw_impact: Any,
    baseline: MarketNewsTaggingImpactIn,
    axis: str,
    item_id: str,
    warnings: list[str],
    *,
    provider_label: str,
) -> dict[str, Any] | None:
    if not isinstance(raw_impact, dict):
        warnings.append(f"{provider_label} omitted {axis} impact for market news tag {item_id!r}.")
        return None

    direction = _normalize_enum(raw_impact.get("direction"), VALID_MARKET_NEWS_DIRECTIONS)
    if direction is None:
        warnings.append(f"{provider_label} returned an invalid {axis} direction for market news tag {item_id!r}.")
        return None

    horizon = _normalize_enum(raw_impact.get("horizon"), VALID_MARKET_NEWS_HORIZONS)
    if horizon is None:
        horizon = baseline.horizon

    return {
        "direction": direction,
        "horizon": horizon,
        "confidence": _coerce_confidence(raw_impact.get("confidence")),
        "rationale": _normalize_optional_text(raw_impact.get("rationale"), max_length=240),
        "source": "ai",
    }


def _normalize_location(
    raw_location: Any,
    baseline: MarketNewsTaggingLocationIn,
    item_id: str,
    warnings: list[str],
    *,
    provider_label: str,
) -> dict[str, Any] | None:
    if not isinstance(raw_location, dict):
        warnings.append(f"{provider_label} omitted market location for market news tag {item_id!r}.")
        return None

    label = _normalize_optional_text(raw_location.get("label"), max_length=120)
    scope = _normalize_enum(raw_location.get("scope"), VALID_MARKET_NEWS_LOCATION_SCOPES)
    if label is None:
        label = baseline.label
    if scope is None:
        scope = baseline.scope
    if scope == "unspecified":
        label = "Unspecified"

    return {
        "label": label,
        "scope": scope,
        "confidence": _coerce_confidence(raw_location.get("confidence")),
        "rationale": _normalize_optional_text(raw_location.get("rationale"), max_length=240),
        "source": "ai",
    }


def _normalize_enum(value: Any, allowed_values: frozenset[str]) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    return normalized if normalized in allowed_values else None


def _coerce_confidence(value: Any) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return 0.5
    return max(0.0, min(confidence, 1.0))


def _normalize_optional_text(value: Any, *, max_length: int) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = re.sub(r"\s+", " ", value).strip()
    if not normalized:
        return None
    return normalized[:max_length]
