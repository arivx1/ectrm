from __future__ import annotations

import unittest

from apps.api.app.domains.documents.services.document_routing import build_document_page_routing_assessment


class DocumentRoutingServiceTests(unittest.TestCase):
    def test_trade_confirmation_routes_trade_first(self) -> None:
        assessment = build_document_page_routing_assessment(
            document_kind="TRADE_CONFIRMATION",
            header_fields=[
                {"field_key": "confirmation_number", "value": "CONF-100"},
                {"field_key": "trade_id", "value": "TRD-100"},
                {"field_key": "trade_date", "value": "2026-04-14"},
                {"field_key": "counterparty", "value": "Shell Trading"},
            ],
            table_blocks=[
                {
                    "template_key": "economic_terms",
                    "columns": ["term_name", "term_value"],
                    "rows": [{"term_name": "price", "term_value": "80.25"}],
                    "source": "review",
                }
            ],
            review_status="REVIEWED",
        )

        self.assertEqual(assessment.routing_strategy, "TRADE_FIRST")
        self.assertEqual(assessment.status, "READY")
        self.assertEqual(assessment.primary_record_type, "TRADE")
        self.assertIn("trade_id", assessment.matched_keys)

    def test_bill_of_lading_routes_delivery_first(self) -> None:
        assessment = build_document_page_routing_assessment(
            document_kind="BILL_OF_LADING",
            header_fields=[
                {"field_key": "bill_of_lading_number", "value": "BOL-700"},
                {"field_key": "delivery_id", "value": "DLV-700"},
                {"field_key": "carrier", "value": "Acme Logistics"},
                {"field_key": "load_date", "value": "2026-04-14"},
                {"field_key": "origin", "value": "HOUSTON"},
                {"field_key": "destination", "value": "NEW ORLEANS"},
            ],
            table_blocks=[
                {
                    "template_key": "shipment_lines",
                    "columns": ["description"],
                    "rows": [{"description": "WTI"}],
                    "source": "review",
                }
            ],
            review_status="REVIEWED",
        )

        self.assertEqual(assessment.routing_strategy, "DELIVERY_FIRST")
        self.assertEqual(assessment.status, "READY")
        self.assertEqual(assessment.primary_record_type, "DELIVERY")
        self.assertIn("delivery_id", assessment.matched_keys)

    def test_invoice_routes_settlement_first(self) -> None:
        assessment = build_document_page_routing_assessment(
            document_kind="INVOICE",
            header_fields=[
                {"field_key": "invoice_number", "value": "INV-9001"},
                {"field_key": "trade_id", "value": "TRD-9001"},
                {"field_key": "counterparty", "value": "Shell Trading"},
                {"field_key": "invoice_date", "value": "2026-04-14"},
                {"field_key": "due_date", "value": "2026-04-20"},
                {"field_key": "total_amount", "value": "125000"},
            ],
            table_blocks=[
                {
                    "template_key": "line_items",
                    "columns": ["description", "line_amount"],
                    "rows": [{"description": "WTI", "line_amount": "125000"}],
                    "source": "review",
                }
            ],
            review_status="REVIEWED",
        )

        self.assertEqual(assessment.routing_strategy, "SETTLEMENT_FIRST")
        self.assertEqual(assessment.status, "READY")
        self.assertEqual(assessment.primary_record_type, "TRADE_INVOICE")
        self.assertIn("invoice_number", assessment.matched_keys)

    def test_quality_statement_routes_attachment_first(self) -> None:
        assessment = build_document_page_routing_assessment(
            document_kind="QUALITY_STATEMENT",
            header_fields=[
                {"field_key": "statement_number", "value": "QS-41"},
                {"field_key": "delivery_id", "value": "DLV-41"},
                {"field_key": "sample_id", "value": "S-41"},
                {"field_key": "lot_number", "value": "LOT-41"},
                {"field_key": "product", "value": "ULSD"},
            ],
            table_blocks=[],
            review_status="REVIEWED",
        )

        self.assertEqual(assessment.routing_strategy, "ATTACHMENT_FIRST")
        self.assertEqual(assessment.status, "READY")
        self.assertEqual(assessment.primary_record_type, "QUALITY_RECORD")
        self.assertIn("sample_id", assessment.matched_keys)

    def test_price_publication_routes_market_data_first(self) -> None:
        assessment = build_document_page_routing_assessment(
            document_kind="PRICE_PUBLICATION",
            header_fields=[
                {"field_key": "publication_date", "value": "2026-04-15"},
                {"field_key": "observation_date", "value": "2026-04-15"},
                {"field_key": "price_index_code", "value": "WTI_CUSHING_D"},
                {"field_key": "source_provider", "value": "EIA"},
                {"field_key": "source_series_id", "value": "PET.RWTC.D"},
                {"field_key": "commodity", "value": "WTI"},
                {"field_key": "location", "value": "Cushing"},
                {"field_key": "price", "value": "84.25"},
            ],
            table_blocks=[
                {
                    "template_key": "price_lines",
                    "columns": ["price_index_code", "commodity", "price"],
                    "rows": [{"price_index_code": "WTI_CUSHING_D", "commodity": "WTI", "price": "84.25"}],
                    "source": "review",
                }
            ],
            review_status="REVIEWED",
        )

        self.assertEqual(assessment.routing_strategy, "MARKET_DATA_FIRST")
        self.assertEqual(assessment.status, "READY")
        self.assertEqual(assessment.primary_record_type, "PRICE_INDEX_OBSERVATION")
        self.assertIn("price_index_code", assessment.matched_keys)


if __name__ == "__main__":
    unittest.main()
