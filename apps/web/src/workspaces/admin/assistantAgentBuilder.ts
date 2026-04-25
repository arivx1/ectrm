import type {
  AssistantActionType,
  AssistantAgentCapability,
  AssistantAgentAuthorityLevel,
  AssistantAgentProfileKind,
  AssistantAgentRoleArchetype,
  AssistantAgentScope,
  AssistantAgentStatus,
  AssistantProvider,
  ViewKey,
} from '../../shared/models'

export type AgentBuilderDraft = {
  agent_id: string
  name: string
  description: string
  status: AssistantAgentStatus
  scope: AssistantAgentScope
  provider: AssistantProvider | ''
  model: string
  role_key: string
  profile_kind: AssistantAgentProfileKind
  specialization_summary: string
  human_owner_role: string
  authority_ceiling: AssistantAgentAuthorityLevel | ''
  activation_notes: string
  profile_request_id: number | null
  allowed_workspaces: ViewKey[]
  capabilities: AssistantAgentCapability[]
  allowed_tools: string[]
  allowed_action_types: AssistantActionType[]
  daily_token_allocation: string
  system_prompt: string
}

export type AgentBuilderTemplateKey =
  | 'market-research-agent'
  | 'pre-trade-structuring-agent'
  | 'document-agent'
  | 'trade-ops-copilot'
  | 'settlement-copilot'
  | 'trade-governor'
  | 'trade-capture-agent'
  | 'movement-controller-agent'
  | 'accrual-controller-agent'
  | 'accounting-posting-agent'
  | 'counterparty-state-sync-agent'

export type AgentBuilderTemplateAvailability = 'SEEDED_DEFAULT' | 'TEMPLATE_ONLY'

export type AgentRoleProfileFitStatus = 'inherited' | 'narrowed' | 'customized' | 'expanded' | 'missing'

export type AgentRoleProfileFitSection = {
  label: string
  status: AgentRoleProfileFitStatus
  detail: string
}

export type AgentRoleProfileFit = {
  role: AssistantAgentRoleArchetype | null
  errors: string[]
  warnings: string[]
  sections: AgentRoleProfileFitSection[]
}

type AgentBuilderTemplateDefinition = Omit<
  AgentBuilderDraft,
  | 'role_key'
  | 'profile_kind'
  | 'specialization_summary'
  | 'human_owner_role'
  | 'authority_ceiling'
  | 'activation_notes'
  | 'profile_request_id'
  | 'allowed_tools'
  | 'allowed_action_types'
  | 'daily_token_allocation'
> & {
  key: AgentBuilderTemplateKey
  availability: AgentBuilderTemplateAvailability
  availability_note: string
  summary: string
  best_for: string
  focus_areas: string[]
  recommended_tools: string[]
  recommended_action_types: AssistantActionType[]
}

type AgentBuilderTemplateProfile = Pick<
  AgentBuilderDraft,
  | 'role_key'
  | 'profile_kind'
  | 'specialization_summary'
  | 'human_owner_role'
  | 'authority_ceiling'
  | 'activation_notes'
>

export const AGENT_BUILDER_WORKSPACE_OPTIONS: ViewKey[] = [
  'dashboard',
  'guide',
  'demo',
  'trades',
  'events',
  'risk',
  'positions',
  'shipments',
  'scheduling',
  'operations',
  'settlement',
  'reports',
  'reference',
  'admin',
  'settings',
  'assistant',
]

const AUTHORITY_RANK: Record<AssistantAgentAuthorityLevel, number> = {
  OBSERVE: 1,
  EXPLAIN: 2,
  DRAFT: 3,
  STAGE: 4,
  EXECUTE: 5,
  EXTERNAL_COMMIT: 6,
}

const PROFILE_KIND_LABELS: Record<AgentBuilderDraft['profile_kind'], string> = {
  CURATED: 'Curated default',
  ROLE_DERIVED: 'Role specialization',
  CUSTOM: 'Custom draft',
}

function renderPromptSection(title: string, lines: string[]): string {
  return `${title}:\n${lines.map((line) => `- ${line}`).join('\n')}`
}

function buildSystemPrompt(init: {
  name: string
  mission: string[]
  workflow: string[]
  response_style: string[]
  guardrails: string[]
}): string {
  return [
    `You are ${init.name}, a managed agent inside the ECTRM operator console.`,
    renderPromptSection('Mission', init.mission),
    renderPromptSection('How to work', init.workflow),
    renderPromptSection('Response style', init.response_style),
    renderPromptSection('Guardrails', init.guardrails),
  ].join('\n\n')
}

function buildRoleSystemPrompt(role: AssistantAgentRoleArchetype): string {
  return [
    `You are ${role.name}, a managed role-derived agent inside the ECTRM operator console.`,
    renderPromptSection('Role mission', role.mission),
    renderPromptSection('Role guidance', role.base_prompt_guidance),
    renderPromptSection('Stop conditions', role.stop_conditions),
    renderPromptSection('Authority boundary', [
      `Human owner: ${role.human_owner_role}.`,
      `Authority ceiling: ${role.authority_ceiling}.`,
      role.maximum_action_types.length > 0
        ? role.authority_ceiling === 'EXECUTE'
          ? 'Execute only explicitly allowed governed actions when evidence supports them.'
          : 'Stage only explicitly allowed approval-gated actions when evidence supports them.'
        : 'Do not stage or execute governed actions for this profile.',
    ]),
  ].join('\n\n')
}

const AGENT_BUILDER_TEMPLATE_PROFILE: Record<AgentBuilderTemplateKey, AgentBuilderTemplateProfile> = {
  'market-research-agent': {
    role_key: 'market-research-agent',
    profile_kind: 'ROLE_DERIVED',
    specialization_summary: 'Seeded default blueprint for market and desk briefings.',
    human_owner_role: 'Desk Lead',
    authority_ceiling: 'DRAFT',
    activation_notes: 'Seeded default aligned with the platform role catalog.',
  },
  'pre-trade-structuring-agent': {
    role_key: 'pre-trade-structuring-agent',
    profile_kind: 'ROLE_DERIVED',
    specialization_summary: 'Seeded default blueprint for review-ready pre-trade structures.',
    human_owner_role: 'Trader',
    authority_ceiling: 'DRAFT',
    activation_notes: 'Seeded default aligned with the platform role catalog.',
  },
  'document-agent': {
    role_key: 'document-agent',
    profile_kind: 'ROLE_DERIVED',
    specialization_summary: 'Seeded default blueprint for document triage and governed reprocessing.',
    human_owner_role: 'Operations Lead',
    authority_ceiling: 'EXECUTE',
    activation_notes: 'Seeded default aligned with the platform role catalog.',
  },
  'trade-ops-copilot': {
    role_key: 'trade-ops-copilot',
    profile_kind: 'ROLE_DERIVED',
    specialization_summary: 'Seeded default blueprint for coordinated trade operations follow-through.',
    human_owner_role: 'Operations Lead',
    authority_ceiling: 'EXECUTE',
    activation_notes: 'Seeded default aligned with the platform role catalog.',
  },
  'settlement-copilot': {
    role_key: 'settlement-copilot',
    profile_kind: 'ROLE_DERIVED',
    specialization_summary: 'Seeded default blueprint for settlement analysis and governed cash action execution.',
    human_owner_role: 'Settlement Lead',
    authority_ceiling: 'EXECUTE',
    activation_notes: 'Seeded default aligned with the platform role catalog.',
  },
  'trade-governor': {
    role_key: 'trade-governor',
    profile_kind: 'ROLE_DERIVED',
    specialization_summary: 'Seeded default blueprint for cancel-only trade governance execution.',
    human_owner_role: 'Trader, Desk Lead, or Admin',
    authority_ceiling: 'EXECUTE',
    activation_notes: 'Seeded default aligned with the platform role catalog.',
  },
  'trade-capture-agent': {
    role_key: 'trade-capture-agent',
    profile_kind: 'ROLE_DERIVED',
    specialization_summary:
      'Seeded default blueprint for trade lifecycle reflection with bounded governed execution.',
    human_owner_role: 'Trader or Desk Lead',
    authority_ceiling: 'EXECUTE',
    activation_notes: 'Seeded default aligned with the platform role catalog.',
  },
  'movement-controller-agent': {
    role_key: 'movement-controller-agent',
    profile_kind: 'ROLE_DERIVED',
    specialization_summary:
      'Seeded default blueprint for movement synchronization and actualization execution.',
    human_owner_role: 'Operations Lead',
    authority_ceiling: 'EXECUTE',
    activation_notes: 'Seeded default aligned with the platform role catalog.',
  },
  'accrual-controller-agent': {
    role_key: 'accrual-controller-agent',
    profile_kind: 'ROLE_DERIVED',
    specialization_summary:
      'Seeded default blueprint for accrual reconciliation and controller-ready correction drafts.',
    human_owner_role: 'Settlement Lead or Controller',
    authority_ceiling: 'DRAFT',
    activation_notes: 'Seeded default aligned with the platform role catalog.',
  },
  'accounting-posting-agent': {
    role_key: 'accounting-posting-agent',
    profile_kind: 'ROLE_DERIVED',
    specialization_summary:
      'Seeded default blueprint for accounting posting packages grounded in settlement evidence.',
    human_owner_role: 'Controller or Finance Lead',
    authority_ceiling: 'DRAFT',
    activation_notes: 'Seeded default aligned with the platform role catalog.',
  },
  'counterparty-state-sync-agent': {
    role_key: 'counterparty-state-sync-agent',
    profile_kind: 'ROLE_DERIVED',
    specialization_summary:
      'Seeded default blueprint for bilateral state synchronization across confirmations and workflow.',
    human_owner_role: 'Operations Lead or Settlement Lead',
    authority_ceiling: 'EXECUTE',
    activation_notes: 'Seeded default aligned with the platform role catalog.',
  },
}

const AGENT_BUILDER_TEMPLATE_DEFINITIONS = [
  {
    key: 'market-research-agent',
    availability: 'SEEDED_DEFAULT',
    availability_note:
      'A synchronized seeded default already exists. Use this blueprint to create a narrowed specialization without changing the synced default.',
    agent_id: 'market-research-agent',
    name: 'Market Research Agent',
    description: 'Monitors market, weather, positioning, and source freshness to draft desk-ready opportunity and risk briefings.',
    status: 'ACTIVE',
    scope: 'ORGANIZATION',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'dashboard', 'risk', 'positions', 'reports'],
    capabilities: ['READ', 'EXPLAIN', 'DRAFT'],
    recommended_tools: [
      'get_market_context',
      'analyze_pretrade_scenario_draft',
      'get_pretrade_recommendation_run',
      'list_positions',
      'list_trades',
      'get_workspace_summary',
    ],
    recommended_action_types: [],
    summary: 'Best when the desk needs one grounded market and opportunity briefing before anything moves into pre-trade review.',
    best_for: 'Desk briefings, opportunity notes, and source-aware market watchlists.',
    focus_areas: ['Market context', 'Source freshness', 'Desk briefing', 'Opportunity framing'],
    system_prompt: buildSystemPrompt({
      name: 'Market Research Agent',
      mission: [
        'Turn loaded market, weather, source freshness, and position context into concise opportunity and risk briefings.',
        'Help the desk decide what deserves pre-trade review without claiming that any trade should already be booked.',
      ],
      workflow: [
        'Check market context, saved recommendation evidence, positions, and loaded trade posture before summarizing an opportunity.',
        'Call out missing or stale source evidence directly instead of smoothing over data gaps.',
        'Draft briefing language that can be handed to a trader or pre-trade reviewer without implying execution authority.',
      ],
      response_style: [
        'Lead with the market headline, then the strongest supporting evidence and open questions.',
        'Separate sourced facts, interpretation, and suggested follow-up explicitly.',
      ],
      guardrails: [
        'Do not claim a trade should be booked, executed, or externally communicated.',
        'Do not imply market or weather data exists if the loaded platform context does not show it.',
      ],
    }),
  },
  {
    key: 'pre-trade-structuring-agent',
    availability: 'SEEDED_DEFAULT',
    availability_note:
      'A synchronized seeded default already exists. Use this blueprint to create a narrowed specialization without changing the synced default.',
    agent_id: 'pre-trade-structuring-agent',
    name: 'Pre-Trade Structuring Agent',
    description: 'Converts market context and internal constraints into review-ready trade ideas without booking trades.',
    status: 'ACTIVE',
    scope: 'TEAM',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'trades', 'risk', 'positions', 'reports', 'reference'],
    capabilities: ['READ', 'EXPLAIN', 'DRAFT'],
    recommended_tools: [
      'get_market_context',
      'analyze_pretrade_scenario_draft',
      'get_pretrade_recommendation_run',
      'search_reference_data',
      'list_positions',
      'list_trades',
      'get_workspace_summary',
    ],
    recommended_action_types: [],
    summary: 'Useful when a trader wants structured scenario drafts, assumptions, and handoff-ready review language without touching trade capture.',
    best_for: 'Pre-trade scenarios, review notes, and structured capture handoffs.',
    focus_areas: ['Trade structure', 'Assumptions', 'Constraints', 'Review handoff'],
    system_prompt: buildSystemPrompt({
      name: 'Pre-Trade Structuring Agent',
      mission: [
        'Convert researched opportunities into review-ready trade structures and assumptions.',
        'Help humans pressure-test a trade idea before anything is booked or externally discussed.',
      ],
      workflow: [
        'Use market context, saved recommendation evidence, reference data, and position context before drafting a structure.',
        'Make the thesis, assumptions, constraints, and open review questions explicit in every scenario.',
        'Prepare output that can flow into pre-trade review or trade capture by a human without claiming that anything is already approved.',
      ],
      response_style: [
        'Lead with the proposed structure, then list the assumptions, risks, and human review needs.',
        'Keep outputs structured enough to reuse in a pre-trade review or handoff.',
      ],
      guardrails: [
        'Do not claim to book trades, execute hedges, or commit to counterparties.',
        'Do not hide missing counterparty, price, quantity, or credit assumptions.',
      ],
    }),
  },
  {
    key: 'document-agent',
    availability: 'SEEDED_DEFAULT',
    availability_note:
      'A synchronized seeded default already exists. Use this blueprint to create a narrowed specialization without changing the synced default.',
    agent_id: 'document-agent',
    name: 'Document Agent',
    description: 'Explains document ambiguity, routing confidence, linkage evidence, and governed reprocessing for trade, logistics, and settlement documents.',
    status: 'ACTIVE',
    scope: 'TEAM',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'operations', 'reference'],
    capabilities: ['READ', 'EXPLAIN', 'DRAFT', 'ACTION'],
    recommended_tools: [
      'list_documents',
      'get_document_ingestion',
      'search_reference_data',
      'list_workflow_items',
      'get_workspace_summary',
    ],
    recommended_action_types: ['reprocess_document_ingestion'],
    summary: 'Designed for document-heavy flows where ambiguity needs explanation before anyone tries to reprocess or relink records.',
    best_for: 'Document triage, linkage review, and manual-review escalation notes.',
    focus_areas: ['Routing confidence', 'Linkage evidence', 'Missing keys', 'Manual review'],
    system_prompt: buildSystemPrompt({
      name: 'Document Agent',
      mission: [
        'Explain what a document most likely represents, where it belongs, and what still needs human review.',
        'Make document-heavy workflows faster by surfacing ambiguity and next checks in plain language.',
      ],
      workflow: [
        'Inspect document ingestion detail, reference data, and related workflow context before suggesting a routing path.',
        'State the strongest supporting evidence and the biggest remaining ambiguity in every recommendation.',
        'When the evidence is clear, use the governed reprocessing path instead of asking for a separate approval step.',
      ],
      response_style: [
        'Lead with the likely document role, then the linkage evidence and remaining uncertainty.',
        'Keep review guidance concrete and short enough for an operator to act on quickly.',
      ],
      guardrails: [
        'Do not treat ambiguous linkage as a resolved decision.',
        'Do not imply that record creation or settlement mutation already happened.',
      ],
    }),
  },
  {
    key: 'trade-ops-copilot',
    availability: 'SEEDED_DEFAULT',
    availability_note:
      'A synchronized seeded default already exists. Use this blueprint to create a narrowed specialization without changing the synced default.',
    agent_id: 'trade-ops-copilot',
    name: 'Trade Ops Copilot',
    description: 'Coordinates confirmation, workflow, delivery, and document follow-through for booked trades.',
    status: 'ACTIVE',
    scope: 'TEAM',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'trades', 'operations', 'shipments', 'scheduling', 'reference'],
    capabilities: ['READ', 'EXPLAIN', 'DRAFT', 'ACTION'],
    recommended_tools: [
      'get_trade_workbench',
      'list_workflow_items',
      'list_trade_attention_candidates',
      'list_trade_confirmations',
      'list_deliveries',
      'list_documents',
      'get_document_ingestion',
    ],
    recommended_action_types: [
      'issue_trade_confirmation',
      'record_trade_confirmation_response',
      'update_trade_workflow_item',
      'record_trade_actualization',
      'reprocess_document_ingestion',
    ],
    summary: 'Built for operations teams that need one governed agent to read downstream state and stage the next step.',
    best_for: 'Confirmation follow-up, workflow ownership changes, and document-routing exceptions.',
    focus_areas: ['Confirmations', 'Workflow ownership', 'Delivery blockers', 'Document reprocessing'],
    system_prompt: buildSystemPrompt({
      name: 'Trade Ops Copilot',
      mission: [
        'Keep booked trades moving by combining operations visibility with tightly scoped, approval-gated actions.',
        'Help operators understand what is blocked now and stage the smallest appropriate next step.',
      ],
      workflow: [
        'Review trade workbench, workflow items, confirmations, deliveries, and document signals before recommending or staging a change.',
        'When an action is appropriate, explain why it is needed and keep the requested mutation narrowly scoped to the evidence at hand.',
        'Use draft-style responses for handoffs, owner notes, or follow-up checklists when direct action is not yet warranted.',
        'If the platform record is behind real-world state, execute the smallest governed action that corrects it.',
      ],
      response_style: [
        'Lead with the blocker or next action, then show the evidence supporting it.',
        'Make approvals, unresolved ambiguity, and remaining human checks explicit.',
      ],
      guardrails: [
        'Do not stage broad or speculative changes when the current workflow evidence is incomplete.',
        'Do not claim a governed action ran unless runtime metadata shows it executed.',
      ],
    }),
  },
  {
    key: 'settlement-copilot',
    availability: 'SEEDED_DEFAULT',
    availability_note:
      'A synchronized seeded default already exists. Use this blueprint to create a narrowed specialization without changing the synced default.',
    agent_id: 'settlement-copilot',
    name: 'Settlement Copilot',
    description: 'Pairs settlement analysis with governed invoice and payment execution.',
    status: 'ACTIVE',
    scope: 'TEAM',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'settlement', 'operations', 'reports'],
    capabilities: ['READ', 'EXPLAIN', 'DRAFT', 'ACTION'],
    recommended_tools: [
      'list_trade_invoices',
      'list_invoice_issue_candidates',
      'list_trade_attention_candidates',
      'list_trade_payments',
      'get_trade_settlement_summary',
      'list_accrual_lots',
      'get_accrual_reconciliation',
      'list_workflow_items',
      'get_workspace_summary',
    ],
    recommended_action_types: ['issue_trade_invoice', 'create_trade_payment'],
    summary: 'Designed for finance and operations users managing invoice readiness, payment follow-through, cash exceptions, and open accrual posture.',
    best_for: 'Settlement exception triage, invoice issuance, payment recording, and accrual-aware settlement review.',
    focus_areas: ['Invoices', 'Payments', 'Settlement aging', 'Cash follow-up'],
    system_prompt: buildSystemPrompt({
      name: 'Settlement Copilot',
      mission: [
        'Explain settlement posture clearly and help the team stage the right invoice or payment action when it is justified.',
        'Keep finance-oriented follow-up grounded in current settlement evidence and workflow context.',
      ],
      workflow: [
        'Verify invoice, payment, settlement, accrual, and workflow records before suggesting or executing a cash action.',
        'Call out missing dates, amounts, or dependencies before moving from explanation into action planning.',
        'Draft concise collection or review notes when a written handoff is more appropriate than an immediate mutation.',
      ],
      response_style: [
        'Start with the cash status, then move into the evidence and the recommended next step.',
        'Keep action descriptions tight enough for another operator to audit confidently.',
      ],
      guardrails: [
        'Do not stage invoices or payments when amounts, timing, or trade linkage are still ambiguous.',
        'Do not smooth over missing settlement evidence; surface it directly.',
      ],
    }),
  },
  {
    key: 'trade-governor',
    availability: 'SEEDED_DEFAULT',
    availability_note:
      'A synchronized seeded default already exists. Use this blueprint to create a narrowed specialization without changing the synced default.',
    agent_id: 'trade-governor',
    name: 'Trade Governor',
    description: 'Focuses on high-sensitivity trade governance with a tightly constrained cancel-only action scope.',
    status: 'ACTIVE',
    scope: 'ORGANIZATION',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'trades', 'operations', 'admin'],
    capabilities: ['READ', 'EXPLAIN', 'ACTION'],
    recommended_tools: [
      'get_trade_by_id',
      'list_trade_events',
      'get_trade_workbench',
      'list_workflow_items',
    ],
    recommended_action_types: ['cancel_trade'],
    summary: 'A narrow governance agent for cancellation requests that need strong evidence and clear reviewer context.',
    best_for: 'Trade unwind requests, cancellation approvals, and audit-friendly governance review.',
    focus_areas: ['Cancellation evidence', 'Lifecycle conflicts', 'Governance review', 'Audit clarity'],
    system_prompt: buildSystemPrompt({
      name: 'Trade Governor',
      mission: [
        'Assess whether a trade cancellation request is supported by the current record and stage it only when the evidence is clear.',
        'Make reviewer context explicit so approvals are easy to audit and reason about later.',
      ],
      workflow: [
        'Check the live trade state, event history, workbench context, and open workflow items before considering cancellation.',
        'Explain the operational impact and rationale behind every governed cancellation.',
        'Decline to stage an action when the request is better handled as an amendment, workflow update, or human investigation.',
      ],
      response_style: [
        'Lead with whether cancellation appears justified, then summarize the strongest supporting and conflicting evidence.',
        'Keep governance language calm, specific, and reviewable.',
      ],
      guardrails: [
        'Never stage a cancellation when the trade identity, current status, or business reason is uncertain.',
        'Do not broaden beyond cancel-only governance actions.',
      ],
    }),
  },
  {
    key: 'trade-capture-agent',
    availability: 'SEEDED_DEFAULT',
    availability_note:
      'A synchronized seeded default already exists. Use this blueprint to create a narrowed specialization without changing the synced default.',
    agent_id: 'trade-capture-agent',
    name: 'Trade Capture Agent',
    description:
      'Reflects trade lifecycle reality with draft capture guidance and bounded cancellation execution.',
    status: 'ACTIVE',
    scope: 'ORGANIZATION',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'trades', 'events', 'operations', 'reference'],
    capabilities: ['READ', 'EXPLAIN', 'DRAFT', 'ACTION'],
    recommended_tools: [
      'get_trade_by_id',
      'list_trade_events',
      'get_trade_workbench',
      'search_reference_data',
      'list_workflow_items',
      'get_workspace_summary',
    ],
    recommended_action_types: ['cancel_trade'],
    summary:
      'Useful when the team needs one role to explain trade lifecycle state, prepare structured capture follow-up, and execute the narrow cancellation surface that exists today.',
    best_for: 'Trade lifecycle triage, capture handoffs, and governed cancellation when reality has already changed.',
    focus_areas: ['Trade lifecycle', 'Capture handoff', 'Event history', 'Cancellation governance'],
    system_prompt: buildSystemPrompt({
      name: 'Trade Capture Agent',
      mission: [
        'Reflect current commercial reality into the trade lifecycle record without inventing unsupported state changes.',
        'Use the governed action surface when it exists and structured capture handoffs when it does not.',
      ],
      workflow: [
        'Review live trade state, event history, reference data, and workflow context before proposing or executing any lifecycle change.',
        'If the requested change is a cancellation and the evidence is clear, use the governed action instead of asking for a separate approval.',
        'If the requested change is a create or amend scenario, produce a structured handoff that makes assumptions and missing economics explicit.',
      ],
      response_style: [
        'Lead with the lifecycle conclusion, then the strongest supporting evidence and any remaining gaps.',
        'Separate executable changes from draft-only capture guidance clearly.',
      ],
      guardrails: [
        'Do not imply that a trade was created or amended unless a published typed action contract actually exists.',
        'Do not smooth over missing counterparty, pricing, quantity, or effective-date assumptions.',
      ],
    }),
  },
  {
    key: 'movement-controller-agent',
    availability: 'SEEDED_DEFAULT',
    availability_note:
      'A synchronized seeded default already exists. Use this blueprint to create a narrowed specialization without changing the synced default.',
    agent_id: 'movement-controller-agent',
    name: 'Movement Controller Agent',
    description:
      'Tracks delivery and movement reality with bounded actualization execution and blocker synchronization.',
    status: 'ACTIVE',
    scope: 'TEAM',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'trades', 'shipments', 'scheduling', 'operations'],
    capabilities: ['READ', 'EXPLAIN', 'DRAFT', 'ACTION'],
    recommended_tools: [
      'list_deliveries',
      'get_trade_workbench',
      'list_workflow_items',
      'list_trade_attention_candidates',
      'list_documents',
      'get_document_ingestion',
      'get_workspace_summary',
    ],
    recommended_action_types: ['record_trade_actualization', 'update_trade_workflow_item'],
    summary:
      'Designed for operators syncing delivered reality into the platform while keeping external scheduling commitments outside the agent lane.',
    best_for: 'Movement blocker triage, actualization updates, and delivery-related workflow synchronization.',
    focus_areas: ['Actualization', 'Movement evidence', 'Delivery blockers', 'Workflow sync'],
    system_prompt: buildSystemPrompt({
      name: 'Movement Controller Agent',
      mission: [
        'Reflect observed movement and delivery reality into internal operational records when evidence is clear.',
        'Separate internal state synchronization from any external scheduling or logistics commitment.',
      ],
      workflow: [
        'Inspect deliveries, trade workbench context, workflow items, and any supporting document evidence before acting.',
        'When movement reality is clear, use the governed actualization or workflow synchronization action instead of asking for separate approval.',
        'If the requested step would commit the firm externally, stop and explain the boundary directly.',
      ],
      response_style: [
        'Lead with the observed movement state, then the evidence and the governed internal change you can justify.',
        'Keep blocker summaries short enough for operations users to act on quickly.',
      ],
      guardrails: [
        'Do not create nominations, allocations, or external scheduling commitments.',
        'Do not claim delivered reality is confirmed when timing or quantity evidence is still ambiguous.',
      ],
    }),
  },
  {
    key: 'accrual-controller-agent',
    availability: 'SEEDED_DEFAULT',
    availability_note:
      'A synchronized seeded default already exists. Use this blueprint to create a narrowed specialization without changing the synced default.',
    agent_id: 'accrual-controller-agent',
    name: 'Accrual Controller Agent',
    description:
      'Interprets accrual lots, reconciliation gaps, and delivery-to-billing timing while drafting accrual corrections.',
    status: 'ACTIVE',
    scope: 'ORGANIZATION',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'settlement', 'reports', 'operations'],
    capabilities: ['READ', 'EXPLAIN', 'DRAFT'],
    recommended_tools: [
      'list_accrual_lots',
      'list_accrual_entries',
      'get_accrual_reconciliation',
      'get_trade_settlement_summary',
      'list_trade_invoices',
      'list_trade_payments',
      'list_trade_attention_candidates',
      'get_workspace_summary',
    ],
    recommended_action_types: [],
    summary:
      'Best when controllers or settlement leads need one grounded view of delivered-but-unbilled exposure and a draft recommendation for what accrual posture should change.',
    best_for: 'Accrual reconciliation, controller review packs, and draft correction guidance.',
    focus_areas: ['Accrual lots', 'Reconciliation gaps', 'Delivery timing', 'Billing lag'],
    system_prompt: buildSystemPrompt({
      name: 'Accrual Controller Agent',
      mission: [
        'Keep accrual posture aligned with observed delivery, invoicing, and payment evidence.',
        'Prepare controller-ready accrual correction guidance until explicit accrual mutation contracts are published.',
      ],
      workflow: [
        'Review accrual lots, accrual entries, reconciliation summaries, settlement detail, and candidate gaps before drafting a recommendation.',
        'Explain the evidence chain from delivery to invoice to payment before suggesting any accrual treatment.',
        'Keep every suggested correction explicitly draft-only until a governed accrual action exists.',
      ],
      response_style: [
        'Lead with the accrual posture, then the strongest evidence and the draft correction you would hand to a controller.',
        'Separate confirmed platform state from suggested accounting treatment.',
      ],
      guardrails: [
        'Do not imply that accrual lots or entries were mutated automatically.',
        'Do not hide missing policy, timing, or invoice-linkage evidence.',
      ],
    }),
  },
  {
    key: 'accounting-posting-agent',
    availability: 'SEEDED_DEFAULT',
    availability_note:
      'A synchronized seeded default already exists. Use this blueprint to create a narrowed specialization without changing the synced default.',
    agent_id: 'accounting-posting-agent',
    name: 'Accounting Posting Agent',
    description:
      'Drafts accounting entry narratives and posting packages from settlement and accrual evidence without writing ledger entries.',
    status: 'ACTIVE',
    scope: 'ORGANIZATION',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'settlement', 'reports', 'operations'],
    capabilities: ['READ', 'EXPLAIN', 'DRAFT'],
    recommended_tools: [
      'get_trade_settlement_summary',
      'list_trade_invoices',
      'list_trade_payments',
      'list_accrual_lots',
      'list_accrual_entries',
      'get_accrual_reconciliation',
      'list_workflow_items',
      'get_workspace_summary',
    ],
    recommended_action_types: [],
    summary:
      'Useful when finance needs a posting-ready narrative and evidence package, but the platform still lacks typed accounting-entry mutation contracts.',
    best_for: 'Posting memos, controller packs, and audit-friendly accounting explanations.',
    focus_areas: ['Posting package', 'Settlement evidence', 'Accrual evidence', 'Audit narrative'],
    system_prompt: buildSystemPrompt({
      name: 'Accounting Posting Agent',
      mission: [
        'Translate settlement and accrual evidence into controller-ready accounting posting guidance.',
        'Keep posting explanations auditable while explicit accounting-entry mutation contracts are still absent.',
      ],
      workflow: [
        'Review settlement, payment, accrual, workflow, and reconciliation evidence before drafting posting guidance.',
        'Tie every suggested posting treatment back to loaded operational evidence and identify any missing support.',
        'Label suggested entries, reversals, or adjustments as drafts until typed posting actions exist.',
      ],
      response_style: [
        'Lead with the accounting posture, then the evidence package and any draft entry narrative.',
        'Keep language specific enough for finance review without implying that anything has been booked.',
      ],
      guardrails: [
        'Do not claim to create, reverse, or post ledger entries.',
        'Do not skip unresolved evidence gaps that would matter to finance sign-off.',
      ],
    }),
  },
  {
    key: 'counterparty-state-sync-agent',
    availability: 'SEEDED_DEFAULT',
    availability_note:
      'A synchronized seeded default already exists. Use this blueprint to create a narrowed specialization without changing the synced default.',
    agent_id: 'counterparty-state-sync-agent',
    name: 'Counterparty State Sync Agent',
    description:
      'Synchronizes counterparty-confirmed state across confirmations, disputes, and workflow follow-through.',
    status: 'ACTIVE',
    scope: 'TEAM',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'trades', 'operations', 'settlement'],
    capabilities: ['READ', 'EXPLAIN', 'DRAFT', 'ACTION'],
    recommended_tools: [
      'get_trade_workbench',
      'list_trade_confirmations',
      'list_trade_attention_candidates',
      'list_trade_invoices',
      'list_trade_payments',
      'get_trade_settlement_summary',
      'list_workflow_items',
      'get_workspace_summary',
    ],
    recommended_action_types: ['record_trade_confirmation_response', 'update_trade_workflow_item'],
    summary:
      'Designed for moments when bilateral state has changed and the platform needs to catch up quickly without sending new outbound communication.',
    best_for: 'Recording counterparty responses, syncing workflow follow-up, and clarifying bilateral state drift.',
    focus_areas: ['Confirmation response', 'Bilateral state', 'Workflow follow-up', 'State drift'],
    system_prompt: buildSystemPrompt({
      name: 'Counterparty State Sync Agent',
      mission: [
        'Reflect externally observed counterparty state into governed internal confirmation and workflow records.',
        'Keep bilateral state aligned without sending new communications or changing economics outside the typed action surface.',
      ],
      workflow: [
        'Inspect confirmation, settlement, workflow, and trade context before deciding whether the observed bilateral state is clear enough to sync.',
        'When the evidence is clear, use the governed confirmation-response or workflow update action instead of asking for separate approval.',
        'If the requested step would send a new outbound message, stop and explain that the current role only synchronizes internal state.',
      ],
      response_style: [
        'Lead with the counterparty state that appears to have changed, then the evidence and the internal synchronization step.',
        'Keep bilateral evidence and platform action distinct so audits can reconstruct why the update happened.',
      ],
      guardrails: [
        'Do not send new counterparty communication or imply that you did.',
        'Do not change trade economics or cash movement from bilateral state alone.',
      ],
    }),
  },
] satisfies AgentBuilderTemplateDefinition[]

export const AGENT_BUILDER_TEMPLATES = AGENT_BUILDER_TEMPLATE_DEFINITIONS

export function createEmptyAgentBuilderDraft(): AgentBuilderDraft {
  return {
    agent_id: '',
    name: '',
    description: '',
    status: 'DRAFT',
    scope: 'TEAM',
    provider: '',
    model: '',
    role_key: '',
    profile_kind: 'CUSTOM',
    specialization_summary: '',
    human_owner_role: '',
    authority_ceiling: '',
    activation_notes: '',
    profile_request_id: null,
    allowed_workspaces: ['assistant'],
    capabilities: ['READ', 'EXPLAIN'],
    allowed_tools: [],
    allowed_action_types: [],
    daily_token_allocation: '',
    system_prompt: '',
  }
}

export function getAgentBuilderTemplate(
  key: AgentBuilderTemplateKey,
): (typeof AGENT_BUILDER_TEMPLATES)[number] {
  const template = AGENT_BUILDER_TEMPLATES.find((entry) => entry.key === key)
  if (!template) {
    throw new Error(`Unknown agent builder template: ${key}`)
  }
  return template
}

export function suggestAgentBuilderAgentId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function buildAgentBuilderDraft(
  templateKey: AgentBuilderTemplateKey,
  availableTools: string[],
): AgentBuilderDraft {
  const template = getAgentBuilderTemplate(templateKey)
  const profile = AGENT_BUILDER_TEMPLATE_PROFILE[templateKey]
  const availableToolSet = new Set(availableTools.map((toolName) => toolName.trim().toLowerCase()))
  const allowedTools =
    availableToolSet.size === 0
      ? []
      : template.recommended_tools.filter((toolName) => availableToolSet.has(toolName.toLowerCase()))

  return {
    agent_id: template.agent_id,
    name: template.name,
    description: template.description,
    status: template.status,
    scope: template.scope,
    provider: template.provider,
    model: template.model,
    role_key: profile.role_key,
    profile_kind: profile.profile_kind,
    specialization_summary: profile.specialization_summary,
    human_owner_role: profile.human_owner_role,
    authority_ceiling: profile.authority_ceiling,
    activation_notes: profile.activation_notes,
    profile_request_id: null,
    allowed_workspaces: [...template.allowed_workspaces],
    capabilities: [...template.capabilities],
    allowed_tools: allowedTools,
    allowed_action_types: [...template.recommended_action_types],
    daily_token_allocation: '',
    system_prompt: template.system_prompt,
  }
}

export function buildAgentBuilderDraftFromRole(
  role: AssistantAgentRoleArchetype,
  availableTools: string[],
): AgentBuilderDraft {
  const availableToolSet = new Set(availableTools.map((toolName) => toolName.trim().toLowerCase()))
  const allowedTools =
    availableToolSet.size === 0
      ? []
      : role.default_tools.filter((toolName) => availableToolSet.has(toolName.toLowerCase()))
  const profileName = `${role.name} Specialization`

  return {
    agent_id: suggestAgentBuilderAgentId(profileName),
    name: profileName,
    description: role.description,
    status: 'DRAFT',
    scope: 'TEAM',
    provider: '',
    model: '',
    role_key: role.role_key,
    profile_kind: 'ROLE_DERIVED',
    specialization_summary: `Team specialization derived from the ${role.name} role archetype.`,
    human_owner_role: role.human_owner_role,
    authority_ceiling: role.authority_ceiling,
    activation_notes: `Drafted from the ${role.name} role catalog entry.`,
    profile_request_id: null,
    allowed_workspaces: [...role.allowed_workspaces],
    capabilities: [...role.capability_ceiling],
    allowed_tools: allowedTools,
    allowed_action_types: [...role.maximum_action_types],
    daily_token_allocation: '',
    system_prompt: buildRoleSystemPrompt(role),
  }
}

export function describeProfileKind(profileKind: AgentBuilderDraft['profile_kind']): string {
  return PROFILE_KIND_LABELS[profileKind]
}

export function evaluateAgentRoleProfileFit(
  form: AgentBuilderDraft,
  roleCatalog: AssistantAgentRoleArchetype[],
): AgentRoleProfileFit {
  const normalizedRoleKey = form.role_key.trim()
  const role = normalizedRoleKey
    ? roleCatalog.find((entry) => entry.role_key === normalizedRoleKey) ?? null
    : null
  const errors: string[] = []
  const warnings: string[] = []
  const sections: AgentRoleProfileFitSection[] = []
  const profileKind = form.profile_kind
  const roleBoundProfile = profileKind === 'CURATED' || profileKind === 'ROLE_DERIVED'

  if (roleBoundProfile && !normalizedRoleKey) {
    errors.push(`${describeProfileKind(profileKind)} profiles need a role archetype before save.`)
  }
  if (normalizedRoleKey && !role) {
    errors.push(`Unknown role archetype: ${normalizedRoleKey}.`)
  }

  if (form.allowed_tools.length > 0 && !form.capabilities.includes('READ')) {
    errors.push('Live tools require READ capability.')
  }
  if (form.allowed_action_types.length > 0 && !form.capabilities.includes('ACTION')) {
    errors.push('Governed actions require ACTION capability.')
  }
  if (form.capabilities.includes('ACTION') && form.allowed_action_types.length === 0) {
    errors.push('ACTION-capable profiles need at least one explicit governed action.')
  }

  if (role) {
    const workspaceSection = compareSubset(
      'Workspaces',
      form.allowed_workspaces,
      role.allowed_workspaces,
      (values) => `${values.length} role workspace${values.length === 1 ? '' : 's'}`,
    )
    const capabilitySection = compareSubset(
      'Capabilities',
      form.capabilities,
      role.capability_ceiling,
      (values) => values.join(' · '),
    )
    const toolSection = compareSubset(
      'Live tools',
      form.allowed_tools,
      role.default_tools,
      (values) => `${values.length} role default tool${values.length === 1 ? '' : 's'}`,
      {
        emptyStatus: form.capabilities.includes('READ') ? 'inherited' : 'customized',
        emptyDetail: form.capabilities.includes('READ')
          ? `${role.default_tools.length} role default tool${role.default_tools.length === 1 ? '' : 's'} inherited on save`
          : 'READ disabled, so no live tools are available',
      },
    )
    const actionSection = compareSubset(
      'Governed actions',
      form.allowed_action_types,
      role.maximum_action_types,
      (values) => `${values.length} role action${values.length === 1 ? '' : 's'}`,
      {
        emptyStatus: form.capabilities.includes('ACTION') ? 'missing' : 'inherited',
        emptyDetail: form.capabilities.includes('ACTION')
          ? 'Explicit action selection required'
          : 'No action authority requested',
      },
    )
    const authoritySection = compareAuthority(form.authority_ceiling, role.authority_ceiling)

    sections.push(workspaceSection, capabilitySection, toolSection, actionSection, authoritySection)

    for (const section of sections) {
      if (section.status === 'expanded') {
        const verb = section.label === 'Authority' ? 'exceeds' : 'exceed'
        errors.push(`${section.label} ${verb} the ${role.name} role boundary.`)
      }
      if (section.status === 'missing') {
        errors.push(`${section.label} need a valid role-derived value before save.`)
      }
    }

    if (form.status === 'ACTIVE') {
      if (!form.specialization_summary.trim()) {
        errors.push('Active role-derived profiles need a specialization summary.')
      }
      if (!form.human_owner_role.trim()) {
        errors.push('Active role-derived profiles need a human owner role.')
      }
      if (!form.authority_ceiling) {
        errors.push('Active role-derived profiles need an authority ceiling.')
      }
    }

    if (role.catalog_status === 'PHASE_2_PLUS') {
      warnings.push(`${role.name} is marked ${role.catalog_status}; confirm domain readiness before activation.`)
    }
    if (form.allowed_tools.length === 0 && form.capabilities.includes('READ')) {
      warnings.push('Blank role-derived live tools inherit role defaults on save.')
    }
  }

  if (!role && !roleBoundProfile) {
    const profileSourceDetail = form.profile_request_id
      ? `Custom profile request #${form.profile_request_id} selected for activation governance.`
      : normalizedRoleKey
        ? `Custom profile mapped to role archetype ${normalizedRoleKey}.`
        : 'Custom draft with no role boundary; backend policy still enforces tool and action allowlists.'

    sections.push({
      label: 'Profile source',
      status: form.profile_request_id || normalizedRoleKey ? 'inherited' : 'customized',
      detail: profileSourceDetail,
    })

    if (form.status === 'ACTIVE') {
      if (!form.human_owner_role.trim()) {
        errors.push('Active custom profiles need a human owner role.')
      }
      if (!form.authority_ceiling) {
        errors.push('Active custom profiles need an authority ceiling.')
      }
      if (!form.activation_notes.trim()) {
        errors.push('Active custom profiles need activation notes confirming prompt review.')
      }
      if (!normalizedRoleKey && !form.profile_request_id) {
        errors.push('Active custom profiles need an approved profile request or role mapping.')
      }
      if (
        form.authority_ceiling &&
        AUTHORITY_RANK[form.authority_ceiling] > AUTHORITY_RANK.DRAFT &&
        !form.profile_request_id
      ) {
        errors.push('Custom profiles above draft-only authority need an approved specialization-specific eval case.')
      }
      if (form.capabilities.includes('ACTION') && !form.profile_request_id) {
        errors.push('Action-capable custom profiles need an approved profile request with eval coverage.')
      }
    }
  }

  return { role, errors, warnings, sections }
}

function compareSubset<T extends string>(
  label: string,
  current: T[],
  baseline: readonly T[],
  describeBaseline: (values: readonly T[]) => string,
  options?: {
    emptyStatus?: AgentRoleProfileFitStatus
    emptyDetail?: string
  },
): AgentRoleProfileFitSection {
  const currentSet = new Set(current)
  const baselineSet = new Set(baseline)
  const outside = current.filter((value) => !baselineSet.has(value))
  if (outside.length > 0) {
    return {
      label,
      status: 'expanded',
      detail: `Outside role: ${outside.join(' · ')}`,
    }
  }
  if (current.length === 0) {
    return {
      label,
      status: options?.emptyStatus ?? 'missing',
      detail: options?.emptyDetail ?? 'No values selected',
    }
  }
  if (current.length === baseline.length && baseline.every((value) => currentSet.has(value))) {
    return {
      label,
      status: 'inherited',
      detail: describeBaseline(baseline),
    }
  }
  return {
    label,
    status: 'narrowed',
    detail: `${current.length} of ${baseline.length} role value${baseline.length === 1 ? '' : 's'}`,
  }
}

function compareAuthority(
  current: AssistantAgentAuthorityLevel | '',
  baseline: AssistantAgentAuthorityLevel,
): AgentRoleProfileFitSection {
  if (!current) {
    return {
      label: 'Authority',
      status: 'missing',
      detail: `Role ceiling is ${baseline}`,
    }
  }
  if (AUTHORITY_RANK[current] > AUTHORITY_RANK[baseline]) {
    return {
      label: 'Authority',
      status: 'expanded',
      detail: `${current} exceeds role ceiling ${baseline}`,
    }
  }
  if (current === baseline) {
    return {
      label: 'Authority',
      status: 'inherited',
      detail: baseline,
    }
  }
  return {
    label: 'Authority',
    status: 'narrowed',
    detail: `${current} below role ceiling ${baseline}`,
  }
}
