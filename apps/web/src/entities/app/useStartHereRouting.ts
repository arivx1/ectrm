import { useEffect, useRef, useSyncExternalStore } from 'react'

import type { ViewKey } from '../../shared/models'
import {
  clearStartHereReturnIntent,
  formatStartHereReturnIntentLabel,
  getStartHereReturnIntent,
  saveStartHereReturnIntent,
  subscribeStartHereReturnIntent,
  type StartHereReturnView,
} from '../../shared/startHereReturnIntent'

export type StartHereRoutingAction =
  | { kind: 'noop' }
  | { kind: 'resume'; view: StartHereReturnView }
  | { kind: 'clear' }

type ResolveStartHereRoutingActionArgs = {
  authSessionId: string | null
  previousAuthSessionId: string | null
  authInterruptionActive: boolean
  currentView: ViewKey
  startHereReturnIntent: StartHereReturnView | null
}

type UseStartHereRoutingArgs = {
  authSessionId: string | null
  authInterruptionActive: boolean
  currentView: ViewKey
  dismissStartHere: () => void
  navigateToView: (view: ViewKey) => void
  replaceView: (view: ViewKey) => void
}

export function resolveStartHereRoutingAction({
  authSessionId,
  previousAuthSessionId,
  authInterruptionActive,
  currentView,
  startHereReturnIntent,
}: ResolveStartHereRoutingActionArgs): StartHereRoutingAction {
  if (!authSessionId || authInterruptionActive || startHereReturnIntent === null) {
    return { kind: 'noop' }
  }

  const justSignedIn = previousAuthSessionId === null && authSessionId !== null
  if (justSignedIn || currentView === 'settings') {
    return {
      kind: 'resume',
      view: startHereReturnIntent,
    }
  }

  return { kind: 'clear' }
}

export function useStartHereRouting({
  authSessionId,
  authInterruptionActive,
  currentView,
  dismissStartHere,
  navigateToView,
  replaceView,
}: UseStartHereRoutingArgs) {
  const startHereReturnIntent = useSyncExternalStore(
    subscribeStartHereReturnIntent,
    getStartHereReturnIntent,
    () => null,
  )
  const previousAuthSessionIdRef = useRef<string | null>(authSessionId)

  useEffect(() => {
    const previousAuthSessionId = previousAuthSessionIdRef.current
    previousAuthSessionIdRef.current = authSessionId

    const action = resolveStartHereRoutingAction({
      authSessionId,
      previousAuthSessionId,
      authInterruptionActive,
      currentView,
      startHereReturnIntent,
    })

    switch (action.kind) {
      case 'resume':
        dismissStartHere()
        clearStartHereReturnIntent()
        replaceView(action.view)
        return
      case 'clear':
        clearStartHereReturnIntent()
        return
      case 'noop':
        return
    }
  }, [
    authInterruptionActive,
    authSessionId,
    currentView,
    dismissStartHere,
    replaceView,
    startHereReturnIntent,
  ])

  function handleStartHereOpenView(view: ViewKey, returnIntentView: StartHereReturnView | null = null) {
    if (!authSessionId && returnIntentView) {
      saveStartHereReturnIntent(returnIntentView)
    }

    navigateToView(view)
  }

  return {
    handleStartHereOpenView,
    pendingStartHereReturnLabel: startHereReturnIntent
      ? formatStartHereReturnIntentLabel(startHereReturnIntent)
      : null,
    startHereReturnIntent,
  }
}
