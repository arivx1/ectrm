import type { PromptNavigationIntent } from '../../entities/app/promptNavigationIntent'

export type PromptHomeCounts = {
  activeTrades: number | null
  openWorkItems: number | null
  operationsQueueItems: number | null
  settlementQueueItems: number | null
  pendingInvoices: number | null
  paymentsDue: number | null
  attentionItems: number | null
  stalePricingItems: number | null
  pendingPricingTrades: number | null
  pendingSettlementTrades: number | null
}

export type PromptHomeContextualStarter = {
  key: string
  kicker: string
  title: string
  metric: string
  detail: string
  prompt: string
  askLabel: string
  intent: PromptNavigationIntent
}

function formatStarterCount(value: number | null): string {
  return typeof value === 'number' ? value.toLocaleString() : 'n/a'
}

function sumKnownCounts(...values: Array<number | null>): number | null {
  const knownValues = values.filter((value): value is number => typeof value === 'number')
  if (knownValues.length === 0) {
    return null
  }

  return knownValues.reduce((sum, value) => sum + value, 0)
}

export function buildPromptHomeContextualStarters(
  counts: PromptHomeCounts,
): PromptHomeContextualStarter[] {
  const operationsCount = counts.operationsQueueItems ?? counts.openWorkItems
  const settlementCount = sumKnownCounts(
    counts.settlementQueueItems,
    counts.pendingInvoices,
    counts.paymentsDue,
  )
  const pricingRiskCount = sumKnownCounts(
    counts.stalePricingItems,
    counts.pendingPricingTrades,
    counts.attentionItems,
  )
  const tradeIssueCount = sumKnownCounts(counts.activeTrades, counts.pendingSettlementTrades)

  return [
    {
      key: 'operations-blockers',
      kicker: 'Operations',
      title: 'Clear operations blockers',
      metric: formatStarterCount(operationsCount),
      detail: 'Confirmation, delivery, approval, and handoff work belongs in the operations queue.',
      prompt: 'Summarize the open operations queue and tell me which blocker to handle first.',
      askLabel: 'Ask about operations blockers',
      intent: {
        kind: 'open_workspace',
        targetView: 'operations',
        label: 'Open Work Queue',
        rationale: 'Use the work queue for confirmations, delivery blockers, approvals, and handoffs.',
      },
    },
    {
      key: 'settlement-follow-through',
      kicker: 'Settlement',
      title: 'Review invoices and payments',
      metric: formatStarterCount(settlementCount),
      detail: 'Invoice status, payment due items, and settlement exceptions continue in settlement.',
      prompt: 'Summarize pending invoices and payments due, then route me to the right settlement follow-through.',
      askLabel: 'Ask about settlement follow-through',
      intent: {
        kind: 'open_workspace',
        targetView: 'settlement',
        label: 'Open Settlement',
        rationale: 'Use settlement for invoices, payments, aging, and cash exceptions.',
      },
    },
    {
      key: 'pricing-exposure',
      kicker: 'Risk',
      title: 'Check pricing and exposure',
      metric: formatStarterCount(pricingRiskCount),
      detail: 'Pricing gaps and exposure signals are best reviewed against the risk workspace.',
      prompt: 'Where should I look for exposure risk today based on pricing gaps and desk attention items?',
      askLabel: 'Ask about pricing and exposure',
      intent: {
        kind: 'open_workspace',
        targetView: 'risk',
        label: 'Open Exposure',
        rationale: 'Use exposure when pricing coverage, open risk, or position context needs review.',
      },
    },
    {
      key: 'trade-capture',
      kicker: 'Trade Capture',
      title: 'Inspect or amend a trade',
      metric: formatStarterCount(tradeIssueCount),
      detail: 'Trade details, amendments, cancellations, and ticket edits stay in Trade Capture.',
      prompt: 'Help me decide whether Trade Capture is the right place to inspect or amend a trade issue.',
      askLabel: 'Ask about trade capture',
      intent: {
        kind: 'open_workspace',
        targetView: 'trades',
        label: 'Open Trade Capture',
        rationale: 'Use Trade Capture to book, inspect, amend, or cancel a trade.',
      },
    },
  ]
}
