from __future__ import annotations

import enum
import unittest
from datetime import datetime, timezone

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.home_views.services.definitions import normalize_home_view_cards
from apps.api.app.domains.home_views.services.recipes import (
    HOME_VIEW_RECIPE_REGISTRY_BY_KEY,
    resolve_home_view_recipe,
)
from apps.api.app.models import Base
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_price_index import ReferencePriceIndex


class HomeViewRecipeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=cls.engine)

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        with self.SessionLocal() as session:
            session.query(ReferencePriceIndex).delete()
            session.query(ReferenceLocation).delete()
            session.query(ReferenceCommodity).delete()
            session.commit()

    def test_recipe_registry_declares_common_home_view_intents(self) -> None:
        self.assertEqual(
            set(HOME_VIEW_RECIPE_REGISTRY_BY_KEY),
            {
                "commodity_market_watch",
                "hub_basis_watch",
                "imminent_shipments",
                "settlement_exception_watch",
                "document_review_queue",
            },
        )

    def test_hh_ng_recipe_prefers_henry_hub_and_related_gas_indices(self) -> None:
        self._seed_natural_gas_reference_data(include_related_index=True)

        with self.SessionLocal() as session:
            resolution = resolve_home_view_recipe(
                db=session,
                message="Make me a view to see HH NG.",
                context_fields={},
                persona="trader",
            )
            self.assertIsNone(resolution.warning)
            self.assertIsNotNone(resolution.output)
            assert resolution.output is not None
            recipe = resolution.output
            normalized_cards = normalize_home_view_cards(list(recipe.cards), db=session)

        self.assertEqual(recipe.recipe_key, "hub_basis_watch")
        self.assertEqual(recipe.fallback_name, "HH NG Watch")
        self.assertEqual(recipe.persona_hint, "trader")
        self.assertEqual(recipe.global_filters, {"commodity_code": "NATGAS"})
        self.assertIn("price_index_code", recipe.resolved_inputs)
        cards_by_id = {card.card_id: card for card in normalized_cards}
        self.assertEqual(
            cards_by_id["prices"].filters["price_index_code"],
            ["HH_NATGAS", "WAHA_NATGAS"],
        )
        self.assertEqual(cards_by_id["map"].filters["location_code"], "HENRY_HUB")
        self.assertEqual(
            [card.card_id for card in normalized_cards if card.visible][:3],
            ["prices", "map", "prompt"],
        )
        self.assertIn(
            "Included related active natural-gas price indices for basis context.",
            recipe.assumptions,
        )

    def test_market_recipe_persona_changes_card_emphasis_without_widening_filters(self) -> None:
        self._seed_natural_gas_reference_data()

        with self.SessionLocal() as session:
            trader = resolve_home_view_recipe(
                db=session,
                message="Make me a view to see HH NG.",
                context_fields={},
                persona="trader",
            ).output
            risk = resolve_home_view_recipe(
                db=session,
                message="Make me a view to see HH NG.",
                context_fields={},
                persona="risk",
            ).output
            assert trader is not None
            assert risk is not None
            trader_cards = normalize_home_view_cards(list(trader.cards), db=session)
            risk_cards = normalize_home_view_cards(list(risk.cards), db=session)

        self.assertEqual(trader.global_filters, risk.global_filters)
        self.assertEqual(trader.persona_hint, "trader")
        self.assertEqual(risk.persona_hint, "risk")
        self.assertEqual(
            [card.card_id for card in trader_cards if card.visible][:3],
            ["prices", "map", "prompt"],
        )
        self.assertEqual(
            [card.card_id for card in risk_cards if card.visible][:2],
            ["map", "prices"],
        )
        self.assertTrue(any("No dedicated exposure" in item for item in risk.missing_evidence))

    def test_ambiguous_recipe_request_stops_without_guessing(self) -> None:
        with self.SessionLocal() as session:
            resolution = resolve_home_view_recipe(
                db=session,
                message="Make me a view.",
                context_fields={},
                persona="trader",
            )

        self.assertIsNone(resolution.output)
        self.assertIsNotNone(resolution.warning)
        assert resolution.warning is not None
        self.assertIn("couldn't resolve a supported Home view signal", resolution.warning)

    def _seed_natural_gas_reference_data(self, *, include_related_index: bool = False) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                ReferenceCommodity(
                    code="NATGAS",
                    commodity_class="GAS",
                    allowed_transport_modes=["PIPELINE"],
                    name="Natural Gas",
                    description=None,
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=now,
                    created_by="test-suite",
                    updated_at=now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.add(
                ReferenceLocation(
                    code="HENRY_HUB",
                    parent_location_code=None,
                    name="Henry Hub",
                    location_kind="POINT",
                    location_type="HUB",
                    market="US",
                    city=None,
                    subdivision_code="US-LA",
                    country_code="US",
                    continent_code="NA",
                    latitude=None,
                    longitude=None,
                    region="North America",
                    timezone="America/Chicago",
                    description=None,
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=now,
                    created_by="test-suite",
                    updated_at=now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            indices = [
                ReferencePriceIndex(
                    code="HH_NATGAS",
                    name="Henry Hub Natural Gas",
                    commodity_code="NATGAS",
                    currency_code="USD",
                    unit_code="MMBTU",
                    provider="EIA",
                    quote_type="SPOT",
                    market="US",
                    location_code="HENRY_HUB",
                    calendar_code=None,
                    description=None,
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=now,
                    created_by="test-suite",
                    updated_at=now,
                    updated_by="test-suite",
                    version=1,
                )
            ]
            if include_related_index:
                indices.append(
                    ReferencePriceIndex(
                        code="WAHA_NATGAS",
                        name="Waha Natural Gas",
                        commodity_code="NATGAS",
                        currency_code="USD",
                        unit_code="MMBTU",
                        provider="ICE",
                        quote_type="SPOT",
                        market="US",
                        location_code=None,
                        calendar_code=None,
                        description=None,
                        is_active=True,
                        effective_from=None,
                        effective_to=None,
                        created_at=now,
                        created_by="test-suite",
                        updated_at=now,
                        updated_by="test-suite",
                        version=1,
                    )
                )
            session.add_all(indices)
            session.commit()
