"""seed demo books and transactions

Revision ID: 6f3a2b1c9d4e
Revises: e2b7c4d9f1a6
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from alembic import op
import sqlalchemy as sa

revision = "6f3a2b1c9d4e"
down_revision = "e2b7c4d9f1a6"
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


POSITION_ROWS = [
    {
        "commodity": "WTI",
        "net_volume": Decimal("100000.000000"),
        "updated_at": utc("2026-02-03T15:02:00Z"),
    },
    {
        "commodity": "NATURAL_GAS",
        "net_volume": Decimal("420000.000000"),
        "updated_at": utc("2026-02-05T17:01:00Z"),
    },
    {
        "commodity": "DIESEL",
        "net_volume": Decimal("25000.000000"),
        "updated_at": utc("2026-02-06T16:03:00Z"),
    },
]


def upgrade() -> None:
    bind = op.get_bind()
    existing_trade_count = bind.execute(sa.text("SELECT COUNT(*) FROM trades")).scalar_one()
    if existing_trade_count:
        return

    now = utc("2026-02-01T00:00:00Z")

    reference_books = sa.table(
        "reference_books",
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("description", sa.Text()),
        sa.column("is_active", sa.Boolean()),
        sa.column("effective_from", sa.DateTime(timezone=True)),
        sa.column("effective_to", sa.DateTime(timezone=True)),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("created_by", sa.String()),
        sa.column("updated_at", sa.DateTime(timezone=True)),
        sa.column("updated_by", sa.String()),
        sa.column("version", sa.Integer()),
    )
    op.bulk_insert(
        reference_books,
        [
            {
                "code": row["code"],
                "name": row["name"],
                "description": row["description"],
                "is_active": True,
                "effective_from": None,
                "effective_to": None,
                "created_at": now,
                "created_by": "system-demo",
                "updated_at": now,
                "updated_by": "system-demo",
                "version": 1,
            }
            for row in BOOK_ROWS
        ],
    )

    events = sa.table(
        "events",
        sa.column("event_id", sa.String()),
        sa.column("aggregate_type", sa.String()),
        sa.column("aggregate_id", sa.String()),
        sa.column("event_type", sa.String()),
        sa.column("occurred_at", sa.DateTime(timezone=True)),
        sa.column("recorded_at", sa.DateTime(timezone=True)),
        sa.column("actor_id", sa.String()),
        sa.column("correlation_id", sa.String()),
        sa.column("causation_id", sa.String()),
        sa.column("schema_version", sa.Integer()),
        sa.column("payload", sa.JSON()),
    )
    op.bulk_insert(events, EVENT_ROWS)

    trades = sa.table(
        "trades",
        sa.column("trade_id", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
        sa.column("trade_nature", sa.String()),
        sa.column("trade_structure", sa.String()),
        sa.column("trade_side", sa.String()),
        sa.column("book", sa.String()),
        sa.column("commodity_class", sa.String()),
        sa.column("commodity", sa.String()),
        sa.column("pricing_type", sa.String()),
        sa.column("price_index_code", sa.String()),
        sa.column("price", sa.Numeric(18, 6)),
        sa.column("volume", sa.Numeric(18, 6)),
        sa.column("status", sa.String()),
        sa.column("last_event_id", sa.String()),
    )
    op.bulk_insert(trades, TRADE_ROWS)

    trade_legs = sa.table(
        "trade_legs",
        sa.column("trade_leg_id", sa.String()),
        sa.column("trade_id", sa.String()),
        sa.column("leg_no", sa.Integer()),
        sa.column("side", sa.String()),
        sa.column("commodity_class", sa.String()),
        sa.column("commodity_code", sa.String()),
        sa.column("quantity", sa.Numeric(18, 6)),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    op.bulk_insert(trade_legs, TRADE_LEG_ROWS)

    trade_price_terms = sa.table(
        "trade_price_terms",
        sa.column("trade_price_term_id", sa.String()),
        sa.column("trade_id", sa.String()),
        sa.column("term_no", sa.Integer()),
        sa.column("pricing_type", sa.String()),
        sa.column("fixed_price", sa.Numeric(18, 6)),
        sa.column("price_index_code", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    op.bulk_insert(trade_price_terms, TRADE_PRICE_TERM_ROWS)

    positions = sa.table(
        "positions",
        sa.column("commodity", sa.String()),
        sa.column("net_volume", sa.Numeric(18, 6)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    op.bulk_insert(positions, POSITION_ROWS)


def downgrade() -> None:
    event_ids = ", ".join(f"'{row['event_id']}'" for row in EVENT_ROWS)
    trade_ids = ", ".join(f"'{row['trade_id']}'" for row in TRADE_ROWS)
    trade_leg_ids = ", ".join(f"'{row['trade_leg_id']}'" for row in TRADE_LEG_ROWS)
    trade_price_term_ids = ", ".join(f"'{row['trade_price_term_id']}'" for row in TRADE_PRICE_TERM_ROWS)
    commodities = ", ".join(f"'{row['commodity']}'" for row in POSITION_ROWS)
    book_codes = ", ".join(f"'{row['code']}'" for row in BOOK_ROWS)

    op.execute(f"DELETE FROM positions WHERE commodity IN ({commodities})")
    op.execute(f"DELETE FROM trade_price_terms WHERE trade_price_term_id IN ({trade_price_term_ids})")
    op.execute(f"DELETE FROM trade_legs WHERE trade_leg_id IN ({trade_leg_ids})")
    op.execute(f"DELETE FROM trades WHERE trade_id IN ({trade_ids})")
    op.execute(f"DELETE FROM events WHERE event_id IN ({event_ids})")
    op.execute(
        f"""
        DELETE FROM reference_books
        WHERE created_by = 'system-demo'
          AND code IN ({book_codes})
        """
    )
