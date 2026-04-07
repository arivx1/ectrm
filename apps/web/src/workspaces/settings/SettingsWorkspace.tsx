import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from 'react'

import {
  bootstrapAdminSession,
  createAuthSession,
  createGoogleAuthSession,
  createSingleUserAuthSession,
  logoutCurrentSession,
  type SessionResponse,
} from '../../entities/auth/api'
import { loadGoogleIdentityScript } from '../../entities/auth/googleIdentity'
import { loadPublicRuntimeSettings, type PublicRuntimeSettings } from '../../entities/app/api'
import {
  resolveAppearancePalette,
  type AppearancePalette,
  type AppearanceSettings,
  type ColorModePreference,
  type ResolvedColorMode,
} from '../../shared/appearance'
import {
  appConfig,
  bootstrapQueryLimits,
  clearClientRuntimeOverrides,
  getClientRuntimeOverrideSnapshot,
  saveClientRuntimeOverrideSnapshot,
  type ClientRuntimeOverrideSnapshot,
} from '../../shared/config'
import { type StoredAuthSession } from '../../shared/mutation'

type SettingsWorkspaceProps = {
  health: string
  authSession: StoredAuthSession | null
  appearanceSettings: AppearanceSettings
  resolvedColorMode: ResolvedColorMode
  onAppearanceSettingsChange: (settings: AppearanceSettings) => AppearanceSettings
  onAppearanceSettingsReset: () => AppearanceSettings
  onSessionChange: (session: StoredAuthSession | null) => Promise<void> | void
}

type FlashMessage = {
  tone: 'success' | 'error'
  message: string
}

type AuthAction = 'login' | 'single-user' | 'bootstrap' | 'logout' | 'google' | null

const COLOR_MODE_OPTIONS: Array<{
  value: ColorModePreference
  label: string
  detail: string
}> = [
  {
    value: 'system',
    label: 'System',
    detail: 'Follow the operating system preference.',
  },
  {
    value: 'light',
    label: 'Light',
    detail: 'Always use the brighter desk treatment.',
  },
  {
    value: 'dark',
    label: 'Dark',
    detail: 'Keep the terminal-style night treatment active.',
  },
]

function mapSession(session: SessionResponse): StoredAuthSession {
  return {
    sessionId: session.session_id,
    accessToken: session.access_token,
    expiresAt: session.expires_at,
    user: session.user,
  }
}

function SettingsValueRow({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="settings-kv-row">
      <div>
        <span>{label}</span>
        {detail ? <small>{detail}</small> : null}
      </div>
      <strong>{value}</strong>
    </div>
  )
}

function formatModeLabel(value: ColorModePreference | ResolvedColorMode): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function previewStyle(palette: AppearancePalette): CSSProperties {
  return {
    '--appearance-accent': palette.accent,
    '--appearance-highlight': palette.highlight,
  } as CSSProperties
}

function normalizePositiveInteger(value: string, label: string): string {
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return ''
  }

  const parsedValue = Number.parseInt(trimmedValue, 10)
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error(`${label} must be a positive whole number.`)
  }

  return String(parsedValue)
}

function formatBytes(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--'
  }

  if (value < 1024) {
    return `${value} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let normalized = value / 1024
  let unitIndex = 0

  while (normalized >= 1024 && unitIndex < units.length - 1) {
    normalized /= 1024
    unitIndex += 1
  }

  return `${normalized.toFixed(normalized >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDatabaseType(value: string | null | undefined): string {
  if (!value) {
    return '--'
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'postgresql') {
    return 'PostgreSQL'
  }
  if (normalized === 'sqlite') {
    return 'SQLite'
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function SettingsWorkspace({
  health,
  authSession,
  appearanceSettings,
  resolvedColorMode,
  onAppearanceSettingsChange,
  onAppearanceSettingsReset,
  onSessionChange,
}: SettingsWorkspaceProps) {
  const [loginForm, setLoginForm] = useState({ identifier: '', password: '' })
  const [bootstrapForm, setBootstrapForm] = useState({
    bootstrap_token: '',
    user_id: '',
    email: '',
    display_name: '',
    password: '',
  })
  const [runtimeOverrideForm, setRuntimeOverrideForm] = useState<ClientRuntimeOverrideSnapshot>(() =>
    getClientRuntimeOverrideSnapshot(),
  )
  const [appearanceForm, setAppearanceForm] = useState<AppearanceSettings>(() => appearanceSettings)
  const [authFlash, setAuthFlash] = useState<FlashMessage | null>(null)
  const [authAction, setAuthAction] = useState<AuthAction>(null)
  const [runtimeFlash, setRuntimeFlash] = useState<FlashMessage | null>(null)
  const [appearanceFlash, setAppearanceFlash] = useState<FlashMessage | null>(null)
  const [serverSettings, setServerSettings] = useState<PublicRuntimeSettings | null>(null)
  const [serverSettingsError, setServerSettingsError] = useState('')
  const [serverSettingsLoading, setServerSettingsLoading] = useState(true)
  const [googleSignInReady, setGoogleSignInReady] = useState(false)
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

    loadSettings()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setAppearanceForm(appearanceSettings)
  }, [appearanceSettings])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const targetId = window.location.hash.replace(/^#/, '').trim()
    if (!targetId) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId)
      if (!target) {
        return
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      if (target.matches('input, button, textarea, select')) {
        target.focus()
        return
      }

      const firstControl = target.querySelector<HTMLElement>('input, button, textarea, select')
      firstControl?.focus()
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
      setAuthFlash({
        tone: 'success',
        message: `Signed in as ${session.user.display_name}. Protected writes now derive actor identity from the active session.`,
      })
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
      setAuthFlash({
        tone: 'success',
        message: `Signed in as ${session.user.display_name} through single-user access.`,
      })
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
      setAuthFlash({
        tone: 'success',
        message: `Signed in as ${session.user.display_name} through Google.`,
      })
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
      setAuthFlash({
        tone: 'success',
        message: `Bootstrap complete. Signed in as ${session.user.display_name}.`,
      })
    } catch (error) {
      setAuthFlash({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not bootstrap the initial admin account.',
      })
    } finally {
      setAuthAction(null)
    }
  }

  async function handleLogout() {
    setAuthAction('logout')
    setAuthFlash(null)

    try {
      if (authSession) {
        await logoutCurrentSession(appConfig.apiBase)
      }
    } catch {
      // Clear the browser session even if the server-side session is already gone.
    } finally {
      try {
        await onSessionChange(null)
        setAuthFlash({
          tone: 'success',
          message: 'Signed out and cleared the stored session from this browser.',
        })
      } catch (error) {
        setAuthFlash({
          tone: 'error',
          message: error instanceof Error ? error.message : 'Signed out locally, but the workspace could not be refreshed.',
        })
      } finally {
        setAuthAction(null)
      }
    }
  }

  function handleSaveRuntimeOverrides(event: React.FormEvent) {
    event.preventDefault()

    try {
      const nextOverrides: ClientRuntimeOverrideSnapshot = {
        apiBaseOverride: runtimeOverrideForm.apiBaseOverride.trim(),
        eventsLimitOverride: normalizePositiveInteger(runtimeOverrideForm.eventsLimitOverride, 'Events limit'),
        selectedTradeEventsLimitOverride: normalizePositiveInteger(
          runtimeOverrideForm.selectedTradeEventsLimitOverride,
          'Selected trade events limit',
        ),
        referenceDataLimitOverride: normalizePositiveInteger(
          runtimeOverrideForm.referenceDataLimitOverride,
          'Reference data limit',
        ),
        externalDataRunsLimitOverride: normalizePositiveInteger(
          runtimeOverrideForm.externalDataRunsLimitOverride,
          'External-data runs limit',
        ),
        tradingSourcesLimitOverride: normalizePositiveInteger(
          runtimeOverrideForm.tradingSourcesLimitOverride,
          'Trading-sources limit',
        ),
      }

      saveClientRuntimeOverrideSnapshot(nextOverrides)
      setRuntimeFlash({
        tone: 'success',
        message: 'Client runtime overrides saved. Reloading to apply them.',
      })
      window.location.reload()
    } catch (error) {
      setRuntimeFlash({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not save runtime overrides.',
      })
    }
  }

  function handleResetRuntimeOverrides() {
    clearClientRuntimeOverrides()
    setRuntimeOverrideForm({
      apiBaseOverride: '',
      eventsLimitOverride: '',
      selectedTradeEventsLimitOverride: '',
      referenceDataLimitOverride: '',
      externalDataRunsLimitOverride: '',
      tradingSourcesLimitOverride: '',
    })
    setRuntimeFlash({
      tone: 'success',
      message: 'Client runtime overrides cleared. Reloading to return to checked-in defaults.',
    })
    window.location.reload()
  }

  function handleSaveAppearance(event: React.FormEvent) {
    event.preventDefault()
    const savedSettings = onAppearanceSettingsChange(appearanceForm)
    setAppearanceForm(savedSettings)
    setAppearanceFlash({
      tone: 'success',
      message: 'Appearance saved locally for this browser. A profile-backed API can replace this storage later without changing the UI.',
    })
  }

  function handleResetAppearance() {
    const defaultSettings = onAppearanceSettingsReset()
    setAppearanceForm(defaultSettings)
    setAppearanceFlash({
      tone: 'success',
      message: 'Appearance reset to the default console palette for this browser.',
    })
  }

  const googleClientId = serverSettings?.google_auth.client_id?.trim() ?? ''
  const healthTone = health === 'ok' ? 'active' : 'cancelled'
  const authTone = authSession ? 'active' : 'cancelled'
  const authLoading = authAction !== null
  const runtimeOverrideCount = Object.values(runtimeOverrideForm).filter((value) => value.trim() !== '').length
  const activePalette = resolveAppearancePalette(appearanceSettings, resolvedColorMode)
  const singleUserAuthEnabled = Boolean(serverSettings?.single_user_auth_enabled)
  const googleAuthEnabled = Boolean(serverSettings?.google_auth.enabled && googleClientId)
  const googleAutoCreateUsers = Boolean(serverSettings?.google_auth.auto_create_users)

  useEffect(() => {
    const container = googleSignInContainerRef.current
    if (!container) {
      return
    }
    const containerElement: HTMLDivElement = container

    if (authSession || !googleAuthEnabled) {
      containerElement.innerHTML = ''
      setGoogleSignInReady(false)
      return
    }

    let cancelled = false
    containerElement.innerHTML = ''
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

        googleIdentityApi.renderButton(containerElement, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: Math.max(240, Math.min(containerElement.clientWidth || 320, 360)),
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
      container.innerHTML = ''
    }
  }, [authSession, googleAuthEnabled, googleClientId])

  return (
    <div className="workspace-grid settings-grid">
      <section className="stack">
        <article className="surface">
          <div className="section-head">
            <div>
              <span className="eyebrow">Browser Settings</span>
              <h3>Write Access</h3>
            </div>
            <p>The browser stores only the active session token locally. Protected writes derive actor identity from the signed-in session.</p>
          </div>

          <div className="settings-summary-grid">
            <article className="settings-summary-card">
              <span>Session status</span>
              <strong>{authSession ? 'Active' : 'Signed out'}</strong>
              <div className={`status-pill status-pill-${authTone}`}>{authSession ? 'Authenticated' : 'Needs sign-in'}</div>
            </article>
            <article className="settings-summary-card">
              <span>Access level</span>
              <strong>{authSession?.user.role ?? 'Not authenticated'}</strong>
              <p>{authSession ? `Signed in as ${authSession.user.user_id}.` : 'Admin tools remain unavailable until an admin session is active.'}</p>
            </article>
          </div>

          {authSession ? (
            <div className="stack-form settings-form">
              <div className="settings-kv">
                <SettingsValueRow label="User ID" value={authSession.user.user_id} />
                <SettingsValueRow label="Display name" value={authSession.user.display_name} />
                <SettingsValueRow label="Email" value={authSession.user.email} />
                <SettingsValueRow label="Role" value={authSession.user.role} />
                <SettingsValueRow label="Session expires" value={new Date(authSession.expiresAt).toLocaleString()} />
                <SettingsValueRow
                  label="Configured TTL"
                  value={serverSettings ? `${serverSettings.session_ttl_hours}h` : 'Unknown'}
                  detail="Read from the public runtime settings endpoint."
                />
              </div>

              <div className="toolbar settings-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleLogout}
                  disabled={authLoading}
                >
                  {authAction === 'logout' ? 'Signing Out...' : 'Sign Out'}
                </button>
              </div>

              <p className={`form-note ${authFlash?.tone === 'error' ? 'form-note-error' : ''}`}>
                {authFlash?.message ?? 'Protected writes will use this session until it expires or you sign out.'}
              </p>
            </div>
          ) : (
            <div className="stack-form settings-form">
              <form id="session-login" className="stack-form" onSubmit={handleLogin}>
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Sign In</span>
                    <h3>Session Login</h3>
                  </div>
                  <p>
                    Use a user ID or email plus password. Google sign-in appears below when the server is
                    configured for it, and the local OPS_ADMIN shortcut remains available for development.
                  </p>
                </div>

                <div className="mini-grid">
                  <label className="field">
                    <span>User ID or Email</span>
                    <input
                      className="control"
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
                      className="control"
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

                <div className="toolbar settings-actions">
                  <button type="submit" className="button button-primary" disabled={authLoading}>
                    {authAction === 'login' ? 'Signing In...' : 'Sign In'}
                  </button>
                  {singleUserAuthEnabled ? (
                    <button
                      id="single-user-sign-in"
                      type="button"
                      className="button button-secondary"
                      onClick={() => void handleSingleUserLogin()}
                      disabled={authLoading}
                    >
                      {authAction === 'single-user' ? 'Signing In...' : 'Single-User Sign In'}
                    </button>
                  ) : null}
                </div>
              </form>

              {googleAuthEnabled ? (
                <div className="stack-form">
                  <div className="section-head">
                    <div>
                      <span className="eyebrow">Federated Sign-In</span>
                      <h3>Google Login</h3>
                    </div>
                    <p>
                      Continue with Google using the configured client ID.
                      {googleAutoCreateUsers
                        ? ' New Google identities can create a local account automatically with the server default role.'
                        : ' Your Google email must already map to a local user account.'}
                    </p>
                  </div>

                  <div className="toolbar settings-actions">
                    <div ref={googleSignInContainerRef} className="google-sign-in-button" />
                  </div>

                  <p className="form-note">
                    {authAction === 'google'
                      ? 'Completing Google sign-in...'
                      : googleSignInReady
                        ? 'Google issues the identity token in the browser, then the API exchanges it for the same local session token used by password sign-in.'
                        : 'Loading Google sign-in...'}
                  </p>
                </div>
              ) : null}

              {serverSettings?.bootstrap_admin_enabled ? (
                <form id="bootstrap-admin" className="stack-form" onSubmit={handleBootstrapAdmin}>
                  <div className="section-head">
                    <div>
                      <span className="eyebrow">First Run</span>
                      <h3>Bootstrap Admin</h3>
                    </div>
                    <p>Only available until the first user account exists. Use the configured bootstrap token once to create the initial admin.</p>
                  </div>

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

                  <div className="toolbar settings-actions">
                    <button type="submit" className="button button-primary" disabled={authLoading}>
                      {authAction === 'bootstrap' ? 'Creating Admin...' : 'Create Initial Admin'}
                    </button>
                  </div>
                </form>
              ) : null}

              <p className={`form-note ${authFlash?.tone === 'error' ? 'form-note-error' : ''}`}>
                {authFlash?.message ?? 'Sign in to unlock protected writes. Bootstrap is only available while no user accounts exist.'}
              </p>
            </div>
          )}
        </article>

        <article className="surface">
          <div className="section-head">
            <div>
              <span className="eyebrow">Browser Settings</span>
              <h3>Appearance</h3>
            </div>
            <p>Pick how the console chooses light or dark mode, then tune the accent and highlight colors for each mode independently.</p>
          </div>

          <div className="settings-summary-grid">
            <article className="settings-summary-card">
              <span>Mode preference</span>
              <strong>{formatModeLabel(appearanceSettings.colorMode)}</strong>
              <p>{appearanceSettings.colorMode === 'system' ? 'Following the operating system preference.' : 'Pinned locally in this browser.'}</p>
            </article>
            <article className="settings-summary-card">
              <span>Active mode</span>
              <strong>{formatModeLabel(resolvedColorMode)}</strong>
              <p>
                Accent {activePalette.accent.toUpperCase()} · Highlight {activePalette.highlight.toUpperCase()}
              </p>
            </article>
          </div>

          <form className="stack-form settings-form" onSubmit={handleSaveAppearance}>
            <div className="appearance-mode-options" aria-label="Color mode preference">
              {COLOR_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`appearance-mode-option ${appearanceForm.colorMode === option.value ? 'is-active' : ''}`}
                  aria-pressed={appearanceForm.colorMode === option.value}
                  onClick={() => {
                    setAppearanceFlash(null)
                    setAppearanceForm((current) => ({ ...current, colorMode: option.value }))
                  }}
                >
                  <span>{option.label}</span>
                  <strong>{option.detail}</strong>
                </button>
              ))}
            </div>

            <div className="appearance-palette-grid">
              {([
                {
                  key: 'lightMode',
                  label: 'Light mode',
                  title: 'Day shift',
                  palette: appearanceForm.lightMode,
                },
                {
                  key: 'darkMode',
                  label: 'Dark mode',
                  title: 'Night shift',
                  palette: appearanceForm.darkMode,
                },
              ] as const).map((section) => (
                <section key={section.key} className="appearance-preview-card" style={previewStyle(section.palette)}>
                  <div className="appearance-preview-card-head">
                    <div>
                      <span className="appearance-preview-label">{section.label}</span>
                      <strong>{section.title}</strong>
                    </div>
                  </div>

                  <div className="appearance-preview-signals">
                    <article className="appearance-preview-signal">
                      <span>Accent</span>
                      <strong>{section.palette.accent.toUpperCase()}</strong>
                    </article>
                    <article className="appearance-preview-signal">
                      <span>Highlight</span>
                      <strong>{section.palette.highlight.toUpperCase()}</strong>
                    </article>
                  </div>

                  <div className="appearance-preview-chip-row">
                    <span className="appearance-preview-chip appearance-preview-chip-accent">Accent glow</span>
                    <span className="appearance-preview-chip appearance-preview-chip-highlight">Focus highlight</span>
                  </div>

                  <div className="appearance-color-grid">
                    <label className="field appearance-color-field">
                      <span>Accent</span>
                      <div className="appearance-color-control">
                        <input
                          className="appearance-color-picker"
                          type="color"
                          value={section.palette.accent}
                          onChange={(event) => {
                            setAppearanceFlash(null)
                            setAppearanceForm((current) => ({
                              ...current,
                              [section.key]: {
                                ...current[section.key],
                                accent: event.target.value,
                              },
                            }))
                          }}
                        />
                        <div className="appearance-color-meta">
                          <span className="appearance-color-value">{section.palette.accent.toUpperCase()}</span>
                          <small className="appearance-color-note">Buttons, active states, status glows</small>
                        </div>
                      </div>
                    </label>

                    <label className="field appearance-color-field">
                      <span>Highlight</span>
                      <div className="appearance-color-control">
                        <input
                          className="appearance-color-picker"
                          type="color"
                          value={section.palette.highlight}
                          onChange={(event) => {
                            setAppearanceFlash(null)
                            setAppearanceForm((current) => ({
                              ...current,
                              [section.key]: {
                                ...current[section.key],
                                highlight: event.target.value,
                              },
                            }))
                          }}
                        />
                        <div className="appearance-color-meta">
                          <span className="appearance-color-value">{section.palette.highlight.toUpperCase()}</span>
                          <small className="appearance-color-note">Focus rings, secondary glow, chart accents</small>
                        </div>
                      </div>
                    </label>
                  </div>
                </section>
              ))}
            </div>

            <div className="toolbar settings-actions">
              <button type="submit" className="button button-primary">
                Apply Appearance
              </button>
              <button type="button" className="button button-ghost" onClick={handleResetAppearance}>
                Reset Palette
              </button>
            </div>

            <p className={`form-note ${appearanceFlash?.tone === 'error' ? 'form-note-error' : ''}`}>
              {appearanceFlash?.message ??
                'Appearance settings are stored in this browser today. That gives us a solid first slice while we prepare user-profile persistence on the API.'}
            </p>
          </form>
        </article>

        <article className="surface">
          <div className="section-head">
            <div>
              <span className="eyebrow">Browser Settings</span>
              <h3>Client Overrides</h3>
            </div>
            <p>Leave fields blank to fall back to the checked-in defaults. Changes apply after a page reload.</p>
          </div>

          <div className="settings-summary-grid">
            <article className="settings-summary-card">
              <span>Effective API Base</span>
              <strong>{appConfig.apiBase}</strong>
              <p>{runtimeOverrideForm.apiBaseOverride.trim() ? 'Using a browser override.' : 'Using the checked-in value.'}</p>
            </article>
            <article className="settings-summary-card">
              <span>Override count</span>
              <strong>{runtimeOverrideCount}</strong>
              <p>{runtimeOverrideCount > 0 ? 'Browser overrides are active.' : 'No browser overrides are active.'}</p>
            </article>
          </div>

          <form className="stack-form settings-form" onSubmit={handleSaveRuntimeOverrides}>
            <label className="field">
              <span>API Base Override</span>
              <input
                className="control"
                value={runtimeOverrideForm.apiBaseOverride}
                onChange={(event) => {
                  setRuntimeFlash(null)
                  setRuntimeOverrideForm((current) => ({ ...current, apiBaseOverride: event.target.value }))
                }}
                placeholder={appConfig.apiBase}
              />
            </label>

            <div className="mini-grid">
              <label className="field">
                <span>Events Limit</span>
                <input
                  className="control"
                  inputMode="numeric"
                  value={runtimeOverrideForm.eventsLimitOverride}
                  onChange={(event) => {
                    setRuntimeFlash(null)
                    setRuntimeOverrideForm((current) => ({ ...current, eventsLimitOverride: event.target.value }))
                  }}
                  placeholder={String(bootstrapQueryLimits.events)}
                />
              </label>
              <label className="field">
                <span>Selected Trade Events</span>
                <input
                  className="control"
                  inputMode="numeric"
                  value={runtimeOverrideForm.selectedTradeEventsLimitOverride}
                  onChange={(event) => {
                    setRuntimeFlash(null)
                    setRuntimeOverrideForm((current) => ({
                      ...current,
                      selectedTradeEventsLimitOverride: event.target.value,
                    }))
                  }}
                  placeholder={String(bootstrapQueryLimits.selectedTradeEvents)}
                />
              </label>
              <label className="field">
                <span>Reference Data Limit</span>
                <input
                  className="control"
                  inputMode="numeric"
                  value={runtimeOverrideForm.referenceDataLimitOverride}
                  onChange={(event) => {
                    setRuntimeFlash(null)
                    setRuntimeOverrideForm((current) => ({
                      ...current,
                      referenceDataLimitOverride: event.target.value,
                    }))
                  }}
                  placeholder={String(bootstrapQueryLimits.referenceData)}
                />
              </label>
              <label className="field">
                <span>External Runs Limit</span>
                <input
                  className="control"
                  inputMode="numeric"
                  value={runtimeOverrideForm.externalDataRunsLimitOverride}
                  onChange={(event) => {
                    setRuntimeFlash(null)
                    setRuntimeOverrideForm((current) => ({
                      ...current,
                      externalDataRunsLimitOverride: event.target.value,
                    }))
                  }}
                  placeholder={String(bootstrapQueryLimits.externalDataRuns)}
                />
              </label>
              <label className="field">
                <span>Trading Sources Limit</span>
                <input
                  className="control"
                  inputMode="numeric"
                  value={runtimeOverrideForm.tradingSourcesLimitOverride}
                  onChange={(event) => {
                    setRuntimeFlash(null)
                    setRuntimeOverrideForm((current) => ({
                      ...current,
                      tradingSourcesLimitOverride: event.target.value,
                    }))
                  }}
                  placeholder={String(bootstrapQueryLimits.tradingSources)}
                />
              </label>
            </div>

            <div className="toolbar settings-actions">
              <button type="submit" className="button button-primary">
                Save and Reload
              </button>
              <button type="button" className="button button-ghost" onClick={handleResetRuntimeOverrides}>
                Reset to Defaults
              </button>
            </div>

            <p className={`form-note ${runtimeFlash?.tone === 'error' ? 'form-note-error' : ''}`}>
              {runtimeFlash?.message ?? 'These overrides are browser-local and reload the page when applied.'}
            </p>
          </form>
        </article>
      </section>

      <section className="stack">
        <article className="surface">
          <div className="section-head">
            <div>
              <span className="eyebrow">Effective Runtime</span>
              <h3>Current Client Settings</h3>
            </div>
            <p>This is the configuration the running UI is currently using after env resolution and browser overrides.</p>
          </div>

          <div className="settings-kv">
            <SettingsValueRow label="API health" value={health} detail="From the currently loaded `/health` response." />
            <SettingsValueRow label="API base" value={appConfig.apiBase} />
            <SettingsValueRow label="Events bootstrap limit" value={String(bootstrapQueryLimits.events)} />
            <SettingsValueRow
              label="Selected trade events limit"
              value={String(bootstrapQueryLimits.selectedTradeEvents)}
            />
            <SettingsValueRow label="Reference data limit" value={String(bootstrapQueryLimits.referenceData)} />
            <SettingsValueRow
              label="External-data runs limit"
              value={String(bootstrapQueryLimits.externalDataRuns)}
            />
            <SettingsValueRow
              label="Trading-sources limit"
              value={String(bootstrapQueryLimits.tradingSources)}
            />
          </div>
        </article>

        <article className="surface">
          <div className="section-head">
            <div>
              <span className="eyebrow">Server Runtime</span>
              <h3>Public API Settings</h3>
            </div>
            <p>Safe server-owned settings surfaced through a read-only endpoint. Secrets are intentionally excluded.</p>
          </div>

          {serverSettingsLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : serverSettings ? (
            <>
              <div className="settings-summary-grid">
                <article className="settings-summary-card">
                  <span>API version</span>
                  <strong>{serverSettings.app_version}</strong>
                  <p>Returned by the running backend.</p>
                </article>
                <article className="settings-summary-card">
                  <span>Mutation protection</span>
                  <strong>{serverSettings.mutation_protection_enabled ? 'Enabled' : 'Disabled'}</strong>
                  <div className={`status-pill status-pill-${serverSettings.mutation_protection_enabled ? 'active' : 'cancelled'}`}>
                    {serverSettings.mutation_protection_enabled ? 'Token required' : 'Open writes'}
                  </div>
                </article>
                <article className="settings-summary-card">
                  <span>Bootstrap admin</span>
                  <strong>{serverSettings.bootstrap_admin_enabled ? 'Configured' : 'Unavailable'}</strong>
                  <p>{serverSettings.bootstrap_admin_enabled ? 'Initial admin bootstrap token is configured on the server.' : 'No bootstrap token is configured on the server.'}</p>
                </article>
                <article className="settings-summary-card">
                  <span>Single-user auth</span>
                  <strong>{serverSettings.single_user_auth_enabled ? 'Enabled' : 'Disabled'}</strong>
                  <p>
                    {serverSettings.single_user_auth_enabled
                      ? 'One-click local OPS_ADMIN sign-in is available in the session login section.'
                      : 'One-click single-user sign-in is not enabled on the server.'}
                  </p>
                </article>
                <article className="settings-summary-card">
                  <span>Google auth</span>
                  <strong>{serverSettings.google_auth.enabled ? 'Enabled' : 'Disabled'}</strong>
                  <p>
                    {serverSettings.google_auth.enabled
                      ? serverSettings.google_auth.auto_create_users
                        ? 'Google sign-in is enabled and can auto-provision local users.'
                        : 'Google sign-in is enabled for linked local users.'
                      : 'Google sign-in is not enabled on the server.'}
                  </p>
                </article>
                <article className="settings-summary-card">
                  <span>Assistant default</span>
                  <strong>{serverSettings.assistant.effective_default_provider ?? 'Not ready'}</strong>
                  <p>
                    {serverSettings.assistant.enabled
                      ? `${serverSettings.assistant.configured_provider_count} provider(s) can answer prompts.`
                      : 'No configured assistant provider is ready on the API.'}
                  </p>
                </article>
              </div>

              <div className="settings-kv">
                <SettingsValueRow
                  label="Database type"
                  value={formatDatabaseType(serverSettings.database.dialect)}
                />
                <SettingsValueRow label="Database name" value={serverSettings.database.name} />
                <SettingsValueRow
                  label="Database size"
                  value={formatBytes(serverSettings.database.size_bytes)}
                />
                <SettingsValueRow
                  label="Database tables"
                  value={String(serverSettings.database.table_count)}
                />
                <SettingsValueRow
                  label="Database records"
                  value={String(serverSettings.database.record_count)}
                />
                <SettingsValueRow
                  label="Session TTL"
                  value={`${serverSettings.session_ttl_hours}h`}
                />
                <SettingsValueRow label="EIA base URL" value={serverSettings.eia_base_url} />
                <SettingsValueRow
                  label="EIA timeout"
                  value={`${serverSettings.eia_timeout_seconds}s`}
                />
                <SettingsValueRow
                  label="Standard list default"
                  value={String(serverSettings.pagination.standard_default)}
                />
                <SettingsValueRow
                  label="Standard list max"
                  value={String(serverSettings.pagination.standard_max)}
                />
                <SettingsValueRow
                  label="Admin list default"
                  value={String(serverSettings.pagination.admin_default)}
                />
                <SettingsValueRow
                  label="Admin list max"
                  value={String(serverSettings.pagination.admin_max)}
                />
                <SettingsValueRow
                  label="Requested assistant default"
                  value={serverSettings.assistant.default_provider}
                />
                <SettingsValueRow
                  label="Effective assistant default"
                  value={serverSettings.assistant.effective_default_provider ?? 'None configured'}
                />
              </div>

              <div className="settings-chip-block">
                <span className="field-label">CORS Allow Origins</span>
                <div className="chip-row">
                  {serverSettings.cors_allow_origins.map((origin) => (
                    <span key={origin} className="entity-chip entity-chip-soft">
                      {origin}
                    </span>
                  ))}
                </div>
              </div>

              <div className="settings-chip-block">
                <span className="field-label">Assistant Providers</span>
                <div className="chip-row">
                  {serverSettings.assistant.providers.map((provider) => (
                    <span key={provider.provider} className="entity-chip entity-chip-soft">
                      {provider.label} · {provider.enabled ? 'ready' : provider.configured ? 'disabled' : 'needs key'}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <strong>Server settings unavailable</strong>
              <p>{serverSettingsError || 'The running API did not return public runtime settings.'}</p>
            </div>
          )}
        </article>

        <article className="surface">
          <div className="section-head">
            <div>
              <span className="eyebrow">Status</span>
              <h3>Quick Read</h3>
            </div>
            <p>A fast signal for whether the browser and API configuration look usable before you try protected operations.</p>
          </div>

          <div className="settings-summary-grid">
            <article className="settings-summary-card">
              <span>API</span>
              <strong>{health === 'ok' ? 'Reachable' : 'Attention'}</strong>
              <div className={`status-pill status-pill-${healthTone}`}>{health}</div>
            </article>
            <article className="settings-summary-card">
              <span>Browser overrides</span>
              <strong>{runtimeOverrideCount > 0 ? 'Active' : 'Default'}</strong>
              <p>{runtimeOverrideCount > 0 ? `${runtimeOverrideCount} override values stored locally.` : 'No local runtime overrides are stored.'}</p>
            </article>
          </div>
        </article>
      </section>
    </div>
  )
}
