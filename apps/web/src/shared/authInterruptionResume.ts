import type { InspectorTab } from './models'

export type AuthInterruptionReason = 'session_expired'

export type AuthInterruptionResumeSnapshot = {
  reason: AuthInterruptionReason
  url: string
  continueLabel: string
  inspectorTab: InspectorTab | null
}

const AUTH_INTERRUPTION_RESUME_STORAGE_KEY = 'ectrm.auth-interruption-resume'
const AUTH_INTERRUPTION_RESUME_STORAGE_EVENT = 'ectrm:auth-interruption-resume'

let cachedAuthInterruptionResumeSnapshotRaw: string | null | undefined
let cachedAuthInterruptionResumeSnapshot: AuthInterruptionResumeSnapshot | null = null

function emitAuthInterruptionResumeStorageChange(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return
  }

  window.dispatchEvent(new Event(AUTH_INTERRUPTION_RESUME_STORAGE_EVENT))
}

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
  if (storedValue === cachedAuthInterruptionResumeSnapshotRaw) {
    return cachedAuthInterruptionResumeSnapshot
  }

  cachedAuthInterruptionResumeSnapshotRaw = storedValue
  if (!storedValue) {
    cachedAuthInterruptionResumeSnapshot = null
    return null
  }

  try {
    cachedAuthInterruptionResumeSnapshot = normalizeAuthInterruptionResumeSnapshot(
      JSON.parse(storedValue) as Partial<AuthInterruptionResumeSnapshot>,
    )
    return cachedAuthInterruptionResumeSnapshot
  } catch {
    cachedAuthInterruptionResumeSnapshot = null
    return null
  }
}

export function saveAuthInterruptionResumeSnapshot(
  snapshot: AuthInterruptionResumeSnapshot,
): AuthInterruptionResumeSnapshot {
  if (typeof window !== 'undefined') {
    const serializedSnapshot = JSON.stringify(snapshot)
    cachedAuthInterruptionResumeSnapshotRaw = serializedSnapshot
    cachedAuthInterruptionResumeSnapshot = snapshot
    window.localStorage.setItem(AUTH_INTERRUPTION_RESUME_STORAGE_KEY, serializedSnapshot)
    emitAuthInterruptionResumeStorageChange()
  }

  return snapshot
}

export function clearAuthInterruptionResumeSnapshot(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(AUTH_INTERRUPTION_RESUME_STORAGE_KEY)
  cachedAuthInterruptionResumeSnapshotRaw = null
  cachedAuthInterruptionResumeSnapshot = null
  emitAuthInterruptionResumeStorageChange()
}

export function subscribeAuthInterruptionResumeSnapshot(
  onStoreChange: () => void,
): () => void {
  if (
    typeof window === 'undefined' ||
    typeof window.addEventListener !== 'function' ||
    typeof window.removeEventListener !== 'function'
  ) {
    return () => {}
  }

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === null || event.key === AUTH_INTERRUPTION_RESUME_STORAGE_KEY) {
      onStoreChange()
    }
  }
  const handleLocalStorageChange = () => {
    onStoreChange()
  }

  window.addEventListener('storage', handleStorageChange)
  window.addEventListener(
    AUTH_INTERRUPTION_RESUME_STORAGE_EVENT,
    handleLocalStorageChange,
  )

  return () => {
    window.removeEventListener('storage', handleStorageChange)
    window.removeEventListener(
      AUTH_INTERRUPTION_RESUME_STORAGE_EVENT,
      handleLocalStorageChange,
    )
  }
}
