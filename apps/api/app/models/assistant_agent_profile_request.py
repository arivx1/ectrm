from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class AssistantAgentProfileRequest(Base):
    __tablename__ = "assistant_agent_profile_requests"

    request_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    request_kind: Mapped[str] = mapped_column(String(32), nullable=False, default="NEW_SPECIALIZATION")
    target_agent_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    requested_agent_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    change_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    business_problem: Mapped[str] = mapped_column(Text, nullable=False)
    proposed_mission: Mapped[str] = mapped_column(Text, nullable=False)
    human_owner_role: Mapped[str] = mapped_column(String(128), nullable=False)
    requested_workspaces: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    work_objects: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    requested_inputs_tools: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    requested_action_types: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    requested_skills: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    expected_outputs: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    requested_authority_ceiling: Mapped[str] = mapped_column(String(32), nullable=False)
    stop_conditions: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    success_metrics: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    proposed_eval_cases: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    approval_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    linked_agent_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    linked_revision_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    requested_by: Mapped[str] = mapped_column(String(128), nullable=False)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    activated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    activated_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
