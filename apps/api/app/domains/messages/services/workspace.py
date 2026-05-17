from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import re
import uuid

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services import build_workspace_bootstrap_summary
from apps.api.app.models.messaging_workspace_conversation import MessagingWorkspaceConversation
from apps.api.app.models.messaging_workspace_message import MessagingWorkspaceMessage
from apps.api.app.models.user_account import UserAccount
from apps.api.app.schemas.messaging import (
    MessagingWorkspaceAttachmentValue,
    MessagingWorkspaceAttachmentOut,
    MessagingWorkspaceConversationOut,
    MessagingWorkspaceMemberOut,
    MessagingWorkspaceMessageOut,
    MessagingWorkspaceMetricOut,
    MessagingWorkspacePostCreate,
    MessagingWorkspacePostUpdate,
    MessagingWorkspaceStateOut,
    MessagingWorkspaceTimelineItemOut,
)


class MessagingWorkspaceError(RuntimeError):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class MessagingWorkspaceSeedMember:
    name: str
    title: str
    presence: str
    initials: str
    tone: str


@dataclass(frozen=True)
class MessagingWorkspaceSeedAttachment:
    label: str
    title: str
    summary: str
    footnote: str


@dataclass(frozen=True)
class MessagingWorkspaceSeedTimelineItem:
    message_id: str
    kind: str
    created_at: datetime
    source: str
    parent_message_id: str | None = None
    thread_root_message_id: str | None = None
    body: str = ""
    label: str | None = None
    detail: str | None = None
    author: MessagingWorkspaceSeedMember | None = None
    reactions: tuple[str, ...] = ()
    attachment: MessagingWorkspaceSeedAttachment | None = None
    pinned_at: datetime | None = None


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
    unread_count: int
    timeline: tuple[MessagingWorkspaceSeedTimelineItem, ...]


@dataclass(frozen=True)
class MessagingWorkspaceCounts:
    open_work_items: int | None = None
    operations_queue_items: int | None = None
    settlement_queue_items: int | None = None
    pending_invoices: int | None = None
    payments_due: int | None = None
    attention_items: int | None = None
    stale_pricing_items: int | None = None
    pending_pricing_trades: int | None = None
    pending_settlement_trades: int | None = None


ECTRM_DESK = MessagingWorkspaceSeedMember(
    name="ECTRM Desk",
    title="System notification",
    presence="Watching the desk",
    initials="EC",
    tone="desk",
)
MIA_CHEN = MessagingWorkspaceSeedMember(
    name="Mia Chen",
    title="Scheduler",
    presence="Online",
    initials="MC",
    tone="human",
)
APPROVALS_BOT = MessagingWorkspaceSeedMember(
    name="Approvals Bot",
    title="Action request lane",
    presence="Reviewing",
    initials="AB",
    tone="system",
)
NORTHSHORE = MessagingWorkspaceSeedMember(
    name="Northshore LNG",
    title="Counterparty contact",
    presence="Awaiting reply",
    initials="NL",
    tone="human",
)
OPS_QUEUE = MessagingWorkspaceSeedMember(
    name="Operations Queue",
    title="Desk queue digest",
    presence="Tracking handoffs",
    initials="OQ",
    tone="ops",
)
SETTLEMENT_CONTROL = MessagingWorkspaceSeedMember(
    name="Settlement Control",
    title="Cash and invoice follow-through",
    presence="Monitoring",
    initials="SC",
    tone="ops",
)
DASHBOARD_ATTENTION = MessagingWorkspaceSeedMember(
    name="Dashboard Attention",
    title="Desk signal feed",
    presence="Flagging exceptions",
    initials="DA",
    tone="system",
)


def build_seed_timestamp(local_hour: int, minute: int) -> datetime:
    # Seeded desk examples are authored in Eastern time and stored in UTC.
    return datetime(2026, 5, 16, local_hour + 4, minute, tzinfo=timezone.utc)


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
        unread_count=1,
        timeline=(
            MessagingWorkspaceSeedTimelineItem(
                message_id="assistant-day",
                kind="system",
                source="SYSTEM",
                created_at=build_seed_timestamp(13, 5),
                label="Today",
                detail="Action draft AR-204 moved into governed review.",
            ),
            MessagingWorkspaceSeedTimelineItem(
                message_id="assistant-msg-1",
                kind="message",
                source="SYSTEM",
                created_at=build_seed_timestamp(13, 7),
                author=ECTRM_DESK,
                body=(
                    "Assistant staged a governed action draft for the Northshore timing exception.\n\n"
                    "The recommendation keeps approval, provenance, and rollback expectations attached to the proposed workflow item."
                ),
                reactions=("ack 3", "needs review 1"),
                attachment=MessagingWorkspaceSeedAttachment(
                    label="Action draft",
                    title="AR-204 governed action draft",
                    summary="Owner: Desk Ops. Stop conditions: missing counterparty confirmation, settlement conflict, or delivery variance without explanation.",
                    footnote="Open Assistant Console for prompt context, evidence, and the approval record.",
                ),
                pinned_at=build_seed_timestamp(13, 16),
            ),
            MessagingWorkspaceSeedTimelineItem(
                message_id="assistant-msg-2",
                kind="message",
                source="HUMAN",
                created_at=build_seed_timestamp(13, 12),
                parent_message_id="assistant-msg-1",
                thread_root_message_id="assistant-msg-1",
                author=MIA_CHEN,
                body="Keep this threaded with the nomination conversation so Operations can react without switching screens.",
                reactions=("aligned 2",),
            ),
            MessagingWorkspaceSeedTimelineItem(
                message_id="assistant-msg-3",
                kind="message",
                source="SYSTEM",
                created_at=build_seed_timestamp(13, 14),
                author=APPROVALS_BOT,
                body="Approval packet is ready with owner, inputs, outputs, stop conditions, audit hooks, and rollback notes.",
            ),
        ),
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
        unread_count=2,
        timeline=(
            MessagingWorkspaceSeedTimelineItem(
                message_id="northshore-day",
                kind="system",
                source="SYSTEM",
                created_at=build_seed_timestamp(14, 55),
                label="Today",
                detail="Northshore revised the delivery note and requested confirmation.",
            ),
            MessagingWorkspaceSeedTimelineItem(
                message_id="northshore-msg-1",
                kind="message",
                source="HUMAN",
                created_at=build_seed_timestamp(14, 57),
                author=NORTHSHORE,
                body=(
                    "We revised the delivery window for the next nomination cycle and need desk confirmation before 3 PM.\n\n"
                    "Please keep the commercial note attached if Operations needs the full context."
                ),
                attachment=MessagingWorkspaceSeedAttachment(
                    label="Attached note",
                    title="Northshore revised delivery window",
                    summary="Updated timing note captures the revised slot, nomination checkpoint, and counterparty ask for same-day confirmation.",
                    footnote="This prototype keeps the attachment summary inside the same conversation stream.",
                ),
            ),
            MessagingWorkspaceSeedTimelineItem(
                message_id="northshore-msg-2",
                kind="message",
                source="HUMAN",
                created_at=build_seed_timestamp(15, 1),
                parent_message_id="northshore-msg-1",
                thread_root_message_id="northshore-msg-1",
                author=MIA_CHEN,
                body="I can take this into the operations lane as soon as the desk confirms we should accept the revised timing.",
                reactions=("on it 1",),
            ),
            MessagingWorkspaceSeedTimelineItem(
                message_id="northshore-msg-3",
                kind="message",
                source="OPS",
                created_at=build_seed_timestamp(15, 4),
                author=SETTLEMENT_CONTROL,
                body="Flagging that one payment due item may move if the revised window changes the invoice sequence.",
            ),
        ),
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
        unread_count=0,
        timeline=(
            MessagingWorkspaceSeedTimelineItem(
                message_id="ops-day",
                kind="system",
                source="SYSTEM",
                created_at=build_seed_timestamp(14, 46),
                label="Today",
                detail="Daily work queue digest posted to the desk lane.",
            ),
            MessagingWorkspaceSeedTimelineItem(
                message_id="ops-msg-1",
                kind="message",
                source="OPS",
                created_at=build_seed_timestamp(14, 48),
                author=OPS_QUEUE,
                body=(
                    "Queue work is easier to review when it stays in one desk lane instead of splitting across launcher cards.\n\n"
                    "Operators can leave handoff notes here before opening the deeper workboard controls."
                ),
            ),
            MessagingWorkspaceSeedTimelineItem(
                message_id="ops-msg-2",
                kind="message",
                source="HUMAN",
                created_at=build_seed_timestamp(14, 52),
                author=MIA_CHEN,
                body="If this looked more like Slack, I would handle queue review here first and then jump into the workboard only when I need the record-level controls.",
                reactions=("yes 4",),
            ),
        ),
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
        unread_count=1,
        timeline=(
            MessagingWorkspaceSeedTimelineItem(
                message_id="attention-day",
                kind="system",
                source="SYSTEM",
                created_at=build_seed_timestamp(14, 32),
                label="Today",
                detail="Desk attention summary refreshed from dashboard signals.",
            ),
            MessagingWorkspaceSeedTimelineItem(
                message_id="attention-msg-1",
                kind="message",
                source="SYSTEM",
                created_at=build_seed_timestamp(14, 34),
                author=DASHBOARD_ATTENTION,
                body=(
                    "Pricing and exposure issues land here like shared messages instead of disconnected alert tiles.\n\n"
                    "This keeps the desk triage story visible before anyone opens the deeper risk workflows."
                ),
                reactions=("watching 2",),
            ),
            MessagingWorkspaceSeedTimelineItem(
                message_id="attention-msg-2",
                kind="message",
                source="SYSTEM",
                created_at=build_seed_timestamp(14, 37),
                author=ECTRM_DESK,
                body="If the risk story is clearer in this format, we can keep issue triage visible before routing into the deeper workspace.",
            ),
        ),
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
        unread_count=0,
        timeline=(
            MessagingWorkspaceSeedTimelineItem(
                message_id="settlement-day",
                kind="system",
                source="SYSTEM",
                created_at=build_seed_timestamp(14, 17),
                label="Earlier today",
                detail="Settlement follow-up split from the Northshore thread for cash coordination.",
            ),
            MessagingWorkspaceSeedTimelineItem(
                message_id="settlement-msg-1",
                kind="message",
                source="OPS",
                created_at=build_seed_timestamp(14, 19),
                author=SETTLEMENT_CONTROL,
                body="Before we issue the next invoice handoff, confirm whether the revised Northshore timing should delay the settlement sequence.",
            ),
            MessagingWorkspaceSeedTimelineItem(
                message_id="settlement-msg-2",
                kind="message",
                source="HUMAN",
                created_at=build_seed_timestamp(14, 24),
                parent_message_id="settlement-msg-1",
                thread_root_message_id="settlement-msg-1",
                author=MIA_CHEN,
                body="I will update this lane once Operations confirms the delivery window. That way settlement does not have to chase the queue separately.",
                reactions=("thanks 1",),
            ),
        ),
    ),
)


def build_member_initials(label: str) -> str:
    parts = [part for part in label.strip().split() if part]
    if not parts:
        return "ME"
    return "".join(part[0].upper() for part in parts[:2])


def normalize_timestamp(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def format_count_label(value: int | None, singular: str, plural: str | None = None) -> str:
    plural = plural or f"{singular}s"
    if value is None:
        return f"No {plural} loaded"
    noun = singular if value == 1 else plural
    return f"{value:,} {noun}"


def format_count_value(value: int | None, fallback: str = "n/a") -> str:
    return f"{value:,}" if value is not None else fallback


def build_todo_detail(counts: MessagingWorkspaceCounts) -> str:
    total_sentence = (
        f"{format_count_label(counts.open_work_items, 'open work item')} "
        f"{'is' if counts.open_work_items == 1 else 'are'} currently tracked across the app."
        if counts.open_work_items is not None
        else "Open work items will appear here once queue data is loaded."
    )
    operations_sentence = (
        f"{format_count_label(counts.operations_queue_items, 'operations queue item')} "
        f"{'sits' if counts.operations_queue_items == 1 else 'sit'} in operations."
        if counts.operations_queue_items is not None
        else "Operations queue counts are not loaded yet."
    )
    settlement_sentence = (
        f"{format_count_label(counts.settlement_queue_items, 'settlement queue item')} "
        f"{'sits' if counts.settlement_queue_items == 1 else 'sit'} in settlement."
        if counts.settlement_queue_items is not None
        else "Settlement queue counts are not loaded yet."
    )
    return f"{total_sentence} {operations_sentence} {settlement_sentence}"


def build_issue_detail(counts: MessagingWorkspaceCounts) -> str:
    attention_sentence = (
        f"{format_count_label(counts.attention_items, 'attention item')} "
        f"{'is' if counts.attention_items == 1 else 'are'} surfaced for review right now."
        if counts.attention_items is not None
        else "Attention items will appear here once the dashboard summary is loaded."
    )
    stale_pricing_sentence = (
        f"{format_count_label(counts.stale_pricing_items, 'stale pricing item')} "
        f"{'is' if counts.stale_pricing_items == 1 else 'are'} tied to pricing follow-through."
        if counts.stale_pricing_items is not None
        else "Pricing follow-through counts are not loaded yet."
    )
    return f"{attention_sentence} {stale_pricing_sentence}"


def build_workspace_counts(db: Session) -> MessagingWorkspaceCounts:
    try:
        summary = build_workspace_bootstrap_summary(db)
    except Exception:
        # Messaging should stay readable even if unrelated workspace summary
        # tables are behind the current code in a local environment.
        return MessagingWorkspaceCounts()

    trades = summary.get("trades", {}) if isinstance(summary, dict) else {}
    work_items = summary.get("work_items", {}) if isinstance(summary, dict) else {}
    dashboard = summary.get("dashboard", {}) if isinstance(summary, dict) else {}
    attention = dashboard.get("attention", {}) if isinstance(dashboard, dict) else {}
    settlement = summary.get("settlement", {}) if isinstance(summary, dict) else {}

    return MessagingWorkspaceCounts(
        open_work_items=int(work_items["total_count"]) if "total_count" in work_items else None,
        operations_queue_items=(
            int(work_items["operations_queue_count"])
            if "operations_queue_count" in work_items
            else None
        ),
        settlement_queue_items=(
            int(work_items["settlement_queue_count"])
            if "settlement_queue_count" in work_items
            else None
        ),
        pending_invoices=(
            int(settlement["invoice_pending_count"])
            if "invoice_pending_count" in settlement
            else None
        ),
        payments_due=int(settlement["payment_due_count"]) if "payment_due_count" in settlement else None,
        attention_items=int(attention["total_count"]) if "total_count" in attention else None,
        stale_pricing_items=(
            int(attention["stale_pricing_count"])
            if "stale_pricing_count" in attention
            else None
        ),
        pending_pricing_trades=(
            int(trades["pending_pricing_count"])
            if "pending_pricing_count" in trades
            else None
        ),
        pending_settlement_trades=(
            int(trades["pending_settlement_count"])
            if "pending_settlement_count" in trades
            else None
        ),
    )


def build_default_messaging_workspace_conversation_records() -> list[MessagingWorkspaceConversation]:
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
            updated_at=definition.timeline[-1].created_at if definition.timeline else now,
        )
        for definition in DEFAULT_MESSAGING_WORKSPACE_CONVERSATIONS
    ]


def build_default_messaging_workspace_message_records() -> list[MessagingWorkspaceMessage]:
    records: list[MessagingWorkspaceMessage] = []
    for definition in DEFAULT_MESSAGING_WORKSPACE_CONVERSATIONS:
        for item in definition.timeline:
            records.append(build_seed_message_record(definition.conversation_id, item))
    return records


def build_seed_message_record(
    conversation_id: str,
    item: MessagingWorkspaceSeedTimelineItem,
) -> MessagingWorkspaceMessage:
    attachment_payload = None
    if item.attachment is not None:
        attachment_payload = {
            "label": item.attachment.label,
            "title": item.attachment.title,
            "summary": item.attachment.summary,
            "footnote": item.attachment.footnote,
        }

    return MessagingWorkspaceMessage(
        message_id=item.message_id,
        conversation_id=conversation_id,
        item_kind=item.kind.upper(),
        source=item.source,
        parent_message_id=item.parent_message_id,
        thread_root_message_id=(
            item.thread_root_message_id
            if item.thread_root_message_id is not None
            else item.message_id if item.kind == "message" and item.parent_message_id is None else item.parent_message_id
        ),
        body=item.body,
        system_label=item.label,
        system_detail=item.detail,
        author_name=item.author.name if item.author is not None else None,
        author_title=item.author.title if item.author is not None else None,
        author_presence=item.author.presence if item.author is not None else None,
        author_initials=item.author.initials if item.author is not None else None,
        author_tone=item.author.tone if item.author is not None else None,
        reactions=list(item.reactions) if item.reactions else None,
        attachment_payload=attachment_payload,
        assistant_run_id=None,
        assistant_agent_id=None,
        assistant_agent_name=None,
        created_by_user_id=None,
        created_by_session_id=None,
        created_by_role=None,
        edited_at=None,
        edited_by_user_id=None,
        edited_by_session_id=None,
        edited_by_role=None,
        deleted_at=None,
        deleted_by_user_id=None,
        deleted_by_session_id=None,
        deleted_by_role=None,
        pinned_at=item.pinned_at,
        pinned_by_user_id=None,
        pinned_by_session_id=None,
        pinned_by_role=None,
        created_at=item.created_at,
    )


def build_attachment_payload(
    attachment: MessagingWorkspaceAttachmentValue | None,
) -> dict[str, str] | None:
    if attachment is None:
        return None

    return {
        "label": attachment.label,
        "title": attachment.title,
        "summary": attachment.summary,
        "footnote": attachment.footnote,
    }


def build_attachment_out(payload: dict[str, str] | None) -> MessagingWorkspaceAttachmentOut | None:
    if not isinstance(payload, dict):
        return None

    return MessagingWorkspaceAttachmentOut(
        label=str(payload.get("label", "")),
        title=str(payload.get("title", "")),
        summary=str(payload.get("summary", "")),
        footnote=str(payload.get("footnote", "")),
    )


def messaging_workspace_tables_available(db: Session) -> bool:
    inspector = inspect(db.get_bind())
    return inspector.has_table(MessagingWorkspaceConversation.__tablename__) and inspector.has_table(
        MessagingWorkspaceMessage.__tablename__
    )


def ensure_messaging_workspace_conversations(db: Session) -> list[MessagingWorkspaceConversation]:
    if not messaging_workspace_tables_available(db):
        return build_default_messaging_workspace_conversation_records()

    definitions_by_id = {
        definition.conversation_id: definition
        for definition in DEFAULT_MESSAGING_WORKSPACE_CONVERSATIONS
    }
    existing_conversations = db.execute(select(MessagingWorkspaceConversation)).scalars().all()
    existing_by_id = {record.conversation_id: record for record in existing_conversations}
    existing_messages = db.execute(select(MessagingWorkspaceMessage.message_id)).scalars().all()
    existing_message_ids = set(existing_messages)
    now = datetime.now(timezone.utc)
    created = False

    for definition in DEFAULT_MESSAGING_WORKSPACE_CONVERSATIONS:
        if definition.conversation_id in existing_by_id:
            continue
        db.add(
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
                updated_at=definition.timeline[-1].created_at if definition.timeline else now,
            )
        )
        created = True

    if created:
        db.flush()
        existing_conversations = db.execute(select(MessagingWorkspaceConversation)).scalars().all()
        existing_by_id = {record.conversation_id: record for record in existing_conversations}

    for definition in DEFAULT_MESSAGING_WORKSPACE_CONVERSATIONS:
        conversation = existing_by_id[definition.conversation_id]
        latest_seed_activity = normalize_timestamp(conversation.updated_at)
        for item in definition.timeline:
            if item.message_id in existing_message_ids:
                latest_seed_activity = max(latest_seed_activity, item.created_at)
                continue
            db.add(build_seed_message_record(definition.conversation_id, item))
            existing_message_ids.add(item.message_id)
            latest_seed_activity = max(latest_seed_activity, item.created_at)
            created = True

        if latest_seed_activity > normalize_timestamp(conversation.updated_at):
            conversation.updated_at = latest_seed_activity

    if created:
        db.commit()

    return db.execute(
        select(MessagingWorkspaceConversation).order_by(
            MessagingWorkspaceConversation.sort_order.asc(),
            MessagingWorkspaceConversation.conversation_id.asc(),
        )
    ).scalars().all()


def list_messaging_workspace_state(db: Session) -> MessagingWorkspaceStateOut:
    workspace_counts = build_workspace_counts(db)
    tables_available = messaging_workspace_tables_available(db)

    if not tables_available:
        seed_conversations = build_default_messaging_workspace_conversation_records()
        seed_messages = build_default_messaging_workspace_message_records()
        messages_by_conversation_id: dict[str, list[MessagingWorkspaceMessage]] = {}
        for record in seed_messages:
            messages_by_conversation_id.setdefault(record.conversation_id, []).append(record)

        return MessagingWorkspaceStateOut(
            conversations=[
                to_messaging_workspace_conversation_out(
                    record,
                    messages_by_conversation_id.get(record.conversation_id, []),
                    workspace_counts=workspace_counts,
                )
                for record in seed_conversations
            ]
        )

    conversations = ensure_messaging_workspace_conversations(db)
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
            to_messaging_workspace_conversation_out(
                record,
                messages_by_conversation_id.get(record.conversation_id, []),
                workspace_counts=workspace_counts,
            )
            for record in conversations
        ]
    )


def resolve_parent_thread_context(
    db: Session,
    *,
    conversation: MessagingWorkspaceConversation,
    parent_message_id: str | None,
) -> tuple[str | None, str | None]:
    if parent_message_id is None:
        return None, None

    parent_record = db.get(MessagingWorkspaceMessage, parent_message_id)
    if parent_record is None or parent_record.conversation_id != conversation.conversation_id:
        raise MessagingWorkspaceError(
            404,
            f"Messaging parent message {parent_message_id} was not found in {conversation.conversation_id}.",
        )
    if parent_record.item_kind.upper() != "MESSAGE":
        raise MessagingWorkspaceError(409, "System timeline dividers cannot own threaded replies.")

    return parent_record.message_id, parent_record.thread_root_message_id or parent_record.message_id


def require_post_content_permission(
    record: MessagingWorkspaceMessage,
    *,
    actor_id: str | None,
) -> None:
    if not actor_id:
        raise MessagingWorkspaceError(401, "Sign in before editing or deleting persisted desk messages.")
    if record.created_by_user_id != actor_id:
        raise MessagingWorkspaceError(403, "You can only edit or delete your own persisted desk messages.")
    if record.source.upper() != "HUMAN":
        raise MessagingWorkspaceError(403, "Only human-authored desk messages can be edited or deleted.")


def require_post_pin_permission(actor_id: str | None) -> None:
    if not actor_id:
        raise MessagingWorkspaceError(401, "Sign in before pinning or unpinning desk messages.")


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

    parent_message_id, parent_thread_root_message_id = resolve_parent_thread_context(
        db,
        conversation=conversation,
        parent_message_id=payload.parent_message_id,
    )

    author = build_messaging_workspace_author(
        db=db,
        conversation=conversation,
        source=payload.source,
        actor_id=actor_id,
    )
    now = datetime.now(timezone.utc)
    message_id = str(uuid.uuid4())
    record = MessagingWorkspaceMessage(
        message_id=message_id,
        conversation_id=conversation.conversation_id,
        item_kind="MESSAGE",
        source=payload.source.upper(),
        parent_message_id=parent_message_id,
        thread_root_message_id=parent_thread_root_message_id or message_id,
        body=payload.body,
        system_label=None,
        system_detail=None,
        author_name=author.name,
        author_title=author.title,
        author_presence=author.presence,
        author_initials=author.initials,
        author_tone=author.tone,
        reactions=None,
        attachment_payload=build_attachment_payload(payload.attachment),
        assistant_run_id=payload.assistant_run_id,
        assistant_agent_id=payload.assistant_agent_id,
        assistant_agent_name=payload.assistant_agent_name,
        created_by_user_id=actor_id,
        created_by_session_id=session_id,
        created_by_role=actor_role,
        edited_at=None,
        edited_by_user_id=None,
        edited_by_session_id=None,
        edited_by_role=None,
        deleted_at=None,
        deleted_by_user_id=None,
        deleted_by_session_id=None,
        deleted_by_role=None,
        pinned_at=None,
        pinned_by_user_id=None,
        pinned_by_session_id=None,
        pinned_by_role=None,
        created_at=now,
    )
    db.add(record)
    conversation.updated_at = now
    db.commit()
    db.refresh(record)
    return record


def update_messaging_workspace_post(
    db: Session,
    *,
    message_id: str,
    payload: MessagingWorkspacePostUpdate,
    actor_id: str | None,
    session_id: str | None,
    actor_role: str | None,
) -> MessagingWorkspaceMessage:
    if not messaging_workspace_tables_available(db):
        raise MessagingWorkspaceError(
            503,
            "Messaging workspace persistence is unavailable because the database schema is behind the current code. Run the latest migrations and retry.",
        )

    ensure_messaging_workspace_conversations(db)
    record = db.get(MessagingWorkspaceMessage, message_id)
    if record is None or record.item_kind.upper() != "MESSAGE":
        raise MessagingWorkspaceError(404, f"Messaging post {message_id} was not found.")

    now = datetime.now(timezone.utc)
    content_mutated = False

    if payload.body is not None:
        require_post_content_permission(record, actor_id=actor_id)
        if record.deleted_at is not None:
            raise MessagingWorkspaceError(409, "Deleted desk messages cannot be edited.")
        record.body = payload.body
        record.edited_at = now
        record.edited_by_user_id = actor_id
        record.edited_by_session_id = session_id
        record.edited_by_role = actor_role
        content_mutated = True

    if payload.deleted:
        require_post_content_permission(record, actor_id=actor_id)
        if record.deleted_at is None:
            record.body = ""
            record.reactions = None
            record.attachment_payload = None
            record.deleted_at = now
            record.deleted_by_user_id = actor_id
            record.deleted_by_session_id = session_id
            record.deleted_by_role = actor_role
            record.pinned_at = None
            record.pinned_by_user_id = None
            record.pinned_by_session_id = None
            record.pinned_by_role = None
            content_mutated = True

    if payload.reactions is not None:
        require_post_pin_permission(actor_id)
        if record.deleted_at is not None:
            raise MessagingWorkspaceError(409, "Deleted desk messages cannot accept reactions.")
        record.reactions = payload.reactions or None

    if payload.pinned is not None:
        require_post_pin_permission(actor_id)
        if payload.pinned:
            record.pinned_at = now
            record.pinned_by_user_id = actor_id
            record.pinned_by_session_id = session_id
            record.pinned_by_role = actor_role
        else:
            record.pinned_at = None
            record.pinned_by_user_id = None
            record.pinned_by_session_id = None
            record.pinned_by_role = None

    conversation = db.get(MessagingWorkspaceConversation, record.conversation_id)
    if content_mutated and conversation is not None:
        conversation.updated_at = now

    db.commit()
    db.refresh(record)
    return record


def to_messaging_workspace_conversation_out(
    record: MessagingWorkspaceConversation,
    messages: list[MessagingWorkspaceMessage],
    *,
    workspace_counts: MessagingWorkspaceCounts,
) -> MessagingWorkspaceConversationOut:
    reply_count_by_root, thread_participants_by_root = build_thread_metadata(messages)
    timeline = [
        to_messaging_workspace_timeline_item_out(
            message,
            reply_count=reply_count_by_root.get(message.message_id, 0),
            thread_participants=thread_participants_by_root.get(message.message_id, []),
        )
        for message in messages
    ]
    latest_item = timeline[-1] if timeline else None
    preview = build_preview_for_timeline_item(latest_item) or record.description
    members: list[MessagingWorkspaceMemberOut] = []
    for item in timeline:
        if item.author is None:
            continue
        if any(member.name == item.author.name for member in members):
            continue
        members.append(item.author)

    return MessagingWorkspaceConversationOut(
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
        preview=preview,
        unread_count=build_unread_count(record.conversation_id),
        latest_activity_at=latest_item.created_at if latest_item is not None else None,
        highlights=build_conversation_highlights(record.conversation_id, workspace_counts),
        metrics=build_conversation_metrics(record.conversation_id, workspace_counts),
        members=members,
        timeline=timeline,
    )


def build_preview_for_timeline_item(item: MessagingWorkspaceTimelineItemOut | None) -> str | None:
    if item is None:
        return None
    if item.deleted_at is not None:
        return "Message deleted."
    if item.kind == "system":
        return item.detail
    preview = next((paragraph for paragraph in item.body if paragraph.strip()), None)
    if preview is None:
        return None
    return re.sub(r"@\[(.+?)\]", r"@\1", preview)


def build_thread_metadata(
    messages: list[MessagingWorkspaceMessage],
) -> tuple[dict[str, int], dict[str, list[str]]]:
    reply_count_by_root: dict[str, int] = {}
    participants_by_root: dict[str, list[str]] = {}
    seen_participants_by_root: dict[str, set[str]] = {}

    for record in messages:
        if record.item_kind.upper() != "MESSAGE" or not record.parent_message_id:
            continue

        root_id = record.thread_root_message_id or record.parent_message_id
        reply_count_by_root[root_id] = reply_count_by_root.get(root_id, 0) + 1

        if not record.author_name:
            continue

        seen = seen_participants_by_root.setdefault(root_id, set())
        if record.author_name in seen:
            continue
        seen.add(record.author_name)
        participants_by_root.setdefault(root_id, []).append(record.author_name)

    return reply_count_by_root, participants_by_root


def build_unread_count(conversation_id: str) -> int:
    for definition in DEFAULT_MESSAGING_WORKSPACE_CONVERSATIONS:
        if definition.conversation_id == conversation_id:
            return definition.unread_count
    return 0


def build_conversation_highlights(
    conversation_id: str,
    counts: MessagingWorkspaceCounts,
) -> list[str]:
    if conversation_id == "ectrm-assistant":
        return [
            "Action draft AR-204 is staged for review.",
            "Prompt context and tool evidence are ready in the assistant console.",
        ]
    if conversation_id == "counterparty-email":
        return [
            "Counterparty deadline: confirm by 3 PM.",
            "Revised delivery window can flow straight into Operations once acknowledged.",
        ]
    if conversation_id == "ops-follow-through":
        return [
            build_todo_detail(counts),
            "Older unresolved operations work can rise first without leaving the messaging surface.",
        ]
    if conversation_id == "desk-attention":
        return [
            build_issue_detail(counts),
            "Pricing and exposure signals become easier to scan when they share the same visual language as chat.",
        ]
    if conversation_id == "settlement-control":
        return [
            f"{format_count_label(counts.pending_invoices, 'pending invoice')} waiting for settlement review.",
            f"{format_count_label(counts.payments_due, 'payment due item')} tied to cash follow-through.",
        ]
    return []


def build_conversation_metrics(
    conversation_id: str,
    counts: MessagingWorkspaceCounts,
) -> list[MessagingWorkspaceMetricOut]:
    if conversation_id == "ectrm-assistant":
        return [
            MessagingWorkspaceMetricOut(label="Governed drafts", value="1 new"),
            MessagingWorkspaceMetricOut(label="Desk attention", value=format_count_value(counts.attention_items)),
            MessagingWorkspaceMetricOut(label="Open work", value=format_count_value(counts.open_work_items)),
        ]
    if conversation_id == "counterparty-email":
        return [
            MessagingWorkspaceMetricOut(label="Ops queue", value=format_count_value(counts.operations_queue_items)),
            MessagingWorkspaceMetricOut(label="Settlement queue", value=format_count_value(counts.settlement_queue_items)),
            MessagingWorkspaceMetricOut(label="Payments due", value=format_count_value(counts.payments_due)),
        ]
    if conversation_id == "ops-follow-through":
        return [
            MessagingWorkspaceMetricOut(label="Open work", value=format_count_value(counts.open_work_items)),
            MessagingWorkspaceMetricOut(label="Ops queue", value=format_count_value(counts.operations_queue_items)),
            MessagingWorkspaceMetricOut(label="Settlement queue", value=format_count_value(counts.settlement_queue_items)),
        ]
    if conversation_id == "desk-attention":
        return [
            MessagingWorkspaceMetricOut(label="Attention", value=format_count_value(counts.attention_items)),
            MessagingWorkspaceMetricOut(label="Stale pricing", value=format_count_value(counts.stale_pricing_items)),
            MessagingWorkspaceMetricOut(label="Pending pricing", value=format_count_value(counts.pending_pricing_trades)),
        ]
    if conversation_id == "settlement-control":
        return [
            MessagingWorkspaceMetricOut(label="Pending invoices", value=format_count_value(counts.pending_invoices)),
            MessagingWorkspaceMetricOut(label="Payments due", value=format_count_value(counts.payments_due)),
            MessagingWorkspaceMetricOut(label="Pending settlement", value=format_count_value(counts.pending_settlement_trades)),
        ]
    return []


def to_messaging_workspace_timeline_item_out(
    record: MessagingWorkspaceMessage,
    *,
    reply_count: int = 0,
    thread_participants: list[str] | None = None,
) -> MessagingWorkspaceTimelineItemOut:
    attachment = build_attachment_out(record.attachment_payload)

    author = None
    if record.author_name and record.author_title and record.author_presence and record.author_initials and record.author_tone:
        author = MessagingWorkspaceMemberOut(
            name=record.author_name,
            title=record.author_title,
            presence=record.author_presence,
            initials=record.author_initials,
            tone=record.author_tone,
        )

    return MessagingWorkspaceTimelineItemOut(
        id=record.message_id,
        kind=record.item_kind.lower(),
        created_at=normalize_timestamp(record.created_at),
        source=record.source.lower(),
        label=record.system_label,
        detail=record.system_detail,
        author=author,
        body=format_message_body(record.body),
        reactions=list(record.reactions or []),
        attachment=attachment,
        parent_message_id=record.parent_message_id,
        thread_root_message_id=record.thread_root_message_id,
        reply_count=reply_count,
        thread_participants=list(thread_participants or []),
        created_by_user_id=record.created_by_user_id,
        created_by_role=record.created_by_role,
        edited_at=normalize_timestamp(record.edited_at) if record.edited_at is not None else None,
        deleted_at=normalize_timestamp(record.deleted_at) if record.deleted_at is not None else None,
        pinned_at=normalize_timestamp(record.pinned_at) if record.pinned_at is not None else None,
    )


def format_message_body(body: str) -> list[str]:
    return [paragraph.strip() for paragraph in body.split("\n\n") if paragraph.strip()]


def to_messaging_workspace_message_out(record: MessagingWorkspaceMessage) -> MessagingWorkspaceMessageOut:
    return MessagingWorkspaceMessageOut(
        message_id=record.message_id,
        conversation_id=record.conversation_id,
        source=record.source.lower(),
        body=record.body,
        parent_message_id=record.parent_message_id,
        thread_root_message_id=record.thread_root_message_id,
        author=MessagingWorkspaceMemberOut(
            name=record.author_name or "Unknown author",
            title=record.author_title or "Messaging author",
            presence=record.author_presence or "Unknown",
            initials=record.author_initials or build_member_initials(record.author_name or "Unknown author"),
            tone=(record.author_tone or "human"),
        ),
        assistant_run_id=record.assistant_run_id,
        assistant_agent_id=record.assistant_agent_id,
        assistant_agent_name=record.assistant_agent_name,
        created_by_user_id=record.created_by_user_id,
        created_by_session_id=record.created_by_session_id,
        created_by_role=record.created_by_role,
        reactions=list(record.reactions or []),
        attachment=build_attachment_out(record.attachment_payload),
        edited_at=normalize_timestamp(record.edited_at) if record.edited_at is not None else None,
        deleted_at=normalize_timestamp(record.deleted_at) if record.deleted_at is not None else None,
        pinned_at=normalize_timestamp(record.pinned_at) if record.pinned_at is not None else None,
        created_at=normalize_timestamp(record.created_at),
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
