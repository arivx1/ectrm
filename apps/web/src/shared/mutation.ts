const AUTH_SESSION_STORAGE_KEY = 'ectrm.auth-session'

export type StoredAuthUser = {
  user_id: string
  email: string
  display_name: string
  role: string
}

export type StoredAuthSession = {
  sessionId: string
  accessToken: string
  expiresAt: string
  user: StoredAuthUser
}

export type MutationContext = {
  actorId: string
  accessToken: string
  role: string
}

function readStoredSession(): StoredAuthSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  const rawValue = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)
  if (!rawValue) {
    return null
  }

  try {
    return JSON.parse(rawValue) as StoredAuthSession
  } catch {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
    return null
  }
}

function sessionIsExpired(session: StoredAuthSession): boolean {
  const expiresAt = Date.parse(session.expiresAt)
  return Number.isNaN(expiresAt) || expiresAt <= Date.now()
}

export function getStoredAuthSession(): StoredAuthSession | null {
  const session = readStoredSession()
  if (!session) {
    return null
  }

  if (sessionIsExpired(session)) {
    clearStoredAuthSession()
    return null
  }

  return session
}

export function saveStoredAuthSession(session: StoredAuthSession): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredAuthSession(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
}

export function getMutationContext(): MutationContext {
  const session = getStoredAuthSession()
  if (!session) {
    throw new Error('Sign in before performing protected actions.')
  }

  return {
    actorId: session.user.user_id,
    accessToken: session.accessToken,
    role: session.user.role,
  }
}

export function buildMutationHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(headers)
  merged.set('Authorization', `Bearer ${getMutationContext().accessToken}`)
  return merged
}
