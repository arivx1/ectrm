# Agent Knowledge Base

## Purpose

This file is the shared memory surface for agents working in this repo. Use it
to preserve reusable lessons about autonomy, deterministic algorithms, action
governance, stop conditions, and implementation patterns.

The knowledge base should help future agents answer:

- Has this judgment already been turned into deterministic logic?
- Is there a known boundary where agents should draft, stage, or stop?
- What tests, services, or docs should be updated when this pattern appears
  again?
- Which lessons are still proposals, and which are accepted practice?

Keep entries short, cited to repo paths where possible, and safe to review in
source control. Do not store secrets, credentials, private counterparty content,
or raw production data.

## How Agents Should Use This

Before increasing autonomy or adding a new action type:

1. Read [Agent Autonomy Rubric](./agent-autonomy-rubric.md).
2. Search this file for related domains, action types, formulas, and stop
   conditions.
3. Prefer an existing deterministic algorithm or governance pattern when one
   applies.
4. If no pattern exists and the judgment is recurring, propose or implement a
   deterministic algorithm.
5. Add or update a lesson after the work, especially when future agents would
   otherwise have to rediscover the same boundary.

## Entry Types

Use one of these types:

| Type                  | Use when                                                                    |
| --------------------- | --------------------------------------------------------------------------- |
| `lesson`              | A reusable practice or boundary was learned.                                |
| `algorithm-candidate` | A recurring judgment should probably become deterministic logic.            |
| `algorithm-added`     | Deterministic logic was implemented or promoted.                            |
| `stop-condition`      | Future agents should pause, narrow authority, or ask for review.            |
| `promotion-signal`    | Evidence suggests an agent behavior may be safe to promote.                 |
| `retirement-signal`   | Evidence suggests an agent behavior should be paused, narrowed, or removed. |

## Entry Template

```md
### YYYY-MM-DD - Short Title

- Type: lesson | algorithm-candidate | algorithm-added | stop-condition | promotion-signal | retirement-signal
- Domain:
- Applies to:
- Status: proposed | accepted | implemented | retired
- Source:
- Lesson:
- Deterministic opportunity:
- Agent autonomy impact:
- Tests or evidence:
- Follow-up:
```

## Deterministic Algorithm Proposal Checklist

When an agent proposes a new deterministic algorithm, capture:

- the business question it answers
- the owner or reviewer role
- required inputs and source freshness assumptions
- row-level access or permission assumptions
- exact outputs and allowed states
- rule table, formula, threshold, or invariant set
- edge cases and stop conditions
- service, formula, policy, or projection layer where it belongs
- tests, evals, and fixture data needed
- audit, lineage, idempotency, and rollback expectations

If the proposal touches pricing, risk, settlement, credit, compliance,
permissions, reference data, policy, or external commitments, keep it in
proposal form until a human owner approves the domain rule.

## Lessons

### 2026-05-25 - Messaging Agent Brevity Is A User Setting

- Type: lesson
- Domain: messaging collaboration surfaces, assistant response shape, and
  browser-local operator preferences
- Applies to: Messages workspace assistant replies, Settings workspace browser
  preferences, and assistant thread context assembly
- Status: implemented
- Source:
  `apps/web/src/shared/assistantResponseSettings.ts`,
  `apps/web/src/workspaces/messages/MessagingWorkspace.tsx`,
  `apps/web/src/workspaces/settings/SettingsWorkspace.tsx`,
  `apps/web/tests/assistantResponseSettings.test.ts`,
  `apps/web/tests/messagingWorkspace.test.ts`, and
  `apps/web/tests/settingsWorkspace.test.ts`
- Lesson: recurring complaints that messaging agents are too verbose should be
  handled as an explicit response-shape preference rather than as hidden,
  one-off prompt edits. The browser-local Messaging Agent Replies setting
  defaults to Brief and feeds a normalized brevity instruction into the
  Messages thread context.
- Deterministic opportunity: if teams need role-, desk-, or workspace-specific
  reply-shape defaults, promote the same option set into a typed profile or
  workspace settings API instead of adding ad hoc agent prompt variants.
- Agent autonomy impact: brevity only changes response shape. It does not
  widen tool access, action types, permissions, approval policy, external
  communication authority, or business-record mutation paths.
- Tests or evidence:
  `npm test -- assistantResponseSettings.test.ts settingsWorkspace.test.ts messagingWorkspace.test.ts messagingAgentRouter.test.ts`
  and `npm run build`
- Follow-up: consider surfacing the effective reply-style preference in prompt
  preview if Messages-specific context preview becomes an operator-facing
  debugging flow.

### 2026-05-25 - Messaging Sends Empower The Agent By Default

- Type: lesson
- Domain: messaging collaboration surfaces, assistant messaging UX, and
  deterministic routing
- Applies to: `Messages` channel composer sends, in-thread assistant replies,
  human-addressed desk messages, and specialist-agent routing
- Status: implemented
- Source:
  `apps/web/src/workspaces/messages/MessagingWorkspace.tsx`,
  `apps/web/src/workspaces/messages/messagingAgentRouter.ts`,
  `apps/web/tests/messagingWorkspace.test.ts`, and
  `apps/web/tests/messagingAgentRouter.test.ts`
- Lesson: the Messages composer should not require a separate "let the agent
  decide" affordance. A normal channel send posts the human message, then the
  deterministic messaging router decides whether the agent should stay quiet,
  use the default assistant runtime, or target a managed specialist. When the
  agent replies, it should post as a threaded reply under the triggering human
  message by default. Seeded/default message examples should use durable desk
  lanes such as Operations Queue instead of named fake human personas. Direct
  human-addressed messages should stay in-thread without interrupting unless
  the agent is explicitly invited.
- Deterministic opportunity: keep recurring social and workspace routing cues
  in `messagingAgentRouter.ts` or a future typed messaging-router service
  instead of scattering them across buttons, prompts, or local component state.
- Agent autonomy impact: this widens the agent's chance to help, not its
  business authority. Replies still use the governed assistant runtime and
  remain in draft/stage lanes; the agent still cannot externally commit the
  firm or directly mutate business records from the chat surface.
- Tests or evidence:
  `npm test -- messagingWorkspace.test.ts messagingAgentRouter.test.ts`
- Follow-up: once backend-owned messaging routing profiles exist, migrate the
  same no-reply and specialist-target rules into the typed service while
  preserving manual chat posting as the fallback.

### 2026-05-25 - Trade Units Are Deterministic Required Data

- Type: algorithm-added
- Domain: trade lifecycle, reference data, trade projection rebuilds, and
  scenario seeding
- Applies to: `TradeCreated` and `TradeAmended` command validation, persisted
  trade event payloads, trade/leg/price-term projections, and seeded scenario
  records
- Status: implemented
- Source:
  `apps/api/app/domains/trading/services/trade_unit_defaults.py`,
  `apps/api/app/domains/trading/services/trade_event_support.py`,
  `apps/api/app/domains/trading/services/trade_write_validation.py`,
  `apps/api/app/domains/trading/services/trade_commands.py`,
  `apps/api/scripts/rebuild_trades_projection.py`, and
  `apps/api/alembic/versions/m4n5o6p7q8r9_backfill_and_require_trade_units.py`
- Lesson: trade quantity and price units are required business data, not a UI
  fallback. When a write omits units, typed trade services resolve them from
  active unit, commodity, commodity-class, and price-index reference data,
  persist the resolved values on the event payload, and keep projections,
  replay, scenario seed data, and database constraints aligned.
- Deterministic opportunity: move commodity and price-index unit defaults into
  governed reference-data configuration if desks need additional commodities,
  aliases, or unit conventions beyond the current encoded rule table.
- Agent autonomy impact: agents may explain missing-unit repairs or propose
  reference-data additions, but they should not invent units in freeform output
  or bypass the typed trade command services.
- Tests or evidence:
  `PYTHONPATH=. ./.venv/bin/python -m unittest apps.api.tests.test_trade_event_workflow apps.api.tests.test_admin_seed_api apps.api.tests.test_trades_rebuild apps.api.tests.test_reports_api`
- Follow-up: keep migration and projection rebuild defaults in sync with
  `trade_unit_defaults.py` until unit defaults are promoted into reference
  data.

### 2026-05-24 - Document AI Assist Uses A Configurable Confidence Gate

- Type: algorithm-added
- Domain: document ingestion, deterministic classification, and AI-assisted
  extraction
- Applies to: PDF uploads, document reprocessing, page-level classifier
  confidence, and document AI processor selection
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/ingestion.py`,
  `apps/api/app/domains/documents/services/document_processor.py`,
  `apps/api/app/routes/documents.py`, and
  `apps/web/src/features/documents/DocumentIngestionUploadForm.tsx`
- Lesson: deterministic classification still runs first, and the selected
  document AI processor is only a fallback for pages whose deterministic
  classifier confidence is below the effective AI-assist threshold. Operators
  can choose that threshold as a 0-100% upload control, and the Library
  uploader keeps that value as a temporary session override over the system
  default until logout. The backend stores the effective threshold and
  AI-required decision in page classification payload provenance.
- Deterministic opportunity: as reviewed outcomes accumulate, compare AI
  assist rates, corrections, and confidence bands before changing the default
  threshold; the threshold should remain typed configuration, not prompt text.
- Agent autonomy impact: agents may explain why AI assistance was or was not
  applied, but threshold changes do not let model output mutate business
  records directly or bypass document review.
- Tests or evidence:
  focused document-ingestion API regressions and upload-form/API tests.
- Follow-up: consider persisting per-user or per-workspace defaults if
  operators need different thresholds by desk or document family.

### 2026-05-24 - Codex Solution Map Is A Routing Helper

- Type: lesson
- Domain: engineering context management, coding-agent navigation, and
  repository documentation
- Applies to: Codex repository tasks, top-down architecture reviews,
  context-efficient doc loading, and future agent onboarding
- Status: implemented
- Source: [Codex Top-Down Solution Map](./codex-solution-map.md) and
  [AGENTS.md](../../AGENTS.md)
- Lesson: Codex needs a compact routing surface for ECTRM because the repo has
  grown beyond what agents should bulk-load by default. Codex should review the
  solution map on every run, use it to choose narrower docs and code paths, and
  update it when the work changes ownership, routing, invariants, flows, stop
  signs, verification lanes, or exposes drift in the map.
- Deterministic opportunity: if repeated Codex tasks expose stable routing
  mistakes, update the helper or promote the pattern into repo tooling,
  templates, or generated inventories instead of relying on freeform memory.
- Agent autonomy impact: the helper does not widen agent authority or replace
  the autonomy rubric, action contract, source code, or focused tests. Agents
  still need to read the governed source docs before changing assistant,
  action-request, policy, automation, or deterministic algorithm behavior.
- Tests or evidence: docs-only link and reference inspection.
- Follow-up: keep the helper short, avoid review-only churn, and refresh it
  when major route, workspace, domain ownership, MCP, Codex dispatch, or
  assistant-governance seams move.

### 2026-05-24 - Price Publications Abstain From Commercial Side Tags

- Type: algorithm-added
- Domain: document ingestion, deterministic facet suggestion, and market-data
  document review
- Applies to: `PRICE_PUBLICATION` documents, commercial-side facet
  suggestions, commodity facet suggestions, and Library tag review
- Status: implemented
- Source: `apps/api/app/domains/documents/services/document_facets.py` and
  `apps/api/tests/test_document_ingestion_api.py`
- Lesson: price publication reports are market-data evidence, not the
  company's purchase or sale intent. Even when their text mentions purchase or
  sales language, the deterministic facet suggester should abstain from
  `Purchase/Sale` tags and only suggest product/commodity tags supported by
  visible report content.
- Deterministic opportunity: expand product-term coverage through controlled
  commodity/reference-data mappings as reviewed price-report examples reveal
  recurring rows such as diesel, soybean meal, or other agriculture products.
- Agent autonomy impact: agents may explain why a price report has no
  commercial side, but should not route market-data publications as buy/sell
  workflow evidence without a separate governed action.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_document_facet_suggester_abstains_from_price_publication_side_and_tags_products`
- Follow-up: consider replacing static document commodity facet options with
  active reference commodity records once facet review needs full commodity
  master coverage.

### 2026-05-24 - OCR Text Still Feeds Controlled Tag Suggestions

- Type: algorithm-added
- Domain: document ingestion, OCR fallback, deterministic facet suggestion, and
  Library tag review
- Applies to: OCR-backed document pages, `SYSTEM_DERIVED` page-level facet
  suggestions, commodity aliases, and Library review flags
- Status: implemented
- Source: `apps/api/app/domains/documents/services/document_facets.py` and
  `apps/api/tests/test_document_ingestion_api.py`
- Lesson: OCR fallback should lower trust and preserve the review flag, but it
  should not suppress controlled tag suggestions. If OCR text contains a
  recognized controlled facet signal such as WTI, Brent, diesel, ULSD, soybean
  meal, pipeline, or purchase/sale terms, persist the tag as a reviewable
  `SYSTEM_DERIVED` suggestion with source and review provenance.
- Deterministic opportunity: keep expanding OCR-tolerant commodity aliases from
  reviewed examples, then migrate the static alias list toward governed
  reference-data mappings once the controlled commodity catalog is authoritative
  for document review.
- Agent autonomy impact: agents may explain that OCR-backed tags need human
  confirmation; they must not treat OCR-backed suggested tags as authority to
  mutate trade, settlement, logistics, risk, or compliance records without a
  separate governed action.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_ocr_fallback_is_used_when_native_text_is_missing apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_document_facet_suggester_extracts_starter_tags_from_text apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_document_facet_suggester_abstains_from_price_publication_side_and_tags_products`

### 2026-05-24 - Packing Lists Are Shipment Evidence

- Type: algorithm-added
- Domain: document ingestion, deterministic classification, schema registry,
  logistics routing, and Library review
- Applies to: `PACKING_LIST` uploads, delivery order references, customer
  references, packed goods tables, package counts, gross/net/tare weights, and
  movement-document routing
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_ingestion_analysis.py`,
  `apps/api/app/domains/documents/services/schema_registry.py`,
  `apps/api/app/domains/documents/services/document_routing.py`,
  `apps/api/tests/test_document_ingestion_api.py`, and
  `apps/api/tests/fixtures/document_classification_eval_corpus.json`
- Lesson: packing lists are a distinct logistics document kind rather than an
  `OTHER` fallback or a weak bill-of-lading proxy. They identify packed goods,
  packages, weights, delivery order numbers, customer references, and movement
  dates, which changes extraction and delivery matching enough to justify a
  first-class `PACKING_LIST` kind.
- Deterministic opportunity: as reviewed examples accumulate, map recurring
  delivery order and customer reference fields to governed delivery reference
  fields instead of relying on ad hoc freeform linkage.
- Agent autonomy impact: agents may explain packing-list evidence and suggest
  delivery linkage, but shipment updates, actualization, or record creation
  still require typed services and governed review paths.
- Tests or evidence: `make api-document-classification-evals` and focused
  ingestion tests.
- Follow-up: add reviewed replay examples for multi-page packing lists and
  scanned/poor-OCR packing slips before increasing routing autonomy.

### 2026-05-24 - COA Assay Tables Override Sales Order Field Noise

- Type: algorithm-added
- Domain: document ingestion, deterministic classification, quality evidence,
  and Library review
- Applies to: `CERTIFICATE_OF_ANALYSIS` pages with assay-result tables,
  customer-reference fields, product fields, delivery numbers, batch numbers,
  and weak or missing title OCR
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_classification_scoring.py`,
  `apps/api/app/domains/documents/services/document_ingestion_analysis.py`,
  `apps/api/tests/test_document_ingestion_api.py`, and
  `apps/api/tests/fixtures/document_classification_eval_corpus.json`
- Lesson: a quality-results table with columns such as Test Description, Unit,
  Min, Max, Result, and Method is Certificate of Analysis evidence even when
  OCR misses the title line. Product, quantity, and customer-reference text
  alone must not promote the page to `SALES_ORDER` unless sales-order identity
  evidence is present.
- Deterministic opportunity: keep expanding assay-column aliases from reviewed
  COA examples, and promote recurring quality fields such as batch number,
  manufacturing date, and despatch date into governed quality extraction when
  downstream quality records are introduced.
- Agent autonomy impact: agents may explain COA evidence and suggest quality
  linkage, but creating or updating quality, delivery, or trade records still
  requires typed services and governed review paths.
- Tests or evidence: focused ingestion regression plus
  `make api-document-classification-evals`.
- Follow-up: add reviewed replay examples for scanned COAs where the title is
  OCR-noisy but assay tables are legible.

### 2026-05-24 - Document Title Lines Are Strong Type Evidence

- Type: algorithm-added
- Domain: document ingestion, deterministic classification, OCR text handling,
  and Library review
- Applies to: extracted title lines in the first page text lines, including
  scanned forms where the title is visible but downstream fields or table
  headers are fragmented
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_classification_scoring.py`,
  `apps/api/tests/test_document_ingestion_api.py`, and
  `apps/api/tests/fixtures/document_classification_eval_corpus.json`
- Lesson: when a supported document kind keyword appears as a standalone title
  line near the top of extracted text, the classifier should treat it as
  stronger evidence than an ordinary in-body keyword. The title still does not
  bypass structured field, table, ambiguity, OCR, or review checks.
- Deterministic opportunity: if the processor starts preserving OCR bounding
  boxes or font/layout cues, promote this from exact extracted-line matching to
  a layout-aware title detector with auditable evidence.
- Agent autonomy impact: agents may explain that a visible title materially
  supports classification, but downstream record creation or linkage remains
  governed by typed services and review.
- Tests or evidence: focused packing-list title regression plus
  `make api-document-classification-evals`.
- Follow-up: add reviewed replay examples for titles split across OCR lines or
  title text embedded in logos/stamps.

### 2026-05-24 - Document Type Tags Mirror Classification

- Type: algorithm-added
- Domain: document ingestion, deterministic facet suggestion, classification
  review, and Library tags
- Applies to: page-level document kind classification, `document_type` facet
  values, classifier output, reviewer classification corrections, and tag
  display in document review surfaces
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_facets.py`,
  `apps/api/app/domains/documents/services/ingestion.py`,
  `apps/api/tests/test_document_ingestion_api.py`, and
  `apps/web/src/features/documents/DocumentFacetEditor.tsx`
- Lesson: the classifier's page-level document kind should be visible as a
  system-derived tag. The durable classification remains `page.document_kind`;
  the `document_type` facet mirrors that value for review and filtering
  alongside commodity, purchase/sale, transport mode, and asset tags.
- Deterministic opportunity: if operators repeatedly filter or route by
  document type tags, keep the tag as a deterministic mirror of classification
  rather than letting tag edits diverge from `document_kind`.
- Agent autonomy impact: agents may explain the classification tag, but should
  change document type through the governed classification correction path, not
  by editing the derived tag alone.
- Tests or evidence: focused document facet and ingestion tests.
- Follow-up: include reviewed examples in replay exports if document-type tag
  behavior becomes part of broader document review analytics.

### 2026-05-24 - Packet Splits Are Persisted Logical Documents

- Type: algorithm-added
- Domain: document ingestion, logical document segmentation, classification,
  review, and audit provenance
- Applies to: uploaded PDF packets, `DocumentLogicalDocument`,
  `analysis_summary.document_classification_scope`, page-range attribution,
  packet split activity events, and Library review serialization
- Status: implemented
- Source:
  `apps/api/app/models/document_logical_document.py`,
  `apps/api/app/domains/documents/services/document_logical_documents.py`,
  `apps/api/app/domains/documents/services/document_ingestion_review.py`,
  and `apps/api/tests/test_document_ingestion_api.py`
- Lesson: an uploaded file is only the source artifact. Classification and
  review should address persisted logical documents inside that file, with each
  logical document carrying a stable key, page range, source page ids/page
  numbers, classification status, review status, and split provenance.
- Deterministic opportunity: replace the first contiguous page-kind grouping
  rule with richer structure objects once reviewed packets reveal separators,
  cover pages, repeated same-kind documents, attachments, sheets, or sections.
- Agent autonomy impact: agents may explain or triage packet splits, but they
  should not collapse a packet back to one file-level business document or
  mutate downstream records without the logical-document evidence and governed
  action path.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_packet_upload_persists_logical_documents_with_page_range_provenance apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_packet_split_activity_records_auditable_page_ranges`
- Follow-up: add logical-document-specific extraction/review endpoints before
  increasing routing or approval autonomy for mixed packets.

### 2026-05-23 - User AI Context Is Preference Context Only

- Type: lesson
- Domain: assistant prompt context, user profile configuration, and persona
  interpretation
- Applies to: saved user profile blurbs, default persona selection, prompt
  assembly, managed-agent delegation, and assistant response tailoring
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/prompt_context.py`,
  `apps/api/app/routes/auth.py`, and
  `apps/web/src/workspaces/settings/SettingsWorkspace.tsx`
- Lesson: user-authored AI context belongs in the authenticated user prompt
  section as background and preference context. It can help the assistant
  choose terminology, ordering, and response detail, but it is not executable
  instruction content and must be explicitly bounded from permissions, row
  access, allowed tools, allowed actions, reviewer roles, and deterministic
  policy checks.
- Deterministic opportunity: if the same saved preferences repeatedly drive
  accepted workflow choices, promote those choices into typed user settings or
  deterministic workspace defaults rather than expanding the freeform blurb.
- Agent autonomy impact: agents may use profile context to personalize
  explanations and triage framing, but it does not increase autonomy or permit
  business writes without the existing action-request and authority controls.
- Tests or evidence:
  `apps/api/tests/test_auth_http.py`,
  `apps/api/tests/test_assistant_api.py`,
  `apps/api/tests/test_user_accounts_api.py`, and
  `apps/web/tests/settingsWorkspace.test.ts`
- Follow-up: add narrower typed user preferences when repeated profile blurbs
  expose stable product behavior.

### 2026-05-23 - Home View Instances Need Typed Definitions And Recipes

- Type: algorithm-candidate
- Domain: Prompt Home, user extensibility, assistant action governance, and
  saved operating views
- Applies to: Home card placement, card visibility, card filters, named Home
  view instances, assistant-created views, persona-aware view suggestions, and
  future shared desk Home layouts
- Status: implemented incrementally for personal Home view definitions,
  approval-gated assistant creation, and the first deterministic recipe layer;
  shared publication and broad recipe promotion remain follow-ups.
- Source:
  [Home View Instances Work Packages](./home-view-instances-work-packages.md),
  [User Extensibility Initiative](./user-extensibility-initiative.md),
  [Agent Action Request Contract](./agent-action-request-contract.md),
  `apps/api/app/domains/assistant/services/tools.py`,
  `apps/api/app/domains/assistant/services/action_planners.py`, and
  `apps/api/app/domains/home_views/services/recipes.py`
- Lesson: configurable Home should use immutable system templates, typed card
  registries, and persisted view definitions rather than browser-local state or
  freeform assistant JSON. Agents may interpret natural-language requests such
  as `Make me a view to see HH NG`, but durable saved views should persist
  through typed services, validated card ids, validated filters, permissions,
  audit, and reviewable action requests.
- Deterministic opportunity: HVI-09 added a Home view recipe registry for
  `hub_basis_watch`, `commodity_market_watch`, `imminent_shipments`,
  `settlement_exception_watch`, and `document_review_queue` with explicit
  inputs, card outputs, assumptions, stop conditions, tests, and review
  preview metadata. Expand recipe behavior only when accepted/rejected outcomes
  show stable reviewer preferences and the needed Home card surfaces exist.
- Agent autonomy impact: persona can shape card emphasis and recipe defaults,
  but it must not widen permission, row access, tools, action types, reviewer
  roles, or shared-publication authority. The governed
  `create_home_view_instance` action is approval-gated, personal-scope only,
  and still persists through typed Home definition services rather than
  freeform model output.
- Tests or evidence: HVI-07 added focused assistant tooling coverage and
  `make api-assistant-evals` for read-only Home catalog and visible-instance
  inspection. HVI-08 added action staging/execution coverage for HH NG,
  duplicate-name, invalid-card, ambiguous-request, and invalid-filter paths.
  HVI-09 added `apps/api/tests/test_home_view_recipes.py`, persona-emphasis API
  coverage, and assistant evals for risk-persona HH NG recipe staging. HVI-10
  adds explicit outcome metrics for approved-as-is, corrected, rejected,
  duplicate, and invalid Home view action outcomes plus browser smoke for
  prompt-created Home view approval and opening the saved instance.
- Follow-up: use HVI-10 recipe outcome review before broadening autonomous
  recipe promotion, and keep shared/team Home publication human/API-owned until
  a separate governed action and approval model exists.

### 2026-05-22 - OpenAI Structured Outputs Need Explicit Strict Schemas

- Type: lesson
- Domain: document AI processing, OpenAI Responses API integration, and
  schema-governed extraction
- Applies to: OpenAI `response_format` JSON schemas, document reprocessing,
  table extraction payloads, and any future strict structured-output contract
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_processor.py` and
  `apps/api/tests/test_document_ingestion_api.py`
- Lesson: Pydantic's default JSON schema can mark optional fields as not
  required, but OpenAI strict structured outputs require every object property
  to appear in `required` and require `additionalProperties: false` on each
  object. Dynamic table row dictionaries do not fit that contract cleanly, so
  the OpenAI-facing schema should use fixed row objects with `cells` arrays and
  normalize them back into internal row dictionaries after parsing.
- Stop condition: do not send a generated schema to OpenAI strict mode unless
  tests recursively verify required keys and `additionalProperties: false`.
- Agent autonomy impact: agents may update extraction prompts and schemas, but
  any schema handed to an external model provider must be covered by contract
  tests before enabling live document processing.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_openai_document_processor_uses_strict_json_schema_format apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_openai_document_processor_inlines_small_pdf_payloads`

### 2026-05-22 - Buyer And Seller Labels Do Not Determine Commercial Side

- Type: algorithm-added
- Domain: document ingestion, deterministic facet suggestion, and document
  review
- Applies to: commercial-side facet suggestions, purchase orders, sales orders,
  trade confirmations, contracts, and any document that lists both buyer and
  seller parties
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_facets.py` and
  `apps/api/tests/test_document_ingestion_api.py`
- Lesson: party labels such as buyer and seller are role labels, not enough
  evidence for the company's commercial side. The facet suggester should not
  mark both `BUY` and `SELL` just because both parties are named on a document.
  For `PURCHASE_ORDER`, suggest only `BUY`; for `SALES_ORDER`, suggest only
  `SELL`; otherwise require explicit purchase/buy/sale/sell language or a
  reviewer decision.
- Stop condition: when a document names both parties but lacks explicit side
  evidence from the company's perspective, leave commercial-side ambiguous
  instead of adding both values.
- Agent autonomy impact: agents may explain buyer/seller evidence and ask for
  reviewer confirmation, but should not route or mutate business records from
  party labels alone.
- Tests or evidence: focused document facet suggester tests and
  `make api-document-classification-evals`

### 2026-05-22 - Weak Filename-Only Document Hints Fall Back To Other

- Type: algorithm-added
- Domain: document ingestion, deterministic classification, schema registry,
  and document review
- Applies to: blank or textless uploads, filename-only evidence, deterministic
  scoring, document AI normalization prompts, Library type selection, and
  classification evals
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_classification_scoring.py`,
  `apps/api/app/domains/documents/services/document_processor.py`, and
  `apps/api/tests/fixtures/document_classification_eval_corpus.json`
- Lesson: filename-only hints are not sufficient business evidence for a typed
  document kind. When no extractable content confirms the hinted type, place
  the page in `OTHER` with subtype `FILENAME_HINT_ONLY`, low confidence, and a
  manual-review conflict instead of forcing the nearest supported document kind.
- Stop condition: keep the page in `OTHER` until text extraction, OCR, or a
  reviewer supplies enough content evidence to classify it.
- Agent autonomy impact: agents may explain the filename hint and suggest likely
  next review actions, but they should not route, match, or mutate business
  records from filename-only type evidence.
- Tests or evidence: `make api-document-classification-evals`

### 2026-05-22 - Purchase Orders Are A First-Class Document Kind

- Type: algorithm-added
- Domain: document ingestion, deterministic classification, schema registry,
  and document review
- Applies to: purchase-order uploads, document schema registry, deterministic
  scoring, document AI normalization prompts, Library type selection, and
  classification evals
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_ingestion_analysis.py`,
  `apps/api/app/domains/documents/services/schema_registry.py`, and
  `apps/api/tests/fixtures/document_classification_eval_corpus.json`
- Lesson: purchase orders should not be inferred as logistics tickets or kept
  as only a purchase/sale tag. PO number, buyer/seller, commodity, quantity,
  vessel, and delivery context change extraction, matching, and trade creation
  workflows enough to justify a dedicated `PURCHASE_ORDER` kind while leaving
  commercial side and transport mode as controlled facets.
- Deterministic opportunity: if reviewers repeatedly correct PO examples into
  trade-create candidates, add a typed purchase-order-to-trade action planner
  with owner gates, idempotency, stale-state checks, and explicit trade
  economics review.
- Agent autonomy impact: agents may explain PO evidence and draft matching or
  trade-create recommendations, but PO-created trade records must still flow
  through typed services and reviewable action contracts.
- Tests or evidence: `make api-document-classification-evals`
- Follow-up: collect reviewed PO examples, especially scanned vessel supply
  orders, to tune OCR confidence and matching thresholds.

### 2026-05-22 - Assistant Personas Are Interpretation Context Only

- Type: lesson
- Domain: assistant prompt foundation, user context, and managed-agent runs
- Applies to: `/assistant/context`, `/assistant/respond`, prompt preview, run
  traces, user-account defaults, and assistant console persona selection
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/personas.py`,
  `apps/api/app/domains/assistant/services/prompt_context.py`,
  `apps/api/app/models/user_account.py`, and
  `docs/engineering/ai-workflow.md`
- Lesson: persona context should be a first-class prompt section that explains
  how to interpret ambiguous user requests for operator, trader, risk, admin,
  operations, settlement, or reference-data work. It should not be hidden in
  ad hoc prompt prose. Each user has a saved default persona for normal chat
  and agent interactions, while request-level surfaces may override it at a
  particular juncture. The prompt section must explicitly say that persona does
  not alter authenticated role, permissions, tool access, action types,
  reviewer roles, or deterministic policy checks.
- Deterministic opportunity: if users repeatedly select the same persona to
  route prompts within a workspace, promote that routing into a team or
  workspace context profile rather than relying on repeated request overrides.
- Agent autonomy impact: personas can improve framing and terminology across
  chat and managed-agent interactions without widening autonomy. Authority
  still comes from managed-agent policy, typed action contracts, and human or
  policy-controlled review.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_assistant_api.AssistantApiTests.test_assistant_prompt_context_preview_includes_business_user_and_data_sections apps.api.tests.test_assistant_api.AssistantApiTests.test_assistant_prompt_context_persona_can_be_overridden_per_request apps.api.tests.test_assistant_api.AssistantApiTests.test_assistant_prompt_context_uses_user_default_persona_before_role_fallback`
- Follow-up: evaluate team and workspace persona defaults once context-profile
  work packages are implemented.

### 2026-05-20 - Price Publication Workflows Need Typed Market-Data Loaders

- Type: algorithm-added
- Domain: document workflows, market-data ingestion, price-index
  observations, and Library actions
- Applies to: `PRICE_PUBLICATION` documents, the Library Workflows action,
  `process_prices`, `price_index_observations`, `external_data_runs`, and
  document record-link provenance
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_workflows.py`,
  `apps/api/app/routes/documents.py`, and
  `apps/web/src/workspaces/library/LibraryWorkspace.tsx`
- Lesson: document-created price observations must run through a named,
  typed document workflow instead of a generic attachment action or freeform
  assistant mutation. The first approved workflow is `Process Prices` for
  `PRICE_PUBLICATION` / Price Publication Report documents, and it requires a
  verified document, configured active price-index codes, deterministic row
  extraction, idempotent upsert keys, an `external_data_runs` audit row, and
  document links back to loaded observations and price indices.
- Deterministic opportunity: add persisted workflow definitions and approval
  policy only after more document-type workflows need runtime configuration;
  keep the execution service as the source of market-data truth until then.
- Agent autonomy impact: agents may explain or route users to the Library
  workflow, but price-table writes remain a deterministic workflow execution
  behind role checks and reviewed document evidence.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_workflows_service`
  and `npm --prefix apps/web run test -- libraryWorkspace.test.ts`
- Follow-up: add browser smoke coverage once more custom document workflows
  share this Library popup pattern.

### 2026-05-20 - Document Matching Workflows Need Deterministic Owner Gates

- Type: algorithm-candidate
- Domain: document ingestion, record matching, workflow action planning, and
  Library workflow execution
- Applies to: document schema registry targets, linkage scoring, document
  action plans, create-from-document workflows, and future Library `Workflows`
  actions
- Status: proposed
- Source: [Document Record Matching And Workflows](./document-record-matching-workflows.md)
- Lesson: document matching should resolve through deterministic record-target
  metadata, normalized extracted identifiers, ranked candidates, owner
  requirements, and governed workflow keys. A document can suggest a new trade,
  shipment, invoice, payment, quality record, or compliance record, but
  creation must stay behind typed services, review rules, idempotency, and
  stale-state checks.
- Deterministic opportunity: add workflow metadata to the schema registry,
  promote linkage thresholds and owner requirements into named policy
  constants, and add create-candidate planners for trade and delivery records
  before exposing those actions from the Library workflow button.
- Agent autonomy impact: agents may explain match evidence, compare candidate
  records, and draft workflow payloads, but they should stage creation actions
  only after a workflow has a typed payload, owner gate, policy checks, and
  tests. Freeform extraction output must not directly create business records.
- Tests or evidence: current document routing, linkage, action-planning,
  governance, and execution service tests cover the first attach/create slices;
  new trade-from-document and delivery-from-document slices need focused
  service tests plus assistant evals when agents can stage them.
- Follow-up: wire the Library `Workflows` button to a workflow summary powered
  by schema-registry workflow keys, action-plan governance, and candidate
  evidence.

### 2026-05-19 - Workbook Reports Need Immutable Runs And Deterministic Formulas

- Type: algorithm-candidate
- Domain: reporting, extensibility, formulas, workbook artifacts, and
  assistant-drafted reports
- Applies to: future `report_definitions`, `workbook_definitions`,
  `workbook_sheet_definitions`, `formula_definitions`, report/workbook runs,
  Excel-style imports, and report artifacts
- Status: proposed
- Source: [Excel-Style Reporting Architecture](./excel-style-reporting-architecture.md)
- Lesson: Excel-style reporting should be modeled as governed workbook and
  report definitions over curated semantic datasets, with deterministic formula
  validation and immutable report/workbook runs. Spreadsheet familiarity should
  not create a side channel around typed services, permissions, lineage,
  freshness, or audit.
- Deterministic opportunity: add semantic dataset definitions, workbook
  definitions, formula parsing/validation/evaluation, dependency edges,
  immutable runs, and generated artifacts before allowing shared report
  publication or assistant-authored report packs.
- Agent autonomy impact: agents may draft workbook definitions, suggest
  formulas, and summarize completed runs, but they must not be the source of
  trusted formula values or claim execution/publication without a typed service
  result. Shared publication should stay governed by permissions or staged
  action review.
- Tests or evidence: implementation should add service tests for formula type
  safety, allowed functions, dependency cycles, lineage, row-level access,
  immutable run replay, artifact generation, and assistant evals when agents can
  draft report/workbook definitions.
- Follow-up: start with the settlement pack vertical slice described in the
  architecture note before opening broader spreadsheet import or freeform
  builder capabilities.

### 2026-05-19 - Semantic Dataset Registry Starts As Metadata

- Type: algorithm-added
- Domain: reporting, semantic datasets, workbook inputs, and UI source
  discovery
- Applies to: `/reports/datasets`, `/reports/datasets/{dataset_id}/schema`,
  the Reports workspace source catalog tile, and future workbook/report
  builders
- Status: implemented
- Source:
  `apps/api/app/domains/reports/services/semantic_datasets.py`,
  `apps/api/app/domains/reports/routes/http.py`, and
  `apps/web/src/workspaces/reports/ReportsWorkspace.tsx`
- Lesson: the first executable reporting-builder slice should expose approved
  semantic dataset contracts before adding workbook definitions, formulas, run
  persistence, or import/export. A metadata-only registry lets the UI and future
  assistant tooling discover safe report inputs without granting raw table
  access.
- Deterministic opportunity: evolve the static registry into persisted
  `semantic_dataset_definitions` only after the field schema, access policy,
  freshness metadata, and workbook source UX prove stable.
- Agent autonomy impact: agents may refer to the dataset catalog when drafting
  workbook/report ideas, but they still cannot execute formulas, publish shared
  reports, or treat catalog metadata as row data.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_reports_api.ReportsApiTests.test_semantic_dataset_catalog_lists_workbook_ready_sources apps.api.tests.test_reports_api.ReportsApiTests.test_semantic_dataset_schema_endpoint_returns_one_dataset_or_404`
  and `npm --prefix apps/web run build`.
- Follow-up: next phase should add draft workbook/report definition contracts
  that reference these dataset IDs instead of inventing source names inline.

### 2026-05-19 - Report Definition Validation Runs Before Persistence

- Type: algorithm-added
- Domain: reporting, workbook definitions, semantic dataset references,
  parameter validation, and dependency lineage
- Applies to: `/reports/definitions/validate`,
  `/reports/workbooks/validate`, draft report/workbook schemas, and future
  persisted definition services
- Status: implemented
- Source:
  `apps/api/app/domains/reports/services/definition_validation.py`,
  `apps/api/app/domains/reports/routes/http.py`, and
  `apps/api/app/schemas/report.py`
- Lesson: workbook/report builders should validate draft source references,
  selected fields, declared parameters, duplicate keys, and sheet dependencies
  before any definition is persisted or executed. Validation should return a
  typed issue list and dependency graph so UI and assistant flows can explain
  what will be used without mutating business records.
- Deterministic opportunity: promote this validation contract into the
  persisted definition service when lifecycle/versioning is added; do not let
  assistants bypass it when drafting reports or formulas.
- Agent autonomy impact: agents may assemble draft definitions and submit them
  for validation, but only typed services should decide whether references,
  parameters, and dependencies are acceptable.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_reports_api`
- Follow-up: add persisted draft/published/retired definitions and reuse this
  validator before saving, publishing, or running any workbook.

### 2026-05-19 - Report Definitions Persist Only After Typed Validation

- Type: algorithm-added
- Domain: reporting, workbook definitions, lifecycle governance, versioning,
  publication permissions, and audit
- Applies to: `report_definitions`, `workbook_definitions`,
  `/reports/definitions`, `/reports/workbooks`, definition publish/retire
  routes, and future run execution
- Status: implemented
- Source:
  `apps/api/app/domains/reports/services/definitions.py`,
  `apps/api/app/models/report_definition.py`,
  `apps/api/app/models/workbook_definition.py`, and
  `apps/api/app/domains/reports/routes/http.py`
- Lesson: persisted report and workbook definitions should store validated
  definition JSON, validation results, dependency references, lifecycle state,
  version counters, and audit metadata together. Invalid drafts should not be
  saved, published, or used as run inputs.
- Deterministic opportunity: reuse this lifecycle service when adding
  immutable runs, formula evaluation, assistant-authored drafts, or scheduled
  report jobs. Shared/global publication remains a permissioned service action,
  not a client or assistant convention.
- Agent autonomy impact: agents may draft definitions and submit them to the
  create/update endpoints, but publication and retirement must flow through the
  typed lifecycle service and its permission checks.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_reports_api` and
  `./.venv/bin/python -m unittest apps.api.tests.test_layout_definitions_api.LayoutDefinitionsApiTests.test_layout_definitions_are_scoped_to_user_and_workspace`
- Follow-up: build the definition list/editor UI over these persisted records,
  then add immutable run records that can only reference published definitions.

### 2026-05-24 - Workbook Assembly Starts From Registered Typed Reports

- Type: algorithm-added
- Domain: reporting, workbook generation, semantic dependency resolution, and
  projection-backed report outputs
- Applies to:
  `apps/api/app/domains/reports/services/report_registry.py`,
  `apps/api/app/domains/reports/services/workbook_runtime.py`, and future
  report/workbook run services
- Status: implemented
- Source:
  `apps/api/app/domains/reports/services/report_registry.py`,
  `apps/api/app/domains/reports/services/workbook_runtime.py`, and
  `apps/api/tests/test_report_workbook_runtime.py`
- Lesson: executable Excel-style report slices should start as code-owned,
  registered report definitions with declared workbook sheets, columns,
  parameters, and semantic dataset dependencies. Renderers may load governed
  in-system data, but the workbook assembler must reject undeclared sheets,
  columns, parameters, or unsupported cell value types before producing a
  workbook snapshot.
- Deterministic opportunity: extend the registry-backed runtime into immutable
  workbook/report runs and artifacts after the contract, dependency graph, and
  row-boundary checks are stable.
- Agent autonomy impact: agents may request or summarize registered workbook
  outputs, but they should not invent workbook cells or formula values outside
  the typed registry and assembly contract.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_report_workbook_runtime`
- Follow-up: add persisted run snapshots and artifact generation that reuse the
  same contract before widening report execution to assistant-drafted workbook
  definitions or formula sheets.

### 2026-05-17 - Mixed Document Packets Require Page-Level Classification

- Type: algorithm-added
- Domain: document ingestion, logical document segmentation, routing, and review
- Applies to: `analysis_summary.document_classification_scope`,
  `analysis_summary.document_classification_kind`,
  `analysis_summary.page_level_classification_required`, and mixed-packet
  routing decisions
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_ingestion_review.py` and
  `apps/api/app/domains/documents/services/document_routing.py`
- Lesson: an uploaded file may be assigned a document-level kind only when every
  page resolves to the same non-unknown document kind. If pages differ, the file
  is a packet and its canonical classification scope is page-level; the summary
  should surface `dominant_document_kind=MIXED` rather than promoting a majority
  page kind to document truth.
- Deterministic opportunity: persist logical-document boundaries so mixed
  packets can route each page group independently instead of relying on a single
  document-level routing assessment.
- Agent autonomy impact: agents can explain mixed packet classification, but
  they should not choose one dominant document kind for the whole file unless
  the deterministic page-kind check is homogeneous.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_summary_classifies_homogeneous_upload_at_document_level apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_summary_requires_page_level_classification_for_mixed_upload`
- Follow-up: add a persisted logical-document table when page groups need
  independent extraction, routing, or approval workflows.

### 2026-05-17 - Document Extraction Starts With Artifact And Structure Profiling

- Type: algorithm-added
- Domain: document ingestion, extraction schemas, structure profiling,
  validation, and review governance
- Applies to: `analysis_summary.artifact_profile`,
  `analysis_summary.structure_profile`, `analysis_summary.extraction_plan`,
  schema-registry extraction objects, and future extraction-run staging tables
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_ingestion_review.py`,
  `apps/api/app/domains/documents/services/schema_registry.py`, and
  `docs/engineering/document-extraction-architecture.md`
- Lesson: extraction should not jump straight from file upload to model output.
  The durable path is artifact profile, logical-document estimate, structure
  profile, schema-selected extraction plan, constrained extraction,
  normalization, validation, generic audit rows, canonical staging rows, and
  then linkage or review. The current PDF runtime now exposes a first
  `artifact_profile`, `structure_profile`, and `extraction_plan` in document
  summaries while the schema registry names starter extraction objects for
  invoice, BOL, COA, ticket, settlement, and trade-confirmation documents.
- Deterministic opportunity: persist artifact profiles, content units,
  structure objects, table profiles, extraction runs, extracted fields/cells,
  document references, and canonical staging rows before widening extraction to
  Excel, Word, CSV, images, or emails. Native parsers should own physical
  structure; AI should label semantic structure and extract schema-constrained
  values with evidence.
- Agent autonomy impact: agents may explain extraction evidence or suggest
  schema/template improvements, but they should not treat freeform model output
  as business-ready data. Writes must flow through typed staging, validation,
  review, and application services.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_upload_pdf_creates_document_and_page_records apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_schema_registry_exposes_supported_document_contracts`
- Follow-up: add persisted extraction-run and generic extraction audit tables,
  then add canonical invoice/BOL/COA staging tables behind review rules.

### 2026-05-17 - Document Taxonomy Uses Families Plus Controlled Facets

- Type: algorithm-added
- Domain: document ingestion, document taxonomy, deterministic classification,
  and Library review
- Applies to: `documents/schema-registry`, document-kind selection,
  invoice/BOL classification, future facet persistence, and document routing
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/schema_registry.py`,
  `apps/api/app/schemas/document.py`, and
  `docs/engineering/document-taxonomy-trading-shipping.md`
- Lesson: document kinds should stay shallow and behavior-driven while typed
  facets carry combinable dimensions such as invoice economic purpose, invoice
  stage, AP/AR direction, source party role, dispute state, line charge type,
  BOL transport mode, legal role, cargo status, and original/copy status.
  `UNKNOWN` remains a classification state and `OTHER` remains a review-needed
  fallback, not normal taxonomy destinations.
- Deterministic opportunity: when a recurring document distinction appears,
  first decide whether it changes extraction schema, matching/reconciliation,
  legal or operational role, downstream record mutation, or approval workflow.
  If not, add or reuse a controlled facet value instead of creating another
  document kind. Persisted facet values should eventually carry confidence,
  source, and review provenance.
- Agent autonomy impact: agents may suggest document kinds and facet values,
  but deterministic routing, matching, and action planning should rely on the
  typed schema registry and future reviewed facet rows rather than freeform
  tags or prompt-only subtype names.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_schema_registry_exposes_supported_document_contracts`
- Follow-up: add a persisted `DocumentFacet`/logical-document model when the
  review UI is ready to capture actual facet values per page or packet.

### 2026-05-17 - Truck Tracking Exceptions Are Deterministic Read Models First

- Type: algorithm-added
- Domain: truck tracking, exception triage, ETA, dwell, and signal freshness
- Applies to: truck movement summaries, `tracking_health`,
  `/truck-movements/{movement_id}/tracking-health`,
  `/truck-tracking/exceptions`, shipment truck UI, and scheduling/operations
  exception queues
- Status: implemented
- Source:
  `apps/api/app/domains/operations/services/truck_tracking.py`,
  `apps/api/app/domains/operations/routes/truck_tracking.py`,
  `apps/api/tests/test_truck_tracking_api.py`,
  `apps/web/src/workspaces/shipments/DeliveryTruckWorkflowEditor.tsx`,
  `apps/web/src/workspaces/operations/TruckTrackingExceptionQueue.tsx`, and
  `apps/web/tests/browser/smokeHarness.spec.ts`
- Lesson: truck ETA, stale-signal, and dwell exceptions now come from a typed
  deterministic read model instead of ad hoc operator judgment or assistant
  prose. The service classifies ETA, signal freshness, and dwell separately,
  then rolls those states into `CLEAR`, `WATCH`, or `ACTION_REQUIRED` with a
  named primary exception.
- Deterministic opportunity: workflow-item creation should remain a separate
  explicit policy layer that consumes `tracking_health`. Do not let raw
  signals, UI labels, or assistant summaries create exception work items until
  the rule owner approves idempotency, ownership, suppression, and closure
  behavior.
- Agent autonomy impact: agents may explain why a truck run is late, stale, or
  dwelling by citing `tracking_health`, but they should not invent thresholds
  or mutate workflow state from their own interpretation.
- Tests or evidence:
  `.venv/bin/python -m unittest apps.api.tests.test_truck_tracking_api` and
  `npm --prefix apps/web run test:smoke -- --grep "shipments truck workflow|truck tracking exceptions"`
- Follow-up: define the workflow item auto-create/update contract only after
  owner review; the current operations/scheduling queues are intentionally
  read-only consumers of `tracking_health`.

### 2026-05-17 - Truck Tracking Signals Stay Evidence Until Accepted

- Type: algorithm-added
- Domain: truck tracking, telemetry evidence, and movement freshness
- Applies to: `delivery_tracking_signals`, truck movement signal ingest,
  provider/manual tracking updates, stop matching, and ETA freshness
- Status: implemented
- Source:
  `apps/api/app/domains/operations/services/truck_tracking.py` and
  `apps/api/tests/test_truck_tracking_api.py`
- Lesson: raw truck updates now land through an append-only normalized tracking
  signal path before any business milestone is accepted. The ingest service
  creates deterministic dedupe keys from provider event identity or normalized
  movement/signal fields, returns existing rows as duplicates, validates
  optional stop references, and records `MATCHED`, `UNRESOLVED`, or `REJECTED`
  processing status without creating `DeliveryEvent` milestones.
- Deterministic opportunity: keep provider-specific adapters outside business
  mutation logic. Downstream services should consume the normalized signal
  record and only promote a signal into a checkpoint through explicit
  checkpoint/milestone acceptance rules with source evidence.
- Agent autonomy impact: agents may summarize tracking signals, explain why a
  signal was duplicate or rejected, and draft follow-up work. They must not
  turn raw telemetry into actualization, settlement, or accepted movement
  history without the typed checkpoint or actualization services.
- Tests or evidence:
  `.venv/bin/python -m unittest apps.api.tests.test_truck_tracking_api`
- Follow-up: provider adapters should call the same ingest service and add
  adapter fixture tests before enabling automatic checkpoint acceptance from
  external feeds.

### 2026-05-17 - Truck Checkpoint Status Projection Must Be Sequence-Safe

- Type: algorithm-added
- Domain: truck tracking, delivery events, and movement status projection
- Applies to: manual truck checkpoint capture, `CHECKPOINT_RECORDED`,
  `EVENT_REVERSED`, delivery truck stops, and delivery truck movements
- Status: implemented
- Source:
  `apps/api/app/domains/operations/services/truck_tracking.py` and
  `apps/api/tests/test_truck_tracking_api.py`
- Lesson: accepted truck checkpoints are now the deterministic source for
  low-risk stop and movement progression. `ARRIVED_PICKUP` projects a pickup
  stop to `ARRIVED`, `DEPARTED_PICKUP` projects it to `DEPARTED` and advances
  the movement toward the next active stop, and `ARRIVED_DESTINATION` projects
  the destination stop to `ARRIVED`. Corrections stay append-only through
  `EVENT_REVERSED`; live stop and movement status is recomputed from the
  remaining active checkpoint events.
- Deterministic opportunity: keep truck checkpoint sequencing and rollback in
  the typed truck tracking service. The rule owner is Operations Lead; inputs
  are delivery ID, movement ID, stop ID, checkpoint code, event history, stop
  order, stop statuses, and event timestamps. Outputs are allowed stop status,
  movement status, current stop sequence, current location, actual arrival and
  departure timestamps, and validation errors. Stop conditions include
  checkpoints on cancelled or skipped stops, destination arrival before earlier
  active stops depart, duplicate active checkpoints, and reversing
  `DEPARTED_PICKUP` while downstream stop progress is still active.
- Agent autonomy impact: agents may explain or stage truck milestone
  corrections, but they should not infer or mutate movement state from prose.
  Status changes must flow through the typed checkpoint endpoints so audit
  events, reversal rows, duplicate protection, and rollback guards remain
  visible.
- Tests or evidence:
  `.venv/bin/python -m unittest apps.api.tests.test_truck_tracking_api`
- Follow-up: later provider-signal ingestion should reuse this same projection
  and stop-condition set before any automatic checkpoint acceptance is allowed.

### 2026-05-16 - Wiki Grounding Is Evidence, Not Assistant Authority

- Type: lesson
- Domain: assistant prompt grounding, desk wiki knowledge, and prompt-injection boundaries
- Applies to: active wiki pages injected into assistant prompt context, wiki backlink/link graph metadata, and future wiki-search tools
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/prompt_context.py`,
  `apps/api/app/domains/wiki/services/pages.py`, and
  `apps/api/tests/test_assistant_api.py`
- Lesson: active desk wiki pages can safely improve assistant answers when they enter the server-owned prompt as read-only evidence with page titles, stable page IDs, excerpts, and link metadata. Wiki page bodies are user-authored content, so assistants must treat them as source material rather than executable instructions and cite them by page title plus `page_id` instead of implying hidden authority.
- Deterministic opportunity: keep link parsing, active/archive filtering, rename-stable page IDs, and request-aware wiki ranking in deterministic services so model output can cite and draft against the wiki graph without owning wiki state.
- Agent autonomy impact: assistants may observe, explain, cite, and draft suggested wiki edits or missing pages. They must not claim they changed wiki pages unless a typed wiki application service reports the write.
- Tests or evidence:
  `test_assistant_prompt_context_preview_includes_active_wiki_grounding`,
  `test_assistant_prompt_context_ranks_wiki_grounding_from_request_text`,
  `test_wiki_page_search_ranks_title_content_links_and_archive_filter`, and
  `test_wiki_page_rename_rewrites_title_links_to_stable_targets`
- Follow-up: if wiki content grows beyond prompt-sized ranked grounding, add read-only wiki search/detail live tools with explicit evidence items before adding any governed wiki edit action.

### 2026-05-17 - Missing Wiki Links Should Become Typed Pages With Stable IDs

- Type: lesson
- Domain: desk wiki authoring, deterministic link repair, and knowledge graph growth
- Applies to: unresolved `[[Page]]` and `[[label|target]]` links, linked-page creation, and future wiki edit actions
- Status: implemented
- Source:
  `apps/web/src/workspaces/docs/useWikiDocumentController.ts`,
  `apps/web/src/workspaces/docs/wikiMarkdown.ts`, and
  `apps/web/tests/wikiMarkdown.test.ts`
- Lesson: unresolved wiki links are a product workflow, not an assistant-only suggestion. When an operator creates a page from an unresolved link, the client should call the typed wiki page service, then rewrite the original reference to a stable `[[label|page_id]]` target so future renames, backlinks, search, and assistant grounding can rely on durable IDs.
- Deterministic opportunity: keep link detection and link rewriting deterministic. Future assistant-authored wiki suggestions should stage or call the same typed page/link workflow rather than editing markdown by freeform prose.
- Agent autonomy impact: agents may suggest missing pages or draft content, but actual page creation and link repair should remain visible through typed wiki services and user-initiated product controls until a governed wiki action type exists.
- Tests or evidence:
  `rewriteWikiMarkdownLinkTarget` coverage in `apps/web/tests/wikiMarkdown.test.ts`
- Follow-up: if assistant-staged wiki edits are added later, reuse this stable-link rewrite behavior inside a backend action contract with previewable before/after markdown.

### 2026-05-17 - Wiki Mentions Should Insert Stable Links At Authoring Time

- Type: lesson
- Domain: desk wiki authoring, backlinks, deterministic markdown editing, and future assistant wiki actions
- Applies to: `[[` editor mentions, stable page ID links, backlink source snippets, and future wiki edit previews
- Status: implemented
- Source:
  `apps/web/src/workspaces/docs/DocumentationWorkspace.tsx`,
  `apps/web/src/workspaces/docs/wikiMarkdown.ts`,
  `apps/api/app/domains/wiki/services/pages.py`, and
  `apps/api/app/schemas/wiki.py`
- Lesson: page mentions should become stable `[[label|page_id]]` links while the user is authoring, not later through cleanup. Backlinks are more reviewable when the deterministic link parser also supplies a short source snippet for the exact link occurrence.
- Deterministic opportunity: keep active mention detection, mention replacement, and link-context snippets in deterministic code so assistant suggestions and product controls share the same link semantics.
- Agent autonomy impact: agents may recommend wiki pages to link or draft mention edits, but durable references should still be previewed and applied through typed wiki services or deterministic markdown helpers.
- Tests or evidence:
  `findActiveWikiPageMention` and `replaceActiveWikiPageMention` coverage in
  `apps/web/tests/wikiMarkdown.test.ts`, plus
  `apps.api.tests.test_wiki_api` link-snippet assertions
- Follow-up: if governed wiki edit actions are added, include the same stable-link replacement and backlink snippet preview in the action request before approval.

### 2026-05-17 - Wiki Page Templates Should Be Deterministic Draft Scaffolds

- Type: lesson
- Domain: desk wiki authoring, page creation, and future assistant wiki actions
- Applies to: built-in wiki templates, typed page creation, and assistant-suggested documentation scaffolds
- Status: implemented
- Source:
  `apps/web/src/workspaces/docs/wikiTemplates.ts`,
  `apps/web/src/workspaces/docs/useWikiDocumentController.ts`, and
  `apps/web/src/workspaces/docs/DocumentationWorkspace.tsx`
- Lesson: Notion-like page templates should be deterministic scaffolds that feed the existing typed wiki page creation service. The template can choose the initial title and markdown body, but the API remains the durable write boundary and blank remains the safe default.
- Deterministic opportunity: keep template keys, labels, descriptions, titles, and markdown bodies in versioned code so future assistant drafts can reference the same scaffolds instead of inventing inconsistent page structures.
- Agent autonomy impact: agents may recommend or preselect a template when drafting a wiki action, but page creation should still call the typed wiki service with previewable template-derived content.
- Tests or evidence:
  `apps/web/tests/wikiTemplates.test.ts` and the documentation wiki browser smoke path
- Follow-up: if user-defined templates are added later, store them as governed wiki/template records with audit, ownership, and rollback rather than freeform prompt instructions.

### 2026-05-16 - Distributed Execution Should Use Centralized Control And Untrusted Node Defaults

- Type: lesson
- Domain: agent runtime topology, engineering automation, and future
  execution-node governance
- Applies to: Codex-style dispatch, browser automation, document-processing
  jobs, future recurring jobs, and any "assign this work to a server" product
  surface
- Status: accepted
- Source:
  [ADR 0004: Centralized Control Plane With Assignable Execution Nodes](../adr/0004-control-plane-and-execution-nodes.md),
  [Execution Node Platform Work Packages](./execution-node-platform-work-packages.md),
  and [AI Workflow](./ai-workflow.md)
- Lesson: if ECTRM later lets operators assign work to cloud workers,
  customer-managed hosts, or personal machines, keep the control plane
  centralized. The backend should continue to own auth, policy, audit, job
  state, typed action execution, and artifact lineage. Execution nodes should
  be treated as compute locations with explicit capability and trust metadata,
  not as peers that directly own business truth or write into the primary
  database.
- Deterministic opportunity: promote existing callback-driven task flows such
  as Codex dispatch into a shared execution-job contract with typed statuses,
  node registry, trust tiers, lease expiry, heartbeat handling, and governed
  return paths into staged actions or typed services.
- Agent autonomy impact: distributed execution can widen where compute runs
  without widening what agents may do. Personal or remote nodes still should
  not directly book trades, mutate settlement, change policy, or bypass staged
  and typed control seams.
- Tests or evidence: future implementation should add API coverage for node
  enrollment, lease expiry, heartbeat loss, duplicate callbacks, routing-policy
  blocks, and staged-action return paths from node-produced outputs.
- Follow-up: pilot the model first on low-risk reviewable workloads before any
  attempt to route broader operational actions through assignable nodes.

### 2026-05-16 - Slack-Style Messaging Should Graduate Into Durable Work Objects Before Feature Polish

- Type: lesson
- Domain: messaging collaboration surfaces, assistant messaging UX, and
  governed work-object design
- Applies to: `Messages` workspace evolution, in-thread assistant replies,
  channel or DM navigation, thread persistence, and post-send message actions
- Status: accepted
- Source:
  `apps/web/src/workspaces/messages/MessagingWorkspace.tsx`,
  `apps/web/src/workspaces/messages/messagingInboxData.ts`,
  `apps/web/src/workspaces/messages/messagingAgentSession.ts`, and
  `docs/engineering/messaging-workspace-work-packages.md`
- Lesson: once a chat surface starts behaving like Slack or Teams, the next
  maturity step should be durable conversation, message, and thread records
  rather than more demo-only UI polish. Conversation switching, reply-to-
  message behavior, composer richness, message lifecycle actions, and agent
  identity all depend on typed work objects and explicit provenance. Do not let
  a seeded thread with local-only state become the long-term collaboration
  model.
- Deterministic opportunity: create a typed messaging domain with durable
  conversation, message, participant, thread, and provenance contracts so
  routing, unread state, agent reply storage, and message audit are product
  behavior rather than prompt or component conventions.
- Agent autonomy impact: agents may keep replying in-thread, but their messages
  should remain linked to explicit user or service identity, governed
  assistant-run provenance, and draft or stage authority ceilings instead of
  silently borrowing shared local-dev identity in production behavior.
- Tests or evidence: the messaging review findings were promoted into
  `MWP-01` through `MWP-06` in
  `docs/engineering/messaging-workspace-work-packages.md`.
- Follow-up: implement MWP-01 through MWP-03 before spending heavily on richer
  composer chrome or post-send polish.

### 2026-05-16 - Seeded Messaging Lanes Can Adopt Durable Posts Before Full Channel Navigation Ships

- Type: lesson
- Domain: messaging workspace persistence, governed collaboration surfaces, and
  incremental work-object adoption
- Applies to: first messaging persistence slices, seeded conversation lanes,
  durable human posts, and in-thread assistant reply storage
- Status: implemented
- Source:
  `apps/api/app/routes/messages.py`,
  `apps/api/app/domains/messages/services/workspace.py`,
  `apps/api/app/models/messaging_workspace_conversation.py`,
  `apps/api/app/models/messaging_workspace_message.py`,
  `apps/web/src/entities/messages/api.ts`, and
  `apps/web/src/workspaces/messages/MessagingWorkspace.tsx`
- Lesson: the first durable messaging slice does not need to solve every
  Slack-like capability at once. It is valid to keep seeded conversation lanes
  and existing thread chrome, add backend-owned conversation and message
  records underneath them, and move normal human sends plus completed assistant
  replies onto typed API writes. That gives refresh-safe history and provenance
  without blocking on full channel switching or per-message thread models.
- Deterministic opportunity: keep seeded lane identity, assistant-workspace
  mapping, and assistant provenance in a typed messages service so future
  channel navigation, unread state, and thread models can reuse the same
  durable records.
- Agent autonomy impact: in-thread assistant replies stay in the draft or stage
  lanes and become more auditable once linked to persisted message records and
  assistant run IDs.
- Tests or evidence:
  `apps/api/tests/test_messaging_workspace_api.py`,
  `apps/web/tests/messagesApi.test.ts`, and
  `apps/web/tests/messagingWorkspace.test.ts`
- Follow-up: add explicit channel selection and per-message thread records on
  top of the same durable conversation and message contract.

### 2026-05-16 - Durable Messaging Reads Should Replace Seeded Runtime Fallbacks, Not Sit Beside Them

- Type: lesson
- Domain: messaging workspace rendering, seeded collaboration surfaces, and
  incremental prototype retirement
- Applies to: `Messages` workspace loads, backend-seeded starter history,
  frontend test fixtures, and other seeded surfaces that are graduating into
  typed API state
- Status: implemented
- Source:
  `apps/api/app/domains/messages/services/workspace.py`,
  `apps/api/app/schemas/messaging.py`,
  `apps/web/src/entities/messages/api.ts`,
  `apps/web/src/workspaces/messages/MessagingWorkspace.tsx`, and
  `apps/web/tests/messagingWorkspace.test.ts`
- Lesson: once the backend owns seeded starter conversations and starter
  timeline items, the runtime UI should render from that API contract directly
  instead of keeping a parallel frontend seed builder as the live fallback.
  If server-side or static tests still need deterministic content, inject an
  `initialWorkspaceState` fixture into the component under test rather than
  preserving duplicate runtime truth in production code.
- Deterministic opportunity: promote seeded lane definitions, seeded timeline
  items, previews, members, attachments, reactions, and conversation metrics
  into the typed messaging service so future unread-state, navigation, and
  thread-model work builds on one contract.
- Agent autonomy impact: assistant replies become easier to audit because the
  same API-owned conversation contract now supplies both starter history and
  newly persisted governed replies.
- Tests or evidence:
  `.venv/bin/python -m unittest apps.api.tests.test_messaging_workspace_api`,
  `npm test -- messagingWorkspace.test.ts messagesApi.test.ts messagingAgentSession.test.ts messagingAgentRouter.test.ts`,
  and `npm run build`
- Follow-up: remove the remaining legacy frontend channel-seed helper once the
  router and append-helper tests move to API-shaped fixtures too.

### 2026-05-16 - Workspace Sub-Selection Should Live In Shared Route State When The URL Matters

- Type: lesson
- Domain: app route state, messaging workspace navigation, and durable
  deep-link behavior
- Applies to: `Messages` conversation selection, future workspace-specific
  detail panes, and any sub-selection that should survive refresh or browser
  navigation
- Status: implemented
- Source:
  `apps/web/src/entities/app/useAppRouteState.ts`,
  `apps/web/src/entities/app/workspaceRendererRegistry.tsx`, and
  `apps/web/src/workspaces/messages/MessagingWorkspace.tsx`
- Lesson: once a workspace sub-selection needs to be linkable through query
  params, do not manage it as an ad hoc local `window.history` patch inside the
  workspace. Put the parameter in the shared route-state contract so popstate,
  view replacement, and other navigation updates preserve it instead of
  stripping it back out.
- Deterministic opportunity: centralize future workspace sub-route params in
  `useAppRouteState` so trade IDs, documentation page IDs, message
  conversations, and later thread IDs follow one URL lifecycle.
- Agent autonomy impact: better deep links make it easier for agents to hand
  humans back into the exact desk lane or thread that needs review, without
  inventing local navigation state.
- Tests or evidence:
  `npm test -- messagingWorkspace.test.ts messagesApi.test.ts messagingAgentSession.test.ts messagingAgentRouter.test.ts`
- Follow-up: apply the same route-state pattern when per-message thread IDs
  become first-class in the messaging workspace.

### 2026-05-15 - Agent Replies In Messaging Surfaces Should Stay In-Thread And Use The Governed Assistant Runtime

- Type: lesson
- Domain: assistant messaging UX, prompt-first collaboration, and agent action
  governance
- Applies to: Slack-style message surfaces, in-thread agent drafting, channel
  handoff UX, and future shared communication workspaces
- Status: implemented
- Source:
  `apps/web/src/workspaces/messages/MessagingWorkspace.tsx`,
  `apps/web/src/workspaces/messages/messagingInboxData.ts`,
  `apps/web/tests/messagingWorkspace.test.ts`, and
  `docs/engineering/agent-autonomy-rubric.md`
- Lesson: when a workspace presents a chat-like thread, agent participation
  should happen inside that thread through the existing `/assistant/respond`
  runtime instead of routing the operator to a separate assistant screen just
  to get a reply. Keep the interaction in-thread, preserve run tracing and
  governed action-request behavior, and frame the channel context explicitly in
  the assistant prompt context rather than inventing a parallel ad hoc agent
  path. When no dedicated backend messaging-router profile exists yet, use a
  deterministic front-end routing layer to decide whether a thread needs an
  agent reply and which managed agent or workspace context to target. Preserve
  familiar chat composer behavior too: `Enter` sends and `Shift+Enter` inserts
  a newline. When a thread needs a governed assistant reply, require an
  explicit signed-in session instead of silently borrowing a shared local admin
  identity, so authorship and bot activity stay attributable.
- Deterministic opportunity: promote recurring thread scaffolding such as
  channel-to-workspace mapping, thread context shaping, and governed action
  request callouts into shared messaging helpers as more communication surfaces
  adopt agent replies.
- Agent autonomy impact: agents remain in the `Draft` and `Stage` lanes here.
  They may respond, explain, and stage governed actions, but they still do not
  externally commit the firm or directly mutate business records from the chat
  surface.
- Tests or evidence:
  `npm test -- messagingWorkspace.test.ts workspaceLoading.test.ts promptHomeWorkspace.test.ts navigation.test.ts workspaceRegistry.test.ts workspaceDescriptors.test.ts workspaceRendererRegistry.test.ts`
  plus browser checks confirming normal message sends keep the browser on
  `?view=messages`, leave acknowledgement-style or human-addressed notes
  in-thread without waking an agent, and append governed assistant replies in
  the same thread when a response is needed.
- Follow-up: once message persistence exists, thread replies should reuse the
  same governed assistant runtime while storing thread state as a durable work
  object instead of local UI state.

### 2026-05-14 - Constrain Delivery Transport Modes Through Commodity Reference Data

- Type: algorithm-added
- Domain: operations scheduling, delivery controls, and commodity reference
  governance
- Applies to: reference commodity masters, delivery transport-mode edits,
  scheduling transport filters, and future product onboarding
- Status: implemented
- Source:
  `apps/api/app/models/reference_commodity.py`,
  `apps/api/app/routes/reference_data_routes/commodities.py`,
  `apps/api/app/domains/reference_data/services/commodity_transport_modes.py`,
  `apps/api/app/domains/operations/services/shipments.py`,
  `apps/web/src/workspaces/shipments/DeliveryDetailEditor.tsx`,
  `apps/web/src/workspaces/scheduling/SchedulingWorkspace.tsx`,
  `apps/api/tests/test_deliveries_api.py`,
  `apps/api/tests/test_reference_data.py`, and
  `apps/web/tests/transportModes.test.ts`
- Lesson: when product transport feasibility varies by commodity, keep the
  allowed mode list on the governed commodity master and enforce delivery edits
  against that typed list. Operators should not have to remember which products
  can move by pipeline, vessel, rail, truck, air, or power grid, and agents
  should not invent transport compatibility from prose.
- Deterministic opportunity: use the same commodity-owned transport list to
  drive scheduler filters, delivery-control dropdowns, and seeded defaults for
  newly onboarded products instead of duplicating the rule across prompts or
  screens.
- Agent autonomy impact: agents can explain which modes are available for a
  product, but they should not propose unsupported transport combinations that
  fall outside the commodity reference record.
- Tests or evidence:
  `apps/api/tests/test_deliveries_api.py`,
  `apps/api/tests/test_reference_data.py`,
  `apps/web/tests/schedulingWorkspace.test.ts`, and
  `apps/web/tests/transportModes.test.ts`
- Follow-up: review and refine the seeded mode sets commodity by commodity as
  more metals, coal, and other physical products are introduced.

### 2026-05-10 - Organization Prompt Context Should Come From Published Metadata Before Env Fallback

- Type: lesson
- Domain: assistant prompt governance and organization context management
- Applies to: company profile, operating model, glossary, guardrails, and
  future user-configurable context profiles
- Status: implemented
- Source:
  `apps/api/app/models/assistant_organization_context.py`,
  `apps/api/app/domains/assistant/services/organization_context_registry.py`,
  `apps/api/app/domains/assistant/services/prompt_context.py`,
  `apps/api/app/routes/assistant.py`,
  `apps/api/tests/test_assistant_api.py`, and
  `docs/engineering/ai-workflow.md`
- Lesson: organization-facing prompt sections should not stay as a single
  env-backed prose block once they start carrying reusable company facts,
  glossary terms, and guardrails. Publish those inputs as versioned backend
  metadata first, let prompt assembly prefer the latest published definitions,
  and keep env-backed strings only as a visible bootstrap fallback.
- Deterministic opportunity: add admin publish workflows and later
  user/team/org-scoped context profiles on top of the same versioned metadata
  seam instead of introducing freeform prompt editing.
- Agent autonomy impact: this improves prompt explainability and future-safe
  configurability without widening agent authority, tool access, or mutation
  rights.
- Tests or evidence:
  `PYTHONPATH=. .venv/bin/python -m unittest apps.api.tests.test_assistant_api.AssistantApiTests.test_assistant_prompt_context_preview_includes_business_user_and_data_sections`
  and
  `PYTHONPATH=. .venv/bin/python -m unittest apps.api.tests.test_assistant_api.AssistantApiTests.test_assistant_prompt_context_preview_prefers_published_organization_registry_sections`
- Follow-up: keep organization-wide editing on the governed admin surface for
  now, then layer team or user configurability on top of the same versioned
  metadata seam instead of exposing freeform prompt editing.

### 2026-05-14 - Versioned Organization Context Should Use Draft Edit And Explicit Publish Semantics

- Type: lesson
- Domain: assistant prompt governance and admin lifecycle controls
- Applies to: organization context definitions, glossary terms, guardrails,
  and future team or user context profiles
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/organization_context_registry.py`,
  `apps/api/app/routes/assistant.py`,
  `apps/api/app/schemas/assistant.py`,
  `apps/api/tests/test_assistant_api.py`, and
  `docs/engineering/ai-workflow.md`
- Lesson: once organization context becomes versioned metadata, published
  records should stop being directly editable. Keep edits on drafts only,
  publish the latest version explicitly, and retire prior published versions
  automatically for the same `definition_key` so prompt provenance stays
  reviewable.
- Deterministic opportunity: reuse the same draft, publish, and retire
  lifecycle for future user or team context-profile objects instead of
  inventing prompt-specific editing rules later.
- Agent autonomy impact: this widens configuration governance and reviewability
  without widening agent runtime authority or allowing silent prompt mutation.
- Tests or evidence:
  `PYTHONPATH=. .venv/bin/python -m unittest apps.api.tests.test_assistant_api.AssistantApiTests.test_admin_organization_context_definition_crud_publish_and_retire_flow`
- Follow-up: add a web admin surface when the backend workflow stabilizes, then
  reuse the same lifecycle for scoped context profiles in WP-06.

### 2026-05-08 - Simple Arbitrage Detection Should Become A Deterministic Pre-Trade Service

- Type: algorithm-candidate
- Domain: pre-trade arbitrage detection and opportunity ranking
- Applies to: product or quality arbitrage, time arbitrage, geographic
  arbitrage, and trader-facing opportunity ranking
- Status: proposed
- Source: [Pre-Trade Design](./pre-trade-design.md),
  [Arbitrage Detection Design](./arbitrage-detection-design.md),
  [Business Use Case Roadmap](./business-use-case-roadmap.md), and
  [Trader/Risk MVP Work Packages](./trader-risk-mvp-work-packages.md)
- Lesson: when traders repeatedly compare `Product A` versus `Product B`,
  `Time A` versus `Time B`, or `Place A` versus `Place B`, the platform should
  not leave the economics inside prompt-only reasoning. The repeatable core is
  a deterministic graph search that normalizes tradable states, applies typed
  transformation edges, and prices executable opportunities using explicit
  bridge costs such as conversion price, storage price, or transportation
  price.
- Deterministic opportunity: create a typed arbitrage-detection service that
  generates candidate state pairs, finds the cheapest feasible path, prices
  buys at ask and sells at bid when available, calculates gross spread plus
  explicit cost stack, ranks net opportunity, and returns missing-evidence or
  stop-condition labels whenever the economics cannot be trusted.
- Agent autonomy impact: agents may explain, summarize, and draft pre-trade
  scenarios from the deterministic output, but they should not become the
  system of record for conversion, storage, transportation, or arbitrage
  ranking values.
- Tests or evidence: future implementation should add focused service tests for
  conversion, storage, transport, stale-source, and unsupported-mapping cases,
  plus assistant evals if managed agents consume the new typed outputs.
- Follow-up: define the first normalized arbitrage payload contract and decide
  whether the resulting opportunity remains recommendation output or becomes a
  first-class `Market opportunity` object.

### 2026-05-08 - External ChatGPT Access Should Start As A Governed Remote MCP Transport

- Type: lesson
- Domain: external ChatGPT integration, MCP transport, and assistant
  governance
- Applies to: personal ChatGPT account access, remote MCP app design, future
  ChatGPT app rollout, and any write-capable external tool exposure
- Status: accepted
- Source: [ChatGPT MCP Work Packages](./chatgpt-mcp-work-packages.md),
  [Agent Action Request Contract](./agent-action-request-contract.md),
  [Human-Agent Authority Matrix](./human-agent-authority-matrix.md), and
  [AI Workflow](./ai-workflow.md)
- Lesson: when ECTRM is exposed to a user's own ChatGPT account, treat the
  remote MCP server as a transport over governed ECTRM services rather than as
  a second assistant runtime with looser rules. Start with read-only
  `search` and `fetch` over curated, permission-aware read models, prove auth,
  provenance, and citation behavior first, and only then consider narrow
  write-capable tools that map to typed services or approval-gated action
  requests.
- Deterministic opportunity: centralize tool metadata such as read-only
  posture, schemas, ownership, and publication status so the internal
  assistant and external MCP surface do not drift into separate governance
  models.
- Agent autonomy impact: external ChatGPT access can broaden where users
  interact with ECTRM, but it should not broaden what an agent may do beyond
  the existing authority matrix or action-request contract.
- Tests or evidence: [ChatGPT MCP Work Packages](./chatgpt-mcp-work-packages.md)
  requires focused backend tests for schema and auth, explicit MCP verification
  coverage, and `make api-assistant-evals` updates whenever governed action
  behavior changes.
- Follow-up: implement Wave 0 before any public or write-capable rollout, and
  treat shared tool-catalog governance as a prerequisite for broader external
  exposure.

### 2026-05-08 - Prove The External MCP Seam With A Docs-Only Read Surface First

- Type: lesson
- Domain: MCP transport scaffolding, rollout sequencing, and local developer
  safety
- Applies to: first remote MCP implementation, ChatGPT developer-mode
  connection prep, and future expansion from docs retrieval into governed
  business tools
- Status: implemented
- Source:
  `apps/api/app/domains/mcp/services/server.py`,
  `apps/api/app/domains/mcp/services/docs_catalog.py`,
  `apps/api/app/domains/mcp/routes/http.py`,
  `apps/api/tests/test_mcp_api.py`, and
  `docs/engineering/chatgpt-mcp-work-packages.md`
- Lesson: when adding a brand-new external MCP transport to ECTRM, first prove
  transport reachability, tool discovery, and citation shape with a read-only
  docs catalog mounted behind a config flag in the existing FastAPI service.
  Starting with standard `search` and `fetch` over checked-in repo documents
  keeps the surface useful for local and developer-mode testing without opening
  protected business reads or creating a second write path.
- Deterministic opportunity: centralize document-catalog metadata and
  canonical citation URL construction so internal assistants and external MCP
  tools can share the same provenance rules.
- Agent autonomy impact: a no-auth docs-only MCP surface is acceptable as a
  local development shortcut, but it should not be mistaken for the hosted auth
  design needed for durable personal-account or team use.
- Tests or evidence: focused MCP startup, tool-discovery, and route-registry
  tests live in `apps/api/tests/test_mcp_api.py` and
  `apps/api/tests/test_http_router_registry.py`.
- Follow-up: land WP-03 before exposing protected business reads through the
  external MCP surface, then replace repo-doc retrieval with curated,
  permission-aware ECTRM read models.

### 2026-05-08 - MCP OAuth Should Resolve To Existing User Sessions, Not A Parallel Identity Model

- Type: lesson
- Domain: external MCP auth, identity mapping, and governed transport reuse
- Applies to: ChatGPT developer-mode OAuth, other OAuth-capable MCP clients,
  and future business-data tools exposed through the remote MCP surface
- Status: implemented
- Source:
  `apps/api/app/domains/mcp/services/oauth.py`,
  `apps/api/app/core/auth.py`,
  `apps/api/app/main.py`,
  `apps/api/tests/test_mcp_oauth.py`, and
  `docs/engineering/chatgpt-mcp-work-packages.md`
- Lesson: the MCP OAuth bridge should terminate in the same ECTRM `UserAccount`
  and `UserSession` concepts the rest of the product already trusts. OAuth
  access and refresh tokens can be MCP-specific, but they should still anchor
  to revocable ECTRM sessions and project the resulting actor into request
  context so future tool handlers can reuse the same permission and audit seams
  as the web app and internal assistant.
- Deterministic opportunity: centralize token-to-actor resolution so external
  MCP calls, internal assistant tools, and future background automations all
  share one actor-projection path into request context.
- Agent autonomy impact: external transport changes where a request originates,
  but not who it is acting as; every MCP tool call should still run as an
  explicit ECTRM principal or not at all.
- Tests or evidence: `apps/api/tests/test_mcp_oauth.py` covers dynamic client
  registration, browser authorization, token exchange, identity resolution, and
  authenticated MCP tool discovery over mounted HTTP.
- Follow-up: reuse the same actor projection when MCP handlers start calling
  governed business read services, then extend the pattern into approval-gated
  write tools instead of introducing separate auth plumbing there.

### 2026-05-08 - Expose Managed-Agent Construction Through Read-Only Roster Tools

- Type: lesson
- Domain: assistant roster introspection and managed-agent explainability
- Applies to: chat questions about agent construction, specialization,
  hierarchy, and managed-agent relationships
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/tools.py`,
  `apps/api/app/domains/assistant/services/role_archetypes.py`,
  `apps/api/app/domains/assistant/services/registry.py`,
  `apps/api/app/domains/assistant/services/chat.py`,
  `apps/api/tests/test_assistant_api.py`,
  `apps/api/tests/test_assistant_tooling.py`, and
  `apps/api/tests/test_assistant_evals.py`
- Lesson: when users ask the assistant how managed agents are built or how
  they relate to each other, expose that information through explicit read-only
  live tools instead of relying on hidden prompt knowledge or stale docs. The
  roster tool surface should return the managed-agent build recipe, role and
  skill metadata, workspace and tool policy, and parent or subordinate
  relationships in a form the assistant can cite back safely.
- Deterministic opportunity: keep the managed-agent graph and build recipe in a
  single typed payload contract so future admin UI, control-tower summaries,
  and chat explanations all read from the same server-owned structure.
- Agent autonomy impact: read-capable agents can explain the managed-agent
  roster and hierarchy without widening mutation authority or bypassing action
  governance.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_assistant_api
  apps.api.tests.test_assistant_tooling` and `make api-assistant-evals`
- Follow-up: if users start asking for graphical org-chart or dependency views,
  publish a dedicated roster summary service instead of expanding prompt-only
  formatting instructions.

### 2026-05-08 - Publish Whole-App Read Access Through Explicit Introspection Tools

- Type: lesson
- Domain: assistant platform introspection, schema explainability, and codebase
  grounding
- Applies to: chat questions about app topology, routes, workspaces, database
  schema, source code, engineering docs, and read-capable managed-agent
  visibility
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/app_context_catalog.py`,
  `apps/api/app/domains/assistant/services/tools.py`,
  `apps/api/app/domains/assistant/services/prompt_context.py`,
  `apps/api/app/domains/assistant/services/chat.py`,
  `docs/engineering/ai-workflow.md`,
  `apps/api/tests/test_assistant_api.py`,
  `apps/api/tests/test_assistant_tooling.py`, and
  `apps/api/tests/test_assistant_evals.py`
- Lesson: when users ask how ECTRM is built or where logic lives, expose
  application topology, schema metadata, and published repo code through
  explicit read-only tools instead of relying on stale prompt memory. The core
  surface should include an application catalog, a schema catalog, code search,
  and bounded file reads, and the prompt foundation should advertise those
  surfaces as governed context rather than hidden prompt prose.
- Deterministic opportunity: keep route registration, workspace inventory,
  schema metadata, and published code roots in one server-owned catalog so
  assistant chat, managed agents, and future remote MCP transports share the
  same explainability contract.
- Agent autonomy impact: `READ` agents can inspect more of the platform without
  widening mutation authority. Keep writes behind typed services and
  approval-gated action paths even when the assistant can now inspect the whole
  app.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_assistant_tooling
  apps.api.tests.test_assistant_agent_admin_service
  apps.api.tests.test_assistant_api
  apps.api.tests.test_assistant_evals` and `make api-assistant-evals`
- Follow-up: if these same introspection payloads need to power admin UI
  diagrams or external MCP discovery, publish the shared catalog directly
  rather than duplicating route or schema summaries in separate prompt text.

### 2026-05-08 - Keep Raw Gmail Inbox Reads As Explicit Assistant Live Tools

- Type: lesson
- Domain: assistant live tools and document intake integrations
- Applies to: Gmail inbox browsing, inbox summarization in chat, and document
  intake workflows that already import Gmail attachments
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/tools.py`,
  `apps/api/app/domains/integrations/services/gmail_inbox.py`,
  `apps/api/tests/test_assistant_tooling.py`,
  `apps/api/tests/test_assistant_evals.py`, and
  `apps/api/tests/test_document_ingestion_api.py`
- Lesson: when chat needs access to a configured external inbox, expose
  read-only mailbox browse and detail operations as explicit assistant live
  tools that reuse the existing integration service. Do not treat raw inbox
  mail as prompt context, and do not conflate it with already imported
  document-ingestion records.
- Deterministic opportunity: centralize future mailbox-tool provenance and
  runtime-availability phrasing so new inbox connectors consistently
  distinguish raw messages from imported documents.
- Agent autonomy impact: agents can search and summarize Gmail messages when
  live tools are enabled, but inbox access remains read-only and distinct from
  document import or outbound email actions.
- Tests or evidence:
  `apps/api/tests/test_assistant_tooling.py`,
  `apps/api/tests/test_assistant_evals.py`, and
  `apps/api/tests/test_document_ingestion_api.py`
- Follow-up: if specific managed roles should browse inbox content by default,
  update their allowlists deliberately instead of assuming all existing
  managed-agent profiles inherit newly published tools.

### 2026-05-08 - Keep Multi-Agent Control Shallow And Supervisor-Led

- Type: lesson
- Domain: managed agent hierarchy and inter-agent consultation
- Applies to: control-tower supervision, domain-manager agents, specialist
  agent consultation, and future multi-agent routing work
- Status: implemented
- Source:
  [Agent Hierarchy Contract](./agent-hierarchy-contract.md),
  `apps/api/app/models/assistant_agent.py`,
  `apps/api/app/domains/assistant/services/role_archetypes.py`, and
  `apps/api/app/domains/assistant/services/tools.py`
- Lesson: when ECTRM needs agents that manage other agents, default to a
  shallow supervisor or manager tree with explicit parent and subordinate
  metadata instead of peer-to-peer swarms. One manager should own final
  synthesis, specialist consultations should stay advisory-only, and runtime
  consultation should fail closed to configured subordinate agents when a
  manager declares them.
- Deterministic opportunity: if the same manager repeatedly routes the same
  request types to the same specialists, promote that routing rule into typed
  workflow or intent logic instead of keeping it as prompt-only delegation.
- Agent autonomy impact: managers can coordinate bounded specialist help
  without widening mutation authority or bypassing the approval-gated action
  contract.
- Tests or evidence:
  `apps/api/tests/test_assistant_api.py`,
  `apps/api/tests/test_assistant_tooling.py`, and
  `make api-assistant-evals` for future consultation or hierarchy behavior
  changes.
- Follow-up: add outcome metrics for consultation frequency, failed
  consultations, and manager-to-specialist routing quality before promoting any
  hierarchy toward broader autonomous execution.

### 2026-05-08 - Keep Managed-Agent Delegated Execution Inside The Existing Action Gateway

- Type: lesson
- Domain: managed agent delegation, action governance, and autonomous
  execution
- Applies to: manager agents enlisting specialist agents to help execute
  bounded operational tasks
- Status: implemented
- Source:
  [Agent Hierarchy Contract](./agent-hierarchy-contract.md),
  `apps/api/app/domains/assistant/services/tools.py`,
  `apps/api/app/domains/assistant/services/chat.py`,
  `apps/api/app/domains/assistant/services/policies.py`,
  `apps/api/tests/test_assistant_tooling.py`, and
  `apps/api/tests/test_assistant_evals.py`
- Lesson: when one managed agent needs another agent to help complete work,
  use an explicit delegation tool instead of hiding a second task inside prompt
  prose or widening the manager's own authority. The enlisted agent should run
  as its own managed-agent execution, inherit the original user context, and
  remain constrained by its own skills, tool allowlist, action types, and
  authority ceiling.
- Deterministic opportunity: if the same manager repeatedly enlists the same
  subordinate for the same intent pattern, promote that routing into typed
  workflow or intent logic rather than keeping it as open-ended prompt
  delegation.
- Agent autonomy impact: managers can coordinate bounded subordinate execution
  without gaining blanket write access, because any resulting mutation still
  becomes a typed action request and only self-executes when the enlisted
  profile is already approved for bounded execution.
- Tests or evidence:
  `./.venv/bin/python -m unittest
  apps.api.tests.test_assistant_tooling.AssistantToolingTests.test_enlist_managed_agent_records_delegated_run_and_executes_governed_action`,
  `apps.api.tests.test_assistant_evals`, and
  `make api-assistant-evals`
- Follow-up: add runtime metrics for delegation depth, enlistment frequency,
  and repeated manager-to-specialist routing so product owners can decide which
  flows should graduate into deterministic orchestration.

### 2026-05-08 - Treat Agent Context As Governed Metadata, Not Hidden Prompt State

- Type: lesson
- Domain: assistant prompt foundation and user-configurable context
- Applies to: organization context, user preferences, workspace context,
  managed-agent context, and future team or organization context profiles
- Status: accepted
- Source: [AI Workflow](./ai-workflow.md),
  [User Extensibility Initiative](./user-extensibility-initiative.md), and
  [Agent Context And Configuration Work Packages](./agent-context-work-packages.md)
- Lesson: when the assistant needs richer context, add it through server-owned
  typed context definitions with scope, lifecycle, provenance, and policy
  boundaries instead of appending more hidden prompt prose or letting users edit
  unrestricted system prompts. Identity, authority, workspace focus,
  organization glossary, and user preferences should be separable context
  layers with explicit ownership.
- Deterministic opportunity: promote repeated routing, alias, or context-focus
  behavior into typed context providers, glossaries, or published context
  profiles instead of repeatedly compensating in prompt wording.
- Agent autonomy impact: agents can receive richer context and safer
  personalization without widening authority, bypassing policy, or hiding why a
  given answer was shaped a certain way.
- Tests or evidence: [AI Workflow](./ai-workflow.md),
  [Agent Context And Configuration Work Packages](./agent-context-work-packages.md),
  and `make api-assistant-evals` as the required verification lane when these
  packages become implementation work.
- Follow-up: implement the context contract and preview or diff packages before
  exposing end-user context configuration or shared profile publishing.

### 2026-05-08 - Make Rail Scheduling Readiness Route-Bound And Deterministic

- Type: algorithm-added
- Domain: operations rail scheduling and delivery-readiness projection
- Applies to: rail delivery obligations, scheduling blocker derivation,
  scheduling workspace filters, and any future rail-focused agent drafting
- Status: implemented
- Source:
  `docs/engineering/rail-delivery-schema.md`,
  `apps/api/app/domains/operations/services/shipments.py`,
  `apps/api/app/models/reference_rail_line.py`,
  `apps/api/app/models/reference_rail_route.py`, and
  `apps/api/app/models/delivery_rail_detail.py`,
  `apps/api/tests/test_deliveries_api.py`, and
  `apps/api/tests/test_shipments_api.py`
- Lesson: rail reference data only becomes scheduler-grade when each rail
  delivery binds to a curated route and the shared delivery projection derives
  readiness and blocker reasons from typed rail completeness checks. Freeform
  notes can explain context, but they should not be the only place route
  choice, station consistency, or waybill/release readiness exists.
- Deterministic opportunity: add delivery-bound `rail_route_code`, keep line
  membership derived through the reference hierarchy, and evaluate reason-coded
  blockers such as route-not-selected, station-missing, route-station-mismatch,
  and post-submission waybill or release gaps inside the shipment scheduling
  projection.
- Agent autonomy impact: agents can summarize what is missing for rail
  scheduling and propose next actions from typed blocker results, but they
  should not infer a route, clear a blocker, or claim a movement is ready from
  prose alone.
- Tests or evidence:
  `apps/api/tests/test_deliveries_api.py` and
  `apps/api/tests/test_shipments_api.py`
- Follow-up: use the derived `rail_route_code`, `rail_line_code`, and
  `railroad_code` fields when the scheduling workspace adds route-aware queue
  filters or rail-specific readiness views.

### 2026-05-08 - Store Rail Operating Clocks On Curated Routes Before Adding Demurrage Logic

- Type: lesson
- Domain: operations rail scheduling, reference data ownership, and delivery
  projection design
- Applies to: rail route master data, delivery scheduling views, future
  cutoff-aware blockers, and demurrage-risk heuristics
- Status: implemented
- Source:
  `docs/engineering/rail-delivery-schema.md`,
  `apps/api/app/models/reference_rail_route.py`,
  `apps/api/app/routes/reference_data_routes/rail_routes.py`,
  `apps/api/app/domains/admin/services/seed_reference_data.py`, and
  `apps/api/app/domains/operations/services/shipments.py`
- Lesson: the first useful rail service-window slice should live on the
  curated route, not on each delivery. Service calendar selection, local
  placement or release cutoffs, and starter free-time assumptions are reusable
  lane metadata. They should be maintained once in reference data and then
  projected onto each route-bound delivery as derived scheduling context.
- Deterministic opportunity: use the projected route clock for calendar-aware
  cutoff checks, free-time countdowns, and demurrage-risk warnings before
  introducing facility-specific overrides or richer rail milestone economics.
- Agent autonomy impact: agents can explain why a route's operating clock
  matters and summarize missing scheduling context from typed fields, but they
  should not invent service calendars, cutoff times, or free-time assumptions
  from notes alone.
- Tests or evidence:
  `apps/api/tests/test_reference_data.py`,
  `apps/api/tests/test_admin_seed_api.py`,
  `apps/api/tests/test_deliveries_api.py`, and
  `apps/api/tests/test_shipments_api.py`
- Follow-up: once operators are using these fields, promote missing or expired
  route-clock data into explicit readiness blockers and add calendar-aware
  milestone and demurrage projections.

### 2026-05-07 - Make Agent Specialization Explicit Through Skills And A Build Recipe

- Type: lesson
- Domain: managed agent construction, operator trust, and governed
  specialization
- Applies to: managed agent profiles, role-derived agent setup, agent builder
  UX, self-update drafts, and prompt context rendering
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/skills.py`,
  `apps/api/app/domains/assistant/services/chat.py`,
  `apps/api/app/domains/assistant/services/prompt_context.py`,
  `apps/api/app/domains/assistant/services/registry.py`,
  `apps/api/app/routes/assistant.py`,
  `apps/web/src/entities/assistant/api.ts`, and
  `apps/web/src/workspaces/admin/AgentManagementPanel.tsx`,
  `apps/web/src/workspaces/admin/assistantAgentConstructionDraft.ts`,
  `apps/web/src/workspaces/assistant/AssistantConstructionExplainerPanel.tsx`,
  and `apps/web/src/workspaces/assistant/assistantConstructionExplainer.ts`
- Lesson: users should not have to infer what an agent is from a hidden system
  prompt alone. A managed agent is now expressed as an explicit recipe:
  `role + skills + capabilities + workspaces + live tools + governed actions +
  system prompt`. Skills are first-class metadata that describe the agent's
  specialty, and inter-agent consultation is only available when the profile
  explicitly carries the `inter_agent_consultation` skill. Admin review should
  reuse the server-owned prompt preview and section metadata for the saved
  construction view, so users can see source, scope, owner, freshness, fallback,
  hierarchy, skills, tools, and actions from the same contract the runtime uses
  rather than a client-only approximation. Unsaved edits should be shown as a
  separate no-persist backend draft preview with deterministic before/after
  construction diffs, preserving the distinction between saved runtime truth
  and reviewable pending changes before an admin clicks save. The draft preview
  should post the proposed update payload through the same server-side
  hierarchy, profile-policy, and activation validation path as saving.
- Deterministic opportunity: when the same skill bundle keeps appearing for a
  role, preserve it in the governed role archetype and builder defaults rather
  than re-explaining specialization through freeform prompt text each time.
- Agent autonomy impact: agents become easier to review and safer to narrow
  because users, reviewers, and the runtime can all see the same explicit
  specialization contract before an agent reads, consults, stages, or acts.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_assistant_api apps.api.tests.test_assistant_tooling`
  and `npm --prefix apps/web test -- --run assistantAgentBuilder.test.ts
  assistantApi.test.ts`, plus `npm --prefix apps/web test --
  assistantConstructionExplainer.test.ts agentManagementPanel.test.ts
  assistantApi.test.ts`, `npm --prefix apps/web test --
  assistantAgentConstructionDraft.test.ts`, and `npx playwright test
  tests/browser/smokeHarness.spec.ts --grep "admin smoke shows the
  role-derived pilot lineup"`, plus
  `test_admin_agent_draft_context_preview_uses_unsaved_payload_without_persisting`
  and `previewAdminAssistantAgentDraftContext posts unsaved update payloads
  with admin auth`
- Follow-up: keep draft context preview read-only. If create-agent drafts need
  the same authoritative preview before save, add a separate admin create-draft
  preview endpoint instead of overloading the saved-agent update preview.

### 2026-05-07 - Treat Trading EOD Readiness As A Deterministic Governed Decision

- Type: algorithm-candidate
- Domain: trading EOD governance and close-readiness classification
- Applies to: trading close runs, desk close packs, sign-off gates, waivers,
  and any future reporting or reconciliation agent that explains whether the
  desk is closed
- Status: proposed
- Source:
  `docs/engineering/trading-eod-work-packages.md`,
  `apps/api/app/domains/reports/routes/http.py`,
  `apps/api/app/domains/reports/services/trading_eod.py`,
  `apps/api/app/domains/operations/routes/operations.py`, and
  `apps/api/app/domains/admin/services/projection_monitoring.py`
- Lesson: whether the trading day is `READY`, `WARNING`, or `BLOCKED` should
  come from typed close checks over report basis, freshness, projection
  integrity, workflow backlog, settlement posture, and accrual coverage rather
  than from freeform assistant prose. Humans may sign off or waive specific
  checks under policy, but the platform should own the rule table and stale
  state semantics.
- Deterministic opportunity: add an EOD run service that records one close
  basis for the business date, evaluates check families into reason-coded
  results, rolls them into a run-level status, and preserves waiver and
  sign-off audit data behind typed services.
- Agent autonomy impact: agents can draft desk packs, summarize blockers, and
  explain carry-forward work from typed EOD results, but they should not
  declare the official trading day closed or waive blockers through prompt-only
  reasoning.
- Tests or evidence: the repo now has a first read-only implementation in
  `apps/api/app/domains/reports/services/trading_eod.py` with focused API
  coverage in `apps/api/tests/test_reports_api.py`; future promotion beyond
  the v0 read surface should still add broader service tests, web coverage for
  close rendering and sign-off state, and `make api-assistant-evals` coverage
  for no-overclaim behavior.
- Follow-up: implement `TEOD-01` through `TEOD-04` first so the close workflow
  has a stable basis, rule set, and summary surface before adding automation or
  agent drafting.

### 2026-05-07 - Agent-Created Filter Presets Must Use Typed Server-Owned Services

- Type: lesson
- Domain: assistant action governance and saved report filters
- Applies to: settlement report presets, future chat-created saved views, and
  any agent-authored filter preset that should be reusable across sessions or
  users
- Status: implemented
- Source:
  `apps/api/app/domains/reports/services/settlement_presets.py`,
  `apps/api/app/domains/assistant/services/action_planners.py`,
  `apps/api/app/domains/assistant/services/action_handlers.py`,
  `apps/api/app/domains/assistant/services/tools.py`, and
  `apps/api/tests/test_assistant_api.py`
- Lesson: when a user asks the assistant to save a named filter preset, keep
  the durable write behind a typed domain service plus an approval-governed
  assistant action. Agents may read filter options and visible presets, and
  they may translate natural language into typed filter payloads, but the
  assistant should not write presets through browser-local storage or pass
  freeform model output straight into business state mutation.
- Deterministic opportunity: centralize future preset translation logic around
  typed option catalogs, conflict checks, scope rules, idempotency keys, and
  stale-state rechecks so new preset actions reuse one governed pattern instead
  of inventing prompt-only save behavior.
- Agent autonomy impact: agents can help users create reusable settlement
  lenses with low-risk autonomy while preserving review, visibility scope, and
  audit expectations for durable saved state.
- Tests or evidence:
  `apps/api/tests/test_assistant_tooling.py`,
  `apps/api/tests/test_assistant_api.py`,
  `apps/api/tests/test_assistant_evals.py`, and
  `apps/web/tests/assistantAgentBuilder.test.ts`
- Follow-up: if users need the same workflow for other filter-heavy surfaces
  such as asset maps, first move those presets into a server-owned typed
  service before exposing a chat-driven create or update action.

### 2026-05-05 - Keep Loaded Market Data And Live News As Separate Tool Surfaces

- Type: lesson
- Domain: assistant live tools and external data provenance
- Applies to: market briefings, pre-trade research, risk summaries, and any
  future "latest" assistant tool
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/tools.py`,
  `apps/api/app/domains/reference_data/services/external_data/market_context.py`,
  and
  `apps/api/app/domains/reference_data/services/external_data/market_news.py`
- Lesson: when the assistant needs "latest" market context, keep synced
  commodity prices and live headline fetches in separate read-only tools. That
  preserves provenance so the model can distinguish data already loaded into
  ECTRM from headlines fetched at response time.
- Deterministic opportunity: centralize future freshness and provenance labels
  for any live external read so new tools can reuse one typed contract instead
  of inventing ad hoc wording.
- Agent autonomy impact: agents can cite fresher market context without
  implying that live headlines mutated platform data or silently backfilled the
  external-data store.
- Tests or evidence:
  `apps/api/tests/test_assistant_tooling.py` and
  `apps/api/tests/test_market_news_service.py`
- Follow-up: if desk usage converges on a smaller approved news-provider set,
  promote that provider selection into typed configuration instead of prompt
  convention.

### 2026-05-05 - Surface Local-First External Delivery Fallbacks In Runtime Settings

- Type: lesson
- Domain: integrations and admin runtime visibility
- Applies to: projection-monitoring email delivery, future webhook or inbox
  transports, and Settings/Admin runtime surfaces
- Status: implemented
- Source:
  `apps/api/app/main.py`,
  `apps/api/app/domains/admin/services/projection_monitoring.py`, and
  `apps/web/src/workspaces/settings/SettingsWorkspace.tsx`
- Lesson: when an integration has a safe local archive fallback, expose that
  fallback explicitly through a server-owned runtime contract and UI instead of
  leaving operators to infer behavior from missing environment variables. The
  product should make it obvious whether a delivery path is still local-only or
  actually pointed at an external transport such as Gmail SMTP.
- Deterministic opportunity: centralize future integration readiness summaries
  as typed runtime metadata so Admin and Settings surfaces can stay consistent
  across email, chat, webhook, and inbox connectors.
- Agent autonomy impact: agents stay out of transport configuration changes,
  but they can now cite visible product state instead of guessing whether an
  external delivery path is active.
- Tests or evidence:
  `apps/api/tests/test_auth_http.py` and
  `apps/web/tests/projectionMonitoringEmailRuntime.test.ts`
- Follow-up: whenever a new external channel lands, add the same explicit
  runtime readiness surface before relying on that channel operationally.

### 2026-05-05 - Guided Home Prompt Kits Should Stay Visible and Deterministic

- Type: lesson
- Domain: prompt-first UX
- Applies to: Home prompt kits, information gathering asks, trade construction
  interview flows
- Status: implemented
- Source:
  [`promptHomePromptKits.ts`](../../apps/web/src/workspaces/prompt/promptHomePromptKits.ts)
  and
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx)
- Lesson: when users repeatedly start the same research or trade-drafting
  conversations, expose a visible product-managed starter prompt instead of
  relying on hidden model instructions. Trade-construction kits should stay in
  draft mode, ask one gating question at a time, and confirm intent like real
  versus simulated or user-supplied versus assistant-built before proposing a
  structure.
- Deterministic opportunity: if prompt kits become role-specific, ordered by
  policy, or admin-managed, move them into typed configuration instead of
  leaving them as inline component literals.
- Agent autonomy impact: prompt kits improve explanation and drafting
  consistency without granting trade write authority or bypassing governed
  capture and review paths.
- Tests or evidence:
  [`promptHomePromptKits.test.ts`](../../apps/web/tests/promptHomePromptKits.test.ts)
  and
  [`promptHomeWorkspace.test.ts`](../../apps/web/tests/promptHomeWorkspace.test.ts)
- Follow-up: add future reusable prompt openings through the same visible Home
  prompt-kit surface so operators can inspect the opening question flow before
  sending.

### 2026-04-29 - Treat Movement Corrections as Reversals and Voids, Not Deletes

- Type: lesson
- Domain: assistant movement and logistics execution
- Applies to: `record_delivery_event`, `reverse_delivery_event`,
  `record_trade_actualization`, `void_trade_actualization`, execute-capable
  operations roles, and shipment correction previews
- Status: implemented
- Source:
  `apps/api/app/domains/operations/services/shipments.py`,
  `apps/api/app/domains/operations/services/actualizations.py`,
  `apps/api/app/domains/assistant/services/action_planners.py`,
  `apps/api/app/domains/assistant/services/action_handlers.py`,
  `apps/api/tests/test_shipments_api.py`, and
  `apps/api/tests/test_assistant_api.py`
- Lesson: when movement reality changes, preserve the operational audit trail
  by correcting through explicit domain verbs instead of deleting history.
  Delivery-event correction now appends an `EVENT_REVERSED` row that points at
  the mistaken event and recomputes live execution status from the remaining
  active business events, while actualization correction stamps `voided_at`,
  `voided_by`, and `void_reason` on the original actualization row and clears
  it from live projection state.
- Deterministic opportunity: keep delivery-event activity filtering,
  status recomputation, duplicate-reversal prevention, and actualization-void
  projection logic inside the typed shipment and actualization services so
  assistant planners only assemble evidence-backed payloads.
- Agent autonomy impact: execute-capable operations roles can now reverse
  mistaken movement events and void mistaken actualizations without per-action
  approval, but only through previewable typed contracts with stale-state
  rechecks, idempotency, provenance, and delegated-ability override logging.
- Tests or evidence: focused shipment service coverage in
  `apps/api/tests/test_shipments_api.py`; autonomous assistant execution
  coverage in `apps/api/tests/test_assistant_api.py`.
- Follow-up: apply the same non-destructive correction pattern to future
  logistics scheduling or movement-side ledger seams instead of adding delete
  shortcuts.

### 2026-04-27 - Treat Settlement Corrections as Voids and Reversals, Not Deletes

- Type: lesson
- Domain: assistant settlement execution
- Applies to: `issue_trade_invoice`, `void_trade_invoice`,
  `create_trade_payment`, `reverse_trade_payment`, execute-capable settlement
  roles, and settlement preview gates
- Status: implemented
- Source:
  `apps/api/app/domains/operations/services/settlement_invoices.py`,
  `apps/api/app/domains/operations/services/settlement_payments.py`,
  `apps/api/app/domains/assistant/services/action_planners.py`,
  `apps/api/app/domains/assistant/services/action_handlers.py`,
  `apps/api/tests/test_settlement_invoices_api.py`,
  `apps/api/tests/test_settlement_payments_api.py`, and
  `apps/api/tests/test_assistant_api.py`
- Lesson: when settlement reality changes, preserve auditability by correcting
  through explicit domain verbs instead of deleting rows. Invoice correction
  now voids the invoice by marking it `NOT_REQUIRED` with `voided_at`,
  `voided_by`, and `void_reason`, while payment correction appends an
  offsetting negative payment with `reversal_of_payment_id` instead of
  overwriting the original receipt.
- Deterministic opportunity: keep payment-balance math, duplicate-reversal
  prevention, payment-state drift tokens, invoice-relief unwinds, and preview
  blockers inside the typed settlement services so assistant planners only
  stage or execute evidence-backed payloads.
- Agent autonomy impact: execute-capable settlement roles can now issue, void,
  record, and reverse settlement records to reflect asserted real-world state
  without per-action approval, but only through previewable typed contracts
  with stale-state rechecks, idempotency, provenance, and explicit override
  logging.
- Tests or evidence: focused settlement API coverage for invoice void and
  payment reversal flows, plus autonomous and approval-path assistant coverage
  in `apps/api/tests/test_assistant_api.py`.
- Follow-up: extend the same correction pattern to future logistics or movement
  correction seams instead of introducing hard-delete side doors.

### 2026-04-27 - Promote Accrual and Accounting Autonomy Through Immutable Ledgers

- Type: lesson
- Domain: assistant accrual and accounting execution
- Applies to: `create_manual_accrual_entry`, `reverse_accrual_entry`,
  `create_accounting_entry`, `reverse_accounting_entry`, seeded execute-capable
  controller roles, and assistant eval fixtures
- Status: implemented
- Source:
  `apps/api/app/domains/accruals/services/manual_entries.py`,
  `apps/api/app/domains/accounting/services/postings.py`,
  `apps/api/app/domains/assistant/services/action_handlers.py`,
  `apps/api/app/domains/assistant/services/action_planners.py`, and
  `apps/api/tests/test_assistant_api.py`
- Lesson: when an agent needs to correct accrual or accounting state to reflect
  reality, the mutation seam should be immutable and ledger-shaped rather than
  an in-place overwrite. Manual accrual changes now append `MANUAL_ADJUSTMENT`
  or `MANUAL_REVERSAL` entries on open lots and refresh lot rollups from the
  ledger, while accounting changes create balanced posting headers plus lines
  and reverse through offsetting entries that mark the original reversed.
- Deterministic opportunity: keep rollup recomputation, balanced-line
  validation, reversal-duplication checks, and trade-linkage validation inside
  the typed domain services so agent planners only assemble evidence-backed
  payloads instead of re-implementing finance rules in prompts.
- Agent autonomy impact: the accrual-controller and accounting-posting agents
  can now execute bounded internal corrections without per-action human
  approval, but only for immutable manual adjustments or reversals with
  stale-state rechecks, idempotency, provenance, and explicit override logging
  intact.
- Tests or evidence: focused service coverage in
  `apps/api/tests/test_trade_accruals_service.py` and
  `apps/api/tests/test_trade_accounting_service.py`; autonomous assistant
  execution coverage in `apps/api/tests/test_assistant_api.py`; builder
  coverage in `apps/web/tests/assistantAgentBuilder.test.ts`.
- Follow-up: extend the same immutable pattern to future fee-recognition or
  official reporting posting seams instead of adding mutable side doors.

### 2026-04-27 - Promote New Mutation Seams Only Through Canonical Identifiers and Typed Services

- Type: lesson
- Domain: assistant trade capture and movement execution
- Applies to: `create_trade`, `amend_trade`, `record_delivery_event`, seeded
  execute-capable role scopes, and assistant eval fixtures
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/action_handlers.py`,
  `apps/api/app/domains/assistant/services/action_planners.py`,
  `apps/api/app/domains/trading/services/event_writes.py`,
  `apps/api/app/domains/operations/services/shipments.py`, and
  `apps/api/tests/test_assistant_api.py`
- Lesson: when a new governed mutation seam is promoted for autonomous agent
  execution, the assistant layer should call the canonical typed domain service
  instead of inventing a parallel write path. Trade creation and amendment now
  go through the event-write service, while delivery-event logging goes through
  the shipment service. Delivery actions should use the same canonical
  `build_delivery_obligation_id(...)` identifier shape that the operational
  resource layer derives, otherwise staged actions can look valid while the
  downstream execution projection cannot resolve the target record.
- Deterministic opportunity: keep planner payload resolution and seeded test
  fixtures aligned to the same ID builders and reference-data preconditions that
  the typed service expects, so new action seams fail fast at plan time instead
  of only during execution.
- Agent autonomy impact: execute-capable agents can now reflect reality for new
  trade bookings, trade amendments, and delivery event logging without a
  separate approval hop, but only through the published typed contract with
  stale-state checks, idempotency, and audit metadata intact.
- Tests or evidence: focused API coverage for autonomous trade create, amend,
  and delivery-event execution plus seeded-role catalog checks in
  `apps/api/tests/test_assistant_api.py` and
  `apps/api/tests/test_admin_seed_api.py`; builder coverage in
  `apps/web/tests/assistantAgentBuilder.test.ts`.
- Follow-up: extend the same pattern to future governed operational seams only
  after the canonical domain service and identifier model are already stable.

### 2026-04-25 - Seed New Domain Agents With Truthful Mutation Scope

- Type: lesson
- Domain: assistant role activation and autonomy governance
- Applies to: seeded managed-agent profiles for trade capture, movement,
  accrual, accounting, and counterparty-state workflows
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/role_archetypes.py`,
  `apps/api/app/domains/admin/services/seed_assistant_agents.py`, and
  `apps/web/src/workspaces/admin/assistantAgentBuilder.ts`
- Lesson: new domain-facing agents can be activated before every desired write
  seam exists, but their role contract, prompt, and seeded profile must name
  the live typed action surface honestly. In this pass, movement and
  counterparty-state roles were allowed to execute existing governed actions,
  trade capture was limited to the currently published cancellation action, and
  accrual plus accounting roles stayed draft-only until typed mutation
  contracts exist.
- Deterministic opportunity: when new trade-create, trade-amend, accrual, or
  accounting-entry actions are introduced, expand the role catalog through the
  typed action registry first, then promote the affected seeded roles and eval
  coverage together.
- Agent autonomy impact: agents may stay active and useful while broader write
  authority is still being built, but they should never imply an execution path
  that the governed action registry cannot actually perform.
- Tests or evidence: `apps/api/tests/test_admin_seed_api.py`,
  `apps/api/tests/test_assistant_api.py`, and
  `apps/web/tests/assistantAgentBuilder.test.ts`.
- Follow-up: add explicit typed actions for trade create or amend, accrual
  adjustments, and accounting postings before promoting those seeded roles
  beyond their current bounded scope.

### 2026-04-25 - Prefer Narrow Controller Agents Once Action Seams Stabilize

- Type: lesson
- Domain: managed-agent role design
- Applies to: confirmation, workflow, invoice, outreach, and supervision
  agent specialization
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/role_archetypes.py`,
  `apps/api/app/domains/admin/services/seed_assistant_agents.py`, and
  `apps/web/src/workspaces/admin/assistantAgentBuilder.ts`
- Lesson: once a governed action seam is stable, it is useful to seed narrower
  controller agents around that seam instead of relying only on broader
  copilot roles. The narrower role should have a tighter mission, a smaller
  tool set, and stop conditions that push adjacent work back to the right
  business record or human owner.
- Deterministic opportunity: if multiple narrow agents repeatedly hit the same
  stop condition, that gap is a good candidate for a new typed action contract
  or a shared deterministic routing helper.
- Agent autonomy impact: narrower agents can be activated earlier and audited
  more easily because their allowed mutations and override rationales are
  easier to reason about.
- Tests or evidence: `apps/api/tests/test_admin_seed_api.py`,
  `apps/api/tests/test_assistant_api.py`, and
  `apps/web/tests/assistantAgentBuilder.test.ts`.
- Follow-up: keep specialized controller agents aligned to the same action
  registry and policy notes as the broader copilot roles so they do not drift
  into parallel mutation rules.

### 2026-04-25 - Agent Learning Must Produce Reviewable Self-Update Drafts

- Type: lesson
- Domain: assistant agent governance and prompt management
- Applies to: managed-agent prompt changes, feedback-driven tuning, eval-driven
  revisions, admin review surfaces
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/agent_revisions.py`,
  `apps/api/app/domains/assistant/services/agent_self_updates.py`,
  `apps/api/app/domains/assistant/services/chat.py`,
  `apps/api/app/routes/assistant.py`, and
  `apps/web/src/workspaces/admin/AgentManagementPanel.tsx`
- Lesson: when an agent learns from recent mistakes, the platform should turn
  that evidence into a constrained self-update draft instead of silently
  mutating the active prompt. The draft is built from recent needs-work
  feedback, failing evals, autonomy-review reasons, and matched knowledge-base
  lessons, then stored as an unpublished agent revision with a visible diff
  against the published snapshot. Admins can load that revision into the editor
  for refinement, but the live agent changes only after an explicit publish
  step. The draft preserves identity and governance metadata and may only
  preserve or narrow workspaces, capabilities, live tools, or governed action
  types.
- Deterministic opportunity: repeated failure patterns that point to stable
  business rules should still graduate into typed policy, service logic, or
  eval coverage instead of staying prompt-only.
- Agent autonomy impact: agents can now improve their own draft configuration
  under human review, but they still may not self-publish broader authority or
  silently rewrite production behavior.
- Tests or evidence: `apps/api/tests/test_assistant_api.py` and
  `apps/web/tests/assistantApi.test.ts`.
- Follow-up: when the same self-update theme recurs, add or tighten eval cases
  so future learning remains measurable and promotion decisions stay grounded.

### 2026-04-24 - Pre-Trade Booking Must Recheck Approval Drift

- Type: algorithm-added
- Domain: pre-trade review governance and trade capture
- Applies to: pre-trade approval drift checks, trade booking guards, capture UI
  alignment banners, review audit reconstruction
- Status: implemented
- Source:
  `apps/api/app/domains/reports/services/pretrade_review_drift.py`,
  `apps/api/app/domains/trading/services/trade_event_application.py`,
  `apps/api/app/routes/pretrade.py`, and
  `apps/web/src/features/trades/TradeCaptureForm.tsx`
- Lesson: booking an approved pre-trade review now requires a deterministic
  drift comparison against the approval-time baseline before the trade can be
  created. The shared drift service compares the approval activity and
  immutable approval snapshot against the current attached recommendation, any
  newer related recommendation run, newly impaired evidence sources, and the
  current override context. The trade capture UI can surface that state early,
  but the booking guard in the server remains the authority that blocks stale
  approvals with a `409`.
- Deterministic opportunity: keep future drift dimensions inside the shared
  drift evaluator so approval checks, booking guards, exports, and UI banners
  reuse the same reason codes and do not fork into prompt-side heuristics.
- Agent autonomy impact: agents and UI flows may explain drift, but they should
  not waive or bypass the server-side re-approval requirement when approved
  evidence has changed.
- Tests or evidence: `apps/api/tests/test_pretrade_api.py` and
  `apps/web/tests/preTradeApi.test.ts`.
- Follow-up: if risk or compliance wants additional drift dimensions, add them
  to the typed drift contract and regression tests before surfacing them in the
  assistant or workspace copy.

### 2026-04-24 - Candidate Queues Need Deterministic Priority Order

- Type: algorithm-added
- Domain: operations and settlement candidate reads
- Applies to: trade attention candidate lists, invoice issue candidate lists,
  dashboard attention drilldowns, settlement candidate drilldowns, assistant
  live candidate tools
- Status: implemented
- Source:
  [`trade_attention_candidates.py`](../../apps/api/app/domains/operations/services/trade_attention_candidates.py),
  [`settlement_invoices.py`](../../apps/api/app/domains/operations/services/settlement_invoices.py),
  [`test_operations_workflow_items_api.py`](../../apps/api/tests/test_operations_workflow_items_api.py),
  and
  [`test_settlement_invoices_api.py`](../../apps/api/tests/test_settlement_invoices_api.py)
- Lesson: candidate reads now sort by an explicit queue policy instead of
  whichever trade happened to be oldest in the raw projection. The current
  policy is: oldest unconfirmed trade first for confirmation backlog,
  delivery-near trades first for nomination and allocation backlog, disputed
  settlement before overdue cash and overdue cash before due cash for
  settlement-oriented queues, ready invoice previews before blocked invoice
  previews, and oldest age first as the fallback within a queue. The backend
  candidate payload now also carries a typed `priority_reason` so the UI and
  assistant can explain the ordering without reimplementing queue policy in a
  second place. Assistant tool summaries and workspace-summary prefetch sections
  should surface that same reason text so chat traces, prompt context, and UI
  drilldowns stay aligned on why the first candidate surfaced. Prompt Home
  starters that ask which item to handle first should carry the same queue
  policy in category-level copy, but they should not invent row-specific
  reasons before a candidate read runs.
- Deterministic opportunity: queue order should stay a typed service rule that
  reuses existing workspace-native heuristics where possible and adds focused
  tests whenever a new candidate category gets a different priority rule.
- Agent autonomy impact: this improves read, explain, and handoff quality
  without expanding mutation authority. Approval-gated invoice, payment, and
  confirmation actions still rely on the same governed action paths after a
  human reviews the proposed step.
- Tests or evidence:
  `apps/api/tests/test_operations_workflow_items_api.py`,
  `apps/api/tests/test_settlement_invoices_api.py`,
  `apps/api/tests/test_assistant_tooling.py`, and
  `make api-assistant-evals`.
- Follow-up: if owners want a different queue order, change the named service
  policy and its regression tests together rather than compensating in prompts
  or one-off UI sorting.

### 2026-04-23 - Pre-Trade Draft Analysis Owns Live Source Collection

- Type: algorithm-added
- Domain: trader and risk recommendation tooling
- Applies to: pre-trade editor draft analysis, saved recommendation runs,
  agent draft-analysis tools, review handoff provenance
- Status: implemented
- Source:
  `apps/api/app/domains/reports/services/pretrade_recommendations.py`,
  `apps/api/app/routes/pretrade.py`,
  `apps/api/app/domains/assistant/services/tools.py`, and
  `apps/web/src/workspaces/pretrade/PreTradeWorkspace.tsx`
- Lesson: live pre-trade source snapshots now come from a shared server-side
  collector for desk exposure, counterparty credit, latest marks, market
  context, weather intelligence, and option exposure. The editor no longer
  needs to invent its own browser-side evidence package before draft analysis
  or review handoff; it can reuse the typed draft-analysis contract and pass
  those returned snapshots into saved runs when the analysis is current.
- Deterministic opportunity: future source adapters or pre-trade evidence
  enrichments should be added to the shared collector first, then surfaced to
  UI and agent tools through the same typed snapshot contract.
- Agent autonomy impact: human users and allowed read-only agents now inspect
  the same live evidence sections before review handoff without expanding
  booking, approval, or hedge-execution authority.
- Tests or evidence: `apps/api/tests/test_pretrade_api.py`,
  `apps/api/tests/test_assistant_tooling.py`, and
  `apps/web/tests/preTradeApi.test.ts`.
- Follow-up: the old browser-only recommendation helper and its unit test have
  now been retired. Keep save or submit flows reusing current draft-analysis
  snapshots only when the analysis is fresh for the latest draft state, and add
  future evidence enrichments to the shared server-owned collector first.

### 2026-04-23 - Summary-Driven Assistant Reads Need Explicit Targets

- Type: lesson
- Domain: assistant runtime routing and prompt-first operator UX
- Applies to: workspace summary asks, candidate read prefetch, prompt-home starter flows, sign-in resume handoff
- Status: implemented
- Source: `apps/api/app/schemas/assistant.py`,
  `apps/api/app/domains/assistant/services/execution.py`,
  `apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx`, and
  `apps/web/src/workspaces/prompt/promptHomeStarters.ts`
- Lesson: when a prompt is triggered from a known workspace summary surface,
  pass explicit summary count keys through the request contract instead of
  relying on phrase matching inside freeform prompt text. The assistant runtime
  can then prefetch the aligned deterministic candidate reads even when the
  user message is short or ambiguous, and the sign-in resume path can preserve
  that same routing intent.
- Deterministic opportunity: future summary cards, prompt starters, or guided
  asks should attach typed `summary_targets` whenever they are meant to route
  through workspace-summary candidate reads.
- Agent autonomy impact: this improves read accuracy and explainability without
  increasing write authority or bypassing staged action governance.
- Tests or evidence: `apps/api/tests/test_assistant_api.py`,
  `apps/web/tests/promptHomeStarters.test.ts`,
  `apps/web/tests/promptResumeIntent.test.ts`, and
  `make api-assistant-evals`.
- Follow-up: when more summary surfaces are added, wire them to explicit
  targets first and keep phrase matching only as a fallback for freeform asks.

### 2026-04-23 - Action Specs Own Approval Preconditions

- Type: lesson
- Domain: assistant action governance
- Applies to: approval-gated action requests, action preview requirements, stale-state and idempotency execution checks
- Status: implemented
- Source: `apps/api/app/domains/assistant/services/action_specs.py` and
  `apps/api/app/domains/assistant/services/action_requests.py`
- Lesson: per-action execution requirements should be declared in the typed
  action spec registry instead of scattered through approval helpers. The
  deterministic executor remains the source of business mutation behavior, but
  reusable governance metadata such as `requires_ready_preview` belongs beside
  the published catalog entry and handler.
- Deterministic opportunity: add new approval preconditions as typed spec
  fields when they apply to a named action type, then enforce them through the
  shared approval gateway.
- Agent autonomy impact: action-specific gates stay reviewable and testable
  without granting broader autonomy or allowing freeform model output to bypass
  policy checks.
- Tests or evidence: registry coverage in `apps/api/tests/test_assistant_api.py`
  and assistant eval coverage through `make api-assistant-evals`.
- Follow-up: promote future repeated approval checks into action spec fields
  before adding one-off conditional logic.

### 2026-04-23 - Pre-Trade Recommendation Runs Power Agent Reads

- Type: algorithm-added
- Domain: trader and risk recommendation tooling
- Applies to: pre-trade recommendation runs, structured residual exposure
  triage, hedge-draft explanation, agent read tools
- Status: implemented
- Source:
  `apps/api/app/domains/reports/services/pretrade_recommendations.py`,
  `apps/api/app/domains/assistant/services/tools.py`, and
  `apps/api/app/domains/assistant/services/role_archetypes.py`
- Lesson: saved pre-trade recommendation runs are now the shared typed contract
  for both UI and agent reads. The deterministic service owns normalization,
  opportunity summary, residual exposure, netting candidates, hedge draft,
  rejected alternatives, and missing evidence. Assistant roles consume the same
  saved contract through a governed read tool instead of recreating the logic
  in prompt-only reasoning.
- Deterministic opportunity: future unsaved-scenario analysis or staged
  pre-trade actions should build on the explicit
  `prepare_pretrade_recommendation_evaluation` service boundary and preserve
  the same machine-readable evidence sections.
- Agent autonomy impact: Market Research, Pre-Trade Structuring, and Risk
  Sentinel can observe and explain saved recommendation evidence, but they
  still cannot book trades, approve reviews, or execute hedges.
- Tests or evidence: `apps/api/tests/test_pretrade_api.py`,
  `apps/api/tests/test_assistant_tooling.py`,
  `apps/api/tests/test_assistant_evals.py`, and
  `apps/api/tests/test_assistant_api.py`.
- Follow-up: add a staged pre-trade review-item action only after an explicit
  action type, reviewer policy, stale-state checks, and outcome metrics exist.

### 2026-04-22 - Persona Stories Need Productized Algorithms

- Type: algorithm-candidate
- Domain: trading, risk, operations, settlement, accruals
- Applies to: market opportunity detection, freight and fee economics,
  long/short matching, hedge instrument recommendations, checklist automation,
  invoice/payment follow-through, accrual and reconciliation exception detection
- Status: proposed
- Source: [Business Use Case Roadmap](./business-use-case-roadmap.md) and
  [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: broad persona requests such as "find opportunities," "flatten my
  book," "tell me how to hedge," "automate reconciliations," and "identify
  accrual issues" should be decomposed into durable work objects and
  deterministic services before any agent receives write or execution
  authority. Agents can explain, compare, draft, and stage reviewable work, but
  official prices, exposure, hedge deltas, cost stacks, accruals, payments, and
  business mutations need typed service ownership.
- Deterministic opportunity: create explicit algorithms for opportunity
  classification, physical movement cost stacks, long/short netting sets,
  hedge instrument decision tables, workflow checklist policy, and accrual or
  reconciliation exception detection.
- Agent autonomy impact: keep trade booking, hedge execution, freight trades,
  payment release, external communication, policy changes, and official
  financial records human-owned or approval-gated until service rules, stale
  checks, idempotency, audit, evals, and outcome evidence are in place.
- Tests or evidence: each promoted algorithm should add focused service tests,
  relevant assistant evals for prompt/tool behavior, and browser smoke coverage
  when a new cross-workspace operator journey is introduced.
- Follow-up: when a workstream starts, create or update the owning design doc
  with owner, inputs, outputs, rule set, stop conditions, audit, rollback, and
  verification expectations.

### 2026-04-22 - Trader/Risk MVP Starts As Draft Authority

- Type: stop-condition
- Domain: trader and risk decision support
- Applies to: opportunity notes, residual exposure triage, long/short netting
  sets, hedge recommendations, pre-trade scenario handoffs
- Status: proposed
- Source: [Trader/Risk MVP Work Packages](./trader-risk-mvp-work-packages.md),
  [Human-Agent Authority Matrix](./human-agent-authority-matrix.md), and
  [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: trader/risk recommendations can feel close to execution, so the first
  MVP must preserve the difference between recommendation and commitment.
  Agents and deterministic services may draft opportunity, netting, and hedge
  analysis with source evidence, but humans continue to own trade capture,
  hedge execution, bilateral commitments, and freight commitments.
- Deterministic opportunity: build recommendation contracts, source freshness,
  residual exposure triage, netting rules, and hedge decision tables as typed
  services before considering any staged action type.
- Agent autonomy impact: keep Market Research, Pre-Trade Structuring, and Risk
  Sentinel roles at read/explain/draft for this slice. Add assistant evals that
  fail if an agent claims it booked a trade, executed a hedge, guaranteed a
  hedge choice, or ignored stale evidence.
- Tests or evidence: TRMVP work packages require focused service tests for
  recommendation rules, `make api-assistant-evals` for prompt/tool authority,
  and browser smoke for the review-to-capture handoff when implemented.
- Follow-up: only consider approval-gated action requests after typed work
  objects, stale-state checks, idempotency, policy ownership, and outcome
  metrics exist.

### 2026-04-22 - Human Workflows Need Agent Tooling Counterparts

- Type: lesson
- Domain: agent toolkit and product workflow design
- Applies to: trader/risk MVP, operations automation, settlement automation,
  accruals, reconciliation, future persona-driven workflows
- Status: proposed
- Source: [Business Use Case Roadmap](./business-use-case-roadmap.md) and
  [Trader/Risk MVP Work Packages](./trader-risk-mvp-work-packages.md)
- Lesson: persona stories are requirements for both human operators and AI
  agents. When a human workspace gains a capability, the implementation should
  identify the matching agent toolkit surface: read tools, deterministic
  recommendation tools, typed action-request payloads, source freshness,
  provenance, and machine-readable stop conditions.
- Deterministic opportunity: design service outputs once, then let both UI
  components and assistant tools consume the same typed contract instead of
  creating separate prompt-only reasoning paths.
- Agent autonomy impact: adding tools does not grant execution authority. New
  read or recommendation tools should arrive before action tools; action tools
  require published action types, stale-state checks, idempotency, reviewer
  roles, expected effects, and eval coverage.
- Tests or evidence: each new agent toolkit capability should include focused
  service tests plus assistant evals for tool selection, missing/stale evidence,
  and no-overclaim behavior.
- Follow-up: future work packages should include an "Agent Toolkit
  Implications" section whenever a feature is expected to serve agents as well
  as humans.

### 2026-04-22 - Prompt Navigation Is A UI Intent

- Type: lesson
- Domain: prompt-first operator experience
- Applies to: assistant landing surfaces, workspace routing, route handoffs,
  prompt-led old-UX navigation, action governance
- Status: proposed
- Source: [Prompt-First Operator Experience Work Packages](./prompt-first-operator-experience-work-packages.md)
  and [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: prompt-led navigation should be modeled as a non-mutating UI intent,
  separate from assistant action requests. The assistant may recommend opening,
  focusing, or filtering a workspace, but business writes must continue through
  typed services, permission checks, audit, and approval-gated action requests
  where required.
- Deterministic opportunity: repeated accepted routing decisions should become
  deterministic intent rules with typed inputs, allowed destinations, rejection
  reasons, and focused browser or assistant-eval coverage.
- Agent autonomy impact: navigation intent can make the assistant feel more
  capable without increasing mutation authority. If the request changes
  records, emits events, or creates external commitments, reduce authority back
  to staged action or manual workflow.
- Tests or evidence: initial proof should cover default prompt landing,
  accepted workspace navigation, focused trade handoff, invalid intent
  rejection, and unsupported mutation fallback.
- Follow-up: implement the prompt-first work packages before considering any
  broader prompt-led execution authority.

### 2026-04-22 - Assistant Feedback Belongs On Runs

- Type: lesson
- Domain: assistant outcome tracking
- Applies to: assistant responses, run tracing, eval inputs, prompt review
- Status: implemented
- Source: [AI Workflow](./ai-workflow.md)
- Lesson: user feedback on an assistant answer should be captured as a durable
  run-level record with user/session provenance, not as loose chat text or a
  hidden prompt adjustment.
- Deterministic opportunity: recurring feedback comments that identify stable
  product behavior, missing evidence rules, or repeatable answer-quality checks
  should feed the deterministic algorithm loop instead of remaining prompt-only.
- Agent autonomy impact: feedback improves promotion and retirement signals,
  but it does not grant mutation authority or change business records directly.
- Tests or evidence: focused API coverage verifies feedback creation, update,
  access scoping, conversation reload serialization, and admin aggregation by
  agent, workspace, recent feedback, and helpful vs. needs-work totals.
- Follow-up: connect recurring needs-work comments to eval cases and agent
  health reviews.

### 2026-04-22 - Deterministic Algorithms Are An Agent Promotion Path

- Type: lesson
- Domain: agent governance
- Applies to: autonomy reviews, repeated recommendations, action-governance
  design, formula and policy promotion
- Status: accepted
- Source: [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: agents should not only choose between current deterministic logic and
  open-ended reasoning. When an agent finds a recurring judgment that can be
  expressed as rules, formulas, thresholds, decision tables, or typed service
  behavior, it should propose or implement deterministic logic through the
  normal engineering path.
- Deterministic opportunity: repeated accepted recommendations, prompt
  instructions that compensate for missing product behavior, and stable review
  decisions should be promoted into formulas, policy rules, projection checks,
  or domain services.
- Agent autonomy impact: creating deterministic logic can increase safe autonomy
  because future agents can rely on inspectable rules instead of restating the
  same judgment in prompts.
- Tests or evidence: algorithm proposals should identify required tests, evals,
  fixtures, audit expectations, and reviewer ownership before promotion.
- Follow-up: when a future agent proposes or adds a deterministic algorithm,
  append a focused `algorithm-candidate` or `algorithm-added` entry here.

### 2026-04-22 - Accepted Work Packages Are The Autonomy Handoff

- Type: algorithm-added
- Domain: agent governance, deterministic algorithm promotion
- Applies to: generated health-review work packages, recurring deterministic
  candidates, policy/service/eval/knowledge-base backlog items
- Status: implemented
- Source: `apps/api/app/domains/assistant/services/agent_work_packages.py`
  and `apps/web/src/workspaces/admin/AgentManagementPanel.tsx`
- Lesson: generated health-review work packages become actionable only after an
  admin accepts them into the durable work-package backlog. Acceptance preserves
  the candidate, source agents, recommended owner, checks, lifecycle status,
  actor, timestamps, and notes so the work can move from autonomy review into
  implementation without relying on an ephemeral generated snapshot.
- Deterministic opportunity: lifecycle transitions should turn accepted policy,
  service, eval, or knowledge-base packages into concrete PRs, eval cases, or
  docs entries, then mark the package implemented only with verification
  evidence.
- Agent autonomy impact: agents may propose and group deterministic candidates,
  but accepted backlog records are the review gate before changing product
  behavior or agent authority.
- Tests or evidence: service and API coverage verifies candidate acceptance,
  idempotent persistence, valid and invalid lifecycle transitions, admin auth,
  structured implementation evidence, and frontend API ownership.
- Follow-up: when a package is marked implemented, add or update the focused
  `algorithm-added`, eval, or policy lesson that explains the actual shipped
  behavior.

### 2026-04-23 - Implemented Work Packages Need Audit Evidence

- Type: algorithm-added
- Domain: agent governance, implementation audit
- Applies to: assistant agent work packages marked `IMPLEMENTED`
- Status: implemented
- Source: `apps/api/app/domains/assistant/services/agent_work_packages.py`,
  `apps/api/app/schemas/assistant.py`, and
  `apps/web/src/workspaces/admin/AgentManagementPanel.tsx`
- Lesson: a work package should reach `IMPLEMENTED` only after it points to at
  least one shipped artifact such as a PR, commit, eval, test, or doc update.
  The durable work-package record now keeps those artifacts plus an optional
  implementation owner so later agents and human reviewers can see what
  actually shipped instead of inferring it from a freeform note.
- Deterministic opportunity: typed evidence fields make it possible to build
  backlog filters, control-tower counts, and promotion checks from audit data
  instead of parsing prose. Control-tower stale signals should drill straight
  into a filtered backlog view for the affected source agent so supervisors can
  review the actual stuck packages instead of working from summary text alone.
- Agent autonomy impact: agents can propose and draft implementation work, but
  the record of what shipped stays explicit, reviewable, and separable from
  the generated recommendation itself.
- Tests or evidence: service and API coverage verifies the evidence gate,
  normalization, lifecycle persistence, implemented actor/timestamp capture,
  evidence-aware backlog filters, control-tower implementation counts, and
  stale-package trust signals after 72 hours without shipped proof; frontend
  API tests verify evidence payload ownership, and the admin control-tower UI
  now links stale signals into the filtered work-package backlog.
- Follow-up: if stale-package reminders generate too much noise, split the
  threshold or severity by `ACCEPTED` versus `IN_PROGRESS` status instead of
  weakening the requirement for shipped evidence.

### 2026-04-22 - Freeform Output Must Not Mutate Records

- Type: stop-condition
- Domain: action governance
- Applies to: assistant actions, automation, bulk work, record mutations
- Status: accepted
- Source: [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
  and [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: no agent should directly mutate business records from freeform model
  output. Proposed changes must become typed payloads and flow through the same
  application services, permissions, policy checks, audit capture, and review
  paths as manual UI actions.
- Deterministic opportunity: repeated action patterns should become published
  action types with deterministic validation, stale-state checks, idempotency,
  reviewer metadata, and domain-service execution.
- Agent autonomy impact: an agent can draft or stage a mutation only after a
  typed action contract exists. Without that contract, keep the agent at explain
  or draft.
- Tests or evidence: add service tests for validation, permission failure,
  stale-state handling, idempotency, and audit capture; add assistant evals for
  action-governance prompt behavior.
- Follow-up: when a new mutation pattern appears, create or update the action
  gateway contract before increasing autonomy.

### 2026-04-22 - Durable Work Objects Beat Chat State

- Type: lesson
- Domain: work-object governance
- Applies to: staged actions, handoffs, reports, agent-generated work
- Status: accepted
- Source: [Canonical Work Object Inventory](./canonical-work-object-inventory.md)
  and [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- Lesson: agents and humans should operate on durable records, not loose chat
  state. If future users need to inspect, approve, correct, or take over work,
  the work needs ownership, lifecycle, provenance, permissions, and action
  history.
- Deterministic opportunity: recurring agent outputs should graduate into
  canonical work objects, report definitions, action requests, review items, or
  domain records with typed lifecycle states.
- Agent autonomy impact: do not stage or execute agent work that has no owning
  work object. Draft first, then propose the durable object if the pattern
  repeats.
- Tests or evidence: verify created work objects carry stable identifiers,
  lifecycle status, actor attribution, policy status, and source links.
- Follow-up: when an agent proposes side-channel work, map it to an existing
  object or add an `algorithm-candidate` entry for a new object/lifecycle.

### 2026-04-22 - External Commitments Stay Human-Only In Phase 1

- Type: stop-condition
- Domain: external commitment governance
- Applies to: trade booking, trade amendment, counterparty communication,
  scheduling commitment, payment release, bank instructions
- Status: accepted
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md) and
  [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- Lesson: Phase 1 agents may not externally commit the firm. They can draft or
  stage approved internal requests, but humans remain responsible for booking
  trades, sending counterparty communications, committing logistics externally,
  and releasing cash.
- Deterministic opportunity: before any narrow external-commit case is
  considered, the platform needs deterministic policy checks, legal/compliance
  approval, replay, monitoring, and a kill switch.
- Agent autonomy impact: if the request can bind the firm externally, reduce
  autonomy to draft or human-only review.
- Tests or evidence: evals should catch over-claims of authority, direct booking
  attempts, payment-release attempts, and external communication send attempts.
- Follow-up: keep external-commitment proposals in governance docs until a
  separate control model exists.

### 2026-04-22 - Operational Values Need Deterministic Formulas

- Type: lesson
- Domain: extensibility and reporting
- Applies to: formulas, calculated columns, report values, derived KPIs
- Status: accepted
- Source: [User Extensibility Initiative](./user-extensibility-initiative.md)
  and [Future-Ready Engineering Work Packages](./future-ready-engineering-work-packages.md)
- Lesson: formulas and derived values must be deterministic, typed,
  side-effect-free, inspectable, and built on approved semantic fields. Agents
  can explain or propose formulas, but they must not become the source of truth
  for operational values.
- Deterministic opportunity: repeated calculations should become formula
  definitions, report definitions, domain services, or promoted schema fields
  when they affect validation, workflow branching, official reporting, or
  integrations.
- Agent autonomy impact: agents may draft a formula proposal and explain lineage,
  but trusted values must be produced by deterministic logic.
- Tests or evidence: formula validation should cover type safety, allowed
  functions, dependency cycles, row-level access, lineage, and rollback.
- Follow-up: when an agent notices a recurring calculation in prompts or reports,
  add an `algorithm-candidate` entry and propose the semantic field inputs.

### 2026-04-22 - Workflow Item Updates Are The First Bounded-Execute Candidate

- Type: promotion-signal
- Domain: operations workflow
- Applies to: workflow owner, due date, status, notes, blocker triage
- Status: proposed
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md) and
  [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- Lesson: workflow item updates are a strong first candidate for bounded
  autonomous execution because they are internal, inspectable, reversible through
  normal workflow correction, and already represented as durable work objects.
- Deterministic opportunity: encode allowed status transitions, required owner
  roles, stale-state checks, idempotency, due-date rules, and blocker escalation
  as deterministic policy before execution.
- Agent autonomy impact: agents should start at draft or stage. Promotion to
  bounded execute needs high approval rate, low correction rate, deterministic
  policy, eval coverage, audit, and owner sign-off.
- Tests or evidence: service tests should cover status transition policy,
  unauthorized owner changes, stale items, repeated requests, and audit trail.
- Follow-up: implement [AP1-19](./agent-platform-phase-1-tickets.md) to turn
  this promotion signal into deterministic workflow item update policy.

### 2026-04-22 - Workflow Item Update Policy Belongs In The Service Layer

- Type: algorithm-added
- Domain: operations workflow
- Applies to: `update_trade_workflow_item`, assistant-staged workflow updates,
  manual workflow item patches, future workflow automation
- Status: implemented
- Source:
  [`workflow_items.py`](../../apps/api/app/domains/operations/services/workflow_items.py),
  [`action_runtime.py`](../../apps/api/app/domains/assistant/services/action_runtime.py),
  and [AP1-19](./agent-platform-phase-1-tickets.md)
- Lesson: workflow item update authority must be evaluated by a shared,
  side-effect-free policy before any route, assistant action, or future
  automation mutates the item. Route-only guards are insufficient because
  assistant approvals can execute through service paths that bypass route
  helpers.
- Deterministic opportunity: use observed approval outcomes, reviewer
  corrections, and policy-failure rates to define promotion thresholds before
  any workflow update moves from staged approval to bounded execution.
- Agent autonomy impact: agents may stage workflow updates only after the policy
  normalizes changes, checks deterministic blockers, and emits reviewer role,
  old/new preview values, stale-state basis, and idempotency key. This does not
  grant bounded autonomous execution yet.
- Tests or evidence: `apps.api.tests.test_operations_workflow_items_api` covers
  the policy review context, terminal transition blocking, due-date windows,
  stale-version failure, idempotent retry handling, assistant execution
  blockers, rollup behavior, and credit constraints;
  `apps.api.tests.test_assistant_evals` covers the assistant governance path.
- Follow-up: use the outcome-metrics endpoint to collect enough workflow-update
  history before proposing any bounded-execution policy expansion.

### 2026-04-22 - Outcome Metrics Can Recommend Autonomy Changes, Not Apply Them

- Type: algorithm-added
- Domain: assistant governance
- Applies to: admin outcome reporting, action request review burden, bounded
  execution promotion review, pause recommendations
- Status: implemented
- Source:
  [`outcome_metrics.py`](../../apps/api/app/domains/assistant/services/outcome_metrics.py),
  [`assistant.py`](../../apps/api/app/routes/assistant.py), and
  [AP1-17](./agent-platform-phase-1-tickets.md)
- Lesson: autonomy promotion needs deterministic observed-outcome thresholds,
  but threshold results should remain advisory until a human owner explicitly
  changes policy. Metrics can identify candidates and noisy agents; they should
  not silently alter authority.
- Deterministic rule: compute action outcome rates from decided action
  requests, stale-action outcomes from stale failures or idempotent stale
  retries, and pause signals from rejection, failed-execution, stale-action, and
  aged-pending thresholds. Promotion requires enough decided outcomes, no
  pending backlog, and rates below conservative limits.
- Agent autonomy impact: agents can be flagged as
  `ELIGIBLE_FOR_BOUNDED_REVIEW` or `RECOMMEND_PAUSE`, but both states require a
  human admin decision before capabilities, action policy, or status changes.
- Tests or evidence: `apps.api.tests.test_assistant_api` seeds contrasting
  high-confidence and noisy agents, then verifies by-agent and by-action-type
  recommendation behavior from the Admin metrics endpoint. The Admin workspace
  now renders the advisory endpoint through a read-only outcome metrics panel.
- Follow-up: add correction capture so reviewer edits, not only
  approve/reject/failed outcomes, can inform promotion thresholds.

### 2026-04-22 - Document Execution Needs Matching And Ambiguity Policy

- Type: algorithm-candidate
- Domain: document workflow
- Applies to: document routing, linkage, reprocessing, document-created records
- Status: proposed
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md),
  [Agent Role Catalog](./agent-role-catalog.md), and
  [Document Taxonomy](./document-taxonomy-trading-shipping.md)
- Lesson: document agents are valuable for classification, explanation, and
  ambiguity surfacing, but document linkage and document-created records need
  explicit confidence, matching, ambiguity, and approval policy before they
  become more autonomous.
- Deterministic opportunity: create decision tables for document kind support,
  candidate-record matching, minimum evidence, conflicting evidence, reprocess
  eligibility, and manual-review escalation.
- Agent autonomy impact: reprocessing is a safer first staged action. Linkage
  and record creation should remain draft or approval-gated until deterministic
  matching policy exists.
- Tests or evidence: fixture documents should cover confident match, multiple
  candidates, missing keys, unsupported document kind, stale target record, and
  permission denial.
- Follow-up: when document reviewers repeatedly resolve the same ambiguity,
  promote that decision into matching or routing logic.

### 2026-04-22 - Prompt And Tool Changes Need Evals

- Type: lesson
- Domain: assistant evals
- Applies to: prompts, managed agents, tool allowlists, approval behavior,
  over-claiming certainty
- Status: accepted
- Source: [AI Workflow](./ai-workflow.md)
- Lesson: managed-agent changes should land with eval coverage, not just ad hoc
  prompt spot checks. This is especially important when a change affects tool
  access, action governance, approval boundaries, or claims of certainty without
  a live read.
- Deterministic opportunity: encode expected prompt sections, tool filters,
  warnings, action-staging behavior, and permission boundaries as fixture evals.
- Agent autonomy impact: do not promote an agent role or action type without eval
  cases that cover the new authority boundary.
- Tests or evidence: run or update `make api-assistant-evals` for assistant or
  automation changes that affect provider selection, tools, prompts, approvals,
  or over-claiming certainty.
- Follow-up: add a knowledge-base entry when an eval reveals a new stop
  condition or promotion signal.

### 2026-04-22 - Pause Thresholds Should Become Deterministic Policy

- Type: algorithm-candidate
- Domain: control tower governance
- Applies to: agent pause, narrow, retire, intervention, outcome review
- Status: proposed
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md) and
  [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- Lesson: agents that create noisy drafts, rejected staged actions, failed
  executions, stale-data claims, or repeated corrections should be paused,
  narrowed, or retired based on explicit thresholds instead of subjective vibes.
- Deterministic opportunity: define pause thresholds for rejection rate,
  correction rate, failed-action rate, stale-data warnings, policy failures,
  repeated unsupported requests, and reviewer override frequency.
- Agent autonomy impact: outcome metrics should control promotion and demotion.
  An agent should not gain authority while its value and failure signals are
  unmeasured.
- Tests or evidence: control tower reports should show run count, staged actions,
  approvals, rejections, failures, corrections, pauses, and reviewer overrides.
- Follow-up: once metrics exist, add `promotion-signal` or `retirement-signal`
  entries based on observed thresholds.

### 2026-04-22 - Projection Integrity Is Deterministic Control Logic

- Type: algorithm-added
- Domain: projection monitoring
- Applies to: projection audit, repair, alert delivery, operational controls
- Status: accepted
- Source: [ADR 0003](../adr/0003-operational-framework-and-projection-monitoring.md)
- Lesson: projection integrity monitoring should use deterministic audit checks
  and deterministic repair paths where safe. Agents may summarize failures or
  draft interventions, but the control itself should remain inspectable and
  repeatable.
- Deterministic opportunity: projection checks and safe repairs are a pattern for
  future control-plane algorithms: define invariants, run state, alert history,
  repair eligibility, and operator-visible outcomes.
- Agent autonomy impact: agents can explain projection issues and recommend
  repair actions, but autonomous repair needs deterministic eligibility,
  persisted run state, audit, and admin-facing controls.
- Tests or evidence: tests should cover clean runs, detected drift, safe repair,
  unsafe repair escalation, alert delivery, and persisted run history.
- Follow-up: use this pattern when designing other operational integrity checks.

### 2026-04-22 - Policy And Reference Data Are Not Prompt Problems

- Type: stop-condition
- Domain: policy and reference data
- Applies to: permissions, limits, reference data, approval thresholds, tool
  access, agent configuration
- Status: accepted
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md) and
  [User Extensibility Initiative](./user-extensibility-initiative.md)
- Lesson: agents may recommend policy or reference-data changes, but they should
  not mutate policy, permissions, reference data, limits, or agent configuration
  directly. These are versioned, owned, auditable product controls.
- Deterministic opportunity: repeated policy decisions should become versioned
  policy rules, typed configuration, admin workflows, or reference-data services
  with ownership and publish controls.
- Agent autonomy impact: keep these requests at draft recommendation unless a
  human owner explicitly approves a governed workflow.
- Tests or evidence: verify permission checks, ownership metadata, publish or
  retire lifecycle, audit attribution, and rollback path.
- Follow-up: when a prompt contains policy-like instructions, propose moving that
  rule into versioned configuration or typed service logic.

### 2026-04-22 - Internal Reports Can Be Early Autonomy With Source Links

- Type: promotion-signal
- Domain: reporting and reconciliation
- Applies to: desk briefings, exception summaries, settlement packs, sourced
  internal reports
- Status: proposed
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md) and
  [Agent Role Catalog](./agent-role-catalog.md)
- Lesson: internal report generation is a reasonable early autonomy candidate
  when the output is clearly sourced, not an official external commitment, and
  review burden is lower than manual drafting.
- Deterministic opportunity: repeated report shapes should become report
  definitions over approved semantic fields, with deterministic filters,
  sections, lineage, and freshness checks.
- Agent autonomy impact: agents may generate internal draft reports earlier than
  they may mutate records. Official publication, shared presets, or external use
  should stay draft or stage until publication policy exists.
- Tests or evidence: report evals should verify source links, freshness labels,
  row-level access, no hidden data leakage, and clear uncertainty language.
- Follow-up: promote commonly accepted report formats into governed report
  definitions.

### 2026-04-22 - Codex Dispatch Is An Admin Engineering Workflow

- Type: lesson
- Domain: engineering automation
- Applies to: Codex task dispatch, repository-changing agent work, admin
  workflow automation
- Status: accepted
- Source: [AI Workflow](./ai-workflow.md)
- Lesson: kicking off Codex from inside ECTRM should be treated as an
  admin-owned engineering workflow, not as a normal business assistant action.
  The app may record a task and dispatch a configured repository workflow, but
  Codex results should still land as reviewable code artifacts such as branches,
  pull requests, or workflow output.
- Deterministic opportunity: keep dispatch configuration in typed backend
  settings and task state in durable `codex_task_requests` records with explicit
  statuses.
- Agent autonomy impact: assistants may draft Codex task prompts, but starting
  repository-mutating work should remain behind admin authentication and
  server-side credentials.
- Tests or evidence: focused API coverage should verify disabled/config-missing
  behavior, successful dispatch recording, and failed dispatch audit state.
- Follow-up: if assistants later stage Codex tasks, add a typed action request
  and approval path instead of letting chat text dispatch directly.

### 2026-04-22 - Long-Running Codex Needs Explicit Stop Conditions

- Type: lesson
- Domain: engineering automation
- Applies to: Codex task dispatch, long-running repository agents,
  recommendation loops
- Status: accepted
- Source: [AI Workflow](./ai-workflow.md)
- Lesson: letting Codex continue from one completed task into the next should be
  modeled as a bounded loop, not as open-ended autonomy. The request must carry
  a run mode, iteration cap, continuation question, and stop conditions so the
  repository workflow has a deterministic contract to follow.
- Deterministic opportunity: store loop controls on `codex_task_requests` and
  render the continuation contract into the dispatch prompt rather than relying
  on freeform operator wording. Track execution through a token-authenticated
  callback that writes workflow run, branch, pull request, artifact, summary,
  and stop-reason metadata back to the original task record.
- Agent autonomy impact: long-running Codex may choose the next repository task
  only when it is concrete, high-confidence, repository-local, and within the
  original request. It must stop for protected business domains, production data
  mutation, external commitments, or verification failures requiring human
  review.
- Tests or evidence: API coverage should verify loop metadata persistence,
  prompt contract rendering, configured iteration caps, callback token
  enforcement, and execution-state updates.

### 2026-04-22 - Autonomy Reviews Need A Generated Brief

- Type: algorithm-added
- Domain: assistant governance
- Applies to: managed agent promotion, pause review, narrowing decisions,
  deterministic algorithm discovery
- Status: implemented
- Source:
  [`autonomy_review.py`](../../apps/api/app/domains/assistant/services/autonomy_review.py)
  and [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: before increasing or narrowing a managed agent's authority, generate
  an autonomy review brief instead of relying on the agent profile alone. The
  brief combines current profile authority, observed outcomes, role/profile eval
  expectations, stop conditions, and relevant knowledge-base lessons.
- Deterministic opportunity: recurring brief recommendations should become
  explicit promotion, pause, or narrowing policy once the thresholds are stable
  enough for product enforcement.
- Agent autonomy impact: agents should use the brief as the review handoff when
  asking for more autonomy. A brief can recommend bounded-review eligibility,
  but only a human owner should apply the authority change.
- Tests or evidence: focused API coverage verifies admin-only access, missing
  agent handling, outcome metrics inclusion, eval signal projection, checklist
  output, and knowledge-base entry selection.
- Follow-up: use generated brief recommendations and deterministic candidates
  during agent health review, then promote repeated candidates into governed
  policy or service work packages.

### 2026-04-22 - Codex Dispatch Smoke Tests Stay Two-Stage

- Type: lesson
- Domain: engineering automation
- Applies to: Codex task dispatch, GitHub workflow callbacks, long-running
  repository agents
- Status: implemented
- Source: [AI Workflow](./ai-workflow.md) and
  [`run_codex_task_smoke.py`](../../apps/api/scripts/run_codex_task_smoke.py)
- Lesson: verify Codex dispatch in two stages. First run the local smoke path
  to prove the workflow contract, admin task creation, callback updates, and
  callback-token rejection without mutating GitHub. Then run a live dispatch
  only after the remote workflow, API environment, and GitHub secrets are
  configured.
- Deterministic opportunity: keep smoke readiness checks explicit so missing
  secrets or unregistered workflows fail as setup gaps, not ambiguous task
  failures.
- Agent autonomy impact: local smoke coverage can validate plumbing, but it
  does not prove repository-mutating autonomy. Live Codex runs remain
  admin-owned and should land as reviewable branches, pull requests, or
  artifacts.
- Tests or evidence: `make api-codex-smoke` creates a local long-running Codex
  task, posts running and completed callbacks, rejects a bad callback token,
  and reports missing live prerequisites.
- Follow-up: once the Codex workflow is present on GitHub and secrets are
  configured, dispatch a tiny no-op admin task to exercise the full GitHub
  Actions path.

### 2026-04-22 - Corrected Approvals Still Mean Human Cleanup

- Type: algorithm-added
- Domain: assistant governance
- Applies to: action request approvals, outcome metrics, bounded-execution
  promotion review, deterministic algorithm candidates
- Status: implemented
- Source:
  [`action_requests.py`](../../apps/api/app/domains/assistant/services/action_requests.py),
  [`outcome_metrics.py`](../../apps/api/app/domains/assistant/services/outcome_metrics.py),
  and [Agent Action Request Contract](./agent-action-request-contract.md)
- Lesson: an approved action is not always an autonomy win. If the reviewer
  approved only after correcting the agent's evidence, payload framing, or
  assumptions, preserve that distinction as `APPROVED_WITH_CORRECTIONS` with a
  summary or corrected field names.
- Deterministic opportunity: repeated corrected fields are candidates for typed
  validation, policy checks, formula logic, stale-state enrichment, or prompt
  evals. When the same correction recurs, propose the deterministic rule instead
  of relying on future reviewers to catch it.
- Agent autonomy impact: corrected approvals count against bounded-execution
  promotion. Future agents should treat a high correction rate as evidence to
  keep the action staged, narrow authority, or create a deterministic algorithm
  before asking for more autonomy.
- Tests or evidence: API coverage verifies corrected-approval persistence,
  correction-detail validation, rejection notes, audit-trace serialization, and
  outcome-metric correction rates and promotion blockers. Web tests verify that
  approval and rejection calls send structured decision metadata.
- Follow-up: review recurring `correction_fields` during autonomy reviews and
  append `algorithm-candidate` entries when a stable rule emerges.

### 2026-04-22 - Health Reviews Promote Brief Candidates Into Work Packages

- Type: algorithm-added
- Domain: assistant governance
- Applies to: agent health review, deterministic algorithm candidates, policy
  work packages, service work packages
- Status: implemented
- Source:
  [`autonomy_review.py`](../../apps/api/app/domains/assistant/services/autonomy_review.py)
  and [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: autonomy briefs should feed a cross-agent health review. When
  multiple agents surface the same deterministic candidate, group it into a
  stable work package with source agents, owner role, priority, rationale, and
  acceptance checks.
- Deterministic opportunity: repeated review judgments should graduate into
  typed policy, service, or eval work packages instead of staying as prompt
  guidance or one-off review notes.
- Agent autonomy impact: a health-review work package is not extra autonomy by
  itself. It is evidence that the deterministic guard should be implemented
  before expanding authority or reducing reviewer involvement.
- Tests or evidence: API coverage verifies admin-only health review access,
  cross-agent candidate grouping, stable package IDs, priority assignment, owner
  projection, and agent-to-package references. Web API coverage verifies the
  typed Admin health-review URL and auth headers.
- Follow-up: persist accepted work packages when the team needs lifecycle state
  beyond generated candidate snapshots.

### 2026-04-22 - Sensitive Actions Need Deterministic Preview Gates

- Type: algorithm-added
- Domain: assistant action governance
- Applies to: settlement preview-backed actions, action request approval,
  execute-capable settlement roles, reviewer surfaces, future sensitive action
  previews
- Status: implemented
- Source:
  [`settlement_invoices.py`](../../apps/api/app/domains/operations/services/settlement_invoices.py),
  [`action_requests.py`](../../apps/api/app/domains/assistant/services/action_requests.py),
  and [Agent Action Request Contract](./agent-action-request-contract.md)
- Lesson: a sensitive staged action should expose a deterministic dry-run
  preview before approval or bounded execution. For settlement mutations such
  as `issue_trade_invoice`, `void_trade_invoice`, and
  `reverse_trade_payment`, the preview resolves the same normalization and
  validation path as execution, lists affected records and expected side
  effects, and marks the request blocked when the proposed mutation is not safe
  to execute.
- Deterministic opportunity: each future high-risk action preview should reuse
  its domain service normalization and stop conditions instead of summarizing
  model intent. Preview failures should block approval without creating side
  effects.
- Agent autonomy impact: preview gates make staged agent work easier to review
  and bounded execution safer. Execute-capable settlement roles may self-execute
  only when the preview is ready, while blocked previews must still stop the
  mutation path before any side effect runs.
- Tests or evidence: focused assistant API tests cover ready preview output,
  blocked duplicate invoice previews, missing-preview approval failure, and
  no-side-effect guarantees. Web tests cover ready and blocked preview rendering
  in the action request list.
- Follow-up: extend this pattern to the next sensitive action only after its
  domain owner can define deterministic affected-records, field-change, blocker,
  and side-effect semantics.

### 2026-04-22 - Control Tower Summaries Are Read-Only Governance Snapshots

- Type: algorithm-added
- Domain: control tower governance
- Applies to: assistant agent roster, run monitoring, action request posture,
  eval coverage, policy review signals
- Status: implemented
- Source:
  [`control_tower.py`](../../apps/api/app/domains/assistant/services/control_tower.py)
  and [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: a control tower summary should aggregate deterministic governance
  posture without changing agent authority. Roster counts, run warnings,
  pending or failed actions, blocked previews, policy warnings, and eval gaps
  are supervisory signals, not auto-pause commands.
- Deterministic opportunity: repeated trust signals should feed typed policy,
  service, eval, or knowledge-base work before increasing autonomy. The summary
  should stay a compact read model until domain owners approve enforcement.
- Agent autonomy impact: humans can use the summary to prioritize nudges,
  narrowing, pausing, or profile edits while preserving manual fallback and
  reviewable action requests.
- Tests or evidence: API tests verify admin-only access, seeded roster/run/action
  counts, oldest pending action, blocked preview counts, and trust-signal
  serialization. Web API tests verify the typed URL and admin auth headers.
- Follow-up: AP1-11 should render this summary in Admin without adding
  auto-enforcement or hidden mutations.

### 2026-04-22 - Signed-Out Prompt Drafts Resume Through Auth

- Type: lesson
- Domain: prompt-first UX
- Applies to: Prompt Home, authentication gate, assistant prompt submission,
  old-console navigation handoff
- Status: implemented
- Source:
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx),
  [`App.tsx`](../../apps/web/src/App.tsx), and
  [`promptResumeIntent.ts`](../../apps/web/src/shared/promptResumeIntent.ts)
- Lesson: Prompt Home may be visible while signed out, but protected prompt
  execution must wait for authentication. Store a typed local resume intent for
  signed-out drafts, show the pending action in the auth gate, and return to
  Prompt Home after sign-in before sending or restoring the draft.
- Deterministic opportunity: prompt resume state is a browser-owned navigation
  contract, not model output. Keep it normalized, length-limited, cached for
  React external-store subscriptions, and cleared once Prompt Home consumes it.
- Agent autonomy impact: the assistant can guide the user into the old console
  after sign-in, but the resume flow still preserves manual fallback and never
  lets a freeform prompt mutate business records.
- Tests or evidence: focused web unit tests cover prompt resume normalization,
  stable subscription snapshots, and sign-in return intent storage. Browser
  smoke covers signed-out draft submission, post-auth prompt sending, recent
  thread resume, and old-console handoffs into operations, settlement, and
  trade capture.
- Follow-up: if prompt resume grows beyond browser-local state, promote it to a
  typed server-side session continuation contract with expiry and audit fields.

### 2026-04-22 - Prompt Starters Are Deterministic UI Intents

- Type: lesson
- Domain: prompt-first UX
- Applies to: Prompt Home, contextual starters, old-console navigation handoff,
  assistant prompt submission
- Status: implemented
- Source:
  [`promptHomeStarters.ts`](../../apps/web/src/workspaces/prompt/promptHomeStarters.ts)
  and
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx)
- Lesson: contextual Prompt Home starters should be typed UI intents derived
  from deterministic workspace summary counts. They may seed or submit a prompt,
  or open the traditional workspace directly, but they should not rely on model
  output to decide the initial destination.
- Deterministic opportunity: starter cards are a stable mapping from work
  context to prompt draft and `PromptNavigationIntent`. If the mapping becomes
  role-specific or threshold-driven, move the rule into a typed service or
  configuration contract rather than embedding prompt instructions.
- Agent autonomy impact: starter prompts can ask the assistant to explain and
  route work, while direct workspace actions preserve manual fallback. Neither
  path grants the assistant write authority.
- Tests or evidence: web unit tests cover starter count projection and unknown
  metrics. Browser smoke covers asking from a starter, receiving an assistant
  handoff, and opening an old workspace directly from a starter.
- Follow-up: future starters should declare source counts, destination intent,
  prompt text, and stop conditions before being exposed as first-screen actions.

### 2026-04-22 - Control Tower UI Separates Watching From Enforcement

- Type: lesson
- Domain: control tower governance
- Applies to: Admin control tower, agent registry, approval inbox, outcome
  metrics, trust signal display
- Status: implemented
- Source:
  [`AssistantControlTowerPanel.tsx`](../../apps/web/src/workspaces/admin/AssistantControlTowerPanel.tsx)
  and [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: the human watch surface should make agent posture easy to inspect
  without silently changing authority. The control tower can highlight eval
  gaps, policy warnings, failed actions, pending backlogs, and blocked previews,
  but pausing, narrowing, approval, or profile edits must remain explicit human
  actions in the existing governed panels.
- Deterministic opportunity: trust-signal presentation should link to durable
  remediation surfaces rather than inventing new hidden workflows. If repeated
  signals need automatic enforcement, promote that rule through policy,
  service, eval, and approval design first.
- Agent autonomy impact: supervisors can watch and nudge agents faster, but
  Phase 1 authority remains observe, explain, draft, or stage unless the
  autonomy rubric and outcome evidence justify more.
- Tests or evidence: web rendering tests cover seeded control tower posture and
  non-admin gating. The panel links to agent management, outcome metrics, and
  approval inbox sections while preserving the Phase 1 autonomy statement.
- Follow-up: AP1-12 should add explicit pause or narrowing workflows without
  turning summary signals into automatic mutations.

### 2026-04-22 - Unissued Invoices Are Candidate Trades

- Type: algorithm-added
- Domain: settlement assistant tooling
- Applies to: pending invoice summaries, settlement copilots, invoice action
  staging, workspace handoffs
- Status: implemented
- Source:
  [`settlement_invoices.py`](../../apps/api/app/domains/operations/services/settlement_invoices.py)
  and
  [`tools.py`](../../apps/api/app/domains/assistant/services/tools.py)
- Lesson: `settlement.invoice_pending_count` counts active trades that still
  need their first invoice record, not persisted invoice rows. Settlement
  agents should use the invoice issue candidate read model for unissued invoice
  work and use the invoice ledger only for records that already exist.
- Deterministic opportunity: candidate detection belongs in settlement service
  logic with the same open-settlement and no-existing-invoice criteria as the
  workspace summary, plus deterministic invoice-issue preview blockers before
  any action is staged.
- Agent autonomy impact: surfacing candidates improves read/explain quality and
  powers either staged review or bounded execution. Execute-capable settlement
  roles may issue directly when the readiness preview is ready, and blocked
  previews should stop both staging and self-execution until missing evidence
  is resolved.
- Tests or evidence: assistant tooling coverage verifies candidate payloads and
  recommended governed actions; assistant eval coverage verifies a settlement
  read agent can call the candidate tool for pending invoices.
- Follow-up: if finance users need sorting or prioritization beyond oldest open
  execution, promote that rule as a named settlement queue policy.

### 2026-04-22 - Action Specs Own Staging Planner Order

- Type: algorithm-added
- Domain: assistant action governance
- Applies to: action request staging, policy simulation, action catalog,
  assistant agent work packages
- Status: implemented
- Source:
  [`action_specs.py`](../../apps/api/app/domains/assistant/services/action_specs.py),
  [`action_runtime.py`](../../apps/api/app/domains/assistant/services/action_runtime.py),
  and
  [`agent_work_packages.py`](../../apps/api/app/domains/assistant/services/agent_work_packages.py)
- Lesson: every approval-gated action must bind its catalog entry, execution
  handler, and deterministic planner in one typed action spec. Prompt staging
  and policy simulation should evaluate plans by catalog `planner_priority`
  instead of relying on a separate freeform planner list.
- Deterministic opportunity: action catalog metadata is the durable source for
  planner order, policy ownership, preview requirements, and coverage checks.
  When a new action is added, the spec registry should fail fast until the
  catalog, planner, handler, policy, and tests all agree.
- Agent autonomy impact: the model can still explain and draft action intent,
  but staging remains deterministic and policy-gated. Agent work packages move
  through explicit lifecycle states, and implementation requires evidence notes
  before a package can be marked implemented.
- Tests or evidence: API tests cover planner/spec coverage, policy simulation
  staging, admin work-package transition errors, and the implementation
  evidence gate. Web API tests cover the lifecycle PATCH client contract.
- Follow-up: wire the admin work-package lifecycle controls into the control
  tower once the UX can show transition history without obscuring manual
  approval responsibility.

### 2026-04-23 - Attention Counts Need Candidate Reads

- Type: algorithm-added
- Domain: assistant workflow and operations summaries
- Applies to: dashboard attention counts, settlement counts, confirmation
  backlogs, nomination and allocation backlogs, payment due work, pending
  settlement, exception summaries
- Status: implemented
- Source:
  [`trade_attention_candidates.py`](../../apps/api/app/domains/operations/services/trade_attention_candidates.py),
  [`workspace_bootstrap_summary.py`](../../apps/api/app/domains/operations/services/workspace_bootstrap_summary.py),
  and
  [`tools.py`](../../apps/api/app/domains/assistant/services/tools.py)
- Lesson: workspace counts often represent trade-state work, not persisted
  child records. Agents should use deterministic trade attention candidates to
  explain summary counts before assuming ledger, delivery, confirmation,
  invoice, or payment rows already exist.
- Deterministic opportunity: the same typed candidate conditions should power
  both summary counts and assistant candidate reads. Candidate payloads should
  include supporting child-record counts, suggested read tools, blockers, and
  only recommended governed actions where the durable record link exists.
- Agent autonomy impact: candidate reads improve triage and explanation while
  preserving manual fallback. Missing ledger records remain blockers rather
  than hidden mutations, while execute-capable roles may only use the
  published typed action path once the durable record link and previewable
  evidence are both available.
- Tests or evidence: assistant tooling tests cover child-row gaps and payment
  due candidates; assistant eval coverage verifies a managed read agent uses
  the candidate tool for trade-state counts.
- Follow-up: promote prioritization rules for these candidate categories only
  after operations or settlement owners approve queue policy.

### 2026-04-23 - Supervision Drafts Should Reuse Agent Save Paths

- Type: lesson
- Domain: assistant admin control tower
- Applies to: control tower trust signals, agent registry edits, pause and
  narrowing workflows
- Status: implemented
- Source:
  [`AssistantControlTowerPanel.tsx`](../../apps/web/src/workspaces/admin/AssistantControlTowerPanel.tsx),
  [`AgentManagementPanel.tsx`](../../apps/web/src/workspaces/admin/AgentManagementPanel.tsx),
  and
  [`assistantSupervisionDraft.ts`](../../apps/web/src/workspaces/admin/assistantSupervisionDraft.ts)
- Lesson: control-tower interventions should prepare a supervised draft inside
  the existing typed agent edit form, not create a second config mutation path.
  Humans still own the save, but the watch floor can hand off a pause or
  narrowing intent with audit-note scaffolding and policy-fit warnings already
  visible.
- Deterministic opportunity: reuse role-fit validation and typed status fields
  to keep pause and narrowing guidance consistent across the control tower and
  registry editor. If future workflows add richer interventions, they should
  still land in the same typed agent update boundary.
- Agent autonomy impact: supervisors can react faster to warning signals
  without granting automatic pause or scope enforcement. Manual fallback and
  review authority stay intact.
- Tests or evidence: focused web tests cover supervision draft note generation
  and control-tower quick-action rendering; build verification confirms the
  admin workspace wiring.
- Follow-up: add inline history or reviewer attribution for supervision drafts
  if admins need a richer audit trail than activation notes alone.

### 2026-04-23 - Prompt Home Reuses Governed Review Cards

- Type: lesson
- Domain: prompt-first operator experience
- Applies to: Prompt Home staged actions, approval routing, manual fallback
- Status: implemented
- Source:
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx),
  [`AssistantActionRequestList.tsx`](../../apps/web/src/entities/assistant/AssistantActionRequestList.tsx),
  and
  [`smokeHarness.spec.ts`](../../apps/web/tests/browser/smokeHarness.spec.ts)
- Lesson: Prompt Home should not invent a second lightweight approval UI for
  governed writes. When the assistant stages a business action, the prompt
  surface should reuse the same reviewer metadata, evidence blocks, stale-state
  basis, and decision controls already trusted in the assistant/admin approval
  path, then offer a clear handoff into the old console for the full inbox.
- Deterministic opportunity: keep governed action truth in the typed action
  request contract and render it consistently across prompt-first and old
  console surfaces. Queue summaries may be specialized for the prompt landing
  experience, but approval state and reviewer evidence should stay sourced from
  the shared action-request model.
- Agent autonomy impact: prompt-first UX can feel direct without implying that
  a business write already ran. The model still stages requests, reviewers keep
  approval authority, and unsupported writes remain a visible manual fallback.
- Tests or evidence: focused Prompt Home browser smoke now stages a governed
  cancel-trade request, shows inline review context, approves it, and verifies
  status sync; static Prompt Home markup coverage verifies the approval-path
  guidance remains present on first render.
- Follow-up: if Prompt Home later gains run-specific review deep links, keep
  them as navigation-only handoffs into the existing assistant traces rather
  than adding a prompt-only execution route.

### 2026-04-23 - Invalid Prompt Handoffs Must Fail Closed

- Type: lesson
- Domain: prompt-first operator experience
- Applies to: Prompt Home routing intents, browser smoke coverage, prompt-first
  verification lanes
- Status: implemented
- Source:
  [`promptNavigationIntent.ts`](../../apps/web/src/entities/app/promptNavigationIntent.ts),
  [`smokeHarness.spec.ts`](../../apps/web/tests/browser/smokeHarness.spec.ts),
  and [Local Development](./local-development.md)
- Lesson: malformed `navigation_intent` payloads should never leak raw control
  JSON into the prompt transcript or silently navigate anyway. Strip the bad
  handoff, surface a user-visible warning, and keep the operator anchored in
  Prompt Home until a valid typed route exists.
- Deterministic opportunity: treat prompt-first verification as a three-lane
  contract. Assistant evals guard authority and no-overclaim behavior, web
  tests guard typed parsing and fail-closed rendering, and browser smoke guards
  landing, resume, and handoff flows.
- Agent autonomy impact: prompt-led routing can remain expressive without
  increasing mutation authority or letting malformed control output become a UI
  behavior. Unsupported mutation requests stay as explanation plus manual
  fallback unless a typed governed action exists.
- Tests or evidence: prompt navigation unit coverage verifies invalid
  `navigation_intent` blocks produce warnings; Prompt Home smoke verifies the
  broken handoff stays on Prompt Home; assistant eval coverage adds one routing
  recommendation case and one unsupported mutation fallback case.
- Follow-up: if prompt-first routing starts using richer filters or deep-link
  semantics, extend the typed parser and fail-closed tests before shipping the
  new intent fields.

### 2026-04-23 - Unsaved Pre-Trade Drafts Reuse Recommendation Run Logic

- Type: algorithm-added
- Domain: trader and risk recommendation tooling
- Applies to: unsaved pre-trade scenario drafts, deterministic draft analysis,
  assistant draft-read tools, review handoff preparation
- Status: implemented
- Source:
  [`pretrade_recommendations.py`](../../apps/api/app/domains/reports/services/pretrade_recommendations.py),
  [`pretrade.py`](../../apps/api/app/routes/pretrade.py), and
  [`tools.py`](../../apps/api/app/domains/assistant/services/tools.py)
- Lesson: transient pre-trade draft analysis should reuse the same typed
  evaluator, structured opportunity surface, and saved-run comparison logic as
  persisted recommendation runs. Unsaved edits can be analyzed and compared to
  the latest visible saved run without creating a new record.
- Deterministic opportunity: keep pre-trade recommendation behavior in one
  deterministic contract that both the UI and read-only agents can call. New
  pre-trade draft workflows should extend this service instead of rebuilding
  recommendation summaries in prompts or route-local logic.
- Agent autonomy impact: agents can explain the latest draft stance, residual
  exposure, hedge suggestion, and evidence gaps while remaining unable to
  persist recommendation runs, book trades, approve reviews, or execute hedges.
- Tests or evidence: focused API tests cover the non-persisting draft-analysis
  endpoint; assistant tooling tests cover actor-aware draft analysis; assistant
  eval coverage verifies that agents analyze drafts without claiming
  persistence or execution authority.
- Follow-up: route live source-adapter collection from the pre-trade editor
  into this contract before promoting any higher-trust draft-to-review
  automation.

### 2026-04-23 - Seeded Defaults Should Follow Role Status

- Type: lesson
- Domain: assistant pilot rollout
- Applies to: role archetype registry, Admin seed action, Admin blueprint
  catalog, pilot-lineup messaging
- Status: implemented
- Source:
  [`role_archetypes.py`](../../apps/api/app/domains/assistant/services/role_archetypes.py),
  [`seed_assistant_agents.py`](../../apps/api/app/domains/admin/services/seed_assistant_agents.py),
  and
  [`assistantAgentBuilder.ts`](../../apps/web/src/workspaces/admin/assistantAgentBuilder.ts)
- Lesson: only roles marked `SEEDED` in the server catalog should be
  synchronized automatically into the managed-agent roster. Phase 1 pilots that
  still need dedicated product workflows should show up as template-only
  blueprints in Admin rather than draft profiles that blur the line between a
  synchronized default and a human-created specialization.
- Deterministic opportunity: derive the synchronized-default list from the role
  catalog status instead of letting seed definitions drift separately from the
  documented rollout posture. Admin should label seeded defaults and
  template-only blueprints explicitly so humans understand what exists already
  versus what still needs deliberate creation.
- Agent autonomy impact: this keeps the Phase 1 rollout conservative without
  removing manual flexibility. Operators can still create pilot drafts for
  market, pre-trade, and document work, but the platform no longer implies that
  those profiles are already part of the synchronized trusted default set.
- Tests or evidence: focused API seed and role-catalog tests cover seeded
  counts and `current_profile_ids`; web builder tests cover the Phase 1
  blueprint catalog; browser smoke seed messaging reflects seeded-default
  counts.
- Follow-up: once AP1-14 or AP1-15 graduates a pilot into a stable product
  flow, revisit whether that role should remain template-only or become a new
  synchronized default.

### 2026-04-23 - Stage Deterministic Draft Packets Before Adding Booking Authority

- Type: lesson
- Domain: pre-trade structuring and human review handoff
- Applies to: review-ready draft workflows, assistant-to-workspace handoffs,
  pre-trade review queue staging
- Status: implemented
- Source:
  [`preTradeStructuringDraft.ts`](../../apps/web/src/workspaces/pretrade/preTradeStructuringDraft.ts),
  [`PreTradeWorkspace.tsx`](../../apps/web/src/workspaces/pretrade/PreTradeWorkspace.tsx),
  and
  [`test_assistant_evals.py`](../../apps/api/tests/test_assistant_evals.py)
- Lesson: when a pilot role needs to create useful work before it has booking
  or execution authority, productize a deterministic draft packet instead of
  relying on prompt-only prose. The packet should preserve the exact fields a
  human reviewer and downstream workspace need.
- Deterministic opportunity: generate review-ready packets from typed draft and
  recommendation records so humans can compare, refine, and approve the same
  structure every time. If reviewers repeatedly edit the same sections, move
  those edits into deterministic packet-generation rules rather than prompt
  advice.
- Agent autonomy impact: the Pre-Trade Structuring Agent can now produce a
  review-ready packet with thesis, assumptions, source context, reviewer
  focus, trade-capture handoff fields, and explicit no-booking guardrails
  while remaining unable to book a trade or persist capture.
- Tests or evidence: focused web tests cover packet construction and fallback
  behavior; assistant eval coverage verifies review-ready draft language plus
  explicit refusal to book trades or persist capture.
- Follow-up: once the review packet and reviewer edits stabilize, consider
  whether a later ticket should add approval-gated staging beyond `review_notes`
  or keep the review queue handoff as the durable Phase 1 boundary.

### 2026-04-23 - Track Prompt Handoff Outcomes Separately From Answer Feedback

- Type: lesson
- Domain: prompt-first operator experience and assistant telemetry
- Applies to: Prompt Home handoffs, admin outcome metrics, deterministic
  routing promotion
- Status: implemented
- Source:
  [`prompt_navigation_outcomes.py`](../../apps/api/app/domains/assistant/services/prompt_navigation_outcomes.py),
  [`outcome_metrics.py`](../../apps/api/app/domains/assistant/services/outcome_metrics.py),
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx),
  and
  [`AssistantOutcomeMetricsPanel.tsx`](../../apps/web/src/workspaces/admin/AssistantOutcomeMetricsPanel.tsx)
- Lesson: prompt-first workspace handoffs need their own outcome telemetry,
  separate from answer thumbs-up or thumbs-down signals. Accepted, dismissed,
  and failed handoffs describe whether the suggested route was useful, not
  whether the narrative answer sounded good.
- Deterministic opportunity: aggregate handoff outcomes by destination and
  focus so repeated accepted routes become candidates for deterministic routing
  rules, while repeated dismissals or failures become narrowing or retirement
  signals. Promote routing behavior from prompt instructions into product logic
  only after these outcome patterns stabilize.
- Agent autonomy impact: assistants can keep proposing contextual handoffs from
  Prompt Home without gaining authority to change the underlying routing rules.
  Humans still approve durable routing behavior by reviewing the measured
  outcome patterns in admin metrics.
- Tests or evidence: focused API tests cover recording and scoping prompt
  handoff outcomes plus aggregated admin metrics; web unit tests cover shared
  telemetry helpers and admin display rows; browser smoke covers accepted,
  dismissed, and failed handoff flows from Prompt Home.
- Follow-up: when a route keeps winning for the same target and focus, add a
  deterministic routing rule or starter instead of relying on prompt-only
  suggestion text.

### 2026-04-24 - Promote Stable Prompt Routes Through Product UI, Not Prompt Text

- Type: lesson
- Domain: prompt-first operator experience and deterministic routing
- Applies to: Prompt Home landing surface, prompt-route recommendation APIs,
  telemetry-driven route promotion
- Status: implemented
- Source:
  [`prompt_route_recommendations.py`](../../apps/api/app/domains/assistant/services/prompt_route_recommendations.py),
  [`assistant.py`](../../apps/api/app/routes/assistant.py),
  and
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx)
- Lesson: once Prompt Home handoff telemetry shows a destination winning
  repeatedly for a role, promote that destination into deterministic product UI
  rather than leaving it as a model-only suggestion. Prompt Home should surface
  those routes as explicit quick destinations before the user has to ask again.
- Deterministic opportunity: derive role-scoped promoted routes from accepted
  prompt handoff outcomes over a bounded lookback window, and keep the
  promotion threshold in code instead of in prompt instructions. The UI can
  still keep the broader manual route list as fallback.
- Agent autonomy impact: assistants can keep suggesting destinations in free
  text, but repeated success no longer depends on the model remembering the
  same route each time. Product logic owns the promoted route once the outcome
  evidence is strong enough.
- Tests or evidence: focused API coverage verifies role-scoped prompt-route
  recommendations; web helper tests cover the current-user recommendation API;
  browser smoke verifies Prompt Home opens a promoted deterministic route
  directly while keeping legacy destinations available.
- Follow-up: when promoted routes start needing richer branching or
  object-specific focus, move from workspace-level recommendations to typed
  deterministic route contracts rather than adding more prompt heuristics.

### 2026-04-24 - Enrich Promoted Prompt Routes With Deterministic Object Handoffs

- Type: lesson
- Domain: prompt-first operator experience and handoff focus
- Applies to: Prompt Home promoted routes, trade attention candidates, invoice
  issue candidates, workspace handoff focus banners
- Status: implemented
- Source:
  [`promptPromotedRoutes.ts`](../../apps/web/src/workspaces/prompt/promptPromotedRoutes.ts),
  [`candidateWorkflowHandoffs.ts`](../../apps/web/src/entities/app/candidateWorkflowHandoffs.ts),
  and
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx)
- Lesson: once a workspace route is promoted from repeated Prompt Home
  outcomes, prefer opening it with a live deterministic object handoff when a
  current candidate record can supply focus, filter, or inspector-tab context.
  That turns "open Operations" into "open confirmation for trade T-AMEND-100"
  without asking the model to restate the route every time.
- Deterministic opportunity: keep telemetry-based route promotion and
  object-resolution separate. Let route outcomes decide which workspace is
  worth promoting, then let existing deterministic candidate-read services pick
  the current best object to focus inside that workspace.
- Agent autonomy impact: the assistant still does not own route truth. Prompt
  Home promotes the workspace from measured outcomes, and the product resolves
  the live object focus through typed candidate data that the human can inspect
  and clear.
- Tests or evidence: focused web tests cover promoted-route resolution against
  trade-attention and invoice candidate data; browser smoke verifies a promoted
  route lands in the old workspace with focused handoff context and banner
  state intact.
- Follow-up: if multiple candidate objects compete for the same promoted
  workspace, add a deterministic chooser or small disambiguation surface rather
  than falling back to prompt-generated object picks.

### 2026-04-25 - Choose Promoted Prompt Handoffs By Cue Match, Then Urgency

- Type: lesson
- Domain: prompt-first operator experience and deterministic route selection
- Applies to: Prompt Home promoted routes, candidate handoff resolution,
  object-aware workspace opens
- Status: implemented
- Source:
  [`promptPromotedRoutes.ts`](../../apps/web/src/workspaces/prompt/promptPromotedRoutes.ts)
  and
  [`promptPromotedRoutes.test.ts`](../../apps/web/tests/promptPromotedRoutes.test.ts)
- Lesson: when multiple live candidate objects can satisfy the same promoted
  workspace route, the chooser should not take the first matching record.
  Resolve the route by scoring recommendation-text cues first, then
  workspace-specific urgency, then handoff specificity, and finally stable list
  order.
- Deterministic opportunity: keep the chooser transparent and typed. Let the
  promoted route signal decide which workspace deserves a shortcut, but let the
  chooser use candidate metadata such as label, rationale, candidate type, and
  priority reason to select the focused object inside that workspace.
- Agent autonomy impact: Prompt Home can now open the right legacy surface with
  a concrete live object in focus more reliably, without asking the model to
  arbitrate between multiple invoices, workflow items, or trade exceptions.
- Tests or evidence: focused web tests cover settlement payment vs invoice
  issuance conflicts, invoice-specific recommendation cues, and pricing vs
  incomplete-data trade conflicts.
- Follow-up: if score ties remain common for a workspace, add a small
  disambiguation row that shows the top deterministic candidates instead of
  hiding the choice inside prompt text.

### 2026-04-25 - Record Prompt Home Promoted Route Accepts As First-Class Outcome Events

- Type: lesson
- Domain: prompt-first operator experience, routing telemetry, and promotion
  provenance
- Applies to: Prompt Home promoted routes, prompt-navigation outcomes,
  prompt-route recommendations, and admin routing metrics
- Status: implemented
- Source:
  [`prompt_navigation_outcomes.py`](../../apps/api/app/domains/assistant/services/prompt_navigation_outcomes.py),
  [`prompt_route_recommendations.py`](../../apps/api/app/domains/assistant/services/prompt_route_recommendations.py),
  [`assistant.py`](../../apps/api/app/routes/assistant.py),
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx),
  and
  [`promptPromotedRoutes.ts`](../../apps/web/src/workspaces/prompt/promptPromotedRoutes.ts)
- Lesson: when Prompt Home opens a promoted route card, that accept is still a
  real routing outcome even though there is no assistant run behind it. Record
  it as a first-class Prompt Home event instead of pretending it came from an
  unrelated run. Then group promoted-route recommendations by route identity
  such as workspace, route label, and focus type rather than collapsing
  everything back to the workspace name.
- Deterministic opportunity: use the accepted promoted-route events to let
  specific patterns like `Open confirmation` or `Open payment queue` graduate
  into deterministic Prompt Home routes. Keep those route-specific promotions
  hidden unless a current live candidate can supply the focused handoff they
  promise.
- Agent autonomy impact: this keeps routing truth in product telemetry and
  typed candidate services, not in freeform assistant memory. The model can
  still suggest destinations, but Prompt Home promotion now learns from both
  assistant-suggested handoffs and direct product-route accepts without losing
  provenance.
- Tests or evidence: focused API coverage verifies prompt-home route events
  without run ids and role-scoped route-specific promotions; focused web tests
  cover prompt-route API helpers, route-specific chooser behavior, and admin
  outcome display rows; browser smoke verifies promoted routes post the
  top-level Prompt Home outcome event while the legacy workspace handoff flow
  still works.
- Follow-up: if route-specific promotions remain useful but no live candidate
  is available, add a small “not ready right now” state instead of silently
  dropping the card.

### 2026-04-25 - Keep Route-Specific Prompt Promotions Visible With Honest Readiness States

- Type: lesson
- Domain: prompt-first operator experience and promoted-route lifecycle
- Applies to: Prompt Home promoted routes, route-specific workspace handoffs,
  live candidate availability, and telemetry-driven promotion retirement
- Status: implemented
- Source:
  [`prompt_route_recommendations.py`](../../apps/api/app/domains/assistant/services/prompt_route_recommendations.py),
  [`promptPromotedRoutes.ts`](../../apps/web/src/workspaces/prompt/promptPromotedRoutes.ts),
  [`PromptHomeWorkspace.tsx`](../../apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx),
  and
  [`promptPromotedRoutes.test.ts`](../../apps/web/tests/promptPromotedRoutes.test.ts)
- Lesson: route-specific Prompt Home promotions should not silently disappear
  when the live object they need is temporarily missing. Keep the promoted card
  visible with an explicit readiness state such as `Ready`, `Not ready right
now`, or `Cooling off`, show when it last succeeded, and offer the generic
  legacy workspace as fallback when no focused handoff is currently honest.
- Deterministic opportunity: treat promotion readiness as a typed product rule,
  not prompt behavior. The route recommendation service should expose recency
  metadata, while the Prompt Home chooser decides whether a route is ready,
  waiting on live context, or cooling off after a bounded stale window.
- Agent autonomy impact: this keeps the assistant out of the loop for route
  retirement or suspense decisions. Product logic owns when to present, pause,
  or decay a promoted shortcut, and the human can still reach the old-school
  workspace directly.
- Tests or evidence: focused API coverage verifies promoted-route recency;
  focused web tests cover ready, waiting, cooling-off, and ordering behavior;
  browser smoke keeps the promoted-route and legacy-workspace handoff flows
  green together.
- Follow-up: if cooling-off routes remain useful for discovery, consider a
  lightweight dismissal or pinning rule before promoting them back to `Ready`.

### 2026-04-25 - Execute-Capable Agents Must Still Use Typed Services and Log Boundary Overrides

- Type: lesson
- Domain: assistant autonomy and governed business mutations
- Applies to: managed assistant execution, assistant action requests,
  role-derived agent seeds, autonomous system-of-record updates
- Status: implemented
- Source:
  [`execution.py`](../../apps/api/app/domains/assistant/services/execution.py),
  [`action_runtime.py`](../../apps/api/app/domains/assistant/services/action_runtime.py),
  [`policies.py`](../../apps/api/app/domains/assistant/services/policies.py),
  [`role_archetypes.py`](../../apps/api/app/domains/assistant/services/role_archetypes.py),
  [`seed_assistant_agents.py`](../../apps/api/app/domains/admin/services/seed_assistant_agents.py),
  and
  [`action_handlers.py`](../../apps/api/app/domains/assistant/services/action_handlers.py)
- Lesson: when a managed agent has `EXECUTE` authority, it can self-execute a
  governed action in the same request instead of leaving a pending approval
  item, but the mutation still has to run through the typed action-handler path
  with stale-state rechecks, idempotency checks, and audit context intact.
- Deterministic opportunity: keep autonomous execution metadata inside
  `review_context` so the same contract works for both review-gated and
  self-executed actions. Record `execution_mode`,
  `autonomous_execution_reason`, and
  `delegated_ability_override_reason` there instead of inventing a separate
  write path.
- Agent autonomy impact: delegated tool and action scopes remain the default
  lane, but an execute-capable agent can widen beyond that lane only by logging
  an explicit override reason that says why the platform record needed to catch
  up to asserted real-world state. Autonomy increases, but freeform model
  output still does not write business records directly.
- Tests or evidence: focused API coverage verifies expanded seeded profiles,
  role-catalog exposure, stage-only review metadata, execute-capable
  autonomous cancellation, and action registry/catalog parity; focused web unit
  coverage verifies the seeded builder and admin seed helper contracts.
- Follow-up: add the next typed write seams through the same pattern before
  expanding autonomy further, especially trade capture, delivery-event logging,
  manual accrual adjustments, and accounting postings.

### 2026-04-25 - Prove One Governed Core Slice Before Expanding Agent Breadth

- Type: lesson
- Domain: platform sequencing, assistant authority boundaries, and core
  product planning
- Applies to: roadmap scoping, work-package prioritization, action-request
  design, and assistant/runtime expansion
- Status: accepted
- Source: [Governed Core Platform Roadmap](./core-platform-roadmap.md) and
  [Governed Core Platform Work Packages](./core-platform-work-packages.md)
- Lesson: when trade lifecycle, reference data, policy, projection freshness,
  and settlement semantics are still hardening, roadmap work should prioritize
  one governed end-to-end slice over wider workspace or agent expansion. The
  assistant runtime should stay a subordinate read, explain, draft, and stage
  boundary while deterministic services and shared action-request workflows
  define the platform's mutation truth.
- Deterministic opportunity: promote recurring "should we build this now?"
  judgment into explicit roadmap gates: does the work strengthen the chosen
  governed slice, reduce hidden business logic, or harden deterministic truth,
  replay safety, or reviewability? If not, defer it.
- Agent autonomy impact: this keeps action requests as a shared workflow
  primitive rather than an assistant-only escape hatch, and it blocks freeform
  model output from becoming a parallel mutation path while the core platform
  is still stabilizing.
- Tests or evidence: the governed-core planning package now defines phased work
  order, package-level acceptance criteria, and verification expectations for
  API tests, assistant evals, web tests, and browser smoke coverage.
- Follow-up: when a new workspace, agent, or workflow proposal appears, map it
  to the chosen governed slice first. If it cannot strengthen that slice or a
  clearly named core boundary, keep it deferred.

### 2026-04-25 - Lock The First Governed Slice To Fixed-Price Physical Gas

- Type: lesson
- Domain: platform scoping, deterministic trade semantics, and workflow
  sequencing
- Applies to: roadmap prioritization, reference-data hardening, trade command
  design, settlement preview work, and assistant pilot selection
- Status: accepted
- Source: [Governed Core Platform Slice Lock](./core-platform-slice-lock.md)
- Lesson: the first governed core slice is now explicitly locked to
  single-leg, fixed-price, physical natural gas trade capture and lifecycle
  review with deterministic reference-data validation, projection-backed
  position impact, settlement preview, and audit or explanation support. This
  is the narrowest serious commodity workflow the repo already proves through
  browser smoke, server-owned trade metadata, and seeded settlement candidate
  seams.
- Deterministic opportunity: use the locked slice as the default planning gate
  for future work. If a new feature does not strengthen this gas trade path's
  trade truth, policy, projection freshness, settlement readiness, or governed
  AI boundary, defer it until the slice is trusted end to end.
- Agent autonomy impact: AI work should stay inside explanation, drafting, and
  staged action support for this slice first. Do not widen agent authority or
  product-family breadth until the deterministic seams for trade capture,
  reference data, policy, and settlement preview are stronger.
- Tests or evidence: the current browser smoke harness captures a deterministic
  single-leg fixed-price trade path, the trade metadata contract defaults to
  `PHYSICAL`, `SINGLE`, and `FIXED`, and seeded fixtures already expose
  invoice and payment candidate follow-through for the same workflow family.
- Follow-up: align GCP-02 through GCP-14 work against this locked slice before
  introducing broader product-family, pricing, or autonomy scope.

### 2026-04-25 - Treat Admin, Reports, And Assistant As Surfaces, Not Domains Of Truth

- Type: lesson
- Domain: architecture boundaries, rule placement, and governed-core review
- Applies to: new service placement, report queries, admin APIs, assistant
  tools, and workflow or action-request orchestration
- Status: accepted
- Source: [Governed Core Platform Boundary Reset](./core-platform-boundary-reset.md)
- Lesson: during the governed-core phase, durable business truth should trend
  toward authority-first seams such as trade lifecycle, reference data,
  market data, risk, settlement, operations, workflow, policy, documents,
  integrations, AI gateway, and audit. `admin`, `reports`, and `assistant`
  remain important product surfaces, but they should orchestrate or summarize
  governed outputs instead of becoming the only home of business rules.
- Deterministic opportunity: use the boundary-reset checklist as a code-review
  rule. If a change would make an admin panel, report query, prompt profile,
  assistant helper, or frontend component the sole owner of a business rule,
  move that rule into the owning domain or policy seam first.
- Agent autonomy impact: this keeps the assistant runtime subordinate to typed
  read and stage seams and prevents agent surfaces from growing into a parallel
  mutation or policy architecture.
- Tests or evidence: the governed-core planning package now includes an
  explicit seam map, allowed and disallowed dependency examples, and review
  anti-patterns for domain rule placement.
- Follow-up: when implementing GCP-03 and later packages, prefer moving rule
  ownership first, even if the file-system or route migration happens
  incrementally afterward.

### 2026-04-25 - Trade Writes Should Be Command-Owned, Event-Recorded

- Type: lesson
- Domain: trade lifecycle architecture, write-path governance, and stale-state
  enforcement
- Applies to: trade capture, amend and cancel flows, future correction paths,
  assistant-staged trade actions, and route or service refactors around
  `/events`
- Status: accepted
- Source: [Governed Core Trade Command Model](./core-platform-trade-command-model.md)
- Lesson: the public contract for governed trade writes should be explicit
  business commands such as `BookTrade`, `AmendTradeTerms`, and `CancelTrade`,
  while `TradeCreated`, `TradeAmended`, and `TradeCancelled` remain the
  internal durable events emitted after validation succeeds. The current event
  route can stay as a compatibility adapter during migration, but it should not
  remain the source of truth for write intent.
- Deterministic opportunity: centralize reference-data validation, policy
  checks, pricing and measurement rules, and expected `last_event_id`
  stale-state guards in command handlers so the UI, scripts, assistants, and
  future automation reuse the same write semantics.
- Agent autonomy impact: assistants may stage typed action requests against the
  same command-owned seam, but they should not be allowed to append raw trade
  lifecycle events directly or bypass stale-state and policy checks through a
  chat-specific path.
- Tests or evidence: the current repo already routes create, amend, and cancel
  writes through `/events` and `apply_trade_event`, which makes the migration
  boundary visible; the command model now defines the target catalog,
  envelope, compatibility mapping, and stale-state expectations for the locked
  fixed-price physical gas slice.
- Follow-up: wire the first trade command application service above raw event
  append calls, then migrate the web app away from direct event-type write
  semantics without losing the event store and projection architecture.

### 2026-04-27 - Trade Create, Amend, and Cancel Now Enter Through a Command Adapter

- Type: algorithm-added
- Domain: trade lifecycle write-path governance and mutation provenance
- Applies to: `/events`, web trade capture, trade amendments, trade
  cancellations, and future assistant-staged trade commands
- Status: implemented
- Source:
  `apps/api/app/domains/trading/services/trade_commands.py`,
  `apps/api/app/routes/events.py`,
  `apps/api/app/domains/trading/services/event_writes.py`,
  `apps/web/src/entities/trade/api.ts`, and
  `apps/web/src/entities/app/useAppTradeActions.ts`
- Lesson: the first governed trade command seam now exists in code. The
  compatibility `/events` route recognizes `TradeCreated`, `TradeAmended`, and
  `TradeCancelled` writes for the locked slice, maps them to typed trade
  commands, and records command-aware provenance before the existing event and
  projection flow runs. The web app no longer submits create, amend, and cancel
  writes from raw event names at the call site; it calls explicit trade command
  helpers that still use `/events` as an adapter during migration.
- Deterministic opportunity: the next safe promotion step is to move expected
  `last_event_id` stale-state enforcement and later policy/reference-data
  prechecks into the command layer, because the route and web callers now carry
  the command metadata needed to do that without inventing a new transport.
- Agent autonomy impact: assistants and future automation should target the
  same command-owned seam, either through action requests or later typed
  command services, instead of appending trade lifecycle events directly.
- Tests or evidence: `.venv/bin/python -m unittest
apps.api.tests.test_trade_commands_service
apps.api.tests.test_event_writes_service
apps.api.tests.test_admin_provenance_api`,
  `.venv/bin/python -m unittest
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_created_defaults_source_system_and_persists_quality_and_unit
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_workflow_statuses_default_and_persist_on_amendment
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_closed_option_cannot_be_amended_or_cancelled`,
  `cd apps/web && npx eslint src/entities/trade/api.ts src/entities/app/useAppTradeActions.ts`,
  and `cd apps/web && npm run build`.
- Follow-up: enforce stale-state checks in the command service, then move more
  callers and future action-request execution onto the same typed command path.

### 2026-04-27 - Trade Commands Now Reject Stale last_event_id Bases Before Event Append

- Type: algorithm-added
- Domain: trade lifecycle stale-state enforcement and fail-closed mutation
  safety
- Applies to: trade amendments, trade cancellations, compatibility writes
  through `/events`, and future action-request execution against the same seam
- Status: implemented
- Source:
  `apps/api/app/domains/trading/services/trade_commands.py` and
  `apps/api/tests/test_trade_commands_service.py`
- Lesson: the trade command seam now treats `expected_last_event_id` as the
  canonical stale-state anchor for amend and cancel operations. When the caller
  supplies that basis and the current trade projection has moved on, the
  command service raises `409` before any new lifecycle event is appended.
- Deterministic opportunity: the same seam can now absorb more deterministic
  prechecks, especially policy and reference-data validation, because drift
  detection already happens before the event store is touched.
- Agent autonomy impact: assistants and future automation should carry the same
  `last_event_id` basis in action requests and execution calls, so approval-time
  stale-state rechecks and execution-time stale-state guards stay aligned.
- Tests or evidence: `.venv/bin/python -m unittest
apps.api.tests.test_trade_commands_service
apps.api.tests.test_event_writes_service
apps.api.tests.test_admin_provenance_api`
  and `.venv/bin/python -m unittest
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_created_defaults_source_system_and_persists_quality_and_unit
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_workflow_statuses_default_and_persist_on_amendment
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_closed_option_cannot_be_amended_or_cancelled`.
- Follow-up: require and expose this stale-state basis consistently across more
  callers as the raw `/events` compatibility path is retired.

### 2026-04-28 - Trade Commands Now Own First-Pass Authorization, Reference Checks, And Lifecycle Policy

- Type: algorithm-added
- Domain: trade lifecycle command validation and fail-fast governance
- Applies to: create, amend, and cancel trade writes entering through the
  governed command seam or the `/events` compatibility adapter
- Status: implemented
- Source:
  `apps/api/app/domains/trading/services/trade_commands.py`,
  `apps/api/tests/test_trade_commands_service.py`, and
  `apps/api/tests/test_auth_http.py`
- Lesson: the trade command seam now performs a first-pass policy and
  reference-data screen before any event append. It blocks read-only viewer
  sessions, catches invalid reference selections and duplicate creates on new
  trades, and rejects amend or cancel requests that violate current lifecycle
  policy such as closed-trade cancellation, credit-hold blocked fields, or
  managed projection override rules.
- Deterministic opportunity: keep promoting prechecks into the command layer
  when they are read-only and deterministic, so the event store remains a
  record of accepted business facts rather than a place where avoidable invalid
  writes are attempted and then rolled back.
- Agent autonomy impact: assistants and future automation now have a clearer
  target contract. If they stage or execute trade changes, they must satisfy
  the same actor-role, stale-state, reference-data, and lifecycle-policy
  contract as the manual web path.
- Tests or evidence: `.venv/bin/python -m unittest
apps.api.tests.test_trade_commands_service
apps.api.tests.test_event_writes_service
apps.api.tests.test_admin_provenance_api`,
  `.venv/bin/python -m unittest
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_created_defaults_source_system_and_persists_quality_and_unit
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_workflow_statuses_default_and_persist_on_amendment
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_closed_option_cannot_be_amended_or_cancelled`,
  and `.venv/bin/python -m unittest
apps.api.tests.test_auth_http.AuthHttpTests.test_trade_writes_require_session_and_use_session_actor
apps.api.tests.test_auth_http.AuthHttpTests.test_trade_http_rejects_duplicate_create_and_missing_amend`.
- Follow-up: move the remaining deterministic trade validations that are still
  buried inside projection application into reusable command-layer helpers, and
  then decide whether command-specific role rules should tighten beyond the
  initial governed-write allowlist.

### 2026-04-29 - Trade Write Validation Now Lives In One Shared Deterministic Path

- Type: algorithm-added
- Domain: trade lifecycle normalization and validation reuse across command
  prechecks and projection application
- Applies to: `TradeCreated`, `TradeAmended`, and `TradeCancelled` handling in
  the governed command seam and the event-application projection path
- Status: implemented
- Source:
  `apps/api/app/domains/trading/services/trade_write_validation.py`,
  `apps/api/app/domains/trading/services/trade_commands.py`, and
  `apps/api/app/domains/trading/services/trade_event_application.py`
- Lesson: trade write validation is now shared instead of duplicated. Create,
  amend, and cancel normalization and deterministic business checks run through
  `trade_write_validation.py`, so the command seam and projection application
  consume the same reference-data, lifecycle, option, credit, and pretrade
  alignment rules instead of carrying parallel copies that can drift.
- Deterministic opportunity: keep moving more trade-write invariants into
  reusable helpers that return normalized write plans, so future action-request
  execution can reuse the exact same contract instead of rebuilding field-level
  rules again.
- Agent autonomy impact: assistants and future automation now have a more
  stable target for staged trade changes because the validation behavior they
  meet at command time is the same behavior that projection application uses to
  accept and materialize the event.
- Tests or evidence: `.venv/bin/python -m unittest
apps.api.tests.test_trade_commands_service` and
  `.venv/bin/python -m unittest
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_created_defaults_source_system_and_persists_quality_and_unit
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_workflow_statuses_default_and_persist_on_amendment
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_closed_option_cannot_be_amended_or_cancelled`.
- Follow-up: route more mutation entry points through explicit command services,
  then decide whether the shared validator should start returning richer write
  plans for settlement and workflow side effects as those seams move under the
  same governed contract.

### 2026-04-30 - Assistant Trade Actions Now Execute Through Trade Commands

- Type: algorithm-added
- Domain: governed assistant execution and trade mutation authority
- Applies to: assistant `create_trade`, `amend_trade`, and `cancel_trade`
  action requests in both review-approved and autonomous execution modes
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/action_handlers.py`,
  `apps/api/app/domains/trading/services/trade_commands.py`, and
  `apps/api/tests/test_assistant_api.py`
- Lesson: assistant trade actions no longer append raw trade events or mutate
  projections directly inside the assistant runtime. They now construct typed
  `TradeWriteCommand` records with assistant-specific command IDs,
  source-surface metadata, and review-context `last_event_id` basis, then
  execute through `append_trade_write_command(...)`.
- Deterministic opportunity: any future assistant, automation, or workflow
  path that changes trades should reuse the same command seam instead of
  building a parallel event-write shortcut, so stale-state, reference-data,
  lifecycle, and provenance rules stay aligned.
- Agent autonomy impact: autonomous agents remain subordinate to deterministic
  trade services. Even execute-capable agents now use the exact same governed
  trade write seam as manual and approval-driven trade changes, with distinct
  `source_surface` values for reviewer-approved vs autonomous execution.
- Tests or evidence: `.venv/bin/python -m unittest
apps.api.tests.test_assistant_api.AssistantApiTests.test_assistant_action_request_approval_executes_trade_cancellation
apps.api.tests.test_assistant_api.AssistantApiTests.test_execute_capable_agent_autonomously_executes_create_trade_action
apps.api.tests.test_assistant_api.AssistantApiTests.test_execute_capable_agent_autonomously_executes_amend_trade_action`
  and `.venv/bin/python -m unittest
apps.api.tests.test_trade_commands_service
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_created_defaults_source_system_and_persists_quality_and_unit
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_trade_workflow_statuses_default_and_persist_on_amendment
apps.api.tests.test_trade_event_workflow.TradeEventWorkflowTests.test_closed_option_cannot_be_amended_or_cancelled`.
- Follow-up: move non-trade governed assistant mutations toward the same
  pattern of typed application services with explicit source-surface and stale
  basis propagation, then measure autonomous execution outcomes by command seam
  instead of raw action type alone.

### 2026-05-01 - Assistant Settlement And Actualization Writes Preserve Service-Owned Provenance

- Type: lesson
- Domain: governed assistant execution, settlement workflows, and operational
  actualization auditability
- Applies to: assistant `issue_trade_invoice`, `void_trade_invoice`,
  `create_trade_payment`, `reverse_trade_payment`, `record_trade_actualization`,
  and `void_trade_actualization` execution paths
- Status: implemented
- Source:
  `apps/api/app/domains/operations/services/audit_events.py`,
  `apps/api/app/domains/operations/services/actualizations.py`,
  `apps/api/app/domains/operations/services/settlement_invoices.py`,
  `apps/api/app/domains/operations/services/settlement_payments.py`, and
  `apps/api/app/domains/assistant/services/action_handlers.py`
- Lesson: non-trade assistant mutations should keep their business writes in
  typed operational services, but they should not lose assistant execution
  provenance at the handoff. Settlement and actualization services now accept a
  governed audit mutation context so their trade audit events record the
  originating assistant `source_surface`, assistant action-request identifiers,
  and service-owned operation keys such as `settlement.issue_trade_invoice`
  instead of collapsing everything into a generic `events` write.
- Deterministic opportunity: when more high-trust domains move under governed
  assistant execution, add execution metadata through service-owned mutation
  contexts rather than letting assistant handlers create one-off provenance
  shortcuts. The service should still own the operation key and audit event
  semantics.
- Agent autonomy impact: execute-capable agents remain subordinate to the same
  settlement and actualization services as human-triggered flows. Autonomous
  and reviewer-approved assistant actions now remain distinguishable in
  mutation provenance without adding assistant-only write paths.
- Tests or evidence: `.venv/bin/python -m unittest
apps.api.tests.test_assistant_api.AssistantApiTests.test_execute_capable_agent_autonomously_executes_void_trade_actualization_action
apps.api.tests.test_assistant_api.AssistantApiTests.test_void_trade_invoice_handler_records_assistant_mutation_context
apps.api.tests.test_assistant_api.AssistantApiTests.test_execute_capable_agent_autonomously_executes_reverse_trade_payment_action
apps.api.tests.test_assistant_api.AssistantApiTests.test_assistant_action_request_approval_executes_invoice_issue
apps.api.tests.test_assistant_api.AssistantApiTests.test_assistant_action_request_approval_executes_payment_creation
apps.api.tests.test_settlement_invoices_api.SettlementInvoicesApiTests.test_void_invoice_marks_not_required_and_clears_unpaid_payment_rows
apps.api.tests.test_settlement_payments_api.SettlementPaymentsApiTests.test_reverse_paid_payment_creates_offsetting_entry_and_reopens_invoice_balance`
  and `make api-assistant-evals`.
- Follow-up: extend the same governed mutation-context pattern to remaining
  high-trust assistant domains like confirmations, workflow mutations, delivery
  events, manual accruals, and accounting entries so action-request execution
  can be traced by service seam across the full platform.

### 2026-05-01 - Reference Asset Spatial Enrichment Uses Source-Owned Ordering Before Fallback Geography

- Type: algorithm-added
- Domain: reference data stewardship and governed asset spatial hydration
- Applies to: imported reference assets that carry upstream source URLs for
  WRI and HIFLD energy infrastructure catalogs
- Status: implemented
- Source:
  `apps/api/app/domains/reference_data/services/asset_spatial_enrichment.py`,
  `apps/api/scripts/enrich_reference_asset_spatial_fields.py`, and
  `apps/api/tests/test_asset_spatial_enrichment.py`
- Lesson: when a large imported asset catalog omits direct coordinates but
  preserves deterministic upstream identifiers, enrich spatial fields from the
  upstream source order instead of inventing fallback points. WRI assets map by
  CKAN row id, while HIFLD assets map by the original `resultOffset` ordered by
  upstream `OBJECTID`, then store the source geometry as GeoJSON and derive a
  representative point from that geometry for map centering.
- Deterministic opportunity: keep future bulk spatial loaders behind explicit
  source adapters that define how records are matched, how geometry is
  converted, and how representative points are derived. Reuse linked
  `location_code` only when no source-backed asset geometry or coordinates are
  available.
- Agent autonomy impact: agents can run repeatable spatial hydration against
  reference assets without freeform judgment about route shapes or manual point
  placement. The deterministic adapter owns matching rules and geometry
  conversion.
- Tests or evidence: `.venv/bin/python -m unittest
apps.api.tests.test_asset_spatial_enrichment
apps.api.tests.test_asset_catalog_import
apps.api.tests.test_asset_reference_normalization
apps.api.tests.test_reference_data
apps.api.tests.test_admin_seed_api` and repeated live runs of
  `PYTHONPATH=. ./.venv/bin/python apps/api/scripts/enrich_reference_asset_spatial_fields.py --requested-by codex`
  with the second run returning `updated_asset_count = 0`.
- Follow-up: replace public-clone HIFLD adapters with the exact archived source
  packages when those downloads are available from this environment, then add
  more source adapters for the remaining non-point GEM and refinery catalogs.

### 2026-05-01 - Location-Backed Asset Map Readiness Depends On Hydrated Reference Geography And Full Location Bootstrap

- Type: lesson
- Domain: reference data stewardship, spatial fallback behavior, and map
  workspace reliability
- Applies to: asset map readiness when assets rely on `location_code` instead
  of direct coordinates or source geometry
- Status: implemented
- Source:
  `apps/api/app/domains/reference_data/services/location_spatial_enrichment.py`,
  `apps/api/scripts/enrich_reference_location_spatial_fields.py`,
  `apps/api/tests/test_location_spatial_enrichment.py`,
  `apps/web/src/entities/app/api.ts`, and
  `apps/web/tests/appBootstrapLoaders.test.ts`
- Lesson: once source-backed asset geometry and point enrichment are in place,
  the next spatial bottleneck is usually the governed location catalog, not the
  asset rows. Asset map readiness should fall back to linked `location_code`
  coordinates, so reference locations need deterministic centroid hydration
  from maintained geography catalogs, and the reference workspace bootstrap
  must always load the full location catalog instead of inheriting a smaller
  generic row limit.
- Deterministic opportunity: keep location centroid enrichment behind a
  repeatable service that hydrates countries and subdivisions from Natural
  Earth, derives corridor and region centroids from governed member locations,
  and reruns idempotently. Treat client bootstrap coverage for location
  references as part of the deterministic map-readiness contract.
- Agent autonomy impact: agents can improve asset map coverage through
  repeatable location-reference enrichment without inventing points for assets
  that lack source geometry. The deterministic location service owns fallback
  geography, while the client consistently loads the linked reference rows that
  the asset map logic depends on.
- Tests or evidence: `.venv/bin/python -m unittest
apps.api.tests.test_location_spatial_enrichment
apps.api.tests.test_asset_spatial_enrichment
apps.api.tests.test_asset_catalog_import
apps.api.tests.test_asset_reference_normalization
apps.api.tests.test_reference_data
apps.api.tests.test_admin_seed_api`,
  `cd apps/web && npm test -- --run appBootstrapLoaders.test.ts referenceDataAssetsTab.test.ts referenceDataCharacterization.test.ts`,
  and repeated live runs of
  `PYTHONPATH=. ./.venv/bin/python apps/api/scripts/enrich_reference_location_spatial_fields.py --requested-by codex`
  with the second run returning `updated_location_count = 0`.
- Follow-up: add targeted adapters or curated overrides for the remaining
  unsupported subdivisions and politically special geographies that Natural
  Earth does not resolve cleanly, then refresh the small residual set of assets
  still blocked on those locations.

### 2026-05-05 - Asset Map Category Filters Collapse Raw Asset Taxonomy Into Operator Buckets

- Type: algorithm-added
- Domain: prompt-first map UX and governed reference asset presentation
- Applies to: the second-row asset visibility filters on Prompt Home and the
  full Map workspace
- Status: implemented
- Source:
  `apps/web/src/features/reference-data/assetMap.ts`,
  `apps/web/src/workspaces/reference-data/tabs/AssetMapPanel.tsx`,
  `apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx`, and
  `apps/web/tests/assetMap.test.ts`
- Lesson: raw `asset_type` values are too granular for quick map scanning, so
  the shared asset-map controls now collapse the governed asset taxonomy into a
  stable operator-facing bucket list: `Upstream Oil & Gas`, `Pipeline`,
  `Refinery`, `NG Processing`, `Petrochem`, `Storage`, `Power Generation`, and
  `Other`.
- Deterministic opportunity: keep future asset-map filtering anchored to a
  single classifier that maps `asset_class` plus selected `asset_type`
  exceptions into these display buckets. The current split treats
  `PROCESSING/PETROCHEMICAL` as `Petrochem`, other `PROCESSING` rows as
  `NG Processing`, `TERMINAL/LNG` as `NG Processing`, `TERMINAL/PIPELINE` as
  `Pipeline`, and remaining unmatched classes as `Other`.
- Agent autonomy impact: agents no longer need to infer ad hoc label groups or
  expose long raw subtype lists when adjusting the asset map. The deterministic
  classifier owns the display taxonomy and keeps Home and Map consistent.
- Tests or evidence: `cd apps/web && npm test -- assetMap.test.ts
mapWorkspace.test.ts promptHomeWorkspace.test.ts` and
  `cd apps/web && npm run test:smoke -- --grep "prompt home keeps the
simplified map visible while desk time cards collapse independently"`.
- Follow-up: if operators want different commercial groupings later, change the
  shared classifier and test expectations together instead of adding one-off UI
  overrides in individual map surfaces.

### 2026-05-05 - Asset Map Geography Filters Use Shared Broad-Region Classification

- Type: algorithm-added
- Domain: prompt-first map UX, weather overlay filtering, and governed spatial
  review
- Applies to: the geography filter row on Prompt Home and the full Map
  workspace
- Status: implemented
- Source:
  `apps/web/src/features/reference-data/assetMap.ts`,
  `apps/web/src/workspaces/reference-data/tabs/AssetMapPanel.tsx`,
  `apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx`, and
  `apps/web/tests/assetMap.test.ts`
- Lesson: the shared map now exposes a stable broad-region filter with four
  operator-facing buckets: `North America`, `South America`, `EMEA`, and
  `APAC`. The classifier prefers governed location metadata when present,
  using `region`, then `country_code`, then `continent_code`, and finally
  falls back to deterministic latitude/longitude bands so Home and Map do not
  drift on geography labeling.
- Deterministic opportunity: keep future map-region filtering anchored to the
  shared classifier instead of letting individual workspaces infer geography
  ad hoc from labels, overlays, or view state. The current rule special-cases
  Middle East country codes into `EMEA`, treats `NA` and `SA` continent codes
  as the two Americas buckets, maps `EU` and `AF` to `EMEA`, maps remaining
  `AS` and `OC` to `APAC`, and then falls back to fixed longitude/latitude
  bands for coordinates-only records and weather points.
- Agent autonomy impact: agents can safely add or refine map filtering without
  inventing new geography buckets in each surface. The deterministic classifier
  owns the broad-region taxonomy and keeps asset markers, weather markers, and
  map-record summaries aligned.
- Tests or evidence: `cd apps/web && npm test -- assetMap.test.ts
mapWorkspace.test.ts promptHomeWorkspace.test.ts` and
  `cd apps/web && npm run test:smoke -- --grep "prompt home keeps the
simplified map visible while desk time cards collapse independently"`.
- Follow-up: if operators later want more precise commercial splits, extend the
  shared geography classifier and its tests together rather than adding
  workspace-specific exceptions.

### 2026-05-07 - Asset Map Activity Filters Use Shared Operational Buckets

- Type: algorithm-added
- Domain: prompt-first map UX and governed reference asset presentation
- Applies to: the Activity filter row on Prompt Home and the full Map
  workspace
- Status: implemented
- Source:
  `apps/web/src/features/reference-data/assetMap.ts`,
  `apps/web/src/workspaces/reference-data/tabs/AssetMapPanel.tsx`,
  `apps/web/src/workspaces/prompt/PromptHomeWorkspace.tsx`, and
  `apps/web/tests/assetMap.test.ts`
- Lesson: the shared map now exposes a stable activity filter with three
  operator-facing buckets: `Positions`, `Shipments`, and `Inventory`. The map
  does not yet receive direct activity-tagged asset metadata, so both Home and
  the full Map workspace rely on one deterministic classifier instead of
  inferring activity relevance ad hoc in each surface.
- Deterministic opportunity: keep future activity filtering anchored to the
  shared classifier until governed activity metadata exists on asset records.
  The current rule maps `UPSTREAM_PRODUCTION` and `REFINERY` to `Positions`
  plus `Inventory`; `PIPELINE` to `Positions` plus `Shipments`; `PROCESSING`
  and `STORAGE` to all three buckets; `TERMINAL/LNG` to all three buckets;
  `TERMINAL/PIPELINE` to `Positions` plus `Shipments`; remaining `TERMINAL`
  rows to `Shipments` plus `Inventory`; and `GENERATION`, `CONSUMPTION`, plus
  unmatched classes to `Positions`.
- Agent autonomy impact: agents can add or refine map filtering without
  inventing new activity semantics in Prompt Home, the Map workspace, or saved
  presets. The deterministic classifier owns the first-pass operational bucket
  mapping until the product introduces explicit activity metadata.
- Tests or evidence: `cd apps/web && npm test -- assetMap.test.ts
mapWorkspace.test.ts promptHomeWorkspace.test.ts
assetMapFilterPresets.test.ts` and `cd apps/web && npm run test:smoke -- --grep
"prompt home keeps the simplified map visible while desk time cards collapse
independently"`.
- Follow-up: if users want activity buckets driven by live positions,
  deliveries, or future inventory objects instead of asset-class heuristics,
  replace this classifier with governed activity metadata rather than layering
  workspace-specific overrides on top.

### 2026-05-07 - Gmail Inbox Intake Should Stage Attachments Through Document Ingestion

- Type: lesson
- Domain: document ingestion and external inbox integrations
- Applies to: Gmail inbox imports, email attachment intake, and future inbound
  mailbox automations
- Status: accepted
- Source:
  `apps/api/app/domains/integrations/services/gmail_inbox.py`,
  `apps/api/app/routes/documents.py`, and
  `apps/api/tests/test_document_ingestion_api.py`
- Lesson: inbound mailbox integrations should not write business records
  directly. The first Gmail inbox slice reads Gmail in a bounded way, imports
  PDF attachments into `document_ingestion`, and lets the existing review,
  routing, action-plan, and approval seams govern any downstream mutations.
  Read-only inbox browsing can live in the product, but it should stay
  observational and reuse the same staged import seam when users decide a
  message needs operational follow-through.
- Deterministic opportunity: keep mailbox intake centered on typed runtime
  settings, explicit message-level dedupe receipts, and the existing document
  pipeline so future inbox sources reuse one governed import contract instead
  of inventing new email-specific write paths.
- Agent autonomy impact: agents can propose or trigger inbox imports when the
  runtime is configured, but durable operational changes still flow through the
  deterministic document workflow and its approval boundaries.
- Tests or evidence: run
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api -q`
  and `npm --prefix apps/web run test -- documentIngestionSelectors.test.ts`.
- Follow-up: if operators need auto-polling later, add a scheduler or admin
  control that calls the same import service and preserves the receipt-based
  dedupe contract.

### 2026-05-07 - Calendar Business-Day Logic Should Stay Data-Driven Through Rules And Overlays

- Type: algorithm-added
- Domain: reference data, settlement calendars, and deterministic date math
- Applies to: holiday calendars, payment-system calendars, exchange calendars,
  port calendars, and any future workflow that needs governed business-day
  calculations
- Status: implemented
- Source:
  `apps/api/app/domains/reference_data/services/calendar_business_days.py`,
  `apps/api/app/routes/reference_data_routes/calendars.py`,
  `apps/api/app/domains/admin/services/seed_reference_data.py`, and
  `apps/api/tests/test_calendar_seed_catalog.py`
- Lesson: business-day calculations should not be hidden in prompts or
  duplicated ad hoc across workflows. The calendar subsystem now evaluates
  business days deterministically from governed reference data: explicit holiday
  rows, reusable recurring rule rows, and overlay relationships that let one
  calendar inherit another without copying every holiday definition.
- Deterministic opportunity: keep future weekend profiles, observed-holiday
  rules, exchange early-close handling, and provisional announcement logic in
  the same typed calendar services rather than scattering date math across
  settlement, pricing, logistics, or assistant prompts.
- Agent autonomy impact: agents can read, explain, and seed calendar behavior,
  but durable holiday truth remains reference data owned by reviewed rows and
  services instead of freeform model output.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_reference_data apps.api.tests.test_calendar_seed_catalog`
- Follow-up: before using any newly seeded calendar for externally committed
  settlement or market timing, confirm the specific rule pack with the relevant
  operations or market owner and extend the data model when short-day or
  provisional logic becomes operationally material.

### 2026-05-08 - Settlement Due Dates Should Only Roll Through Explicit Calendar Instructions

- Type: algorithm-added
- Domain: settlement timing, invoice due dates, payment due dates, and
  reference calendars
- Applies to: settlement invoice issuance, settlement payment creation or
  updates, assistant-gated settlement actions, and bulk calendar exception
  stewardship
- Status: implemented
- Source:
  `apps/api/app/domains/operations/services/settlement_due_dates.py`,
  `apps/api/app/domains/operations/services/settlement_invoices.py`,
  `apps/api/app/domains/operations/services/settlement_payments.py`,
  `apps/api/app/domains/reference_data/services/calendar_imports.py`, and
  `apps/api/tests/test_settlement_invoices_api.py`
- Lesson: settlement workflows should not guess a bank calendar from currency,
  counterparty, or geography. The deterministic path now rolls invoice and
  payment due dates to the next open business day only when a caller supplies
  an explicit `due_calendar_code`, which keeps the timing rule governed and
  auditable without introducing speculative market mappings.
- Deterministic opportunity: keep future settlement terms, cash cutoffs, and
  market-specific grace periods behind typed settlement timing helpers that
  consume governed calendar codes instead of encoding assumptions in prompts or
  route handlers.
- Agent autonomy impact: agents can pass an explicit settlement calendar when
  staging or executing governed invoice and payment actions, but they should
  not infer one on their own for production commitments without human-owned
  product rules.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_reference_data apps.api.tests.test_settlement_invoices_api apps.api.tests.test_settlement_payments_api`
- Follow-up: if domain owners want default settlement calendars by book,
  currency, or counterparty, add that mapping as reviewed reference data or a
  typed policy layer before enabling implicit due-date normalization.

### 2026-05-08 - Keep Rail Map Geometry In Spatial Features, Not On The Route Header

- Type: lesson
- Domain: rail reference data, map overlays, and shared workspace rendering
- Applies to: rail route visualization, future corridor overlays, and any
  reference entity that needs both business semantics and renderable geometry
- Status: implemented
- Source:
  `apps/api/app/domains/admin/services/seed_reference_data.py`,
  `apps/api/app/routes/reference_data_routes/spatial_features.py`,
  `apps/web/src/workspaces/reference-data/tabs/AssetMapPanel.tsx`, and
  `docs/engineering/rail-delivery-schema.md`
- Lesson: rail routes should remain the governed business record, while the map
  should render linked `reference_spatial_features` rows. This keeps route
  scheduling metadata and drawable geometry decoupled, lets the UI toggle rail
  corridors independently, and gives us a clean place to improve geometry
  fidelity later without turning route headers into GeoJSON blobs.
- Deterministic opportunity: when another reference entity needs a map
  footprint, prefer a typed entity link from `reference_spatial_features`
  rather than embedding presentation geometry onto the operational record
  itself.
- Agent autonomy impact: agents can seed or propose overlay geometry, but the
  durable pattern stays governed by typed reference rows and existing map
  services rather than ad hoc frontend-only shapes.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_reference_data apps.api.tests.test_admin_seed_api.AdminSeedApiTests.test_reference_seed_populates_master_data apps.api.tests.test_calendar_seed_catalog`
  and
  `./node_modules/.bin/vitest run tests/appBootstrapLoaders.test.ts tests/assetMapFilterPresets.test.ts tests/mapWorkspace.test.ts tests/referenceDataSpatialFeaturesTab.test.ts`
- Follow-up: if operations wants true track geometry, interchange branches, or
  embargo detours, add higher-fidelity spatial feature sources while keeping
  the route header as the business anchor.

### 2026-05-09 - External MCP Usage Should Reuse Request-Context Source Surface Tags

- Type: lesson
- Domain: ChatGPT MCP transport, audit logs, and verification workflow
- Applies to: `/mcp` transport work, MCP OAuth, external tool publication, and
  any future write-capable MCP bridge
- Status: implemented
- Source: `apps/api/app/core/request_context.py`,
  `apps/api/app/core/logging.py`,
  `apps/api/app/domains/mcp/services/server.py`, `apps/api/app/main.py`,
  `apps/api/tests/test_mcp_oauth.py`, and `Makefile`
- Lesson: external MCP traffic should not invent a parallel audit system just
  to become visible. The shared request context now carries a `source_surface`
  tag, normal HTTP requests default to `http`, mounted MCP requests default to
  `mcp.http`, and tool execution overrides that tag with the concrete MCP tool
  surface such as `mcp.search`. That keeps existing log enrichment, actor and
  session identity, and correlation ids useful for ChatGPT-originated traffic
  without duplicating provenance plumbing.
- Deterministic opportunity: when future MCP tools graduate from docs-only
  reads into governed business reads or approval-gated writes, preserve this
  one tagging vocabulary so request logs, mutation provenance, and audit-event
  source surfaces stay comparable across internal and external transports.
- Agent autonomy impact: agents can rely on the explicit MCP verification lane
  and source-surface logs to prove what external tool was called and under
  which ECTRM identity, but they should still route durable writes through the
  existing typed service and action-request seams.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_mcp_api apps.api.tests.test_mcp_oauth apps.api.tests.test_http_router_registry`
  and `make api-mcp-test`
- Follow-up: if the hosted MCP surface grows beyond docs retrieval, consider a
  first-class admin view over these tagged logs or a dedicated persisted audit
  ledger before broad rollout.

### 2026-05-09 - Surface Assistant Grounding As Structured Evidence, Not Raw Trace Blobs

- Type: lesson
- Domain: assistant transparency, app introspection, managed-agent hierarchy,
  and operator review
- Applies to: assistant chat, prompt preview, run traces, code/schema/app
  introspection tools, and managed-agent supervision
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/tools.py`,
  `apps/api/app/schemas/assistant.py`,
  `apps/web/src/workspaces/assistant/AssistantWorkspace.tsx`, and
  `apps/web/src/entities/assistant/AssistantToolCallList.tsx`
- Lesson: when the assistant inspects code, schema, app topology, or managed
  agent relationships, the user-facing surface should render structured
  evidence cards and prompt-section metadata instead of forcing operators to
  infer context from raw JSON traces. That keeps answers auditable, makes
  hierarchy and schema access visible inside chat, and turns repeated prompt
  transparency work into stable product behavior.
- Deterministic opportunity: keep future source-card generation attached to the
  typed tool contract so new introspection tools can publish reusable evidence
  without every frontend surface inventing one-off parsing logic.
- Agent autonomy impact: agents can inspect broad read-only platform context,
  but the UI must expose which governed surfaces they used so humans can verify
  app, schema, and hierarchy claims before acting on them.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_assistant_tooling`
  and
  `./node_modules/.bin/vitest run tests/assistantToolCallList.test.tsx tests/assistantPromptSectionList.test.tsx`
- Follow-up: if we expand broad data exploration beyond curated tools, keep the
  same evidence contract for row browsing and record-level citations so the
  assistant never gains opaque “trust me” visibility into governed data.

### 2026-05-09 - Carry Map Corridor Focus As Typed Workspace Handoff, Not Ad Hoc Search Text

- Type: lesson
- Domain: rail map workflow, cross-workspace navigation, and route-focused
  operational boards
- Applies to: map-to-workspace routing, reference-record focus, and any future
  corridor or region selection that should narrow an operational board
- Status: implemented
- Source:
  `apps/web/src/shared/appRouteHandoff.ts`,
  `apps/web/src/workspaces/reference-data/tabs/AssetMapPanel.tsx`,
  `apps/web/src/workspaces/map/MapWorkspace.tsx`,
  `apps/web/src/workspaces/shipments/ShipmentWorkspace.tsx`,
  `apps/web/src/workspaces/scheduling/SchedulingWorkspace.tsx`, and
  `apps/web/src/entities/app/workspaceRendererRegistry.tsx`
- Lesson: when a user selects a governed rail corridor from the map, the next
  workspace should receive that selection as a typed handoff plus a
  deterministic lane filter, not as a best-effort text search. The map now
  opens Deliveries with a `reference_record` handoff for the selected
  `rail_route_code`, the Deliveries board applies an explicit
  `delivery.rail_route_code` filter before any local text filter, the
  Scheduling board applies the same typed route focus before saved views and
  mode lenses, the Scheduling board also exposes a governed native route
  picker for the same deterministic lane filter, and the same route selection
  can jump directly into the rail-route reference editor or launch Scheduling
  from that reference record.
- Deterministic opportunity: reuse this pattern for other governed map
  entities where the selected geometry should narrow an execution or review
  board by stable code rather than by fuzzy UI copy.
- Agent autonomy impact: agents can propose or wire map-driven operational
  routing when the target board has a stable typed key, but they should avoid
  shipping cross-workspace search hacks when a deterministic handoff contract
  is available.
- Tests or evidence:
  `./node_modules/.bin/vitest run tests/appRouteHandoff.test.ts tests/workspaceHandoffFocusBanner.test.ts tests/mapWorkspace.test.ts tests/shipmentsWorkspace.test.ts tests/schedulingWorkspaceRender.test.ts tests/referenceDataRailRoutesTab.test.ts`
- Follow-up: if operations, settlement, or future corridor-aware boards need
  the same lane focus, extend the same typed handoff contract instead of
  inventing workspace-specific search conventions, and prefer governed pickers
  when the workspace should support that focus without a map entrypoint.

### 2026-05-15 - Document Classification Corrections Should Become Deterministic Filename-Pattern Learning

- Type: algorithm-added
- Domain: document ingestion review, operator corrections, and deterministic
  classification support
- Applies to: uploaded document review, document-kind correction UX, and future
  ingestion classifier promotion work
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_classification_learning.py`,
  `apps/api/app/domains/documents/services/ingestion.py`,
  `apps/api/app/domains/documents/services/document_ingestion_review.py`,
  `apps/api/tests/test_document_ingestion_api.py`,
  `apps/web/src/features/documents/DocumentIngestionPageEditor.tsx`, and
  `apps/web/tests/documentIngestionSelectors.test.ts`
- Lesson: when operators correct a system-assigned document kind, the platform
  should persist that correction as structured review metadata instead of
  silently overwriting the page kind. ECTRM now stores the original
  system-assigned kind, the saved correction, and a compact extracted-content
  feature profile, then deterministically reuses consistent prior corrections
  only when a later upload's extracted page content looks materially similar.
  A normalized filename signature remains as a small supporting signal, but
  content similarity is the primary reuse rule.
- Deterministic opportunity: if reviewed correction volume grows or the current
  in-memory content-feature scan becomes too coarse, promote it into a
  dedicated indexed learning registry with conflict review, richer document
  features, and expiry controls instead of moving the rule back into prompt
  prose.
- Agent autonomy impact: agents can explain or stage document review work, but
  the durable classification-learning loop stays inside typed ingestion
  services and explicit operator corrections rather than freeform model output.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api`
  and
  `./node_modules/.bin/vitest run tests/documentIngestionSelectors.test.ts tests/documentApi.test.ts`
- Follow-up: add conflict handling, reviewer thresholds, or admin-facing rule
  visibility before using these corrections for higher-trust downstream routing
  or record-creation automation.

### 2026-05-16 - Document Understanding Should Be A Typed Backend Bundle, Not Loose Client Reconstruction

- Type: lesson
- Domain: document ingestion understanding, classification substrate, and
  future document-learning promotion work
- Applies to: page analysis responses, document review surfaces, downstream
  routing or linkage preparation, and future smart-classification packages
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_understanding.py`,
  `apps/api/app/domains/documents/services/document_ingestion_serialization.py`,
  `apps/api/app/schemas/document.py`,
  `apps/web/src/shared/models.ts`, and
  `apps/api/tests/test_document_ingestion_api.py`
- Lesson: once document understanding depends on extracted text, content
  fingerprints, header candidates, table candidates, and visual or OCR
  signals, the platform should expose a typed server-owned understanding bundle
  instead of making clients reverse-engineer those signals from
  `classification_payload`, raw text excerpts, and other loose fields. ECTRM
  now emits a deterministic page-level and document-level `understanding`
  contract that summarizes text stats, line-shape hints, structure signals,
  preview markers, and classification evidence while keeping the underlying
  extracted fields and tables intact.
- Deterministic opportunity: extend the same bundle with richer OCR provenance,
  layout geometry, and promoted schema-aware evidence scoring as DCL-02 and
  later packages mature, rather than inventing new response-only fragments per
  feature.
- Agent autonomy impact: agents can explain or compare document understanding
  signals, but the durable interpretation surface stays inside typed backend
  serialization instead of drifting into prompt prose or client-only logic.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api`
  and
  `./node_modules/.bin/vitest run tests/documentIngestionSelectors.test.ts tests/documentLibrary.test.ts tests/promptHomeDocumentUploadCard.test.ts`
- Follow-up: surface the understanding bundle in operator review UX when DCL-04
  starts, and decide which additional geometry or model-evidence fields belong
  in the stable contract before DCL-02 adds ensemble scoring on top.

### 2026-05-16 - Library Type Overrides Should Use A Typed Document-Level Patch

- Type: lesson
- Domain: document library UX, manual classification correction, and document
  review controls
- Applies to: uploaded document list surfaces, quick type overrides, and
  future document-level review affordances
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/ingestion.py`,
  `apps/api/app/schemas/document.py`,
  `apps/web/src/workspaces/library/LibraryWorkspace.tsx`, and
  `apps/api/tests/test_document_ingestion_api.py`
- Lesson: when operators need to fix a document's displayed type directly from
  the library, the control should save through a typed document-level patch
  instead of inventing a client-only override or forcing the library UI to
  impersonate a page editor. ECTRM now lets `PATCH /documents/{id}` accept a
  manual `document_kind`, applies that kind across the document's pages,
  records the same correction metadata used by page review, and exposes the
  action through the library `Type` column.
- Deterministic opportunity: if future UX needs document-level subtype or
  mixed-page classification handling, keep that behavior behind explicit typed
  document review contracts instead of adding ad hoc client merge logic.
- Agent autonomy impact: agents can point users to the quick library override,
  but the actual classification correction still lands through governed typed
  ingestion services and auditable correction metadata.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api`
  and
  `./node_modules/.bin/vitest run tests/libraryWorkspace.test.ts tests/documentLibrary.test.ts tests/documentIngestionSelectors.test.ts tests/promptHomeDocumentUploadCard.test.ts`
- Follow-up: decide whether grid-card and multi-page subtype editing should get
  the same quick-control treatment or remain in the deeper review editor.

### 2026-05-16 - Agent Change Suggestions Should Reuse The Governed Profile-Request Queue

- Type: lesson
- Domain: managed agent governance, operator request intake, and admin review
- Applies to: assistant agent directory UX, non-admin agent change requests,
  managed-agent review queues, and future agent-configuration workflows
- Status: implemented
- Source:
  `apps/api/app/domains/assistant/services/profile_requests.py`,
  `apps/api/app/routes/assistant.py`,
  `apps/api/app/schemas/assistant.py`,
  `apps/web/src/workspaces/assistant/AssistantAgentChangeRequestPanel.tsx`, and
  `apps/web/src/workspaces/admin/AgentManagementPanel.tsx`
- Lesson: when operators want agent changes, the product should not grant
  direct mutation rights or hide the request in freeform prompt text. ECTRM now
  routes user-submitted agent requests through the typed
  `assistant_agent_profile_requests` seam with explicit request kinds for `new
  specialization`, `edit existing`, and `narrow access`. The assistant surface
  captures the desired scope, tools, actions, skills, authority, and review
  rationale, while the admin surface remains the only place that approves,
  links, and applies the request to a managed agent record. A request can only
  be marked applied after the linked agent has a published revision whose
  payload carries the approved profile request ID, so the final status is tied
  to a concrete before/after agent configuration delta rather than a manual
  closure click. Profile-request responses also carry a compact applied diff
  summary derived from the linked revision, which keeps the requester and admin
  review cards aligned on exactly which saved configuration fields changed.
- Deterministic opportunity: if request patterns stabilize, promote frequent
  reductions or safe edit classes into narrower typed workflows rather than
  widening this queue into a generic freeform mutation surface.
- Agent autonomy impact: agents can help users explain and stage agent changes,
  but they still cannot directly rewrite managed-agent configuration outside
  the reviewed admin workflow.
- Tests or evidence:
  `npm --prefix apps/web test -- assistantApi.test.ts
  assistantAgentChangeRequestPanel.test.ts assistantWorkspace.test.ts
  assistantAgentDirectoryPanel.test.ts`,
  `./.venv/bin/python -m unittest
  apps.api.tests.test_assistant_api.AssistantApiTests.test_current_user_can_submit_list_and_close_governed_agent_change_requests
  apps.api.tests.test_assistant_api.AssistantApiTests.test_admin_profile_request_approval_gates_custom_agent_activation`,
  and `npx playwright test
  tests/browser/smokeHarness.spec.ts --grep "assistant smoke submits a
  governed agent change request"`
- Follow-up: if reviewers need alternate baselines or multi-revision comparison,
  promote the compact profile-request diff into a richer revision-compare
  endpoint instead of duplicating diff logic in the client.

### 2026-05-16 - Document Classification Should Persist Explainable Deterministic Assessment

- Type: algorithm-added
- Domain: document ingestion, deterministic classification, and operator review
- Applies to: uploaded-document typing, manual correction follow-up, typed
  understanding bundles, and future classifier promotion work
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_classification_scoring.py`,
  `apps/api/app/domains/documents/services/ingestion.py`,
  `apps/api/app/domains/documents/services/document_understanding.py`,
  `apps/api/app/schemas/document.py`, and
  `apps/web/src/features/documents/DocumentIngestionPageEditor.tsx`
- Lesson: document classification should not stop at a hidden heuristic kind.
  ECTRM now runs a deterministic evidence scorer over extracted text, schema
  header-field hits, matching keys, table-shape overlap, OCR state, and
  filename hints, then persists that scored assessment alongside the page
  classification payload. The typed understanding bundle exposes the scored
  `document_kind`, `confidence`, `matched_by`, `supporting_evidence`, and
  `conflicts` separately from the later system classification so reviewers can
  see the baseline deterministic judgment even when AI or learned reuse
  changes the final review starting point.
- Deterministic opportunity: future DCL-02 follow-on work should extend this
  scorer by tuning weights and ambiguity rules behind typed services and evals,
  not by moving explanation logic back into prompts or client-only inference.
- Agent autonomy impact: agents can now rely on a server-owned explanation
  bundle when discussing why a document was typed a certain way, while the
  actual classification state remains governed by typed review and learning
  services.
- Tests or evidence:
  `./node_modules/.bin/vitest run tests/documentIngestionPageEditor.test.ts
  tests/libraryWorkspace.test.ts tests/documentLibrary.test.ts
  tests/documentIngestionSelectors.test.ts
  tests/promptHomeDocumentUploadCard.test.ts`,
  `./.venv/bin/python -m compileall
  apps/api/app/domains/documents/services/document_classification_scoring.py
  apps/api/app/domains/documents/services/document_understanding.py
  apps/api/app/domains/documents/services/ingestion.py
  apps/api/app/schemas/document.py`, and a standalone scorer/understanding
  runtime check in the local virtualenv. The full
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api`
  suite is currently blocked in this worktree by an unrelated missing module at
  `apps.api.app.domains.messages.services.workspace`.
- Follow-up: add seeded eval coverage that measures confusion and ambiguity
  margins by document kind before tuning the scorer weights, and repair the
  unrelated messages-service import so the full ingestion API regression suite
  can run again.

### 2026-05-16 - Document Classification Tuning Needs A Replayable Gold Corpus

- Type: lesson
- Domain: document ingestion, deterministic classification evaluation, and
  regression safety
- Applies to: document kind scoring changes, ambiguity threshold tuning,
  filename-signal adjustments, OCR-confidence handling, and learned
  classification promotion work
- Status: implemented
- Source:
  `apps/api/tests/fixtures/document_classification_eval_corpus.json`,
  `apps/api/tests/document_classification_eval_harness.py`,
  `apps/api/tests/test_document_classification_evals.py`,
  `apps/api/scripts/run_document_classification_evals.py`, and `Makefile`
- Lesson: once document typing moves beyond a single heuristic, correctness has
  to be guarded by a replayable gold corpus instead of one-off upload checks.
  ECTRM now has a checked-in deterministic classification corpus that spans
  strong schema matches, OCR-backed cases, generic statement fallback, weak
  filename-only hints, and no-signal uploads. The harness computes kind
  accuracy and false-confidence counts, the unittest enforces the seeded
  expectations, and `make api-document-classification-evals` gives engineers a
  canonical local replay command before they retune scoring weights or stop
  conditions.
- Deterministic opportunity: expand this corpus with real reviewed examples and
  per-kind confusion tracking before changing score weights, rather than
  encoding more exceptions directly into classifier rules.
- Agent autonomy impact: agents should treat document-classification weight
  changes as behavior that needs a replay lane, not as safe prompt-only tuning.
- Tests or evidence:
  `./.venv/bin/python apps/api/scripts/run_document_classification_evals.py`,
  `./.venv/bin/python -m unittest apps.api.tests.test_document_classification_evals`,
  and `make api-document-classification-evals`
- Follow-up: grow the corpus from 10 seed cases into a reviewed historical
  replay set with confusion-matrix reporting and promotion thresholds for new
  document kinds.

### 2026-05-20 - Price Publications Are Market Data Evidence, Not Settlement Documents

- Type: algorithm-added
- Domain: document ingestion, document taxonomy, deterministic classification,
  and market-data provenance
- Applies to: document-kind schema registry, price-publication
  classification, market-data routing, price-index observation linkage, and
  Library type overrides
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/schema_registry.py`,
  `apps/api/app/domains/documents/services/document_ingestion_analysis.py`,
  `apps/api/app/domains/documents/services/document_routing.py`,
  `apps/api/app/domains/documents/services/document_linkage.py`, and
  `docs/engineering/document-taxonomy-trading-shipping.md`
- Lesson: price publications should classify as `PRICE_PUBLICATION` under a
  market-data family instead of being folded into generic statements,
  invoices, or settlement documents. They are evidence for published
  price-index observations and price-index reference records, with durable
  keys such as price index code, observation date, source provider, source
  series ID, commodity, location, currency, unit, and published price.
- Deterministic opportunity: any future document-created market-data writes
  should remain behind a typed loader or staged review service because price
  observations can affect pricing, risk, settlement, and reporting. The
  current path is attachment/linkage to existing price-index records only.
- Agent autonomy impact: agents may explain or suggest price-publication
  linkage, but they should not create or overwrite official price observations
  from uploaded document text without a governed market-data ingestion action.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_schema_registry_exposes_supported_document_contracts apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_trade_shipping_taxonomy_classifies_additional_document_types apps.api.tests.test_document_routing_service apps.api.tests.test_document_linkage_service.DocumentLinkageServiceTests.test_price_publication_links_to_existing_price_observation`
- Follow-up: add reviewed replay examples from real publisher bulletins before
  enabling document-sourced price observation staging.

### 2026-05-17 - Commodity Document Taxonomy Should Prefer Specific Trade Lifecycle Buckets

- Type: algorithm-added
- Domain: document ingestion, deterministic classification, and Library review
- Applies to: document-kind schema registry, deterministic classifier rules,
  routing hints, operator type overrides, and Library type dropdown ordering
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/schema_registry.py`,
  `apps/api/app/domains/documents/services/document_ingestion_analysis.py`,
  `apps/api/app/domains/documents/services/document_routing.py`,
  `apps/web/src/workspaces/library/LibraryWorkspace.tsx`, and
  `apps/web/src/workspaces/library/libraryWorkspaceSupport.ts`
- Lesson: commodity document classification should avoid broad buckets when a
  recurring document has stable operational meaning. Deal recaps now classify
  separately from generic trade communications, Bill of Lading remains the
  existing logistics class instead of being duplicated, and the taxonomy now
  includes trade finance, nomination, curtailment, dispatch, rail, marine
  readiness, demurrage, inspection, force majeure, origin, payment advice,
  outage, and storage statement classes.
- Deterministic opportunity: add future commodity document kinds through the
  same registry-plus-eval path: schema fields, classifier keywords, routing
  keys, replay cases, and alphabetized operator selection.
- Agent autonomy impact: agents may suggest likely document types, but durable
  classification corrections and new classes stay in typed ingestion services
  with replayable deterministic evals.
- Tests or evidence:
  `make api-document-classification-evals`,
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_schema_registry_exposes_supported_document_contracts apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_trade_shipping_taxonomy_classifies_additional_document_types`,
  and `npm run test -- tests/documentLibrary.test.ts tests/libraryWorkspace.test.ts`
- Follow-up: expand the reviewed replay corpus with real examples for the new
  logistics, trade-finance, and settlement classes before tuning weights.

### 2026-05-16 - Reviewed Document Replay Fixtures Should Be Sanitized And Track Caution Behavior

- Type: lesson
- Domain: document ingestion evals, reviewed-document replay, and classifier
  safety gating
- Applies to: exporting reviewed document examples, tuning deterministic
  document scorers, and deciding whether confidence/abstain behavior regressed
- Status: implemented
- Source:
  `apps/api/tests/document_classification_eval_harness.py`,
  `apps/api/scripts/export_document_classification_replay_fixture.py`,
  `apps/api/scripts/run_document_classification_evals.py`, and
  `apps/api/tests/test_document_classification_evals.py`
- Lesson: historical replay fixtures should not copy reviewed document text
  verbatim into the repo. ECTRM now builds sanitized replay text from reviewed
  page header fields and table structure first, then falls back to redacted raw
  text only when structured signals are missing. The replay export marks cases
  that historically required correction or landed in `OTHER`/`UNKNOWN` as
  review-recommended or low-confidence expectations, and the eval lane now
  reports per-kind metrics, confusion summaries, abstain accuracy, and
  low-confidence false negatives in addition to exact kind accuracy.
- Deterministic opportunity: once enough reviewed examples accumulate, raise
  the replay corpus quality by splitting thresholds per document kind and
  graduating historically corrected cases into explicit abstain-vs-commit
  expectations owned by operations.
- Agent autonomy impact: agents should not claim a scorer retune is safe after
  matching only top-line accuracy; they should check the replay lane for
  confusion drift and missed caution signals too.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_classification_evals`,
  `./.venv/bin/python apps/api/scripts/run_document_classification_evals.py`,
  and `make api-document-classification-evals`
- Follow-up: export a first real reviewed replay corpus from the configured
  database, replay it through the scorer lane, and tighten thresholds by
  document kind once the historical sample is large enough to be representative.

### 2026-05-16 - Slack-Style Messaging Needs Durable Thread Metadata Before UI Polish

- Type: lesson
- Domain: messaging workspace, conversation UX, and durable desk collaboration
- Applies to: Slack-style thread surfaces, reply semantics, message actions, and
  composer upgrades in the `Messages` workspace
- Status: implemented
- Source:
  `apps/api/app/domains/messages/services/workspace.py`,
  `apps/api/app/routes/messages.py`,
  `apps/api/app/schemas/messaging.py`,
  `apps/api/app/models/messaging_workspace_message.py`,
  `apps/web/src/workspaces/messages/MessagingWorkspace.tsx`,
  `apps/web/src/workspaces/messages/messagingInboxData.ts`, and
  `apps/web/src/workspaces/messages/messagingComposerFormatting.ts`
- Lesson: once a messaging surface starts to mimic Slack or Teams, threads and
  message actions cannot stay as frontend-only conventions. ECTRM now persists
  `parent_message_id`, `thread_root_message_id`, and audited edit/delete/pin
  timestamps on durable message records, exposes them through the public
  workspace API, and keeps the UI thread pane, reply counts, quote flow, inline
  edit/delete, and pin state synchronized from those records. Toolbar buttons in
  the channel composer now mutate the draft instead of acting as decorative
  labels, which prevents prompt text from compensating for missing product
  behavior.
- Deterministic opportunity: graduate message ownership and moderation rules
  beyond the current “signed-in author can edit/delete; signed-in operator can
  pin” baseline before introducing cross-user collaboration or enterprise
  notification routing.
- Agent autonomy impact: agents should not introduce Slack-like reply or action
  affordances as local state sugar. If a reply belongs to a specific message or
  an action changes message history, that behavior should live in durable typed
  records with audit fields.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_messaging_workspace_api`,
  `npm test -- messagingWorkspace.test.ts messagesApi.test.ts messagingComposerFormatting.test.ts messagingAgentSession.test.ts messagingAgentRouter.test.ts`,
  and file-scoped `eslint` on the touched messaging files
- Follow-up: add durable attachment records, mentions, and richer notification
  semantics on top of the new thread/action model instead of layering them onto
  flat timeline items.

### 2026-05-16 - Focused Handoffs And Lowered Agent Authority Must Fail Closed

- Type: lesson
- Domain: assistant handoffs, terminal navigation, onboarding overlays, and
  governed agent profile changes
- Applies to: Prompt Home destination routing, terminal-style route handoffs,
  Start Here onboarding, and admin-managed agent authority edits
- Status: implemented
- Source:
  `apps/web/src/entities/app/promptNavigationIntent.ts`,
  `apps/web/src/entities/app/workspaceLoading.ts`,
  `apps/web/src/workspaces/admin/AgentManagementPanel.tsx`, and
  `apps/web/tests/browser/smokeHarness.spec.ts`
- Lesson: focused workspace handoffs are deliberate operator context and should
  fail closed or stay uninterrupted. Unsupported assistant focus metadata is
  rejected instead of partially opening a destination, and signed-in Start Here
  onboarding stays hidden while a route handoff is active. When an approved
  agent profile request lowers authority below action staging, the admin draft
  strips governed action permissions before validation and save.
- Deterministic opportunity: keep authority-ceiling-to-action-permission
  normalization in typed product logic rather than in reviewer instructions or
  smoke-only setup. Similar handoff overlays should check for focused context
  before interrupting task-specific routes.
- Agent autonomy impact: agents may suggest handoffs or profile changes, but
  product code must enforce unsupported-focus rejection and authority/action
  compatibility before any durable save.
- Tests or evidence:
  `npm run test -- --run tests/terminalCommandSearch.test.ts tests/promptNavigationIntent.test.ts tests/appRouteHandoff.test.ts tests/workspaceLoading.test.ts tests/workspaceLayoutPresets.test.ts`,
  `make web-lint web-build web-test`, `make web-smoke-test`, and
  `make api-assistant-evals`
- Follow-up: add explicit unit coverage around profile-request authority
  downgrades if more authority ceilings or action families are introduced.

### 2026-05-16 - Messaging Composer Upgrades Should Reuse The Durable Post Contract

- Type: lesson
- Domain: messaging composer UX, lightweight attachments, mentions, emoji, and
  reactions
- Applies to: extending the `Messages` workspace toward Slack-style compose
  behavior without reintroducing UI-only state
- Status: implemented
- Source:
  `apps/api/app/schemas/messaging.py`,
  `apps/api/app/domains/messages/services/workspace.py`,
  `apps/web/src/entities/messages/api.ts`,
  `apps/web/src/workspaces/messages/MessagingWorkspace.tsx`, and
  `apps/web/src/workspaces/messages/messagingComposerFormatting.ts`
- Lesson: once a messaging surface has a durable post contract, new compose
  affordances should ride that contract instead of creating sidecar state or
  fake-only UI. ECTRM now persists attachment metadata on post create, stores
  reaction updates through the existing patch path, inserts mentions with an
  explicit `@[Name]` token that renders back as a styled mention, and keeps
  emoji insertion as plain durable text rather than special transient state.
- Deterministic opportunity: if mentions graduate into notifications or access
  control, add a typed mention entity and notification fan-out service instead
  of asking prompts or client code to infer semantics from freeform text.
- Agent autonomy impact: agents should prefer lightweight token or metadata
  contracts when promoting a decorative compose affordance into durable product
  behavior, and only introduce richer storage models when the new behavior
  requires them.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_messaging_workspace_api`,
  `npm test -- messagingWorkspace.test.ts messagesApi.test.ts messagingComposerFormatting.test.ts messagingAgentSession.test.ts messagingAgentRouter.test.ts`,
  `npx eslint src/workspaces/messages/MessagingWorkspace.tsx src/workspaces/messages/messagingInboxData.ts src/workspaces/messages/messagingComposerFormatting.ts src/entities/messages/api.ts tests/messagingWorkspace.test.ts tests/messagesApi.test.ts tests/messagingComposerFormatting.test.ts`,
  and `npm run build`
- Follow-up: replace the metadata-only attachment prototype with real file
  storage and add mention-driven notifications once ownership and delivery
  rules are defined.

### 2026-05-18 - Price Index Sources Must Sync Into Market Marks

- Type: lesson
- Domain: market data sync, price-index observations, and external provider
  status
- Applies to: `ReferencePriceIndexSource`, provider-specific sync jobs, and
  market price marks shown in product surfaces
- Status: implemented
- Source:
  `apps/api/app/domains/reference_data/services/external_data/fred_sync.py`,
  `apps/api/app/domains/reference_data/services/external_data/caiso_sync.py`,
  `apps/api/app/domains/reference_data/services/external_data/ercot_sync.py`,
  and `apps/api/app/domains/reference_data/services/external_data/price_index_observation_writer.py`
- Lesson: seeded price-index and source rows are only catalog entries until a
  provider sync writes `PriceIndexObservation` rows. Providers that expose both
  operational series and market marks should load both definitions and
  price-index source mappings, fetch the source once where possible, and report
  mixed health/status from both observation tables. When an open series is only
  a proxy for a proprietary benchmark, the price-index name and description
  must explicitly say it is a proxy rather than presenting it as the licensed
  assessment. Spot, futures, forward, index, and other quote distinctions
  belong in `ReferencePriceIndex.quote_type` so product surfaces and filters do
  not infer instrument type from names or provider strings. Provider freshness
  should combine interval-based scheduler runs with due-only event triggers,
  such as user login, so critical price marks refresh opportunistically without
  every UI render calling external providers. If a public provider has both a
  keyed API and a no-key public download, the client may fall back to the
  no-key path only when the source provider, series identity, and raw payload
  provenance remain explicit in the stored mark. File-backed public sources,
  such as EIA wholesale power workbooks, need provider-owned parsers that
  tolerate missing historical files while still failing the latest requested
  source instead of silently turning current prices into stale seeded rows.
- Deterministic opportunity: keep source-to-mark normalization in typed mappers
  and shared upsert services. Prompt instructions should not compensate for a
  provider that only seeds source rows without wiring the sync path.
- Agent autonomy impact: agents may suggest new open data sources, but pricing
  marks should become product behavior only through source mappings,
  provider-owned sync jobs, audit-linked runs, and tested idempotent writes.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_caiso_sync apps.api.tests.test_ercot_sync apps.api.tests.test_fred_sync apps.api.tests.test_admin_seed_api apps.api.tests.test_external_data_api apps.api.tests.test_run_market_data_scheduler_script`
  and `make api-test`
- Follow-up: when adding more public price providers, add the source catalog,
  mapper, sync writer, provider status kind, and seeded coverage in the same
  change.

### 2026-05-22 - Market Aggregators Are Not Price Provenance

- Type: lesson
- Domain: market data source selection, price-index candidates, and licensing
- Applies to: Trading Economics-style market screens, source-candidate
  registers, and future market quote integrations
- Status: implemented
- Source:
  `docs/engineering/trading-source-candidates.md` and
  `docs/engineering/trading-source-candidates.csv`
- Lesson: market-data aggregators can be useful comparison feeds, but they
  should not be treated as the underlying source for official marks when their
  upstream providers are undisclosed. Trading Economics documents market quotes
  as aggregated third-party data and describes many commodity values as OTC/CFD
  references rather than official settlement prices. When users ask to add an
  aggregator's "sources", add the aggregator as a comparison candidate and add
  identifiable official exchange, index publisher, benchmark publisher, or
  FRED-hosted daily-close candidates with explicit license restrictions instead
  of implying that the aggregator reveals source provenance.
- Deterministic opportunity: source-candidate promotion should require a
  license posture, golden-source role, fallback role, freshness expectation,
  and a provider-owned ingestion path before it can become an active price
  source mapping.
- Agent autonomy impact: agents may document and shortlist candidate sources,
  but should not wire copyrighted or subscription market data into live marks
  without an approved entitlement and provenance-preserving sync.
- Tests or evidence:
  `python3 - <<'PY' ... csv.reader(...) ... PY` against
  `docs/engineering/trading-source-candidates.csv`
- Follow-up: when a desk approves a non-public index or exchange feed, promote
  it from the candidate register into source mappings and provider sync code in
  the same change.

### 2026-05-19 - Vessel Tracking Health Belongs In Deterministic Ops Services

- Type: algorithm-added
- Domain: vessel tracking, AIS-style signal ingest, delivery ETA health, and
  logistics exception triage
- Applies to: `TransportMode.VESSEL` delivery obligations and typed vessel
  tracking signals
- Status: implemented
- Source:
  `apps/api/app/domains/operations/services/aisstream_client.py`,
  `apps/api/app/domains/operations/services/vessel_tracking.py`,
  `apps/api/app/domains/operations/services/vessel_tracking_health.py`,
  `apps/api/app/models/delivery_vessel_detail.py`, and
  `apps/api/app/models/delivery_tracking_signal.py`
- Lesson: vessel identity, position, destination ETA, freshness, and exception
  state should be persisted and evaluated by typed operations services. Agents
  may summarize a voyage or suggest follow-up, but accepted tracking signals
  must update `DeliveryVesselDetail` through the governed ingest path rather
  than freeform assistant output. Live provider adapters, starting with
  AISStream, should normalize provider messages into `DeliveryTrackingSignal`
  payloads and reuse the same audit, dedupe, and health classification path as
  manual vessel updates.
- Deterministic opportunity: owner is Operations. Inputs are delivery window,
  execution status, vessel identity, provider/source identifiers, signal
  timestamp, lat/lon pair, speed/course/heading/draught, destination, ETA, and
  optional provider evidence. Outputs are deduped signal records, vessel detail
  projections, freshness status, ETA status, severity, primary exception, and
  minutes since signal or late ETA. The rule set uses a 720-minute vessel signal
  staleness threshold, delivery-end ETA comparison, idempotent source-event
  dedupe, identifier validation for IMO/MMSI, and fail-closed validation for
  non-vessel obligations or incomplete coordinates.
- Agent autonomy impact: agents should stage or explain vessel tracking actions
  unless the operator submits them through the typed API. Stop conditions are
  invalid vessel identifiers, non-vessel transport mode, missing paired
  coordinates, out-of-range signal values, completed or cancelled deliveries
  where tracking is not required, and any future rule affecting external
  commitments beyond operations visibility.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_vessel_tracking_api apps.api.tests.test_truck_tracking_api`,
  `npm test -- shipmentsWorkspace.test.ts`, file-scoped shipment `eslint`, and
  `npm run build`
- Follow-up: before allowing unattended AIS updates, add provider-owned source
  mappings, scheduled ingest status, permission checks for automated runs,
  provider health/freshness monitoring, and rollback/idempotency expectations.

### 2026-05-20 - Library Verification Is Separate From Page Extraction Approval

- Type: lesson
- Domain: document library, document review status, page extraction review, and
  document workflows
- Applies to: uploaded document records and page-level extraction validation
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/ingestion.py`,
  `apps/api/app/schemas/document.py`,
  `apps/web/src/features/documents/useDocumentIngestionController.ts`, and
  `apps/web/src/workspaces/library/LibraryWorkspace.tsx`
- Lesson: a Library operator may mark a document record `VERIFIED` as a
  document-status decision without approving every extracted page field. Strict
  page review remains the default for normal page saves and still enforces
  schema-required fields before page review. Use explicit `verification_mode:
  STATUS_ONLY` only for the Library status transition; downstream workflows
  must continue to validate their own required business inputs before writing
  records.
- Deterministic opportunity: keep document status, page extraction approval,
  and workflow execution as separate typed service decisions. Price, settlement,
  or trade writes should not treat status-only verification as sufficient
  extracted-data approval.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_reviewed_page_can_be_saved_and_document_can_be_verified apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_status_only_document_verification_does_not_require_extracted_page_fields`
  and `npm run test -- documentLibrary.test.ts libraryWorkspace.test.ts documentIngestionPageEditor.test.ts documentIngestionSelectors.test.ts promptHomeDocumentUploadCard.test.ts documentApi.test.ts`

### 2026-05-22 - Document Tags Are Controlled Facets With Provenance

- Type: algorithm-added
- Domain: document ingestion, document review, search facets, and future
  document matching
- Applies to: `document_facet_values`, `/documents/schema-registry`
  `document_facets`, document/page patch payloads, Library tag preview columns,
  Library detail views, and Library search
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_facets.py`,
  `apps/api/app/models/document_facet_value.py`,
  `apps/api/app/schemas/document.py`,
  `apps/web/src/features/documents/DocumentFacetEditor.tsx`,
  `apps/web/src/workspaces/library/LibraryWorkspace.tsx`, and
  `apps/web/src/workspaces/library/libraryWorkspaceSupport.ts`
- Lesson: document tags that affect routing, filtering, or matching should be
  typed facet assignments, not loose strings. The first controlled set covers
  commodity, purchase/sale side, transport mode, and asset context. Each value
  stores normalized codes, display snapshots, page/document scope, source,
  confidence, review status, evidence, and audit fields so suggested tags can
  remain reviewable until an operator confirms them. Human-added tags use
  `MANUAL` source; system-added tags keep their original system source even
  after a human confirms them. Removing a persisted tag should mark it
  `REJECTED` with human update provenance instead of deleting the origin row.
- Deterministic opportunity: expand extraction and matching against these
  facets through typed services. Owner is Document Operations. Inputs are page
  text, reviewed page fields, linked records, reference data, and operator
  corrections. Outputs are suggested, confirmed, or rejected facet values.
  Stop conditions are ambiguous company perspective for purchase/sale, unknown
  controlled values outside open commodity codes, conflicting page-level tags,
  and any proposed tag that would mutate trade, settlement, logistics, risk, or
  compliance records without a separate governed action.
- Agent autonomy impact: agents may explain or suggest document facet values,
  but durable tags must be saved through the typed document facet service. Do
  not let prompt-only labels drive routing, matching, policy, or record writes.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_document_patch_persists_controlled_facet_values apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_document_patch_tracks_human_added_and_system_added_tag_changes apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_page_patch_persists_page_level_facet_values apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_document_patch_rejects_invalid_facet_values apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_document_facet_suggester_extracts_starter_tags_from_text apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_schema_registry_exposes_supported_document_contracts`,
  `npm --prefix apps/web test -- libraryWorkspace.test.ts documentLibrary.test.ts documentIngestionSelectors.test.ts documentIngestionPageEditor.test.ts`,
  and `npm --prefix apps/web run build`

### 2026-05-23 - Page Preview Images Are Regenerable Artifacts

- Type: lesson
- Domain: document ingestion, Library page preview, and document storage
- Applies to: `/documents/{document_id}/pages/{page_id}/preview`, stored PDF
  source files, and rendered page preview PNGs
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_ingestion_serialization.py`,
  `apps/api/app/domains/documents/services/document_ingestion_storage.py`, and
  `apps/web/src/workspaces/library/LibraryWorkspace.tsx`
- Lesson: rendered page previews are cache artifacts, not durable business
  truth. When a preview PNG is missing but the source PDF is still available,
  the preview endpoint should regenerate the page image from the PDF and then
  return it. The UI should let operators retry a failed preview request without
  requiring a full page refresh.
- Deterministic opportunity: keep preview generation deterministic and derived
  from the stored source PDF, page number, render DPI, and artifact path. Do
  not store reviewer decisions or extraction truth only inside preview files.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_page_preview_endpoint_returns_rendered_png apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_page_preview_endpoint_regenerates_missing_rendered_png`,
  `npm --prefix apps/web test -- libraryWorkspace.test.ts documentPagePreviewCache.test.ts documentIngestionPageEditor.test.ts`,
  and `npm --prefix apps/web run build`

### 2026-05-23 - Low-Confidence Library Classification Escalates To Configured Processor

- Type: algorithm-added
- Domain: document ingestion, Library classification, page extraction, and
  document processor routing
- Applies to: uploaded Library documents, deterministic page classification,
  configured document processor providers, and page-level classification payloads
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/ingestion.py`,
  `apps/api/app/domains/documents/services/document_classification_scoring.py`,
  `apps/api/app/domains/documents/services/document_processor.py`, and
  `apps/api/tests/test_document_ingestion_api.py`
- Lesson: deterministic classification remains the first-pass source of truth
  for uploaded Library pages. When that score is below the shared
  low-confidence threshold, ingestion may escalate only those pages to the
  configured document processor provider, which uses the same environment-driven
  model and API configuration pattern as the chatbot stack. Explicit `builtin`
  processor selection is a stop condition and must suppress AI fallback.
- Deterministic opportunity: keep confidence thresholds, provider routing,
  provenance capture, and processor application in typed ingestion services.
  The AI output may refine the staged document/page classification and
  extraction payload, but it must not directly write trade, settlement,
  logistics, risk, compliance, or external commitment records.
- Agent autonomy impact: agents may explain why low-confidence pages were sent
  to the configured processor and summarize processor traces, but operator
  review, manual fallback, provenance, and typed service boundaries remain
  required before downstream business writes.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_reprocess_can_switch_document_processor_provider apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_low_confidence_upload_uses_configured_ai_fallback apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_high_confidence_upload_skips_ai_fallback apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_upload_can_force_built_in_parser_only`

### 2026-05-23 - Library Classification History Belongs In Domain Events

- Type: lesson
- Domain: document ingestion, Library audit logs, document classification,
  document reprocessing, and review provenance
- Applies to: uploaded Library documents, classification snapshots,
  reprocess requests, processor runs, manual classification changes, and
  Library activity timelines
- Status: implemented
- Source:
  `apps/api/app/domains/documents/services/document_activity.py`,
  `apps/api/app/domains/documents/services/ingestion.py`,
  `apps/api/app/domains/documents/services/document_ingestion_serialization.py`,
  `apps/api/app/schemas/document.py`, and
  `apps/web/src/workspaces/library/LibraryWorkspace.tsx`
- Lesson: Library activity must not be reconstructed only from the current
  document row. Upload, processing, original classification, reprocess request,
  subsequent classification, manual classification correction, and review
  updates should append `document` aggregate events with enough snapshot
  payload to answer "what changed, from what, by whom, and when" after later
  reprocessing overwrites page state.
- Deterministic opportunity: keep audit event payloads structured around typed
  classification and processing snapshots. The UI may format those events, but
  the persisted event payload is the durable audit basis.
- Agent autonomy impact: agents may summarize document audit history and
  explain reprocess outcomes, but they must preserve immutable event history
  and use typed document services for any reprocess or correction.
- Tests or evidence:
  `./.venv/bin/python -m unittest apps.api.tests.test_document_ingestion_api.DocumentIngestionApiTests.test_activity_log_preserves_original_classification_and_reprocess_history`,
  focused upload/reprocess fallback tests,
  `npm --prefix apps/web test -- libraryWorkspace.test.ts`, and
  `make api-document-classification-evals`
