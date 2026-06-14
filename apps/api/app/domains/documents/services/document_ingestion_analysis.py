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
    "DEAL_RECAP": (
        FieldDefinition(
            "recap_number",
            "Recap Number",
            (r"(?:deal|trade|commercial)?\s*recap\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition(
            "recap_date",
            "Recap Date",
            (r"(?:deal|trade|commercial)?\s*recap\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)", r"trade\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)"),
        ),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition(
            "external_trade_id",
            "External Trade ID",
            (r"external\s*trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("counterparty", "Counterparty", (r"counterparty\s*[:#]?\s*(.+)",)),
        FieldDefinition("trader", "Trader", (r"trader\s*[:#]?\s*(.+)",)),
        FieldDefinition("commodity", "Commodity", (r"commodity\s*[:#]?\s*(.+)", r"product\s*[:#]?\s*(.+)")),
        FieldDefinition("quantity", "Quantity", (r"quantity\s*[:#]?\s*([A-Z0-9,.\- ]+)",)),
        FieldDefinition("price", "Price", (r"price\s*[:#]?\s*([$A-Z0-9,.\-\/ ]+)",)),
        FieldDefinition("delivery_start", "Delivery Start", (r"delivery\s*start\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("delivery_end", "Delivery End", (r"delivery\s*end\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
    ),
    "PURCHASE_ORDER": (
        FieldDefinition(
            "purchase_order_number",
            "Purchase Order Number",
            (
                r"purchase\s*order\s*(?:number|no\.?|#)\s*[:#]?\s*([A-Z0-9\-\/]+)",
                r"\bpo\s*(?:number|no\.?|#)\s*[:#]?\s*([A-Z0-9\-\/]+)",
                r"\bp\.?o\.?\s*(?:number|no\.?|#)\s*[:#]?\s*([A-Z0-9\-\/]+)",
            ),
        ),
        FieldDefinition("order_date", "Order Date", (r"(?:purchase\s*)?order\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("buyer", "Buyer", (r"buyer\s*[:#]?\s*(.+)",)),
        FieldDefinition("seller", "Seller", (r"seller\s*[:#]?\s*(.+)", r"(?:vendor|supplier)\s*[:#]?\s*(.+)")),
        FieldDefinition("counterparty", "Counterparty", (r"counterparty\s*[:#]?\s*(.+)",)),
        FieldDefinition("commodity", "Commodity", (r"commodity\s*[:#]?\s*(.+)", r"product\s*[:#]?\s*(.+)")),
        FieldDefinition("quantity", "Quantity", (r"quantity\s*[:#]?\s*([A-Z0-9,.\- ]+)",)),
        FieldDefinition("unit_price", "Unit Price", (r"(?:unit\s*)?price\s*[:#]?\s*([$A-Z0-9,.\-\/ ]+)",)),
        FieldDefinition("delivery_start", "Delivery Start", (r"delivery\s*start\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("delivery_end", "Delivery End", (r"delivery\s*end\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("delivery_location", "Delivery Location", (r"delivery\s*(?:location|point|port)\s*[:#]?\s*(.+)",)),
        FieldDefinition("vessel_name", "Vessel Name", (r"vessel\s*(?:name)?\s*[:#]?\s*(.+)",)),
    ),
    "SALES_ORDER": (
        FieldDefinition(
            "sales_order_number",
            "Sales Order Number",
            (
                r"sales\s*order\s*(?:number|no\.?|#)\s*[:#]?\s*([A-Z0-9\-\/]+)",
                r"\bso\s*(?:number|no\.?|#)\s*[:#]?\s*([A-Z0-9\-\/]+)",
                r"\bs\.?o\.?\s*(?:number|no\.?|#)\s*[:#]?\s*([A-Z0-9\-\/]+)",
            ),
        ),
        FieldDefinition("order_date", "Order Date", (r"(?:sales\s*)?order\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition(
            "buyer",
            "Buyer",
            (r"buyer\s*[:#]?\s*(.+)", r"(?:customer(?!\s*[-.]?\s*ref(?:erence)?\.?)|sold\s*to)\s*[:#]?\s*(.+)"),
        ),
        FieldDefinition("seller", "Seller", (r"seller\s*[:#]?\s*(.+)",)),
        FieldDefinition("counterparty", "Counterparty", (r"counterparty\s*[:#]?\s*(.+)",)),
        FieldDefinition("commodity", "Commodity", (r"commodity\s*[:#]?\s*(.+)", r"product\s*[:#]?\s*(.+)")),
        FieldDefinition("quantity", "Quantity", (r"quantity\s*[:#]?\s*([A-Z0-9,.\- ]+)",)),
        FieldDefinition("unit_price", "Unit Price", (r"(?:unit\s*)?price\s*[:#]?\s*([$A-Z0-9,.\-\/ ]+)",)),
        FieldDefinition("delivery_start", "Delivery Start", (r"delivery\s*start\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("delivery_end", "Delivery End", (r"delivery\s*end\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("delivery_location", "Delivery Location", (r"delivery\s*(?:location|point|port)\s*[:#]?\s*(.+)",)),
        FieldDefinition("vessel_name", "Vessel Name", (r"vessel\s*(?:name)?\s*[:#]?\s*(.+)",)),
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
    "PRICE_PUBLICATION": (
        FieldDefinition(
            "publication_reference",
            "Publication Reference",
            (r"(?:publication|bulletin|assessment)\s*(?:reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition(
            "publication_date",
            "Publication Date",
            (
                r"publication\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",
                r"published\s*(?:on|date)?\s*[:#]?\s*([A-Z0-9,\/\- ]+)",
            ),
        ),
        FieldDefinition(
            "observation_date",
            "Observation Date",
            (
                r"observation\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",
                r"price\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",
                r"assessment\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",
            ),
        ),
        FieldDefinition(
            "price_index_code",
            "Price Index Code",
            (r"price\s*index\s*(?:code|id|identifier)\s*[:#]?\s*([A-Z0-9_\-\/]+)", r"index\s*code\s*[:#]?\s*([A-Z0-9_\-\/]+)"),
        ),
        FieldDefinition("source_provider", "Source Provider", (r"(?:source\s*)?(?:provider|publisher)\s*[:#]?\s*(.+)",)),
        FieldDefinition("source_series_id", "Source Series ID", (r"source\s*series\s*(?:id|identifier)\s*[:#]?\s*([A-Z0-9_.\-\/]+)", r"series\s*(?:id|identifier)\s*[:#]?\s*([A-Z0-9_.\-\/]+)")),
        FieldDefinition("commodity", "Commodity", (r"commodity\s*[:#]?\s*(.+)", r"product\s*[:#]?\s*(.+)")),
        FieldDefinition("market", "Market", (r"market\s*[:#]?\s*(.+)",)),
        FieldDefinition("location", "Location", (r"location\s*[:#]?\s*(.+)",)),
        FieldDefinition(
            "price",
            "Price",
            (r"^(?:published\s*)?price\s*[:#]\s*([$A-Z0-9,.\-\/ ]+)", r"^assessment\s*price\s*[:#]\s*([$A-Z0-9,.\-\/ ]+)"),
        ),
        FieldDefinition("currency", "Currency", (r"currency\s*[:#]?\s*([A-Z]{3})",)),
        FieldDefinition("unit", "Unit", (r"(?:unit|uom|unit\s*of\s*measure)\s*[:#]?\s*([A-Z0-9\/]+)",)),
    ),
    "LETTER_OF_CREDIT": (
        FieldDefinition(
            "letter_of_credit_number",
            "Letter of Credit Number",
            (
                r"letter\s+of\s+credit\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",
                r"\blc\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",
                r"\bl\/c\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",
            ),
        ),
        FieldDefinition("issue_date", "Issue Date", (r"issue\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("expiry_date", "Expiry Date", (r"(?:expiry|expiration)\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("issuing_bank", "Issuing Bank", (r"issuing\s*bank\s*[:#]?\s*(.+)",)),
        FieldDefinition("applicant", "Applicant", (r"applicant\s*[:#]?\s*(.+)",)),
        FieldDefinition("beneficiary", "Beneficiary", (r"beneficiary\s*[:#]?\s*(.+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("amount", "Amount", (r"(?:amount|credit\s*amount)\s*[:#]?\s*([$A-Z0-9,.\- ]+)",)),
        FieldDefinition("currency", "Currency", (r"currency\s*[:#]?\s*([A-Z]{3})",)),
    ),
    "NOMINATION": (
        FieldDefinition("nomination_reference", "Nomination Reference", (r"nomination\s*(?:reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("nomination_date", "Nomination Date", (r"nomination\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("flow_date", "Flow Date", (r"(?:flow|gas|movement)\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("pipeline_system", "Pipeline System", (r"pipeline\s*(?:system|name)\s*[:#]?\s*(.+)",)),
        FieldDefinition("contract_number", "Contract Number", (r"contract\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("receipt_location_code", "Receipt Location", (r"receipt\s*(?:location|point)\s*[:#]?\s*([A-Z0-9_\-\/ ]+)",)),
        FieldDefinition("delivery_location_code", "Delivery Location", (r"delivery\s*(?:location|point)\s*[:#]?\s*([A-Z0-9_\-\/ ]+)",)),
        FieldDefinition("quantity", "Quantity", (r"quantity\s*[:#]?\s*([A-Z0-9,.\- ]+)",)),
    ),
    "CURTAILMENT_NOTICE": (
        FieldDefinition(
            "curtailment_notice_number",
            "Curtailment Notice Number",
            (r"curtailment\s*notice\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("notice_date", "Notice Date", (r"notice\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("effective_start", "Effective Start", (r"effective\s*start\s*[:#]?\s*([A-Z0-9,\/\-: ]+)",)),
        FieldDefinition("effective_end", "Effective End", (r"effective\s*end\s*[:#]?\s*([A-Z0-9,\/\-: ]+)",)),
        FieldDefinition("issuing_entity", "Issuing Entity", (r"(?:issuing\s*entity|issuer)\s*[:#]?\s*(.+)",)),
        FieldDefinition("pipeline_system", "Pipeline System", (r"pipeline\s*(?:system|name)\s*[:#]?\s*(.+)",)),
        FieldDefinition("facility", "Facility", (r"(?:facility|terminal)\s*[:#]?\s*(.+)",)),
        FieldDefinition("location", "Location", (r"location\s*[:#]?\s*(.+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("nomination_reference", "Nomination Reference", (r"nomination\s*(?:reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("curtailed_quantity", "Curtailed Quantity", (r"curtailed\s*(?:quantity|volume|amount)\s*[:#]?\s*([A-Z0-9,.\- ]+)",)),
        FieldDefinition("reason", "Reason", (r"reason\s*[:#]?\s*(.+)",)),
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
    "RAILCAR_TICKET": (
        FieldDefinition("waybill_number", "Waybill Number", (r"waybill\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("railcar_number", "Railcar Number", (r"rail\s*car\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)", r"railcar\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)")),
        FieldDefinition("load_date", "Load Date", (r"(?:load|shipment)\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("carrier", "Carrier", (r"carrier\s*[:#]?\s*(.+)", r"railroad\s*[:#]?\s*(.+)")),
        FieldDefinition("carrier_reference", "Carrier Reference", (r"carrier\s*(?:reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("origin", "Origin", (r"(?:origin|ship\s*from)\s*[:#]?\s*(.+)",)),
        FieldDefinition("destination", "Destination", (r"(?:destination|ship\s*to)\s*[:#]?\s*(.+)",)),
        FieldDefinition("net_quantity", "Net Quantity", (r"net\s*(?:quantity|volume|weight)\s*[:#]?\s*([A-Z0-9,.\- ]+)",)),
    ),
    "DISPATCH_NOTICE": (
        FieldDefinition("dispatch_number", "Dispatch Number", (r"dispatch\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("dispatch_date", "Dispatch Date", (r"dispatch\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("dispatch_start", "Dispatch Start", (r"dispatch\s*start\s*[:#]?\s*([A-Z0-9,\/\-: ]+)",)),
        FieldDefinition("dispatch_end", "Dispatch End", (r"dispatch\s*end\s*[:#]?\s*([A-Z0-9,\/\-: ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("carrier", "Carrier", (r"carrier\s*[:#]?\s*(.+)",)),
        FieldDefinition("carrier_reference", "Carrier Reference", (r"carrier\s*(?:reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("asset_reference", "Asset Reference", (r"(?:asset|truck|railcar|unit)\s*(?:reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("origin", "Origin", (r"(?:origin|pickup|source)\s*[:#]?\s*(.+)",)),
        FieldDefinition("destination", "Destination", (r"(?:destination|delivery|sink)\s*[:#]?\s*(.+)",)),
        FieldDefinition("quantity", "Quantity", (r"quantity\s*[:#]?\s*([A-Z0-9,.\- ]+)",)),
        FieldDefinition("instructions", "Instructions", (r"instructions\s*[:#]?\s*(.+)",)),
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
    "PACKING_LIST": (
        FieldDefinition(
            "packing_list_number",
            "Packing List Number",
            (r"packing\s*list\s*(?:number|no\.?|#)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition(
            "delivery_order_number",
            "Delivery Order Number",
            (r"delivery\s*order\s*(?:number|no\.?|#)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("packing_date", "Packing List Date", (r"^\s*(?:packing\s*list\s*)?date\s*[:#]?\s*([A-Z0-9,\/\-. ]+)",)),
        FieldDefinition("loading_date", "Loading Date", (r"loading\s*date\s*[:#]?\s*([A-Z0-9,\/\-. ]+)",)),
        FieldDefinition("delivery_date", "Delivery Date", (r"delivery\s*date\s*[:#]?\s*([A-Z0-9,\/\-. ]+)",)),
        FieldDefinition(
            "customer_reference",
            "Customer Reference",
            (r"(?:cust\.?|customer)\s*ref(?:erence)?\s*(?:number|no\.?)?\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("carrier", "Carrier", (r"(?:carrier|haulier)\s*[:#]?\s*(.+)",)),
        FieldDefinition("shipper", "Shipper", (r"shipper\s*[:#]?\s*(.+)",)),
        FieldDefinition("consignee", "Consignee", (r"(?:consignee|ship\s*to|deliver\s*to)\s*[:#]?\s*(.+)",)),
        FieldDefinition("product", "Product", (r"(?:product|commodity|goods)\s*[:#]?\s*(.+)",)),
        FieldDefinition("gross_weight", "Gross Weight", (r"gross\s*w(?:eigh)?t\.?\s*[:#]?\s*([A-Z0-9,.\- ]+)",)),
        FieldDefinition("net_weight", "Net Weight", (r"net\s*w(?:eigh)?t\.?\s*[:#]?\s*([A-Z0-9,.\- ]+)",)),
        FieldDefinition("tare_weight", "Tare Weight", (r"tare\s*w(?:eigh)?t\.?\s*[:#]?\s*([A-Z0-9,.\- ]+)",)),
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
    "NOTICE_OF_READINESS": (
        FieldDefinition("notice_number", "Notice Number", (r"notice\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("notice_date", "Notice Date", (r"notice\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("notice_time", "Notice Time", (r"notice\s*time\s*[:#]?\s*([A-Z0-9:.\- ]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("vessel_name", "Vessel Name", (r"vessel\s*(?:name)?\s*[:#]?\s*(.+)",)),
        FieldDefinition("voyage_number", "Voyage Number", (r"voyage\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("load_port", "Load Port", (r"load\s*port\s*[:#]?\s*(.+)",)),
        FieldDefinition("discharge_port", "Discharge Port", (r"discharge\s*port\s*[:#]?\s*(.+)",)),
        FieldDefinition("eta", "ETA", (r"(?:eta|estimated\s*time\s*of\s*arrival)\s*[:#]?\s*([A-Z0-9,\/\-: ]+)",)),
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
    "CERTIFICATE_OF_ORIGIN": (
        FieldDefinition(
            "certificate_number",
            "Certificate Number",
            (r"certificate\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("issue_date", "Issue Date", (r"issue\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("origin_country", "Origin Country", (r"(?:origin\s*country|country\s*of\s*origin)\s*[:#]?\s*(.+)",)),
        FieldDefinition("product", "Product", (r"product\s*[:#]?\s*(.+)", r"commodity\s*[:#]?\s*(.+)")),
        FieldDefinition("shipper", "Shipper", (r"shipper\s*[:#]?\s*(.+)",)),
        FieldDefinition("consignee", "Consignee", (r"consignee\s*[:#]?\s*(.+)",)),
        FieldDefinition(
            "bill_of_lading_number",
            "Bill of Lading Number",
            (r"bill\s+of\s+lading\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
    ),
    "INSPECTION_REPORT": (
        FieldDefinition(
            "inspection_report_number",
            "Inspection Report Number",
            (r"inspection\s*report\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)", r"report\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)"),
        ),
        FieldDefinition("inspection_date", "Inspection Date", (r"inspection\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition(
            "bill_of_lading_number",
            "Bill of Lading Number",
            (r"bill\s+of\s+lading\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("inspector", "Inspector", (r"(?:inspector|inspection\s*company)\s*[:#]?\s*(.+)",)),
        FieldDefinition("location", "Location", (r"location\s*[:#]?\s*(.+)",)),
        FieldDefinition("vessel_name", "Vessel Name", (r"vessel\s*(?:name)?\s*[:#]?\s*(.+)",)),
        FieldDefinition("product", "Product", (r"product\s*[:#]?\s*(.+)", r"commodity\s*[:#]?\s*(.+)")),
    ),
    "FORCE_MAJEURE_NOTICE": (
        FieldDefinition(
            "force_majeure_notice_number",
            "Force Majeure Notice Number",
            (r"force\s*majeure\s*notice\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("notice_date", "Notice Date", (r"notice\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("counterparty", "Counterparty", (r"counterparty\s*[:#]?\s*(.+)",)),
        FieldDefinition("contract_number", "Contract Number", (r"contract\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("event_start", "Event Start", (r"event\s*start\s*[:#]?\s*([A-Z0-9,\/\-: ]+)",)),
        FieldDefinition("event_end", "Event End", (r"event\s*end\s*[:#]?\s*([A-Z0-9,\/\-: ]+)",)),
        FieldDefinition("affected_location", "Affected Location", (r"affected\s*location\s*[:#]?\s*(.+)",)),
        FieldDefinition("event_description", "Event Description", (r"(?:event\s*description|description)\s*[:#]?\s*(.+)",)),
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
    "DEMURRAGE_CLAIM": (
        FieldDefinition("claim_number", "Claim Number", (r"claim\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("claim_date", "Claim Date", (r"claim\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition(
            "bill_of_lading_number",
            "Bill of Lading Number",
            (r"bill\s+of\s+lading\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("vessel_name", "Vessel Name", (r"vessel\s*(?:name)?\s*[:#]?\s*(.+)",)),
        FieldDefinition("counterparty", "Counterparty", (r"counterparty\s*[:#]?\s*(.+)",)),
        FieldDefinition("laytime_start", "Laytime Start", (r"laytime\s*start\s*[:#]?\s*([A-Z0-9,\/\-: ]+)",)),
        FieldDefinition("laytime_end", "Laytime End", (r"laytime\s*end\s*[:#]?\s*([A-Z0-9,\/\-: ]+)",)),
        FieldDefinition("claim_amount", "Claim Amount", (r"claim\s*amount\s*[:#]?\s*([$A-Z0-9,.\- ]+)", r"total\s*claim\s*[:#]?\s*([$A-Z0-9,.\- ]+)")),
        FieldDefinition("currency", "Currency", (r"currency\s*[:#]?\s*([A-Z]{3})",)),
    ),
    "PAYMENT_ADVICE": (
        FieldDefinition("payment_reference", "Payment Reference", (r"payment\s*(?:reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)", r"remittance\s*(?:reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)")),
        FieldDefinition("advice_date", "Advice Date", (r"advice\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)", r"payment\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)")),
        FieldDefinition("invoice_number", "Invoice Number", (r"invoice\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("payer", "Payer", (r"payer\s*[:#]?\s*(.+)",)),
        FieldDefinition("payee", "Payee", (r"payee\s*[:#]?\s*(.+)",)),
        FieldDefinition("account", "Account", (r"account\s*[:#]?\s*(.+)",)),
        FieldDefinition("amount", "Amount", (r"(?:payment\s*)?amount\s*[:#]?\s*([$A-Z0-9,.\- ]+)",)),
        FieldDefinition("currency", "Currency", (r"currency\s*[:#]?\s*([A-Z]{3})",)),
    ),
    "OUTAGE_NOTICE": (
        FieldDefinition("outage_number", "Outage Number", (r"outage\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("notice_date", "Notice Date", (r"notice\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("facility", "Facility", (r"(?:facility|terminal|plant|station)\s*[:#]?\s*(.+)",)),
        FieldDefinition("pipeline_system", "Pipeline System", (r"pipeline\s*(?:system|name)\s*[:#]?\s*(.+)",)),
        FieldDefinition("asset_reference", "Asset Reference", (r"(?:asset|unit|line|equipment)\s*(?:reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("outage_start", "Outage Start", (r"outage\s*start\s*[:#]?\s*([A-Z0-9,\/\-: ]+)",)),
        FieldDefinition("outage_end", "Outage End", (r"outage\s*end\s*[:#]?\s*([A-Z0-9,\/\-: ]+)",)),
        FieldDefinition("location", "Location", (r"location\s*[:#]?\s*(.+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("reason", "Reason", (r"reason\s*[:#]?\s*(.+)",)),
    ),
    "STORAGE_STATEMENT": (
        FieldDefinition("statement_number", "Statement Number", (r"statement\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("statement_date", "Statement Date", (r"statement\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("facility", "Facility", (r"(?:facility|terminal|storage\s*location)\s*[:#]?\s*(.+)",)),
        FieldDefinition("account", "Account", (r"account\s*[:#]?\s*(.+)",)),
        FieldDefinition("period_start", "Period Start", (r"period\s*start\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("period_end", "Period End", (r"period\s*end\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("product", "Product", (r"product\s*[:#]?\s*(.+)", r"commodity\s*[:#]?\s*(.+)")),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("delivery_id", "Delivery ID", (r"delivery\s*(?:id|reference|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("inventory_quantity", "Inventory Quantity", (r"inventory\s*(?:quantity|balance)\s*[:#]?\s*([A-Z0-9,.\- ]+)",)),
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
    ("CERTIFICATE_OF_ORIGIN", ("certificate of origin", "country of origin", "origin certificate")),
    ("FORCE_MAJEURE_NOTICE", ("force majeure notice", "force majeure event", "notice of force majeure")),
    ("DELIVERY_CONFIRMATION", ("delivery confirmation", "proof of delivery", "pod")),
    ("NOTICE_OF_READINESS", ("notice of readiness", "nor tendered", "ready to load", "ready to discharge")),
    ("CURTAILMENT_NOTICE", ("curtailment notice", "curtailed quantity", "flow curtailment", "capacity curtailment")),
    ("DISPATCH_NOTICE", ("dispatch notice", "dispatch instruction", "dispatch number", "dispatch date")),
    ("DEMURRAGE_CLAIM", ("demurrage claim", "laytime claim", "demurrage invoice", "laytime calculation")),
    ("BROKER_CONFIRMATION", ("broker confirmation", "execution confirmation", "clearing confirmation")),
    ("TRADE_CONFIRMATION", ("trade confirmation", "confirmation number", "confirmation no")),
    ("TRADE_CONTRACT", ("purchase and sale agreement", "sales contract", "trade contract", "master agreement")),
    ("DEAL_RECAP", ("deal recap", "trade recap", "commercial recap", "recap date")),
    ("PURCHASE_ORDER", ("purchase order", "purchase order number", "purchase order no", "po number", "po no", "p.o. number")),
    ("SALES_ORDER", ("sales order", "sales order number", "sales order no", "so number", "so no", "s.o. number")),
    ("BROKER_STATEMENT", ("broker statement", "futures statement", "clearing statement", "account statement")),
    ("PRICE_PUBLICATION", ("price publication", "daily price bulletin", "price bulletin", "published index price", "price assessment")),
    ("LETTER_OF_CREDIT", ("letter of credit", "standby letter of credit", "documentary credit", "lc number", "l/c number")),
    ("NOMINATION", ("nomination", "nomination reference", "gas nomination", "pipeline nomination")),
    ("PIPELINE_STATEMENT", ("pipeline statement", "nomination statement", "allocation statement", "pipeline allocation")),
    ("RAILCAR_TICKET", ("railcar ticket", "rail car ticket", "waybill number", "railcar number")),
    ("TRUCK_TICKET", ("truck ticket", "load ticket", "unload ticket")),
    ("INVOICE", ("invoice", "invoice number", "invoice no", "amount due")),
    ("PAYMENT_ADVICE", ("payment advice", "remittance advice", "payment reference", "remittance reference")),
    ("PACKING_LIST", ("packing list", "packing slip", "quantity and description of goods")),
    ("BILL_OF_LADING", ("bill of lading", "bol number", "bill of lading number")),
    ("CERTIFICATE_OF_ANALYSIS", ("certificate of analysis", "coa")),
    ("INSPECTION_REPORT", ("inspection report", "inspection certificate", "inspector report")),
    ("QUALITY_STATEMENT", ("quality statement", "quality certificate")),
    ("SAMPLING_ANALYSIS", ("sampling analysis", "sample analysis", "laboratory analysis", "lab report")),
    ("QUALITY_SPECIFICATION", ("quality specification", "product specification", "specification sheet")),
    ("OUTAGE_NOTICE", ("outage notice", "planned outage", "unplanned outage", "maintenance outage")),
    ("STORAGE_STATEMENT", ("storage statement", "inventory statement", "terminal statement", "storage account statement")),
    ("SETTLEMENT_STATEMENT", ("settlement statement", "statement of settlement")),
    ("WEIGH_TICKET", ("weigh ticket", "scale ticket", "gross weight", "net weight")),
    ("TRADE_COMMUNICATION", ("trade communication", "email thread", "message thread", "commercial communication")),
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
