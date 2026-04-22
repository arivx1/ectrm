import { appConfig } from './config'

const BROWSER_SESSION_STORAGE_KEY = 'ectrm.browser-session-id'
const FINGERPRINT_WINDOW_MS = 60_000

type ClientIssueLevel = 'info' | 'warning' | 'error'

export type ClientIssueReport = {
  source: string
  level?: ClientIssueLevel
  message: string
  error?: unknown
  handled?: boolean
  extra?: Record<string, unknown>
}

const recentUnhandledFingerprints = new Map<string, number>()

function getBrowserSessionId(): string {
  if (typeof window === 'undefined') {
    return 'server'
  }

  const existingSessionId = window.sessionStorage?.getItem(BROWSER_SESSION_STORAGE_KEY)
  if (existingSessionId) {
    return existingSessionId
  }

  const nextSessionId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  window.sessionStorage?.setItem(BROWSER_SESSION_STORAGE_KEY, nextSessionId)
  return nextSessionId
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  if (typeof error === 'string' && error.trim()) {
    return error
  }
  return fallback
}

function errorStack(error: unknown): string | null {
  return error instanceof Error && error.stack ? error.stack : null
}

function fingerprintForIssue(source: string, message: string): string {
  return `${source}:${message}`
}

function shouldReportFingerprint(fingerprint: string, now: number): boolean {
  const previousAt = recentUnhandledFingerprints.get(fingerprint)
  if (previousAt !== undefined && now - previousAt < FINGERPRINT_WINDOW_MS) {
    return false
  }
  recentUnhandledFingerprints.set(fingerprint, now)
  return true
}

export function reportClientIssue(issue: ClientIssueReport): void {
  if (typeof window === 'undefined') {
    return
  }

  const message = issue.message || errorMessage(issue.error, 'Client issue')
  const payload = {
    source: issue.source,
    level: issue.level ?? 'error',
    message,
    stack: errorStack(issue.error),
    handled: issue.handled ?? true,
    url: window.location.href,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    browser_session_id: getBrowserSessionId(),
    extra: issue.extra ?? {},
  }
  const body = JSON.stringify(payload)
  const url = `${appConfig.apiBase}/telemetry/client-errors`

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      if (navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) {
        return
      }
    } catch {
      // Fall through to fetch. Telemetry should never disrupt the app.
    }
  }

  void fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
    keepalive: true,
  }).catch(() => undefined)
}

export function installClientTelemetry(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.addEventListener('unhandledrejection', (event) => {
    const message = errorMessage(event.reason, 'Unhandled promise rejection')
    const source = 'window.unhandledrejection'
    const fingerprint = fingerprintForIssue(source, message)
    if (!shouldReportFingerprint(fingerprint, Date.now())) {
      return
    }
    reportClientIssue({
      source,
      level: 'error',
      message,
      error: event.reason,
      handled: false,
    })
  })

  window.addEventListener('error', (event) => {
    const message = errorMessage(event.error, event.message || 'Unhandled browser error')
    const source = 'window.error'
    const fingerprint = fingerprintForIssue(source, message)
    if (!shouldReportFingerprint(fingerprint, Date.now())) {
      return
    }
    reportClientIssue({
      source,
      level: 'error',
      message,
      error: event.error,
      handled: false,
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    })
  })
}
