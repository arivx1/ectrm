import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'

import {
  isPrimaryNavigationSectionKey,
  primaryNavigationSectionLandingView,
  type PrimaryNavigationSectionKey,
  shouldHandleClientSideNavigation,
} from '../../app/navigation'
import type { ViewKey } from '../../shared/models'
import { isViewKey } from './appViews'
import {
  getAppearanceSettingsSnapshot,
  resolvePreferredHomeView,
} from '../../shared/appearance'
import {
  type AppRouteHandoff,
  readAppRouteHandoff,
  writeAppRouteHandoff,
} from '../../shared/appRouteHandoff'

export const DEFAULT_APP_VIEW_KEY: ViewKey = 'prompt'
const APP_HISTORY_INDEX_STATE_KEY = '__ectrmAppHistoryIndex'

type AppHistoryState = {
  [APP_HISTORY_INDEX_STATE_KEY]?: number
}

export type AppBackAction =
  | {
      kind: 'history-back'
    }
  | {
      kind: 'fallback'
      view: ViewKey
    }
  | {
      kind: 'noop'
    }

function readAppHistoryIndexFromState(state: unknown): number | null {
  if (!state || typeof state !== 'object') {
    return null
  }

  const value = (state as AppHistoryState)[APP_HISTORY_INDEX_STATE_KEY]
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function buildAppHistoryState(index: number): AppHistoryState & Record<string, unknown> {
  const currentState =
    typeof window !== 'undefined' && window.history.state && typeof window.history.state === 'object'
      ? (window.history.state as Record<string, unknown>)
      : {}

  return {
    ...currentState,
    [APP_HISTORY_INDEX_STATE_KEY]: index,
  }
}

function replaceCurrentAppHistoryState(index: number) {
  if (typeof window === 'undefined') {
    return
  }

  window.history.replaceState(buildAppHistoryState(index), '', currentAppUrl())
}

export function resolveAppBackAction(args: {
  appHistoryIndex: number
  activeNavigationSectionKey: PrimaryNavigationSectionKey | null
  currentView: ViewKey
  fallbackView?: ViewKey
}): AppBackAction {
  if (args.appHistoryIndex > 0) {
    return { kind: 'history-back' }
  }

  const fallbackView = args.fallbackView ?? DEFAULT_APP_VIEW_KEY
  if (args.activeNavigationSectionKey !== null || args.currentView !== fallbackView) {
    return {
      kind: 'fallback',
      view: fallbackView,
    }
  }

  return { kind: 'noop' }
}

function defaultAppViewKey(): ViewKey {
  if (typeof window === 'undefined') {
    return DEFAULT_APP_VIEW_KEY
  }

  return resolvePreferredHomeView(getAppearanceSettingsSnapshot())
}

function normalizeDeprecatedAppView(view: ViewKey): ViewKey {
  return view === 'dashboard' ? defaultAppViewKey() : view
}

export type AppRouteState = {
  section: PrimaryNavigationSectionKey | null
  view: ViewKey
  tradeId: string | null
  messagingConversationId: string | null
  libraryDocumentId: string | null
  handoff: AppRouteHandoff | null
}

type AppRouteNavigationOptions = {
  tradeId?: string | null
  messagingConversationId?: string | null
  libraryDocumentId?: string | null
  hash?: string | null
}

function readAppRouteState(): AppRouteState {
  if (typeof window === 'undefined') {
    return {
      section: null,
      view: DEFAULT_APP_VIEW_KEY,
      tradeId: null,
      messagingConversationId: null,
      libraryDocumentId: null,
      handoff: null,
    }
  }

  const params = new URLSearchParams(window.location.search)
  const sectionParam = params.get('section')
  const viewParam = params.get('view')
  const preferredDefaultView = defaultAppViewKey()
  const view: ViewKey = normalizeDeprecatedAppView(
    isViewKey(viewParam) ? viewParam : preferredDefaultView,
  )
  const section = isPrimaryNavigationSectionKey(sectionParam) ? sectionParam : null
  const sectionLandingView = section === null ? null : primaryNavigationSectionLandingView(section)
  const routeView = sectionLandingView ?? view

  return {
    section: sectionLandingView === null ? section : null,
    view: routeView,
    tradeId: routeView === 'trades' ? params.get('trade')?.trim() || null : null,
    messagingConversationId:
      routeView === 'messages' ? params.get('conversation')?.trim() || null : null,
    libraryDocumentId:
      routeView === 'library' ? params.get('document')?.trim() || null : null,
    handoff: readAppRouteHandoff(params),
  }
}

function currentAppUrl(): string {
  if (typeof window === 'undefined') {
    return '/'
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function normalizeHashFragment(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return ''
  }

  return trimmedValue.startsWith('#') ? trimmedValue : `#${trimmedValue}`
}

function buildAppRouteUrl(route: AppRouteState, hash: string): string {
  const preferredDefaultView = defaultAppViewKey()
  const params = new URLSearchParams()
  if (route.section !== null) {
    params.set('section', route.section)
  } else {
    if (route.view !== preferredDefaultView) {
      params.set('view', route.view)
    }
    if (route.view === 'trades' && route.tradeId) {
      params.set('trade', route.tradeId)
    }
    if (route.view === 'messages' && route.messagingConversationId) {
      params.set('conversation', route.messagingConversationId)
    }
    if (route.view === 'library' && route.libraryDocumentId) {
      params.set('document', route.libraryDocumentId)
    }
    writeAppRouteHandoff(params, route.handoff)
  }

  const query = params.toString()
  return `${window.location.pathname}${query ? `?${query}` : ''}${hash}`
}

function currentWindowAppHistoryIndex(fallbackIndex: number): number {
  if (typeof window === 'undefined') {
    return fallbackIndex
  }

  return readAppHistoryIndexFromState(window.history.state) ?? fallbackIndex
}

function writeAppRouteHistory(
  route: AppRouteState,
  historyMode: 'push' | 'replace',
  nextHash: string,
  fallbackHistoryIndex: number,
): number {
  const nextUrl = buildAppRouteUrl(route, nextHash)
  const currentHistoryIndex = currentWindowAppHistoryIndex(fallbackHistoryIndex)
  if (nextUrl === currentAppUrl()) {
    if (typeof window !== 'undefined' && readAppHistoryIndexFromState(window.history.state) === null) {
      replaceCurrentAppHistoryState(currentHistoryIndex)
    }
    return currentHistoryIndex
  }

  const historyMethod = historyMode === 'push' ? 'pushState' : 'replaceState'
  const nextHistoryIndex = historyMode === 'push' ? currentHistoryIndex + 1 : currentHistoryIndex
  window.history[historyMethod](buildAppHistoryState(nextHistoryIndex), '', nextUrl)
  return nextHistoryIndex
}

export function useAppRouteState() {
  const initialRoute = useMemo(() => readAppRouteState(), [])
  const [activeNavigationSectionKey, setActiveNavigationSectionKey] =
    useState<PrimaryNavigationSectionKey | null>(initialRoute.section)
  const [currentView, setCurrentView] = useState<ViewKey>(initialRoute.view)
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(initialRoute.tradeId)
  const [selectedMessagingConversationId, setSelectedMessagingConversationId] =
    useState<string | null>(initialRoute.messagingConversationId)
  const [selectedLibraryDocumentId, setSelectedLibraryDocumentId] =
    useState<string | null>(initialRoute.libraryDocumentId)
  const [routeHandoff, setRouteHandoff] = useState<AppRouteHandoff | null>(initialRoute.handoff)
  const [appHistoryIndex, setAppHistoryIndex] = useState(() =>
    typeof window === 'undefined' ? 0 : readAppHistoryIndexFromState(window.history.state) ?? 0,
  )

  function currentTrackedAppHistoryIndex(): number {
    return currentWindowAppHistoryIndex(appHistoryIndex)
  }

  function syncRouteState(
    route: AppRouteState,
    historyMode: 'push' | 'replace',
    nextHash = '',
  ) {
    const nextHistoryIndex = writeAppRouteHistory(route, historyMode, nextHash, currentTrackedAppHistoryIndex())
    setAppHistoryIndex(nextHistoryIndex)
  }

  function navigateToView(
    view: ViewKey,
    handoff: AppRouteHandoff | null = null,
    options: AppRouteNavigationOptions = {},
  ) {
    applyViewNavigation(view, 'push', handoff, options)
  }

  function replaceView(
    view: ViewKey,
    handoff: AppRouteHandoff | null = null,
    options: AppRouteNavigationOptions = {},
  ) {
    applyViewNavigation(view, 'replace', handoff, options)
  }

  function applyViewNavigation(
    view: ViewKey,
    historyMode: 'push' | 'replace',
    handoff: AppRouteHandoff | null = null,
    options: AppRouteNavigationOptions = {},
  ) {
    const nextView = normalizeDeprecatedAppView(view)
    const nextTradeId = options.tradeId !== undefined ? options.tradeId : selectedTradeId
    const nextMessagingConversationId =
      options.messagingConversationId !== undefined
        ? options.messagingConversationId
        : selectedMessagingConversationId
    const nextLibraryDocumentId =
      options.libraryDocumentId !== undefined
        ? options.libraryDocumentId
        : selectedLibraryDocumentId
    const nextHash =
      options.hash !== undefined
        ? normalizeHashFragment(options.hash)
        : nextView === 'settings'
          ? window.location.hash
          : ''
    syncRouteState(
      {
        section: null,
        view: nextView,
        tradeId: nextTradeId,
        messagingConversationId: nextMessagingConversationId,
        libraryDocumentId: nextLibraryDocumentId,
        handoff,
      },
      historyMode,
      nextHash,
    )
    setActiveNavigationSectionKey(null)
    setCurrentView(nextView)
    setRouteHandoff(handoff)
    if (options.tradeId !== undefined) {
      setSelectedTradeId(options.tradeId)
    }
    if (options.messagingConversationId !== undefined) {
      setSelectedMessagingConversationId(options.messagingConversationId)
    }
    if (options.libraryDocumentId !== undefined) {
      setSelectedLibraryDocumentId(options.libraryDocumentId)
    }
  }

  function hrefForView(view: ViewKey, hashOrOptions?: string | null | AppRouteNavigationOptions) {
    const nextView = normalizeDeprecatedAppView(view)
    const options =
      typeof hashOrOptions === 'object' && hashOrOptions !== null
        ? hashOrOptions
        : { hash: hashOrOptions }
    const nextHash =
      options.hash !== undefined
        ? normalizeHashFragment(options.hash)
        : nextView === 'settings'
          ? window.location.hash
          : ''
    return buildAppRouteUrl(
      {
        section: null,
        view: nextView,
        tradeId: options.tradeId !== undefined ? options.tradeId : selectedTradeId,
        messagingConversationId:
          options.messagingConversationId !== undefined
            ? options.messagingConversationId
            : selectedMessagingConversationId,
        libraryDocumentId:
          options.libraryDocumentId !== undefined ? options.libraryDocumentId : selectedLibraryDocumentId,
        handoff: null,
      },
      nextHash,
    )
  }

  function handleViewLinkClick(event: ReactMouseEvent<HTMLAnchorElement>, view: ViewKey) {
    if (!shouldHandleClientSideNavigation(event)) {
      return false
    }

    event.preventDefault()
    navigateToView(view)
    return true
  }

  function navigateToSection(sectionKey: PrimaryNavigationSectionKey) {
    const sectionLandingView = primaryNavigationSectionLandingView(sectionKey)
    if (sectionLandingView !== null) {
      navigateToView(sectionLandingView)
      return
    }

    syncRouteState(
      {
        section: sectionKey,
        view: currentView,
        tradeId: selectedTradeId,
        messagingConversationId: selectedMessagingConversationId,
        libraryDocumentId: selectedLibraryDocumentId,
        handoff: null,
      },
      'push',
    )
    setActiveNavigationSectionKey(sectionKey)
    setRouteHandoff(null)
  }

  function navigateToTrade(tradeId: string, handoff: AppRouteHandoff | null = null) {
    const nextHandoff = handoff
      ? {
          ...handoff,
          tradeId,
          focus: {
            type: 'trade' as const,
            id: tradeId,
            label: handoff.focus.label ?? tradeId,
          },
        }
      : null
    syncRouteState(
      {
        section: null,
        view: 'trades',
        tradeId,
        messagingConversationId: selectedMessagingConversationId,
        libraryDocumentId: selectedLibraryDocumentId,
        handoff: nextHandoff,
      },
      'push',
    )
    setActiveNavigationSectionKey(null)
    setSelectedTradeId(tradeId)
    setCurrentView('trades')
    setRouteHandoff(nextHandoff)
  }

  function navigateBack() {
    const backAction = resolveAppBackAction({
      appHistoryIndex: currentTrackedAppHistoryIndex(),
      activeNavigationSectionKey,
      currentView,
      fallbackView: defaultAppViewKey(),
    })

    if (backAction.kind === 'history-back') {
      window.history.back()
      return
    }

    if (backAction.kind === 'fallback') {
      applyViewNavigation(backAction.view, 'replace', null, {
        tradeId: null,
        messagingConversationId: null,
        libraryDocumentId: null,
      })
    }
  }

  useEffect(() => {
    if (readAppHistoryIndexFromState(window.history.state) === null) {
      replaceCurrentAppHistoryState(0)
    }

    function handlePopState(event: PopStateEvent) {
      const nextRoute = readAppRouteState()
      setAppHistoryIndex(readAppHistoryIndexFromState(event.state) ?? 0)
      setActiveNavigationSectionKey(nextRoute.section)
      setCurrentView(nextRoute.view)
      setRouteHandoff(nextRoute.handoff)
      if (nextRoute.view === 'trades') {
        setSelectedTradeId(nextRoute.tradeId)
      }
      if (nextRoute.view === 'messages') {
        setSelectedMessagingConversationId(nextRoute.messagingConversationId)
      }
      if (nextRoute.view === 'library') {
        setSelectedLibraryDocumentId(nextRoute.libraryDocumentId)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const backAction = resolveAppBackAction({
    appHistoryIndex,
    activeNavigationSectionKey,
    currentView,
    fallbackView: defaultAppViewKey(),
  })

  useEffect(() => {
    writeAppRouteHistory(
      {
        section: activeNavigationSectionKey,
        view: currentView,
        tradeId: selectedTradeId,
        messagingConversationId: selectedMessagingConversationId,
        libraryDocumentId: selectedLibraryDocumentId,
        handoff: routeHandoff,
      },
      'replace',
      window.location.hash,
      0,
    )
  }, [
    activeNavigationSectionKey,
    currentView,
    selectedTradeId,
    selectedMessagingConversationId,
    selectedLibraryDocumentId,
    routeHandoff,
  ])

  return {
    activeNavigationSectionKey,
    currentView,
    handleViewLinkClick,
    hrefForView,
    canNavigateBack: backAction.kind !== 'noop',
    navigateBack,
    navigateToSection,
    navigateToTrade,
    navigateToView,
    replaceView,
    routeHandoff,
    selectedLibraryDocumentId,
    selectedMessagingConversationId,
    selectedTradeId,
    setSelectedLibraryDocumentId,
    setSelectedMessagingConversationId,
    setSelectedTradeId,
  }
}
