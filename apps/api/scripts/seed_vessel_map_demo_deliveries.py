from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[3]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from apps.api.app.db.engine import SessionLocal
from apps.api.app.db.engine import engine
from apps.api.app.domains.operations.services.shipments import update_delivery_obligation
from apps.api.app.domains.operations.services.vessel_tracking import (
    record_delivery_vessel_tracking_signal,
)
from apps.api.app.domains.operations.services.vessel_tracking import update_delivery_vessel_detail
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.delivery_rail_detail import DeliveryRailDetail
from apps.api.app.models.delivery_tracking_signal import DeliveryTrackingSignal
from apps.api.app.models.delivery_truck_detail import DeliveryTruckDetail
from apps.api.app.models.delivery_truck_movement import DeliveryTruckMovement
from apps.api.app.models.delivery_truck_stop import DeliveryTruckStop
from apps.api.app.models.delivery_vessel_detail import DeliveryVesselDetail
from apps.api.app.models.event import Event
from apps.api.app.models.mutation_provenance import MutationProvenanceRecord
from apps.api.app.models.trade import Trade
from apps.api.app.schemas.shipment import DeliveryTrackingSignalWrite


@dataclass(frozen=True)
class DemoVesselDelivery:
    trade_id: str
    external_trade_id: str
    counterparty: str
    location_code: str
    delivery_start: date
    delivery_end: date
    volume: Decimal
    price: Decimal
    vessel_name: str
    imo_number: str
    mmsi_number: str
    call_sign: str
    voyage_number: str
    latitude: float
    longitude: float
    speed_knots: float
    course_degrees: float
    heading_degrees: float
    destination: str
    eta_at_destination: datetime


DEMO_DELIVERIES = (
    DemoVesselDelivery(
        trade_id="T-MAP-VESSEL-HOUSTON",
        external_trade_id="EXT-MAP-VESSEL-HOUSTON",
        counterparty="GULF_EXPORTS",
        location_code="USGC",
        delivery_start=date(2026, 5, 20),
        delivery_end=date(2026, 5, 21),
        volume=Decimal("550000"),
        price=Decimal("82.15"),
        vessel_name="MT Bayou Runner",
        imo_number="9401234",
        mmsi_number="366111222",
        call_sign="WBR1",
        voyage_number="BR-0520",
        latitude=29.332,
        longitude=-94.748,
        speed_knots=11.8,
        course_degrees=300.0,
        heading_degrees=301.0,
        destination="HOUSTON_SHIP_CHANNEL",
        eta_at_destination=datetime(2026, 5, 20, 23, 0, tzinfo=timezone.utc),
    ),
    DemoVesselDelivery(
        trade_id="T-MAP-VESSEL-CORPUS",
        external_trade_id="EXT-MAP-VESSEL-CORPUS",
        counterparty="COASTAL_REFINING",
        location_code="CORPUS",
        delivery_start=date(2026, 5, 21),
        delivery_end=date(2026, 5, 22),
        volume=Decimal("420000"),
        price=Decimal("81.72"),
        vessel_name="MT Nueces Star",
        imo_number="9502345",
        mmsi_number="366222333",
        call_sign="WNS2",
        voyage_number="NS-0521",
        latitude=27.807,
        longitude=-97.05,
        speed_knots=7.2,
        course_degrees=292.0,
        heading_degrees=292.0,
        destination="CORPUS_CHRISTI",
        eta_at_destination=datetime(2026, 5, 21, 5, 30, tzinfo=timezone.utc),
    ),
    DemoVesselDelivery(
        trade_id="T-MAP-VESSEL-NOLA",
        external_trade_id="EXT-MAP-VESSEL-NOLA",
        counterparty="DELTA_TRADING",
        location_code="LOOP",
        delivery_start=date(2026, 5, 20),
        delivery_end=date(2026, 5, 20),
        volume=Decimal("610000"),
        price=Decimal("82.48"),
        vessel_name="MV Delta Light",
        imo_number="9603456",
        mmsi_number="366333444",
        call_sign="WDL3",
        voyage_number="DL-0520",
        latitude=29.135,
        longitude=-89.25,
        speed_knots=13.1,
        course_degrees=70.0,
        heading_degrees=70.0,
        destination="LOOP",
        eta_at_destination=datetime(2026, 5, 20, 19, 45, tzinfo=timezone.utc),
    ),
)


TRACKING_SUPPORT_TABLES = (
    Event.__table__,
    MutationProvenanceRecord.__table__,
    DeliveryRailDetail.__table__,
    DeliveryTruckDetail.__table__,
    DeliveryTruckMovement.__table__,
    DeliveryTruckStop.__table__,
    DeliveryTrackingSignal.__table__,
    DeliveryVesselDetail.__table__,
)


def _delivery_id_for_trade(trade_id: str) -> str:
    return f"DLV-{trade_id}"


def ensure_tracking_support_tables() -> None:
    # Local demo databases can be ahead of some migrations and behind others.
    # This mirrors the declared models without changing Alembic revision state.
    Event.metadata.create_all(bind=engine, tables=TRACKING_SUPPORT_TABLES, checkfirst=True)
    if engine.dialect.name == "postgresql":
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE events ALTER COLUMN causation_id TYPE VARCHAR(255)"))


def upsert_demo_trades(*, requested_by: str, reference_time: datetime) -> None:
    with SessionLocal() as session:
        for demo in DEMO_DELIVERIES:
            trade = session.get(Trade, demo.trade_id)
            snapshot = {
                "external_trade_id": demo.external_trade_id,
                "source_system": "DEMO",
                "updated_at": reference_time,
                "execution_timestamp": reference_time,
                "trade_date": reference_time.date(),
                "effective_start_date": demo.delivery_start,
                "effective_end_date": demo.delivery_end,
                "quality_spec": "EXPORT_GRADE",
                "unit_of_measure": "BBL",
                "trade_currency_code": "USD",
                "location_code": demo.location_code,
                "delivery_start": demo.delivery_start,
                "delivery_end": demo.delivery_end,
                "price_unit_code": "BBL",
                "instrument_type": "LINEAR",
                "option_type": None,
                "option_style": None,
                "option_strike_price": None,
                "option_expiration_date": None,
                "trade_nature": "PHYSICAL",
                "trade_structure": "SINGLE",
                "trade_side": "SELL",
                "book": "CRUDE_PHYS",
                "portfolio": "MARINE_EXPORTS",
                "counterparty": demo.counterparty,
                "commodity_class": "CRUDE_OIL",
                "commodity": "WTI",
                "pricing_type": "FIXED",
                "pricing_status": "PRICED",
                "confirmation_status": "CONFIRMED",
                "nomination_status": "NOT_REQUIRED",
                "allocation_status": "NOT_REQUIRED",
                "actualization_status": "PENDING",
                "price_index_code": None,
                "price": demo.price,
                "volume": demo.volume,
                "invoice_status": "PENDING",
                "payment_status": "PENDING",
                "settlement_status": "PENDING",
                "trader_user": requested_by,
                "status": "ACTIVE",
                "last_event_id": f"evt-{demo.trade_id.lower()}",
            }
            if trade is None:
                session.add(
                    Trade(
                        trade_id=demo.trade_id,
                        originating_option_trade_id=None,
                        created_at=reference_time,
                        **snapshot,
                    )
                )
            else:
                for key, value in snapshot.items():
                    setattr(trade, key, value)
                if trade.created_at is None:
                    trade.created_at = reference_time

        session.flush()

        for demo in DEMO_DELIVERIES:
            delivery_id = _delivery_id_for_trade(demo.trade_id)
            delivery = session.get(DeliveryObligation, delivery_id)
            base_snapshot = {
                "trade_id": demo.trade_id,
                "trade_leg_id": None,
                "leg_no": None,
                "external_trade_id": demo.external_trade_id,
                "direction": "OUTBOUND",
                "book": "CRUDE_PHYS",
                "book_source": "TRADE_DERIVED",
                "portfolio": "MARINE_EXPORTS",
                "portfolio_source": "TRADE_DERIVED",
                "counterparty": demo.counterparty,
                "counterparty_source": "TRADE_DERIVED",
                "commodity_class": "CRUDE_OIL",
                "commodity": "WTI",
                "volume": demo.volume,
                "unit_of_measure": "BBL",
                "trade_currency_code": "USD",
                "price_unit_code": "BBL",
                "location_code": demo.location_code,
                "location_source": "TRADE_DERIVED",
                "delivery_start": demo.delivery_start,
                "delivery_end": demo.delivery_end,
                "delivery_window_source": "TRADE_DERIVED",
                "execution_status": "PLANNED",
                "execution_status_source": "SYSTEM_GENERATED",
                "operations_owner": requested_by,
                "operations_owner_source": "MANUAL",
                "external_reference": "VESSEL-MAP-DEMO",
                "external_reference_source": "SYSTEM_GENERATED",
                "ops_notes": "Demo vessel delivery seeded for the Asset Map.",
                "ops_notes_source": "SYSTEM_GENERATED",
                "booked_at": reference_time,
                "source_trade_updated_at": reference_time,
                "updated_at": reference_time,
                "updated_by": requested_by,
            }
            if delivery is None:
                session.add(
                    DeliveryObligation(
                        delivery_id=delivery_id,
                        mode_family="LOGISTICS",
                        transport_mode="UNSPECIFIED",
                        transport_mode_source="UNSPECIFIED",
                        delivery_profile="LOAD_DISCHARGE_WINDOW",
                        created_at=reference_time,
                        created_by=requested_by,
                        version=1,
                        **base_snapshot,
                    )
                )
            else:
                for key, value in base_snapshot.items():
                    setattr(delivery, key, value)
                if delivery.transport_mode_source != "EXPLICIT":
                    delivery.mode_family = "LOGISTICS"
                    delivery.transport_mode = "UNSPECIFIED"
                    delivery.transport_mode_source = "UNSPECIFIED"
                    delivery.delivery_profile = "LOAD_DISCHARGE_WINDOW"
                delivery.version += 1
        session.commit()


def seed_vessel_positions(*, requested_by: str, reference_time: datetime) -> list[str]:
    seeded_delivery_ids: list[str] = []
    with SessionLocal() as session:
        for demo in DEMO_DELIVERIES:
            delivery_id = _delivery_id_for_trade(demo.trade_id)
            delivery = session.execute(
                select(DeliveryObligation).where(DeliveryObligation.delivery_id == delivery_id)
            ).scalar_one()
            if delivery.transport_mode != "VESSEL":
                update_delivery_obligation(
                    session,
                    delivery_id=delivery_id,
                    actor_id=requested_by,
                    changes={"transport_mode": "VESSEL"},
                    now=reference_time,
                )

            update_delivery_vessel_detail(
                session,
                delivery_id=delivery_id,
                actor_id=requested_by,
                changes={
                    "vessel_name": demo.vessel_name,
                    "imo_number": demo.imo_number,
                    "mmsi_number": demo.mmsi_number,
                    "call_sign": demo.call_sign,
                    "voyage_number": demo.voyage_number,
                    "tracking_provider": "AISSTREAM_DEMO",
                    "tracking_policy": "Demo vessel map position",
                },
                now=reference_time,
            )
            record_delivery_vessel_tracking_signal(
                session,
                delivery_id=delivery_id,
                actor_id=requested_by,
                payload=DeliveryTrackingSignalWrite(
                    source_system="AISSTREAM_DEMO",
                    source_event_id=f"{demo.mmsi_number}-{reference_time.date().isoformat()}",
                    signal_type="POSITION",
                    occurred_at=reference_time,
                    received_at=reference_time,
                    latitude=demo.latitude,
                    longitude=demo.longitude,
                    speed_knots=demo.speed_knots,
                    course_degrees=demo.course_degrees,
                    heading_degrees=demo.heading_degrees,
                    draught_meters=12.4,
                    destination=demo.destination,
                    eta_at_destination=demo.eta_at_destination,
                    external_status="Under way using engine",
                    normalized_status="UNDER_WAY",
                    match_confidence=0.98,
                    raw_payload={
                        "provider": "AISSTREAM_DEMO",
                        "purpose": "map-demo",
                        "mmsi": demo.mmsi_number,
                    },
                ),
                now=reference_time,
            )
            seeded_delivery_ids.append(delivery_id)
        session.commit()
    return seeded_delivery_ids


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed vessel-mode deliveries with map-ready demo positions.")
    parser.add_argument("--requested-by", default="codex")
    parser.add_argument("--skip-schema-check", action="store_true")
    args = parser.parse_args()

    reference_time = datetime.now(timezone.utc).replace(microsecond=0)
    if not args.skip_schema_check:
        ensure_tracking_support_tables()
    upsert_demo_trades(requested_by=args.requested_by, reference_time=reference_time)
    delivery_ids = seed_vessel_positions(requested_by=args.requested_by, reference_time=reference_time)

    print(f"seeded_vessel_map_deliveries={len(delivery_ids)}")
    for delivery_id in delivery_ids:
        print(delivery_id)


if __name__ == "__main__":
    main()
