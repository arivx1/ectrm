import assert from 'node:assert/strict'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import type { Page } from 'playwright/test'
import { createServer as createViteServer, type ViteDevServer } from 'vite'

import { buildFallbackTradeMetadata } from '../../../src/shared/tradeMetadata'
import {
  assets,
  assetStandards,
  adminRoadmapDocument,
  assistantActionRequests,
  assistantAdminAgents,
  assistantOutcomeMetrics,
  assistantPromptRouteRecommendations,
  assistantRoleArchetypes,
  assistantRuntimeSettings,
  books,
  buildWorkspaceSummary,
  commodities,
  counterparties,
  codexTasks,
  codexTaskSettings,
  currencies,
  invoiceIssueCandidates,
  locations,
  portfolios,
  positions,
  priceIndices,
  projectionMonitoringAdminRecord,
  publicRuntimeSettings,
  spatialFeatures,
  spatialFeatureStandards,
  type RecordedRequest,
  selectedTradeEvents,
  smokeAccessToken,
  smokeSession,
  tradeAttentionCandidates,
  trades,
  userAccounts,
  units,
  weatherForecastPeriodsByCode,
  weatherLocations,
  weatherObservationsByCode,
  weatherSyncStatus,
  wikiPages,
} from './smokeFixtures'

type SmokeTradeRow = (typeof trades)[number]
type SmokeEventRow = (typeof selectedTradeEvents)[number]
type SmokeAssistantActionRequestRow = (typeof assistantActionRequests)[number]
type SmokeAssistantFeedbackRating = 'HELPFUL' | 'NEEDS_WORK'
type SmokeAssistantFeedbackRow = {
  feedback_id: number
  run_id: number
  conversation_id: number
  user_id: string
  user_role: string
  rating: SmokeAssistantFeedbackRating
  comment: string | null
  created_at: string
  updated_at: string
}
type SmokeAssistantPromptNavigationOutcomeStatus = 'ACCEPTED' | 'DISMISSED' | 'FAILED'
type SmokeAssistantPromptNavigationOutcomeRow = {
  outcome_id: number
  run_id: number | null
  conversation_id: number | null
  user_id: string
  user_role: string
  surface: 'PROMPT_HOME'
  outcome: SmokeAssistantPromptNavigationOutcomeStatus
  intent_key: string
  target_view: string | null
  target_label: string | null
  target_rationale: string | null
  focus_type: string | null
  focus_id: string | null
  focus_label: string | null
  detail: string | null
  created_at: string
  updated_at: string
}

type MockApiServer = {
  baseUrl: string
  expireSession: () => void
  mutationRequests: RecordedRequest[]
  promptNavigationOutcomeRequests: RecordedRequest[]
  unexpectedRequests: RecordedRequest[]
  close: () => Promise<void>
}

type StartSmokeHarnessOptions = {
  singleUserAuthEnabled?: boolean
}

export type SmokeHarness = {
  origin: string
  apiBaseUrl: string
  expireSession: () => void
  mutationRequests: RecordedRequest[]
  promptNavigationOutcomeRequests: RecordedRequest[]
  unexpectedRequests: RecordedRequest[]
  close: () => Promise<void>
}

const MAX_WIKI_RECENT_REVISIONS = 12

const webRoot = fileURLToPath(new URL('../../..', import.meta.url))

function normalizeOptionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeOptionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function buildTradeCreatedEventRow(args: {
  eventId: string
  tradeId: string
  occurredAt: string
  actorId: string | null
  schemaVersion: number
  payload: Record<string, unknown>
}): SmokeEventRow {
  const { eventId, tradeId, occurredAt, actorId, schemaVersion, payload } = args

  return {
    event_id: eventId,
    aggregate_type: 'trade',
    aggregate_id: tradeId,
    event_type: 'TradeCreated',
    occurred_at: occurredAt,
    recorded_at: occurredAt,
    actor_id: actorId,
    correlation_id: null,
    causation_id: null,
    schema_version: schemaVersion,
    payload,
  }
}

function buildCreatedTradeRow(args: {
  tradeId: string
  occurredAt: string
  eventId: string
  payload: Record<string, unknown>
}): SmokeTradeRow {
  const { tradeId, occurredAt, eventId, payload } = args
  const tradeNature = normalizeOptionalText(payload.trade_nature) ?? 'PHYSICAL'
  const requiresPhysicalWorkflow = tradeNature === 'PHYSICAL'
  const tradeStructure = normalizeOptionalText(payload.trade_structure) ?? 'SINGLE'

  return {
    trade_id: tradeId,
    originating_option_trade_id: null,
    external_trade_id: normalizeOptionalText(payload.external_trade_id),
    source_system: normalizeOptionalText(payload.source_system),
    created_at: occurredAt,
    updated_at: occurredAt,
    execution_timestamp: normalizeOptionalText(payload.execution_timestamp) ?? occurredAt,
    trade_date: normalizeOptionalText(payload.trade_date) ?? occurredAt.slice(0, 10),
    effective_start_date: normalizeOptionalText(payload.effective_start_date),
    effective_end_date: normalizeOptionalText(payload.effective_end_date),
    quality_spec: normalizeOptionalText(payload.quality_spec),
    unit_of_measure: normalizeOptionalText(payload.unit_of_measure),
    trade_currency_code: normalizeOptionalText(payload.trade_currency_code),
    location_code: normalizeOptionalText(payload.location_code),
    delivery_start: normalizeOptionalText(payload.delivery_start),
    delivery_end: normalizeOptionalText(payload.delivery_end),
    price_unit_code: normalizeOptionalText(payload.price_unit_code),
    instrument_type: normalizeOptionalText(payload.instrument_type) ?? 'LINEAR',
    option_type: normalizeOptionalText(payload.option_type),
    option_style: normalizeOptionalText(payload.option_style),
    option_strike_price: normalizeOptionalNumber(payload.option_strike_price),
    option_expiration_date: normalizeOptionalText(payload.option_expiration_date),
    trade_nature: tradeNature,
    trade_structure: tradeStructure,
    trade_side:
      tradeStructure === 'SWAP'
        ? null
        : normalizeOptionalText(payload.trade_side) ?? 'BUY',
    book: normalizeOptionalText(payload.book) ?? 'GULF_GAS',
    portfolio: normalizeOptionalText(payload.portfolio),
    counterparty: normalizeOptionalText(payload.counterparty),
    commodity_class: normalizeOptionalText(payload.commodity_class) ?? 'NATURAL_GAS',
    commodity: normalizeOptionalText(payload.commodity) ?? 'HENRY_HUB_GAS',
    pricing_type: normalizeOptionalText(payload.pricing_type) ?? 'FIXED',
    pricing_status: normalizeOptionalText(payload.pricing_status) ?? 'PENDING',
    confirmation_status: normalizeOptionalText(payload.confirmation_status) ?? 'PENDING',
    nomination_status:
      normalizeOptionalText(payload.nomination_status) ??
      (requiresPhysicalWorkflow ? 'PENDING' : 'NOT_REQUIRED'),
    allocation_status:
      normalizeOptionalText(payload.allocation_status) ??
      (requiresPhysicalWorkflow ? 'PENDING' : 'NOT_REQUIRED'),
    actualization_status: requiresPhysicalWorkflow ? 'PENDING' : 'NOT_REQUIRED',
    price_index_code: normalizeOptionalText(payload.price_index_code),
    price: normalizeOptionalNumber(payload.price),
    volume: normalizeOptionalNumber(payload.volume),
    invoice_status:
      normalizeOptionalText(payload.invoice_status) ??
      (requiresPhysicalWorkflow ? 'PENDING' : 'NOT_REQUIRED'),
    payment_status: normalizeOptionalText(payload.payment_status) ?? 'PENDING',
    settlement_status: normalizeOptionalText(payload.settlement_status) ?? 'PENDING',
    trader_user: normalizeOptionalText(payload.trader_user),
    status: 'ACTIVE',
    last_event_id: eventId,
    active_credit_exception: null,
    credit_approval_status: 'APPROVED',
    credit_hold_active: false,
    credit_hold_reason: null,
  }
}

function cloneWikiPage(page: SmokeWikiPageRow): SmokeWikiPageRow {
  return {
    ...page,
  }
}

function cloneWikiPageRevision(revision: SmokeWikiPageRevisionRow): SmokeWikiPageRevisionRow {
  return {
    ...revision,
    change_summary: [...revision.change_summary],
  }
}

function plainTextFromWikiMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function summarizeWikiMarkdown(markdown: string): string {
  const plainText = plainTextFromWikiMarkdown(markdown)
  if (!plainText) {
    return 'No page summary yet.'
  }

  const words = plainText.split(' ')
  if (words.length <= 24) {
    return plainText
  }

  return `${words.slice(0, 24).join(' ')}...`
}

function countWikiWords(markdown: string): number {
  const plainText = plainTextFromWikiMarkdown(markdown)
  return plainText ? plainText.split(' ').filter(Boolean).length : 0
}

function buildWikiChildCount(rows: SmokeWikiPageRow[], pageId: string): number {
  return rows.filter((page) => page.parent_page_id === pageId).length
}

function sortWikiPages(rows: SmokeWikiPageRow[]): SmokeWikiPageRow[] {
  return [...rows].sort((left, right) => {
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order
    }
    return left.title.localeCompare(right.title)
  })
}

function serializeWikiRevision(revision: SmokeWikiPageRevisionRow) {
  return {
    revision_id: revision.revision_id,
    version: revision.version,
    parent_page_id: revision.parent_page_id,
    title: revision.title,
    sort_order: revision.sort_order,
    change_summary: [...revision.change_summary],
    created_at: revision.created_at,
    created_by: revision.created_by,
    restored_from_revision_id: revision.restored_from_revision_id,
  }
}

function serializeWikiPageSummary(rows: SmokeWikiPageRow[], page: SmokeWikiPageRow) {
  return {
    page_id: page.page_id,
    parent_page_id: page.parent_page_id,
    title: page.title,
    summary: summarizeWikiMarkdown(page.content_markdown),
    child_count: buildWikiChildCount(rows, page.page_id),
    word_count: countWikiWords(page.content_markdown),
    sort_order: page.sort_order,
    created_at: page.created_at,
    created_by: page.created_by,
    updated_at: page.updated_at,
    updated_by: page.updated_by,
    version: page.version,
  }
}

function buildWikiDescendantIds(rows: SmokeWikiPageRow[], rootPageId: string): Set<string> {
  const descendants = new Set<string>()
  const queue = rows.filter((page) => page.parent_page_id === rootPageId).map((page) => page.page_id)

  while (queue.length > 0) {
    const nextPageId = queue.shift()
    if (!nextPageId || descendants.has(nextPageId)) {
      continue
    }

    descendants.add(nextPageId)
    rows.forEach((page) => {
      if (page.parent_page_id === nextPageId) {
        queue.push(page.page_id)
      }
    })
  }

  return descendants
}

function nextWikiTimestamp(sequence: number): string {
  const minute = String(5 + sequence).padStart(2, '0')
  return `2026-05-16T16:${minute}:00Z`
}

function nextWikiSortOrder(rows: SmokeWikiPageRow[], parentPageId: string | null): number {
  const siblingSortOrders = rows
    .filter((page) => page.parent_page_id === parentPageId)
    .map((page) => page.sort_order)

  return (siblingSortOrders.length > 0 ? Math.max(...siblingSortOrders) : 0) + 100
}

function buildWikiChangeSummary(args: {
  previousTitle: string
  previousParentPageId: string | null
  previousContentMarkdown: string
  previousSortOrder: number
  page: SmokeWikiPageRow
  pagesById: Map<string, SmokeWikiPageRow>
}): string[] {
  const {
    previousTitle,
    previousParentPageId,
    previousContentMarkdown,
    previousSortOrder,
    page,
    pagesById,
  } = args
  const changeSummary: string[] = []

  if (page.title !== previousTitle) {
    changeSummary.push(`Renamed page to '${page.title}'.`)
  }

  if (page.parent_page_id !== previousParentPageId) {
    if (page.parent_page_id === null) {
      changeSummary.push('Moved page to the top level.')
    } else {
      const parentTitle = pagesById.get(page.parent_page_id)?.title ?? page.parent_page_id
      changeSummary.push(`Moved page under '${parentTitle}'.`)
    }
  }

  if (page.sort_order !== previousSortOrder) {
    changeSummary.push('Adjusted page ordering.')
  }

  if (page.content_markdown !== previousContentMarkdown) {
    if (!previousContentMarkdown.trim() && page.content_markdown.trim()) {
      changeSummary.push('Added page content.')
    } else if (previousContentMarkdown.trim() && !page.content_markdown.trim()) {
      changeSummary.push('Cleared page content.')
    } else {
      changeSummary.push('Updated page content.')
    }
  }

  return changeSummary.length > 0 ? changeSummary : ['Saved page changes.']
}

function recordWikiRevision(args: {
  revisionsByPageId: Map<string, SmokeWikiPageRevisionRow[]>
  nextRevisionId: number
  page: SmokeWikiPageRow
  createdAt: string
  createdBy: string
  changeSummary: string[]
  restoredFromRevisionId?: number | null
}): SmokeWikiPageRevisionRow {
  const {
    revisionsByPageId,
    nextRevisionId,
    page,
    createdAt,
    createdBy,
    changeSummary,
    restoredFromRevisionId = null,
  } = args
  const revision = {
    revision_id: nextRevisionId,
    page_id: page.page_id,
    version: page.version,
    parent_page_id: page.parent_page_id,
    title: page.title,
    content_markdown: page.content_markdown,
    sort_order: page.sort_order,
    change_summary: [...changeSummary],
    created_at: createdAt,
    created_by: createdBy,
    restored_from_revision_id: restoredFromRevisionId,
  } satisfies SmokeWikiPageRevisionRow

  const currentRevisions = revisionsByPageId.get(page.page_id) ?? []
  currentRevisions.unshift(revision)
  revisionsByPageId.set(page.page_id, currentRevisions)

  return revision
}

function serializeWikiPageDetail(
  rows: SmokeWikiPageRow[],
  revisionsByPageId: Map<string, SmokeWikiPageRevisionRow[]>,
  page: SmokeWikiPageRow,
) {
  return {
    ...serializeWikiPageSummary(rows, page),
    content_markdown: page.content_markdown,
    recent_revisions: (revisionsByPageId.get(page.page_id) ?? [])
      .slice()
      .sort((left, right) => {
        if (left.version !== right.version) {
          return right.version - left.version
        }
        return right.revision_id - left.revision_id
      })
      .slice(0, MAX_WIKI_RECENT_REVISIONS)
      .map(serializeWikiRevision),
  }
}

function validateWikiParentPage(
  rows: SmokeWikiPageRow[],
  pageId: string | null,
  parentPageId: string | null,
): string | null {
  if (parentPageId === null) {
    return null
  }

  const pagesById = new Map(rows.map((page) => [page.page_id, page] as const))
  if (!pagesById.has(parentPageId)) {
    return `Parent wiki page '${parentPageId}' was not found`
  }

  if (pageId !== null && parentPageId === pageId) {
    return 'A wiki page cannot be its own parent'
  }

  const descendants = pageId === null ? new Set<string>() : buildWikiDescendantIds(rows, pageId)
  if (pageId !== null && descendants.has(parentPageId)) {
    return 'A wiki page cannot move underneath one of its descendants'
  }

  let currentParentId: string | null = parentPageId
  const visited = new Set<string>()
  while (currentParentId !== null) {
    if (visited.has(currentParentId)) {
      return 'Wiki page hierarchy contains a cycle'
    }
    visited.add(currentParentId)

    if (pageId !== null && currentParentId === pageId) {
      return 'A wiki page cannot move underneath one of its descendants'
    }

    currentParentId = pagesById.get(currentParentId)?.parent_page_id ?? null
  }

  return null
}

const wikiSmokeHelperCatalog = {
  sortWikiPages,
  nextWikiTimestamp,
  nextWikiSortOrder,
  buildWikiChangeSummary,
  recordWikiRevision,
  serializeWikiPageDetail,
  validateWikiParentPage,
}
void wikiSmokeHelperCatalog

function writeJson(response: ServerResponse, payload: unknown, status = 200): void {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

function writeNoContent(response: ServerResponse): void {
  response.writeHead(204)
  response.end()
}

function writeSse(
  response: ServerResponse,
  events: Array<{ event: string; data: Record<string, unknown> }>,
): void {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  })

  for (const event of events) {
    response.write(`event: ${event.event}\n`)
    response.write(`data: ${JSON.stringify(event.data)}\n\n`)
  }

  response.end()
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  if (chunks.length === 0) {
    return null
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function requireAuthorization(
  request: IncomingMessage,
  response: ServerResponse,
  sessionExpired = false,
): boolean {
  if (!sessionExpired && request.headers.authorization === `Bearer ${smokeAccessToken}`) {
    return true
  }

  writeJson(response, { detail: 'Unauthorized' }, 401)
  return false
}

function normalizedReviewText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizedCorrectionFields(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((field) => (typeof field === 'string' ? field.trim() : ''))
            .filter(Boolean),
        ),
      )
    : []
}

function buildTradeAttentionCandidateList(candidateType: string | null, limit: number) {
  const matchingCandidates = tradeAttentionCandidates
    .filter((candidate) => candidateType === null || candidate.candidate_types.includes(candidateType))
    .slice(0, limit)
  const candidateTypeCounts = Object.fromEntries(
    Array.from(
      matchingCandidates.reduce((counts, candidate) => {
        for (const itemType of candidate.candidate_types) {
          counts.set(itemType, (counts.get(itemType) ?? 0) + 1)
        }
        return counts
      }, new Map<string, number>()),
    ),
  )

  return {
    count: matchingCandidates.length,
    total_count: matchingCandidates.length,
    items: matchingCandidates,
    candidate_type_counts: candidateTypeCounts,
    candidate_type: candidateType,
    source_count_key:
      candidateType === 'confirmation_backlog'
        ? 'dashboard.attention.confirmation_backlog_count'
        : candidateType === 'payment_due'
          ? 'settlement.payment_due_count'
          : candidateType === 'overdue_payment'
            ? 'dashboard.attention.overdue_payment_count'
            : candidateType === 'stale_pricing'
              ? 'dashboard.attention.stale_pricing_count'
              : null,
    description:
      candidateType === 'confirmation_backlog'
        ? 'Trades executed 1+ day ago that still are not confirmed.'
        : candidateType === 'payment_due'
          ? 'Trades currently waiting on due or overdue payment collection/settlement.'
          : candidateType === 'overdue_payment'
            ? 'Trades with overdue payment state or aging invoices that still are not paid.'
            : candidateType === 'stale_pricing'
              ? 'Trades still marked pending or partial pricing 2+ days after execution.'
              : null,
    candidate_types: candidateType === null ? [] : [candidateType],
  }
}

function buildInvoiceIssueCandidateList(limit: number) {
  const items = invoiceIssueCandidates.slice(0, limit)
  return {
    count: items.length,
    total_count: items.length,
    ready_count: items.filter((candidate) => candidate.readiness_status === 'READY').length,
    blocked_count: items.filter((candidate) => candidate.readiness_status !== 'READY').length,
    items,
  }
}

async function startMockApiServer(
  options: StartSmokeHarnessOptions = {},
): Promise<MockApiServer> {
  const mutationRequests: RecordedRequest[] = []
  const promptNavigationOutcomeRequests: RecordedRequest[] = []
  const unexpectedRequests: RecordedRequest[] = []
  const tradeRows: SmokeTradeRow[] = trades.map((trade) => ({ ...trade }))
  const wikiPageRows: SmokeWikiPageRow[] = wikiPages.map(cloneWikiPage)
  const wikiPageRevisionsByPageId = new Map<string, SmokeWikiPageRevisionRow[]>(
    wikiPageRows.map((page, index) => [
      page.page_id,
      [
        {
          revision_id: index + 1,
          page_id: page.page_id,
          version: page.version,
          parent_page_id: page.parent_page_id,
          title: page.title,
          content_markdown: page.content_markdown,
          sort_order: page.sort_order,
          change_summary: ['Created starter wiki page.'],
          created_at: page.updated_at,
          created_by: page.updated_by,
          restored_from_revision_id: null,
        } satisfies SmokeWikiPageRevisionRow,
      ].map(cloneWikiPageRevision),
    ]),
  )
  const tradeEventsByAggregateId = new Map<string, SmokeEventRow[]>(
    [['T-AMEND-100', selectedTradeEvents.map((event) => ({ ...event }))]],
  )
  function cloneAssistantActionRequest(
    request: SmokeAssistantActionRequestRow,
  ): SmokeAssistantActionRequestRow {
    return {
      ...request,
      payload: { ...request.payload },
      review_context: request.review_context
        ? {
            ...request.review_context,
            owning_work_object: { ...request.review_context.owning_work_object },
            supporting_records: request.review_context.supporting_records.map((record) => ({
              ...record,
            })),
            assumptions: [...request.review_context.assumptions],
            missing_evidence: [...request.review_context.missing_evidence],
            expected_downstream_effects: [...request.review_context.expected_downstream_effects],
            stale_state_basis: { ...request.review_context.stale_state_basis },
            action_preview: request.review_context.action_preview
              ? {
                  ...request.review_context.action_preview,
                  affected_records: request.review_context.action_preview.affected_records.map(
                    (record) => ({ ...record }),
                  ),
                  field_changes: request.review_context.action_preview.field_changes.map((change) => ({
                    ...change,
                  })),
                  expected_side_effects: [...request.review_context.action_preview.expected_side_effects],
                  warnings: [...request.review_context.action_preview.warnings],
                  blocking_reasons: [...request.review_context.action_preview.blocking_reasons],
                  assumptions: [...request.review_context.action_preview.assumptions],
                }
              : request.review_context.action_preview,
          }
        : request.review_context,
      lifecycle: {
        ...request.lifecycle,
        review_risk_flags: [...request.lifecycle.review_risk_flags],
      },
      result: request.result ? { ...request.result } : null,
      correction_fields: [...request.correction_fields],
    }
  }

  const assistantActionRequestRows: SmokeAssistantActionRequestRow[] = assistantActionRequests.map(
    cloneAssistantActionRequest,
  )
  const assistantRunFeedbackByRunId = new Map<number, SmokeAssistantFeedbackRow>()
  const assistantPromptNavigationOutcomeRows = new Map<string, SmokeAssistantPromptNavigationOutcomeRow>()
  const assistantConversationId = 902
  const assistantRunId = 8801
  const assistantRunRecordedAt = '2026-04-11T09:08:00Z'
  const assistantUserPrompt = 'Where should I handle the confirmation blocker?'
  void wikiPageRevisionsByPageId
  let nextWikiPageSequence = wikiPageRows.length + 1
  let nextWikiRevisionId = wikiPageRows.length + 1
  let wikiMutationSequence = 0
  void [nextWikiPageSequence, nextWikiRevisionId, wikiMutationSequence]
  let sessionExpired = false
  const runtimeSettings = {
    ...publicRuntimeSettings,
    single_user_auth_enabled: options.singleUserAuthEnabled ?? publicRuntimeSettings.single_user_auth_enabled,
  }

  function buildAssistantActionRequestsForPrompt(prompt: string): SmokeAssistantActionRequestRow[] {
    const normalizedPrompt = prompt.toLowerCase()
    if (normalizedPrompt.includes('cancel') || normalizedPrompt.includes('unwind')) {
      return assistantActionRequestRows
        .filter((request) => request.action_request_id === 7001)
        .map(cloneAssistantActionRequest)
    }

    return []
  }

  function buildAssistantResponseContentForPrompt(prompt: string): string {
    const normalizedPrompt = prompt.toLowerCase()
    if (normalizedPrompt.includes('cancel') || normalizedPrompt.includes('unwind')) {
      return 'I staged a governed cancellation request for T-AMEND-100. Review the evidence below before anything changes. Approval is still required.'
    }

    if (normalizedPrompt.includes('broken handoff') || normalizedPrompt.includes('invalid handoff')) {
      return [
        'Stay on Home for now while we confirm the route.',
        '```navigation_intent',
        JSON.stringify({
          kind: 'open_workspace',
          target_view: 'not-a-real-workspace',
          label: 'Broken Handoff',
        }),
        '```',
      ].join('\n')
    }

    if (normalizedPrompt.includes('settlement') || normalizedPrompt.includes('invoice')) {
      return [
        'Settlement is the right place to continue because the open item is invoice and payment follow-through.',
        '```navigation_intent',
        JSON.stringify({
          kind: 'open_workspace',
          targetView: 'settlement',
          label: 'Open Settlement',
          rationale: 'Review settlement follow-through for T-AMEND-100 before changing invoice or payment state.',
          focus: {
            type: 'trade',
            id: 'T-AMEND-100',
            label: 'T-AMEND-100',
          },
        }),
        '```',
      ].join('\n')
    }

    if (normalizedPrompt.includes('trade capture') || normalizedPrompt.includes('amend')) {
      return [
        'Trade Capture is the right place to continue because the next step is an amendment review.',
        '```navigation_intent',
        JSON.stringify({
          kind: 'open_workspace',
          targetView: 'trades',
          label: 'Open Trade Capture',
          rationale: 'Open the amend panel for T-AMEND-100 so economics and workflow changes stay in one place.',
          focus: {
            type: 'trade',
            id: 'T-AMEND-100',
            label: 'T-AMEND-100',
          },
          inspectorTab: 'amend',
        }),
        '```',
      ].join('\n')
    }

    return [
      'Operations is the right place to continue because the blocker is tied to the confirmation queue.',
      '```navigation_intent',
      JSON.stringify({
        kind: 'open_workspace',
        targetView: 'operations',
        label: 'Open Work Queue',
        rationale: 'Review the confirmation blocker with the operations owner before changing trade state.',
        focus: {
          type: 'trade',
          id: 'T-AMEND-100',
          label: 'T-AMEND-100',
        },
        inspectorTab: 'events',
      }),
      '```',
    ].join('\n')
  }

  function latestUserPromptFromPayload(payload: unknown): string {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return ''
    }

    const messages = (payload as { messages?: unknown }).messages
    if (!Array.isArray(messages)) {
      return ''
    }

    for (const message of [...messages].reverse()) {
      if (typeof message !== 'object' || message === null || Array.isArray(message)) {
        continue
      }
      const candidate = message as { role?: unknown; content?: unknown }
      if (candidate.role === 'user' && typeof candidate.content === 'string') {
        return candidate.content
      }
    }

    return ''
  }

  const assistantResponseContent = buildAssistantResponseContentForPrompt(assistantUserPrompt)

  function buildAssistantConversationSummary() {
    return {
      conversation_id: assistantConversationId,
      created_at: '2026-04-11T09:00:00Z',
      updated_at: assistantRunRecordedAt,
      user_id: smokeSession.user.user_id,
      user_role: smokeSession.user.role,
      workspace: 'assistant',
      agent_id: null,
      agent_name: null,
      provider: 'openai',
      model: 'gpt-5.4',
      use_live_tools: true,
      title: 'Recent blocker triage',
      run_count: 1,
      latest_run_id: assistantRunId,
      latest_user_message: assistantUserPrompt,
      latest_assistant_message: 'Operations is the right place to continue.',
    }
  }

  function buildAssistantConversation() {
    return {
      ...buildAssistantConversationSummary(),
      messages: [
        {
          role: 'user',
          content: assistantUserPrompt,
          recorded_at: '2026-04-11T09:07:00Z',
          run_id: null,
          provider: null,
          model: null,
          warnings: [],
          tool_calls: [],
          feedback: null,
        },
        {
          role: 'assistant',
          content: assistantResponseContent,
          recorded_at: assistantRunRecordedAt,
          run_id: assistantRunId,
          provider: 'openai',
          model: 'gpt-5.4',
          warnings: [],
          tool_calls: [],
          feedback: assistantRunFeedbackByRunId.get(assistantRunId) ?? null,
        },
      ],
    }
  }

  function buildAssistantRunSummary() {
    return {
      conversation_id: assistantConversationId,
      run_id: assistantRunId,
      status: 'COMPLETED',
      created_at: assistantRunRecordedAt,
      completed_at: assistantRunRecordedAt,
      user_id: smokeSession.user.user_id,
      user_role: smokeSession.user.role,
      workspace: 'assistant',
      agent_id: null,
      agent_name: null,
      agent_role_key: null,
      agent_profile_kind: null,
      provider: 'openai',
      model: 'gpt-5.4',
      use_live_tools: true,
      warning_count: 0,
      tool_call_count: 0,
      input_tokens: 120,
      output_tokens: 60,
      latest_user_message: assistantUserPrompt,
      assistant_message: assistantResponseContent,
      error_detail: null,
    }
  }

  function buildAssistantRun() {
    return {
      ...buildAssistantRunSummary(),
      request_messages: [{ role: 'user', content: assistantUserPrompt }],
      application_context: 'Selected trade T-AMEND-100.',
      prompt_sections: [
        {
          key: 'workspace',
          title: 'Workspace',
          source: 'workspace',
          content: 'Assistant workspace smoke context.',
        },
      ],
      rendered_system_prompt: 'Answer with grounded operational context and stage reviewable actions only.',
      warnings: [],
      tool_calls: [],
    }
  }

  function buildAssistantResponseMetadata(prompt: string) {
    const actionRequests = buildAssistantActionRequestsForPrompt(prompt)
    const responseRunId = actionRequests[0]?.run_id ?? assistantRunId

    return {
      conversation_id: assistantConversationId,
      conversation_updated_at: assistantRunRecordedAt,
      run_id: responseRunId,
      run_recorded_at: assistantRunRecordedAt,
      agent_id: null,
      agent_name: null,
      agent_role_key: null,
      agent_profile_kind: null,
      provider: 'openai',
      model: 'gpt-5.4',
      usage: {
        input_tokens: 120,
        output_tokens: 60,
      },
      warnings: [],
      tool_calls: [],
      action_requests: actionRequests,
    }
  }

  function buildAssistantOutcomeMetrics() {
    const feedbackRows = Array.from(assistantRunFeedbackByRunId.values())
    const promptNavigationRows = Array.from(assistantPromptNavigationOutcomeRows.values())
    if (feedbackRows.length === 0 && promptNavigationRows.length === 0) {
      return assistantOutcomeMetrics
    }

    const helpfulFeedbackDelta = feedbackRows.filter((row) => row.rating === 'HELPFUL').length
    const needsWorkFeedbackDelta = feedbackRows.filter((row) => row.rating === 'NEEDS_WORK').length
    const totalFeedbackCount = assistantOutcomeMetrics.total_feedback_count + feedbackRows.length
    const helpfulFeedbackCount = assistantOutcomeMetrics.helpful_feedback_count + helpfulFeedbackDelta
    const needsWorkFeedbackCount = assistantOutcomeMetrics.needs_work_feedback_count + needsWorkFeedbackDelta
    const acceptedPromptCount = promptNavigationRows.filter((row) => row.outcome === 'ACCEPTED').length
    const dismissedPromptCount = promptNavigationRows.filter((row) => row.outcome === 'DISMISSED').length
    const failedPromptCount = promptNavigationRows.filter((row) => row.outcome === 'FAILED').length
    const totalPromptCount = acceptedPromptCount + dismissedPromptCount + failedPromptCount
    const promptTargetGroups = new Map<
      string,
      {
        target_view: string | null
        target_label: string | null
        focus_type: string | null
        accepted_count: number
        dismissed_count: number
        failed_count: number
        recent_prompt_examples: string[]
      }
    >()
    for (const row of promptNavigationRows) {
      const key = `${row.target_view ?? '__invalid__'}::${row.target_label ?? '__unlabeled__'}::${row.focus_type ?? '__workspace__'}`
      const group = promptTargetGroups.get(key) ?? {
        target_view: row.target_view,
        target_label: row.target_label,
        focus_type: row.focus_type,
        accepted_count: 0,
        dismissed_count: 0,
        failed_count: 0,
        recent_prompt_examples: [],
      }
      if (row.outcome === 'ACCEPTED') {
        group.accepted_count += 1
      } else if (row.outcome === 'DISMISSED') {
        group.dismissed_count += 1
      } else if (row.outcome === 'FAILED') {
        group.failed_count += 1
      }
      if (!group.recent_prompt_examples.includes(assistantUserPrompt)) {
        group.recent_prompt_examples.push(assistantUserPrompt)
      }
      promptTargetGroups.set(key, group)
    }
    const byPromptTarget = Array.from(promptTargetGroups.values()).map((group) => {
      const outcomeCount = group.accepted_count + group.dismissed_count + group.failed_count
      const acceptanceRate = outcomeCount > 0 ? group.accepted_count / outcomeCount : null
      const dismissRate = outcomeCount > 0 ? group.dismissed_count / outcomeCount : null
      const failureRate = outcomeCount > 0 ? group.failed_count / outcomeCount : null
      let signal: 'OBSERVE' | 'CANDIDATE_FOR_RULE' | 'NARROW' | 'RETIRE' = 'OBSERVE'
      let signalReason = 'Keep observing until the route has enough repeated outcomes to justify product logic.'
      if (group.failed_count >= 2 && (failureRate ?? 0) >= 0.5) {
        signal = 'RETIRE'
        signalReason = 'Repeated failed handoff payloads suggest this route should be paused or rebuilt.'
      } else if (group.dismissed_count >= 2 && (dismissRate ?? 0) >= 0.5) {
        signal = 'NARROW'
        signalReason = 'Users dismiss this destination often enough that the routing rule should narrow or ask for confirmation.'
      } else if (group.accepted_count >= 3 && (acceptanceRate ?? 0) >= 0.75 && group.failed_count === 0) {
        signal = 'CANDIDATE_FOR_RULE'
        signalReason = 'Repeated accepted handoffs make this destination a strong deterministic rule candidate.'
      }
      return {
        target_view: group.target_view,
        target_label: group.target_label,
        focus_type: group.focus_type,
        outcome_count: outcomeCount,
        accepted_count: group.accepted_count,
        dismissed_count: group.dismissed_count,
        failed_count: group.failed_count,
        acceptance_rate: acceptanceRate,
        dismiss_rate: dismissRate,
        failure_rate: failureRate,
        signal,
        signal_reasons: [signalReason],
        recent_prompt_examples: group.recent_prompt_examples.slice(0, 3),
      }
    })

    return {
      ...assistantOutcomeMetrics,
      total_feedback_count: totalFeedbackCount,
      helpful_feedback_count: helpfulFeedbackCount,
      needs_work_feedback_count: needsWorkFeedbackCount,
      feedback_helpful_rate: helpfulFeedbackCount / totalFeedbackCount,
      by_workspace: assistantOutcomeMetrics.by_workspace.map((row) => {
        if (row.workspace !== 'assistant') {
          return row
        }

        const workspaceFeedbackCount = row.feedback_count + feedbackRows.length
        const workspaceHelpfulFeedbackCount = row.helpful_feedback_count + helpfulFeedbackDelta
        return {
          ...row,
          run_count: row.run_count + feedbackRows.length,
          helpful_feedback_count: workspaceHelpfulFeedbackCount,
          needs_work_feedback_count: row.needs_work_feedback_count + needsWorkFeedbackDelta,
          feedback_count: workspaceFeedbackCount,
          feedback_helpful_rate: workspaceHelpfulFeedbackCount / workspaceFeedbackCount,
        }
      }),
      recent_feedback: [
        ...feedbackRows.map((row) => ({
          ...row,
          agent_id: null,
          agent_name: null,
          workspace: 'assistant',
        })),
        ...assistantOutcomeMetrics.recent_feedback,
      ],
      prompt_navigation_summary: {
        total_outcome_count: totalPromptCount,
        accepted_count: acceptedPromptCount,
        dismissed_count: dismissedPromptCount,
        failed_count: failedPromptCount,
        acceptance_rate: totalPromptCount > 0 ? acceptedPromptCount / totalPromptCount : null,
        dismiss_rate: totalPromptCount > 0 ? dismissedPromptCount / totalPromptCount : null,
        failure_rate: totalPromptCount > 0 ? failedPromptCount / totalPromptCount : null,
      },
      by_prompt_target: byPromptTarget,
      recent_prompt_navigation_outcomes: promptNavigationRows.map((row) => ({
        ...row,
        agent_id: null,
        agent_name: null,
        source_workspace: row.run_id === null ? null : 'assistant',
        latest_user_message: row.run_id === null ? null : assistantUserPrompt,
      })),
    }
  }

  function buildAssistantControlTowerSummary() {
    const oldestPendingAction = assistantActionRequestRows
      .filter((requestRow) => requestRow.status === 'PENDING')
      .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))[0]
    const trackedWorkPackages = buildAssistantAgentWorkPackages()
    const implementedPackages = trackedWorkPackages.filter((workPackage) => workPackage.status === 'IMPLEMENTED')

    return {
      generated_at: '2026-04-11T09:10:00Z',
      created_after: null,
      created_before: null,
      roster: {
        total_count: assistantAdminAgents.length,
        active_count: assistantAdminAgents.filter((agent) => agent.status === 'ACTIVE').length,
        draft_count: assistantAdminAgents.filter((agent) => agent.status === 'DRAFT').length,
        paused_count: assistantAdminAgents.filter((agent) => agent.status === 'PAUSED').length,
        retired_count: assistantAdminAgents.filter((agent) => agent.status === 'RETIRED').length,
        action_capable_count: assistantAdminAgents.filter((agent) => agent.capabilities.includes('ACTION')).length,
        missing_eval_coverage_count: 0,
        policy_warning_count: 0,
      },
      runs: {
        total_count: 12,
        completed_count: 11,
        failed_count: 1,
        warning_count: 1,
        tool_call_count: 15,
        latest_run_at: assistantRunRecordedAt,
      },
      actions: {
        total_count: assistantActionRequestRows.length,
        pending_count: assistantActionRequestRows.filter((requestRow) => requestRow.status === 'PENDING').length,
        failed_count: assistantActionRequestRows.filter((requestRow) => requestRow.status === 'FAILED').length,
        rejected_count: assistantActionRequestRows.filter((requestRow) => requestRow.status === 'REJECTED').length,
        executed_count: assistantActionRequestRows.filter((requestRow) => requestRow.status === 'EXECUTED').length,
        preview_blocked_count: 0,
        oldest_pending_action: oldestPendingAction
          ? {
              action_request_id: oldestPendingAction.action_request_id,
              action_type: oldestPendingAction.action_type,
              summary: oldestPendingAction.summary,
              agent_id: oldestPendingAction.agent_id,
              agent_name: oldestPendingAction.agent_name,
              user_id: oldestPendingAction.user_id,
              created_at: oldestPendingAction.created_at,
              age_seconds: 1500,
            }
          : null,
      },
      work_packages: {
        total_count: trackedWorkPackages.length,
        accepted_count: trackedWorkPackages.filter((workPackage) => workPackage.status === 'ACCEPTED').length,
        in_progress_count: trackedWorkPackages.filter((workPackage) => workPackage.status === 'IN_PROGRESS').length,
        implemented_count: implementedPackages.length,
        dismissed_count: trackedWorkPackages.filter((workPackage) => workPackage.status === 'DISMISSED').length,
        stale_count: 0,
        stale_accepted_count: 0,
        stale_in_progress_count: 0,
        implemented_with_pr_count: implementedPackages.filter((workPackage) => Boolean(workPackage.implementation_evidence.pr_url)).length,
        implemented_with_commit_count: implementedPackages.filter((workPackage) => Boolean(workPackage.implementation_evidence.commit_sha)).length,
        implemented_with_eval_count: implementedPackages.filter((workPackage) => workPackage.implementation_evidence.eval_ids.length > 0).length,
        implemented_with_tests_count: implementedPackages.filter((workPackage) => workPackage.implementation_evidence.test_names.length > 0).length,
        implemented_with_docs_count: implementedPackages.filter((workPackage) => workPackage.implementation_evidence.doc_paths.length > 0).length,
        implemented_missing_evidence_count: implementedPackages.filter(
          (workPackage) =>
            !workPackage.implementation_evidence.pr_url &&
            !workPackage.implementation_evidence.commit_sha &&
            workPackage.implementation_evidence.eval_ids.length === 0 &&
            workPackage.implementation_evidence.test_names.length === 0 &&
            workPackage.implementation_evidence.doc_paths.length === 0,
        ).length,
      },
      trust_signals: oldestPendingAction
        ? [
            {
              agent_id: oldestPendingAction.agent_id ?? 'ops-governor',
              agent_name: oldestPendingAction.agent_name ?? 'Ops Governor',
              status: 'ACTIVE',
              role_key: 'trade-ops-copilot',
              profile_kind: 'ROLE_DERIVED',
              signal_type: 'ACTION_BACKLOG',
              severity: 'warning',
              summary: 'One staged action is waiting for human review.',
              details: ['Approve or reject the oldest pending action before considering broader autonomy.'],
              pending_action_count: 1,
              failed_action_count: 0,
              warning_run_count: 1,
              eval_status: 'PASS',
            },
          ]
        : [],
    }
  }

  function buildAssistantAgentWorkPackages() {
    return [
      {
        id: 1,
        work_package_id: 'wp-smoke-eval-coverage',
        title: 'Add assistant approval eval coverage',
        package_type: 'EVAL',
        priority: 'P2',
        status: 'ACCEPTED',
        source_agent_ids: ['ops-governor'],
        source_agent_names: ['Ops Governor'],
        source_recommendations: ['KEEP_STAGED'],
        source_candidates: ['Approval inbox smoke coverage'],
        recommended_owner_role: 'Platform Owner',
        rationale: 'Keep approval-gated action behavior covered by deterministic smoke and eval checks.',
        acceptance_checks: ['Run browser smoke for the approval inbox.', 'Run assistant evals before promotion.'],
        knowledge_base_titles: ['Prompt Navigation Is A UI Intent'],
        implementation_evidence: {
          eval_ids: [],
          test_names: [],
          doc_paths: [],
        },
        accepted_at: '2026-04-11T09:00:00Z',
        accepted_by: 'ops_admin',
        implemented_at: null,
        implemented_by: null,
        notes: 'Smoke fixture backlog item.',
        created_at: '2026-04-11T08:55:00Z',
        created_by: 'ops_admin',
        updated_at: '2026-04-11T09:00:00Z',
        updated_by: 'ops_admin',
      },
    ]
  }

  const server = createHttpServer(async (request, response) => {
    const method = request.method ?? 'GET'
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const record: RecordedRequest = {
      method,
      path: url.pathname,
      search: url.search,
    }

    if (
      method !== 'GET' &&
      !(method === 'POST' && url.pathname === '/auth/heartbeat') &&
      !(method === 'POST' && url.pathname === '/auth/logout') &&
      !(method === 'POST' && url.pathname === '/auth/session') &&
      !(method === 'POST' && url.pathname === '/auth/single-user-session') &&
      !(method === 'POST' && url.pathname === '/assistant/respond') &&
      !(method === 'POST' && url.pathname === '/assistant/prompt-navigation-outcomes') &&
      !(method === 'POST' && /\/assistant\/runs\/\d+\/prompt-navigation-outcomes$/.test(url.pathname)) &&
      !(method === 'PUT' && url.pathname.startsWith('/layout-definitions/'))
    ) {
      mutationRequests.push(record)
    }

    if (url.pathname === '/health' && method === 'GET') {
      writeJson(response, { status: 'ok' })
      return
    }

    if (url.pathname === '/settings/public' && method === 'GET') {
      writeJson(response, runtimeSettings)
      return
    }

    if (url.pathname === '/auth/session' && method === 'POST') {
      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))

      const sessionRequest = payload as {
        identifier?: unknown
        password?: unknown
      }

      assert.equal(typeof sessionRequest.identifier, 'string')
      assert.equal(typeof sessionRequest.password, 'string')
      sessionExpired = false

      writeJson(response, {
        session_id: smokeSession.sessionId,
        access_token: smokeSession.accessToken,
        expires_at: smokeSession.expiresAt,
        show_start_here: smokeSession.showStartHere,
        user: smokeSession.user,
      })
      return
    }

    if (url.pathname === '/auth/single-user-session' && method === 'POST') {
      sessionExpired = false

      writeJson(response, {
        session_id: smokeSession.sessionId,
        access_token: smokeSession.accessToken,
        expires_at: smokeSession.expiresAt,
        show_start_here: smokeSession.showStartHere,
        user: smokeSession.user,
      })
      return
    }

    if (url.pathname === '/auth/me' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, {
        session_id: smokeSession.sessionId,
        expires_at: smokeSession.expiresAt,
        user: smokeSession.user,
      })
      return
    }

    if (url.pathname === '/auth/heartbeat' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeNoContent(response)
      return
    }

    if (url.pathname === '/auth/logout' && method === 'POST') {
      sessionExpired = true
      writeNoContent(response)
      return
    }

    if (url.pathname === '/assistant/settings' && method === 'GET') {
      writeJson(response, assistantRuntimeSettings)
      return
    }

    if (url.pathname === '/assistant/agents' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/assistant/conversations' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [buildAssistantConversationSummary()])
      return
    }

    const assistantConversationMatch = url.pathname.match(/^\/assistant\/conversations\/(\d+)$/)
    if (assistantConversationMatch && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      const conversationId = Number(assistantConversationMatch[1])
      if (conversationId !== assistantConversationId) {
        writeJson(response, { detail: 'Assistant conversation not found.' }, 404)
        return
      }

      writeJson(response, buildAssistantConversation())
      return
    }

    if (url.pathname === '/assistant/runs' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [buildAssistantRunSummary()])
      return
    }

    if (url.pathname === '/assistant/prompt-route-recommendations' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, assistantPromptRouteRecommendations)
      return
    }

    const assistantRunMatch = url.pathname.match(/^\/assistant\/runs\/(\d+)$/)
    if (assistantRunMatch && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const runId = Number(assistantRunMatch[1])
      if (runId !== assistantRunId) {
        writeJson(response, { detail: 'Assistant run not found.' }, 404)
        return
      }

      writeJson(response, buildAssistantRun())
      return
    }

    const assistantRunFeedbackMatch = url.pathname.match(/^\/assistant\/runs\/(\d+)\/feedback$/)
    if (assistantRunFeedbackMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const runId = Number(assistantRunFeedbackMatch[1])
      if (runId !== assistantRunId) {
        writeJson(response, { detail: 'Assistant run not found.' }, 404)
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))

      const feedbackPayload = payload as {
        rating?: unknown
        comment?: unknown
      }
      if (feedbackPayload.rating !== 'HELPFUL' && feedbackPayload.rating !== 'NEEDS_WORK') {
        writeJson(response, { detail: 'Unsupported feedback rating.' }, 422)
        return
      }

      const previousFeedback = assistantRunFeedbackByRunId.get(runId)
      const feedback: SmokeAssistantFeedbackRow = {
        feedback_id: previousFeedback?.feedback_id ?? 990,
        run_id: runId,
        conversation_id: assistantConversationId,
        user_id: smokeSession.user.user_id,
        user_role: smokeSession.user.role,
        rating: feedbackPayload.rating,
        comment: normalizeOptionalText(feedbackPayload.comment),
        created_at: previousFeedback?.created_at ?? '2026-04-11T09:12:00Z',
        updated_at: '2026-04-11T09:12:00Z',
      }

      assistantRunFeedbackByRunId.set(runId, feedback)
      writeJson(response, feedback)
      return
    }

    const assistantPromptNavigationOutcomeMatch = url.pathname.match(
      /^\/assistant\/runs\/(\d+)\/prompt-navigation-outcomes$/,
    )
    if (assistantPromptNavigationOutcomeMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      promptNavigationOutcomeRequests.push(record)

      const runId = Number(assistantPromptNavigationOutcomeMatch[1])
      if (runId !== assistantRunId) {
        writeJson(response, { detail: 'Assistant run not found.' }, 404)
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))

      const outcomePayload = payload as {
        outcome?: unknown
        intent_key?: unknown
        target_view?: unknown
        target_label?: unknown
        target_rationale?: unknown
        focus_type?: unknown
        focus_id?: unknown
        focus_label?: unknown
        detail?: unknown
      }
      if (
        outcomePayload.outcome !== 'ACCEPTED' &&
        outcomePayload.outcome !== 'DISMISSED' &&
        outcomePayload.outcome !== 'FAILED'
      ) {
        writeJson(response, { detail: 'Unsupported prompt navigation outcome.' }, 422)
        return
      }

      const intentKey = normalizeOptionalText(outcomePayload.intent_key)
      if (!intentKey) {
        writeJson(response, { detail: 'Prompt navigation intent key is required.' }, 422)
        return
      }

      const outcomeMapKey = `${runId}:${outcomePayload.outcome}:${intentKey}`
      const previousOutcome = assistantPromptNavigationOutcomeRows.get(outcomeMapKey)
      const outcome: SmokeAssistantPromptNavigationOutcomeRow = {
        outcome_id: previousOutcome?.outcome_id ?? 1200 + assistantPromptNavigationOutcomeRows.size + 1,
        run_id: runId,
        conversation_id: assistantConversationId,
        user_id: smokeSession.user.user_id,
        user_role: smokeSession.user.role,
        surface: 'PROMPT_HOME',
        outcome: outcomePayload.outcome,
        intent_key: intentKey,
        target_view: normalizeOptionalText(outcomePayload.target_view),
        target_label: normalizeOptionalText(outcomePayload.target_label),
        target_rationale: normalizeOptionalText(outcomePayload.target_rationale),
        focus_type: normalizeOptionalText(outcomePayload.focus_type),
        focus_id: normalizeOptionalText(outcomePayload.focus_id),
        focus_label: normalizeOptionalText(outcomePayload.focus_label),
        detail: normalizeOptionalText(outcomePayload.detail),
        created_at: previousOutcome?.created_at ?? '2026-04-11T09:12:00Z',
        updated_at: '2026-04-11T09:12:00Z',
      }

      assistantPromptNavigationOutcomeRows.set(outcomeMapKey, outcome)
      writeJson(response, outcome)
      return
    }

    if (url.pathname === '/assistant/prompt-navigation-outcomes' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      promptNavigationOutcomeRequests.push(record)

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))

      const outcomePayload = payload as {
        outcome?: unknown
        intent_key?: unknown
        target_view?: unknown
        target_label?: unknown
        target_rationale?: unknown
        focus_type?: unknown
        focus_id?: unknown
        focus_label?: unknown
        detail?: unknown
      }
      if (
        outcomePayload.outcome !== 'ACCEPTED' &&
        outcomePayload.outcome !== 'DISMISSED' &&
        outcomePayload.outcome !== 'FAILED'
      ) {
        writeJson(response, { detail: 'Unsupported prompt navigation outcome.' }, 422)
        return
      }

      const intentKey = normalizeOptionalText(outcomePayload.intent_key)
      if (!intentKey) {
        writeJson(response, { detail: 'Prompt navigation intent key is required.' }, 422)
        return
      }

      const outcome: SmokeAssistantPromptNavigationOutcomeRow = {
        outcome_id: 1200 + assistantPromptNavigationOutcomeRows.size + 1,
        run_id: null,
        conversation_id: null,
        user_id: smokeSession.user.user_id,
        user_role: smokeSession.user.role,
        surface: 'PROMPT_HOME',
        outcome: outcomePayload.outcome,
        intent_key: intentKey,
        target_view: normalizeOptionalText(outcomePayload.target_view),
        target_label: normalizeOptionalText(outcomePayload.target_label),
        target_rationale: normalizeOptionalText(outcomePayload.target_rationale),
        focus_type: normalizeOptionalText(outcomePayload.focus_type),
        focus_id: normalizeOptionalText(outcomePayload.focus_id),
        focus_label: normalizeOptionalText(outcomePayload.focus_label),
        detail: normalizeOptionalText(outcomePayload.detail),
        created_at: '2026-04-11T09:12:00Z',
        updated_at: '2026-04-11T09:12:00Z',
      }

      assistantPromptNavigationOutcomeRows.set(`standalone:${outcome.outcome_id}`, outcome)
      writeJson(response, outcome)
      return
    }

    if (url.pathname === '/assistant/context' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))

      writeJson(response, {
        agent_id: null,
        agent_name: null,
        agent_role_key: null,
        agent_profile_kind: null,
        provider: 'openai',
        model: 'gpt-5.4',
        generated_at: assistantRunRecordedAt,
        warnings: [],
        sections: [
          {
            key: 'workspace',
            title: 'Workspace',
            source: 'workspace',
            content: 'Assistant workspace smoke context.',
          },
        ],
        rendered_system_prompt: 'Answer with grounded operational context and stage reviewable actions only.',
      })
      return
    }

    if (url.pathname === '/assistant/respond' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))
      const prompt = latestUserPromptFromPayload(payload)
      const responseContent = buildAssistantResponseContentForPrompt(prompt)

      writeJson(response, {
        ...buildAssistantResponseMetadata(prompt),
        message: {
          role: 'assistant',
          content: responseContent,
        },
      })
      return
    }

    if (url.pathname === '/assistant/respond/stream' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }
      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))
      const prompt = latestUserPromptFromPayload(payload)
      const responseContent = buildAssistantResponseContentForPrompt(prompt)

      const metadata = buildAssistantResponseMetadata(prompt)
      writeSse(response, [
        {
          event: 'conversation',
          data: {
            conversation_id: assistantConversationId,
            updated_at: assistantRunRecordedAt,
          },
        },
        {
          event: 'assistant.metadata',
          data: metadata,
        },
        {
          event: 'assistant.delta',
          data: {
            delta: responseContent,
          },
        },
        {
          event: 'assistant.complete',
          data: metadata,
        },
      ])
      return
    }

    if (url.pathname === '/assistant/action-requests' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const requestedStatus = normalizeOptionalText(url.searchParams.get('status'))
      const limitParam = Number(url.searchParams.get('limit') ?? '')
      const offsetParam = Number(url.searchParams.get('offset') ?? '')
      const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : assistantActionRequestRows.length

      let filteredRequests = assistantActionRequestRows
      if (requestedStatus) {
        filteredRequests = filteredRequests.filter((requestRow) => requestRow.status === requestedStatus)
      }

      writeJson(
        response,
        filteredRequests.slice(offset, offset + limit).map(cloneAssistantActionRequest),
      )
      return
    }

    if (url.pathname === '/admin/assistant/agents' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(
        response,
        assistantAdminAgents.map((agent) => ({
          ...agent,
          allowed_workspaces: [...agent.allowed_workspaces],
          capabilities: [...agent.capabilities],
          allowed_tools: [...agent.allowed_tools],
          allowed_action_types: [...agent.allowed_action_types],
        })),
      )
      return
    }

    if (url.pathname === '/admin/assistant/role-archetypes' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(
        response,
        assistantRoleArchetypes.map((role) => ({
          ...role,
          mission: [...role.mission],
          allowed_workspaces: [...role.allowed_workspaces],
          work_objects: [...role.work_objects],
          capability_ceiling: [...role.capability_ceiling],
          default_tools: [...role.default_tools],
          maximum_action_types: [...role.maximum_action_types],
          approval_rules: [...role.approval_rules],
          stop_conditions: [...role.stop_conditions],
          success_metrics: [...role.success_metrics],
          required_eval_coverage: [...role.required_eval_coverage],
          base_prompt_guidance: [...role.base_prompt_guidance],
          current_profile_ids: [...role.current_profile_ids],
        })),
      )
      return
    }

    if (url.pathname === '/admin/assistant/profile-requests' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [])
      return
    }

    if (url.pathname === '/admin/assistant/agent-evals' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [])
      return
    }

    if (url.pathname === '/admin/assistant/control-tower/summary' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, buildAssistantControlTowerSummary())
      return
    }

    if (url.pathname === '/admin/assistant/agent-work-packages' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, buildAssistantAgentWorkPackages())
      return
    }

    const assistantAuditTraceMatch = url.pathname.match(/^\/admin\/assistant\/runs\/(\d+)\/audit-trace$/)
    if (assistantAuditTraceMatch && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const runId = Number(assistantAuditTraceMatch[1])
      const traceActionRequests = assistantActionRequestRows.filter((requestRow) => requestRow.run_id === runId)
      if (traceActionRequests.length === 0) {
        writeJson(response, { detail: 'Assistant run not found' }, 404)
        return
      }

      const primaryRequest = traceActionRequests[0]
      const mutationEvents = traceActionRequests.flatMap((requestRow) => {
        const eventId =
          requestRow.result && typeof requestRow.result.event_id === 'string' ? requestRow.result.event_id : null
        return eventId
          ? [
              {
                event_id: eventId,
                aggregate_type: 'trade',
                aggregate_id:
                  typeof requestRow.result?.trade_id === 'string' ? requestRow.result.trade_id : 'T-AMEND-100',
                event_type: 'TradeCancelled',
                occurred_at: requestRow.decided_at ?? '2026-04-11T09:05:00Z',
                recorded_at: requestRow.decided_at ?? '2026-04-11T09:05:00Z',
                actor_id: requestRow.decided_by,
                correlation_id: `assistant-action-${requestRow.action_request_id}`,
                causation_id: `assistant-action-request:${requestRow.action_request_id}`,
                payload: {
                  assistant_action_request_id: requestRow.action_request_id,
                  assistant_run_id: requestRow.run_id,
                  status: 'CANCELLED',
                },
              },
            ]
          : []
      })
      const actionTraces = traceActionRequests.map((requestRow) => ({
        action_request: requestRow,
        mutation_events: mutationEvents.filter(
          (event) => event.causation_id === `assistant-action-request:${requestRow.action_request_id}`,
        ),
      }))
      const timeline = [
        {
          entry_type: 'run_started',
          occurred_at: primaryRequest.created_at,
          title: 'Run started',
          summary: 'Cancel the selected trade.',
          status: 'COMPLETED',
          metadata: {
            run_id: runId,
            agent_id: primaryRequest.agent_id,
            workspace: primaryRequest.workspace,
          },
        },
        {
          entry_type: 'action_requested',
          occurred_at: primaryRequest.created_at,
          title: primaryRequest.summary,
          summary: primaryRequest.description,
          status: primaryRequest.status,
          metadata: {
            action_request_id: primaryRequest.action_request_id,
            action_type: primaryRequest.action_type,
            payload: primaryRequest.payload,
          },
        },
        {
          entry_type: 'tool_call',
          occurred_at: primaryRequest.created_at,
          title: 'Tool call: get_trade_by_id',
          summary: 'Loaded trade T-AMEND-100 for governance review.',
          status: null,
          metadata: {
            tool_name: 'get_trade_by_id',
            arguments: { trade_id: 'T-AMEND-100' },
            record_count: 1,
          },
        },
        ...traceActionRequests
          .filter((requestRow) => requestRow.decided_at !== null)
          .map((requestRow) => ({
            entry_type: 'decision',
            occurred_at: requestRow.decided_at,
            title: `Decision: ${requestRow.status}`,
            summary: `${requestRow.decided_by ?? 'ops_admin'} decided action request #${requestRow.action_request_id}.`,
            status: requestRow.status,
            metadata: {
              action_request_id: requestRow.action_request_id,
              result: requestRow.result ?? {},
            },
          })),
        ...mutationEvents.map((event) => ({
          entry_type: 'mutation',
          occurred_at: event.occurred_at,
          title: `Mutation event: ${event.event_type}`,
          summary: `${event.aggregate_type} ${event.aggregate_id}`,
          status: null,
          metadata: {
            event_id: event.event_id,
            payload: event.payload,
          },
        })),
        {
          entry_type: 'run_completed',
          occurred_at: primaryRequest.created_at,
          title: 'Run completed',
          summary: 'Assistant run completed.',
          status: 'COMPLETED',
          metadata: {
            action_request_count: traceActionRequests.length,
            tool_call_count: 1,
          },
        },
      ]

      writeJson(response, {
        run: {
          conversation_id: 601,
          run_id: runId,
          status: 'COMPLETED',
          created_at: primaryRequest.created_at,
          completed_at: primaryRequest.created_at,
          user_id: primaryRequest.user_id,
          user_role: 'TRADER',
          workspace: primaryRequest.workspace,
          agent_id: primaryRequest.agent_id,
          agent_name: primaryRequest.agent_name,
          provider: 'openai',
          model: 'gpt-5.4',
          use_live_tools: true,
          warning_count: 0,
          tool_call_count: 1,
          input_tokens: 120,
          output_tokens: 60,
          latest_user_message: 'Cancel the selected trade.',
          assistant_message: primaryRequest.description,
          error_detail: null,
          request_messages: [{ role: 'user', content: 'Cancel the selected trade.' }],
          application_context: 'Selected trade T-AMEND-100.',
          prompt_sections: [],
          rendered_system_prompt: 'Escalate cross-user trade actions into an approval inbox before execution.',
          warnings: [],
          tool_calls: [
            {
              tool_name: 'get_trade_by_id',
              summary: 'Loaded trade T-AMEND-100 for governance review.',
              arguments: { trade_id: 'T-AMEND-100' },
              record_count: 1,
            },
          ],
        },
        action_requests: actionTraces,
        timeline,
        mutation_event_count: mutationEvents.length,
      })
      return
    }

    if (url.pathname === '/admin/assistant/action-requests' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const status = url.searchParams.get('status')?.trim().toUpperCase() ?? ''
      const actionType = url.searchParams.get('action_type')?.trim() ?? ''
      const agentId = url.searchParams.get('agent_id')?.trim().toLowerCase() ?? ''
      const userId = url.searchParams.get('user_id')?.trim() ?? ''
      const decidedBy = url.searchParams.get('decided_by')?.trim() ?? ''
      const search = url.searchParams.get('search')?.trim().toLowerCase() ?? ''
      const createdAfter = Date.parse(url.searchParams.get('created_after') ?? '')
      const createdBefore = Date.parse(url.searchParams.get('created_before') ?? '')
      const decidedAfter = Date.parse(url.searchParams.get('decided_after') ?? '')
      const decidedBefore = Date.parse(url.searchParams.get('decided_before') ?? '')
      const limit = Number(url.searchParams.get('limit') ?? '')
      const offset = Number(url.searchParams.get('offset') ?? '')

      let filteredRequests = assistantActionRequestRows
      if (status) {
        filteredRequests = filteredRequests.filter((requestRow) => requestRow.status === status)
      }
      if (actionType) {
        filteredRequests = filteredRequests.filter((requestRow) => requestRow.action_type === actionType)
      }
      if (agentId) {
        filteredRequests = filteredRequests.filter((requestRow) => requestRow.agent_id?.toLowerCase() === agentId)
      }
      if (userId) {
        filteredRequests = filteredRequests.filter((requestRow) => requestRow.user_id === userId)
      }
      if (decidedBy) {
        filteredRequests = filteredRequests.filter((requestRow) => requestRow.decided_by === decidedBy)
      }
      if (Number.isFinite(createdAfter)) {
        filteredRequests = filteredRequests.filter(
          (requestRow) => Date.parse(requestRow.created_at) >= createdAfter,
        )
      }
      if (Number.isFinite(createdBefore)) {
        filteredRequests = filteredRequests.filter(
          (requestRow) => Date.parse(requestRow.created_at) <= createdBefore,
        )
      }
      if (Number.isFinite(decidedAfter)) {
        filteredRequests = filteredRequests.filter(
          (requestRow) => requestRow.decided_at !== null && Date.parse(requestRow.decided_at) >= decidedAfter,
        )
      }
      if (Number.isFinite(decidedBefore)) {
        filteredRequests = filteredRequests.filter(
          (requestRow) => requestRow.decided_at !== null && Date.parse(requestRow.decided_at) <= decidedBefore,
        )
      }
      if (search) {
        filteredRequests = filteredRequests.filter((requestRow) =>
          [
            requestRow.summary,
            requestRow.description,
            requestRow.user_id,
            requestRow.agent_id,
            requestRow.agent_name,
            requestRow.decided_by,
            requestRow.action_type,
          ].some((value) => String(value ?? '').toLowerCase().includes(search)),
        )
      }

      const normalizedOffset = Number.isFinite(offset) && offset > 0 ? Math.trunc(offset) : 0
      const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : null
      const pagedRequests =
        normalizedLimit === null
          ? filteredRequests.slice(normalizedOffset)
          : filteredRequests.slice(normalizedOffset, normalizedOffset + normalizedLimit)

      const decidedRequests = filteredRequests.filter((requestRow) => requestRow.decided_at !== null)
      const totalDecisionSeconds = decidedRequests.reduce((total, requestRow) => {
        const createdAt = Date.parse(requestRow.created_at)
        const decidedAt = Date.parse(requestRow.decided_at ?? '')
        return Number.isFinite(createdAt) && Number.isFinite(decidedAt)
          ? total + Math.max((decidedAt - createdAt) / 1000, 0)
          : total
      }, 0)
      const summary = {
        total_count: filteredRequests.length,
        pending_count: filteredRequests.filter((requestRow) => requestRow.status === 'PENDING').length,
        executed_count: filteredRequests.filter((requestRow) => requestRow.status === 'EXECUTED').length,
        rejected_count: filteredRequests.filter((requestRow) => requestRow.status === 'REJECTED').length,
        failed_count: filteredRequests.filter((requestRow) => requestRow.status === 'FAILED').length,
        correction_count: filteredRequests.filter(
          (requestRow) => requestRow.review_outcome === 'APPROVED_WITH_CORRECTIONS',
        ).length,
        avg_decision_seconds:
          decidedRequests.length > 0 ? totalDecisionSeconds / decidedRequests.length : null,
      }

      writeJson(response, {
        items: pagedRequests,
        total_count: filteredRequests.length,
        limit: normalizedLimit ?? filteredRequests.length,
        offset: normalizedOffset,
        has_more: normalizedOffset + pagedRequests.length < filteredRequests.length,
        summary,
      })
      return
    }

    if (url.pathname === '/admin/assistant/outcome-metrics' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, buildAssistantOutcomeMetrics())
      return
    }

    if (url.pathname === '/users' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, userAccounts)
      return
    }

    if (url.pathname === '/admin/roadmap' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, adminRoadmapDocument)
      return
    }

    if (url.pathname === '/admin/data/projection-monitoring' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, projectionMonitoringAdminRecord)
      return
    }

    if (url.pathname === '/admin/data/assistant-agents/seed' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      const requestedBy =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? normalizeOptionalText((payload as Record<string, unknown>).requested_by) ?? smokeSession.user.user_id
          : smokeSession.user.user_id
      const seededAgentIds = assistantRoleArchetypes.flatMap((role) => role.current_profile_ids)
      writeJson(response, {
        requested_by: requestedBy,
        total_profiles: seededAgentIds.length,
        total_templates: seededAgentIds.length,
        created_count: 0,
        updated_count: seededAgentIds.length,
        agent_ids: seededAgentIds,
      })
      return
    }

    if (url.pathname === '/admin/codex/settings' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, codexTaskSettings)
      return
    }

    if (url.pathname === '/admin/codex/tasks' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [...codexTasks])
      return
    }

    if (url.pathname === '/admin/external-data/runs' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [])
      return
    }

    if (url.pathname === '/admin/external-data/status' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, null)
      return
    }

    if (url.pathname === '/admin/trading-sources' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [])
      return
    }

    if (url.pathname === '/admin/weather/locations' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, weatherLocations)
      return
    }

    if (url.pathname === '/admin/weather/sync/status' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, weatherSyncStatus)
      return
    }

    if (url.pathname === '/weather/locations' && method === 'GET') {
      writeJson(response, weatherLocations)
      return
    }

    if (url.pathname === '/weather/sync/status' && method === 'GET') {
      writeJson(response, weatherSyncStatus)
      return
    }

    const weatherForecastMatch = url.pathname.match(/^\/weather\/locations\/([^/]+)\/forecast-periods$/)
    if (weatherForecastMatch && method === 'GET') {
      const locationCode = decodeURIComponent(weatherForecastMatch[1] ?? '').toUpperCase()
      writeJson(response, weatherForecastPeriodsByCode[locationCode as keyof typeof weatherForecastPeriodsByCode] ?? [])
      return
    }

    const weatherObservationMatch = url.pathname.match(/^\/weather\/locations\/([^/]+)\/observations$/)
    if (weatherObservationMatch && method === 'GET') {
      const locationCode = decodeURIComponent(weatherObservationMatch[1] ?? '').toUpperCase()
      writeJson(response, weatherObservationsByCode[locationCode as keyof typeof weatherObservationsByCode] ?? [])
      return
    }

    const approveActionRequestMatch = url.pathname.match(/^\/assistant\/action-requests\/(\d+)\/approve$/)
    if (approveActionRequestMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const actionRequestId = Number(approveActionRequestMatch[1])
      const actionRequestIndex = assistantActionRequestRows.findIndex(
        (requestRow) => requestRow.action_request_id === actionRequestId,
      )

      if (actionRequestIndex < 0) {
        writeJson(response, { detail: 'Assistant action request not found.' }, 404)
        return
      }

      const currentRequest = assistantActionRequestRows[actionRequestIndex]
      if (currentRequest.status !== 'PENDING') {
        writeJson(response, { detail: 'Only pending assistant action requests can be approved.' }, 409)
        return
      }

      const decisionPayload = await readJsonBody(request)
      const decisionRecord =
        decisionPayload && typeof decisionPayload === 'object' && !Array.isArray(decisionPayload)
          ? (decisionPayload as Record<string, unknown>)
          : {}
      const reviewOutcome =
        decisionRecord.review_outcome === 'APPROVED_WITH_CORRECTIONS'
          ? 'APPROVED_WITH_CORRECTIONS'
          : 'APPROVED_AS_IS'
      const correctionFields = normalizedCorrectionFields(decisionRecord.correction_fields)
      const tradeId =
        typeof currentRequest.payload.trade_id === 'string' && currentRequest.payload.trade_id.trim()
          ? currentRequest.payload.trade_id.trim()
          : 'T-AMEND-100'
      const eventId = `evt-assistant-cancel-${actionRequestId}`
      const tradeIndex = tradeRows.findIndex((trade) => trade.trade_id === tradeId)
      if (tradeIndex >= 0) {
        tradeRows[tradeIndex] = {
          ...tradeRows[tradeIndex],
          status: 'CANCELLED',
          updated_at: '2026-04-11T09:05:00Z',
          last_event_id: eventId,
        } as SmokeTradeRow
      }
      const updatedRequest = {
        ...currentRequest,
        status: 'EXECUTED',
        lifecycle: {
          ...currentRequest.lifecycle,
          stage: 'EXECUTED',
          label: 'Executed',
          tone: 'success',
          is_terminal: true,
          can_approve: false,
          can_reject: false,
          reviewer_action_label: null,
          decided_label: `Executed by ${smokeSession.user.user_id}`,
        },
        result: {
          event_id: eventId,
          trade_id: tradeId,
          trade_status: 'CANCELLED',
        },
        decided_at: '2026-04-11T09:05:00Z',
        decided_by: smokeSession.user.user_id,
        review_outcome: reviewOutcome,
        decision_note: normalizedReviewText(decisionRecord.decision_note),
        correction_summary:
          reviewOutcome === 'APPROVED_WITH_CORRECTIONS'
            ? normalizedReviewText(decisionRecord.correction_summary)
            : null,
        correction_fields: reviewOutcome === 'APPROVED_WITH_CORRECTIONS' ? correctionFields : [],
      } satisfies SmokeAssistantActionRequestRow

      assistantActionRequestRows[actionRequestIndex] = updatedRequest
      writeJson(response, updatedRequest)
      return
    }

    const rejectActionRequestMatch = url.pathname.match(/^\/assistant\/action-requests\/(\d+)\/reject$/)
    if (rejectActionRequestMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const actionRequestId = Number(rejectActionRequestMatch[1])
      const actionRequestIndex = assistantActionRequestRows.findIndex(
        (requestRow) => requestRow.action_request_id === actionRequestId,
      )

      if (actionRequestIndex < 0) {
        writeJson(response, { detail: 'Assistant action request not found.' }, 404)
        return
      }

      const currentRequest = assistantActionRequestRows[actionRequestIndex]
      if (currentRequest.status !== 'PENDING') {
        writeJson(response, { detail: 'Only pending assistant action requests can be rejected.' }, 409)
        return
      }

      const decisionPayload = await readJsonBody(request)
      const decisionRecord =
        decisionPayload && typeof decisionPayload === 'object' && !Array.isArray(decisionPayload)
          ? (decisionPayload as Record<string, unknown>)
          : {}
      const updatedRequest = {
        ...currentRequest,
        status: 'REJECTED',
        lifecycle: {
          ...currentRequest.lifecycle,
          stage: 'REJECTED',
          label: 'Rejected',
          tone: 'neutral',
          is_terminal: true,
          can_approve: false,
          can_reject: false,
          reviewer_action_label: null,
          decided_label: `Rejected by ${smokeSession.user.user_id}`,
        },
        result: null,
        decided_at: '2026-04-11T09:05:00Z',
        decided_by: smokeSession.user.user_id,
        review_outcome: 'REJECTED',
        decision_note: normalizedReviewText(decisionRecord.decision_note),
        correction_summary: null,
        correction_fields: [],
      } satisfies SmokeAssistantActionRequestRow

      assistantActionRequestRows[actionRequestIndex] = updatedRequest
      writeJson(response, updatedRequest)
      return
    }

    if (url.pathname === '/operations/system-overview' && method === 'GET') {
      writeJson(response, {
        generated_at: '2026-04-11T09:05:00Z',
        server_status: 'ok',
        database_status: 'ok',
        database: {
          dialect: 'sqlite',
          name: 'smoke.db',
          size_bytes: 1024,
          table_count: 12,
          record_count: 42,
        },
        uptime_seconds: 172800,
        presence_window_seconds: 3600,
        active_session_count: 1,
        active_user_count: 1,
        registered_user_count: 2,
        active_account_count: 2,
        open_trade_count: tradeRows.length,
        events_last_hour: 2,
        last_event_recorded_at: '2026-04-11T09:00:00Z',
        dependency_count: 1,
        healthy_dependency_count: 1,
        dependencies: [
          {
            key: 'assistant-provider-openai',
            label: 'OpenAI Provider',
            provider: 'OPENAI',
            run_status: 'IDLE',
            health_status: 'healthy',
            success_sla_hours: 24,
            last_run_at: '2026-04-11T08:50:00Z',
            last_success_at: '2026-04-11T08:50:00Z',
            error_summary: null,
          },
        ],
      })
      return
    }

    if (url.pathname === '/operations/workspace-summary' && method === 'GET') {
      writeJson(response, buildWorkspaceSummary(tradeRows))
      return
    }

    if (url.pathname === '/documents/settings' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, {
        enabled: true,
        default_provider: 'openai',
        effective_default_provider: 'openai',
        configured_provider_count: 1,
        default_daily_token_allocation: 100000,
        providers: [
          {
            provider: 'openai',
            label: 'OpenAI',
            enabled: true,
            configured: true,
            is_default: true,
            default_model: 'gpt-5.4-mini',
            base_url: 'https://api.openai.com/v1',
            setup_env_var: 'OPENAI_API_KEY',
          },
        ],
      })
      return
    }

    if (url.pathname === '/documents/schema-registry' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, {
        version: 'smoke-1',
        document_kinds: [],
      })
      return
    }

    if (url.pathname === '/documents' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, [])
      return
    }

    if (url.pathname === '/wiki/pages' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, {
        pages: sortWikiPages(wikiPageRows).map((page) => serializeWikiPageSummary(wikiPageRows, page)),
      })
      return
    }

    if (url.pathname === '/wiki/pages' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        writeJson(response, { detail: 'Invalid wiki page payload.' }, 422)
        return
      }

      const pageRecord = payload as Record<string, unknown>
      const title = normalizeOptionalText(pageRecord.title)
      if (!title) {
        writeJson(response, { detail: 'title is required.' }, 422)
        return
      }

      const parentPageId =
        pageRecord.parent_page_id === undefined || pageRecord.parent_page_id === null
          ? null
          : normalizeOptionalText(pageRecord.parent_page_id)
      const parentValidationError = validateWikiParentPage(wikiPageRows, null, parentPageId)
      if (parentValidationError) {
        writeJson(
          response,
          { detail: parentValidationError },
          parentValidationError.includes('not found') ? 404 : 422,
        )
        return
      }

      const contentMarkdown =
        typeof pageRecord.content_markdown === 'string'
          ? pageRecord.content_markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          : ''
      const sortOrder =
        typeof pageRecord.sort_order === 'number' && Number.isFinite(pageRecord.sort_order)
          ? Math.trunc(pageRecord.sort_order)
          : nextWikiSortOrder(wikiPageRows, parentPageId)

      wikiMutationSequence += 1
      const timestamp = nextWikiTimestamp(wikiMutationSequence)
      const createdPage = {
        page_id: `wiki-page-${String(nextWikiPageSequence).padStart(4, '0')}`,
        parent_page_id: parentPageId,
        title,
        content_markdown: contentMarkdown,
        sort_order: sortOrder,
        created_at: timestamp,
        created_by: smokeSession.user.user_id,
        updated_at: timestamp,
        updated_by: smokeSession.user.user_id,
        version: 1,
      } satisfies SmokeWikiPageRow
      nextWikiPageSequence += 1
      wikiPageRows.push(createdPage)
      recordWikiRevision({
        revisionsByPageId: wikiPageRevisionsByPageId,
        nextRevisionId: nextWikiRevisionId,
        page: createdPage,
        createdAt: timestamp,
        createdBy: smokeSession.user.user_id,
        changeSummary: ['Created wiki page.'],
      })
      nextWikiRevisionId += 1

      writeJson(response, serializeWikiPageDetail(wikiPageRows, wikiPageRevisionsByPageId, createdPage), 201)
      return
    }

    const wikiPageRestoreMatch = url.pathname.match(/^\/wiki\/pages\/([^/]+)\/revisions\/(\d+)\/restore$/)
    if (wikiPageRestoreMatch && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const pageId = decodeURIComponent(wikiPageRestoreMatch[1] ?? '')
      const revisionId = Number(wikiPageRestoreMatch[2])
      const page = wikiPageRows.find((entry) => entry.page_id === pageId)
      if (!page) {
        writeJson(response, { detail: `Wiki page '${pageId}' was not found` }, 404)
        return
      }

      const revision = (wikiPageRevisionsByPageId.get(pageId) ?? []).find(
        (entry) => entry.revision_id === revisionId,
      )
      if (!revision) {
        writeJson(response, { detail: `Wiki page revision '${revisionId}' was not found` }, 404)
        return
      }

      const restorePayload = await readJsonBody(request)
      if (!restorePayload || typeof restorePayload !== 'object' || Array.isArray(restorePayload)) {
        writeJson(response, { detail: 'Invalid wiki revision restore payload.' }, 422)
        return
      }

      const restoredBy = normalizeOptionalText((restorePayload as Record<string, unknown>).restored_by)
      if (!restoredBy) {
        writeJson(response, { detail: 'restored_by is required.' }, 422)
        return
      }

      const parentValidationError = validateWikiParentPage(wikiPageRows, pageId, revision.parent_page_id)
      if (parentValidationError) {
        writeJson(
          response,
          { detail: parentValidationError },
          parentValidationError.includes('not found') ? 404 : 422,
        )
        return
      }

      wikiMutationSequence += 1
      const timestamp = nextWikiTimestamp(wikiMutationSequence)
      page.parent_page_id = revision.parent_page_id
      page.title = revision.title
      page.content_markdown = revision.content_markdown
      page.sort_order = revision.sort_order
      page.updated_at = timestamp
      page.updated_by = restoredBy
      page.version += 1

      recordWikiRevision({
        revisionsByPageId: wikiPageRevisionsByPageId,
        nextRevisionId: nextWikiRevisionId,
        page,
        createdAt: timestamp,
        createdBy: restoredBy,
        changeSummary: [`Restored from revision ${revisionId}.`],
        restoredFromRevisionId: revisionId,
      })
      nextWikiRevisionId += 1

      writeJson(response, serializeWikiPageDetail(wikiPageRows, wikiPageRevisionsByPageId, page))
      return
    }

    const wikiPageMatch = url.pathname.match(/^\/wiki\/pages\/([^/]+)$/)
    if (wikiPageMatch && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const pageId = decodeURIComponent(wikiPageMatch[1] ?? '')
      const page = wikiPageRows.find((entry) => entry.page_id === pageId)
      if (!page) {
        writeJson(response, { detail: `Wiki page '${pageId}' was not found` }, 404)
        return
      }

      writeJson(response, serializeWikiPageDetail(wikiPageRows, wikiPageRevisionsByPageId, page))
      return
    }

    if (wikiPageMatch && method === 'PATCH') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const pageId = decodeURIComponent(wikiPageMatch[1] ?? '')
      const page = wikiPageRows.find((entry) => entry.page_id === pageId)
      if (!page) {
        writeJson(response, { detail: `Wiki page '${pageId}' was not found` }, 404)
        return
      }

      const payload = await readJsonBody(request)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        writeJson(response, { detail: 'Invalid wiki page payload.' }, 422)
        return
      }

      const pageRecord = payload as Record<string, unknown>
      const hasTitle = Object.prototype.hasOwnProperty.call(pageRecord, 'title')
      const hasParentPageId = Object.prototype.hasOwnProperty.call(pageRecord, 'parent_page_id')
      const hasContentMarkdown = Object.prototype.hasOwnProperty.call(pageRecord, 'content_markdown')
      const hasSortOrder = Object.prototype.hasOwnProperty.call(pageRecord, 'sort_order')

      if (!hasTitle && !hasParentPageId && !hasContentMarkdown && !hasSortOrder) {
        writeJson(response, { detail: 'Provide at least one wiki page field to update.' }, 422)
        return
      }

      const nextTitle = hasTitle ? normalizeOptionalText(pageRecord.title) : page.title
      if (hasTitle && !nextTitle) {
        writeJson(response, { detail: 'title is required.' }, 422)
        return
      }

      const nextParentPageId = hasParentPageId
        ? pageRecord.parent_page_id === null
          ? null
          : normalizeOptionalText(pageRecord.parent_page_id)
        : page.parent_page_id
      const parentValidationError = validateWikiParentPage(wikiPageRows, pageId, nextParentPageId)
      if (parentValidationError) {
        writeJson(
          response,
          { detail: parentValidationError },
          parentValidationError.includes('not found') ? 404 : 422,
        )
        return
      }

      const nextContentMarkdown = hasContentMarkdown
        ? typeof pageRecord.content_markdown === 'string'
          ? pageRecord.content_markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          : ''
        : page.content_markdown
      const nextSortOrder = hasSortOrder
        ? typeof pageRecord.sort_order === 'number' && Number.isFinite(pageRecord.sort_order)
          ? Math.trunc(pageRecord.sort_order)
          : page.sort_order
        : page.sort_order

      const previousTitle = page.title
      const previousParentPageId = page.parent_page_id
      const previousContentMarkdown = page.content_markdown
      const previousSortOrder = page.sort_order

      const effectiveChange =
        nextTitle !== page.title ||
        nextParentPageId !== page.parent_page_id ||
        nextContentMarkdown !== page.content_markdown ||
        nextSortOrder !== page.sort_order

      if (!effectiveChange) {
        writeJson(response, serializeWikiPageDetail(wikiPageRows, wikiPageRevisionsByPageId, page))
        return
      }

      page.title = nextTitle ?? page.title
      page.parent_page_id = nextParentPageId
      page.content_markdown = nextContentMarkdown
      page.sort_order = nextSortOrder
      wikiMutationSequence += 1
      const timestamp = nextWikiTimestamp(wikiMutationSequence)
      page.updated_at = timestamp
      page.updated_by = smokeSession.user.user_id
      page.version += 1

      const pagesById = new Map(wikiPageRows.map((entry) => [entry.page_id, entry] as const))
      const changeSummary = buildWikiChangeSummary({
        previousTitle,
        previousParentPageId,
        previousContentMarkdown,
        previousSortOrder,
        page,
        pagesById,
      })
      recordWikiRevision({
        revisionsByPageId: wikiPageRevisionsByPageId,
        nextRevisionId: nextWikiRevisionId,
        page,
        createdAt: timestamp,
        createdBy: smokeSession.user.user_id,
        changeSummary,
      })
      nextWikiRevisionId += 1

      writeJson(response, serializeWikiPageDetail(wikiPageRows, wikiPageRevisionsByPageId, page))
      return
    }

    if (url.pathname === '/operations/resources' && method === 'GET') {
      writeJson(response, [
        {
          resource_key: 'confirmations',
          filters: ['trade_id'],
          sort_fields: ['created_at desc', 'id desc'],
          actions: ['create', 'update', 'issue', 'record_response'],
        },
        {
          resource_key: 'deliveries',
          filters: [],
          sort_fields: ['delivery_status_rank', 'delivery_start', 'trade_id', 'leg_no'],
          actions: ['sync_from_trades', 'update', 'update_logistics_detail', 'update_pipeline_detail', 'update_power_detail', 'append_event'],
        },
        {
          resource_key: 'shipments',
          filters: [],
          sort_fields: ['delivery_status_rank', 'delivery_start', 'trade_id', 'leg_no'],
          actions: ['upsert_actualization'],
        },
        {
          resource_key: 'invoices',
          filters: ['trade_id'],
          sort_fields: ['due_at asc', 'updated_at desc', 'id desc'],
          actions: ['create', 'update'],
        },
        {
          resource_key: 'payments',
          filters: ['trade_id', 'invoice_id'],
          sort_fields: ['trade_id asc', 'due_at asc', 'id asc'],
          actions: ['create', 'update'],
        },
        {
          resource_key: 'work_items',
          filters: ['queue', 'include_closed', 'trade_id'],
          sort_fields: ['attention_rank'],
          actions: ['create', 'update', 'book_underlying'],
        },
      ])
      return
    }

    if (url.pathname === '/operations/trade-attention-candidates' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const candidateType = normalizeOptionalText(url.searchParams.get('candidate_type'))
      const limit = Math.max(1, Number(url.searchParams.get('limit') ?? '8') || 8)
      writeJson(response, buildTradeAttentionCandidateList(candidateType, limit))
      return
    }

    if (url.pathname === '/trades' && method === 'GET') {
      writeJson(response, tradeRows)
      return
    }

    if (url.pathname === '/trades/metadata' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, buildFallbackTradeMetadata())
      return
    }

    if (url.pathname === '/positions' && method === 'GET') {
      writeJson(response, positions)
      return
    }

    if (url.pathname === '/option-exposures' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/confirmations' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/settlement/invoices' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/settlement/payments' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/settlement/invoice-issue-candidates' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const limit = Math.max(1, Number(url.searchParams.get('limit') ?? '8') || 8)
      writeJson(response, buildInvoiceIssueCandidateList(limit))
      return
    }

    if (url.pathname === '/deliveries' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/operations/work-items' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/reference/books' && method === 'GET') {
      writeJson(response, books)
      return
    }

    if (url.pathname === '/reference/commodities' && method === 'GET') {
      writeJson(response, commodities)
      return
    }

    if (url.pathname === '/reference/price-indices' && method === 'GET') {
      writeJson(response, priceIndices)
      return
    }

    if (url.pathname === '/reference/currencies' && method === 'GET') {
      writeJson(response, currencies)
      return
    }

    if (url.pathname === '/reference/units' && method === 'GET') {
      writeJson(response, units)
      return
    }

    if (url.pathname === '/reference/locations' && method === 'GET') {
      writeJson(response, locations)
      return
    }

    if (url.pathname === '/reference/locations/standards' && method === 'GET') {
      writeJson(response, {
        default_location_kind: 'POINT',
        default_location_type_by_kind: {
          POINT: 'HUB',
          REGION: 'REGION',
        },
        location_kinds: ['POINT', 'REGION'],
        location_types_by_kind: {
          POINT: ['HUB'],
          REGION: ['REGION'],
        },
        market_codes: ['PHYSICAL'],
        continent_codes: ['NA'],
      })
      return
    }

    if (url.pathname === '/reference/rail-routes' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/reference/assets/map-scope-summary' && method === 'GET') {
      writeJson(response, {
        total_count: assets.length,
        total_map_ready_count: assets.length,
        filtered_total_count: assets.length,
        filtered_map_ready_count: assets.length,
      })
      return
    }

    if (url.pathname === '/reference/assets' && method === 'GET') {
      writeJson(response, assets)
      return
    }

    if (url.pathname === '/reference/assets/standards' && method === 'GET') {
      writeJson(response, assetStandards)
      return
    }

    if (url.pathname === '/reference/spatial-features' && method === 'GET') {
      writeJson(response, spatialFeatures)
      return
    }

    if (url.pathname === '/reference/spatial-features/standards' && method === 'GET') {
      writeJson(response, spatialFeatureStandards)
      return
    }

    if (url.pathname === '/reference/counterparties' && method === 'GET') {
      writeJson(response, counterparties)
      return
    }

    if (url.pathname === '/reference/counterparties/standards' && method === 'GET') {
      writeJson(response, {
        default_counterparty_type: 'SUPPLIER',
        counterparty_types: ['MARKETER', 'TRADER', 'UTILITY'],
        default_counterparty_credit_status: 'APPROVED',
        counterparty_credit_statuses: ['APPROVED', 'REVIEW_REQUIRED', 'ON_HOLD', 'BLOCKED'],
        default_counterparty_credit_breach_action: 'REQUIRE_APPROVAL',
        counterparty_credit_breach_actions: ['WARN', 'REQUIRE_APPROVAL', 'BLOCK'],
      })
      return
    }

    if (url.pathname === '/reference/portfolios' && method === 'GET') {
      writeJson(response, portfolios)
      return
    }

    if (url.pathname === '/reference/counterparties/credit-profiles' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/reference/counterparties/external-credit-snapshots' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/events' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const aggregateId = url.searchParams.get('aggregate_id')?.trim() ?? ''
      if (aggregateId) {
        writeJson(response, tradeEventsByAggregateId.get(aggregateId) ?? [])
        return
      }

      writeJson(
        response,
        Array.from(tradeEventsByAggregateId.values()).flat(),
      )
      return
    }

    if (url.pathname === '/events' && method === 'POST') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))

      const eventRequest = payload as {
        aggregate_type?: unknown
        aggregate_id?: unknown
        event_type?: unknown
        occurred_at?: unknown
        actor_id?: unknown
        payload?: unknown
        schema_version?: unknown
      }

      assert.equal(eventRequest.aggregate_type, 'trade')
      assert.equal(eventRequest.event_type, 'TradeCreated')
      assert.equal(typeof eventRequest.aggregate_id, 'string')
      assert.equal(typeof eventRequest.occurred_at, 'string')
      assert.ok(
        eventRequest.payload &&
          typeof eventRequest.payload === 'object' &&
          !Array.isArray(eventRequest.payload),
      )

      const tradeId = eventRequest.aggregate_id.trim()
      const occurredAt = eventRequest.occurred_at
      const actorId = normalizeOptionalText(eventRequest.actor_id)
      const eventPayload = eventRequest.payload as Record<string, unknown>
      const schemaVersion =
        typeof eventRequest.schema_version === 'number' &&
        Number.isFinite(eventRequest.schema_version)
          ? eventRequest.schema_version
          : 1
      const eventId = `evt-trade-created-${tradeId.toLowerCase()}`
      const createdEvent = buildTradeCreatedEventRow({
        eventId,
        tradeId,
        occurredAt,
        actorId,
        schemaVersion,
        payload: eventPayload,
      })
      const createdTrade = buildCreatedTradeRow({
        tradeId,
        occurredAt,
        eventId,
        payload: eventPayload,
      })

      tradeEventsByAggregateId.set(tradeId, [createdEvent])
      tradeRows.unshift(createdTrade)

      writeJson(response, createdEvent, 201)
      return
    }

    const layoutDefinitionMatch = url.pathname.match(/^\/layout-definitions\/([^/]+)$/)
    if (layoutDefinitionMatch && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, null)
      return
    }

    if (layoutDefinitionMatch && method === 'PUT') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      const payload = await readJsonBody(request)
      assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))

      const layout = payload as {
        order?: unknown
        hidden?: unknown
        spans?: unknown
      }

      const workspaceId = layoutDefinitionMatch[1]
      writeJson(response, {
        workspace_id: workspaceId,
        order: Array.isArray(layout.order) ? layout.order : [],
        hidden: Array.isArray(layout.hidden) ? layout.hidden : [],
        spans:
          layout.spans && typeof layout.spans === 'object' && !Array.isArray(layout.spans)
            ? layout.spans
            : {},
        updated_at: '2026-04-11T00:00:00Z',
        updated_by: smokeSession.user.user_id,
        version: 1,
      })
      return
    }

    if (url.pathname === '/weather/intelligence/overview' && method === 'GET') {
      writeJson(response, {
        analysis_mode: 'BASELINE',
        as_of_date: '2026-04-11',
        seasonal_regime: 'Late Winter',
        headline: 'Weather risk is muted in the current smoke scenario.',
        summary: 'No active regional weather signal is driving the seeded trade set.',
        latest_position_update_at: '2026-04-11T00:00:00Z',
        latest_weather_update_at: '2026-04-11T00:00:00Z',
        live_weather_location_count: 0,
        weather_sensitive_exposure_count: 0,
        weather_sensitive_gross_volume: 0,
        focus_areas: ['Maintain routine watch coverage.'],
        exposures: [],
        regional_signals: [],
        tracked_sources: [],
      })
      return
    }

    if (url.pathname === '/market-data/context' && method === 'GET') {
      writeJson(response, {
        generated_at: '2026-04-11T00:00:00Z',
        commodity: null,
        price_indices: [
          {
            price_index_code: 'HH_IFERC',
            name: 'Henry Hub IFERC',
            commodity_code: 'HENRY_HUB_GAS',
            market: 'PHYSICAL',
            location_code: 'HENRY_HUB',
            observation_date: '2026-04-11',
            value: 3.21,
            unit_code: 'USD/MMBTU',
            currency_code: 'USD',
            source_provider: 'ICE',
            source_series_id: 'HH_IFERC',
            downloaded_at: '2026-04-11T00:00:00Z',
          },
        ],
        fundamentals: [],
        power: [],
        macro: [],
        positioning: [],
        freshness: [],
      })
      return
    }

    if (url.pathname === '/market-data/external-series' && method === 'GET') {
      writeJson(response, [])
      return
    }

    if (url.pathname === '/market-data/price-indices/HH_IFERC/observations' && method === 'GET') {
      writeJson(response, [
        {
          id: 1,
          price_index_code: 'HH_IFERC',
          observation_date: '2026-04-11',
          value: 3.21,
          unit_code: 'USD/MMBTU',
          currency_code: 'USD',
          source_provider: 'ICE',
          source_series_id: 'HH_IFERC',
          source_frequency: 'DAILY',
          source_published_at: '2026-04-11T00:00:00Z',
          source_revision: null,
          downloaded_at: '2026-04-11T00:00:00Z',
          run_id: 1,
          created_at: '2026-04-11T00:00:00Z',
          updated_at: '2026-04-11T00:00:00Z',
        },
      ])
      return
    }

    if (url.pathname === '/reports/pnl-history' && method === 'GET') {
      if (!requireAuthorization(request, response, sessionExpired)) {
        return
      }

      writeJson(response, {
        generated_at: '2026-04-11T00:00:00Z',
        basis: 'MARK_TO_MARKET',
        methodology: 'Daily marked P&L using stored market marks and settled cash movements.',
        point_count: 3,
        points: [
          {
            date: '2026-04-09',
            total_pnl: 7200,
            realized_pnl: 1200,
            unrealized_pnl: 6000,
            priced_trade_count: 1,
            realized_trade_count: 0,
            unrealized_trade_count: 1,
          },
          {
            date: '2026-04-10',
            total_pnl: 8050,
            realized_pnl: 1500,
            unrealized_pnl: 6550,
            priced_trade_count: 1,
            realized_trade_count: 0,
            unrealized_trade_count: 1,
          },
          {
            date: '2026-04-11',
            total_pnl: 8900,
            realized_pnl: 1800,
            unrealized_pnl: 7100,
            priced_trade_count: 1,
            realized_trade_count: 0,
            unrealized_trade_count: 1,
          },
        ],
        summary: {
          total_pnl: 8900,
          realized_pnl: 1800,
          unrealized_pnl: 7100,
          priced_trade_count: 1,
          realized_trade_count: 0,
          unrealized_trade_count: 1,
        },
        valuations: [],
      })
      return
    }

    unexpectedRequests.push(record)
    writeJson(
      response,
      { detail: `Unhandled mock route: ${method} ${url.pathname}${url.search}` },
      404,
    )
  })

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve())
    server.once('error', reject)
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object', 'Mock API server should expose a local address.')

  return {
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
    expireSession: () => {
      sessionExpired = true
    },
    mutationRequests,
    promptNavigationOutcomeRequests,
    unexpectedRequests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      }),
  }
}

async function startViteAppServer(apiBase: string): Promise<{ origin: string; close: () => Promise<void> }> {
  const server: ViteDevServer = await createViteServer({
    root: webRoot,
    configFile: false,
    logLevel: 'error',
    appType: 'spa',
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 0,
      proxy: {
        '/api': {
          target: apiBase,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  })

  await server.listen()

  const address = server.httpServer?.address()
  assert.ok(address && typeof address === 'object', 'Vite app server should expose a local address.')

  return {
    origin: `http://127.0.0.1:${(address as AddressInfo).port}`,
    close: async () => {
      await server.close()
    },
  }
}

export async function startSmokeHarness(
  options: StartSmokeHarnessOptions = {},
): Promise<SmokeHarness> {
  const mockApi = await startMockApiServer(options)
  const appServer = await startViteAppServer(mockApi.baseUrl)

  return {
    origin: appServer.origin,
    apiBaseUrl: mockApi.baseUrl,
    expireSession: mockApi.expireSession,
    mutationRequests: mockApi.mutationRequests,
    promptNavigationOutcomeRequests: mockApi.promptNavigationOutcomeRequests,
    unexpectedRequests: mockApi.unexpectedRequests,
    close: async () => {
      const results = await Promise.allSettled([appServer.close(), mockApi.close()])
      const failure = results.find((result) => result.status === 'rejected')

      if (failure?.status === 'rejected') {
        throw failure.reason
      }
    },
  }
}

export async function seedApiBaseOverride(page: Page, harness: SmokeHarness): Promise<void> {
  await page.addInitScript(
    ({ apiBaseOverride }) => {
      window.localStorage.setItem('ectrm.api-base-override', apiBaseOverride)
    },
    {
      apiBaseOverride: `${harness.origin}/api`,
    },
  )
}

export async function seedSignedInSession(page: Page, harness: SmokeHarness): Promise<void> {
  await page.addInitScript(
    ({ apiBaseOverride, session }) => {
      window.localStorage.setItem('ectrm.api-base-override', apiBaseOverride)
      window.localStorage.setItem('ectrm.auth-session', JSON.stringify(session))
    },
    {
      apiBaseOverride: `${harness.origin}/api`,
      session: smokeSession,
    },
  )
}

export async function dismissStartHereOverlay(page: Page): Promise<void> {
  const overlay = page.locator('.start-here-dialog')
  await overlay.waitFor()
  await overlay.getByRole('button', { name: 'Not Now' }).click()
  await overlay.waitFor({ state: 'hidden' })
}

export function formatRecordedRequests(requests: RecordedRequest[]): string {
  return requests.map((request) => `${request.method} ${request.path}${request.search}`).join('\n')
}

export function assertNoHarnessRequestFailures(harness: SmokeHarness): void {
  assert.equal(
    harness.unexpectedRequests.length,
    0,
    `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
  )
  assert.equal(
    harness.mutationRequests.length,
    0,
    `Unexpected mutation requests:\n${formatRecordedRequests(harness.mutationRequests)}`,
  )
}
