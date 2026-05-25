from __future__ import annotations

from dataclasses import dataclass

from apps.api.app.schemas.document import DocumentExtractionObjectSchemaOut
from apps.api.app.schemas.document import DocumentFacetSchemaOut
from apps.api.app.schemas.document import DocumentFacetValueOut
from apps.api.app.schemas.document import DocumentFieldSchemaOut
from apps.api.app.schemas.document import DocumentKindSchemaOut
from apps.api.app.schemas.document import DocumentRecordTargetOut
from apps.api.app.schemas.document import DocumentSchemaRegistryOut
from apps.api.app.schemas.document import DocumentTableColumnSchemaOut
from apps.api.app.schemas.document import DocumentTableTemplateSchemaOut

from .document_facets import DOCUMENT_FACET_SCHEMAS

DOCUMENT_SCHEMA_REGISTRY_VERSION = "2026-05-24.review-v11"


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


def _facet_value(code: str, label: str, description: str | None = None) -> DocumentFacetValueOut:
    return DocumentFacetValueOut(code=code, label=label, description=description)


def _facet(
    facet_key: str,
    label: str,
    *,
    description: str,
    value_type: str = "single_select",
    repeatable: bool = False,
    required: bool = False,
    allowed_values: tuple[DocumentFacetValueOut, ...] = (),
) -> DocumentFacetSchemaOut:
    return DocumentFacetSchemaOut(
        facet_key=facet_key,
        label=label,
        description=description,
        value_type=value_type,
        repeatable=repeatable,
        required=required,
        allowed_values=list(allowed_values),
    )


def _extraction_object(
    object_key: str,
    label: str,
    *,
    cardinality: str = "one",
    source_object_type: str | None = None,
    canonical_table: str | None = None,
    description: str | None = None,
    field_keys: tuple[str, ...] = (),
    table_template_keys: tuple[str, ...] = (),
    child_object_keys: tuple[str, ...] = (),
) -> DocumentExtractionObjectSchemaOut:
    return DocumentExtractionObjectSchemaOut(
        object_key=object_key,
        label=label,
        cardinality=cardinality,
        source_object_type=source_object_type,
        canonical_table=canonical_table,
        description=description,
        field_keys=list(field_keys),
        table_template_keys=list(table_template_keys),
        child_object_keys=list(child_object_keys),
    )


@dataclass(frozen=True)
class ExtractionSchemaProfile:
    schema_code: str
    deep_extraction_required: bool
    objects: tuple[DocumentExtractionObjectSchemaOut, ...]
    validation_rules: tuple[str, ...] = ()
    review_rules: tuple[str, ...] = ()


ECONOMIC_PURPOSE_VALUES = (
    _facet_value("commodity", "Commodity"),
    _facet_value("freight", "Freight"),
    _facet_value("service", "Service"),
    _facet_value("storage", "Storage"),
    _facet_value("demurrage", "Demurrage"),
    _facet_value("inspection", "Inspection"),
    _facet_value("tax", "Tax"),
    _facet_value("other", "Other"),
)

INVOICE_STAGE_VALUES = (
    _facet_value("provisional", "Provisional"),
    _facet_value("final", "Final"),
    _facet_value("corrected", "Corrected"),
    _facet_value("adjustment", "Adjustment"),
    _facet_value("credit", "Credit"),
    _facet_value("debit", "Debit"),
    _facet_value("proforma", "Proforma"),
)

ACCOUNTING_DIRECTION_VALUES = (
    _facet_value("ap", "AP"),
    _facet_value("ar", "AR"),
    _facet_value("intercompany", "Intercompany"),
    _facet_value("shadow_internal", "Shadow/Internal"),
)

SOURCE_PARTY_ROLE_VALUES = (
    _facet_value("counterparty", "Counterparty"),
    _facet_value("broker", "Broker"),
    _facet_value("carrier", "Carrier"),
    _facet_value("inspector", "Inspector"),
    _facet_value("pipeline", "Pipeline"),
    _facet_value("terminal", "Terminal"),
    _facet_value("internal", "Internal"),
)

TRANSPORT_MODE_VALUES = (
    _facet_value("truck", "Truck"),
    _facet_value("vessel", "Vessel"),
    _facet_value("rail", "Rail"),
    _facet_value("barge", "Barge"),
    _facet_value("pipeline", "Pipeline"),
    _facet_value("multimodal", "Multimodal"),
)

BOL_LEGAL_ROLE_VALUES = (
    _facet_value("title_document", "Title Document"),
    _facet_value("transport_receipt", "Transport Receipt"),
    _facet_value("non_negotiable_copy", "Non-negotiable Copy"),
    _facet_value("sea_waybill", "Sea Waybill"),
)

BOL_CARGO_STATUS_VALUES = (
    _facet_value("clean", "Clean"),
    _facet_value("claused", "Claused"),
    _facet_value("on_board", "On-board"),
    _facet_value("received_for_shipment", "Received for Shipment"),
)

ORIGINAL_COPY_STATUS_VALUES = (
    _facet_value("original", "Original"),
    _facet_value("copy", "Copy"),
    _facet_value("certified_copy", "Certified Copy"),
    _facet_value("unknown", "Unknown"),
)

QUANTITY_BASIS_VALUES = (
    _facet_value("gross_weight", "Gross Weight"),
    _facet_value("net_weight", "Net Weight"),
    _facet_value("loaded_quantity", "Loaded Quantity"),
    _facet_value("delivered_quantity", "Delivered Quantity"),
    _facet_value("metered_quantity", "Metered Quantity"),
    _facet_value("allocated_quantity", "Allocated Quantity"),
)

QUALITY_DOCUMENT_ROLE_VALUES = (
    _facet_value("requirement", "Requirement"),
    _facet_value("evidence", "Evidence"),
    _facet_value("result", "Result"),
    _facet_value("inspection", "Inspection"),
    _facet_value("lab_analysis", "Lab Analysis"),
)

INVOICE_CONTROLLED_FACETS = (
    _facet(
        "economic_purpose",
        "Economic Purpose",
        description="Header-level commercial purpose. Line items may still carry their own charge types.",
        value_type="multi_select",
        repeatable=True,
        allowed_values=ECONOMIC_PURPOSE_VALUES,
    ),
    _facet(
        "invoice_stage",
        "Invoice Stage",
        description="Invoice lifecycle or settlement stage; not a separate document family by itself.",
        allowed_values=INVOICE_STAGE_VALUES,
    ),
    _facet(
        "accounting_direction",
        "Accounting Direction",
        description="Whether the invoice is payable, receivable, intercompany, or internal shadow evidence.",
        allowed_values=ACCOUNTING_DIRECTION_VALUES,
    ),
    _facet(
        "source_party_role",
        "Source Party Role",
        description="Business role of the party that issued or supplied the invoice.",
        allowed_values=SOURCE_PARTY_ROLE_VALUES,
    ),
    _facet(
        "is_disputed",
        "Disputed",
        description="Whether the invoice is currently disputed.",
        value_type="boolean",
    ),
    _facet(
        "line_charge_type",
        "Line Charge Type",
        description="Controlled charge-purpose values for invoice line items.",
        value_type="multi_select",
        repeatable=True,
        allowed_values=ECONOMIC_PURPOSE_VALUES,
    ),
)

BILL_OF_LADING_CONTROLLED_FACETS = (
    _facet(
        "transport_mode",
        "Transport Mode",
        description="Mode used for the movement without forcing truck, vessel, rail, or barge into separate types.",
        allowed_values=TRANSPORT_MODE_VALUES,
    ),
    _facet(
        "legal_role",
        "Legal Role",
        description="Legal or operational role the bill of lading plays in the shipment packet.",
        allowed_values=BOL_LEGAL_ROLE_VALUES,
    ),
    _facet(
        "cargo_status",
        "Cargo Status",
        description="Clean, claused, on-board, or received-for-shipment cargo status when present.",
        value_type="multi_select",
        repeatable=True,
        allowed_values=BOL_CARGO_STATUS_VALUES,
    ),
    _facet(
        "original_copy_status",
        "Original/Copy Status",
        description="Presentation status of the document image or copy.",
        allowed_values=ORIGINAL_COPY_STATUS_VALUES,
    ),
)

LOGISTICS_CONTROLLED_FACETS = (
    _facet(
        "transport_mode",
        "Transport Mode",
        description="Movement mode when the same operational document family can appear across transport modes.",
        allowed_values=TRANSPORT_MODE_VALUES,
    ),
    _facet(
        "quantity_basis",
        "Quantity Basis",
        description="Basis for the measured or stated quantity.",
        allowed_values=QUANTITY_BASIS_VALUES,
    ),
)

QUALITY_CONTROLLED_FACETS = (
    _facet(
        "quality_document_role",
        "Quality Document Role",
        description="Whether the document describes requirements, observed evidence, inspection findings, or lab results.",
        allowed_values=QUALITY_DOCUMENT_ROLE_VALUES,
    ),
)

EXTRACTION_SCHEMA_PROFILES: dict[str, ExtractionSchemaProfile] = {
    "INVOICE": ExtractionSchemaProfile(
        schema_code="INVOICE.v1",
        deep_extraction_required=True,
        objects=(
            _extraction_object(
                "header",
                "Invoice Header",
                canonical_table="invoice_header",
                description="Normalized invoice identity, parties, dates, currency, and totals.",
                field_keys=(
                    "invoice_number",
                    "invoice_date",
                    "due_date",
                    "counterparty",
                    "total_amount",
                    "trade_id",
                    "delivery_id",
                ),
                child_object_keys=("references", "invoice_lines", "tax_lines"),
            ),
            _extraction_object(
                "references",
                "Invoice References",
                cardinality="many",
                source_object_type="reference",
                canonical_table="document_reference",
                description="Trade, contract, shipment, BOL, ticket, purchase-order, and invoice references.",
                field_keys=("reference_type", "raw_reference", "normalized_reference", "linked_entity_type", "linked_entity_id"),
            ),
            _extraction_object(
                "invoice_lines",
                "Invoice Lines",
                cardinality="many",
                source_object_type="table",
                canonical_table="invoice_line",
                description="Line-level charge rows with product, quantity, unit price, charge type, and amount.",
                field_keys=("description", "charge_type", "quantity", "unit_of_measure", "unit_price", "line_amount"),
                table_template_keys=("line_items",),
            ),
            _extraction_object(
                "tax_lines",
                "Tax Lines",
                cardinality="many",
                source_object_type="table",
                canonical_table="invoice_tax_line",
                description="Tax summary rows when tax is broken out separately from charge lines.",
                field_keys=("tax_type", "tax_rate", "tax_amount", "currency"),
            ),
        ),
        validation_rules=(
            "invoice_number_required",
            "currency_required_when_amount_present",
            "total_amount_required",
            "line_amounts_should_sum_to_total_when_lines_present",
        ),
        review_rules=(
            "require_review_if_missing_required_field",
            "require_review_if_total_amount_mismatch",
            "require_review_if_unresolved_party",
            "require_review_if_ambiguous_currency",
        ),
    ),
    "PURCHASE_ORDER": ExtractionSchemaProfile(
        schema_code="PURCHASE_ORDER.v1",
        deep_extraction_required=True,
        objects=(
            _extraction_object(
                "header",
                "Purchase Order Header",
                canonical_table="purchase_order_header",
                description="Purchase order identity, parties, product, quantity, pricing, and delivery context.",
                field_keys=(
                    "purchase_order_number",
                    "order_date",
                    "buyer",
                    "seller",
                    "counterparty",
                    "commodity",
                    "quantity",
                    "unit_price",
                    "delivery_start",
                    "delivery_end",
                    "delivery_location",
                    "vessel_name",
                    "trade_id",
                ),
                child_object_keys=("order_lines", "delivery_terms", "references"),
            ),
            _extraction_object(
                "order_lines",
                "Purchase Order Lines",
                cardinality="many",
                source_object_type="table",
                canonical_table="purchase_order_line",
                description="Ordered product, quantity, unit, price, and delivery-line rows.",
                field_keys=("description", "commodity", "quantity", "unit_of_measure", "unit_price", "line_amount", "delivery_location"),
                table_template_keys=("order_lines",),
            ),
            _extraction_object(
                "delivery_terms",
                "Purchase Order Delivery Terms",
                cardinality="many",
                canonical_table="delivery_term",
                description="Delivery window, location, vessel, transport mode, and incoterm terms.",
                field_keys=("delivery_start", "delivery_end", "delivery_location", "vessel_name", "transport_mode", "incoterm"),
            ),
            _extraction_object(
                "references",
                "Purchase Order References",
                cardinality="many",
                source_object_type="reference",
                canonical_table="document_reference",
                description="Trade, contract, shipment, delivery, and external order references.",
                field_keys=("reference_type", "raw_reference", "normalized_reference", "linked_entity_type", "linked_entity_id"),
            ),
        ),
        validation_rules=("purchase_order_number_required", "commodity_or_order_line_required", "quantity_requires_unit_when_present"),
        review_rules=("require_review_if_purchase_order_number_missing", "require_review_if_trade_match_ambiguous"),
    ),
    "SALES_ORDER": ExtractionSchemaProfile(
        schema_code="SALES_ORDER.v1",
        deep_extraction_required=True,
        objects=(
            _extraction_object(
                "header",
                "Sales Order Header",
                canonical_table="sales_order_header",
                description="Sales order identity, parties, product, quantity, pricing, and delivery context.",
                field_keys=(
                    "sales_order_number",
                    "order_date",
                    "buyer",
                    "seller",
                    "counterparty",
                    "commodity",
                    "quantity",
                    "unit_price",
                    "delivery_start",
                    "delivery_end",
                    "delivery_location",
                    "vessel_name",
                    "trade_id",
                ),
                child_object_keys=("order_lines", "delivery_terms", "references"),
            ),
            _extraction_object(
                "order_lines",
                "Sales Order Lines",
                cardinality="many",
                source_object_type="table",
                canonical_table="sales_order_line",
                description="Ordered product, quantity, unit, price, and delivery-line rows.",
                field_keys=("description", "commodity", "quantity", "unit_of_measure", "unit_price", "line_amount", "delivery_location"),
                table_template_keys=("order_lines",),
            ),
            _extraction_object(
                "delivery_terms",
                "Sales Order Delivery Terms",
                cardinality="many",
                canonical_table="delivery_term",
                description="Delivery window, location, vessel, transport mode, and incoterm terms.",
                field_keys=("delivery_start", "delivery_end", "delivery_location", "vessel_name", "transport_mode", "incoterm"),
            ),
            _extraction_object(
                "references",
                "Sales Order References",
                cardinality="many",
                source_object_type="reference",
                canonical_table="document_reference",
                description="Trade, contract, shipment, delivery, and external order references.",
                field_keys=("reference_type", "raw_reference", "normalized_reference", "linked_entity_type", "linked_entity_id"),
            ),
        ),
        validation_rules=("sales_order_number_required", "commodity_or_order_line_required", "quantity_requires_unit_when_present"),
        review_rules=("require_review_if_sales_order_number_missing", "require_review_if_trade_match_ambiguous"),
    ),
    "BILL_OF_LADING": ExtractionSchemaProfile(
        schema_code="BOL.v1",
        deep_extraction_required=True,
        objects=(
            _extraction_object(
                "header",
                "BOL Header",
                canonical_table="bol_header",
                description="Shipment identity, issue date, transport mode, carrier, route, and presentation status.",
                field_keys=("bill_of_lading_number", "load_date", "carrier", "origin", "destination", "trade_id", "delivery_id"),
                child_object_keys=("parties", "cargo_lines", "transport_legs", "references"),
            ),
            _extraction_object(
                "parties",
                "BOL Parties",
                cardinality="many",
                source_object_type="party",
                canonical_table="bol_party",
                description="Carrier, shipper, consignee, notify party, terminal, or other named roles.",
                field_keys=("party_role", "raw_party_name", "party_id", "match_confidence"),
            ),
            _extraction_object(
                "cargo_lines",
                "Cargo Lines",
                cardinality="many",
                source_object_type="table",
                canonical_table="bol_cargo",
                description="Product, package, quantity, temperature, density, hazardous indicator, and cargo reference rows.",
                field_keys=("description", "product", "gross_quantity", "net_quantity", "unit_of_measure", "reference"),
                table_template_keys=("shipment_lines",),
            ),
            _extraction_object(
                "transport_legs",
                "Transport Legs",
                cardinality="many",
                source_object_type="table",
                canonical_table="bol_transport_leg",
                description="Mode, origin, destination, equipment, departure, and arrival details by movement leg.",
                field_keys=("transport_mode", "origin", "destination", "equipment_id", "departure_date", "arrival_date"),
            ),
            _extraction_object(
                "references",
                "BOL References",
                cardinality="many",
                source_object_type="reference",
                canonical_table="document_reference",
                description="Shipment, trade, contract, booking, equipment, and container references.",
                field_keys=("reference_type", "raw_reference", "normalized_reference", "linked_entity_type", "linked_entity_id"),
            ),
        ),
        validation_rules=(
            "bol_number_required",
            "carrier_required",
            "origin_destination_required",
            "quantity_requires_unit_when_present",
        ),
        review_rules=(
            "require_review_if_missing_bol_number",
            "require_review_if_transport_mode_unknown",
            "require_review_if_product_missing",
        ),
    ),
    "PACKING_LIST": ExtractionSchemaProfile(
        schema_code="PACKING_LIST.v1",
        deep_extraction_required=True,
        objects=(
            _extraction_object(
                "header",
                "Packing List Header",
                canonical_table="packing_list_header",
                description="Shipment packing identity, dates, parties, carrier or haulier, and delivery references.",
                field_keys=(
                    "packing_list_number",
                    "delivery_order_number",
                    "packing_date",
                    "loading_date",
                    "delivery_date",
                    "customer_reference",
                    "carrier",
                    "shipper",
                    "consignee",
                    "trade_id",
                    "delivery_id",
                ),
                child_object_keys=("packing_lines", "references"),
            ),
            _extraction_object(
                "packing_lines",
                "Packing Lines",
                cardinality="many",
                source_object_type="table",
                canonical_table="packing_list_line",
                description="Packed product, package count, quantity, and gross, net, and tare weight rows.",
                field_keys=("description", "product", "package_count", "quantity", "gross_weight", "net_weight", "tare_weight"),
                table_template_keys=("packing_lines",),
            ),
            _extraction_object(
                "references",
                "Packing List References",
                cardinality="many",
                source_object_type="reference",
                canonical_table="document_reference",
                description="Trade, delivery, customer, carrier, shipment, order, and packing references.",
                field_keys=("reference_type", "raw_reference", "normalized_reference", "linked_entity_type", "linked_entity_id"),
            ),
        ),
        validation_rules=("delivery_order_or_packing_list_number_required", "packed_goods_required", "quantity_requires_unit_when_present"),
        review_rules=("require_review_if_no_delivery_reference", "require_review_if_packed_goods_missing"),
    ),
    "CERTIFICATE_OF_ANALYSIS": ExtractionSchemaProfile(
        schema_code="QUALITY.COA.v1",
        deep_extraction_required=True,
        objects=(
            _extraction_object(
                "header",
                "Quality Document Header",
                canonical_table="quality_document_header",
                description="Certificate identity, lab or issuer, product, sample metadata, and analysis dates.",
                field_keys=("certificate_number", "sample_id", "sample_date", "product", "lot_number", "trade_id", "delivery_id"),
                child_object_keys=("samples", "test_results", "references"),
            ),
            _extraction_object(
                "samples",
                "Quality Samples",
                cardinality="many",
                canonical_table="quality_sample",
                description="Sample, lot, batch, location, and product records referenced by the analysis.",
                field_keys=("sample_id", "lot_number", "batch_id", "sample_location", "product"),
            ),
            _extraction_object(
                "test_results",
                "Quality Test Results",
                cardinality="many",
                source_object_type="table",
                canonical_table="quality_test_result",
                description="Analyte, method, result, unit, specification limit, and pass/fail rows.",
                field_keys=("parameter", "method", "value", "unit", "spec_min", "spec_max", "pass_fail"),
                table_template_keys=("assay_results",),
            ),
            _extraction_object(
                "references",
                "Quality References",
                cardinality="many",
                source_object_type="reference",
                canonical_table="document_reference",
                description="Shipment, BOL, contract, batch, trade, delivery, and lot references.",
                field_keys=("reference_type", "raw_reference", "normalized_reference", "linked_entity_type", "linked_entity_id"),
            ),
        ),
        validation_rules=(
            "certificate_number_required",
            "at_least_one_test_result_required",
            "test_result_requires_analyte_and_unit",
            "pass_fail_should_match_spec_limits_when_present",
        ),
        review_rules=(
            "require_review_if_no_test_results",
            "require_review_if_sample_unresolved",
            "require_review_if_units_incompatible_with_analyte",
        ),
    ),
    "TRUCK_TICKET": ExtractionSchemaProfile(
        schema_code="TICKET.TRUCK.v1",
        deep_extraction_required=True,
        objects=(
            _extraction_object(
                "header",
                "Truck Ticket Header",
                canonical_table="ticket_header",
                description="Ticket identity, carrier, asset, route, product, and movement date.",
                field_keys=("ticket_number", "load_date", "carrier", "carrier_reference", "asset_reference", "origin", "destination", "trade_id", "delivery_id"),
                child_object_keys=("measurements", "movement_events", "references"),
            ),
            _extraction_object(
                "measurements",
                "Ticket Measurements",
                cardinality="many",
                canonical_table="ticket_measurement",
                description="Gross, tare, net, quantity, temperature, density, and unit measurement values.",
                field_keys=("measurement_type", "value", "unit", "temperature", "density"),
            ),
            _extraction_object(
                "movement_events",
                "Ticket Movement Events",
                cardinality="many",
                canonical_table="ticket_movement_event",
                description="Load, unload, arrival, departure, and related timestamp evidence.",
                field_keys=("event_type", "occurred_at", "location", "source_text"),
            ),
            _extraction_object(
                "references",
                "Ticket References",
                cardinality="many",
                source_object_type="reference",
                canonical_table="document_reference",
                description="BOL, delivery, shipment, contract, trade, and carrier references.",
                field_keys=("reference_type", "raw_reference", "normalized_reference", "linked_entity_type", "linked_entity_id"),
            ),
        ),
        validation_rules=("ticket_number_required", "quantity_requires_unit_when_present", "route_or_delivery_reference_required"),
        review_rules=("require_review_if_ticket_number_missing", "require_review_if_delivery_reference_unresolved"),
    ),
    "WEIGH_TICKET": ExtractionSchemaProfile(
        schema_code="TICKET.WEIGH.v1",
        deep_extraction_required=True,
        objects=(
            _extraction_object(
                "header",
                "Weigh Ticket Header",
                canonical_table="ticket_header",
                description="Ticket identity, weigh date, delivery references, and measured movement context.",
                field_keys=("ticket_number", "load_date", "trade_id", "delivery_id"),
                child_object_keys=("measurements", "references"),
            ),
            _extraction_object(
                "measurements",
                "Weight Measurements",
                cardinality="many",
                source_object_type="table",
                canonical_table="ticket_measurement",
                description="Gross, tare, net, and unit measurements.",
                field_keys=("measurement", "value", "unit", "gross_weight", "net_weight"),
                table_template_keys=("weight_measurements",),
            ),
            _extraction_object(
                "references",
                "Ticket References",
                cardinality="many",
                source_object_type="reference",
                canonical_table="document_reference",
                description="BOL, delivery, shipment, contract, and trade references.",
                field_keys=("reference_type", "raw_reference", "normalized_reference", "linked_entity_type", "linked_entity_id"),
            ),
        ),
        validation_rules=("ticket_number_required", "gross_and_net_weights_should_have_units", "net_weight_should_not_exceed_gross_weight"),
        review_rules=("require_review_if_weight_unit_missing", "require_review_if_net_weight_exceeds_gross_weight"),
    ),
    "SETTLEMENT_STATEMENT": ExtractionSchemaProfile(
        schema_code="SETTLEMENT.STATEMENT.v1",
        deep_extraction_required=True,
        objects=(
            _extraction_object(
                "header",
                "Settlement Header",
                canonical_table="settlement_header",
                description="Statement identity, account, period, currency, and total settlement amount.",
                field_keys=("statement_number", "statement_date", "account", "period_start", "period_end", "currency"),
                child_object_keys=("settlement_lines", "adjustments", "references"),
            ),
            _extraction_object(
                "settlement_lines",
                "Settlement Lines",
                cardinality="many",
                source_object_type="table",
                canonical_table="settlement_line",
                description="Trade, product, quantity, price, amount, and calculated settlement rows.",
                field_keys=("description", "quantity", "amount", "currency", "trade_reference", "contract_reference", "product"),
                table_template_keys=("settlement_lines",),
            ),
            _extraction_object(
                "adjustments",
                "Settlement Adjustments",
                cardinality="many",
                source_object_type="table",
                canonical_table="settlement_adjustment",
                description="Fees, taxes, deductions, and adjustment rows.",
                field_keys=("adjustment_type", "description", "amount", "currency"),
            ),
            _extraction_object(
                "references",
                "Settlement References",
                cardinality="many",
                source_object_type="reference",
                canonical_table="document_reference",
                description="Invoice, trade, contract, shipment, account, and payment references.",
                field_keys=("reference_type", "raw_reference", "normalized_reference", "linked_entity_type", "linked_entity_id"),
            ),
        ),
        validation_rules=("statement_number_required", "settlement_period_required", "settlement_lines_should_sum_to_total_when_total_present"),
        review_rules=("require_review_if_statement_total_mismatch", "require_review_if_counterparty_unresolved"),
    ),
    "TRADE_CONFIRMATION": ExtractionSchemaProfile(
        schema_code="TRADE.CONFIRMATION.v1",
        deep_extraction_required=True,
        objects=(
            _extraction_object(
                "header",
                "Confirmation Header",
                canonical_table="trade_confirmation_header",
                description="Confirmation identity, trade date, buyer, seller, broker, commodity, and direction.",
                field_keys=("confirmation_number", "trade_id", "external_trade_id", "trade_date", "counterparty"),
                child_object_keys=("trade_terms", "pricing_terms", "delivery_terms", "payment_terms", "references"),
            ),
            _extraction_object(
                "trade_terms",
                "Trade Terms",
                cardinality="many",
                source_object_type="table",
                canonical_table="trade_term",
                description="Commercial term name/value rows and normalized trade economics.",
                field_keys=("term_name", "term_value", "quantity", "quantity_uom", "commodity"),
                table_template_keys=("economic_terms",),
            ),
            _extraction_object(
                "pricing_terms",
                "Pricing Terms",
                cardinality="many",
                canonical_table="pricing_term",
                description="Price, formula, currency, index, pricing period, and differential terms.",
                field_keys=("price", "price_formula", "currency", "price_index", "pricing_period"),
            ),
            _extraction_object(
                "delivery_terms",
                "Delivery Terms",
                cardinality="many",
                canonical_table="delivery_term",
                description="Location, delivery period, transport, tolerance, and incoterm terms.",
                field_keys=("delivery_location", "delivery_start", "delivery_end", "transport_mode", "incoterm", "tolerance"),
            ),
            _extraction_object(
                "payment_terms",
                "Payment Terms",
                cardinality="many",
                canonical_table="payment_term",
                description="Payment timing, due-date basis, currency, and settlement terms.",
                field_keys=("payment_terms", "currency", "due_date_basis"),
            ),
            _extraction_object(
                "references",
                "Confirmation References",
                cardinality="many",
                source_object_type="reference",
                canonical_table="document_reference",
                description="Trade, broker, contract, and external confirmation references.",
                field_keys=("reference_type", "raw_reference", "normalized_reference", "linked_entity_type", "linked_entity_id"),
            ),
        ),
        validation_rules=("confirmation_number_required", "trade_date_required", "trade_reference_or_counterparty_required"),
        review_rules=("require_review_if_trade_match_ambiguous", "require_review_if_economic_terms_missing"),
    ),
}


DOCUMENT_KIND_SCHEMAS: tuple[DocumentKindSchemaOut, ...] = (
    DocumentKindSchemaOut(
        document_kind="TRADE_COMMUNICATION",
        label="Trade Communication",
        document_family="TRADE_EXECUTION",
        description="Email, message thread, or other correspondence capturing trade negotiation context.",
        review_guidance="Confirm whether the communication is supporting context rather than a firm deal recap, then capture the trade identifiers, sender, and counterparties.",
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
        document_kind="DEAL_RECAP",
        label="Deal Recap",
        document_family="TRADE_EXECUTION",
        description="Desk or counterparty recap summarizing agreed deal economics before formal confirmation.",
        review_guidance="Confirm the recap reflects a firm deal, then capture economic terms, parties, and delivery window before linking it.",
        linkage_summary="Links primarily to trade records using trade IDs, external references, counterparties, commodity, quantity, price, and recap date.",
        record_targets=[
            _target("TRADE", "Trade", "Match using trade ID, external trade ID, counterparty, and recap economics."),
            _target(
                "TRADE_WORKFLOW_ITEM",
                "Trade Workflow Item",
                "Use the recap to support confirmation or booking follow-up when no final trade record exists yet.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["trade_id", "external_trade_id", "counterparty", "recap_date"],
        header_fields=[
            _field("recap_number", "Recap Number", value_type="identifier"),
            _field("recap_date", "Recap Date", value_type="date", required=True),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("external_trade_id", "External Trade ID", value_type="identifier"),
            _field("counterparty", "Counterparty", required=True),
            _field("trader", "Trader"),
            _field("commodity", "Commodity", required=True),
            _field("quantity", "Quantity", value_type="quantity"),
            _field("price", "Price"),
            _field("delivery_start", "Delivery Start", value_type="date"),
            _field("delivery_end", "Delivery End", value_type="date"),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="commercial_terms",
                label="Commercial Terms",
                description="Recap terms captured as term/value rows.",
                min_occurrences=0,
                columns=[
                    _column("term_name", "Term Name", required=True),
                    _column("term_value", "Term Value", required=True),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="PURCHASE_ORDER",
        label="Purchase Order",
        document_family="TRADE_EXECUTION",
        description="Purchase order or PO document requesting or authorizing a commodity purchase before downstream fulfillment and settlement.",
        review_guidance="Confirm the PO number, buyer, seller, product, quantity, and delivery context before matching it to a trade or delivery workflow.",
        linkage_summary="Links primarily to trade records using PO number, trade ID, buyer/seller, product, quantity, delivery window, and vessel or delivery location.",
        record_targets=[
            _target(
                "TRADE",
                "Trade",
                "Match using trade ID when present, otherwise PO number plus parties, product, quantity, and delivery terms.",
                create_if_missing=True,
            ),
            _target(
                "DELIVERY",
                "Delivery",
                "Use vessel, delivery location, delivery window, and product when the PO already maps to a physical movement.",
                role="SECONDARY",
            ),
            _target(
                "TRADE_WORKFLOW_ITEM",
                "Trade Workflow Item",
                "Use the PO to support booking or confirmation follow-up when no final trade record exists yet.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["purchase_order_number", "trade_id", "buyer", "seller", "counterparty", "commodity"],
        header_fields=[
            _field("purchase_order_number", "Purchase Order Number", value_type="identifier", required=True),
            _field("order_date", "Order Date", value_type="date"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("buyer", "Buyer"),
            _field("seller", "Seller"),
            _field("counterparty", "Counterparty"),
            _field("commodity", "Commodity", required=True),
            _field("quantity", "Quantity", value_type="quantity"),
            _field("unit_price", "Unit Price", value_type="currency"),
            _field("delivery_start", "Delivery Start", value_type="date"),
            _field("delivery_end", "Delivery End", value_type="date"),
            _field("delivery_location", "Delivery Location"),
            _field("vessel_name", "Vessel Name"),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="order_lines",
                label="Order Lines",
                description="Purchase order product, quantity, price, and delivery rows.",
                min_occurrences=0,
                columns=[
                    _column("description", "Description", required=True),
                    _column("commodity", "Commodity"),
                    _column("quantity", "Quantity", value_type="quantity", required=True),
                    _column("unit_of_measure", "Unit"),
                    _column("unit_price", "Unit Price", value_type="currency"),
                    _column("line_amount", "Line Amount", value_type="currency"),
                    _column("delivery_location", "Delivery Location"),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="SALES_ORDER",
        label="Sales Order",
        document_family="TRADE_EXECUTION",
        description="Sales order or SO document confirming a commodity sale before downstream fulfillment and settlement.",
        review_guidance="Confirm the sales order number, customer or buyer, seller, product, quantity, and delivery context before matching it to a trade or delivery workflow.",
        linkage_summary="Links primarily to trade records using sales order number, trade ID, buyer/seller, product, quantity, delivery window, and vessel or delivery location.",
        record_targets=[
            _target(
                "TRADE",
                "Trade",
                "Match using trade ID when present, otherwise sales order number plus parties, product, quantity, and delivery terms.",
                create_if_missing=True,
            ),
            _target(
                "DELIVERY",
                "Delivery",
                "Use vessel, delivery location, delivery window, and product when the sales order already maps to a physical movement.",
                role="SECONDARY",
            ),
            _target(
                "TRADE_WORKFLOW_ITEM",
                "Trade Workflow Item",
                "Use the sales order to support booking or confirmation follow-up when no final trade record exists yet.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["sales_order_number", "trade_id", "buyer", "seller", "counterparty", "commodity"],
        header_fields=[
            _field("sales_order_number", "Sales Order Number", value_type="identifier", required=True),
            _field("order_date", "Order Date", value_type="date"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("buyer", "Buyer"),
            _field("seller", "Seller"),
            _field("counterparty", "Counterparty"),
            _field("commodity", "Commodity", required=True),
            _field("quantity", "Quantity", value_type="quantity"),
            _field("unit_price", "Unit Price", value_type="currency"),
            _field("delivery_start", "Delivery Start", value_type="date"),
            _field("delivery_end", "Delivery End", value_type="date"),
            _field("delivery_location", "Delivery Location"),
            _field("vessel_name", "Vessel Name"),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="order_lines",
                label="Order Lines",
                description="Sales order product, quantity, price, and delivery rows.",
                min_occurrences=0,
                columns=[
                    _column("description", "Description", required=True),
                    _column("commodity", "Commodity"),
                    _column("quantity", "Quantity", value_type="quantity", required=True),
                    _column("unit_of_measure", "Unit"),
                    _column("unit_price", "Unit Price", value_type="currency"),
                    _column("line_amount", "Line Amount", value_type="currency"),
                    _column("delivery_location", "Delivery Location"),
                ],
            )
        ],
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
        document_kind="PRICE_PUBLICATION",
        label="Price Publication Report",
        document_family="MARKET_DATA",
        description="Published commodity price assessment, bulletin, or index sheet used to support price-index observations.",
        review_guidance="Verify the publisher, publication date, price index code, commodity, location, units, currency, and published price before linking it to market data.",
        linkage_summary="Links primarily to price-index observations and price-index reference records using price index code, observation date, publisher, source series, commodity, and location.",
        record_targets=[
            _target(
                "PRICE_INDEX_OBSERVATION",
                "Price Observation",
                "Match using price index code, observation date, source provider, source series ID, and published date.",
            ),
            _target(
                "PRICE_INDEX",
                "Price Index",
                "Use the price index code, publisher, commodity, market, and location when an exact observation is not loaded yet.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["price_index_code", "observation_date", "source_provider", "source_series_id", "commodity", "location"],
        header_fields=[
            _field("publication_reference", "Publication Reference", value_type="identifier"),
            _field("publication_date", "Publication Date", value_type="date", required=True),
            _field("observation_date", "Observation Date", value_type="date"),
            _field("price_index_code", "Price Index Code", value_type="identifier", required=True),
            _field("source_provider", "Source Provider", required=True),
            _field("source_series_id", "Source Series ID", value_type="identifier"),
            _field("commodity", "Commodity", required=True),
            _field("market", "Market"),
            _field("location", "Location"),
            _field("price", "Price", value_type="currency", required=True),
            _field("currency", "Currency", value_type="identifier"),
            _field("unit", "Unit", value_type="identifier"),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="price_lines",
                label="Price Lines",
                description="Published price assessment rows keyed by index, commodity, location, date, currency, and unit.",
                min_occurrences=0,
                columns=[
                    _column("price_index_code", "Price Index Code", required=True),
                    _column("commodity", "Commodity", required=True),
                    _column("location", "Location"),
                    _column("observation_date", "Observation Date", value_type="date"),
                    _column("price", "Price", value_type="currency", required=True),
                    _column("currency", "Currency"),
                    _column("unit", "Unit"),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="LETTER_OF_CREDIT",
        label="Letter of Credit",
        document_family="SETTLEMENT",
        description="Bank-issued credit instrument supporting payment or shipment obligations for a commodity transaction.",
        review_guidance="Verify the issuing bank, applicant, beneficiary, expiry date, and amount before linking it to the trade or settlement workflow.",
        linkage_summary="Links primarily to trade and settlement records using letter of credit numbers, trade IDs, counterparties, banks, and expiry dates.",
        record_targets=[
            _target("TRADE", "Trade", "Match using trade ID, applicant, beneficiary, and counterparty."),
            _target(
                "SETTLEMENT_ACCOUNT",
                "Settlement Account",
                "Use bank and credit instrument details when the trade linkage is incomplete.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["letter_of_credit_number", "trade_id", "applicant", "beneficiary", "issuing_bank"],
        header_fields=[
            _field("letter_of_credit_number", "Letter of Credit Number", value_type="identifier", required=True),
            _field("issue_date", "Issue Date", value_type="date"),
            _field("expiry_date", "Expiry Date", value_type="date", required=True),
            _field("issuing_bank", "Issuing Bank", required=True),
            _field("applicant", "Applicant", required=True),
            _field("beneficiary", "Beneficiary", required=True),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("amount", "Amount", value_type="currency", required=True),
            _field("currency", "Currency", value_type="identifier"),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="NOMINATION",
        label="Nomination",
        document_family="NETWORK_FLOW",
        description="Pipeline, terminal, or transport nomination requesting scheduled commodity movement.",
        review_guidance="Confirm the nomination reference, flow date, system, locations, and quantity before matching it to delivery obligations.",
        linkage_summary="Links primarily to delivery and trade records using nomination references, trade IDs, contract numbers, locations, and gas or flow dates.",
        record_targets=[
            _target("DELIVERY", "Delivery", "Match using nomination reference, delivery ID, locations, and flow date."),
            _target(
                "TRADE",
                "Trade",
                "Use trade ID or contract number when the delivery linkage is incomplete.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["nomination_reference", "trade_id", "delivery_id", "contract_number"],
        header_fields=[
            _field("nomination_reference", "Nomination Reference", value_type="identifier", required=True),
            _field("nomination_date", "Nomination Date", value_type="date"),
            _field("flow_date", "Flow Date", value_type="date", required=True),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("pipeline_system", "Pipeline System"),
            _field("contract_number", "Contract Number", value_type="identifier"),
            _field("receipt_location_code", "Receipt Location", value_type="identifier"),
            _field("delivery_location_code", "Delivery Location", value_type="identifier"),
            _field("quantity", "Quantity", value_type="quantity"),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="flow_lines",
                label="Flow Lines",
                description="Scheduled receipt or delivery flow rows.",
                min_occurrences=0,
                columns=[
                    _column("location", "Location", required=True),
                    _column("quantity", "Quantity", value_type="quantity", required=True),
                    _column("unit", "Unit"),
                    _column("flow_date", "Flow Date", value_type="date"),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="CURTAILMENT_NOTICE",
        label="Curtailment Notice",
        document_family="NETWORK_FLOW",
        description="Operational notice reducing scheduled or available commodity flow because of capacity, reliability, or system constraints.",
        review_guidance="Confirm the curtailment notice identity, effective window, issuing entity, affected system, and curtailed quantity before routing it to operations.",
        linkage_summary="Links primarily to delivery and trade records using curtailment notice numbers, nomination references, delivery IDs, trade IDs, systems, and locations.",
        record_targets=[
            _target("DELIVERY", "Delivery", "Match using delivery ID, nomination reference, system, location, and effective window."),
            _target(
                "TRADE",
                "Trade",
                "Use trade ID or contract reference when the delivery linkage is incomplete.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["curtailment_notice_number", "trade_id", "delivery_id", "nomination_reference", "pipeline_system"],
        header_fields=[
            _field("curtailment_notice_number", "Curtailment Notice Number", value_type="identifier", required=True),
            _field("notice_date", "Notice Date", value_type="date", required=True),
            _field("effective_start", "Effective Start", value_type="date", required=True),
            _field("effective_end", "Effective End", value_type="date"),
            _field("issuing_entity", "Issuing Entity", required=True),
            _field("pipeline_system", "Pipeline System"),
            _field("facility", "Facility"),
            _field("location", "Location"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("nomination_reference", "Nomination Reference", value_type="identifier"),
            _field("curtailed_quantity", "Curtailed Quantity", value_type="quantity"),
            _field("reason", "Reason"),
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
        document_kind="RAILCAR_TICKET",
        label="Railcar Ticket",
        document_family="LOGISTICS",
        description="Rail movement record documenting waybill, railcar, route, and loaded or delivered quantities.",
        review_guidance="Confirm the waybill or railcar identity, carrier, route, and movement date before reviewing quantity details.",
        linkage_summary="Links primarily to delivery and trade records using waybill numbers, railcar numbers, delivery IDs, trade IDs, and carrier references.",
        record_targets=[
            _target("DELIVERY", "Delivery", "Match using delivery ID, waybill number, railcar number, and route details."),
            _target(
                "TRADE",
                "Trade",
                "Use trade ID as secondary context for the rail movement record.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["waybill_number", "railcar_number", "trade_id", "delivery_id", "carrier_reference"],
        header_fields=[
            _field("waybill_number", "Waybill Number", value_type="identifier", required=True),
            _field("railcar_number", "Railcar Number", value_type="identifier", required=True),
            _field("load_date", "Load Date", value_type="date"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("carrier", "Carrier"),
            _field("carrier_reference", "Carrier Reference", value_type="identifier"),
            _field("origin", "Origin"),
            _field("destination", "Destination"),
            _field("net_quantity", "Net Quantity", value_type="quantity"),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="DISPATCH_NOTICE",
        label="Dispatch Notice",
        document_family="LOGISTICS",
        description="Operational dispatch instruction for a truck, rail, vessel, terminal, pipeline, or power delivery movement.",
        review_guidance="Confirm the dispatch number, dispatch window, asset or carrier, route, and quantity before matching it to the delivery workflow.",
        linkage_summary="Links primarily to delivery and trade records using dispatch numbers, delivery IDs, trade IDs, carrier references, asset references, routes, and dates.",
        record_targets=[
            _target("DELIVERY", "Delivery", "Match using delivery ID, dispatch number, route, carrier, asset reference, and dispatch window."),
            _target(
                "TRADE",
                "Trade",
                "Use trade ID as secondary context for the dispatched movement.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["dispatch_number", "trade_id", "delivery_id", "carrier_reference", "asset_reference"],
        header_fields=[
            _field("dispatch_number", "Dispatch Number", value_type="identifier", required=True),
            _field("dispatch_date", "Dispatch Date", value_type="date", required=True),
            _field("dispatch_start", "Dispatch Start", value_type="date"),
            _field("dispatch_end", "Dispatch End", value_type="date"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("carrier", "Carrier"),
            _field("carrier_reference", "Carrier Reference", value_type="identifier"),
            _field("asset_reference", "Asset Reference", value_type="identifier"),
            _field("origin", "Origin"),
            _field("destination", "Destination"),
            _field("quantity", "Quantity", value_type="quantity"),
            _field("instructions", "Instructions"),
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
        document_kind="PACKING_LIST",
        label="Packing List",
        document_family="LOGISTICS",
        description="Shipment packing list or packing slip identifying packed goods, package counts, weights, and delivery references.",
        review_guidance="Confirm the delivery order or packing list reference, packed goods, package details, weights, shipper, consignee, and carrier before linking it to a delivery.",
        linkage_summary="Links primarily to delivery and trade records using delivery order number, packing list number, customer reference, dates, carrier, parties, product, and weights.",
        record_targets=[
            _target(
                "DELIVERY",
                "Delivery",
                "Match using delivery ID when present, otherwise delivery order number, customer reference, dates, carrier, parties, product, and packed quantities.",
            ),
            _target(
                "TRADE",
                "Trade",
                "Use trade ID or commercial party and product context as secondary evidence for the movement.",
                role="SECONDARY",
            ),
        ],
        matching_keys=[
            "delivery_order_number",
            "packing_list_number",
            "delivery_id",
            "trade_id",
            "customer_reference",
            "loading_date",
            "delivery_date",
            "carrier",
            "shipper",
            "consignee",
            "product",
        ],
        header_fields=[
            _field("packing_list_number", "Packing List Number", value_type="identifier"),
            _field("delivery_order_number", "Delivery Order Number", value_type="identifier", required=True),
            _field("packing_date", "Packing List Date", value_type="date"),
            _field("loading_date", "Loading Date", value_type="date"),
            _field("delivery_date", "Delivery Date", value_type="date"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("customer_reference", "Customer Reference", value_type="identifier"),
            _field("carrier", "Carrier"),
            _field("shipper", "Shipper"),
            _field("consignee", "Consignee"),
            _field("product", "Product"),
            _field("gross_weight", "Gross Weight", value_type="quantity"),
            _field("net_weight", "Net Weight", value_type="quantity"),
            _field("tare_weight", "Tare Weight", value_type="quantity"),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="packing_lines",
                label="Packing Lines",
                description="Packed goods, packages, and gross, net, or tare weight rows.",
                min_occurrences=0,
                columns=[
                    _column("quantity_and_description_of_goods", "Quantity and Description of Goods", required=True),
                    _column("package", "Package"),
                    _column("gross_wt", "Gross Weight", value_type="quantity"),
                    _column("net_wt", "Net Weight", value_type="quantity"),
                    _column("tare_wt", "Tare Weight", value_type="quantity"),
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
        document_kind="NOTICE_OF_READINESS",
        label="Notice of Readiness",
        document_family="LOGISTICS",
        description="Vessel or terminal notice that cargo or transport equipment is ready for loading or discharge.",
        review_guidance="Confirm the notice time, vessel or terminal details, ports, and delivery references before using it for operational readiness.",
        linkage_summary="Links primarily to delivery and trade records using notice numbers, vessel names, voyage numbers, ports, delivery IDs, and trade IDs.",
        record_targets=[
            _target("DELIVERY", "Delivery", "Match using delivery ID, vessel or voyage details, ports, and notice time."),
            _target(
                "TRADE",
                "Trade",
                "Use trade ID or bill of lading reference as secondary context.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["notice_number", "delivery_id", "trade_id", "vessel_name", "voyage_number"],
        header_fields=[
            _field("notice_number", "Notice Number", value_type="identifier"),
            _field("notice_date", "Notice Date", value_type="date", required=True),
            _field("notice_time", "Notice Time"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("vessel_name", "Vessel Name", required=True),
            _field("voyage_number", "Voyage Number", value_type="identifier"),
            _field("load_port", "Load Port"),
            _field("discharge_port", "Discharge Port"),
            _field("eta", "ETA", value_type="date"),
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
        document_kind="CERTIFICATE_OF_ORIGIN",
        label="Certificate of Origin",
        document_family="COMPLIANCE",
        description="Origin certificate documenting source country, shipper, consignee, and cargo details.",
        review_guidance="Confirm the certificate identity, origin country, product, and shipping references before using it as compliance support.",
        linkage_summary="Links primarily to delivery, trade, and compliance records using certificate numbers, bill of lading numbers, origin country, trade IDs, and delivery IDs.",
        record_targets=[
            _target("COMPLIANCE_RECORD", "Compliance Record", "Match using certificate number, origin country, and cargo references."),
            _target(
                "DELIVERY",
                "Delivery",
                "Use bill of lading, delivery, or trade references to attach the certificate to a movement.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["certificate_number", "bill_of_lading_number", "trade_id", "delivery_id", "origin_country"],
        header_fields=[
            _field("certificate_number", "Certificate Number", value_type="identifier", required=True),
            _field("issue_date", "Issue Date", value_type="date"),
            _field("origin_country", "Origin Country", required=True),
            _field("product", "Product", required=True),
            _field("shipper", "Shipper"),
            _field("consignee", "Consignee"),
            _field("bill_of_lading_number", "Bill of Lading Number", value_type="identifier"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="INSPECTION_REPORT",
        label="Inspection Report",
        document_family="QUALITY",
        description="Inspection company report covering cargo, vessel, terminal, or quality observations.",
        review_guidance="Verify the report number, inspector, location, product, and movement references before accepting inspection findings.",
        linkage_summary="Links primarily to quality, delivery, and trade records using report numbers, inspection dates, delivery IDs, trade IDs, vessel names, and product details.",
        record_targets=[
            _target("QUALITY_RECORD", "Quality Record", "Match using report number, inspection date, product, or movement reference."),
            _target(
                "DELIVERY",
                "Delivery",
                "Use delivery, bill of lading, vessel, or trade references when the report belongs to a movement.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["inspection_report_number", "inspection_date", "trade_id", "delivery_id", "product"],
        header_fields=[
            _field("inspection_report_number", "Inspection Report Number", value_type="identifier", required=True),
            _field("inspection_date", "Inspection Date", value_type="date", required=True),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("bill_of_lading_number", "Bill of Lading Number", value_type="identifier"),
            _field("inspector", "Inspector", required=True),
            _field("location", "Location"),
            _field("vessel_name", "Vessel Name"),
            _field("product", "Product", required=True),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="FORCE_MAJEURE_NOTICE",
        label="Force Majeure Notice",
        document_family="COMPLIANCE",
        description="Legal or operational notice asserting a force majeure event affecting trade, delivery, or facility obligations.",
        review_guidance="Confirm the notice number, counterparty, contract or trade reference, event window, and affected location before attaching it to the governed record.",
        linkage_summary="Links primarily to compliance, trade, and delivery records using notice numbers, contract numbers, counterparties, trade IDs, delivery IDs, and event windows.",
        record_targets=[
            _target("COMPLIANCE_RECORD", "Compliance Record", "Match using notice number, counterparty, contract reference, and event window."),
            _target(
                "TRADE",
                "Trade",
                "Use trade ID or contract number to connect the notice to affected commercial obligations.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["force_majeure_notice_number", "trade_id", "delivery_id", "contract_number", "counterparty"],
        header_fields=[
            _field("force_majeure_notice_number", "Force Majeure Notice Number", value_type="identifier", required=True),
            _field("notice_date", "Notice Date", value_type="date", required=True),
            _field("counterparty", "Counterparty", required=True),
            _field("contract_number", "Contract Number", value_type="identifier"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("event_start", "Event Start", value_type="date", required=True),
            _field("event_end", "Event End", value_type="date"),
            _field("affected_location", "Affected Location"),
            _field("event_description", "Event Description"),
        ],
        table_templates=[],
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
        document_kind="DEMURRAGE_CLAIM",
        label="Demurrage Claim",
        document_family="SETTLEMENT",
        description="Claim package for delay or laytime charges tied to a vessel, terminal, or cargo movement.",
        review_guidance="Verify the claim number, bill of lading or vessel reference, laytime basis, counterparty, and claimed amount before routing to settlement.",
        linkage_summary="Links primarily to settlement, delivery, and trade records using claim numbers, bill of lading numbers, vessel names, delivery IDs, trade IDs, and counterparties.",
        record_targets=[
            _target(
                "TRADE_INVOICE",
                "Trade Invoice",
                "Match using claim number, bill of lading, trade ID, delivery ID, and claimed amount.",
                create_if_missing=True,
            ),
            _target(
                "DELIVERY",
                "Delivery",
                "Use vessel, bill of lading, or delivery references as the movement anchor.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["claim_number", "bill_of_lading_number", "trade_id", "delivery_id", "counterparty"],
        header_fields=[
            _field("claim_number", "Claim Number", value_type="identifier", required=True),
            _field("claim_date", "Claim Date", value_type="date", required=True),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("bill_of_lading_number", "Bill of Lading Number", value_type="identifier"),
            _field("vessel_name", "Vessel Name"),
            _field("counterparty", "Counterparty", required=True),
            _field("laytime_start", "Laytime Start", value_type="date"),
            _field("laytime_end", "Laytime End", value_type="date"),
            _field("claim_amount", "Claim Amount", value_type="currency", required=True),
            _field("currency", "Currency", value_type="identifier"),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="claim_lines",
                label="Claim Lines",
                description="Delay, rate, and amount rows supporting the demurrage claim.",
                min_occurrences=0,
                columns=[
                    _column("description", "Description", required=True),
                    _column("days", "Days", value_type="number"),
                    _column("rate", "Rate", value_type="currency"),
                    _column("amount", "Amount", value_type="currency", required=True),
                ],
            )
        ],
    ),
    DocumentKindSchemaOut(
        document_kind="PAYMENT_ADVICE",
        label="Payment Advice",
        document_family="SETTLEMENT",
        description="Payment or remittance advice showing cash application details for invoices or settlements.",
        review_guidance="Confirm the payment reference, advice date, payer, payee, amount, and invoice references before linking to settlement records.",
        linkage_summary="Links primarily to trade payment and invoice records using payment references, invoice numbers, counterparties, amounts, and dates.",
        record_targets=[
            _target(
                "TRADE_PAYMENT",
                "Trade Payment",
                "Match using payment reference first, then invoice number, account, amount, and advice date.",
                create_if_missing=True,
            ),
            _target(
                "TRADE_INVOICE",
                "Trade Invoice",
                "Use invoice number as the owning settlement anchor when payment creation is required.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["payment_reference", "invoice_number", "account", "advice_date"],
        header_fields=[
            _field("payment_reference", "Payment Reference", value_type="identifier", required=True),
            _field("advice_date", "Advice Date", value_type="date", required=True),
            _field("invoice_number", "Invoice Number", value_type="identifier"),
            _field("payer", "Payer"),
            _field("payee", "Payee"),
            _field("account", "Account"),
            _field("amount", "Amount", value_type="currency", required=True),
            _field("currency", "Currency", value_type="identifier"),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="OUTAGE_NOTICE",
        label="Outage Notice",
        document_family="NETWORK_FLOW",
        description="Notice of planned or unplanned facility, pipeline, transmission, or generation outage affecting commodity movement or availability.",
        review_guidance="Confirm the outage number, affected facility or asset, outage window, and operational impact before routing it to operations.",
        linkage_summary="Links primarily to delivery, inventory, and trade records using outage numbers, facility or asset references, systems, locations, trade IDs, and delivery IDs.",
        record_targets=[
            _target("DELIVERY", "Delivery", "Match using delivery ID, facility, asset, system, location, and outage window."),
            _target(
                "TRADE",
                "Trade",
                "Use trade ID as secondary context when the outage affects commercial obligations.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["outage_number", "facility", "asset_reference", "pipeline_system", "trade_id", "delivery_id"],
        header_fields=[
            _field("outage_number", "Outage Number", value_type="identifier", required=True),
            _field("notice_date", "Notice Date", value_type="date", required=True),
            _field("facility", "Facility", required=True),
            _field("pipeline_system", "Pipeline System"),
            _field("asset_reference", "Asset Reference", value_type="identifier"),
            _field("outage_start", "Outage Start", value_type="date", required=True),
            _field("outage_end", "Outage End", value_type="date"),
            _field("location", "Location"),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("reason", "Reason"),
        ],
        table_templates=[],
    ),
    DocumentKindSchemaOut(
        document_kind="STORAGE_STATEMENT",
        label="Storage Statement",
        document_family="NETWORK_FLOW",
        description="Storage terminal or facility statement summarizing inventory movements, balances, or storage fees.",
        review_guidance="Verify the statement number, facility, account, product, and period before matching inventory or delivery activity.",
        linkage_summary="Links primarily to inventory, delivery, and trade records using facility, account, period, product, trade IDs, and delivery IDs.",
        record_targets=[
            _target("DELIVERY", "Delivery", "Match using delivery ID, trade ID, facility, product, and period."),
            _target(
                "INVENTORY_POSITION",
                "Inventory Position",
                "Use facility, account, product, and period when the statement describes inventory balances.",
                role="SECONDARY",
            ),
        ],
        matching_keys=["statement_number", "facility", "account", "product", "trade_id", "delivery_id"],
        header_fields=[
            _field("statement_number", "Statement Number", value_type="identifier", required=True),
            _field("statement_date", "Statement Date", value_type="date"),
            _field("facility", "Facility", required=True),
            _field("account", "Account"),
            _field("period_start", "Period Start", value_type="date"),
            _field("period_end", "Period End", value_type="date"),
            _field("product", "Product", required=True),
            _field("trade_id", "Trade ID", value_type="identifier"),
            _field("delivery_id", "Delivery ID", value_type="identifier"),
            _field("inventory_quantity", "Inventory Quantity", value_type="quantity"),
        ],
        table_templates=[
            DocumentTableTemplateSchemaOut(
                template_key="inventory_lines",
                label="Inventory Lines",
                description="Storage movement, receipt, delivery, or balance rows.",
                min_occurrences=0,
                columns=[
                    _column("movement_type", "Movement Type", required=True),
                    _column("quantity", "Quantity", value_type="quantity", required=True),
                    _column("unit", "Unit"),
                    _column("effective_date", "Effective Date", value_type="date"),
                ],
            )
        ],
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


def _controlled_facets_for_kind(document_kind: str) -> tuple[DocumentFacetSchemaOut, ...]:
    if document_kind == "INVOICE":
        return INVOICE_CONTROLLED_FACETS
    if document_kind == "BILL_OF_LADING":
        return BILL_OF_LADING_CONTROLLED_FACETS
    if document_kind in {
        "DELIVERY_CONFIRMATION",
        "DISPATCH_NOTICE",
        "NOTICE_OF_READINESS",
        "PACKING_LIST",
        "RAILCAR_TICKET",
        "TRUCK_TICKET",
        "WEIGH_TICKET",
    }:
        return LOGISTICS_CONTROLLED_FACETS
    if document_kind in {
        "CERTIFICATE_OF_ANALYSIS",
        "INSPECTION_REPORT",
        "QUALITY_SPECIFICATION",
        "QUALITY_STATEMENT",
        "SAMPLING_ANALYSIS",
    }:
        return QUALITY_CONTROLLED_FACETS
    return ()


def _schema_with_controlled_metadata(schema: DocumentKindSchemaOut) -> DocumentKindSchemaOut:
    document_kind = str(schema.document_kind)
    facets = list(_controlled_facets_for_kind(str(schema.document_kind)))
    extraction_profile = EXTRACTION_SCHEMA_PROFILES.get(document_kind)
    if not facets and extraction_profile is None:
        return schema
    update: dict[str, object] = {}
    if facets:
        update["facets"] = facets
    if extraction_profile is not None:
        update.update(
            {
                "extraction_schema_code": extraction_profile.schema_code,
                "deep_extraction_required": extraction_profile.deep_extraction_required,
                "extraction_objects": list(extraction_profile.objects),
                "validation_rules": list(extraction_profile.validation_rules),
                "review_rules": list(extraction_profile.review_rules),
            }
        )
    return schema.model_copy(update=update)


def build_document_schema_registry() -> DocumentSchemaRegistryOut:
    return DocumentSchemaRegistryOut(
        version=DOCUMENT_SCHEMA_REGISTRY_VERSION,
        document_kinds=[_schema_with_controlled_metadata(schema) for schema in DOCUMENT_KIND_SCHEMAS],
        document_facets=list(DOCUMENT_FACET_SCHEMAS),
    )


def get_document_kind_schema(document_kind: str) -> DocumentKindSchemaOut | None:
    normalized_kind = document_kind.strip().upper()
    for schema in DOCUMENT_KIND_SCHEMAS:
        if schema.document_kind == normalized_kind:
            return _schema_with_controlled_metadata(schema)
    return None


def list_supported_document_kinds() -> tuple[str, ...]:
    return tuple(schema.document_kind for schema in DOCUMENT_KIND_SCHEMAS)
