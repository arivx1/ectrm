from __future__ import annotations

import enum
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.config import settings
from apps.api.app.core.auth import create_user_session, hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.domains.integrations.services import attio
from apps.api.app.domains.integrations.services.attio import (
    AttioClient,
    AttioConfig,
    AttioIntegrationError,
)
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession
from apps.api.app.schemas.integration import (
    AttioClientEnrichmentOut,
    AttioClientMatchedRecordOut,
    AttioClientSyncOut,
    AttioSyncedClientOut,
)


def _response(
    url: str,
    status_code: int,
    payload: dict[str, object],
    *,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    return httpx.Response(
        status_code,
        json=payload,
        headers=headers,
        request=httpx.Request("GET", url),
    )


class _FakeHttpxClient:
    def __init__(self, response: httpx.Response) -> None:
        self.response = response
        self.request_url: str | None = None
        self.request_headers: dict[str, str] = {}
        self.request_method: str | None = None
        self.request_json: dict[str, object] | None = None

    def __enter__(self) -> "_FakeHttpxClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def get(self, url: str, **kwargs: object) -> httpx.Response:
        return self.request("GET", url, **kwargs)

    def request(self, method: str, url: str, **kwargs: object) -> httpx.Response:
        self.request_method = method
        self.request_url = url
        headers = kwargs.get("headers")
        self.request_headers = dict(headers) if isinstance(headers, dict) else {}
        json_payload = kwargs.get("json")
        self.request_json = dict(json_payload) if isinstance(json_payload, dict) else None
        return self.response


class _FakeAttioClient:
    def __init__(self, config: AttioConfig) -> None:
        self.config = config

    def list_objects(self):
        return [
            attio.AttioObjectSummaryOut(
                api_slug="people",
                singular_noun="Person",
                plural_noun="People",
                workspace_id="workspace-123",
                object_id="object-people",
                created_at="2022-11-21T13:22:49.061281000Z",
            )
        ]


def _record(record_id: str, values: dict[str, object], *, web_url: str | None = None) -> dict[str, object]:
    payload: dict[str, object] = {
        "id": {
            "workspace_id": "workspace-123",
            "object_id": "object-123",
            "record_id": record_id,
        },
        "values": values,
    }
    if web_url:
        payload["web_url"] = web_url
    return payload


class _FakeAttioEnrichmentClient:
    def __init__(self, *, exact_company_match: bool = True) -> None:
        self.exact_company_match = exact_company_match
        self.query_payloads: list[tuple[str, dict[str, object]]] = []
        self.search_queries: list[str] = []
        self.loaded_record_ids: list[str] = []

    def query_records(self, object_slug: str, payload: dict[str, object]) -> list[dict[str, object]]:
        self.query_payloads.append((object_slug, payload))
        if object_slug == "companies":
            if not self.exact_company_match:
                return []
            return [self._company_record()]
        if object_slug == "people":
            return [
                _record(
                    "person-123",
                    {
                        "name": [{"full_name": "Jane Hartree"}],
                        "job_title": [{"value": "VP Trading"}],
                        "email_addresses": [{"email_address": "jane@example.com"}],
                        "phone_numbers": [{"phone_number": "+1 555 0100"}],
                    },
                    web_url="https://app.attio.com/person-123",
                )
            ]
        if object_slug == "deals":
            return [
                _record(
                    "deal-123",
                    {
                        "name": [{"value": "Hartree Partners (Expansion)"}],
                        "stage": [{"status": {"title": "Won"}}],
                        "close_date": [{"value": "2025-05-20"}],
                    },
                    web_url="https://app.attio.com/deal-123",
                )
            ]
        return []

    def search_records(self, *, query: str, objects: list[str], limit: int = 5) -> list[dict[str, object]]:
        self.search_queries.append(query)
        return [
            {
                "id": {
                    "workspace_id": "workspace-123",
                    "object_id": "object-company",
                    "record_id": "company-123",
                },
                "object_slug": "companies",
                "record_text": "Hartree Partners",
            }
        ]

    def get_record(self, object_slug: str, record_id: str) -> dict[str, object]:
        self.loaded_record_ids.append(record_id)
        return self._company_record()

    def _company_record(self) -> dict[str, object]:
        return _record(
            "company-123",
            {
                "name": [{"value": "Hartree Partners"}],
                "domains": [{"domain": "hartreepartners.com"}],
                "description": [{"value": "Global energy and commodities firm."}],
                "customer_status_1746239259": [{"status": {"title": "Customer"}}],
            },
            web_url="https://app.attio.com/company-123",
        )


class _FakeAttioSyncClient:
    def __init__(self) -> None:
        self.query_payloads: list[tuple[str, dict[str, object]]] = []
        self.loaded_record_ids: list[str] = []

    def query_records(self, object_slug: str, payload: dict[str, object]) -> list[dict[str, object]]:
        self.query_payloads.append((object_slug, payload))
        if object_slug == "deals":
            return [
                _record(
                    "deal-customer",
                    {
                        "name": [{"value": "Hartree Partners (Expansion)"}],
                        "stage": [{"status": {"title": "Won"}}],
                        "value": [{"value": "$100,000"}],
                        "associated_company": [
                            {
                                "target_object": "companies",
                                "target_record_id": "company-customer",
                            }
                        ],
                    },
                    web_url="https://app.attio.com/deal-customer",
                ),
                _record(
                    "deal-prospect",
                    {
                        "name": [{"value": "Blue Ridge Trading Pilot"}],
                        "stage": [{"status": {"title": "Evaluation (SQO)"}}],
                        "value": [{"value": "$50,000"}],
                        "associated_company": [
                            {
                                "target_object": "companies",
                                "target_record_id": "company-prospect",
                            }
                        ],
                    },
                    web_url="https://app.attio.com/deal-prospect",
                ),
                _record(
                    "deal-customer-renewal",
                    {
                        "name": [{"value": "Hartree Partners Renewal"}],
                        "stage": [{"status": {"title": "Won"}}],
                        "value": [{"value": "$140,000"}],
                        "associated_company": [
                            {
                                "target_object": "companies",
                                "target_record_id": "company-customer",
                            }
                        ],
                    },
                    web_url="https://app.attio.com/deal-customer-renewal",
                ),
                _record(
                    "deal-unassociated",
                    {
                        "name": [{"value": "No company attached"}],
                    },
                    web_url="https://app.attio.com/deal-unassociated",
                ),
            ]
        return []

    def get_record(self, object_slug: str, record_id: str) -> dict[str, object]:
        self.loaded_record_ids.append(record_id)
        if object_slug != "companies":
            raise AttioIntegrationError(404, "Unknown Attio object")
        if record_id == "company-customer":
            return _record(
                "company-customer",
                {
                    "name": [{"value": "Hartree Partners"}],
                    "domains": [{"domain": "hartreepartners.com"}],
                },
                web_url="https://app.attio.com/company-customer",
            )
        if record_id == "company-prospect":
            return _record(
                "company-prospect",
                {
                    "name": [{"value": "Blue Ridge Trading"}],
                    "domains": [{"domain": "blueridge.example"}],
                    "description": [{"value": "Prospective commodity trading client."}],
                },
                web_url="https://app.attio.com/company-prospect",
            )
        raise AttioIntegrationError(404, "Attio company not found")


class _FakeAttioScopedSyncClient:
    def __init__(self) -> None:
        self.query_payloads: list[tuple[str, dict[str, object]]] = []

    def query_records(self, object_slug: str, payload: dict[str, object]) -> list[dict[str, object]]:
        self.query_payloads.append((object_slug, payload))
        if object_slug == "deals":
            filter_payload = payload.get("filter")
            associated_company = filter_payload.get("associated_company") if isinstance(filter_payload, dict) else None
            company_record_id = (
                associated_company.get("target_record_id") if isinstance(associated_company, dict) else None
            )
            if company_record_id == "company-customer":
                return [
                    _record(
                        "deal-customer",
                        {
                            "name": [{"value": "Hartree Partners (Expansion)"}],
                            "stage": [{"status": {"title": "Won"}}],
                            "value": [{"value": "$120,000"}],
                        },
                        web_url="https://app.attio.com/deal-customer",
                    )
                ]
            return []
        if object_slug != "companies":
            return []
        filter_payload = payload.get("filter")
        client_name = filter_payload.get("name") if isinstance(filter_payload, dict) else None
        if client_name == "Hartree Partners":
            return [
                _record(
                    "company-customer",
                    {
                        "name": [{"value": "Hartree Partners"}],
                        "domains": [{"domain": "hartreepartners.com"}],
                        "customer_status_1746239259": [{"status": {"title": "Customer"}}],
                    },
                    web_url="https://app.attio.com/company-customer",
                )
            ]
        if client_name == "Active But Unclassified Co.":
            return [
                _record(
                    "company-active",
                    {
                        "name": [{"value": "Active But Unclassified Co."}],
                        "domains": [{"domain": "active-unclassified.example"}],
                        "lifecycle_stage": [{"status": {"title": "Active"}}],
                    },
                    web_url="https://app.attio.com/company-active",
                )
            ]
        return []


class AttioClientTests(unittest.TestCase):
    def test_list_objects_sends_bearer_token_and_parses_metadata(self) -> None:
        url = "https://api.attio.com/v2/objects"
        fake_client = _FakeHttpxClient(
            _response(
                url,
                200,
                {
                    "data": [
                        {
                            "id": {
                                "workspace_id": "workspace-123",
                                "object_id": "object-people",
                            },
                            "api_slug": "people",
                            "singular_noun": "Person",
                            "plural_noun": "People",
                            "created_at": "2022-11-21T13:22:49.061281000Z",
                        }
                    ]
                },
            )
        )
        config = AttioConfig(
            enabled=True,
            access_token="attio-test-token",
            base_url="https://api.attio.com/v2",
            timeout_seconds=20,
            object_limit=25,
        )

        with patch(
            "apps.api.app.domains.integrations.services.attio.httpx.Client",
            return_value=fake_client,
        ):
            objects = AttioClient(config).list_objects()

        self.assertEqual(fake_client.request_url, url)
        self.assertEqual(fake_client.request_method, "GET")
        self.assertEqual(fake_client.request_headers["Authorization"], "Bearer attio-test-token")
        self.assertEqual(objects[0].api_slug, "people")
        self.assertEqual(objects[0].workspace_id, "workspace-123")

    def test_list_objects_surfaces_rate_limit_retry_after(self) -> None:
        fake_client = _FakeHttpxClient(
            _response(
                "https://api.attio.com/v2/objects",
                429,
                {"message": "rate limited"},
                headers={"Retry-After": "Tue, 23 May 2023 14:42:01 GMT"},
            )
        )
        config = AttioConfig(
            enabled=True,
            access_token="attio-test-token",
            base_url="https://api.attio.com/v2",
            timeout_seconds=20,
            object_limit=25,
        )

        with patch(
            "apps.api.app.domains.integrations.services.attio.httpx.Client",
            return_value=fake_client,
        ):
            with self.assertRaises(AttioIntegrationError) as context:
                AttioClient(config).list_objects()

        self.assertEqual(context.exception.status_code, 429)
        self.assertIn("Retry after Tue, 23 May 2023 14:42:01 GMT", context.exception.detail)


class AttioClientEnrichmentTests(unittest.TestCase):
    def setUp(self) -> None:
        self._previous_settings = {
            "ATTIO_ENABLED": settings.ATTIO_ENABLED,
            "ATTIO_ACCESS_TOKEN": settings.ATTIO_ACCESS_TOKEN,
            "ATTIO_API_KEY": settings.ATTIO_API_KEY,
            "ATTIO_BASE_URL": settings.ATTIO_BASE_URL,
            "ATTIO_TIMEOUT_SECONDS": settings.ATTIO_TIMEOUT_SECONDS,
            "ATTIO_OBJECT_LIMIT": settings.ATTIO_OBJECT_LIMIT,
            "ATTIO_CLIENT_SYNC_LIMIT": settings.ATTIO_CLIENT_SYNC_LIMIT,
        }
        settings.ATTIO_ENABLED = True
        settings.ATTIO_ACCESS_TOKEN = "attio-secret-token"
        settings.ATTIO_API_KEY = ""
        settings.ATTIO_BASE_URL = "https://api.attio.com/v2"
        settings.ATTIO_TIMEOUT_SECONDS = 20
        settings.ATTIO_OBJECT_LIMIT = 25
        settings.ATTIO_CLIENT_SYNC_LIMIT = 200

    def tearDown(self) -> None:
        for key, value in self._previous_settings.items():
            setattr(settings, key, value)

    def test_enrichment_uses_exact_company_match_and_related_records(self) -> None:
        fake_client = _FakeAttioEnrichmentClient()

        result = attio.build_attio_client_enrichment(client_name=" Hartree ", client=fake_client)  # type: ignore[arg-type]

        self.assertTrue(result.matched)
        self.assertEqual(result.match_basis, "exact_name")
        self.assertEqual(result.company.label if result.company else None, "Hartree Partners")
        self.assertEqual(result.company.domains if result.company else [], ["hartreepartners.com"])
        self.assertEqual(result.company.description if result.company else None, "Global energy and commodities firm.")
        self.assertEqual(result.company.status if result.company else None, "Customer")
        self.assertEqual(result.contacts[0].name, "Jane Hartree")
        self.assertEqual(result.contacts[0].title, "VP Trading")
        self.assertEqual(result.contacts[0].email, "jane@example.com")
        self.assertEqual(result.deals[0].name, "Hartree Partners (Expansion)")
        self.assertEqual(result.deals[0].stage, "Won")
        self.assertEqual(result.deals[0].close_date, "2025-05-20")
        self.assertIn(("companies", {"filter": {"name": "Hartree"}, "limit": 5, "offset": 0}), fake_client.query_payloads)

    def test_enrichment_falls_back_to_attio_search(self) -> None:
        fake_client = _FakeAttioEnrichmentClient(exact_company_match=False)

        result = attio.build_attio_client_enrichment(client_name="Hartree", client=fake_client)  # type: ignore[arg-type]

        self.assertTrue(result.matched)
        self.assertEqual(result.match_basis, "search")
        self.assertEqual(fake_client.search_queries, ["Hartree"])
        self.assertEqual(fake_client.loaded_record_ids, ["company-123"])

    def test_enrichment_ignores_attio_company_without_related_deals(self) -> None:
        class NoDealFakeClient(_FakeAttioEnrichmentClient):
            def query_records(self, object_slug: str, payload: dict[str, object]) -> list[dict[str, object]]:
                if object_slug == "deals":
                    self.query_payloads.append((object_slug, payload))
                    return []
                return super().query_records(object_slug, payload)

        fake_client = NoDealFakeClient()

        result = attio.build_attio_client_enrichment(client_name="Hartree", client=fake_client)  # type: ignore[arg-type]

        self.assertFalse(result.matched)
        self.assertEqual(result.match_basis, "exact_name")
        self.assertIsNone(result.company)
        self.assertEqual(result.contacts, [])
        self.assertEqual(result.deals, [])
        self.assertNotIn("people", [object_slug for object_slug, _payload in fake_client.query_payloads])
        self.assertEqual(result.warnings, ["Attio company matched, but no related deal records were available."])

    def test_enrichment_returns_unmatched_payload_without_related_queries(self) -> None:
        class EmptyFakeClient(_FakeAttioEnrichmentClient):
            def search_records(self, *, query: str, objects: list[str], limit: int = 5) -> list[dict[str, object]]:
                return []

        fake_client = EmptyFakeClient(exact_company_match=False)

        result = attio.build_attio_client_enrichment(client_name="Unknown Client", client=fake_client)  # type: ignore[arg-type]

        self.assertFalse(result.matched)
        self.assertEqual(result.match_basis, "none")
        self.assertIsNone(result.company)
        self.assertEqual(result.contacts, [])
        self.assertEqual(result.deals, [])

    def test_client_sync_maps_attio_companies_to_nexus_types(self) -> None:
        fake_client = _FakeAttioSyncClient()

        result = attio.build_attio_client_sync(limit=4, client=fake_client)  # type: ignore[arg-type]

        self.assertEqual(
            fake_client.query_payloads,
            [
                ("deals", {"limit": attio.ATTIO_CLIENT_SYNC_PAGE_SIZE, "offset": 0}),
            ],
        )
        self.assertEqual(fake_client.loaded_record_ids, ["company-customer", "company-prospect"])
        self.assertEqual(result.scanned_record_count, 4)
        self.assertEqual(result.returned_client_count, 2)
        self.assertEqual(result.skipped_record_count, 1)
        self.assertEqual(result.clients[0].name, "Hartree Partners")
        self.assertEqual(result.clients[0].type, "Client")
        self.assertEqual(result.clients[0].relationship, "Client")
        self.assertEqual(result.clients[0].status, "Won")
        self.assertEqual(result.clients[0].deal_count, 2)
        self.assertEqual(result.clients[0].closed_deal_count, 2)
        self.assertEqual(result.clients[0].open_deal_count, 0)
        self.assertEqual(result.clients[0].deal_statuses, ["Won"])
        self.assertEqual(result.clients[0].disqualified_deal_count, 0)
        self.assertEqual(result.clients[0].lost_deal_count, 0)
        self.assertEqual(result.clients[0].on_hold_deal_count, 0)
        self.assertIsNone(result.clients[0].disqualification_reason)
        self.assertEqual(result.clients[0].total_arr, "$240,000")
        self.assertEqual(result.clients[0].closed_arr, "$240,000")
        self.assertIsNone(result.clients[0].open_arr)
        self.assertEqual(result.clients[1].name, "Blue Ridge Trading")
        self.assertEqual(result.clients[1].type, "Prospect")
        self.assertEqual(result.clients[1].relationship, "Prospect")
        self.assertEqual(result.clients[1].status, "Evaluation (SQO)")
        self.assertEqual(result.clients[1].deal_count, 1)
        self.assertEqual(result.clients[1].closed_deal_count, 0)
        self.assertEqual(result.clients[1].open_deal_count, 1)
        self.assertEqual(result.clients[1].deal_statuses, ["Evaluation (SQO)"])
        self.assertEqual(result.clients[1].disqualified_deal_count, 0)
        self.assertEqual(result.clients[1].lost_deal_count, 0)
        self.assertEqual(result.clients[1].on_hold_deal_count, 0)
        self.assertIsNone(result.clients[1].disqualification_reason)
        self.assertEqual(result.clients[1].total_arr, "$50,000")
        self.assertIsNone(result.clients[1].closed_arr)
        self.assertEqual(result.clients[1].open_arr, "$50,000")
        self.assertNotIn("domainonly.example", [client.name for client in result.clients])
        self.assertNotIn("Active But Unclassified Co.", [client.name for client in result.clients])
        self.assertEqual(
            result.warnings,
            ["Skipped 1 Attio deal records without associated company references."],
        )

    def test_client_sync_prioritizes_clients_before_prospects(self) -> None:
        class ProspectFirstFakeClient(_FakeAttioSyncClient):
            def query_records(self, object_slug: str, payload: dict[str, object]) -> list[dict[str, object]]:
                self.query_payloads.append((object_slug, payload))
                if object_slug != "deals":
                    return []
                return [
                    _record(
                        "deal-prospect",
                        {
                            "name": [{"value": "Blue Ridge Trading Pilot"}],
                            "stage": [{"status": {"title": "Evaluation (SQO)"}}],
                            "associated_company": [
                                {
                                    "target_object": "companies",
                                    "target_record_id": "company-prospect",
                                }
                            ],
                        },
                    ),
                    _record(
                        "deal-customer",
                        {
                            "name": [{"value": "Hartree Partners (Expansion)"}],
                            "stage": [{"status": {"title": "Won"}}],
                            "associated_company": [
                                {
                                    "target_object": "companies",
                                    "target_record_id": "company-customer",
                                }
                            ],
                        },
                    ),
                ]

        fake_client = ProspectFirstFakeClient()

        result = attio.build_attio_client_sync(limit=2, client=fake_client)  # type: ignore[arg-type]

        self.assertEqual([client.name for client in result.clients], ["Hartree Partners", "Blue Ridge Trading"])
        self.assertEqual([client.type for client in result.clients], ["Client", "Prospect"])

    def test_client_sync_returns_all_deal_statuses_for_lost_segmentation(self) -> None:
        class LostOnlyFakeClient(_FakeAttioSyncClient):
            def query_records(self, object_slug: str, payload: dict[str, object]) -> list[dict[str, object]]:
                self.query_payloads.append((object_slug, payload))
                if object_slug != "deals":
                    return []
                return [
                    _record(
                        "deal-lost-one",
                        {
                            "name": [{"value": "Delta Alloy Evaluation"}],
                            "stage": [{"status": {"title": "Closed Lost"}}],
                            "associated_company": [
                                {
                                    "target_object": "companies",
                                    "target_record_id": "company-lost",
                                }
                            ],
                        },
                    ),
                    _record(
                        "deal-lost-two",
                        {
                            "name": [{"value": "Delta Alloy Renewal"}],
                            "stage": [{"status": {"title": "Lost"}}],
                            "associated_company": [
                                {
                                    "target_object": "companies",
                                    "target_record_id": "company-lost",
                                }
                            ],
                        },
                    ),
                ]

            def get_record(self, object_slug: str, record_id: str) -> dict[str, object]:
                self.loaded_record_ids.append(record_id)
                if object_slug != "companies" or record_id != "company-lost":
                    raise AttioIntegrationError(404, "Attio company not found")
                return _record(
                    "company-lost",
                    {
                        "name": [{"value": "Delta Alloy"}],
                        "domains": [{"domain": "delta-alloy.example"}],
                    },
                )

        fake_client = LostOnlyFakeClient()

        result = attio.build_attio_client_sync(limit=2, client=fake_client)  # type: ignore[arg-type]

        self.assertEqual(result.returned_client_count, 1)
        self.assertEqual(result.clients[0].name, "Delta Alloy")
        self.assertEqual(result.clients[0].type, "Other")
        self.assertEqual(result.clients[0].status, "Closed Lost")
        self.assertEqual(result.clients[0].deal_count, 2)
        self.assertEqual(result.clients[0].closed_deal_count, 0)
        self.assertEqual(result.clients[0].open_deal_count, 0)
        self.assertEqual(result.clients[0].deal_statuses, ["Closed Lost", "Lost"])
        self.assertEqual(result.clients[0].disqualified_deal_count, 0)
        self.assertEqual(result.clients[0].lost_deal_count, 2)
        self.assertEqual(result.clients[0].on_hold_deal_count, 0)

    def test_client_sync_counts_nonexclusive_deal_categories(self) -> None:
        class MixedDealStatusFakeClient(_FakeAttioSyncClient):
            def query_records(self, object_slug: str, payload: dict[str, object]) -> list[dict[str, object]]:
                self.query_payloads.append((object_slug, payload))
                if object_slug != "deals":
                    return []
                return [
                    _record(
                        "deal-won",
                        {
                        "name": [{"value": "Northstar Active"}],
                        "stage": [{"status": {"title": "Won"}}],
                        "value": [{"value": "$1,000"}],
                        "associated_company": [
                                {
                                    "target_object": "companies",
                                    "target_record_id": "company-mixed",
                                }
                            ],
                        },
                    ),
                    _record(
                        "deal-lost",
                        {
                        "name": [{"value": "Northstar Lost"}],
                        "stage": [{"status": {"title": "Closed Lost"}}],
                        "value": [{"value": "$2,000"}],
                        "associated_company": [
                                {
                                    "target_object": "companies",
                                    "target_record_id": "company-mixed",
                                }
                            ],
                        },
                    ),
                    _record(
                        "deal-on-hold",
                        {
                        "name": [{"value": "Northstar Paused"}],
                        "stage": [{"status": {"title": "On Hold"}}],
                        "value": [{"value": "$3,000"}],
                        "associated_company": [
                                {
                                    "target_object": "companies",
                                    "target_record_id": "company-mixed",
                                }
                            ],
                        },
                    ),
                    _record(
                        "deal-disqualified",
                        {
                        "name": [{"value": "Northstar Disqualified"}],
                        "stage": [{"status": {"title": "Disqualified"}}],
                        "value": [{"value": "$4,000"}],
                        "disqualification_reason": [{"option": {"title": "Outside ICP"}}],
                            "associated_company": [
                                {
                                    "target_object": "companies",
                                    "target_record_id": "company-mixed",
                                }
                            ],
                        },
                    ),
                ]

            def get_record(self, object_slug: str, record_id: str) -> dict[str, object]:
                self.loaded_record_ids.append(record_id)
                if object_slug != "companies" or record_id != "company-mixed":
                    raise AttioIntegrationError(404, "Attio company not found")
                return _record(
                    "company-mixed",
                    {
                        "name": [{"value": "Northstar Commodities"}],
                        "domains": [{"domain": "northstar.example"}],
                    },
                )

        fake_client = MixedDealStatusFakeClient()

        result = attio.build_attio_client_sync(limit=4, client=fake_client)  # type: ignore[arg-type]

        self.assertEqual(result.returned_client_count, 1)
        self.assertEqual(result.clients[0].name, "Northstar Commodities")
        self.assertEqual(result.clients[0].type, "Client")
        self.assertEqual(result.clients[0].deal_count, 4)
        self.assertEqual(result.clients[0].closed_deal_count, 1)
        self.assertEqual(result.clients[0].open_deal_count, 0)
        self.assertEqual(result.clients[0].deal_statuses, ["Won", "Closed Lost", "On Hold", "Disqualified"])
        self.assertEqual(result.clients[0].disqualified_deal_count, 1)
        self.assertEqual(result.clients[0].lost_deal_count, 1)
        self.assertEqual(result.clients[0].on_hold_deal_count, 1)
        self.assertEqual(result.clients[0].disqualification_reason, "Outside ICP")
        self.assertEqual(result.clients[0].total_arr, "$10,000")
        self.assertEqual(result.clients[0].closed_arr, "$1,000")
        self.assertIsNone(result.clients[0].open_arr)

    def test_client_sync_skips_existing_nexus_client_names(self) -> None:
        fake_client = _FakeAttioSyncClient()

        result = attio.build_attio_client_sync(
            limit=2,
            excluded_client_names=["Hartree Partners"],
            client=fake_client,  # type: ignore[arg-type]
        )

        self.assertEqual(result.returned_client_count, 1)
        self.assertEqual(result.skipped_record_count, 2)
        self.assertEqual([client.name for client in result.clients], ["Blue Ridge Trading"])
        self.assertEqual(result.clients[0].type, "Prospect")
        self.assertEqual(
            result.warnings,
            [
                "Skipped 1 Attio deal records without associated company references.",
                "Skipped 1 Attio companies already present in Nexus or pending propositions.",
            ],
        )

    def test_client_sync_can_scope_queries_to_existing_nexus_client_names(self) -> None:
        fake_client = _FakeAttioScopedSyncClient()

        result = attio.build_attio_client_sync(
            limit=10,
            client_names=[
                "Hartree Partners",
                "Missing Co.",
                "Active But Unclassified Co.",
                "Hartree Partners",
            ],
            client=fake_client,  # type: ignore[arg-type]
        )

        self.assertEqual(
            fake_client.query_payloads,
            [
                ("companies", {"filter": {"name": "Hartree Partners"}, "limit": 5, "offset": 0}),
                ("companies", {"filter": {"name": "Missing Co."}, "limit": 5, "offset": 0}),
                (
                    "companies",
                    {"filter": {"name": "Active But Unclassified Co."}, "limit": 5, "offset": 0},
                ),
                (
                    "deals",
                    {
                        "filter": {
                            "associated_company": {
                                "target_object": "companies",
                                "target_record_id": "company-customer",
                            }
                        },
                        "limit": attio.ATTIO_CLIENT_DEAL_LIMIT,
                        "offset": 0,
                    },
                ),
                (
                    "deals",
                    {
                        "filter": {
                            "associated_company": {
                                "target_object": "companies",
                                "target_record_id": "company-active",
                            }
                        },
                        "limit": attio.ATTIO_CLIENT_DEAL_LIMIT,
                        "offset": 0,
                    },
                ),
            ],
        )
        self.assertEqual(result.requested_limit, 3)
        self.assertEqual(result.scanned_record_count, 3)
        self.assertEqual(result.returned_client_count, 1)
        self.assertEqual(result.skipped_record_count, 1)
        self.assertEqual(result.clients[0].name, "Hartree Partners")
        self.assertEqual(result.clients[0].type, "Client")
        self.assertEqual(result.clients[0].deal_count, 1)
        self.assertEqual(result.clients[0].closed_deal_count, 1)
        self.assertEqual(result.clients[0].open_deal_count, 0)
        self.assertEqual(result.clients[0].total_arr, "$120,000")
        self.assertEqual(result.clients[0].closed_arr, "$120,000")
        self.assertIsNone(result.clients[0].open_arr)
        self.assertEqual(
            result.warnings,
            [
                "Skipped 1 Attio company records without related deal records.",
                "No Attio company match found for 1 existing Nexus client names.",
            ],
        )


class AttioIntegrationApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=cls.engine)

        cls.original_session_factory = app.state.session_factory
        app.state.session_factory = cls.SessionLocal

        def _get_test_db():
            db = cls.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = _get_test_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        app.state.session_factory = cls.original_session_factory
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        self._previous_settings = {
            "ATTIO_ENABLED": settings.ATTIO_ENABLED,
            "ATTIO_ACCESS_TOKEN": settings.ATTIO_ACCESS_TOKEN,
            "ATTIO_API_KEY": settings.ATTIO_API_KEY,
            "ATTIO_BASE_URL": settings.ATTIO_BASE_URL,
            "ATTIO_TIMEOUT_SECONDS": settings.ATTIO_TIMEOUT_SECONDS,
            "ATTIO_OBJECT_LIMIT": settings.ATTIO_OBJECT_LIMIT,
            "ATTIO_CLIENT_SYNC_LIMIT": settings.ATTIO_CLIENT_SYNC_LIMIT,
        }
        with self.SessionLocal() as session:
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()
        settings.ATTIO_ENABLED = False
        settings.ATTIO_ACCESS_TOKEN = ""
        settings.ATTIO_API_KEY = ""
        settings.ATTIO_BASE_URL = "https://api.attio.com/v2"
        settings.ATTIO_TIMEOUT_SECONDS = 20
        settings.ATTIO_OBJECT_LIMIT = 25
        settings.ATTIO_CLIENT_SYNC_LIMIT = 200

    def tearDown(self) -> None:
        for key, value in self._previous_settings.items():
            setattr(settings, key, value)

    def test_settings_report_configuration_without_exposing_token(self) -> None:
        token = self._create_session_token()

        response = self.client.get(
            "/admin/integrations/attio/settings",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["enabled"])
        self.assertFalse(response.json()["configured"])
        self.assertEqual(response.json()["auth_status"], "none")

        settings.ATTIO_ENABLED = True
        settings.ATTIO_ACCESS_TOKEN = "attio-secret-token"
        configured_response = self.client.get(
            "/admin/integrations/attio/settings",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(configured_response.status_code, 200)
        payload = configured_response.json()
        self.assertTrue(payload["enabled"])
        self.assertTrue(payload["configured"])
        self.assertEqual(payload["auth_status"], "configured")
        self.assertEqual(payload["client_sync_limit"], 200)
        self.assertEqual(payload["required_scopes"], ["object_configuration:read", "record_permission:read"])
        self.assertNotIn("attio-secret-token", configured_response.text)

    def test_connection_test_returns_attio_object_metadata(self) -> None:
        token = self._create_session_token()
        settings.ATTIO_ENABLED = True
        settings.ATTIO_ACCESS_TOKEN = "attio-secret-token"

        with patch(
            "apps.api.app.domains.integrations.services.attio.AttioClient",
            _FakeAttioClient,
        ):
            response = self.client.post(
                "/admin/integrations/attio/test-connection",
                headers={"Authorization": f"Bearer {token}"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "connected")
        self.assertEqual(payload["workspace_id"], "workspace-123")
        self.assertEqual(payload["object_count"], 1)
        self.assertEqual(payload["objects"][0]["api_slug"], "people")
        self.assertNotIn("attio-secret-token", response.text)

    def test_client_enrichment_route_returns_read_only_attio_payload(self) -> None:
        token = self._create_session_token()

        with patch(
            "apps.api.app.routes.integrations.build_attio_client_enrichment",
            return_value=AttioClientEnrichmentOut(
                client_name="Hartree",
                matched=True,
                match_basis="search",
                company=AttioClientMatchedRecordOut(
                    record_id="company-123",
                    label="Hartree Partners",
                    domains=["hartreepartners.com"],
                    description="Global energy and commodities firm.",
                    web_url="https://app.attio.com/company-123",
                ),
                required_scopes=["object_configuration:read", "record_permission:read"],
            ),
        ):
            response = self.client.post(
                "/integrations/attio/client-enrichment",
                json={"client_name": "Hartree"},
                headers={"Authorization": f"Bearer {token}"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["matched"])
        self.assertEqual(payload["match_basis"], "search")
        self.assertEqual(payload["company"]["label"], "Hartree Partners")
        self.assertEqual(payload["company"]["domains"], ["hartreepartners.com"])

    def test_client_sync_route_returns_attio_company_summaries(self) -> None:
        token = self._create_session_token()

        with patch(
            "apps.api.app.routes.integrations.build_attio_client_sync",
            return_value=AttioClientSyncOut(
                requested_limit=25,
                scanned_record_count=1,
                skipped_record_count=0,
                returned_client_count=1,
                clients=[
                    AttioSyncedClientOut(
                        record_id="company-prospect",
                        name="Blue Ridge Trading",
                        type="Prospect",
                        relationship="Prospect",
                        web_url="https://app.attio.com/company-prospect",
                        domains=["blueridge.example"],
                        status="Qualified Lead",
                    )
                ],
                required_scopes=["object_configuration:read", "record_permission:read"],
            ),
        ) as sync_mock:
            response = self.client.post(
                "/integrations/attio/client-sync",
                json={
                    "limit": 25,
                    "client_names": ["Blue Ridge Trading", "Blue Ridge Trading"],
                    "excluded_client_names": ["Hartree Partners", "Hartree Partners"],
                },
                headers={"Authorization": f"Bearer {token}"},
            )

        self.assertEqual(response.status_code, 200)
        sync_mock.assert_called_once_with(
            limit=25,
            client_names=["Blue Ridge Trading"],
            excluded_client_names=["Hartree Partners"],
        )
        payload = response.json()
        self.assertEqual(payload["requested_limit"], 25)
        self.assertEqual(payload["returned_client_count"], 1)
        self.assertEqual(payload["clients"][0]["name"], "Blue Ridge Trading")
        self.assertEqual(payload["clients"][0]["type"], "Prospect")
        self.assertEqual(payload["clients"][0]["relationship"], "Prospect")
        self.assertEqual(payload["clients"][0]["deal_statuses"], [])
        self.assertEqual(payload["clients"][0]["closed_deal_count"], 0)
        self.assertEqual(payload["clients"][0]["open_deal_count"], 0)
        self.assertEqual(payload["clients"][0]["disqualified_deal_count"], 0)
        self.assertEqual(payload["clients"][0]["lost_deal_count"], 0)
        self.assertEqual(payload["clients"][0]["on_hold_deal_count"], 0)
        self.assertIsNone(payload["clients"][0]["disqualification_reason"])
        self.assertIsNone(payload["clients"][0]["closed_arr"])
        self.assertIsNone(payload["clients"][0]["open_arr"])

    def test_client_sync_route_accepts_large_exclusion_lists(self) -> None:
        token = self._create_session_token()
        excluded_client_names = [f"TAM Company {index}" for index in range(1495)]

        with patch(
            "apps.api.app.routes.integrations.build_attio_client_sync",
            return_value=AttioClientSyncOut(
                requested_limit=200,
                scanned_record_count=0,
                skipped_record_count=0,
                returned_client_count=0,
                clients=[],
                required_scopes=["object_configuration:read", "record_permission:read"],
            ),
        ) as sync_mock:
            response = self.client.post(
                "/integrations/attio/client-sync",
                json={
                    "limit": 200,
                    "client_names": [],
                    "excluded_client_names": excluded_client_names,
                },
                headers={"Authorization": f"Bearer {token}"},
            )

        self.assertEqual(response.status_code, 200)
        sync_kwargs = sync_mock.call_args.kwargs
        self.assertEqual(sync_kwargs["limit"], 200)
        self.assertEqual(sync_kwargs["client_names"], [])
        self.assertEqual(sync_kwargs["excluded_client_names"], excluded_client_names)

    def _create_session_token(
        self,
        *,
        user_id: str = "attio_admin",
        role: str = "OPS_ADMIN",
    ) -> str:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            user = UserAccount(
                user_id=user_id,
                email=f"{user_id}@example.com",
                display_name=user_id.replace("_", " ").title(),
                role=role,
                password_hash=hash_password("supersecret1"),
                is_active=True,
                last_login_at=now,
                created_at=now,
                created_by="test-suite",
                updated_at=now,
                updated_by="test-suite",
                version=1,
            )
            session.add(user)
            session.commit()
            _, token = create_user_session(session, user)
            return token


if __name__ == "__main__":
    unittest.main()
