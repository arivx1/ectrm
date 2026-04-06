from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from apps.api.scripts import summarize_robinhood_csv


class SummarizeRobinhoodCsvScriptTests(unittest.TestCase):
    def test_main_prints_report_and_writes_optional_json(self) -> None:
        csv_text = """Activity Date,Instrument,Description,Trans Code,Quantity,Price,Amount
2026-03-14,TSLA,Sold 1 share of TSLA,Sell,1,$250.00,$250.00
"""
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            input_path = temp_path / "robinhood.csv"
            json_output = temp_path / "summary.json"
            input_path.write_text(csv_text, encoding="utf-8")

            with patch(
                "sys.argv",
                [
                    "summarize_robinhood_csv.py",
                    "--input",
                    str(input_path),
                    "--json-output",
                    str(json_output),
                    "--top-symbols",
                    "5",
                ],
            ):
                buffer = io.StringIO()
                with redirect_stdout(buffer):
                    exit_code = summarize_robinhood_csv.main()

            payload = json.loads(json_output.read_text(encoding="utf-8"))

        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["trade_sell_amount"], "250.00")
        self.assertEqual(payload["symbols"][0]["symbol"], "TSLA")
        self.assertIn("Robinhood activity summary", buffer.getvalue())
        self.assertIn("JSON report written", buffer.getvalue())

    def test_main_returns_one_when_input_is_missing(self) -> None:
        with patch(
            "sys.argv",
            ["summarize_robinhood_csv.py", "--input", "/tmp/does-not-exist.csv"],
        ):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = summarize_robinhood_csv.main()

        self.assertEqual(exit_code, 1)
        self.assertIn("input file not found", buffer.getvalue())


if __name__ == "__main__":
    unittest.main()
