import assert from 'node:assert/strict'
import { test } from 'vitest'

import { decideMessagingAgentRoute } from '../src/workspaces/messages/messagingAgentRouter'
import { buildMessagingWorkspaceChannels } from '../src/workspaces/messages/messagingInboxData'

const defaultCounts = {
  activeTrades: 12,
  openWorkItems: 7,
  operationsQueueItems: 3,
  settlementQueueItems: 2,
  pendingInvoices: 4,
  paymentsDue: 1,
  attentionItems: 5,
  stalePricingItems: 2,
  pendingPricingTrades: 3,
  pendingSettlementTrades: 6,
}

test('messaging router keeps short acknowledgement notes in-thread without an agent reply', () => {
  const channel = buildMessagingWorkspaceChannels(defaultCounts)[0]
  const decision = decideMessagingAgentRoute({
    channel,
    draft: 'Thanks',
    agents: [],
  })

  assert.equal(decision.shouldReply, false)
  assert.equal(decision.routeMode, 'no_reply')
  assert.match(decision.rationale, /without an agent reply/i)
})

test('messaging router stays quiet for messages clearly addressed to a human', () => {
  const channel = buildMessagingWorkspaceChannels(defaultCounts)[1]
  const decision = decideMessagingAgentRoute({
    channel,
    draft: '@[Northshore LNG] can you confirm the nomination timing?',
    agents: [],
  })

  assert.equal(decision.shouldReply, false)
  assert.equal(decision.routeMode, 'no_reply')
  assert.match(decision.rationale, /addressed to a human/i)
})

test('messaging router can still jump in when an agent is explicitly invited', () => {
  const channel = buildMessagingWorkspaceChannels(defaultCounts)[1]
  const decision = decideMessagingAgentRoute({
    channel,
    draft: '@[Northshore LNG] and the messaging agent, can you summarize the blocker?',
    agents: [],
  })

  assert.equal(decision.shouldReply, true)
  assert.equal(decision.routeMode, 'default_assistant')
})

test('messaging router selects a specialist agent when the thread asks for settlement help', () => {
  const channel = buildMessagingWorkspaceChannels(defaultCounts)[1]
  const decision = decideMessagingAgentRoute({
    channel,
    draft: 'Can you review whether this invoice should move today?',
    agents: [
      {
        agent_id: 'settlement-copilot',
        name: 'Settlement Copilot',
        description: 'Handles invoice and payment follow-through.',
        status: 'ACTIVE',
        scope: 'USER',
        provider: 'openai',
        model: 'gpt-5-mini',
        role_key: 'settlement-copilot',
        profile_kind: 'ROLE_ARCHETYPE',
        specialization_summary: 'Settlement and invoice execution',
        human_owner_role: 'Settlement Lead',
        authority_ceiling: 'EXECUTE',
        activation_notes: null,
        orchestration_pattern: 'MANAGER',
        parent_agent_id: null,
        managed_agent_ids: [],
        delegation_guidance: null,
        profile_request_id: null,
        allowed_workspaces: ['assistant', 'settlement', 'operations', 'reports'],
        capabilities: ['READ', 'EXPLAIN', 'DRAFT', 'ACTION'],
        skills: ['settlement_operations', 'invoice_control'],
        allowed_tools: [],
        allowed_action_types: [],
        daily_token_allocation: null,
        token_budget: undefined,
        effective_policy: undefined,
        eval_gate: null,
      },
    ],
  })

  assert.equal(decision.shouldReply, true)
  assert.equal(decision.routeMode, 'managed_agent')
  assert.equal(decision.targetWorkspace, 'settlement')
  assert.equal(decision.targetAgent?.agent_id, 'settlement-copilot')
  assert.match(decision.rationale, /Settlement Copilot/)
})

test('messaging router falls back to the default assistant runtime when no managed agent matches', () => {
  const channel = buildMessagingWorkspaceChannels(defaultCounts)[2]
  const decision = decideMessagingAgentRoute({
    channel,
    draft: 'Please summarize the operations blocker here.',
    agents: [],
  })

  assert.equal(decision.shouldReply, true)
  assert.equal(decision.routeMode, 'default_assistant')
  assert.equal(decision.targetWorkspace, 'operations')
  assert.equal(decision.targetAgent, null)
  assert.match(decision.rationale, /default assistant runtime/i)
})
