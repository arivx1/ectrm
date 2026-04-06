from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from typing import Optional

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class ReferenceCounterpartyExternalCreditSnapshot(Base):
    __tablename__ = "counterparty_external_credit_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "counterparty_code",
            "provider",
            "as_of_date",
            name="uq_counterparty_external_credit_snapshot",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    counterparty_code: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("reference_counterparties.code"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    source_entity_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    source_entity_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    match_basis: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    matched_identifier_value: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    as_of_date: Mapped[date] = mapped_column(Date, nullable=False)
    rating_scale: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    rating_value: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    rating_outlook: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    credit_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    probability_of_default: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 6), nullable=True)
    recommended_limit_currency_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    recommended_limit_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    commentary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    downloaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    run_id: Mapped[int] = mapped_column(ForeignKey("external_data_runs.id"), nullable=False)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
