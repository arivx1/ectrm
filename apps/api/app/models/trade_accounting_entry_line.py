from __future__ import annotations

from decimal import Decimal
from typing import Optional

from sqlalchemy import ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class TradeAccountingEntryLine(Base):
    __tablename__ = "trade_accounting_entry_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    accounting_entry_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("trade_accounting_entries.accounting_entry_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    side: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    account_code: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    reference_code: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
