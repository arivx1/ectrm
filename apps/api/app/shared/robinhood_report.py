from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Iterable

from apps.api.app.shared.robinhood_csv import RobinhoodNormalizedRow


ZERO = Decimal("0")


@dataclass(frozen=True)
class RobinhoodSymbolSummary:
    symbol: str
    row_count: int
    net_quantity: str | None
    buy_quantity: str | None
    sell_quantity: str | None
    buy_amount: str | None
    sell_amount: str | None
    dividend_amount: str | None
    fee_amount: str | None
    net_cash: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "symbol": self.symbol,
            "row_count": self.row_count,
            "net_quantity": self.net_quantity,
            "buy_quantity": self.buy_quantity,
            "sell_quantity": self.sell_quantity,
            "buy_amount": self.buy_amount,
            "sell_amount": self.sell_amount,
            "dividend_amount": self.dividend_amount,
            "fee_amount": self.fee_amount,
            "net_cash": self.net_cash,
        }


@dataclass(frozen=True)
class RobinhoodActivityReport:
    row_count: int
    first_activity_at: str | None
    last_activity_at: str | None
    activity_families: dict[str, int]
    net_cash: str | None
    cash_in_amount: str | None
    cash_out_amount: str | None
    trade_buy_amount: str | None
    trade_sell_amount: str | None
    dividend_amount: str | None
    dividend_reinvestment_amount: str | None
    interest_amount: str | None
    fee_amount: str | None
    tax_amount: str | None
    other_credit_amount: str | None
    other_debit_amount: str | None
    symbols: list[RobinhoodSymbolSummary]

    def to_dict(self) -> dict[str, object]:
        return {
            "row_count": self.row_count,
            "first_activity_at": self.first_activity_at,
            "last_activity_at": self.last_activity_at,
            "activity_families": self.activity_families,
            "net_cash": self.net_cash,
            "cash_in_amount": self.cash_in_amount,
            "cash_out_amount": self.cash_out_amount,
            "trade_buy_amount": self.trade_buy_amount,
            "trade_sell_amount": self.trade_sell_amount,
            "dividend_amount": self.dividend_amount,
            "dividend_reinvestment_amount": self.dividend_reinvestment_amount,
            "interest_amount": self.interest_amount,
            "fee_amount": self.fee_amount,
            "tax_amount": self.tax_amount,
            "other_credit_amount": self.other_credit_amount,
            "other_debit_amount": self.other_debit_amount,
            "symbols": [symbol.to_dict() for symbol in self.symbols],
        }


def summarize_robinhood_rows(
    rows: Iterable[RobinhoodNormalizedRow],
    *,
    top_symbols: int = 10,
) -> RobinhoodActivityReport:
    materialized_rows = list(rows)

    activity_counter = Counter(row.activity_family for row in materialized_rows)
    activity_dates = sorted(
        row.occurred_at
        for row in materialized_rows
        if row.occurred_at is not None
    )

    net_cash = ZERO
    cash_in_amount = ZERO
    cash_out_amount = ZERO
    trade_buy_amount = ZERO
    trade_sell_amount = ZERO
    dividend_amount = ZERO
    dividend_reinvestment_amount = ZERO
    interest_amount = ZERO
    fee_amount = ZERO
    tax_amount = ZERO
    other_credit_amount = ZERO
    other_debit_amount = ZERO

    symbol_buckets: dict[str, dict[str, Decimal | int]] = {}

    for row in materialized_rows:
        amount = _parse_decimal(row.amount)
        quantity = _parse_decimal(row.quantity)
        family = row.activity_family

        if amount is not None:
            net_cash += amount

        if family == "CASH_IN":
            cash_in_amount += _positive_or_zero(amount)
        elif family == "CASH_OUT":
            cash_out_amount += _absolute_or_zero(amount)
        elif family == "TRADE_BUY":
            trade_buy_amount += _absolute_or_zero(amount)
        elif family == "TRADE_SELL":
            trade_sell_amount += _positive_or_zero(amount)
        elif family == "DIVIDEND":
            dividend_amount += _positive_or_zero(amount)
        elif family == "DIVIDEND_REINVESTMENT":
            dividend_reinvestment_amount += _absolute_or_zero(amount)
        elif family == "INTEREST":
            interest_amount += _positive_or_zero(amount)
        elif family == "FEE":
            fee_amount += _absolute_or_zero(amount)
        elif family == "TAX":
            tax_amount += _absolute_or_zero(amount)
        elif amount is not None and amount > ZERO:
            other_credit_amount += amount
        elif amount is not None and amount < ZERO:
            other_debit_amount += abs(amount)

        if row.symbol is None:
            continue

        bucket = symbol_buckets.setdefault(
            row.symbol,
            {
                "row_count": 0,
                "net_quantity": ZERO,
                "buy_quantity": ZERO,
                "sell_quantity": ZERO,
                "buy_amount": ZERO,
                "sell_amount": ZERO,
                "dividend_amount": ZERO,
                "fee_amount": ZERO,
                "net_cash": ZERO,
            },
        )
        bucket["row_count"] = int(bucket["row_count"]) + 1

        if amount is not None:
            bucket["net_cash"] = _decimal(bucket["net_cash"]) + amount

        if family == "TRADE_BUY":
            if quantity is not None:
                bucket["net_quantity"] = _decimal(bucket["net_quantity"]) + quantity
                bucket["buy_quantity"] = _decimal(bucket["buy_quantity"]) + quantity
            bucket["buy_amount"] = _decimal(bucket["buy_amount"]) + _absolute_or_zero(amount)
        elif family == "TRADE_SELL":
            if quantity is not None:
                bucket["net_quantity"] = _decimal(bucket["net_quantity"]) - quantity
                bucket["sell_quantity"] = _decimal(bucket["sell_quantity"]) + quantity
            bucket["sell_amount"] = _decimal(bucket["sell_amount"]) + _positive_or_zero(amount)
        elif family in {"DIVIDEND", "DIVIDEND_REINVESTMENT"}:
            bucket["dividend_amount"] = _decimal(bucket["dividend_amount"]) + _positive_or_zero(amount)
        elif family == "FEE":
            bucket["fee_amount"] = _decimal(bucket["fee_amount"]) + _absolute_or_zero(amount)

    ranked_symbols = sorted(
        symbol_buckets.items(),
        key=lambda item: (
            -int(item[1]["row_count"]),
            -abs(_decimal(item[1]["net_cash"])),
            item[0],
        ),
    )

    symbol_summaries = [
        RobinhoodSymbolSummary(
            symbol=symbol,
            row_count=int(bucket["row_count"]),
            net_quantity=_format_non_zero_decimal(_decimal(bucket["net_quantity"])),
            buy_quantity=_format_non_zero_decimal(_decimal(bucket["buy_quantity"])),
            sell_quantity=_format_non_zero_decimal(_decimal(bucket["sell_quantity"])),
            buy_amount=_format_non_zero_decimal(_decimal(bucket["buy_amount"])),
            sell_amount=_format_non_zero_decimal(_decimal(bucket["sell_amount"])),
            dividend_amount=_format_non_zero_decimal(_decimal(bucket["dividend_amount"])),
            fee_amount=_format_non_zero_decimal(_decimal(bucket["fee_amount"])),
            net_cash=_format_non_zero_decimal(_decimal(bucket["net_cash"])),
        )
        for symbol, bucket in ranked_symbols[:max(top_symbols, 0)]
    ]

    return RobinhoodActivityReport(
        row_count=len(materialized_rows),
        first_activity_at=activity_dates[0] if activity_dates else None,
        last_activity_at=activity_dates[-1] if activity_dates else None,
        activity_families=dict(sorted(activity_counter.items())),
        net_cash=_format_decimal(net_cash),
        cash_in_amount=_format_decimal(cash_in_amount),
        cash_out_amount=_format_decimal(cash_out_amount),
        trade_buy_amount=_format_decimal(trade_buy_amount),
        trade_sell_amount=_format_decimal(trade_sell_amount),
        dividend_amount=_format_decimal(dividend_amount),
        dividend_reinvestment_amount=_format_decimal(dividend_reinvestment_amount),
        interest_amount=_format_decimal(interest_amount),
        fee_amount=_format_decimal(fee_amount),
        tax_amount=_format_decimal(tax_amount),
        other_credit_amount=_format_decimal(other_credit_amount),
        other_debit_amount=_format_decimal(other_debit_amount),
        symbols=symbol_summaries,
    )


def render_robinhood_report_text(report: RobinhoodActivityReport) -> str:
    lines = [
        "Robinhood activity summary",
        f"Rows: {report.row_count}",
        f"Activity window: {_render_range(report.first_activity_at, report.last_activity_at)}",
        f"Net cash: {_display_money(report.net_cash)}",
        f"Cash in: {_display_money(report.cash_in_amount)}",
        f"Cash out: {_display_money(report.cash_out_amount)}",
        f"Trade buys: {_display_money(report.trade_buy_amount)}",
        f"Trade sells: {_display_money(report.trade_sell_amount)}",
        f"Dividends: {_display_money(report.dividend_amount)}",
        f"Dividend reinvestment: {_display_money(report.dividend_reinvestment_amount)}",
        f"Interest: {_display_money(report.interest_amount)}",
        f"Fees: {_display_money(report.fee_amount)}",
        f"Taxes: {_display_money(report.tax_amount)}",
    ]

    if report.activity_families:
        activity_summary = ", ".join(
            f"{family}={count}" for family, count in sorted(report.activity_families.items())
        )
        lines.append(f"Activity families: {activity_summary}")

    if report.symbols:
        lines.append("Top symbols:")
        for symbol in report.symbols:
            lines.append(
                "  "
                + f"{symbol.symbol}: rows={symbol.row_count}, "
                + f"net_qty={symbol.net_quantity or '0'}, "
                + f"buy_amt={_display_money(symbol.buy_amount)}, "
                + f"sell_amt={_display_money(symbol.sell_amount)}, "
                + f"net_cash={_display_money(symbol.net_cash)}"
            )

    return "\n".join(lines)


def _parse_decimal(value: str | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(value)
    except InvalidOperation:
        return None


def _decimal(value: Decimal | int) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(value)


def _absolute_or_zero(value: Decimal | None) -> Decimal:
    if value is None:
        return ZERO
    return abs(value)


def _positive_or_zero(value: Decimal | None) -> Decimal:
    if value is None or value <= ZERO:
        return ZERO
    return value


def _format_decimal(value: Decimal) -> str:
    return format(value, "f")


def _format_non_zero_decimal(value: Decimal) -> str | None:
    if value == ZERO:
        return None
    return _format_decimal(value)


def _display_money(value: str | None) -> str:
    if value is None:
        return "0.00"
    return value


def _render_range(first_value: str | None, last_value: str | None) -> str:
    if first_value is None and last_value is None:
        return "n/a"
    if first_value == last_value:
        return first_value or "n/a"
    return f"{first_value or 'n/a'} to {last_value or 'n/a'}"
