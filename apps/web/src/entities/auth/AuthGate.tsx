import { useCallback, useEffect, useRef, useState } from 'react'

import authGateCornLogoUrl from '../../assets/auth-gate-logo-corn.png'
import authGateLogoUrl from '../../assets/auth-gate-logo.png'
import authGateRocksLogoUrl from '../../assets/auth-gate-logo-rocks.png'
import authGateTransmissionLogoUrl from '../../assets/auth-gate-logo-transmission.png'
import {
  bootstrapAdminSession,
  createAuthSession,
  createSingleUserAuthSession,
  type SessionResponse,
} from './api'
import { formatAuthErrorMessage } from './errorMessage'
import { loadPublicRuntimeSettings, type PublicRuntimeSettings } from '../app/api'
import {
  saveCollapsibleCardStateValue,
  usePersistentCollapsibleCardState,
} from '../../shared/collapsibleCardState'
import { appConfig } from '../../shared/config'
import { type StoredAuthSession } from '../../shared/mutation'

type AuthGateProps = {
  authInterruptionMessage?: string | null
  onSessionChange: (session: StoredAuthSession | null) => Promise<void> | void
  pendingStartHereReturnLabel?: string | null
  pendingPromptResumeLabel?: string | null
  pendingPromptResumeWillSubmit?: boolean
}

type FlashMessage = {
  tone: 'success' | 'error'
  message: string
}

type AuthAction = 'login' | 'single-user' | 'bootstrap' | null
type AuthGateTimeOfDay = 'sunrise' | 'daytime' | 'sunset' | 'night'

const AUTH_GATE_BACKGROUND_REFRESH_MS = 60 * 1000
const AUTH_GATE_BACKGROUND_TRANSITION_MS = 1200
const AUTH_GATE_BACKGROUND_SEQUENCE: AuthGateTimeOfDay[] = ['sunrise', 'daytime', 'sunset', 'night']
const AUTH_GATE_LOGO_FLIP_INTERVAL_MS = 5 * 1000
const AUTH_GATE_LOGO_FLIP_DURATION_MS = 760
const AUTH_GATE_LOGO_QUEUE = [
  authGateLogoUrl,
  authGateCornLogoUrl,
  authGateTransmissionLogoUrl,
  authGateRocksLogoUrl,
]

function getAuthGateTimeOfDay(date = new Date()): AuthGateTimeOfDay {
  const hour = date.getHours()

  if (hour >= 5 && hour < 9) {
    return 'sunrise'
  }
  if (hour >= 9 && hour < 17) {
    return 'daytime'
  }
  if (hour >= 17 && hour < 20) {
    return 'sunset'
  }
  return 'night'
}

function getNextAuthGateTimeOfDay(timeOfDay: AuthGateTimeOfDay): AuthGateTimeOfDay {
  const currentIndex = AUTH_GATE_BACKGROUND_SEQUENCE.indexOf(timeOfDay)
  const nextIndex = (currentIndex + 1) % AUTH_GATE_BACKGROUND_SEQUENCE.length
  return AUTH_GATE_BACKGROUND_SEQUENCE[nextIndex]
}

function mapSession(session: SessionResponse): StoredAuthSession {
  return {
    sessionId: session.session_id,
    accessToken: session.access_token,
    expiresAt: session.expires_at,
    showStartHere: session.show_start_here,
    user: session.user,
  }
}

export function AuthGate({
  authInterruptionMessage = null,
  onSessionChange,
  pendingStartHereReturnLabel = null,
  pendingPromptResumeLabel = null,
  pendingPromptResumeWillSubmit = false,
}: AuthGateProps) {
  const [loginForm, setLoginForm] = useState({ identifier: '', password: '' })
  const [bootstrapForm, setBootstrapForm] = useState({
    bootstrap_token: '',
    user_id: '',
    email: '',
    display_name: '',
    password: '',
  })
  const [authFlash, setAuthFlash] = useState<FlashMessage | null>(null)
  const [authAction, setAuthAction] = useState<AuthAction>(null)
  const [serverSettings, setServerSettings] = useState<PublicRuntimeSettings | null>(null)
  const [serverSettingsError, setServerSettingsError] = useState('')
  const [timeOfDay, setTimeOfDay] = useState<AuthGateTimeOfDay>(() => getAuthGateTimeOfDay())
  const [previousTimeOfDay, setPreviousTimeOfDay] = useState<AuthGateTimeOfDay | null>(null)
  const [backgroundCycleActive, setBackgroundCycleActive] = useState(false)
  const [currentLogoIndex, setCurrentLogoIndex] = useState(0)
  const [logoFlipActive, setLogoFlipActive] = useState(false)
  const authPanelRef = useRef<HTMLElement | null>(null)
  const backgroundTransitionTimeoutRef = useRef<number | null>(null)
  const logoFlipTimeoutRef = useRef<number | null>(null)
  const bootstrapAdminHashTargeted =
    typeof window !== 'undefined' &&
    window.location.hash.replace(/^#/, '').trim() === 'bootstrap-admin'
  const {
    expanded: bootstrapExpanded,
    setExpanded: setBootstrapExpanded,
  } = usePersistentCollapsibleCardState('auth-gate.bootstrap-admin', bootstrapAdminHashTargeted)
  const startLogoFlip = useCallback(() => {
    if (logoFlipTimeoutRef.current !== null) {
      return
    }

    setLogoFlipActive(true)
    logoFlipTimeoutRef.current = window.setTimeout(() => {
      setCurrentLogoIndex((current) => (current + 1) % AUTH_GATE_LOGO_QUEUE.length)
      setLogoFlipActive(false)
      logoFlipTimeoutRef.current = null
    }, AUTH_GATE_LOGO_FLIP_DURATION_MS)
  }, [])
  const transitionBackground = useCallback((nextTimeOfDay: AuthGateTimeOfDay) => {
    if (nextTimeOfDay === timeOfDay) {
      return
    }

    setPreviousTimeOfDay(timeOfDay)
    setTimeOfDay(nextTimeOfDay)

    if (backgroundTransitionTimeoutRef.current !== null) {
      window.clearTimeout(backgroundTransitionTimeoutRef.current)
    }
    backgroundTransitionTimeoutRef.current = window.setTimeout(() => {
      setPreviousTimeOfDay(null)
      backgroundTransitionTimeoutRef.current = null
    }, AUTH_GATE_BACKGROUND_TRANSITION_MS)
  }, [timeOfDay])

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      try {
        const payload = await loadPublicRuntimeSettings(appConfig.apiBase)
        if (!cancelled) {
          setServerSettings(payload)
          setServerSettingsError('')
        }
      } catch (error) {
        if (!cancelled) {
          setServerSettings(null)
          setServerSettingsError(formatAuthErrorMessage(error, 'Could not load server settings.'))
        }
      }
    }

    void loadSettings()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (!backgroundCycleActive) {
        transitionBackground(getAuthGateTimeOfDay())
      }
    }, AUTH_GATE_BACKGROUND_REFRESH_MS)

    return () => window.clearInterval(intervalId)
  }, [backgroundCycleActive, transitionBackground])

  useEffect(() => {
    return () => {
      if (backgroundTransitionTimeoutRef.current !== null) {
        window.clearTimeout(backgroundTransitionTimeoutRef.current)
        backgroundTransitionTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(startLogoFlip, AUTH_GATE_LOGO_FLIP_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
      if (logoFlipTimeoutRef.current !== null) {
        window.clearTimeout(logoFlipTimeoutRef.current)
        logoFlipTimeoutRef.current = null
      }
    }
  }, [startLogoFlip])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const targetId = window.location.hash.replace(/^#/, '').trim()
    const shouldScrollToTarget = targetId.length > 0
    if (targetId === 'bootstrap-admin') {
      saveCollapsibleCardStateValue('auth-gate.bootstrap-admin', true)
    }

    const frameId = window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId || 'session-login')
      if (!target) {
        return
      }

      if (shouldScrollToTarget) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      if (target.matches('input, button, textarea, select')) {
        target.focus(shouldScrollToTarget ? undefined : { preventScroll: true })
        return
      }

      const firstControl = target.querySelector<HTMLElement>('input, button, textarea, select')
      firstControl?.focus(shouldScrollToTarget ? undefined : { preventScroll: true })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [])

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault()
    setAuthAction('login')
    setAuthFlash(null)

    try {
      const session = await createAuthSession(appConfig.apiBase, loginForm)
      await onSessionChange(mapSession(session))
      setLoginForm({ identifier: loginForm.identifier.trim(), password: '' })
    } catch (error) {
      setAuthFlash({
        tone: 'error',
        message: formatAuthErrorMessage(error, 'Could not sign in.'),
      })
    } finally {
      setAuthAction(null)
    }
  }

  async function handleSingleUserLogin() {
    setAuthAction('single-user')
    setAuthFlash(null)

    try {
      const session = await createSingleUserAuthSession(appConfig.apiBase)
      await onSessionChange(mapSession(session))
    } catch (error) {
      setAuthFlash({
        tone: 'error',
        message: formatAuthErrorMessage(error, 'Could not sign in with single-user access.'),
      })
    } finally {
      setAuthAction(null)
    }
  }

  async function handleBootstrapAdmin(event: React.FormEvent) {
    event.preventDefault()
    setAuthAction('bootstrap')
    setAuthFlash(null)

    try {
      const session = await bootstrapAdminSession(appConfig.apiBase, bootstrapForm)
      await onSessionChange(mapSession(session))
      setBootstrapForm((current) => ({
        ...current,
        bootstrap_token: '',
        password: '',
      }))
    } catch (error) {
      setAuthFlash({
        tone: 'error',
        message: formatAuthErrorMessage(error, 'Could not bootstrap the initial admin account.'),
      })
    } finally {
      setAuthAction(null)
    }
  }

  const authLoading = authAction !== null
  const singleUserAuthEnabled = Boolean(serverSettings?.single_user_auth_enabled)
  async function handleSingleSignOn() {
    if (singleUserAuthEnabled) {
      await handleSingleUserLogin()
      return
    }

    setAuthFlash({
      tone: 'error',
      message: 'Single Sign On is not enabled for this server.',
    })
  }

  function advanceBackground() {
    setBackgroundCycleActive(true)
    transitionBackground(getNextAuthGateTimeOfDay(timeOfDay))
  }

  function handleStageClick(event: React.MouseEvent<HTMLElement>) {
    const target = event.target
    if (target instanceof Node && authPanelRef.current?.contains(target)) {
      return
    }

    advanceBackground()
  }

  const nextLogoIndex = (currentLogoIndex + 1) % AUTH_GATE_LOGO_QUEUE.length

  return (
    <main className={`auth-gate-stage auth-gate-stage-${timeOfDay}`} onClick={handleStageClick}>
      <div className="auth-gate-background-stack" aria-hidden="true">
        {previousTimeOfDay ? (
          <div
            key={`previous-${previousTimeOfDay}`}
            className={`auth-gate-background-layer auth-gate-background-layer-previous auth-gate-stage-${previousTimeOfDay}`}
          />
        ) : null}
        <div
          key={`current-${timeOfDay}`}
          className={`auth-gate-background-layer auth-gate-background-layer-current auth-gate-stage-${timeOfDay}`}
        />
      </div>
      <section className="auth-gate-frame">
        <header className="auth-gate-wordmark" aria-label="Strata">
          <span className="brand-mark">Strata</span>
        </header>

        <section ref={authPanelRef} className="surface auth-gate-panel">
          <div className="auth-gate-panel-head">
            <div className="auth-gate-orb" aria-hidden="true" onPointerEnter={startLogoFlip}>
              <div className={`auth-gate-logo-flip${logoFlipActive ? ' is-flipping' : ''}`}>
                <img
                  className="auth-gate-orb-logo auth-gate-logo-face"
                  src={AUTH_GATE_LOGO_QUEUE[currentLogoIndex]}
                  alt=""
                />
                <img
                  className="auth-gate-orb-logo auth-gate-logo-face auth-gate-logo-face-back"
                  src={AUTH_GATE_LOGO_QUEUE[nextLogoIndex]}
                  alt=""
                />
              </div>
            </div>
          </div>

          {serverSettingsError ? <div className="feedback-banner feedback-banner-error">{serverSettingsError}</div> : null}
          {authInterruptionMessage ? (
            <div className="feedback-banner feedback-banner-error">
              {authInterruptionMessage}
            </div>
          ) : null}
          {pendingStartHereReturnLabel ? (
            <div className="feedback-banner feedback-banner-success">
              {`After sign-in, opening ${pendingStartHereReturnLabel}. We'll take you straight there after authentication succeeds.`}
            </div>
          ) : null}
          {pendingPromptResumeLabel ? (
            <div className="feedback-banner feedback-banner-success">
              {pendingPromptResumeWillSubmit
                ? `After sign-in, sending ${pendingPromptResumeLabel}. Protected context stays private until authentication succeeds.`
                : `After sign-in, reopening Home with ${pendingPromptResumeLabel}. Protected context stays private until authentication succeeds.`}
            </div>
          ) : null}

          <form id="session-login" className="auth-gate-entry-form" onSubmit={handleLogin}>
            <span className="auth-gate-section-label">Password access</span>
            <div className="auth-gate-entry-grid">
              <label className="field">
                <span>User ID or Email</span>
                <input
                  className="control auth-gate-control"
                  value={loginForm.identifier}
                  onChange={(event) => {
                    setAuthFlash(null)
                    setLoginForm((current) => ({ ...current, identifier: event.target.value }))
                  }}
                  placeholder="ops_admin"
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  className="control auth-gate-control"
                  type="password"
                  value={loginForm.password}
                  onChange={(event) => {
                    setAuthFlash(null)
                    setLoginForm((current) => ({ ...current, password: event.target.value }))
                  }}
                  placeholder="Enter password"
                />
              </label>
            </div>
            <div className="auth-gate-primary-actions">
              <button type="submit" className="button button-primary" disabled={authLoading}>
                {authAction === 'login' ? 'Signing In...' : 'Enter Console'}
              </button>
            </div>
          </form>

          <div className="auth-gate-primary-actions">
            <button
              id="single-user-sign-in"
              type="button"
              className="button button-primary auth-gate-sso-button"
              onClick={() => void handleSingleSignOn()}
              disabled={authLoading}
            >
              <span className="auth-gate-keyhole" aria-hidden="true" />
              <span>Single Sign On</span>
            </button>
          </div>

          {serverSettings?.bootstrap_admin_enabled ? (
            <section id="bootstrap-admin" className={`auth-gate-bootstrap ${bootstrapExpanded ? 'is-open' : ''}`}>
              <button
                type="button"
                className="auth-gate-bootstrap-toggle"
                onClick={() => setBootstrapExpanded(!bootstrapExpanded)}
                aria-expanded={bootstrapExpanded}
                aria-controls="auth-gate-bootstrap-form"
              >
                <div className="auth-gate-bootstrap-copy">
                  <span>First-run setup</span>
                  <strong>Bootstrap the initial admin account</strong>
                  <p>Only available until the first user record exists on the API.</p>
                </div>
                <span className="auth-gate-bootstrap-indicator">
                  {bootstrapExpanded ? 'Hide' : 'Open'}
                </span>
              </button>

              {bootstrapExpanded ? (
                <form
                  id="auth-gate-bootstrap-form"
                  className="auth-gate-bootstrap-form"
                  onSubmit={handleBootstrapAdmin}
                >
                  <div className="mini-grid">
                    <label className="field">
                      <span>Bootstrap Token</span>
                      <input
                        className="control"
                        type="password"
                        value={bootstrapForm.bootstrap_token}
                        onChange={(event) => {
                          setAuthFlash(null)
                          setBootstrapForm((current) => ({ ...current, bootstrap_token: event.target.value }))
                        }}
                        placeholder="Server-provided token"
                      />
                    </label>
                    <label className="field">
                      <span>User ID</span>
                      <input
                        className="control"
                        value={bootstrapForm.user_id}
                        onChange={(event) => {
                          setAuthFlash(null)
                          setBootstrapForm((current) => ({ ...current, user_id: event.target.value }))
                        }}
                        placeholder="ops_admin"
                      />
                    </label>
                    <label className="field">
                      <span>Email</span>
                      <input
                        className="control"
                        type="email"
                        value={bootstrapForm.email}
                        onChange={(event) => {
                          setAuthFlash(null)
                          setBootstrapForm((current) => ({ ...current, email: event.target.value }))
                        }}
                        placeholder="ops@example.com"
                      />
                    </label>
                    <label className="field">
                      <span>Display Name</span>
                      <input
                        className="control"
                        value={bootstrapForm.display_name}
                        onChange={(event) => {
                          setAuthFlash(null)
                          setBootstrapForm((current) => ({ ...current, display_name: event.target.value }))
                        }}
                        placeholder="Ops Admin"
                      />
                    </label>
                    <label className="field">
                      <span>Password</span>
                      <input
                        className="control"
                        type="password"
                        value={bootstrapForm.password}
                        onChange={(event) => {
                          setAuthFlash(null)
                          setBootstrapForm((current) => ({ ...current, password: event.target.value }))
                        }}
                        placeholder="Minimum 8 characters"
                      />
                    </label>
                  </div>

                  <div className="auth-gate-bootstrap-actions">
                    <button type="submit" className="button button-primary" disabled={authLoading}>
                      {authAction === 'bootstrap' ? 'Creating Admin...' : 'Create Initial Admin'}
                    </button>
                  </div>
                </form>
              ) : null}
            </section>
          ) : null}

          {authFlash ? (
            <p className={`form-note ${authFlash.tone === 'error' ? 'form-note-error' : ''}`}>{authFlash.message}</p>
          ) : null}
        </section>
      </section>

    </main>
  )
}
