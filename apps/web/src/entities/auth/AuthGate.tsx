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

type AuthAction = 'login' | 'single-user' | 'bootstrap' | 'google' | null

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
  const [googleSignInReady, setGoogleSignInReady] = useState(false)
  const bootstrapAdminHashTargeted =
    typeof window !== 'undefined' &&
    window.location.hash.replace(/^#/, '').trim() === 'bootstrap-admin'
  const {
    expanded: bootstrapExpanded,
    setExpanded: setBootstrapExpanded,
  } = usePersistentCollapsibleCardState('auth-gate.bootstrap-admin', bootstrapAdminHashTargeted)
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

  return (
    <main className="auth-gate-stage">
      <section className="auth-gate-frame">
        <section className="surface auth-gate-panel">
          <div className="auth-gate-panel-head">
            <span className="brand-mark">E/CTRM</span>
            <div>
              <span className="eyebrow">Sign In</span>
              <h3>Enter the console</h3>
            </div>
            <p>Use your ECTRM credentials to continue. Other methods appear only when enabled.</p>
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
              <p className="auth-gate-primary-note">
                Password access works with either user ID or email and issues the same local session
                token used by the rest of the console.
              </p>
            </div>
          </form>

          {singleUserAuthEnabled || googleAuthEnabled ? (
            <div className="auth-gate-panel-section">
              <span className="auth-gate-section-label">Other available methods</span>
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
                    <p>Fast local entry when the API exposes a one-click operator account.</p>
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
            </div>
          ) : null}

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

          <p className={`form-note ${authFlash?.tone === 'error' ? 'form-note-error' : ''}`}>
            {authFlash?.message ??
              'Sign in to unlock the console. Protected writes will derive actor identity from the active session.'}
          </p>
        </section>
      </section>
    </main>
  )
}
