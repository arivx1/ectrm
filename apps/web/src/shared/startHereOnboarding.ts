import type { StoredAuthSession } from './mutation'

const START_HERE_ONBOARDING_STORAGE_KEY = 'ectrm.start-here-onboarding'

export type StartHereOnboardingSnapshot = {
  dismissedWhileSignedOut: boolean
  dismissedAuthenticatedSessionId: string | null
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue ? trimmedValue : null
}

export function getDefaultStartHereOnboardingSnapshot(): StartHereOnboardingSnapshot {
  return {
    dismissedWhileSignedOut: false,
    dismissedAuthenticatedSessionId: null,
  }
}

export function normalizeStartHereOnboardingSnapshot(
  value: Partial<StartHereOnboardingSnapshot> | null | undefined,
): StartHereOnboardingSnapshot {
  const defaults = getDefaultStartHereOnboardingSnapshot()

  return {
    dismissedWhileSignedOut:
      typeof value?.dismissedWhileSignedOut === 'boolean'
        ? value.dismissedWhileSignedOut
        : defaults.dismissedWhileSignedOut,
    dismissedAuthenticatedSessionId: normalizeOptionalText(value?.dismissedAuthenticatedSessionId),
  }
}

export function getStartHereOnboardingSnapshot(): StartHereOnboardingSnapshot {
  if (typeof window === 'undefined') {
    return getDefaultStartHereOnboardingSnapshot()
  }

  const storedValue = window.localStorage.getItem(START_HERE_ONBOARDING_STORAGE_KEY)
  if (!storedValue) {
    return getDefaultStartHereOnboardingSnapshot()
  }

  try {
    return normalizeStartHereOnboardingSnapshot(
      JSON.parse(storedValue) as Partial<StartHereOnboardingSnapshot>,
    )
  } catch {
    return getDefaultStartHereOnboardingSnapshot()
  }
}

export function saveStartHereOnboardingSnapshot(
  snapshot: StartHereOnboardingSnapshot,
): StartHereOnboardingSnapshot {
  const normalizedSnapshot = normalizeStartHereOnboardingSnapshot(snapshot)

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      START_HERE_ONBOARDING_STORAGE_KEY,
      JSON.stringify(normalizedSnapshot),
    )
  }

  return normalizedSnapshot
}

export function shouldPresentStartHereOnboarding(
  snapshot: StartHereOnboardingSnapshot,
  authSession: StoredAuthSession | null,
): boolean {
  if (authSession) {
    if (authSession.showStartHere !== true) {
      return false
    }

    return snapshot.dismissedAuthenticatedSessionId !== authSession.sessionId
  }

  return !snapshot.dismissedWhileSignedOut
}

export function dismissStartHereOnboarding(
  snapshot: StartHereOnboardingSnapshot,
  authSession: StoredAuthSession | null,
): StartHereOnboardingSnapshot {
  if (authSession) {
    return {
      ...snapshot,
      dismissedAuthenticatedSessionId: authSession.sessionId,
    }
  }

  return {
    ...snapshot,
    dismissedWhileSignedOut: true,
  }
}
