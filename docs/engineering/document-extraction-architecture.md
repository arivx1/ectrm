# Document Extraction Architecture

## Purpose

Document extraction should be schema-driven and structure-aware. The platform
should not ask a model to extract whatever seems important from a file. It
should profile the artifact, segment logical documents, classify each logical
document, select the extraction schema, extract supported fields and datasets,
normalize values, validate them, and only then stage links or downstream
business records.

The governing principle is:

> AI can extract, but ECTRM decides what is allowed, how values are normalized,
> how confidence is scored, and whether the result is good enough to use.

## Target Pipeline

```text
File or attachment received
  -> artifact and content profile
  -> logical document segmentation
  -> document classification and facet/profile selection
  -> structure profile
  -> extraction schema selection
  -> extraction plan
  -> header, party, reference, clause, and dataset extraction
  -> normalization and master-data resolution
  -> validation and confidence scoring
  -> generic extraction audit tables
  -> document-specific canonical staging tables
  -> linkage, auto-approval, or human review
```

Keep four ideas separate:

- file type: the physical artifact, such as PDF, Excel, Word, CSV, email, or
  image
- document kind: the business document inside it, such as invoice, BOL, COA,
  settlement statement, or trade confirmation
- structure profile: the extractable shapes inside it, such as pages, sheets,
  headings, clauses, key-value regions, tables, repeated row groups, and
  attachments
- extraction schema: the versioned business contract that defines what can be
  extracted, normalized, validated, and staged

## Current Implementation

The current runtime is intentionally narrower than the target model:

- uploads accept validated PDFs only
- one `DocumentIngestion` currently represents the uploaded PDF packet
- `DocumentIngestionPage` stores page-level classification, header fields,
  table blocks, raw text, review state, and processor provenance
- the schema registry exposes document-kind fields, table templates, facets,
  extraction objects, validation rules, and review rules
- `analysis_summary` now includes the first artifact/structure handoff:
  `artifact_profile`, `structure_profile`, and `extraction_plan`

That is enough to make the next steps explicit without adding premature
database tables for every canonical output shape.

## Artifact And Content Profiling

Every uploaded artifact should get a technical profile before semantic
extraction. Do not trust only the filename extension.

The profiler should use:

- declared filename and extension
- MIME type
- magic bytes or file signature
- parser verification
- container inspection for Office files, embedded files, portfolios, and
  attachments
- content sampling

Recommended profile fields:

```text
artifact_profile
  artifact_id
  declared_filename
  declared_extension
  detected_file_type
  mime_type
  parser_verified_flag
  encrypted_flag
  corrupt_flag
  contains_macros_flag
  contains_embedded_files_flag
  page_count
  sheet_count
  has_native_text
  requires_ocr_flag
  recommended_parse_mode
```

The best first parser depends on file type:

| File type | First parse strategy | Notes |
| --- | --- | --- |
| Native-text PDF | Text plus layout extraction | Preserve page coordinates and reading order. |
| Scanned PDF or image | OCR plus visual layout | Lower confidence and require evidence. |
| Hybrid PDF | Embedded text plus OCR fallback | Watch for duplicate text layers. |
| Excel or CSV | Native cell/table extraction | Preserve sheets, cells, formulas, ranges, and tables. |
| Word document | Native XML structure extraction | Preserve headings, paragraphs, tables, clauses, comments, and track changes where available. |
| Email | Headers, body, and attachments | Each attachment may become its own artifact. |

Excel, Word, and CSV should not be rendered and OCR'd as the default path.
Native structure is usually more reliable and more reviewable.

## Universal Content Model

File-specific parsers should produce a shared content model while keeping
format-specific provenance.

```text
content_unit
  content_unit_id
  artifact_id
  parent_content_unit_id
  unit_type
  text
  source_location_type
  page_number
  bbox
  sheet_name
  cell_range
  paragraph_index
  table_index
  row_index
  column_index
  heading_path
  reading_order
  style_or_format
  confidence
```

Examples:

- PDF/image: page number plus bounding box
- Excel: workbook, sheet, cell address, range, formula, displayed value
- Word: heading path, paragraph index, table index, row, column, clause number
- CSV: row and column
- Email: header/body/attachment plus character offset

This common substrate lets review, evidence highlighting, and corrections work
across file types.

## Structure Profile

After parsing content, profile the structures before extracting business facts.
The structure profile answers:

- does the artifact contain one document or a packet of logical documents?
- which pages, sheets, sections, or attachments belong to each logical document?
- are there key-value regions?
- how many tables or repeated row groups exist?
- are the tables data-bearing or just layout?
- do any tables continue across pages or sheets?
- does the document need deeper dataset extraction?
- which extraction schema objects should be activated?

Recommended structure objects:

```text
structure_object
  structure_object_id
  artifact_id
  logical_document_id
  object_type
  semantic_type
  source_location
  parent_structure_object_id
  confidence
```

Useful `object_type` values:

```text
page, sheet, section, heading, paragraph, clause, key_value_group,
table, row_group, signature_block, image, attachment
```

Useful `semantic_type` values:

```text
invoice_header, invoice_line_items, tax_summary, payment_instructions,
coa_test_results, settlement_lines, contract_pricing_terms, bol_cargo_lines,
reference_table, signature_block
```

## Table Profiling

Table detection is not the same thing as table understanding. Store a profile
for every candidate table before semantic extraction.

```text
table_profile
  table_id
  structure_object_id
  artifact_id
  logical_document_id
  source_location
  detected_table_type
  semantic_table_type
  extract_as_dataset_flag
  header_row_count
  data_row_count
  column_count
  has_merged_cells
  has_repeated_headers
  has_subtotals
  has_totals_row
  continues_from_previous_page
  continues_to_next_page
  confidence

table_column_profile
  table_id
  column_index
  raw_header
  normalized_column_code
  data_type
  unit_hint
  currency_hint
  confidence

table_row_profile
  table_id
  row_index
  row_type
  confidence
```

Useful `row_type` values:

```text
header, data, subtotal, total, note, blank, repeated_header,
section_header, footer
```

Some detected grids are address layouts, signature blocks, or terms layouts.
Only semantic, data-bearing tables should be mapped into canonical datasets.

## Extraction Schemas

An extraction schema is the contract between classification, AI extraction,
deterministic normalization, validation, tabular output, and review.

Schemas should define:

- applicable document kinds, profiles, and facets
- header fields, parties, references, clauses, and datasets
- table templates and nested objects
- required versus optional fields
- aliases and label mappings
- value types and allowed enum values
- normalization rules
- validation rules
- business-link candidates
- review thresholds and auto-approval rules
- prompt or extraction-engine instructions

Example shape:

```text
schema_code: INVOICE.v1
document_kind: INVOICE

objects:
  header:
    cardinality: one
    canonical_table: invoice_header
    fields:
      - invoice_number
      - invoice_date
      - due_date
      - issuer_party
      - recipient_party
      - currency
      - total_amount

  references:
    cardinality: many
    canonical_table: document_reference
    fields:
      - reference_type
      - raw_reference
      - normalized_reference
      - linked_entity_type
      - linked_entity_id

  invoice_lines:
    cardinality: many
    source_object_type: table
    canonical_table: invoice_line
    fields:
      - description
      - charge_type
      - product
      - quantity
      - unit_of_measure
      - unit_price
      - line_amount

validation:
  - invoice_number_required
  - currency_required
  - total_amount_required
  - line_amounts_should_sum_to_total_when_lines_present

review_rules:
  - require_review_if_missing_required_field
  - require_review_if_total_amount_mismatch
  - require_review_if_unresolved_party
  - require_review_if_ambiguous_currency
```

The current schema registry exposes starter extraction objects for invoices,
BOLs, COAs, truck tickets, weigh tickets, settlement statements, and trade
confirmations.

## Generic Extraction Audit Tables

Do not write only to one flat output table. Use generic extraction tables as an
audit trail for every document type.

```text
extraction_run
  extraction_run_id
  logical_document_id
  extraction_schema_code
  extraction_schema_version
  model_or_engine
  run_timestamp
  run_status
  overall_confidence
  validation_status
  review_status

extracted_field
  extraction_run_id
  logical_document_id
  field_code
  field_label
  raw_value
  normalized_value
  value_type
  unit_code
  currency_code
  confidence
  source_location
  source_text
  validation_status
  review_status

extracted_table
  table_id
  extraction_run_id
  logical_document_id
  table_code
  table_label
  source_location
  confidence

extracted_table_cell
  table_id
  row_index
  column_index
  column_code
  raw_value
  normalized_value
  value_type
  unit_code
  currency_code
  confidence
  source_location
  source_text
```

Every extracted value should keep raw value, normalized value, confidence,
validation state, review state, source location, and source text.

## Canonical Staging Tables

Generic extraction tables preserve evidence. Document-specific canonical tables
make extracted data useful to business services.

| Document family | Canonical staging tables |
| --- | --- |
| Invoice | `invoice_header`, `invoice_line`, `invoice_tax_line`, `invoice_reference` |
| Bill of Lading | `bol_header`, `bol_party`, `bol_cargo`, `bol_transport_leg`, `bol_equipment`, `bol_reference` |
| Certificate of Analysis | `quality_document_header`, `quality_sample`, `quality_test_result`, `quality_reference` |
| Weigh or truck ticket | `ticket_header`, `ticket_measurement`, `ticket_movement_event`, `ticket_reference` |
| Settlement statement | `settlement_header`, `settlement_line`, `settlement_adjustment`, `settlement_reference` |
| Broker statement | `broker_statement_header`, `broker_statement_line`, `broker_fee_line`, `statement_reference` |
| Trade confirmation | `trade_confirmation_header`, `trade_term`, `pricing_term`, `delivery_term`, `payment_term`, `confirmation_reference` |
| Trade contract | `contract_header`, `contract_clause`, `contract_term`, `pricing_term`, `delivery_term`, `quality_spec_term` |
| Pipeline statement | `pipeline_statement_header`, `pipeline_movement_line`, `pipeline_inventory_balance`, `pipeline_nomination_reference` |

Canonical rows should still keep provenance columns or field-level provenance
links back to the extraction run and source evidence. Do not make canonical
staging a black box.

## References And Master Data Resolution

References deserve a shared table because they drive matching and workflow
routing.

```text
document_reference
  logical_document_id
  extraction_run_id
  reference_type
  raw_reference
  normalized_reference
  linked_entity_type
  linked_entity_id
  confidence
  source_location
  source_text
```

Common reference types include:

```text
trade_reference, contract_reference, invoice_reference, bol_reference,
ticket_reference, shipment_reference, nomination_reference,
pipeline_batch_reference, purchase_order_reference, letter_of_credit_reference,
broker_reference, counterparty_reference
```

Extraction should capture raw values first. Separate resolver services should
map raw values to master data and business records:

- parties
- products
- locations
- vessels and equipment
- terminals and pipelines
- contracts, trades, deliveries, invoices, and payments
- currencies and units of measure

Store raw value, normalized value, matched entity, and match confidence. Never
overwrite the raw document value.

## Validation And Confidence

Extraction is not complete until validation runs.

Confidence should exist at multiple levels:

- classification confidence
- extraction-run confidence
- field confidence
- table, row, and cell confidence
- normalization confidence
- master-data match confidence
- validation confidence
- business-link confidence

Do not rely only on a model's self-reported confidence. Combine evidence from
OCR quality, parser source, source evidence, normalization success, validation
results, master-data match strength, and historical accuracy for the
document-kind/counterparty/template.

Example validation families:

- invoice: required invoice number, currency, total amount, line total
  reconciliation, duplicate checks, party resolution, due date after issue date
- BOL: BOL number, carrier, route, product, quantity unit, transport mode, date
  within expected shipment window
- COA: certificate number, sample or lot, at least one test result, analyte and
  unit per result, pass/fail consistent with spec limits
- settlement statement: settlement period, counterparty, row totals, pricing
  basis, categorized adjustments, resolved trade or contract references

Validation output should decide whether the document can proceed straight
through or needs review.

## AI And Deterministic Roles

Use native parsers and deterministic services for:

- file-type detection and parser verification
- PDF text extraction, OCR orchestration, Excel cells, Word paragraphs/tables,
  and CSV rows
- exact reference matching
- date, currency, amount, unit, and quantity parsing
- line-total validation
- duplicate detection
- required-field checks
- master-data lookups
- threshold and policy checks

Use AI for:

- messy layout interpretation
- mapping varied labels to canonical fields
- semantic table classification
- table column meaning
- subtotal, total, note, and section-row interpretation
- clause and commercial-term extraction
- charge-type classification
- quality result table interpretation
- candidate business-link explanation

AI output should be constrained by the selected schema: return only supported
fields, use allowed enum values, return null when unsupported, avoid inference,
and provide source evidence for every value.

## Review And Learning

Review should be field- and dataset-level, not document-level only. The
reviewer should see:

- extracted value and normalized value
- source evidence and source location
- confidence and validation status
- suggested master-data match and alternatives
- candidate business links

Reviewers should be able to correct document boundaries, document kind,
facets/profile, fields, table columns, rows, party matches, product matches,
and business links.

Store corrections with:

```text
original_value
corrected_value
reviewer
timestamp
reason_code
source_evidence
```

Useful reason codes:

```text
ocr_error, wrong_field_mapping, wrong_table_row_split, wrong_party_match,
ambiguous_document, missing_alias, new_counterparty_template_needed,
wrong_business_link
```

Corrections should improve aliases, templates, validation rules, and extraction
schemas through reviewed deterministic changes, not hidden prompt drift.

## Auto-Approval

Auto-approval should be explicit and conservative. Example invoice conditions:

- classification confidence is high
- required fields are present with field-level confidence above threshold
- issuer and recipient resolve to master data above threshold
- currency and total amount normalize cleanly
- line-total validation passes when lines are present
- expected trade, shipment, contract, or BOL links resolve
- duplicate invoice checks pass
- document is not corrected, amended, cancelled, disputed, or above an amount
  threshold that requires review

High-risk documents need stricter thresholds. Low-risk, high-volume documents
from known counterparties can later use counterparty-specific templates to
increase straight-through processing, but only with audit and rollback.

## Next Work Packages

1. Persist artifact profiles and structure objects outside `analysis_summary`.
2. Introduce logical documents so one PDF, email, or workbook can contain many
   classified business documents.
3. Add extraction-run, extracted-field, extracted-table, and extracted-cell
   audit tables.
4. Add document-reference rows and deterministic reference resolvers.
5. Add canonical staging tables for invoice, BOL, COA, ticket, settlement, and
   trade-confirmation outputs.
6. Add validation services and review thresholds per extraction schema.
7. Extend intake beyond PDF with native Excel, CSV, Word, image, and email
   parsers.
8. Add counterparty-specific templates only after reviewed examples prove the
   layout is stable.
