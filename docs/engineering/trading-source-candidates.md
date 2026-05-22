# Trading Source Candidate Matrix

This companion file maps concrete public feeds and commercial vendors to the
logical source IDs in the trading source register.

Use `trading-source-candidates.csv` when we need to answer questions such as:

- which official public feeds can we stand up first
- which commercial vendors can replace or augment public feeds
- what licensing posture comes with each candidate
- which sources are low-effort versus contract-grade integrations

Design rules:

- keep the canonical source register focused on logical datasets and operating
  controls
- keep vendor and public-feed evaluation in the candidate matrix
- map every candidate back to one logical `source_id`
- bias toward public or already-partial integrations first for prototype and
  demo environments
- only promote commercial sources after the desk needs contract-grade marks,
  normalized history, or lower-latency coverage

Recommended implementation order for the current product shape:

1. `EIA`, `NWS`, and public ISO/RTO feeds for commodity fundamentals and power
   drivers
2. `FRED`, `ALFRED`, `BEA`, `BLS`, `Census`, `Treasury`, and `CFTC` for macro,
   revisions, and positioning context
3. `CME`, `ICE`, `Platts`, `Argus`, `OPIS`, `Yes Energy`, and `Enverus` when we
   need benchmark-grade marks or normalized operator data
4. `Kpler` and `Vortexa` once cargo-flow and storage intelligence becomes worth
   the spend

Trading Economics-style market screens should be treated as aggregator views,
not source provenance. Their public documentation says market quotes are
aggregated from third-party providers, while commodity pages identify many
values as OTC/CFD reference prices rather than official settlements. For
Trading Economics lookalike coverage, add the aggregator as a comparison
candidate and prefer official exchange, index publisher, benchmark publisher,
or FRED-hosted daily-close sources only after license review.
