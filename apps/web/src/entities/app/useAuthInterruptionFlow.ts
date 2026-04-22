import { useEffect, useMemo, useSyncExternalStore } from 'react'

import { workspaceLabel } from './appViews'
import type { InspectorTab, ViewKey } from '../../shared/models'
import {
  clearAuthInterruptionResumeSnapshot,
  getAuthInterruptionResumeSnapshot,
  saveAuthInterruptionResumeSnapshot,
  subscribeAuthInterruptionResumeSnapshot,
  type AuthInterruptionReason,
  type AuthInterruptionResumeSnapshot,
} from '../../shared/authInterruptionResume'

type BuildAuthInterruptionContinueLabelArgs = {
  currentView: ViewKey
  selectedTradeId: string | null
  inspectorTab: InspectorTab
  activeNavigationSectionLabel: string | null
}

type ResolveAuthInterruptionResumeActionArgs = {
  authSessionId: string | null
  snapshot: AuthInterruptionResumeSnapshot | null
  currentUrl: string
  currentView: ViewKey
  selectedTradeId: string | null
  selectedTradeRecordId: string | null
  inspectorTab: InspectorTab
}

export type AuthInterruptionResumeAction =
  | { kind: 'noop' }
  | { kind: 'restore-url'; url: string }
  | { kind: 'restore-inspector-tab'; inspectorTab: InspectorTab }
  | { kind: 'clear' }

type UseAuthInterruptionFlowArgs = {
  initialSnapshot: AuthInterruptionResumeSnapshot | null
  authSessionId: string | null
  authInterruptionReason: AuthInterruptionReason | null
  currentView: ViewKey
  selectedTradeId: string | null
  selectedTradeRecordId: string | null
  inspectorTab: InspectorTab
  setInspectorTab: (nextInspectorTab: InspectorTab) => void
  activeNavigationSectionLabel: string | null
}

function currentAppUrl(): string {
  if (typeof window === 'undefined') {
    return '/'
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function sameAuthInterruptionResumeSnapshot(
  left: AuthInterruptionResumeSnapshot | null,
  right: AuthInterruptionResumeSnapshot | null,
): boolean {
  return (
    left?.reason === right?.reason &&
    left?.url === right?.url &&
    left?.continueLabel === right?.continueLabel &&
    left?.inspectorTab === right?.inspectorTab
  )
}

export function buildAuthInterruptionContinueLabel({
  currentView,
  selectedTradeId,
  inspectorTab,
  activeNavigationSectionLabel,
}: BuildAuthInterruptionContinueLabelArgs): string {
  if (currentView === 'trades') {
    if (selectedTradeId && inspectorTab === 'amend') {
      return `the amendment for trade ${selectedTradeId}`
    }

    if (selectedTradeId) {
      return `trade ${selectedTradeId} in Trade Capture`
    }

    return 'Trade Capture'
  }

  if (activeNavigationSectionLabel !== null) {
    return activeNavigationSectionLabel
  }

  return workspaceLabel(currentView)
}

export function resolveAuthInterruptionResumeAction({
  authSessionId,
  snapshot,
  currentUrl,
  currentView,
  selectedTradeId,
  selectedTradeRecordId,
  inspectorTab,
}: ResolveAuthInterruptionResumeActionArgs): AuthInterruptionResumeAction {
  if (!authSessionId || snapshot === null) {
    return { kind: 'noop' }
  }

  if (currentUrl !== snapshot.url) {
    return { kind: 'restore-url', url: snapshot.url }
  }

  if (snapshot.inspectorTab) {
    if (currentView !== 'trades') {
      return { kind: 'noop' }
    }

    if (selectedTradeId !== null && selectedTradeRecordId !== selectedTradeId) {
      return { kind: 'noop' }
    }

    if (inspectorTab !== snapshot.inspectorTab) {
      return {
        kind: 'restore-inspector-tab',
        inspectorTab: snapshot.inspectorTab,
      }
    }
  }

  return { kind: 'clear' }
}

export function useAuthInterruptionFlow({
  initialSnapshot,
  authSessionId,
  authInterruptionReason,
  currentView,
  selectedTradeId,
  selectedTradeRecordId,
  inspectorTab,
  setInspectorTab,
  activeNavigationSectionLabel,
}: UseAuthInterruptionFlowArgs) {
  const storedAuthInterruptionResume = useSyncExternalStore(
    subscribeAuthInterruptionResumeSnapshot,
    getAuthInterruptionResumeSnapshot,
    () => initialSnapshot,
  )

  const interruptionContinueLabel = useMemo(
    () =>
      buildAuthInterruptionContinueLabel({
        currentView,
        selectedTradeId,
        inspectorTab,
        activeNavigationSectionLabel,
      }),
    [activeNavigationSectionLabel, currentView, inspectorTab, selectedTradeId],
  )
  const interruptionInspectorTab = currentView === 'trades' ? inspectorTab : null
  const pendingAuthInterruptionResume = useMemo<AuthInterruptionResumeSnapshot | null>(() => {
    if (authSessionId || authInterruptionReason !== 'session_expired') {
      return null
    }

    return {
      reason: 'session_expired',
      url: currentAppUrl(),
      continueLabel: interruptionContinueLabel,
      inspectorTab: interruptionInspectorTab,
    }
  }, [
    authInterruptionReason,
    authSessionId,
    interruptionContinueLabel,
    interruptionInspectorTab,
  ])
  const authInterruptionResume =
    pendingAuthInterruptionResume ?? storedAuthInterruptionResume

  function clearAuthInterruptionResume() {
    clearAuthInterruptionResumeSnapshot()
  }

  useEffect(() => {
    if (
      pendingAuthInterruptionResume === null ||
      sameAuthInterruptionResumeSnapshot(
        storedAuthInterruptionResume,
        pendingAuthInterruptionResume,
      )
    ) {
      return
    }

    saveAuthInterruptionResumeSnapshot(pendingAuthInterruptionResume)
  }, [pendingAuthInterruptionResume, storedAuthInterruptionResume])

  useEffect(() => {
    const action = resolveAuthInterruptionResumeAction({
      authSessionId,
      snapshot: authInterruptionResume,
      currentUrl: currentAppUrl(),
      currentView,
      selectedTradeId,
      selectedTradeRecordId,
      inspectorTab,
    })

    switch (action.kind) {
      case 'restore-url':
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', action.url)
          window.dispatchEvent(new PopStateEvent('popstate'))
        }
        return
      case 'restore-inspector-tab':
        setInspectorTab(action.inspectorTab)
        return
      case 'clear':
        clearAuthInterruptionResumeSnapshot()
        return
      case 'noop':
        return
    }
  }, [
    authInterruptionResume,
    authSessionId,
    currentView,
    inspectorTab,
    selectedTradeId,
    selectedTradeRecordId,
    setInspectorTab,
  ])

  return {
    authInterruptionResume,
    authInterruptionMessage: authInterruptionResume
      ? `Session expired. Sign in to continue to ${authInterruptionResume.continueLabel}.`
      : null,
    clearAuthInterruptionResume,
  }
}
