from __future__ import annotations

from apps.api.app.schemas.document import DocumentFieldSchemaOut
from apps.api.app.schemas.document import DocumentKindSchemaOut
from apps.api.app.schemas.document import DocumentSchemaRegistryOut
from apps.api.app.schemas.document import DocumentTableColumnSchemaOut
from apps.api.app.schemas.document import DocumentTableTemplateSchemaOut

DOCUMENT_SCHEMA_REGISTRY_VERSION = "2026-04-06.review-v1"

DOCUMENT_KIND_SCHEMAS: tuple[DocumentKindSchemaOut, ...] = (
    DocumentKindSchemaOut(
        document_kind="INVOICE",
        label="Invoice",
        description="Commercial invoice with payable or receivable header fields and one or more line-item tables.",
        review_guidance="Confirm the invoice identity, dates, counterparty, and total before checking the line-item breakdown.",
        header_fields=[
            DocumentFieldSchemaOut(field_key="invoice_number", label="Invoice Number", value_type="identifier", required=True),
            DocumentFieldSchemaOut(field_key="invoice_date", label="Invoice Date", value_type="date", required=True),
            DocumentFieldSchemaOut(field_key="due_date", label="Due Date", value_type="date", required=True),
            DocumentFieldSchemaOut(field_key="trade_id", label="Trade ID", value_type="identifier"),
            DocumentFieldSchemaOut(field_key="counterparty", label="Counterparty", required=True),
            DocumentFieldSchemaOut(field_key="total_amount", label="Total Amount", value_type="currency", required=True),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="line_items",
                label="Line Items",
                description="Primary invoice charge lines or quantity lines.",
                min_occurrences=1,
                columns=[
                    DocumentTableColumnSchemaOut(column_key="description", label="Description", required=True),
                    DocumentTableColumnSchemaOut(column_key="quantity", label="Quantity", value_type="quantity"),
                    DocumentTableColumnSchemaOut(column_key="unit_of_measure", label="Unit"),
                    DocumentTableColumnSchemaOut(column_key="unit_price", label="Unit Price", value_type="currency"),
                    DocumentTableColumnSchemaOut(column_key="line_amount", label="Line Amount", value_type="currency", required=True),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="TRADE_CONFIRMATION",
        label="Trade Confirmation",
        description="Confirmation document capturing economic terms, dates, and counterparty agreement details.",
        review_guidance="Verify the trade identifier, trade date, and counterparty, then normalize any economic term tables.",
        header_fields=[
            DocumentFieldSchemaOut(field_key="confirmation_number", label="Confirmation Number", value_type="identifier", required=True),
            DocumentFieldSchemaOut(field_key="trade_id", label="Trade ID", value_type="identifier", required=True),
            DocumentFieldSchemaOut(field_key="trade_date", label="Trade Date", value_type="date", required=True),
            DocumentFieldSchemaOut(field_key="counterparty", label="Counterparty", required=True),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="economic_terms",
                label="Economic Terms",
                description="Structured confirmation terms captured as name/value rows.",
                min_occurrences=0,
                columns=[
                    DocumentTableColumnSchemaOut(column_key="term_name", label="Term Name", required=True),
                    DocumentTableColumnSchemaOut(column_key="term_value", label="Term Value", required=True),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="BILL_OF_LADING",
        label="Bill of Lading",
        description="Shipment document capturing carrier, movement dates, and shipped quantities.",
        review_guidance="Confirm the transport identifier and route, then capture any shipped line or compartment details.",
        header_fields=[
            DocumentFieldSchemaOut(field_key="bill_of_lading_number", label="Bill of Lading Number", value_type="identifier", required=True),
            DocumentFieldSchemaOut(field_key="carrier", label="Carrier", required=True),
            DocumentFieldSchemaOut(field_key="load_date", label="Load Date", value_type="date", required=True),
            DocumentFieldSchemaOut(field_key="origin", label="Origin", required=True),
            DocumentFieldSchemaOut(field_key="destination", label="Destination", required=True),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="shipment_lines",
                label="Shipment Lines",
                description="Loaded product or compartment rows.",
                min_occurrences=0,
                columns=[
                    DocumentTableColumnSchemaOut(column_key="description", label="Description", required=True),
                    DocumentTableColumnSchemaOut(column_key="quantity", label="Quantity", value_type="quantity"),
                    DocumentTableColumnSchemaOut(column_key="unit_of_measure", label="Unit"),
                    DocumentTableColumnSchemaOut(column_key="reference", label="Reference"),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="CERTIFICATE_OF_ANALYSIS",
        label="Certificate of Analysis",
        description="Quality certificate documenting sample identity and analytical results.",
        review_guidance="Check the certificate identity and sample metadata first, then normalize the assay rows into one consistent results table.",
        header_fields=[
            DocumentFieldSchemaOut(field_key="certificate_number", label="Certificate Number", value_type="identifier", required=True),
            DocumentFieldSchemaOut(field_key="sample_date", label="Sample Date", value_type="date"),
            DocumentFieldSchemaOut(field_key="lot_number", label="Lot Number", value_type="identifier"),
            DocumentFieldSchemaOut(field_key="product", label="Product", required=True),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="assay_results",
                label="Assay Results",
                description="Analyte rows with result values and limits.",
                min_occurrences=1,
                columns=[
                    DocumentTableColumnSchemaOut(column_key="parameter", label="Parameter", required=True),
                    DocumentTableColumnSchemaOut(column_key="method", label="Method"),
                    DocumentTableColumnSchemaOut(column_key="value", label="Value", required=True),
                    DocumentTableColumnSchemaOut(column_key="unit", label="Unit"),
                    DocumentTableColumnSchemaOut(column_key="spec_min", label="Spec Min"),
                    DocumentTableColumnSchemaOut(column_key="spec_max", label="Spec Max"),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="SETTLEMENT_STATEMENT",
        label="Settlement Statement",
        description="Statement summarizing settlement calculations or cash balances.",
        review_guidance="Verify the statement identity and account, then capture the balance or settlement line sections into normalized rows.",
        header_fields=[
            DocumentFieldSchemaOut(field_key="statement_number", label="Statement Number", value_type="identifier", required=True),
            DocumentFieldSchemaOut(field_key="statement_date", label="Statement Date", value_type="date", required=True),
            DocumentFieldSchemaOut(field_key="account", label="Account", required=True),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="settlement_lines",
                label="Settlement Lines",
                description="Calculated statement line items or balances.",
                min_occurrences=1,
                columns=[
                    DocumentTableColumnSchemaOut(column_key="description", label="Description", required=True),
                    DocumentTableColumnSchemaOut(column_key="quantity", label="Quantity", value_type="quantity"),
                    DocumentTableColumnSchemaOut(column_key="amount", label="Amount", value_type="currency", required=True),
                    DocumentTableColumnSchemaOut(column_key="currency", label="Currency"),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="WEIGH_TICKET",
        label="Weigh Ticket",
        description="Weight ticket documenting gross, tare, and net measurements.",
        review_guidance="Confirm the ticket identity and capture the weight measurements or line-level movements.",
        header_fields=[
            DocumentFieldSchemaOut(field_key="ticket_number", label="Ticket Number", value_type="identifier", required=True),
            DocumentFieldSchemaOut(field_key="gross_weight", label="Gross Weight", value_type="quantity", required=True),
            DocumentFieldSchemaOut(field_key="net_weight", label="Net Weight", value_type="quantity", required=True),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="weight_measurements",
                label="Weight Measurements",
                description="Structured measurement rows when a single header is not enough.",
                min_occurrences=0,
                columns=[
                    DocumentTableColumnSchemaOut(column_key="measurement", label="Measurement", required=True),
                    DocumentTableColumnSchemaOut(column_key="value", label="Value", required=True),
                    DocumentTableColumnSchemaOut(column_key="unit", label="Unit"),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="OTHER",
        label="Other Document",
        description="Catch-all document for business records that do not fit a supported schema yet.",
        review_guidance="Use custom fields and custom table templates until a dedicated schema is introduced.",
        header_fields=[],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="UNKNOWN",
        label="Unknown",
        description="Unclassified page awaiting human review.",
        review_guidance="Choose a supported document kind or leave the page unknown until more context is available.",
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
