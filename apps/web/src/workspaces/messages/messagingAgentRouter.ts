import type { AssistantAgent } from '../../shared/models'
import type { MessagingWorkspaceChannel } from './messagingInboxData'

export type MessagingAgentRouteMode =
  | 'no_reply'
  | 'managed_agent'
  | 'default_assistant'

export type MessagingAgentRoutingDecision = {
  shouldReply: boolean
  routeMode: MessagingAgentRouteMode
  rationale: string
  targetWorkspace: MessagingWorkspaceChannel['assistantWorkspace']
  targetAgent: AssistantAgent | null
}

const SETTLEMENT_KEYWORDS = [
  'invoice',
  'payment',
  'cash',
  'settlement',
  'accrual',
  'accounting',
  'aging',
  'dispute',
]

const OPERATIONS_KEYWORDS = [
  'ops',
  'operations',
  'delivery',
  'nomination',
  'allocation',
  'shipment',
  'scheduling',
  'logistics',
  'workflow',
  'confirmation',
  'actualization',
]

const TRADE_KEYWORDS = [
  'trade',
  'book',
  'booking',
  'amend',
  'amendment',
  'cancel',
  'capture',
  'economics',
  'counterparty',
]

const RISK_KEYWORDS = [
  'risk',
  'exposure',
  'position',
  'pricing',
  'mark',
  'hedge',
  'market',
  'price',
]

const REPORT_KEYWORDS = [
  'report',
  'reconcile',
  'reconciliation',
  'summary',
  'pack',
  'brief',
]

const REPLY_SIGNALS = [
  '?',
  'please',
  'help',
  'summarize',
  'summarise',
  'explain',
  'review',
  'check',
  'investigate',
  'draft',
  'route',
  'triage',
  'next step',
  'what ',
  'why ',
  'how ',
  'can you',
  'could you',
  'would you',
  'should we',
  'need to',
  'agent',
  'assistant',
]

const NO_REPLY_EXACT_MATCHES = new Set([
  'hello',
  'hi',
  'thanks',
  'thank you',
  'ok',
  'okay',
  'noted',
  'fyi',
])

const AGENT_INVOCATION_SIGNALS = [
  'agent',
  'assistant',
  'messaging agent',
  'ectrm assistant',
]

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function containsAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern))
}

function startsWithHumanAddress(
  channel: MessagingWorkspaceChannel,
  normalizedDraft: string,
): boolean {
  return channel.members.some((member) => {
    if (member.tone !== 'human') {
      return false
    }

    const memberName = normalizeText(member.name)
    if (!memberName) {
      return false
    }

    const firstName = memberName.split(/\s+/)[0]
    const mentionToken = `@[${memberName}]`
    const addressForms = [
      mentionToken,
      `${memberName},`,
      `${memberName}:`,
      `${memberName} `,
      firstName ? `${firstName},` : '',
      firstName ? `${firstName}:` : '',
      firstName ? `${firstName} ` : '',
    ].filter((addressForm) => addressForm.length > 0)

    return addressForms.some((addressForm) => normalizedDraft.startsWith(addressForm))
  })
}

function determineTargetWorkspace(
  channel: MessagingWorkspaceChannel,
  normalizedDraft: string,
): MessagingWorkspaceChannel['assistantWorkspace'] {
  if (containsAny(normalizedDraft, SETTLEMENT_KEYWORDS)) {
    return 'settlement'
  }

  if (containsAny(normalizedDraft, OPERATIONS_KEYWORDS)) {
    return 'operations'
  }

  if (containsAny(normalizedDraft, TRADE_KEYWORDS)) {
    return 'trades'
  }

  if (containsAny(normalizedDraft, RISK_KEYWORDS)) {
    return 'risk'
  }

  if (containsAny(normalizedDraft, REPORT_KEYWORDS)) {
    return 'reports'
  }

  return channel.assistantWorkspace
}

function agentKeywordScore(agent: AssistantAgent, targetWorkspace: MessagingWorkspaceChannel['assistantWorkspace']): number {
  const profileText = normalizeText(
    [
      agent.agent_id,
      agent.name,
      agent.description,
      agent.role_key ?? '',
      agent.specialization_summary ?? '',
      agent.human_owner_role ?? '',
      agent.skills.join(' '),
      agent.allowed_workspaces.join(' '),
    ].join(' '),
  )

  let score = 0
  if (agent.allowed_workspaces.includes(targetWorkspace)) {
    score += 4
  }
  if (agent.allowed_workspaces.includes('assistant')) {
    score += 2
  }

  if (targetWorkspace === 'settlement' && containsAny(profileText, SETTLEMENT_KEYWORDS)) {
    score += 5
  }
  if (targetWorkspace === 'operations' && containsAny(profileText, OPERATIONS_KEYWORDS)) {
    score += 5
  }
  if (targetWorkspace === 'trades' && containsAny(profileText, TRADE_KEYWORDS)) {
    score += 5
  }
  if (targetWorkspace === 'risk' && containsAny(profileText, RISK_KEYWORDS)) {
    score += 5
  }
  if (targetWorkspace === 'reports' && containsAny(profileText, REPORT_KEYWORDS)) {
    score += 5
  }
  if (targetWorkspace === 'assistant' && containsAny(profileText, ['assistant', 'agent', 'supervision', 'control tower'])) {
    score += 4
  }

  return score
}

function selectTargetAgent(
  agents: AssistantAgent[],
  targetWorkspace: MessagingWorkspaceChannel['assistantWorkspace'],
): AssistantAgent | null {
  const activeAgents = agents.filter((agent) => agent.status === 'ACTIVE')
  if (activeAgents.length === 0) {
    return null
  }

  const rankedAgents = activeAgents
    .map((agent) => ({
      agent,
      score: agentKeywordScore(agent, targetWorkspace),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)

  return rankedAgents[0]?.agent ?? null
}

export function decideMessagingAgentRoute(args: {
  channel: MessagingWorkspaceChannel
  draft: string
  agents: AssistantAgent[]
}): MessagingAgentRoutingDecision {
  const normalizedDraft = normalizeText(args.draft)
  const targetWorkspace = determineTargetWorkspace(args.channel, normalizedDraft)
  const replyRequested = containsAny(normalizedDraft, REPLY_SIGNALS)
  const shortNote = normalizedDraft.split(/\s+/).filter((token) => token.length > 0).length <= 3
  const noteOnly = NO_REPLY_EXACT_MATCHES.has(normalizedDraft)
  const humanAddressed = startsWithHumanAddress(args.channel, normalizedDraft)
  const agentInvited = containsAny(normalizedDraft, AGENT_INVOCATION_SIGNALS)

  if (humanAddressed && !agentInvited) {
    return {
      shouldReply: false,
      routeMode: 'no_reply',
      rationale:
        'This is addressed to a human in the thread, so the messaging router stayed available without interrupting.',
      targetWorkspace,
      targetAgent: null,
    }
  }

  if (!replyRequested && (shortNote || noteOnly)) {
    return {
      shouldReply: false,
      routeMode: 'no_reply',
      rationale:
        'This reads like a desk note or acknowledgement, so the messaging router posted it without an agent reply.',
      targetWorkspace,
      targetAgent: null,
    }
  }

  const targetAgent = selectTargetAgent(args.agents, targetWorkspace)
  if (targetAgent) {
    return {
      shouldReply: true,
      routeMode: 'managed_agent',
      rationale: `Messaging router selected ${targetAgent.name} for this thread.`,
      targetWorkspace,
      targetAgent,
    }
  }

  return {
    shouldReply: true,
    routeMode: 'default_assistant',
    rationale:
      'Messaging router did not find a managed agent for this thread, so it fell back to the default assistant runtime.',
    targetWorkspace,
    targetAgent: null,
  }
}
