import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'

import {
  isPrimaryNavigationSectionKey,
  type PrimaryNavigationSectionKey,
  shouldHandleClientSideNavigation,
} from '../../app/navigation'
import type { DocumentationDocumentKey } from '../../workspaces/docs/DocumentationWorkspace'
import type { ViewKey } from '../../shared/models'
import {
  DEFAULT_DOCUMENTATION_DOCUMENT_KEY,
  isDocumentationDocumentKey,
  isViewKey,
} from './appViews'

export type AppRouteState = {
  section: PrimaryNavigationSectionKey | null
  view: ViewKey
  docsDocumentKey: DocumentationDocumentKey
  tradeId: string | null
}

function readAppRouteState(): AppRouteState {
  if (typeof window === 'undefined') {
    return {
      section: null,
      view: 'dashboard',
      docsDocumentKey: DEFAULT_DOCUMENTATION_DOCUMENT_KEY,
      tradeId: null,
    }
  }

  const params = new URLSearchParams(window.location.search)
  const sectionParam = params.get('section')
  const viewParam = params.get('view')
  const docsParam = params.get('doc')
  const view: ViewKey = isViewKey(viewParam) ? viewParam : 'dashboard'

  return {
    section: isPrimaryNavigationSectionKey(sectionParam) ? sectionParam : null,
    view,
    docsDocumentKey:
      view === 'guide' && isDocumentationDocumentKey(docsParam)
        ? docsParam
        : DEFAULT_DOCUMENTATION_DOCUMENT_KEY,
    tradeId: view === 'trades' ? params.get('trade')?.trim() || null : null,
  }
}

function currentAppUrl(): string {
  if (typeof window === 'undefined') {
    return '/'
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function buildAppRouteUrl(route: AppRouteState, hash: string): string {
  const params = new URLSearchParams()
  if (route.section !== null) {
    params.set('section', route.section)
  } else {
    if (route.view !== 'dashboard') {
      params.set('view', route.view)
    }
    if (route.view === 'guide' && route.docsDocumentKey !== DEFAULT_DOCUMENTATION_DOCUMENT_KEY) {
      params.set('doc', route.docsDocumentKey)
    }
    if (route.view === 'trades' && route.tradeId) {
      params.set('trade', route.tradeId)
    }
  }

  const query = params.toString()
  return `${window.location.pathname}${query ? `?${query}` : ''}${hash}`
}

export function useAppRouteState() {
  const initialRoute = useMemo(() => readAppRouteState(), [])
  const [activeNavigationSectionKey, setActiveNavigationSectionKey] =
    useState<PrimaryNavigationSectionKey | null>(initialRoute.section)
  const [currentView, setCurrentView] = useState<ViewKey>(initialRoute.view)
  const [activeDocumentationDocumentKey, setActiveDocumentationDocumentKey] =
    useState<DocumentationDocumentKey>(initialRoute.docsDocumentKey)
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(initialRoute.tradeId)

  function syncRouteState(route: AppRouteState, historyMode: 'push' | 'replace', preserveHash = false) {
    const nextHash = preserveHash ? window.location.hash : ''
    const nextUrl = buildAppRouteUrl(route, nextHash)
    if (nextUrl === currentAppUrl()) {
      return
    }

    const historyMethod = historyMode === 'push' ? 'pushState' : 'replaceState'
    window.history[historyMethod](null, '', nextUrl)
  }

  function navigateToView(view: ViewKey) {
    applyViewNavigation(view, 'push')
  }

  function replaceView(view: ViewKey) {
    applyViewNavigation(view, 'replace')
  }

  function applyViewNavigation(view: ViewKey, historyMode: 'push' | 'replace') {
    syncRouteState(
      {
        section: null,
        view,
        docsDocumentKey: activeDocumentationDocumentKey,
        tradeId: selectedTradeId,
      },
      historyMode,
      view === 'settings',
    )
    setActiveNavigationSectionKey(null)
    setCurrentView(view)
  }

  function hrefForView(view: ViewKey) {
    return buildAppRouteUrl(
      {
        section: null,
        view,
        docsDocumentKey: activeDocumentationDocumentKey,
        tradeId: selectedTradeId,
      },
      view === 'settings' ? window.location.hash : '',
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
    syncRouteState(
      {
        section: sectionKey,
        view: currentView,
        docsDocumentKey: activeDocumentationDocumentKey,
        tradeId: selectedTradeId,
      },
      'push',
    )
    setActiveNavigationSectionKey(sectionKey)
  }

  function navigateToTrade(tradeId: string) {
    syncRouteState(
      {
        section: null,
        view: 'trades',
        docsDocumentKey: activeDocumentationDocumentKey,
        tradeId,
      },
      'push',
    )
    setActiveNavigationSectionKey(null)
    setSelectedTradeId(tradeId)
    setCurrentView('trades')
  }

  function handleDocumentationDocumentChange(nextDocumentKey: DocumentationDocumentKey) {
    if (currentView === 'guide' && activeDocumentationDocumentKey === nextDocumentKey) {
      return
    }

    syncRouteState(
      {
        section: null,
        view: 'guide',
        docsDocumentKey: nextDocumentKey,
        tradeId: selectedTradeId,
      },
      'push',
      currentView === 'guide' && nextDocumentKey === DEFAULT_DOCUMENTATION_DOCUMENT_KEY,
    )
    setActiveNavigationSectionKey(null)
    setActiveDocumentationDocumentKey(nextDocumentKey)
    setCurrentView('guide')
  }

  useEffect(() => {
    function handlePopState() {
      const nextRoute = readAppRouteState()
      setActiveNavigationSectionKey(nextRoute.section)
      setCurrentView(nextRoute.view)
      if (nextRoute.view === 'guide') {
        setActiveDocumentationDocumentKey(nextRoute.docsDocumentKey)
      }
      if (nextRoute.view === 'trades') {
        setSelectedTradeId(nextRoute.tradeId)
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
        docsDocumentKey: activeDocumentationDocumentKey,
        tradeId: selectedTradeId,
      },
      'replace',
      currentView === 'settings' ||
        (currentView === 'guide' && activeDocumentationDocumentKey === DEFAULT_DOCUMENTATION_DOCUMENT_KEY),
    )
  }, [activeNavigationSectionKey, currentView, activeDocumentationDocumentKey, selectedTradeId])

  return {
    activeDocumentationDocumentKey,
    activeNavigationSectionKey,
    currentView,
    handleDocumentationDocumentChange,
    handleViewLinkClick,
    hrefForView,
    navigateToSection,
    navigateToTrade,
    navigateToView,
    replaceView,
    selectedTradeId,
    setSelectedTradeId,
  }
}
