from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

from apps.api.app.shared.robinhood_csv import derive_default_output_path
from apps.api.app.shared.robinhood_csv import parse_robinhood_csv
from apps.api.app.shared.robinhood_csv import write_normalized_csv
from apps.api.app.shared.robinhood_csv import write_normalized_json


class RobinhoodCsvTests(unittest.TestCase):
    def test_parse_robinhood_csv_normalizes_common_activity_headers(self) -> None:
        csv_text = """Activity Date,Process Date,Settle Date,Account Type,Instrument,Description,Trans Code,Quantity,Price,Amount,Suppressed
2026-03-01,2026-03-01,2026-03-03,Margin,AAPL,Bought 2 shares of AAPL,Buy,2,$180.50,($361.00),false
2026-03-05,2026-03-05,2026-03-05,Cash,,Cash deposit,ACH,,,$500.00,false
2026-03-10,2026-03-10,2026-03-10,Cash,AAPL,Dividend from Apple,Dividend,,,$1.24,false
"""
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "robinhood.csv"
            input_path.write_text(csv_text, encoding="utf-8")

            rows, summary = parse_robinhood_csv(input_path, include_raw=True)

        self.assertEqual(len(rows), 3)
        self.assertEqual(summary.field_mapping["occurred_at"], "Activity Date")
        self.assertEqual(summary.field_mapping["activity_type"], "Trans Code")
        self.assertEqual(summary.earliest_activity_at, "2026-03-01")
        self.assertEqual(summary.latest_activity_at, "2026-03-10")

        self.assertEqual(rows[0].symbol, "AAPL")
        self.assertEqual(rows[0].activity_family, "TRADE_BUY")
        self.assertEqual(rows[0].side, "BUY")
        self.assertEqual(rows[0].quantity, "2")
        self.assertEqual(rows[0].price, "180.50")
        self.assertEqual(rows[0].amount, "-361.00")
        self.assertEqual(rows[0].suppressed, False)
        self.assertEqual(rows[0].raw, {"Account Type": "Margin", "Activity Date": "2026-03-01", "Amount": "($361.00)", "Description": "Bought 2 shares of AAPL", "Instrument": "AAPL", "Price": "$180.50", "Process Date": "2026-03-01", "Quantity": "2", "Settle Date": "2026-03-03", "Suppressed": "false", "Trans Code": "Buy"})

        self.assertEqual(rows[1].activity_family, "CASH_IN")
        self.assertEqual(rows[1].side, "CREDIT")
        self.assertEqual(rows[1].amount, "500.00")

        self.assertEqual(rows[2].activity_family, "DIVIDEND")
        self.assertEqual(rows[2].side, "CREDIT")
        self.assertEqual(summary.activity_families, {"CASH_IN": 1, "DIVIDEND": 1, "TRADE_BUY": 1})
        self.assertEqual(summary.symbols, {"AAPL": 2})

    def test_parse_robinhood_csv_accepts_alternate_headers(self) -> None:
        csv_text = """Date,Ticker,Type,Shares,Price per share,Net Amount,Notes
03/11/2026,NVDA,Sell,1,$900.00,$900.00,trimmed position
"""
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "alt.csv"
            input_path.write_text(csv_text, encoding="utf-8")

            rows, summary = parse_robinhood_csv(input_path)

        self.assertEqual(len(rows), 1)
        self.assertEqual(summary.field_mapping["occurred_at"], "Date")
        self.assertEqual(summary.field_mapping["symbol"], "Ticker")
        self.assertEqual(summary.field_mapping["activity_type"], "Type")
        self.assertEqual(summary.field_mapping["price"], "Price per share")
        self.assertEqual(summary.field_mapping["amount"], "Net Amount")
        self.assertEqual(rows[0].occurred_at, "2026-03-11")
        self.assertEqual(rows[0].activity_family, "TRADE_SELL")
        self.assertEqual(rows[0].side, "SELL")
        self.assertEqual(rows[0].notes, "trimmed position")

    def test_write_normalized_json_and_csv(self) -> None:
        csv_text = """Activity Date,Instrument,Description,Trans Code,Quantity,Price,Amount
2026-03-12,MSFT,Bought 1 share of MSFT,Buy,1,$400.00,($400.00)
"""
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            input_path = temp_path / "robinhood.csv"
            json_output = derive_default_output_path(input_path, output_format="json")
            csv_output = derive_default_output_path(input_path, output_format="csv")
            input_path.write_text(csv_text, encoding="utf-8")

            rows, summary = parse_robinhood_csv(input_path, include_raw=True)
            write_normalized_json(json_output, rows=rows, summary=summary, include_raw=True)
            write_normalized_csv(csv_output, rows=rows, include_raw=True)

            json_payload = json.loads(json_output.read_text(encoding="utf-8"))
            with csv_output.open("r", encoding="utf-8", newline="") as handle:
                csv_rows = list(csv.DictReader(handle))

        self.assertEqual(json_payload["summary"]["row_count"], 1)
        self.assertEqual(json_payload["rows"][0]["symbol"], "MSFT")
        self.assertIn("raw", json_payload["rows"][0])
        self.assertEqual(csv_rows[0]["activity_family"], "TRADE_BUY")
        self.assertEqual(csv_rows[0]["raw_json"], "{\"Activity Date\": \"2026-03-12\", \"Amount\": \"($400.00)\", \"Description\": \"Bought 1 share of MSFT\", \"Instrument\": \"MSFT\", \"Price\": \"$400.00\", \"Quantity\": \"1\", \"Trans Code\": \"Buy\"}")


if __name__ == "__main__":
    unittest.main()
