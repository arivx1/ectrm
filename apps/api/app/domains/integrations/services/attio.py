from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
from typing import Any

import httpx

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request
from apps.api.app.schemas.integration import (
    AttioClientContactOut,
    AttioClientDealOut,
    AttioClientEnrichmentOut,
    AttioClientMatchedRecordOut,
    AttioConnectionTestOut,
    AttioObjectSummaryOut,
    AttioRuntimeSettingsOut,
)

logger = get_logger(__name__)

ATTIO_DEFAULT_BASE_URL = "https://api.attio.com/v2"
ATTIO_REQUIRED_SCOPES = ("object_configuration:read", "record_permission:read")
ATTIO_CLIENT_CONTACT_LIMIT = 6
ATTIO_CLIENT_DEAL_LIMIT = 6


class AttioIntegrationError(RuntimeError):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class AttioConfig:
    enabled: bool
    access_token: str
    base_url: str
    timeout_seconds: int
    object_limit: int


class AttioClient:
    def __init__(self, config: AttioConfig) -> None:
        self.config = config

    def list_objects(self) -> list[AttioObjectSummaryOut]:
        payload = self._get("/objects")
        data = payload.get("data")
        if not isinstance(data, list):
            raise AttioIntegrationError(502, "Attio list objects returned an unexpected response.")
        return [
            _attio_object_summary_from_payload(item)
            for item in data
            if isinstance(item, dict)
        ]

    def query_records(self, object_slug: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
        response_payload = self._post(f"/objects/{object_slug}/records/query", payload)
        data = response_payload.get("data")
        if not isinstance(data, list):
            raise AttioIntegrationError(502, f"Attio query records returned an unexpected response for {object_slug}.")
        return [item for item in data if isinstance(item, dict)]

    def search_records(self, *, query: str, objects: list[str], limit: int = 5) -> list[dict[str, Any]]:
        response_payload = self._post(
            "/objects/records/search",
            {
                "query": query,
                "objects": objects,
                "request_as": {"type": "workspace"},
                "limit": limit,
            },
        )
        data = response_payload.get("data")
        if not isinstance(data, list):
            raise AttioIntegrationError(502, "Attio search records returned an unexpected response.")
        return [item for item in data if isinstance(item, dict)]

    def get_record(self, object_slug: str, record_id: str) -> dict[str, Any]:
        payload = self._get(f"/objects/{object_slug}/records/{record_id}")
        data = payload.get("data")
        if not isinstance(data, dict):
            raise AttioIntegrationError(502, f"Attio get record returned an unexpected response for {object_slug}.")
        return data

    def _get(self, path: str) -> dict[str, Any]:
        return self._request("GET", path)

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", path, payload=payload)

    def _request(self, method: str, path: str, *, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.config.base_url.rstrip('/')}/{path.lstrip('/')}"
        headers = {"Authorization": f"Bearer {self.config.access_token}"}
        if payload is not None:
            headers["Content-Type"] = "application/json"
        started_at = perf_counter()
        try:
            with httpx.Client(timeout=self.config.timeout_seconds) as client:
                response = client.request(method, url, headers=headers, json=payload)
        except httpx.HTTPError as exc:
            log_outbound_request(
                logger,
                provider="attio-rest-api",
                method=method,
                url=url,
                status_code=getattr(getattr(exc, "response", None), "status_code", None),
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc,
            )
            raise AttioIntegrationError(502, f"Attio request failed for {path}.") from exc

        log_outbound_request(
            logger,
            provider="attio-rest-api",
            method=method,
            url=url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error=None if response.status_code < 400 else response.text,
        )

        if response.status_code >= 400:
            raise _attio_response_error(path=path, response=response)

        try:
            payload = response.json()
        except ValueError as exc:
            raise AttioIntegrationError(502, f"Attio request for {path} returned invalid JSON.") from exc
        if not isinstance(payload, dict):
            raise AttioIntegrationError(502, f"Attio request for {path} returned an unexpected response.")
        return payload


def build_attio_runtime_settings() -> AttioRuntimeSettingsOut:
    config = _attio_config()
    configured = config.enabled and bool(config.access_token)
    auth_status = "configured" if configured else "partial" if config.enabled else "none"
    missing_configuration: list[str] = []
    if not config.enabled:
        missing_configuration.append("ATTIO_ENABLED")
    if not config.access_token:
        missing_configuration.append("ATTIO_ACCESS_TOKEN or ATTIO_API_KEY")
    return AttioRuntimeSettingsOut(
        enabled=config.enabled,
        configured=configured,
        auth_status=auth_status,
        base_url=config.base_url,
        object_limit=config.object_limit,
        required_scopes=list(ATTIO_REQUIRED_SCOPES),
        missing_configuration=missing_configuration,
    )


def run_attio_connection_test(*, client: AttioClient | None = None) -> AttioConnectionTestOut:
    config = _require_attio_configured()
    attio_client = client or AttioClient(config)
    objects = attio_client.list_objects()
    returned_objects = objects[: config.object_limit]
    warnings: list[str] = []
    if not objects:
        warnings.append("Attio connected successfully but returned no object metadata.")
    return AttioConnectionTestOut(
        workspace_id=_first_workspace_id(objects),
        object_count=len(objects),
        returned_object_count=len(returned_objects),
        objects=returned_objects,
        required_scopes=list(ATTIO_REQUIRED_SCOPES),
        warnings=warnings,
    )


def build_attio_client_enrichment(
    *,
    client_name: str,
    client: AttioClient | None = None,
) -> AttioClientEnrichmentOut:
    config = _require_attio_configured()
    normalized_client_name = _required_text(client_name)
    attio_client = client or AttioClient(config)
    warnings: list[str] = []
    company_record, match_basis = _find_attio_company_record(
        client=attio_client,
        client_name=normalized_client_name,
    )
    if company_record is None:
        return AttioClientEnrichmentOut(
            client_name=normalized_client_name,
            matched=False,
            match_basis="none",
            required_scopes=list(ATTIO_REQUIRED_SCOPES),
            warnings=["No Attio company match found for this client."],
        )

    company = _attio_company_from_record(company_record, fallback_label=normalized_client_name)
    contacts: list[AttioClientContactOut] = []
    deals: list[AttioClientDealOut] = []
    if company.record_id:
        contacts = _query_attio_company_contacts(attio_client, company.record_id, warnings)
        deals = _query_attio_company_deals(attio_client, company.record_id, warnings)

    return AttioClientEnrichmentOut(
        client_name=normalized_client_name,
        matched=True,
        match_basis=match_basis,
        company=company,
        contacts=contacts,
        deals=deals,
        required_scopes=list(ATTIO_REQUIRED_SCOPES),
        warnings=warnings,
    )


def _attio_config() -> AttioConfig:
    access_token = settings.ATTIO_ACCESS_TOKEN.strip() or settings.ATTIO_API_KEY.strip()
    base_url = settings.ATTIO_BASE_URL.strip() or ATTIO_DEFAULT_BASE_URL
    return AttioConfig(
        enabled=settings.ATTIO_ENABLED,
        access_token=access_token,
        base_url=base_url.rstrip("/"),
        timeout_seconds=settings.ATTIO_TIMEOUT_SECONDS,
        object_limit=settings.ATTIO_OBJECT_LIMIT,
    )


def _require_attio_configured() -> AttioConfig:
    config = _attio_config()
    if not config.enabled:
        raise AttioIntegrationError(503, "Attio integration is disabled on this API.")
    if not config.access_token:
        raise AttioIntegrationError(
            503,
            "Attio integration needs ATTIO_ACCESS_TOKEN or ATTIO_API_KEY before it can connect.",
        )
    return config


def _attio_response_error(*, path: str, response: httpx.Response) -> AttioIntegrationError:
    if response.status_code == 429:
        retry_after = response.headers.get("Retry-After", "").strip()
        suffix = f" Retry after {retry_after}." if retry_after else ""
        return AttioIntegrationError(429, f"Attio rate limited the request for {path}.{suffix}")
    if response.status_code in {401, 403}:
        return AttioIntegrationError(
            502,
            "Attio rejected the configured credential. Confirm the token and required scopes.",
        )
    return AttioIntegrationError(
        502,
        f"Attio request for {path} failed with HTTP {response.status_code}.",
    )


def _find_attio_company_record(
    *,
    client: AttioClient,
    client_name: str,
) -> tuple[dict[str, Any] | None, str]:
    exact_matches = client.query_records(
        "companies",
        {
            "filter": {"name": client_name},
            "limit": 5,
            "offset": 0,
        },
    )
    if exact_matches:
        return _best_company_match(exact_matches, client_name), "exact_name"

    search_matches = client.search_records(query=client_name, objects=["companies"], limit=5)
    for match in search_matches:
        object_slug = _optional_text(match.get("object_slug")) or "companies"
        if object_slug != "companies":
            continue
        record_id = _record_id(match)
        if record_id:
            return client.get_record("companies", record_id), "search"

    return None, "none"


def _best_company_match(records: list[dict[str, Any]], client_name: str) -> dict[str, Any]:
    normalized_client_name = _casefold(client_name)
    for record in records:
        label = _record_label(record)
        if label and _casefold(label) == normalized_client_name:
            return record
    return records[0]


def _query_attio_company_contacts(
    client: AttioClient,
    company_record_id: str,
    warnings: list[str],
) -> list[AttioClientContactOut]:
    try:
        records = client.query_records(
            "people",
            {
                "filter": {
                    "company": {
                        "target_object": "companies",
                        "target_record_id": company_record_id,
                    }
                },
                "limit": ATTIO_CLIENT_CONTACT_LIMIT,
                "offset": 0,
            },
        )
    except AttioIntegrationError:
        warnings.append("Attio company matched, but related contacts could not be loaded.")
        return []

    contacts: list[AttioClientContactOut] = []
    for record in records:
        contact = _attio_contact_from_record(record)
        if contact is not None:
            contacts.append(contact)
    return contacts


def _query_attio_company_deals(
    client: AttioClient,
    company_record_id: str,
    warnings: list[str],
) -> list[AttioClientDealOut]:
    try:
        records = client.query_records(
            "deals",
            {
                "filter": {
                    "associated_company": {
                        "target_object": "companies",
                        "target_record_id": company_record_id,
                    }
                },
                "limit": ATTIO_CLIENT_DEAL_LIMIT,
                "offset": 0,
            },
        )
    except AttioIntegrationError:
        warnings.append("Attio company matched, but related deals could not be loaded.")
        return []

    deals: list[AttioClientDealOut] = []
    for record in records:
        deal = _attio_deal_from_record(record)
        if deal is not None:
            deals.append(deal)
    return deals


def _attio_company_from_record(
    record: dict[str, Any],
    *,
    fallback_label: str,
) -> AttioClientMatchedRecordOut:
    values = _record_values(record)
    record_id = _record_id(record)
    if not record_id:
        raise AttioIntegrationError(502, "Attio company record did not include a record id.")

    return AttioClientMatchedRecordOut(
        record_id=record_id,
        label=_record_label(record) or fallback_label,
        web_url=_optional_text(record.get("web_url")),
        domains=_extract_domains(values),
        description=_extract_text(values, ("description", "notes", "linkedin_bio")),
        status=_extract_text(
            values,
            (
                "customer_status_1746239259",
                "lead_status",
                "lead_status_8",
                "lifecycle_stage",
                "type",
            ),
        ),
    )


def _attio_contact_from_record(record: dict[str, Any]) -> AttioClientContactOut | None:
    values = _record_values(record)
    record_id = _record_id(record)
    if not record_id:
        return None
    return AttioClientContactOut(
        record_id=record_id,
        name=_extract_text(values, ("name",), preferred_keys=("full_name", "value")) or "Attio contact",
        title=_extract_text(values, ("job_title", "function_1746239194")),
        email=_extract_text(values, ("email_addresses",), preferred_keys=("email_address", "value")),
        phone=_extract_text(values, ("phone_numbers",), preferred_keys=("phone_number", "value")),
        web_url=_optional_text(record.get("web_url")),
    )


def _attio_deal_from_record(record: dict[str, Any]) -> AttioClientDealOut | None:
    values = _record_values(record)
    record_id = _record_id(record)
    if not record_id:
        return None
    return AttioClientDealOut(
        record_id=record_id,
        name=_extract_text(values, ("name",)) or "Attio deal",
        stage=_extract_text(values, ("stage", "sales_stages")),
        value=_extract_text(values, ("value", "arr_2", "arr_8")),
        close_date=_extract_text(values, ("close_date", "expected_close_month")),
        web_url=_optional_text(record.get("web_url")),
    )


def _attio_object_summary_from_payload(payload: dict[str, Any]) -> AttioObjectSummaryOut:
    id_payload = payload.get("id") if isinstance(payload.get("id"), dict) else {}
    return AttioObjectSummaryOut(
        api_slug=_optional_text(payload.get("api_slug")) or "unknown",
        singular_noun=_optional_text(payload.get("singular_noun")),
        plural_noun=_optional_text(payload.get("plural_noun")),
        workspace_id=_optional_text(id_payload.get("workspace_id")),
        object_id=_optional_text(id_payload.get("object_id")),
        created_at=_optional_text(payload.get("created_at")),
    )


def _first_workspace_id(objects: list[AttioObjectSummaryOut]) -> str | None:
    for item in objects:
        if item.workspace_id:
            return item.workspace_id
    return None


def _record_values(record: dict[str, Any]) -> dict[str, Any]:
    values = record.get("values")
    return values if isinstance(values, dict) else {}


def _record_id(record: dict[str, Any]) -> str | None:
    id_payload = record.get("id")
    if isinstance(id_payload, dict):
        record_id = _optional_text(id_payload.get("record_id"))
        if record_id:
            return record_id
    return _extract_text(_record_values(record), ("record_id",))


def _record_label(record: dict[str, Any]) -> str | None:
    values = _record_values(record)
    return (
        _optional_text(record.get("record_text"))
        or _extract_text(values, ("name", "company_name"), preferred_keys=("value", "full_name"))
    )


def _extract_domains(values: dict[str, Any]) -> list[str]:
    domains: list[str] = []
    for attribute in ("domains", "company_website"):
        for item in _attribute_value_items(values, attribute):
            for key in ("domain", "root_domain", "value"):
                candidate = _optional_text(item.get(key))
                if candidate:
                    _append_unique_text(domains, candidate)
                    break
    return domains


def _extract_text(
    values: dict[str, Any],
    attributes: tuple[str, ...],
    *,
    preferred_keys: tuple[str, ...] = (),
) -> str | None:
    for attribute in attributes:
        for item in _attribute_value_items(values, attribute):
            text = _text_from_value_item(item, preferred_keys=preferred_keys)
            if text:
                return text
    return None


def _attribute_value_items(values: dict[str, Any], attribute: str) -> list[dict[str, Any]]:
    items = values.get(attribute)
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


def _text_from_value_item(
    item: dict[str, Any],
    *,
    preferred_keys: tuple[str, ...] = (),
) -> str | None:
    for nested_key in ("status", "option"):
        nested = item.get(nested_key)
        if isinstance(nested, dict):
            nested_text = _first_text_for_keys(nested, ("title", "label", "name", "value"))
            if nested_text:
                return nested_text

    return _first_text_for_keys(
        item,
        (
            *preferred_keys,
            "value",
            "full_name",
            "email_address",
            "phone_number",
            "domain",
            "root_domain",
            "title",
            "label",
            "name",
        ),
    )


def _first_text_for_keys(payload: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    seen_keys: set[str] = set()
    for key in keys:
        if key in seen_keys:
            continue
        seen_keys.add(key)
        value = payload.get(key)
        if isinstance(value, dict):
            nested_text = _first_text_for_keys(value, ("title", "label", "name", "value"))
            if nested_text:
                return nested_text
            continue
        if isinstance(value, list):
            continue
        text = _optional_text(value)
        if text:
            return text
    return None


def _append_unique_text(values: list[str], value: str) -> None:
    if _casefold(value) not in {_casefold(existing) for existing in values}:
        values.append(value)


def _required_text(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise AttioIntegrationError(422, "client_name must not be blank.")
    return normalized


def _casefold(value: str) -> str:
    return value.strip().casefold()


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None
