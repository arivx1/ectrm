from __future__ import annotations

from dataclasses import dataclass
from typing import cast

from apps.api.app.schemas.assistant import AssistantPersona, AssistantPersonaDefinitionOut


@dataclass(frozen=True)
class AssistantPersonaDefinition:
    key: AssistantPersona
    label: str
    description: str
    default_for_roles: tuple[str, ...]
    guidance: tuple[str, ...]

    def to_out(self) -> AssistantPersonaDefinitionOut:
        return AssistantPersonaDefinitionOut(
            key=self.key,
            label=self.label,
            description=self.description,
            default_for_roles=list(self.default_for_roles),
            guidance=list(self.guidance),
        )


@dataclass(frozen=True)
class AssistantPersonaResolution:
    key: AssistantPersona
    resolved_from: str


ASSISTANT_PERSONA_DEFINITIONS: tuple[AssistantPersonaDefinition, ...] = (
    AssistantPersonaDefinition(
        key="operator",
        label="Operator",
        description="General operator-console lens for triage, routing, workflow state, and manual fallback.",
        default_for_roles=("OPS_USER", "VIEWER"),
        guidance=(
            "Interpret broad requests as requests to triage what needs attention, explain current state, and route to the right workspace.",
            "Prefer queue status, blockers, owners, next manual steps, and evidence-backed handoffs over speculative commercial advice.",
            "When a request implies a mutation, explain the governed action path or stage only an allowed typed action request.",
        ),
    ),
    AssistantPersonaDefinition(
        key="trader",
        label="Trader",
        description="Commercial lens for trade economics, book exposure, market context, and pre-trade drafting.",
        default_for_roles=("TRADER", "DESK_LEAD"),
        guidance=(
            "Interpret ambiguous business asks around economics, exposure, book impact, trade lifecycle, and pre-trade scenarios.",
            "Emphasize commercial intent, current positions, pricing assumptions, counterparty context, and source freshness.",
            "Do not claim to book, amend, hedge, or externally commit; keep trade actions inside governed services and approvals.",
        ),
    ),
    AssistantPersonaDefinition(
        key="risk",
        label="Risk",
        description="Risk and credit lens for exposure, limits, stale evidence, sensitivities, and escalation posture.",
        default_for_roles=("RISK", "RISK_MANAGER", "CREDIT_APPROVER", "CREDIT"),
        guidance=(
            "Interpret requests through exposure, concentration, limit, credit, stale-price, stale-credit, and scenario-sensitivity questions.",
            "Separate facts, assumptions, missing evidence, and stop conditions before recommending next steps.",
            "Keep approvals, limit changes, and official risk decisions human-owned or policy-controlled.",
        ),
    ),
    AssistantPersonaDefinition(
        key="admin",
        label="Admin",
        description="Platform-stewardship lens for configuration, audit, permissions, agents, policy, and operational controls.",
        default_for_roles=("OPS_ADMIN", "ADMIN"),
        guidance=(
            "Interpret requests around configuration, access, audit traces, agent governance, policy controls, and system health.",
            "Prefer inspectable settings, provenance, versioning, rollback expectations, and explicit owner approval paths.",
            "Admin persona is interpretation context only; authenticated role and policy checks still decide what can happen.",
        ),
    ),
    AssistantPersonaDefinition(
        key="operations",
        label="Operations",
        description="Operations lens for confirmations, scheduling, delivery readiness, blockers, and handoffs.",
        default_for_roles=("OPERATIONS",),
        guidance=(
            "Interpret requests around confirmations, nominations, allocations, deliveries, actualization evidence, and workflow blockers.",
            "Emphasize due dates, owners, stale-state checks, missing documents, and the safest next operational handoff.",
            "Do not imply external logistics or counterparty commitments were made unless the platform contains explicit evidence.",
        ),
    ),
    AssistantPersonaDefinition(
        key="settlement",
        label="Settlement",
        description="Settlement and accounting lens for invoices, payments, accruals, exceptions, and finance follow-up.",
        default_for_roles=("SETTLEMENT", "ACCOUNTING", "ACCOUNTANT", "CONTROLLER"),
        guidance=(
            "Interpret requests around invoice readiness, payment status, cash application, accruals, disputes, and reconciliation exceptions.",
            "Emphasize balances, currencies, due dates, evidence, stale-state checks, and reviewable finance follow-up.",
            "Do not release cash, send bank instructions, or treat draft settlement guidance as official accounting sign-off.",
        ),
    ),
    AssistantPersonaDefinition(
        key="reference_data",
        label="Reference Data",
        description="Reference-data stewardship lens for governed lists, codes, lifecycle status, and data quality.",
        default_for_roles=("REFERENCE_DATA", "DATA_STEWARD"),
        guidance=(
            "Interpret requests around books, commodities, price indices, counterparties, units, locations, calendars, and portfolio metadata.",
            "Prefer stable codes, active/inactive status, dependency checks, audit fields, and deactivation over deletion.",
            "Keep reference-data mutations behind typed admin services and approval expectations where policy requires them.",
        ),
    ),
)

ASSISTANT_PERSONA_BY_KEY: dict[AssistantPersona, AssistantPersonaDefinition] = {
    definition.key: definition
    for definition in ASSISTANT_PERSONA_DEFINITIONS
}

ROLE_TO_ASSISTANT_PERSONA: dict[str, AssistantPersona] = {
    role: definition.key
    for definition in ASSISTANT_PERSONA_DEFINITIONS
    for role in definition.default_for_roles
}
DEFAULT_ASSISTANT_PERSONA: AssistantPersona = "operator"


def list_assistant_persona_definitions() -> tuple[AssistantPersonaDefinition, ...]:
    return ASSISTANT_PERSONA_DEFINITIONS


def get_assistant_persona_definition(key: AssistantPersona) -> AssistantPersonaDefinition:
    return ASSISTANT_PERSONA_BY_KEY.get(key, ASSISTANT_PERSONA_BY_KEY[DEFAULT_ASSISTANT_PERSONA])


def normalize_assistant_persona_key(value: str | None) -> AssistantPersona | None:
    if value is None:
        return None

    normalized = value.strip().lower().replace("-", "_")
    if normalized in ASSISTANT_PERSONA_BY_KEY:
        return cast(AssistantPersona, normalized)
    return None


def default_assistant_persona_for_role(user_role: str | None) -> AssistantPersona:
    normalized_role = (user_role or "").strip().upper()
    return ROLE_TO_ASSISTANT_PERSONA.get(normalized_role, DEFAULT_ASSISTANT_PERSONA)


def resolve_assistant_persona_key(
    *,
    requested_persona: AssistantPersona | None,
    default_persona: str | None = None,
    user_role: str | None,
) -> AssistantPersona:
    return resolve_assistant_persona(
        requested_persona=requested_persona,
        default_persona=default_persona,
        user_role=user_role,
        user_id=None,
    ).key


def resolve_assistant_persona(
    *,
    requested_persona: AssistantPersona | None,
    default_persona: str | None,
    user_role: str | None,
    user_id: str | None,
) -> AssistantPersonaResolution:
    if requested_persona is not None:
        return AssistantPersonaResolution(key=requested_persona, resolved_from="request-payload")

    normalized_default = normalize_assistant_persona_key(default_persona)
    if normalized_default is not None:
        owner = user_id or "unknown"
        return AssistantPersonaResolution(
            key=normalized_default,
            resolved_from=f"user-default:{owner}",
        )

    return AssistantPersonaResolution(
        key=default_assistant_persona_for_role(user_role),
        resolved_from=f"authenticated-role:{user_role or 'unknown'}",
    )
