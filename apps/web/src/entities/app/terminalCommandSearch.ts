import { APP_VIEWS } from './appViews'
import { matchesTextFilter } from '../../shared/filtering'
import type { AppRouteHandoff, AppRouteHandoffFocusType } from '../../shared/appRouteHandoff'
import {
  getPrimaryTerminalWorkspaceSetRoute,
  listTerminalWorkspaceSets,
} from '../../shared/terminalWorkspaceSets'
import type {
  CounterpartyRecord,
  PriceIndexRecord,
  ReferenceRecord,
  ReferenceTab,
  Trade,
  ViewKey,
} from '../../shared/models'

export type TerminalCommandScope =
  | 'function'
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
  aliases: string[]
}

type TerminalFunctionShortcut = {
  id: string
  title: string
  detail: string
  aliases: string[]
  action: TerminalCommandAction
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
    aliases: ['overview', 'reporting', 'reports'],
  },
  {
    id: 'reports-trading-eod',
    title: 'Trading EOD',
    detail: 'Desk close status, blockers, and readiness checks.',
    aliases: ['eod', 'end of day', 'close', 'desk close'],
  },
  {
    id: 'reports-exposure',
    title: 'Exposure Summary',
    detail: 'Commodity-level volume and concentration posture.',
    aliases: ['exposure', 'risk', 'position report'],
  },
  {
    id: 'reports-activity',
    title: 'Activity Summary',
    detail: 'Lifecycle activity grouped by event type and recency.',
    aliases: ['activity', 'events', 'lifecycle'],
  },
  {
    id: 'reports-valuation-snapshot',
    title: 'Portfolio Snapshot',
    detail: 'Current portfolio valuation and priced trade coverage.',
    aliases: ['portfolio', 'valuation', 'snapshot', 'pnl'],
  },
  {
    id: 'reports-valuation-compare',
    title: 'P&L Comparison',
    detail: 'Snapshot-to-snapshot P&L deltas and bridge context.',
    aliases: ['pnl compare', 'p&l', 'compare', 'valuation compare'],
  },
  {
    id: 'reports-credit',
    title: 'Counterparty Credit Report',
    detail: 'Credit, exposure, and review posture for active counterparties.',
    aliases: ['credit', 'counterparty credit', 'cr'],
  },
]

const SCOPE_PREFIXES: Record<TerminalCommandScope, string[]> = {
  function: ['function:', 'fn:', 'cmd:'],
  workspace: ['workspace:', 'ws:', 'view:'],
  trade: ['trade:', 'trd:'],
  counterparty: ['counterparty:', 'cp:'],
  commodity: ['commodity:', 'cmdty:'],
  price_index: ['index:', 'px:', 'price:'],
  report: ['report:', 'rpt:'],
}

const BARE_SCOPE_ALIASES: Partial<Record<TerminalCommandScope, string[]>> = {
  workspace: ['workspace', 'ws', 'view'],
  trade: ['trade', 'trd', 't'],
  counterparty: ['counterparty', 'cpty', 'cp'],
  commodity: ['commodity', 'cmdty', 'cmd'],
  price_index: ['price', 'index', 'idx', 'px'],
  report: ['report', 'rpt', 'rep'],
}

const FUNCTION_QUERY_ALIASES = [
  'brief',
  'cr',
  'credit',
  'des',
  'describe',
  'eod',
  'help',
  'launch',
  'live',
  'mkt',
  'mkts',
  'mon',
  'monitor',
  'ops',
  'pnl',
  'pos',
  'positions',
  'ref',
  'reference',
  'risk',
  'sched',
  'sch',
  'setl',
  'setup',
  'stlmt',
  'wset',
]

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
  'actualize',
  'allocate',
  'assign',
  'confirm',
  'delete',
  'execute',
  'nominate',
  'post',
  'release',
  'send',
  'submit',
]

const MAX_RESULTS_PER_GROUP = 6
const BLANK_FUNCTION_LIMIT = 6
const BLANK_WORKSPACE_LIMIT = 8
const BLANK_REPORT_LIMIT = 4
const BLANK_TRADE_LIMIT = 4

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function scopeLabel(scope: TerminalCommandScope): string {
  switch (scope) {
    case 'function':
      return 'Functions'
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
  return scope === 'function' || scope === 'workspace' || scope === 'report'
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

  const remainingQuery = normalizedQuery.slice(firstToken.length).trim()
  for (const [scope, aliases] of Object.entries(BARE_SCOPE_ALIASES) as Array<
    [TerminalCommandScope, string[]]
  >) {
    if (aliases.includes(normalizedFirstToken)) {
      return {
        scope,
        query: remainingQuery,
        mutationVerb: null,
      }
    }
  }

  if (FUNCTION_QUERY_ALIASES.includes(normalizedFirstToken)) {
    return {
      scope: 'function',
      query: remainingQuery ? `${normalizedFirstToken} ${remainingQuery}` : normalizedFirstToken,
      mutationVerb: null,
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

function reportAction(report: ReportShortcut): Extract<TerminalCommandAction, { kind: 'view' }> {
  return {
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
  }
}

function reportById(reportId: string): ReportShortcut {
  const report = REPORT_SHORTCUTS.find((candidate) => candidate.id === reportId)
  if (!report) {
    throw new Error(`Unknown terminal report shortcut: ${reportId}`)
  }

  return report
}

function buildMarketInstrumentHandoff(args: {
  kind: 'price_index' | 'commodity_class'
  id: string
  label: string
}): AppRouteHandoff {
  return buildTerminalHandoff({
    focusType: 'market_instrument',
    focusId: `${args.kind}:${args.id}`,
    focusLabel: args.label,
    label: `Open ${args.label} brief`,
    rationale:
      'The terminal command opened a read-only instrument brief so you can review market context beside related trades, exposure, and workflow activity.',
    filter: args.id,
  })
}

function functionEntry(
  shortcut: TerminalFunctionShortcut,
  order: number,
): TerminalCommandEntry {
  return {
    id: `function:${shortcut.id}`,
    scope: 'function',
    title: shortcut.title,
    detail: shortcut.detail,
    action: shortcut.action,
    searchValues: [shortcut.title, shortcut.detail, ...shortcut.aliases],
    rankValues: [shortcut.title, ...shortcut.aliases],
    order,
  }
}

function buildStaticFunctionShortcuts(): TerminalFunctionShortcut[] {
  const eodReport = reportById('reports-trading-eod')
  const creditReport = reportById('reports-credit')
  const pnlReport = reportById('reports-valuation-snapshot')

  return [
    {
      id: 'mon',
      title: 'MON - Live Desk Monitor',
      detail: 'Open Live Desk for market monitor, watchlist, headline, price, and exposure context.',
      aliases: ['mon', 'monitor', 'mkt', 'mkts', 'live', 'live desk', 'market monitor'],
      action: {
        kind: 'view',
        view: 'dashboard',
        handoff: null,
      },
    },
    {
      id: 'risk',
      title: 'RISK - Exposure Workspace',
      detail: 'Open Exposure for risk summary, concentration, pricing coverage, and expiry pressure.',
      aliases: ['risk', 'exposure', 'risk board'],
      action: {
        kind: 'view',
        view: 'risk',
        handoff: null,
      },
    },
    {
      id: 'ops',
      title: 'OPS - Work Queue',
      detail: 'Open Work Queue for confirmations, blockers, credit exceptions, and operational handoffs.',
      aliases: ['ops', 'operations', 'queue', 'work queue'],
      action: {
        kind: 'view',
        view: 'operations',
        handoff: null,
      },
    },
    {
      id: 'setl',
      title: 'SETL - Settlement',
      detail: 'Open Settlement for invoices, payments, exception queues, and closeout readiness.',
      aliases: ['setl', 'stlmt', 'settlement'],
      action: {
        kind: 'view',
        view: 'settlement',
        handoff: null,
      },
    },
    {
      id: 'pos',
      title: 'POS - Net Positions',
      detail: 'Open Net Positions for commodity and book balances.',
      aliases: ['pos', 'positions', 'net positions', 'position'],
      action: {
        kind: 'view',
        view: 'positions',
        handoff: null,
      },
    },
    {
      id: 'sch',
      title: 'SCH - Scheduling',
      detail: 'Open Scheduling for delivery windows, nomination readiness, and scheduler blockers.',
      aliases: ['sch', 'sched', 'scheduling', 'scheduler'],
      action: {
        kind: 'view',
        view: 'scheduling',
        handoff: null,
      },
    },
    {
      id: 'eod',
      title: 'EOD - Trading EOD Report',
      detail: eodReport.detail,
      aliases: ['eod', 'end of day', 'close', 'trading eod', 'desk close'],
      action: reportAction(eodReport),
    },
    {
      id: 'cr',
      title: 'CR - Counterparty Credit Report',
      detail: creditReport.detail,
      aliases: ['cr', 'credit', 'counterparty credit', 'credit report'],
      action: reportAction(creditReport),
    },
    {
      id: 'pnl',
      title: 'PNL - Portfolio Snapshot',
      detail: pnlReport.detail,
      aliases: ['pnl', 'p&l', 'valuation', 'portfolio snapshot'],
      action: reportAction(pnlReport),
    },
    {
      id: 'ref',
      title: 'REF - Reference Data',
      detail: 'Open governed reference data for commodities, indices, counterparties, routes, and assets.',
      aliases: ['ref', 'reference', 'reference data', 'master data'],
      action: {
        kind: 'view',
        view: 'reference',
        handoff: null,
      },
    },
    {
      id: 'help',
      title: 'HELP - How It Works',
      detail: 'Open the in-product guide when the right workspace or shortcut is unclear.',
      aliases: ['help', 'guide', 'how it works'],
      action: {
        kind: 'view',
        view: 'guide',
        handoff: null,
      },
    },
  ]
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

function buildTerminalFunctionEntries(args: Omit<TerminalCommandSearchArgs, 'query' | 'isLoading'>): TerminalCommandEntry[] {
  const staticFunctionEntries = buildStaticFunctionShortcuts().map(functionEntry)
  const workspaceSetOffset = staticFunctionEntries.length
  const workspaceSetEntries = listTerminalWorkspaceSets().map((workspaceSet, index): TerminalCommandEntry => {
    const primaryRoute = getPrimaryTerminalWorkspaceSetRoute(workspaceSet)
    return {
      id: `function:workspace-set:${workspaceSet.id}`,
      scope: 'function',
      title: `WSET - ${workspaceSet.label}`,
      detail: `${workspaceSet.description} Opens ${primaryRoute.label}; use the Workspace Set launcher for companion pop-outs.`,
      action: {
        kind: 'view',
        view: primaryRoute.view,
        handoff: null,
      },
      searchValues: [
        'workspace set',
        'wset',
        'setup',
        'launch',
        workspaceSet.id,
        workspaceSet.label,
        workspaceSet.shortLabel,
        workspaceSet.description,
        workspaceSet.operatorGoal,
        ...workspaceSet.routes.flatMap((route) => [route.label, route.view, route.purpose]),
      ],
      rankValues: [workspaceSet.label, workspaceSet.shortLabel, workspaceSet.id, `setup ${workspaceSet.label}`],
      order: workspaceSetOffset + index,
    }
  })
  const priceIndexOffset = workspaceSetOffset + workspaceSetEntries.length
  const priceIndexBriefEntries = args.priceIndices.map((priceIndex, index): TerminalCommandEntry => ({
    id: `function:des:price-index:${priceIndex.code}`,
    scope: 'function',
    title: `DES - ${priceIndex.code}`,
    detail: `Open ${priceIndex.name} as a Live Desk instrument brief.`,
    action: {
      kind: 'view',
      view: 'dashboard',
      handoff: buildMarketInstrumentHandoff({
        kind: 'price_index',
        id: priceIndex.code,
        label: priceIndex.name,
      }),
    },
    searchValues: [
      'des',
      'describe',
      'brief',
      'instrument brief',
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
    rankValues: [priceIndex.code, priceIndex.name, `des ${priceIndex.code}`],
    order: priceIndexOffset + index,
  }))
  const commodityClassOffset = priceIndexOffset + priceIndexBriefEntries.length
  const commodityClasses = Array.from(
    new Set(
      [
        ...args.commodities.map((commodity) => commodity.commodity_class),
        ...args.trades.map((trade) => trade.commodity_class),
      ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((left, right) => left.localeCompare(right))
  const commodityClassBriefEntries = commodityClasses.map((commodityClass, index): TerminalCommandEntry => ({
    id: `function:des:commodity-class:${commodityClass}`,
    scope: 'function',
    title: `DES - ${commodityClass}`,
    detail: `Open ${commodityClass} as a Live Desk commodity-class instrument brief.`,
    action: {
      kind: 'view',
      view: 'dashboard',
      handoff: buildMarketInstrumentHandoff({
        kind: 'commodity_class',
        id: commodityClass,
        label: commodityClass,
      }),
    },
    searchValues: ['des', 'describe', 'brief', 'instrument brief', 'commodity class', commodityClass],
    rankValues: [commodityClass, `des ${commodityClass}`],
    order: commodityClassOffset + index,
  }))

  return [
    ...staticFunctionEntries,
    ...workspaceSetEntries,
    ...priceIndexBriefEntries,
    ...commodityClassBriefEntries,
  ]
}

function buildReportEntries(): TerminalCommandEntry[] {
  return REPORT_SHORTCUTS.map((report, index) => ({
    id: `report:${report.id}`,
    scope: 'report',
    title: report.title,
    detail: report.detail,
    action: reportAction(report),
    searchValues: [report.id, report.title, report.detail, 'reports', ...report.aliases],
    rankValues: [report.title, report.id, ...report.aliases],
    order: index,
  }))
}

function buildEntriesByScope(args: Omit<TerminalCommandSearchArgs, 'query' | 'isLoading'>): Record<
  TerminalCommandScope,
  TerminalCommandEntry[]
> {
  return {
    function: buildTerminalFunctionEntries(args),
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
        : scope === 'function'
          ? BLANK_FUNCTION_LIMIT
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
  const featuredFunctions = entriesByScope.function.slice(0, BLANK_FUNCTION_LIMIT)
  const blankTrades = entriesByScope.trade.slice(0, BLANK_TRADE_LIMIT)

  const groups: TerminalCommandResultGroup[] = [
    {
      scope: 'function',
      label: scopeLabel('function'),
      results: featuredFunctions.map(({ id, title, detail, action, scope: entryScope }) => ({
        id,
        scope: entryScope,
        title,
        detail,
        action,
      })),
    },
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
      : 'Try a function alias, trade ID, counterparty code, commodity name, price index, report title, or a scope prefix like trade: or report:.',
    scope: parsedQuery.scope,
  }
}
