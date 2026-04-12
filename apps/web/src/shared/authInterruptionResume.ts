import type { InspectorTab } from './models'

export type AuthInterruptionReason = 'session_expired'

export type AuthInterruptionResumeSnapshot = {
  reason: AuthInterruptionReason
  url: string
  continueLabel: string
  inspectorTab: InspectorTab | null
}

const AUTH_INTERRUPTION_RESUME_STORAGE_KEY = 'ectrm.auth-interruption-resume'

function normalizeInspectorTab(value: unknown): InspectorTab | null {
  switch (value) {
    case 'overview':
    case 'events':
    case 'amend':
    case 'risk':
      return value
    default:
      return null
  }
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue ? trimmedValue : null
}

export function normalizeAuthInterruptionResumeSnapshot(
  value: Partial<AuthInterruptionResumeSnapshot> | null | undefined,
): AuthInterruptionResumeSnapshot | null {
  if (value?.reason !== 'session_expired') {
    return null
  }

  const url = normalizeOptionalText(value.url)
  const continueLabel = normalizeOptionalText(value.continueLabel)
  if (!url || !continueLabel) {
    return null
  }

  return {
    reason: 'session_expired',
    url,
    continueLabel,
    inspectorTab: normalizeInspectorTab(value.inspectorTab),
  }
}

export function getAuthInterruptionResumeSnapshot(): AuthInterruptionResumeSnapshot | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storedValue = window.localStorage.getItem(AUTH_INTERRUPTION_RESUME_STORAGE_KEY)
  if (!storedValue) {
    return null
  }

  try {
    return normalizeAuthInterruptionResumeSnapshot(
      JSON.parse(storedValue) as Partial<AuthInterruptionResumeSnapshot>,
    )
  } catch {
    return null
  }
}

export function saveAuthInterruptionResumeSnapshot(
  snapshot: AuthInterruptionResumeSnapshot,
): AuthInterruptionResumeSnapshot {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      AUTH_INTERRUPTION_RESUME_STORAGE_KEY,
      JSON.stringify(snapshot),
    )
  }

  return snapshot
}

export function clearAuthInterruptionResumeSnapshot(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(AUTH_INTERRUPTION_RESUME_STORAGE_KEY)
}
