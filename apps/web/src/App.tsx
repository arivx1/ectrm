import { Suspense, useEffect, useRef, useState } from 'react'

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
import { useAppTradeActions } from './entities/app/useAppTradeActions'
import { useAppAppearance } from './entities/app/useAppAppearance'
import { useAppTradeCaptureSettings } from './entities/app/useAppTradeCaptureSettings'
import { useAppWorkspaceData } from './entities/app/useAppWorkspaceData'
import { useAppWorkspaceSummary } from './entities/app/useAppWorkspaceSummary'
import {
  deriveWorkspaceStatus,
  isAuthenticationRequiredMessage,
  VIEW_DATA_GROUPS,
} from './entities/app/workspaceLoading'
import { logoutCurrentSession } from './entities/auth/api'
import { AuthGate } from './entities/auth/AuthGate'
import { useReferenceDataController } from './features/reference-data/useReferenceDataController'
import { useTradeAmendForm } from './features/trades/useTradeAmendForm'
import { useTradeCaptureForm } from './features/trades/useTradeCaptureForm'
import { appConfig } from './shared/config'
import type { ViewKey } from './shared/models'
import {
  clearAuthInterruptionResumeSnapshot,
  getAuthInterruptionResumeSnapshot,
  saveAuthInterruptionResumeSnapshot,
  type AuthInterruptionResumeSnapshot,
} from './shared/authInterruptionResume'
import {
  clearStartHereReturnIntent,
  formatStartHereReturnIntentLabel,
  getStartHereReturnIntent,
  saveStartHereReturnIntent,
  type StartHereReturnView,
} from './shared/startHereReturnIntent'
import { commodityClassOrder } from './shared/trading'

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

export default function App() {
  const route = useAppRouteState()
  const [authInterruptionResume, setAuthInterruptionResume] =
    useState<AuthInterruptionResumeSnapshot | null>(() => getAuthInterruptionResumeSnapshot())
  const [openNavSectionKeys, setOpenNavSectionKeys] = useState<PrimaryNavigationSectionKey[]>(() => [
    route.activeNavigationSectionKey ?? primaryNavigationSectionForView(route.currentView).key,
  ])
  const shell = useAppShellState(
    route.currentView,
    route.currentView === 'trades' ? authInterruptionResume?.inspectorTab ?? null : null,
  )
  const appearance = useAppAppearance()
  const tradeCapturePreferences = useAppTradeCaptureSettings()
  const workspaceData = useAppWorkspaceData(route.currentView)
  const startHere = useAppStartHere(workspaceData.authSession)
  const [startHereReturnIntent, setStartHereReturnIntent] = useState<StartHereReturnView | null>(() =>
    getStartHereReturnIntent(),
  )
  const previousAuthSessionIdRef = useRef<string | null>(workspaceData.authSession?.sessionId ?? null)

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

  const activePrimarySection = route.activeNavigationSectionKey
    ? primaryNavigationSectionByKey(route.activeNavigationSectionKey)
    : primaryNavigationSectionForView(route.currentView)

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
    selectedTradeId: route.selectedTradeId,
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

  function navigateToTrade(tradeId: string) {
    route.navigateToTrade(tradeId)
    shell.setInspectorTab('overview')
  }

  const tradeActions = useAppTradeActions({
    captureForm,
    amendForm,
    counterpartyCreditProfiles: workspaceData.counterpartyCreditProfiles,
    refreshMutationData: workspaceData.refreshMutationData,
    selectedTrade: summary.selectedTrade,
    selectedTradeEvents: summary.selectedTradeEvents,
    selectedTradeId: route.selectedTradeId,
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
    commodities: workspaceData.commodities,
    priceIndices: workspaceData.priceIndices,
    currencies: workspaceData.currencies,
    units: workspaceData.units,
    locations: workspaceData.locations,
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
    locationStandards: workspaceData.locationStandards,
    counterpartyStandards: workspaceData.counterpartyStandards,
    commodityClassOrder,
  })

  const {
    blockingWorkspaceError,
    workspaceLoading,
    workspaceWarning,
    systemStateLabel,
    systemStateTone,
  } = deriveWorkspaceStatus({
    appLoading: workspaceData.appLoading,
    currentView: route.currentView,
    error: workspaceData.error,
    groupErrors: workspaceData.groupErrors,
    groupLoaded: workspaceData.groupLoaded,
    groupLoading: workspaceData.groupLoading,
  })
  const [signOutPending, setSignOutPending] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  function handleRetryCurrentWorkspace() {
    void workspaceData.loadData({
      groups: VIEW_DATA_GROUPS[route.currentView],
      force: true,
    })
  }

  async function handleSignOut() {
    setSignOutPending(true)
    setSignOutError('')
    clearAuthInterruptionResumeSnapshot()
    setAuthInterruptionResume(null)

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
  const selectedTrade = summary.selectedTrade
  const showingNavigationSectionLanding = route.activeNavigationSectionKey !== null
  const heroTitle = showingNavigationSectionLanding ? activePrimarySection.heroTitle : HERO_TITLE_BY_VIEW[route.currentView]
  const heroBody = showingNavigationSectionLanding ? activePrimarySection.heroBody : HERO_BODY_BY_VIEW[route.currentView]
  const hasAuthenticationIssue =
    isAuthenticationRequiredMessage(workspaceData.error) ||
    Object.values(workspaceData.groupErrors).some((message) => isAuthenticationRequiredMessage(message))
  const effectiveSystemStateLabel = !authSession && hasAuthenticationIssue ? 'Needs sign-in' : systemStateLabel
  const effectiveSystemStateTone = !authSession && hasAuthenticationIssue ? 'active' : systemStateTone

  function handleStartHereOpenView(view: ViewKey, returnIntentView: StartHereReturnView | null = null) {
    if (!authSession && returnIntentView) {
      setStartHereReturnIntent(saveStartHereReturnIntent(returnIntentView))
    }

    route.navigateToView(view)
  }

  function currentAppUrl(): string {
    if (typeof window === 'undefined') {
      return '/'
    }

    return `${window.location.pathname}${window.location.search}${window.location.hash}`
  }

  function interruptionContinueLabel(): string {
    if (route.currentView === 'trades') {
      if (route.selectedTradeId && shell.inspectorTab === 'amend') {
        return `the amendment for trade ${route.selectedTradeId}`
      }

      if (route.selectedTradeId) {
        return `trade ${route.selectedTradeId} in Trade Capture`
      }

      return 'Trade Capture'
    }

    if (route.activeNavigationSectionKey !== null) {
      return activePrimarySection.label
    }

    return workspaceLabel(route.currentView)
  }

  function clearAuthInterruptionResume() {
    clearAuthInterruptionResumeSnapshot()
    setAuthInterruptionResume(null)
  }

  function restoreAuthInterruptionRoute(snapshot: AuthInterruptionResumeSnapshot) {
    if (typeof window !== 'undefined' && currentAppUrl() !== snapshot.url) {
      window.history.replaceState(null, '', snapshot.url)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }

  useEffect(() => {
    if (authSession || workspaceData.authInterruptionReason !== 'session_expired') {
      return
    }

    const nextSnapshot = saveAuthInterruptionResumeSnapshot({
      reason: 'session_expired',
      url: currentAppUrl(),
      continueLabel: interruptionContinueLabel(),
      inspectorTab: route.currentView === 'trades' ? shell.inspectorTab : null,
    })

    setAuthInterruptionResume(nextSnapshot)
  }, [
    authSession,
    activePrimarySection.label,
    route.activeNavigationSectionKey,
    route.currentView,
    route.selectedTradeId,
    shell.inspectorTab,
    workspaceData.authInterruptionReason,
  ])

  useEffect(() => {
    if (!authSession || authInterruptionResume === null) {
      return
    }

    if (currentAppUrl() !== authInterruptionResume.url) {
      restoreAuthInterruptionRoute(authInterruptionResume)
      return
    }

    if (authInterruptionResume.inspectorTab) {
      if (route.currentView !== 'trades') {
        return
      }

      if (
        route.selectedTradeId !== null &&
        selectedTrade?.trade_id !== route.selectedTradeId
      ) {
        return
      }

      if (shell.inspectorTab !== authInterruptionResume.inspectorTab) {
        shell.setInspectorTab(authInterruptionResume.inspectorTab)
        return
      }
    }

    clearAuthInterruptionResume()
  }, [
    authInterruptionResume,
    authSession,
    route.currentView,
    route.selectedTradeId,
    selectedTrade?.trade_id,
    shell.inspectorTab,
    shell.setInspectorTab,
  ])

  useEffect(() => {
    const previousAuthSessionId = previousAuthSessionIdRef.current
    const nextAuthSessionId = authSession?.sessionId ?? null
    const justSignedIn = previousAuthSessionId === null && nextAuthSessionId !== null
    previousAuthSessionIdRef.current = nextAuthSessionId

    if (!authSession || authInterruptionResume !== null || startHereReturnIntent === null) {
      return
    }

    if (justSignedIn || route.currentView === 'settings') {
      startHere.dismissStartHere()
      clearStartHereReturnIntent()
      setStartHereReturnIntent(null)
      route.replaceView(startHereReturnIntent)
      return
    }

    clearStartHereReturnIntent()
    setStartHereReturnIntent(null)
  }, [authInterruptionResume, authSession, route.currentView, route.replaceView, startHere, startHereReturnIntent])

  const showStartHereOverlay =
    startHere.showStartHere &&
    !(authSession && startHereReturnIntent) &&
    workspaceData.authInterruptionReason !== 'session_expired' &&
    authInterruptionResume === null
  const pendingStartHereReturnLabel = startHereReturnIntent
    ? formatStartHereReturnIntentLabel(startHereReturnIntent)
    : null
  const authInterruptionMessage = authInterruptionResume
    ? `Session expired. Sign in to continue to ${authInterruptionResume.continueLabel}.`
    : null
  const signedOutNeedsAuthGate = !authSession && route.currentView !== 'guide'

  if (signedOutNeedsAuthGate) {
    return (
      <div className="app-shell auth-gate-shell">
        <div className="app-aura app-aura-left" />
        <div className="app-aura app-aura-right" />
        <AuthGate
          authInterruptionMessage={authInterruptionMessage}
          onSessionChange={workspaceData.handleSessionChange}
          pendingStartHereReturnLabel={pendingStartHereReturnLabel}
        />
        {showStartHereOverlay ? (
          <AppStartHereOverlay
            authSession={authSession}
            onDismiss={startHere.dismissStartHere}
            onOpenView={handleStartHereOpenView}
          />
        ) : null}
      </div>
    )
  }

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
        className={`side-rail ${shell.mobileNavOpen ? 'is-open' : ''}`}
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
                    onClick={() => {
                      toggleNavSection(section.key)
                    }}
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

      <main className="main-stage">
        {showStartHereOverlay ? (
          <AppStartHereOverlay
            authSession={authSession}
            onDismiss={startHere.dismissStartHere}
            onOpenView={handleStartHereOpenView}
          />
        ) : null}

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
                : APP_VIEWS.find((view) => view.key === route.currentView)?.label}
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
                  onClick={() => void handleSignOut()}
                  disabled={signOutPending}
                >
                  {signOutPending ? 'Signing Out...' : 'Sign Out'}
                </button>
                {signOutError ? <small className="hero-badge-error">{signOutError}</small> : null}
              </div>
            ) : null}
          </div>
        </header>

        {!showingNavigationSectionLanding && workspaceData.error ? (
          <div className="error-banner">{workspaceData.error}</div>
        ) : null}
        {!showingNavigationSectionLanding && workspaceWarning ? (
          <div className="error-banner">{workspaceData.groupErrors[workspaceWarning]}</div>
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
            message={workspaceData.groupErrors[blockingWorkspaceError]}
            onRetry={handleRetryCurrentWorkspace}
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
