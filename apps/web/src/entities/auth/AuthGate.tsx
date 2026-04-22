import { useEffect, useEffectEvent, useRef, useState } from 'react'

import {
  bootstrapAdminSession,
  createAuthSession,
  createGoogleAuthSession,
  createSingleUserAuthSession,
  type SessionResponse,
} from './api'
import { loadGoogleIdentityScript } from './googleIdentity'
import { loadPublicRuntimeSettings, type PublicRuntimeSettings } from '../app/api'
import { appConfig } from '../../shared/config'
import { type StoredAuthSession } from '../../shared/mutation'

type AuthGateProps = {
  authInterruptionMessage?: string | null
  onSessionChange: (session: StoredAuthSession | null) => Promise<void> | void
  pendingStartHereReturnLabel?: string | null
}

type FlashMessage = {
  tone: 'success' | 'error'
  message: string
}

type AuthAction = 'login' | 'single-user' | 'bootstrap' | 'google' | null

function mapSession(session: SessionResponse): StoredAuthSession {
  return {
    sessionId: session.session_id,
    accessToken: session.access_token,
    expiresAt: session.expires_at,
    user: session.user,
  }
}

export function AuthGate({
  authInterruptionMessage = null,
  onSessionChange,
  pendingStartHereReturnLabel = null,
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
  const [serverSettingsLoading, setServerSettingsLoading] = useState(true)
  const [googleSignInReady, setGoogleSignInReady] = useState(false)
  const [bootstrapExpanded, setBootstrapExpanded] = useState(false)
  const googleSignInContainerRef = useRef<HTMLDivElement | null>(null)

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
          setServerSettingsError(error instanceof Error ? error.message : 'Could not load server settings.')
        }
      } finally {
        if (!cancelled) {
          setServerSettingsLoading(false)
        }
      }
    }

    void loadSettings()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const targetId = window.location.hash.replace(/^#/, '').trim()
    const shouldScrollToTarget = targetId.length > 0
    if (targetId === 'bootstrap-admin') {
      setBootstrapExpanded(true)
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
        message: error instanceof Error ? error.message : 'Could not sign in.',
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
        message: error instanceof Error ? error.message : 'Could not sign in with single-user access.',
      })
    } finally {
      setAuthAction(null)
    }
  }

  const handleGoogleCredential = useEffectEvent(async (idToken: string) => {
    setAuthAction('google')
    setAuthFlash(null)

    try {
      const session = await createGoogleAuthSession(appConfig.apiBase, { id_token: idToken })
      await onSessionChange(mapSession(session))
    } catch (error) {
      setAuthFlash({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not sign in with Google.',
      })
    } finally {
      setAuthAction(null)
    }
  })

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
        message: error instanceof Error ? error.message : 'Could not bootstrap the initial admin account.',
      })
    } finally {
      setAuthAction(null)
    }
  }

  const googleClientId = serverSettings?.google_auth.client_id?.trim() ?? ''
  const authLoading = authAction !== null
  const singleUserAuthEnabled = Boolean(serverSettings?.single_user_auth_enabled)
  const googleAuthEnabled = Boolean(serverSettings?.google_auth.enabled && googleClientId)
  const googleAutoCreateUsers = Boolean(serverSettings?.google_auth.auto_create_users)

  useEffect(() => {
    const container = googleSignInContainerRef.current
    if (!container || !googleAuthEnabled) {
      return
    }
    const signInContainer = container

    let cancelled = false
    signInContainer.innerHTML = ''
    setGoogleSignInReady(false)

    async function initializeGoogleSignIn() {
      try {
        await loadGoogleIdentityScript()
        if (cancelled) {
          return
        }

        const googleIdentityApi = window.google?.accounts?.id
        if (!googleIdentityApi) {
          throw new Error('Google sign-in is unavailable in this browser.')
        }

        googleIdentityApi.initialize({
          client_id: googleClientId,
          callback: (response) => {
            if (cancelled) {
              return
            }
            if (!response.credential) {
              setAuthFlash({
                tone: 'error',
                message: 'Google did not return a sign-in token.',
              })
              return
            }
            void handleGoogleCredential(response.credential)
          },
          cancel_on_tap_outside: true,
        })

        googleIdentityApi.renderButton(signInContainer, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: Math.max(240, Math.min(signInContainer.clientWidth || 320, 360)),
        })
        setGoogleSignInReady(true)
      } catch (error) {
        if (cancelled) {
          return
        }

        setAuthFlash((current) =>
          current ?? {
            tone: 'error',
            message: error instanceof Error ? error.message : 'Could not initialize Google sign-in.',
          },
        )
      }
    }

    void initializeGoogleSignIn()

    return () => {
      cancelled = true
      signInContainer.innerHTML = ''
    }
  }, [googleAuthEnabled, googleClientId])

  const availableMethods = [
    'Password',
    ...(singleUserAuthEnabled ? ['Single-user'] : []),
    ...(googleAuthEnabled ? ['Google'] : []),
  ]
  const sessionTtlLabel = serverSettings ? `${serverSettings.session_ttl_hours}h` : 'Unknown'
  const mutationProtectionLabel = serverSettings?.mutation_protection_enabled ? 'Protected' : 'Open'
  const bootstrapAvailabilityLabel = serverSettings?.bootstrap_admin_enabled ? 'Ready' : 'Closed'

  return (
    <main className="auth-gate-stage">
      <section className="auth-gate-frame">
        <section className="auth-gate-hero">
          <div className="auth-gate-hero-top">
            <div className="auth-gate-brand-row">
              <span className="brand-mark">E/CTRM</span>
              <span className="auth-gate-status">Authentication Required</span>
            </div>

            <div className="auth-gate-title-block">
              <span className="eyebrow">Desk Access Checkpoint</span>
              <h1>Open the operator console with a live session.</h1>
              <p>
                Authenticate once, then continue into trading, operations, settlement, and admin
                workspaces with role-aware access carried across every protected action.
              </p>
            </div>

            <div className="auth-gate-chip-row" aria-label="Protected console areas">
              <span className="auth-gate-chip">Trade capture</span>
              <span className="auth-gate-chip">Risk and positions</span>
              <span className="auth-gate-chip">Workflow queues</span>
              <span className="auth-gate-chip">Admin controls</span>
            </div>
          </div>

          {serverSettingsLoading ? (
            <div className="auth-gate-signal-grid">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : (
            <div className="auth-gate-signal-grid">
              <article className="auth-gate-signal-card">
                <span>Available methods</span>
                <strong>{availableMethods.join(' · ')}</strong>
                <p>The screen adapts to the API configuration instead of advertising unavailable flows.</p>
              </article>
              <article className="auth-gate-signal-card">
                <span>Session TTL</span>
                <strong>{sessionTtlLabel}</strong>
                <p>Successful sign-in stores a local browser session for this configured lifetime.</p>
              </article>
              <article className="auth-gate-signal-card">
                <span>Write protection</span>
                <strong>{mutationProtectionLabel}</strong>
                <p>
                  {serverSettings?.mutation_protection_enabled
                    ? 'Protected mutations require an authenticated actor.'
                    : 'The API currently allows write calls without a token.'}
                </p>
              </article>
              <article className="auth-gate-signal-card">
                <span>Bootstrap admin</span>
                <strong>{bootstrapAvailabilityLabel}</strong>
                <p>
                  {serverSettings?.bootstrap_admin_enabled
                    ? 'First-run OPS_ADMIN setup can be opened from this screen.'
                    : 'Bootstrap is hidden once the initial administrative account already exists.'}
                </p>
              </article>
            </div>
          )}

          <div className="auth-gate-step-rail">
            <article className="auth-gate-step">
              <span className="auth-gate-step-index">1</span>
              <div>
                <strong>Authenticate</strong>
                <p>Use password access first, or fall back to Google or single-user access when enabled.</p>
              </div>
            </article>
            <article className="auth-gate-step">
              <span className="auth-gate-step-index">2</span>
              <div>
                <strong>Hydrate the shell</strong>
                <p>The console restores workspace data, navigation, and your role-scoped controls after sign-in.</p>
              </div>
            </article>
            <article className="auth-gate-step">
              <span className="auth-gate-step-index">3</span>
              <div>
                <strong>Resume work</strong>
                <p>Trade capture, queues, settlement, and admin actions inherit the active actor identity.</p>
              </div>
            </article>
          </div>
        </section>

        <section className="surface auth-gate-panel">
          <div className="auth-gate-panel-head">
            <div>
              <span className="eyebrow">Sign In</span>
              <h3>Enter the console</h3>
            </div>
            <p>Start with password access. Secondary methods appear only when the running API is ready for them.</p>
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

          <form id="session-login" className="auth-gate-entry-form" onSubmit={handleLogin}>
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
              <p className="auth-gate-primary-note">
                Password access works with either user ID or email and issues the same local session token
                used by the rest of the console.
              </p>
            </div>
          </form>

          {singleUserAuthEnabled || googleAuthEnabled ? (
            <div className="auth-gate-method-grid">
              {singleUserAuthEnabled ? (
                <button
                  id="single-user-sign-in"
                  type="button"
                  className="auth-gate-method-card"
                  onClick={() => void handleSingleUserLogin()}
                  disabled={authLoading}
                >
                  <span>Single-user access</span>
                  <strong>{authAction === 'single-user' ? 'Signing In...' : 'Use local OPS_ADMIN session'}</strong>
                  <p>Fast local entry when the API exposes the configured one-click operator account.</p>
                </button>
              ) : null}

              {googleAuthEnabled ? (
                <div className="auth-gate-method-card auth-gate-method-card-google">
                  <span>Google sign-in</span>
                  <strong>Continue with Google</strong>
                  <p>
                    {googleAutoCreateUsers
                      ? 'New Google identities can create a local account automatically with the server default role.'
                      : 'Your Google email must already map to a local account on the API.'}
                  </p>
                  <div ref={googleSignInContainerRef} className="google-sign-in-button auth-gate-google-slot" />
                  <small className="auth-gate-method-note">
                    {authAction === 'google'
                      ? 'Completing Google sign-in...'
                      : googleSignInReady
                        ? 'Google returns an identity token in the browser, then the API exchanges it for the same session token used by password access.'
                        : 'Loading Google sign-in...'}
                  </small>
                </div>
              ) : null}
            </div>
          ) : null}

          {serverSettings?.bootstrap_admin_enabled ? (
            <section id="bootstrap-admin" className={`auth-gate-bootstrap ${bootstrapExpanded ? 'is-open' : ''}`}>
              <button
                type="button"
                className="auth-gate-bootstrap-toggle"
                onClick={() => setBootstrapExpanded((current) => !current)}
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

          <p className={`form-note ${authFlash?.tone === 'error' ? 'form-note-error' : ''}`}>
            {authFlash?.message ??
              'Sign in to unlock the console. Protected writes will derive actor identity from the active session.'}
          </p>
        </section>
      </section>
    </main>
  )
}
