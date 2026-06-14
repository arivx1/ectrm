# Document Record Matching And Workflows

## Purpose

This note turns the current document taxonomy into an implementation plan for
matching uploaded document data to existing records, proposing new records when
no match exists, and exposing the right next actions from the Library
`Workflows` button.

The main rule is conservative: document data may identify, compare, explain,
and stage work, but durable business records should only change through typed
application services with provenance, stale-state checks, and review where the
authority matrix requires it.

Related docs:

- [Document Taxonomy](./document-taxonomy-trading-shipping.md)
- [Document Extraction Architecture](./document-extraction-architecture.md)
- [Canonical Work Object Inventory](./canonical-work-object-inventory.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)

## Current Baseline

The current documents domain already has the first core layers of the matching
mechanism:

1. `schema_registry.py` defines document kinds, expected fields, table
   templates, record targets, and `create_if_missing` hints.
2. `document_routing.py` scores the document family and target record type.
3. `document_linkage.py` searches concrete system records for supported target
   types and returns ranked candidates.
4. `document_action_planning.py` converts the best candidate into an attach,
   create, or manual-review action plan.
5. `document_action_execution.py` can currently execute verified attach plans
   and create confirmation, invoice, or payment records when their owning
   record is known.
6. `document_action_governance.py` keeps record creation and financial
   mutation on the human-confirmed path.

Live lookup and linking currently support:

- `TRADE`
- `TRADE_CONFIRMATION`
- `TRADE_INVOICE`
- `TRADE_PAYMENT`
- `DELIVERY`
- `PRICE_INDEX`
- `PRICE_INDEX_OBSERVATION`

Target records that still need first-class services or lookup adapters:

- `TRADE_WORKFLOW_ITEM`
- `BROKER_ACCOUNT`
- `SETTLEMENT_ACCOUNT`
- `QUALITY_RECORD`
- `QUALITY_SPECIFICATION`
- `COMPLIANCE_RECORD`
- `INVENTORY_POSITION`

## Matching Model

Every document kind should resolve through the same deterministic pipeline:

```text
document kind + reviewed extracted fields
  -> normalized document references
  -> target record family from schema registry
  -> record-type lookup adapters
  -> candidate score with evidence
  -> attach / create-candidate / manual-review decision
  -> governed workflow action
```

Scoring should privilege evidence in this order:

1. Explicit platform IDs such as `trade_id`, `delivery_id`, invoice ID, and
   confirmation ID.
2. External operational identifiers such as BOL number, nomination reference,
   railcar number, ticket number, payment reference, claim number, certificate
   number, or price-index code plus observation date.
3. Structured business context such as counterparty, commodity, product,
   route, facility, account, dates, quantity, price, amount, currency, and
   unit.
4. Family fallback. Settlement documents should search settlement and trade
   records before logistics; movement evidence should search delivery records
   before creating anything; quality and compliance evidence should attach
   before creating new commercial state.

Candidate states should be explicit:

- `ATTACH_READY`: one strong existing record with enough evidence.
- `ATTACH_REVIEW`: likely existing record, but confidence or ambiguity needs a
  reviewer.
- `CREATE_CANDIDATE`: no existing record matched and the document kind is
  allowed to seed a new record.
- `OWNER_REQUIRED`: a downstream record could be created, but its owning trade,
  delivery, invoice, or account is not known yet.
- `MANUAL_REVIEW`: unsupported target, missing required fields, conflicting
  evidence, mixed packet, or low confidence.
- `ALREADY_LINKED`: the document is already attached to the planned target.

## Creation Rules

Creation should be staged by owner:

| New record | Required owner | First safe workflow |
| --- | --- | --- |
| Trade from deal recap, confirmation, contract, or broker confirmation | Human trader or approved trade-capture review item | Stage `create_trade_from_document` review payload, then call typed trade create service after approval. |
| Trade confirmation | Existing `Trade` | Create `TradeConfirmation` from verified document. Current execution path exists. |
| Delivery or shipment from BOL, ticket, nomination, dispatch, or readiness notice | Existing `Trade` or reviewed trade-intake candidate | Stage `create_delivery_from_document` review payload. Do not create standalone shipments without a trade or approved operations owner. |
| Delivery event or actualization from ticket, weigh ticket, BOL, or delivery confirmation | Existing `Delivery` | Stage or execute typed delivery event / actualization service once event type and quantity basis are verified. |
| Invoice or demurrage claim | Existing `Trade`, and delivery when applicable | Create `TradeInvoice` from verified document. Current invoice execution exists when trade owner is known. |
| Payment | Existing `TradeInvoice` | Create `TradePayment` from verified document. Current payment execution exists when invoice owner is known. |
| Quality record | Existing `Delivery` or `Trade` | Stage `create_quality_record_from_document` until a quality record service exists. |
| Quality specification | Existing `Trade` or future quality reference owner | Stage `create_quality_specification_from_document`; execution is not live yet. |
| Compliance record | Existing `Delivery` or `Trade` | Stage `create_compliance_record_from_document` after compliance record model exists. |
| Broker, settlement, or inventory account record | Human-owned account setup workflow | Stage manual account-resolution workflow first; do not infer new account master data directly from a document. |
| Price observation | Existing `ReferencePriceIndex` | Stage `load_price_observation_from_publication` behind market-data validation. |

## Workflow Catalog For Library

The Library `Workflows` button should not be a single hardcoded action. It
should render a small set of workflow cards from the document kind, action
plan, governance status, and existing links:

| Workflow key | Applies to | Record effect |
| --- | --- | --- |
| `review_extraction` | All non-verified documents | Open page review, required fields, table review, and verification. |
| `match_existing_record` | All supported kinds with record targets | Show ranked candidates and evidence; attach when ready. |
| `create_trade_from_document` | Deal recap, trade confirmation, trade contract, broker confirmation | Stage trade-create review payload from extracted economics. |
| `create_confirmation_from_document` | Trade confirmation | Create or attach a `TradeConfirmation` under a matched trade. |
| `create_delivery_from_document` | BOL, nomination, tickets, dispatch, readiness, pipeline/storage/outage docs | Stage delivery or shipment creation under a matched trade. |
| `record_delivery_event_from_document` | BOL, tickets, weigh ticket, delivery confirmation, readiness notice | Stage delivery event or actualization under a matched delivery. |
| `create_invoice_from_document` | Invoice, demurrage claim | Create or attach a `TradeInvoice` under a matched trade. |
| `create_payment_from_document` | Payment advice, settlement statement where invoice is known | Create or attach a `TradePayment` under a matched invoice. |
| `create_quality_record_from_document` | COA, quality statement, sampling analysis, inspection report | Stage quality record creation or attach evidence to delivery. |
| `create_quality_specification_from_document` | Quality specification | Stage quality spec reference creation or attach to trade. |
| `create_compliance_record_from_document` | Certificate of origin, hazmat docs, force majeure notice | Stage compliance record creation or attach evidence. |
| `load_price_observation_from_publication` | Price publication | Match or stage market-data observation load. |
| `resolve_master_data_owner` | Broker, settlement account, inventory, unknown owner | Create a manual review task for missing account/reference owners. |
| `manual_review` | `OTHER`, `UNKNOWN`, mixed packets, low-confidence, unsupported target | Route to a review queue with missing evidence. |

## Document Type Matrix

| Document kind | Primary record association | Create-if-missing interpretation | Library workflows |
| --- | --- | --- | --- |
| `TRADE_COMMUNICATION` | `Trade` | Usually attach only; if no trade, create a workflow item or manual trade-intake review, not a trade directly. | `match_existing_record`, `manual_review` |
| `DEAL_RECAP` | `Trade`, then `TradeWorkflowItem` | If no existing trade matches, stage `create_trade_from_document` from recap economics. | `match_existing_record`, `create_trade_from_document`, `manual_review` |
| `INVOICE` | `TradeInvoice`, then `Trade` | Create invoice only after the owning trade is matched or approved. | `match_existing_record`, `create_invoice_from_document`, `manual_review` |
| `TRADE_CONFIRMATION` | `Trade`, then `TradeConfirmation` | Create confirmation under matched trade; if no trade, stage trade creation or unmatched-confirmation review. | `match_existing_record`, `create_confirmation_from_document`, `create_trade_from_document`, `manual_review` |
| `TRADE_CONTRACT` | `Trade` | If no trade exists, stage trade or contract-intake review; do not create final trade without human approval. | `match_existing_record`, `create_trade_from_document`, `manual_review` |
| `BROKER_CONFIRMATION` | `Trade`, then `BrokerAccount` | If no trade exists, stage trade reconciliation or create-trade review; broker account setup remains manual. | `match_existing_record`, `create_trade_from_document`, `resolve_master_data_owner` |
| `BROKER_STATEMENT` | `BrokerAccount` | Do not create account from statement automatically; stage broker account resolution and reconciliation. | `resolve_master_data_owner`, `manual_review` |
| `PRICE_PUBLICATION` | `PriceIndexObservation`, then `ReferencePriceIndex` | Stage observation load only after index reference is matched or approved. | `match_existing_record`, `load_price_observation_from_publication`, `manual_review` |
| `LETTER_OF_CREDIT` | `Trade`, then `SettlementAccount` | Attach to trade; missing bank/account owner becomes settlement manual review. | `match_existing_record`, `resolve_master_data_owner`, `manual_review` |
| `NOMINATION` | `Delivery`, then `Trade` | Create delivery candidate under matched trade when nomination has enough schedule/path evidence. | `match_existing_record`, `create_delivery_from_document`, `manual_review` |
| `CURTAILMENT_NOTICE` | `Delivery`, then `Trade` | Prefer attach/event workflow; create delivery only if the affected obligation is missing and trade is known. | `match_existing_record`, `record_delivery_event_from_document`, `create_delivery_from_document` |
| `PIPELINE_STATEMENT` | `Delivery`, then `Trade` | Stage delivery reconciliation or delivery creation under matched trade; avoid account creation. | `match_existing_record`, `create_delivery_from_document`, `manual_review` |
| `TRUCK_TICKET` | `Delivery`, then `Trade` | Create delivery candidate under trade when route/date/carrier evidence is strong; otherwise attach to existing delivery. | `match_existing_record`, `record_delivery_event_from_document`, `create_delivery_from_document` |
| `RAILCAR_TICKET` | `Delivery`, then `Trade` | Same as truck ticket, using waybill and railcar identifiers. | `match_existing_record`, `record_delivery_event_from_document`, `create_delivery_from_document` |
| `DISPATCH_NOTICE` | `Delivery`, then `Trade` | Stage delivery creation or scheduling workflow under matched trade. | `match_existing_record`, `create_delivery_from_document`, `manual_review` |
| `BILL_OF_LADING` | `Delivery`, then `Trade` | If no delivery/shipment exists, stage shipment or delivery creation under matched trade. | `match_existing_record`, `create_delivery_from_document`, `record_delivery_event_from_document` |
| `DELIVERY_CONFIRMATION` | `Delivery`, then `Trade` | Usually records a delivery event or completion; create delivery only if owner trade is known. | `match_existing_record`, `record_delivery_event_from_document`, `create_delivery_from_document` |
| `NOTICE_OF_READINESS` | `Delivery`, then `Trade` | Stage readiness event or delivery creation under matched trade. | `match_existing_record`, `record_delivery_event_from_document`, `create_delivery_from_document` |
| `CERTIFICATE_OF_ANALYSIS` | `QualityRecord`, then `Delivery` | Stage quality record under matched delivery or trade. | `match_existing_record`, `create_quality_record_from_document`, `manual_review` |
| `CERTIFICATE_OF_ORIGIN` | `ComplianceRecord`, then `Delivery` | Stage compliance record under matched delivery or attach as movement evidence. | `match_existing_record`, `create_compliance_record_from_document`, `manual_review` |
| `INSPECTION_REPORT` | `QualityRecord`, then `Delivery` | Stage quality/inspection record under matched delivery. | `match_existing_record`, `create_quality_record_from_document`, `manual_review` |
| `FORCE_MAJEURE_NOTICE` | `ComplianceRecord`, then `Trade` | Stage compliance/legal notice record under matched trade or delivery. | `match_existing_record`, `create_compliance_record_from_document`, `manual_review` |
| `QUALITY_STATEMENT` | `QualityRecord`, then `Delivery` | Stage quality record under matched delivery or trade. | `match_existing_record`, `create_quality_record_from_document`, `manual_review` |
| `SAMPLING_ANALYSIS` | `QualityRecord`, then `Delivery` | Stage quality sample/result record under matched delivery or trade. | `match_existing_record`, `create_quality_record_from_document`, `manual_review` |
| `QUALITY_SPECIFICATION` | `QualitySpecification`, then `Trade` | Stage spec creation under trade or future quality reference owner; current execution is not live. | `match_existing_record`, `create_quality_specification_from_document`, `manual_review` |
| `DEMURRAGE_CLAIM` | `TradeInvoice`, then `Delivery` | Create claim invoice only when owning trade or delivery anchor is known. | `match_existing_record`, `create_invoice_from_document`, `manual_review` |
| `PAYMENT_ADVICE` | `TradePayment`, then `TradeInvoice` | Create payment only after invoice owner is matched. | `match_existing_record`, `create_payment_from_document`, `manual_review` |
| `OUTAGE_NOTICE` | `Delivery`, then `Trade` | Stage delivery event/exception under matched delivery; create delivery only with trade owner. | `match_existing_record`, `record_delivery_event_from_document`, `manual_review` |
| `STORAGE_STATEMENT` | `Delivery`, then `InventoryPosition` | Attach to delivery when possible; unresolved inventory positions go to owner-resolution workflow. | `match_existing_record`, `resolve_master_data_owner`, `manual_review` |
| `SETTLEMENT_STATEMENT` | `SettlementAccount` | Do not create account automatically; stage settlement account and reconciliation review. | `resolve_master_data_owner`, `create_payment_from_document`, `manual_review` |
| `WEIGH_TICKET` | `Delivery`, then `Trade` | Stage delivery actualization/event under matched delivery; create delivery only with trade owner. | `match_existing_record`, `record_delivery_event_from_document`, `create_delivery_from_document` |
| `HAZARDOUS_CARGO_DOCUMENTATION` | `ComplianceRecord`, then `Delivery` | Stage compliance record under matched delivery; do not create commercial records. | `match_existing_record`, `create_compliance_record_from_document`, `manual_review` |
| `OTHER` | Manual review | No automatic matching until taxonomy expands. | `manual_review` |
| `UNKNOWN` | Manual review | No automatic matching until classified. | `review_extraction`, `manual_review` |

## Plan Of Attack

### Phase 1: Make The Matching Contract Explicit

- Add workflow metadata to the schema registry so each document kind publishes
  allowed workflow keys beside record targets and matching keys.
- Extend `DocumentActionPlanOut` or add a sibling workflow summary with
  available workflows, blocked workflows, missing evidence, and required owner.
- Promote current scoring thresholds into named policy constants with tests for
  exact ID match, contextual match, ambiguous match, create candidate, and
  unsupported target.
- Add lookup adapters for `TRADE_WORKFLOW_ITEM` so deal recaps and trade
  communications can land on a visible queue object before trade creation is
  implemented.

### Phase 2: Create Trade And Delivery Candidates

- Define `create_trade_from_document` as an approval-gated action request
  payload that maps extracted recap/confirmation/contract economics to the
  typed trade create service.
- Define `create_delivery_from_document` as an approval-gated payload that
  maps BOLs, nominations, tickets, dispatches, and readiness notices into the
  typed delivery/shipment service.
- Require owner, stale-state basis, idempotency key, extracted-field evidence,
  and missing-evidence lists before either workflow can be staged.
- Add tests that a deal recap can attach to an existing trade or stage a new
  trade candidate, and that a BOL can attach to an existing delivery or stage a
  new shipment candidate under a matched trade.

### Phase 3: Fill Out Domain-Specific Targets

- Add first-class or near-first-class records for quality and compliance
  evidence before executing those workflows.
- Add account-resolution workflows for broker accounts, settlement accounts,
  and inventory positions so statements do not create master data implicitly.
- Add market-data observation staging for price publications, including index
  reference validation, currency/unit validation, and duplicate observation
  checks.

### Phase 4: Wire Library Workflows

- Replace the current under-construction Library `Workflows` button with a
  document workflow panel powered by the workflow summary.
- Show one primary recommendation plus secondary actions: review extraction,
  match existing record, create candidate, open queue/manual review, and apply
  supported action.
- Keep execution buttons gated by `document_action_governance`; financial and
  creation actions should require explicit human confirmation until approval
  metrics support promotion.
- Surface candidate evidence in the panel so users and agents see the same
  matched keys, missing keys, confidence, owner requirement, and expected record
  effect.

### Phase 5: Agent Participation

- Let agents explain routing, compare candidates, and draft workflow action
  payloads.
- Let agents stage approval-gated document actions only after the workflow key
  has a typed payload, policy checks, stale-state basis, idempotency key, and
  test coverage.
- Do not let freeform extraction output create trades, shipments, invoices,
  payments, quality records, compliance records, or account master data
  directly.

## Verification Plan

- Docs-only changes: check links and keep this file aligned with
  `schema_registry.py`.
- Registry or scoring changes: run focused document routing/linkage/planning
  tests and `make api-document-classification-evals` when classification or
  evidence weights change.
- Action or authority changes: run document action service tests and
  `make api-assistant-evals`.
- Library workflow UI changes: run focused web tests for the Library workspace
  and a browser smoke test when the workflow button can execute an action.
