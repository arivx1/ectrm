import {
  Suspense,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'

import './App.css'
import './appearance.css'
import {
  MOBILE_NAVIGATION_PANEL_ID,
  PRIMARY_NAV_SECTIONS,
  type PrimaryNavigationSectionKey,
  primaryNavigationSectionByKey,
  primaryNavigationSectionForView,
  primaryNavigationSectionRendersNestedViews,
  shouldHandleClientSideNavigation,
} from './app/navigation'
import { AppStartHereOverlay } from './entities/app/AppStartHereOverlay'
import { ProfileAvatarMenu } from './entities/app/ProfileAvatarMenu'
import { TerminalCommandBar } from './entities/app/TerminalCommandBar'
import { TerminalShortcutReference } from './entities/app/TerminalShortcutReference'
import { TerminalWorkspaceSetLauncher } from './entities/app/TerminalWorkspaceSetLauncher'
import { WorkspaceTopbarDatabaseSizeBadge } from './entities/app/WorkspaceTopbarDatabaseSizeBadge'
import { AppWorkspaceContent } from './entities/app/AppWorkspaceContent'
import {
  APP_VIEWS,
  HERO_BODY_BY_VIEW,
  HERO_TITLE_BY_VIEW,
  workspaceLabel,
} from './entities/app/appViews'
import { useAppRouteState } from './entities/app/useAppRouteState'
import { useAppShellState } from './entities/app/useAppShellState'
import { useAppStartHere } from './entities/app/useAppStartHere'
import { useAuthInterruptionFlow } from './entities/app/useAuthInterruptionFlow'
import { useStartHereRouting } from './entities/app/useStartHereRouting'
import { useAppTradeActions } from './entities/app/useAppTradeActions'
import { useAppAppearance } from './entities/app/useAppAppearance'
import { useAppTradeCaptureSettings } from './entities/app/useAppTradeCaptureSettings'
import { useAppWorkspaceData } from './entities/app/useAppWorkspaceData'
import { useAppWorkspaceSummary } from './entities/app/useAppWorkspaceSummary'
import {
  loadAttioClientEnrichment,
  type AttioClientEnrichmentRecord,
} from './entities/integrations/api'
import {
  isEditableShortcutTarget,
  resolveTerminalWorkspaceShortcut,
  terminalShortcutMatches,
} from './entities/app/terminalKeyboardShortcuts'
import {
  deriveWorkspaceStatus,
  isApiReachabilityMessage,
  isAuthenticationRequiredMessage,
  shouldPresentStartHereOverlay,
  shouldPresentSignedOutAuthGate,
  summarizeWorkspaceIssueMessage,
  VIEW_DATA_GROUPS,
} from './entities/app/workspaceLoading'
import { logoutCurrentSession } from './entities/auth/api'
import { AuthGate } from './entities/auth/AuthGate'
import { useReferenceDataController } from './features/reference-data/useReferenceDataController'
import { useTradeAmendForm } from './features/trades/useTradeAmendForm'
import { useTradeCaptureForm } from './features/trades/useTradeCaptureForm'
import { appConfig } from './shared/config'
import { DataSheet, type DataSheetColumn, type DataSheetRowAction } from './shared/ui/DataSheet'
import {
  buildRailRouteWorkspaceHandoff,
  describeAppRouteHandoff,
  getAppRouteHandoffTradeId,
  type AppRouteHandoff,
} from './shared/appRouteHandoff'
import { getAuthInterruptionResumeSnapshot } from './shared/authInterruptionResume'
import type { AuthInterruptionResumeSnapshot } from './shared/authInterruptionResume'
import {
  clearPromptSignInReturnIntent,
  formatPromptResumeIntentLabel,
  getPromptResumeIntent,
  getPromptSignInReturnIntent,
  subscribePromptResumeIntent,
  subscribePromptSignInReturnIntent,
} from './shared/promptResumeIntent'
import { commodityClassOrder } from './shared/trading'
import { PromptHomeAvailableTokenBadge } from './workspaces/prompt/PromptHomeAvailableTokenBadge'
import {
  ASSISTANT_TOKEN_TRACKER_ANCHOR_ID,
  ASSISTANT_TOKEN_TRACKER_VIEW_KEY,
} from './workspaces/assistant/assistantTokenTrackerAnchor'
import { resolvePriceIndexReportRouteFocus } from './workspaces/reports/reportRouteHandoffs'

function WorkspaceLoadState({
  title,
  detail,
}: {
  title: string
  detail: string
}) {
  return (
    <section className="surface empty-state">
      <strong>{title}</strong>
      <p>{detail}</p>
    </section>
  )
}

function WorkspaceErrorState({
  title,
  message,
  onRetry,
  retryPending = false,
}: {
  title: string
  message: string
  onRetry: () => void
  retryPending?: boolean
}) {
  return (
    <section className="surface empty-state">
      <strong>{title}</strong>
      <p>{message}</p>
      <button type="button" className="button button-secondary" onClick={onRetry} disabled={retryPending}>
        {retryPending ? 'Reconnecting...' : 'Retry workspace load'}
      </button>
    </section>
  )
}

function WorkspaceErrorBanner({
  message,
  onReconnect,
  reconnectPending = false,
}: {
  message: string
  onReconnect?: (() => void) | null
  reconnectPending?: boolean
}) {
  return (
    <div className={`error-banner workspace-error-banner ${onReconnect ? 'workspace-error-banner-actionable' : ''}`}>
      <span className="workspace-error-banner-copy">{message}</span>
      {onReconnect ? (
        <button
          type="button"
          className="button button-secondary workspace-error-banner-action"
          onClick={onReconnect}
          disabled={reconnectPending}
        >
          {reconnectPending ? 'Reconnecting...' : 'Reconnect'}
        </button>
      ) : null}
    </div>
  )
}

function visibleElements<TElement extends HTMLElement>(elements: TElement[]): TElement[] {
  return elements.filter((element) => element.offsetParent !== null)
}

function focusLocalWorkspaceFilter(): boolean {
  const input = document.querySelector<HTMLInputElement>('[data-terminal-shortcut-target="local-filter"]')
  if (!input || input.offsetParent === null) {
    return false
  }

  input.focus()
  input.select()
  return true
}

function focusWorkspaceTile(direction: 'next' | 'previous'): boolean {
  const tiles = visibleElements(
    Array.from(document.querySelectorAll<HTMLElement>('[data-terminal-shortcut-target="workspace-tile"]')),
  )
  if (tiles.length === 0) {
    return false
  }

  const activeTile = document.activeElement?.closest<HTMLElement>('[data-terminal-shortcut-target="workspace-tile"]')
  const activeIndex = activeTile ? tiles.indexOf(activeTile) : -1
  const nextIndex =
    activeIndex === -1
      ? direction === 'next'
        ? 0
        : tiles.length - 1
      : direction === 'next'
        ? (activeIndex + 1) % tiles.length
        : (activeIndex - 1 + tiles.length) % tiles.length
  const nextTile = tiles[nextIndex]
  nextTile.focus({ preventScroll: true })
  nextTile.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  return true
}

function focusMainStage(): void {
  const mainStage = document.querySelector<HTMLElement>('[data-terminal-shortcut-target="main-stage"]')
  mainStage?.focus({ preventScroll: true })
}

type AppRouteController = ReturnType<typeof useAppRouteState>
type AppShellController = ReturnType<typeof useAppShellState>
type AppAppearanceController = ReturnType<typeof useAppAppearance>
type AppTradeCaptureSettingsController = ReturnType<typeof useAppTradeCaptureSettings>
type AppWorkspaceDataController = ReturnType<typeof useAppWorkspaceData>
type AppStartHereRoutingController = ReturnType<typeof useStartHereRouting>

const WORKSPACE_PRODUCTS = [
  { key: 'strata', label: 'Strata' },
  { key: 'nexus', label: 'Nexus' },
] as const

type WorkspaceProductKey = (typeof WORKSPACE_PRODUCTS)[number]['key']

const NEXUS_NAV_ITEMS = [
  { key: 'crm', kicker: 'Relationship', label: 'CRM' },
  { key: 'todo', kicker: 'Work', label: 'To-Do' },
  { key: 'tools', label: 'Tools' },
] as const

type NexusViewKey = (typeof NEXUS_NAV_ITEMS)[number]['key'] | 'client'

const NEXUS_EXISTING_CLIENT_BASE = [
  'Abercore',
  'American Plant Food',
  'Asili',
  'Cargill',
  'Cefetra',
  'CIAMSA',
  'Crown Point',
  'CSC Sugar',
  'Cumberland',
  'ETG',
  'Fibre Trade',
  'Hartree',
  'Howlett Farms',
  'International Materials',
  'Interoceanic',
  'LinkOne',
  'Redwood Group',
  'Ryco Holdings',
  'Smirks',
  'Spring Valley',
  'SureSource',
  'Telf Ag',
  'Westfeldt Brothers',
] as const

type NexusClientName = string

type NexusClientRecord = {
  clientName: NexusClientName
  relationship: string
  nextAction: string
}

type NexusClientDraft = NexusClientRecord

const DEFAULT_NEXUS_CLIENT_RELATIONSHIP = 'Existing client'

function createNexusClientRecord(clientName: NexusClientName): NexusClientRecord {
  return {
    clientName,
    relationship: DEFAULT_NEXUS_CLIENT_RELATIONSHIP,
    nextAction: '',
  }
}

const WORKSPACE_TOPBAR_TITLE_SIZER_LABEL = [
  ...APP_VIEWS.map((view) => view.label),
  ...PRIMARY_NAV_SECTIONS.map((section) => section.label),
  ...NEXUS_NAV_ITEMS.map((item) => item.label),
  ...NEXUS_EXISTING_CLIENT_BASE,
].reduce((longest, label) => (label.length > longest.length ? label : longest), 'Workspace')

type NexusTodo = {
  id: string
  clientName: NexusClientName
  title: string
}

type NexusTool = {
  id: string
  title: string
  url: string | null
  accessMethod: boolean
  application: boolean
  browser: boolean
  api: boolean
}

type NexusToolBooleanDraft = Pick<NexusTool, 'accessMethod' | 'application' | 'browser' | 'api'>

function createNexusToolBooleanDraft(): NexusToolBooleanDraft {
  return {
    accessMethod: false,
    application: false,
    browser: false,
    api: false,
  }
}

function renderNexusBooleanCell(value: boolean) {
  return <span className={`nexus-boolean-cell ${value ? 'is-true' : 'is-false'}`}>{value ? 'TRUE' : 'FALSE'}</span>
}

function formatAttioMatchBasis(matchBasis: AttioClientEnrichmentRecord['match_basis']): string {
  if (matchBasis === 'exact_name') {
    return 'Name match'
  }
  if (matchBasis === 'search') {
    return 'Search match'
  }
  return 'No match'
}

function buildAttioDealMeta(deal: AttioClientEnrichmentRecord['deals'][number]): string {
  return [deal.stage, deal.value, deal.close_date].filter(Boolean).join(' - ')
}

function buildAttioContactMeta(contact: AttioClientEnrichmentRecord['contacts'][number]): string {
  return [contact.title, contact.email, contact.phone].filter(Boolean).join(' - ')
}

type NexusContact = {
  id: string
  clientName: NexusClientName
  name: string
}

type NexusClientRow = {
  clientName: NexusClientName
  relationship: string
  relationshipSortRank: number
  contactCount: number
  todoCount: number
  nextAction: string
}

function resolveNexusRelationshipSortRank(relationship: string): number {
  return relationship
    .trim()
    .localeCompare(DEFAULT_NEXUS_CLIENT_RELATIONSHIP, undefined, { sensitivity: 'accent' }) === 0
    ? 0
    : 1
}

const NEXUS_CLIENT_TABLE_COLUMNS: DataSheetColumn<NexusClientRow>[] = [
  {
    id: 'row-number',
    label: 'ID',
    width: '3.4rem',
    align: 'end',
    enableSort: false,
    enableFilter: false,
    renderCell: (_row, rowIndex) => String(rowIndex + 1).padStart(2, '0'),
  },
  {
    id: 'client',
    label: 'Client',
    width: '18rem',
    filterPlaceholder: 'Client',
    sortValue: (row) => row.clientName,
    filterValue: (row) => row.clientName,
    renderCell: (row) => <strong className="nexus-client-name">{row.clientName}</strong>,
  },
  {
    id: 'relationship',
    label: 'Relationship',
    width: '12rem',
    filterPlaceholder: 'Type',
    sortValue: (row) => row.relationshipSortRank,
    filterValue: (row) => row.relationship,
    renderCell: (row) => <span className="nexus-client-status">{row.relationship}</span>,
  },
  {
    id: 'contacts',
    label: 'Contacts',
    width: '9rem',
    align: 'end',
    filterPlaceholder: 'Count',
    sortValue: (row) => row.contactCount,
    filterValue: (row) => `${row.contactCount} contact${row.contactCount === 1 ? '' : 's'}`,
    renderCell: (row) => (
      <span className="nexus-client-contact-count">
        {row.contactCount} contact{row.contactCount === 1 ? '' : 's'}
      </span>
    ),
  },
  {
    id: 'todo-count',
    label: 'Open To-Dos',
    width: '10rem',
    align: 'end',
    filterPlaceholder: 'Count',
    sortValue: (row) => row.todoCount,
    filterValue: (row) => `${row.todoCount} open`,
    renderCell: (row) => <span className="nexus-client-todo-count">{row.todoCount} open</span>,
  },
  {
    id: 'next-action',
    label: 'Next Action',
    width: '14rem',
    filterPlaceholder: 'Action',
    sortValue: (row) => row.nextAction,
    filterValue: (row) => row.nextAction,
    renderCell: (row) => <span className="nexus-client-next-action">{row.nextAction}</span>,
  },
]

const NEXUS_TOOL_TABLE_COLUMNS: DataSheetColumn<NexusTool>[] = [
  {
    id: 'row-number',
    label: 'ID',
    width: '3.4rem',
    align: 'end',
    enableSort: false,
    enableFilter: false,
    renderCell: (_row, rowIndex) => String(rowIndex + 1).padStart(2, '0'),
  },
  {
    id: 'tool',
    label: 'Tool',
    width: '18rem',
    filterPlaceholder: 'Tool',
    sortValue: (row) => row.title,
    filterValue: (row) => row.title,
    renderCell: (row) => <strong className="nexus-tool-name">{row.title}</strong>,
  },
  {
    id: 'link',
    label: 'Link',
    width: '22rem',
    filterPlaceholder: 'Link',
    sortValue: (row) => row.url ?? '',
    filterValue: (row) => row.url ?? 'No link added',
    renderCell: (row) => (
      <span className={row.url ? 'nexus-tool-link' : 'nexus-tool-link nexus-tool-link-empty'}>
        {row.url ?? 'No link added'}
      </span>
    ),
  },
  {
    id: 'access-method',
    label: 'Access Method',
    width: '9rem',
    align: 'center',
    filterPlaceholder: 'TRUE/FALSE',
    sortValue: (row) => row.accessMethod,
    filterValue: (row) => (row.accessMethod ? 'TRUE' : 'FALSE'),
    renderCell: (row) => renderNexusBooleanCell(row.accessMethod),
  },
  {
    id: 'application',
    label: 'Application',
    width: '8rem',
    align: 'center',
    filterPlaceholder: 'TRUE/FALSE',
    sortValue: (row) => row.application,
    filterValue: (row) => (row.application ? 'TRUE' : 'FALSE'),
    renderCell: (row) => renderNexusBooleanCell(row.application),
  },
  {
    id: 'browser',
    label: 'Browser',
    width: '8rem',
    align: 'center',
    filterPlaceholder: 'TRUE/FALSE',
    sortValue: (row) => row.browser,
    filterValue: (row) => (row.browser ? 'TRUE' : 'FALSE'),
    renderCell: (row) => renderNexusBooleanCell(row.browser),
  },
  {
    id: 'api',
    label: 'API',
    width: '6rem',
    align: 'center',
    filterPlaceholder: 'TRUE/FALSE',
    sortValue: (row) => row.api,
    filterValue: (row) => (row.api ? 'TRUE' : 'FALSE'),
    renderCell: (row) => renderNexusBooleanCell(row.api),
  },
]

type AuthenticatedWorkspaceShellProps = {
  route: AppRouteController
  shell: AppShellController
  appearance: AppAppearanceController
  activeProduct: WorkspaceProductKey
  setActiveProduct: (product: WorkspaceProductKey) => void
  tradeCapturePreferences: AppTradeCaptureSettingsController
  workspaceData: AppWorkspaceDataController
  startHereRouting: AppStartHereRoutingController
  showStartHereOverlay: boolean
  dismissStartHere: () => void
  onSignOut: () => Promise<void>
  signOutPending: boolean
  signOutError: string
  isNavSectionOpen: (sectionKey: PrimaryNavigationSectionKey) => boolean
  toggleNavSection: (sectionKey: PrimaryNavigationSectionKey) => void
}

function AuthenticatedWorkspaceShell({
  route,
  shell,
  appearance,
  activeProduct,
  setActiveProduct,
  tradeCapturePreferences,
  workspaceData,
  startHereRouting,
  showStartHereOverlay,
  dismissStartHere,
  onSignOut,
  signOutPending,
  signOutError,
  isNavSectionOpen,
  toggleNavSection,
}: AuthenticatedWorkspaceShellProps) {
  const { currentView, routeHandoff, selectedTradeId } = route
  const authSession = workspaceData.authSession
  const [activeNexusView, setActiveNexusView] = useState<NexusViewKey>('crm')
  const [nexusClients, setNexusClients] = useState<NexusClientRecord[]>(() =>
    NEXUS_EXISTING_CLIENT_BASE.map((clientName) => createNexusClientRecord(clientName)),
  )
  const [nexusClientDraft, setNexusClientDraft] = useState<NexusClientDraft>(() => createNexusClientRecord(''))
  const [selectedNexusClient, setSelectedNexusClient] = useState<NexusClientName>(NEXUS_EXISTING_CLIENT_BASE[0])
  const [nexusContactDraft, setNexusContactDraft] = useState('')
  const [nexusContacts, setNexusContacts] = useState<NexusContact[]>([])
  const [nexusTodoDraft, setNexusTodoDraft] = useState('')
  const [nexusTodoClientDraft, setNexusTodoClientDraft] = useState<NexusClientName>(NEXUS_EXISTING_CLIENT_BASE[0])
  const [nexusTodos, setNexusTodos] = useState<NexusTodo[]>([])
  const [nexusToolTitleDraft, setNexusToolTitleDraft] = useState('')
  const [nexusToolUrlDraft, setNexusToolUrlDraft] = useState('')
  const [nexusToolBooleanDraft, setNexusToolBooleanDraft] = useState<NexusToolBooleanDraft>(() =>
    createNexusToolBooleanDraft(),
  )
  const [nexusTools, setNexusTools] = useState<NexusTool[]>([])
  const [selectedNexusToolId, setSelectedNexusToolId] = useState<string | null>(null)
  const [attioClientEnrichmentByName, setAttioClientEnrichmentByName] = useState<
    Record<string, AttioClientEnrichmentRecord>
  >({})
  const [attioClientEnrichmentLoading, setAttioClientEnrichmentLoading] = useState(false)
  const [attioClientEnrichmentError, setAttioClientEnrichmentError] = useState('')
  const isNexusProduct = activeProduct === 'nexus'
  const activeNexusNavItem =
    NEXUS_NAV_ITEMS.find((item) => item.key === activeNexusView) ?? NEXUS_NAV_ITEMS[0]
  const trimmedNexusClientDraft = nexusClientDraft.clientName.trim()
  const nexusClientDraftAlreadyExists =
    trimmedNexusClientDraft.length > 0 &&
    nexusClients.some(
      (client) => client.clientName.localeCompare(trimmedNexusClientDraft, undefined, { sensitivity: 'accent' }) === 0,
    )
  const selectedNexusClientTodos = useMemo(
    () => nexusTodos.filter((todo) => todo.clientName === selectedNexusClient),
    [nexusTodos, selectedNexusClient],
  )
  const selectedNexusClientContacts = useMemo(
    () => nexusContacts.filter((contact) => contact.clientName === selectedNexusClient),
    [nexusContacts, selectedNexusClient],
  )
  const selectedAttioClientEnrichment = attioClientEnrichmentByName[selectedNexusClient] ?? null
  const nexusContactCountByClient = useMemo(() => {
    const counts = new Map<NexusClientName, number>()
    nexusContacts.forEach((contact) => {
      counts.set(contact.clientName, (counts.get(contact.clientName) ?? 0) + 1)
    })
    return counts
  }, [nexusContacts])
  const nexusTodoCountByClient = useMemo(() => {
    const counts = new Map<NexusClientName, number>()
    nexusTodos.forEach((todo) => {
      counts.set(todo.clientName, (counts.get(todo.clientName) ?? 0) + 1)
    })
    return counts
  }, [nexusTodos])
  const nexusClientRows = useMemo(
    () =>
      nexusClients.map((client) => {
        const clientName = client.clientName
        const relationship = client.relationship.trim() || DEFAULT_NEXUS_CLIENT_RELATIONSHIP
        const contactCount = nexusContactCountByClient.get(clientName) ?? 0
        const todoCount = nexusTodoCountByClient.get(clientName) ?? 0
        const nextAction = client.nextAction.trim() || (todoCount > 0 ? 'Review open To-Dos' : 'Add To-Do')

        return {
          clientName,
          relationship,
          relationshipSortRank: resolveNexusRelationshipSortRank(relationship),
          contactCount,
          todoCount,
          nextAction,
        }
      }),
    [nexusClients, nexusContactCountByClient, nexusTodoCountByClient],
  )
  const activePrimarySection = route.activeNavigationSectionKey
    ? primaryNavigationSectionByKey(route.activeNavigationSectionKey)
    : primaryNavigationSectionForView(currentView)
  const routeHandoffBanner = useMemo(
    () => describeAppRouteHandoff(routeHandoff, currentView),
    [currentView, routeHandoff],
  )
  const currentWorkspaceOwnsHandoffBanner =
    currentView === 'operations' ||
    currentView === 'settlement' ||
    currentView === 'reports' ||
    currentView === 'trades' ||
    currentView === 'shipments' ||
    currentView === 'scheduling'
  const priceReportRouteFocus =
    currentView === 'reports' ? resolvePriceIndexReportRouteFocus(routeHandoff) : null

  const summary = useAppWorkspaceSummary({
    authSession: workspaceData.authSession,
    bootstrapSummary: workspaceData.workspaceBootstrapSummary,
    trades: workspaceData.trades,
    events: workspaceData.events,
    positions: workspaceData.positions,
    books: workspaceData.books,
    commodities: workspaceData.commodities,
    counterparties: workspaceData.counterparties,
    currencies: workspaceData.currencies,
    units: workspaceData.units,
    locations: workspaceData.locations,
    portfolios: workspaceData.portfolios,
    selectedTradeId,
    setSelectedTradeId: route.setSelectedTradeId,
    eventFilter: shell.eventFilter,
    commodityClassOrder,
  })

  const captureForm = useTradeCaptureForm(
    workspaceData.tradeMetadata,
    summary.activeBooks,
    summary.commodityClassOptions,
    summary.activeCommodities,
    tradeCapturePreferences.tradeCaptureSettings,
    workspaceData.trades.map((trade) => trade.trade_id),
    workspaceData.priceIndices,
    summary.activeCounterparties,
    summary.activePortfolios,
    summary.activeUnits,
    summary.activeCurrencies,
    summary.activeLocations,
  )

  const amendForm = useTradeAmendForm(
    summary.selectedTrade,
    summary.selectedTradeEvents,
    workspaceData.tradeMetadata,
    summary.activeBooks,
    summary.commodityClassOptions,
    summary.activeCommodities,
    workspaceData.priceIndices,
    summary.activeCounterparties,
    summary.activePortfolios,
    summary.activeUnits,
    summary.activeCurrencies,
    summary.activeLocations,
  )

  function navigateToTrade(tradeId: string, handoff: AppRouteHandoff | null = null) {
    route.navigateToTrade(tradeId, handoff)
    shell.setInspectorTab(handoff?.tradeInspectorTab ?? 'overview')
  }

  const tradeActions = useAppTradeActions({
    authSession,
    captureForm,
    amendForm,
    counterpartyCreditProfiles: workspaceData.counterpartyCreditProfiles,
    refreshMutationData: workspaceData.refreshMutationData,
    selectedTrade: summary.selectedTrade,
    selectedTradeEvents: summary.selectedTradeEvents,
    selectedTradeId,
    setError: workspaceData.setError,
    setInspectorTab: shell.setInspectorTab,
    trades: workspaceData.trades,
    navigateToTrade,
    navigateToView: route.navigateToView,
    findCounterpartyCreditRestriction: summary.findCounterpartyCreditRestriction,
  })

  const referenceState = useReferenceDataController({
    apiBase: appConfig.apiBase,
    reloadData: workspaceData.loadData,
    trades: workspaceData.trades,
    books: workspaceData.books,
    assets: workspaceData.assets,
    commodities: workspaceData.commodities,
    priceIndices: workspaceData.priceIndices,
    currencies: workspaceData.currencies,
    units: workspaceData.units,
    locations: workspaceData.locations,
    railRoutes: workspaceData.railRoutes,
    spatialFeatures: workspaceData.spatialFeatures,
    counterparties: workspaceData.counterparties,
    counterpartyCreditProfiles: workspaceData.counterpartyCreditProfiles,
    counterpartyExternalCreditSnapshots: workspaceData.counterpartyExternalCreditSnapshots,
    counterpartyCreditReport: workspaceData.counterpartyCreditReport,
    portfolios: workspaceData.portfolios,
    activeBooks: summary.activeBooks,
    activeCommodities: summary.activeCommodities,
    activeCurrencies: summary.activeCurrencies,
    activeUnits: summary.activeUnits,
    activeLocations: summary.activeLocations,
    assetStandards: workspaceData.assetStandards,
    spatialFeatureStandards: workspaceData.spatialFeatureStandards,
    locationStandards: workspaceData.locationStandards,
    counterpartyStandards: workspaceData.counterpartyStandards,
    commodityClassOrder,
    externalReferenceSearch: '',
    onOpenRailRouteScheduling: (code, label) =>
      route.navigateToView(
        'scheduling',
        buildRailRouteWorkspaceHandoff({
          source: 'reference',
          railRouteCode: code,
          railRouteLabel: label,
          targetView: 'scheduling',
        }),
      ),
  })

  const {
    blockingWorkspaceError,
    workspaceLoading,
    workspaceWarning,
    systemStateLabel,
    systemStateTone,
  } = deriveWorkspaceStatus({
    appLoading: workspaceData.appLoading,
    currentView,
    error: workspaceData.error,
    groupErrors: workspaceData.groupErrors,
    groupLoaded: workspaceData.groupLoaded,
    groupLoading: workspaceData.groupLoading,
  })

  const showingNavigationSectionLanding = route.activeNavigationSectionKey !== null
  const heroTitle = showingNavigationSectionLanding
    ? activePrimarySection.heroTitle
    : priceReportRouteFocus
      ? priceReportRouteFocus.heroTitle
      : HERO_TITLE_BY_VIEW[currentView]
  const heroBody = showingNavigationSectionLanding
    ? activePrimarySection.heroBody
    : priceReportRouteFocus
      ? priceReportRouteFocus.heroBody
      : HERO_BODY_BY_VIEW[currentView]
  const isPromptHomeView = !showingNavigationSectionLanding && currentView === 'prompt'
  const isMessagingWorkspaceView = !showingNavigationSectionLanding && currentView === 'messages'
  const isPriceReportRouteFocus = Boolean(priceReportRouteFocus)
  const displayedHeroTitle = isMessagingWorkspaceView ? `Messaging: ${heroTitle}` : heroTitle
  const displayedHeroBody = isMessagingWorkspaceView ? '' : heroBody
  const showHeroBadge = showingNavigationSectionLanding || (currentView !== 'library' && currentView !== 'messages')
  const mainStageClassName = [
    'main-stage',
    isPromptHomeView && !isNexusProduct ? 'main-stage-prompt' : null,
    isMessagingWorkspaceView ? 'main-stage-messages' : null,
    isNexusProduct ? 'main-stage-nexus' : null,
  ]
    .filter(Boolean)
    .join(' ')
  const heroClassName = [
    'hero',
    isMessagingWorkspaceView ? 'hero-compact' : null,
    isPriceReportRouteFocus ? 'hero-price-report' : null,
  ]
    .filter(Boolean)
    .join(' ')
  const hasAuthenticationIssue =
    isAuthenticationRequiredMessage(workspaceData.error) ||
    Object.values(workspaceData.groupErrors).some((message) => isAuthenticationRequiredMessage(message))
  const effectiveSystemStateLabel = !authSession && hasAuthenticationIssue ? 'Needs sign-in' : systemStateLabel
  const effectiveSystemStateTone = !authSession && hasAuthenticationIssue ? 'active' : systemStateTone
  const workspaceShellErrorMessage = summarizeWorkspaceIssueMessage(workspaceData.error)
  const workspaceWarningMessage = workspaceWarning
    ? summarizeWorkspaceIssueMessage(workspaceData.groupErrors[workspaceWarning], workspaceWarning)
    : ''
  const blockingWorkspaceMessage = blockingWorkspaceError
    ? summarizeWorkspaceIssueMessage(
        workspaceData.groupErrors[blockingWorkspaceError],
        blockingWorkspaceError,
      )
    : ''
  const selectedTrade = summary.selectedTrade
  const currentWorkspaceLabel =
    priceReportRouteFocus?.badgeLabel ??
    APP_VIEWS.find((view) => view.key === route.currentView)?.label ??
    workspaceLabel(route.currentView)
  const currentWorkspaceDetail =
    priceReportRouteFocus?.badgeDetail ?? `${workspaceData.events.length} loaded events across the current session`
  const topbarWorkspaceLabel = showingNavigationSectionLanding
    ? activePrimarySection.label
    : currentWorkspaceLabel
  const displayedTopbarWorkspaceLabel = isNexusProduct
    ? activeNexusView === 'client'
      ? selectedNexusClient
      : activeNexusNavItem.label
    : topbarWorkspaceLabel
  const shellModeClassName = appearance.isTerminalMode ? 'app-shell-terminal-mode' : ''
  const [terminalCommandBarOpen, setTerminalCommandBarOpen] = useState(false)
  const [shortcutReferenceOpen, setShortcutReferenceOpen] = useState(false)
  const workspaceReconnectPending =
    workspaceData.groupLoading.core ||
    VIEW_DATA_GROUPS[currentView].some((group) => workspaceData.groupLoading[group])
  const workspaceShellReconnectAvailable = isApiReachabilityMessage(workspaceData.error)
  const workspaceWarningReconnectAvailable = workspaceWarning
    ? isApiReachabilityMessage(workspaceData.groupErrors[workspaceWarning])
    : false
  const terminalSearchLoading = workspaceData.appLoading || workspaceData.groupLoading.core

  function openTerminalCommandBar() {
    shell.setMobileNavOpen(false)
    setTerminalCommandBarOpen(true)
  }

  function closeTerminalCommandBar() {
    setTerminalCommandBarOpen(false)
  }

  const openShortcutReference = useCallback(() => {
    shell.setMobileNavOpen(false)
    setShortcutReferenceOpen(true)
  }, [shell])

  function closeShortcutReference() {
    setShortcutReferenceOpen(false)
  }

  const resetWorkspaceFocus = useCallback(() => {
    route.replaceView(route.currentView, null)
    shell.setMobileNavOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.setTimeout(focusMainStage, 0)
  }, [route, shell])

  useEffect(() => {
    function handleTerminalShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented) {
        return
      }

      if (shortcutReferenceOpen && event.key === 'Escape') {
        event.preventDefault()
        closeShortcutReference()
        return
      }

      if (terminalCommandBarOpen) {
        return
      }

      const editableTarget = isEditableShortcutTarget(event.target)
      if (!editableTarget && terminalShortcutMatches('shortcut-reference', event)) {
        event.preventDefault()
        openShortcutReference()
        return
      }

      if (editableTarget || shortcutReferenceOpen) {
        return
      }

      const workspaceShortcut = resolveTerminalWorkspaceShortcut(event)
      if (workspaceShortcut) {
        event.preventDefault()
        setActiveProduct('strata')
        route.navigateToView(workspaceShortcut.view)
        shell.setMobileNavOpen(false)
        return
      }

      if (terminalShortcutMatches('focus-filter', event)) {
        if (focusLocalWorkspaceFilter()) {
          event.preventDefault()
        }
        return
      }

      if (terminalShortcutMatches('next-tile', event)) {
        if (focusWorkspaceTile('next')) {
          event.preventDefault()
        }
        return
      }

      if (terminalShortcutMatches('previous-tile', event)) {
        if (focusWorkspaceTile('previous')) {
          event.preventDefault()
        }
        return
      }

      if (terminalShortcutMatches('reset-focus', event)) {
        event.preventDefault()
        resetWorkspaceFocus()
      }
    }

    window.addEventListener('keydown', handleTerminalShortcut)
    return () => window.removeEventListener('keydown', handleTerminalShortcut)
  }, [
    openShortcutReference,
    resetWorkspaceFocus,
    route,
    setActiveProduct,
    shell,
    shortcutReferenceOpen,
    terminalCommandBarOpen,
  ])

  useEffect(() => {
    if (!isNexusProduct || activeNexusView !== 'client' || !authSession?.accessToken) {
      setAttioClientEnrichmentLoading(false)
      return
    }

    if (selectedAttioClientEnrichment) {
      setAttioClientEnrichmentLoading(false)
      setAttioClientEnrichmentError('')
      return
    }

    let cancelled = false
    setAttioClientEnrichmentLoading(true)
    setAttioClientEnrichmentError('')

    loadAttioClientEnrichment(appConfig.apiBase, authSession.accessToken, selectedNexusClient)
      .then((payload) => {
        if (cancelled) {
          return
        }
        setAttioClientEnrichmentByName((currentEnrichment) => ({
          ...currentEnrichment,
          [selectedNexusClient]: payload,
        }))
        setAttioClientEnrichmentLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }
        const message = error instanceof Error ? error.message : 'Attio client data could not be loaded.'
        setAttioClientEnrichmentError(message)
        setAttioClientEnrichmentLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    activeNexusView,
    authSession?.accessToken,
    isNexusProduct,
    selectedAttioClientEnrichment,
    selectedNexusClient,
  ])

  function handleReconnectWorkspace() {
    void workspaceData
      .loadData({
        groups: VIEW_DATA_GROUPS[currentView],
        force: true,
      })
      .catch(() => {
        // The workspace hook already records the failure state for the shell banners.
      })
  }

  function renderTerminalCommandTrigger(className?: string) {
    return (
      <button
        type="button"
        className={['button button-ghost terminal-command-trigger', className].filter(Boolean).join(' ')}
        onClick={openTerminalCommandBar}
      >
        <span className="terminal-command-trigger-copy">
          <strong>Search</strong>
          <small>Open a workspace or record</small>
        </span>
        <span className="terminal-command-trigger-shortcut">Ctrl/Cmd+K</span>
      </button>
    )
  }

  function renderShortcutReferenceTrigger(className?: string) {
    return (
      <button
        type="button"
        className={['button button-ghost terminal-shortcut-trigger', className].filter(Boolean).join(' ')}
        onClick={openShortcutReference}
        aria-label="Show terminal keyboard shortcuts"
      >
        <span>Shortcuts</span>
        <kbd>?</kbd>
      </button>
    )
  }

  function navigateNexusBack() {
    if (activeNexusView === 'crm') {
      setActiveProduct('strata')
    } else {
      setActiveNexusView('crm')
    }
    shell.setMobileNavOpen(false)
  }

  function renderBackButton(className?: string) {
    const backDisabled = isNexusProduct ? false : !route.canNavigateBack
    const nexusBackTarget = activeNexusView === 'crm' ? 'Strata' : 'CRM'

    return (
      <button
        type="button"
        className={['button button-ghost app-back-button', className].filter(Boolean).join(' ')}
        onClick={() => {
          if (isNexusProduct) {
            navigateNexusBack()
            return
          }
          route.navigateBack()
          shell.setMobileNavOpen(false)
        }}
        disabled={backDisabled}
        aria-label={isNexusProduct ? `Go back to ${nexusBackTarget}` : 'Go back to the previous view'}
        title={backDisabled ? 'No previous view' : isNexusProduct ? `Back to ${nexusBackTarget}` : 'Go back'}
      >
        Back
      </button>
    )
  }

  function renderWorkspaceSetLauncher() {
    if (!appearance.isTerminalMode) {
      return null
    }

    return (
      <TerminalWorkspaceSetLauncher
        hrefForView={(view) =>
          route.hrefForView(view, {
            tradeId: null,
            messagingConversationId: null,
            libraryDocumentId: null,
          })
        }
        navigateToView={(view) => {
          setActiveProduct('strata')
          route.navigateToView(view, null, {
            tradeId: null,
            messagingConversationId: null,
            libraryDocumentId: null,
          })
        }}
        onNavigate={() => shell.setMobileNavOpen(false)}
      />
    )
  }

  function renderAttioClientSection() {
    const enrichment = selectedAttioClientEnrichment
    const company = enrichment?.company ?? null

    return (
      <section className="nexus-attio-section" aria-labelledby="nexus-attio-heading">
        <div className="nexus-section-head nexus-attio-head">
          <div>
            <span className="eyebrow">Attio</span>
            <strong id="nexus-attio-heading">Relationship data</strong>
          </div>
          {company?.web_url ? (
            <a className="button button-ghost nexus-attio-open" href={company.web_url} target="_blank" rel="noreferrer">
              Open Attio
            </a>
          ) : null}
        </div>

        {attioClientEnrichmentLoading ? (
          <div className="nexus-attio-empty">Loading Attio...</div>
        ) : attioClientEnrichmentError ? (
          <div className="nexus-attio-empty nexus-attio-error" role="alert">
            {attioClientEnrichmentError}
          </div>
        ) : !enrichment ? (
          <div className="nexus-attio-empty">No Attio data loaded.</div>
        ) : !enrichment.matched || !company ? (
          <div className="nexus-attio-empty">No Attio company match found.</div>
        ) : (
          <>
            <div className="nexus-attio-company">
              <div className="nexus-attio-company-title">
                <strong>{company.label}</strong>
                <span>{company.status ?? formatAttioMatchBasis(enrichment.match_basis)}</span>
              </div>
              {company.domains.length > 0 ? (
                <div className="nexus-attio-domain-list" aria-label="Attio company domains">
                  {company.domains.map((domain) => (
                    <span key={domain}>{domain}</span>
                  ))}
                </div>
              ) : null}
              {company.description ? <p>{company.description}</p> : null}
              {enrichment.warnings.length > 0 ? (
                <div className="nexus-attio-warning">{enrichment.warnings.join(' ')}</div>
              ) : null}
            </div>

            <div className="nexus-attio-grid">
              <section className="nexus-attio-column" aria-labelledby="nexus-attio-contacts-heading">
                <div className="nexus-section-head">
                  <span className="eyebrow">Contacts</span>
                  <strong id="nexus-attio-contacts-heading">{enrichment.contacts.length}</strong>
                </div>
                {enrichment.contacts.length > 0 ? (
                  <ul className="nexus-attio-list">
                    {enrichment.contacts.map((contact) => {
                      const contactMeta = buildAttioContactMeta(contact)
                      return (
                        <li key={contact.record_id}>
                          <div>
                            {contact.web_url ? (
                              <a href={contact.web_url} target="_blank" rel="noreferrer">
                                {contact.name}
                              </a>
                            ) : (
                              <strong>{contact.name}</strong>
                            )}
                            <span>{contactMeta || 'No Attio detail'}</span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className="nexus-attio-empty nexus-attio-empty-compact">No Attio contacts.</div>
                )}
              </section>

              <section className="nexus-attio-column" aria-labelledby="nexus-attio-deals-heading">
                <div className="nexus-section-head">
                  <span className="eyebrow">Deals</span>
                  <strong id="nexus-attio-deals-heading">{enrichment.deals.length}</strong>
                </div>
                {enrichment.deals.length > 0 ? (
                  <ul className="nexus-attio-list">
                    {enrichment.deals.map((deal) => {
                      const dealMeta = buildAttioDealMeta(deal)
                      return (
                        <li key={deal.record_id}>
                          <div>
                            {deal.web_url ? (
                              <a href={deal.web_url} target="_blank" rel="noreferrer">
                                {deal.name}
                              </a>
                            ) : (
                              <strong>{deal.name}</strong>
                            )}
                            <span>{dealMeta || 'No Attio detail'}</span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className="nexus-attio-empty nexus-attio-empty-compact">No Attio deals.</div>
                )}
              </section>
            </div>
          </>
        )}
      </section>
    )
  }

  function openNexusClient(clientName: NexusClientName) {
    setSelectedNexusClient(clientName)
    setNexusTodoClientDraft(clientName)
    setNexusContactDraft('')
    setNexusTodoDraft('')
    setActiveNexusView('client')
    shell.setMobileNavOpen(false)
  }

  function updateNexusClientDraft(field: keyof NexusClientDraft, value: string) {
    setNexusClientDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }))
  }

  function handleAddNexusClient() {
    const clientName = nexusClientDraft.clientName.trim()
    if (!clientName) {
      return
    }

    const existingClient = nexusClients.find(
      (currentClient) => currentClient.clientName.localeCompare(clientName, undefined, { sensitivity: 'accent' }) === 0,
    )
    if (existingClient) {
      setSelectedNexusClient(existingClient.clientName)
      setNexusTodoClientDraft(existingClient.clientName)
      return
    }

    const relationship = nexusClientDraft.relationship.trim() || DEFAULT_NEXUS_CLIENT_RELATIONSHIP
    const nextAction = nexusClientDraft.nextAction.trim()

    setNexusClients((currentClients) => [
      ...currentClients,
      {
        clientName,
        relationship,
        nextAction,
      },
    ])
    setSelectedNexusClient(clientName)
    setNexusTodoClientDraft(clientName)
    setNexusClientDraft(createNexusClientRecord(''))
  }

  function handleNexusClientDraftKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    if (!trimmedNexusClientDraft || nexusClientDraftAlreadyExists) {
      return
    }

    handleAddNexusClient()
  }

  function handleAddNexusContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = nexusContactDraft.trim()
    if (!name) {
      return
    }

    setNexusContacts((currentContacts) => [
      ...currentContacts,
      {
        id: `nexus-contact-${Date.now()}-${currentContacts.length}`,
        clientName: selectedNexusClient,
        name,
      },
    ])
    setNexusContactDraft('')
  }

  function handleAddNexusTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = nexusTodoDraft.trim()
    if (!title) {
      return
    }

    setNexusTodos((currentTodos) => [
      ...currentTodos,
      {
        id: `nexus-todo-${Date.now()}-${currentTodos.length}`,
        clientName: activeNexusView === 'todo' ? nexusTodoClientDraft : selectedNexusClient,
        title,
      },
    ])
    setNexusTodoDraft('')
  }

  function handleAddNexusTool() {
    const title = nexusToolTitleDraft.trim()
    const rawUrl = nexusToolUrlDraft.trim()
    if (!title) {
      return
    }

    const normalizedUrl = rawUrl ? (/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`) : null
    const toolId = `nexus-tool-${Date.now()}-${nexusTools.length}`
    setNexusTools((currentTools) => [
      ...currentTools,
      {
        id: toolId,
        title,
        url: normalizedUrl,
        ...nexusToolBooleanDraft,
      },
    ])
    setSelectedNexusToolId(toolId)
    setNexusToolTitleDraft('')
    setNexusToolUrlDraft('')
    setNexusToolBooleanDraft(createNexusToolBooleanDraft())
  }

  function updateNexusToolBooleanDraft(field: keyof NexusToolBooleanDraft, value: boolean) {
    setNexusToolBooleanDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }))
  }

  function handleNexusToolDraftKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    if (!nexusToolTitleDraft.trim()) {
      return
    }

    handleAddNexusTool()
  }

  function handleOpenNexusTool(tool: NexusTool) {
    if (!tool.url) {
      return
    }

    window.open(tool.url, '_blank', 'noopener,noreferrer')
  }

  function handleDeleteNexusTool(tool: NexusTool) {
    setNexusTools((currentTools) => currentTools.filter((currentTool) => currentTool.id !== tool.id))
    setSelectedNexusToolId((currentToolId) => (currentToolId === tool.id ? null : currentToolId))
  }

  function nexusToolRowActions(tool: NexusTool): DataSheetRowAction<NexusTool>[] {
    const actions: DataSheetRowAction<NexusTool>[] = []
    if (tool.url) {
      actions.push({
        id: 'open',
        label: 'Open',
        onSelect: handleOpenNexusTool,
      })
    }

    actions.push({
      id: 'delete',
      label: 'Delete',
      tone: 'danger',
      onSelect: handleDeleteNexusTool,
    })

    return actions
  }

  function renderProductSwitch(className = '') {
    return (
      <div
        className={`brand-mark-row product-switch ${className}`.trim()}
        role="radiogroup"
        aria-label="Product navigation"
      >
        {WORKSPACE_PRODUCTS.map((product) => {
          const selected = activeProduct === product.key

          return (
            <button
              key={product.key}
              type="button"
              role="radio"
              className={`brand-mark product-switch-button ${selected ? 'is-active' : ''}`}
              aria-checked={selected}
              onClick={() => setActiveProduct(product.key)}
            >
              {product.label}
            </button>
          )
        })}
      </div>
    )
  }

  function renderProfileAvatarMenu() {
    return (
      <ProfileAvatarMenu
        key={authSession?.user.user_id ?? 'signed-out'}
        authSession={authSession}
        onOpenSettings={() => {
          setActiveProduct('strata')
          route.navigateToView('settings')
          shell.setMobileNavOpen(false)
        }}
        onSignOut={onSignOut}
        signOutPending={signOutPending}
      />
    )
  }

  function handleAssistantTokenTrackerClick(event: ReactMouseEvent<HTMLAnchorElement>) {
    if (!shouldHandleClientSideNavigation(event)) {
      return
    }

    event.preventDefault()
    setActiveProduct('strata')
    route.navigateToView(ASSISTANT_TOKEN_TRACKER_VIEW_KEY, null, {
      tradeId: null,
      messagingConversationId: null,
      libraryDocumentId: null,
      hash: ASSISTANT_TOKEN_TRACKER_ANCHOR_ID,
    })
    shell.setMobileNavOpen(false)
    window.requestAnimationFrame(() => {
      document.getElementById(ASSISTANT_TOKEN_TRACKER_ANCHOR_ID)?.scrollIntoView({
        block: 'start',
      })
    })
  }

  function renderWorkspaceTopbar() {
    return (
      <header className="workspace-topbar workspace-topbar-persistent">
        <div className="workspace-topbar-copy">
          <div className="workspace-topbar-title-row">
            {renderBackButton('app-back-button-desktop')}
            <span className="workspace-topbar-title-stack">
              <strong className="workspace-topbar-title">{displayedTopbarWorkspaceLabel}</strong>
              <strong className="workspace-topbar-title-sizer" aria-hidden="true">
                {WORKSPACE_TOPBAR_TITLE_SIZER_LABEL}
              </strong>
            </span>
          </div>
        </div>
        <div className="workspace-topbar-actions">
          <div className="workspace-topbar-command-actions">
            {renderTerminalCommandTrigger()}
            {renderShortcutReferenceTrigger()}
            <PromptHomeAvailableTokenBadge
              href={route.hrefForView(ASSISTANT_TOKEN_TRACKER_VIEW_KEY, {
                tradeId: null,
                messagingConversationId: null,
                libraryDocumentId: null,
                hash: ASSISTANT_TOKEN_TRACKER_ANCHOR_ID,
              })}
              onClick={handleAssistantTokenTrackerClick}
            />
            <WorkspaceTopbarDatabaseSizeBadge />
          </div>
          <div className="workspace-topbar-account-actions">
            <span className={`hero-session-pill hero-session-pill-${effectiveSystemStateTone}`}>
              {effectiveSystemStateLabel}
            </span>
            {renderProfileAvatarMenu()}
            {signOutError ? <small className="workspace-topbar-error">{signOutError}</small> : null}
          </div>
        </div>
      </header>
    )
  }

  return (
    <div className={`app-shell ${shellModeClassName}`.trim()}>
      <div className="app-aura app-aura-left" />
      <div className="app-aura app-aura-right" />

      <div className="mobile-topbar">
        {renderProductSwitch('product-switch-mobile')}
        <div className="mobile-topbar-actions">
          {renderBackButton('app-back-button-mobile')}
          {renderTerminalCommandTrigger('terminal-command-trigger-mobile')}
          {renderShortcutReferenceTrigger('terminal-shortcut-trigger-mobile')}
          <button
            type="button"
            className="appearance-toggle appearance-toggle-mobile"
            aria-label={appearance.themeToggleActionLabel}
            aria-pressed={appearance.resolvedColorMode === 'dark'}
            title={appearance.themeToggleActionLabel}
            onClick={appearance.handleToggleColorMode}
          >
            <span className="appearance-toggle-copy">
              <small>Theme</small>
              <strong>{appearance.themeToggleLabel}</strong>
            </span>
            <span
              className={`appearance-toggle-track appearance-toggle-track-${appearance.resolvedColorMode}`}
              aria-hidden="true"
            >
              <span className="appearance-toggle-thumb" />
            </span>
          </button>
          <button
            type="button"
            className="button button-ghost mobile-nav-button"
            aria-controls={MOBILE_NAVIGATION_PANEL_ID}
            aria-expanded={shell.mobileNavOpen}
            aria-label={shell.mobileNavToggleActionLabel}
            onClick={() => shell.setMobileNavOpen((current) => !current)}
          >
            {shell.mobileNavOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      <aside
        id={MOBILE_NAVIGATION_PANEL_ID}
        className={`side-rail ${shell.mobileNavOpen ? 'is-open' : ''} ${isPromptHomeView && !isNexusProduct ? 'side-rail-prompt' : ''}`}
        hidden={shell.mobileNavHidden}
        aria-hidden={shell.mobileNavHidden ? true : undefined}
      >
        <div className="brand-lockup">
          {renderProductSwitch('product-switch-desktop')}
        </div>

        <button
          type="button"
          className="appearance-toggle appearance-toggle-desktop"
          aria-label={appearance.themeToggleActionLabel}
          aria-pressed={appearance.resolvedColorMode === 'dark'}
          title={appearance.themeToggleActionLabel}
          onClick={appearance.handleToggleColorMode}
        >
          <span className="appearance-toggle-copy">
            <small>Theme</small>
            <strong>{appearance.themeToggleLabel}</strong>
          </span>
          <span
            className={`appearance-toggle-track appearance-toggle-track-${appearance.resolvedColorMode}`}
            aria-hidden="true"
          >
            <span className="appearance-toggle-thumb" />
          </span>
        </button>

        <nav className="nav-stack" aria-label={isNexusProduct ? 'Nexus' : 'Strata'}>
          {isNexusProduct ? (
            NEXUS_NAV_ITEMS.map((item) => {
              const selected =
                item.key === 'crm'
                  ? activeNexusView === 'crm' || activeNexusView === 'client'
                  : activeNexusView === item.key

              return (
                <section key={item.key} className="nav-section nav-section-leaf">
                  <div className="nav-section-header nav-section-header-leaf">
                    <button
                      type="button"
                      className={`nav-item nav-section-toggle ${selected ? 'is-active' : ''}`}
                      aria-current={selected ? 'page' : undefined}
                      onClick={() => {
                        setActiveNexusView(item.key)
                        shell.setMobileNavOpen(false)
                      }}
                    >
                      <div className="nav-section-copy">
                        <span
                          className={`nav-section-kicker ${'kicker' in item ? '' : 'nav-section-kicker-empty'}`.trim()}
                          aria-hidden={'kicker' in item ? undefined : true}
                        >
                          {'kicker' in item ? item.kicker : ''}
                        </span>
                        <strong>{item.label}</strong>
                      </div>
                    </button>
                  </div>
                </section>
              )
            })
          ) : (
            PRIMARY_NAV_SECTIONS.map((section) => {
              const expanded = isNavSectionOpen(section.key)
              const rendersNestedViews = primaryNavigationSectionRendersNestedViews(section)
              const containsCurrentView =
                route.activeNavigationSectionKey === section.key ||
                (route.activeNavigationSectionKey === null && section.views.some((view) => view.key === route.currentView))

              return (
                <section key={section.key} className={`nav-section ${rendersNestedViews ? '' : 'nav-section-leaf'}`}>
                  <div className={`nav-section-header ${rendersNestedViews ? '' : 'nav-section-header-leaf'}`}>
                    <button
                      type="button"
                      className={`nav-item nav-section-toggle ${containsCurrentView ? 'is-active' : ''}`}
                      aria-expanded={rendersNestedViews ? expanded : undefined}
                      aria-controls={rendersNestedViews ? `nav-section-${section.key}` : undefined}
                      onClick={() => {
                        if (rendersNestedViews) {
                          toggleNavSection(section.key)
                        }
                        route.navigateToSection(section.key)
                        shell.setMobileNavOpen(false)
                      }}
                    >
                      <div className="nav-section-copy">
                        <span>{section.kicker}</span>
                        <strong>{section.label}</strong>
                      </div>
                    </button>

                    {rendersNestedViews ? (
                      <button
                        type="button"
                        className={`nav-item nav-section-toggle-button ${expanded ? 'is-active' : ''}`}
                        aria-expanded={expanded}
                        aria-controls={`nav-section-${section.key}`}
                        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${section.label} section`}
                        onClick={() => toggleNavSection(section.key)}
                      >
                        <span className="nav-section-indicator" aria-hidden="true">
                          {expanded ? '-' : '+'}
                        </span>
                      </button>
                    ) : null}
                  </div>

                  {rendersNestedViews ? (
                    <div id={`nav-section-${section.key}`} className="nav-section-children" hidden={!expanded}>
                      {section.views.map((view) => (
                        <a
                          key={view.key}
                          href={route.hrefForView(view.key)}
                          className={`nav-item nav-item-nested ${
                            route.activeNavigationSectionKey === null && route.currentView === view.key ? 'is-active' : ''
                          }`}
                          aria-current={
                            route.activeNavigationSectionKey === null && route.currentView === view.key ? 'page' : undefined
                          }
                          onClick={(event) => {
                            if (route.handleViewLinkClick(event, view.key)) {
                              shell.setMobileNavOpen(false)
                            }
                          }}
                        >
                          <span>{view.kicker}</span>
                          <strong>{view.label}</strong>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </section>
              )
            })
          )}
        </nav>
      </aside>

      <main
        className={mainStageClassName}
        tabIndex={-1}
        data-terminal-shortcut-target="main-stage"
      >
        {!isNexusProduct && showStartHereOverlay ? (
          <AppStartHereOverlay
            authSession={authSession}
            onDismiss={dismissStartHere}
            onOpenView={startHereRouting.handleStartHereOpenView}
          />
        ) : null}

        {renderWorkspaceTopbar()}

        {!isNexusProduct && !isPromptHomeView ? (
          <header className={heroClassName}>
            <div className="hero-copy">
              {isMessagingWorkspaceView ? (
                <div className="hero-compact-heading-row">
                  <div className="hero-title-with-back">
                    <h2>{displayedHeroTitle}</h2>
                  </div>
                </div>
              ) : (
                <>
                  <div className="hero-heading-row">
                    <div className="hero-heading-meta">
                      <span className="eyebrow">Workspace</span>
                    </div>
                  </div>
                  <h2>{displayedHeroTitle}</h2>
                </>
              )}
              {displayedHeroBody ? <p>{displayedHeroBody}</p> : null}
            </div>

            {showHeroBadge ? (
              <div className="hero-badge">
                <span>Focus</span>
                <strong>
                  {showingNavigationSectionLanding
                    ? activePrimarySection.label
                    : priceReportRouteFocus
                    ? currentWorkspaceLabel
                    : selectedTrade
                    ? selectedTrade.trade_id
                    : currentWorkspaceLabel}
                </strong>
                <small>
                  {showingNavigationSectionLanding
                    ? `${activePrimarySection.views.length} workspace${activePrimarySection.views.length === 1 ? '' : 's'} grouped in this section`
                    : priceReportRouteFocus
                    ? currentWorkspaceDetail
                    : selectedTrade
                    ? `${selectedTrade.commodity} • ${selectedTrade.book}`
                    : currentWorkspaceDetail}
                </small>
              </div>
            ) : null}
          </header>
        ) : null}

        {!isNexusProduct ? renderWorkspaceSetLauncher() : null}

        {!isNexusProduct && !showingNavigationSectionLanding && workspaceData.error ? (
          <WorkspaceErrorBanner
            message={workspaceShellErrorMessage}
            onReconnect={workspaceShellReconnectAvailable ? handleReconnectWorkspace : null}
            reconnectPending={workspaceReconnectPending}
          />
        ) : null}
        {!isNexusProduct && !showingNavigationSectionLanding && workspaceWarning ? (
          <WorkspaceErrorBanner
            message={workspaceWarningMessage}
            onReconnect={workspaceWarningReconnectAvailable ? handleReconnectWorkspace : null}
            reconnectPending={workspaceReconnectPending}
          />
        ) : null}
        {!isNexusProduct && !showingNavigationSectionLanding && routeHandoffBanner && !currentWorkspaceOwnsHandoffBanner ? (
          <section className="feedback-banner workspace-handoff-banner" aria-live="polite">
            <div className="workspace-handoff-banner-copy">
              <strong>{routeHandoffBanner.title}</strong>
              <p>{routeHandoffBanner.detail}</p>
            </div>
            <button
              type="button"
              className="button button-secondary workspace-window-banner-action"
              onClick={() => route.replaceView(currentView)}
            >
              Clear Focus
            </button>
          </section>
        ) : null}

        {isNexusProduct && activeNexusView === 'crm' ? (
          <section className="nexus-crm-workspace" aria-labelledby="nexus-crm-heading">
            <article className="nexus-crm-card">
              <span className="eyebrow">Nexus</span>
              <h2 id="nexus-crm-heading">CRM</h2>
              <section className="nexus-client-base" aria-label="Existing Client Base">
                <DataSheet
                  label="Existing Client Base"
                  description="Sort or filter Nexus relationships, then open a client row to manage Contacts and To-Dos."
                  columns={NEXUS_CLIENT_TABLE_COLUMNS}
                  rows={nexusClientRows}
                  getRowId={(row) => row.clientName}
                  getRowLabel={(row) => row.clientName}
                  selectedRowId={selectedNexusClient}
                  onSelectRow={(row) => openNexusClient(row.clientName)}
                  emptyMessage="No Nexus clients are available yet."
                  appendRows={
                    <tr className="nexus-client-entry-row">
                      <td className="data-sheet-align-end">
                        <button
                          type="button"
                          className="button button-primary nexus-client-entry-add"
                          disabled={!trimmedNexusClientDraft || nexusClientDraftAlreadyExists}
                          onClick={handleAddNexusClient}
                        >
                          Add
                        </button>
                      </td>
                      <td>
                        <input
                          className="nexus-client-entry-input"
                          type="text"
                          value={nexusClientDraft.clientName}
                          onChange={(event) => updateNexusClientDraft('clientName', event.target.value)}
                          onKeyDown={handleNexusClientDraftKeyDown}
                          placeholder="Client name"
                          aria-label="New client"
                          aria-describedby={nexusClientDraftAlreadyExists ? 'nexus-client-entry-status' : undefined}
                        />
                      </td>
                      <td>
                        <input
                          className="nexus-client-entry-input"
                          type="text"
                          value={nexusClientDraft.relationship}
                          onChange={(event) => updateNexusClientDraft('relationship', event.target.value)}
                          onKeyDown={handleNexusClientDraftKeyDown}
                          placeholder={DEFAULT_NEXUS_CLIENT_RELATIONSHIP}
                          aria-label="New relationship"
                        />
                      </td>
                      <td className="data-sheet-align-end">
                        <span className="nexus-client-contact-count">0 contacts</span>
                      </td>
                      <td className="data-sheet-align-end">
                        <span className="nexus-client-todo-count">0 open</span>
                      </td>
                      <td>
                        <div className="nexus-client-entry-next-action">
                          <input
                            className="nexus-client-entry-input"
                            type="text"
                            value={nexusClientDraft.nextAction}
                            onChange={(event) => updateNexusClientDraft('nextAction', event.target.value)}
                            onKeyDown={handleNexusClientDraftKeyDown}
                            placeholder="Add To-Do"
                            aria-label="New next action"
                          />
                          {nexusClientDraftAlreadyExists ? (
                            <span id="nexus-client-entry-status" className="nexus-client-entry-status">
                              Already in CRM
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  }
                />
              </section>
            </article>
          </section>
        ) : isNexusProduct && activeNexusView === 'client' ? (
          <section className="nexus-crm-workspace nexus-client-workspace" aria-labelledby="nexus-client-heading">
            <article className="nexus-crm-card">
              <div className="nexus-client-detail-head">
                <button
                  type="button"
                  className="button button-ghost nexus-client-back"
                  onClick={() => setActiveNexusView('crm')}
                >
                  CRM
                </button>
                <div>
                  <span className="eyebrow">Nexus client</span>
                  <h2 id="nexus-client-heading">{selectedNexusClient}</h2>
                </div>
              </div>
              {renderAttioClientSection()}
              <form className="nexus-contact-form" onSubmit={handleAddNexusContact}>
                <label className="nexus-contact-field">
                  <span>Add contact</span>
                  <input
                    type="text"
                    value={nexusContactDraft}
                    onChange={(event) => setNexusContactDraft(event.target.value)}
                    placeholder={`Contact at ${selectedNexusClient}`}
                  />
                </label>
                <button type="submit" className="button button-primary" disabled={!nexusContactDraft.trim()}>
                  Add Contact
                </button>
              </form>
              <section className="nexus-client-contacts" aria-labelledby="nexus-client-contacts-heading">
                <div className="nexus-section-head">
                  <span className="eyebrow">Contacts</span>
                  <strong id="nexus-client-contacts-heading">
                    {selectedNexusClientContacts.length} contact
                    {selectedNexusClientContacts.length === 1 ? '' : 's'}
                  </strong>
                </div>
                {selectedNexusClientContacts.length > 0 ? (
                  <ul className="nexus-contact-list">
                    {selectedNexusClientContacts.map((contact) => (
                      <li key={contact.id}>
                        <strong>{contact.name}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="nexus-contact-empty">No Contacts for this client yet.</div>
                )}
              </section>
              <form className="nexus-todo-form" onSubmit={handleAddNexusTodo}>
                <label className="nexus-todo-field">
                  <span>Add to-do</span>
                  <input
                    type="text"
                    value={nexusTodoDraft}
                    onChange={(event) => setNexusTodoDraft(event.target.value)}
                    placeholder={`Follow up with ${selectedNexusClient}`}
                  />
                </label>
                <button type="submit" className="button button-primary" disabled={!nexusTodoDraft.trim()}>
                  Add To-Do
                </button>
              </form>
              <section className="nexus-client-todos" aria-labelledby="nexus-client-todos-heading">
                <div className="nexus-section-head">
                  <span className="eyebrow">To-Dos</span>
                  <strong id="nexus-client-todos-heading">{selectedNexusClientTodos.length} open</strong>
                </div>
                {selectedNexusClientTodos.length > 0 ? (
                  <ul className="nexus-todo-list">
                    {selectedNexusClientTodos.map((todo) => (
                      <li key={todo.id}>
                        <strong>{todo.title}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="nexus-todo-empty">No To-Do items for this client yet.</div>
                )}
              </section>
            </article>
          </section>
        ) : isNexusProduct && activeNexusView === 'todo' ? (
          <section className="nexus-crm-workspace nexus-todo-workspace" aria-labelledby="nexus-todo-heading">
            <article className="nexus-crm-card">
              <span className="eyebrow">Nexus</span>
              <h2 id="nexus-todo-heading">To-Do</h2>
              <form className="nexus-todo-form nexus-todo-form-global" onSubmit={handleAddNexusTodo}>
                <label className="nexus-todo-field">
                  <span>New to-do</span>
                  <input
                    type="text"
                    value={nexusTodoDraft}
                    onChange={(event) => setNexusTodoDraft(event.target.value)}
                    placeholder="Add a Nexus follow-up"
                  />
                </label>
                <label className="nexus-todo-field nexus-todo-client-field">
                  <span>Client</span>
                  <select
                    value={nexusTodoClientDraft}
                    onChange={(event) => setNexusTodoClientDraft(event.target.value)}
                  >
                    {nexusClientRows.map((client) => (
                      <option key={client.clientName} value={client.clientName}>
                        {client.clientName}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="button button-primary" disabled={!nexusTodoDraft.trim()}>
                  Add To-Do
                </button>
              </form>
              {nexusTodos.length > 0 ? (
                <ul className="nexus-todo-list nexus-todo-list-global">
                  {nexusTodos.map((todo) => (
                    <li key={todo.id}>
                      <div>
                        <strong>{todo.title}</strong>
                        <span>{todo.clientName}</span>
                      </div>
                      <button
                        type="button"
                        className="button button-ghost nexus-todo-client-link"
                        onClick={() => openNexusClient(todo.clientName)}
                      >
                        Open client
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="nexus-todo-empty">No To-Do items yet.</div>
              )}
            </article>
          </section>
        ) : isNexusProduct && activeNexusView === 'tools' ? (
          <section className="nexus-crm-workspace nexus-tools-workspace" aria-labelledby="nexus-tools-heading">
            <article className="nexus-crm-card">
              <span className="eyebrow">Nexus</span>
              <h2 id="nexus-tools-heading">Tools</h2>
              <section className="nexus-client-base" aria-label="Nexus Tools">
                <DataSheet
                  label="Nexus Tools"
                  description="Sort or filter saved tools. Right-click, two-finger click, or double-click a row for options."
                  columns={NEXUS_TOOL_TABLE_COLUMNS}
                  rows={nexusTools}
                  getRowId={(row) => row.id}
                  getRowLabel={(row) => row.title}
                  selectedRowId={selectedNexusToolId}
                  onSelectRow={(row) => setSelectedNexusToolId(row.id)}
                  emptyMessage="No tools yet. Use the entry row below to add one."
                  rowActions={nexusToolRowActions}
                  appendRows={
                    <tr className="nexus-client-entry-row nexus-tool-entry-row">
                      <td className="data-sheet-align-end">
                        <button
                          type="button"
                          className="button button-primary nexus-client-entry-add"
                          disabled={!nexusToolTitleDraft.trim()}
                          onClick={handleAddNexusTool}
                        >
                          Add
                        </button>
                      </td>
                      <td>
                        <input
                          className="nexus-client-entry-input"
                          type="text"
                          value={nexusToolTitleDraft}
                          onChange={(event) => setNexusToolTitleDraft(event.target.value)}
                          onKeyDown={handleNexusToolDraftKeyDown}
                          placeholder="Tool name"
                          aria-label="New tool"
                        />
                      </td>
                      <td>
                        <input
                          className="nexus-client-entry-input"
                          type="text"
                          inputMode="url"
                          value={nexusToolUrlDraft}
                          onChange={(event) => setNexusToolUrlDraft(event.target.value)}
                          onKeyDown={handleNexusToolDraftKeyDown}
                          placeholder="Optional URL"
                          aria-label="New tool link"
                        />
                      </td>
                      <td className="data-sheet-align-center">
                        <label className="nexus-tool-entry-boolean">
                          <input
                            type="checkbox"
                            checked={nexusToolBooleanDraft.accessMethod}
                            onChange={(event) => updateNexusToolBooleanDraft('accessMethod', event.target.checked)}
                            aria-label="New tool access method"
                          />
                          <span>{nexusToolBooleanDraft.accessMethod ? 'TRUE' : 'FALSE'}</span>
                        </label>
                      </td>
                      <td className="data-sheet-align-center">
                        <label className="nexus-tool-entry-boolean">
                          <input
                            type="checkbox"
                            checked={nexusToolBooleanDraft.application}
                            onChange={(event) => updateNexusToolBooleanDraft('application', event.target.checked)}
                            aria-label="New tool application"
                          />
                          <span>{nexusToolBooleanDraft.application ? 'TRUE' : 'FALSE'}</span>
                        </label>
                      </td>
                      <td className="data-sheet-align-center">
                        <label className="nexus-tool-entry-boolean">
                          <input
                            type="checkbox"
                            checked={nexusToolBooleanDraft.browser}
                            onChange={(event) => updateNexusToolBooleanDraft('browser', event.target.checked)}
                            aria-label="New tool browser"
                          />
                          <span>{nexusToolBooleanDraft.browser ? 'TRUE' : 'FALSE'}</span>
                        </label>
                      </td>
                      <td className="data-sheet-align-center">
                        <label className="nexus-tool-entry-boolean">
                          <input
                            type="checkbox"
                            checked={nexusToolBooleanDraft.api}
                            onChange={(event) => updateNexusToolBooleanDraft('api', event.target.checked)}
                            aria-label="New tool API"
                          />
                          <span>{nexusToolBooleanDraft.api ? 'TRUE' : 'FALSE'}</span>
                        </label>
                      </td>
                    </tr>
                  }
                />
              </section>
            </article>
          </section>
        ) : showingNavigationSectionLanding ? (
          <Suspense
            fallback={
              <WorkspaceLoadState
                title={`Preparing ${activePrimarySection.label}`}
                detail="Loading the section overview."
              />
            }
          >
            <AppWorkspaceContent
              activeNavigationSectionKey={route.activeNavigationSectionKey}
              captureForm={captureForm}
              amendForm={amendForm}
              appearance={appearance}
              tradeCapturePreferences={tradeCapturePreferences}
              currentView={route.currentView}
              handleRoadmapPublished={shell.handleRoadmapPublished}
              hrefForView={route.hrefForView}
              navigateToTrade={navigateToTrade}
              navigateToView={route.navigateToView}
              replaceView={route.replaceView}
              routeHandoff={route.routeHandoff}
              referenceState={referenceState}
              roadmapRefreshVersion={shell.roadmapRefreshVersion}
              selectedLibraryDocumentId={route.selectedLibraryDocumentId}
              selectedMessagingConversationId={route.selectedMessagingConversationId}
              selectedTradeId={route.selectedTradeId}
              setInspectorTab={shell.setInspectorTab}
              setSelectedLibraryDocumentId={route.setSelectedLibraryDocumentId}
              setSelectedMessagingConversationId={route.setSelectedMessagingConversationId}
              setSelectedTradeId={route.setSelectedTradeId}
              shell={shell}
              summary={summary}
              tradeActions={tradeActions}
              workspaceData={workspaceData}
            />
          </Suspense>
        ) : blockingWorkspaceError && !workspaceLoading ? (
          <WorkspaceErrorState
            title={`${workspaceLabel(route.currentView)} needs attention`}
            message={blockingWorkspaceMessage}
            onRetry={handleReconnectWorkspace}
            retryPending={workspaceReconnectPending}
          />
        ) : workspaceLoading ? (
          <WorkspaceLoadState
            title={`Loading ${workspaceLabel(route.currentView)}`}
            detail="Pulling the workspace-specific datasets needed for this screen."
          />
        ) : (
          <Suspense
            fallback={
              <WorkspaceLoadState
                title={`Preparing ${workspaceLabel(route.currentView)}`}
                detail="Loading the workspace bundle."
              />
            }
          >
            <AppWorkspaceContent
              activeNavigationSectionKey={route.activeNavigationSectionKey}
              captureForm={captureForm}
              amendForm={amendForm}
              appearance={appearance}
              tradeCapturePreferences={tradeCapturePreferences}
              currentView={route.currentView}
              handleRoadmapPublished={shell.handleRoadmapPublished}
              hrefForView={route.hrefForView}
              navigateToTrade={navigateToTrade}
              navigateToView={route.navigateToView}
              replaceView={route.replaceView}
              routeHandoff={route.routeHandoff}
              referenceState={referenceState}
              roadmapRefreshVersion={shell.roadmapRefreshVersion}
              selectedLibraryDocumentId={route.selectedLibraryDocumentId}
              selectedMessagingConversationId={route.selectedMessagingConversationId}
              selectedTradeId={route.selectedTradeId}
              setInspectorTab={shell.setInspectorTab}
              setSelectedLibraryDocumentId={route.setSelectedLibraryDocumentId}
              setSelectedMessagingConversationId={route.setSelectedMessagingConversationId}
              setSelectedTradeId={route.setSelectedTradeId}
              shell={shell}
              summary={summary}
              tradeActions={tradeActions}
              workspaceData={workspaceData}
            />
          </Suspense>
        )}
      </main>

      <TerminalCommandBar
        isOpen={terminalCommandBarOpen}
        onOpen={openTerminalCommandBar}
        onClose={closeTerminalCommandBar}
        isLoading={terminalSearchLoading}
        trades={workspaceData.trades}
        counterparties={workspaceData.counterparties}
        commodities={workspaceData.commodities}
        priceIndices={workspaceData.priceIndices}
        navigateToView={(view, handoff, options) => {
          setActiveProduct('strata')
          route.navigateToView(view, handoff, options)
        }}
        navigateToTrade={(tradeId, handoff) => {
          setActiveProduct('strata')
          navigateToTrade(tradeId, handoff)
        }}
        referenceNavigator={{
          setReferenceTab: referenceState.setReferenceTab,
          startEditCommodity: referenceState.startEditCommodity,
          startEditPriceIndex: referenceState.startEditPriceIndex,
          startEditCounterparty: referenceState.startEditCounterparty,
        }}
      />
      <TerminalShortcutReference isOpen={shortcutReferenceOpen} onClose={closeShortcutReference} />
    </div>
  )
}

export default function App() {
  const route = useAppRouteState()
  const [initialAuthInterruptionResume] = useState<AuthInterruptionResumeSnapshot | null>(() =>
    getAuthInterruptionResumeSnapshot(),
  )
  const [openNavSectionKeys, setOpenNavSectionKeys] = useState<PrimaryNavigationSectionKey[]>(() => [
    route.activeNavigationSectionKey ?? primaryNavigationSectionForView(route.currentView).key,
  ])
  const shell = useAppShellState(
    route.currentView,
    route.currentView === 'trades' ? initialAuthInterruptionResume?.inspectorTab ?? null : null,
  )
  const [activeProduct, setActiveProduct] = useState<WorkspaceProductKey>('strata')
  const appearance = useAppAppearance(activeProduct)
  const tradeCapturePreferences = useAppTradeCaptureSettings()
  const workspaceData = useAppWorkspaceData(route.currentView)
  const startHere = useAppStartHere(workspaceData.authSession)
  const {
    activeNavigationSectionKey,
    currentView,
    replaceView,
    routeHandoff,
    selectedTradeId,
    setSelectedTradeId,
  } = route
  const dismissStartHere = startHere.dismissStartHere
  const { inspectorTab, setInspectorTab } = shell
  const promptResumeIntent = useSyncExternalStore(
    subscribePromptResumeIntent,
    getPromptResumeIntent,
    () => null,
  )
  const promptSignInReturnIntent = useSyncExternalStore(
    subscribePromptSignInReturnIntent,
    getPromptSignInReturnIntent,
    () => null,
  )

  function toggleNavSection(sectionKey: PrimaryNavigationSectionKey) {
    setOpenNavSectionKeys((current) =>
      current.includes(sectionKey)
        ? current.filter((key) => key !== sectionKey)
        : [...current, sectionKey],
    )
  }

  function isNavSectionOpen(sectionKey: PrimaryNavigationSectionKey) {
    return openNavSectionKeys.includes(sectionKey)
  }

  const activePrimarySection = activeNavigationSectionKey
    ? primaryNavigationSectionByKey(activeNavigationSectionKey)
    : primaryNavigationSectionForView(currentView)

  useEffect(() => {
    const routeHandoffTradeId = getAppRouteHandoffTradeId(routeHandoff)

    if (currentView === 'trades' && routeHandoffTradeId && selectedTradeId !== routeHandoffTradeId) {
      setSelectedTradeId(routeHandoffTradeId)
    }

    if (
      currentView === 'trades' &&
      routeHandoff?.tradeInspectorTab &&
      inspectorTab !== routeHandoff.tradeInspectorTab
    ) {
      setInspectorTab(routeHandoff.tradeInspectorTab)
    }
  }, [
    currentView,
    inspectorTab,
    routeHandoff,
    selectedTradeId,
    setInspectorTab,
    setSelectedTradeId,
  ])

  const [signOutPending, setSignOutPending] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  async function handleSignOut() {
    setSignOutPending(true)
    setSignOutError('')
    authInterruption.clearAuthInterruptionResume()

    try {
      await logoutCurrentSession(appConfig.apiBase)
    } catch {
      // Clear the browser session even if the server-side session is already gone.
    } finally {
      try {
        await workspaceData.handleSessionChange(null)
      } catch (error) {
        setSignOutError(
          error instanceof Error
            ? error.message
            : 'Signed out locally, but the workspace could not be refreshed.',
        )
      } finally {
        setSignOutPending(false)
      }
    }
  }

  const authSession = workspaceData.authSession
  const selectedTradeRecordId =
    workspaceData.trades.find((trade) => trade.trade_id === selectedTradeId)?.trade_id ?? null
  const showingNavigationSectionLanding = activeNavigationSectionKey !== null
  const authInterruption = useAuthInterruptionFlow({
    initialSnapshot: initialAuthInterruptionResume,
    authSessionId: authSession?.sessionId ?? null,
    authInterruptionReason: workspaceData.authInterruptionReason,
    currentView,
    selectedTradeId,
    selectedTradeRecordId,
    inspectorTab,
    setInspectorTab,
    activeNavigationSectionLabel: showingNavigationSectionLanding ? activePrimarySection.label : null,
  })
  const startHereRouting = useStartHereRouting({
    authSessionId: authSession?.sessionId ?? null,
    authInterruptionActive: authInterruption.authInterruptionResume !== null,
    currentView,
    dismissStartHere,
    navigateToView: route.navigateToView,
    replaceView,
  })
  const promptResumeIntentLabel = promptResumeIntent
    ? formatPromptResumeIntentLabel(promptResumeIntent)
    : null

  useEffect(() => {
    if (!authSession || authInterruption.authInterruptionResume || !promptResumeIntent) {
      return
    }

    if (currentView === 'prompt') {
      return
    }

    dismissStartHere()
    replaceView('prompt')
  }, [
    authInterruption.authInterruptionResume,
    authSession,
    currentView,
    dismissStartHere,
    promptResumeIntent,
    replaceView,
  ])

  useEffect(() => {
    if (
      !authSession ||
      authInterruption.authInterruptionResume ||
      promptResumeIntent ||
      !promptSignInReturnIntent
    ) {
      return
    }

    clearPromptSignInReturnIntent()
    dismissStartHere()
    if (currentView !== 'prompt') {
      replaceView('prompt')
    }
  }, [
    authInterruption.authInterruptionResume,
    authSession,
    currentView,
    dismissStartHere,
    promptResumeIntent,
    promptSignInReturnIntent,
    replaceView,
  ])

  const showStartHereOverlay = shouldPresentStartHereOverlay({
    currentView,
    hasAuthSession: Boolean(authSession),
    hasStartHereOnboarding: startHere.showStartHere,
    hasStartHereReturnIntent: Boolean(startHereRouting.startHereReturnIntent),
    hasRouteHandoff: Boolean(route.routeHandoff),
    authInterruptionReason: workspaceData.authInterruptionReason,
    hasAuthInterruptionResume: authInterruption.authInterruptionResume !== null,
    usesTerminalMode: appearance.isTerminalMode,
  })
  const signedOutNeedsAuthGate = shouldPresentSignedOutAuthGate({
    currentView,
    hasAuthSession: Boolean(authSession),
  })

  if (signedOutNeedsAuthGate) {
    return (
      <div className={`app-shell ${appearance.isTerminalMode ? 'app-shell-terminal-mode ' : ''}auth-gate-shell`}>
        <div className="app-aura app-aura-left" />
        <div className="app-aura app-aura-right" />
        <AuthGate
          authInterruptionMessage={authInterruption.authInterruptionMessage}
          onSessionChange={workspaceData.handleSessionChange}
          pendingStartHereReturnLabel={startHereRouting.pendingStartHereReturnLabel}
          pendingPromptResumeLabel={promptResumeIntentLabel}
          pendingPromptResumeWillSubmit={promptResumeIntent?.submitAfterSignIn ?? false}
        />
      </div>
    )
  }

  return (
    <AuthenticatedWorkspaceShell
      route={route}
      shell={shell}
      appearance={appearance}
      activeProduct={activeProduct}
      setActiveProduct={setActiveProduct}
      tradeCapturePreferences={tradeCapturePreferences}
      workspaceData={workspaceData}
      startHereRouting={startHereRouting}
      showStartHereOverlay={showStartHereOverlay}
      dismissStartHere={dismissStartHere}
      onSignOut={handleSignOut}
      signOutPending={signOutPending}
      signOutError={signOutError}
      isNavSectionOpen={isNavSectionOpen}
      toggleNavSection={toggleNavSection}
    />
  )
}
