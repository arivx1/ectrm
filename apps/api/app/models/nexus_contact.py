from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class NexusContact(Base):
    __tablename__ = "nexus_contacts"
    __table_args__ = (
        UniqueConstraint(
            "external_provider",
            "external_record_id",
            name="uq_nexus_contacts_external_record",
        ),
    )

    contact_id: Mapped[str] = mapped_column(String(96), primary_key=True)
    client_name: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    role: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    time_at_role: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    previous_role: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    university: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    university_2: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    web_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    source: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    external_provider: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    external_record_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
