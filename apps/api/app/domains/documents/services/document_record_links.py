from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.delivery_event import DeliveryEvent
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.document_record_link import DocumentRecordLink
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.schemas.document import DocumentRecordLinkOut


@dataclass(frozen=True)
class ResolvedRecordTarget:
    record_type: str
    record_id: str
    record_label: str
    summary: str


@dataclass(frozen=True)
class ResolvedDocumentRecordLink:
    document_id: str
    record_type: str
    record_id: str
    record_label: str
    role: str
    source: str
    summary: str
    linked_at: datetime
    linked_by: str


def list_document_record_links(
    db: Session,
    *,
    document_id: str,
) -> list[ResolvedDocumentRecordLink]:
    return load_document_record_links_by_document_id(db, document_ids=[document_id]).get(document_id, [])


def load_document_record_links_by_document_id(
    db: Session,
    *,
    document_ids: list[str],
) -> dict[str, list[ResolvedDocumentRecordLink]]:
    if not document_ids:
        return {}

    rows = db.execute(
        select(DocumentRecordLink)
        .where(DocumentRecordLink.document_id.in_(document_ids))
        .order_by(DocumentRecordLink.document_id.asc(), DocumentRecordLink.linked_at.asc(), DocumentRecordLink.link_id.asc())
    ).scalars().all()

    cache: dict[tuple[str, str], ResolvedRecordTarget] = {}
    links_by_document_id: dict[str, list[ResolvedDocumentRecordLink]] = {}
    for row in rows:
        resolved = _resolve_record_target(
            db,
            record_type=row.record_type,
            record_id=row.record_id,
            cache=cache,
        )
        links_by_document_id.setdefault(row.document_id, []).append(
            ResolvedDocumentRecordLink(
                document_id=row.document_id,
                record_type=resolved.record_type,
                record_id=resolved.record_id,
                record_label=resolved.record_label,
                role=row.role,
                source=row.source,
                summary=resolved.summary,
                linked_at=_coerce_utc(row.linked_at),
                linked_by=row.linked_by,
            )
        )
    return links_by_document_id


def create_document_record_link(
    db: Session,
    *,
    document_id: str,
    record_type: str,
    record_id: str,
    actor_id: str,
    role: str = "PRIMARY",
    source: str = "ACTION_PLAN",
) -> ResolvedDocumentRecordLink:
    normalized_record_type = str(record_type or "").strip().upper()
    normalized_record_id = str(record_id or "").strip()
    normalized_role = str(role or "PRIMARY").strip().upper() or "PRIMARY"
    normalized_source = str(source or "ACTION_PLAN").strip().upper() or "ACTION_PLAN"
    if not normalized_record_type or not normalized_record_id:
        raise ValueError("Document record links require both a record type and record id.")

    existing = db.execute(
        select(DocumentRecordLink).where(
            DocumentRecordLink.document_id == document_id,
            DocumentRecordLink.record_type == normalized_record_type,
            DocumentRecordLink.record_id == normalized_record_id,
        )
    ).scalars().first()
    if existing is not None:
        resolved = resolve_record_target(db, record_type=existing.record_type, record_id=existing.record_id)
        return ResolvedDocumentRecordLink(
            document_id=existing.document_id,
            record_type=resolved.record_type,
            record_id=resolved.record_id,
            record_label=resolved.record_label,
            role=existing.role,
            source=existing.source,
            summary=resolved.summary,
            linked_at=_coerce_utc(existing.linked_at),
            linked_by=existing.linked_by,
        )

    resolved = resolve_record_target(db, record_type=normalized_record_type, record_id=normalized_record_id)
    link = DocumentRecordLink(
        document_id=document_id,
        record_type=resolved.record_type,
        record_id=resolved.record_id,
        role=normalized_role,
        source=normalized_source,
        linked_at=datetime.now(timezone.utc),
        linked_by=actor_id,
    )
    db.add(link)
    db.flush()
    return ResolvedDocumentRecordLink(
        document_id=document_id,
        record_type=resolved.record_type,
        record_id=resolved.record_id,
        record_label=resolved.record_label,
        role=link.role,
        source=link.source,
        summary=resolved.summary,
        linked_at=_coerce_utc(link.linked_at),
        linked_by=link.linked_by,
    )


def resolve_record_target(
    db: Session,
    *,
    record_type: str,
    record_id: str,
) -> ResolvedRecordTarget:
    return _resolve_record_target(db, record_type=record_type, record_id=record_id, cache={})


def to_document_record_link_out(link: ResolvedDocumentRecordLink) -> DocumentRecordLinkOut:
    return DocumentRecordLinkOut(
        record_type=link.record_type,
        record_id=link.record_id,
        record_label=link.record_label,
        role=link.role,
        source=link.source,
        summary=link.summary,
        linked_at=link.linked_at,
        linked_by=link.linked_by,
    )


def _resolve_record_target(
    db: Session,
    *,
    record_type: str,
    record_id: str,
    cache: dict[tuple[str, str], ResolvedRecordTarget],
) -> ResolvedRecordTarget:
    normalized_type = str(record_type or "").strip().upper()
    normalized_id = str(record_id or "").strip()
    cache_key = (normalized_type, normalized_id)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    resolved: ResolvedRecordTarget
    if normalized_type == "TRADE":
        trade = db.execute(select(Trade).where(Trade.trade_id == normalized_id)).scalars().first()
        if trade is None:
            raise LookupError(f"Trade '{normalized_id}' was not found.")
        resolved = ResolvedRecordTarget(
            record_type=normalized_type,
            record_id=trade.trade_id,
            record_label=f"Trade {trade.trade_id}",
            summary=_summarize_trade(trade),
        )
    elif normalized_type == "TRADE_CONFIRMATION":
        confirmation = db.get(TradeConfirmation, _coerce_int_id(normalized_id, label="confirmation"))
        if confirmation is None:
            raise LookupError(f"Confirmation '{normalized_id}' was not found.")
        resolved = ResolvedRecordTarget(
            record_type=normalized_type,
            record_id=str(confirmation.id),
            record_label=f"Confirmation {confirmation.confirmation_number}",
            summary=f"Trade {confirmation.trade_id} • {confirmation.status.replace('_', ' ').title()}",
        )
    elif normalized_type == "TRADE_INVOICE":
        invoice = db.get(TradeInvoice, _coerce_int_id(normalized_id, label="invoice"))
        if invoice is None:
            raise LookupError(f"Invoice '{normalized_id}' was not found.")
        resolved = ResolvedRecordTarget(
            record_type=normalized_type,
            record_id=str(invoice.id),
            record_label=f"Invoice {invoice.invoice_number}",
            summary=f"Trade {invoice.trade_id} • {invoice.status.replace('_', ' ').title()}",
        )
    elif normalized_type == "TRADE_PAYMENT":
        payment = db.get(TradePayment, _coerce_int_id(normalized_id, label="payment"))
        if payment is None:
            raise LookupError(f"Payment '{normalized_id}' was not found.")
        invoice = db.get(TradeInvoice, payment.invoice_id)
        summary = f"Invoice {invoice.invoice_number}" if invoice is not None else f"Trade {payment.trade_id}"
        resolved = ResolvedRecordTarget(
            record_type=normalized_type,
            record_id=str(payment.id),
            record_label=f"Payment {payment.payment_reference}",
            summary=f"{summary} • {payment.status.replace('_', ' ').title()}",
        )
    elif normalized_type == "DELIVERY":
        delivery = db.get(DeliveryObligation, normalized_id)
        if delivery is None:
            raise LookupError(f"Delivery '{normalized_id}' was not found.")
        resolved = ResolvedRecordTarget(
            record_type=normalized_type,
            record_id=delivery.delivery_id,
            record_label=f"Delivery {delivery.delivery_id}",
            summary=f"Trade {delivery.trade_id} • {delivery.execution_status.replace('_', ' ').title()}",
        )
    elif normalized_type == "DELIVERY_EVENT":
        event = db.get(DeliveryEvent, _coerce_int_id(normalized_id, label="delivery event"))
        if event is None:
            raise LookupError(f"Delivery event '{normalized_id}' was not found.")
        resolved = ResolvedRecordTarget(
            record_type=normalized_type,
            record_id=str(event.id),
            record_label=f"Delivery Event {event.event_type.replace('_', ' ').title()}",
            summary=(
                f"Delivery {event.delivery_id} • {event.occurred_at.date().isoformat()} • "
                f"{event.execution_status.replace('_', ' ').title()}"
            ),
        )
    elif normalized_type == "TRADE_ACTUALIZATION":
        actualization = db.get(TradeActualization, _coerce_int_id(normalized_id, label="trade actualization"))
        if actualization is None:
            raise LookupError(f"Trade actualization '{normalized_id}' was not found.")
        state = "Voided" if actualization.voided_at is not None else "Active"
        resolved = ResolvedRecordTarget(
            record_type=normalized_type,
            record_id=str(actualization.id),
            record_label=f"Actualization {actualization.id}",
            summary=(
                f"Delivery {actualization.delivery_id} • Trade {actualization.trade_id} • "
                f"{float(actualization.actual_quantity)} • {state}"
            ),
        )
    elif normalized_type == "PRICE_INDEX":
        price_index = db.get(ReferencePriceIndex, normalized_id)
        if price_index is None:
            raise LookupError(f"Price index '{normalized_id}' was not found.")
        resolved = ResolvedRecordTarget(
            record_type=normalized_type,
            record_id=price_index.code,
            record_label=f"Price Index {price_index.code}",
            summary=_summarize_price_index(price_index),
        )
    elif normalized_type == "PRICE_INDEX_OBSERVATION":
        observation = db.get(PriceIndexObservation, _coerce_int_id(normalized_id, label="price observation"))
        if observation is None:
            raise LookupError(f"Price observation '{normalized_id}' was not found.")
        resolved = ResolvedRecordTarget(
            record_type=normalized_type,
            record_id=str(observation.id),
            record_label=f"Price Observation {observation.price_index_code} {observation.observation_date.isoformat()}",
            summary=(
                f"{observation.source_provider} • {observation.source_series_id} • "
                f"{observation.value} {observation.currency_code or ''}/{observation.unit_code}"
            ),
        )
    else:
        raise ValueError(f"Document links do not support record type '{normalized_type}'.")

    cache[cache_key] = resolved
    return resolved


def _summarize_trade(trade: Trade) -> str:
    parts = [trade.counterparty, trade.commodity, trade.book]
    normalized_parts = [str(part).strip() for part in parts if str(part or "").strip()]
    return " • ".join(normalized_parts) or "Linked trade record"


def _summarize_price_index(price_index: ReferencePriceIndex) -> str:
    parts = [price_index.provider, price_index.commodity_code, price_index.market, price_index.location_code]
    normalized_parts = [str(part).strip() for part in parts if str(part or "").strip()]
    return " • ".join(normalized_parts) or "Linked price index"


def _coerce_int_id(value: str, *, label: str) -> int:
    try:
        return int(str(value).strip())
    except ValueError as exc:
        raise ValueError(f"Document links require a numeric {label} record id.") from exc


def _coerce_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
