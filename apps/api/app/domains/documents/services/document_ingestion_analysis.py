from __future__ import annotations

from collections import Counter
import re
from typing import Optional

from apps.api.app.schemas.document import DocumentExtractedFieldOut
from apps.api.app.schemas.document import DocumentTableBlockOut

from .document_ingestion_common import FieldDefinition
from .document_ingestion_common import PageClassification
from .document_ingestion_common import TABLE_LINE_SPLIT_PATTERN
from .document_ingestion_common import clean_field_value
from .document_ingestion_common import normalize_for_matching

FIELD_DEFINITIONS: dict[str, tuple[FieldDefinition, ...]] = {
    "TRADE_COMMUNICATION": (
        FieldDefinition(
            "communication_date",
            "Communication Date",
            (r"(?:communication|email|message)\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)", r"sent\s*on\s*[:#]?\s*([A-Z0-9,\/\- ]+)"),
        ),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition(
            "external_trade_id",
            "External Trade ID",
            (r"external\s*trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("counterparty", "Counterparty", (r"counterparty\s*[:#]?\s*(.+)",)),
        FieldDefinition("sender", "Sender", (r"(?:from|sender)\s*[:#]?\s*(.+)",)),
        FieldDefinition("subject", "Subject", (r"subject\s*[:#]?\s*(.+)",)),
    ),
    "INVOICE": (
        FieldDefinition("invoice_number", "Invoice Number", (r"invoice\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("invoice_date", "Invoice Date", (r"invoice\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("due_date", "Due Date", (r"due\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("counterparty", "Counterparty", (r"counterparty\s*[:#]?\s*(.+)", r"customer\s*[:#]?\s*(.+)")),
        FieldDefinition("total_amount", "Total Amount", (r"total\s*(?:amount|due)?\s*[:#]?\s*([$A-Z0-9,.\- ]+)",)),
    ),
    "TRADE_CONFIRMATION": (
        FieldDefinition(
            "confirmation_number",
            "Confirmation Number",
            (r"confirmation\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("trade_date", "Trade Date", (r"trade\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition(
            "external_trade_id",
            "External Trade ID",
            (r"external\s*trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("counterparty", "Counterparty", (r"counterparty\s*[:#]?\s*(.+)",)),
    ),
    "TRADE_CONTRACT": (
        FieldDefinition("contract_number", "Contract Number", (r"contract\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("contract_date", "Contract Date", (r"contract\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition(
            "external_trade_id",
            "External Trade ID",
            (r"external\s*trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("counterparty", "Counterparty", (r"counterparty\s*[:#]?\s*(.+)",)),
        FieldDefinition("commodity", "Commodity", (r"commodity\s*[:#]?\s*(.+)", r"product\s*[:#]?\s*(.+)")),
        FieldDefinition("delivery_start", "Delivery Start", (r"delivery\s*start\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("delivery_end", "Delivery End", (r"delivery\s*end\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
    ),
    "BROKER_CONFIRMATION": (
        FieldDefinition(
            "broker_confirmation_number",
            "Broker Confirmation Number",
            (r"broker\s*confirmation\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("trade_date", "Trade Date", (r"trade\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition(
            "external_trade_id",
            "External Trade ID",
            (r"external\s*trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("broker", "Broker", (r"broker\s*[:#]?\s*(.+)",)),
        FieldDefinition("account", "Account", (r"account\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
    ),
    "BROKER_STATEMENT": (
        FieldDefinition("statement_number", "Statement Number", (r"statement\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("statement_date", "Statement Date", (r"statement\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("broker", "Broker", (r"broker\s*[:#]?\s*(.+)",)),
        FieldDefinition("account", "Account", (r"account\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("period_start", "Period Start", (r"period\s*start\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("period_end", "Period End", (r"period\s*end\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("currency", "Currency", (r"currency\s*[:#]?\s*([A-Z]{3})",)),
    ),
    "PIPELINE_STATEMENT": (
        FieldDefinition("statement_number", "Statement Number", (r"statement\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("statement_date", "Statement Date", (r"statement\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("pipeline_system", "Pipeline System", (r"pipeline\s*(?:system|name)\s*[:#]?\s*(.+)",)),
        FieldDefinition("contract_number", "Pipeline Contract Number", (r"contract\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("nomination_reference", "Nomination Reference", (r"nomination\s*(?:reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("receipt_location_code", "Receipt Location", (r"receipt\s*(?:location|point)\s*[:#]?\s*([A-Z0-9_\-\/ ]+)",)),
        FieldDefinition("delivery_location_code", "Delivery Location", (r"delivery\s*(?:location|point)\s*[:#]?\s*([A-Z0-9_\-\/ ]+)",)),
    ),
    "TRUCK_TICKET": (
        FieldDefinition("ticket_number", "Truck Ticket Number", (r"truck\s*ticket\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("load_date", "Load Date", (r"(?:load|pickup)\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("carrier", "Carrier", (r"carrier\s*[:#]?\s*(.+)",)),
        FieldDefinition("carrier_reference", "Carrier Reference", (r"carrier\s*(?:reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("asset_reference", "Asset Reference", (r"(?:asset|truck|tractor)\s*(?:reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("origin", "Origin", (r"(?:origin|pickup)\s*[:#]?\s*(.+)",)),
        FieldDefinition("destination", "Destination", (r"(?:destination|delivery)\s*[:#]?\s*(.+)",)),
        FieldDefinition("net_quantity", "Net Quantity", (r"net\s*(?:quantity|volume|weight)\s*[:#]?\s*([A-Z0-9,.\- ]+)",)),
    ),
    "BILL_OF_LADING": (
        FieldDefinition(
            "bill_of_lading_number",
            "Bill of Lading Number",
            (r"bill\s+of\s+lading\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("carrier", "Carrier", (r"carrier\s*[:#]?\s*(.+)",)),
        FieldDefinition("load_date", "Load Date", (r"(?:load|shipment)\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("origin", "Origin", (r"(?:origin|load\s+port)\s*[:#]?\s*(.+)",)),
        FieldDefinition("destination", "Destination", (r"(?:destination|discharge\s+port)\s*[:#]?\s*(.+)",)),
    ),
    "DELIVERY_CONFIRMATION": (
        FieldDefinition(
            "delivery_confirmation_number",
            "Delivery Confirmation Number",
            (r"delivery\s*confirmation\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("confirmation_date", "Confirmation Date", (r"confirmation\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("carrier_reference", "Carrier Reference", (r"carrier\s*(?:reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("origin", "Origin", (r"(?:origin|pickup)\s*[:#]?\s*(.+)",)),
        FieldDefinition("destination", "Destination", (r"(?:destination|delivery)\s*[:#]?\s*(.+)",)),
    ),
    "CERTIFICATE_OF_ANALYSIS": (
        FieldDefinition(
            "certificate_number",
            "Certificate Number",
            (r"certificate\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("sample_id", "Sample ID", (r"sample\s*(?:id|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("sample_date", "Sample Date", (r"sample\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("lot_number", "Lot Number", (r"lot\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("product", "Product", (r"product\s*[:#]?\s*(.+)",)),
    ),
    "QUALITY_STATEMENT": (
        FieldDefinition("statement_number", "Statement Number", (r"statement\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("statement_date", "Statement Date", (r"statement\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("sample_id", "Sample ID", (r"sample\s*(?:id|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("lot_number", "Lot Number", (r"lot\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("product", "Product", (r"product\s*[:#]?\s*(.+)",)),
    ),
    "SAMPLING_ANALYSIS": (
        FieldDefinition("sample_id", "Sample ID", (r"sample\s*(?:id|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("sample_date", "Sample Date", (r"sample\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("lot_number", "Lot Number", (r"lot\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("product", "Product", (r"product\s*[:#]?\s*(.+)",)),
        FieldDefinition("laboratory", "Laboratory", (r"(?:laboratory|lab)\s*[:#]?\s*(.+)",)),
    ),
    "QUALITY_SPECIFICATION": (
        FieldDefinition("spec_name", "Specification Name", (r"(?:quality\s*)?spec(?:ification)?\s*(?:name|title)?\s*[:#]?\s*(.+)",)),
        FieldDefinition("spec_version", "Specification Version", (r"spec(?:ification)?\s*version\s*[:#]?\s*([A-Z0-9.\-\/]+)",)),
        FieldDefinition("effective_date", "Effective Date", (r"effective\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("counterparty", "Counterparty", (r"counterparty\s*[:#]?\s*(.+)",)),
        FieldDefinition("product", "Product", (r"product\s*[:#]?\s*(.+)",)),
    ),
    "SETTLEMENT_STATEMENT": (
        FieldDefinition("statement_number", "Statement Number", (r"statement\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("statement_date", "Statement Date", (r"statement\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("account", "Account", (r"account\s*[:#]?\s*(.+)",)),
    ),
    "WEIGH_TICKET": (
        FieldDefinition("ticket_number", "Ticket Number", (r"(?:weigh|scale)\s*ticket\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("load_date", "Load Date", (r"(?:load|weigh)\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("gross_weight", "Gross Weight", (r"gross\s*weight\s*[:#]?\s*([A-Z0-9,.\- ]+)",)),
        FieldDefinition("net_weight", "Net Weight", (r"net\s*weight\s*[:#]?\s*([A-Z0-9,.\- ]+)",)),
    ),
    "HAZARDOUS_CARGO_DOCUMENTATION": (
        FieldDefinition("document_number", "Document Number", (r"document\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("issue_date", "Issue Date", (r"issue\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("product", "Product", (r"product\s*[:#]?\s*(.+)",)),
        FieldDefinition("un_number", "UN Number", (r"u\.?\s*n\.?\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("hazard_class", "Hazard Class", (r"hazard\s*class\s*[:#]?\s*([A-Z0-9.\-\/ ]+)",)),
        FieldDefinition("carrier_reference", "Carrier Reference", (r"carrier\s*(?:reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
    ),
}

CLASSIFICATION_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("HAZARDOUS_CARGO_DOCUMENTATION", ("hazardous cargo", "dangerous goods", "safety data sheet", "material safety data sheet", "msds")),
    ("DELIVERY_CONFIRMATION", ("delivery confirmation", "proof of delivery", "pod")),
    ("BROKER_CONFIRMATION", ("broker confirmation", "execution confirmation", "clearing confirmation")),
    ("TRADE_CONFIRMATION", ("trade confirmation", "confirmation number", "confirmation no")),
    ("TRADE_CONTRACT", ("purchase and sale agreement", "sales contract", "trade contract", "master agreement")),
    ("BROKER_STATEMENT", ("broker statement", "futures statement", "clearing statement", "account statement")),
    ("PIPELINE_STATEMENT", ("pipeline statement", "nomination statement", "allocation statement", "pipeline allocation")),
    ("TRUCK_TICKET", ("truck ticket", "load ticket", "unload ticket")),
    ("INVOICE", ("invoice", "invoice number", "invoice no", "amount due")),
    ("BILL_OF_LADING", ("bill of lading", "bol number", "bill of lading number")),
    ("CERTIFICATE_OF_ANALYSIS", ("certificate of analysis", "coa", "certificate number")),
    ("QUALITY_STATEMENT", ("quality statement", "quality certificate")),
    ("SAMPLING_ANALYSIS", ("sampling analysis", "sample analysis", "laboratory analysis", "lab report")),
    ("QUALITY_SPECIFICATION", ("quality specification", "product specification", "specification sheet")),
    ("SETTLEMENT_STATEMENT", ("settlement statement", "statement of settlement")),
    ("WEIGH_TICKET", ("weigh ticket", "scale ticket", "gross weight", "net weight")),
    ("TRADE_COMMUNICATION", ("trade recap", "deal recap", "commercial recap", "trade communication")),
)


def classify_document_page(filename: str, raw_text: str | None) -> PageClassification:
    from .document_classification_scoring import score_document_page_classification

    assessment = score_document_page_classification(
        filename=filename,
        raw_text=raw_text,
        text_source="pdf_text",
        table_blocks=extract_document_table_blocks(raw_text),
    )
    return assessment.classification


def extract_document_header_fields(
    document_kind: str,
    raw_text: str | None,
    *,
    text_source: str = "pdf_text",
) -> list[dict[str, object]]:
    if not raw_text:
        return []

    definitions = FIELD_DEFINITIONS.get(document_kind, ())
    extracted_fields: list[dict[str, object]] = []
    seen_fields: set[str] = set()
    for definition in definitions:
        for pattern in definition.patterns:
            match = re.search(pattern, raw_text, flags=re.IGNORECASE | re.MULTILINE)
            if match is None:
                continue
            value = clean_field_value(match.group(1))
            if not value or definition.field_key in seen_fields:
                continue
            seen_fields.add(definition.field_key)
            extracted_fields.append(
                DocumentExtractedFieldOut(
                    field_key=definition.field_key,
                    label=definition.label,
                    value=value,
                    confidence=0.78,
                    source=f"{text_source}:regex",
                ).model_dump()
            )
            break
    return extracted_fields


def extract_document_table_blocks(
    raw_text: str | None,
    *,
    text_source: str = "pdf_text",
) -> list[dict[str, object]]:
    if not raw_text:
        return []

    lines = [line.strip() for line in raw_text.splitlines()]
    if not any(lines):
        return []

    blocks: list[list[str]] = []
    current_block: list[str] = []
    for line in lines:
        if not line:
            if len(current_block) >= 2:
                blocks.append(current_block)
            current_block = []
            continue
        if looks_like_table_line(line):
            current_block.append(line)
            continue
        if len(current_block) >= 2:
            blocks.append(current_block)
        current_block = []
    if len(current_block) >= 2:
        blocks.append(current_block)

    serialized_blocks: list[dict[str, object]] = []
    for index, block_lines in enumerate(blocks, start=1):
        table = build_table_block(index=index, lines=block_lines, text_source=text_source)
        if table is not None:
            serialized_blocks.append(table.model_dump())
    return serialized_blocks


def extract_page_text(page) -> tuple[str | None, list[str]]:
    try:
        raw_text = page.extract_text() or None
    except Exception as exc:  # pragma: no cover - defensive against parser-specific failures
        return None, [f"Text extraction failed: {exc}"]
    return raw_text, []


def build_page_warnings(
    *,
    raw_text: str | None,
    table_blocks: list[dict[str, object]],
    text_source: str,
    extra_warnings: list[str] | None = None,
) -> list[str]:
    warnings: list[str] = list(extra_warnings or [])
    if not raw_text:
        warnings.append("No extractable text was found on this page. OCR may be required.")
    elif text_source == "ocr":
        warnings.append("Page text was captured through OCR fallback instead of embedded PDF text.")
    if raw_text and not table_blocks and looks_table_like_overall(raw_text):
        warnings.append("Possible table content was detected, but no stable table block was parsed.")
    return warnings


def looks_like_table_line(line: str) -> bool:
    if "\t" in line:
        return True
    segments = [segment.strip() for segment in TABLE_LINE_SPLIT_PATTERN.split(line) if segment.strip()]
    if len(segments) >= 3:
        return True
    if len(segments) == 2:
        return True
    return False


def looks_table_like_overall(raw_text: str) -> bool:
    numeric_lines = 0
    dense_lines = 0
    for line in raw_text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if len(re.findall(r"\d", stripped)) >= 3:
            numeric_lines += 1
        if len([segment for segment in TABLE_LINE_SPLIT_PATTERN.split(stripped) if segment.strip()]) >= 3:
            dense_lines += 1
    return numeric_lines >= 2 or dense_lines >= 2


def build_table_block(*, index: int, lines: list[str], text_source: str) -> DocumentTableBlockOut | None:
    split_rows = [
        [segment.strip() for segment in TABLE_LINE_SPLIT_PATTERN.split(line) if segment.strip()]
        for line in lines
    ]
    split_rows = [row for row in split_rows if len(row) >= 2]
    if len(split_rows) < 2:
        return None

    max_columns = max(len(row) for row in split_rows)
    header_row_detected = looks_like_header_row(split_rows[0], split_rows[1] if len(split_rows) > 1 else None)
    if header_row_detected:
        columns = normalize_table_headers(split_rows[0], max_columns=max_columns)
        data_rows = split_rows[1:]
    else:
        columns = [f"column_{position}" for position in range(1, max_columns + 1)]
        data_rows = split_rows

    rows: list[dict[str, Optional[str]]] = []
    for row in data_rows:
        normalized_row = {
            column: row[position] if position < len(row) else None
            for position, column in enumerate(columns)
        }
        if any(value not in (None, "") for value in normalized_row.values()):
            rows.append(normalized_row)
    if not rows:
        return None

    return DocumentTableBlockOut(
        table_index=index,
        template_key=None,
        title=lines[0] if not header_row_detected and len(lines[0]) <= 80 else None,
        columns=columns,
        rows=rows,
        header_row_detected=header_row_detected,
        source=f"{text_source}:whitespace-grid",
    )


def looks_like_header_row(first_row: list[str], second_row: list[str] | None) -> bool:
    if second_row is None:
        return False
    if any(any(char.isdigit() for char in value) for value in first_row):
        return False
    return any(any(char.isdigit() for char in value) for value in second_row)


def normalize_table_headers(values: list[str], *, max_columns: int) -> list[str]:
    normalized_headers: list[str] = []
    seen_headers: Counter[str] = Counter()
    for position in range(max_columns):
        raw_value = values[position] if position < len(values) else ""
        normalized = re.sub(r"[^a-z0-9]+", "_", raw_value.lower()).strip("_") or f"column_{position + 1}"
        seen_headers[normalized] += 1
        if seen_headers[normalized] > 1:
            normalized = f"{normalized}_{seen_headers[normalized]}"
        normalized_headers.append(normalized)
    return normalized_headers
