import { APP_VIEWS } from './appViews'
import { matchesTextFilter } from '../../shared/filtering'
import type { AppRouteHandoff, AppRouteHandoffFocusType } from '../../shared/appRouteHandoff'
import type {
  CounterpartyRecord,
  PriceIndexRecord,
  ReferenceRecord,
  ReferenceTab,
  Trade,
  ViewKey,
} from '../../shared/models'

export type TerminalCommandScope =
  | 'workspace'
  | 'trade'
  | 'counterparty'
  | 'commodity'
  | 'price_index'
  | 'report'

export type TerminalCommandAction =
  | {
      kind: 'view'
      view: ViewKey
      handoff: AppRouteHandoff | null
      hash?: string | null
    }
  | {
      kind: 'trade'
      tradeId: string
      handoff: AppRouteHandoff
    }
  | {
      kind: 'reference_record'
      recordKind: 'counterparty' | 'commodity' | 'price_index'
      referenceTab: ReferenceTab
      recordCode: string
      handoff: AppRouteHandoff
    }

export type TerminalCommandResult = {
  id: string
  scope: TerminalCommandScope
  title: string
  detail: string
  action: TerminalCommandAction
}

export type TerminalCommandResultGroup = {
  scope: TerminalCommandScope
  label: string
  results: TerminalCommandResult[]
}

export type TerminalCommandSearchState =
  | {
      status: 'loading'
      title: string
      detail: string
      scope: TerminalCommandScope | null
    }
  | {
      status: 'unsupported'
      title: string
      detail: string
      scope: TerminalCommandScope | null
    }
  | {
      status: 'empty'
      title: string
      detail: string
      scope: TerminalCommandScope | null
    }
  | {
      status: 'results'
      groups: TerminalCommandResultGroup[]
      scope: TerminalCommandScope | null
      query: string
    }

type TerminalCommandSearchArgs = {
  query: string
  isLoading: boolean
  trades: readonly Trade[]
  counterparties: readonly CounterpartyRecord[]
  commodities: readonly ReferenceRecord[]
  priceIndices: readonly PriceIndexRecord[]
}

type TerminalCommandEntry = TerminalCommandResult & {
  searchValues: Array<string | number | boolean | null | undefined>
  rankValues: string[]
  order: number
}

type ParsedTerminalCommandQuery = {
  scope: TerminalCommandScope | null
  query: string
  mutationVerb: string | null
}

type ReportShortcut = {
  id: string
  title: string
  detail: string
}

const FEATURED_WORKSPACE_VIEW_KEYS: ViewKey[] = [
  'dashboard',
  'trades',
  'risk',
  'operations',
  'settlement',
  'reports',
  'reference',
  'assistant',
]

const REPORT_SHORTCUTS: ReportShortcut[] = [
  {
    id: 'reports-overview',
    title: 'Reporting Overview',
    detail: 'Desk reporting posture, coverage, and summary counts.',
  },
  {
    id: 'reports-trading-eod',
    title: 'Trading EOD',
    detail: 'Desk close status, blockers, and readiness checks.',
  },
  {
    id: 'reports-exposure',
    title: 'Exposure Summary',
    detail: 'Commodity-level volume and concentration posture.',
  },
  {
    id: 'reports-activity',
    title: 'Activity Summary',
    detail: 'Lifecycle activity grouped by event type and recency.',
  },
  {
    id: 'reports-valuation-snapshot',
    title: 'Portfolio Snapshot',
    detail: 'Current portfolio valuation and priced trade coverage.',
  },
  {
    id: 'reports-valuation-compare',
    title: 'P&L Comparison',
    detail: 'Snapshot-to-snapshot P&L deltas and bridge context.',
  },
  {
    id: 'reports-credit',
    title: 'Counterparty Credit Report',
    detail: 'Credit, exposure, and review posture for active counterparties.',
  },
]

const SCOPE_PREFIXES: Record<TerminalCommandScope, string[]> = {
  workspace: ['workspace:', 'ws:', 'view:'],
  trade: ['trade:', 'trd:'],
  counterparty: ['counterparty:', 'cp:'],
  commodity: ['commodity:', 'cmdty:'],
  price_index: ['index:', 'px:', 'price:'],
  report: ['report:', 'rpt:'],
}

const MUTATION_VERBS = [
  'book',
  'amend',
  'cancel',
  'create',
  'issue',
  'approve',
  'save',
  'update',
  'pay',
  'settle',
  'schedule',
]

const MAX_RESULTS_PER_GROUP = 6
const BLANK_WORKSPACE_LIMIT = 8
const BLANK_REPORT_LIMIT = 4
const BLANK_TRADE_LIMIT = 4

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function scopeLabel(scope: TerminalCommandScope): string {
  switch (scope) {
    case 'workspace':
      return 'Workspaces'
    case 'trade':
      return 'Trades'
    case 'counterparty':
      return 'Counterparties'
    case 'commodity':
      return 'Commodities'
    case 'price_index':
      return 'Price Indices'
    case 'report':
      return 'Reports'
  }
}

function scopeSupportsStaticResults(scope: TerminalCommandScope | null): boolean {
  return scope === 'workspace' || scope === 'report'
}

function buildTerminalHandoff(args: {
  focusType: AppRouteHandoffFocusType
  focusId: string
  focusLabel?: string | null
  label: string
  rationale: string
  filter?: string | null
  tradeInspectorTab?: AppRouteHandoff['tradeInspectorTab']
}): AppRouteHandoff {
  const { focusType, focusId, focusLabel = null, label, rationale, filter = focusId, tradeInspectorTab = null } = args

  return {
    source: 'terminal',
    tradeId: focusId,
    focus: {
      type: focusType,
      id: focusId,
      label: focusLabel,
    },
    tradeInspectorTab,
    eventType: null,
    label,
    rationale,
    filter,
    sourceRunId: null,
    sourceConversationId: null,
    sourceActionRequestId: null,
  }
}

function parseTerminalCommandQuery(rawQuery: string): ParsedTerminalCommandQuery {
  const normalizedQuery = rawQuery.trim()
  const lowercaseQuery = normalizedQuery.toLowerCase()

  for (const [scope, prefixes] of Object.entries(SCOPE_PREFIXES) as Array<
    [TerminalCommandScope, string[]]
  >) {
    const matchingPrefix = prefixes.find((prefix) => lowercaseQuery.startsWith(prefix))
    if (!matchingPrefix) {
      continue
    }

    return {
      scope,
      query: normalizedQuery.slice(matchingPrefix.length).trim(),
      mutationVerb: null,
    }
  }

  const firstToken = lowercaseQuery.split(/\s+/, 1)[0] ?? ''
  const normalizedFirstToken = firstToken.replace(/:$/, '')
  if (MUTATION_VERBS.includes(normalizedFirstToken)) {
    return {
      scope: null,
      query: normalizedQuery,
      mutationVerb: normalizedFirstToken,
    }
  }

  return {
    scope: null,
    query: normalizedQuery,
    mutationVerb: null,
  }
}

function matchRank(query: string, entry: TerminalCommandEntry): number | null {
  if (!matchesTextFilter(query, entry.searchValues)) {
    return null
  }

  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) {
    return 0
  }

  const normalizedRankValues = entry.rankValues.map(normalizeText)
  if (normalizedRankValues.some((value) => value === normalizedQuery)) {
    return 0
  }
  if (normalizedRankValues.some((value) => value.startsWith(normalizedQuery))) {
    return 1
  }
  if (normalizedRankValues.some((value) => value.includes(normalizedQuery))) {
    return 2
  }
  return 3
}

function filterEntries(entries: TerminalCommandEntry[], query: string): TerminalCommandResult[] {
  if (!query) {
    return entries
  }

  return entries
    .map((entry) => ({
      entry,
      rank: matchRank(query, entry),
    }))
    .filter((candidate): candidate is { entry: TerminalCommandEntry; rank: number } => candidate.rank !== null)
    .sort((left, right) => left.rank - right.rank || left.entry.order - right.entry.order)
    .slice(0, MAX_RESULTS_PER_GROUP)
    .map(({ entry }) => ({
      id: entry.id,
      scope: entry.scope,
      title: entry.title,
      detail: entry.detail,
      action: entry.action,
    }))
}

function buildWorkspaceEntries(): TerminalCommandEntry[] {
  return APP_VIEWS.map((view, index) => ({
    id: `workspace:${view.key}`,
    scope: 'workspace',
    title: view.label,
    detail: `${view.kicker} workspace`,
    action: {
      kind: 'view',
      view: view.key,
      handoff: null,
    },
    searchValues: [view.label, view.kicker, view.key],
    rankValues: [view.label, view.key],
    order: index,
  }))
}

function buildTradeEntries(trades: readonly Trade[]): TerminalCommandEntry[] {
  return trades.map((trade, index) => ({
    id: `trade:${trade.trade_id}`,
    scope: 'trade',
    title: trade.trade_id,
    detail: [trade.commodity, trade.book, trade.counterparty].filter(Boolean).join(' • '),
    action: {
      kind: 'trade',
      tradeId: trade.trade_id,
      handoff: buildTerminalHandoff({
        focusType: 'trade',
        focusId: trade.trade_id,
        focusLabel: trade.trade_id,
        label: `Open ${trade.trade_id}`,
        rationale:
          'Terminal search opened this trade so you can review the latest economics, lifecycle state, and downstream workflow context in one place.',
      }),
    },
    searchValues: [
      trade.trade_id,
      trade.external_trade_id,
      trade.book,
      trade.portfolio,
      trade.counterparty,
      trade.commodity_class,
      trade.commodity,
      trade.instrument_type,
      trade.trade_structure,
      trade.trade_side,
      trade.pricing_type,
      trade.price_index_code,
      trade.status,
      trade.settlement_status,
    ],
    rankValues: [trade.trade_id, trade.external_trade_id ?? '', trade.commodity, trade.book],
    order: index,
  }))
}

function buildCounterpartyEntries(counterparties: readonly CounterpartyRecord[]): TerminalCommandEntry[] {
  return counterparties.map((counterparty, index) => ({
    id: `counterparty:${counterparty.code}`,
    scope: 'counterparty',
    title: counterparty.name,
    detail: [counterparty.code, counterparty.counterparty_type, counterparty.credit_status].filter(Boolean).join(' • '),
    action: {
      kind: 'reference_record',
      recordKind: 'counterparty',
      referenceTab: 'counterparties',
      recordCode: counterparty.code,
      handoff: buildTerminalHandoff({
        focusType: 'reference_record',
        focusId: counterparty.code,
        focusLabel: counterparty.name,
        label: `Open counterparty ${counterparty.code}`,
        rationale:
          'Terminal search opened Reference Data on this counterparty so you can review master data, credit posture, and active-trade context together.',
      }),
    },
    searchValues: [
      counterparty.code,
      counterparty.name,
      counterparty.short_name,
      counterparty.legal_entity_name,
      counterparty.counterparty_type,
      counterparty.country_code,
      counterparty.ticker_symbol,
      counterparty.credit_status,
    ],
    rankValues: [counterparty.code, counterparty.name, counterparty.short_name ?? ''],
    order: index,
  }))
}

function buildCommodityEntries(commodities: readonly ReferenceRecord[]): TerminalCommandEntry[] {
  return commodities.map((commodity, index) => ({
    id: `commodity:${commodity.code}`,
    scope: 'commodity',
    title: commodity.name,
    detail: [commodity.code, commodity.commodity_class, commodity.description].filter(Boolean).join(' • '),
    action: {
      kind: 'reference_record',
      recordKind: 'commodity',
      referenceTab: 'commodities',
      recordCode: commodity.code,
      handoff: buildTerminalHandoff({
        focusType: 'reference_record',
        focusId: commodity.code,
        focusLabel: commodity.name,
        label: `Open commodity ${commodity.code}`,
        rationale:
          'Terminal search opened Reference Data on this commodity so you can review the governed definition and active-trade usage in context.',
      }),
    },
    searchValues: [commodity.code, commodity.name, commodity.description, commodity.commodity_class],
    rankValues: [commodity.code, commodity.name],
    order: index,
  }))
}

function buildPriceIndexEntries(priceIndices: readonly PriceIndexRecord[]): TerminalCommandEntry[] {
  return priceIndices.map((priceIndex, index) => ({
    id: `price-index:${priceIndex.code}`,
    scope: 'price_index',
    title: priceIndex.name,
    detail: [
      priceIndex.code,
      priceIndex.provider,
      priceIndex.market,
      priceIndex.location_code,
      `${priceIndex.commodity_code}/${priceIndex.unit_code}`,
    ]
      .filter(Boolean)
      .join(' • '),
    action: {
      kind: 'reference_record',
      recordKind: 'price_index',
      referenceTab: 'price-indices',
      recordCode: priceIndex.code,
      handoff: buildTerminalHandoff({
        focusType: 'reference_record',
        focusId: priceIndex.code,
        focusLabel: priceIndex.name,
        label: `Open price index ${priceIndex.code}`,
        rationale:
          'Terminal search opened Reference Data on this price index so you can review the governed curve, provider, and downstream trade usage together.',
      }),
    },
    searchValues: [
      priceIndex.code,
      priceIndex.name,
      priceIndex.description,
      priceIndex.provider,
      priceIndex.market,
      priceIndex.location_code,
      priceIndex.commodity_code,
      priceIndex.currency_code,
      priceIndex.unit_code,
    ],
    rankValues: [priceIndex.code, priceIndex.name, priceIndex.provider],
    order: index,
  }))
}

function buildReportEntries(): TerminalCommandEntry[] {
  return REPORT_SHORTCUTS.map((report, index) => ({
    id: `report:${report.id}`,
    scope: 'report',
    title: report.title,
    detail: report.detail,
    action: {
      kind: 'view',
      view: 'reports',
      handoff: buildTerminalHandoff({
        focusType: 'report',
        focusId: report.id,
        focusLabel: report.title,
        label: `Open ${report.title}`,
        rationale:
          'Terminal search opened the Reports workspace on this module so you can review the matching analysis without hunting through the full report grid.',
      }),
      hash: report.id,
    },
    searchValues: [report.id, report.title, report.detail, 'reports'],
    rankValues: [report.title, report.id],
    order: index,
  }))
}

function buildEntriesByScope(args: Omit<TerminalCommandSearchArgs, 'query' | 'isLoading'>): Record<
  TerminalCommandScope,
  TerminalCommandEntry[]
> {
  return {
    workspace: buildWorkspaceEntries(),
    trade: buildTradeEntries(args.trades),
    counterparty: buildCounterpartyEntries(args.counterparties),
    commodity: buildCommodityEntries(args.commodities),
    price_index: buildPriceIndexEntries(args.priceIndices),
    report: buildReportEntries(),
  }
}

function buildBlankStateGroups(
  scope: TerminalCommandScope | null,
  entriesByScope: Record<TerminalCommandScope, TerminalCommandEntry[]>,
): TerminalCommandResultGroup[] {
  if (scope) {
    const scopedEntries = entriesByScope[scope].slice(
      0,
      scope === 'workspace'
        ? BLANK_WORKSPACE_LIMIT
        : scope === 'report'
          ? BLANK_REPORT_LIMIT
          : MAX_RESULTS_PER_GROUP,
    )

    return scopedEntries.length > 0
      ? [
          {
            scope,
            label: scopeLabel(scope),
            results: scopedEntries.map(({ id, title, detail, action, scope: entryScope }) => ({
              id,
              scope: entryScope,
              title,
              detail,
              action,
            })),
          },
        ]
      : []
  }

  const featuredWorkspaces = FEATURED_WORKSPACE_VIEW_KEYS.map((viewKey) =>
    entriesByScope.workspace.find((entry) => entry.action.kind === 'view' && entry.action.view === viewKey),
  ).filter((entry): entry is TerminalCommandEntry => entry !== undefined)
  const blankTrades = entriesByScope.trade.slice(0, BLANK_TRADE_LIMIT)

  const groups: TerminalCommandResultGroup[] = [
    {
      scope: 'workspace',
      label: scopeLabel('workspace'),
      results: featuredWorkspaces.slice(0, BLANK_WORKSPACE_LIMIT).map(({ id, title, detail, action, scope: entryScope }) => ({
        id,
        scope: entryScope,
        title,
        detail,
        action,
      })),
    },
    {
      scope: 'report',
      label: scopeLabel('report'),
      results: entriesByScope.report.slice(0, BLANK_REPORT_LIMIT).map(({ id, title, detail, action, scope: entryScope }) => ({
        id,
        scope: entryScope,
        title,
        detail,
        action,
      })),
    },
    {
      scope: 'trade',
      label: scopeLabel('trade'),
      results: blankTrades.map(({ id, title, detail, action, scope: entryScope }) => ({
        id,
        scope: entryScope,
        title,
        detail,
        action,
      })),
    },
  ]

  return groups.filter((group) => group.results.length > 0)
}

function buildSearchGroups(
  scope: TerminalCommandScope | null,
  query: string,
  entriesByScope: Record<TerminalCommandScope, TerminalCommandEntry[]>,
): TerminalCommandResultGroup[] {
  const scopes = scope ? [scope] : (Object.keys(entriesByScope) as TerminalCommandScope[])

  return scopes
    .map((currentScope) => ({
      scope: currentScope,
      label: scopeLabel(currentScope),
      results: filterEntries(entriesByScope[currentScope], query),
    }))
    .filter((group) => group.results.length > 0)
}

export function resolveTerminalCommandSearchState(
  args: TerminalCommandSearchArgs,
): TerminalCommandSearchState {
  const parsedQuery = parseTerminalCommandQuery(args.query)
  const entriesByScope = buildEntriesByScope(args)

  if (parsedQuery.mutationVerb) {
    return {
      status: 'unsupported',
      title: 'Terminal search is navigation only',
      detail: `"${parsedQuery.mutationVerb}" looks like a business action. Use terminal search to open the right workspace or record first, then make the change there.`,
      scope: parsedQuery.scope,
    }
  }

  const query = parsedQuery.query
  const groups =
    query.length === 0
      ? buildBlankStateGroups(parsedQuery.scope, entriesByScope)
      : buildSearchGroups(parsedQuery.scope, query, entriesByScope)

  if (groups.length > 0) {
    return {
      status: 'results',
      groups,
      scope: parsedQuery.scope,
      query,
    }
  }

  if (args.isLoading && !scopeSupportsStaticResults(parsedQuery.scope)) {
    return {
      status: 'loading',
      title: 'Loading terminal search',
      detail: 'Trades and reference records are still syncing into the command catalog. Try the same lookup again in a moment.',
      scope: parsedQuery.scope,
    }
  }

  return {
    status: 'empty',
    title: 'No terminal matches',
    detail: parsedQuery.scope
      ? `No ${scopeLabel(parsedQuery.scope).toLowerCase()} matched this lookup. Try a different code, name, or prefix.`
      : 'Try a trade ID, counterparty code, commodity name, price index, report title, or a scope prefix like trade: or report:.',
    scope: parsedQuery.scope,
  }
}
