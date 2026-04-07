import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'

import { shouldHandleClientSideNavigation } from '../../app/navigation'
import type { DocumentationDocumentKey } from '../../workspaces/docs/DocumentationWorkspace'
import type { ViewKey } from '../../shared/models'
import {
  DEFAULT_DOCUMENTATION_DOCUMENT_KEY,
  isDocumentationDocumentKey,
  isViewKey,
} from './appViews'

export type AppRouteState = {
  view: ViewKey
  docsDocumentKey: DocumentationDocumentKey
  tradeId: string | null
}

function readAppRouteState(): AppRouteState {
  if (typeof window === 'undefined') {
    return {
      view: 'dashboard',
      docsDocumentKey: DEFAULT_DOCUMENTATION_DOCUMENT_KEY,
      tradeId: null,
    }
  }

  const params = new URLSearchParams(window.location.search)
  const viewParam = params.get('view')
  const docsParam = params.get('doc')
  const view: ViewKey = isViewKey(viewParam) ? viewParam : 'dashboard'

  return {
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
  if (route.view !== 'dashboard') {
    params.set('view', route.view)
  }
  if (route.view === 'guide' && route.docsDocumentKey !== DEFAULT_DOCUMENTATION_DOCUMENT_KEY) {
    params.set('doc', route.docsDocumentKey)
  }
  if (route.view === 'trades' && route.tradeId) {
    params.set('trade', route.tradeId)
  }

  const query = params.toString()
  return `${window.location.pathname}${query ? `?${query}` : ''}${hash}`
}

export function useAppRouteState() {
  const initialRoute = useMemo(() => readAppRouteState(), [])
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
    syncRouteState(
      {
        view,
        docsDocumentKey: activeDocumentationDocumentKey,
        tradeId: selectedTradeId,
      },
      'push',
      view === 'settings',
    )
    setCurrentView(view)
  }

  function hrefForView(view: ViewKey) {
    return buildAppRouteUrl(
      {
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

  function navigateToTrade(tradeId: string) {
    syncRouteState(
      {
        view: 'trades',
        docsDocumentKey: activeDocumentationDocumentKey,
        tradeId,
      },
      'push',
    )
    setSelectedTradeId(tradeId)
    setCurrentView('trades')
  }

  function handleDocumentationDocumentChange(nextDocumentKey: DocumentationDocumentKey) {
    if (currentView === 'guide' && activeDocumentationDocumentKey === nextDocumentKey) {
      return
    }

    syncRouteState(
      {
        view: 'guide',
        docsDocumentKey: nextDocumentKey,
        tradeId: selectedTradeId,
      },
      'push',
      currentView === 'guide' && nextDocumentKey === DEFAULT_DOCUMENTATION_DOCUMENT_KEY,
    )
    setActiveDocumentationDocumentKey(nextDocumentKey)
    setCurrentView('guide')
  }

  useEffect(() => {
    function handlePopState() {
      const nextRoute = readAppRouteState()
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
        view: currentView,
        docsDocumentKey: activeDocumentationDocumentKey,
        tradeId: selectedTradeId,
      },
      'replace',
      currentView === 'settings' ||
        (currentView === 'guide' && activeDocumentationDocumentKey === DEFAULT_DOCUMENTATION_DOCUMENT_KEY),
    )
  }, [currentView, activeDocumentationDocumentKey, selectedTradeId])

  return {
    activeDocumentationDocumentKey,
    currentView,
    handleDocumentationDocumentChange,
    handleViewLinkClick,
    hrefForView,
    navigateToTrade,
    navigateToView,
    selectedTradeId,
    setSelectedTradeId,
  }
}
