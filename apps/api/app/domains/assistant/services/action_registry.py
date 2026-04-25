from __future__ import annotations

from apps.api.app.domains.assistant.services.action_catalog import ASSISTANT_ACTION_CATALOG_BY_NAME
from apps.api.app.domains.assistant.services.action_handlers import ACTION_HANDLERS
from apps.api.app.domains.assistant.services.action_planners import ACTION_PLANNERS
from apps.api.app.domains.assistant.services.action_specs import (
    AssistantActionHandler,
    AssistantActionSpec,
    build_assistant_action_spec_registry,
)

__all__ = ["ACTION_HANDLERS", "ACTION_SPECS"]

_READY_PREVIEW_ACTION_TYPES = frozenset({"issue_trade_invoice"})


def _action_spec(handler: AssistantActionHandler) -> AssistantActionSpec:
    return AssistantActionSpec(
        catalog_entry=ASSISTANT_ACTION_CATALOG_BY_NAME[handler.action_type],
        handler=handler,
        planner=ACTION_PLANNERS[handler.action_type],
        requires_ready_preview=handler.action_type in _READY_PREVIEW_ACTION_TYPES,
    )


ACTION_SPECS: dict[str, AssistantActionSpec] = build_assistant_action_spec_registry(
    tuple(_action_spec(handler) for handler in ACTION_HANDLERS.values())
)
