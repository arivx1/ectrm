# Trading Source Roadmap

This roadmap turns the source register into an implementation sequence for an
ETRM and multi-asset trading platform. The bias is operational credibility
first, analytics second, and optional alpha datasets last.

Concrete public-feed and vendor options that map back to these logical source
IDs live in `trading-source-candidates.csv`.

## Phase 1: Must Have

These sources are required before the platform can claim credible trade
capture, marking, risk, and control coverage.

| Priority | Source IDs | Why first |
|---|---|---|
| P0 | `refdata_books`, `refdata_commodities`, `refdata_units`, `refdata_currencies` | Core trade payload validation and reporting dimensions |
| P0 | `refdata_counterparties`, `counterparty_credit`, `compliance_lists` | Prevent invalid, unauthorized, or unapproved trading activity |
| P0 | `refdata_locations`, `refdata_price_indices`, `marketdata_price_indices_obs` | Make commodity pricing and index-linked valuation work end-to-end |
| P0 | `ops_positions_balances`, `ops_clearing_settlement`, `reconciliation_breaks` | Create books-and-records integrity and operational control loops |
| P0 | `reference_pricing`, `risk_outputs`, `pnl_attribution` | Support valuation, exposure control, and explainable PnL |
| P0 | `config_limits`, `audit_telemetry` | Enforce production guardrails and preserve auditability |

## Phase 2: Should Have

These sources materially improve pricing quality, treasury accuracy, and
commodity decision support. An ETRM can run without all of them, but it will be
noticeably weaker.

| Priority | Source IDs | Why next |
|---|---|---|
| P1 | `fx_spot_curves`, `rates_curves` | Required for cross-currency valuation, discounting, and funding-aware marks |
| P1 | `weather_forecast_obs`, `power_iso_load`, `gas_pipeline_storage` | Core external drivers for power, gas, and weather-sensitive books |
| P1 | `eia_energy_data`, `commodity_inventory` | Benchmark public fundamentals and event-driven inventory signals |
| P1 | `macro_timeseries`, `market_positioning` | Add revision-aware macro context and futures positioning signals for scenario analysis and trader tooling |
| P1 | `trading-source-register.csv`, `trading-source-candidates.csv` governance loop | Review logical source ownership, candidate feeds, fallback, and licensing quarterly to prevent drift |

## Phase 3: Optional / Edge

These are useful once the control plane is stable and the desk wants deeper
fundamental insight or strategy differentiation.

| Priority | Source IDs | Why later |
|---|---|---|
| P2 | `shipping_ais` | High-value for global crude, LNG, and freight, but not necessary for initial platform credibility |
| P2 | `mktdata_multiasset_rt`, `mktdata_multiasset_hist`, `news_realtime`, `macro_calendar` | Needed if the platform expands from commodity operations into broader multi-asset trading |
| P2 | `social_sentiment`, `search_trends`, `satellite_geospatial`, `political_geopolitical`, `blockchain_onchain`, `esg_controversy` | Mostly strategy-specific and should not distract from core operational buildout |

## Delivery Order

1. Stand up reference and control sources first.
2. Add valuation and official mark sources second.
3. Add operations reconciliation and audit coverage in parallel with valuation.
4. Add commodity fundamentals once the book of record is stable.
5. Add alternative and discretionary datasets only after source governance is routine.

## Suggested Milestones

| Milestone | Exit criteria |
|---|---|
| M1: Controlled trade capture | Trades validate against books, commodities, units, currencies, counterparties, locations, and compliance limits |
| M2: Marking and risk baseline | Price indices, observations, reference pricing, positions, PnL, and risk outputs reconcile daily |
| M3: Commodity operating model | Weather, ISO, pipeline, EIA, and inventory data are ingested and available in research/risk workflows |
| M4: Strategy expansion | AIS and broader multi-asset or alternative datasets are added with explicit desk sponsorship |
