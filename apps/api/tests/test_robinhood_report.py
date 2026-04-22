from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from apps.api.app.shared.robinhood_csv import parse_robinhood_csv
from apps.api.app.shared.robinhood_report import render_robinhood_report_text
from apps.api.app.shared.robinhood_report import summarize_robinhood_rows


class RobinhoodReportTests(unittest.TestCase):
    def test_summarize_robinhood_rows_rolls_up_cash_and_symbol_metrics(self) -> None:
        csv_text = """Activity Date,Instrument,Description,Trans Code,Quantity,Price,Amount
2026-03-01,,Cash deposit,ACH,,,$1000.00
2026-03-02,AAPL,Bought 2 shares of AAPL,Buy,2,$180.00,($360.00)
2026-03-03,AAPL,Dividend from Apple,Dividend,,,$1.50
2026-03-04,MSFT,Sold 1 share of MSFT,Sell,1,$410.00,$410.00
2026-03-05,,Outgoing transfer,Withdrawal,,,$-50.00
2026-03-06,AAPL,Regulatory fee,Fee,,,$-0.12
"""
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "robinhood.csv"
            input_path.write_text(csv_text, encoding="utf-8")
            rows, _ = parse_robinhood_csv(input_path)

        report = summarize_robinhood_rows(rows, top_symbols=2)

        self.assertEqual(report.row_count, 6)
        self.assertEqual(report.first_activity_at, "2026-03-01")
        self.assertEqual(report.last_activity_at, "2026-03-06")
        self.assertEqual(report.net_cash, "1001.38")
        self.assertEqual(report.cash_in_amount, "1000.00")
        self.assertEqual(report.cash_out_amount, "50.00")
        self.assertEqual(report.trade_buy_amount, "360.00")
        self.assertEqual(report.trade_sell_amount, "410.00")
        self.assertEqual(report.dividend_amount, "1.50")
        self.assertEqual(report.fee_amount, "0.12")
        self.assertEqual(report.activity_families["TRADE_BUY"], 1)
        self.assertEqual(report.activity_families["TRADE_SELL"], 1)

        first_symbol = report.symbols[0]
        second_symbol = report.symbols[1]
        self.assertEqual(first_symbol.symbol, "AAPL")
        self.assertEqual(first_symbol.row_count, 3)
        self.assertEqual(first_symbol.net_quantity, "2")
        self.assertEqual(first_symbol.buy_amount, "360.00")
        self.assertEqual(first_symbol.dividend_amount, "1.50")
        self.assertEqual(first_symbol.fee_amount, "0.12")
        self.assertEqual(first_symbol.net_cash, "-358.62")

        self.assertEqual(second_symbol.symbol, "MSFT")
        self.assertEqual(second_symbol.sell_quantity, "1")
        self.assertEqual(second_symbol.sell_amount, "410.00")
        self.assertEqual(second_symbol.net_cash, "410.00")

    def test_render_robinhood_report_text_includes_top_symbol_section(self) -> None:
        csv_text = """Activity Date,Instrument,Description,Trans Code,Quantity,Price,Amount
2026-03-02,NVDA,Bought 1 share of NVDA,Buy,1,$900.00,($900.00)
"""
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "robinhood.csv"
            input_path.write_text(csv_text, encoding="utf-8")
            rows, _ = parse_robinhood_csv(input_path)

        report = summarize_robinhood_rows(rows, top_symbols=1)
        text = render_robinhood_report_text(report)

        self.assertIn("Robinhood activity summary", text)
        self.assertIn("Trade buys: 900.00", text)
        self.assertIn("Top symbols:", text)
        self.assertIn("NVDA: rows=1", text)


if __name__ == "__main__":
    unittest.main()
