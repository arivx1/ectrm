import {
  Suspense,
  type ChangeEvent as ReactChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  createNexusContact,
  importAttioNexusContacts,
  loadAttioClientEnrichment,
  loadGrainClientRecordings,
  loadLinearClientIssues,
  loadNexusClientEngagements,
  loadNexusContacts,
  loadNotionClientPages,
  syncAttioNexusClients,
  type AttioClientEnrichmentRecord,
  type AttioClientSyncRecord,
  type GrainClientRecordingsRecord,
  type LinearClientIssuesRecord,
  type NexusClientEngagementsRecord,
  type NexusContactRecord,
  type NexusClientType,
  type NotionClientPagesRecord,
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

const NEXUS_CRM_SEGMENT_VIEWS = [
  { key: 'clients', label: 'Clients' },
  { key: 'prospects', label: 'Opportunities' },
  { key: 'disqualified', label: 'Disqualified' },
  { key: 'lost', label: 'Lost' },
  { key: 'on-hold', label: 'On Hold' },
  { key: 'tam', label: 'TAM' },
] as const

type NexusCrmSegmentKey = (typeof NEXUS_CRM_SEGMENT_VIEWS)[number]['key']

const NEXUS_CRM_DETAIL_VIEWS = [
  { key: 'companies', label: 'Companies' },
  { key: 'contacts', label: 'Contacts' },
] as const

type NexusCrmDetailViewKey = (typeof NEXUS_CRM_DETAIL_VIEWS)[number]['key']

const NEXUS_CRM_SEGMENT_LABELS: Record<NexusCrmSegmentKey, string> = {
  clients: 'Clients',
  prospects: 'Opportunities',
  disqualified: 'Disqualified',
  lost: 'Lost',
  'on-hold': 'On Hold',
  tam: 'TAM',
}

const NEXUS_CRM_SEGMENT_DESCRIPTIONS: Record<NexusCrmSegmentKey, string> = {
  clients: 'Existing Nexus client companies.',
  prospects: 'Non-client companies with at least one open opportunity.',
  disqualified: 'Companies with one or more disqualified deals.',
  lost: 'Companies where all known deals are lost.',
  'on-hold': 'Companies with one or more deals currently paused or on hold.',
  tam: 'Addressable Nexus companies that are not currently in another CRM view.',
}

const NEXUS_ATTIO_NEW_CLIENT_SYNC_LIMIT = 200
const NEXUS_ATTIO_EXISTING_CLIENT_SYNC_BATCH_SIZE = 500
const NEXUS_CLIENT_INTEGRATION_REFRESH_STALE_MS = 5 * 60 * 1000
const NEXUS_CLIENT_INTEGRATION_SELECTED_STALE_MS = 60 * 1000
const NEXUS_CLIENT_INTEGRATION_BACKGROUND_INTERVAL_MS = 20 * 1000
const NEXUS_CLIENT_INTEGRATION_BACKGROUND_BATCH_SIZE = 2
const NEXUS_CLIENT_INTEGRATION_BACKGROUND_INITIAL_DELAY_MS = 1000

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

const NEXUS_CLIENT_TYPES = ['Client', 'Churned', 'Prospect', 'Other'] as const satisfies readonly NexusClientType[]
const DEFAULT_NEXUS_CLIENT_TYPE: NexusClientType = 'Client'

type NexusClientRecord = {
  clientName: NexusClientName
  type: NexusClientType
  owner: string
  dealStatus: string
  dealStatuses: string[]
  disqualifiedDealCount: number
  lostDealCount: number
  onHoldDealCount: number
  disqualificationReason: string
  lostReason: string
  closedArr: string
  openArr: string
  closedDealCount: number
  openDealCount: number
  totalArr: string
  dealCount: number
  nextAction: string
  tam: NexusTamProfile
}

type NexusClientDraft = NexusClientRecord

type NexusArrField = 'closedArr' | 'openArr'
type NexusDealCountField = 'closedDealCount' | 'openDealCount'

const NEXUS_ARR_FIELDS: readonly NexusArrField[] = ['closedArr', 'openArr'] as const
const NEXUS_DEAL_COUNT_FIELDS: readonly NexusDealCountField[] = ['closedDealCount', 'openDealCount'] as const

const NEXUS_ARR_FIELD_LABELS: Record<NexusArrField, string> = {
  closedArr: 'Closed ARR',
  openArr: 'Open ARR',
}

const NEXUS_DEAL_COUNT_FIELD_LABELS: Record<NexusDealCountField, string> = {
  closedDealCount: 'Closed Deals',
  openDealCount: 'Open Deals',
}

type NexusTamProfile = {
  priorityRank: string
  tickerSymbol: string
  entityType: string
  targetDepartment: string
  fitSegment: string
  qualifyingReason: string
  hqCity: string
  hqStateRegion: string
  hqCountry: string
  region: string
  operationsFootprint: string
  employeeCountEstimate: string
  annualRevenueTtmUsd: string
  revenueBand: string
  scaleArchetype: string
  ownershipType: string
  wedgeUseCase: string
  painHypothesis: string
  overallAttackScore: string
  priorityTier: string
  recommendedMotion: string
  prospectStatus: string
  dataConfidence: string
  sourceUrls: string
  notes: string
}

type NexusTamProfileField = keyof NexusTamProfile

const NEXUS_TAM_PROFILE_FIELDS: readonly NexusTamProfileField[] = [
  'priorityRank',
  'tickerSymbol',
  'entityType',
  'targetDepartment',
  'fitSegment',
  'qualifyingReason',
  'hqCity',
  'hqStateRegion',
  'hqCountry',
  'region',
  'operationsFootprint',
  'employeeCountEstimate',
  'annualRevenueTtmUsd',
  'revenueBand',
  'scaleArchetype',
  'ownershipType',
  'wedgeUseCase',
  'painHypothesis',
  'overallAttackScore',
  'priorityTier',
  'recommendedMotion',
  'prospectStatus',
  'dataConfidence',
  'sourceUrls',
  'notes',
] as const

const NEXUS_TAM_PROFILE_LABELS: Record<NexusTamProfileField, string> = {
  priorityRank: 'Rank',
  tickerSymbol: 'Ticker',
  entityType: 'Entity Type',
  targetDepartment: 'Target Desk',
  fitSegment: 'Fit Segment',
  qualifyingReason: 'Qualifying Reason',
  hqCity: 'HQ City',
  hqStateRegion: 'HQ State',
  hqCountry: 'HQ Country',
  region: 'Region',
  operationsFootprint: 'Ops Footprint',
  employeeCountEstimate: 'Employees',
  annualRevenueTtmUsd: 'Revenue',
  revenueBand: 'Revenue Band',
  scaleArchetype: 'Scale',
  ownershipType: 'Ownership',
  wedgeUseCase: 'Wedge',
  painHypothesis: 'Pain Hypothesis',
  overallAttackScore: 'Attack Score',
  priorityTier: 'Priority Tier',
  recommendedMotion: 'Recommended Motion',
  prospectStatus: 'Status',
  dataConfidence: 'Confidence',
  sourceUrls: 'Sources',
  notes: 'Notes',
}

const NEXUS_TAM_TABLE_FIELDS: readonly NexusTamProfileField[] = [
  'priorityRank',
  'priorityTier',
  'fitSegment',
  'region',
  'hqCountry',
  'revenueBand',
  'employeeCountEstimate',
  'overallAttackScore',
  'prospectStatus',
  'recommendedMotion',
  'sourceUrls',
  'notes',
] as const

type NexusDealCategoryCountField = 'disqualifiedDealCount' | 'lostDealCount' | 'onHoldDealCount'
type NexusDealCategoryReasonField = 'disqualificationReason' | 'lostReason'
const NEXUS_DEAL_CATEGORY_COUNT_FIELDS: readonly NexusDealCategoryCountField[] = [
  'disqualifiedDealCount',
  'lostDealCount',
  'onHoldDealCount',
] as const
const NEXUS_DEAL_CATEGORY_COUNT_LABELS: Record<NexusDealCategoryCountField, string> = {
  disqualifiedDealCount: 'Disqualified Deals',
  lostDealCount: 'Lost Deals',
  onHoldDealCount: 'On Hold Deals',
}
const NEXUS_DEAL_CATEGORY_REASON_LABELS: Record<NexusDealCategoryReasonField, string> = {
  disqualificationReason: 'Disqualification Reason',
  lostReason: 'Lost Reason',
}

type NexusClientSyncProposedClient = {
  recordId: string
  clientName: NexusClientName
  type: NexusClientType
  dealCount: number
  dealStatuses: string[]
  disqualifiedDealCount: number
  lostDealCount: number
  onHoldDealCount: number
  disqualificationReason: string | null
  closedArr: string | null
  openArr: string | null
  closedDealCount: number
  openDealCount: number
  totalArr: string | null
  webUrl: string | null
  domains: string[]
  description: string | null
  status: string | null
}

type NexusClientSyncTypeUpdate = {
  clientName: NexusClientName
  currentType: NexusClientType
  proposedType: NexusClientType
  proposedDealStatus: string | null
  proposedDealStatuses: string[]
  proposedClosedArr: string | null
  proposedOpenArr: string | null
  proposedClosedDealCount: number
  proposedOpenDealCount: number
  proposedTotalArr: string | null
  proposedDealCount: number
  proposedDisqualifiedDealCount: number
  proposedLostDealCount: number
  proposedOnHoldDealCount: number
  proposedDisqualificationReason: string | null
}

type NexusClientSyncReview = {
  typeUpdates: NexusClientSyncTypeUpdate[]
  newClients: NexusClientSyncProposedClient[]
  existingCheckCount: number
  scannedDealRecordCount: number
  returnedDealBackedClientCount: number
  warnings: string[]
}

type NexusTamImportRow = {
  clientName: NexusClientName
  nextAction: string
  tam: NexusTamProfile
  sourceRowNumber: number
}

type NexusTamImportParseResult = {
  rows: NexusTamImportRow[]
  skippedRowCount: number
}

function createEmptyNexusTamProfile(): NexusTamProfile {
  return NEXUS_TAM_PROFILE_FIELDS.reduce<NexusTamProfile>(
    (profile, field) => ({
      ...profile,
      [field]: '',
    }),
    {} as NexusTamProfile,
  )
}

function createNexusClientRecord(
  clientName: NexusClientName,
  type: NexusClientType = DEFAULT_NEXUS_CLIENT_TYPE,
  dealStatus = '',
): NexusClientRecord {
  return {
    clientName,
    type,
    owner: '',
    dealStatus,
    dealStatuses: dealStatus ? [dealStatus] : [],
    disqualifiedDealCount: 0,
    lostDealCount: 0,
    onHoldDealCount: 0,
    disqualificationReason: '',
    lostReason: '',
    closedArr: '',
    openArr: '',
    closedDealCount: 0,
    openDealCount: 0,
    totalArr: '',
    dealCount: 0,
    nextAction: '',
    tam: createEmptyNexusTamProfile(),
  }
}

function createDefaultNexusClients(): NexusClientRecord[] {
  return NEXUS_EXISTING_CLIENT_BASE.map((clientName) => createNexusClientRecord(clientName))
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
type NexusToolTextField = Extract<keyof NexusTool, 'title' | 'url'>
type NexusToolBooleanField = keyof NexusToolBooleanDraft

type NexusClientLinkProvider = 'notion' | 'grain'

type NexusClientLink = {
  id: string
  clientName: NexusClientName
  provider: NexusClientLinkProvider
  title: string
  url: string
  createdAt: string
}

type NexusClientLinkDraft = {
  title: string
  url: string
}

const NEXUS_TOOLS_STORAGE_KEY = 'ectrm.nexus.tools.v1'
const NEXUS_CLIENTS_STORAGE_KEY = 'ectrm.nexus.clients.v1'
const NEXUS_CLIENT_LINKS_STORAGE_KEY = 'ectrm.nexus.clientLinks.v1'

function createNexusToolBooleanDraft(): NexusToolBooleanDraft {
  return {
    accessMethod: false,
    application: false,
    browser: false,
    api: false,
  }
}

function createNexusClientLinkDraft(): NexusClientLinkDraft {
  return {
    title: '',
    url: '',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeNexusExternalUrl(rawUrl: string): string | null {
  const trimmedUrl = rawUrl.trim()
  if (!trimmedUrl) {
    return null
  }

  return /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`
}

function normalizeNexusClientType(value: unknown): NexusClientType {
  if (NEXUS_CLIENT_TYPES.includes(value as NexusClientType)) {
    return value as NexusClientType
  }

  const statusText = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!statusText) {
    return DEFAULT_NEXUS_CLIENT_TYPE
  }
  if (
    ['disqualified', 'non customer', 'non-customer', 'not customer', 'not a customer'].some((token) =>
      statusText.includes(token),
    )
  ) {
    return 'Other'
  }
  if (['former', 'past', 'churn', 'inactive', 'lost'].some((token) => statusText.includes(token))) {
    return 'Churned'
  }
  if (
    [
      'prospect',
      'lead',
      'opportunit',
      'qualified',
      'attempting',
      'contact',
      're-engage',
      'hold',
      'later',
      'met with',
    ].some((token) => statusText.includes(token))
  ) {
    return 'Prospect'
  }
  if (['customer', 'client', 'existing', 'active', 'current', 'won'].some((token) => statusText.includes(token))) {
    return 'Client'
  }

  return 'Other'
}

function normalizeNexusDealStatuses(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const statuses: string[] = []
  value.forEach((status) => {
    if (typeof status !== 'string') {
      return
    }
    const normalizedStatus = status.trim()
    if (!normalizedStatus) {
      return
    }
    if (!statuses.some((existingStatus) => existingStatus.toLowerCase() === normalizedStatus.toLowerCase())) {
      statuses.push(normalizedStatus)
    }
  })
  return statuses
}

function normalizeNexusStatusText(value: string): string {
  return value.trim().toLowerCase()
}

function nexusStatusMatchesAny(value: string, tokens: readonly string[]): boolean {
  const normalizedValue = normalizeNexusStatusText(value)
  return Boolean(normalizedValue) && tokens.some((token) => normalizedValue.includes(token))
}

function nexusStatusIsDisqualified(value: string): boolean {
  return nexusStatusMatchesAny(value, ['disqualified', 'non customer', 'non-customer', 'not customer', 'not a customer'])
}

function nexusStatusIsOnHold(value: string): boolean {
  return nexusStatusMatchesAny(value, ['on hold', 'on-hold', 'hold'])
}

function nexusStatusIsLost(value: string): boolean {
  return nexusStatusMatchesAny(value, ['closed lost', 'lost'])
}

function nexusStatusIsClosedWon(value: string): boolean {
  return nexusStatusMatchesAny(value, ['closed won', 'won'])
}

function nexusStatusIsExcludedFromOpportunities(value: string): boolean {
  return nexusStatusIsDisqualified(value) || nexusStatusIsLost(value) || nexusStatusIsOnHold(value)
}

function nexusStatusIsOpenOpportunity(value: string): boolean {
  const normalizedValue = normalizeNexusStatusText(value)
  return Boolean(normalizedValue) && !nexusStatusIsExcludedFromOpportunities(value) && !nexusStatusIsClosedWon(value)
}

function nexusDealStatusesMatch(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }
  return left.every((status, index) => status.toLowerCase() === right[index]?.toLowerCase())
}

function uniqueNexusClientNames(clientNames: readonly string[]): string[] {
  const names: string[] = []
  const seenNameKeys = new Set<string>()
  clientNames.forEach((clientName) => {
    const normalizedName = clientName.trim()
    if (!normalizedName) {
      return
    }
    const nameKey = normalizedName.toLowerCase()
    if (seenNameKeys.has(nameKey)) {
      return
    }
    seenNameKeys.add(nameKey)
    names.push(normalizedName)
  })
  return names
}

function chunkNexusClientNames(clientNames: readonly string[], batchSize: number): string[][] {
  const chunks: string[][] = []
  for (let index = 0; index < clientNames.length; index += batchSize) {
    chunks.push(clientNames.slice(index, index + batchSize))
  }
  return chunks
}

function mergeAttioClientSyncPayloads(payloads: AttioClientSyncRecord[]): AttioClientSyncRecord | null {
  if (payloads.length === 0) {
    return null
  }

  const clients: AttioClientSyncRecord['clients'] = []
  const seenClientKeys = new Set<string>()
  const warnings: string[] = []
  const seenWarnings = new Set<string>()

  payloads.forEach((payload) => {
    payload.clients.forEach((client) => {
      const clientKey = `${client.record_id.trim().toLowerCase()}::${client.name.trim().toLowerCase()}`
      if (seenClientKeys.has(clientKey)) {
        return
      }
      seenClientKeys.add(clientKey)
      clients.push(client)
    })
    payload.warnings.forEach((warning) => {
      if (seenWarnings.has(warning)) {
        return
      }
      seenWarnings.add(warning)
      warnings.push(warning)
    })
  })

  return {
    ...payloads[0],
    requested_limit: payloads.reduce((sum, payload) => sum + payload.requested_limit, 0),
    scanned_record_count: payloads.reduce((sum, payload) => sum + payload.scanned_record_count, 0),
    skipped_record_count: payloads.reduce((sum, payload) => sum + payload.skipped_record_count, 0),
    returned_client_count: clients.length,
    clients,
    warnings,
  }
}

function nexusCrmSegmentUsesProspectFields(segment: NexusCrmSegmentKey): boolean {
  return segment !== 'clients' && segment !== 'tam'
}

function defaultNexusDealStatusForCrmSegment(segment: NexusCrmSegmentKey): string {
  if (segment === 'disqualified') {
    return 'Disqualified'
  }
  if (segment === 'lost') {
    return 'Lost'
  }
  if (segment === 'on-hold') {
    return 'On Hold'
  }
  return ''
}

function defaultNexusDealCategoryCountsForCrmSegment(
  segment: NexusCrmSegmentKey,
): Pick<NexusClientRecord, 'disqualifiedDealCount' | 'lostDealCount' | 'onHoldDealCount'> {
  return {
    disqualifiedDealCount: segment === 'disqualified' ? 1 : 0,
    lostDealCount: segment === 'lost' ? 1 : 0,
    onHoldDealCount: segment === 'on-hold' ? 1 : 0,
  }
}

function normalizeNexusDealCountInput(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value))
  }
  if (typeof value === 'string') {
    return normalizeNexusDealCountValue(value)
  }
  return 0
}

function isNexusDealCountField(field: keyof NexusClientRecord): field is NexusDealCountField {
  return NEXUS_DEAL_COUNT_FIELDS.includes(field as NexusDealCountField)
}

function isNexusDealCategoryCountField(field: keyof NexusClientRecord): field is NexusDealCategoryCountField {
  return NEXUS_DEAL_CATEGORY_COUNT_FIELDS.includes(field as NexusDealCategoryCountField)
}

function inferNexusDealCategoryCountsFromStatuses(options: {
  dealStatus: string
  dealStatuses: string[]
  dealCount: number
}): Pick<NexusClientRecord, 'disqualifiedDealCount' | 'lostDealCount' | 'onHoldDealCount'> {
  const statusEvidence = normalizeNexusDealStatuses(
    options.dealStatus.trim() ? [options.dealStatus, ...options.dealStatuses] : options.dealStatuses,
  )

  const countMatchingStatuses = (matcher: (value: string) => boolean) => {
    const matchingStatusCount = statusEvidence.filter(matcher).length
    if (matchingStatusCount === 0) {
      return 0
    }
    if (options.dealCount > 0 && statusEvidence.every(matcher)) {
      return options.dealCount
    }
    return matchingStatusCount
  }

  return {
    disqualifiedDealCount: countMatchingStatuses(nexusStatusIsDisqualified),
    lostDealCount: countMatchingStatuses(nexusStatusIsLost),
    onHoldDealCount: countMatchingStatuses(nexusStatusIsOnHold),
  }
}

function mergeNexusDealCategoryCountsWithStatusEvidence(options: {
  dealStatus: string
  dealStatuses: string[]
  dealCount: number
  disqualifiedDealCount: unknown
  lostDealCount: unknown
  onHoldDealCount: unknown
}): Pick<NexusClientRecord, 'disqualifiedDealCount' | 'lostDealCount' | 'onHoldDealCount'> {
  const inferredCounts = inferNexusDealCategoryCountsFromStatuses({
    dealStatus: options.dealStatus,
    dealStatuses: options.dealStatuses,
    dealCount: options.dealCount,
  })
  const hasDisqualifiedDealCount = options.disqualifiedDealCount !== undefined && options.disqualifiedDealCount !== null
  const hasLostDealCount = options.lostDealCount !== undefined && options.lostDealCount !== null
  const hasOnHoldDealCount = options.onHoldDealCount !== undefined && options.onHoldDealCount !== null
  const disqualifiedDealCount = normalizeNexusDealCountInput(options.disqualifiedDealCount)
  const lostDealCount = normalizeNexusDealCountInput(options.lostDealCount)
  const onHoldDealCount = normalizeNexusDealCountInput(options.onHoldDealCount)

  return {
    disqualifiedDealCount: hasDisqualifiedDealCount ? disqualifiedDealCount : inferredCounts.disqualifiedDealCount,
    lostDealCount: hasLostDealCount ? lostDealCount : inferredCounts.lostDealCount,
    onHoldDealCount: hasOnHoldDealCount ? onHoldDealCount : inferredCounts.onHoldDealCount,
  }
}

function resolveNexusCrmSegmentForClient(client: {
  type: NexusClientType
  dealStatus?: string
  dealStatuses?: string[]
  dealCount?: number
  openDealCount?: number
  disqualifiedDealCount?: number
  lostDealCount?: number
  onHoldDealCount?: number
}): NexusCrmSegmentKey {
  const type = normalizeNexusClientType(client.type)
  if (type === 'Client') {
    return 'clients'
  }

  const dealStatus = client.dealStatus?.trim() ?? ''
  const dealStatuses = normalizeNexusDealStatuses(
    dealStatus ? [dealStatus, ...(client.dealStatuses ?? [])] : client.dealStatuses,
  )
  const dealCount = normalizeNexusDealCountInput(client.dealCount)
  const explicitOpenDealCount =
    client.openDealCount === undefined || client.openDealCount === null
      ? null
      : normalizeNexusDealCountInput(client.openDealCount)
  const disqualifiedDealCount = normalizeNexusDealCountInput(client.disqualifiedDealCount)
  const lostDealCount = normalizeNexusDealCountInput(client.lostDealCount)
  const onHoldDealCount = normalizeNexusDealCountInput(client.onHoldDealCount)

  if (disqualifiedDealCount > 0 || dealStatuses.some(nexusStatusIsDisqualified)) {
    return 'disqualified'
  }
  if (onHoldDealCount > 0 || dealStatuses.some(nexusStatusIsOnHold)) {
    return 'on-hold'
  }

  const allKnownDealsAreLost =
    (dealCount > 0 && lostDealCount > 0 && lostDealCount >= dealCount) ||
    (dealStatuses.length > 0 && dealStatuses.every(nexusStatusIsLost))
  if (allKnownDealsAreLost) {
    return 'lost'
  }

  const excludedDealCount = disqualifiedDealCount + lostDealCount + onHoldDealCount
  const openDealCount = explicitOpenDealCount ?? Math.max(0, dealCount - excludedDealCount)
  const hasOpenDealEvidence =
    dealStatuses.some(nexusStatusIsOpenOpportunity) ||
    openDealCount > 0
  if (hasOpenDealEvidence) {
    return 'prospects'
  }

  return 'tam'
}

function defaultNexusClientTypeForCrmSegment(segment: NexusCrmSegmentKey): NexusClientType {
  if (segment === 'clients') {
    return 'Client'
  }
  if (segment === 'prospects') {
    return 'Prospect'
  }
  if (nexusCrmSegmentUsesProspectFields(segment)) {
    return 'Prospect'
  }
  return 'Other'
}

function normalizeNexusImportHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function detectDelimitedTextSeparator(text: string): string {
  const sampleLine = text
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0) ?? ''
  const tabCount = (sampleLine.match(/\t/g) ?? []).length
  const semicolonCount = (sampleLine.match(/;/g) ?? []).length
  const commaCount = (sampleLine.match(/,/g) ?? []).length
  if (tabCount > commaCount && tabCount >= semicolonCount) {
    return '\t'
  }
  if (semicolonCount > commaCount) {
    return ';'
  }
  return ','
}

function parseDelimitedTextRows(text: string): string[][] {
  const separator = detectDelimitedTextSeparator(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && character === separator) {
      row.push(cell)
      cell = ''
      continue
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1
      }
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += character
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows
}

const NEXUS_TAM_IMPORT_FIELD_ALIASES: Record<NexusTamProfileField, readonly string[]> = {
  priorityRank: ['priorityrank', 'rank'],
  tickerSymbol: ['tickersymbol', 'ticker', 'symbol'],
  entityType: ['entitytype', 'type'],
  targetDepartment: ['targetdepartmentdesk', 'targetdepartment', 'targetdesk', 'desk'],
  fitSegment: ['commodityaifitsegment', 'fitsegment', 'segment'],
  qualifyingReason: ['qualifyingreason', 'reason'],
  hqCity: ['hqcity', 'headquartercity', 'city'],
  hqStateRegion: ['hqstateregion', 'hqstate', 'headquarterstate', 'state'],
  hqCountry: ['hqcountry', 'headquartercountry', 'country'],
  region: ['region'],
  operationsFootprint: ['operationsfootprint', 'opsfootprint', 'footprint'],
  employeeCountEstimate: ['employeecountestimate', 'employees', 'employeecount'],
  annualRevenueTtmUsd: ['annualrevenuettmusd', 'annualrevenue', 'revenue'],
  revenueBand: ['revenueband'],
  scaleArchetype: ['scalearchetype', 'scale'],
  ownershipType: ['ownershiptype', 'ownership'],
  wedgeUseCase: ['wedgeusecase', 'wedge'],
  painHypothesis: ['painhypothesis', 'pain'],
  overallAttackScore: ['overallattackscore', 'attackscore'],
  priorityTier: ['prioritytier', 'tier'],
  recommendedMotion: ['recommendedmotion', 'motion'],
  prospectStatus: ['prospectstatus', 'status'],
  dataConfidence: ['dataconfidence', 'confidence'],
  sourceUrls: ['sourceurls', 'sources', 'sourceurl'],
  notes: ['notes', 'note'],
}

type NexusTamImportHeader = {
  companyIndex: number
  nextActionIndex: number | null
  fieldIndexes: Partial<Record<NexusTamProfileField, number>>
}

function resolveNexusTamImportHeader(row: string[]): NexusTamImportHeader | null {
  const normalizedHeaders = row.map(normalizeNexusImportHeader)
  const companyIndex = normalizedHeaders.findIndex((header) =>
    [
      'company',
      'companyname',
      'client',
      'clientname',
      'account',
      'accountname',
      'organization',
      'organisation',
      'name',
      'target',
      'targetaccount',
    ].includes(header),
  )
  if (companyIndex < 0) {
    return null
  }

  const nextActionIndex = normalizedHeaders.findIndex((header) =>
    ['recommendedmotion', 'nextaction', 'nextstep', 'action', 'todo', 'note', 'notes'].includes(header),
  )
  const fieldIndexes = NEXUS_TAM_PROFILE_FIELDS.reduce<Partial<Record<NexusTamProfileField, number>>>(
    (indexes, field) => {
      const aliases = NEXUS_TAM_IMPORT_FIELD_ALIASES[field]
      const fieldIndex = normalizedHeaders.findIndex((header) => aliases.includes(header))
      if (fieldIndex >= 0) {
        indexes[field] = fieldIndex
      }
      return indexes
    },
    {},
  )

  return {
    companyIndex,
    nextActionIndex: nextActionIndex >= 0 ? nextActionIndex : null,
    fieldIndexes,
  }
}

function buildNexusTamProfileFromImportRow(row: string[], header: NexusTamImportHeader | null): NexusTamProfile {
  if (!header) {
    return createEmptyNexusTamProfile()
  }

  return NEXUS_TAM_PROFILE_FIELDS.reduce<NexusTamProfile>((profile, field) => {
    const fieldIndex = header.fieldIndexes[field]
    profile[field] = fieldIndex == null ? '' : (row[fieldIndex] ?? '').trim()
    return profile
  }, createEmptyNexusTamProfile())
}

function normalizeSpreadsheetGridRows(rows: unknown[][]): string[][] {
  return rows.map((row) =>
    row.map((cell) => {
      if (cell == null) {
        return ''
      }
      if (cell instanceof Date) {
        return cell.toISOString()
      }
      return String(cell)
    }),
  )
}

function parseNexusTamImportGrid(rows: string[][]): NexusTamImportParseResult {
  const firstContentRowIndex = rows.findIndex((row) => row.some((cell) => cell.trim().length > 0))
  if (firstContentRowIndex < 0) {
    return {
      rows: [],
      skippedRowCount: rows.length,
    }
  }

  const header = resolveNexusTamImportHeader(rows[firstContentRowIndex])
  const companyIndex = header?.companyIndex ?? 0
  const dataStartIndex = header ? firstContentRowIndex + 1 : firstContentRowIndex
  const parsedRows: NexusTamImportRow[] = []
  let skippedRowCount = 0

  rows.slice(dataStartIndex).forEach((row, rowOffset) => {
    const sourceRowNumber = dataStartIndex + rowOffset + 1
    const clientName = (row[companyIndex] ?? '').trim()
    const tam = buildNexusTamProfileFromImportRow(row, header)
    const nextActionFromHeader = header?.nextActionIndex == null ? '' : (row[header.nextActionIndex] ?? '').trim()
    const nextAction = nextActionFromHeader || tam.recommendedMotion
    if (!clientName) {
      skippedRowCount += 1
      return
    }
    parsedRows.push({
      clientName,
      nextAction,
      tam,
      sourceRowNumber,
    })
  })

  return {
    rows: parsedRows,
    skippedRowCount,
  }
}

function normalizeStoredNexusTamProfile(value: unknown): NexusTamProfile {
  const profile = createEmptyNexusTamProfile()
  if (!isRecord(value)) {
    return profile
  }

  NEXUS_TAM_PROFILE_FIELDS.forEach((field) => {
    const fieldValue = value[field]
    if (typeof fieldValue === 'string') {
      profile[field] = fieldValue.trim()
    }
  })
  return profile
}

async function parseNexusTamImportFile(file: File): Promise<NexusTamImportParseResult> {
  const lowerName = file.name.toLowerCase()
  if (
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.tsv') ||
    lowerName.endsWith('.txt') ||
    file.type === 'text/csv' ||
    file.type === 'text/tab-separated-values'
  ) {
    return parseNexusTamImportGrid(parseDelimitedTextRows(await file.text()))
  }

  if (lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx')) {
    const xlsx = await import('xlsx')
    const workbook = xlsx.read(await file.arrayBuffer(), { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) {
      return {
        rows: [],
        skippedRowCount: 0,
      }
    }
    const sheet = workbook.Sheets[firstSheetName]
    const rawRows = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: '',
    }) as unknown[][]
    return parseNexusTamImportGrid(normalizeSpreadsheetGridRows(rawRows))
  }

  throw new Error('Import a CSV, TSV, XLS, or XLSX file.')
}

function normalizeStoredNexusTool(value: unknown, index: number): NexusTool | null {
  if (!isRecord(value)) {
    return null
  }

  const title = typeof value.title === 'string' ? value.title.trim() : ''
  if (!title) {
    return null
  }

  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : `nexus-tool-restored-${index}`
  const url = typeof value.url === 'string' && value.url.trim() ? value.url.trim() : null

  return {
    id,
    title,
    url,
    accessMethod: value.accessMethod === true,
    application: value.application === true,
    browser: value.browser === true,
    api: value.api === true,
  }
}

function normalizeStoredNexusClient(value: unknown): NexusClientRecord | null {
  if (!isRecord(value)) {
    return null
  }

  const clientName = typeof value.clientName === 'string' ? value.clientName.trim() : ''
  if (!clientName) {
    return null
  }

  const type = normalizeNexusClientType(value.type ?? value.relationship)
  const dealStatus =
    typeof value.dealStatus === 'string'
      ? value.dealStatus.trim()
      : typeof value.status === 'string'
        ? value.status.trim()
        : ''
  const storedDealStatuses = normalizeNexusDealStatuses(value.dealStatuses ?? value.deal_statuses)
  const dealStatuses = storedDealStatuses.length > 0 ? storedDealStatuses : normalizeNexusDealStatuses([dealStatus])
  const owner = typeof value.owner === 'string' ? value.owner.trim() : ''
  const nextAction = typeof value.nextAction === 'string' ? value.nextAction.trim() : ''
  const tam = normalizeStoredNexusTamProfile(value.tam ?? value.tamProfile)
  const disqualificationReason =
    typeof value.disqualificationReason === 'string'
      ? value.disqualificationReason.trim()
      : typeof value.disqualification_reason === 'string'
        ? value.disqualification_reason.trim()
        : ''
  const lostReason =
    typeof value.lostReason === 'string'
      ? value.lostReason.trim()
      : typeof value.lost_reason === 'string'
        ? value.lost_reason.trim()
        : ''
  const totalArr =
    typeof value.totalArr === 'string'
      ? value.totalArr.trim()
      : typeof value.total_arr === 'string'
        ? value.total_arr.trim()
        : ''
  const storedClosedArr =
    typeof value.closedArr === 'string'
      ? value.closedArr.trim()
      : typeof value.closed_arr === 'string'
        ? value.closed_arr.trim()
        : ''
  const storedOpenArr =
    typeof value.openArr === 'string'
      ? value.openArr.trim()
      : typeof value.open_arr === 'string'
        ? value.open_arr.trim()
        : ''
  const rawDealCount = value.dealCount ?? value.deal_count
  const dealCount =
    typeof rawDealCount === 'number' && Number.isFinite(rawDealCount)
      ? Math.max(0, Math.trunc(rawDealCount))
      : typeof rawDealCount === 'string'
        ? normalizeNexusDealCountValue(rawDealCount)
        : 0
  const categoryCounts = mergeNexusDealCategoryCountsWithStatusEvidence({
    dealStatus,
    dealStatuses,
    dealCount,
    disqualifiedDealCount: value.disqualifiedDealCount ?? value.disqualified_deal_count,
    lostDealCount: value.lostDealCount ?? value.lost_deal_count,
    onHoldDealCount: value.onHoldDealCount ?? value.on_hold_deal_count,
  })
  const rawClosedDealCount = value.closedDealCount ?? value.closed_deal_count
  const rawOpenDealCount = value.openDealCount ?? value.open_deal_count
  const hasStoredClosedDealCount = rawClosedDealCount !== undefined && rawClosedDealCount !== null
  const hasStoredOpenDealCount = rawOpenDealCount !== undefined && rawOpenDealCount !== null
  const legacyRecordLooksClosed =
    type === 'Client' || nexusStatusIsClosedWon(dealStatus) || dealStatuses.some(nexusStatusIsClosedWon)
  const legacyOpenDealCount = legacyRecordLooksClosed
    ? 0
    : Math.max(
        0,
        dealCount - categoryCounts.disqualifiedDealCount - categoryCounts.lostDealCount - categoryCounts.onHoldDealCount,
      )
  const closedDealCount = hasStoredClosedDealCount
    ? normalizeNexusDealCountInput(rawClosedDealCount)
    : legacyRecordLooksClosed
      ? dealCount
      : 0
  const openDealCount = hasStoredOpenDealCount
    ? normalizeNexusDealCountInput(rawOpenDealCount)
    : legacyOpenDealCount
  const closedArr = storedClosedArr || (legacyRecordLooksClosed ? totalArr : '')
  const openArr = storedOpenArr || (!legacyRecordLooksClosed ? totalArr : '')

  return {
    clientName,
    type,
    owner,
    dealStatus,
    dealStatuses,
    ...categoryCounts,
    disqualificationReason,
    lostReason,
    closedArr,
    openArr,
    closedDealCount,
    openDealCount,
    totalArr: totalArr || closedArr || openArr,
    dealCount,
    nextAction,
    tam,
  }
}

function normalizeStoredNexusClientLink(value: unknown, index: number): NexusClientLink | null {
  if (!isRecord(value)) {
    return null
  }

  const clientName = typeof value.clientName === 'string' ? value.clientName.trim() : ''
  const provider = value.provider === 'notion' || value.provider === 'grain' ? value.provider : null
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  const url = typeof value.url === 'string' ? normalizeNexusExternalUrl(value.url) : null
  if (!clientName || !provider || !title || !url) {
    return null
  }

  const id =
    typeof value.id === 'string' && value.id.trim()
      ? value.id.trim()
      : `nexus-client-link-restored-${index}`
  const createdAt =
    typeof value.createdAt === 'string' && value.createdAt.trim()
      ? value.createdAt.trim()
      : new Date(0).toISOString()

  return {
    id,
    clientName,
    provider,
    title,
    url,
    createdAt,
  }
}

function loadStoredNexusClients(): NexusClientRecord[] {
  if (typeof window === 'undefined') {
    return createDefaultNexusClients()
  }

  try {
    const rawValue = window.localStorage.getItem(NEXUS_CLIENTS_STORAGE_KEY)
    if (!rawValue) {
      return createDefaultNexusClients()
    }
    const parsedValue: unknown = JSON.parse(rawValue)
    if (!Array.isArray(parsedValue)) {
      return createDefaultNexusClients()
    }
    if (parsedValue.length === 0) {
      return []
    }

    const clients = parsedValue
      .map((value) => normalizeStoredNexusClient(value))
      .filter((value): value is NexusClientRecord => value !== null)
    return clients.length > 0 ? clients : createDefaultNexusClients()
  } catch {
    return createDefaultNexusClients()
  }
}

function loadStoredNexusTools(): NexusTool[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(NEXUS_TOOLS_STORAGE_KEY)
    if (!rawValue) {
      return []
    }
    const parsedValue: unknown = JSON.parse(rawValue)
    if (!Array.isArray(parsedValue)) {
      return []
    }
    return parsedValue
      .map((value, index) => normalizeStoredNexusTool(value, index))
      .filter((value): value is NexusTool => value !== null)
  } catch {
    return []
  }
}

function loadStoredNexusClientLinks(): NexusClientLink[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(NEXUS_CLIENT_LINKS_STORAGE_KEY)
    if (!rawValue) {
      return []
    }
    const parsedValue: unknown = JSON.parse(rawValue)
    if (!Array.isArray(parsedValue)) {
      return []
    }
    return parsedValue
      .map((value, index) => normalizeStoredNexusClientLink(value, index))
      .filter((value): value is NexusClientLink => value !== null)
  } catch {
    return []
  }
}

function persistStoredNexusClients(clients: NexusClientRecord[]): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(NEXUS_CLIENTS_STORAGE_KEY, JSON.stringify(clients))
  } catch {
    // Browser storage can be unavailable in private or constrained contexts.
  }
}

function persistStoredNexusTools(tools: NexusTool[]): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (tools.length === 0) {
      window.localStorage.removeItem(NEXUS_TOOLS_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(NEXUS_TOOLS_STORAGE_KEY, JSON.stringify(tools))
  } catch {
    // Browser storage can be unavailable in private or constrained contexts.
  }
}

function persistStoredNexusClientLinks(links: NexusClientLink[]): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (links.length === 0) {
      window.localStorage.removeItem(NEXUS_CLIENT_LINKS_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(NEXUS_CLIENT_LINKS_STORAGE_KEY, JSON.stringify(links))
  } catch {
    // Browser storage can be unavailable in private or constrained contexts.
  }
}

function normalizeNexusToolUrl(rawUrl: string): string | null {
  return normalizeNexusExternalUrl(rawUrl)
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
  return [
    deal.stage,
    deal.value,
    deal.close_date,
    deal.disqualification_reason ? `Reason ${deal.disqualification_reason}` : null,
  ]
    .filter(Boolean)
    .join(' - ')
}

function buildAttioContactMeta(contact: AttioClientEnrichmentRecord['contacts'][number]): string {
  return [contact.title, contact.email, contact.phone].filter(Boolean).join(' - ')
}

function buildNexusContactKeyPart(value: string, maxLength: number): string {
  const normalized = value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const truncated = normalized.slice(0, maxLength).replace(/^-+|-+$/g, '')
  return truncated || 'contact'
}

function buildNexusAttioContactId(clientName: NexusClientName, contactRecordId: string): string {
  return `nexus-attio-contact-${buildNexusContactKeyPart(clientName, 32)}-${buildNexusContactKeyPart(
    contactRecordId,
    36,
  )}`
}

function formatNexusIntegrationDate(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function buildNotionPageMeta(page: NotionClientPagesRecord['pages'][number]): string {
  const relevanceConfidence =
    typeof page.relevance_confidence === 'number' && Number.isFinite(page.relevance_confidence)
      ? page.relevance_confidence
      : 0
  const confidence =
    relevanceConfidence > 0
      ? `${Math.round(relevanceConfidence * 100)}% confidence`
      : null
  const lastEdited = formatNexusIntegrationDate(page.last_edited_time)
  const location = lastEdited ? `Last edited ${lastEdited}` : page.parent_type ? `${page.parent_type} page` : 'Notion page'
  const basis = Array.isArray(page.relevance_basis) ? (page.relevance_basis[0] ?? null) : null
  return [confidence, basis, location].filter(Boolean).join(' - ')
}

function formatGrainDuration(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return null
  }

  const totalMinutes = Math.max(1, Math.round(seconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`
  }
  if (hours > 0) {
    return `${hours}h`
  }
  return `${minutes}m`
}

function buildGrainRecordingMeta(recording: GrainClientRecordingsRecord['recordings'][number]): string {
  const started = formatNexusIntegrationDate(recording.start_time)
  const duration = formatGrainDuration(recording.duration_seconds)
  const participants =
    recording.participant_count == null
      ? null
      : `${recording.participant_count} participant${recording.participant_count === 1 ? '' : 's'}`
  return [started, duration, participants, recording.source].filter(Boolean).join(' - ')
}

function buildLinearIssueMeta(issue: LinearClientIssuesRecord['issues'][number]): string {
  const state = issue.state_name ? `${issue.state_name}${issue.state_type ? ` (${issue.state_type})` : ''}` : null
  const team = issue.team_key ?? issue.team_name
  const assignee = issue.assignee_name ? `Assigned to ${issue.assignee_name}` : null
  const priority = issue.priority_label ? `Priority ${issue.priority_label}` : null
  const project = issue.project_name
  return [state, team, assignee, priority, project].filter(Boolean).join(' - ')
}

function formatNexusEngagementProvider(provider: NexusClientEngagementsRecord['items'][number]['provider']): string {
  return provider === 'gmail' ? 'Gmail' : 'Slack'
}

function buildNexusEngagementBasisLabel(matchedBasis: string[]): string | null {
  const labels: string[] = []
  if (matchedBasis.some((basis) => basis.endsWith('client_name'))) {
    labels.push('name')
  }
  if (matchedBasis.some((basis) => basis.includes('domain:'))) {
    labels.push('domain')
  }
  if (matchedBasis.some((basis) => basis.includes('contact_email:'))) {
    labels.push('contact')
  }
  if (matchedBasis.some((basis) => basis === 'gmail_query')) {
    labels.push('Gmail query')
  }
  return labels.length > 0 ? `Matched ${labels.join(', ')}` : null
}

function buildNexusEngagementMeta(
  engagement: NexusClientEngagementsRecord['items'][number],
  options: { includeProvider?: boolean } = {},
): string {
  const provider = options.includeProvider === false ? null : formatNexusEngagementProvider(engagement.provider)
  const occurredAt = formatNexusIntegrationDate(engagement.occurred_at)
  const author = engagement.author?.trim() || null
  const basis = buildNexusEngagementBasisLabel(engagement.matched_basis)
  return [provider, occurredAt, author, basis].filter(Boolean).join(' - ')
}

type NexusGmailSummaryDraft = {
  clientName: string
  generatedAt: string
  itemCount: number
  headline: string
  points: string[]
}

function buildNexusGmailSummaryDraft(
  clientName: string,
  engagements: NexusClientEngagementsRecord['items'],
): NexusGmailSummaryDraft {
  const sortedEngagements = [...engagements].sort((left, right) => {
    const leftTime = left.occurred_at ? new Date(left.occurred_at).getTime() : 0
    const rightTime = right.occurred_at ? new Date(right.occurred_at).getTime() : 0
    return rightTime - leftTime
  })
  const latestEngagement = sortedEngagements[0] ?? null
  const authors = Array.from(
    new Set(
      sortedEngagements
        .map((engagement) => engagement.author?.trim())
        .filter((author): author is string => Boolean(author)),
    ),
  )
  const titles = Array.from(
    new Set(
      sortedEngagements
        .map((engagement) => engagement.title?.trim())
        .filter((title): title is string => Boolean(title)),
    ),
  )
  const snippets = sortedEngagements
    .map((engagement) => engagement.snippet?.trim())
    .filter((snippet): snippet is string => Boolean(snippet))
  const latestDate = formatNexusIntegrationDate(latestEngagement?.occurred_at)
  const points = [
    `${sortedEngagements.length} Gmail ${
      sortedEngagements.length === 1 ? 'message has' : 'messages have'
    } matched ${clientName} in the loaded engagement window.`,
  ]

  if (latestEngagement) {
    points.push(
      `Latest touch: ${latestEngagement.title || 'Gmail message'}${
        latestDate ? ` on ${latestDate}` : ''
      }${latestEngagement.author ? ` from ${latestEngagement.author}` : ''}.`,
    )
  }
  if (authors.length > 0) {
    points.push(
      `Visible participants include ${authors.slice(0, 3).join(', ')}${
        authors.length > 3 ? ', and others' : ''
      }.`,
    )
  }
  if (titles.length > 1) {
    points.push(`Recent threads include ${titles.slice(0, 3).join('; ')}${titles.length > 3 ? '; and more' : ''}.`)
  }
  if (snippets[0]) {
    points.push(`Most recent context: ${snippets[0]}`)
  }

  return {
    clientName,
    generatedAt: new Date().toISOString(),
    itemCount: sortedEngagements.length,
    headline: `${clientName} Gmail activity`,
    points,
  }
}

function filterNexusEngagementWarnings(
  warnings: string[],
  provider: NexusClientEngagementsRecord['items'][number]['provider'],
): string[] {
  const providerName = provider
  const otherProviderName = provider === 'gmail' ? 'slack' : 'gmail'
  return warnings.filter((warning) => {
    const normalizedWarning = warning.toLocaleLowerCase()
    return normalizedWarning.includes(providerName) || !normalizedWarning.includes(otherProviderName)
  })
}

type NexusContact = {
  id: string
  clientName: NexusClientName
  name: string
  firstName?: string | null
  lastName?: string | null
  title?: string | null
  role?: string | null
  timeAtRole?: string | null
  previousRole?: string | null
  university?: string | null
  university2?: string | null
  location?: string | null
  email?: string | null
  phone?: string | null
  webUrl?: string | null
  source?: 'manual' | 'attio'
}

type NexusContactDraft = {
  firstName: string
  lastName: string
  role: string
  timeAtRole: string
  previousRole: string
  university: string
  university2: string
  location: string
}

type NexusContactDraftField = keyof NexusContactDraft

function createNexusContactDraft(): NexusContactDraft {
  return {
    firstName: '',
    lastName: '',
    role: '',
    timeAtRole: '',
    previousRole: '',
    university: '',
    university2: '',
    location: '',
  }
}

function buildNexusContactName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
}

function mapAttioContactToNexusContact(
  clientName: NexusClientName,
  contact: AttioClientEnrichmentRecord['contacts'][number],
): NexusContact {
  return {
    id: buildNexusAttioContactId(clientName, contact.record_id),
    clientName,
    name: contact.name,
    firstName: null,
    lastName: null,
    title: contact.title,
    role: contact.title,
    timeAtRole: null,
    previousRole: null,
    university: null,
    university2: null,
    location: null,
    email: contact.email,
    phone: contact.phone,
    webUrl: contact.web_url,
    source: 'attio',
  }
}

function mapNexusContactRecord(record: NexusContactRecord): NexusContact {
  return {
    id: record.contact_id,
    clientName: record.client_name,
    name: record.name,
    firstName: record.first_name,
    lastName: record.last_name,
    title: record.title,
    role: record.role,
    timeAtRole: record.time_at_role,
    previousRole: record.previous_role,
    university: record.university,
    university2: record.university_2,
    location: record.location,
    email: record.email,
    phone: record.phone,
    webUrl: record.web_url,
    source: record.source,
  }
}

function mergeNexusContacts(currentContacts: NexusContact[], nextContacts: NexusContact[]): NexusContact[] {
  if (nextContacts.length === 0) {
    return currentContacts
  }

  const nextContactsById = new Map(nextContacts.map((contact) => [contact.id, contact]))
  let changed = false
  const mergedContacts = currentContacts.map((contact) => {
    const nextContact = nextContactsById.get(contact.id)
    if (!nextContact) {
      return contact
    }

    nextContactsById.delete(contact.id)
    if (
      contact.clientName !== nextContact.clientName ||
      contact.name !== nextContact.name ||
      contact.firstName !== nextContact.firstName ||
      contact.lastName !== nextContact.lastName ||
      contact.title !== nextContact.title ||
      contact.role !== nextContact.role ||
      contact.timeAtRole !== nextContact.timeAtRole ||
      contact.previousRole !== nextContact.previousRole ||
      contact.university !== nextContact.university ||
      contact.university2 !== nextContact.university2 ||
      contact.location !== nextContact.location ||
      contact.email !== nextContact.email ||
      contact.phone !== nextContact.phone ||
      contact.webUrl !== nextContact.webUrl ||
      contact.source !== nextContact.source
    ) {
      changed = true
      return nextContact
    }

    return contact
  })

  if (nextContactsById.size > 0) {
    changed = true
    mergedContacts.push(...nextContactsById.values())
  }

  return changed ? mergedContacts : currentContacts
}

function mergeAttioContactsIntoNexusContacts(
  currentContacts: NexusContact[],
  clientName: NexusClientName,
  attioContacts: AttioClientEnrichmentRecord['contacts'],
): NexusContact[] {
  if (attioContacts.length === 0) {
    return currentContacts
  }

  const attioContactsById = new Map(
    attioContacts.map((contact) => [
      buildNexusAttioContactId(clientName, contact.record_id),
      mapAttioContactToNexusContact(clientName, contact),
    ]),
  )
  let changed = false

  const mergedContacts = currentContacts.map((contact) => {
    const attioContact = attioContactsById.get(contact.id)
    if (!attioContact) {
      return contact
    }

    attioContactsById.delete(contact.id)
    const nextContact = { ...contact, ...attioContact }
    if (
      contact.name !== nextContact.name ||
      contact.title !== nextContact.title ||
      contact.role !== nextContact.role ||
      contact.email !== nextContact.email ||
      contact.phone !== nextContact.phone ||
      contact.webUrl !== nextContact.webUrl ||
      contact.source !== nextContact.source
    ) {
      changed = true
      return nextContact
    }

    return contact
  })

  if (attioContactsById.size > 0) {
    changed = true
    mergedContacts.push(...attioContactsById.values())
  }

  return changed ? mergedContacts : currentContacts
}

function buildNexusContactMeta(contact: NexusContact): string {
  const role = contact.role?.trim() || contact.title?.trim() || null
  const previousRole = contact.previousRole?.trim() ? `Previous ${contact.previousRole.trim()}` : null
  return [
    role,
    contact.timeAtRole,
    previousRole,
    contact.university,
    contact.university2,
    contact.location,
    contact.email,
    contact.phone,
  ]
    .filter(Boolean)
    .join(' - ')
}

function normalizeNexusDealCountValue(value: string): number {
  const parsedValue = Number.parseInt(value.trim(), 10)
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0
}

function parseNexusArrSortValue(value: string): number {
  const normalizedValue = value.trim()
  if (!normalizedValue) {
    return 0
  }
  const parsedValue = Number.parseFloat(normalizedValue.replace(/[^0-9.-]+/g, ''))
  return Number.isFinite(parsedValue) ? parsedValue : 0
}

function buildNexusDealCategoryCountSummary(counts: {
  disqualifiedDealCount: number
  lostDealCount: number
  onHoldDealCount: number
}): string[] {
  return [
    counts.disqualifiedDealCount > 0
      ? `${counts.disqualifiedDealCount} disqualified deal${counts.disqualifiedDealCount === 1 ? '' : 's'}`
      : null,
    counts.lostDealCount > 0 ? `${counts.lostDealCount} lost deal${counts.lostDealCount === 1 ? '' : 's'}` : null,
    counts.onHoldDealCount > 0
      ? `${counts.onHoldDealCount} on-hold deal${counts.onHoldDealCount === 1 ? '' : 's'}`
      : null,
  ].filter((value): value is string => value !== null)
}

type NexusClientRow = {
  clientName: NexusClientName
  type: NexusClientType
  segment: NexusCrmSegmentKey
  owner: string
  dealStatus: string
  dealStatuses: string[]
  disqualifiedDealCount: number
  lostDealCount: number
  onHoldDealCount: number
  disqualificationReason: string
  lostReason: string
  closedArr: string
  openArr: string
  closedDealCount: number
  openDealCount: number
  totalArr: string
  dealCount: number
  typeSortRank: number
  tam: NexusTamProfile
  contactCount: number
  todoCount: number
  nextAction: string
}

type NexusContactRow = {
  id: string
  clientName: NexusClientName
  segment: NexusCrmSegmentKey
  name: string
  role: string
  timeAtRole: string
  previousRole: string
  university: string
  university2: string
  location: string
  email: string
  phone: string
  sourceLabel: string
}

function resolveNexusClientTypeSortRank(type: NexusClientType): number {
  const typeIndex = NEXUS_CLIENT_TYPES.indexOf(type)
  return typeIndex >= 0 ? typeIndex : NEXUS_CLIENT_TYPES.length
}

function nexusClientMatchesCrmSegment(row: NexusClientRow, segment: NexusCrmSegmentKey): boolean {
  return row.segment === segment
}

function createNexusClientContactCountColumn(label: string, id = 'contacts'): DataSheetColumn<NexusClientRow> {
  return {
    id,
    label,
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
  }
}

const NEXUS_TAM_CONTACT_COUNT_TABLE_COLUMN = createNexusClientContactCountColumn('Contact Count', 'contact-count')

const NEXUS_CLIENT_BASE_TABLE_COLUMNS: DataSheetColumn<NexusClientRow>[] = [
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
    id: 'type',
    label: 'Type',
    width: '12rem',
    filterPlaceholder: 'Type',
    sortValue: (row) => row.typeSortRank,
    filterValue: (row) => row.type,
    renderCell: (row) => <span className="nexus-client-status">{row.type}</span>,
  },
  createNexusClientContactCountColumn('Contacts'),
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

function createNexusDealCategoryCountColumn(
  field: NexusDealCategoryCountField,
  label: string,
  options: {
    onDealCategoryCountChange: (clientName: NexusClientName, field: NexusDealCategoryCountField, value: string) => void
  },
): DataSheetColumn<NexusClientRow> {
  return {
    id: field.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`),
    label,
    width: '9.5rem',
    align: 'end',
    filterPlaceholder: 'Count',
    sortValue: (row) => row[field],
    filterValue: (row) => `${row[field]} ${label.toLowerCase()}`,
    editable: {
      value: (row) => (row[field] > 0 ? String(row[field]) : ''),
      onChange: (row, value) => options.onDealCategoryCountChange(row.clientName, field, value),
      onBlur: (row, value) =>
        options.onDealCategoryCountChange(row.clientName, field, String(normalizeNexusDealCountValue(value))),
      placeholder: '0',
    },
  }
}

function nexusDealCategoryCountFieldsForCrmSegment(segment: NexusCrmSegmentKey): readonly NexusDealCategoryCountField[] {
  if (segment === 'clients' || segment === 'prospects' || segment === 'tam') {
    return []
  }
  if (segment === 'disqualified') {
    return ['disqualifiedDealCount']
  }
  if (segment === 'lost') {
    return ['lostDealCount']
  }
  if (segment === 'on-hold') {
    return ['onHoldDealCount']
  }
  return NEXUS_DEAL_CATEGORY_COUNT_FIELDS
}

function createNexusDealCategoryCountColumns(options: {
  segment: NexusCrmSegmentKey
  onDealCategoryCountChange: (clientName: NexusClientName, field: NexusDealCategoryCountField, value: string) => void
}): DataSheetColumn<NexusClientRow>[] {
  return nexusDealCategoryCountFieldsForCrmSegment(options.segment).map((field) =>
    createNexusDealCategoryCountColumn(field, NEXUS_DEAL_CATEGORY_COUNT_LABELS[field], options),
  )
}

function nexusDealCategoryReasonFieldForCrmSegment(segment: NexusCrmSegmentKey): NexusDealCategoryReasonField | null {
  if (segment === 'disqualified') {
    return 'disqualificationReason'
  }
  if (segment === 'lost') {
    return 'lostReason'
  }
  return null
}

function createNexusDealCategoryReasonColumn(
  field: NexusDealCategoryReasonField,
  options: {
    onDealCategoryReasonChange: (clientName: NexusClientName, field: NexusDealCategoryReasonField, value: string) => void
  },
): DataSheetColumn<NexusClientRow> {
  return {
    id: field.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`),
    label: NEXUS_DEAL_CATEGORY_REASON_LABELS[field],
    width: '16rem',
    filterPlaceholder: 'Reason',
    sortValue: (row) => row[field],
    filterValue: (row) => row[field],
    editable: {
      value: (row) => row[field],
      onChange: (row, value) => options.onDealCategoryReasonChange(row.clientName, field, value),
      onBlur: (row, value) => options.onDealCategoryReasonChange(row.clientName, field, value.trim()),
      placeholder: 'Reason',
    },
  }
}

const NEXUS_TAM_PROFILE_COLUMN_WIDTHS: Partial<Record<NexusTamProfileField, string>> = {
  priorityRank: '5.5rem',
  priorityTier: '13rem',
  fitSegment: '15rem',
  region: '11rem',
  hqCountry: '10rem',
  revenueBand: '12rem',
  employeeCountEstimate: '8rem',
  overallAttackScore: '8rem',
  prospectStatus: '11rem',
  recommendedMotion: '20rem',
  sourceUrls: '14rem',
  notes: '18rem',
}

function parseNexusTamProfileSortValue(value: string): string | number {
  const numericValue = Number(value.replace(/[$,]/g, ''))
  if (Number.isFinite(numericValue) && value.trim() !== '') {
    return numericValue
  }
  return value
}

function createNexusTamProfileColumn(field: NexusTamProfileField): DataSheetColumn<NexusClientRow> {
  const isNumeric = field === 'priorityRank' || field === 'overallAttackScore'
  return {
    id: `tam-${field.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`,
    label: NEXUS_TAM_PROFILE_LABELS[field],
    width: NEXUS_TAM_PROFILE_COLUMN_WIDTHS[field] ?? '12rem',
    align: isNumeric ? 'end' : 'start',
    filterPlaceholder: NEXUS_TAM_PROFILE_LABELS[field],
    sortValue: (row) => parseNexusTamProfileSortValue(row.tam[field]),
    filterValue: (row) => row.tam[field],
    renderCell: (row) => {
      const value = row.tam[field]
      return <span className={value ? '' : 'nexus-muted-cell'}>{value || '-'}</span>
    },
  }
}

function createNexusClientTableColumns(options: {
  segment: NexusCrmSegmentKey
  onDealStatusChange: (clientName: NexusClientName, value: string) => void
  onOwnerChange: (clientName: NexusClientName, value: string) => void
  onArrChange: (clientName: NexusClientName, field: NexusArrField, value: string) => void
  onDealCountChange: (clientName: NexusClientName, field: NexusDealCountField, value: string) => void
  onDealCategoryCountChange: (clientName: NexusClientName, field: NexusDealCategoryCountField, value: string) => void
  onDealCategoryReasonChange: (clientName: NexusClientName, field: NexusDealCategoryReasonField, value: string) => void
}): DataSheetColumn<NexusClientRow>[] {
  const dealCategoryCountColumns = createNexusDealCategoryCountColumns(options)
  const dealCategoryReasonField = nexusDealCategoryReasonFieldForCrmSegment(options.segment)
  const dealCategoryReasonColumns = dealCategoryReasonField
    ? [createNexusDealCategoryReasonColumn(dealCategoryReasonField, options)]
    : []

  if (options.segment === 'clients') {
    const createArrColumn = (field: NexusArrField): DataSheetColumn<NexusClientRow> => ({
      id: field.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`),
      label: NEXUS_ARR_FIELD_LABELS[field],
      width: '10rem',
      align: 'end',
      filterPlaceholder: 'ARR',
      sortValue: (row) => parseNexusArrSortValue(row[field]),
      filterValue: (row) => row[field],
      editable: {
        value: (row) => row[field],
        onChange: (row, value) => options.onArrChange(row.clientName, field, value),
        onBlur: (row, value) => options.onArrChange(row.clientName, field, value.trim()),
        placeholder: '-',
      },
    })
    const createDealCountColumn = (field: NexusDealCountField): DataSheetColumn<NexusClientRow> => ({
      id: field.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`),
      label: NEXUS_DEAL_COUNT_FIELD_LABELS[field],
      width: '9.5rem',
      align: 'end',
      filterPlaceholder: 'Count',
      sortValue: (row) => row[field],
      filterValue: (row) => `${row[field]} deal${row[field] === 1 ? '' : 's'}`,
      editable: {
        value: (row) => (row[field] > 0 ? String(row[field]) : ''),
        onChange: (row, value) => options.onDealCountChange(row.clientName, field, value),
        onBlur: (row, value) =>
          options.onDealCountChange(row.clientName, field, String(normalizeNexusDealCountValue(value))),
        placeholder: '0',
      },
    })

    return [
      ...NEXUS_CLIENT_BASE_TABLE_COLUMNS.slice(0, 2),
      createArrColumn('closedArr'),
      createArrColumn('openArr'),
      createDealCountColumn('closedDealCount'),
      createDealCountColumn('openDealCount'),
      ...dealCategoryCountColumns,
      ...NEXUS_CLIENT_BASE_TABLE_COLUMNS.slice(3),
    ]
  }

  if (options.segment === 'tam') {
    return [
      ...NEXUS_CLIENT_BASE_TABLE_COLUMNS.slice(0, 2),
      NEXUS_TAM_CONTACT_COUNT_TABLE_COLUMN,
      ...NEXUS_TAM_TABLE_FIELDS.map((field) => createNexusTamProfileColumn(field)),
      ...NEXUS_CLIENT_BASE_TABLE_COLUMNS.slice(4),
    ]
  }

  if (!nexusCrmSegmentUsesProspectFields(options.segment)) {
    return [
      ...NEXUS_CLIENT_BASE_TABLE_COLUMNS.slice(0, 3),
      ...dealCategoryCountColumns,
      ...NEXUS_CLIENT_BASE_TABLE_COLUMNS.slice(3),
    ]
  }

  const dealStatusColumn: DataSheetColumn<NexusClientRow> = {
    id: 'deal-status',
    label: 'Deal Status',
    width: '13rem',
    filterPlaceholder: 'Status',
    sortValue: (row) => row.dealStatus,
    filterValue: (row) => row.dealStatus,
    editable: {
      value: (row) => row.dealStatus,
      onChange: (row, value) => options.onDealStatusChange(row.clientName, value),
      onBlur: (row, value) => options.onDealStatusChange(row.clientName, value.trim()),
      placeholder: 'Deal status',
    },
  }
  const ownerColumn: DataSheetColumn<NexusClientRow> = {
    id: 'owner',
    label: 'Owner',
    width: '12rem',
    filterPlaceholder: 'Owner',
    sortValue: (row) => row.owner,
    filterValue: (row) => row.owner,
    editable: {
      value: (row) => row.owner,
      onChange: (row, value) => options.onOwnerChange(row.clientName, value),
      onBlur: (row, value) => options.onOwnerChange(row.clientName, value.trim()),
      placeholder: 'Owner',
    },
  }

  return [
    ...NEXUS_CLIENT_BASE_TABLE_COLUMNS.slice(0, 2),
    ownerColumn,
    dealStatusColumn,
    ...dealCategoryCountColumns,
    ...dealCategoryReasonColumns,
    ...NEXUS_CLIENT_BASE_TABLE_COLUMNS.slice(3),
  ]
}

const NEXUS_CONTACT_TABLE_COLUMNS: DataSheetColumn<NexusContactRow>[] = [
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
    id: 'contact',
    label: 'Contact',
    width: '16rem',
    filterPlaceholder: 'Contact',
    sortValue: (row) => row.name,
    filterValue: (row) => row.name,
    renderCell: (row) => <strong className="nexus-contact-name">{row.name}</strong>,
  },
  {
    id: 'company',
    label: 'Company',
    width: '16rem',
    filterPlaceholder: 'Company',
    sortValue: (row) => row.clientName,
    filterValue: (row) => row.clientName,
    renderCell: (row) => <span className="nexus-contact-company">{row.clientName}</span>,
  },
  {
    id: 'role',
    label: 'Role',
    width: '16rem',
    filterPlaceholder: 'Role',
    sortValue: (row) => row.role,
    filterValue: (row) => row.role,
    renderCell: (row) => <span className={row.role ? '' : 'nexus-muted-cell'}>{row.role || '-'}</span>,
  },
  {
    id: 'time-at-role',
    label: 'Time at Role',
    width: '10rem',
    filterPlaceholder: 'Tenure',
    sortValue: (row) => row.timeAtRole,
    filterValue: (row) => row.timeAtRole,
    renderCell: (row) => <span className={row.timeAtRole ? '' : 'nexus-muted-cell'}>{row.timeAtRole || '-'}</span>,
  },
  {
    id: 'previous-role',
    label: 'Previous Role',
    width: '16rem',
    filterPlaceholder: 'Previous',
    sortValue: (row) => row.previousRole,
    filterValue: (row) => row.previousRole,
    renderCell: (row) => <span className={row.previousRole ? '' : 'nexus-muted-cell'}>{row.previousRole || '-'}</span>,
  },
  {
    id: 'university',
    label: 'University',
    width: '14rem',
    filterPlaceholder: 'University',
    sortValue: (row) => row.university,
    filterValue: (row) => row.university,
    renderCell: (row) => <span className={row.university ? '' : 'nexus-muted-cell'}>{row.university || '-'}</span>,
  },
  {
    id: 'university-2',
    label: 'University 2',
    width: '14rem',
    filterPlaceholder: 'University 2',
    sortValue: (row) => row.university2,
    filterValue: (row) => row.university2,
    renderCell: (row) => <span className={row.university2 ? '' : 'nexus-muted-cell'}>{row.university2 || '-'}</span>,
  },
  {
    id: 'location',
    label: 'Location',
    width: '13rem',
    filterPlaceholder: 'Location',
    sortValue: (row) => row.location,
    filterValue: (row) => row.location,
    renderCell: (row) => <span className={row.location ? '' : 'nexus-muted-cell'}>{row.location || '-'}</span>,
  },
  {
    id: 'email',
    label: 'Email',
    width: '18rem',
    filterPlaceholder: 'Email',
    sortValue: (row) => row.email,
    filterValue: (row) => row.email,
    renderCell: (row) => <span className={row.email ? 'nexus-contact-email' : 'nexus-muted-cell'}>{row.email || '-'}</span>,
  },
  {
    id: 'phone',
    label: 'Phone',
    width: '11rem',
    filterPlaceholder: 'Phone',
    sortValue: (row) => row.phone,
    filterValue: (row) => row.phone,
    renderCell: (row) => <span className={row.phone ? '' : 'nexus-muted-cell'}>{row.phone || '-'}</span>,
  },
  {
    id: 'source',
    label: 'Source',
    width: '8rem',
    filterPlaceholder: 'Source',
    sortValue: (row) => row.sourceLabel,
    filterValue: (row) => row.sourceLabel,
    renderCell: (row) => <span className="nexus-contact-source">{row.sourceLabel}</span>,
  },
]

function createNexusToolTableColumns(options: {
  onTextChange: (toolId: string, field: NexusToolTextField, value: string) => void
  onBooleanChange: (toolId: string, field: NexusToolBooleanField, value: boolean) => void
}): DataSheetColumn<NexusTool>[] {
  const booleanColumn = (
    id: string,
    label: string,
    field: NexusToolBooleanField,
    width: string,
  ): DataSheetColumn<NexusTool> => ({
    id,
    label,
    width,
    align: 'center',
    filterPlaceholder: 'TRUE/FALSE',
    sortValue: (row) => row[field],
    filterValue: (row) => (row[field] ? 'TRUE' : 'FALSE'),
    editable: {
      inputType: 'checkbox',
      checked: (row) => row[field],
      onChange: (row, value) => options.onBooleanChange(row.id, field, value),
      trueLabel: 'TRUE',
      falseLabel: 'FALSE',
    },
  })

  return [
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
      editable: {
        value: (row) => row.title,
        onChange: (row, value) => options.onTextChange(row.id, 'title', value),
        placeholder: 'Tool name',
        error: (row) => (row.title.trim() ? null : 'Required'),
      },
    },
    {
      id: 'link',
      label: 'Link',
      width: '22rem',
      filterPlaceholder: 'Link',
      sortValue: (row) => row.url ?? '',
      filterValue: (row) => row.url ?? 'No link added',
      editable: {
        value: (row) => row.url ?? '',
        onChange: (row, value) => options.onTextChange(row.id, 'url', value),
        onBlur: (row, value) => options.onTextChange(row.id, 'url', normalizeNexusToolUrl(value) ?? ''),
        placeholder: 'No link added',
      },
    },
    booleanColumn('access-method', 'Access Method', 'accessMethod', '9rem'),
    booleanColumn('application', 'Application', 'application', '8rem'),
    booleanColumn('browser', 'Browser', 'browser', '8rem'),
    booleanColumn('api', 'API', 'api', '6rem'),
  ]
}

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
  const nexusTamImportFileInputRef = useRef<HTMLInputElement | null>(null)
  const [activeNexusView, setActiveNexusView] = useState<NexusViewKey>('crm')
  const [nexusClients, setNexusClients] = useState<NexusClientRecord[]>(loadStoredNexusClients)
  const [nexusClientSyncReview, setNexusClientSyncReview] = useState<NexusClientSyncReview | null>(null)
  const [nexusClientDraft, setNexusClientDraft] = useState<NexusClientDraft>(() => createNexusClientRecord(''))
  const [nexusClientSyncPending, setNexusClientSyncPending] = useState(false)
  const [nexusClientSyncStatus, setNexusClientSyncStatus] = useState('')
  const [nexusClientSyncError, setNexusClientSyncError] = useState('')
  const [nexusTamImportPending, setNexusTamImportPending] = useState(false)
  const [nexusTamImportStatus, setNexusTamImportStatus] = useState('')
  const [nexusTamImportError, setNexusTamImportError] = useState('')
  const [selectedNexusClient, setSelectedNexusClient] = useState<NexusClientName>(
    () => nexusClients[0]?.clientName ?? '',
  )
  const [activeNexusCrmSegment, setActiveNexusCrmSegment] = useState<NexusCrmSegmentKey>('clients')
  const [activeNexusCrmDetailView, setActiveNexusCrmDetailView] = useState<NexusCrmDetailViewKey>('companies')
  const [nexusContactDraft, setNexusContactDraft] = useState<NexusContactDraft>(() => createNexusContactDraft())
  const [nexusContactDialogOpen, setNexusContactDialogOpen] = useState(false)
  const [nexusContacts, setNexusContacts] = useState<NexusContact[]>([])
  const [nexusContactsLoaded, setNexusContactsLoaded] = useState(false)
  const [nexusContactsLoading, setNexusContactsLoading] = useState(false)
  const [nexusContactsError, setNexusContactsError] = useState('')
  const [nexusContactsLoadAttempt, setNexusContactsLoadAttempt] = useState(0)
  const [nexusContactSavePending, setNexusContactSavePending] = useState(false)
  const [selectedNexusContactId, setSelectedNexusContactId] = useState<string | null>(null)
  const [nexusTodoDraft, setNexusTodoDraft] = useState('')
  const [nexusTodoClientDraft, setNexusTodoClientDraft] = useState<NexusClientName>(
    () => nexusClients[0]?.clientName ?? '',
  )
  const [nexusTodos, setNexusTodos] = useState<NexusTodo[]>([])
  const [nexusToolTitleDraft, setNexusToolTitleDraft] = useState('')
  const [nexusToolUrlDraft, setNexusToolUrlDraft] = useState('')
  const [nexusToolBooleanDraft, setNexusToolBooleanDraft] = useState<NexusToolBooleanDraft>(() =>
    createNexusToolBooleanDraft(),
  )
  const [nexusTools, setNexusTools] = useState<NexusTool[]>(loadStoredNexusTools)
  const [selectedNexusToolId, setSelectedNexusToolId] = useState<string | null>(null)
  const [nexusClientLinks, setNexusClientLinks] = useState<NexusClientLink[]>(loadStoredNexusClientLinks)
  const [nexusNotionLinkDraft, setNexusNotionLinkDraft] = useState<NexusClientLinkDraft>(() =>
    createNexusClientLinkDraft(),
  )
  const [nexusGrainLinkDraft, setNexusGrainLinkDraft] = useState<NexusClientLinkDraft>(() =>
    createNexusClientLinkDraft(),
  )
  const [attioClientEnrichmentByName, setAttioClientEnrichmentByName] = useState<
    Record<string, AttioClientEnrichmentRecord>
  >({})
  const [attioClientEnrichmentLoading, setAttioClientEnrichmentLoading] = useState(false)
  const [attioClientEnrichmentError, setAttioClientEnrichmentError] = useState('')
  const [notionClientPagesByName, setNotionClientPagesByName] = useState<Record<string, NotionClientPagesRecord>>({})
  const [notionClientPagesLoading, setNotionClientPagesLoading] = useState(false)
  const [notionClientPagesError, setNotionClientPagesError] = useState('')
  const [grainClientRecordingsByName, setGrainClientRecordingsByName] = useState<
    Record<string, GrainClientRecordingsRecord>
  >({})
  const [grainClientRecordingsLoading, setGrainClientRecordingsLoading] = useState(false)
  const [grainClientRecordingsError, setGrainClientRecordingsError] = useState('')
  const [linearClientIssuesByName, setLinearClientIssuesByName] = useState<Record<string, LinearClientIssuesRecord>>({})
  const [linearClientIssuesLoading, setLinearClientIssuesLoading] = useState(false)
  const [linearClientIssuesError, setLinearClientIssuesError] = useState('')
  const [linearClientIssuesRefreshTick, setLinearClientIssuesRefreshTick] = useState(0)
  const [nexusClientEngagementsByName, setNexusClientEngagementsByName] = useState<
    Record<string, NexusClientEngagementsRecord>
  >({})
  const [nexusClientEngagementsLoading, setNexusClientEngagementsLoading] = useState(false)
  const [nexusClientEngagementsError, setNexusClientEngagementsError] = useState('')
  const [nexusClientEngagementsRefreshTick, setNexusClientEngagementsRefreshTick] = useState(0)
  const [nexusGmailEngagementExpanded, setNexusGmailEngagementExpanded] = useState(true)
  const [nexusGmailSummaryByName, setNexusGmailSummaryByName] = useState<Record<string, NexusGmailSummaryDraft>>({})
  const [nexusClientIntegrationRefreshedAtByName, setNexusClientIntegrationRefreshedAtByName] = useState<
    Record<string, number>
  >({})
  const nexusClientIntegrationRefreshCursorRef = useRef(0)
  const nexusClientIntegrationRefreshInFlightRef = useRef<Set<string>>(new Set())
  const nexusClientIntegrationRefreshedAtByNameRef = useRef<Record<string, number>>({})
  const isNexusProduct = activeProduct === 'nexus'
  const activeNexusNavItem =
    NEXUS_NAV_ITEMS.find((item) => item.key === activeNexusView) ?? NEXUS_NAV_ITEMS[0]
  const trimmedNexusClientDraft = nexusClientDraft.clientName.trim()
  const nexusClientDraftAlreadyExists =
    trimmedNexusClientDraft.length > 0 &&
    nexusClients.some(
      (client) => client.clientName.localeCompare(trimmedNexusClientDraft, undefined, { sensitivity: 'accent' }) === 0,
    )
  const nexusContactDraftName = buildNexusContactName(nexusContactDraft.firstName, nexusContactDraft.lastName)
  const nexusContactDraftCanSave = nexusContactDraftName.length > 0
  const selectedNexusClientTodos = useMemo(
    () => nexusTodos.filter((todo) => todo.clientName === selectedNexusClient),
    [nexusTodos, selectedNexusClient],
  )
  const retainedNexusContacts = useMemo(
    () =>
      Object.entries(attioClientEnrichmentByName).reduce<NexusContact[]>(
        (contacts, [clientName, enrichment]) =>
          mergeAttioContactsIntoNexusContacts(contacts, clientName, enrichment.contacts),
        nexusContacts,
      ),
    [attioClientEnrichmentByName, nexusContacts],
  )
  const selectedNexusClientContacts = useMemo(
    () => retainedNexusContacts.filter((contact) => contact.clientName === selectedNexusClient),
    [retainedNexusContacts, selectedNexusClient],
  )
  const nexusClientSegmentByName = useMemo(() => {
    const segments = new Map<NexusClientName, NexusCrmSegmentKey>()
    nexusClients.forEach((client) => {
      segments.set(
        client.clientName,
        resolveNexusCrmSegmentForClient({
          type: normalizeNexusClientType(client.type),
          dealStatus: client.dealStatus,
          dealStatuses: client.dealStatuses,
          dealCount: client.dealCount,
          openDealCount: client.openDealCount,
          disqualifiedDealCount: client.disqualifiedDealCount,
          lostDealCount: client.lostDealCount,
          onHoldDealCount: client.onHoldDealCount,
        }),
      )
    })
    return segments
  }, [nexusClients])
  const nexusContactRows = useMemo<NexusContactRow[]>(
    () =>
      retainedNexusContacts.map((contact) => ({
        id: contact.id,
        clientName: contact.clientName,
        segment: nexusClientSegmentByName.get(contact.clientName) ?? 'tam',
        name: contact.name,
        role: contact.role?.trim() || contact.title?.trim() || '',
        timeAtRole: contact.timeAtRole?.trim() ?? '',
        previousRole: contact.previousRole?.trim() ?? '',
        university: contact.university?.trim() ?? '',
        university2: contact.university2?.trim() ?? '',
        location: contact.location?.trim() ?? '',
        email: contact.email?.trim() ?? '',
        phone: contact.phone?.trim() ?? '',
        sourceLabel: contact.source === 'attio' ? 'Attio' : 'Manual',
      })),
    [nexusClientSegmentByName, retainedNexusContacts],
  )
  const selectedAttioClientEnrichment = attioClientEnrichmentByName[selectedNexusClient] ?? null
  const selectedNotionClientPages = notionClientPagesByName[selectedNexusClient] ?? null
  const selectedGrainClientRecordings = grainClientRecordingsByName[selectedNexusClient] ?? null
  const selectedLinearClientIssues = linearClientIssuesByName[selectedNexusClient] ?? null
  const selectedNexusClientEngagements = nexusClientEngagementsByName[selectedNexusClient] ?? null
  const selectedNexusClientDomains = useMemo(
    () => selectedAttioClientEnrichment?.company?.domains ?? [],
    [selectedAttioClientEnrichment],
  )
  const selectedNexusClientContactEmails = useMemo(
    () =>
      selectedNexusClientContacts
        .map((contact) => contact.email?.trim())
        .filter((email): email is string => Boolean(email)),
    [selectedNexusClientContacts],
  )
  const selectedNexusClientSegment = nexusClientSegmentByName.get(selectedNexusClient) ?? 'clients'
  const selectedNexusClientIsClient = selectedNexusClientSegment === 'clients'
  const selectedNexusCompanyKindLabel =
    selectedNexusClientSegment === 'clients'
      ? 'Nexus client'
      : selectedNexusClientSegment === 'prospects'
        ? 'Nexus opportunity'
        : 'Nexus company'
  const nexusClientIntegrationSyncClientNames = useMemo(() => {
    const clientNames = nexusClients
      .filter(
        (client) =>
          resolveNexusCrmSegmentForClient({
            type: normalizeNexusClientType(client.type),
            dealStatus: client.dealStatus,
            dealStatuses: client.dealStatuses,
            dealCount: client.dealCount,
            openDealCount: client.openDealCount,
            disqualifiedDealCount: client.disqualifiedDealCount,
            lostDealCount: client.lostDealCount,
            onHoldDealCount: client.onHoldDealCount,
          }) === 'clients',
      )
      .map((client) => client.clientName)
    if (!selectedNexusClient || !clientNames.includes(selectedNexusClient)) {
      return clientNames
    }
    return [selectedNexusClient, ...clientNames.filter((clientName) => clientName !== selectedNexusClient)]
  }, [nexusClients, selectedNexusClient])
  const selectedNexusNotionLinks = useMemo(
    () => nexusClientLinks.filter((link) => link.clientName === selectedNexusClient && link.provider === 'notion'),
    [nexusClientLinks, selectedNexusClient],
  )
  const selectedNexusGrainLinks = useMemo(
    () => nexusClientLinks.filter((link) => link.clientName === selectedNexusClient && link.provider === 'grain'),
    [nexusClientLinks, selectedNexusClient],
  )
  const nexusContactCountByClient = useMemo(() => {
    const counts = new Map<NexusClientName, number>()
    retainedNexusContacts.forEach((contact) => {
      counts.set(contact.clientName, (counts.get(contact.clientName) ?? 0) + 1)
    })
    return counts
  }, [retainedNexusContacts])
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
        const type = normalizeNexusClientType(client.type)
        const dealStatuses = normalizeNexusDealStatuses(client.dealStatuses)
        const segment = resolveNexusCrmSegmentForClient({
          type,
          dealStatus: client.dealStatus,
          dealStatuses,
          dealCount: client.dealCount,
          openDealCount: client.openDealCount,
          disqualifiedDealCount: client.disqualifiedDealCount,
          lostDealCount: client.lostDealCount,
          onHoldDealCount: client.onHoldDealCount,
        })
        const contactCount = nexusContactCountByClient.get(clientName) ?? 0
        const todoCount = nexusTodoCountByClient.get(clientName) ?? 0
        const nextAction = client.nextAction.trim() || (todoCount > 0 ? 'Review open To-Dos' : 'Add To-Do')

        return {
          clientName,
          type,
          segment,
          owner: client.owner.trim(),
          dealStatus: client.dealStatus.trim(),
          dealStatuses,
          disqualifiedDealCount: client.disqualifiedDealCount,
          lostDealCount: client.lostDealCount,
          onHoldDealCount: client.onHoldDealCount,
          disqualificationReason: client.disqualificationReason.trim(),
          lostReason: client.lostReason.trim(),
          closedArr: client.closedArr.trim(),
          openArr: client.openArr.trim(),
          closedDealCount: client.closedDealCount,
          openDealCount: client.openDealCount,
          totalArr: client.totalArr.trim(),
          dealCount: client.dealCount,
          typeSortRank: resolveNexusClientTypeSortRank(type),
          tam: client.tam,
          contactCount,
          todoCount,
          nextAction,
        }
      }),
    [nexusClients, nexusContactCountByClient, nexusTodoCountByClient],
  )
  const nexusClientRowByName = useMemo(
    () => new Map(nexusClientRows.map((client) => [client.clientName, client])),
    [nexusClientRows],
  )
  const activeNexusCrmSegmentLabel = NEXUS_CRM_SEGMENT_LABELS[activeNexusCrmSegment]
  const activeNexusCrmSegmentDescription = NEXUS_CRM_SEGMENT_DESCRIPTIONS[activeNexusCrmSegment]
  const activeNexusCrmCompanyRows = useMemo(
    () => nexusClientRows.filter((client) => nexusClientMatchesCrmSegment(client, activeNexusCrmSegment)),
    [activeNexusCrmSegment, nexusClientRows],
  )
  const activeNexusCrmContactRows = useMemo(
    () =>
      nexusContactRows.filter((contact) => {
        const clientRow = nexusClientRowByName.get(contact.clientName)
        return clientRow ? nexusClientMatchesCrmSegment(clientRow, activeNexusCrmSegment) : contact.segment === activeNexusCrmSegment
      }),
    [activeNexusCrmSegment, nexusClientRowByName, nexusContactRows],
  )
  const nexusClientTableColumns = useMemo(
    () =>
      createNexusClientTableColumns({
        segment: activeNexusCrmSegment,
        onDealStatusChange: updateNexusClientDealStatus,
        onOwnerChange: updateNexusClientOwner,
        onArrChange: updateNexusClientArr,
        onDealCountChange: updateNexusClientDealCount,
        onDealCategoryCountChange: updateNexusClientDealCategoryCount,
        onDealCategoryReasonChange: updateNexusClientDealCategoryReason,
      }),
    [activeNexusCrmSegment],
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

  const refreshNexusClientIntegrationData = useCallback(
    async (
      clientName: NexusClientName,
      options: {
        showLoading?: boolean
        surfaceErrors?: boolean
      } = {},
    ) => {
      const normalizedClientName = clientName.trim()
      const accessToken = authSession?.accessToken
      if (!normalizedClientName || !accessToken) {
        return
      }

      const refreshKey = normalizedClientName.toLowerCase()
      if (nexusClientIntegrationRefreshInFlightRef.current.has(refreshKey)) {
        return
      }
      nexusClientIntegrationRefreshInFlightRef.current.add(refreshKey)

      const showLoading = options.showLoading === true
      const surfaceErrors = options.surfaceErrors === true
      let attioPayload: AttioClientEnrichmentRecord | null = null

      try {
        if (showLoading) {
          setAttioClientEnrichmentLoading(true)
        }
        if (surfaceErrors) {
          setAttioClientEnrichmentError('')
        }
        try {
          const payload = await loadAttioClientEnrichment(appConfig.apiBase, accessToken, normalizedClientName)
          attioPayload = payload
          setAttioClientEnrichmentByName((currentEnrichment) => ({
            ...currentEnrichment,
            [normalizedClientName]: payload,
          }))
          setNexusContacts((currentContacts) =>
            mergeAttioContactsIntoNexusContacts(currentContacts, normalizedClientName, payload.contacts),
          )
          if (payload.contacts.length > 0) {
            try {
              const records = await importAttioNexusContacts(
                appConfig.apiBase,
                accessToken,
                normalizedClientName,
                payload.contacts,
              )
              setNexusContacts((currentContacts) =>
                mergeNexusContacts(currentContacts, records.map(mapNexusContactRecord)),
              )
              setNexusContactsError('')
            } catch (error: unknown) {
              if (surfaceErrors) {
                const message = error instanceof Error ? error.message : 'Attio contacts could not be retained.'
                setNexusContactsError(message)
              }
            }
          }
          if (surfaceErrors) {
            setAttioClientEnrichmentError('')
          }
        } catch (error: unknown) {
          if (surfaceErrors) {
            const message = error instanceof Error ? error.message : 'Attio client data could not be loaded.'
            setAttioClientEnrichmentError(message)
          }
        } finally {
          if (showLoading) {
            setAttioClientEnrichmentLoading(false)
          }
        }

        const contactEmails =
          attioPayload?.contacts
            .map((contact) => contact.email?.trim())
            .filter((email): email is string => Boolean(email)) ?? []
        const domains = attioPayload?.company?.domains ?? []

        const refreshNotion = async () => {
          if (showLoading) {
            setNotionClientPagesLoading(true)
          }
          if (surfaceErrors) {
            setNotionClientPagesError('')
          }
          try {
            const payload = await loadNotionClientPages(appConfig.apiBase, accessToken, normalizedClientName)
            setNotionClientPagesByName((currentPages) => ({
              ...currentPages,
              [normalizedClientName]: payload,
            }))
            if (surfaceErrors) {
              setNotionClientPagesError('')
            }
          } catch (error: unknown) {
            if (surfaceErrors) {
              const message = error instanceof Error ? error.message : 'Notion client pages could not be loaded.'
              setNotionClientPagesError(message)
            }
          } finally {
            if (showLoading) {
              setNotionClientPagesLoading(false)
            }
          }
        }

        const refreshGrain = async () => {
          if (showLoading) {
            setGrainClientRecordingsLoading(true)
          }
          if (surfaceErrors) {
            setGrainClientRecordingsError('')
          }
          try {
            const payload = await loadGrainClientRecordings(appConfig.apiBase, accessToken, normalizedClientName)
            setGrainClientRecordingsByName((currentRecordings) => ({
              ...currentRecordings,
              [normalizedClientName]: payload,
            }))
            if (surfaceErrors) {
              setGrainClientRecordingsError('')
            }
          } catch (error: unknown) {
            if (surfaceErrors) {
              const message = error instanceof Error ? error.message : 'Grain client recordings could not be loaded.'
              setGrainClientRecordingsError(message)
            }
          } finally {
            if (showLoading) {
              setGrainClientRecordingsLoading(false)
            }
          }
        }

        const refreshLinear = async () => {
          if (showLoading) {
            setLinearClientIssuesLoading(true)
          }
          if (surfaceErrors) {
            setLinearClientIssuesError('')
          }
          try {
            const payload = await loadLinearClientIssues(appConfig.apiBase, accessToken, normalizedClientName)
            setLinearClientIssuesByName((currentIssues) => ({
              ...currentIssues,
              [normalizedClientName]: payload,
            }))
            if (surfaceErrors) {
              setLinearClientIssuesError('')
            }
          } catch (error: unknown) {
            if (surfaceErrors) {
              const message = error instanceof Error ? error.message : 'Linear client issues could not be loaded.'
              setLinearClientIssuesError(message)
            }
          } finally {
            if (showLoading) {
              setLinearClientIssuesLoading(false)
            }
          }
        }

        const refreshEngagements = async () => {
          if (showLoading) {
            setNexusClientEngagementsLoading(true)
          }
          if (surfaceErrors) {
            setNexusClientEngagementsError('')
          }
          try {
            const payload = await loadNexusClientEngagements(appConfig.apiBase, accessToken, {
              client_name: normalizedClientName,
              domains,
              contact_emails: contactEmails,
              lookback_days: 365,
              limit: 12,
            })
            setNexusClientEngagementsByName((currentEngagements) => ({
              ...currentEngagements,
              [normalizedClientName]: payload,
            }))
            if (surfaceErrors) {
              setNexusClientEngagementsError('')
            }
          } catch (error: unknown) {
            if (surfaceErrors) {
              const message = error instanceof Error ? error.message : 'Company engagement could not be loaded.'
              setNexusClientEngagementsError(message)
            }
          } finally {
            if (showLoading) {
              setNexusClientEngagementsLoading(false)
            }
          }
        }

        await Promise.all([refreshNotion(), refreshGrain(), refreshLinear(), refreshEngagements()])
        setNexusClientIntegrationRefreshedAtByName((currentRefreshes) => ({
          ...currentRefreshes,
          [refreshKey]: Date.now(),
        }))
      } finally {
        nexusClientIntegrationRefreshInFlightRef.current.delete(refreshKey)
      }
    },
    [authSession?.accessToken],
  )

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
    persistStoredNexusClients(nexusClients)
  }, [nexusClients])

  useEffect(() => {
    const defaultType = defaultNexusClientTypeForCrmSegment(activeNexusCrmSegment)
    const defaultDealStatus = defaultNexusDealStatusForCrmSegment(activeNexusCrmSegment)
    const defaultCategoryCounts = defaultNexusDealCategoryCountsForCrmSegment(activeNexusCrmSegment)
    setNexusClientDraft((currentDraft) => {
      if (
        currentDraft.clientName.trim() ||
        currentDraft.owner.trim() ||
        currentDraft.closedArr.trim() ||
        currentDraft.openArr.trim() ||
        currentDraft.closedDealCount > 0 ||
        currentDraft.openDealCount > 0 ||
        currentDraft.totalArr.trim() ||
        currentDraft.dealCount > 0 ||
        currentDraft.disqualificationReason.trim() ||
        currentDraft.lostReason.trim() ||
        currentDraft.nextAction.trim()
      ) {
        return currentDraft
      }
      return {
        ...currentDraft,
        type: defaultType,
        dealStatus: defaultDealStatus,
        dealStatuses: defaultDealStatus ? [defaultDealStatus] : [],
        ...defaultCategoryCounts,
      }
    })
  }, [activeNexusCrmSegment])

  useEffect(() => {
    persistStoredNexusTools(nexusTools)
  }, [nexusTools])

  useEffect(() => {
    persistStoredNexusClientLinks(nexusClientLinks)
  }, [nexusClientLinks])

  useEffect(() => {
    nexusClientIntegrationRefreshedAtByNameRef.current = nexusClientIntegrationRefreshedAtByName
  }, [nexusClientIntegrationRefreshedAtByName])

  useEffect(() => {
    if (
      !isNexusProduct ||
      activeNexusView === 'client' ||
      !authSession?.accessToken ||
      !selectedNexusClient ||
      !selectedNexusClientIsClient
    ) {
      return
    }

    const refreshKey = selectedNexusClient.trim().toLowerCase()
    const refreshedAt = nexusClientIntegrationRefreshedAtByName[refreshKey] ?? 0
    if (Date.now() - refreshedAt < NEXUS_CLIENT_INTEGRATION_SELECTED_STALE_MS) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void refreshNexusClientIntegrationData(selectedNexusClient)
    }, NEXUS_CLIENT_INTEGRATION_BACKGROUND_INITIAL_DELAY_MS)

    return () => window.clearTimeout(timeoutId)
  }, [
    activeNexusView,
    authSession?.accessToken,
    isNexusProduct,
    nexusClientIntegrationRefreshedAtByName,
    refreshNexusClientIntegrationData,
    selectedNexusClient,
    selectedNexusClientIsClient,
  ])

  useEffect(() => {
    if (!isNexusProduct || !authSession?.accessToken || nexusClientIntegrationSyncClientNames.length === 0) {
      return
    }

    let cancelled = false

    function syncNextClientBatch() {
      if (cancelled) {
        return
      }
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }

      const clientNames = nexusClientIntegrationSyncClientNames
      if (clientNames.length === 0) {
        return
      }

      const now = Date.now()
      const startIndex = nexusClientIntegrationRefreshCursorRef.current % clientNames.length
      const clientBatch: NexusClientName[] = []
      let scannedCount = 0

      while (scannedCount < clientNames.length && clientBatch.length < NEXUS_CLIENT_INTEGRATION_BACKGROUND_BATCH_SIZE) {
        const clientIndex = (startIndex + scannedCount) % clientNames.length
        const clientName = clientNames[clientIndex]
        const refreshKey = clientName.trim().toLowerCase()
        const refreshedAt = nexusClientIntegrationRefreshedAtByNameRef.current[refreshKey] ?? 0
        if (now - refreshedAt >= NEXUS_CLIENT_INTEGRATION_REFRESH_STALE_MS) {
          clientBatch.push(clientName)
        }
        scannedCount += 1
      }

      nexusClientIntegrationRefreshCursorRef.current = (startIndex + Math.max(scannedCount, 1)) % clientNames.length
      if (clientBatch.length === 0) {
        return
      }

      void Promise.all(clientBatch.map((clientName) => refreshNexusClientIntegrationData(clientName)))
    }

    const timeoutId = window.setTimeout(
      syncNextClientBatch,
      NEXUS_CLIENT_INTEGRATION_BACKGROUND_INITIAL_DELAY_MS,
    )
    const intervalId = window.setInterval(syncNextClientBatch, NEXUS_CLIENT_INTEGRATION_BACKGROUND_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      window.clearInterval(intervalId)
    }
  }, [
    authSession?.accessToken,
    isNexusProduct,
    nexusClientIntegrationSyncClientNames,
    refreshNexusClientIntegrationData,
  ])

  useEffect(() => {
    if (!isNexusProduct || !authSession?.accessToken || nexusContactsLoaded) {
      return
    }

    let cancelled = false

    Promise.resolve()
      .then(() => {
        if (cancelled) {
          return null
        }
        setNexusContactsLoading(true)
        setNexusContactsError('')
        return loadNexusContacts(appConfig.apiBase, authSession.accessToken)
      })
      .then((records) => {
        if (cancelled || !records) {
          return
        }
        setNexusContacts(records.map(mapNexusContactRecord))
        setNexusContactsLoaded(true)
        setNexusContactsError('')
        setNexusContactsLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }
        const message = error instanceof Error ? error.message : 'Nexus contacts could not be loaded.'
        setNexusContactsError(message)
        setNexusContactsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    authSession?.accessToken,
    isNexusProduct,
    nexusContactsLoadAttempt,
    nexusContactsLoaded,
  ])

  useEffect(() => {
    if (!isNexusProduct || activeNexusView !== 'client' || !authSession?.accessToken || !selectedNexusClient) {
      return
    }

    if (selectedAttioClientEnrichment) {
      return
    }

    let cancelled = false

    Promise.resolve()
      .then(() => {
        if (cancelled) {
          return null
        }
        setAttioClientEnrichmentLoading(true)
        setAttioClientEnrichmentError('')
        return loadAttioClientEnrichment(appConfig.apiBase, authSession.accessToken, selectedNexusClient)
      })
      .then((payload) => {
        if (cancelled || !payload) {
          return
        }
        setAttioClientEnrichmentByName((currentEnrichment) => ({
          ...currentEnrichment,
          [selectedNexusClient]: payload,
        }))
        setNexusContacts((currentContacts) =>
          mergeAttioContactsIntoNexusContacts(currentContacts, selectedNexusClient, payload.contacts),
        )
        if (payload.contacts.length > 0) {
          importAttioNexusContacts(
            appConfig.apiBase,
            authSession.accessToken,
            selectedNexusClient,
            payload.contacts,
          )
            .then((records) => {
              if (cancelled) {
                return
              }
              setNexusContacts((currentContacts) =>
                mergeNexusContacts(currentContacts, records.map(mapNexusContactRecord)),
              )
              setNexusContactsError('')
            })
            .catch((error: unknown) => {
              if (cancelled) {
                return
              }
              const message = error instanceof Error ? error.message : 'Attio contacts could not be retained.'
              setNexusContactsError(message)
            })
        }
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

  useEffect(() => {
    if (!isNexusProduct || activeNexusView !== 'client' || !authSession?.accessToken || !selectedNexusClient) {
      return
    }

    if (selectedNotionClientPages) {
      return
    }

    let cancelled = false

    Promise.resolve()
      .then(() => {
        if (cancelled) {
          return null
        }
        setNotionClientPagesLoading(true)
        setNotionClientPagesError('')
        return loadNotionClientPages(appConfig.apiBase, authSession.accessToken, selectedNexusClient)
      })
      .then((payload) => {
        if (cancelled || !payload) {
          return
        }
        setNotionClientPagesByName((currentPages) => ({
          ...currentPages,
          [selectedNexusClient]: payload,
        }))
        setNotionClientPagesLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }
        const message = error instanceof Error ? error.message : 'Notion client pages could not be loaded.'
        setNotionClientPagesError(message)
        setNotionClientPagesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    activeNexusView,
    authSession?.accessToken,
    isNexusProduct,
    selectedNexusClient,
    selectedNotionClientPages,
  ])

  useEffect(() => {
    if (!isNexusProduct || activeNexusView !== 'client' || !authSession?.accessToken || !selectedNexusClient) {
      return
    }

    if (selectedGrainClientRecordings) {
      return
    }

    let cancelled = false

    Promise.resolve()
      .then(() => {
        if (cancelled) {
          return null
        }
        setGrainClientRecordingsLoading(true)
        setGrainClientRecordingsError('')
        return loadGrainClientRecordings(appConfig.apiBase, authSession.accessToken, selectedNexusClient)
      })
      .then((payload) => {
        if (cancelled || !payload) {
          return
        }
        setGrainClientRecordingsByName((currentRecordings) => ({
          ...currentRecordings,
          [selectedNexusClient]: payload,
        }))
        setGrainClientRecordingsLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }
        const message = error instanceof Error ? error.message : 'Grain client recordings could not be loaded.'
        setGrainClientRecordingsError(message)
        setGrainClientRecordingsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    activeNexusView,
    authSession?.accessToken,
    isNexusProduct,
    selectedGrainClientRecordings,
    selectedNexusClient,
  ])

  useEffect(() => {
    if (
      !isNexusProduct ||
      activeNexusView !== 'client' ||
      !authSession?.accessToken ||
      !selectedNexusClient ||
      !selectedNexusClientIsClient
    ) {
      return
    }

    if (selectedLinearClientIssues) {
      return
    }

    let cancelled = false

    Promise.resolve()
      .then(() => {
        if (cancelled) {
          return null
        }
        setLinearClientIssuesLoading(true)
        setLinearClientIssuesError('')
        return loadLinearClientIssues(appConfig.apiBase, authSession.accessToken, selectedNexusClient)
      })
      .then((payload) => {
        if (cancelled || !payload) {
          return
        }
        setLinearClientIssuesByName((currentIssues) => ({
          ...currentIssues,
          [selectedNexusClient]: payload,
        }))
        setLinearClientIssuesLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }
        const message = error instanceof Error ? error.message : 'Linear client issues could not be loaded.'
        setLinearClientIssuesError(message)
        setLinearClientIssuesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    activeNexusView,
    authSession?.accessToken,
    isNexusProduct,
    linearClientIssuesRefreshTick,
    selectedLinearClientIssues,
    selectedNexusClient,
    selectedNexusClientIsClient,
  ])

  useEffect(() => {
    if (!isNexusProduct || activeNexusView !== 'client' || !authSession?.accessToken || !selectedNexusClient) {
      return
    }

    if (selectedNexusClientEngagements) {
      return
    }

    if (!selectedAttioClientEnrichment && !attioClientEnrichmentError) {
      return
    }

    if (!nexusContactsLoaded && !nexusContactsError) {
      return
    }

    let cancelled = false

    Promise.resolve()
      .then(() => {
        if (cancelled) {
          return null
        }
        setNexusClientEngagementsLoading(true)
        setNexusClientEngagementsError('')
        return loadNexusClientEngagements(appConfig.apiBase, authSession.accessToken, {
          client_name: selectedNexusClient,
          domains: selectedNexusClientDomains,
          contact_emails: selectedNexusClientContactEmails,
          lookback_days: 365,
          limit: 12,
        })
      })
      .then((payload) => {
        if (cancelled || !payload) {
          return
        }
        setNexusClientEngagementsByName((currentEngagements) => ({
          ...currentEngagements,
          [selectedNexusClient]: payload,
        }))
        setNexusClientEngagementsLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }
        const message = error instanceof Error ? error.message : 'Company engagement could not be loaded.'
        setNexusClientEngagementsError(message)
        setNexusClientEngagementsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    activeNexusView,
    authSession?.accessToken,
    attioClientEnrichmentError,
    isNexusProduct,
    nexusClientEngagementsRefreshTick,
    nexusContactsError,
    nexusContactsLoaded,
    selectedAttioClientEnrichment,
    selectedNexusClient,
    selectedNexusClientContactEmails,
    selectedNexusClientDomains,
    selectedNexusClientEngagements,
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

        {attioClientEnrichmentLoading && !enrichment ? (
          <div className="nexus-attio-empty">Loading Attio...</div>
        ) : attioClientEnrichmentError && !enrichment ? (
          <div className="nexus-attio-empty nexus-attio-error" role="alert">
            {attioClientEnrichmentError}
          </div>
        ) : !enrichment ? (
          <div className="nexus-attio-empty">No Attio data loaded.</div>
        ) : !enrichment.matched || !company ? (
          <div className="nexus-attio-empty">
            <span>No deal-backed Attio company match found.</span>
            {enrichment.warnings.length > 0 ? <span>{enrichment.warnings.join(' ')}</span> : null}
          </div>
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

  function renderNexusClientSavedLinks(provider: NexusClientLinkProvider) {
    const draft = nexusClientLinkDraftForProvider(provider)
    const links = nexusClientLinksForProvider(provider)
    const providerLabel = provider === 'notion' ? 'Notion' : 'Grain'
    const titleLabel = provider === 'notion' ? 'Notion link title' : 'Grain link title'
    const urlLabel = provider === 'notion' ? 'Notion page URL' : 'Grain recording URL'
    const buttonLabel = provider === 'notion' ? 'Add Notion Link' : 'Add Grain Link'
    const fallbackTitle = nexusClientLinkDefaultTitle(provider)

    return (
      <div className="nexus-client-link-manager">
        <form
          className="nexus-client-link-form"
          onSubmit={(event) => handleAddNexusClientLink(provider, event)}
          aria-label={`Add ${providerLabel} link`}
        >
          <label className="nexus-client-link-field">
            <span>Title</span>
            <input
              type="text"
              value={draft.title}
              onChange={(event) => updateNexusClientLinkDraft(provider, 'title', event.target.value)}
              placeholder={fallbackTitle}
              aria-label={titleLabel}
            />
          </label>
          <label className="nexus-client-link-field nexus-client-link-url-field">
            <span>URL</span>
            <input
              type="text"
              inputMode="url"
              value={draft.url}
              onChange={(event) => updateNexusClientLinkDraft(provider, 'url', event.target.value)}
              onBlur={(event) =>
                updateNexusClientLinkDraft(provider, 'url', normalizeNexusExternalUrl(event.target.value) ?? '')
              }
              placeholder={provider === 'notion' ? 'https://www.notion.so/...' : 'https://grain.com/...'}
              aria-label={urlLabel}
            />
          </label>
          <button type="submit" className="button button-secondary" disabled={!normalizeNexusExternalUrl(draft.url)}>
            {buttonLabel}
          </button>
        </form>

        {links.length > 0 ? (
          <ul className="nexus-client-link-list" aria-label={`${providerLabel} saved links`}>
            {links.map((link) => {
              const savedAt = formatNexusIntegrationDate(link.createdAt)
              return (
                <li key={link.id}>
                  <div>
                    <a href={link.url} target="_blank" rel="noreferrer">
                      {link.title}
                    </a>
                    <span>{savedAt ? `Saved ${savedAt}` : link.url}</span>
                  </div>
                  <button
                    type="button"
                    className="button button-ghost nexus-client-link-remove"
                    onClick={() => handleDeleteNexusClientLink(link)}
                  >
                    Remove
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="nexus-client-link-empty">No saved {providerLabel} links.</div>
        )}
      </div>
    )
  }

  function renderNotionClientSection() {
    const pagesPayload = selectedNotionClientPages
    const pages = pagesPayload?.pages ?? []
    const notionWarnings = pagesPayload?.warnings ?? []
    const countLabel = [
      selectedNexusNotionLinks.length > 0
        ? `${selectedNexusNotionLinks.length} saved`
        : null,
      pagesPayload
        ? `${pagesPayload.returned_page_count} matched`
        : null,
    ]
      .filter(Boolean)
      .join(' - ')

    return (
      <section className="nexus-notion-section" aria-labelledby="nexus-notion-heading">
        <div className="nexus-section-head nexus-notion-head">
          <div>
            <span className="eyebrow">Notion</span>
            <strong id="nexus-notion-heading">Client pages</strong>
          </div>
          {countLabel ? <span className="nexus-notion-count">{countLabel}</span> : null}
        </div>

        {renderNexusClientSavedLinks('notion')}

        {notionClientPagesLoading && !pagesPayload ? (
          <div className="nexus-notion-empty">Loading Notion...</div>
        ) : notionClientPagesError && !pagesPayload ? (
          <div className="nexus-notion-empty nexus-notion-error" role="alert">
            {notionClientPagesError}
          </div>
        ) : !pagesPayload ? (
          <div className="nexus-notion-empty">No Notion pages loaded.</div>
        ) : pages.length > 0 ? (
          <>
            <ul className="nexus-notion-list">
              {pages.map((page) => {
                const title = page.title || 'Untitled Notion page'
                const meta = buildNotionPageMeta(page)
                return (
                  <li key={page.page_id}>
                    <div>
                      {page.url ? (
                        <a href={page.url} target="_blank" rel="noreferrer">
                          {title}
                        </a>
                      ) : (
                        <strong>{title}</strong>
                      )}
                      <span>{meta}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
            {notionWarnings.length > 0 ? (
              <div className="nexus-notion-warning">{notionWarnings.join(' ')}</div>
            ) : null}
          </>
        ) : (
          <>
            <div className="nexus-notion-empty">No Notion pages matched this client.</div>
            {notionWarnings.length > 0 ? (
              <div className="nexus-notion-warning">{notionWarnings.join(' ')}</div>
            ) : null}
          </>
        )}
      </section>
    )
  }

  function renderGrainClientSection() {
    const recordingsPayload = selectedGrainClientRecordings
    const recordings = recordingsPayload?.recordings ?? []
    const grainWarnings = recordingsPayload?.warnings ?? []
    const countLabel = [
      selectedNexusGrainLinks.length > 0
        ? `${selectedNexusGrainLinks.length} saved`
        : null,
      recordingsPayload
        ? `${recordingsPayload.returned_recording_count} matched`
        : null,
    ]
      .filter(Boolean)
      .join(' - ')

    return (
      <section className="nexus-grain-section" aria-labelledby="nexus-grain-heading">
        <div className="nexus-section-head nexus-grain-head">
          <div>
            <span className="eyebrow">Grain</span>
            <strong id="nexus-grain-heading">Recordings</strong>
          </div>
          {countLabel ? <span className="nexus-grain-count">{countLabel}</span> : null}
        </div>

        {renderNexusClientSavedLinks('grain')}

        {grainClientRecordingsLoading && !recordingsPayload ? (
          <div className="nexus-grain-empty">Loading Grain...</div>
        ) : grainClientRecordingsError && !recordingsPayload ? (
          <div className="nexus-grain-empty nexus-grain-error" role="alert">
            {grainClientRecordingsError}
          </div>
        ) : !recordingsPayload ? (
          <div className="nexus-grain-empty">No Grain recordings loaded.</div>
        ) : recordings.length > 0 ? (
          <>
            <ul className="nexus-grain-list">
              {recordings.map((recording) => {
                const title = recording.title || 'Untitled Grain recording'
                const meta = buildGrainRecordingMeta(recording)
                return (
                  <li key={recording.id}>
                    <div>
                      {recording.url ? (
                        <a href={recording.url} target="_blank" rel="noreferrer">
                          {title}
                        </a>
                      ) : (
                        <strong>{title}</strong>
                      )}
                      <span>{meta || 'No Grain detail'}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
            {grainWarnings.length > 0 ? (
              <div className="nexus-grain-warning">{grainWarnings.join(' ')}</div>
            ) : null}
          </>
        ) : (
          <>
            <div className="nexus-grain-empty">No Grain recordings matched this client.</div>
            {grainWarnings.length > 0 ? (
              <div className="nexus-grain-warning">{grainWarnings.join(' ')}</div>
            ) : null}
          </>
        )}
      </section>
    )
  }

  function handleRefreshNexusClientEngagements() {
    setNexusClientEngagementsError('')
    setNexusClientEngagementsByName((currentEngagements) => {
      if (!selectedNexusClient || !currentEngagements[selectedNexusClient]) {
        return currentEngagements
      }
      const nextEngagements = { ...currentEngagements }
      delete nextEngagements[selectedNexusClient]
      return nextEngagements
    })
    setNexusGmailSummaryByName((currentSummaries) => {
      if (!selectedNexusClient || !currentSummaries[selectedNexusClient]) {
        return currentSummaries
      }
      const nextSummaries = { ...currentSummaries }
      delete nextSummaries[selectedNexusClient]
      return nextSummaries
    })
    setNexusClientEngagementsRefreshTick((currentTick) => currentTick + 1)
  }

  function handleGenerateNexusGmailSummary(gmailEngagements: NexusClientEngagementsRecord['items']) {
    if (!selectedNexusClient || gmailEngagements.length === 0) {
      return
    }
    const summaryDraft = buildNexusGmailSummaryDraft(selectedNexusClient, gmailEngagements)
    setNexusGmailSummaryByName((currentSummaries) => ({
      ...currentSummaries,
      [selectedNexusClient]: summaryDraft,
    }))
    setNexusGmailEngagementExpanded(true)
  }

  function renderNexusEngagementSection(provider: NexusClientEngagementsRecord['items'][number]['provider']) {
    const engagementsPayload = selectedNexusClientEngagements
    const engagements = (engagementsPayload?.items ?? []).filter((engagement) => engagement.provider === provider)
    const engagementWarnings = filterNexusEngagementWarnings(engagementsPayload?.warnings ?? [], provider)
    const isGmail = provider === 'gmail'
    const gmailSummary = isGmail && selectedNexusClient ? nexusGmailSummaryByName[selectedNexusClient] ?? null : null
    const providerLabel = formatNexusEngagementProvider(provider)
    const sourceCount = engagementsPayload?.source_counts[provider] ?? engagements.length
    const countLabel =
      engagementsPayload && sourceCount !== engagements.length
        ? `${engagements.length} shown of ${sourceCount}`
        : engagementsPayload
          ? `${engagements.length} matched`
          : ''
    const headingId = `nexus-${provider}-engagement-heading`
    const sectionTitle = provider === 'gmail' ? 'Inbox engagement' : 'Slack engagement'
    const loadingLabel = provider === 'gmail' ? 'Loading Gmail...' : 'Loading Slack...'
    const unloadedLabel =
      provider === 'gmail' ? 'No Gmail engagement loaded.' : 'No Slack engagement loaded.'
    const emptyLabel =
      provider === 'gmail'
        ? 'No Gmail messages matched this company.'
        : 'No Slack messages matched this company.'
    const queryLabel = provider === 'gmail' ? engagementsPayload?.gmail_query ?? null : null
    const bodyId = `nexus-${provider}-engagement-body`
    const bodyCollapsed = isGmail && !nexusGmailEngagementExpanded
    const canGenerateGmailSummary = isGmail && engagements.length > 0 && !nexusClientEngagementsLoading
    const generatedSummaryDate = gmailSummary ? formatNexusIntegrationDate(gmailSummary.generatedAt) : null

    return (
      <section
        className={`nexus-engagement-section nexus-engagement-section-${provider}${
          bodyCollapsed ? ' is-collapsed' : ''
        }`}
        aria-labelledby={headingId}
      >
        <div className="nexus-section-head nexus-engagement-head">
          <div>
            <span className="eyebrow">{providerLabel}</span>
            <strong id={headingId}>{sectionTitle}</strong>
          </div>
          <div className="nexus-engagement-actions">
            {countLabel ? <span className="nexus-engagement-count">{countLabel}</span> : null}
            {isGmail ? (
              <button
                type="button"
                className="button button-secondary nexus-engagement-action-button"
                onClick={() => handleGenerateNexusGmailSummary(engagements)}
                disabled={!canGenerateGmailSummary}
              >
                Generate AI Summary
              </button>
            ) : null}
            <button
              type="button"
              className="button button-secondary nexus-engagement-action-button"
              onClick={handleRefreshNexusClientEngagements}
              disabled={!authSession?.accessToken || nexusClientEngagementsLoading}
            >
              {nexusClientEngagementsLoading ? 'Refreshing...' : 'Refresh'}
            </button>
            {isGmail ? (
              <button
                type="button"
                className="nexus-engagement-collapse-button"
                aria-expanded={nexusGmailEngagementExpanded}
                aria-controls={bodyId}
                aria-label={nexusGmailEngagementExpanded ? 'Collapse Gmail engagement' : 'Expand Gmail engagement'}
                onClick={() => setNexusGmailEngagementExpanded((expanded) => !expanded)}
              >
                <span className="nexus-engagement-toggle-indicator" aria-hidden="true">
                  {nexusGmailEngagementExpanded ? '−' : '+'}
                </span>
              </button>
            ) : null}
          </div>
        </div>
        <div id={bodyId} className="nexus-engagement-body" hidden={bodyCollapsed}>
          {gmailSummary ? (
            <div className="nexus-engagement-summary" aria-live="polite">
              <div className="nexus-engagement-summary-title">
                <strong>{gmailSummary.headline}</strong>
                <span>
                  {gmailSummary.itemCount} source {gmailSummary.itemCount === 1 ? 'message' : 'messages'}
                  {generatedSummaryDate ? ` - Generated ${generatedSummaryDate}` : ''}
                </span>
              </div>
              <ul>
                {gmailSummary.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {queryLabel ? <div className="nexus-engagement-query">{queryLabel}</div> : null}

          {nexusClientEngagementsLoading && !engagementsPayload ? (
            <div className="nexus-engagement-empty">{loadingLabel}</div>
          ) : nexusClientEngagementsError && !engagementsPayload ? (
            <div className="nexus-engagement-empty nexus-engagement-error" role="alert">
              {nexusClientEngagementsError}
            </div>
          ) : !engagementsPayload ? (
            <div className="nexus-engagement-empty">{unloadedLabel}</div>
          ) : engagements.length > 0 ? (
            <>
              <ul className="nexus-engagement-list">
                {engagements.map((engagement) => {
                  const meta = buildNexusEngagementMeta(engagement, { includeProvider: false })
                  const title = engagement.title || `${formatNexusEngagementProvider(engagement.provider)} engagement`
                  return (
                    <li key={`${engagement.provider}-${engagement.external_id}`}>
                      <div>
                        {engagement.url ? (
                          <a href={engagement.url} target="_blank" rel="noreferrer">
                            {title}
                          </a>
                        ) : (
                          <strong>{title}</strong>
                        )}
                        <span>{meta || 'No engagement detail'}</span>
                        {engagement.snippet ? (
                          <span className="nexus-engagement-snippet">{engagement.snippet}</span>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {engagementWarnings.length > 0 ? (
                <div className="nexus-engagement-warning">{engagementWarnings.join(' ')}</div>
              ) : null}
            </>
          ) : (
            <>
              <div className="nexus-engagement-empty">{emptyLabel}</div>
              {engagementWarnings.length > 0 ? (
                <div className="nexus-engagement-warning">{engagementWarnings.join(' ')}</div>
              ) : null}
            </>
          )}
        </div>
      </section>
    )
  }

  function handleSyncLinearClientIssues() {
    setLinearClientIssuesError('')
    setLinearClientIssuesByName((currentIssues) => {
      if (!selectedNexusClient || !currentIssues[selectedNexusClient]) {
        return currentIssues
      }
      const nextIssues = { ...currentIssues }
      delete nextIssues[selectedNexusClient]
      return nextIssues
    })
    setLinearClientIssuesRefreshTick((currentTick) => currentTick + 1)
  }

  function renderLinearClientSection() {
    if (!selectedNexusClientIsClient) {
      return null
    }

    const issuesPayload = selectedLinearClientIssues
    const issues = issuesPayload?.issues ?? []
    const linearWarnings = issuesPayload?.warnings ?? []
    const countLabel = issuesPayload ? `${issuesPayload.returned_issue_count} matched` : ''

    return (
      <section className="nexus-linear-section" aria-labelledby="nexus-linear-heading">
        <div className="nexus-section-head nexus-linear-head">
          <div>
            <span className="eyebrow">Linear</span>
            <strong id="nexus-linear-heading">Issues</strong>
          </div>
          <div className="nexus-linear-actions">
            {countLabel ? <span className="nexus-linear-count">{countLabel}</span> : null}
            <button
              type="button"
              className="button button-secondary"
              onClick={handleSyncLinearClientIssues}
              disabled={!authSession?.accessToken || linearClientIssuesLoading}
            >
              {linearClientIssuesLoading ? 'Syncing...' : 'Sync Linear'}
            </button>
          </div>
        </div>

        {linearClientIssuesLoading && !issuesPayload ? (
          <div className="nexus-linear-empty">Loading Linear...</div>
        ) : linearClientIssuesError && !issuesPayload ? (
          <div className="nexus-linear-empty nexus-linear-error" role="alert">
            {linearClientIssuesError}
          </div>
        ) : !issuesPayload ? (
          <div className="nexus-linear-empty">No Linear issues loaded.</div>
        ) : issues.length > 0 ? (
          <>
            <ul className="nexus-linear-list">
              {issues.map((issue) => {
                const title = `${issue.identifier} - ${issue.title}`
                const meta = buildLinearIssueMeta(issue)
                const labels = issue.label_names.length > 0 ? `Labels ${issue.label_names.join(', ')}` : null
                return (
                  <li key={issue.id}>
                    <div>
                      {issue.url ? (
                        <a href={issue.url} target="_blank" rel="noreferrer">
                          {title}
                        </a>
                      ) : (
                        <strong>{title}</strong>
                      )}
                      <span>{meta || 'No Linear detail'}</span>
                      {labels ? <span>{labels}</span> : null}
                    </div>
                  </li>
                )
              })}
            </ul>
            {linearWarnings.length > 0 ? (
              <div className="nexus-linear-warning">{linearWarnings.join(' ')}</div>
            ) : null}
          </>
        ) : (
          <>
            <div className="nexus-linear-empty">No Linear issues matched this client.</div>
            {linearWarnings.length > 0 ? (
              <div className="nexus-linear-warning">{linearWarnings.join(' ')}</div>
            ) : null}
          </>
        )}
      </section>
    )
  }

  function openNexusClient(clientName: NexusClientName) {
    const cachedAttioClientEnrichment = attioClientEnrichmentByName[clientName]
    if (cachedAttioClientEnrichment) {
      setNexusContacts((currentContacts) =>
        mergeAttioContactsIntoNexusContacts(currentContacts, clientName, cachedAttioClientEnrichment.contacts),
      )
    }
    setSelectedNexusClient(clientName)
    setNexusTodoClientDraft(clientName)
    setNexusContactDraft(createNexusContactDraft())
    setNexusContactDialogOpen(false)
    setNexusTodoDraft('')
    setNexusNotionLinkDraft(createNexusClientLinkDraft())
    setNexusGrainLinkDraft(createNexusClientLinkDraft())
    setActiveNexusView('client')
    shell.setMobileNavOpen(false)
  }

  function updateNexusClientDraft(field: keyof NexusClientDraft, value: string) {
    setNexusClientDraft((currentDraft) => {
      const nextDraft = {
        ...currentDraft,
        [field]:
          field === 'type'
            ? normalizeNexusClientType(value)
            : field === 'dealCount' || isNexusDealCountField(field) || isNexusDealCategoryCountField(field)
              ? normalizeNexusDealCountValue(value)
              : value,
        ...(field === 'dealStatus' ? { dealStatuses: value.trim() ? [value.trim()] : [] } : {}),
      }

      if (field !== 'dealStatus') {
        return nextDraft
      }

      const inferredCounts = inferNexusDealCategoryCountsFromStatuses({
        dealStatus: value,
        dealStatuses: value.trim() ? [value.trim()] : [],
        dealCount: nextDraft.dealCount,
      })
      return {
        ...nextDraft,
        disqualifiedDealCount: Math.max(nextDraft.disqualifiedDealCount, inferredCounts.disqualifiedDealCount),
        lostDealCount: Math.max(nextDraft.lostDealCount, inferredCounts.lostDealCount),
        onHoldDealCount: Math.max(nextDraft.onHoldDealCount, inferredCounts.onHoldDealCount),
      }
    })
  }

  function updateNexusContactDraft(field: NexusContactDraftField, value: string) {
    setNexusContactDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }))
  }

  function handleOpenNexusContactDialog() {
    setNexusContactsError('')
    setNexusContactDraft(createNexusContactDraft())
    setNexusContactDialogOpen(true)
  }

  function handleCloseNexusContactDialog() {
    if (nexusContactSavePending) {
      return
    }
    setNexusContactDialogOpen(false)
  }

  function updateNexusClientDealStatus(clientName: NexusClientName, value: string) {
    setNexusClients((currentClients) =>
      currentClients.map((client) =>
        client.clientName === clientName
          ? (() => {
              const inferredCounts = inferNexusDealCategoryCountsFromStatuses({
                dealStatus: value,
                dealStatuses: value.trim() ? [value.trim()] : [],
                dealCount: client.dealCount,
              })
              return {
                ...client,
                dealStatus: value,
                dealStatuses: value.trim() ? [value.trim()] : [],
                disqualifiedDealCount: Math.max(client.disqualifiedDealCount, inferredCounts.disqualifiedDealCount),
                lostDealCount: Math.max(client.lostDealCount, inferredCounts.lostDealCount),
                onHoldDealCount: Math.max(client.onHoldDealCount, inferredCounts.onHoldDealCount),
              }
            })()
          : client,
      ),
    )
  }

  function updateNexusClientOwner(clientName: NexusClientName, value: string) {
    setNexusClients((currentClients) =>
      currentClients.map((client) =>
        client.clientName === clientName
          ? {
              ...client,
              owner: value,
            }
          : client,
      ),
    )
  }

  function updateNexusClientArr(clientName: NexusClientName, field: NexusArrField, value: string) {
    setNexusClients((currentClients) =>
      currentClients.map((client) =>
        client.clientName === clientName
          ? {
              ...client,
              [field]: value,
            }
          : client,
      ),
    )
  }

  function updateNexusClientDealCount(clientName: NexusClientName, field: NexusDealCountField, value: string) {
    setNexusClients((currentClients) =>
      currentClients.map((client) =>
        client.clientName === clientName
          ? (() => {
              const nextClient = {
                ...client,
                [field]: normalizeNexusDealCountValue(value),
              }
              return {
                ...nextClient,
                dealCount:
                  nextClient.closedDealCount +
                  nextClient.openDealCount +
                  nextClient.disqualifiedDealCount +
                  nextClient.lostDealCount +
                  nextClient.onHoldDealCount,
              }
            })()
          : client,
      ),
    )
  }

  function updateNexusClientDealCategoryCount(
    clientName: NexusClientName,
    field: NexusDealCategoryCountField,
    value: string,
  ) {
    setNexusClients((currentClients) =>
      currentClients.map((client) =>
        client.clientName === clientName
          ? (() => {
              const nextClient = {
                ...client,
                [field]: normalizeNexusDealCountValue(value),
              }
              return {
                ...nextClient,
                dealCount:
                  nextClient.closedDealCount +
                  nextClient.openDealCount +
                  nextClient.disqualifiedDealCount +
                  nextClient.lostDealCount +
                  nextClient.onHoldDealCount,
              }
            })()
          : client,
      ),
    )
  }

  function updateNexusClientDealCategoryReason(
    clientName: NexusClientName,
    field: NexusDealCategoryReasonField,
    value: string,
  ) {
    setNexusClients((currentClients) =>
      currentClients.map((client) =>
        client.clientName === clientName
          ? {
              ...client,
              [field]: value,
            }
          : client,
      ),
    )
  }

  function handleOpenNexusTamImport() {
    setNexusTamImportError('')
    setNexusTamImportStatus('')
    setActiveNexusCrmSegment('tam')
    setActiveNexusCrmDetailView('companies')
    nexusTamImportFileInputRef.current?.click()
  }

  async function handleImportNexusTamFile(event: ReactChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null
    event.currentTarget.value = ''
    if (!file) {
      return
    }

    setNexusTamImportPending(true)
    setNexusTamImportError('')
    setNexusTamImportStatus('')
    try {
      const parsedImport = await parseNexusTamImportFile(file)
      const existingClientNameKeys = new Set(nexusClients.map((client) => client.clientName.toLowerCase()))
      const importedClientNameKeys = new Set<string>()
      let duplicateRowCount = 0
      const importedClients = parsedImport.rows.reduce<NexusClientRecord[]>((clients, row) => {
        const clientName = row.clientName.trim()
        const clientNameKey = clientName.toLowerCase()
        if (!clientName || existingClientNameKeys.has(clientNameKey) || importedClientNameKeys.has(clientNameKey)) {
          duplicateRowCount += 1
          return clients
        }
        importedClientNameKeys.add(clientNameKey)
        clients.push({
          clientName,
          type: 'Other',
          owner: '',
          dealStatus: '',
          dealStatuses: [],
          disqualifiedDealCount: 0,
          lostDealCount: 0,
          onHoldDealCount: 0,
          disqualificationReason: '',
          lostReason: '',
          closedArr: '',
          openArr: '',
          closedDealCount: 0,
          openDealCount: 0,
          totalArr: '',
          dealCount: 0,
          nextAction: row.nextAction.trim(),
          tam: row.tam,
        })
        return clients
      }, [])
      const skippedRowCount = parsedImport.skippedRowCount + duplicateRowCount
      const skippedSuffix =
        skippedRowCount > 0 ? ` Skipped ${skippedRowCount} row${skippedRowCount === 1 ? '' : 's'}.` : ''

      setActiveNexusCrmSegment('tam')
      setActiveNexusCrmDetailView('companies')
      if (importedClients.length === 0) {
        setNexusTamImportStatus(`No new TAM companies were imported from ${file.name}.${skippedSuffix}`)
        return
      }

      setNexusClients((currentClients) => [...currentClients, ...importedClients])
      setSelectedNexusClient(importedClients[0].clientName)
      setNexusTodoClientDraft(importedClients[0].clientName)
      setNexusTamImportStatus(
        `Imported ${importedClients.length} TAM compan${importedClients.length === 1 ? 'y' : 'ies'} from ${
          file.name
        }.${skippedSuffix}`,
      )
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'TAM import could not be completed.'
      setNexusTamImportError(message)
    } finally {
      setNexusTamImportPending(false)
    }
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

    const type = normalizeNexusClientType(nexusClientDraft.type)
    const owner = nexusClientDraft.owner.trim()
    const dealStatus = nexusClientDraft.dealStatus.trim()
    const dealStatuses = normalizeNexusDealStatuses(
      nexusClientDraft.dealStatuses.length > 0 ? nexusClientDraft.dealStatuses : [dealStatus],
    )
    const closedArr = nexusClientDraft.closedArr.trim()
    const openArr = nexusClientDraft.openArr.trim()
    const closedDealCount = nexusClientDraft.closedDealCount
    const openDealCount = nexusClientDraft.openDealCount
    const totalArr = nexusClientDraft.totalArr.trim() || closedArr || openArr
    const legacyDealCount = Math.max(nexusClientDraft.dealCount, closedDealCount + openDealCount)
    const categoryCounts = mergeNexusDealCategoryCountsWithStatusEvidence({
      dealStatus,
      dealStatuses,
      dealCount: legacyDealCount,
      disqualifiedDealCount: nexusClientDraft.disqualifiedDealCount,
      lostDealCount: nexusClientDraft.lostDealCount,
      onHoldDealCount: nexusClientDraft.onHoldDealCount,
    })
    const dealCount =
      closedDealCount +
      openDealCount +
      categoryCounts.disqualifiedDealCount +
      categoryCounts.lostDealCount +
      categoryCounts.onHoldDealCount
    const nextAction = nexusClientDraft.nextAction.trim()

    setNexusClients((currentClients) => [
      ...currentClients,
      {
        clientName,
        type,
        owner,
        dealStatus,
        dealStatuses,
        ...categoryCounts,
        disqualificationReason: nexusClientDraft.disqualificationReason.trim(),
        lostReason: nexusClientDraft.lostReason.trim(),
        closedArr,
        openArr,
        closedDealCount,
        openDealCount,
        totalArr,
        dealCount,
        nextAction,
        tam: nexusClientDraft.tam,
      },
    ])
    setSelectedNexusClient(clientName)
    setNexusTodoClientDraft(clientName)
    setNexusClientDraft(
      {
        ...createNexusClientRecord(
          '',
          defaultNexusClientTypeForCrmSegment(activeNexusCrmSegment),
          defaultNexusDealStatusForCrmSegment(activeNexusCrmSegment),
        ),
        ...defaultNexusDealCategoryCountsForCrmSegment(activeNexusCrmSegment),
      },
    )
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

  function handleRetryNexusContacts() {
    setNexusContactsLoaded(false)
    setNexusContactsError('')
    setNexusContactsLoadAttempt((currentAttempt) => currentAttempt + 1)
  }

  function handleSyncAttioNexusClients() {
    if (!authSession?.accessToken) {
      setNexusClientSyncError('Sign in before syncing Attio clients.')
      return
    }

    setNexusClientSyncPending(true)
    setNexusClientSyncError('')
    setNexusClientSyncStatus('')
    setNexusClientSyncReview(null)
    const existingClientNames = uniqueNexusClientNames(
      nexusClients
        .filter(
          (client) =>
            resolveNexusCrmSegmentForClient({
              type: normalizeNexusClientType(client.type),
              dealStatus: client.dealStatus,
              dealStatuses: client.dealStatuses,
              dealCount: client.dealCount,
              openDealCount: client.openDealCount,
              disqualifiedDealCount: client.disqualifiedDealCount,
              lostDealCount: client.lostDealCount,
              onHoldDealCount: client.onHoldDealCount,
            }) === 'clients',
        )
        .map((client) => client.clientName),
    )
    const existingClientNameBatches = chunkNexusClientNames(
      existingClientNames,
      NEXUS_ATTIO_EXISTING_CLIENT_SYNC_BATCH_SIZE,
    )
    const existingClientSync =
      existingClientNameBatches.length > 0
        ? Promise.all(
            existingClientNameBatches.map((clientNameBatch) =>
              syncAttioNexusClients(
                appConfig.apiBase,
                authSession.accessToken,
                clientNameBatch,
                [],
                clientNameBatch.length,
              ),
            ),
          ).then(mergeAttioClientSyncPayloads)
        : Promise.resolve(null)

    void existingClientSync
      .then((existingPayload) =>
        syncAttioNexusClients(
          appConfig.apiBase,
          authSession.accessToken,
          [],
          existingClientNames,
          NEXUS_ATTIO_NEW_CLIENT_SYNC_LIMIT,
        ).then((newClientPayload) => ({ existingPayload, newClientPayload })),
      )
      .then(({ existingPayload, newClientPayload }) => {
        const acceptedClientNameKeys = new Set(nexusClients.map((client) => client.clientName.toLowerCase()))
        const existingTypeByName = new Map<string, NexusClientType>()
        const existingDealStatusByName = new Map<string, string | null>()
        const existingDealStatusesByName = new Map<string, string[]>()
        const existingClosedArrByName = new Map<string, string | null>()
        const existingOpenArrByName = new Map<string, string | null>()
        const existingClosedDealCountByName = new Map<string, number>()
        const existingOpenDealCountByName = new Map<string, number>()
        const existingTotalArrByName = new Map<string, string | null>()
        const existingDealCountByName = new Map<string, number>()
        const existingDisqualifiedDealCountByName = new Map<string, number>()
        const existingLostDealCountByName = new Map<string, number>()
        const existingOnHoldDealCountByName = new Map<string, number>()
        const existingDisqualificationReasonByName = new Map<string, string | null>()
        const collectExistingUpdate = (client: AttioClientSyncRecord['clients'][number]) => {
          const clientName = client.name.trim()
          if (!clientName) {
            return
          }
          const clientNameKey = clientName.toLowerCase()
          existingTypeByName.set(clientNameKey, normalizeNexusClientType(client.type ?? client.relationship ?? client.status))
          existingDealStatusByName.set(clientNameKey, client.status?.trim() || null)
          existingDealStatusesByName.set(clientNameKey, normalizeNexusDealStatuses(client.deal_statuses))
          existingClosedArrByName.set(clientNameKey, client.closed_arr?.trim() || null)
          existingOpenArrByName.set(clientNameKey, client.open_arr?.trim() || null)
          existingClosedDealCountByName.set(clientNameKey, client.closed_deal_count ?? 0)
          existingOpenDealCountByName.set(clientNameKey, client.open_deal_count ?? 0)
          existingTotalArrByName.set(clientNameKey, client.total_arr?.trim() || null)
          existingDealCountByName.set(clientNameKey, client.deal_count ?? 0)
          existingDisqualifiedDealCountByName.set(clientNameKey, client.disqualified_deal_count ?? 0)
          existingLostDealCountByName.set(clientNameKey, client.lost_deal_count ?? 0)
          existingOnHoldDealCountByName.set(clientNameKey, client.on_hold_deal_count ?? 0)
          existingDisqualificationReasonByName.set(clientNameKey, client.disqualification_reason?.trim() || null)
        }
        ;(existingPayload?.clients ?? []).forEach(collectExistingUpdate)
        newClientPayload.clients.forEach((client) => {
          const clientNameKey = client.name.trim().toLowerCase()
          if (acceptedClientNameKeys.has(clientNameKey)) {
            collectExistingUpdate(client)
          }
        })

        const typeUpdates = nexusClients.reduce<NexusClientSyncTypeUpdate[]>((updates, client) => {
          const clientNameKey = client.clientName.toLowerCase()
          const proposedType = existingTypeByName.get(clientNameKey)
          const proposedDealStatus = existingDealStatusByName.get(clientNameKey) ?? null
          const proposedDealStatuses = existingDealStatusesByName.get(clientNameKey) ?? []
          const proposedClosedArr = existingClosedArrByName.get(clientNameKey) ?? null
          const proposedOpenArr = existingOpenArrByName.get(clientNameKey) ?? null
          const proposedClosedDealCount = existingClosedDealCountByName.get(clientNameKey) ?? 0
          const proposedOpenDealCount = existingOpenDealCountByName.get(clientNameKey) ?? 0
          const proposedTotalArr = existingTotalArrByName.get(clientNameKey) ?? null
          const proposedDealCount = existingDealCountByName.get(clientNameKey) ?? 0
          const proposedDisqualifiedDealCount = existingDisqualifiedDealCountByName.get(clientNameKey) ?? 0
          const proposedLostDealCount = existingLostDealCountByName.get(clientNameKey) ?? 0
          const proposedOnHoldDealCount = existingOnHoldDealCountByName.get(clientNameKey) ?? 0
          const proposedDisqualificationReason = existingDisqualificationReasonByName.get(clientNameKey) ?? null
          const hasTypeUpdate = Boolean(proposedType && proposedType !== client.type)
          const hasDealStatusUpdate = Boolean(proposedDealStatus && proposedDealStatus !== client.dealStatus.trim())
          const hasDealStatusesUpdate =
            proposedDealStatuses.length > 0 && !nexusDealStatusesMatch(proposedDealStatuses, client.dealStatuses)
          const hasClosedArrUpdate = Boolean(proposedClosedArr && proposedClosedArr !== client.closedArr.trim())
          const hasOpenArrUpdate = Boolean(proposedOpenArr && proposedOpenArr !== client.openArr.trim())
          const hasClosedDealCountUpdate = proposedClosedDealCount !== client.closedDealCount
          const hasOpenDealCountUpdate = proposedOpenDealCount !== client.openDealCount
          const hasTotalArrUpdate = Boolean(proposedTotalArr && proposedTotalArr !== client.totalArr.trim())
          const hasDealCountUpdate = proposedDealCount !== client.dealCount
          const hasDisqualifiedDealCountUpdate = proposedDisqualifiedDealCount !== client.disqualifiedDealCount
          const hasLostDealCountUpdate = proposedLostDealCount !== client.lostDealCount
          const hasOnHoldDealCountUpdate = proposedOnHoldDealCount !== client.onHoldDealCount
          const hasDisqualificationReasonUpdate = Boolean(
            proposedDisqualificationReason && proposedDisqualificationReason !== client.disqualificationReason.trim(),
          )
          if (
            !proposedType ||
            (!hasTypeUpdate &&
              !hasDealStatusUpdate &&
              !hasDealStatusesUpdate &&
              !hasClosedArrUpdate &&
              !hasOpenArrUpdate &&
              !hasClosedDealCountUpdate &&
              !hasOpenDealCountUpdate &&
              !hasTotalArrUpdate &&
              !hasDealCountUpdate &&
              !hasDisqualifiedDealCountUpdate &&
              !hasLostDealCountUpdate &&
              !hasOnHoldDealCountUpdate &&
              !hasDisqualificationReasonUpdate)
          ) {
            return updates
          }
          updates.push({
            clientName: client.clientName,
            currentType: client.type,
            proposedType,
            proposedDealStatus,
            proposedDealStatuses,
            proposedClosedArr,
            proposedOpenArr,
            proposedClosedDealCount,
            proposedOpenDealCount,
            proposedTotalArr,
            proposedDealCount,
            proposedDisqualifiedDealCount,
            proposedLostDealCount,
            proposedOnHoldDealCount,
            proposedDisqualificationReason,
          })
          return updates
        }, [])

        const proposedClientRecordIds = new Set<string>()
        const proposedClientNameKeys = new Set<string>()
        const newClients: NexusClientSyncProposedClient[] = []
        newClientPayload.clients.forEach((client) => {
          const clientName = client.name.trim()
          const clientNameKey = clientName.toLowerCase()
          if (!clientName || proposedClientRecordIds.has(client.record_id) || proposedClientNameKeys.has(clientNameKey)) {
            return
          }
          if (acceptedClientNameKeys.has(clientNameKey)) {
            return
          }

          newClients.push({
            recordId: client.record_id,
            clientName,
            type: normalizeNexusClientType(client.type ?? client.relationship ?? client.status),
            dealCount: client.deal_count ?? 0,
            closedDealCount: client.closed_deal_count ?? 0,
            openDealCount: client.open_deal_count ?? 0,
            dealStatuses: normalizeNexusDealStatuses(client.deal_statuses),
            disqualifiedDealCount: client.disqualified_deal_count ?? 0,
            lostDealCount: client.lost_deal_count ?? 0,
            onHoldDealCount: client.on_hold_deal_count ?? 0,
            disqualificationReason: client.disqualification_reason?.trim() || null,
            closedArr: client.closed_arr,
            openArr: client.open_arr,
            totalArr: client.total_arr,
            webUrl: client.web_url,
            domains: client.domains,
            description: client.description,
            status: client.status,
          })
          proposedClientRecordIds.add(client.record_id)
          proposedClientNameKeys.add(clientNameKey)
        })

        const warnings = [...(existingPayload?.warnings ?? []), ...newClientPayload.warnings]
        if (typeUpdates.length === 0 && newClients.length === 0) {
          const warningSuffix = warnings.length > 0 ? ` ${warnings.join(' ')}` : ''
          setNexusClientSyncStatus(
            `Attio sync found no proposed CRM changes after ${existingPayload?.scanned_record_count ?? 0} existing CRM check${
              (existingPayload?.scanned_record_count ?? 0) === 1 ? '' : 's'
            } and ${newClientPayload.scanned_record_count} scanned deal record${
              newClientPayload.scanned_record_count === 1 ? '' : 's'
            }.${warningSuffix}`,
          )
          return
        }

        setNexusClientSyncReview({
          typeUpdates,
          newClients,
          existingCheckCount: existingPayload?.scanned_record_count ?? 0,
          scannedDealRecordCount: newClientPayload.scanned_record_count,
          returnedDealBackedClientCount: newClientPayload.returned_client_count,
          warnings,
        })
        setNexusClientSyncStatus(
          `Attio sync prepared ${typeUpdates.length + newClients.length} proposed CRM change${
            typeUpdates.length + newClients.length === 1 ? '' : 's'
          } for review.`,
        )
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Attio client sync could not be completed.'
        setNexusClientSyncError(message)
      })
      .finally(() => {
        setNexusClientSyncPending(false)
      })
  }

  function handleAcceptNexusClientSyncReview() {
    if (!nexusClientSyncReview) {
      return
    }

    const proposedUpdateByName = new Map(
      nexusClientSyncReview.typeUpdates.map((update) => [update.clientName.toLowerCase(), update]),
    )
    setNexusClients((currentClients) => {
      const existingClientNameKeys = new Set(currentClients.map((client) => client.clientName.toLowerCase()))
      const updatedClients = currentClients.map((client) => {
        const proposedUpdate = proposedUpdateByName.get(client.clientName.toLowerCase())
        if (!proposedUpdate) {
          return client
        }
        return {
          ...client,
          type: proposedUpdate.proposedType,
          dealStatus: proposedUpdate.proposedDealStatus?.trim() || client.dealStatus,
          dealStatuses:
            proposedUpdate.proposedDealStatuses.length > 0 ? proposedUpdate.proposedDealStatuses : client.dealStatuses,
          closedArr: proposedUpdate.proposedClosedArr?.trim() || client.closedArr,
          openArr: proposedUpdate.proposedOpenArr?.trim() || client.openArr,
          closedDealCount: proposedUpdate.proposedClosedDealCount,
          openDealCount: proposedUpdate.proposedOpenDealCount,
          totalArr:
            proposedUpdate.proposedTotalArr?.trim() ||
            proposedUpdate.proposedClosedArr?.trim() ||
            proposedUpdate.proposedOpenArr?.trim() ||
            client.totalArr,
          dealCount: proposedUpdate.proposedDealCount,
          disqualifiedDealCount: proposedUpdate.proposedDisqualifiedDealCount,
          lostDealCount: proposedUpdate.proposedLostDealCount,
          onHoldDealCount: proposedUpdate.proposedOnHoldDealCount,
          disqualificationReason: proposedUpdate.proposedDisqualificationReason?.trim() || client.disqualificationReason,
          lostReason: client.lostReason,
        }
      })
      const acceptedNewClients = nexusClientSyncReview.newClients
        .filter((client) => !existingClientNameKeys.has(client.clientName.toLowerCase()))
        .map((client) => ({
          clientName: client.clientName,
          type: client.type,
          owner: '',
          dealStatus: client.status?.trim() ?? '',
          dealStatuses: client.dealStatuses,
          disqualifiedDealCount: client.disqualifiedDealCount,
          lostDealCount: client.lostDealCount,
          onHoldDealCount: client.onHoldDealCount,
          disqualificationReason: client.disqualificationReason?.trim() ?? '',
          lostReason: '',
          closedArr: client.closedArr?.trim() ?? '',
          openArr: client.openArr?.trim() ?? '',
          closedDealCount: client.closedDealCount,
          openDealCount: client.openDealCount,
          totalArr: client.totalArr?.trim() ?? '',
          dealCount: client.dealCount,
          nextAction: '',
          tam: createEmptyNexusTamProfile(),
        }))

      return [...updatedClients, ...acceptedNewClients]
    })
    const firstNewClient = nexusClientSyncReview.newClients[0]
    if (firstNewClient) {
      setSelectedNexusClient(firstNewClient.clientName)
      setNexusTodoClientDraft(firstNewClient.clientName)
    }
    const firstTypeUpdate = nexusClientSyncReview.typeUpdates[0]
    if (firstNewClient) {
      setActiveNexusCrmSegment(
        resolveNexusCrmSegmentForClient({
          type: firstNewClient.type,
          dealStatus: firstNewClient.status ?? '',
          dealStatuses: firstNewClient.dealStatuses,
          dealCount: firstNewClient.dealCount,
          openDealCount: firstNewClient.openDealCount,
          disqualifiedDealCount: firstNewClient.disqualifiedDealCount,
          lostDealCount: firstNewClient.lostDealCount,
          onHoldDealCount: firstNewClient.onHoldDealCount,
        }),
      )
    } else if (firstTypeUpdate) {
      setActiveNexusCrmSegment(
        resolveNexusCrmSegmentForClient({
          type: firstTypeUpdate.proposedType,
          dealStatus: firstTypeUpdate.proposedDealStatus ?? '',
          dealStatuses: firstTypeUpdate.proposedDealStatuses,
          dealCount: firstTypeUpdate.proposedDealCount,
          openDealCount: firstTypeUpdate.proposedOpenDealCount,
          disqualifiedDealCount: firstTypeUpdate.proposedDisqualifiedDealCount,
          lostDealCount: firstTypeUpdate.proposedLostDealCount,
          onHoldDealCount: firstTypeUpdate.proposedOnHoldDealCount,
        }),
      )
    }
    setActiveNexusCrmDetailView('companies')
    setNexusClientSyncStatus(
      `Accepted Attio sync: ${nexusClientSyncReview.typeUpdates.length} existing update${
        nexusClientSyncReview.typeUpdates.length === 1 ? '' : 's'
      } and ${nexusClientSyncReview.newClients.length} new compan${
        nexusClientSyncReview.newClients.length === 1 ? 'y' : 'ies'
      }.`,
    )
    setNexusClientSyncReview(null)
  }

  function handleRejectNexusClientSyncReview() {
    setNexusClientSyncReview(null)
    setNexusClientSyncStatus('Rejected Attio sync proposal. No Nexus CRM changes were applied.')
  }

  function handleAddNexusContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = nexusContactDraftName
    if (!name) {
      return
    }

    if (!authSession?.accessToken) {
      setNexusContactsError('Sign in before saving Nexus contacts.')
      return
    }

    setNexusContactSavePending(true)
    setNexusContactsError('')
    void createNexusContact(appConfig.apiBase, authSession.accessToken, {
      client_name: selectedNexusClient,
      name,
      title: nexusContactDraft.role.trim() || null,
      first_name: nexusContactDraft.firstName.trim() || null,
      last_name: nexusContactDraft.lastName.trim() || null,
      role: nexusContactDraft.role.trim() || null,
      time_at_role: nexusContactDraft.timeAtRole.trim() || null,
      previous_role: nexusContactDraft.previousRole.trim() || null,
      university: nexusContactDraft.university.trim() || null,
      university_2: nexusContactDraft.university2.trim() || null,
      location: nexusContactDraft.location.trim() || null,
    })
      .then((record) => {
        const contact = mapNexusContactRecord(record)
        setNexusContacts((currentContacts) => mergeNexusContacts(currentContacts, [contact]))
        setSelectedNexusContactId(contact.id)
        setNexusContactDraft(createNexusContactDraft())
        setNexusContactDialogOpen(false)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Nexus contact could not be saved.'
        setNexusContactsError(message)
      })
      .finally(() => {
        setNexusContactSavePending(false)
      })
  }

  function nexusClientLinkDraftForProvider(provider: NexusClientLinkProvider): NexusClientLinkDraft {
    return provider === 'notion' ? nexusNotionLinkDraft : nexusGrainLinkDraft
  }

  function nexusClientLinksForProvider(provider: NexusClientLinkProvider): NexusClientLink[] {
    return provider === 'notion' ? selectedNexusNotionLinks : selectedNexusGrainLinks
  }

  function nexusClientLinkDefaultTitle(provider: NexusClientLinkProvider): string {
    return provider === 'notion' ? 'Notion page' : 'Grain recording'
  }

  function updateNexusClientLinkDraft(provider: NexusClientLinkProvider, field: keyof NexusClientLinkDraft, value: string) {
    const updateDraft = (currentDraft: NexusClientLinkDraft): NexusClientLinkDraft => ({
      ...currentDraft,
      [field]: value,
    })

    if (provider === 'notion') {
      setNexusNotionLinkDraft(updateDraft)
      return
    }

    setNexusGrainLinkDraft(updateDraft)
  }

  function resetNexusClientLinkDraft(provider: NexusClientLinkProvider) {
    if (provider === 'notion') {
      setNexusNotionLinkDraft(createNexusClientLinkDraft())
      return
    }

    setNexusGrainLinkDraft(createNexusClientLinkDraft())
  }

  function handleAddNexusClientLink(provider: NexusClientLinkProvider, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const draft = nexusClientLinkDraftForProvider(provider)
    const normalizedUrl = normalizeNexusExternalUrl(draft.url)
    if (!normalizedUrl) {
      return
    }

    const title = draft.title.trim() || nexusClientLinkDefaultTitle(provider)
    setNexusClientLinks((currentLinks) => [
      ...currentLinks,
      {
        id: `nexus-client-link-${provider}-${Date.now()}-${currentLinks.length}`,
        clientName: selectedNexusClient,
        provider,
        title,
        url: normalizedUrl,
        createdAt: new Date().toISOString(),
      },
    ])
    resetNexusClientLinkDraft(provider)
  }

  function handleDeleteNexusClientLink(link: NexusClientLink) {
    setNexusClientLinks((currentLinks) => currentLinks.filter((currentLink) => currentLink.id !== link.id))
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

    const normalizedUrl = normalizeNexusToolUrl(rawUrl)
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

  function updateNexusToolTextField(toolId: string, field: NexusToolTextField, value: string) {
    setNexusTools((currentTools) =>
      currentTools.map((tool) => {
        if (tool.id !== toolId) {
          return tool
        }

        return {
          ...tool,
          [field]: field === 'url' ? (value.trim() ? value : null) : value,
        }
      }),
    )
  }

  function updateNexusToolBooleanField(toolId: string, field: NexusToolBooleanField, value: boolean) {
    setNexusTools((currentTools) =>
      currentTools.map((tool) =>
        tool.id === toolId
          ? {
              ...tool,
              [field]: value,
            }
          : tool,
      ),
    )
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
    const normalizedUrl = normalizeNexusToolUrl(tool.url ?? '')
    if (!normalizedUrl) {
      return
    }

    window.open(normalizedUrl, '_blank', 'noopener,noreferrer')
  }

  function handleDeleteNexusTool(tool: NexusTool) {
    setNexusTools((currentTools) => currentTools.filter((currentTool) => currentTool.id !== tool.id))
    setSelectedNexusToolId((currentToolId) => (currentToolId === tool.id ? null : currentToolId))
  }

  function nexusContactRowActions(contact: NexusContactRow): DataSheetRowAction<NexusContactRow>[] {
    return [
      {
        id: 'open-company',
        label: 'Open Company',
        onSelect: () => openNexusClient(contact.clientName),
      },
    ]
  }

  function nexusToolRowActions(tool: NexusTool): DataSheetRowAction<NexusTool>[] {
    const actions: DataSheetRowAction<NexusTool>[] = []
    if (normalizeNexusToolUrl(tool.url ?? '')) {
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

  function renderNexusClientSyncReviewDialog() {
    if (!nexusClientSyncReview) {
      return null
    }

    const proposedChangeCount = nexusClientSyncReview.typeUpdates.length + nexusClientSyncReview.newClients.length

    return (
      <div className="nexus-sync-review-overlay" role="presentation">
        <section
          className="nexus-sync-review-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nexus-sync-review-heading"
        >
          <div className="nexus-sync-review-head">
            <div>
              <span className="eyebrow">Attio sync</span>
              <h3 id="nexus-sync-review-heading">Proposed CRM Changes</h3>
            </div>
            <span className="nexus-sync-review-count">
              {proposedChangeCount} change{proposedChangeCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="nexus-sync-review-meta">
            <span>
              {nexusClientSyncReview.existingCheckCount} existing check
              {nexusClientSyncReview.existingCheckCount === 1 ? '' : 's'}
            </span>
            <span>
              {nexusClientSyncReview.scannedDealRecordCount} deal record
              {nexusClientSyncReview.scannedDealRecordCount === 1 ? '' : 's'} scanned
            </span>
            <span>
              {nexusClientSyncReview.returnedDealBackedClientCount} deal-backed compan
              {nexusClientSyncReview.returnedDealBackedClientCount === 1 ? 'y' : 'ies'}
            </span>
          </div>
          <div className="nexus-sync-review-body">
            {nexusClientSyncReview.typeUpdates.length > 0 ? (
              <section className="nexus-sync-review-section" aria-labelledby="nexus-sync-review-type-updates">
                <h4 id="nexus-sync-review-type-updates">Existing Updates</h4>
                <ul className="nexus-sync-review-list">
                  {nexusClientSyncReview.typeUpdates.map((update) => {
                    const categorySummary = buildNexusDealCategoryCountSummary({
                      disqualifiedDealCount: update.proposedDisqualifiedDealCount,
                      lostDealCount: update.proposedLostDealCount,
                      onHoldDealCount: update.proposedOnHoldDealCount,
                    })
                    const metricSummary = [
                      update.proposedClosedArr ? `Closed ARR ${update.proposedClosedArr}` : null,
                      update.proposedOpenArr ? `Open ARR ${update.proposedOpenArr}` : null,
                      `${update.proposedClosedDealCount} closed deal${
                        update.proposedClosedDealCount === 1 ? '' : 's'
                      }`,
                      `${update.proposedOpenDealCount} open deal${update.proposedOpenDealCount === 1 ? '' : 's'}`,
                    ]
                    return (
                      <li key={update.clientName} className="nexus-sync-review-row">
                        <strong>{update.clientName}</strong>
                        <span>
                          {update.currentType === update.proposedType
                            ? 'Client metrics'
                            : `${update.currentType} -> ${update.proposedType}`}
                        </span>
                        {update.proposedDealStatus ||
                        metricSummary.length > 0 ||
                        categorySummary.length > 0 ||
                        update.proposedDisqualificationReason ? (
                          <small>
                            {[
                              update.proposedDealStatus,
                              ...metricSummary,
                              ...categorySummary,
                              update.proposedDisqualificationReason
                                ? `Disqualification reason ${update.proposedDisqualificationReason}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' - ')}
                          </small>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}
            {nexusClientSyncReview.newClients.length > 0 ? (
              <section className="nexus-sync-review-section" aria-labelledby="nexus-sync-review-new-companies">
                <h4 id="nexus-sync-review-new-companies">New Companies</h4>
                <ul className="nexus-sync-review-list">
                  {nexusClientSyncReview.newClients.map((client) => {
                    const categorySummary = buildNexusDealCategoryCountSummary(client)
                    const metricSummary = [
                      client.closedArr ? `Closed ARR ${client.closedArr}` : null,
                      client.openArr ? `Open ARR ${client.openArr}` : null,
                      `${client.closedDealCount} closed deal${client.closedDealCount === 1 ? '' : 's'}`,
                      `${client.openDealCount} open deal${client.openDealCount === 1 ? '' : 's'}`,
                    ]
                    return (
                      <li key={client.recordId} className="nexus-sync-review-row">
                        <strong>{client.clientName}</strong>
                        <span>{client.type}</span>
                        {client.status ||
                        metricSummary.length > 0 ||
                        categorySummary.length > 0 ||
                        client.disqualificationReason ? (
                          <small>
                            {[
                              client.status,
                              ...metricSummary,
                              ...categorySummary,
                              client.disqualificationReason
                                ? `Disqualification reason ${client.disqualificationReason}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' - ')}
                          </small>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}
            {nexusClientSyncReview.warnings.length > 0 ? (
              <section className="nexus-sync-review-section" aria-labelledby="nexus-sync-review-warnings">
                <h4 id="nexus-sync-review-warnings">Warnings</h4>
                <ul className="nexus-sync-review-warning-list">
                  {nexusClientSyncReview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
          <div className="nexus-sync-review-actions">
            <button type="button" className="button button-ghost" onClick={handleRejectNexusClientSyncReview}>
              Reject All
            </button>
            <button type="button" className="button button-primary" onClick={handleAcceptNexusClientSyncReview}>
              Accept All Changes
            </button>
          </div>
        </section>
      </div>
    )
  }

  function renderNexusContactDialog() {
    if (!nexusContactDialogOpen) {
      return null
    }

    return (
      <div className="nexus-contact-dialog-overlay" role="presentation">
        <section
          className="nexus-contact-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nexus-contact-dialog-heading"
        >
          <div className="nexus-contact-dialog-head">
            <div>
              <span className="eyebrow">Contact</span>
              <h3 id="nexus-contact-dialog-heading">Add Contact</h3>
            </div>
            <button
              type="button"
              className="button button-ghost"
              onClick={handleCloseNexusContactDialog}
              disabled={nexusContactSavePending}
            >
              Close
            </button>
          </div>
          <form className="nexus-contact-dialog-form" onSubmit={handleAddNexusContact}>
            <label className="nexus-contact-dialog-field">
              <span>First Name</span>
              <input
                type="text"
                value={nexusContactDraft.firstName}
                onChange={(event) => updateNexusContactDraft('firstName', event.target.value)}
                autoFocus
              />
            </label>
            <label className="nexus-contact-dialog-field">
              <span>Last Name</span>
              <input
                type="text"
                value={nexusContactDraft.lastName}
                onChange={(event) => updateNexusContactDraft('lastName', event.target.value)}
              />
            </label>
            <div className="nexus-contact-dialog-field nexus-contact-dialog-field-readonly">
              <span>Company</span>
              <strong>{selectedNexusClient}</strong>
            </div>
            <label className="nexus-contact-dialog-field">
              <span>Role</span>
              <input
                type="text"
                value={nexusContactDraft.role}
                onChange={(event) => updateNexusContactDraft('role', event.target.value)}
              />
            </label>
            <label className="nexus-contact-dialog-field">
              <span>Time at Role</span>
              <input
                type="text"
                value={nexusContactDraft.timeAtRole}
                onChange={(event) => updateNexusContactDraft('timeAtRole', event.target.value)}
              />
            </label>
            <label className="nexus-contact-dialog-field">
              <span>Previous Role</span>
              <input
                type="text"
                value={nexusContactDraft.previousRole}
                onChange={(event) => updateNexusContactDraft('previousRole', event.target.value)}
              />
            </label>
            <label className="nexus-contact-dialog-field">
              <span>University</span>
              <input
                type="text"
                value={nexusContactDraft.university}
                onChange={(event) => updateNexusContactDraft('university', event.target.value)}
              />
            </label>
            <label className="nexus-contact-dialog-field">
              <span>University 2</span>
              <input
                type="text"
                value={nexusContactDraft.university2}
                onChange={(event) => updateNexusContactDraft('university2', event.target.value)}
              />
            </label>
            <label className="nexus-contact-dialog-field nexus-contact-dialog-field-wide">
              <span>Location</span>
              <input
                type="text"
                value={nexusContactDraft.location}
                onChange={(event) => updateNexusContactDraft('location', event.target.value)}
              />
            </label>
            <div className="nexus-contact-dialog-actions">
              <button
                type="button"
                className="button button-ghost"
                onClick={handleCloseNexusContactDialog}
                disabled={nexusContactSavePending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={!nexusContactDraftCanSave || nexusContactSavePending}
              >
                {nexusContactSavePending ? 'Saving...' : 'Save Contact'}
              </button>
            </div>
          </form>
        </section>
      </div>
    )
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
        {isNexusProduct ? renderNexusClientSyncReviewDialog() : null}
        {isNexusProduct ? renderNexusContactDialog() : null}

        {isNexusProduct && activeNexusView === 'crm' ? (
          <section className="nexus-crm-workspace" aria-labelledby="nexus-crm-heading">
            <article className="nexus-crm-card">
              <div className="nexus-crm-heading-row">
                <div>
                  <span className="eyebrow">Nexus</span>
                  <h2 id="nexus-crm-heading">CRM</h2>
                </div>
                <div className="nexus-crm-heading-actions">
                  <button
                    type="button"
                    className="button button-secondary nexus-attio-sync-button"
                    onClick={handleSyncAttioNexusClients}
                    disabled={nexusClientSyncPending || !authSession?.accessToken}
                  >
                    {nexusClientSyncPending ? 'Syncing Attio...' : 'Sync Attio'}
                  </button>
                  <div className="nexus-crm-subview-tabs" role="tablist" aria-label="CRM company categories">
                    {NEXUS_CRM_SEGMENT_VIEWS.map((view) => (
                      <button
                        key={view.key}
                        type="button"
                        role="tab"
                        className={`nexus-crm-subview-tab ${activeNexusCrmSegment === view.key ? 'is-active' : ''}`}
                        aria-selected={activeNexusCrmSegment === view.key}
                        onClick={() => setActiveNexusCrmSegment(view.key)}
                      >
                        {view.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {nexusClientSyncStatus ? (
                <div className="nexus-sync-status" role="status">
                  {nexusClientSyncStatus}
                </div>
              ) : null}
              {nexusClientSyncError ? (
                <div className="nexus-contact-error-bar" role="alert">
                  <span>{nexusClientSyncError}</span>
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={handleSyncAttioNexusClients}
                    disabled={nexusClientSyncPending || !authSession?.accessToken}
                  >
                    Retry Sync
                  </button>
                </div>
              ) : null}
              {nexusContactsLoading ? (
                <div className="nexus-attio-empty nexus-attio-empty-compact">Loading contacts...</div>
              ) : null}
              {nexusContactsError ? (
                <div className="nexus-contact-error-bar" role="alert">
                  <span>{nexusContactsError}</span>
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={handleRetryNexusContacts}
                    disabled={nexusContactsLoading}
                  >
                    Retry
                  </button>
                </div>
              ) : null}
              {activeNexusCrmSegment === 'tam' && nexusTamImportStatus ? (
                <div className="nexus-sync-status" role="status">
                  {nexusTamImportStatus}
                </div>
              ) : null}
              {activeNexusCrmSegment === 'tam' && nexusTamImportError ? (
                <div className="nexus-contact-error-bar" role="alert">
                  <span>{nexusTamImportError}</span>
                </div>
              ) : null}
              <div
                className="nexus-crm-subview-tabs nexus-crm-detail-tabs"
                role="tablist"
                aria-label={`${activeNexusCrmSegmentLabel} CRM records`}
              >
                {NEXUS_CRM_DETAIL_VIEWS.map((view) => (
                  <button
                    key={view.key}
                    type="button"
                    role="tab"
                    className={`nexus-crm-subview-tab ${activeNexusCrmDetailView === view.key ? 'is-active' : ''}`}
                    aria-selected={activeNexusCrmDetailView === view.key}
                    onClick={() => setActiveNexusCrmDetailView(view.key)}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
              {activeNexusCrmDetailView === 'companies' ? (
                <section className="nexus-client-base" aria-label={`${activeNexusCrmSegmentLabel} Companies`}>
                  <DataSheet
                    label={`${activeNexusCrmSegmentLabel} Companies`}
                    description={activeNexusCrmSegmentDescription}
                    toolbarActions={
                      activeNexusCrmSegment === 'tam' ? (
                        <>
                          <input
                            ref={nexusTamImportFileInputRef}
                            type="file"
                            accept=".csv,.tsv,.txt,.xls,.xlsx,text/csv,text/tab-separated-values,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            aria-label="Import TAM companies"
                            hidden
                            onChange={(event) => {
                              void handleImportNexusTamFile(event)
                            }}
                          />
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={handleOpenNexusTamImport}
                            disabled={nexusTamImportPending}
                          >
                            {nexusTamImportPending ? 'Importing...' : 'Import CSV/XLS'}
                          </button>
                        </>
                      ) : null
                    }
                    columns={nexusClientTableColumns}
                    rows={activeNexusCrmCompanyRows}
                    pageSize={activeNexusCrmSegment === 'tam' ? 50 : undefined}
                    getRowId={(row) => row.clientName}
                    getRowLabel={(row) => row.clientName}
                    selectedRowId={selectedNexusClient}
                    onSelectRow={(row) => openNexusClient(row.clientName)}
                    emptyMessage={`No ${activeNexusCrmSegmentLabel} companies are available yet.`}
                    enableColumnResize
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
                        {activeNexusCrmSegment === 'tam' ? (
                          <td className="data-sheet-align-end">
                            <span className="nexus-client-contact-count">0 contacts</span>
                          </td>
                        ) : null}
                        {activeNexusCrmSegment === 'clients' ? (
                          NEXUS_ARR_FIELDS.map((field) => (
                            <td key={`client-entry-${field}`}>
                              <input
                                className="nexus-client-entry-input"
                                type="text"
                                value={nexusClientDraft[field]}
                                onChange={(event) => updateNexusClientDraft(field, event.target.value)}
                                onKeyDown={handleNexusClientDraftKeyDown}
                                placeholder="-"
                                aria-label={`New ${NEXUS_ARR_FIELD_LABELS[field]}`}
                              />
                            </td>
                          ))
                        ) : null}
                        {activeNexusCrmSegment === 'clients'
                          ? NEXUS_DEAL_COUNT_FIELDS.map((field) => (
                              <td key={`client-entry-${field}`}>
                                <input
                                  className="nexus-client-entry-input"
                                  type="text"
                                  inputMode="numeric"
                                  value={nexusClientDraft[field] > 0 ? String(nexusClientDraft[field]) : ''}
                                  onChange={(event) => updateNexusClientDraft(field, event.target.value)}
                                  onKeyDown={handleNexusClientDraftKeyDown}
                                  placeholder="0"
                                  aria-label={`New ${NEXUS_DEAL_COUNT_FIELD_LABELS[field]}`}
                                />
                              </td>
                            ))
                          : null}
                        {activeNexusCrmSegment === 'tam'
                          ? NEXUS_TAM_TABLE_FIELDS.map((field) => (
                              <td key={`tam-entry-${field}`}>
                                <span className="nexus-muted-cell">Imported</span>
                              </td>
                            ))
                          : null}
                        {nexusCrmSegmentUsesProspectFields(activeNexusCrmSegment) ? (
                          <td>
                            <input
                              className="nexus-client-entry-input"
                              type="text"
                              value={nexusClientDraft.owner}
                              onChange={(event) => updateNexusClientDraft('owner', event.target.value)}
                              onKeyDown={handleNexusClientDraftKeyDown}
                              placeholder="Owner"
                              aria-label="New owner"
                            />
                          </td>
                        ) : null}
                        {nexusCrmSegmentUsesProspectFields(activeNexusCrmSegment) ? (
                          <td>
                            <input
                              className="nexus-client-entry-input"
                              type="text"
                              value={nexusClientDraft.dealStatus}
                              onChange={(event) => updateNexusClientDraft('dealStatus', event.target.value)}
                              onKeyDown={handleNexusClientDraftKeyDown}
                              placeholder="Deal status"
                              aria-label="New deal status"
                            />
                          </td>
                        ) : null}
                        {nexusDealCategoryCountFieldsForCrmSegment(activeNexusCrmSegment).map((field) => (
                          <td key={field}>
                            <input
                              className="nexus-client-entry-input"
                              type="text"
                              inputMode="numeric"
                              value={nexusClientDraft[field] > 0 ? String(nexusClientDraft[field]) : ''}
                              onChange={(event) => updateNexusClientDraft(field, event.target.value)}
                              onKeyDown={handleNexusClientDraftKeyDown}
                              placeholder="0"
                              aria-label={`New ${NEXUS_DEAL_CATEGORY_COUNT_LABELS[field].toLowerCase()}`}
                            />
                          </td>
                        ))}
                        {(() => {
                          const field = nexusDealCategoryReasonFieldForCrmSegment(activeNexusCrmSegment)
                          return field ? (
                            <td>
                              <input
                                className="nexus-client-entry-input"
                                type="text"
                                value={nexusClientDraft[field]}
                                onChange={(event) => updateNexusClientDraft(field, event.target.value)}
                                onKeyDown={handleNexusClientDraftKeyDown}
                                placeholder="Reason"
                                aria-label={`New ${NEXUS_DEAL_CATEGORY_REASON_LABELS[field].toLowerCase()}`}
                              />
                            </td>
                          ) : null
                        })()}
                        {activeNexusCrmSegment === 'tam' ? null : (
                          <td className="data-sheet-align-end">
                            <span className="nexus-client-contact-count">0 contacts</span>
                          </td>
                        )}
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
              ) : (
                <section
                  className="nexus-client-base nexus-contact-base"
                  aria-label={`${activeNexusCrmSegmentLabel} Contacts`}
                >
                  <DataSheet
                    label={`${activeNexusCrmSegmentLabel} Contacts`}
                    description={`Retained contacts for ${activeNexusCrmSegmentLabel} companies.`}
                    columns={NEXUS_CONTACT_TABLE_COLUMNS}
                    rows={activeNexusCrmContactRows}
                    getRowId={(row) => row.id}
                    getRowLabel={(row) => row.name}
                    selectedRowId={selectedNexusContactId}
                    onSelectRow={(row) => setSelectedNexusContactId(row.id)}
                    emptyMessage={`No ${activeNexusCrmSegmentLabel} contacts are available yet.`}
                    defaultSort={{ columnId: 'company', direction: 'asc' }}
                    enableColumnResize
                    rowActions={nexusContactRowActions}
                  />
                </section>
              )}
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
                  <span className="eyebrow">{selectedNexusCompanyKindLabel}</span>
                  <h2 id="nexus-client-heading">{selectedNexusClient}</h2>
                </div>
              </div>
              {renderAttioClientSection()}
              {renderNexusEngagementSection('gmail')}
              {renderNexusEngagementSection('slack')}
              {renderNotionClientSection()}
              {renderGrainClientSection()}
              {renderLinearClientSection()}
              <div className="nexus-contact-form">
                <div className="nexus-contact-form-copy">
                  <span>Add contact</span>
                  <strong>{selectedNexusClient}</strong>
                </div>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleOpenNexusContactDialog}
                  disabled={nexusContactSavePending}
                >
                  Add Contact
                </button>
              </div>
              {nexusContactsError ? <div className="nexus-attio-error">{nexusContactsError}</div> : null}
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
                    {selectedNexusClientContacts.map((contact) => {
                      const contactMeta = buildNexusContactMeta(contact)

                      return (
                        <li key={contact.id}>
                          <div>
                            {contact.webUrl ? (
                              <a href={contact.webUrl} target="_blank" rel="noreferrer">
                                {contact.name}
                              </a>
                            ) : (
                              <strong>{contact.name}</strong>
                            )}
                            {contactMeta ? <span>{contactMeta}</span> : null}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className="nexus-contact-empty">No Contacts for this company yet.</div>
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
                  <div className="nexus-todo-empty">No To-Do items for this company yet.</div>
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
                  description="Edit, sort, or filter saved tools. Right-click, two-finger click, or double-click a row for options."
                  columns={createNexusToolTableColumns({
                    onTextChange: updateNexusToolTextField,
                    onBooleanChange: updateNexusToolBooleanField,
                  })}
                  rows={nexusTools}
                  getRowId={(row) => row.id}
                  getRowLabel={(row) => row.title}
                  selectedRowId={selectedNexusToolId}
                  onSelectRow={(row) => setSelectedNexusToolId(row.id)}
                  emptyMessage="No tools yet. Use the entry row below to add one."
                  editableHelpText="Edits save locally as you type. Tab moves between editable tool values."
                  enableColumnResize
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
