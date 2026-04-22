import { useState } from 'react'

import type { StoredAuthSession } from '../../shared/mutation'
import {
  dismissStartHereOnboarding,
  getStartHereOnboardingSnapshot,
  saveStartHereOnboardingSnapshot,
  shouldPresentStartHereOnboarding,
} from '../../shared/startHereOnboarding'

export function useAppStartHere(authSession: StoredAuthSession | null) {
  const authSessionId = authSession?.sessionId ?? null
  const [sessionScopedSnapshot, setSessionScopedSnapshot] = useState(() => ({
    authSessionId,
    snapshot: getStartHereOnboardingSnapshot(),
  }))
  const snapshot =
    sessionScopedSnapshot.authSessionId === authSessionId
      ? sessionScopedSnapshot.snapshot
      : getStartHereOnboardingSnapshot()

  function dismissStartHere() {
    const nextSnapshot = saveStartHereOnboardingSnapshot(
      dismissStartHereOnboarding(snapshot, authSession),
    )
    setSessionScopedSnapshot({
      authSessionId,
      snapshot: nextSnapshot,
    })
  }

  return {
    showStartHere: shouldPresentStartHereOnboarding(snapshot, authSession),
    dismissStartHere,
  }
}
