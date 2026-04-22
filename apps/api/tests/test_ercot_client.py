from __future__ import annotations

import unittest

from apps.api.app.domains.reference_data.services.external_data.ercot_client import _parse_real_time_spp_html


class ErcotClientTests(unittest.TestCase):
    def test_parse_real_time_spp_html_extracts_latest_interval(self) -> None:
        html = """
        <!DOCTYPE html>
        <html>
          <body>
            <input type="hidden" id="currentDate" value="04/05/2026" />
            <div class="schedTime rightAlign">Last Updated: Apr 05, 2026 19:32</div>
            <table class='tableStyle'>
              <tr>
                <th class='headerValueClass'>Oper Day</th>
                <th class='headerValueClass'>Interval Ending</th>
                <th class='headerValueClass'>HB_HOUSTON</th>
                <th class='headerValueClass'>HB_NORTH</th>
              </tr>
              <tr>
                <td class='labelClassCenter'>04/05/2026</td>
                <td class='labelClassCenter'>1915</td>
                <td class='labelClassCenter'>25.10</td>
                <td class='labelClassCenter'>26.80</td>
              </tr>
              <tr>
                <td class='labelClassCenter'>04/05/2026</td>
                <td class='labelClassCenter'>1930</td>
                <td class='labelClassCenter'>23.95</td>
                <td class='labelClassCenter'>24.10</td>
              </tr>
            </table>
          </body>
        </html>
        """

        payload = _parse_real_time_spp_html(html)

        self.assertEqual(payload["operating_day"], "2026-04-05")
        self.assertEqual(payload["interval_ending"], "1930")
        self.assertEqual(payload["last_updated"], "Apr 05, 2026 19:32")
        self.assertEqual(payload["prices"]["HB_HOUSTON"], "23.95")
        self.assertEqual(payload["prices"]["HB_NORTH"], "24.10")


if __name__ == "__main__":
    unittest.main()
