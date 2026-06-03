from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.domains.messages.services.workspace import (
    MessagingWorkspaceError,
    build_attachment_payload,
    build_member_initials,
    build_messaging_workspace_author,
    ensure_messaging_workspace_conversations,
    messaging_workspace_tables_available,
    normalize_timestamp,
    resolve_parent_thread_context,
)
from apps.api.app.models.messaging_workspace_conversation import MessagingWorkspaceConversation
from apps.api.app.models.messaging_workspace_message import MessagingWorkspaceMessage
from apps.api.app.schemas.messaging import (
    MessagingSlackRuntimeSettingsOut,
    MessagingSlackSyncResultOut,
    MessagingWorkspacePostCreate,
)


class SlackMessagingIntegrationError(RuntimeError):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class SlackMessagingConfig:
    enabled: bool
    bot_token: str
    channel_ids: tuple[str, ...]
    channel_limit: int
    history_limit: int
    timeout_seconds: int
    api_base_url: str


@dataclass(frozen=True)
class SlackConversation:
    channel_id: str
    name: str
    is_im: bool
    is_mpim: bool
    is_private: bool
    topic: str | None = None
    purpose: str | None = None
    member_count: int | None = None


@dataclass(frozen=True)
class SlackUser:
    user_id: str
    display_name: str
    title: str
    is_bot: bool = False


@dataclass(frozen=True)
class SlackPostedMessage:
    channel_id: str
    message_ts: str


class SlackMessagingClient:
    def __init__(self, config: SlackMessagingConfig) -> None:
        self.config = config

    def list_conversations(self) -> list[SlackConversation]:
        if self.config.channel_ids:
            conversations: list[SlackConversation] = []
            for channel_id in self.config.channel_ids[: self.config.channel_limit]:
                payload = self._get("conversations.info", {"channel": channel_id})
                channel = payload.get("channel")
                if isinstance(channel, dict):
                    conversations.append(_conversation_from_slack_payload(channel))
            return conversations

        conversations = []
        cursor: str | None = None
        while len(conversations) < self.config.channel_limit:
            params: dict[str, str | int] = {
                "exclude_archived": "true",
                "limit": min(100, self.config.channel_limit - len(conversations)),
                "types": "public_channel,private_channel,im,mpim",
            }
            if cursor:
                params["cursor"] = cursor
            payload = self._get("conversations.list", params)
            channels = payload.get("channels")
            for channel in channels if isinstance(channels, list) else []:
                if isinstance(channel, dict):
                    conversations.append(_conversation_from_slack_payload(channel))
                    if len(conversations) >= self.config.channel_limit:
                        break
            cursor = _optional_text(
                payload.get("response_metadata", {}).get("next_cursor")
                if isinstance(payload.get("response_metadata"), dict)
                else None
            )
            if not cursor:
                break
        return conversations

    def conversation_history(self, channel_id: str) -> list[dict[str, Any]]:
        payload = self._get(
            "conversations.history",
            {
                "channel": channel_id,
                "limit": self.config.history_limit,
            },
        )
        messages = payload.get("messages")
        return [message for message in messages if isinstance(message, dict)] if isinstance(messages, list) else []

    def user_info(self, user_id: str) -> SlackUser | None:
        payload = self._get("users.info", {"user": user_id})
        user = payload.get("user")
        if not isinstance(user, dict):
            return None
        profile = user.get("profile") if isinstance(user.get("profile"), dict) else {}
        display_name = (
            _optional_text(profile.get("display_name"))
            or _optional_text(profile.get("real_name"))
            or _optional_text(user.get("real_name"))
            or _optional_text(user.get("name"))
            or user_id
        )
        return SlackUser(
            user_id=user_id,
            display_name=display_name,
            title="Slack bot" if bool(user.get("is_bot")) else "Slack user",
            is_bot=bool(user.get("is_bot")),
        )

    def post_message(
        self,
        *,
        channel_id: str,
        text: str,
        thread_ts: str | None = None,
    ) -> SlackPostedMessage:
        payload: dict[str, str] = {"channel": channel_id, "text": text}
        if thread_ts:
            payload["thread_ts"] = thread_ts
        response_payload = self._post("chat.postMessage", payload)
        message_ts = _optional_text(response_payload.get("ts"))
        response_channel_id = _optional_text(response_payload.get("channel")) or channel_id
        if message_ts is None:
            raise SlackMessagingIntegrationError(502, "Slack accepted the post but did not return a message timestamp.")
        return SlackPostedMessage(channel_id=response_channel_id, message_ts=message_ts)

    def _get(self, method: str, params: dict[str, str | int]) -> dict[str, Any]:
        return self._request("GET", method, params=params)

    def _post(self, method: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", method, json=payload)

    def _request(
        self,
        http_method: str,
        method: str,
        *,
        params: dict[str, str | int] | None = None,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = f"{self.config.api_base_url.rstrip('/')}/{method}"
        headers = {"Authorization": f"Bearer {self.config.bot_token}"}
        with httpx.Client(timeout=self.config.timeout_seconds) as client:
            response = client.request(http_method, url, params=params, json=json, headers=headers)

        if response.status_code == 429:
            retry_after = response.headers.get("Retry-After", "").strip()
            suffix = f" Retry after {retry_after} seconds." if retry_after else ""
            raise SlackMessagingIntegrationError(429, f"Slack rate limited this request.{suffix}")
        if response.status_code >= 400:
            raise SlackMessagingIntegrationError(
                502,
                f"Slack {method} request failed with HTTP {response.status_code}.",
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise SlackMessagingIntegrationError(502, f"Slack {method} returned invalid JSON.") from exc

        if not isinstance(payload, dict):
            raise SlackMessagingIntegrationError(502, f"Slack {method} returned an unexpected response.")
        if payload.get("ok") is not True:
            error = _optional_text(payload.get("error")) or "unknown_error"
            raise SlackMessagingIntegrationError(502, f"Slack {method} failed: {error}.")
        return payload


def build_slack_messaging_runtime_settings() -> MessagingSlackRuntimeSettingsOut:
    config = _slack_messaging_config()
    configured = config.enabled and bool(config.bot_token)
    auth_status = "configured" if configured else "partial" if config.enabled else "none"
    return MessagingSlackRuntimeSettingsOut(
        enabled=config.enabled,
        configured=configured,
        auth_status=auth_status,
        configured_channel_count=len(config.channel_ids),
        channel_limit=config.channel_limit,
        history_limit=config.history_limit,
    )


def sync_slack_messaging_workspace(
    db: Session,
    *,
    client: SlackMessagingClient | None = None,
) -> MessagingSlackSyncResultOut:
    _require_messaging_tables(db)
    config = _require_slack_messaging_configured()
    slack_client = client or SlackMessagingClient(config)
    ensure_messaging_workspace_conversations(db)

    warnings: list[str] = []
    created_conversation_count = 0
    updated_conversation_count = 0
    scanned_message_count = 0
    imported_message_count = 0
    updated_message_count = 0
    skipped_message_count = 0

    user_cache: dict[str, SlackUser | None] = {}
    conversations = slack_client.list_conversations()

    for index, slack_conversation in enumerate(conversations):
        conversation, created, updated = _upsert_slack_conversation(
            db,
            slack_conversation=slack_conversation,
            sort_order=900 + index,
        )
        if created:
            created_conversation_count += 1
        elif updated:
            updated_conversation_count += 1

        try:
            slack_messages = slack_client.conversation_history(slack_conversation.channel_id)
        except SlackMessagingIntegrationError as exc:
            warnings.append(f"Skipped {conversation.label}: {exc.detail}")
            continue

        for message in sorted(slack_messages, key=lambda item: _optional_text(item.get("ts")) or ""):
            scanned_message_count += 1
            result = _upsert_slack_message(
                db,
                conversation=conversation,
                slack_conversation=slack_conversation,
                payload=message,
                slack_client=slack_client,
                user_cache=user_cache,
            )
            if result == "created":
                imported_message_count += 1
            elif result == "updated":
                updated_message_count += 1
            else:
                skipped_message_count += 1

    db.commit()

    return MessagingSlackSyncResultOut(
        synced_channel_count=len(conversations),
        created_conversation_count=created_conversation_count,
        updated_conversation_count=updated_conversation_count,
        scanned_message_count=scanned_message_count,
        imported_message_count=imported_message_count,
        updated_message_count=updated_message_count,
        skipped_message_count=skipped_message_count,
        warnings=warnings,
    )


def create_slack_messaging_workspace_post(
    db: Session,
    *,
    payload: MessagingWorkspacePostCreate,
    actor_id: str,
    session_id: str | None,
    actor_role: str | None,
    client: SlackMessagingClient | None = None,
) -> MessagingWorkspaceMessage:
    _require_messaging_tables(db)
    config = _require_slack_messaging_configured()
    conversation = db.get(MessagingWorkspaceConversation, payload.conversation_id)
    if conversation is None:
        ensure_messaging_workspace_conversations(db)
        conversation = db.get(MessagingWorkspaceConversation, payload.conversation_id)
    if conversation is None:
        raise MessagingWorkspaceError(404, f"Messaging conversation {payload.conversation_id} was not found.")
    if payload.source != "human":
        raise MessagingWorkspaceError(409, "Slack messaging posts must be human-authored operator messages.")

    channel_id = slack_channel_id_from_conversation_id(conversation.conversation_id)
    if channel_id is None:
        raise MessagingWorkspaceError(
            409,
            f"Messaging conversation {conversation.conversation_id} is not a Slack conversation.",
        )

    parent_message_id, parent_thread_root_message_id = resolve_parent_thread_context(
        db,
        conversation=conversation,
        parent_message_id=payload.parent_message_id,
    )
    thread_ts = (
        slack_ts_from_message_id(channel_id, parent_thread_root_message_id)
        if parent_thread_root_message_id
        else None
    )
    if parent_thread_root_message_id and thread_ts is None:
        raise MessagingWorkspaceError(409, "Slack thread replies can only target Slack-backed messages.")
    slack_client = client or SlackMessagingClient(config)
    posted = slack_client.post_message(channel_id=channel_id, text=payload.body, thread_ts=thread_ts)
    message_id = slack_message_id(posted.channel_id, posted.message_ts)
    now = slack_datetime(posted.message_ts)
    author = build_messaging_workspace_author(
        db=db,
        conversation=conversation,
        source="human",
        actor_id=actor_id,
    )

    existing = db.get(MessagingWorkspaceMessage, message_id)
    if existing is not None:
        return existing

    record = MessagingWorkspaceMessage(
        message_id=message_id,
        conversation_id=conversation.conversation_id,
        item_kind="MESSAGE",
        source="HUMAN",
        parent_message_id=parent_message_id,
        thread_root_message_id=parent_thread_root_message_id or message_id,
        body=payload.body,
        system_label=None,
        system_detail=None,
        author_name=author.name,
        author_title=f"{author.title} via Slack",
        author_presence="Posted to Slack",
        author_initials=author.initials,
        author_tone=author.tone,
        reactions=None,
        attachment_payload=build_attachment_payload(payload.attachment),
        assistant_run_id=None,
        assistant_agent_id=None,
        assistant_agent_name=None,
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


def is_slack_conversation_id(conversation_id: str) -> bool:
    return slack_channel_id_from_conversation_id(conversation_id) is not None


def slack_channel_id_from_conversation_id(conversation_id: str | None) -> str | None:
    if not conversation_id or not conversation_id.startswith("slack-"):
        return None
    channel_id = conversation_id.removeprefix("slack-").strip()
    return channel_id or None


def slack_conversation_id(channel_id: str) -> str:
    return f"slack-{channel_id.strip()}"


def slack_message_id(channel_id: str, message_ts: str) -> str:
    normalized_ts = message_ts.strip().replace(".", "_")
    return f"slack-{channel_id.strip()}-{normalized_ts}"


def slack_ts_from_message_id(channel_id: str, message_id: str | None) -> str | None:
    if not message_id:
        return None
    prefix = f"slack-{channel_id}-"
    if not message_id.startswith(prefix):
        return None
    return message_id.removeprefix(prefix).replace("_", ".")


def slack_datetime(message_ts: str) -> datetime:
    return datetime.fromtimestamp(float(message_ts), tz=timezone.utc)


def _slack_messaging_config() -> SlackMessagingConfig:
    channel_ids = tuple(
        channel_id.strip()
        for channel_id in settings.SLACK_MESSAGING_CHANNEL_IDS.split(",")
        if channel_id.strip()
    )
    return SlackMessagingConfig(
        enabled=settings.SLACK_MESSAGING_ENABLED,
        bot_token=settings.SLACK_BOT_TOKEN.strip(),
        channel_ids=channel_ids,
        channel_limit=settings.SLACK_MESSAGING_CHANNEL_LIMIT,
        history_limit=settings.SLACK_MESSAGING_HISTORY_LIMIT,
        timeout_seconds=settings.SLACK_MESSAGING_TIMEOUT_SECONDS,
        api_base_url=settings.SLACK_API_BASE_URL,
    )


def _require_slack_messaging_configured() -> SlackMessagingConfig:
    config = _slack_messaging_config()
    if not config.enabled:
        raise SlackMessagingIntegrationError(503, "Slack messaging sync is disabled on the API.")
    if not config.bot_token:
        raise SlackMessagingIntegrationError(503, "Slack messaging sync needs SLACK_BOT_TOKEN before it can run.")
    return config


def _require_messaging_tables(db: Session) -> None:
    if not messaging_workspace_tables_available(db):
        raise MessagingWorkspaceError(
            503,
            "Messaging workspace persistence is unavailable because the database schema is behind the current code. "
            "Run the latest migrations and retry.",
        )


def _optional_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _conversation_from_slack_payload(payload: dict[str, Any]) -> SlackConversation:
    channel_id = _optional_text(payload.get("id"))
    if channel_id is None:
        raise SlackMessagingIntegrationError(502, "Slack returned a conversation without an ID.")

    topic = payload.get("topic")
    purpose = payload.get("purpose")
    return SlackConversation(
        channel_id=channel_id,
        name=_optional_text(payload.get("name")) or channel_id,
        is_im=bool(payload.get("is_im")),
        is_mpim=bool(payload.get("is_mpim")),
        is_private=bool(payload.get("is_private")),
        topic=_optional_text(topic.get("value")) if isinstance(topic, dict) else None,
        purpose=_optional_text(purpose.get("value")) if isinstance(purpose, dict) else None,
        member_count=int(payload["num_members"]) if isinstance(payload.get("num_members"), int) else None,
    )


def _upsert_slack_conversation(
    db: Session,
    *,
    slack_conversation: SlackConversation,
    sort_order: int,
) -> tuple[MessagingWorkspaceConversation, bool, bool]:
    now = datetime.now(timezone.utc)
    conversation_id = slack_conversation_id(slack_conversation.channel_id)
    record = db.get(MessagingWorkspaceConversation, conversation_id)
    kind = "dm" if slack_conversation.is_im or slack_conversation.is_mpim else "channel"
    section = "Direct messages" if kind == "dm" else "Channels"
    label_prefix = "@" if kind == "dm" else "#"
    label = f"{label_prefix}{slack_conversation.name}"
    description = "Synced from Slack through the configured Slack Web API connector."
    topic = (
        slack_conversation.topic
        or slack_conversation.purpose
        or "Slack messages mirrored into the ECTRM messaging center."
    )
    composer_hint = "Messages sent here post to Slack and are mirrored locally for desk context."

    if record is None:
        record = MessagingWorkspaceConversation(
            conversation_id=conversation_id,
            section=section,
            kind=kind,
            label=label,
            connected_workspace="Slack",
            assistant_workspace="assistant",
            description=description,
            topic=topic,
            composer_hint=composer_hint,
            sort_order=sort_order,
            created_at=now,
            updated_at=now,
        )
        db.add(record)
        db.flush()
        return record, True, False

    updated = False
    for field_name, next_value in (
        ("section", section),
        ("kind", kind),
        ("label", label),
        ("connected_workspace", "Slack"),
        ("assistant_workspace", "assistant"),
        ("description", description),
        ("topic", topic),
        ("composer_hint", composer_hint),
    ):
        if getattr(record, field_name) != next_value:
            setattr(record, field_name, next_value)
            updated = True
    return record, False, updated


def _upsert_slack_message(
    db: Session,
    *,
    conversation: MessagingWorkspaceConversation,
    slack_conversation: SlackConversation,
    payload: dict[str, Any],
    slack_client: SlackMessagingClient,
    user_cache: dict[str, SlackUser | None],
) -> str:
    if _optional_text(payload.get("type")) not in {None, "message"}:
        return "skipped"
    subtype = _optional_text(payload.get("subtype"))
    if subtype in {"message_deleted", "channel_join", "channel_leave"}:
        return "skipped"
    message_ts = _optional_text(payload.get("ts"))
    if message_ts is None:
        return "skipped"

    text = _optional_text(payload.get("text")) or ""
    if not text and subtype != "bot_message":
        return "skipped"

    try:
        created_at = slack_datetime(message_ts)
    except (TypeError, ValueError):
        return "skipped"

    channel_id = slack_conversation.channel_id
    message_id = slack_message_id(channel_id, message_ts)
    thread_ts = _optional_text(payload.get("thread_ts"))
    parent_message_id = None
    thread_root_message_id = message_id
    if thread_ts and thread_ts != message_ts:
        parent_message_id = slack_message_id(channel_id, thread_ts)
        thread_root_message_id = parent_message_id

    author_name, author_title, author_tone = _resolve_slack_author(
        payload=payload,
        slack_client=slack_client,
        user_cache=user_cache,
    )
    reactions = _format_slack_reactions(payload.get("reactions"))
    existing = db.get(MessagingWorkspaceMessage, message_id)
    if existing is None:
        db.add(
            MessagingWorkspaceMessage(
                message_id=message_id,
                conversation_id=conversation.conversation_id,
                item_kind="MESSAGE",
                source="HUMAN" if author_tone == "human" else "SYSTEM",
                parent_message_id=parent_message_id,
                thread_root_message_id=thread_root_message_id,
                body=text or "Slack message with no text.",
                system_label=None,
                system_detail=None,
                author_name=author_name,
                author_title=author_title,
                author_presence="Synced from Slack",
                author_initials=build_member_initials(author_name),
                author_tone=author_tone,
                reactions=reactions or None,
                attachment_payload=None,
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
                pinned_at=None,
                pinned_by_user_id=None,
                pinned_by_session_id=None,
                pinned_by_role=None,
                created_at=created_at,
            )
        )
        if created_at > normalize_timestamp(conversation.updated_at):
            conversation.updated_at = created_at
        return "created"

    changed = False
    if existing.created_by_user_id is None:
        for field_name, next_value in (
            ("body", text or "Slack message with no text."),
            ("author_name", author_name),
            ("author_title", author_title),
            ("author_presence", "Synced from Slack"),
            ("author_initials", build_member_initials(author_name)),
            ("author_tone", author_tone),
            ("parent_message_id", parent_message_id),
            ("thread_root_message_id", thread_root_message_id),
        ):
            if getattr(existing, field_name) != next_value:
                setattr(existing, field_name, next_value)
                changed = True
    if list(existing.reactions or []) != reactions:
        existing.reactions = reactions or None
        changed = True
    if created_at > normalize_timestamp(conversation.updated_at):
        conversation.updated_at = created_at
    return "updated" if changed else "unchanged"


def _resolve_slack_author(
    *,
    payload: dict[str, Any],
    slack_client: SlackMessagingClient,
    user_cache: dict[str, SlackUser | None],
) -> tuple[str, str, str]:
    bot_profile = payload.get("bot_profile")
    if isinstance(bot_profile, dict):
        name = _optional_text(bot_profile.get("name")) or _optional_text(payload.get("username")) or "Slack Bot"
        return name, "Slack bot", "system"

    user_id = _optional_text(payload.get("user"))
    if user_id is None:
        username = _optional_text(payload.get("username")) or "Slack User"
        return username, "Slack user", "human"

    if user_id not in user_cache:
        try:
            user_cache[user_id] = slack_client.user_info(user_id)
        except SlackMessagingIntegrationError:
            user_cache[user_id] = None
    user = user_cache.get(user_id)
    if user is None:
        return user_id, "Slack user", "human"
    return user.display_name, user.title, "system" if user.is_bot else "human"


def _format_slack_reactions(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    reactions: list[str] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        name = _optional_text(item.get("name"))
        count = item.get("count")
        if name is None or not isinstance(count, int):
            continue
        reactions.append(f":{name}: {count}")
    return reactions
