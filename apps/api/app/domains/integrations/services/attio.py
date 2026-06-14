from __future__ import annotations

import re
from dataclasses import dataclass
from time import perf_counter
from typing import Any, Callable, Iterable

import httpx

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request
from apps.api.app.schemas.integration import (
    AttioClientContactOut,
    AttioClientDealOut,
    AttioClientEnrichmentOut,
    AttioClientMatchedRecordOut,
    AttioClientSyncOut,
    AttioClientType,
    AttioConnectionTestOut,
    AttioObjectSummaryOut,
    AttioRuntimeSettingsOut,
    AttioSyncedClientOut,
)

logger = get_logger(__name__)

ATTIO_DEFAULT_BASE_URL = "https://api.attio.com/v2"
ATTIO_REQUIRED_SCOPES = ("object_configuration:read", "record_permission:read")
ATTIO_CLIENT_CONTACT_LIMIT = 6
ATTIO_CLIENT_DEAL_LIMIT = 6
ATTIO_CLIENT_SYNC_PAGE_SIZE = 100
ATTIO_CLIENT_SYNC_DEFAULT_LIMIT = 200
ATTIO_DISQUALIFIED_STATUS_TOKENS = (
    "disqualified",
    "non customer",
    "non-customer",
    "not customer",
    "not a customer",
)
ATTIO_DEAL_DISQUALIFICATION_REASON_ATTRIBUTES = (
    "disqualification_reason",
    "disqualified_reason",
    "disqualify_reason",
    "reason_for_disqualification",
    "disqualification_notes",
    "why_disqualified",
)


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
    client_sync_limit: int = ATTIO_CLIENT_SYNC_DEFAULT_LIMIT


@dataclass(frozen=True)
class AttioDealCategoryCounts:
    disqualified: int = 0
    lost: int = 0
    on_hold: int = 0


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
        client_sync_limit=config.client_sync_limit,
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
        deals = _query_attio_company_deals(attio_client, company.record_id, warnings)
        if not deals:
            warnings.append("Attio company matched, but no related deal records were available.")
            return AttioClientEnrichmentOut(
                client_name=normalized_client_name,
                matched=False,
                match_basis=match_basis,
                required_scopes=list(ATTIO_REQUIRED_SCOPES),
                warnings=warnings,
            )
        contacts = _query_attio_company_contacts(attio_client, company.record_id, warnings)

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


def build_attio_client_sync(
    *,
    limit: int | None = None,
    client_names: list[str] | None = None,
    excluded_client_names: list[str] | None = None,
    client: AttioClient | None = None,
) -> AttioClientSyncOut:
    config = _require_attio_configured()
    requested_limit = _attio_client_sync_limit(limit, config.client_sync_limit)
    sync_client_names = _attio_client_sync_client_names(client_names)
    excluded_client_name_keys = {
        _casefold(client_name) for client_name in _attio_client_sync_client_names(excluded_client_names)
    }
    if sync_client_names:
        requested_limit = min(requested_limit, len(sync_client_names))
        sync_client_names = sync_client_names[:requested_limit]
    attio_client = client or AttioClient(config)
    unmatched_client_name_count = 0
    invalid_deal_reference_count = 0
    company_lookup_failure_count = 0
    invalid_record_count = 0
    excluded_client_count = 0
    if sync_client_names:
        records, unmatched_client_name_count = _query_attio_company_sync_records_for_client_names(
            attio_client,
            sync_client_names,
        )
        scanned_record_count = len(sync_client_names)
        clients: list[AttioSyncedClientOut] = []
    else:
        (
            clients,
            scanned_record_count,
            invalid_deal_reference_count,
            company_lookup_failure_count,
            invalid_record_count,
            excluded_client_count,
        ) = _query_attio_deal_backed_synced_clients(
            attio_client,
            requested_limit,
            excluded_client_name_keys,
        )
    warnings: list[str] = []
    deal_lookup_failure_count = 0
    no_deal_record_count = 0
    if sync_client_names:
        for record in records:
            try:
                synced_client = _attio_synced_client_from_record(record)
            except AttioIntegrationError:
                invalid_record_count += 1
                continue
            deals = _attio_company_sync_deals(attio_client, synced_client.record_id)
            if deals is None:
                deal_lookup_failure_count += 1
                continue
            if not deals:
                no_deal_record_count += 1
                continue
            synced_client = _attio_synced_client_from_record(record, deals=deals)
            if _casefold(synced_client.name) in excluded_client_name_keys:
                excluded_client_count += 1
                continue
            clients.append(synced_client)

    skipped_record_count = (
        invalid_record_count
        + deal_lookup_failure_count
        + no_deal_record_count
        + invalid_deal_reference_count
        + company_lookup_failure_count
        + excluded_client_count
    )
    if invalid_deal_reference_count:
        warnings.append(
            f"Skipped {invalid_deal_reference_count} Attio deal records without associated company references."
        )
    if company_lookup_failure_count:
        warnings.append(f"Skipped {company_lookup_failure_count} deal-backed Attio companies that could not be loaded.")
    if invalid_record_count:
        warnings.append(f"Skipped {invalid_record_count} Attio company records without usable names or record ids.")
    if deal_lookup_failure_count:
        warnings.append(f"Skipped {deal_lookup_failure_count} Attio company records because deals could not be checked.")
    if no_deal_record_count:
        warnings.append(f"Skipped {no_deal_record_count} Attio company records without related deal records.")
    if excluded_client_count:
        warnings.append(f"Skipped {excluded_client_count} Attio companies already present in Nexus or pending propositions.")
    if unmatched_client_name_count:
        warnings.append(f"No Attio company match found for {unmatched_client_name_count} existing Nexus client names.")
    if not clients:
        warnings.append("Attio returned no new deal-backed company records to propose.")

    return AttioClientSyncOut(
        requested_limit=requested_limit,
        scanned_record_count=scanned_record_count,
        skipped_record_count=skipped_record_count,
        returned_client_count=len(clients),
        clients=clients,
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
        client_sync_limit=settings.ATTIO_CLIENT_SYNC_LIMIT,
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
        disqualification_reason=_extract_text(values, ATTIO_DEAL_DISQUALIFICATION_REASON_ATTRIBUTES),
        web_url=_optional_text(record.get("web_url")),
    )


def _query_attio_company_sync_records(client: AttioClient, requested_limit: int) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    offset = 0
    while len(records) < requested_limit:
        remaining = requested_limit - len(records)
        page_limit = min(ATTIO_CLIENT_SYNC_PAGE_SIZE, remaining)
        page = client.query_records(
            "companies",
            {
                "limit": page_limit,
                "offset": offset,
            },
        )
        records.extend(page)
        if len(page) < page_limit:
            break
        offset += len(page)
    return records


def _query_attio_deal_backed_synced_clients(
    client: AttioClient,
    requested_limit: int,
    excluded_client_name_keys: set[str],
) -> tuple[list[AttioSyncedClientOut], int, int, int, int, int]:
    clients_by_company_record_key: dict[str, AttioSyncedClientOut] = {}
    company_records_by_key: dict[str, dict[str, Any]] = {}
    deal_statuses_by_company_record_key: dict[str, list[str | None]] = {}
    deals_by_company_record_key: dict[str, list[AttioClientDealOut]] = {}
    seen_client_name_keys: set[str] = set()
    scanned_deal_record_count = 0
    invalid_deal_reference_count = 0
    company_lookup_failure_count = 0
    invalid_record_count = 0
    excluded_client_count = 0
    offset = 0
    while True:
        page = client.query_records(
            "deals",
            {
                "limit": ATTIO_CLIENT_SYNC_PAGE_SIZE,
                "offset": offset,
            },
        )
        if not page:
            break

        scanned_deal_record_count += len(page)
        for deal_record in page:
            deal_company_record_ids = _attio_company_record_ids_from_deal_record(deal_record)
            if not deal_company_record_ids:
                invalid_deal_reference_count += 1
                continue

            deal = _attio_deal_from_record(deal_record)
            deal_status = deal.stage if deal is not None else _attio_deal_status_from_record(deal_record)
            for company_record_id in deal_company_record_ids:
                company_record_key = _casefold(company_record_id)
                deal_statuses = deal_statuses_by_company_record_key.setdefault(company_record_key, [])
                deal_statuses.append(deal_status)
                deals = deals_by_company_record_key.setdefault(company_record_key, [])
                if deal is not None:
                    deals.append(deal)
                company_record = company_records_by_key.get(company_record_key)
                if company_record is not None:
                    existing_client = clients_by_company_record_key.get(company_record_key)
                    if existing_client is not None:
                        clients_by_company_record_key[company_record_key] = _attio_synced_client_from_record(
                            company_record,
                            deal_statuses=deal_statuses,
                            deals=deals,
                        )
                    continue
                try:
                    company_record = client.get_record("companies", company_record_id)
                except AttioIntegrationError:
                    company_lookup_failure_count += 1
                    continue
                company_records_by_key[company_record_key] = company_record
                try:
                    synced_client = _attio_synced_client_from_record(
                        company_record,
                        deal_statuses=deal_statuses,
                        deals=deals,
                    )
                except AttioIntegrationError:
                    invalid_record_count += 1
                    continue
                client_name_key = _casefold(synced_client.name)
                if client_name_key in seen_client_name_keys:
                    continue
                if client_name_key in excluded_client_name_keys:
                    excluded_client_count += 1
                    continue
                seen_client_name_keys.add(client_name_key)
                clients_by_company_record_key[company_record_key] = synced_client

        if len(page) < ATTIO_CLIENT_SYNC_PAGE_SIZE:
            break
        if len(_attio_priority_sorted_synced_clients(clients_by_company_record_key.values())) >= requested_limit:
            break
        offset += len(page)

    clients = _attio_priority_sorted_synced_clients(clients_by_company_record_key.values())[:requested_limit]

    return (
        clients,
        scanned_deal_record_count,
        invalid_deal_reference_count,
        company_lookup_failure_count,
        invalid_record_count,
        excluded_client_count,
    )


def _query_attio_company_sync_records_for_client_names(
    client: AttioClient,
    client_names: list[str],
) -> tuple[list[dict[str, Any]], int]:
    records: list[dict[str, Any]] = []
    unmatched_client_name_count = 0
    seen_record_ids: set[str] = set()
    for client_name in client_names:
        matches = client.query_records(
            "companies",
            {
                "filter": {"name": client_name},
                "limit": 5,
                "offset": 0,
            },
        )
        if not matches:
            unmatched_client_name_count += 1
            continue

        record = _best_company_match(matches, client_name)
        record_id = _record_id(record)
        if record_id:
            record_key = _casefold(record_id)
            if record_key in seen_record_ids:
                continue
            seen_record_ids.add(record_key)
        records.append(record)
    return records, unmatched_client_name_count


def _attio_company_sync_deals(client: AttioClient, company_record_id: str) -> list[AttioClientDealOut] | None:
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
        return None

    deals: list[AttioClientDealOut] = []
    for record in records:
        deal = _attio_deal_from_record(record)
        if deal is not None:
            deals.append(deal)
    return deals


def _attio_synced_client_from_record(
    record: dict[str, Any],
    *,
    deal_statuses: list[str | None] | None = None,
    deals: list[AttioClientDealOut] | None = None,
) -> AttioSyncedClientOut:
    company = _attio_company_from_record(record, fallback_label="Attio company")
    name = _attio_sync_company_name(company.label, company.domains)
    deal_summaries = deals or []
    raw_deal_statuses = list(deal_statuses if deal_statuses is not None else [deal.stage for deal in deal_summaries])
    normalized_deal_statuses = _normalize_attio_deal_statuses(raw_deal_statuses)
    category_counts = _count_attio_deal_categories(raw_deal_statuses)
    client_type, status = _attio_type_and_status_from_evidence(
        company.status,
        normalized_deal_statuses,
    )
    return AttioSyncedClientOut(
        record_id=company.record_id,
        name=name,
        type=client_type,
        relationship=client_type,
        deal_count=len(deal_summaries),
        closed_deal_count=_count_attio_closed_deals(deal_summaries),
        open_deal_count=_count_attio_open_deals(deal_summaries),
        deal_statuses=normalized_deal_statuses,
        disqualified_deal_count=category_counts.disqualified,
        lost_deal_count=category_counts.lost,
        on_hold_deal_count=category_counts.on_hold,
        disqualification_reason=_format_attio_disqualification_reason(deal_summaries),
        total_arr=_format_attio_total_arr(deal_summaries),
        closed_arr=_format_attio_arr_for_deals(deal_summaries, _attio_deal_is_closed_won),
        open_arr=_format_attio_arr_for_deals(deal_summaries, _attio_deal_is_open),
        web_url=company.web_url,
        domains=company.domains,
        description=company.description,
        status=status,
    )


def _normalize_attio_deal_statuses(statuses: Iterable[str | None]) -> list[str]:
    normalized_statuses: list[str] = []
    seen_statuses: set[str] = set()
    for status in statuses:
        normalized_status = _optional_text(status)
        if not normalized_status:
            continue
        status_key = _casefold(normalized_status)
        if status_key in seen_statuses:
            continue
        normalized_statuses.append(normalized_status)
        seen_statuses.add(status_key)
    return normalized_statuses


def _count_attio_deal_categories(statuses: Iterable[str | None]) -> AttioDealCategoryCounts:
    disqualified_count = 0
    lost_count = 0
    on_hold_count = 0
    for status in statuses:
        normalized_status = _casefold(_optional_text(status) or "")
        if not normalized_status:
            continue
        if _attio_status_matches_any(normalized_status, ATTIO_DISQUALIFIED_STATUS_TOKENS):
            disqualified_count += 1
        if _attio_status_matches_any(normalized_status, ("closed lost", "lost")):
            lost_count += 1
        if _attio_status_matches_any(normalized_status, ("on hold", "on-hold", "hold")):
            on_hold_count += 1
    return AttioDealCategoryCounts(
        disqualified=disqualified_count,
        lost=lost_count,
        on_hold=on_hold_count,
    )


def _attio_status_matches_any(status: str, tokens: tuple[str, ...]) -> bool:
    return any(token in status for token in tokens)


def _attio_deal_stage(deal: AttioClientDealOut) -> str:
    return _casefold(_optional_text(deal.stage) or "")


def _attio_deal_is_closed_won(deal: AttioClientDealOut) -> bool:
    return _attio_status_matches_any(_attio_deal_stage(deal), ("closed won", "won"))


def _attio_deal_is_disqualified(deal: AttioClientDealOut) -> bool:
    return _attio_status_matches_any(_attio_deal_stage(deal), ATTIO_DISQUALIFIED_STATUS_TOKENS)


def _attio_deal_is_lost(deal: AttioClientDealOut) -> bool:
    return _attio_status_matches_any(_attio_deal_stage(deal), ("closed lost", "lost"))


def _attio_deal_is_on_hold(deal: AttioClientDealOut) -> bool:
    return _attio_status_matches_any(_attio_deal_stage(deal), ("on hold", "on-hold", "hold"))


def _attio_deal_is_open(deal: AttioClientDealOut) -> bool:
    stage = _attio_deal_stage(deal)
    return bool(stage) and not (
        _attio_deal_is_closed_won(deal)
        or _attio_deal_is_disqualified(deal)
        or _attio_deal_is_lost(deal)
        or _attio_deal_is_on_hold(deal)
    )


def _count_attio_closed_deals(deals: list[AttioClientDealOut]) -> int:
    return sum(1 for deal in deals if _attio_deal_is_closed_won(deal))


def _count_attio_open_deals(deals: list[AttioClientDealOut]) -> int:
    return sum(1 for deal in deals if _attio_deal_is_open(deal))


def _format_attio_total_arr(deals: list[AttioClientDealOut]) -> str | None:
    return _format_attio_arr_for_deals(deals)


def _format_attio_arr_for_deals(
    deals: list[AttioClientDealOut],
    include_deal: Callable[[AttioClientDealOut], bool] | None = None,
) -> str | None:
    total_arr = sum(
        parsed_value
        for deal in deals
        if include_deal is None or include_deal(deal)
        for parsed_value in [_parse_attio_arr_value(deal.value)]
        if parsed_value is not None
    )
    if total_arr <= 0:
        return None
    if total_arr.is_integer():
        return f"${int(total_arr):,}"
    return f"${total_arr:,.2f}"


def _format_attio_disqualification_reason(deals: list[AttioClientDealOut]) -> str | None:
    reasons: list[str] = []
    seen_reasons: set[str] = set()
    for deal in deals:
        reason = _optional_text(deal.disqualification_reason)
        if not reason:
            continue
        normalized_stage = _casefold(_optional_text(deal.stage) or "")
        if normalized_stage and not _attio_status_matches_any(normalized_stage, ATTIO_DISQUALIFIED_STATUS_TOKENS):
            continue
        reason_key = _casefold(reason)
        if reason_key in seen_reasons:
            continue
        reasons.append(reason)
        seen_reasons.add(reason_key)
    return "; ".join(reasons) if reasons else None


def _parse_attio_arr_value(value: str | None) -> float | None:
    text = _optional_text(value)
    if not text:
        return None
    match = re.search(r"-?\d[\d,]*(?:\.\d+)?", text)
    if not match:
        return None
    try:
        parsed = float(match.group(0).replace(",", ""))
    except ValueError:
        return None
    return parsed if parsed > 0 else None


def _attio_type_from_status(status: str | None) -> AttioClientType:
    client_type, _status = _attio_type_and_status_from_evidence(status, [])
    return client_type


def _attio_type_and_status_from_evidence(
    company_status: str | None,
    deal_statuses: list[str | None],
) -> tuple[AttioClientType, str | None]:
    normalized_company_status = _optional_text(company_status)
    normalized_deal_statuses = [status for status in (_optional_text(status) for status in deal_statuses) if status]

    company_type = _attio_type_from_company_status(normalized_company_status)
    if company_type != "Other":
        return company_type, normalized_company_status

    deal_type, deal_status = _attio_type_from_deal_statuses(normalized_deal_statuses)
    if deal_type != "Other":
        return deal_type, deal_status

    return "Other", normalized_company_status or (normalized_deal_statuses[0] if normalized_deal_statuses else None)


def _attio_type_from_company_status(status: str | None) -> AttioClientType:
    status_text = _optional_text(status)
    if not status_text:
        return "Other"

    normalized_status = _casefold(status_text)
    if any(token in normalized_status for token in ATTIO_DISQUALIFIED_STATUS_TOKENS):
        return "Other"
    if any(token in normalized_status for token in ("former", "past", "churn", "inactive", "lost")):
        return "Churned"
    if any(
        token in normalized_status
        for token in (
            "prospect",
            "lead",
            "opportunit",
            "qualified",
            "attempting",
            "contact",
            "re-engage",
            "hold",
            "later",
            "met with",
        )
    ):
        return "Prospect"
    if any(token in normalized_status for token in ("customer", "client", "active", "current", "won")):
        return "Client"
    return "Other"


def _attio_type_from_deal_statuses(statuses: list[str]) -> tuple[AttioClientType, str | None]:
    for status in statuses:
        normalized_status = _casefold(status)
        if any(token in normalized_status for token in ("closed won", "won")):
            return "Client", status

    for status in statuses:
        normalized_status = _casefold(status)
        if any(
            token in normalized_status
            for token in (
                "prospect",
                "lead",
                "opportunit",
                "qualified",
                "qualification",
                "evaluation",
                "sqo",
                "demo",
                "proposal",
                "discovery",
                "pilot",
                "negotiat",
                "attempting",
                "contact",
                "met with",
                "on hold",
                "on-hold",
                "hold",
            )
        ):
            return "Prospect", status

    return "Other", statuses[0] if statuses else None


def _attio_priority_sorted_synced_clients(
    clients: Iterable[AttioSyncedClientOut],
) -> list[AttioSyncedClientOut]:
    return sorted(
        clients,
        key=lambda client: (
            _attio_synced_client_type_priority(client.type),
            _casefold(client.name),
        ),
    )


def _attio_synced_client_type_priority(client_type: AttioClientType) -> int:
    if client_type == "Client":
        return 0
    if client_type == "Prospect":
        return 1
    if client_type == "Churned":
        return 2
    return 3


def _attio_deal_status_from_record(record: dict[str, Any]) -> str | None:
    deal = _attio_deal_from_record(record)
    return deal.stage if deal is not None else None


def _attio_company_record_ids_from_deal_record(record: dict[str, Any]) -> list[str]:
    values = _record_values(record)
    company_record_ids: list[str] = []
    for attribute in ("associated_company", "associated_companies", "company", "companies"):
        for item in _attribute_value_items(values, attribute):
            for record_id in _attio_reference_record_ids(item, assume_company_reference=True):
                _append_unique_text(company_record_ids, record_id)
    return company_record_ids


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


def _attio_reference_record_ids(value: object, *, assume_company_reference: bool) -> list[str]:
    record_ids: list[str] = []
    if isinstance(value, list):
        for item in value:
            for record_id in _attio_reference_record_ids(
                item,
                assume_company_reference=assume_company_reference,
            ):
                _append_unique_text(record_ids, record_id)
        return record_ids
    if not isinstance(value, dict):
        return record_ids

    target_text = _first_text_for_keys(value, ("target_object", "object_slug", "object", "api_slug"))
    target_is_company = assume_company_reference or (
        target_text is not None and _casefold(target_text) in {"company", "companies"}
    )
    if target_is_company:
        for key in ("target_record_id", "record_id"):
            record_id = _optional_text(value.get(key))
            if record_id:
                _append_unique_text(record_ids, record_id)
        for key in ("target_record", "record"):
            nested_record = value.get(key)
            if isinstance(nested_record, dict):
                nested_record_id = _record_id(nested_record)
                if nested_record_id:
                    _append_unique_text(record_ids, nested_record_id)

    for nested_value in value.values():
        if isinstance(nested_value, (dict, list)):
            for record_id in _attio_reference_record_ids(
                nested_value,
                assume_company_reference=target_is_company,
            ):
                _append_unique_text(record_ids, record_id)
    return record_ids


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


def _attio_sync_company_name(label: str | None, domains: list[str]) -> str:
    normalized_label = (label or "").strip()
    if normalized_label and normalized_label != "Attio company":
        return normalized_label
    for domain in domains:
        normalized_domain = domain.strip()
        if normalized_domain:
            return normalized_domain
    raise AttioIntegrationError(502, "Attio company name was missing from the Attio response.")


def _attio_client_sync_client_names(client_names: list[str] | None) -> list[str]:
    if not client_names:
        return []

    normalized_names: list[str] = []
    seen_names: set[str] = set()
    for client_name in client_names:
        normalized_name = client_name.strip()
        if not normalized_name:
            continue
        normalized_key = _casefold(normalized_name)
        if normalized_key in seen_names:
            continue
        normalized_names.append(normalized_name)
        seen_names.add(normalized_key)
    return normalized_names


def _attio_client_sync_limit(limit: int | None, configured_limit: int) -> int:
    if limit is None:
        return max(1, min(configured_limit, 500))
    return max(1, min(limit, 500))


def _casefold(value: str) -> str:
    return value.strip().casefold()


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None
