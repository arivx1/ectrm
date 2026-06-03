from __future__ import annotations

import unittest
from datetime import date, datetime, timezone

from apps.api.app.domains.reports.services.pretrade_recommendations import (
    build_pretrade_recommendation_result,
)
from apps.api.app.schemas.pretrade import (
    PreTradeRecommendationSourceSnapshot,
    PreTradeRecommendationSourceProvenance,
    PreTradeScenarioDraft,
)


class PreTradeRecommendationTriageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = datetime(2026, 5, 29, 16, 0, tzinfo=timezone.utc)

    def _draft(
        self,
        *,
        trade_side: str = "BUY",
        target_volume: float = 10000,
        pricing_type: str = "FLOATING",
        price_index_code: str | None = "NG_HH_PROMPT",
    ) -> PreTradeScenarioDraft:
        return PreTradeScenarioDraft(
            book="GAS_PHYS",
            portfolio="PROMPT",
            counterparty="SHELL_TRADING",
            commodity_class="NATURAL_GAS",
            commodity="HENRY_HUB",
            trade_side=trade_side,  # type: ignore[arg-type]
            pricing_type=pricing_type,
            price_index_code=price_index_code,
            target_price=2.84,
            target_volume=target_volume,
            trade_currency_code="USD",
            unit_of_measure="MMBTU",
            price_unit_code="USD_MMBTU",
            location_code="HENRY_HUB",
            delivery_start=date(2026, 6, 1),
            delivery_end=date(2026, 6, 30),
        )

    def _snapshot(
        self,
        *,
        source_key: str,
        source_type: str,
        summary: str,
        payload: dict[str, object],
        freshness: str = "FRESH",
    ) -> PreTradeRecommendationSourceSnapshot:
        return PreTradeRecommendationSourceSnapshot(
            source_key=source_key,
            source_type=source_type,  # type: ignore[arg-type]
            source_available=True,
            freshness=freshness,  # type: ignore[arg-type]
            summary=summary,
            captured_at=self.now,
            provenance=PreTradeRecommendationSourceProvenance(
                provider="test",
                dataset=source_key,
                record_id=source_key,
                observed_at=self.now,
                ingested_at=self.now,
                captured_by="test",
            ),
            payload=payload,
        )

    def _base_snapshots(
        self,
        *,
        current_net_position: float = 0,
        latest_mark_payload: dict[str, object] | None = None,
        latest_mark_freshness: str = "FRESH",
        desk_context_payload: dict[str, object] | None = None,
        counterparty_credit_payload: dict[str, object] | None = None,
        option_exposure_payload: dict[str, object] | None = None,
        option_exposure_freshness: str = "FRESH",
        breach_action: str = "WARN",
    ) -> list[PreTradeRecommendationSourceSnapshot]:
        snapshots = [
            self._snapshot(
                source_key="desk-context",
                source_type="INTERNAL",
                summary="Desk exposure context loaded.",
                payload={
                    "related_active_trade_count": 2,
                    "current_net_position": current_net_position,
                    "current_counterparty_exposure": 25000,
                    "position_book": "GAS_PHYS",
                    "position_commodity_class": "NATURAL_GAS",
                    "position_commodity": "HENRY_HUB",
                    "position_unit": "MMBTU",
                    "position_location_code": "HENRY_HUB",
                    "position_delivery_start": "2026-06-01",
                    "position_delivery_end": "2026-06-30",
                    "position_price_index_code": "NG_HH_PROMPT",
                    "position_pricing_type": "FLOATING",
                    **(desk_context_payload or {}),
                },
            ),
            self._snapshot(
                source_key="counterparty-credit",
                source_type="INTERNAL",
                summary="Counterparty credit profile loaded.",
                payload={
                    "has_credit_profile": True,
                    "credit_limit_amount": 500000,
                    "breach_action": breach_action,
                    "credit_rating": "A",
                    **(counterparty_credit_payload or {}),
                },
            ),
            self._snapshot(
                source_key="latest-mark",
                source_type="EXTERNAL",
                summary="Latest mark and optional arbitrage context loaded.",
                freshness=latest_mark_freshness,
                payload={
                    "latest_mark": 2.83,
                    "price_index_code": "NG_HH_PROMPT",
                    "observation_date": self.now.date().isoformat(),
                    **(latest_mark_payload or {}),
                },
            ),
        ]
        if option_exposure_payload is not None:
            snapshots.append(
                self._snapshot(
                    source_key="option-exposure",
                    source_type="DERIVED",
                    summary="Option exposure loaded.",
                    freshness=option_exposure_freshness,
                    payload={
                        "has_option_exposure": True,
                        "option_delta": 2500,
                        "option_gamma": 0.05,
                        "option_vega": 0.2,
                        "volatility_freshness": "FRESH",
                        **option_exposure_payload,
                    },
                )
            )
        return snapshots

    def test_geographic_arbitrage_uses_buy_ask_sell_bid_and_transport_cost(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(),
            input_snapshots=self._base_snapshots(
                latest_mark_payload={
                    "arbitrage_candidate": {
                        "family": "GEOGRAPHIC",
                        "buy_state": {"location_code": "HENRY_HUB"},
                        "sell_state": {"location_code": "TRANSCO_Z6"},
                        "buy_ask_price": 2.84,
                        "sell_bid_price": 3.09,
                        "transportation_cost": 0.11,
                        "risk_buffer": 0.02,
                    }
                }
            ),
            as_of=self.now,
        )

        candidate = result.arbitrage_candidate
        self.assertIsNotNone(candidate)
        assert candidate is not None
        self.assertEqual(result.opportunity_summary.category, "ARBITRAGE")
        self.assertEqual(candidate.family, "GEOGRAPHIC")
        self.assertEqual(candidate.status, "SUPPORTED")
        self.assertEqual(candidate.buy_price_basis, "ASK")
        self.assertEqual(candidate.sell_price_basis, "BID")
        self.assertAlmostEqual(candidate.gross_spread or 0, 0.25)
        self.assertAlmostEqual(candidate.bridge_cost or 0, 0.13)
        self.assertAlmostEqual(candidate.net_opportunity or 0, 0.12)
        self.assertEqual([edge.edge_type for edge in candidate.edges], ["TRANSPORT", "RISK_BUFFER"])

    def test_product_and_time_arbitrage_emit_typed_bridge_costs(self) -> None:
        product_result = build_pretrade_recommendation_result(
            draft=self._draft(),
            input_snapshots=self._base_snapshots(
                latest_mark_payload={
                    "arbitrage_candidate": {
                        "family": "PRODUCT_QUALITY",
                        "buy_state": {"commodity": "WCS", "quality_spec": "heavy"},
                        "sell_state": {"commodity": "WTI", "quality_spec": "light sweet"},
                        "buy_ask_price": 71.0,
                        "sell_bid_price": 76.5,
                        "conversion_cost": 2.25,
                    }
                }
            ),
            as_of=self.now,
        )
        time_result = build_pretrade_recommendation_result(
            draft=self._draft(),
            input_snapshots=self._base_snapshots(
                latest_mark_payload={
                    "arbitrage_candidate": {
                        "family": "TIME",
                        "buy_state": {"delivery_start": "2026-06-01", "delivery_end": "2026-06-30"},
                        "sell_state": {"delivery_start": "2026-07-01", "delivery_end": "2026-07-31"},
                        "buy_ask_price": 2.8,
                        "sell_bid_price": 3.0,
                        "storage_cost": 0.07,
                    }
                }
            ),
            as_of=self.now,
        )

        self.assertEqual(product_result.arbitrage_candidate.edges[0].edge_type, "PRODUCT_CONVERSION")  # type: ignore[union-attr]
        self.assertAlmostEqual(product_result.arbitrage_candidate.net_opportunity or 0, 3.25)  # type: ignore[union-attr]
        self.assertEqual(time_result.arbitrage_candidate.edges[0].edge_type, "STORAGE")  # type: ignore[union-attr]
        self.assertAlmostEqual(time_result.arbitrage_candidate.net_opportunity or 0, 0.13)  # type: ignore[union-attr]

    def test_unsupported_arbitrage_mapping_downgrades_without_opportunity_category(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(),
            input_snapshots=self._base_snapshots(
                latest_mark_payload={
                    "arbitrage_candidate": {
                        "family": "PRODUCT_QUALITY",
                        "supported": False,
                        "unsupported_reason": "No approved conversion relationship exists between the products.",
                        "buy_ask_price": 71.0,
                        "sell_bid_price": 77.0,
                        "conversion_cost": 1.5,
                    }
                }
            ),
            as_of=self.now,
        )

        self.assertEqual(result.arbitrage_candidate.status, "UNSUPPORTED")  # type: ignore[union-attr]
        self.assertNotEqual(result.opportunity_summary.category, "ARBITRAGE")
        self.assertEqual(next(check for check in result.checks if check.key == "arbitrage").status, "watch")
        self.assertTrue(
            any(item.evidence_key == "arbitrage-unsupported-mapping" for item in result.missing_evidence)
        )

    def test_missing_executable_arbitrage_prices_make_candidate_incomplete(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(),
            input_snapshots=self._base_snapshots(
                latest_mark_payload={
                    "arbitrage_candidate": {
                        "family": "GEOGRAPHIC",
                        "last_price": 2.95,
                        "transportation_cost": 0.1,
                    }
                }
            ),
            as_of=self.now,
        )

        self.assertEqual(result.arbitrage_candidate.status, "INCOMPLETE")  # type: ignore[union-attr]
        self.assertNotEqual(result.opportunity_summary.category, "ARBITRAGE")
        self.assertTrue(
            any("executable ask" in item.detail.lower() for item in result.missing_evidence)
        )

    def test_sell_draft_offsets_current_long_exposure(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(trade_side="SELL", target_volume=5000),
            input_snapshots=self._base_snapshots(current_net_position=10000),
            as_of=self.now,
        )

        self.assertEqual(result.residual_exposure.exposure_effect, "OFFSETS")  # type: ignore[union-attr]
        self.assertEqual(result.residual_exposure.residual_after_trade, 5000)  # type: ignore[union-attr]
        self.assertEqual(result.opportunity_summary.category, "RISK_REDUCTION")

    def test_netting_candidate_exact_match_uses_position_criteria(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(trade_side="BUY", target_volume=8000),
            input_snapshots=self._base_snapshots(current_net_position=-8000),
            as_of=self.now,
        )

        candidate = result.netting_candidates[0]
        self.assertEqual(candidate.match_quality, "EXACT")
        self.assertEqual(candidate.gross_exposure, 16000)
        self.assertEqual(candidate.offset_quantity, 8000)
        self.assertEqual(candidate.residual_exposure, 0)
        self.assertEqual(candidate.rejection_reasons, [])
        self.assertIn("book=GAS_PHYS", candidate.constraints)
        self.assertIn("delivery=2026-06-01..2026-06-30", candidate.constraints)

    def test_netting_candidate_partial_match_leaves_residual_visible(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(trade_side="BUY", target_volume=12000),
            input_snapshots=self._base_snapshots(current_net_position=-18000),
            as_of=self.now,
        )

        candidate = result.netting_candidates[0]
        self.assertEqual(candidate.match_quality, "PARTIAL")
        self.assertEqual(candidate.gross_exposure, 30000)
        self.assertEqual(candidate.offset_quantity, 12000)
        self.assertEqual(candidate.residual_exposure, 6000)

    def test_netting_candidate_allows_larger_opposing_trade_as_partial_offset(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(trade_side="BUY", target_volume=20000),
            input_snapshots=self._base_snapshots(current_net_position=-10000),
            as_of=self.now,
        )

        candidate = result.netting_candidates[0]
        self.assertEqual(candidate.match_quality, "PARTIAL")
        self.assertEqual(candidate.offset_quantity, 10000)
        self.assertEqual(candidate.residual_exposure, 10000)

    def test_netting_candidate_allows_allowed_book_group_match(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(trade_side="BUY", target_volume=8000),
            input_snapshots=self._base_snapshots(
                current_net_position=-8000,
                desk_context_payload={
                    "position_book": "GAS_STORAGE",
                    "position_book_group": "GAS_PROMPT",
                    "draft_book_group": "GAS_PROMPT",
                },
            ),
            as_of=self.now,
        )

        candidate = result.netting_candidates[0]
        self.assertEqual(candidate.match_quality, "EXACT")
        self.assertEqual(candidate.rejection_reasons, [])
        self.assertIn("book_group=GAS_PROMPT", candidate.constraints)

    def test_netting_candidate_rejects_unit_mismatch(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(trade_side="BUY", target_volume=8000),
            input_snapshots=self._base_snapshots(
                current_net_position=-8000,
                desk_context_payload={"position_unit": "DTH"},
            ),
            as_of=self.now,
        )

        candidate = result.netting_candidates[0]
        self.assertEqual(candidate.match_quality, "REJECTED")
        self.assertEqual(candidate.offset_quantity, 0)
        self.assertEqual(candidate.residual_exposure, 16000)
        self.assertTrue(any("Unit DTH" in reason for reason in candidate.rejection_reasons))

    def test_netting_candidate_rejects_location_mismatch(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(trade_side="BUY", target_volume=8000),
            input_snapshots=self._base_snapshots(
                current_net_position=-8000,
                desk_context_payload={"position_location_code": "WAHA"},
            ),
            as_of=self.now,
        )

        candidate = result.netting_candidates[0]
        self.assertEqual(candidate.match_quality, "REJECTED")
        self.assertTrue(any("Location WAHA" in reason for reason in candidate.rejection_reasons))

    def test_netting_candidate_rejects_non_overlapping_delivery_window(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(trade_side="BUY", target_volume=8000),
            input_snapshots=self._base_snapshots(
                current_net_position=-8000,
                desk_context_payload={
                    "position_delivery_start": "2026-07-01",
                    "position_delivery_end": "2026-07-31",
                },
            ),
            as_of=self.now,
        )

        candidate = result.netting_candidates[0]
        self.assertEqual(candidate.match_quality, "REJECTED")
        self.assertTrue(any("does not overlap" in reason for reason in candidate.rejection_reasons))

    def test_netting_candidate_rejects_price_index_mismatch(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(trade_side="BUY", target_volume=8000),
            input_snapshots=self._base_snapshots(
                current_net_position=-8000,
                desk_context_payload={"position_price_index_code": "NG_WAHA_PROMPT"},
            ),
            as_of=self.now,
        )

        candidate = result.netting_candidates[0]
        self.assertEqual(candidate.match_quality, "REJECTED")
        self.assertTrue(any("Price index NG_WAHA_PROMPT" in reason for reason in candidate.rejection_reasons))

    def test_netting_candidate_rejects_no_open_position_without_mutating_records(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(trade_side="BUY", target_volume=8000),
            input_snapshots=self._base_snapshots(current_net_position=0),
            as_of=self.now,
        )

        candidate = result.netting_candidates[0]
        self.assertEqual(candidate.match_quality, "REJECTED")
        self.assertEqual(candidate.offset_quantity, 0)
        self.assertEqual(candidate.residual_exposure, 8000)
        self.assertTrue(any("no open position" in reason for reason in candidate.rejection_reasons))

    def test_hedge_decision_table_selects_futures_for_fixed_linear_prompt_residual(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(pricing_type="FIXED", price_index_code=None, target_volume=8000),
            input_snapshots=self._base_snapshots(current_net_position=0),
            as_of=self.now,
        )

        hedge = result.hedge_recommendation
        self.assertEqual(hedge.instrument_type, "FUTURES")
        self.assertEqual(hedge.decision_key, "linear_fixed_prompt_futures")
        self.assertEqual(hedge.target_delta, -8000)
        self.assertIn("basis_risk=UNKNOWN", hedge.decision_factors)
        self.assertTrue(any(item.alternative == "SWAP" for item in result.rejected_alternatives))
        self.assertTrue(any(item.alternative == "NO_HEDGE" for item in result.rejected_alternatives))

    def test_hedge_decision_table_selects_swap_for_floating_or_basis_sensitive_residual(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(target_volume=8000),
            input_snapshots=self._base_snapshots(
                current_net_position=0,
                latest_mark_payload={"basis_risk_status": "HIGH"},
            ),
            as_of=self.now,
        )

        hedge = result.hedge_recommendation
        self.assertEqual(hedge.instrument_type, "SWAP")
        self.assertEqual(hedge.decision_key, "linear_basis_or_floating_swap")
        self.assertIn("basis_risk=HIGH", hedge.decision_factors)

    def test_hedge_decision_table_selects_options_only_with_fresh_volatility(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(target_volume=8000),
            input_snapshots=self._base_snapshots(
                current_net_position=0,
                option_exposure_payload={"implied_volatility_available": True},
            ),
            as_of=self.now,
        )

        hedge = result.hedge_recommendation
        self.assertEqual(hedge.instrument_type, "OPTIONS")
        self.assertEqual(hedge.decision_key, "option_sensitive_fresh_volatility")
        self.assertIn("optionality=PRESENT", hedge.decision_factors)

    def test_hedge_decision_table_selects_physical_offset_for_valid_netting_candidate(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(trade_side="SELL", target_volume=5000),
            input_snapshots=self._base_snapshots(current_net_position=10000),
            as_of=self.now,
        )

        hedge = result.hedge_recommendation
        self.assertEqual(hedge.instrument_type, "PHYSICAL_OFFSET")
        self.assertEqual(hedge.decision_key, "validated_physical_offset_candidate")
        self.assertIn("netting_candidate=PARTIAL", hedge.decision_factors)

    def test_hedge_decision_table_selects_no_hedge_when_residual_is_flat(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(trade_side="BUY", target_volume=8000),
            input_snapshots=self._base_snapshots(current_net_position=-8000),
            as_of=self.now,
        )

        hedge = result.hedge_recommendation
        self.assertEqual(hedge.instrument_type, "NO_HEDGE")
        self.assertEqual(hedge.decision_key, "no_residual_delta")
        self.assertEqual(result.rejected_alternatives, [])

    def test_hedge_decision_table_waits_for_data_when_option_volatility_is_stale(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(target_volume=8000),
            input_snapshots=self._base_snapshots(
                current_net_position=0,
                option_exposure_payload={"volatility_freshness": "STALE"},
            ),
            as_of=self.now,
        )

        hedge = result.hedge_recommendation
        self.assertEqual(hedge.instrument_type, "WAIT_FOR_DATA")
        self.assertEqual(hedge.decision_key, "wait_option_evidence")
        self.assertTrue(any("Volatility evidence is stale" in stop for stop in hedge.policy_stops))
        self.assertTrue(result.rejected_alternatives)

    def test_hedge_decision_table_waits_for_missing_policy(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(target_volume=8000),
            input_snapshots=self._base_snapshots(
                current_net_position=0,
                counterparty_credit_payload={"hedge_policy_available": False},
            ),
            as_of=self.now,
        )

        hedge = result.hedge_recommendation
        self.assertEqual(hedge.instrument_type, "WAIT_FOR_DATA")
        self.assertEqual(hedge.decision_key, "wait_linear_policy_or_curve")
        self.assertTrue(any("Hedge decision policy evidence is missing" in stop for stop in hedge.policy_stops))

    def test_credit_block_scenario_escalates_before_capture(self) -> None:
        result = build_pretrade_recommendation_result(
            draft=self._draft(),
            input_snapshots=self._base_snapshots(breach_action="BLOCK"),
            as_of=self.now,
        )

        self.assertEqual(result.stance, "ESCALATE")
        self.assertEqual(next(check for check in result.checks if check.key == "counterparty").status, "block")


if __name__ == "__main__":
    unittest.main()
