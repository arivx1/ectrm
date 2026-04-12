import { useEffect, useState, type CSSProperties } from 'react'

import { logoutCurrentSession } from '../../entities/auth/api'
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
import {
  createTradeCaptureRule,
  type TradeCaptureRule,
  type TradeCaptureRuleVisibilityOverride,
  type TradeCaptureSettings,
  type TradeCaptureVisibilityMode,
} from '../../shared/tradeCaptureSettings'
import { type StoredAuthSession } from '../../shared/mutation'
import {
  optionStyleOptions,
  optionTypeOptions,
  pricingTypeOptions,
  pricingStatusOptions,
  settlementStatusOptions,
  commodityClassOrder,
  tradeInstrumentTypeOptions,
  tradeNatureOptions,
  tradeSideOptions,
  tradeStructureOptions,
} from '../../shared/trading'

type SettingsWorkspaceProps = {
  health: string
  authSession: StoredAuthSession | null
  appearanceSettings: AppearanceSettings
  tradeCaptureSettings: TradeCaptureSettings
  bookOptions: Array<{ code: string; name: string }>
  commodityClassOptions: string[]
  resolvedColorMode: ResolvedColorMode
  onAppearanceSettingsChange: (settings: AppearanceSettings) => AppearanceSettings
  onAppearanceSettingsReset: () => AppearanceSettings
  onTradeCaptureSettingsChange: (settings: TradeCaptureSettings) => TradeCaptureSettings
  onTradeCaptureSettingsReset: () => TradeCaptureSettings
  onSessionChange: (session: StoredAuthSession | null) => Promise<void> | void
}

type FlashMessage = {
  tone: 'success' | 'error'
  message: string
}

type AuthAction = 'logout' | null

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

function formatVisibilityModeLabel(value: TradeCaptureVisibilityMode): string {
  return value === 'always' ? 'Always visible' : 'Auto'
}

function formatEnabledState(value: boolean): string {
  return value ? 'Enabled' : 'Disabled'
}

function formatRuleVisibilityOverrideLabel(value: TradeCaptureRuleVisibilityOverride): string {
  switch (value) {
    case 'show':
      return 'Show'
    case 'hide':
      return 'Hide'
    default:
      return 'Inherit'
  }
}

function formatRuleValueLabel(value: string | null): string {
  return value ? value.split('_').join(' ') : 'Any'
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
  tradeCaptureSettings,
  bookOptions,
  commodityClassOptions,
  resolvedColorMode,
  onAppearanceSettingsChange,
  onAppearanceSettingsReset,
  onTradeCaptureSettingsChange,
  onTradeCaptureSettingsReset,
  onSessionChange,
}: SettingsWorkspaceProps) {
  const [runtimeOverrideForm, setRuntimeOverrideForm] = useState<ClientRuntimeOverrideSnapshot>(() =>
    getClientRuntimeOverrideSnapshot(),
  )
  const [appearanceForm, setAppearanceForm] = useState<AppearanceSettings>(() => appearanceSettings)
  const [tradeCaptureForm, setTradeCaptureForm] = useState<TradeCaptureSettings>(() => tradeCaptureSettings)
  const [authFlash, setAuthFlash] = useState<FlashMessage | null>(null)
  const [authAction, setAuthAction] = useState<AuthAction>(null)
  const [runtimeFlash, setRuntimeFlash] = useState<FlashMessage | null>(null)
  const [appearanceFlash, setAppearanceFlash] = useState<FlashMessage | null>(null)
  const [tradeCaptureFlash, setTradeCaptureFlash] = useState<FlashMessage | null>(null)
  const [serverSettings, setServerSettings] = useState<PublicRuntimeSettings | null>(null)
  const [serverSettingsError, setServerSettingsError] = useState('')
  const [serverSettingsLoading, setServerSettingsLoading] = useState(true)

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
    setTradeCaptureForm(tradeCaptureSettings)
  }, [tradeCaptureSettings])

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

  function handleSaveTradeCaptureSettings(event: React.FormEvent) {
    event.preventDefault()
    const savedSettings = onTradeCaptureSettingsChange(tradeCaptureForm)
    setTradeCaptureForm(savedSettings)
    setTradeCaptureFlash({
      tone: 'success',
      message: 'Trade ticket defaults saved locally for this browser. New or cleared tickets will pick them up immediately.',
    })
  }

  function handleResetTradeCaptureSettings() {
    const defaultSettings = onTradeCaptureSettingsReset()
    setTradeCaptureForm(defaultSettings)
    setTradeCaptureFlash({
      tone: 'success',
      message: 'Trade ticket defaults reset to the checked-in desk behavior for this browser.',
    })
  }

  function updateTradeCaptureRule(index: number, updater: (rule: TradeCaptureRule) => TradeCaptureRule) {
    setTradeCaptureFlash(null)
    setTradeCaptureForm((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) => (ruleIndex === index ? updater(rule) : rule)),
    }))
  }

  function moveTradeCaptureRule(index: number, direction: -1 | 1) {
    setTradeCaptureFlash(null)
    setTradeCaptureForm((current) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.rules.length) {
        return current
      }

      const nextRules = [...current.rules]
      const [movedRule] = nextRules.splice(index, 1)
      nextRules.splice(nextIndex, 0, movedRule)

      return {
        ...current,
        rules: nextRules,
      }
    })
  }

  function handleAddTradeCaptureRule() {
    setTradeCaptureFlash(null)
    setTradeCaptureForm((current) => ({
      ...current,
      rules: [...current.rules, createTradeCaptureRule(`Rule ${current.rules.length + 1}`)],
    }))
  }

  function handleRemoveTradeCaptureRule(index: number) {
    setTradeCaptureFlash(null)
    setTradeCaptureForm((current) => ({
      ...current,
      rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index),
    }))
  }

  const healthTone = health === 'ok' ? 'active' : 'cancelled'
  const authTone = authSession ? 'active' : 'cancelled'
  const authLoading = authAction !== null
  const runtimeOverrideCount = Object.values(runtimeOverrideForm).filter((value) => value.trim() !== '').length
  const activePalette = resolveAppearancePalette(appearanceSettings, resolvedColorMode)
  const enabledTradeCaptureRuleCount = tradeCaptureForm.rules.filter((rule) => rule.enabled).length
  const visibilityOverrideRuleCount = tradeCaptureForm.rules.filter(
    (rule) => rule.visibility.optionDetails !== 'inherit' || rule.visibility.priceIndex !== 'inherit',
  ).length
  const availableCommodityClassOptions = commodityClassOptions.length > 0 ? commodityClassOptions : [...commodityClassOrder]

  return (
    <div className="workspace-grid settings-grid">
      <section className="stack">
        <article className="surface">
          <div className="section-head">
            <div>
              <span className="eyebrow">Browser Settings</span>
              <h3>Active Session</h3>
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

          <div className="stack-form settings-form">
            {authSession ? (
              <>
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
              </>
            ) : (
              <div className="feedback-banner">
                Sign out controls live here, but sign-in now happens on the dedicated locked screen shown
                before the workspace shell loads.
              </div>
            )}

            <p className={`form-note ${authFlash?.tone === 'error' ? 'form-note-error' : ''}`}>
              {authFlash?.message ??
                (authSession
                  ? 'Protected writes will use this session until it expires or you sign out.'
                  : 'Sign in happens on the dedicated entry screen before the console opens.')}
            </p>
          </div>
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
              <h3>Trade Ticket Defaults</h3>
            </div>
            <p>Set the baseline ticket here, then build an ordered rule stack that can react to instrument, structure, pricing, commodity class, and book.</p>
          </div>

          <div className="settings-summary-grid">
            <article className="settings-summary-card">
              <span>New ticket baseline</span>
              <strong>
                {tradeCaptureForm.defaults.instrumentType} • {tradeCaptureForm.defaults.tradeNature} • {tradeCaptureForm.defaults.tradeStructure}
              </strong>
              <p>
                Side {tradeCaptureForm.defaults.tradeSide} • Pricing {tradeCaptureForm.defaults.pricingType}
              </p>
            </article>
            <article className="settings-summary-card">
              <span>Rule stack</span>
              <strong>{enabledTradeCaptureRuleCount} enabled</strong>
              <p>
                {tradeCaptureForm.rules.length} total rules. They run top to bottom, and later rules win on conflicts.
              </p>
            </article>
            <article className="settings-summary-card">
              <span>Visibility baseline</span>
              <strong>{formatVisibilityModeLabel(tradeCaptureForm.visibility.optionDetails)}</strong>
              <p>
                Option details · {formatVisibilityModeLabel(tradeCaptureForm.visibility.priceIndex)} price index
              </p>
            </article>
            <article className="settings-summary-card">
              <span>Visibility overrides</span>
              <strong>{visibilityOverrideRuleCount}</strong>
              <p>Rules currently changing whether option details or price index stay visible.</p>
            </article>
          </div>

          <form className="stack-form settings-form" onSubmit={handleSaveTradeCaptureSettings}>
            <div className="section-head">
              <div>
                <span className="eyebrow">Baseline</span>
                <h3>New Ticket Starting Values</h3>
              </div>
              <p>These values seed a brand-new trade or the Clear Form action before any conditional rules fire.</p>
            </div>

            <div className="mini-grid">
              <label className="field">
                <span>Instrument</span>
                <select
                  className="control"
                  value={tradeCaptureForm.defaults.instrumentType}
                  onChange={(event) => {
                    setTradeCaptureFlash(null)
                    setTradeCaptureForm((current) => ({
                      ...current,
                      defaults: {
                        ...current.defaults,
                        instrumentType: event.target.value,
                      },
                    }))
                  }}
                >
                  {tradeInstrumentTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Nature</span>
                <select
                  className="control"
                  value={tradeCaptureForm.defaults.tradeNature}
                  onChange={(event) => {
                    setTradeCaptureFlash(null)
                    setTradeCaptureForm((current) => ({
                      ...current,
                      defaults: {
                        ...current.defaults,
                        tradeNature: event.target.value,
                      },
                    }))
                  }}
                >
                  {tradeNatureOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Structure</span>
                <select
                  className="control"
                  value={tradeCaptureForm.defaults.tradeStructure}
                  onChange={(event) => {
                    setTradeCaptureFlash(null)
                    setTradeCaptureForm((current) => ({
                      ...current,
                      defaults: {
                        ...current.defaults,
                        tradeStructure: event.target.value,
                      },
                    }))
                  }}
                >
                  {tradeStructureOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Side</span>
                <select
                  className="control"
                  value={tradeCaptureForm.defaults.tradeSide}
                  onChange={(event) => {
                    setTradeCaptureFlash(null)
                    setTradeCaptureForm((current) => ({
                      ...current,
                      defaults: {
                        ...current.defaults,
                        tradeSide: event.target.value,
                      },
                    }))
                  }}
                >
                  {tradeSideOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Pricing Type</span>
                <select
                  className="control"
                  value={tradeCaptureForm.defaults.pricingType}
                  onChange={(event) => {
                    setTradeCaptureFlash(null)
                    setTradeCaptureForm((current) => ({
                      ...current,
                      defaults: {
                        ...current.defaults,
                        pricingType: event.target.value,
                      },
                    }))
                  }}
                >
                  {pricingTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Pricing Status</span>
                <select
                  className="control"
                  value={tradeCaptureForm.defaults.pricingStatus}
                  onChange={(event) => {
                    setTradeCaptureFlash(null)
                    setTradeCaptureForm((current) => ({
                      ...current,
                      defaults: {
                        ...current.defaults,
                        pricingStatus: event.target.value,
                      },
                    }))
                  }}
                >
                  {pricingStatusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Settlement Status</span>
                <select
                  className="control"
                  value={tradeCaptureForm.defaults.settlementStatus}
                  onChange={(event) => {
                    setTradeCaptureFlash(null)
                    setTradeCaptureForm((current) => ({
                      ...current,
                      defaults: {
                        ...current.defaults,
                        settlementStatus: event.target.value,
                      },
                    }))
                  }}
                >
                  {settlementStatusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Option Type</span>
                <select
                  className="control"
                  value={tradeCaptureForm.defaults.optionType}
                  onChange={(event) => {
                    setTradeCaptureFlash(null)
                    setTradeCaptureForm((current) => ({
                      ...current,
                      defaults: {
                        ...current.defaults,
                        optionType: event.target.value,
                      },
                    }))
                  }}
                >
                  {optionTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Option Style</span>
                <select
                  className="control"
                  value={tradeCaptureForm.defaults.optionStyle}
                  onChange={(event) => {
                    setTradeCaptureFlash(null)
                    setTradeCaptureForm((current) => ({
                      ...current,
                      defaults: {
                        ...current.defaults,
                        optionStyle: event.target.value,
                      },
                    }))
                  }}
                >
                  {optionStyleOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="section-head">
              <div>
                <span className="eyebrow">Visibility</span>
                <h3>Field Reveal Baseline</h3>
              </div>
              <p>Use Auto for progressive disclosure, or keep fields visible while still disabling them when they do not apply.</p>
            </div>

            <div className="mini-grid">
              <label className="field">
                <span>Option Detail Fields</span>
                <select
                  className="control"
                  value={tradeCaptureForm.visibility.optionDetails}
                  onChange={(event) => {
                    setTradeCaptureFlash(null)
                    setTradeCaptureForm((current) => ({
                      ...current,
                      visibility: {
                        ...current.visibility,
                        optionDetails: event.target.value as TradeCaptureVisibilityMode,
                      },
                    }))
                  }}
                >
                  <option value="auto">Auto show for options</option>
                  <option value="always">Always keep visible</option>
                </select>
              </label>
              <label className="field">
                <span>Price Index Field</span>
                <select
                  className="control"
                  value={tradeCaptureForm.visibility.priceIndex}
                  onChange={(event) => {
                    setTradeCaptureFlash(null)
                    setTradeCaptureForm((current) => ({
                      ...current,
                      visibility: {
                        ...current.visibility,
                        priceIndex: event.target.value as TradeCaptureVisibilityMode,
                      },
                    }))
                  }}
                >
                  <option value="auto">Auto show when required</option>
                  <option value="always">Always keep visible</option>
                </select>
              </label>
            </div>

            <div className="section-head section-head-control">
              <div>
                <span className="eyebrow">Conditional Rules</span>
                <h3>Rule Stack</h3>
              </div>
              <div className="toolbar settings-actions">
                <button type="button" className="button button-secondary" onClick={handleAddTradeCaptureRule}>
                  Add Rule
                </button>
              </div>
            </div>

            <p className="form-note">
              Rules run from top to bottom. If multiple rules set the same field or visibility override, the later rule wins.
            </p>

            <div className="trade-capture-rule-stack">
              {tradeCaptureForm.rules.map((rule, index) => {
                const bookListId = `trade-capture-rule-book-${rule.id}`

                return (
                  <article key={rule.id} className="settings-rule-card">
                    <div className="settings-rule-card-head">
                      <div>
                        <span className="eyebrow">Rule {index + 1}</span>
                        <strong className="settings-rule-title">{rule.name || `Rule ${index + 1}`}</strong>
                      </div>
                      <div className="toolbar settings-rule-toolbar">
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => moveTradeCaptureRule(index, -1)}
                          disabled={index === 0}
                        >
                          Move Up
                        </button>
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => moveTradeCaptureRule(index, 1)}
                          disabled={index === tradeCaptureForm.rules.length - 1}
                        >
                          Move Down
                        </button>
                        <button type="button" className="button button-ghost" onClick={() => handleRemoveTradeCaptureRule(index)}>
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="mini-grid">
                      <label className="field field-wide">
                        <span>Rule Name</span>
                        <input
                          className="control"
                          value={rule.name}
                          onChange={(event) =>
                            updateTradeCaptureRule(index, (current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          placeholder={`Rule ${index + 1}`}
                        />
                      </label>
                      <label className="field">
                        <span>Status</span>
                        <select
                          className="control"
                          value={rule.enabled ? 'enabled' : 'disabled'}
                          onChange={(event) =>
                            updateTradeCaptureRule(index, (current) => ({
                              ...current,
                              enabled: event.target.value === 'enabled',
                            }))
                          }
                        >
                          <option value="enabled">Enabled</option>
                          <option value="disabled">Disabled</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Quick Read</span>
                        <input
                          className="control"
                          value={`${formatEnabledState(rule.enabled)} · ${Object.values(rule.conditions).filter(Boolean).length} trigger${Object.values(rule.conditions).filter(Boolean).length === 1 ? '' : 's'}`}
                          readOnly
                        />
                      </label>
                    </div>

                    <div className="settings-rule-group">
                      <div className="section-head">
                        <div>
                          <span className="eyebrow">Match</span>
                          <h3>When This Rule Applies</h3>
                        </div>
                        <p>
                          Current trigger snapshot: {formatRuleValueLabel(rule.conditions.instrumentType)} instrument · {formatRuleValueLabel(rule.conditions.tradeStructure)} structure · {formatRuleValueLabel(rule.conditions.pricingType)} pricing
                        </p>
                      </div>

                      <div className="mini-grid">
                        <label className="field">
                          <span>Instrument</span>
                          <select
                            className="control"
                            value={rule.conditions.instrumentType ?? ''}
                            onChange={(event) =>
                              updateTradeCaptureRule(index, (current) => ({
                                ...current,
                                conditions: {
                                  ...current.conditions,
                                  instrumentType: event.target.value || null,
                                },
                              }))
                            }
                          >
                            <option value="">Any instrument</option>
                            {tradeInstrumentTypeOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Structure</span>
                          <select
                            className="control"
                            value={rule.conditions.tradeStructure ?? ''}
                            onChange={(event) =>
                              updateTradeCaptureRule(index, (current) => ({
                                ...current,
                                conditions: {
                                  ...current.conditions,
                                  tradeStructure: event.target.value || null,
                                },
                              }))
                            }
                          >
                            <option value="">Any structure</option>
                            {tradeStructureOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Pricing Type</span>
                          <select
                            className="control"
                            value={rule.conditions.pricingType ?? ''}
                            onChange={(event) =>
                              updateTradeCaptureRule(index, (current) => ({
                                ...current,
                                conditions: {
                                  ...current.conditions,
                                  pricingType: event.target.value || null,
                                },
                              }))
                            }
                          >
                            <option value="">Any pricing type</option>
                            {pricingTypeOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Commodity Class</span>
                          <select
                            className="control"
                            value={rule.conditions.commodityClass ?? ''}
                            onChange={(event) =>
                              updateTradeCaptureRule(index, (current) => ({
                                ...current,
                                conditions: {
                                  ...current.conditions,
                                  commodityClass: event.target.value || null,
                                },
                              }))
                            }
                          >
                            <option value="">Any commodity class</option>
                            {availableCommodityClassOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Book</span>
                          <input
                            className="control"
                            list={bookListId}
                            value={rule.conditions.book ?? ''}
                            onChange={(event) =>
                              updateTradeCaptureRule(index, (current) => ({
                                ...current,
                                conditions: {
                                  ...current.conditions,
                                  book: event.target.value.trim() || null,
                                },
                              }))
                            }
                            placeholder="Any book"
                          />
                          <datalist id={bookListId}>
                            {bookOptions.map((book) => (
                              <option key={book.code} value={book.code}>
                                {book.name}
                              </option>
                            ))}
                          </datalist>
                        </label>
                      </div>
                    </div>

                    <div className="settings-rule-group">
                      <div className="section-head">
                        <div>
                          <span className="eyebrow">Defaults</span>
                          <h3>Set These Fields</h3>
                        </div>
                        <p>Leave any field on “Do not change” if this rule should only influence other attributes.</p>
                      </div>

                      <div className="mini-grid">
                        <label className="field">
                          <span>Nature</span>
                          <select
                            className="control"
                            value={rule.defaults.tradeNature ?? ''}
                            onChange={(event) =>
                              updateTradeCaptureRule(index, (current) => ({
                                ...current,
                                defaults: {
                                  ...current.defaults,
                                  tradeNature: event.target.value || null,
                                },
                              }))
                            }
                          >
                            <option value="">Do not change</option>
                            {tradeNatureOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Structure</span>
                          <select
                            className="control"
                            value={rule.defaults.tradeStructure ?? ''}
                            onChange={(event) =>
                              updateTradeCaptureRule(index, (current) => ({
                                ...current,
                                defaults: {
                                  ...current.defaults,
                                  tradeStructure: event.target.value || null,
                                },
                              }))
                            }
                          >
                            <option value="">Do not change</option>
                            {tradeStructureOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Side</span>
                          <select
                            className="control"
                            value={rule.defaults.tradeSide ?? ''}
                            onChange={(event) =>
                              updateTradeCaptureRule(index, (current) => ({
                                ...current,
                                defaults: {
                                  ...current.defaults,
                                  tradeSide: event.target.value || null,
                                },
                              }))
                            }
                          >
                            <option value="">Do not change</option>
                            {tradeSideOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Pricing Type</span>
                          <select
                            className="control"
                            value={rule.defaults.pricingType ?? ''}
                            onChange={(event) =>
                              updateTradeCaptureRule(index, (current) => ({
                                ...current,
                                defaults: {
                                  ...current.defaults,
                                  pricingType: event.target.value || null,
                                },
                              }))
                            }
                          >
                            <option value="">Do not change</option>
                            {pricingTypeOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Pricing Status</span>
                          <select
                            className="control"
                            value={rule.defaults.pricingStatus ?? ''}
                            onChange={(event) =>
                              updateTradeCaptureRule(index, (current) => ({
                                ...current,
                                defaults: {
                                  ...current.defaults,
                                  pricingStatus: event.target.value || null,
                                },
                              }))
                            }
                          >
                            <option value="">Do not change</option>
                            {pricingStatusOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Settlement Status</span>
                          <select
                            className="control"
                            value={rule.defaults.settlementStatus ?? ''}
                            onChange={(event) =>
                              updateTradeCaptureRule(index, (current) => ({
                                ...current,
                                defaults: {
                                  ...current.defaults,
                                  settlementStatus: event.target.value || null,
                                },
                              }))
                            }
                          >
                            <option value="">Do not change</option>
                            {settlementStatusOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Option Type</span>
                          <select
                            className="control"
                            value={rule.defaults.optionType ?? ''}
                            onChange={(event) =>
                              updateTradeCaptureRule(index, (current) => ({
                                ...current,
                                defaults: {
                                  ...current.defaults,
                                  optionType: event.target.value || null,
                                },
                              }))
                            }
                          >
                            <option value="">Do not change</option>
                            {optionTypeOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Option Style</span>
                          <select
                            className="control"
                            value={rule.defaults.optionStyle ?? ''}
                            onChange={(event) =>
                              updateTradeCaptureRule(index, (current) => ({
                                ...current,
                                defaults: {
                                  ...current.defaults,
                                  optionStyle: event.target.value || null,
                                },
                              }))
                            }
                          >
                            <option value="">Do not change</option>
                            {optionStyleOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="settings-rule-group">
                      <div className="section-head">
                        <div>
                          <span className="eyebrow">Visibility Override</span>
                          <h3>Show Or Hide Key Fields</h3>
                        </div>
                        <p>Choose Inherit to keep following the global baseline visibility behavior.</p>
                      </div>

                      <div className="mini-grid">
                        <label className="field">
                          <span>Option Detail Fields</span>
                          <select
                            className="control"
                            value={rule.visibility.optionDetails}
                            onChange={(event) =>
                              updateTradeCaptureRule(index, (current) => ({
                                ...current,
                                visibility: {
                                  ...current.visibility,
                                  optionDetails: event.target.value as TradeCaptureRuleVisibilityOverride,
                                },
                              }))
                            }
                          >
                            <option value="inherit">Inherit baseline</option>
                            <option value="show">Force visible</option>
                            <option value="hide">Force hidden</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>Price Index Field</span>
                          <select
                            className="control"
                            value={rule.visibility.priceIndex}
                            onChange={(event) =>
                              updateTradeCaptureRule(index, (current) => ({
                                ...current,
                                visibility: {
                                  ...current.visibility,
                                  priceIndex: event.target.value as TradeCaptureRuleVisibilityOverride,
                                },
                              }))
                            }
                          >
                            <option value="inherit">Inherit baseline</option>
                            <option value="show">Force visible</option>
                            <option value="hide">Force hidden</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>Visibility Snapshot</span>
                          <input
                            className="control"
                            value={`${formatRuleVisibilityOverrideLabel(rule.visibility.optionDetails)} option details · ${formatRuleVisibilityOverrideLabel(rule.visibility.priceIndex)} price index`}
                            readOnly
                          />
                        </label>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="toolbar settings-actions">
              <button type="submit" className="button button-primary">
                Apply Trade Defaults
              </button>
              <button type="button" className="button button-ghost" onClick={handleResetTradeCaptureSettings}>
                Reset Trade Defaults
              </button>
            </div>

            <p className={`form-note ${tradeCaptureFlash?.tone === 'error' ? 'form-note-error' : ''}`}>
              {tradeCaptureFlash?.message ??
                'Trade ticket defaults are browser-local today. The form now reads baseline values, evaluates the ordered rule stack, and explains active matches directly in Trade Entry.'}
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
                      ? 'One-click local OPS_ADMIN sign-in is available on the locked sign-in screen.'
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
