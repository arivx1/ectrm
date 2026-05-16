from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from apps.api.app.schemas._validation import normalize_optional_text, normalize_required_text

MessagingWorkspaceConversationSection = Literal["Starred", "Channels", "Follow-up", "Direct messages"]
MessagingWorkspaceConversationKind = Literal["channel", "dm"]
MessagingWorkspaceMemberTone = Literal["desk", "human", "ops", "system"]
MessagingWorkspacePostSource = Literal["human", "assistant"]


class MessagingWorkspaceMemberOut(BaseModel):
    name: str
    title: str
    presence: str
    initials: str
    tone: MessagingWorkspaceMemberTone


class MessagingWorkspaceConversationSummaryOut(BaseModel):
    conversation_id: str
    section: MessagingWorkspaceConversationSection
    kind: MessagingWorkspaceConversationKind
    label: str
    connected_workspace: str
    assistant_workspace: str
    description: str
    topic: str
    composer_hint: str
    sort_order: int
    message_count: int = 0
    latest_message_preview: str | None = None
    latest_message_at: datetime | None = None


class MessagingWorkspaceMessageOut(BaseModel):
    message_id: str
    conversation_id: str
    source: MessagingWorkspacePostSource
    body: str
    author: MessagingWorkspaceMemberOut
    assistant_run_id: int | None = None
    assistant_agent_id: str | None = None
    assistant_agent_name: str | None = None
    created_by_user_id: str | None = None
    created_by_session_id: str | None = None
    created_by_role: str | None = None
    created_at: datetime


class MessagingWorkspaceStateOut(BaseModel):
    conversations: list[MessagingWorkspaceConversationSummaryOut] = Field(default_factory=list)
    messages: list[MessagingWorkspaceMessageOut] = Field(default_factory=list)


class MessagingWorkspacePostCreate(BaseModel):
    conversation_id: str
    body: str
    source: MessagingWorkspacePostSource = "human"
    assistant_run_id: int | None = None
    assistant_agent_id: str | None = None
    assistant_agent_name: str | None = None

    @field_validator("conversation_id")
    @classmethod
    def normalize_conversation_id(cls, value: str) -> str:
        return normalize_required_text(value, field_name="conversation_id")

    @field_validator("body")
    @classmethod
    def normalize_body(cls, value: str) -> str:
        return normalize_required_text(value, field_name="body")

    @field_validator("assistant_agent_id", "assistant_agent_name")
    @classmethod
    def normalize_optional_text_field(cls, value: str | None, info) -> str | None:
        return normalize_optional_text(value, field_name=info.field_name)
