import { Suspense } from 'react'

import './App.css'
import './appearance.css'
import { MOBILE_NAVIGATION_PANEL_ID } from './app/navigation'
import { AppWorkspaceContent } from './entities/app/AppWorkspaceContent'
import {
  APP_VIEWS,
  HERO_BODY_BY_VIEW,
  HERO_TITLE_BY_VIEW,
  workspaceLabel,
} from './entities/app/appViews'
import { useAppAppearance } from './entities/app/useAppAppearance'
import { useAppRouteState } from './entities/app/useAppRouteState'
import { useAppShellState } from './entities/app/useAppShellState'
import { useAppTradeActions } from './entities/app/useAppTradeActions'
import { useAppWorkspaceData } from './entities/app/useAppWorkspaceData'
import { useAppWorkspaceSummary } from './entities/app/useAppWorkspaceSummary'
import { deriveWorkspaceStatus, VIEW_DATA_GROUPS } from './entities/app/workspaceLoading'
import { useReferenceDataController } from './features/reference-data/useReferenceDataController'
import { useTradeAmendForm } from './features/trades/useTradeAmendForm'
import { useTradeCaptureForm } from './features/trades/useTradeCaptureForm'
import { tradeTooltipCopy } from './features/trades/tooltipCopy'
import { appConfig } from './shared/config'
import { formatDate, formatMoney, formatNumber, statusTone } from './shared/format'
import { commodityClassOrder, tradeStatusIsActive } from './shared/trading'
import { Tooltip } from './shared/ui/Tooltip'

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
  const shell = useAppShellState(route.currentView)
  const appearance = useAppAppearance()
  const workspaceData = useAppWorkspaceData(route.currentView)

  const summary = useAppWorkspaceSummary({
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
    currentView: route.currentView,
    groupLoaded: workspaceData.groupLoaded,
    loadData: workspaceData.loadData,
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
  const heroTitle = HERO_TITLE_BY_VIEW[route.currentView]
  const heroBody = HERO_BODY_BY_VIEW[route.currentView]

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
          {APP_VIEWS.map((view) => (
            <a
              key={view.key}
              href={route.hrefForView(view.key)}
              className={`nav-item ${route.currentView === view.key ? 'is-active' : ''}`}
              aria-current={route.currentView === view.key ? 'page' : undefined}
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
        </nav>

        <div className="side-card side-card-contrast side-card-terminal">
          <div className="side-card-head">
            <div>
              <span className="eyebrow">Desk State</span>
              <strong className="side-card-title">Projection + routing</strong>
            </div>
            <Tooltip
              content={systemStateTone === 'active' ? tradeTooltipCopy.systemReady : tradeTooltipCopy.systemAttention}
              focusable
            >
              <span className={`status-pill status-pill-${systemStateTone} system-pill tooltip-trigger-hint`}>
                {systemStateLabel}
              </span>
            </Tooltip>
          </div>

          <div className="side-stat-grid">
            <article className="side-stat">
              <span>Open Trades</span>
              <strong>{summary.activeTrades.length}</strong>
            </article>
            <article className="side-stat">
              <span>Pricing</span>
              <strong>{summary.pricingCoverage === null ? '0%' : `${summary.pricingCoverage}%`}</strong>
            </article>
            <article className="side-stat">
              <span>Pending Settle</span>
              <strong>{summary.pendingSettlementTrades}</strong>
            </article>
            <article className="side-stat">
              <span>Books</span>
              <strong>{summary.trackedBooks}</strong>
            </article>
          </div>

          <div className="side-card-section">
            <span className="side-section-title">Registry coverage</span>
            <div className="health-line">
              <span>API</span>
              <strong>{workspaceData.health}</strong>
            </div>
            <div className="health-line">
              <span>Books</span>
              <strong>{workspaceData.books.length}</strong>
            </div>
            <div className="health-line">
              <span>Commodities</span>
              <strong>{workspaceData.commodities.length}</strong>
            </div>
            <div className="health-line">
              <span>Price indices</span>
              <strong>{workspaceData.priceIndices.length}</strong>
            </div>
            <div className="health-line">
              <span>Currencies</span>
              <strong>{workspaceData.currencies.length}</strong>
            </div>
            <div className="health-line">
              <span>Units</span>
              <strong>{workspaceData.units.length}</strong>
            </div>
            <div className="health-line">
              <span>Locations</span>
              <strong>{workspaceData.locations.length}</strong>
            </div>
            <div className="health-line">
              <span>Counterparties</span>
              <strong>{workspaceData.counterparties.length}</strong>
            </div>
            <div className="health-line">
              <span>Portfolios</span>
              <strong>{workspaceData.portfolios.length}</strong>
            </div>
          </div>
        </div>

        {route.currentView !== 'guide' && (
          <div className="side-card side-card-focus">
            <div className="side-card-head">
              <span className="eyebrow">Selected Trade</span>
              {selectedTrade ? (
                <Tooltip
                  content={
                    tradeStatusIsActive(selectedTrade.status)
                      ? tradeTooltipCopy.activeTrade
                      : tradeTooltipCopy.closedTrade
                  }
                  focusable
                >
                  <span className={`status-pill status-pill-${statusTone(selectedTrade.status)} tooltip-trigger-hint`}>
                    {selectedTrade.status}
                  </span>
                </Tooltip>
              ) : null}
            </div>
            {selectedTrade ? (
              <>
                <strong className="side-card-title">{selectedTrade.trade_id}</strong>
                <p>
                  {selectedTrade.trade_nature} • {selectedTrade.trade_structure} • {selectedTrade.book}
                </p>
                <div className="selection-pill-row">
                  <span className="entity-chip entity-chip-soft">Pricing {selectedTrade.pricing_status}</span>
                  <span className="entity-chip entity-chip-soft">Settlement {selectedTrade.settlement_status}</span>
                  {selectedTrade.credit_hold_active ? (
                    <span className="status-pill status-pill-blocked">
                      Credit {selectedTrade.credit_approval_status?.replaceAll('_', ' ') ?? 'HOLD'}
                    </span>
                  ) : null}
                </div>
                {selectedTrade.credit_hold_active ? (
                  <p className="field-error">
                    {selectedTrade.credit_hold_reason ?? 'Credit approval is pending review.'}
                  </p>
                ) : null}
                <div className="side-selection-grid">
                  <article className="side-stat">
                    <span>Price</span>
                    <strong>{formatMoney(selectedTrade.price)}</strong>
                  </article>
                  <article className="side-stat">
                    <span>Volume</span>
                    <strong>{formatNumber(selectedTrade.volume, 0)}</strong>
                  </article>
                  <article className="side-stat">
                    <span>Counterparty</span>
                    <strong>{selectedTrade.counterparty ?? 'TBD'}</strong>
                  </article>
                  <article className="side-stat">
                    <span>Updated</span>
                    <strong>{formatDate(selectedTrade.updated_at)}</strong>
                  </article>
                </div>
              </>
            ) : (
              <>
                <strong className="side-card-title">No trade selected</strong>
                <p>Pick a trade from the workspace to unlock its inspector and event trail.</p>
              </>
            )}
          </div>
        )}
      </aside>

      <main className="main-stage">
        <header className="hero">
          <div className="hero-copy">
            <div className="hero-heading-row">
              <span className="eyebrow">Workspace</span>
              <span className={`hero-session-pill hero-session-pill-${systemStateTone}`}>{systemStateLabel}</span>
            </div>
            <h2>{heroTitle}</h2>
            <p>{heroBody}</p>

            {route.currentView !== 'guide' && (
              <div className="hero-tape">
                <article className="hero-tape-item">
                  <span>Pricing Coverage</span>
                  <strong>{summary.pricingCoverage === null ? '0%' : `${summary.pricingCoverage}%`}</strong>
                  <small>
                    {summary.pricedActiveTrades} of {summary.activeTrades.length} active tickets priced
                  </small>
                </article>
                <article className="hero-tape-item">
                  <span>Pending Pricing</span>
                  <strong>{summary.pendingPricingTrades}</strong>
                  <small>Trades still waiting on explicit pricing state</small>
                </article>
                <article className="hero-tape-item">
                  <span>Books in Play</span>
                  <strong>{summary.trackedBooks}</strong>
                  <small>Distinct books carrying active exposure</small>
                </article>
                <article className="hero-tape-item">
                  <span>Largest Line</span>
                  <strong>
                    {summary.largestPositionRow ? formatNumber(summary.largestPositionRow.net_volume, 0) : 'Flat'}
                  </strong>
                  <small>
                    {summary.largestPositionRow
                      ? summary.largestPositionRow.commodity
                      : 'Waiting for open positions'}
                  </small>
                </article>
              </div>
            )}
          </div>

          <div className="hero-badge">
            <span>Focus</span>
            <strong>
              {selectedTrade
                ? selectedTrade.trade_id
                : APP_VIEWS.find((view) => view.key === route.currentView)?.label}
            </strong>
            <small>
              {selectedTrade
                ? `${selectedTrade.commodity} • ${selectedTrade.book}`
                : `${workspaceData.events.length} loaded events across the current session`}
            </small>
          </div>
        </header>

        {workspaceData.error ? <div className="error-banner">{workspaceData.error}</div> : null}
        {workspaceWarning ? <div className="error-banner">{workspaceData.groupErrors[workspaceWarning]}</div> : null}

        {route.currentView !== 'guide' && (
          <section className="metric-grid">
            <article className="metric-card">
              <span>Open Trades</span>
              <strong>{summary.activeTrades.length}</strong>
              <p>Trades currently carrying exposure.</p>
            </article>
            <article className="metric-card">
              <span>Gross Volume</span>
              <strong>{formatNumber(summary.totalActiveVolume, 0)}</strong>
              <p>Total active volume across uncancelled trades.</p>
            </article>
            <article className="metric-card">
              <span>Pricing Coverage</span>
              <strong>{summary.pricingCoverage === null ? '0%' : `${summary.pricingCoverage}%`}</strong>
              <p>
                {summary.pricedActiveTrades} of {summary.activeTrades.length} active trades currently carry a stored
                price differential.
              </p>
            </article>
            <article className="metric-card">
              <span>Open Positions</span>
              <strong>{summary.positionsWithClass.length}</strong>
              <p>Commodity rows now contributing to the live position projection.</p>
            </article>
            <article className="metric-card">
              <span>Events Loaded</span>
              <strong>{workspaceData.events.length}</strong>
              <p>Recent event records available for review.</p>
            </article>
          </section>
        )}

        {blockingWorkspaceError && !workspaceLoading ? (
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
              captureForm={captureForm}
              amendForm={amendForm}
              appearance={appearance}
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
