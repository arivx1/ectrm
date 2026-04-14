from __future__ import annotations

from apps.api.app.schemas.document import DocumentFieldSchemaOut
from apps.api.app.schemas.document import DocumentKindSchemaOut
from apps.api.app.schemas.document import DocumentRecordTargetOut
from apps.api.app.schemas.document import DocumentSchemaRegistryOut
from apps.api.app.schemas.document import DocumentTableColumnSchemaOut
from apps.api.app.schemas.document import DocumentTableTemplateSchemaOut

DOCUMENT_SCHEMA_REGISTRY_VERSION = "2026-04-14.review-v3"


def _field(
    field_key: str,
    label: str,
    *,
    value_type: str = "text",
    required: bool = False,
) -> DocumentFieldSchemaOut:
    return DocumentFieldSchemaOut(
        field_key=field_key,
        label=label,
        value_type=value_type,
        required=required,
    )


def _column(
    column_key: str,
    label: str,
    *,
    value_type: str = "text",
    required: bool = False,
) -> DocumentTableColumnSchemaOut:
    return DocumentTableColumnSchemaOut(
        column_key=column_key,
        label=label,
        value_type=value_type,
        required=required,
    )


def _target(
    record_type: str,
    label: str,
    match_hint: str,
    *,
    role: str = "PRIMARY",
    create_if_missing: bool = False,
) -> DocumentRecordTargetOut:
    return DocumentRecordTargetOut(
        record_type=record_type,
        label=label,
        role=role,
        match_hint=match_hint,
        create_if_missing=create_if_missing,
    )


DOCUMENT_KIND_SCHEMAS: tuple[DocumentKindSchemaOut, ...] = (
    DocumentKindSchemaOut(
        document_kind="TRADE_COMMUNICATION",
        label="Trade Communication",
        document_family="TRADE_EXECUTION",
        description="Commercial recap, email, or message thread capturing trade terms or negotiation context.",
        review_guidance="Confirm whether the communication represents a firm trade recap, then capture the trade identifiers, sender, and counterparties.",
        linkage_summary="Links primarily to trade records using trade IDs, external trade IDs, counterparties, and the communication date.",
        record_targets=[
            _target("TRADE", "Trade", "Match using trade or external trade identifiers when present."),
        ],
        matching_keys=["trade_id", "external_trade_id", "counterparty"],
        header_fields=[
            _field("communication_date", "Communication Date", value_type="date"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("external_trade_id", "External Trade ID", value_type="identifier"),
            _field("counterparty", "Counterparty"),
            _field("sender", "Sender"),
            _field("subject", "Subject"),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="INVOICE",
        label="Invoice",
        document_family="SETTLEMENT",
        description="Commercial invoice with payable or receivable header fields and one or more line-item tables.",
        review_guidance="Confirm the invoice identity, dates, counterparty, and total before checking the line-item breakdown.",
        linkage_summary="Links primarily to settlement and trade records using invoice number, trade ID, delivery ID, counterparty, and invoice dates.",
        record_targets=[
            _target(
                "TRADE_INVOICE",
                "Trade Invoice",
                "Match using invoice number first, then trade ID, delivery ID, and counterparty.",
                create_if_missing=True,
            ),
            _target(
                "TRADE",
                "Trade",
                "Use trade ID when present to attach the invoice to the governing trade.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["invoice_number", "trade_id", "delivery_id", "counterparty"],
        header_fields=[
            _field("invoice_number", "Invoice Number", value_type="identifier", required=True),
            _field("invoice_date", "Invoice Date", value_type="date", required=True),
            _field("due_date", "Due Date", value_type="date", required=True),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("counterparty", "Counterparty", required=True),
            _field("total_amount", "Total Amount", value_type="currency", required=True),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="line_items",
                label="Line Items",
                description="Primary invoice charge lines or quantity lines.",
                min_occurrences=1,
                columns=[
                    _column("description", "Description", required=True),
                    _column("quantity", "Quantity", value_type="quantity"),
                    _column("unit_of_measure", "Unit"),
                    _column("unit_price", "Unit Price", value_type="currency"),
                    _column("line_amount", "Line Amount", value_type="currency", required=True),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="TRADE_CONFIRMATION",
        label="Trade Confirmation",
        document_family="TRADE_EXECUTION",
        description="Confirmation document capturing economic terms, dates, and counterparty agreement details.",
        review_guidance="Verify the trade identifier, trade date, and counterparty, then normalize any economic term tables.",
        linkage_summary="Links primarily to trade records using confirmation number, trade ID, external trade IDs, trade date, and counterparty.",
        record_targets=[
            _target("TRADE", "Trade", "Match using trade ID first, then confirmation number and counterparty."),
            _target(
                "TRADE_CONFIRMATION",
                "Trade Confirmation",
                "Use confirmation number to find an existing confirmation record or create a new one under the matched trade.",
                role="SECONDARY",
                create_if_missing=True,
            ),
        ],
        matching_keys=["trade_id", "external_trade_id", "confirmation_number", "counterparty"],
        header_fields=[
            _field("confirmation_number", "Confirmation Number", value_type="identifier", required=True),
            _field("trade_id", "Trade ID", value_type="identifier", required=True),
            _field("external_trade_id", "External Trade ID", value_type="identifier"),
            _field("trade_date", "Trade Date", value_type="date", required=True),
            _field("counterparty", "Counterparty", required=True),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="economic_terms",
                label="Economic Terms",
                description="Structured confirmation terms captured as name/value rows.",
                min_occurrences=0,
                columns=[
                    _column("term_name", "Term Name", required=True),
                    _column("term_value", "Term Value", required=True),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="TRADE_CONTRACT",
        label="Trade Contract",
        document_family="TRADE_EXECUTION",
        description="Purchase and sale agreement or master contract documenting commercial terms and delivery obligations.",
        review_guidance="Confirm the contract identity, trade reference, counterparty, and delivery window before reviewing supporting schedules.",
        linkage_summary="Links primarily to trade records using contract number, trade IDs, counterparty, commodity, and delivery dates.",
        record_targets=[
            _target("TRADE", "Trade", "Match using trade ID or contract number plus counterparty."),
        ],
        matching_keys=["trade_id", "external_trade_id", "contract_number", "counterparty"],
        header_fields=[
            _field("contract_number", "Contract Number", value_type="identifier", required=True),
            _field("contract_date", "Contract Date", value_type="date"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("external_trade_id", "External Trade ID", value_type="identifier"),
            _field("counterparty", "Counterparty"),
            _field("commodity", "Commodity"),
            _field("delivery_start", "Delivery Start", value_type="date"),
            _field("delivery_end", "Delivery End", value_type="date"),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="BROKER_CONFIRMATION",
        label="Broker Confirmation",
        document_family="TRADE_RECONCILIATION",
        description="Broker or clearing confirmation reflecting an executed trade and account context.",
        review_guidance="Confirm the broker confirmation number, desk trade reference, and brokerage account before linking it.",
        linkage_summary="Links primarily to trade and broker-account records using trade IDs, broker confirmation numbers, and account references.",
        record_targets=[
            _target("TRADE", "Trade", "Match using trade IDs or broker confirmation numbers."),
            _target(
                "BROKER_ACCOUNT",
                "Broker Account",
                "Use broker and account when the trade match is incomplete.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["trade_id", "external_trade_id", "broker_confirmation_number", "account"],
        header_fields=[
            _field("broker_confirmation_number", "Broker Confirmation Number", value_type="identifier", required=True),
            _field("trade_date", "Trade Date", value_type="date"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("external_trade_id", "External Trade ID", value_type="identifier"),
            _field("broker", "Broker"),
            _field("account", "Account", value_type="identifier"),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="BROKER_STATEMENT",
        label="Broker Statement",
        document_family="TRADE_RECONCILIATION",
        description="Periodic broker or clearing statement summarizing balances, activity, or futures positions.",
        review_guidance="Verify the statement date, broker, and account before reviewing period activity.",
        linkage_summary="Links primarily to broker-account records using broker, account, and statement references, with optional trade back-links.",
        record_targets=[
            _target("BROKER_ACCOUNT", "Broker Account", "Match using broker, account, and statement date."),
        ],
        matching_keys=["statement_number", "broker", "account", "statement_date"],
        header_fields=[
            _field("statement_number", "Statement Number", value_type="identifier", required=True),
            _field("statement_date", "Statement Date", value_type="date", required=True),
            _field("broker", "Broker", required=True),
            _field("account", "Account", value_type="identifier", required=True),
            _field("period_start", "Period Start", value_type="date"),
            _field("period_end", "Period End", value_type="date"),
            _field("currency", "Currency", value_type="identifier"),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="PIPELINE_STATEMENT",
        label="Pipeline Statement",
        document_family="NETWORK_FLOW",
        description="Pipeline allocation, nomination, or statement document reflecting transport activity or balances.",
        review_guidance="Confirm the statement identity, pipeline system, and nomination references before matching it to flow records.",
        linkage_summary="Links primarily to delivery and trade records using statement numbers, trade IDs, contract numbers, and nomination references.",
        record_targets=[
            _target("DELIVERY", "Delivery", "Match using nomination reference, locations, and trade ID when available."),
            _target(
                "TRADE",
                "Trade",
                "Use trade ID or contract number when the delivery linkage is incomplete.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["statement_number", "trade_id", "contract_number", "nomination_reference"],
        header_fields=[
            _field("statement_number", "Statement Number", value_type="identifier", required=True),
            _field("statement_date", "Statement Date", value_type="date"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("pipeline_system", "Pipeline System", required=True),
            _field("contract_number", "Pipeline Contract Number", value_type="identifier"),
            _field("nomination_reference", "Nomination Reference", value_type="identifier"),
            _field("receipt_location_code", "Receipt Location", value_type="identifier"),
            _field("delivery_location_code", "Delivery Location", value_type="identifier"),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="TRUCK_TICKET",
        label="Truck Ticket",
        document_family="LOGISTICS",
        description="Truck movement record documenting carrier, route, and delivered or loaded quantities.",
        review_guidance="Confirm the ticket identity, carrier, and movement dates before reviewing quantities.",
        linkage_summary="Links primarily to delivery and trade records using truck ticket numbers, delivery IDs, trade IDs, and carrier references.",
        record_targets=[
            _target("DELIVERY", "Delivery", "Match using delivery ID, carrier reference, and route details."),
            _target(
                "TRADE",
                "Trade",
                "Use trade ID as a secondary linkage when the movement record needs context.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["ticket_number", "trade_id", "delivery_id", "carrier_reference"],
        header_fields=[
            _field("ticket_number", "Truck Ticket Number", value_type="identifier", required=True),
            _field("load_date", "Load Date", value_type="date"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("carrier", "Carrier"),
            _field("carrier_reference", "Carrier Reference", value_type="identifier"),
            _field("asset_reference", "Asset Reference", value_type="identifier"),
            _field("origin", "Origin"),
            _field("destination", "Destination"),
            _field("net_quantity", "Net Quantity", value_type="quantity"),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="BILL_OF_LADING",
        label="Bill of Lading",
        document_family="LOGISTICS",
        description="Shipment document capturing carrier, movement dates, and shipped quantities.",
        review_guidance="Confirm the transport identifier and route, then capture any shipped line or compartment details.",
        linkage_summary="Links primarily to delivery and trade records using bill of lading number, carrier, route, and load date.",
        record_targets=[
            _target("DELIVERY", "Delivery", "Match using delivery ID, bill of lading number, and shipment route."),
            _target(
                "TRADE",
                "Trade",
                "Use trade ID as secondary context for the movement record.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["bill_of_lading_number", "trade_id", "delivery_id", "carrier"],
        header_fields=[
            _field("bill_of_lading_number", "Bill of Lading Number", value_type="identifier", required=True),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("carrier", "Carrier", required=True),
            _field("load_date", "Load Date", value_type="date", required=True),
            _field("origin", "Origin", required=True),
            _field("destination", "Destination", required=True),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="shipment_lines",
                label="Shipment Lines",
                description="Loaded product or compartment rows.",
                min_occurrences=0,
                columns=[
                    _column("description", "Description", required=True),
                    _column("quantity", "Quantity", value_type="quantity"),
                    _column("unit_of_measure", "Unit"),
                    _column("reference", "Reference"),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="DELIVERY_CONFIRMATION",
        label="Delivery Confirmation",
        document_family="LOGISTICS",
        description="Proof-of-delivery or delivery confirmation document reflecting a completed movement.",
        review_guidance="Confirm the delivery confirmation number, delivery references, and route before accepting it as final proof.",
        linkage_summary="Links primarily to delivery and trade records using delivery confirmation numbers, delivery IDs, carrier references, and route details.",
        record_targets=[
            _target("DELIVERY", "Delivery", "Match using delivery ID, confirmation number, and route information."),
            _target(
                "TRADE",
                "Trade",
                "Use trade ID as secondary context for the confirmed movement.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["delivery_confirmation_number", "trade_id", "delivery_id", "carrier_reference"],
        header_fields=[
            _field("delivery_confirmation_number", "Delivery Confirmation Number", value_type="identifier", required=True),
            _field("confirmation_date", "Confirmation Date", value_type="date"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("carrier_reference", "Carrier Reference", value_type="identifier"),
            _field("origin", "Origin"),
            _field("destination", "Destination"),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="CERTIFICATE_OF_ANALYSIS",
        label="Certificate of Analysis",
        document_family="QUALITY",
        description="Quality certificate documenting sample identity and analytical results.",
        review_guidance="Check the certificate identity and sample metadata first, then normalize the assay rows into one consistent results table.",
        linkage_summary="Links primarily to quality, lot, delivery, and shipment records using certificate numbers, sample IDs, lot numbers, and trade or delivery IDs.",
        record_targets=[
            _target("QUALITY_RECORD", "Quality Record", "Match using certificate number, sample ID, or lot number."),
            _target(
                "DELIVERY",
                "Delivery",
                "Use delivery ID or trade ID to connect the quality result to the underlying movement.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["certificate_number", "sample_id", "trade_id", "delivery_id", "lot_number"],
        header_fields=[
            _field("certificate_number", "Certificate Number", value_type="identifier", required=True),
            _field("sample_id", "Sample ID", value_type="identifier"),
            _field("sample_date", "Sample Date", value_type="date"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("lot_number", "Lot Number", value_type="identifier"),
            _field("product", "Product", required=True),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="assay_results",
                label="Assay Results",
                description="Analyte rows with result values and limits.",
                min_occurrences=1,
                columns=[
                    _column("parameter", "Parameter", required=True),
                    _column("method", "Method"),
                    _column("value", "Value", required=True),
                    _column("unit", "Unit"),
                    _column("spec_min", "Spec Min"),
                    _column("spec_max", "Spec Max"),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="QUALITY_STATEMENT",
        label="Quality Statement",
        document_family="QUALITY",
        description="Quality summary statement covering assay, lot, or shipment quality outcomes.",
        review_guidance="Confirm the statement identity and sample references, then capture the quality rows consistently.",
        linkage_summary="Links primarily to quality and delivery records using statement numbers, sample IDs, lot numbers, and trade or delivery IDs.",
        record_targets=[
            _target("QUALITY_RECORD", "Quality Record", "Match using statement number, sample ID, or lot number."),
            _target(
                "DELIVERY",
                "Delivery",
                "Use delivery or trade IDs when the statement is tied to a specific movement.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["statement_number", "trade_id", "delivery_id", "sample_id", "lot_number"],
        header_fields=[
            _field("statement_number", "Statement Number", value_type="identifier", required=True),
            _field("statement_date", "Statement Date", value_type="date"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("sample_id", "Sample ID", value_type="identifier"),
            _field("lot_number", "Lot Number", value_type="identifier"),
            _field("product", "Product"),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="SAMPLING_ANALYSIS",
        label="Sampling Analysis",
        document_family="QUALITY",
        description="Laboratory or sampling report documenting sample identity and analytical results.",
        review_guidance="Verify the sample identity, lot, and laboratory before accepting analytical results.",
        linkage_summary="Links primarily to quality and delivery records using sample IDs, lot numbers, and trade or delivery references.",
        record_targets=[
            _target("QUALITY_RECORD", "Quality Record", "Match using sample ID or lot number."),
            _target(
                "DELIVERY",
                "Delivery",
                "Use delivery or trade IDs as secondary linkage when the sample belongs to a movement.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["sample_id", "trade_id", "delivery_id", "lot_number"],
        header_fields=[
            _field("sample_id", "Sample ID", value_type="identifier", required=True),
            _field("sample_date", "Sample Date", value_type="date"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("lot_number", "Lot Number", value_type="identifier"),
            _field("product", "Product"),
            _field("laboratory", "Laboratory"),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="QUALITY_SPECIFICATION",
        label="Quality Specification",
        document_family="QUALITY",
        description="Specification sheet documenting product quality limits, tolerances, or acceptance criteria.",
        review_guidance="Confirm the specification identity and effective date, then review the governed product requirements.",
        linkage_summary="Links primarily to quality specification and trade records using specification name, version, product, counterparty, and effective date.",
        record_targets=[
            _target(
                "QUALITY_SPECIFICATION",
                "Quality Specification",
                "Match using specification name, version, and effective date.",
                create_if_missing=True,
            ),
            _target(
                "TRADE",
                "Trade",
                "Use trade ID or counterparty to connect the spec to active commercial agreements.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["spec_name", "spec_version", "trade_id", "counterparty", "product"],
        header_fields=[
            _field("spec_name", "Specification Name", required=True),
            _field("spec_version", "Specification Version", value_type="identifier"),
            _field("effective_date", "Effective Date", value_type="date"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("counterparty", "Counterparty"),
            _field("product", "Product", required=True),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="SETTLEMENT_STATEMENT",
        label="Settlement Statement",
        document_family="SETTLEMENT",
        description="Statement summarizing settlement calculations or cash balances.",
        review_guidance="Verify the statement identity and account, then capture the balance or settlement line sections into normalized rows.",
        linkage_summary="Links primarily to settlement and account records using statement numbers, account identifiers, and statement dates.",
        record_targets=[
            _target("SETTLEMENT_ACCOUNT", "Settlement Account", "Match using account and statement references."),
        ],
        matching_keys=["statement_number", "account", "statement_date"],
        header_fields=[
            _field("statement_number", "Statement Number", value_type="identifier", required=True),
            _field("statement_date", "Statement Date", value_type="date", required=True),
            _field("account", "Account", required=True),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="settlement_lines",
                label="Settlement Lines",
                description="Calculated statement line items or balances.",
                min_occurrences=1,
                columns=[
                    _column("description", "Description", required=True),
                    _column("quantity", "Quantity", value_type="quantity"),
                    _column("amount", "Amount", value_type="currency", required=True),
                    _column("currency", "Currency"),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="WEIGH_TICKET",
        label="Weigh Ticket",
        document_family="LOGISTICS",
        description="Weight ticket documenting gross, tare, and net measurements.",
        review_guidance="Confirm the ticket identity and capture the weight measurements or line-level movements.",
        linkage_summary="Links primarily to delivery, inventory, and trade records using ticket numbers, trade IDs, delivery IDs, and measured weights.",
        record_targets=[
            _target("DELIVERY", "Delivery", "Match using delivery ID, trade ID, and weigh date."),
            _target(
                "TRADE",
                "Trade",
                "Use trade ID as secondary context for the weighing event.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["ticket_number", "trade_id", "delivery_id", "load_date"],
        header_fields=[
            _field("ticket_number", "Ticket Number", value_type="identifier", required=True),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("load_date", "Load Date", value_type="date"),
            _field("gross_weight", "Gross Weight", value_type="quantity", required=True),
            _field("net_weight", "Net Weight", value_type="quantity", required=True),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="weight_measurements",
                label="Weight Measurements",
                description="Structured measurement rows when a single header is not enough.",
                min_occurrences=0,
                columns=[
                    _column("measurement", "Measurement", required=True),
                    _column("value", "Value", required=True),
                    _column("unit", "Unit"),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="HAZARDOUS_CARGO_DOCUMENTATION",
        label="Hazardous Cargo Documentation",
        document_family="COMPLIANCE",
        description="Safety or dangerous-goods documentation capturing regulated product and transport details.",
        review_guidance="Confirm the document identity, product, and hazard class before using it as compliance support.",
        linkage_summary="Links primarily to delivery, trade, and compliance records using document numbers, delivery IDs, UN numbers, and carrier references.",
        record_targets=[
            _target("COMPLIANCE_RECORD", "Compliance Record", "Match using document number or UN number."),
            _target(
                "DELIVERY",
                "Delivery",
                "Use delivery or trade IDs to attach the document to the governed movement.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["document_number", "trade_id", "delivery_id", "un_number", "carrier_reference"],
        header_fields=[
            _field("document_number", "Document Number", value_type="identifier", required=True),
            _field("issue_date", "Issue Date", value_type="date"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("product", "Product", required=True),
            _field("un_number", "UN Number", value_type="identifier"),
            _field("hazard_class", "Hazard Class"),
            _field("carrier_reference", "Carrier Reference", value_type="identifier"),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="OTHER",
        label="Other Document",
        description="Catch-all document for business records that do not fit a supported schema yet.",
        review_guidance="Use custom fields and custom table templates until a dedicated schema is introduced.",
        linkage_summary="Requires manual linkage because no dedicated matching contract exists yet.",
        record_targets=[],
        matching_keys=[],
        header_fields=[],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="UNKNOWN",
        label="Unknown",
        description="Unclassified page awaiting human review.",
        review_guidance="Choose a supported document kind or leave the page unknown until more context is available.",
        linkage_summary="Cannot be linked automatically until a reviewer assigns a supported document kind.",
        record_targets=[],
        matching_keys=[],
        header_fields=[],
        table_templates=[],
    ),
)


def build_document_schema_registry() -> DocumentSchemaRegistryOut:
    return DocumentSchemaRegistryOut(
        version=DOCUMENT_SCHEMA_REGISTRY_VERSION,
        document_kinds=list(DOCUMENT_KIND_SCHEMAS),
    )


def get_document_kind_schema(document_kind: str) -> DocumentKindSchemaOut | None:
    normalized_kind = document_kind.strip().upper()
    for schema in DOCUMENT_KIND_SCHEMAS:
        if schema.document_kind == normalized_kind:
            return schema
    return None


def list_supported_document_kinds() -> tuple[str, ...]:
    return tuple(schema.document_kind for schema in DOCUMENT_KIND_SCHEMAS)
