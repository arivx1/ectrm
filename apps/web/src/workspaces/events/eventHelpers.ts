import type { EventRow, InspectorTab } from '../../shared/models'
import { tradeAggregateType } from '../../shared/trading'

const EVENT_FILTER_LABELS: Record<string, string> = {
  ALL: 'All events',
  SELECTED: 'Selected trade',
  TradeCreated: 'TradeCreated',
  TradeAmended: 'TradeAmended',
  TradeCancelled: 'TradeCancelled',
}

export const ALL_EVENT_TYPES = 'ALL_TYPES'
export const DEFAULT_VISIBLE_EVENT_COUNT = 12

export type EventTriageWorkspace = 'trades' | 'operations' | 'settlement'
export type EventTriageTone = 'active' | 'in-progress' | 'blocked'

export type EventTriageRecommendation = {
  workspace: EventTriageWorkspace
  badge: string
  title: string
  detail: string
  summary: string
  highlights: string[]
  severityLabel: string
  severityTone: EventTriageTone
}

export type EventWorkspaceHandoffMessage = {
  title: string
  detail: string
}

const OPERATIONS_EVENT_TYPES = new Set([
  'TradeWorkflowItemUpdated',
  'TradeActualizationUpserted',
  'OptionExercised',
  'OptionAssigned',
  'OptionExpired',
])

const SETTLEMENT_EVENT_TYPES = new Set([
  'TradeInvoiceCreated',
  'TradeInvoiceUpdated',
  'TradePaymentCreated',
  'TradePaymentUpdated',
  'TradeSettlementUpdated',
])

const OPERATIONS_PAYLOAD_KEYS = [
  'confirmation_status',
  'nomination_status',
  'allocation_status',
  'actualization_status',
  'workflow_type',
  'queue',
  'owner',
  'due_at',
  'operations_owner',
  'credit_approval_status',
  'credit_hold_active',
  'credit_hold_reason',
] as const

const SETTLEMENT_PAYLOAD_KEYS = [
  'invoice_status',
  'payment_status',
  'settlement_status',
  'invoice_id',
  'invoice_number',
  'payment_id',
  'payment_reference',
  'dispute_reason',
] as const

const BLOCKED_KEYWORDS = ['BLOCK', 'DISPUT', 'OVERDUE', 'REJECT', 'FAIL', 'HOLD', 'ERROR']
const FOLLOW_UP_KEYWORDS = ['PENDING', 'SENT', 'ISSUED', 'DUE', 'PARTIAL', 'OPEN', 'REVIEW', 'ASSIGN']

export type EventTypeOption = {
  value: string
  count: number
}

function asPayloadRecord(payload: EventRow['payload']): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null
  }

  return payload
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}`
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : null
}

function humanizeToken(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .trim()
}

function valueLabel(value: string): string {
  return humanizeToken(value)
}

function payloadValueLabel(key: string, value: unknown): string | null {
  if (typeof value === 'boolean') {
    if (key === 'credit_hold_active') {
      return value ? 'active' : 'cleared'
    }

    return value ? 'yes' : 'no'
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (key === 'price') {
      return `${value}`
    }
    if (key === 'volume') {
      return `${value}`
    }
    return value.toString()
  }

  const text = normalizeOptionalText(value)
  if (!text) {
    return null
  }

  if (key.endsWith('_at') || key.endsWith('_date')) {
    return text.slice(0, 10)
  }

  return valueLabel(text)
}

function highlightForKey(payload: EventRow['payload'], key: string): string | null {
  const payloadRecord = asPayloadRecord(payload)
  if (!payloadRecord || !Object.prototype.hasOwnProperty.call(payloadRecord, key)) {
    return null
  }

  const rawValue = payloadRecord[key]
  const label = payloadValueLabel(key, rawValue)
  if (!label) {
    return null
  }

  switch (key) {
    case 'confirmation_status':
      return `Confirmation ${label}`
    case 'nomination_status':
      return `Nomination ${label}`
    case 'allocation_status':
      return `Allocation ${label}`
    case 'actualization_status':
      return `Actualization ${label}`
    case 'invoice_status':
      return `Invoice ${label}`
    case 'payment_status':
      return `Payment ${label}`
    case 'settlement_status':
      return `Settlement ${label}`
    case 'workflow_type':
      return `Workflow ${label}`
    case 'queue':
      return `Queue ${label}`
    case 'owner':
    case 'operations_owner':
      return `Owner ${label}`
    case 'trader_user':
      return `Trader ${label}`
    case 'credit_approval_status':
      return `Credit ${label}`
    case 'credit_hold_active':
      return label === 'active' ? 'Credit hold active' : 'Credit hold cleared'
    case 'credit_hold_reason':
      return `Credit hold ${label}`
    case 'due_at':
      return `Due ${label}`
    case 'invoice_number':
      return `Invoice #${label}`
    case 'payment_reference':
      return `Payment ref ${label}`
    case 'invoice_id':
      return `Invoice ${label}`
    case 'payment_id':
      return `Payment ${label}`
    case 'dispute_reason':
      return `Dispute ${label}`
    case 'book':
      return `Book ${label}`
    case 'portfolio':
      return `Portfolio ${label}`
    case 'counterparty':
      return `Counterparty ${label}`
    case 'commodity':
      return `Commodity ${label}`
    case 'commodity_class':
      return `Class ${label}`
    case 'location_code':
      return `Location ${label}`
    case 'price':
      return `Price ${label}`
    case 'volume':
      return `Volume ${label}`
    case 'status':
      return `Status ${label}`
    default:
      return `${humanizeToken(key)} ${label}`
  }
}

function uniqueHighlights(highlights: Array<string | null>, limit = 4): string[] {
  const unique = new Set<string>()

  for (const highlight of highlights) {
    if (!highlight) {
      continue
    }
    unique.add(highlight)
    if (unique.size >= limit) {
      break
    }
  }

  return [...unique]
}

function highlightsForKeys(
  payload: EventRow['payload'],
  keys: readonly string[],
  limit = 4,
): string[] {
  return uniqueHighlights(keys.map((key) => highlightForKey(payload, key)), limit)
}

function listLabel(values: string[]): string {
  if (values.length === 0) {
    return ''
  }
  if (values.length === 1) {
    return values[0]
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`
  }
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}

function blockedPayload(payload: EventRow['payload']): boolean {
  const payloadText = JSON.stringify(payload ?? {}).toUpperCase()
  return BLOCKED_KEYWORDS.some((keyword) => payloadText.includes(keyword))
}

function followUpPayload(payload: EventRow['payload']): boolean {
  const payloadText = JSON.stringify(payload ?? {}).toUpperCase()
  return FOLLOW_UP_KEYWORDS.some((keyword) => payloadText.includes(keyword))
}

function eventHighlights(
  event: Pick<EventRow, 'event_type' | 'payload'>,
  workspace: EventTriageWorkspace,
): string[] {
  switch (event.event_type) {
    case 'TradeCreated':
      return highlightsForKeys(event.payload, ['book', 'portfolio', 'counterparty', 'commodity', 'price', 'volume'], 4)
    case 'TradeAmended':
      return workspace === 'settlement'
        ? highlightsForKeys(event.payload, SETTLEMENT_PAYLOAD_KEYS, 4)
        : workspace === 'operations'
          ? highlightsForKeys(event.payload, [...OPERATIONS_PAYLOAD_KEYS, 'trader_user'], 4)
          : highlightsForKeys(
              event.payload,
              ['book', 'portfolio', 'counterparty', 'commodity', 'price', 'volume', 'location_code'],
              4,
            )
    case 'TradeCancelled':
      return highlightsForKeys(event.payload, ['status', 'settlement_status', 'invoice_status', 'payment_status'], 4)
    case 'TradeWorkflowItemUpdated':
      return highlightsForKeys(event.payload, ['workflow_type', 'queue', 'status', 'owner', 'due_at'], 4)
    case 'TradeActualizationUpserted':
      return highlightsForKeys(event.payload, ['actualization_status', 'owner', 'due_at'], 4)
    case 'TradeInvoiceCreated':
    case 'TradeInvoiceUpdated':
      return highlightsForKeys(event.payload, ['invoice_status', 'invoice_number', 'payment_status', 'settlement_status'], 4)
    case 'TradePaymentCreated':
    case 'TradePaymentUpdated':
      return highlightsForKeys(event.payload, ['payment_status', 'payment_reference', 'settlement_status'], 4)
    case 'TradeSettlementUpdated':
      return highlightsForKeys(event.payload, ['settlement_status', 'invoice_status', 'payment_status', 'dispute_reason'], 4)
    case 'OptionExercised':
      return uniqueHighlights(['Option exercised', highlightForKey(event.payload, 'settlement_status')], 3)
    case 'OptionAssigned':
      return uniqueHighlights(['Option assigned', highlightForKey(event.payload, 'settlement_status')], 3)
    case 'OptionExpired':
      return uniqueHighlights(['Option expired', highlightForKey(event.payload, 'settlement_status')], 3)
    default:
      return workspace === 'settlement'
        ? highlightsForKeys(event.payload, SETTLEMENT_PAYLOAD_KEYS, 4)
        : workspace === 'operations'
          ? highlightsForKeys(event.payload, OPERATIONS_PAYLOAD_KEYS, 4)
          : highlightsForKeys(event.payload, ['status', 'book', 'counterparty', 'commodity'], 4)
  }
}

function buildEventSummary(
  event: Pick<EventRow, 'event_type' | 'payload'>,
  workspace: EventTriageWorkspace,
  highlights: string[],
): string {
  const highlightedChanges = highlights.length > 0 ? listLabel(highlights) : null

  switch (event.event_type) {
    case 'TradeCreated':
      return highlightedChanges
        ? `Booked a new trade with ${highlightedChanges}.`
        : 'Booked a new trade and started the lifecycle trail.'
    case 'TradeAmended':
      return highlightedChanges
        ? workspace === 'settlement'
          ? `Amendment changed downstream cash state: ${highlightedChanges}.`
          : workspace === 'operations'
            ? `Amendment changed post-trade workflow state: ${highlightedChanges}.`
            : `Amendment changed trade details: ${highlightedChanges}.`
        : 'Amendment changed the trade and needs a quick review in context.'
    case 'TradeCancelled':
      return highlightedChanges
        ? `Cancelled the trade and pushed closeout changes through ${highlightedChanges}.`
        : 'Cancelled the trade and signaled downstream closeout.'
    case 'TradeWorkflowItemUpdated':
      return highlightedChanges
        ? `Queue follow-through changed ${highlightedChanges}.`
        : 'Queue ownership or workflow status changed for this trade.'
    case 'TradeActualizationUpserted':
      return highlightedChanges
        ? `Physical execution follow-through changed ${highlightedChanges}.`
        : 'Physical execution follow-through changed for this trade.'
    case 'TradeInvoiceCreated':
      return highlightedChanges
        ? `Issued the first invoice signal with ${highlightedChanges}.`
        : 'Created a settlement invoice record for this trade.'
    case 'TradeInvoiceUpdated':
      return highlightedChanges
        ? `Invoice follow-through changed ${highlightedChanges}.`
        : 'Invoice state changed for this trade.'
    case 'TradePaymentCreated':
      return highlightedChanges
        ? `Opened payment follow-through with ${highlightedChanges}.`
        : 'Created a payment record for this trade.'
    case 'TradePaymentUpdated':
      return highlightedChanges
        ? `Payment follow-through changed ${highlightedChanges}.`
        : 'Payment state changed for this trade.'
    case 'TradeSettlementUpdated':
      return highlightedChanges
        ? `Settlement posture changed ${highlightedChanges}.`
        : 'Settlement posture changed for this trade.'
    case 'OptionExercised':
      return 'The option moved to exercised and now needs downstream queue follow-through.'
    case 'OptionAssigned':
      return 'The option moved to assigned and now needs downstream queue follow-through.'
    case 'OptionExpired':
      return 'The option expired and now needs downstream queue follow-through.'
    default:
      return highlightedChanges
        ? `This event changed ${highlightedChanges}.`
        : 'Review this event in context to confirm what changed.'
  }
}

function triageToneMeta(
  event: Pick<EventRow, 'event_type' | 'payload'>,
  workspace: EventTriageWorkspace,
): { severityLabel: string; severityTone: EventTriageTone } {
  if (blockedPayload(event.payload)) {
    return {
      severityLabel: 'Escalate now',
      severityTone: 'blocked',
    }
  }

  if (
    workspace !== 'trades' ||
    followUpPayload(event.payload) ||
    event.event_type === 'TradeAmended' ||
    event.event_type === 'TradeCancelled'
  ) {
    return {
      severityLabel:
        workspace === 'settlement'
          ? 'Cash follow-up'
          : workspace === 'operations'
            ? 'Queue follow-up'
            : 'Review in trade capture',
      severityTone: 'in-progress',
    }
  }

  return {
    severityLabel: 'Context update',
    severityTone: 'active',
  }
}

function workspaceGuidance(
  workspace: EventTriageWorkspace,
  eventType: string,
): Pick<EventTriageRecommendation, 'badge' | 'title' | 'detail'> {
  switch (workspace) {
    case 'operations':
      if (eventType === 'TradeWorkflowItemUpdated') {
        return {
          badge: 'Queue changed',
          title: 'Work the queue row next',
          detail:
            'This event changed queue ownership, timing, or workflow posture. Open Work Queue and clear the matching row before widening back to the full book.',
        }
      }

      if (eventType === 'TradeAmended') {
        return {
          badge: 'Amendment follow-up',
          title: 'Work the post-trade queue next',
          detail:
            'This amendment touched post-trade workflow state. Open Work Queue to confirm the queue rows and confirmation follow-through for the same trade.',
        }
      }

      if (eventType === 'OptionAssigned' || eventType === 'OptionExercised' || eventType === 'OptionExpired') {
        return {
          badge: 'Option follow-up',
          title: 'Clear option lifecycle follow-through next',
          detail:
            'This option lifecycle event now needs queue ownership, expiry handling, or downstream booking follow-through in Operations.',
        }
      }

      return {
        badge: 'Needs queue follow-up',
        title: 'Work the post-trade queue next',
        detail:
          'This event changed an operational handoff, delivery status, or expiry outcome. Open Work Queue to continue the follow-through.',
      }
    case 'settlement':
      if (eventType === 'TradeInvoiceCreated' || eventType === 'TradeInvoiceUpdated') {
        return {
          badge: 'Invoice changed',
          title: 'Move into invoice follow-through next',
          detail:
            'This event changed invoice posture. Open Settlement and review the invoice ledger for the same trade before widening back out.',
        }
      }

      if (eventType === 'TradePaymentCreated' || eventType === 'TradePaymentUpdated') {
        return {
          badge: 'Payment changed',
          title: 'Move into payment follow-through next',
          detail:
            'This event changed payment posture. Open Settlement and review the payment ledger for the same trade before widening back out.',
        }
      }

      return {
        badge: 'Needs cash follow-up',
        title: 'Move into settlement next',
        detail:
          'This event changed invoice, payment, or settlement state. Open Settlement to continue cash follow-through and dispute handling.',
      }
    case 'trades':
      return {
        badge: 'Review the trade',
        title: 'Inspect the trade record next',
        detail:
          'This event changed the trade itself. Open the trade in Trade Capture to confirm the latest economics and lifecycle state.',
      }
  }
}

export function isTradeLinkedEvent(event: Pick<EventRow, 'aggregate_type' | 'aggregate_id'>) {
  return event.aggregate_type === tradeAggregateType && event.aggregate_id.trim().length > 0
}

function payloadHasKeys(
  payload: EventRow['payload'],
  keys: readonly string[],
): boolean {
  const payloadRecord = asPayloadRecord(payload)
  if (!payloadRecord) {
    return false
  }

  return keys.some((key) => Object.prototype.hasOwnProperty.call(payloadRecord, key))
}

export function recommendedWorkspaceForEvent(
  event: Pick<EventRow, 'event_type' | 'payload'>,
): EventTriageWorkspace {
  if (
    SETTLEMENT_EVENT_TYPES.has(event.event_type) ||
    payloadHasKeys(event.payload, SETTLEMENT_PAYLOAD_KEYS)
  ) {
    return 'settlement'
  }

  if (
    OPERATIONS_EVENT_TYPES.has(event.event_type) ||
    payloadHasKeys(event.payload, OPERATIONS_PAYLOAD_KEYS)
  ) {
    return 'operations'
  }

  return 'trades'
}

export function buildEventTriageRecommendation(
  event: Pick<EventRow, 'event_type' | 'payload'>,
): EventTriageRecommendation {
  const workspace = recommendedWorkspaceForEvent(event)
  const highlights = eventHighlights(event, workspace)
  const guidance = workspaceGuidance(workspace, event.event_type)
  const { severityLabel, severityTone } = triageToneMeta(event, workspace)

  return {
    workspace,
    badge: guidance.badge,
    title: guidance.title,
    detail: guidance.detail,
    summary: buildEventSummary(event, workspace, highlights),
    highlights,
    severityLabel,
    severityTone,
  }
}

export function describeEventWorkspaceHandoff(
  workspace: EventTriageWorkspace,
  tradeId: string,
  eventType: string | null | undefined,
): EventWorkspaceHandoffMessage | null {
  if (!tradeId.trim()) {
    return null
  }

  switch (workspace) {
    case 'operations':
      switch (eventType) {
        case 'TradeWorkflowItemUpdated':
          return {
            title: `Start with the queue row for ${tradeId}`,
            detail:
              'Activity Feed routed you here because queue ownership, timing, or workflow status changed. Review the operational queue row for this trade before widening back to the full book.',
          }
        case 'TradeAmended':
          return {
            title: `Start with amendment follow-through for ${tradeId}`,
            detail:
              'Activity Feed routed you here because the amendment touched post-trade workflow state. Review the confirmation ledger and operational queue rows for this trade first.',
          }
        case 'OptionAssigned':
        case 'OptionExercised':
        case 'OptionExpired':
          return {
            title: `Start with option follow-through for ${tradeId}`,
            detail:
              'Activity Feed routed you here because option lifecycle follow-through changed. Review the expiry queue and downstream tasks for this trade first.',
          }
        default:
          return {
            title: `Start with the operational queue for ${tradeId}`,
            detail:
              'Activity Feed routed you here because this trade now needs post-trade follow-through. Keep the queue focused on this trade until the matching blocker is cleared.',
          }
      }
    case 'settlement':
      switch (eventType) {
        case 'TradeInvoiceCreated':
        case 'TradeInvoiceUpdated':
          return {
            title: `Start with invoice follow-through for ${tradeId}`,
            detail:
              'Activity Feed routed you here because invoice state changed. Review the invoice ledger for this trade before widening back to the full settlement queue.',
          }
        case 'TradePaymentCreated':
        case 'TradePaymentUpdated':
          return {
            title: `Start with payment follow-through for ${tradeId}`,
            detail:
              'Activity Feed routed you here because payment state changed. Review the payment ledger for this trade before widening back to the full settlement queue.',
          }
        case 'TradeSettlementUpdated':
          return {
            title: `Start with settlement exceptions for ${tradeId}`,
            detail:
              'Activity Feed routed you here because settlement posture changed. Review disputed, overdue, or partially settled rows for this trade first.',
          }
        default:
          return {
            title: `Start with cash follow-through for ${tradeId}`,
            detail:
              'Activity Feed routed you here because invoice, payment, or settlement state changed. Keep the cash workflow focused on this trade until the matching issue is resolved.',
          }
      }
    case 'trades':
      return {
        title: `Start with Trade Capture for ${tradeId}`,
        detail:
          'Activity Feed routed you back to Trade Capture so you can inspect the same trade in context before making the next change.',
      }
  }
}

export function resolveTradeInspectorTabForEvent(eventType: string | null | undefined): InspectorTab {
  switch (eventType) {
    case 'TradeAmended':
      return 'amend'
    case 'TradeCancelled':
    case 'TradeCreated':
    default:
      return 'overview'
  }
}

export function formatEventScopeLabel(eventFilter: string, selectedTradeId: string | null) {
  if (eventFilter !== 'SELECTED') {
    return EVENT_FILTER_LABELS[eventFilter] ?? eventFilter
  }

  return selectedTradeId ? `Selected trade (${selectedTradeId})` : 'Selected trade (none selected)'
}

export function buildEventTypeOptions<T extends Pick<EventRow, 'event_type'>>(events: T[]): EventTypeOption[] {
  return Object.entries(
    events.reduce<Record<string, number>>((counts, event) => {
      counts[event.event_type] = (counts[event.event_type] ?? 0) + 1
      return counts
    }, {}),
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value, count]) => ({ value, count }))
}

export function filterEventRows<
  T extends Pick<
    EventRow,
    'aggregate_type' | 'aggregate_id' | 'event_type' | 'actor_id' | 'correlation_id' | 'causation_id' | 'event_id' | 'schema_version'
  >,
>(
  events: T[],
  {
    eventTypeFilter,
    searchQuery,
  }: {
    eventTypeFilter: string
    searchQuery: string
  },
) {
  const searchTokens = searchQuery
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  return events.filter((event) => {
    if (eventTypeFilter !== ALL_EVENT_TYPES && event.event_type !== eventTypeFilter) {
      return false
    }

    if (searchTokens.length === 0) {
      return true
    }

    const searchableText = [
      event.event_type,
      event.aggregate_type,
      event.aggregate_id,
      event.actor_id ?? 'system',
      event.event_id,
      event.correlation_id ?? '',
      event.causation_id ?? '',
      `v${event.schema_version}`,
    ]
      .join(' ')
      .toLowerCase()

    return searchTokens.every((token) => searchableText.includes(token))
  })
}
