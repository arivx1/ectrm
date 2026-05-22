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

function defaultAppViewKey(): ViewKey {
  if (typeof window === 'undefined') {
    return DEFAULT_APP_VIEW_KEY
  }

  return resolvePreferredHomeView(getAppearanceSettingsSnapshot())
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
  const view: ViewKey = isViewKey(viewParam) ? viewParam : preferredDefaultView
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

  function syncRouteState(
    route: AppRouteState,
    historyMode: 'push' | 'replace',
    nextHash = '',
  ) {
    const nextUrl = buildAppRouteUrl(route, nextHash)
    if (nextUrl === currentAppUrl()) {
      return
    }

    const historyMethod = historyMode === 'push' ? 'pushState' : 'replaceState'
    window.history[historyMethod](null, '', nextUrl)
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
        : view === 'settings'
          ? window.location.hash
          : ''
    syncRouteState(
      {
        section: null,
        view,
        tradeId: nextTradeId,
        messagingConversationId: nextMessagingConversationId,
        libraryDocumentId: nextLibraryDocumentId,
        handoff,
      },
      historyMode,
      nextHash,
    )
    setActiveNavigationSectionKey(null)
    setCurrentView(view)
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
    const options =
      typeof hashOrOptions === 'object' && hashOrOptions !== null
        ? hashOrOptions
        : { hash: hashOrOptions }
    const nextHash =
      options.hash !== undefined
        ? normalizeHashFragment(options.hash)
        : view === 'settings'
          ? window.location.hash
          : ''
    return buildAppRouteUrl(
      {
        section: null,
        view,
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

  useEffect(() => {
    function handlePopState() {
      const nextRoute = readAppRouteState()
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

  useEffect(() => {
    syncRouteState(
      {
        section: activeNavigationSectionKey,
        view: currentView,
        tradeId: selectedTradeId,
        messagingConversationId: selectedMessagingConversationId,
        libraryDocumentId: selectedLibraryDocumentId,
        handoff: routeHandoff,
      },
      'replace',
      currentView === 'settings' ? window.location.hash : '',
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
