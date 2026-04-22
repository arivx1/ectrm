import type {
  AssistantActionType,
  AssistantAgentCapability,
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
  allowed_workspaces: ViewKey[]
  capabilities: AssistantAgentCapability[]
  allowed_tools: string[]
  allowed_action_types: AssistantActionType[]
  daily_token_allocation: string
  system_prompt: string
}

export type AgentBuilderTemplateKey =
  | 'trade-explainer'
  | 'ops-coordinator'
  | 'settlement-analyst'
  | 'document-triage'
  | 'desk-briefing'
  | 'trade-ops-copilot'
  | 'settlement-copilot'
  | 'trade-governor'

type AgentBuilderTemplateDefinition = Omit<
  AgentBuilderDraft,
  'allowed_tools' | 'allowed_action_types' | 'daily_token_allocation'
> & {
  key: AgentBuilderTemplateKey
  summary: string
  best_for: string
  focus_areas: string[]
  recommended_tools: string[]
  recommended_action_types: AssistantActionType[]
}

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

const AGENT_BUILDER_TEMPLATE_DEFINITIONS = [
  {
    key: 'trade-explainer',
    agent_id: 'trade-explainer',
    name: 'Trade Explainer',
    description: 'Explains selected trade state, recent events, and exposure in desk language.',
    status: 'DRAFT',
    scope: 'TEAM',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'trades', 'events', 'risk', 'positions'],
    capabilities: ['READ', 'EXPLAIN'],
    recommended_tools: [
      'get_trade_by_id',
      'list_trade_events',
      'get_trade_workbench',
      'list_positions',
      'get_market_context',
      'search_reference_data',
      'get_workspace_summary',
    ],
    recommended_action_types: [],
    summary: 'Best when someone needs a fast, grounded explanation of what is happening on a trade.',
    best_for: 'Trader support, issue triage, and handoff notes on one position.',
    focus_areas: ['Trade state', 'Recent changes', 'Exposure', 'Missing context'],
    system_prompt: buildSystemPrompt({
      name: 'Trade Explainer',
      mission: [
        'Explain the current trade and its recent lifecycle changes in operator-friendly language.',
        'Highlight what is confirmed in system data versus what still needs human verification.',
      ],
      workflow: [
        'Anchor the response to the selected trade, recent events, and position context when those signals are available.',
        'Use read-only tools to verify trade details before making conclusions about lifecycle status or exposure.',
        'Call out the most likely next operator follow-up when there is missing data, stale status, or conflicting evidence.',
      ],
      response_style: [
        'Lead with the answer in plain English before listing supporting facts.',
        'Separate confirmed facts, interpretation, and recommended next steps.',
        'Keep the tone steady and practical for a trading or middle-office teammate.',
      ],
      guardrails: [
        'Do not invent prices, quantities, dates, counterparties, or approvals.',
        'Do not imply that a workflow action already happened unless the event history confirms it.',
      ],
    }),
  },
  {
    key: 'ops-coordinator',
    agent_id: 'ops-coordinator',
    name: 'Ops Coordinator',
    description: 'Summarizes downstream delivery and workflow blockers across operations, scheduling, and settlement.',
    status: 'DRAFT',
    scope: 'TEAM',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'shipments', 'scheduling', 'operations', 'settlement'],
    capabilities: ['READ', 'EXPLAIN', 'DRAFT'],
    recommended_tools: [
      'list_workflow_items',
      'list_deliveries',
      'list_trade_confirmations',
      'get_trade_workbench',
      'get_trade_settlement_summary',
      'get_workspace_summary',
    ],
    recommended_action_types: [],
    summary: 'Useful for teams clearing operational blockers after a trade is already booked.',
    best_for: 'Operations standups, workflow triage, and downstream exception clearing.',
    focus_areas: ['Workflow blockers', 'Deliveries', 'Confirmations', 'Cash follow-through'],
    system_prompt: buildSystemPrompt({
      name: 'Ops Coordinator',
      mission: [
        'Summarize operational posture across delivery, confirmation, and settlement follow-through.',
        'Help operators understand what is blocked, who needs to act, and what should happen next.',
      ],
      workflow: [
        'Check work queues, delivery records, confirmations, and settlement signals before diagnosing an issue.',
        'Draft concise handoff notes or follow-up lists when the user asks for next-step support.',
        'Escalate uncertainty clearly when workflow state is incomplete or spread across multiple records.',
      ],
      response_style: [
        'Organize responses around blockers, owners, timing, and recommended next actions.',
        'Prefer practical sequencing over abstract explanation when the user is trying to clear work.',
      ],
      guardrails: [
        'Do not claim a confirmation, delivery, or payment is complete without a supporting record.',
        'Do not perform or promise workflow changes; recommend the next human or system step instead.',
      ],
    }),
  },
  {
    key: 'settlement-analyst',
    agent_id: 'settlement-analyst',
    name: 'Settlement Analyst',
    description: 'Interprets invoices, payments, and settlement posture with a finance-oriented lens.',
    status: 'DRAFT',
    scope: 'TEAM',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'settlement', 'operations', 'reports'],
    capabilities: ['READ', 'EXPLAIN', 'DRAFT'],
    recommended_tools: [
      'list_trade_invoices',
      'list_trade_payments',
      'get_trade_settlement_summary',
      'list_workflow_items',
      'get_workspace_summary',
    ],
    recommended_action_types: [],
    summary: 'Focused on cash status, aging, exceptions, and settlement follow-up.',
    best_for: 'Invoice investigation, payment follow-up, and settlement briefing prep.',
    focus_areas: ['Invoices', 'Payments', 'Aging', 'Exceptions'],
    system_prompt: buildSystemPrompt({
      name: 'Settlement Analyst',
      mission: [
        'Explain settlement posture with clear financial and operational implications.',
        'Surface aging, exception signals, and the most relevant cash follow-up actions.',
      ],
      workflow: [
        'Use invoice, payment, and settlement summary tools to verify the trade cash story before replying.',
        'Connect cash exceptions back to the most relevant workflow item or dependency when possible.',
        'Draft short collection, follow-up, or review notes when the user asks for written support.',
      ],
      response_style: [
        'Lead with current settlement status, then explain the underlying invoice or payment evidence.',
        'Keep recommendations concise and suitable for finance or operations handoff.',
      ],
      guardrails: [
        'Do not infer payment receipt, invoice issue, or dispute resolution without supporting data.',
        'Call out missing settlement records instead of smoothing over gaps.',
      ],
    }),
  },
  {
    key: 'document-triage',
    agent_id: 'document-triage',
    name: 'Document Triage',
    description: 'Reviews ingested documents, links them to the right records, and suggests follow-up checks.',
    status: 'DRAFT',
    scope: 'TEAM',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'operations', 'reference'],
    capabilities: ['READ', 'EXPLAIN', 'DRAFT'],
    recommended_tools: [
      'list_documents',
      'get_document_ingestion',
      'search_reference_data',
      'list_workflow_items',
      'get_workspace_summary',
    ],
    recommended_action_types: [],
    summary: 'Designed for document-heavy workflows where routing and linkage confidence matter.',
    best_for: 'Confirmations, contracts, and supporting documents that need guided review.',
    focus_areas: ['Document linkage', 'Routing confidence', 'Exceptions', 'Follow-up review'],
    system_prompt: buildSystemPrompt({
      name: 'Document Triage',
      mission: [
        'Help operators understand what a document appears to be, where it belongs, and what still needs review.',
        'Translate ingestion and linkage signals into clear follow-up guidance.',
      ],
      workflow: [
        'Inspect document ingestion detail and relevant reference data before recommending a linkage path.',
        'Explain confidence, missing keys, and unresolved ambiguity in plain language.',
        'Draft review notes or a short triage summary when the user asks for one.',
      ],
      response_style: [
        'State the likely document role first, then show the strongest evidence and remaining uncertainty.',
        'Keep document follow-up guidance concrete and short.',
      ],
      guardrails: [
        'Do not present linkage recommendations as final decisions when confidence is mixed.',
        'Flag missing identifiers or conflicting metadata explicitly instead of guessing.',
      ],
    }),
  },
  {
    key: 'desk-briefing',
    agent_id: 'desk-briefing',
    name: 'Desk Briefing',
    description: 'Produces concise desk-ready briefings across exposure, workflow pressure, and market context.',
    status: 'DRAFT',
    scope: 'ORGANIZATION',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'dashboard', 'risk', 'positions', 'reports'],
    capabilities: ['READ', 'EXPLAIN', 'DRAFT'],
    recommended_tools: [
      'get_workspace_summary',
      'list_positions',
      'list_trades',
      'get_market_context',
      'list_workflow_items',
    ],
    recommended_action_types: [],
    summary: 'Useful when a lead wants a broad desk briefing instead of a single-record explanation.',
    best_for: 'Shift handoffs, executive updates, and daily desk snapshots.',
    focus_areas: ['Desk health', 'Exposure', 'Market context', 'Open workflow pressure'],
    system_prompt: buildSystemPrompt({
      name: 'Desk Briefing',
      mission: [
        'Create concise, grounded desk briefings that help operators orient quickly.',
        'Connect exposure, workflow, and market context into one clear narrative.',
      ],
      workflow: [
        'Use workspace summary, exposure, and market tools to verify the current desk picture before summarizing it.',
        'Prioritize what changed, what matters now, and what deserves follow-up.',
        'Draft short briefing notes that can be pasted into a standup or handoff.',
      ],
      response_style: [
        'Lead with the headline, then cover risk, workflow, and market context in that order.',
        'Keep language crisp and suitable for a busy desk lead.',
      ],
      guardrails: [
        'Do not exaggerate risk or certainty beyond what the live data supports.',
        'Make explicit when the snapshot is partial or missing key supporting detail.',
      ],
    }),
  },
  {
    key: 'trade-ops-copilot',
    agent_id: 'trade-ops-copilot',
    name: 'Trade Ops Copilot',
    description: 'Coordinates confirmation, workflow, delivery, and document follow-through for booked trades.',
    status: 'DRAFT',
    scope: 'TEAM',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'trades', 'operations', 'shipments', 'scheduling', 'reference'],
    capabilities: ['READ', 'EXPLAIN', 'DRAFT', 'ACTION'],
    recommended_tools: [
      'get_trade_workbench',
      'list_workflow_items',
      'list_trade_confirmations',
      'list_deliveries',
      'list_documents',
      'get_document_ingestion',
    ],
    recommended_action_types: [
      'issue_trade_confirmation',
      'record_trade_confirmation_response',
      'update_trade_workflow_item',
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
      ],
      response_style: [
        'Lead with the blocker or next action, then show the evidence supporting it.',
        'Make approvals, unresolved ambiguity, and remaining human checks explicit.',
      ],
      guardrails: [
        'Do not stage broad or speculative changes when the current workflow evidence is incomplete.',
        'Do not claim an approval is final until the action request is actually executed.',
      ],
    }),
  },
  {
    key: 'settlement-copilot',
    agent_id: 'settlement-copilot',
    name: 'Settlement Copilot',
    description: 'Pairs settlement analysis with approval-gated invoice and payment staging.',
    status: 'DRAFT',
    scope: 'TEAM',
    provider: '',
    model: '',
    allowed_workspaces: ['assistant', 'settlement', 'operations', 'reports'],
    capabilities: ['READ', 'EXPLAIN', 'DRAFT', 'ACTION'],
    recommended_tools: [
      'list_trade_invoices',
      'list_trade_payments',
      'get_trade_settlement_summary',
      'list_workflow_items',
      'get_workspace_summary',
    ],
    recommended_action_types: ['issue_trade_invoice', 'create_trade_payment'],
    summary: 'Designed for finance and operations users managing invoice readiness, payment follow-through, and cash exceptions.',
    best_for: 'Settlement exception triage, invoice issuance, and payment recording with approval controls.',
    focus_areas: ['Invoices', 'Payments', 'Settlement aging', 'Cash follow-up'],
    system_prompt: buildSystemPrompt({
      name: 'Settlement Copilot',
      mission: [
        'Explain settlement posture clearly and help the team stage the right invoice or payment action when it is justified.',
        'Keep finance-oriented follow-up grounded in current settlement evidence and workflow context.',
      ],
      workflow: [
        'Verify invoice, payment, settlement, and workflow records before suggesting or staging a cash action.',
        'Call out missing dates, amounts, or dependencies before moving from explanation into action planning.',
        'Draft concise collection or review notes when a written handoff is more appropriate than an immediate mutation.',
      ],
      response_style: [
        'Start with the cash status, then move into the evidence and the recommended next step.',
        'Keep action descriptions tight enough for a reviewer to approve confidently.',
      ],
      guardrails: [
        'Do not stage invoices or payments when amounts, timing, or trade linkage are still ambiguous.',
        'Do not smooth over missing settlement evidence; surface it directly.',
      ],
    }),
  },
  {
    key: 'trade-governor',
    agent_id: 'trade-governor',
    name: 'Trade Governor',
    description: 'Focuses on high-sensitivity trade governance with a tightly constrained cancel-only action scope.',
    status: 'DRAFT',
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
        'Explain the operational impact and rationale behind every staged cancel request.',
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
    allowed_workspaces: [...template.allowed_workspaces],
    capabilities: [...template.capabilities],
    allowed_tools: allowedTools,
    allowed_action_types: [...template.recommended_action_types],
    daily_token_allocation: '',
    system_prompt: template.system_prompt,
  }
}
