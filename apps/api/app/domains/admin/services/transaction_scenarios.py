from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal


def utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


@dataclass(frozen=True)
class ScenarioDefinition:
    code: str
    name: str
    description: str
    book_rows: list[dict]
    event_rows: list[dict]
    trade_rows: list[dict]
    trade_leg_rows: list[dict]
    trade_price_term_rows: list[dict]


CORE_BOOK_ROWS = [
    {
        "code": "DEMO_CRUDE",
        "name": "Crude Physical",
        "description": "Physical crude capture book for prompt barrels and terminal transfers.",
    },
    {
        "code": "DEMO_GAS",
        "name": "Gas Optimization",
        "description": "Gas optimization book for indexed supply and balancing transactions.",
    },
    {
        "code": "DEMO_PRODUCTS",
        "name": "Products Arbitrage",
        "description": "Refined products book for crack, blend, and location-driven opportunities.",
    },
]


CORE_EVENT_ROWS = [
    {
        "event_id": "11111111-1111-1111-1111-111111111111",
        "aggregate_type": "trade",
        "aggregate_id": "TRD-10001",
        "event_type": "TradeCreated",
        "occurred_at": utc("2026-02-03T15:00:00Z"),
        "recorded_at": utc("2026-02-03T15:02:00Z"),
        "actor_id": "system-scenario",
        "correlation_id": "aaaa1111-bbbb-4ccc-8ddd-eeee00000001",
        "causation_id": None,
        "schema_version": 1,
        "payload": {
            "trade_nature": "PHYSICAL",
            "trade_structure": "SINGLE",
            "trade_side": "BUY",
            "book": "DEMO_CRUDE",
            "commodity_class": "CRUDE_OIL",
            "commodity": "WTI",
            "pricing_type": "FIXED",
            "price": 74.25,
            "volume": 100000,
        },
    },
    {
        "event_id": "22222222-2222-2222-2222-222222222222",
        "aggregate_type": "trade",
        "aggregate_id": "TRD-10002",
        "event_type": "TradeCreated",
        "occurred_at": utc("2026-02-04T14:00:00Z"),
        "recorded_at": utc("2026-02-04T14:04:00Z"),
        "actor_id": "system-scenario",
        "correlation_id": "aaaa1111-bbbb-4ccc-8ddd-eeee00000002",
        "causation_id": None,
        "schema_version": 1,
        "payload": {
            "trade_nature": "PHYSICAL",
            "trade_structure": "SINGLE",
            "trade_side": "BUY",
            "book": "DEMO_GAS",
            "commodity_class": "NATURAL_GAS",
            "commodity": "NATURAL_GAS",
            "pricing_type": "INDEX",
            "price_index_code": "HENRY_HUB_GAS_D",
            "price": None,
            "volume": 300000,
        },
    },
    {
        "event_id": "33333333-3333-3333-3333-333333333333",
        "aggregate_type": "trade",
        "aggregate_id": "TRD-10002",
        "event_type": "TradeAmended",
        "occurred_at": utc("2026-02-05T17:00:00Z"),
        "recorded_at": utc("2026-02-05T17:01:00Z"),
        "actor_id": "system-scenario",
        "correlation_id": "aaaa1111-bbbb-4ccc-8ddd-eeee00000003",
        "causation_id": "22222222-2222-2222-2222-222222222222",
        "schema_version": 1,
        "payload": {
            "volume": 420000,
        },
    },
    {
        "event_id": "44444444-4444-4444-4444-444444444444",
        "aggregate_type": "trade",
        "aggregate_id": "TRD-10003",
        "event_type": "TradeCreated",
        "occurred_at": utc("2026-02-06T16:00:00Z"),
        "recorded_at": utc("2026-02-06T16:03:00Z"),
        "actor_id": "system-scenario",
        "correlation_id": "aaaa1111-bbbb-4ccc-8ddd-eeee00000004",
        "causation_id": None,
        "schema_version": 1,
        "payload": {
            "trade_nature": "FINANCIAL",
            "trade_structure": "SWAP",
            "book": "DEMO_PRODUCTS",
            "commodity_class": "REFINED_PRODUCTS",
            "commodity": "DIESEL",
            "pricing_type": "HYBRID",
            "price_index_code": "USGC_DIESEL_SPOT_D",
            "price": 2.15,
            "volume": 25000,
        },
    },
    {
        "event_id": "55555555-5555-5555-5555-555555555555",
        "aggregate_type": "trade",
        "aggregate_id": "TRD-10004",
        "event_type": "TradeCreated",
        "occurred_at": utc("2026-02-07T18:00:00Z"),
        "recorded_at": utc("2026-02-07T18:02:00Z"),
        "actor_id": "system-scenario",
        "correlation_id": "aaaa1111-bbbb-4ccc-8ddd-eeee00000005",
        "causation_id": None,
        "schema_version": 1,
        "payload": {
            "trade_nature": "PHYSICAL",
            "trade_structure": "SINGLE",
            "trade_side": "SELL",
            "book": "DEMO_PRODUCTS",
            "commodity_class": "REFINED_PRODUCTS",
            "commodity": "JET_FUEL",
            "pricing_type": "FIXED",
            "price": 2.35,
            "volume": 18000,
        },
    },
    {
        "event_id": "66666666-6666-6666-6666-666666666666",
        "aggregate_type": "trade",
        "aggregate_id": "TRD-10004",
        "event_type": "TradeCancelled",
        "occurred_at": utc("2026-02-08T11:00:00Z"),
        "recorded_at": utc("2026-02-08T11:05:00Z"),
        "actor_id": "system-scenario",
        "correlation_id": "aaaa1111-bbbb-4ccc-8ddd-eeee00000006",
        "causation_id": "55555555-5555-5555-5555-555555555555",
        "schema_version": 1,
        "payload": {},
    },
]


CORE_TRADE_ROWS = [
    {
        "trade_id": "TRD-10001",
        "created_at": utc("2026-02-03T15:02:00Z"),
        "updated_at": utc("2026-02-03T15:02:00Z"),
        "trade_nature": "PHYSICAL",
        "trade_structure": "SINGLE",
        "trade_side": "BUY",
        "book": "DEMO_CRUDE",
        "commodity_class": "CRUDE_OIL",
        "commodity": "WTI",
        "pricing_type": "FIXED",
        "price_index_code": None,
        "price": Decimal("74.250000"),
        "volume": Decimal("100000.000000"),
        "status": "ACTIVE",
        "last_event_id": "11111111-1111-1111-1111-111111111111",
    },
    {
        "trade_id": "TRD-10002",
        "created_at": utc("2026-02-04T14:04:00Z"),
        "updated_at": utc("2026-02-05T17:01:00Z"),
        "trade_nature": "PHYSICAL",
        "trade_structure": "SINGLE",
        "trade_side": "BUY",
        "book": "DEMO_GAS",
        "commodity_class": "NATURAL_GAS",
        "commodity": "NATURAL_GAS",
        "pricing_type": "INDEX",
        "price_index_code": "HENRY_HUB_GAS_D",
        "price": None,
        "volume": Decimal("420000.000000"),
        "status": "ACTIVE",
        "last_event_id": "33333333-3333-3333-3333-333333333333",
    },
    {
        "trade_id": "TRD-10003",
        "created_at": utc("2026-02-06T16:03:00Z"),
        "updated_at": utc("2026-02-06T16:03:00Z"),
        "trade_nature": "FINANCIAL",
        "trade_structure": "SWAP",
        "trade_side": None,
        "book": "DEMO_PRODUCTS",
        "commodity_class": "REFINED_PRODUCTS",
        "commodity": "DIESEL",
        "pricing_type": "HYBRID",
        "price_index_code": "USGC_DIESEL_SPOT_D",
        "price": Decimal("2.150000"),
        "volume": Decimal("25000.000000"),
        "status": "ACTIVE",
        "last_event_id": "44444444-4444-4444-4444-444444444444",
    },
    {
        "trade_id": "TRD-10004",
        "created_at": utc("2026-02-07T18:02:00Z"),
        "updated_at": utc("2026-02-08T11:05:00Z"),
        "trade_nature": "PHYSICAL",
        "trade_structure": "SINGLE",
        "trade_side": "SELL",
        "book": "DEMO_PRODUCTS",
        "commodity_class": "REFINED_PRODUCTS",
        "commodity": "JET_FUEL",
        "pricing_type": "FIXED",
        "price_index_code": None,
        "price": Decimal("2.350000"),
        "volume": Decimal("18000.000000"),
        "status": "CANCELLED",
        "last_event_id": "66666666-6666-6666-6666-666666666666",
    },
]


CORE_TRADE_LEG_ROWS = [
    {
        "trade_leg_id": "77777777-7777-7777-7777-777777777771",
        "trade_id": "TRD-10001",
        "leg_no": 1,
        "side": "BUY",
        "commodity_class": "CRUDE_OIL",
        "commodity_code": "WTI",
        "quantity": Decimal("100000.000000"),
        "created_at": utc("2026-02-03T15:02:00Z"),
        "updated_at": utc("2026-02-03T15:02:00Z"),
    },
    {
        "trade_leg_id": "77777777-7777-7777-7777-777777777772",
        "trade_id": "TRD-10002",
        "leg_no": 1,
        "side": "BUY",
        "commodity_class": "NATURAL_GAS",
        "commodity_code": "NATURAL_GAS",
        "quantity": Decimal("420000.000000"),
        "created_at": utc("2026-02-04T14:04:00Z"),
        "updated_at": utc("2026-02-05T17:01:00Z"),
    },
    {
        "trade_leg_id": "77777777-7777-7777-7777-777777777773",
        "trade_id": "TRD-10003",
        "leg_no": 1,
        "side": "BUY",
        "commodity_class": "REFINED_PRODUCTS",
        "commodity_code": "DIESEL",
        "quantity": Decimal("25000.000000"),
        "created_at": utc("2026-02-06T16:03:00Z"),
        "updated_at": utc("2026-02-06T16:03:00Z"),
    },
    {
        "trade_leg_id": "77777777-7777-7777-7777-777777777774",
        "trade_id": "TRD-10003",
        "leg_no": 2,
        "side": "SELL",
        "commodity_class": "REFINED_PRODUCTS",
        "commodity_code": "GASOLINE",
        "quantity": Decimal("25000.000000"),
        "created_at": utc("2026-02-06T16:03:00Z"),
        "updated_at": utc("2026-02-06T16:03:00Z"),
    },
    {
        "trade_leg_id": "77777777-7777-7777-7777-777777777775",
        "trade_id": "TRD-10004",
        "leg_no": 1,
        "side": "SELL",
        "commodity_class": "REFINED_PRODUCTS",
        "commodity_code": "JET_FUEL",
        "quantity": Decimal("18000.000000"),
        "created_at": utc("2026-02-07T18:02:00Z"),
        "updated_at": utc("2026-02-08T11:05:00Z"),
    },
]


CORE_PRICE_TERM_ROWS = [
    {
        "trade_price_term_id": "88888888-8888-8888-8888-888888888881",
        "trade_id": "TRD-10001",
        "term_no": 1,
        "pricing_type": "FIXED",
        "fixed_price": Decimal("74.250000"),
        "price_index_code": None,
        "created_at": utc("2026-02-03T15:02:00Z"),
        "updated_at": utc("2026-02-03T15:02:00Z"),
    },
    {
        "trade_price_term_id": "88888888-8888-8888-8888-888888888882",
        "trade_id": "TRD-10002",
        "term_no": 1,
        "pricing_type": "INDEX",
        "fixed_price": None,
        "price_index_code": "HENRY_HUB_GAS_D",
        "created_at": utc("2026-02-04T14:04:00Z"),
        "updated_at": utc("2026-02-05T17:01:00Z"),
    },
    {
        "trade_price_term_id": "88888888-8888-8888-8888-888888888883",
        "trade_id": "TRD-10003",
        "term_no": 1,
        "pricing_type": "HYBRID",
        "fixed_price": Decimal("2.150000"),
        "price_index_code": "USGC_DIESEL_SPOT_D",
        "created_at": utc("2026-02-06T16:03:00Z"),
        "updated_at": utc("2026-02-06T16:03:00Z"),
    },
    {
        "trade_price_term_id": "88888888-8888-8888-8888-888888888884",
        "trade_id": "TRD-10004",
        "term_no": 1,
        "pricing_type": "FIXED",
        "fixed_price": Decimal("2.350000"),
        "price_index_code": None,
        "created_at": utc("2026-02-07T18:02:00Z"),
        "updated_at": utc("2026-02-08T11:05:00Z"),
    },
]


DISLOCATION_BOOK_ROWS = [
    {
        "code": "DEMO_DISTILLATES",
        "name": "Distillates Dislocation",
        "description": "Prompt distillate and gasoline dislocation book for scenario testing.",
    }
]


DISLOCATION_EVENT_ROWS = [
    {
        "event_id": "99999999-1111-1111-1111-111111111111",
        "aggregate_type": "trade",
        "aggregate_id": "TRD-20001",
        "event_type": "TradeCreated",
        "occurred_at": utc("2026-02-11T09:00:00Z"),
        "recorded_at": utc("2026-02-11T09:01:00Z"),
        "actor_id": "system-scenario",
        "correlation_id": "bbbb1111-bbbb-4ccc-8ddd-eeee00000001",
        "causation_id": None,
        "schema_version": 1,
        "payload": {
            "trade_nature": "PHYSICAL",
            "trade_structure": "SINGLE",
            "trade_side": "BUY",
            "book": "DEMO_DISTILLATES",
            "commodity_class": "REFINED_PRODUCTS",
            "commodity": "DIESEL",
            "pricing_type": "HYBRID",
            "price_index_code": "USGC_DIESEL_SPOT_D",
            "price": 2.08,
            "volume": 40000,
        },
    },
    {
        "event_id": "99999999-2222-2222-2222-222222222222",
        "aggregate_type": "trade",
        "aggregate_id": "TRD-20002",
        "event_type": "TradeCreated",
        "occurred_at": utc("2026-02-11T10:00:00Z"),
        "recorded_at": utc("2026-02-11T10:02:00Z"),
        "actor_id": "system-scenario",
        "correlation_id": "bbbb1111-bbbb-4ccc-8ddd-eeee00000002",
        "causation_id": None,
        "schema_version": 1,
        "payload": {
            "trade_nature": "FINANCIAL",
            "trade_structure": "SWAP",
            "book": "DEMO_DISTILLATES",
            "commodity_class": "REFINED_PRODUCTS",
            "commodity": "GASOLINE",
            "pricing_type": "INDEX",
            "price_index_code": "GASOLINE_US_REG_W",
            "price": None,
            "volume": 30000,
        },
    },
]


DISLOCATION_TRADE_ROWS = [
    {
        "trade_id": "TRD-20001",
        "created_at": utc("2026-02-11T09:01:00Z"),
        "updated_at": utc("2026-02-11T09:01:00Z"),
        "trade_nature": "PHYSICAL",
        "trade_structure": "SINGLE",
        "trade_side": "BUY",
        "book": "DEMO_DISTILLATES",
        "commodity_class": "REFINED_PRODUCTS",
        "commodity": "DIESEL",
        "pricing_type": "HYBRID",
        "price_index_code": "USGC_DIESEL_SPOT_D",
        "price": Decimal("2.080000"),
        "volume": Decimal("40000.000000"),
        "status": "ACTIVE",
        "last_event_id": "99999999-1111-1111-1111-111111111111",
    },
    {
        "trade_id": "TRD-20002",
        "created_at": utc("2026-02-11T10:02:00Z"),
        "updated_at": utc("2026-02-11T10:02:00Z"),
        "trade_nature": "FINANCIAL",
        "trade_structure": "SWAP",
        "trade_side": None,
        "book": "DEMO_DISTILLATES",
        "commodity_class": "REFINED_PRODUCTS",
        "commodity": "GASOLINE",
        "pricing_type": "INDEX",
        "price_index_code": "GASOLINE_US_REG_W",
        "price": None,
        "volume": Decimal("30000.000000"),
        "status": "ACTIVE",
        "last_event_id": "99999999-2222-2222-2222-222222222222",
    },
]


DISLOCATION_TRADE_LEG_ROWS = [
    {
        "trade_leg_id": "99999999-7777-7777-7777-777777777771",
        "trade_id": "TRD-20001",
        "leg_no": 1,
        "side": "BUY",
        "commodity_class": "REFINED_PRODUCTS",
        "commodity_code": "DIESEL",
        "quantity": Decimal("40000.000000"),
        "created_at": utc("2026-02-11T09:01:00Z"),
        "updated_at": utc("2026-02-11T09:01:00Z"),
    },
    {
        "trade_leg_id": "99999999-7777-7777-7777-777777777772",
        "trade_id": "TRD-20002",
        "leg_no": 1,
        "side": "BUY",
        "commodity_class": "REFINED_PRODUCTS",
        "commodity_code": "GASOLINE",
        "quantity": Decimal("30000.000000"),
        "created_at": utc("2026-02-11T10:02:00Z"),
        "updated_at": utc("2026-02-11T10:02:00Z"),
    },
    {
        "trade_leg_id": "99999999-7777-7777-7777-777777777773",
        "trade_id": "TRD-20002",
        "leg_no": 2,
        "side": "SELL",
        "commodity_class": "REFINED_PRODUCTS",
        "commodity_code": "DIESEL",
        "quantity": Decimal("30000.000000"),
        "created_at": utc("2026-02-11T10:02:00Z"),
        "updated_at": utc("2026-02-11T10:02:00Z"),
    },
]


DISLOCATION_PRICE_TERM_ROWS = [
    {
        "trade_price_term_id": "99999999-8888-8888-8888-888888888881",
        "trade_id": "TRD-20001",
        "term_no": 1,
        "pricing_type": "HYBRID",
        "fixed_price": Decimal("2.080000"),
        "price_index_code": "USGC_DIESEL_SPOT_D",
        "created_at": utc("2026-02-11T09:01:00Z"),
        "updated_at": utc("2026-02-11T09:01:00Z"),
    },
    {
        "trade_price_term_id": "99999999-8888-8888-8888-888888888882",
        "trade_id": "TRD-20002",
        "term_no": 1,
        "pricing_type": "INDEX",
        "fixed_price": None,
        "price_index_code": "GASOLINE_US_REG_W",
        "created_at": utc("2026-02-11T10:02:00Z"),
        "updated_at": utc("2026-02-11T10:02:00Z"),
    },
]


SCENARIOS = {
    "core_demo": ScenarioDefinition(
        code="core_demo",
        name="Core Demo",
        description="Baseline crude, gas, and products trades used for development and demonstrations.",
        book_rows=CORE_BOOK_ROWS,
        event_rows=CORE_EVENT_ROWS,
        trade_rows=CORE_TRADE_ROWS,
        trade_leg_rows=CORE_TRADE_LEG_ROWS,
        trade_price_term_rows=CORE_PRICE_TERM_ROWS,
    ),
    "gulf_coast_dislocation": ScenarioDefinition(
        code="gulf_coast_dislocation",
        name="Gulf Coast Dislocation",
        description="Prompt distillate and gasoline dislocation scenario with spread-style products exposure.",
        book_rows=DISLOCATION_BOOK_ROWS,
        event_rows=DISLOCATION_EVENT_ROWS,
        trade_rows=DISLOCATION_TRADE_ROWS,
        trade_leg_rows=DISLOCATION_TRADE_LEG_ROWS,
        trade_price_term_rows=DISLOCATION_PRICE_TERM_ROWS,
    ),
}


def list_scenarios() -> list[ScenarioDefinition]:
    return list(SCENARIOS.values())


def get_scenarios(codes: list[str] | None = None) -> list[ScenarioDefinition]:
    if not codes:
        return list_scenarios()
    return [SCENARIOS[code] for code in codes]
