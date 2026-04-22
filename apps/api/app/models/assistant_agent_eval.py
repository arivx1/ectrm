from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.models.event import Base


class AssistantAgentEval(Base):
    __tablename__ = "assistant_agent_evals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("assistant_agents.agent_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    workspace: Mapped[str] = mapped_column(String(32), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    use_live_tools: Mapped[bool] = mapped_column(Boolean, nullable=False)
    expected_substrings: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    expected_tool_names: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    expected_action_types: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)


class AssistantAgentEvalRun(Base):
    __tablename__ = "assistant_agent_eval_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    eval_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("assistant_agent_evals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("assistant_agents.agent_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    run_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("assistant_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    failure_reasons: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    observed_tool_names: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    observed_action_types: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    response_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    run_by: Mapped[str] = mapped_column(String(128), nullable=False)
