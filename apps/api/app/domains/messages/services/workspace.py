from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import uuid

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from apps.api.app.models.messaging_workspace_conversation import MessagingWorkspaceConversation
from apps.api.app.models.messaging_workspace_message import MessagingWorkspaceMessage
from apps.api.app.models.user_account import UserAccount
from apps.api.app.schemas.messaging import (
    MessagingWorkspaceConversationSummaryOut,
    MessagingWorkspaceMemberOut,
    MessagingWorkspaceMessageOut,
    MessagingWorkspacePostCreate,
    MessagingWorkspaceStateOut,
)


class MessagingWorkspaceError(RuntimeError):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class MessagingWorkspaceSeedConversation:
    conversation_id: str
    section: str
    kind: str
    label: str
    connected_workspace: str
    assistant_workspace: str
    description: str
    topic: str
    composer_hint: str
    sort_order: int


DEFAULT_MESSAGING_WORKSPACE_CONVERSATIONS: tuple[MessagingWorkspaceSeedConversation, ...] = (
    MessagingWorkspaceSeedConversation(
        conversation_id="ectrm-assistant",
        section="Starred",
        kind="channel",
        label="#ectrm-assistant",
        connected_workspace="Assistant Console",
        assistant_workspace="assistant",
        description="Governed assistant drafts, approvals, and operator replies stay in one lane.",
        topic="Keep governed assistant activity in the same feed as desk work, approval follow-through, and counterparty context.",
        composer_hint="Reply here to keep assistant guidance threaded beside the operational follow-up it affects.",
        sort_order=10,
    ),
    MessagingWorkspaceSeedConversation(
        conversation_id="counterparty-email",
        section="Channels",
        kind="channel",
        label="#counterparty-email",
        connected_workspace="Operations",
        assistant_workspace="operations",
        description="Counterparty communication stays readable like chat while still carrying email context.",
        topic="Use this lane for external timing notes, commercial clarifications, and the handoff back into operations or settlement.",
        composer_hint="Reply with desk confirmation or route the lane into Operations without losing the message context.",
        sort_order=20,
    ),
    MessagingWorkspaceSeedConversation(
        conversation_id="ops-follow-through",
        section="Follow-up",
        kind="channel",
        label="#ops-follow-through",
        connected_workspace="Operations",
        assistant_workspace="operations",
        description="Queue pressure becomes a visible channel so operators can review it like a real thread.",
        topic="Keep confirmations, delivery blockers, and queue digests readable in the same conversation surface as email and assistant follow-up.",
        composer_hint="Use this lane to leave handoff notes before opening the work queue for a specific blocker.",
        sort_order=30,
    ),
    MessagingWorkspaceSeedConversation(
        conversation_id="desk-attention",
        section="Follow-up",
        kind="channel",
        label="#desk-attention",
        connected_workspace="Home",
        assistant_workspace="dashboard",
        description="Desk attention arrives as a conversational stream rather than isolated summary counters.",
        topic="Treat pricing gaps, exposure signals, and exceptions as one shared lane so triage decisions stay visible.",
        composer_hint="Keep notes on risk triage here, then open Home or Risk when the thread needs deeper analysis.",
        sort_order=40,
    ),
    MessagingWorkspaceSeedConversation(
        conversation_id="settlement-control",
        section="Direct messages",
        kind="dm",
        label="@settlement-control",
        connected_workspace="Settlement",
        assistant_workspace="settlement",
        description="Direct settlement follow-up can live in the same product language as channels and queue digests.",
        topic="Use direct messages for focused invoice and payment coordination without losing the surrounding desk conversation.",
        composer_hint="Keep invoice and payment clarifications visible here before opening the settlement workspace.",
        sort_order=50,
    ),
)


def build_member_initials(label: str) -> str:
    parts = [part for part in label.strip().split() if part]
    if not parts:
        return "ME"
    return "".join(part[0].upper() for part in parts[:2])


def messaging_workspace_tables_available(db: Session) -> bool:
    inspector = inspect(db.get_bind())
    return inspector.has_table(MessagingWorkspaceConversation.__tablename__) and inspector.has_table(
        MessagingWorkspaceMessage.__tablename__
    )


def build_default_messaging_workspace_conversations() -> list[MessagingWorkspaceConversation]:
    now = datetime.now(timezone.utc)
    return [
        MessagingWorkspaceConversation(
            conversation_id=definition.conversation_id,
            section=definition.section,
            kind=definition.kind,
            label=definition.label,
            connected_workspace=definition.connected_workspace,
            assistant_workspace=definition.assistant_workspace,
            description=definition.description,
            topic=definition.topic,
            composer_hint=definition.composer_hint,
            sort_order=definition.sort_order,
            created_at=now,
            updated_at=now,
        )
        for definition in DEFAULT_MESSAGING_WORKSPACE_CONVERSATIONS
    ]


def ensure_messaging_workspace_conversations(db: Session) -> list[MessagingWorkspaceConversation]:
    if not messaging_workspace_tables_available(db):
        return build_default_messaging_workspace_conversations()

    existing_records = db.execute(select(MessagingWorkspaceConversation)).scalars().all()
    existing_by_id = {record.conversation_id: record for record in existing_records}
    now = datetime.now(timezone.utc)
    created = False

    for definition in DEFAULT_MESSAGING_WORKSPACE_CONVERSATIONS:
        if definition.conversation_id in existing_by_id:
            continue
        record = MessagingWorkspaceConversation(
            conversation_id=definition.conversation_id,
            section=definition.section,
            kind=definition.kind,
            label=definition.label,
            connected_workspace=definition.connected_workspace,
            assistant_workspace=definition.assistant_workspace,
            description=definition.description,
            topic=definition.topic,
            composer_hint=definition.composer_hint,
            sort_order=definition.sort_order,
            created_at=now,
            updated_at=now,
        )
        db.add(record)
        created = True

    if created:
        db.commit()

    return db.execute(
        select(MessagingWorkspaceConversation).order_by(
            MessagingWorkspaceConversation.sort_order.asc(),
            MessagingWorkspaceConversation.conversation_id.asc(),
        )
    ).scalars().all()


def list_messaging_workspace_state(db: Session) -> MessagingWorkspaceStateOut:
    tables_available = messaging_workspace_tables_available(db)
    conversations = ensure_messaging_workspace_conversations(db)
    if not tables_available:
        return MessagingWorkspaceStateOut(
            conversations=[
                to_messaging_workspace_conversation_summary_out(record, [])
                for record in conversations
            ],
            messages=[],
        )

    messages = db.execute(
        select(MessagingWorkspaceMessage).order_by(
            MessagingWorkspaceMessage.created_at.asc(),
            MessagingWorkspaceMessage.message_id.asc(),
        )
    ).scalars().all()

    messages_by_conversation_id: dict[str, list[MessagingWorkspaceMessage]] = {}
    for record in messages:
        messages_by_conversation_id.setdefault(record.conversation_id, []).append(record)

    return MessagingWorkspaceStateOut(
        conversations=[
            to_messaging_workspace_conversation_summary_out(
                record,
                messages_by_conversation_id.get(record.conversation_id, []),
            )
            for record in conversations
        ],
        messages=[to_messaging_workspace_message_out(record) for record in messages],
    )


def create_messaging_workspace_post(
    db: Session,
    *,
    payload: MessagingWorkspacePostCreate,
    actor_id: str | None,
    session_id: str | None,
    actor_role: str | None,
) -> MessagingWorkspaceMessage:
    if not messaging_workspace_tables_available(db):
        raise MessagingWorkspaceError(
            503,
            "Messaging workspace persistence is unavailable because the database schema is behind the current code. Run the latest migrations and retry.",
        )

    conversations = ensure_messaging_workspace_conversations(db)
    conversation_by_id = {record.conversation_id: record for record in conversations}
    conversation = conversation_by_id.get(payload.conversation_id)
    if conversation is None:
        raise MessagingWorkspaceError(404, f"Messaging conversation {payload.conversation_id} was not found.")

    if payload.source == "assistant" and not actor_id:
        raise MessagingWorkspaceError(
            401,
            "Sign in before storing assistant-authored messaging replies.",
        )

    author = build_messaging_workspace_author(
        db=db,
        conversation=conversation,
        source=payload.source,
        actor_id=actor_id,
    )
    now = datetime.now(timezone.utc)
    record = MessagingWorkspaceMessage(
        message_id=str(uuid.uuid4()),
        conversation_id=conversation.conversation_id,
        source=payload.source.upper(),
        body=payload.body,
        author_name=author.name,
        author_title=author.title,
        author_presence=author.presence,
        author_initials=author.initials,
        author_tone=author.tone,
        assistant_run_id=payload.assistant_run_id,
        assistant_agent_id=payload.assistant_agent_id,
        assistant_agent_name=payload.assistant_agent_name,
        created_by_user_id=actor_id,
        created_by_session_id=session_id,
        created_by_role=actor_role,
        created_at=now,
    )
    db.add(record)
    conversation.updated_at = now
    db.commit()
    db.refresh(record)
    return record


def to_messaging_workspace_conversation_summary_out(
    record: MessagingWorkspaceConversation,
    messages: list[MessagingWorkspaceMessage],
) -> MessagingWorkspaceConversationSummaryOut:
    latest_message = messages[-1] if messages else None
    latest_preview = None
    if latest_message is not None:
        latest_preview = next(
            (
                paragraph.strip()
                for paragraph in latest_message.body.splitlines()
                if paragraph.strip()
            ),
            None,
        )
    return MessagingWorkspaceConversationSummaryOut(
        conversation_id=record.conversation_id,
        section=record.section,
        kind=record.kind,
        label=record.label,
        connected_workspace=record.connected_workspace,
        assistant_workspace=record.assistant_workspace,
        description=record.description,
        topic=record.topic,
        composer_hint=record.composer_hint,
        sort_order=record.sort_order,
        message_count=len(messages),
        latest_message_preview=latest_preview,
        latest_message_at=latest_message.created_at if latest_message is not None else None,
    )


def to_messaging_workspace_message_out(record: MessagingWorkspaceMessage) -> MessagingWorkspaceMessageOut:
    return MessagingWorkspaceMessageOut(
        message_id=record.message_id,
        conversation_id=record.conversation_id,
        source=record.source.lower(),
        body=record.body,
        author=MessagingWorkspaceMemberOut(
            name=record.author_name,
            title=record.author_title,
            presence=record.author_presence,
            initials=record.author_initials,
            tone=record.author_tone,
        ),
        assistant_run_id=record.assistant_run_id,
        assistant_agent_id=record.assistant_agent_id,
        assistant_agent_name=record.assistant_agent_name,
        created_by_user_id=record.created_by_user_id,
        created_by_session_id=record.created_by_session_id,
        created_by_role=record.created_by_role,
        created_at=record.created_at,
    )


def build_messaging_workspace_author(
    *,
    db: Session,
    conversation: MessagingWorkspaceConversation,
    source: str,
    actor_id: str | None,
) -> MessagingWorkspaceMemberOut:
    if source == "assistant":
        agent_name = "ECTRM Assistant"
        return MessagingWorkspaceMemberOut(
            name=agent_name,
            title=f"Managed agent · {conversation.connected_workspace}",
            presence="Responding in thread",
            initials=build_member_initials(agent_name),
            tone="system",
        )

    if actor_id:
        user_record = db.get(UserAccount, actor_id)
        display_name = user_record.display_name if user_record is not None else actor_id
        return MessagingWorkspaceMemberOut(
            name=display_name,
            title="Desk operator",
            presence="You",
            initials=build_member_initials(display_name),
            tone="human",
        )

    return MessagingWorkspaceMemberOut(
        name="Guest Operator",
        title="Prototype author",
        presence="Signed-out preview",
        initials="GO",
        tone="human",
    )
