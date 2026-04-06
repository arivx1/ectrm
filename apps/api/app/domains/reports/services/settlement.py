from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.settlement_invoices import list_trade_invoices
from apps.api.app.domains.operations.services.settlement_payments import list_trade_payments
from apps.api.app.schemas.settlement import TradeInvoiceOut, TradePaymentOut
from apps.api.app.shared.enums import InvoiceStatus, PaymentStatus

ZERO = Decimal("0")
CASH_FORECAST_BASIS = (
    "Expected cash is derived from outstanding invoice balances due on or before the forecast horizon. "
    "Received cash is derived from payment receipts recorded in the settlement ledger."
)
DISPUTED_INVOICE_EXCEPTION = "DISPUTED_INVOICE"
SHORT_PAY_EXCEPTION = "SHORT_PAY"
OVERDUE_PAYMENT_EXCEPTION = "OVERDUE_PAYMENT"


def _as_of_datetime(as_of: date | None) -> datetime:
    if as_of is None:
        return datetime.now(timezone.utc)
    return datetime.combine(as_of, time(hour=12), tzinfo=timezone.utc)


def _to_decimal(value: object | None) -> Decimal:
    if value is None:
        return ZERO
    return Decimal(str(value))


def _outstanding_amount_for_invoice(
    invoice: TradeInvoiceOut,
    payments_by_invoice_id: dict[int, list[TradePaymentOut]],
) -> Decimal:
    payments = payments_by_invoice_id.get(invoice.invoice_id, [])
    if payments:
        return max(_to_decimal(payments[0].outstanding_amount), ZERO)
    if invoice.status == InvoiceStatus.NOT_REQUIRED.value:
        return ZERO
    return max(_to_decimal(invoice.invoice_amount), ZERO)


def _total_paid_amount_for_invoice(
    payments_by_invoice_id: dict[int, list[TradePaymentOut]],
    *,
    invoice_id: int,
) -> Decimal:
    return sum(
        (
            _to_decimal(payment.payment_amount)
            for payment in payments_by_invoice_id.get(invoice_id, [])
            if payment.status == PaymentStatus.PAID.value
        ),
        start=ZERO,
    )


def _last_received_at_for_invoice(
    payments_by_invoice_id: dict[int, list[TradePaymentOut]],
    *,
    invoice_id: int,
) -> datetime | None:
    received_values = [
        payment.received_at
        for payment in payments_by_invoice_id.get(invoice_id, [])
        if payment.received_at is not None and payment.status == PaymentStatus.PAID.value
    ]
    return max(received_values) if received_values else None


def _next_due_at_for_invoice(
    invoice: TradeInvoiceOut,
    payments_by_invoice_id: dict[int, list[TradePaymentOut]],
) -> datetime:
    unpaid_due_dates = [
        payment.due_at
        for payment in payments_by_invoice_id.get(invoice.invoice_id, [])
        if payment.status not in {PaymentStatus.PAID.value, PaymentStatus.NOT_REQUIRED.value}
    ]
    if unpaid_due_dates:
        return min(unpaid_due_dates)
    return invoice.due_at


def _owner_for_exception(
    invoice: TradeInvoiceOut,
    payments_by_invoice_id: dict[int, list[TradePaymentOut]],
    *,
    exception_type: str,
) -> str | None:
    if exception_type == DISPUTED_INVOICE_EXCEPTION:
        return invoice.workflow_owner

    payment_owners = [
        payment.workflow_owner
        for payment in payments_by_invoice_id.get(invoice.invoice_id, [])
        if payment.workflow_owner
    ]
    return payment_owners[0] if payment_owners else invoice.workflow_owner


def _days_past_due(*, reference_date: date, due_date: date) -> int:
    return max((reference_date - due_date).days, 0)


def _aging_bucket(days_past_due: int) -> str:
    if days_past_due <= 0:
        return "current_amount"
    if days_past_due <= 7:
        return "past_due_1_7_amount"
    if days_past_due <= 30:
        return "past_due_8_30_amount"
    return "past_due_31_plus_amount"


@dataclass
class _AgingAggregate:
    invoice_count: int = 0
    overdue_invoice_count: int = 0
    disputed_invoice_count: int = 0
    total_outstanding_amount: Decimal = ZERO
    current_amount: Decimal = ZERO
    past_due_1_7_amount: Decimal = ZERO
    past_due_8_30_amount: Decimal = ZERO
    past_due_31_plus_amount: Decimal = ZERO
    disputed_amount: Decimal = ZERO
    oldest_due_at: datetime | None = None
    latest_due_at: datetime | None = None
    trade_ids: set[str] = field(default_factory=set)

    def add_invoice(
        self,
        *,
        invoice: TradeInvoiceOut,
        outstanding_amount: Decimal,
        reference_date: date,
    ) -> None:
        self.invoice_count += 1
        self.total_outstanding_amount += outstanding_amount
        self.trade_ids.add(invoice.trade_id)

        due_at = invoice.due_at
        due_date = due_at.date()
        days_past_due = _days_past_due(reference_date=reference_date, due_date=due_date)
        setattr(self, _aging_bucket(days_past_due), getattr(self, _aging_bucket(days_past_due)) + outstanding_amount)

        if days_past_due > 0:
            self.overdue_invoice_count += 1
        if invoice.status == InvoiceStatus.DISPUTED.value:
            self.disputed_invoice_count += 1
            self.disputed_amount += outstanding_amount

        if self.oldest_due_at is None or due_at < self.oldest_due_at:
            self.oldest_due_at = due_at
        if self.latest_due_at is None or due_at > self.latest_due_at:
            self.latest_due_at = due_at

    def to_currency_summary(self, *, currency_code: str) -> dict[str, object]:
        return {
            "currency_code": currency_code,
            "invoice_count": self.invoice_count,
            "overdue_invoice_count": self.overdue_invoice_count,
            "disputed_invoice_count": self.disputed_invoice_count,
            "total_outstanding_amount": float(self.total_outstanding_amount),
            "current_amount": float(self.current_amount),
            "past_due_1_7_amount": float(self.past_due_1_7_amount),
            "past_due_8_30_amount": float(self.past_due_8_30_amount),
            "past_due_31_plus_amount": float(self.past_due_31_plus_amount),
            "disputed_amount": float(self.disputed_amount),
        }

    def to_row(
        self,
        *,
        counterparty_code: str | None,
        book: str,
        currency_code: str,
    ) -> dict[str, object]:
        return {
            "counterparty_code": counterparty_code,
            "book": book,
            "currency_code": currency_code,
            "invoice_count": self.invoice_count,
            "trade_count": len(self.trade_ids),
            "overdue_invoice_count": self.overdue_invoice_count,
            "disputed_invoice_count": self.disputed_invoice_count,
            "total_outstanding_amount": float(self.total_outstanding_amount),
            "current_amount": float(self.current_amount),
            "past_due_1_7_amount": float(self.past_due_1_7_amount),
            "past_due_8_30_amount": float(self.past_due_8_30_amount),
            "past_due_31_plus_amount": float(self.past_due_31_plus_amount),
            "disputed_amount": float(self.disputed_amount),
            "oldest_due_at": self.oldest_due_at,
            "latest_due_at": self.latest_due_at,
        }


@dataclass
class _CashForecastCurrencyAggregate:
    open_outstanding_amount: Decimal = ZERO
    overdue_outstanding_amount: Decimal = ZERO
    expected_horizon_amount: Decimal = ZERO
    received_horizon_amount: Decimal = ZERO
    upcoming_invoice_count: int = 0
    overdue_invoice_count: int = 0
    received_payment_count: int = 0

    def to_summary(self, *, currency_code: str) -> dict[str, object]:
        return {
            "currency_code": currency_code,
            "open_outstanding_amount": float(self.open_outstanding_amount),
            "overdue_outstanding_amount": float(self.overdue_outstanding_amount),
            "expected_horizon_amount": float(self.expected_horizon_amount),
            "received_horizon_amount": float(self.received_horizon_amount),
            "upcoming_invoice_count": self.upcoming_invoice_count,
            "overdue_invoice_count": self.overdue_invoice_count,
            "received_payment_count": self.received_payment_count,
        }


@dataclass
class _CashForecastPointAggregate:
    expected_amount: Decimal = ZERO
    received_amount: Decimal = ZERO
    expected_invoice_count: int = 0
    received_payment_count: int = 0

    def to_point(self, *, forecast_date: date, currency_code: str) -> dict[str, object]:
        return {
            "forecast_date": forecast_date,
            "currency_code": currency_code,
            "expected_amount": float(self.expected_amount),
            "received_amount": float(self.received_amount),
            "expected_invoice_count": self.expected_invoice_count,
            "received_payment_count": self.received_payment_count,
        }


@dataclass
class _ExceptionAggregate:
    exception_count: int = 0
    total_outstanding_amount: Decimal = ZERO
    trade_ids: set[str] = field(default_factory=set)

    def add_row(self, *, trade_id: str, outstanding_amount: Decimal) -> None:
        self.exception_count += 1
        self.total_outstanding_amount += outstanding_amount
        self.trade_ids.add(trade_id)

    def to_summary(self, *, exception_type: str, currency_code: str) -> dict[str, object]:
        return {
            "exception_type": exception_type,
            "currency_code": currency_code,
            "exception_count": self.exception_count,
            "affected_trade_count": len(self.trade_ids),
            "total_outstanding_amount": float(self.total_outstanding_amount),
        }


def build_settlement_aging_report(
    db: Session,
    *,
    as_of: date | None = None,
) -> dict[str, object]:
    generated_at = _as_of_datetime(as_of)
    reference_date = generated_at.date()
    invoices = list_trade_invoices(db, now=generated_at)
    payments = list_trade_payments(db, now=generated_at)

    payments_by_invoice_id: dict[int, list[TradePaymentOut]] = defaultdict(list)
    for payment in payments:
        payments_by_invoice_id[payment.invoice_id].append(payment)

    currency_aggregates: dict[str, _AgingAggregate] = {}
    row_aggregates: dict[tuple[str | None, str, str], _AgingAggregate] = {}
    invoice_count = 0
    overdue_invoice_count = 0
    disputed_invoice_count = 0

    for invoice in invoices:
        outstanding_amount = _outstanding_amount_for_invoice(invoice, payments_by_invoice_id)
        if outstanding_amount <= ZERO:
            continue

        invoice_count += 1
        due_is_overdue = invoice.due_at.date() < reference_date
        if due_is_overdue:
            overdue_invoice_count += 1
        if invoice.status == InvoiceStatus.DISPUTED.value:
            disputed_invoice_count += 1

        currency_key = invoice.invoice_currency_code
        currency_aggregate = currency_aggregates.setdefault(currency_key, _AgingAggregate())
        currency_aggregate.add_invoice(
            invoice=invoice,
            outstanding_amount=outstanding_amount,
            reference_date=reference_date,
        )

        row_key = (invoice.counterparty, invoice.book, currency_key)
        row_aggregate = row_aggregates.setdefault(row_key, _AgingAggregate())
        row_aggregate.add_invoice(
            invoice=invoice,
            outstanding_amount=outstanding_amount,
            reference_date=reference_date,
        )

    rows = [
        aggregate.to_row(counterparty_code=counterparty_code, book=book, currency_code=currency_code)
        for (counterparty_code, book, currency_code), aggregate in row_aggregates.items()
    ]
    rows.sort(
        key=lambda row: (
            -int(row["overdue_invoice_count"]),
            -float(row["total_outstanding_amount"]),
            str(row["counterparty_code"] or ""),
            str(row["book"]),
            str(row["currency_code"]),
        )
    )

    currency_summaries = [
        aggregate.to_currency_summary(currency_code=currency_code)
        for currency_code, aggregate in currency_aggregates.items()
    ]
    currency_summaries.sort(
        key=lambda row: (-float(row["total_outstanding_amount"]), str(row["currency_code"]))
    )

    return {
        "generated_at": generated_at,
        "as_of": reference_date,
        "row_count": len(rows),
        "invoice_count": invoice_count,
        "overdue_invoice_count": overdue_invoice_count,
        "disputed_invoice_count": disputed_invoice_count,
        "currency_summaries": currency_summaries,
        "rows": rows,
    }


def build_cash_forecast_report(
    db: Session,
    *,
    as_of: date | None = None,
    horizon_days: int = 30,
) -> dict[str, object]:
    if horizon_days <= 0:
        raise ValueError("horizon_days must be greater than zero.")
    if horizon_days > 180:
        raise ValueError("horizon_days must be less than or equal to 180.")

    generated_at = _as_of_datetime(as_of)
    reference_date = generated_at.date()
    horizon_end = reference_date + timedelta(days=horizon_days)

    invoices = list_trade_invoices(db, now=generated_at)
    payments = list_trade_payments(db, now=generated_at)

    payments_by_invoice_id: dict[int, list[TradePaymentOut]] = defaultdict(list)
    for payment in payments:
        payments_by_invoice_id[payment.invoice_id].append(payment)

    currency_aggregates: dict[str, _CashForecastCurrencyAggregate] = {}
    point_aggregates: dict[tuple[date, str], _CashForecastPointAggregate] = {}

    for invoice in invoices:
        outstanding_amount = _outstanding_amount_for_invoice(invoice, payments_by_invoice_id)
        if outstanding_amount <= ZERO:
            continue

        currency_key = invoice.invoice_currency_code
        aggregate = currency_aggregates.setdefault(currency_key, _CashForecastCurrencyAggregate())
        aggregate.open_outstanding_amount += outstanding_amount

        due_date = invoice.due_at.date()
        if due_date < reference_date:
            aggregate.overdue_outstanding_amount += outstanding_amount
            aggregate.overdue_invoice_count += 1
        elif due_date <= horizon_end:
            aggregate.expected_horizon_amount += outstanding_amount
            aggregate.upcoming_invoice_count += 1
            point = point_aggregates.setdefault((due_date, currency_key), _CashForecastPointAggregate())
            point.expected_amount += outstanding_amount
            point.expected_invoice_count += 1

    for payment in payments:
        if payment.status != PaymentStatus.PAID.value or payment.received_at is None:
            continue

        received_date = payment.received_at.date()
        if received_date < reference_date or received_date > horizon_end:
            continue

        currency_key = payment.payment_currency_code
        aggregate = currency_aggregates.setdefault(currency_key, _CashForecastCurrencyAggregate())
        received_amount = _to_decimal(payment.payment_amount)
        aggregate.received_horizon_amount += received_amount
        aggregate.received_payment_count += 1

        point = point_aggregates.setdefault((received_date, currency_key), _CashForecastPointAggregate())
        point.received_amount += received_amount
        point.received_payment_count += 1

    currency_summaries = [
        aggregate.to_summary(currency_code=currency_code)
        for currency_code, aggregate in currency_aggregates.items()
    ]
    currency_summaries.sort(
        key=lambda row: (
            -float(row["open_outstanding_amount"]),
            str(row["currency_code"]),
        )
    )

    points = [
        aggregate.to_point(forecast_date=forecast_date, currency_code=currency_code)
        for (forecast_date, currency_code), aggregate in point_aggregates.items()
    ]
    points.sort(key=lambda row: (row["forecast_date"], row["currency_code"]))

    return {
        "generated_at": generated_at,
        "as_of": reference_date,
        "horizon_days": horizon_days,
        "basis": CASH_FORECAST_BASIS,
        "row_count": len(points),
        "currency_summaries": currency_summaries,
        "points": points,
    }


def build_settlement_exception_report(
    db: Session,
    *,
    as_of: date | None = None,
) -> dict[str, object]:
    generated_at = _as_of_datetime(as_of)
    reference_date = generated_at.date()
    invoices = list_trade_invoices(db, now=generated_at)
    payments = list_trade_payments(db, now=generated_at)

    payments_by_invoice_id: dict[int, list[TradePaymentOut]] = defaultdict(list)
    for payment in payments:
        payments_by_invoice_id[payment.invoice_id].append(payment)

    rows: list[dict[str, object]] = []
    aggregates: dict[tuple[str, str], _ExceptionAggregate] = {}
    blocked_count = 0
    warning_count = 0

    def add_exception_row(
        *,
        exception_type: str,
        severity: str,
        invoice: TradeInvoiceOut,
        due_at: datetime | None,
        last_received_at: datetime | None,
        total_paid_amount: Decimal,
        outstanding_amount: Decimal,
        days_past_due: int,
        summary: str,
    ) -> None:
        nonlocal blocked_count, warning_count
        if severity == "blocked":
            blocked_count += 1
        else:
            warning_count += 1

        aggregates.setdefault((exception_type, invoice.invoice_currency_code), _ExceptionAggregate()).add_row(
            trade_id=invoice.trade_id,
            outstanding_amount=outstanding_amount,
        )
        rows.append(
            {
                "exception_type": exception_type,
                "severity": severity,
                "trade_id": invoice.trade_id,
                "invoice_id": invoice.invoice_id,
                "invoice_number": invoice.invoice_number,
                "counterparty_code": invoice.counterparty,
                "book": invoice.book,
                "commodity": invoice.commodity,
                "currency_code": invoice.invoice_currency_code,
                "invoice_status": invoice.status,
                "payment_status": invoice.payment_status,
                "settlement_status": invoice.settlement_status,
                "owner": _owner_for_exception(
                    invoice,
                    payments_by_invoice_id,
                    exception_type=exception_type,
                ),
                "due_at": due_at,
                "last_received_at": last_received_at,
                "invoice_amount": float(invoice.invoice_amount),
                "total_paid_amount": float(total_paid_amount),
                "outstanding_amount": float(outstanding_amount),
                "days_past_due": days_past_due,
                "summary": summary,
            }
        )

    for invoice in invoices:
        outstanding_amount = _outstanding_amount_for_invoice(invoice, payments_by_invoice_id)
        total_paid_amount = _total_paid_amount_for_invoice(
            payments_by_invoice_id,
            invoice_id=invoice.invoice_id,
        )
        last_received_at = _last_received_at_for_invoice(
            payments_by_invoice_id,
            invoice_id=invoice.invoice_id,
        )
        next_due_at = _next_due_at_for_invoice(invoice, payments_by_invoice_id)
        days_past_due = _days_past_due(reference_date=reference_date, due_date=next_due_at.date())

        if invoice.status == InvoiceStatus.DISPUTED.value:
            add_exception_row(
                exception_type=DISPUTED_INVOICE_EXCEPTION,
                severity="blocked",
                invoice=invoice,
                due_at=next_due_at,
                last_received_at=last_received_at,
                total_paid_amount=total_paid_amount,
                outstanding_amount=outstanding_amount,
                days_past_due=days_past_due,
                summary=invoice.dispute_reason or "Invoice is disputed and needs operator resolution.",
            )

        if total_paid_amount > ZERO and outstanding_amount > ZERO:
            add_exception_row(
                exception_type=SHORT_PAY_EXCEPTION,
                severity="blocked" if days_past_due > 0 else "in-progress",
                invoice=invoice,
                due_at=next_due_at,
                last_received_at=last_received_at,
                total_paid_amount=total_paid_amount,
                outstanding_amount=outstanding_amount,
                days_past_due=days_past_due,
                summary=(
                    f"Received {invoice.invoice_currency_code} {total_paid_amount:.2f} "
                    f"against {invoice.invoice_currency_code} {Decimal(str(invoice.invoice_amount)):.2f}; "
                    f"{invoice.invoice_currency_code} {outstanding_amount:.2f} remains open."
                ),
            )

        if outstanding_amount > ZERO and days_past_due > 0:
            add_exception_row(
                exception_type=OVERDUE_PAYMENT_EXCEPTION,
                severity="blocked",
                invoice=invoice,
                due_at=next_due_at,
                last_received_at=last_received_at,
                total_paid_amount=total_paid_amount,
                outstanding_amount=outstanding_amount,
                days_past_due=days_past_due,
                summary=(
                    f"Outstanding cash is {days_past_due} day{'s' if days_past_due != 1 else ''} past due; "
                    f"{invoice.invoice_currency_code} {outstanding_amount:.2f} remains uncollected."
                ),
            )

    rows.sort(
        key=lambda row: (
            0 if row["severity"] == "blocked" else 1,
            -int(row["days_past_due"]),
            -float(row["outstanding_amount"]),
            str(row["counterparty_code"] or ""),
            str(row["trade_id"]),
            str(row["exception_type"]),
        )
    )

    summaries = [
        aggregate.to_summary(exception_type=exception_type, currency_code=currency_code)
        for (exception_type, currency_code), aggregate in aggregates.items()
    ]
    summaries.sort(
        key=lambda row: (
            -int(row["exception_count"]),
            -float(row["total_outstanding_amount"]),
            str(row["exception_type"]),
            str(row["currency_code"]),
        )
    )

    return {
        "generated_at": generated_at,
        "as_of": reference_date,
        "row_count": len(rows),
        "blocked_count": blocked_count,
        "warning_count": warning_count,
        "summaries": summaries,
        "rows": rows,
    }
