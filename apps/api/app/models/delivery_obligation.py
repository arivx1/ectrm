from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class DeliveryObligation(Base):
    __tablename__ = "delivery_obligations"
    __table_args__ = (
        UniqueConstraint("trade_leg_id", name="uq_delivery_obligations_trade_leg_id"),
    )

    delivery_id: Mapped[str] = mapped_column(String(96), primary_key=True)
    trade_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("trades.trade_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    trade_leg_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("trade_legs.trade_leg_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    leg_no: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    external_trade_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    mode_family: Mapped[str] = mapped_column(String(32), nullable=False)
    transport_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    transport_mode_source: Mapped[str] = mapped_column(String(32), nullable=False)
    delivery_profile: Mapped[str] = mapped_column(String(32), nullable=False)
    book: Mapped[str] = mapped_column(String(50), nullable=False)
    book_source: Mapped[str] = mapped_column(String(32), nullable=False)
    portfolio: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    portfolio_source: Mapped[str] = mapped_column(String(32), nullable=False)
    counterparty: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    counterparty_source: Mapped[str] = mapped_column(String(32), nullable=False)
    commodity_class: Mapped[str] = mapped_column(String(50), nullable=False)
    commodity: Mapped[str] = mapped_column(String(50), nullable=False)
    volume: Mapped[Optional[float]] = mapped_column(Numeric(18, 6), nullable=True)
    unit_of_measure: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    trade_currency_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    price_unit_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    location_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    location_source: Mapped[str] = mapped_column(String(32), nullable=False)
    delivery_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    delivery_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    delivery_window_source: Mapped[str] = mapped_column(String(32), nullable=False)
    execution_status: Mapped[str] = mapped_column(String(32), nullable=False)
    execution_status_source: Mapped[str] = mapped_column(String(32), nullable=False)
    operations_owner: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    operations_owner_source: Mapped[str] = mapped_column(String(32), nullable=False)
    external_reference: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    external_reference_source: Mapped[str] = mapped_column(String(32), nullable=False)
    ops_notes: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    ops_notes_source: Mapped[str] = mapped_column(String(32), nullable=False)
    booked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source_trade_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
