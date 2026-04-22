"""seed broad demo transactions into populated environments

Revision ID: c1d2e3f4a5b6
Revises: b7e1c2d3f4a5
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
import json

from alembic import op
import sqlalchemy as sa

revision = "c1d2e3f4a5b6"
down_revision = "b7e1c2d3f4a5"
branch_labels = None
depends_on = None


def utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


BOOK_ROWS = [
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


EVENT_ROWS = [
    {
        "event_id": "11111111-1111-1111-1111-111111111111",
        "aggregate_type": "trade",
        "aggregate_id": "TRD-10001",
        "event_type": "TradeCreated",
        "occurred_at": utc("2026-02-03T15:00:00Z"),
        "recorded_at": utc("2026-02-03T15:02:00Z"),
        "actor_id": "system-demo",
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
        "actor_id": "system-demo",
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
        "actor_id": "system-demo",
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
        "actor_id": "system-demo",
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
            "legs": [
                {
                    "leg_no": 1,
                    "side": "BUY",
                    "commodity_class": "REFINED_PRODUCTS",
                    "commodity": "DIESEL",
                    "volume": 25000,
                },
                {
                    "leg_no": 2,
                    "side": "SELL",
                    "commodity_class": "REFINED_PRODUCTS",
                    "commodity": "GASOLINE",
                    "volume": 25000,
                },
            ],
        },
    },
    {
        "event_id": "55555555-5555-5555-5555-555555555555",
        "aggregate_type": "trade",
        "aggregate_id": "TRD-10004",
        "event_type": "TradeCreated",
        "occurred_at": utc("2026-02-07T18:00:00Z"),
        "recorded_at": utc("2026-02-07T18:02:00Z"),
        "actor_id": "system-demo",
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
        "actor_id": "system-demo",
        "correlation_id": "aaaa1111-bbbb-4ccc-8ddd-eeee00000006",
        "causation_id": "55555555-5555-5555-5555-555555555555",
        "schema_version": 1,
        "payload": {},
    },
]


TRADE_ROWS = [
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


TRADE_LEG_ROWS = [
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


TRADE_PRICE_TERM_ROWS = [
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


POSITION_DELTAS = {
    "TRD-10001": [("WTI", Decimal("100000.000000"), utc("2026-02-03T15:02:00Z"))],
    "TRD-10002": [("NATURAL_GAS", Decimal("420000.000000"), utc("2026-02-05T17:01:00Z"))],
    "TRD-10003": [("DIESEL", Decimal("25000.000000"), utc("2026-02-06T16:03:00Z"))],
    "TRD-10004": [],
}


def upgrade() -> None:
    bind = op.get_bind()
    now = utc("2026-02-01T00:00:00Z")

    for row in BOOK_ROWS:
        bind.execute(
            sa.text(
                """
                INSERT INTO reference_books (
                    code,
                    name,
                    description,
                    is_active,
                    effective_from,
                    effective_to,
                    created_at,
                    created_by,
                    updated_at,
                    updated_by,
                    version
                )
                VALUES (
                    :code,
                    :name,
                    :description,
                    TRUE,
                    NULL,
                    NULL,
                    :created_at,
                    'system-demo',
                    :updated_at,
                    'system-demo',
                    1
                )
                ON CONFLICT (code) DO NOTHING
                """
            ),
            {
                "code": row["code"],
                "name": row["name"],
                "description": row["description"],
                "created_at": now,
                "updated_at": now,
            },
        )

    existing_trade_ids = {
        row[0]
        for row in bind.execute(
            sa.text("SELECT trade_id FROM trades WHERE trade_id = ANY(:trade_ids)"),
            {"trade_ids": [row["trade_id"] for row in TRADE_ROWS]},
        ).all()
    }

    for row in EVENT_ROWS:
        bind.execute(
            sa.text(
                """
                INSERT INTO events (
                    event_id,
                    aggregate_type,
                    aggregate_id,
                    event_type,
                    occurred_at,
                    recorded_at,
                    actor_id,
                    correlation_id,
                    causation_id,
                    schema_version,
                    payload
                )
                VALUES (
                    :event_id,
                    :aggregate_type,
                    :aggregate_id,
                    :event_type,
                    :occurred_at,
                    :recorded_at,
                    :actor_id,
                    :correlation_id,
                    :causation_id,
                    :schema_version,
                    CAST(:payload AS JSON)
                )
                ON CONFLICT (event_id) DO NOTHING
                """
            ),
            {**row, "payload": json.dumps(row["payload"])},
        )

    inserted_trade_ids: list[str] = []
    for row in TRADE_ROWS:
        if row["trade_id"] in existing_trade_ids:
            continue
        bind.execute(
            sa.text(
                """
                INSERT INTO trades (
                    trade_id,
                    created_at,
                    updated_at,
                    trade_nature,
                    trade_structure,
                    trade_side,
                    book,
                    commodity_class,
                    commodity,
                    pricing_type,
                    price_index_code,
                    price,
                    volume,
                    status,
                    last_event_id
                )
                VALUES (
                    :trade_id,
                    :created_at,
                    :updated_at,
                    :trade_nature,
                    :trade_structure,
                    :trade_side,
                    :book,
                    :commodity_class,
                    :commodity,
                    :pricing_type,
                    :price_index_code,
                    :price,
                    :volume,
                    :status,
                    :last_event_id
                )
                """
            ),
            row,
        )
        inserted_trade_ids.append(row["trade_id"])

    for row in TRADE_LEG_ROWS:
        if row["trade_id"] not in inserted_trade_ids:
            continue
        bind.execute(
            sa.text(
                """
                INSERT INTO trade_legs (
                    trade_leg_id,
                    trade_id,
                    leg_no,
                    side,
                    commodity_class,
                    commodity_code,
                    quantity,
                    created_at,
                    updated_at
                )
                VALUES (
                    :trade_leg_id,
                    :trade_id,
                    :leg_no,
                    :side,
                    :commodity_class,
                    :commodity_code,
                    :quantity,
                    :created_at,
                    :updated_at
                )
                ON CONFLICT (trade_leg_id) DO NOTHING
                """
            ),
            row,
        )

    for row in TRADE_PRICE_TERM_ROWS:
        if row["trade_id"] not in inserted_trade_ids:
            continue
        bind.execute(
            sa.text(
                """
                INSERT INTO trade_price_terms (
                    trade_price_term_id,
                    trade_id,
                    term_no,
                    pricing_type,
                    fixed_price,
                    price_index_code,
                    created_at,
                    updated_at
                )
                VALUES (
                    :trade_price_term_id,
                    :trade_id,
                    :term_no,
                    :pricing_type,
                    :fixed_price,
                    :price_index_code,
                    :created_at,
                    :updated_at
                )
                ON CONFLICT (trade_price_term_id) DO NOTHING
                """
            ),
            row,
        )

    for trade_id in inserted_trade_ids:
        for commodity, delta, updated_at in POSITION_DELTAS[trade_id]:
            bind.execute(
                sa.text(
                    """
                    INSERT INTO positions (commodity, net_volume, updated_at)
                    VALUES (:commodity, :net_volume, :updated_at)
                    ON CONFLICT (commodity) DO UPDATE
                    SET net_volume = positions.net_volume + EXCLUDED.net_volume,
                        updated_at = GREATEST(positions.updated_at, EXCLUDED.updated_at)
                    """
                ),
                {
                    "commodity": commodity,
                    "net_volume": delta,
                    "updated_at": updated_at,
                },
            )


def downgrade() -> None:
    bind = op.get_bind()

    existing_trade_ids = {
        row[0]
        for row in bind.execute(
            sa.text("SELECT trade_id FROM trades WHERE trade_id = ANY(:trade_ids)"),
            {"trade_ids": [row["trade_id"] for row in TRADE_ROWS]},
        ).all()
    }

    for trade_id in existing_trade_ids:
        for commodity, delta, updated_at in POSITION_DELTAS[trade_id]:
            bind.execute(
                sa.text(
                    """
                    UPDATE positions
                    SET net_volume = net_volume - :net_volume,
                        updated_at = LEAST(updated_at, :updated_at)
                    WHERE commodity = :commodity
                    """
                ),
                {
                    "commodity": commodity,
                    "net_volume": delta,
                    "updated_at": updated_at,
                },
            )
            bind.execute(
                sa.text(
                    """
                    DELETE FROM positions
                    WHERE commodity = :commodity
                      AND net_volume = 0
                    """
                ),
                {"commodity": commodity},
            )

    bind.execute(
        sa.text("DELETE FROM trade_price_terms WHERE trade_id = ANY(:trade_ids)"),
        {"trade_ids": [row["trade_id"] for row in TRADE_ROWS]},
    )
    bind.execute(
        sa.text("DELETE FROM trade_legs WHERE trade_id = ANY(:trade_ids)"),
        {"trade_ids": [row["trade_id"] for row in TRADE_ROWS]},
    )
    bind.execute(
        sa.text("DELETE FROM trades WHERE trade_id = ANY(:trade_ids)"),
        {"trade_ids": [row["trade_id"] for row in TRADE_ROWS]},
    )
    bind.execute(
        sa.text("DELETE FROM events WHERE event_id = ANY(:event_ids)"),
        {"event_ids": [row["event_id"] for row in EVENT_ROWS]},
    )
    bind.execute(
        sa.text(
            """
            DELETE FROM reference_books
            WHERE created_by = 'system-demo'
              AND code = ANY(:book_codes)
            """
        ),
        {"book_codes": [row["code"] for row in BOOK_ROWS]},
    )
