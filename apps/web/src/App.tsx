import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import './App.css'
import './appearance.css'
import {
  MOBILE_NAVIGATION_PANEL_ID,
  PRIMARY_NAV_SECTIONS,
  type PrimaryNavigationSectionKey,
  primaryNavigationSectionByKey,
  primaryNavigationSectionForView,
} from './app/navigation'
import { AppStartHereOverlay } from './entities/app/AppStartHereOverlay'
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
  deriveWorkspaceStatus,
  isAuthenticationRequiredMessage,
  summarizeWorkspaceIssueMessage,
  VIEW_DATA_GROUPS,
} from './entities/app/workspaceLoading'
import { logoutCurrentSession } from './entities/auth/api'
import { AuthGate } from './entities/auth/AuthGate'
import { useReferenceDataController } from './features/reference-data/useReferenceDataController'
import { useTradeAmendForm } from './features/trades/useTradeAmendForm'
import { useTradeCaptureForm } from './features/trades/useTradeCaptureForm'
import { appConfig } from './shared/config'
import {
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
}: {
  title: string
  message: string
  onRetry: () => void
}) {
  return (
    <section className="surface empty-state">
      <strong>{title}</strong>
      <p>{message}</p>
      <button type="button" className="button button-secondary" onClick={onRetry}>
        Retry workspace load
      </button>
    </section>
  )
}

type AppRouteController = ReturnType<typeof useAppRouteState>
type AppShellController = ReturnType<typeof useAppShellState>
type AppAppearanceController = ReturnType<typeof useAppAppearance>
type AppTradeCaptureSettingsController = ReturnType<typeof useAppTradeCaptureSettings>
type AppWorkspaceDataController = ReturnType<typeof useAppWorkspaceData>
type AppStartHereRoutingController = ReturnType<typeof useStartHereRouting>

type AuthenticatedWorkspaceShellProps = {
  route: AppRouteController
  shell: AppShellController
  appearance: AppAppearanceController
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
  const activePrimarySection = route.activeNavigationSectionKey
    ? primaryNavigationSectionByKey(route.activeNavigationSectionKey)
    : primaryNavigationSectionForView(currentView)
  const routeHandoffBanner = useMemo(
    () => describeAppRouteHandoff(routeHandoff, currentView),
    [currentView, routeHandoff],
  )
  const currentWorkspaceOwnsHandoffBanner =
    currentView === 'operations' || currentView === 'settlement' || currentView === 'trades'

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
  const heroTitle = showingNavigationSectionLanding ? activePrimarySection.heroTitle : HERO_TITLE_BY_VIEW[currentView]
  const heroBody = showingNavigationSectionLanding ? activePrimarySection.heroBody : HERO_BODY_BY_VIEW[currentView]
  const isPromptHomeView = !showingNavigationSectionLanding && currentView === 'prompt'
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
  const currentWorkspaceLabel = APP_VIEWS.find((view) => view.key === route.currentView)?.label ?? workspaceLabel(route.currentView)

  return (
    <div className="app-shell">
      <div className="app-aura app-aura-left" />
      <div className="app-aura app-aura-right" />

      <div className="mobile-topbar">
        <div>
          <span className="brand-mark">E/CTRM</span>
        </div>
        <div className="mobile-topbar-actions">
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
        className={`side-rail ${shell.mobileNavOpen ? 'is-open' : ''} ${isPromptHomeView ? 'side-rail-prompt' : ''}`}
        hidden={shell.mobileNavHidden}
        aria-hidden={shell.mobileNavHidden ? true : undefined}
      >
        <div className="brand-lockup">
          <span className="brand-mark">E/CTRM</span>
          <h1>Operator Console</h1>
          <p>A trading operations cockpit for ticket entry, lifecycle management, and live projection views.</p>
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

        <nav className="nav-stack" aria-label="Primary">
          {PRIMARY_NAV_SECTIONS.map((section) => {
            const expanded = isNavSectionOpen(section.key)
            const containsCurrentView =
              route.activeNavigationSectionKey === section.key ||
              (route.activeNavigationSectionKey === null && section.views.some((view) => view.key === route.currentView))

            return (
              <section key={section.key} className="nav-section">
                <div className="nav-section-header">
                  <button
                    type="button"
                    className={`nav-item nav-section-toggle ${containsCurrentView ? 'is-active' : ''}`}
                    aria-expanded={expanded}
                    aria-controls={`nav-section-${section.key}`}
                    onClick={() => {
                      toggleNavSection(section.key)
                      route.navigateToSection(section.key)
                      shell.setMobileNavOpen(false)
                    }}
                  >
                    <div className="nav-section-copy">
                      <span>{section.kicker}</span>
                      <strong>{section.label}</strong>
                    </div>
                  </button>

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
                </div>

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
              </section>
            )
          })}
        </nav>
      </aside>

      <main className={`main-stage ${isPromptHomeView ? 'main-stage-prompt' : ''}`}>
        {showStartHereOverlay ? (
          <AppStartHereOverlay
            authSession={authSession}
            onDismiss={dismissStartHere}
            onOpenView={startHereRouting.handleStartHereOpenView}
          />
        ) : null}

        {isPromptHomeView ? (
          <header className="workspace-topbar workspace-topbar-prompt">
            <div className="workspace-topbar-copy">
              <span className="eyebrow">Prompt-First</span>
              <strong>{currentWorkspaceLabel}</strong>
            </div>
            <div className="workspace-topbar-actions">
              <PromptHomeAvailableTokenBadge />
              <span className={`hero-session-pill hero-session-pill-${effectiveSystemStateTone}`}>
                {effectiveSystemStateLabel}
              </span>
              {authSession ? (
                <small className="workspace-topbar-session">
                  Signed in as {authSession.user.display_name}
                </small>
              ) : null}
              {authSession ? (
                <button
                  type="button"
                  className="button button-ghost workspace-topbar-signout"
                  onClick={() => void onSignOut()}
                  disabled={signOutPending}
                >
                  {signOutPending ? 'Signing Out...' : 'Sign Out'}
                </button>
              ) : null}
              {signOutError ? <small className="workspace-topbar-error">{signOutError}</small> : null}
            </div>
          </header>
        ) : (
          <header className="hero">
            <div className="hero-copy">
              <div className="hero-heading-row">
                <span className="eyebrow">Workspace</span>
                <span className={`hero-session-pill hero-session-pill-${effectiveSystemStateTone}`}>
                  {effectiveSystemStateLabel}
                </span>
              </div>
              <h2>{heroTitle}</h2>
              <p>{heroBody}</p>
            </div>

            <div className="hero-badge">
              <span>Focus</span>
              <strong>
                {showingNavigationSectionLanding
                  ? activePrimarySection.label
                  : selectedTrade
                  ? selectedTrade.trade_id
                  : currentWorkspaceLabel}
              </strong>
              <small>
                {showingNavigationSectionLanding
                  ? `${activePrimarySection.views.length} workspace${activePrimarySection.views.length === 1 ? '' : 's'} grouped in this section`
                  : selectedTrade
                  ? `${selectedTrade.commodity} • ${selectedTrade.book}`
                  : `${workspaceData.events.length} loaded events across the current session`}
              </small>
              {authSession ? (
                <div className="hero-badge-actions">
                  <small className="hero-badge-session">
                    Signed in as {authSession.user.display_name}
                  </small>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void onSignOut()}
                    disabled={signOutPending}
                  >
                    {signOutPending ? 'Signing Out...' : 'Sign Out'}
                  </button>
                  {signOutError ? <small className="hero-badge-error">{signOutError}</small> : null}
                </div>
              ) : null}
            </div>
          </header>
        )}

        {!showingNavigationSectionLanding && workspaceData.error ? (
          <div className="error-banner">{workspaceShellErrorMessage}</div>
        ) : null}
        {!showingNavigationSectionLanding && workspaceWarning ? (
          <div className="error-banner">{workspaceWarningMessage}</div>
        ) : null}
        {!showingNavigationSectionLanding && routeHandoffBanner && !currentWorkspaceOwnsHandoffBanner ? (
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

        {showingNavigationSectionLanding ? (
          <Suspense
            fallback={
              <WorkspaceLoadState
                title={`Preparing ${activePrimarySection.label}`}
                detail="Loading the section overview."
              />
            }
          >
            <AppWorkspaceContent
              activeDocumentationDocumentKey={route.activeDocumentationDocumentKey}
              activeNavigationSectionKey={route.activeNavigationSectionKey}
              captureForm={captureForm}
              amendForm={amendForm}
              appearance={appearance}
              tradeCapturePreferences={tradeCapturePreferences}
              currentView={route.currentView}
              handleDocumentationDocumentChange={route.handleDocumentationDocumentChange}
              handleRoadmapPublished={shell.handleRoadmapPublished}
              hrefForView={route.hrefForView}
              navigateToTrade={navigateToTrade}
              navigateToView={route.navigateToView}
              replaceView={route.replaceView}
              routeHandoff={route.routeHandoff}
              referenceState={referenceState}
              roadmapRefreshVersion={shell.roadmapRefreshVersion}
              selectedTradeId={route.selectedTradeId}
              setInspectorTab={shell.setInspectorTab}
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
            onRetry={() => {
              void workspaceData.loadData({
                groups: VIEW_DATA_GROUPS[route.currentView],
                force: true,
              })
            }}
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
              activeDocumentationDocumentKey={route.activeDocumentationDocumentKey}
              activeNavigationSectionKey={route.activeNavigationSectionKey}
              captureForm={captureForm}
              amendForm={amendForm}
              appearance={appearance}
              tradeCapturePreferences={tradeCapturePreferences}
              currentView={route.currentView}
              handleDocumentationDocumentChange={route.handleDocumentationDocumentChange}
              handleRoadmapPublished={shell.handleRoadmapPublished}
              hrefForView={route.hrefForView}
              navigateToTrade={navigateToTrade}
              navigateToView={route.navigateToView}
              replaceView={route.replaceView}
              routeHandoff={route.routeHandoff}
              referenceState={referenceState}
              roadmapRefreshVersion={shell.roadmapRefreshVersion}
              selectedTradeId={route.selectedTradeId}
              setInspectorTab={shell.setInspectorTab}
              setSelectedTradeId={route.setSelectedTradeId}
              shell={shell}
              summary={summary}
              tradeActions={tradeActions}
              workspaceData={workspaceData}
            />
          </Suspense>
        )}
      </main>
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
  const appearance = useAppAppearance()
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

  const showStartHereOverlay =
    startHere.showStartHere &&
    !(authSession && startHereRouting.startHereReturnIntent) &&
    currentView !== 'prompt' &&
    currentView !== 'settings' &&
    workspaceData.authInterruptionReason !== 'session_expired' &&
    authInterruption.authInterruptionResume === null
  const signedOutNeedsAuthGate = !authSession && currentView !== 'guide' && currentView !== 'prompt'

  if (signedOutNeedsAuthGate) {
    return (
      <div className="app-shell auth-gate-shell">
        <div className="app-aura app-aura-left" />
        <div className="app-aura app-aura-right" />
        <AuthGate
          authInterruptionMessage={authInterruption.authInterruptionMessage}
          onSessionChange={workspaceData.handleSessionChange}
          pendingStartHereReturnLabel={startHereRouting.pendingStartHereReturnLabel}
          pendingPromptResumeLabel={promptResumeIntentLabel}
          pendingPromptResumeWillSubmit={promptResumeIntent?.submitAfterSignIn ?? false}
        />
        {showStartHereOverlay ? (
          <AppStartHereOverlay
            authSession={authSession}
            onDismiss={dismissStartHere}
            onOpenView={startHereRouting.handleStartHereOpenView}
          />
        ) : null}
      </div>
    )
  }

  return (
    <AuthenticatedWorkspaceShell
      route={route}
      shell={shell}
      appearance={appearance}
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
