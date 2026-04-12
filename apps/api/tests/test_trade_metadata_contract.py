from __future__ import annotations

import unittest

from apps.api.app.domains.trading.services.trade_metadata import (
    TRADE_METADATA_CONTRACT_VERSION,
    build_trade_metadata_contract,
)


class TradeMetadataContractTests(unittest.TestCase):
    def test_contract_publishes_server_owned_trade_vocab_defaults_and_rules(self) -> None:
        contract = build_trade_metadata_contract()

        self.assertEqual(contract.contract_version, TRADE_METADATA_CONTRACT_VERSION)
        self.assertEqual(contract.vocabulary.trade_natures, ["PHYSICAL", "FINANCIAL"])
        self.assertEqual(contract.vocabulary.trade_structures, ["SINGLE", "SWAP"])
        self.assertEqual(
            contract.vocabulary.trade_statuses,
            ["ACTIVE", "CANCELLED", "EXERCISED", "EXPIRED", "ASSIGNED"],
        )
        self.assertEqual(contract.defaults.trade_nature, "PHYSICAL")
        self.assertEqual(contract.defaults.trade_structure, "SINGLE")
        self.assertEqual(contract.defaults.trade_side, "BUY")
        self.assertEqual(contract.defaults.trade_status, "ACTIVE")
        self.assertEqual(contract.defaults.workflow_statuses_by_trade_nature["PHYSICAL"].invoice_status, "PENDING")
        self.assertEqual(contract.defaults.workflow_statuses_by_trade_nature["FINANCIAL"].invoice_status, "NOT_REQUIRED")
        self.assertEqual(contract.rules.trade_structures_requiring_top_level_volume, ["SINGLE"])
        self.assertEqual(contract.rules.option_allowed_instrument_type, "OPTION")
        self.assertEqual(contract.rules.option_required_trade_nature, "FINANCIAL")
        self.assertEqual(contract.rules.option_required_trade_structure, "SINGLE")
        self.assertEqual(contract.rules.option_required_pricing_type, "FIXED")


if __name__ == "__main__":
    unittest.main()
