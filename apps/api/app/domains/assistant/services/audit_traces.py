from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Iterable

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.action_requests import (
    list_action_requests_for_run,
    to_action_request_out,
)
from apps.api.app.domains.assistant.services.runs import to_assistant_run_out
from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.models.event import Event
from apps.api.app.schemas.assistant import (
    AssistantActionRequestTraceOut,
    AssistantAuditEventOut,
    AssistantAuditTimelineEntryOut,
    AssistantRunAuditTraceOut,
)


@dataclass(frozen=True)
class _TimelineDraft:
    entry: AssistantAuditTimelineEntryOut
    order: int


def build_assistant_run_audit_trace(
    db: Session,
    run_record: AssistantRun,
) -> AssistantRunAuditTraceOut:
    action_records = list_action_requests_for_run(db, run_record.id)
    mutation_events_by_action_id = _load_mutation_events_by_action_id(db, action_records)
    action_traces = [
        AssistantActionRequestTraceOut(
            action_request=to_action_request_out(action_record),
            mutation_events=[
                _to_audit_event_out(event)
                for event in mutation_events_by_action_id.get(action_record.id, [])
            ],
        )
        for action_record in action_records
    ]
    mutation_event_count = sum(len(trace.mutation_events) for trace in action_traces)
    return AssistantRunAuditTraceOut(
        run=to_assistant_run_out(run_record),
        action_requests=action_traces,
        timeline=_build_timeline(
            run_record=run_record,
            action_records=action_records,
            mutation_events_by_action_id=mutation_events_by_action_id,
        ),
        mutation_event_count=mutation_event_count,
    )


def _load_mutation_events_by_action_id(
    db: Session,
    action_records: Iterable[AssistantActionRequest],
) -> dict[int, list[Event]]:
    records = list(action_records)
    if not records:
        return {}

    event_ids_by_action_id: dict[int, set[str]] = defaultdict(set)
    correlation_ids_by_action_id: dict[int, str] = {}
    causation_ids_by_action_id: dict[int, str] = {}

    for record in records:
        correlation_ids_by_action_id[record.id] = f"assistant-action-{record.id}"
        causation_ids_by_action_id[record.id] = f"assistant-action-request:{record.id}"
        if isinstance(record.result, dict):
            event_id = record.result.get("event_id")
            if isinstance(event_id, str) and event_id.strip():
                event_ids_by_action_id[record.id].add(event_id.strip())

    known_event_ids = {
        event_id
        for event_ids in event_ids_by_action_id.values()
        for event_id in event_ids
    }
    known_correlation_ids = set(correlation_ids_by_action_id.values())
    known_causation_ids = set(causation_ids_by_action_id.values())

    conditions = []
    if known_event_ids:
        conditions.append(Event.event_id.in_(known_event_ids))
    if known_correlation_ids:
        conditions.append(Event.correlation_id.in_(known_correlation_ids))
    if known_causation_ids:
        conditions.append(Event.causation_id.in_(known_causation_ids))
    if not conditions:
        return {}

    events = db.execute(
        select(Event)
        .where(or_(*conditions))
        .order_by(Event.occurred_at.asc(), Event.recorded_at.asc(), Event.event_id.asc())
    ).scalars().all()

    events_by_action_id: dict[int, list[Event]] = defaultdict(list)
    seen_pairs: set[tuple[int, str]] = set()
    for event in events:
        for action_id, event_ids in event_ids_by_action_id.items():
            if event.event_id in event_ids:
                _append_unique_event(events_by_action_id, seen_pairs, action_id, event)
        for action_id, correlation_id in correlation_ids_by_action_id.items():
            if event.correlation_id == correlation_id:
                _append_unique_event(events_by_action_id, seen_pairs, action_id, event)
        for action_id, causation_id in causation_ids_by_action_id.items():
            if event.causation_id == causation_id:
                _append_unique_event(events_by_action_id, seen_pairs, action_id, event)

    return dict(events_by_action_id)


def _append_unique_event(
    events_by_action_id: dict[int, list[Event]],
    seen_pairs: set[tuple[int, str]],
    action_id: int,
    event: Event,
) -> None:
    pair = (action_id, event.event_id)
    if pair in seen_pairs:
        return
    seen_pairs.add(pair)
    events_by_action_id[action_id].append(event)


def _build_timeline(
    *,
    run_record: AssistantRun,
    action_records: list[AssistantActionRequest],
    mutation_events_by_action_id: dict[int, list[Event]],
) -> list[AssistantAuditTimelineEntryOut]:
    drafts: list[_TimelineDraft] = [
        _TimelineDraft(
            order=0,
            entry=AssistantAuditTimelineEntryOut(
                entry_type="run_started",
                occurred_at=run_record.created_at,
                title="Run started",
                summary=run_record.latest_user_message or "Assistant run began.",
                status=run_record.status,
                metadata={
                    "run_id": run_record.id,
                    "conversation_id": run_record.conversation_id,
                    "workspace": run_record.workspace,
                    "agent_id": run_record.agent_id,
                    "provider": run_record.provider,
                    "model": run_record.model,
                },
            ),
        ),
        _TimelineDraft(
            order=10,
            entry=AssistantAuditTimelineEntryOut(
                entry_type="context",
                occurred_at=run_record.created_at,
                title="Prompt context assembled",
                summary=(
                    f"{len(run_record.prompt_sections or [])} prompt section(s), "
                    f"{len(run_record.request_messages or [])} request message(s)."
                ),
                metadata={
                    "warning_count": len(run_record.warnings or []),
                    "has_application_context": bool(run_record.application_context),
                },
            ),
        ),
    ]

    for index, tool_call in enumerate(run_record.tool_calls or []):
        drafts.append(
            _TimelineDraft(
                order=100 + index,
                entry=AssistantAuditTimelineEntryOut(
                    entry_type="tool_call",
                    occurred_at=run_record.completed_at,
                    title=f"Tool call: {_tool_call_text(tool_call, 'tool_name') or 'unknown'}",
                    summary=_tool_call_text(tool_call, "summary") or "Assistant tool call completed.",
                    metadata={
                        "tool_name": _tool_call_text(tool_call, "tool_name"),
                        "arguments": _tool_call_dict(tool_call, "arguments"),
                        "record_count": tool_call.get("record_count") if isinstance(tool_call, dict) else None,
                    },
                ),
            )
        )

    for index, action_record in enumerate(action_records):
        drafts.append(
            _TimelineDraft(
                order=200 + index,
                entry=AssistantAuditTimelineEntryOut(
                    entry_type="action_requested",
                    occurred_at=action_record.created_at,
                    title=action_record.summary,
                    summary=action_record.description,
                    status=action_record.status,
                    metadata={
                        "action_request_id": action_record.id,
                        "action_type": action_record.action_type,
                        "user_id": action_record.user_id,
                        "payload": dict(action_record.payload or {}),
                    },
                ),
            )
        )
        if action_record.decided_at is not None:
            drafts.append(
                _TimelineDraft(
                    order=300 + index,
                    entry=AssistantAuditTimelineEntryOut(
                        entry_type="decision",
                        occurred_at=action_record.decided_at,
                        title=f"Decision: {action_record.status}",
                        summary=(
                            f"{action_record.decided_by or 'Unknown actor'} decided "
                            f"action request #{action_record.id}."
                        ),
                        status=action_record.status,
                        metadata={
                            "action_request_id": action_record.id,
                            "decided_by": action_record.decided_by,
                            "result": action_record.result if isinstance(action_record.result, dict) else {},
                            "error_detail": action_record.error_detail,
                        },
                    ),
                )
            )
        for event_index, event in enumerate(mutation_events_by_action_id.get(action_record.id, [])):
            drafts.append(
                _TimelineDraft(
                    order=400 + index * 100 + event_index,
                    entry=AssistantAuditTimelineEntryOut(
                        entry_type="mutation",
                        occurred_at=event.occurred_at,
                        title=f"Mutation event: {event.event_type}",
                        summary=f"{event.aggregate_type} {event.aggregate_id}",
                        status=None,
                        metadata={
                            "action_request_id": action_record.id,
                            "event_id": event.event_id,
                            "aggregate_type": event.aggregate_type,
                            "aggregate_id": event.aggregate_id,
                            "payload": dict(event.payload or {}),
                        },
                    ),
                )
            )

    drafts.append(
        _TimelineDraft(
            order=900,
            entry=AssistantAuditTimelineEntryOut(
                entry_type="run_completed",
                occurred_at=run_record.completed_at,
                title="Run completed",
                summary=run_record.assistant_message or run_record.error_detail or "Assistant run completed.",
                status=run_record.status,
                metadata={
                    "input_tokens": run_record.input_tokens,
                    "output_tokens": run_record.output_tokens,
                    "tool_call_count": len(run_record.tool_calls or []),
                    "action_request_count": len(action_records),
                },
            ),
        )
    )

    return [
        draft.entry
        for draft in sorted(
            drafts,
            key=lambda draft: (draft.entry.occurred_at, draft.order),
        )
    ]


def _tool_call_text(tool_call: dict[str, Any], key: str) -> str | None:
    value = tool_call.get(key) if isinstance(tool_call, dict) else None
    return value if isinstance(value, str) else None


def _tool_call_dict(tool_call: dict[str, Any], key: str) -> dict[str, Any]:
    value = tool_call.get(key) if isinstance(tool_call, dict) else None
    return dict(value) if isinstance(value, dict) else {}


def _to_audit_event_out(event: Event) -> AssistantAuditEventOut:
    return AssistantAuditEventOut(
        event_id=event.event_id,
        aggregate_type=event.aggregate_type,
        aggregate_id=event.aggregate_id,
        event_type=event.event_type,
        occurred_at=event.occurred_at,
        recorded_at=event.recorded_at,
        actor_id=event.actor_id,
        correlation_id=event.correlation_id,
        causation_id=event.causation_id,
        payload=dict(event.payload or {}),
    )
