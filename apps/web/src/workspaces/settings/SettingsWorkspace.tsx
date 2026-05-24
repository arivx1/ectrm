import { useEffect, useState, type CSSProperties } from 'react'

import { logoutCurrentSession, updateCurrentUserProfile } from '../../entities/auth/api'
import { loadPublicRuntimeSettings, type PublicRuntimeSettings } from '../../entities/app/api'
import {
  resolveAppearancePalette,
  type AppearancePalette,
  type AppearanceSettings,
  type ColorModePreference,
  type ResolvedColorMode,
  type WorkspaceModePreference,
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
import { type AssistantPersona } from '../../shared/models'
import {
  clearTimeDisplaySettingsSnapshot,
  formatTimeDisplayTimeZonePreferenceLabel,
  getTimeDisplaySettingsSnapshot,
  listTimeDisplayTimeZoneOptions,
  resolveTimeDisplayTimeZone,
  saveTimeDisplaySettingsSnapshot,
  type TimeDisplaySettings,
} from '../../shared/timeDisplaySettings'
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
import {
  formatProjectionMonitoringEmailAuthLabel,
  formatProjectionMonitoringEmailStatusLabel,
  summarizeProjectionMonitoringEmail,
} from './projectionMonitoringEmailRuntime'
import { GoogleCalendarPanel } from './GoogleCalendarPanel'
import { SettingsDisclosureCard } from './SettingsDisclosureCard'
import { UserEventsPanel } from './UserEventsPanel'

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

type AuthAction = 'logout' | 'profile' | null

type UserProfileForm = {
  displayName: string
  defaultAssistantPersona: AssistantPersona
  assistantContextBlurb: string
}

const ASSISTANT_CONTEXT_BLURB_MAX_LENGTH = 4000

const USER_PERSONA_OPTIONS: { value: AssistantPersona; label: string }[] = [
  { value: 'operator', label: 'Operator' },
  { value: 'trader', label: 'Trader' },
  { value: 'risk', label: 'Risk' },
  { value: 'admin', label: 'Admin' },
  { value: 'operations', label: 'Operations' },
  { value: 'settlement', label: 'Settlement' },
  { value: 'reference_data', label: 'Reference Data' },
]

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

const WORKSPACE_MODE_OPTIONS: Array<{
  value: WorkspaceModePreference
  label: string
  detail: string
}> = [
  {
    value: 'default',
    label: 'Guided workspace',
    detail: 'Keep Prompt Home and the broader onboarding shell as the default signed-in path.',
  },
  {
    value: 'terminal',
    label: 'Market terminal',
    detail: 'Prefer the live desk, a denser shell, and less signed-in onboarding chrome.',
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

function formatWorkspaceModeLabel(value: WorkspaceModePreference): string {
  return value === 'terminal' ? 'Market terminal' : 'Guided workspace'
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

function normalizeAssistantPersona(value: string | null | undefined): AssistantPersona {
  return USER_PERSONA_OPTIONS.some((option) => option.value === value)
    ? (value as AssistantPersona)
    : 'operator'
}

function formatAssistantPersona(persona: AssistantPersona | string | null | undefined): string {
  return USER_PERSONA_OPTIONS.find((option) => option.value === persona)?.label ?? 'Operator'
}

function buildUserProfileForm(user: StoredAuthSession['user'] | null | undefined): UserProfileForm {
  return {
    displayName: user?.display_name ?? '',
    defaultAssistantPersona: normalizeAssistantPersona(user?.default_assistant_persona),
    assistantContextBlurb: user?.assistant_context_blurb ?? '',
  }
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
  const [timeDisplayForm, setTimeDisplayForm] = useState<TimeDisplaySettings>(() =>
    getTimeDisplaySettingsSnapshot(),
  )
  const [tradeCaptureForm, setTradeCaptureForm] = useState<TradeCaptureSettings>(() => tradeCaptureSettings)
  const [profileForm, setProfileForm] = useState<UserProfileForm>(() => buildUserProfileForm(authSession?.user))
  const [authFlash, setAuthFlash] = useState<FlashMessage | null>(null)
  const [profileFlash, setProfileFlash] = useState<FlashMessage | null>(null)
  const [authAction, setAuthAction] = useState<AuthAction>(null)
  const [runtimeFlash, setRuntimeFlash] = useState<FlashMessage | null>(null)
  const [appearanceFlash, setAppearanceFlash] = useState<FlashMessage | null>(null)
  const [timeDisplayFlash, setTimeDisplayFlash] = useState<FlashMessage | null>(null)
  const [tradeCaptureFlash, setTradeCaptureFlash] = useState<FlashMessage | null>(null)
  const [serverSettings, setServerSettings] = useState<PublicRuntimeSettings | null>(null)
  const [serverSettingsError, setServerSettingsError] = useState('')
  const [serverSettingsLoading, setServerSettingsLoading] = useState(true)
  const [timeZoneOptions] = useState(() => listTimeDisplayTimeZoneOptions())

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
    setProfileForm(buildUserProfileForm(authSession?.user))
    setProfileFlash(null)
  }, [authSession?.user])

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

  async function handleSaveUserProfile(event: React.FormEvent) {
    event.preventDefault()
    setProfileFlash(null)

    if (!authSession) {
      setProfileFlash({
        tone: 'error',
        message: 'Sign in before updating your user profile.',
      })
      return
    }

    setAuthAction('profile')
    try {
      const updatedUser = await updateCurrentUserProfile(appConfig.apiBase, {
        display_name: profileForm.displayName,
        default_assistant_persona: profileForm.defaultAssistantPersona,
        assistant_context_blurb: profileForm.assistantContextBlurb,
      })
      const nextSession: StoredAuthSession = {
        ...authSession,
        user: {
          ...authSession.user,
          ...updatedUser,
        },
      }
      await onSessionChange(nextSession)
      setProfileForm(buildUserProfileForm(nextSession.user))
      setProfileFlash({
        tone: 'success',
        message: 'User profile saved. Assistant context will use this profile on new requests.',
      })
    } catch (error) {
      setProfileFlash({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not save the user profile.',
      })
    } finally {
      setAuthAction(null)
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
      message:
        savedSettings.workspaceMode === 'terminal'
          ? 'Appearance saved locally for this browser. Market terminal mode now uses the denser shell and makes the live desk the default signed-in root landing.'
          : 'Appearance saved locally for this browser. Guided workspace mode keeps Prompt Home as the default signed-in root landing.',
    })
  }

  function handleResetAppearance() {
    const defaultSettings = onAppearanceSettingsReset()
    setAppearanceForm(defaultSettings)
    setAppearanceFlash({
      tone: 'success',
      message: 'Appearance reset to the default guided workspace mode and console palette for this browser.',
    })
  }

  function handleSaveTimeDisplaySettings(event: React.FormEvent) {
    event.preventDefault()
    const savedSettings = saveTimeDisplaySettingsSnapshot(timeDisplayForm)
    setTimeDisplayForm(savedSettings)
    setTimeDisplayFlash({
      tone: 'success',
      message: 'Time zone saved locally for this browser. Home meters will use it right away.',
    })
  }

  function handleResetTimeDisplaySettings() {
    const defaultSettings = clearTimeDisplaySettingsSnapshot()
    setTimeDisplayForm(defaultSettings)
    setTimeDisplayFlash({
      tone: 'success',
      message: 'Time zone reset to the system default for this browser.',
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
  const resolvedTimeZone = resolveTimeDisplayTimeZone(timeDisplayForm)
  const timeZonePreferenceLabel = formatTimeDisplayTimeZonePreferenceLabel(timeDisplayForm)
  const resolvedTimeZoneLabel = formatTimeDisplayTimeZonePreferenceLabel({ timeZone: resolvedTimeZone })
  const enabledTradeCaptureRuleCount = tradeCaptureForm.rules.filter((rule) => rule.enabled).length
  const visibilityOverrideRuleCount = tradeCaptureForm.rules.filter(
    (rule) => rule.visibility.optionDetails !== 'inherit' || rule.visibility.priceIndex !== 'inherit',
  ).length
  const availableCommodityClassOptions = commodityClassOptions.length > 0 ? commodityClassOptions : [...commodityClassOrder]
  const appearancePreviewMode = appearanceForm.colorMode === 'system' ? resolvedColorMode : appearanceForm.colorMode
  const appearancePreviewPalette = resolveAppearancePalette(appearanceForm, appearancePreviewMode)
  const activeSessionSummary = authSession
    ? `${authSession.user.role} session for ${authSession.user.user_id}`
    : 'Signed out in this browser'
  const profileSummary = authSession
    ? `${formatAssistantPersona(authSession.user.default_assistant_persona)} persona · ${
        authSession.user.assistant_context_blurb?.trim() ? 'AI context saved' : 'No AI context saved'
      }`
    : 'Sign in to edit your profile'
  const appearanceSummary = `${formatWorkspaceModeLabel(appearanceForm.workspaceMode)} · ${formatModeLabel(appearanceForm.colorMode)} preference · ${formatModeLabel(appearancePreviewMode)} preview`
  const timeDisplaySummary = `${timeZonePreferenceLabel} saved · ${resolvedTimeZoneLabel} in effect`
  const tradeDefaultsSummary =
    `${enabledTradeCaptureRuleCount} of ${tradeCaptureForm.rules.length} rules enabled · ${tradeCaptureForm.defaults.instrumentType} baseline`
  const runtimeOverrideSummary =
    runtimeOverrideCount > 0
      ? `${runtimeOverrideCount} browser override${runtimeOverrideCount === 1 ? '' : 's'} active`
      : 'No browser overrides are active'
  const clientSettingsSummary = `${health === 'ok' ? 'API reachable' : 'API attention'} · ${appConfig.apiBase}`
  const serverSettingsSummary = serverSettingsLoading
    ? 'Loading public API settings'
    : serverSettings
      ? `${serverSettings.app_version} · ${serverSettings.assistant.effective_default_provider ?? 'No assistant provider'} · ${formatProjectionMonitoringEmailStatusLabel(serverSettings.projection_monitoring_email)} email`
      : serverSettingsError || 'Public API settings are unavailable'
  const quickReadSummary =
    health === 'ok'
      ? runtimeOverrideCount > 0
        ? `API reachable · ${runtimeOverrideCount} override${runtimeOverrideCount === 1 ? '' : 's'} active`
        : 'API reachable · checked-in defaults'
      : 'API needs attention before protected operations'
  const profileSaving = authAction === 'profile'

  return (
    <div className="workspace-grid settings-grid">
      <section className="stack">
        <SettingsDisclosureCard
          cardKey="settings.active-session-card"
          eyebrow="Browser Settings"
          title="Active Session"
          summary={activeSessionSummary}
        >
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
        </SettingsDisclosureCard>

        <SettingsDisclosureCard
          cardKey="settings.user-profile-card"
          eyebrow="Account Settings"
          title="User Profile"
          summary={profileSummary}
        >
          {authSession ? (
            <>
              <div className="settings-summary-grid">
                <article className="settings-summary-card">
                  <span>Assistant persona</span>
                  <strong>{formatAssistantPersona(authSession.user.default_assistant_persona)}</strong>
                  <p>Default interpretation lens for new assistant requests.</p>
                </article>
                <article className="settings-summary-card">
                  <span>AI context</span>
                  <strong>{authSession.user.assistant_context_blurb?.trim() ? 'Saved' : 'Empty'}</strong>
                  <p>Background and preferences attached to authenticated assistant context.</p>
                </article>
              </div>

              <form className="stack-form settings-form" onSubmit={handleSaveUserProfile}>
                <div className="mini-grid">
                  <label className="field">
                    <span>Display name</span>
                    <input
                      className="control"
                      type="text"
                      value={profileForm.displayName}
                      maxLength={160}
                      onChange={(event) => {
                        setProfileFlash(null)
                        setProfileForm((current) => ({ ...current, displayName: event.target.value }))
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Default persona</span>
                    <select
                      className="control"
                      value={profileForm.defaultAssistantPersona}
                      onChange={(event) => {
                        setProfileFlash(null)
                        setProfileForm((current) => ({
                          ...current,
                          defaultAssistantPersona: normalizeAssistantPersona(event.target.value),
                        }))
                      }}
                    >
                      {USER_PERSONA_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="field">
                  <span>AI context</span>
                  <textarea
                    className="control settings-profile-textarea"
                    value={profileForm.assistantContextBlurb}
                    maxLength={ASSISTANT_CONTEXT_BLURB_MAX_LENGTH}
                    placeholder="Role, working style, desk coverage, recurring preferences, and context the assistant should keep in mind."
                    onChange={(event) => {
                      setProfileFlash(null)
                      setProfileForm((current) => ({ ...current, assistantContextBlurb: event.target.value }))
                    }}
                  />
                </label>

                <div className="toolbar settings-actions">
                  <button
                    type="submit"
                    className="button button-primary"
                    disabled={profileSaving || !profileForm.displayName.trim()}
                  >
                    {profileSaving ? 'Saving Profile...' : 'Save Profile'}
                  </button>
                </div>

                <p className="settings-profile-count">
                  {profileForm.assistantContextBlurb.length} / {ASSISTANT_CONTEXT_BLURB_MAX_LENGTH}
                </p>
                <p className={`form-note ${profileFlash?.tone === 'error' ? 'form-note-error' : ''}`}>
                  {profileFlash?.message ??
                    'Assistant context is treated as preference and background only. It does not change permissions or approval policy.'}
                </p>
              </form>
            </>
          ) : (
            <div className="feedback-banner">Sign in to edit your user profile.</div>
          )}
        </SettingsDisclosureCard>

        <SettingsDisclosureCard
          cardKey="settings.appearance-card"
          eyebrow="Browser Settings"
          title="Appearance"
          summary={`${appearanceSummary} · ${appearancePreviewPalette.accent.toUpperCase()} accent`}
        >
          <div className="settings-summary-grid">
            <article className="settings-summary-card">
              <span>Workspace mode</span>
              <strong>{formatWorkspaceModeLabel(appearanceSettings.workspaceMode)}</strong>
              <p>
                {appearanceSettings.workspaceMode === 'terminal'
                  ? 'Signed-in root opens the live desk and hides the signed-in Start Here overlay.'
                  : 'Signed-in root stays prompt-first and keeps the broader onboarding shell available.'}
              </p>
            </article>
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
            <div className="section-head">
              <div>
                <span className="eyebrow">Workspace shell</span>
                <h3>Landing and density mode</h3>
              </div>
              <p>Choose whether this browser should open into the guided prompt flow or a denser monitor-first shell.</p>
            </div>

            <div className="appearance-mode-options" aria-label="Workspace mode preference">
              {WORKSPACE_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`appearance-mode-option ${appearanceForm.workspaceMode === option.value ? 'is-active' : ''}`}
                  aria-pressed={appearanceForm.workspaceMode === option.value}
                  onClick={() => {
                    setAppearanceFlash(null)
                    setAppearanceForm((current) => ({ ...current, workspaceMode: option.value }))
                  }}
                >
                  <span>{option.label}</span>
                  <strong>{option.detail}</strong>
                </button>
              ))}
            </div>

            <div className="section-head">
              <div>
                <span className="eyebrow">Color treatment</span>
                <h3>Theme and palette</h3>
              </div>
              <p>Keep the broader console palette in sync with the desk environment while preserving the shell mode above.</p>
            </div>

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
                Reset Appearance
              </button>
            </div>

            <p className={`form-note ${appearanceFlash?.tone === 'error' ? 'form-note-error' : ''}`}>
              {appearanceFlash?.message ??
                'Appearance settings are stored in this browser today. That includes the shell mode, landing preference, and palette while we prepare user-profile persistence on the API.'}
            </p>
          </form>
        </SettingsDisclosureCard>

        <SettingsDisclosureCard
          cardKey="settings.time-display-card"
          eyebrow="Browser Settings"
          title="Time Display"
          summary={timeDisplaySummary}
        >
          <div className="settings-summary-grid">
            <article className="settings-summary-card">
              <span>Saved preference</span>
              <strong>{timeZonePreferenceLabel}</strong>
              <p>Stored locally in this browser until the profile-backed settings API is ready.</p>
            </article>
            <article className="settings-summary-card">
              <span>Effective timezone</span>
              <strong>{resolvedTimeZoneLabel}</strong>
              <p>Home uses this timezone for the day, week, and month meters.</p>
            </article>
          </div>

          <form className="stack-form settings-form" onSubmit={handleSaveTimeDisplaySettings}>
            <label className="field">
              <span>Timezone</span>
              <select
                className="control"
                value={timeDisplayForm.timeZone}
                onChange={(event) => {
                  setTimeDisplayFlash(null)
                  setTimeDisplayForm((current) => ({ ...current, timeZone: event.target.value }))
                }}
              >
                {timeZoneOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="toolbar settings-actions">
              <button type="submit" className="button button-primary">
                Apply Timezone
              </button>
              <button type="button" className="button button-ghost" onClick={handleResetTimeDisplaySettings}>
                Use System Default
              </button>
            </div>

            <p className={`form-note ${timeDisplayFlash?.tone === 'error' ? 'form-note-error' : ''}`}>
              {timeDisplayFlash?.message ??
                'This timezone setting is stored in this browser today so each user can keep Home aligned to their own desk clock.'}
            </p>
          </form>
        </SettingsDisclosureCard>

        <SettingsDisclosureCard
          cardKey="settings.trade-ticket-defaults-card"
          eyebrow="Browser Settings"
          title="Trade Ticket Defaults"
          summary={tradeDefaultsSummary}
        >
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
        </SettingsDisclosureCard>

        <SettingsDisclosureCard
          cardKey="settings.client-overrides-card"
          eyebrow="Browser Settings"
          title="Client Overrides"
          summary={runtimeOverrideSummary}
        >
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
        </SettingsDisclosureCard>
      </section>

      <section className="stack">
        <SettingsDisclosureCard
          cardKey="settings.current-client-settings-card"
          eyebrow="Effective Runtime"
          title="Current Client Settings"
          summary={clientSettingsSummary}
        >
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
        </SettingsDisclosureCard>

        <SettingsDisclosureCard
          cardKey="settings.public-api-settings-card"
          eyebrow="Server Runtime"
          title="Public API Settings"
          summary={serverSettingsSummary}
        >
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
                      : serverSettings.google_auth.client_id
                        ? 'Google sign-in is off, but the browser still has a Google client ID for optional readonly calendar access.'
                        : 'Google sign-in is not enabled on the server.'}
                  </p>
                </article>
                <article className="settings-summary-card">
                  <span>Email delivery</span>
                  <strong>{formatProjectionMonitoringEmailStatusLabel(serverSettings.projection_monitoring_email)}</strong>
                  <p>{summarizeProjectionMonitoringEmail(serverSettings.projection_monitoring_email)}</p>
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
                <SettingsValueRow
                  label="Email transport"
                  value={formatProjectionMonitoringEmailStatusLabel(serverSettings.projection_monitoring_email)}
                  detail="Projection monitoring uses this path whenever the EMAIL alert channel is enabled."
                />
                <SettingsValueRow
                  label="Email recipients"
                  value={String(serverSettings.projection_monitoring_email.recipient_count)}
                  detail="Resolved from the configured recipient list or the active admin accounts."
                />
                <SettingsValueRow
                  label="Email sender"
                  value={serverSettings.projection_monitoring_email.sender}
                />
                <SettingsValueRow
                  label="SMTP host"
                  value={
                    serverSettings.projection_monitoring_email.smtp_host
                      ? `${serverSettings.projection_monitoring_email.smtp_host}:${serverSettings.projection_monitoring_email.smtp_port ?? ''}`
                      : 'Local archive fallback'
                  }
                  detail={
                    serverSettings.projection_monitoring_email.provider_hint === 'gmail'
                      ? 'Gmail delivery uses the server-owned SMTP path rather than browser-side mail access.'
                      : 'Without an SMTP host, email alerts are archived locally for review.'
                  }
                />
                <SettingsValueRow
                  label="SMTP auth"
                  value={formatProjectionMonitoringEmailAuthLabel(serverSettings.projection_monitoring_email)}
                  detail={
                    serverSettings.projection_monitoring_email.provider_hint === 'gmail'
                      ? 'Gmail usually needs a full Google email address plus an app password on the API.'
                      : 'Only readiness is surfaced here; secrets stay hidden on the server.'
                  }
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
        </SettingsDisclosureCard>

        <GoogleCalendarPanel
          googleClientId={serverSettings?.google_auth.client_id ?? null}
          googleAuthEnabled={Boolean(serverSettings?.google_auth.enabled)}
          runtimeSettingsLoading={serverSettingsLoading}
          runtimeSettingsError={serverSettingsError}
        />

        <UserEventsPanel authSession={authSession} />

        <SettingsDisclosureCard
          cardKey="settings.quick-read-card"
          eyebrow="Status"
          title="Quick Read"
          summary={quickReadSummary}
        >
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
        </SettingsDisclosureCard>
      </section>
    </div>
  )
}
