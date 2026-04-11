import { Suspense, useEffect, useState } from 'react'

import './App.css'
import './appearance.css'
import {
  MOBILE_NAVIGATION_PANEL_ID,
  PRIMARY_NAV_SECTIONS,
  type PrimaryNavigationSectionKey,
  primaryNavigationSectionByKey,
  primaryNavigationSectionForView,
} from './app/navigation'
import { AppWorkspaceContent } from './entities/app/AppWorkspaceContent'
import {
  APP_VIEWS,
  HERO_BODY_BY_VIEW,
  HERO_TITLE_BY_VIEW,
  workspaceLabel,
} from './entities/app/appViews'
import { useAppAppearance } from './entities/app/useAppAppearance'
import { useAppTradeCaptureSettings } from './entities/app/useAppTradeCaptureSettings'
import { useAppRouteState } from './entities/app/useAppRouteState'
import { useAppShellState } from './entities/app/useAppShellState'
import { useAppTradeActions } from './entities/app/useAppTradeActions'
import { useAppWorkspaceData } from './entities/app/useAppWorkspaceData'
import { useAppWorkspaceSummary } from './entities/app/useAppWorkspaceSummary'
import {
  deriveWorkspaceStatus,
  isAuthenticationRequiredMessage,
  shouldPresentSettingsSignInState,
  VIEW_DATA_GROUPS,
} from './entities/app/workspaceLoading'
import { useReferenceDataController } from './features/reference-data/useReferenceDataController'
import { useTradeAmendForm } from './features/trades/useTradeAmendForm'
import { useTradeCaptureForm } from './features/trades/useTradeCaptureForm'
import { appConfig } from './shared/config'
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
  const [openNavSectionKeys, setOpenNavSectionKeys] = useState<PrimaryNavigationSectionKey[]>(() => [
    route.activeNavigationSectionKey ?? primaryNavigationSectionForView(route.currentView).key,
  ])
  const shell = useAppShellState(route.currentView)
  const appearance = useAppAppearance()
  const tradeCapturePreferences = useAppTradeCaptureSettings()
  const workspaceData = useAppWorkspaceData(route.currentView)

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

  function handleRetryCurrentWorkspace() {
    void workspaceData.loadData({
      groups: VIEW_DATA_GROUPS[route.currentView],
      force: true,
    })
  }

  const selectedTrade = summary.selectedTrade
  const showingNavigationSectionLanding = route.activeNavigationSectionKey !== null
  const heroTitle = showingNavigationSectionLanding ? activePrimarySection.heroTitle : HERO_TITLE_BY_VIEW[route.currentView]
  const heroBody = showingNavigationSectionLanding ? activePrimarySection.heroBody : HERO_BODY_BY_VIEW[route.currentView]
  const hasAuthenticationIssue =
    isAuthenticationRequiredMessage(workspaceData.error) ||
    Object.values(workspaceData.groupErrors).some((message) => isAuthenticationRequiredMessage(message))
  const showingSettingsSignInState = shouldPresentSettingsSignInState({
    currentView: route.currentView,
    error: workspaceData.error,
    hasAuthSession: workspaceData.authSession !== null,
    showingNavigationSectionLanding,
  })
  const signedOutStartupNeedsSettings =
    !workspaceData.authSession &&
    !showingNavigationSectionLanding &&
    route.currentView !== 'settings' &&
    hasAuthenticationIssue
  const effectiveSystemStateLabel = showingSettingsSignInState ? 'Needs sign-in' : systemStateLabel
  const effectiveSystemStateTone = showingSettingsSignInState ? 'active' : systemStateTone

  useEffect(() => {
    if (!signedOutStartupNeedsSettings) {
      return
    }

    route.replaceView('settings')
  }, [route, signedOutStartupNeedsSettings])

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
          </div>
        </header>

        {!showingNavigationSectionLanding && workspaceData.error && !showingSettingsSignInState ? (
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
