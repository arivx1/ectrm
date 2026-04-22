from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class ReferenceCounterpartyCreditProfile(Base):
    __tablename__ = "counterparty_credit_profiles"

    counterparty_code: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("reference_counterparties.code"),
        primary_key=True,
    )
    credit_rating: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    review_due_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    limit_currency_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    limit_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    breach_action: Mapped[str] = mapped_column(String(50), nullable=False, default="REQUIRE_APPROVAL")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
