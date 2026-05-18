import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

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
import { TerminalCommandBar } from './entities/app/TerminalCommandBar'
import { TerminalShortcutReference } from './entities/app/TerminalShortcutReference'
import { TerminalWorkspaceSetLauncher } from './entities/app/TerminalWorkspaceSetLauncher'
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
    currentView === 'operations' ||
    currentView === 'settlement' ||
    currentView === 'trades' ||
    currentView === 'shipments' ||
    currentView === 'scheduling'

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
  const heroTitle = showingNavigationSectionLanding ? activePrimarySection.heroTitle : HERO_TITLE_BY_VIEW[currentView]
  const heroBody = showingNavigationSectionLanding ? activePrimarySection.heroBody : HERO_BODY_BY_VIEW[currentView]
  const isPromptHomeView = !showingNavigationSectionLanding && currentView === 'prompt'
  const showHeroBadge = showingNavigationSectionLanding || currentView !== 'library'
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
    shell,
    shortcutReferenceOpen,
    terminalCommandBarOpen,
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
        navigateToView={(view) =>
          route.navigateToView(view, null, {
            tradeId: null,
            messagingConversationId: null,
            libraryDocumentId: null,
          })
        }
        onNavigate={() => shell.setMobileNavOpen(false)}
      />
    )
  }

  return (
    <div className={`app-shell ${shellModeClassName}`.trim()}>
      <div className="app-aura app-aura-left" />
      <div className="app-aura app-aura-right" />

      <div className="mobile-topbar">
        <div>
          <span className="brand-mark">Strata</span>
        </div>
        <div className="mobile-topbar-actions">
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
        className={`side-rail ${shell.mobileNavOpen ? 'is-open' : ''} ${isPromptHomeView ? 'side-rail-prompt' : ''}`}
        hidden={shell.mobileNavHidden}
        aria-hidden={shell.mobileNavHidden ? true : undefined}
      >
        <div className="brand-lockup">
          <span className="brand-mark">Strata</span>
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

      <main
        className={`main-stage ${isPromptHomeView ? 'main-stage-prompt' : ''}`}
        tabIndex={-1}
        data-terminal-shortcut-target="main-stage"
      >
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
              <strong>{currentWorkspaceLabel}</strong>
            </div>
            <div className="workspace-topbar-actions">
              {renderTerminalCommandTrigger()}
              {renderShortcutReferenceTrigger()}
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
              {heroBody ? <p>{heroBody}</p> : null}
            </div>

            {showHeroBadge ? (
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
                <div className="hero-badge-actions">
                  {renderTerminalCommandTrigger()}
                  {renderShortcutReferenceTrigger()}
                  {authSession ? (
                    <small className="hero-badge-session">
                      Signed in as {authSession.user.display_name}
                    </small>
                  ) : null}
                  {authSession ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void onSignOut()}
                      disabled={signOutPending}
                    >
                      {signOutPending ? 'Signing Out...' : 'Sign Out'}
                    </button>
                  ) : null}
                  {signOutError ? <small className="hero-badge-error">{signOutError}</small> : null}
                </div>
              </div>
            ) : null}
          </header>
        )}

        {renderWorkspaceSetLauncher()}

        {!showingNavigationSectionLanding && workspaceData.error ? (
          <WorkspaceErrorBanner
            message={workspaceShellErrorMessage}
            onReconnect={workspaceShellReconnectAvailable ? handleReconnectWorkspace : null}
            reconnectPending={workspaceReconnectPending}
          />
        ) : null}
        {!showingNavigationSectionLanding && workspaceWarning ? (
          <WorkspaceErrorBanner
            message={workspaceWarningMessage}
            onReconnect={workspaceWarningReconnectAvailable ? handleReconnectWorkspace : null}
            reconnectPending={workspaceReconnectPending}
          />
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
        navigateToView={route.navigateToView}
        navigateToTrade={navigateToTrade}
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
