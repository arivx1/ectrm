# Trading And Shipping Document Taxonomy

## Purpose

This is the first-pass document worldview for the trading and shipping parser.
The immediate goal is not full autonomous routing. The goal is to establish a
stable taxonomy that answers three questions for every document kind:

1. What kind of business document is this?
2. Which ECTRM record should it most likely attach to?
3. Which identifiers matter most when we later automate matching or record
   creation?

The backend `documents/schema-registry` contract now carries that taxonomy in a
machine-readable shape so the parser, review UI, and future matching workflows
can all reference the same source of truth.

Related extraction design: [Document Extraction Architecture](./document-extraction-architecture.md).

## Hybrid Taxonomy Model

The taxonomy uses a shallow primary document family plus controlled facets.
Do not use a deep tree as the main source of truth for commodity documents:
the same document can combine settlement, logistics, legal, accounting, and
workflow dimensions. For example, a freight invoice can be payable, final,
vendor-issued, disputed, tied to a shipment, and part of a letter-of-credit
presentation pack. Those dimensions should not become one hard-coded type such
as `FINAL_VENDOR_FREIGHT_SHIPMENT_INVOICE`.

Use these concepts separately:

1. Document kind: what the document is, such as `INVOICE` or
   `BILL_OF_LADING`.
2. Document role: why it matters to the workflow, such as billing evidence,
   settlement support, title evidence, quality result, or compliance support.
3. Controlled facets: typed properties that can combine, such as transport
   mode, invoice stage, accounting direction, economic purpose, dispute state,
   legal status, or original/copy status.
4. Business links: the durable platform objects the document relates to, such
   as trade, delivery, invoice, payment, settlement, inventory lot, LC, claim,
   or workflow item.

Create a new document kind only when the distinction changes behavior:

- different extraction schema
- different matching or reconciliation workflow
- different legal or operational role
- different downstream record creation or update path
- materially different review or approval path

Do not create a new kind merely because a value is filterable. `AP` versus
`AR`, provisional versus final, truck versus vessel, original versus copy,
freight versus commodity, and disputed versus not disputed are controlled
facets unless they cross one of the behavior thresholds above.

`UNKNOWN` is a classification status for pages that are not yet confidently
classified. `OTHER` is a fallback bucket for documents that do not fit a
supported schema yet; it should keep the document reviewable and should prompt
taxonomy expansion when examples repeat.

The schema registry exposes the first controlled facet definitions directly on
the relevant document-kind contracts:

- `INVOICE`: economic purpose, invoice stage, accounting direction, source
  party role, dispute state, and line charge type.
- `BILL_OF_LADING`: transport mode, legal role, cargo status, and
  original/copy status.
- movement evidence such as truck tickets, railcar tickets, dispatch notices,
  delivery confirmations, notices of readiness, and weigh tickets: transport
  mode and quantity basis.
- quality documents: quality document role.

Future persisted document-facet values should be typed rows with confidence,
source, and review provenance. Loose tags may remain useful for search and
human notes, but deterministic routing, matching, policy, and action planning
should use controlled fields.

## Current Record Anchors

Today the platform already has durable anchors for these document families:

- `Trade`
- `TradeConfirmation`
- `DeliveryObligation`
- `DeliveryEvent`
- `TradeInvoice`
- `TradePayment`
- `TradeWorkflowItem`
- `Position`
- `ReferencePriceIndex`
- `PriceIndexObservation`

The taxonomy also names a few future-facing targets such as
`QUALITY_SPECIFICATION_REFERENCE` where a reusable reference record will likely
be cleaner than repeatedly attaching the same standing specification to many
trades.

## Family View

| Family | Representative kinds | Primary routing target | Why it matters |
| --- | --- | --- | --- |
| Trade execution | Trade communication, trade confirmation, trade contract, broker confirmation | `Trade` | These documents prove or discuss the economics that should exist on a booked trade. |
| Trade reconciliation | Broker statement | `Position` then `Trade` | These documents usually summarize many trades and are better treated as reconciliation evidence before one-to-one linkage. |
| Logistics | Bill of lading, truck ticket, weigh ticket, delivery confirmation | `DeliveryObligation` or `DeliveryEvent` | These documents prove movement, route, timing, and actual delivered quantities. |
| Network flow | Pipeline statement | `DeliveryObligation` | Pipeline docs attach most naturally to scheduled or flowed delivery obligations keyed by nomination and path references. |
| Market data | Price publication | `PriceIndexObservation`, then `ReferencePriceIndex` | These documents preserve the publisher evidence behind loaded commodity price observations and index definitions. |
| Quality | Quality statement, sampling analysis, certificate of analysis, quality specification | `DeliveryObligation` or `Trade` | These documents govern delivered quality, disputes, and trade-specific quality tolerances. |
| Compliance | Hazardous cargo documentation | `DeliveryObligation` | These are movement attachments and should behave like compliance evidence, not commercial records. |
| Settlement | Invoice, settlement statement | `Trade`, `TradeInvoice`, `TradePayment` | These documents close the loop from delivery into money. |

These groupings are for operator navigation and routing defaults. They are not
a permission to add word-similarity parents such as a generic `Statement`
family: broker statements, pipeline statements, storage statements, quality
statements, and settlement statements belong to different workflows.

## Matching Worldview

When we automate routing, matching should generally happen in this order:

1. Explicit platform identifiers.
   `trade_id`, `delivery_id`, `invoice_number`, `confirmation_number`.
2. Operational references owned by the movement or counterparty process.
   Bill of lading number, truck ticket number, nomination reference, pipeline
   contract number, carrier reference, sample ID.
3. Commercial context.
   Counterparty, trade date, delivery window, product, route, quantity, price,
   and total amount.
4. Document family fallback.
   If a document looks like settlement evidence, prefer trade and invoice
   linkage before trying to create logistics or quality artifacts.

Two routing rules matter early:

- Downstream records should only be auto-created once the owning business object
  is known.
  Example: create a `TradeInvoice` only after the invoice is matched to a
  `Trade`.
- Evidence-style documents should usually attach to an existing record rather
  than create a new one.
  Example: hazardous cargo paperwork should attach to a delivery, not create a
  new commercial obligation.

## Initial Document Set

| Document kind | Current anchor | Future automation intent |
| --- | --- | --- |
| `TRADE_COMMUNICATION` | `Trade` or `TradeWorkflowItem` | Enrich open commercial or dispute workflows without over-creating records. |
| `TRADE_CONFIRMATION` | `Trade`, then `TradeConfirmation` | Match the booked trade, compare economics, then create or update confirmation workflow records. |
| `TRADE_CONTRACT` | `Trade` | Match an existing trade when possible; otherwise become a candidate source for manual or assisted trade creation. |
| `BROKER_CONFIRMATION` | `Trade` | Reconcile exchange or broker-routed executions back to booked financial trades. |
| `BROKER_STATEMENT` | `Position`, then `Trade` | Support broker cash and position reconciliation before detailed line-level trade attachment. |
| `PRICE_PUBLICATION` | `PriceIndexObservation`, then `ReferencePriceIndex` | Preserve the publisher, index code, observation date, unit, currency, and assessed price behind loaded market-data observations. |
| `PIPELINE_STATEMENT` | `DeliveryObligation` | Match by nomination, contract, pipeline, and path, then derive trade linkage through the delivery. |
| `BILL_OF_LADING` | `DeliveryObligation`, then `DeliveryEvent` | Treat as shipment evidence that can later spawn a movement event. |
| `TRUCK_TICKET` | `DeliveryObligation`, then `DeliveryEvent` | Use as load or unload evidence and later actualization support. |
| `WEIGH_TICKET` | `DeliveryEvent`, then `DeliveryObligation` | Support measured-quantity actualization for a physical movement. |
| `DELIVERY_CONFIRMATION` | `DeliveryEvent`, then `DeliveryObligation` | Mark physical completion or proof of delivery. |
| `QUALITY_STATEMENT` | `DeliveryObligation` | Attach delivered quality evidence to a lot or movement and support later disputes. |
| `SAMPLING_ANALYSIS` | `DeliveryObligation` or `DeliveryEvent` | Anchor sample-level lab data to the sampled movement or lot. |
| `CERTIFICATE_OF_ANALYSIS` | `DeliveryObligation` | Treat as a formal quality certificate for delivered product. |
| `QUALITY_SPECIFICATION` | `Trade` or future quality reference data | Capture standing parameter limits that can later govern many trades. |
| `HAZARDOUS_CARGO_DOCUMENTATION` | `DeliveryObligation` | Preserve compliance and handling evidence without creating new commercial state. |
| `INVOICE` | `Trade`, then `TradeInvoice` | Match the commercial obligation first, then create the invoice record. |
| `SETTLEMENT_STATEMENT` | `TradePayment` or `TradeInvoice` | Reconcile payments, balances, and invoice settlements across one or more trades. |

Invoice economic purpose should remain a facet or line-item charge
classification because one invoice can contain commodity, freight, inspection,
tax, storage, demurrage, and service lines at once.

## Open Questions

These questions should shape the next pass:

- Should pipeline nominations and allocations become first-class document kinds
  separate from `PIPELINE_STATEMENT`?
- Should broker statements eventually create their own reconciliation ledger
  record instead of anchoring to `Position`?
- Should quality specifications remain trade attachments, or move into
  reference-data ownership sooner?
- Do we want a dedicated compliance document set record for hazmat and safety
  attachments, or is delivery-level attachment enough?

## Current Matching Scaffold

The documents domain now has three decision layers:

- a routing scorer that picks the attachment strategy and record family
- a record lookup scaffold that turns extracted keys into concrete system
  candidates or create suggestions
- an action planner that converts the strongest candidate into an explicit next
  operation

Today that lookup scaffold can already search live `Trade`, `TradeInvoice`,
`TradePayment`, `TradeConfirmation`, and `Delivery` records. When a future
record type does not exist yet, it can still surface a creation candidate when
the schema explicitly allows one, such as `TRADE_INVOICE` or
`QUALITY_SPECIFICATION`.

Today the planner can already produce explicit recommendations such as:

- attach to an existing record
- create the missing downstream record once its owning trade or delivery is
  confirmed
- escalate to manual review when the lookup surface is ambiguous

That moves the system from “what should this attach to?” into “what exact
mutation should happen next?” while keeping extraction, review, and routing
aligned to the same taxonomy.

That execution plumbing now exists for the current core set:

- verified documents can execute attach plans against existing trade, invoice,
  payment, delivery, or confirmation records
- verified confirmation documents can create real `TradeConfirmation` records
- verified invoice-style documents can create real `TradeInvoice` records
- verified payment-style documents can create real `TradePayment` records when
  an invoice owner is already known
- executed links are persisted so the document review surface can show which
  records are already attached

The next useful build is decision governance: define when these action plans
should auto-run, when they should require explicit operator approval, and how
to extend the execution path into quality and compliance record types.
