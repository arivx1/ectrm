import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from 'react'

import {
  approveAssistantActionRequest,
  listAssistantActionRequests,
  listAssistantPromptRouteRecommendations,
  loadAssistantRuntimeSettings,
  rejectAssistantActionRequest,
  requestAssistantResponse,
  submitAssistantPromptNavigationOutcome,
} from '../../entities/assistant/api'
import {
  AssistantActionRequestList,
  type AssistantActionDecisionPayload,
} from '../../entities/assistant/AssistantActionRequestList'
import {
  loadInvoiceIssueCandidates,
  loadTradeAttentionCandidates,
  type InvoiceIssueCandidateRecord,
  type TradeAttentionCandidateRecord,
} from '../../entities/app/api'
import {
  buildPromptNavigationIntentKey,
  buildPromptNavigationRouteHandoff,
  INVALID_PROMPT_NAVIGATION_WARNING,
  normalizePromptNavigationIntent,
  parsePromptNavigationIntentsFromAssistantContent,
  promptNavigationIntentDetail,
  promptNavigationIntentLabel,
  type PromptNavigationIntent,
} from '../../entities/app/promptNavigationIntent'
import { appConfig } from '../../shared/config'
import { usePersistentCollapsibleCardState } from '../../shared/collapsibleCardState'
import type { AppRouteHandoff } from '../../shared/appRouteHandoff'
import type {
  AssistantActionRequest,
  AssistantProvider,
  AssistantPromptRouteRecommendation,
  AssistantRuntimeSettings,
  AssistantWorkspaceSummaryTarget,
  AssetRecord,
  LocationRecord,
  SpatialFeatureRecord,
  ViewKey,
  WeatherLocationRecord,
  WeatherSyncStatusRecord,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  clearPromptResumeIntent,
  getPromptResumeIntent,
  savePromptResumeIntent,
  savePromptSignInReturnIntent,
  subscribePromptResumeIntent,
} from '../../shared/promptResumeIntent'
import {
  formatTimeDisplayTimeZonePreferenceLabel,
  getTimeDisplaySettingsSnapshot,
  listTimeDisplayTimeZoneOptions,
  resolveTimeDisplayTimeZone,
  saveTimeDisplaySettingsSnapshot,
  type TimeDisplaySettings,
  type TimeDisplayTimeZoneOption,
} from '../../shared/timeDisplaySettings'
import {
  assetMapSubtypeLabelForAsset,
  buildAssetMapSummary,
  formatAssetMapPlacement,
  formatAssetMapSource,
} from '../../features/reference-data/assetMap'
import {
  type PromptHomeCounts,
} from './promptHomeStarters'
import { shouldAutoEnsurePromptHomeData } from './promptHomeAutoLoad'
import {
  PROMPT_HOME_PROMPT_KITS,
  type PromptHomePromptKit,
} from './promptHomePromptKits'
import {
  getPromptHomeNextClockTickDelay,
} from './promptHomeClock'
import { buildPromptHomePromotedRoutes } from './promptPromotedRoutes'
import {
  AssetMapCanvas,
  sortedUniqueAssetSubtypes,
  syncAssetSubtypeVisibilityState,
} from '../reference-data/tabs/AssetMapPanel'

type PromptHomeWorkspaceProps = {
  authSession: StoredAuthSession | null
  health: string
  counts: PromptHomeCounts
  assets?: AssetRecord[]
  locations?: LocationRecord[]
  spatialFeatures?: SpatialFeatureRecord[]
  weatherLocations?: WeatherLocationRecord[]
  weatherSyncStatus?: WeatherSyncStatusRecord | null
  referenceDataLoaded?: boolean
  referenceDataLoading?: boolean
  onEnsureReferenceData?: () => Promise<void>
  weatherDataLoaded?: boolean
  weatherDataLoading?: boolean
  weatherDataError?: string
  onEnsureWeatherData?: () => Promise<void>
  onOpenView: (view: ViewKey, handoff?: AppRouteHandoff | null) => void
  onRefreshData?: () => Promise<void>
  initialMessages?: PromptHomeMessage[]
}

type PromptHomeMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  provider?: AssistantProvider
  model?: string
  runId?: number | null
  warnings?: string[]
  actionRequests?: AssistantActionRequest[]
  navigationIntents?: PromptNavigationIntent[]
}

const QUICK_PROMPTS = [
  'What needs my attention right now?',
  'Summarize the open operations queue.',
  'Where should I look for exposure risk today?',
  'Help me decide which workspace to use for a trade issue.',
]

const NAVIGATION_INTENTS: PromptNavigationIntent[] = [
  {
    kind: 'open_workspace',
    targetView: 'dashboard',
    label: 'Open Live Desk',
    rationale: 'Use the old dashboard for market pulse, desk health, and high-level exposure.',
  },
  {
    kind: 'open_workspace',
    targetView: 'trades',
    label: 'Open Trade Capture',
    rationale: 'Use the ticket and blotter workflow when you need to book, inspect, amend, or cancel a trade.',
  },
  {
    kind: 'open_workspace',
    targetView: 'operations',
    label: 'Open Work Queue',
    rationale: 'Use the post-trade queue for confirmations, delivery blockers, approvals, and handoffs.',
  },
  {
    kind: 'open_workspace',
    targetView: 'settlement',
    label: 'Open Settlement',
    rationale: 'Use settlement for invoices, payments, aging, and cash exceptions.',
  },
]

const PROMPT_HOME_REVIEW_PANEL_ID = 'prompt-home-review-panel'
const PROMPT_HOME_DIRECT_PANEL_ID = 'prompt-home-direct-panel'
const PROMPT_HOME_TIMEFRAME_PANEL_ID = 'prompt-home-timeframe-panel'
const PROMPT_HOME_DAY_PANEL_ID = 'prompt-home-day-panel'
const PROMPT_HOME_WEEK_PANEL_ID = 'prompt-home-week-panel'
const PROMPT_HOME_MONTH_PANEL_ID = 'prompt-home-month-panel'
const PROMPT_HOME_MAP_PANEL_ID = 'prompt-home-map-panel'
const PROMPT_HOME_TRADING_HOURS_PANEL_ID = 'prompt-home-trading-hours-panel'
const PROMPT_HOME_DAY_HOURS = 24
const PROMPT_HOME_DAY_MINUTES = PROMPT_HOME_DAY_HOURS * 60
const PROMPT_HOME_WEEK_DAYS = 7
const PROMPT_HOME_WEEK_MINUTES = PROMPT_HOME_WEEK_DAYS * PROMPT_HOME_DAY_MINUTES
const PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING = 7
const PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING = 22
const PROMPT_HOME_DAY_METER_TICKS = [0, 6, 12, 18, 24]
const PROMPT_HOME_WEEKDAY_SHORT_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const PROMPT_HOME_WEEKDAY_FULL_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

type PromptHomeMeterTick = {
  key: string
  label: string
  percent: number
  align?: 'start' | 'center' | 'end'
}

type PromptHomeMeterMarker = {
  key: string
  label: string
  detail: string
  percent: number
  align?: 'start' | 'end'
}

type PromptHomeZonedDateParts = {
  year: number
  month: number
  day: number
  weekdayIndex: number
  hour: number
  minute: number
  second: number
}

type PromptHomeExchangeSessionWindow = {
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
}

type PromptHomeExchangeSessionDefinition = {
  key: string
  label: string
  detail: string
  tone:
    | 'ice'
    | 'lme'
    | 'lme-ring'
    | 'sgx'
    | 'cme'
    | 'eex'
    | 'tocom'
  sourceTimeZone: string
  sourceWindowLabel: string
  windows: PromptHomeExchangeSessionWindow[]
}

type PromptHomeExchangeSessionSegment = {
  key: string
  startPercent: number
  widthPercent: number
}

type PromptHomeExchangeSessionLane = PromptHomeExchangeSessionDefinition & {
  displayWindowLabel: string
  segments: PromptHomeExchangeSessionSegment[]
}

const PROMPT_HOME_MAJOR_EXCHANGE_SESSIONS: PromptHomeExchangeSessionDefinition[] = [
  {
    key: 'ice-brent',
    label: 'ICE Brent',
    detail: 'Representative Brent crude session',
    tone: 'ice',
    sourceTimeZone: 'Europe/London',
    sourceWindowLabel: '01:00-23:00 London',
    windows: [{ startHour: 1, startMinute: 0, endHour: 23, endMinute: 0 }],
  },
  {
    key: 'lme-electronic',
    label: 'LMEselect',
    detail: 'Electronic metals session',
    tone: 'lme',
    sourceTimeZone: 'Europe/London',
    sourceWindowLabel: '01:00-19:00 London',
    windows: [{ startHour: 1, startMinute: 0, endHour: 19, endMinute: 0 }],
  },
  {
    key: 'lme-ring',
    label: 'LME Ring',
    detail: 'Open-outcry reference session',
    tone: 'lme-ring',
    sourceTimeZone: 'Europe/London',
    sourceWindowLabel: '11:40-17:00 London',
    windows: [{ startHour: 11, startMinute: 40, endHour: 17, endMinute: 0 }],
  },
  {
    key: 'sgx-msci',
    label: 'SGX MSCI',
    detail: 'T and T+1 futures sessions',
    tone: 'sgx',
    sourceTimeZone: 'Asia/Singapore',
    sourceWindowLabel: '08:30-17:20 / 17:50-05:15 Singapore',
    windows: [
      { startHour: 8, startMinute: 30, endHour: 17, endMinute: 20 },
      { startHour: 17, startMinute: 50, endHour: 5, endMinute: 15 },
    ],
  },
  {
    key: 'cme-wti',
    label: 'CME WTI',
    detail: 'NYMEX WTI on CME Globex',
    tone: 'cme',
    sourceTimeZone: 'America/Chicago',
    sourceWindowLabel: '17:00-16:00 Central',
    windows: [{ startHour: 17, startMinute: 0, endHour: 16, endMinute: 0 }],
  },
  {
    key: 'eex-power',
    label: 'EEX Power',
    detail: 'Representative power derivatives session',
    tone: 'eex',
    sourceTimeZone: 'Europe/Berlin',
    sourceWindowLabel: '08:00-18:00 Central Europe',
    windows: [{ startHour: 8, startMinute: 0, endHour: 18, endMinute: 0 }],
  },
  {
    key: 'tocom-energy',
    label: 'TOCOM Energy',
    detail: 'Representative Japan energy session',
    tone: 'tocom',
    sourceTimeZone: 'Asia/Tokyo',
    sourceWindowLabel: '08:45-15:40 / 17:00-05:55 Tokyo',
    windows: [
      { startHour: 8, startMinute: 45, endHour: 15, endMinute: 40 },
      { startHour: 17, startMinute: 0, endHour: 5, endMinute: 55 },
    ],
  },
]

function createPromptMessageId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function meterPercentForRatio(value: number, total: number): number {
  if (total <= 0) {
    return 0
  }

  return clampPercent((value / total) * 100)
}

function meterPercentForHourEnding(hourEnding: number): number {
  return meterPercentForRatio(hourEnding, PROMPT_HOME_DAY_HOURS)
}

function normalizeMinutes(value: number): number {
  return ((value % PROMPT_HOME_DAY_MINUTES) + PROMPT_HOME_DAY_MINUTES) % PROMPT_HOME_DAY_MINUTES
}

function minutesIntoDay(parts: PromptHomeZonedDateParts): number {
  return parts.hour * 60 + parts.minute + parts.second / 60
}

function formatHourEndingLabel(hourEnding: number): string {
  return `HE${hourEnding.toString().padStart(2, '0')}`
}

function currentHourEnding(parts: PromptHomeZonedDateParts): number {
  if (parts.minute === 0 && parts.second === 0) {
    return parts.hour
  }

  return Math.min(PROMPT_HOME_DAY_HOURS, parts.hour + 1)
}

function formatPromptHomeClockTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)
}

function formatPromptHomeMonthLabel(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long',
    year: 'numeric',
  }).format(value)
}

function formatPromptHomeMonthDayLabel(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
  }).format(value)
}

function formatPromptHomeSummaryMonthDayLabel(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: '2-digit',
  }).format(value)
}

function dayCountSuffix(value: number): string {
  if (value % 100 >= 11 && value % 100 <= 13) {
    return 'th'
  }

  switch (value % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

function formatOrdinal(value: number): string {
  return `${value}${dayCountSuffix(value)}`
}

function parseFormatterParts(parts: Intl.DateTimeFormatPart[]): PromptHomeZonedDateParts {
  const values: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value
    }
  }

  const weekdayIndex = PROMPT_HOME_WEEKDAY_SHORT_LABELS.indexOf(
    (values.weekday ?? 'Sun') as (typeof PROMPT_HOME_WEEKDAY_SHORT_LABELS)[number],
  )

  return {
    year: Number.parseInt(values.year ?? '1970', 10),
    month: Number.parseInt(values.month ?? '1', 10),
    day: Number.parseInt(values.day ?? '1', 10),
    weekdayIndex: weekdayIndex >= 0 ? weekdayIndex : 0,
    hour: Number.parseInt(values.hour ?? '0', 10),
    minute: Number.parseInt(values.minute ?? '0', 10),
    second: Number.parseInt(values.second ?? '0', 10),
  }
}

function getPromptHomeZonedDateParts(value: Date, timeZone: string): PromptHomeZonedDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  })

  return parseFormatterParts(formatter.formatToParts(value))
}

function parseTimeZoneOffsetLabel(value: string): number | null {
  if (value === 'GMT' || value === 'UTC') {
    return 0
  }

  const match = value.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/)
  if (!match) {
    return null
  }

  const sign = match[1] === '-' ? -1 : 1
  const hours = Number.parseInt(match[2] ?? '0', 10)
  const minutes = Number.parseInt(match[3] ?? '0', 10)
  return sign * (hours * 60 + minutes)
}

function getTimeZoneOffsetMinutes(value: Date, timeZone: string): number {
  const offsetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const offsetLabel = offsetFormatter.formatToParts(value).find((part) => part.type === 'timeZoneName')?.value
  const parsedOffset = offsetLabel ? parseTimeZoneOffsetLabel(offsetLabel) : null
  if (parsedOffset !== null) {
    return parsedOffset
  }

  const zonedDateParts = getPromptHomeZonedDateParts(value, timeZone)
  const zonedTimestamp = Date.UTC(
    zonedDateParts.year,
    zonedDateParts.month - 1,
    zonedDateParts.day,
    zonedDateParts.hour,
    zonedDateParts.minute,
    zonedDateParts.second,
  )
  return Math.round((zonedTimestamp - value.getTime()) / 60_000)
}

function daysInMonth(parts: PromptHomeZonedDateParts): number {
  return new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate()
}

function windowDurationMinutes(window: PromptHomeExchangeSessionWindow): number {
  const startMinutes = window.startHour * 60 + window.startMinute
  const endMinutes = window.endHour * 60 + window.endMinute
  return endMinutes > startMinutes
    ? endMinutes - startMinutes
    : PROMPT_HOME_DAY_MINUTES - startMinutes + endMinutes
}

function formatPromptHomeClockMinutes(value: number): string {
  const normalizedValue = normalizeMinutes(value)
  const hours = Math.floor(normalizedValue / 60)
  const minutes = normalizedValue % 60
  const displayHour = hours % 12 === 0 ? 12 : hours % 12
  const meridiem = hours >= 12 ? 'PM' : 'AM'
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${meridiem}`
}

function buildExchangeSessionWindowDisplayLabel(args: {
  window: PromptHomeExchangeSessionWindow
  sourceOffsetMinutes: number
  targetOffsetMinutes: number
}): string {
  const sourceStartMinutes = args.window.startHour * 60 + args.window.startMinute
  const durationMinutes = windowDurationMinutes(args.window)
  const targetStartMinutes = normalizeMinutes(
    sourceStartMinutes - args.sourceOffsetMinutes + args.targetOffsetMinutes,
  )
  const targetEndMinutes = normalizeMinutes(targetStartMinutes + durationMinutes)
  const wrapsToNextDay = durationMinutes > PROMPT_HOME_DAY_MINUTES - targetStartMinutes

  return `${formatPromptHomeClockMinutes(targetStartMinutes)} to ${formatPromptHomeClockMinutes(
    targetEndMinutes,
  )}${wrapsToNextDay ? ' next day' : ''}`
}

function buildExchangeSessionWindowSegments(args: {
  keyPrefix: string
  window: PromptHomeExchangeSessionWindow
  sourceOffsetMinutes: number
  targetOffsetMinutes: number
}): PromptHomeExchangeSessionSegment[] {
  const sourceStartMinutes = args.window.startHour * 60 + args.window.startMinute
  const durationMinutes = windowDurationMinutes(args.window)
  if (durationMinutes <= 0) {
    return []
  }

  const targetStartMinutes = normalizeMinutes(
    sourceStartMinutes - args.sourceOffsetMinutes + args.targetOffsetMinutes,
  )
  const firstSegmentMinutes =
    durationMinutes >= PROMPT_HOME_DAY_MINUTES
      ? PROMPT_HOME_DAY_MINUTES
      : Math.min(durationMinutes, PROMPT_HOME_DAY_MINUTES - targetStartMinutes)
  const segments: PromptHomeExchangeSessionSegment[] = [
    {
      key: `${args.keyPrefix}-0`,
      startPercent: meterPercentForRatio(targetStartMinutes, PROMPT_HOME_DAY_MINUTES),
      widthPercent: meterPercentForRatio(firstSegmentMinutes, PROMPT_HOME_DAY_MINUTES),
    },
  ]
  const remainingMinutes = durationMinutes - firstSegmentMinutes

  if (remainingMinutes > 0) {
    segments.push({
      key: `${args.keyPrefix}-1`,
      startPercent: 0,
      widthPercent: meterPercentForRatio(remainingMinutes, PROMPT_HOME_DAY_MINUTES),
    })
  }

  return segments.filter((segment) => segment.widthPercent > 0)
}

function buildPromptHomeExchangeSessionLane(
  definition: PromptHomeExchangeSessionDefinition,
  targetTimeZone: string,
  currentTime: Date,
): PromptHomeExchangeSessionLane {
  const sourceOffsetMinutes = getTimeZoneOffsetMinutes(currentTime, definition.sourceTimeZone)
  const targetOffsetMinutes = getTimeZoneOffsetMinutes(currentTime, targetTimeZone)

  return {
    ...definition,
    displayWindowLabel: definition.windows
      .map((window) =>
        buildExchangeSessionWindowDisplayLabel({
          window,
          sourceOffsetMinutes,
          targetOffsetMinutes,
        }),
      )
      .join(' / '),
    segments: definition.windows.flatMap((window, index) =>
      buildExchangeSessionWindowSegments({
        keyPrefix: `${definition.key}-${index}`,
        window,
        sourceOffsetMinutes,
        targetOffsetMinutes,
      }),
    ),
  }
}

function buildWeekMeterTicks(): PromptHomeMeterTick[] {
  return PROMPT_HOME_WEEKDAY_SHORT_LABELS.map((label, index) => ({
    key: label,
    label,
    percent: meterPercentForRatio(index, PROMPT_HOME_WEEK_DAYS - 1),
    align: index === 0 ? 'start' : index === PROMPT_HOME_WEEK_DAYS - 1 ? 'end' : 'center',
  }))
}

function buildMonthMeterTicks(dayTotal: number): PromptHomeMeterTick[] {
  const checkpoints = [1, Math.ceil(dayTotal * 0.25), Math.ceil(dayTotal * 0.5), Math.ceil(dayTotal * 0.75), dayTotal]
  const uniqueCheckpoints = checkpoints.filter((day, index) => checkpoints.indexOf(day) === index)

  return uniqueCheckpoints.map((day, index) => ({
    key: String(day),
    label: day === dayTotal ? 'EOM' : String(day),
    percent: meterPercentForRatio(day - 1, Math.max(dayTotal - 1, 1)),
    align: index === 0 ? 'start' : index === uniqueCheckpoints.length - 1 ? 'end' : 'center',
  }))
}

function formatCount(value: number | null): string {
  return typeof value === 'number' ? value.toLocaleString() : 'n/a'
}

function formatPromptTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'n/a'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

function formatPromotedRouteEvidence(
  recommendation: AssistantPromptRouteRecommendation,
): string {
  const acceptanceLabel =
    typeof recommendation.acceptance_rate === 'number' && Number.isFinite(recommendation.acceptance_rate)
      ? `${Math.round(recommendation.acceptance_rate * 100)}% accepted`
      : 'Accepted route'
  return `${recommendation.accepted_count}/${recommendation.outcome_count} accepted · ${acceptanceLabel}`
}

function formatPromotedRouteSummary(
  routes: Array<{ readiness: 'ready' | 'waiting' | 'cooling_off' }>,
): string {
  const readyCount = routes.filter((route) => route.readiness === 'ready').length
  const waitingCount = routes.filter((route) => route.readiness === 'waiting').length
  const coolingCount = routes.filter((route) => route.readiness === 'cooling_off').length
  const parts: string[] = []
  if (readyCount > 0) {
    parts.push(`${readyCount} ready`)
  }
  if (waitingCount > 0) {
    parts.push(`${waitingCount} gathering more signal`)
  }
  if (coolingCount > 0) {
    parts.push(`${coolingCount} cooling off`)
  }

  return parts.length > 0
    ? `Promoted routes: ${parts.join(' · ')}.`
    : 'Repeated accepted Home handoffs will appear here once a route stabilizes.'
}

function resolveDefaultProvider(settings: AssistantRuntimeSettings): AssistantProvider | '' {
  return (
    settings.effective_default_provider ??
    settings.providers.find((provider) => provider.enabled)?.provider ??
    settings.providers.find((provider) => provider.configured)?.provider ??
    ''
  )
}

function buildPromptHomeContext(args: {
  health: string
  counts: PromptHomeCounts
  displayName: string
}): string {
  return [
    'Current workspace: prompt-first operator home.',
    `Authenticated user: ${args.displayName}.`,
    `API health: ${args.health}.`,
    `Active trades: ${formatCount(args.counts.activeTrades)}.`,
    `Open workflow items: ${formatCount(args.counts.openWorkItems)}.`,
    `Pending invoices: ${formatCount(args.counts.pendingInvoices)}.`,
    `Payments due: ${formatCount(args.counts.paymentsDue)}.`,
    `Dashboard attention items: ${formatCount(args.counts.attentionItems)}.`,
    'If the user needs to perform a business write, stage or describe the governed action path instead of claiming it has been executed.',
    'When opening an existing workspace would help, include a fenced navigation_intent JSON block after the user-facing answer. Use shape {"kind":"open_workspace","targetView":"operations","label":"Open Work Queue","rationale":"Why this is the right destination","focus":{"type":"trade","id":"TRD-1001","label":"TRD-1001"},"inspectorTab":"events"}. Navigation intents move the UI only and never execute business changes.',
  ].join('\n')
}

function replacePromptMessageActionRequest(
  currentMessages: PromptHomeMessage[],
  updatedActionRequest: AssistantActionRequest,
): PromptHomeMessage[] {
  return currentMessages.map((message) => {
    if (!message.actionRequests?.some((request) => request.action_request_id === updatedActionRequest.action_request_id)) {
      return message
    }

    return {
      ...message,
      actionRequests: message.actionRequests.map((request) =>
        request.action_request_id === updatedActionRequest.action_request_id
          ? updatedActionRequest
          : request,
      ),
    }
  })
}

function removePromptNavigationIntent(
  currentMessages: PromptHomeMessage[],
  args: {
    messageId: string
    intentKey: string
  },
): PromptHomeMessage[] {
  return currentMessages.map((message) => {
    if (message.id !== args.messageId || !message.navigationIntents?.length) {
      return message
    }

    return {
      ...message,
      navigationIntents: message.navigationIntents.filter(
        (intent) => buildPromptNavigationIntentKey(intent) !== args.intentKey,
      ),
    }
  })
}

function PromptHomeTimeMeterCard({
  panelId,
  eyebrow,
  title,
  detail,
  badge,
  meta,
  collapsedSummary = meta,
  ticks,
  markers = [],
  currentPercent,
  ariaLabel,
  highlightedWindowStartPercent,
  highlightedWindowWidthPercent,
  expanded,
  onToggle,
  children,
}: {
  panelId: string
  eyebrow: string
  title: string
  detail: string
  badge: string
  meta: string
  collapsedSummary?: string
  ticks: PromptHomeMeterTick[]
  markers?: PromptHomeMeterMarker[]
  currentPercent: number
  ariaLabel: string
  highlightedWindowStartPercent?: number
  highlightedWindowWidthPercent?: number
  expanded: boolean
  onToggle: () => void
  children?: ReactNode
}) {
  return (
    <article
      className={`prompt-home-time-meter-card ${expanded ? 'is-expanded' : 'is-collapsed'}`}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="prompt-home-time-meter-card-toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <div className="prompt-home-time-meter-card-head">
          <div className={`prompt-home-time-meter-card-copy${expanded ? '' : ' is-collapsed'}`}>
            {expanded ? (
              <>
                <span className="eyebrow">{eyebrow}</span>
                <strong>{title}</strong>
              </>
            ) : (
              <div className="prompt-home-time-meter-card-collapsed-line">
                <span className="eyebrow prompt-home-time-meter-card-inline-eyebrow">{eyebrow}</span>
                <strong>{title}</strong>
                <small className="prompt-home-time-meter-card-summary">{collapsedSummary}</small>
              </div>
            )}
          </div>
          <div className="prompt-home-time-meter-card-toggle-side">
            <div className="prompt-home-time-meter-card-toggle-meta">
              <small>{expanded ? 'Hide card' : 'Show card'}</small>
              <span className="prompt-home-support-toggle-indicator" aria-hidden="true">
                {expanded ? '−' : '+'}
              </span>
            </div>
            <span className="status-pill status-pill-active">{badge}</span>
          </div>
        </div>
      </button>

      <div id={panelId} className="prompt-home-time-meter-card-body" hidden={!expanded}>
        <div className="prompt-home-time-meter-card-body-head">
          <p>{detail}</p>
          <small>{meta}</small>
        </div>

        {markers.length > 0 ? (
          <div className="prompt-home-time-meter-markers" aria-hidden="true">
            {markers.map((marker) => (
              <div
                key={marker.key}
                className={`prompt-home-time-meter-marker ${marker.align === 'end' ? 'is-end' : 'is-start'}`}
                style={{ left: `${marker.percent}%` }}
              >
                <span>{marker.label}</span>
                <strong>{marker.detail}</strong>
              </div>
            ))}
          </div>
        ) : null}

        <div className="prompt-home-time-meter-scale" aria-hidden="true">
          {typeof highlightedWindowStartPercent === 'number' &&
          typeof highlightedWindowWidthPercent === 'number' ? (
            <span
              className="prompt-home-time-meter-window"
              style={{
                left: `${highlightedWindowStartPercent}%`,
                width: `${highlightedWindowWidthPercent}%`,
              }}
            />
          ) : null}
          {markers.map((marker) => (
            <span
              key={`${marker.key}-boundary`}
              className="prompt-home-time-meter-boundary"
              style={{ left: `${marker.percent}%` }}
            />
          ))}
          <span className="prompt-home-time-meter-now" style={{ left: `${currentPercent}%` }} />
        </div>

        <div className="prompt-home-time-meter-ticks" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick.key}
              className={`prompt-home-time-meter-tick ${
                tick.align === 'start' ? 'is-start' : tick.align === 'end' ? 'is-end' : ''
              }`}
              style={{ left: `${tick.percent}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        {children}
      </div>
    </article>
  )
}

function PromptHomeMapTile({
  assets,
  locations,
  spatialFeatures,
  weatherLocations,
  weatherSyncStatus,
  weatherDataLoaded,
  weatherDataLoading,
  weatherDataError,
  onOpenMapWorkspace,
}: {
  assets: AssetRecord[]
  locations: LocationRecord[]
  spatialFeatures: SpatialFeatureRecord[]
  weatherLocations: WeatherLocationRecord[]
  weatherSyncStatus: WeatherSyncStatusRecord | null
  weatherDataLoaded?: boolean
  weatherDataLoading?: boolean
  weatherDataError?: string
  onOpenMapWorkspace: () => void
}) {
  const mapExpandedState = usePersistentCollapsibleCardState('prompt-home.map-card', true)
  const [selectedAssetCode, setSelectedAssetCode] = useState<string | null>(null)
  const [assetSubtypeVisibility, setAssetSubtypeVisibility] = useState<Record<string, boolean>>({})
  const mapSummary = useMemo(() => buildAssetMapSummary(assets, locations), [assets, locations])
  const assetSubtypeOptions = useMemo(
    () => sortedUniqueAssetSubtypes(mapSummary.records),
    [mapSummary.records],
  )
  const normalizedAssetSubtypeVisibility = useMemo(
    () => syncAssetSubtypeVisibilityState(assetSubtypeOptions, assetSubtypeVisibility),
    [assetSubtypeOptions, assetSubtypeVisibility],
  )
  const visibleRecordCandidates = useMemo(
    () =>
      mapSummary.records.filter(
        (record) => normalizedAssetSubtypeVisibility[assetMapSubtypeLabelForAsset(record.asset)] !== false,
      ),
    [mapSummary.records, normalizedAssetSubtypeVisibility],
  )
  const visibleMappedRecords = useMemo(
    () =>
      mapSummary.mappedRecords.filter(
        (record) => normalizedAssetSubtypeVisibility[assetMapSubtypeLabelForAsset(record.asset)] !== false,
      ),
    [mapSummary.mappedRecords, normalizedAssetSubtypeVisibility],
  )
  const activeSpatialFeatures = useMemo(
    () => spatialFeatures.filter((feature) => feature.is_active),
    [spatialFeatures],
  )

  const activeSelectedAssetCode = useMemo(
    () =>
      selectedAssetCode && visibleMappedRecords.some((record) => record.asset.code === selectedAssetCode)
        ? selectedAssetCode
        : null,
    [selectedAssetCode, visibleMappedRecords],
  )
  const selectedRecord = useMemo(
    () => visibleMappedRecords.find((record) => record.asset.code === activeSelectedAssetCode) ?? null,
    [activeSelectedAssetCode, visibleMappedRecords],
  )
  const statusTitle =
    visibleMappedRecords.length === 0
      ? visibleRecordCandidates.length === 0 && assetSubtypeOptions.length > 0
        ? 'No selected asset categories are visible right now.'
        : 'No map-ready assets yet.'
      : null
  const statusDetail =
    visibleMappedRecords.length === 0
      ? visibleRecordCandidates.length === 0 && assetSubtypeOptions.length > 0
        ? 'Turn at least one asset category back on to restore plotted assets.'
        : 'The base map still loads here. Assets appear once they have GeoJSON, direct coordinates, or linked location coordinates.'
      : null

  function handleToggleAssetSubtype(assetSubtype: string) {
    setAssetSubtypeVisibility((currentState) => {
      const nextState = syncAssetSubtypeVisibilityState(assetSubtypeOptions, currentState)
      return {
        ...nextState,
        [assetSubtype]: nextState[assetSubtype] === false,
      }
    })
  }

  return (
    <article className="prompt-home-map-card">
      <button
        type="button"
        className="prompt-home-map-card-toggle"
        aria-expanded={mapExpandedState.expanded}
        aria-controls={PROMPT_HOME_MAP_PANEL_ID}
        onClick={() => mapExpandedState.setExpanded((current) => !current)}
      >
        <div className="prompt-home-map-card-head">
          <div className="prompt-home-map-card-copy">
            <strong>Map</strong>
          </div>
          <div className="prompt-home-map-card-toggle-side">
            <div className="prompt-home-map-card-toggle-meta">
              <small>{mapExpandedState.expanded ? 'Hide card' : 'Show card'}</small>
              <span className="prompt-home-support-toggle-indicator" aria-hidden="true">
                {mapExpandedState.expanded ? '−' : '+'}
              </span>
            </div>
          </div>
        </div>
      </button>

      <div id={PROMPT_HOME_MAP_PANEL_ID} className="prompt-home-map-card-body" hidden={!mapExpandedState.expanded}>
        <AssetMapCanvas
          records={visibleMappedRecords}
          spatialFeatures={activeSpatialFeatures}
          weatherLocations={weatherLocations}
          weatherSyncStatus={weatherSyncStatus}
          assetSubtypeOptions={assetSubtypeOptions}
          assetSubtypeVisibility={normalizedAssetSubtypeVisibility}
          weatherDataLoaded={weatherDataLoaded}
          weatherDataLoading={weatherDataLoading}
          weatherLoadError={weatherDataError}
          onToggleAssetSubtype={handleToggleAssetSubtype}
          selectedAssetCode={activeSelectedAssetCode}
          onSelectAsset={setSelectedAssetCode}
          statusTitle={statusTitle}
          statusDetail={statusDetail}
        />

        <div
          className={`prompt-home-map-card-footer ${selectedRecord ? '' : 'is-actions-only'}`.trim()}
        >
          {selectedRecord ? (
            <div className="prompt-home-map-card-selection">
              <strong>{selectedRecord.asset.code}</strong>
              <p>{`${selectedRecord.asset.name} · ${formatAssetMapSource(selectedRecord)}`}</p>
              <p>{formatAssetMapPlacement(selectedRecord)}</p>
            </div>
          ) : null}
          <button type="button" className="button button-secondary" onClick={onOpenMapWorkspace}>
            Open Map Workspace
          </button>
        </div>
      </div>
    </article>
  )
}

function PromptHomeTimeframePanel({
  currentTime,
  timeDisplaySettings,
  timeZoneOptions,
  onTimeZoneChange,
}: {
  currentTime: Date
  timeDisplaySettings: TimeDisplaySettings
  timeZoneOptions: TimeDisplayTimeZoneOption[]
  onTimeZoneChange: (nextTimeZone: string) => void
}) {
  const timeframeExpandedState = usePersistentCollapsibleCardState('prompt-home.timeframe-panel', true)
  const dayCardExpandedState = usePersistentCollapsibleCardState('prompt-home.timeframe.day-card', true)
  const weekCardExpandedState = usePersistentCollapsibleCardState('prompt-home.timeframe.week-card', true)
  const monthCardExpandedState = usePersistentCollapsibleCardState('prompt-home.timeframe.month-card', true)
  const exchangeSessionsExpandedState = usePersistentCollapsibleCardState(
    'prompt-home.timeframe.trading-hours',
    false,
  )
  const resolvedTimeZone = resolveTimeDisplayTimeZone(timeDisplaySettings)
  const timeZonePreferenceLabel = formatTimeDisplayTimeZonePreferenceLabel(timeDisplaySettings)
  const zonedDateParts = getPromptHomeZonedDateParts(currentTime, resolvedTimeZone)
  const currentClockLabel = formatPromptHomeClockTime(currentTime, resolvedTimeZone)
  const currentMonthLabel = formatPromptHomeMonthLabel(currentTime, resolvedTimeZone)
  const currentMonthDayLabel = formatPromptHomeMonthDayLabel(currentTime, resolvedTimeZone)
  const currentSummaryMonthDayLabel = formatPromptHomeSummaryMonthDayLabel(currentTime, resolvedTimeZone)
  const currentHourEndingLabel = formatHourEndingLabel(currentHourEnding(zonedDateParts))
  const currentWeekdayLabel = PROMPT_HOME_WEEKDAY_FULL_LABELS[zonedDateParts.weekdayIndex]
  const currentDayPercent = meterPercentForRatio(minutesIntoDay(zonedDateParts), PROMPT_HOME_DAY_MINUTES)
  const currentWeekPercent = meterPercentForRatio(
    zonedDateParts.weekdayIndex * PROMPT_HOME_DAY_MINUTES + minutesIntoDay(zonedDateParts),
    PROMPT_HOME_WEEK_MINUTES,
  )
  const monthDayTotal = daysInMonth(zonedDateParts)
  const timeframeCollapsedSummary = [
    currentClockLabel,
    currentHourEndingLabel,
    currentWeekdayLabel,
    currentSummaryMonthDayLabel,
  ].join(' | ')
  const currentMonthPercent = meterPercentForRatio(
    (zonedDateParts.day - 1) * PROMPT_HOME_DAY_MINUTES + minutesIntoDay(zonedDateParts),
    monthDayTotal * PROMPT_HOME_DAY_MINUTES,
  )
  const tradingWindowStartPercent = meterPercentForHourEnding(
    PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING,
  )
  const tradingWindowEndPercent = meterPercentForHourEnding(
    PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING,
  )
  const tradingWindowWidthPercent = tradingWindowEndPercent - tradingWindowStartPercent
  const dayTicks: PromptHomeMeterTick[] = PROMPT_HOME_DAY_METER_TICKS.map((tick, index) => ({
    key: String(tick),
    label: formatHourEndingLabel(tick),
    percent: meterPercentForHourEnding(tick),
    align: index === 0 ? 'start' : index === PROMPT_HOME_DAY_METER_TICKS.length - 1 ? 'end' : 'center',
  }))
  const weekTicks = buildWeekMeterTicks()
  const monthTicks = buildMonthMeterTicks(monthDayTotal)
  const exchangeSessionLanes = PROMPT_HOME_MAJOR_EXCHANGE_SESSIONS.map((session) =>
    buildPromptHomeExchangeSessionLane(session, resolvedTimeZone, currentTime),
  )
  const tradingMarkers: PromptHomeMeterMarker[] = [
    {
      key: 'open',
      label: 'Trading opens',
      detail: formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING),
      percent: tradingWindowStartPercent,
      align: 'start',
    },
    {
      key: 'close',
      label: 'Trading closes',
      detail: formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING),
      percent: tradingWindowEndPercent,
      align: 'end',
    },
  ]
  return (
    <section className="prompt-home-timeframe-panel">
      <div className="prompt-home-timeframe-panel-head">
        <div className="prompt-home-timeframe-panel-toggle">
          <div className="prompt-home-timeframe-panel-copy">
            <span className="eyebrow">Desk Time</span>
            <strong>Desk clocks and calendars</strong>
            {timeframeExpandedState.expanded ? null : <p>{timeframeCollapsedSummary}</p>}
          </div>
        </div>

        <div className="prompt-home-timeframe-panel-side">
          <button
            type="button"
            className="prompt-home-timeframe-panel-toggle-action"
            aria-expanded={timeframeExpandedState.expanded}
            aria-controls={PROMPT_HOME_TIMEFRAME_PANEL_ID}
            onClick={() => timeframeExpandedState.setExpanded((current) => !current)}
          >
            <div className="prompt-home-timeframe-panel-toggle-meta">
              <small>{timeframeExpandedState.expanded ? 'Hide card' : 'Show card'}</small>
              <span className="prompt-home-support-toggle-indicator" aria-hidden="true">
                {timeframeExpandedState.expanded ? '−' : '+'}
              </span>
            </div>
          </button>

          {timeframeExpandedState.expanded ? (
            <label className="field prompt-home-timezone-field">
              <span>Time zone</span>
              <select
                className="control"
                aria-label="Preferred time zone"
                value={timeDisplaySettings.timeZone}
                onChange={(event) => onTimeZoneChange(event.target.value)}
              >
                {timeZoneOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      <div
        id={PROMPT_HOME_TIMEFRAME_PANEL_ID}
        className="prompt-home-timeframe-panel-body"
        hidden={!timeframeExpandedState.expanded}
      >
        <div className="prompt-home-timeframe-grid">
          <PromptHomeTimeMeterCard
            panelId={PROMPT_HOME_DAY_PANEL_ID}
            eyebrow="Day"
            title={`${currentClockLabel} local`}
            detail="Hour-ending day with the desk window and representative venue sessions marked."
            badge={currentHourEndingLabel}
            meta={`Desk window ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING)} to ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING)}`}
            collapsedSummary={`Desk window ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING)} to ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING)} · ${exchangeSessionLanes.length} venue sessions`}
            ticks={dayTicks}
            markers={tradingMarkers}
            currentPercent={currentDayPercent}
            highlightedWindowStartPercent={tradingWindowStartPercent}
            highlightedWindowWidthPercent={tradingWindowWidthPercent}
            ariaLabel={`Day meter in ${resolvedTimeZone}. Current local time ${currentClockLabel}, ${currentHourEndingLabel}. Desk trading hours run from ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING)} to ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING)}. Representative venue sessions for ICE Brent, LMEselect, LME Ring, SGX MSCI, CME WTI, EEX Power, and TOCOM Energy are also shown.`}
            expanded={dayCardExpandedState.expanded}
            onToggle={() => dayCardExpandedState.setExpanded((current) => !current)}
          >
            <div className="prompt-home-time-details">
              <button
                type="button"
                className="prompt-home-time-details-toggle"
                aria-expanded={exchangeSessionsExpandedState.expanded}
                aria-controls={PROMPT_HOME_TRADING_HOURS_PANEL_ID}
                onClick={() =>
                  exchangeSessionsExpandedState.setExpanded((current) => !current)
                }
              >
                <div className="prompt-home-time-details-toggle-copy">
                  <strong>Representative trading hours</strong>
                  <span>{exchangeSessionLanes.length} major venue sessions available</span>
                </div>
                <div className="prompt-home-time-details-toggle-meta">
                  <small>{exchangeSessionsExpandedState.expanded ? 'Hide details' : 'Show details'}</small>
                  <span className="prompt-home-support-toggle-indicator" aria-hidden="true">
                    {exchangeSessionsExpandedState.expanded ? '−' : '+'}
                  </span>
                </div>
              </button>

              <div
                id={PROMPT_HOME_TRADING_HOURS_PANEL_ID}
                className="prompt-home-session-board"
                hidden={!exchangeSessionsExpandedState.expanded}
              >
                <p className="prompt-home-session-board-note">
                  Representative venue sessions converted into {timeZonePreferenceLabel}.
                </p>
                <div className="prompt-home-session-lane-list">
                  {exchangeSessionLanes.map((session) => (
                    <div key={session.key} className={`prompt-home-session-lane is-${session.tone}`}>
                      <div className="prompt-home-session-lane-copy">
                        <strong>{session.label}</strong>
                        <span>{session.displayWindowLabel}</span>
                        <small>
                          {session.detail} · {session.sourceWindowLabel}
                        </small>
                      </div>
                      <div className="prompt-home-session-lane-track" aria-hidden="true">
                        {session.segments.map((segment) => (
                          <span
                            key={segment.key}
                            className="prompt-home-session-lane-segment"
                            style={{
                              left: `${segment.startPercent}%`,
                              width: `${segment.widthPercent}%`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </PromptHomeTimeMeterCard>
          <PromptHomeTimeMeterCard
            panelId={PROMPT_HOME_WEEK_PANEL_ID}
            eyebrow="Week"
            title={currentWeekdayLabel}
            detail="Sunday through Saturday."
            badge={currentMonthDayLabel}
            meta={`Week progress ${Math.round(currentWeekPercent)}%`}
            collapsedSummary={`Sunday through Saturday · Week progress ${Math.round(currentWeekPercent)}%`}
            ticks={weekTicks}
            currentPercent={currentWeekPercent}
            ariaLabel={`Week meter in ${resolvedTimeZone}. Current day ${currentWeekdayLabel}. The week runs from Sunday through Saturday.`}
            expanded={weekCardExpandedState.expanded}
            onToggle={() => weekCardExpandedState.setExpanded((current) => !current)}
          />
          <PromptHomeTimeMeterCard
            panelId={PROMPT_HOME_MONTH_PANEL_ID}
            eyebrow="Month"
            title={currentMonthLabel}
            detail="1 through EOM."
            badge={`Day ${formatOrdinal(zonedDateParts.day)}`}
            meta={`${monthDayTotal} days this month`}
            collapsedSummary={`1 through EOM · ${monthDayTotal} days this month`}
            ticks={monthTicks}
            currentPercent={currentMonthPercent}
            ariaLabel={`Month meter in ${resolvedTimeZone}. Today is day ${zonedDateParts.day} of ${monthDayTotal}. The month runs from 1 through end of month.`}
            expanded={monthCardExpandedState.expanded}
            onToggle={() => monthCardExpandedState.setExpanded((current) => !current)}
          />
        </div>
      </div>
    </section>
  )
}

export function PromptHomeWorkspace({
  authSession,
  health,
  counts,
  assets = [],
  locations = [],
  spatialFeatures = [],
  weatherLocations = [],
  weatherSyncStatus = null,
  referenceDataLoaded = false,
  referenceDataLoading = false,
  onEnsureReferenceData,
  weatherDataLoaded = false,
  weatherDataLoading = false,
  weatherDataError = '',
  onEnsureWeatherData,
  onOpenView,
  onRefreshData,
  initialMessages = [],
}: PromptHomeWorkspaceProps) {
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [timeDisplaySettings, setTimeDisplaySettings] = useState<TimeDisplaySettings>(() =>
    getTimeDisplaySettingsSnapshot(),
  )
  const [runtimeSettings, setRuntimeSettings] = useState<AssistantRuntimeSettings | null>(null)
  const [runtimeError, setRuntimeError] = useState('')
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<PromptHomeMessage[]>(() => initialMessages)
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [actionRequestIdsInFlight, setActionRequestIdsInFlight] = useState<number[]>([])
  const [pendingActionRequests, setPendingActionRequests] = useState<AssistantActionRequest[]>([])
  const [pendingActionRequestsLoading, setPendingActionRequestsLoading] = useState(false)
  const [pendingActionRequestsError, setPendingActionRequestsError] = useState('')
  const [promptRouteRecommendations, setPromptRouteRecommendations] = useState<
    AssistantPromptRouteRecommendation[]
  >([])
  const [promptRouteRecommendationsLoading, setPromptRouteRecommendationsLoading] = useState(false)
  const [promptRouteRecommendationsError, setPromptRouteRecommendationsError] = useState('')
  const [tradeAttentionCandidates, setTradeAttentionCandidates] = useState<TradeAttentionCandidateRecord[]>([])
  const [invoiceIssueCandidates, setInvoiceIssueCandidates] = useState<InvoiceIssueCandidateRecord[]>([])
  const [selectedPromptKitKey, setSelectedPromptKitKey] = useState<PromptHomePromptKit['key'] | null>(null)
  const reviewPanelExpandedState = usePersistentCollapsibleCardState(
    'prompt-home.support.review',
    pendingActionRequests.length > 0 ||
      Boolean(pendingActionRequestsError) ||
      pendingActionRequestsLoading,
  )
  const directPanelExpandedState = usePersistentCollapsibleCardState('prompt-home.support.direct', false)
  const promptResumeIntent = useSyncExternalStore(
    subscribePromptResumeIntent,
    getPromptResumeIntent,
    () => null,
  )
  const consumedPromptResumeKeyRef = useRef<string | null>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const timeZoneOptions = useMemo(() => listTimeDisplayTimeZoneOptions(), [])

  useEffect(() => {
    if (
      !shouldAutoEnsurePromptHomeData({
        hasSession: Boolean(authSession),
        dataLoaded: referenceDataLoaded,
        dataLoading: referenceDataLoading,
        hasEnsureHandler: Boolean(onEnsureReferenceData),
      })
    ) {
      return
    }

    void onEnsureReferenceData().catch(() => undefined)
  }, [authSession, onEnsureReferenceData, referenceDataLoaded, referenceDataLoading])

  useEffect(() => {
    if (
      !shouldAutoEnsurePromptHomeData({
        hasSession: Boolean(authSession),
        dataLoaded: weatherDataLoaded,
        dataLoading: weatherDataLoading,
        dataError: weatherDataError,
        hasEnsureHandler: Boolean(onEnsureWeatherData),
      })
    ) {
      return
    }

    void onEnsureWeatherData().catch(() => undefined)
  }, [authSession, onEnsureWeatherData, weatherDataError, weatherDataLoaded, weatherDataLoading])

  useEffect(() => {
    let timeoutId: number | null = null

    const scheduleNextClockRefresh = (now: Date) => {
      timeoutId = window.setTimeout(() => {
        syncClockToCurrentMinute()
      }, getPromptHomeNextClockTickDelay(now))
    }

    const syncClockToCurrentMinute = () => {
      const now = new Date()
      setCurrentTime(now)
      scheduleNextClockRefresh(now)
    }

    const resyncClock = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      syncClockToCurrentMinute()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resyncClock()
      }
    }

    scheduleNextClockRefresh(new Date())
    window.addEventListener('focus', resyncClock)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      window.removeEventListener('focus', resyncClock)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const operatorContext = useMemo(
    () =>
      buildPromptHomeContext({
        health,
        counts,
        displayName: authSession?.user.display_name ?? 'Signed-out user',
      }),
    [authSession?.user.display_name, counts, health],
  )
  const selectedPromptKit = useMemo(
    () =>
      selectedPromptKitKey
        ? PROMPT_HOME_PROMPT_KITS.find((promptKit) => promptKit.key === selectedPromptKitKey) ?? null
        : null,
    [selectedPromptKitKey],
  )
  const promotedRoutes = useMemo(
    () =>
      buildPromptHomePromotedRoutes({
        recommendations: promptRouteRecommendations,
        tradeAttentionCandidates,
        invoiceIssueCandidates,
      }),
    [invoiceIssueCandidates, promptRouteRecommendations, tradeAttentionCandidates],
  )
  const displayedMessages = useMemo(() => [...messages].reverse(), [messages])

  const recordPromptNavigationOutcome = useCallback(
    (
      runId: number | null | undefined,
      payload: {
        outcome: 'ACCEPTED' | 'DISMISSED' | 'FAILED'
        intentKey: string
        targetView?: ViewKey
        targetLabel?: string
        targetRationale?: string
        focusType?: 'trade' | 'workflow_item' | 'document' | 'invoice' | 'payment' | 'reference_record' | 'report'
        focusId?: string
        focusLabel?: string
        detail?: string
      },
    ) => {
      if (!authSession) {
        return
      }

      void submitAssistantPromptNavigationOutcome(
        appConfig.apiBase,
        runId,
        payload,
        { accessToken: authSession.accessToken },
      ).catch(() => undefined)
    },
    [authSession],
  )

  const refreshPendingActionRequests = useCallback(async () => {
    if (!authSession) {
      setPendingActionRequests([])
      setPendingActionRequestsError('')
      return
    }

    setPendingActionRequestsLoading(true)
    setPendingActionRequestsError('')
    try {
      const actionRequests = await listAssistantActionRequests(appConfig.apiBase, {
        accessToken: authSession.accessToken,
        status: 'PENDING',
        limit: 4,
      })
      setPendingActionRequests(actionRequests)
    } catch (error) {
      setPendingActionRequestsError(
        error instanceof Error ? error.message : 'Could not load governed review requests.',
      )
    } finally {
      setPendingActionRequestsLoading(false)
    }
  }, [authSession])

  useEffect(() => {
    void refreshPendingActionRequests()
  }, [refreshPendingActionRequests])

  const refreshPromptRouteRecommendations = useCallback(async () => {
    if (!authSession) {
      setPromptRouteRecommendations([])
      setPromptRouteRecommendationsError('')
      return
    }

    setPromptRouteRecommendationsLoading(true)
    setPromptRouteRecommendationsError('')
    try {
      const recommendations = await listAssistantPromptRouteRecommendations(appConfig.apiBase, {
        accessToken: authSession.accessToken,
      })
      setPromptRouteRecommendations(recommendations)
    } catch (error) {
      setPromptRouteRecommendations([])
      setPromptRouteRecommendationsError(
        error instanceof Error ? error.message : 'Could not load promoted prompt routes.',
      )
    } finally {
      setPromptRouteRecommendationsLoading(false)
    }
  }, [authSession])

  useEffect(() => {
    void refreshPromptRouteRecommendations()
  }, [refreshPromptRouteRecommendations])

  useEffect(() => {
    if (!authSession || promptRouteRecommendations.length === 0) {
      setTradeAttentionCandidates([])
      setInvoiceIssueCandidates([])
      return
    }

    const readHeaders = new Headers({ Authorization: `Bearer ${authSession.accessToken}` })
    void Promise.allSettled([
      loadTradeAttentionCandidates(
        appConfig.apiBase,
        { limit: 6 },
        { readHeaders },
      ),
      loadInvoiceIssueCandidates(
        appConfig.apiBase,
        { readyOnly: true, limit: 6 },
        { readHeaders },
      ),
    ]).then((results) => {
      const [tradeCandidatesResult, invoiceCandidatesResult] = results
      if (tradeCandidatesResult.status === 'fulfilled') {
        setTradeAttentionCandidates(tradeCandidatesResult.value.items)
      } else {
        setTradeAttentionCandidates([])
      }

      if (invoiceCandidatesResult.status === 'fulfilled') {
        setInvoiceIssueCandidates(invoiceCandidatesResult.value.items)
      } else {
        setInvoiceIssueCandidates([])
      }
    })
  }, [authSession, promptRouteRecommendations])

  async function loadRuntimeSettings(): Promise<AssistantRuntimeSettings> {
    if (runtimeSettings) {
      return runtimeSettings
    }

    try {
      const payload = await loadAssistantRuntimeSettings(appConfig.apiBase)
      setRuntimeSettings(payload)
      setRuntimeError('')
      return payload
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load assistant runtime.'
      setRuntimeError(message)
      throw new Error(message)
    }
  }

  async function submitPrompt(
    prompt: string,
    summaryTargets: AssistantWorkspaceSummaryTarget[] = [],
  ) {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt || !authSession || submitting) {
      return
    }

    const userMessage: PromptHomeMessage = {
      id: createPromptMessageId(),
      role: 'user',
      content: trimmedPrompt,
    }
    const nextMessages = [...messages, userMessage]

    setMessages(nextMessages)
    setDraft('')
    setSubmitError('')
    setSubmitting(true)

    try {
      const settings = await loadRuntimeSettings()
      if (!settings.enabled) {
        throw new Error('No configured assistant provider is currently ready on the API.')
      }

      const provider = resolveDefaultProvider(settings)
      const providerDetails = settings.providers.find((entry) => entry.provider === provider)
      if (!provider || !providerDetails?.enabled) {
        throw new Error('No enabled assistant provider is available for the operator prompt.')
      }

      const response = await requestAssistantResponse(
        appConfig.apiBase,
        {
          conversation_id: conversationId ?? undefined,
          provider,
          workspace: 'assistant',
          context: operatorContext,
          summary_targets: summaryTargets,
          use_live_tools: true,
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        },
        {
          accessToken: authSession.accessToken,
        },
      )
      const responseConversationId = response.conversation_id ?? conversationId
      const parsedResponse = parsePromptNavigationIntentsFromAssistantContent(response.message.content, {
        sourceRunId: response.run_id,
        sourceConversationId: responseConversationId,
      })
      const responseContent =
        parsedResponse.intents.length > 0 || parsedResponse.warnings.length > 0
          ? parsedResponse.content
          : parsedResponse.content || response.message.content

      if (parsedResponse.warnings.includes(INVALID_PROMPT_NAVIGATION_WARNING)) {
        recordPromptNavigationOutcome(response.run_id, {
          outcome: 'FAILED',
          intentKey: 'invalid_navigation_payload',
          detail: INVALID_PROMPT_NAVIGATION_WARNING,
        })
      }

      setConversationId(responseConversationId)
      setMessages((current) => [
        ...current,
        {
          id: createPromptMessageId(),
          role: 'assistant',
          content: responseContent,
          provider: response.provider,
          model: response.model,
          runId: response.run_id,
          warnings: [...response.warnings, ...parsedResponse.warnings],
          actionRequests: response.action_requests,
          navigationIntents: parsedResponse.intents,
        },
      ])
      void refreshPendingActionRequests()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Assistant request failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const submitResumedPrompt = useEffectEvent(
    (prompt: string, summaryTargets: AssistantWorkspaceSummaryTarget[] = []) => {
      void submitPrompt(prompt, summaryTargets)
    },
  )

  useEffect(() => {
    if (!authSession || !promptResumeIntent) {
      return
    }

    const resumeKey = `${promptResumeIntent.createdAt}:${promptResumeIntent.draft}`
    if (consumedPromptResumeKeyRef.current === resumeKey) {
      return
    }

    consumedPromptResumeKeyRef.current = resumeKey
    clearPromptResumeIntent()
    setDraft(promptResumeIntent.draft)
    setSubmitError('')

    if (promptResumeIntent.submitAfterSignIn) {
      submitResumedPrompt(promptResumeIntent.draft, promptResumeIntent.summaryTargets ?? [])
    }
  }, [authSession, promptResumeIntent])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authSession) {
      const trimmedDraft = draft.trim()
      if (!trimmedDraft) {
        return
      }

      savePromptResumeIntent({
        draft: trimmedDraft,
        submitAfterSignIn: true,
      })
      setSubmitError('')
      onOpenView('settings')
      return
    }

    void submitPrompt(draft)
  }

  function handleSignIn() {
    const trimmedDraft = draft.trim()
    if (trimmedDraft) {
      savePromptResumeIntent({
        draft: trimmedDraft,
        submitAfterSignIn: false,
      })
    } else {
      savePromptSignInReturnIntent()
    }

    setSubmitError('')
    onOpenView('settings')
  }

  function loadPromptDraft(nextDraft: string) {
    setDraft(nextDraft)
    setSubmitError('')

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        composerTextareaRef.current?.focus()
        composerTextareaRef.current?.setSelectionRange(nextDraft.length, nextDraft.length)
      })
    }
  }

  function openNavigationIntent(
    intent: PromptNavigationIntent,
    options: {
      includeHandoff?: boolean
      recordOutcome?: boolean
    } = {},
  ) {
    const normalizedIntent = normalizePromptNavigationIntent(intent)
    if (!normalizedIntent) {
      setSubmitError('That navigation suggestion is no longer available.')
      if (options.recordOutcome) {
        recordPromptNavigationOutcome(intent.sourceRunId, {
          outcome: 'FAILED',
          intentKey: buildPromptNavigationIntentKey(intent),
          detail: 'That navigation suggestion is no longer available.',
        })
      }
      return
    }

    if (options.recordOutcome) {
      recordPromptNavigationOutcome(normalizedIntent.sourceRunId, {
        outcome: 'ACCEPTED',
        intentKey: buildPromptNavigationIntentKey(normalizedIntent),
        targetView: normalizedIntent.targetView,
        targetLabel: promptNavigationIntentLabel(normalizedIntent),
        targetRationale: normalizedIntent.rationale,
        focusType: normalizedIntent.focus?.type,
        focusId: normalizedIntent.focus?.id,
        focusLabel: normalizedIntent.focus?.label,
      })
    }

    onOpenView(
      normalizedIntent.targetView,
      options.includeHandoff === false ? null : buildPromptNavigationRouteHandoff(normalizedIntent),
    )
  }

  function handleDismissNavigationIntent(messageId: string, intent: PromptNavigationIntent) {
    const intentKey = buildPromptNavigationIntentKey(intent)
    setMessages((current) => removePromptNavigationIntent(current, { messageId, intentKey }))
    recordPromptNavigationOutcome(intent.sourceRunId, {
      outcome: 'DISMISSED',
      intentKey,
      targetView: intent.targetView,
      targetLabel: promptNavigationIntentLabel(intent),
      targetRationale: intent.rationale,
      focusType: intent.focus?.type,
      focusId: intent.focus?.id,
      focusLabel: intent.focus?.label,
    })
  }

  const supportPanels = {
    review: reviewPanelExpandedState.expanded,
    direct: directPanelExpandedState.expanded,
  }

  function toggleSupportPanel(panel: keyof typeof supportPanels) {
    switch (panel) {
      case 'review':
        reviewPanelExpandedState.setExpanded((current) => !current)
        break
      case 'direct':
        directPanelExpandedState.setExpanded((current) => !current)
        break
    }
  }

  const handleActionRequestDecision = useCallback(
    async (
      actionRequestId: number,
      decision: 'approve' | 'reject',
      payload: AssistantActionDecisionPayload,
    ) => {
      setSubmitError('')
      setPendingActionRequestsError('')
      setActionRequestIdsInFlight((current) =>
        current.includes(actionRequestId) ? current : [...current, actionRequestId],
      )

      try {
        const updatedActionRequest =
          decision === 'approve'
            ? await approveAssistantActionRequest(appConfig.apiBase, actionRequestId, payload)
            : await rejectAssistantActionRequest(appConfig.apiBase, actionRequestId, payload)

        setMessages((current) => replacePromptMessageActionRequest(current, updatedActionRequest))
        setPendingActionRequests((current) =>
          current.filter((request) => request.action_request_id !== updatedActionRequest.action_request_id),
        )

        if (
          (updatedActionRequest.status === 'EXECUTED' || updatedActionRequest.status === 'FAILED') &&
          onRefreshData
        ) {
          await onRefreshData()
        }

        await refreshPendingActionRequests()
      } catch (error) {
        setSubmitError(
          error instanceof Error ? error.message : 'Could not update the governed action request.',
        )
      } finally {
        setActionRequestIdsInFlight((current) => current.filter((id) => id !== actionRequestId))
      }
    },
    [onRefreshData, refreshPendingActionRequests],
  )

  const runtimeNote = runtimeError
    ? runtimeError
    : runtimeSettings
      ? `Using ${runtimeSettings.effective_default_provider ?? 'the first enabled provider'} when you send.`
      : 'Assistant runtime will be checked when you send the first prompt.'
  const pendingActionReviewNote = !authSession
    ? 'Sign in to review governed actions staged from Home.'
    : pendingActionRequestsLoading
      ? 'Refreshing the governed review queue.'
      : pendingActionRequestsError
        ? pendingActionRequestsError
        : pendingActionRequests.length > 0
        ? `${pendingActionRequests.length} governed action request${pendingActionRequests.length === 1 ? '' : 's'} currently waiting for review.`
          : 'No governed action is waiting for review. If a prompt does not map to a supported action type, continue in Assistant Console or the recommended workspace.'
  const reviewPanelSummary = !authSession
    ? 'Sign in to review'
    : pendingActionRequestsLoading
      ? 'Refreshing'
      : pendingActionRequests.length > 0
        ? `${pendingActionRequests.length} waiting`
        : 'No pending items'
  const directPanelSummary = `${NAVIGATION_INTENTS.length} shortcuts`
  const promptRouteRecommendationNote = !authSession
    ? 'Sign in to load promoted routes from accepted Home handoffs.'
    : promptRouteRecommendationsLoading
      ? 'Loading promoted routes.'
      : promptRouteRecommendationsError
        ? promptRouteRecommendationsError
        : formatPromotedRouteSummary(promotedRoutes)

  return (
    <div className="prompt-home">
      <section className="surface prompt-home-composer-panel">
        <div className="prompt-home-heading-row">
          <div className="prompt-home-heading">
            <span className="eyebrow">Home</span>
          </div>
          {!authSession ? (
            <div className="prompt-home-heading-actions">
              <button
                type="button"
                className="button button-ghost prompt-home-secondary-action"
                onClick={handleSignIn}
              >
                Sign In
              </button>
            </div>
          ) : null}
        </div>

        <PromptHomeTimeframePanel
          currentTime={currentTime}
          timeDisplaySettings={timeDisplaySettings}
          timeZoneOptions={timeZoneOptions}
          onTimeZoneChange={(nextTimeZone) => {
            const savedSettings = saveTimeDisplaySettingsSnapshot({
              ...timeDisplaySettings,
              timeZone: nextTimeZone,
            })
            setTimeDisplaySettings(savedSettings)
          }}
        />
        <PromptHomeMapTile
          assets={assets}
          locations={locations}
          spatialFeatures={spatialFeatures}
          weatherLocations={weatherLocations}
          weatherSyncStatus={weatherSyncStatus}
          weatherDataLoaded={weatherDataLoaded}
          weatherDataLoading={weatherDataLoading}
          weatherDataError={weatherDataError}
          onOpenMapWorkspace={() => onOpenView('map')}
        />

        <form className="prompt-home-composer" onSubmit={handleSubmit}>
          <label className="field prompt-home-composer-field">
            <span>Operator prompt</span>
            <textarea
              ref={composerTextareaRef}
              className="control prompt-home-textarea"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
                setSubmitError('')
              }}
              placeholder="Ask what needs attention, where to go next, or how to handle a trade, queue, exposure, invoice, or report question."
            />
          </label>

          <div className="toolbar settings-actions prompt-home-actions">
            <button
              type="submit"
              className="button button-primary"
              disabled={!draft.trim() || submitting}
            >
              {submitting ? 'Sending...' : authSession ? 'Send Prompt' : 'Sign In to Send Prompt'}
            </button>
          </div>

          <p className={`form-note ${submitError ? 'form-note-error' : ''}`}>
            {submitError ||
              (!authSession
                ? 'You can draft the prompt here. We will only send it after you sign in.'
                : runtimeNote)}
          </p>
        </form>

        <div className="prompt-home-quick-prompts" aria-label="Quick prompts">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="entity-chip entity-chip-soft"
              onClick={() => loadPromptDraft(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>

        <section className="prompt-home-prompt-kits" aria-label="Prompt kits">
          <div className="section-head">
            <div>
              <span className="eyebrow">Guided Prompts</span>
              <h3>What are you trying to do?</h3>
            </div>
            <p>Pick a lane, then load a suggested prompt or jump straight to the right workspace.</p>
          </div>

          <div className="prompt-home-prompt-kit-picker" aria-label="Prompt kit categories">
            {PROMPT_HOME_PROMPT_KITS.map((promptKit) => {
              const isSelected = promptKit.key === selectedPromptKitKey

              return (
                <button
                  key={promptKit.key}
                  type="button"
                  className={`prompt-home-prompt-kit-choice ${isSelected ? 'is-active' : ''}`}
                  aria-pressed={isSelected}
                  onClick={() =>
                    setSelectedPromptKitKey((current) => (current === promptKit.key ? null : promptKit.key))
                  }
                >
                  {promptKit.label}
                </button>
              )
            })}
          </div>

          {selectedPromptKit ? (
            <article className="prompt-home-starter prompt-home-prompt-kit-panel">
              <div className="prompt-home-prompt-kit-panel-head">
                <h4>{selectedPromptKit.label}</h4>
                <p>{selectedPromptKit.detail}</p>
              </div>

              <div className="prompt-home-prompt-kit-section">
                <span className="eyebrow">Suggested prompts</span>
                <div
                  className="prompt-home-kit-examples"
                  aria-label={`${selectedPromptKit.label} suggested prompts`}
                >
                  {selectedPromptKit.suggestedPrompts.map((suggestion) => (
                    <button
                      key={`${selectedPromptKit.key}-${suggestion.prompt}`}
                      type="button"
                      className="prompt-home-kit-example"
                      onClick={() => loadPromptDraft(suggestion.prompt)}
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="prompt-home-prompt-kit-section">
                <span className="eyebrow">Workspace links</span>
                <div className="prompt-home-starter-actions">
                  {selectedPromptKit.workspaceLinks.map((link) => (
                    <button
                      key={`${selectedPromptKit.key}-${link.view}`}
                      type="button"
                      className="button button-secondary"
                      onClick={() => onOpenView(link.view)}
                    >
                      {link.label}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          ) : (
            <p className="form-note prompt-home-prompt-kits-empty">
              Choose one to reveal a few suggested prompts and direct workspace links.
            </p>
          )}
        </section>

        <section className="prompt-home-promoted-routes" aria-label="Promoted routes">
          <div className="section-head">
            <div>
              <span className="eyebrow">Promoted Routes</span>
              <h3>Go straight to proven destinations</h3>
            </div>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => void refreshPromptRouteRecommendations()}
              disabled={!authSession || promptRouteRecommendationsLoading}
            >
              Refresh
            </button>
          </div>
          <p className={`form-note ${promptRouteRecommendationsError ? 'form-note-error' : ''}`}>
            {promptRouteRecommendationNote}
          </p>
          {promotedRoutes.length > 0 ? (
            <div className="prompt-home-destination-list">
              {promotedRoutes.map((route) => {
                if (route.readiness === 'ready') {
                  return (
                  <button
                    key={route.key}
                    type="button"
                    className="prompt-home-destination prompt-home-promoted-route"
                    onClick={() =>
                      openNavigationIntent(route.intent, {
                        includeHandoff: route.hasFocusedHandoff,
                        recordOutcome: route.recordOutcomeOnOpen,
                      })
                    }
                  >
                    <div className="prompt-home-destination-head">
                      <strong>{route.displayLabel}</strong>
                      <span className={`status-pill status-pill-${route.readinessTone}`}>{route.readinessLabel}</span>
                    </div>
                    <span>{route.displayDetail}</span>
                    {route.displayFocusLabel ? <small>{route.displayFocusLabel}</small> : null}
                    {route.ageLabel ? <small>{route.ageLabel}</small> : null}
                    <small>{formatPromotedRouteEvidence(route.recommendation)}</small>
                  </button>
                  )
                }

                return (
                  <article
                    key={route.key}
                    className="prompt-home-destination prompt-home-promoted-route is-unavailable"
                  >
                    <div className="prompt-home-destination-head">
                      <strong>{route.displayLabel}</strong>
                      <span className={`status-pill status-pill-${route.readinessTone}`}>{route.readinessLabel}</span>
                    </div>
                    <span>{route.displayDetail}</span>
                    {route.ageLabel ? <small>{route.ageLabel}</small> : null}
                    <div className="prompt-home-destination-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => openNavigationIntent(route.intent, { includeHandoff: false })}
                      >
                        {promptNavigationIntentLabel(route.intent)}
                      </button>
                    </div>
                    <small>{formatPromotedRouteEvidence(route.recommendation)}</small>
                  </article>
                )
              })}
            </div>
          ) : null}
        </section>

      </section>

      <section className="prompt-home-grid">
        <article className="surface prompt-home-chat">
          <div className="section-head">
            <div>
              <span className="eyebrow">Conversation</span>
              <h3>Current prompt thread</h3>
            </div>
            <p>
              Responses can explain, route, draft, or stage governed actions. They do not
              directly mutate records.
            </p>
          </div>

          <div className="prompt-home-chat-log">
            {displayedMessages.length === 0 ? (
              <div className="empty-state prompt-home-empty">
                <strong>No prompt yet</strong>
                <p>Use the composer above or pick a quick prompt to start from intent instead of choosing a screen first.</p>
              </div>
            ) : (
              displayedMessages.map((message) => (
                <article key={message.id} className={`assistant-message assistant-message-${message.role}`}>
                  <div className="assistant-message-head">
                    <strong>{message.role === 'assistant' ? 'Assistant' : 'You'}</strong>
                    {message.provider && message.model ? <span>{message.provider} · {message.model}</span> : null}
                  </div>
                  {message.content ? <p>{message.content}</p> : null}
                  {message.runId ? (
                    <div className="assistant-message-meta">
                      <span>Run #{message.runId}</span>
                      <button type="button" className="assistant-run-link" onClick={() => onOpenView('assistant')}>
                        Open diagnostics
                      </button>
                    </div>
                  ) : null}
                  {message.actionRequests && message.actionRequests.length > 0 ? (
                    <div className="prompt-home-action-review">
                      <div className="feedback-banner prompt-home-action-banner">
                        <strong>
                          {message.actionRequests.length.toLocaleString()} governed action request
                          {message.actionRequests.length === 1 ? '' : 's'} staged
                        </strong>
                        <p>Nothing changes until the typed review path approves and executes it.</p>
                      </div>
                      <AssistantActionRequestList
                        actionRequests={message.actionRequests}
                        actionRequestIdsInFlight={actionRequestIdsInFlight}
                        formatDate={formatPromptTimestamp}
                        onDecision={handleActionRequestDecision}
                        onOpenRun={() => onOpenView('assistant')}
                        showUserId
                      />
                      <div className="assistant-message-meta prompt-home-action-path">
                        <span>Need the old review inbox or full run trace?</span>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => onOpenView('assistant')}
                        >
                          Open Assistant Console
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {message.navigationIntents && message.navigationIntents.length > 0 ? (
                    <div className="prompt-home-handoff-list" aria-label="Assistant workspace handoffs">
                      {message.navigationIntents.map((intent) => (
                        <div
                          key={buildPromptNavigationIntentKey(intent)}
                          className="prompt-home-handoff-item"
                        >
                          <button
                            type="button"
                            className="prompt-home-handoff"
                            onClick={() =>
                              openNavigationIntent(intent, {
                                includeHandoff: true,
                                recordOutcome: true,
                              })
                            }
                          >
                            <strong>{promptNavigationIntentLabel(intent)}</strong>
                            <span>{promptNavigationIntentDetail(intent)}</span>
                          </button>
                          <button
                            type="button"
                            className="button button-ghost prompt-home-handoff-dismiss"
                            aria-label={`Dismiss ${promptNavigationIntentLabel(intent)}`}
                            onClick={() => handleDismissNavigationIntent(message.id, intent)}
                          >
                            Dismiss
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {message.warnings && message.warnings.length > 0 ? (
                    <div className="assistant-message-meta">
                      {message.warnings.map((warning) => (
                        <span key={warning}>{warning}</span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </article>

        <aside className="prompt-home-sidecar">
          <section className="surface prompt-home-support-panel prompt-home-review-path">
            <button
              type="button"
              className="prompt-home-support-toggle"
              aria-expanded={supportPanels.review}
              aria-controls={PROMPT_HOME_REVIEW_PANEL_ID}
              onClick={() => toggleSupportPanel('review')}
            >
              <div className="prompt-home-support-toggle-copy">
                <span className="eyebrow">Governed Review</span>
                <h3>Review queue</h3>
              </div>
              <div className="prompt-home-support-toggle-meta">
                <small>{reviewPanelSummary}</small>
                <span className="prompt-home-support-toggle-indicator" aria-hidden="true">
                  {supportPanels.review ? '−' : '+'}
                </span>
              </div>
            </button>

            <div
              id={PROMPT_HOME_REVIEW_PANEL_ID}
              className="prompt-home-support-body"
              hidden={!supportPanels.review}
            >
              <div className="prompt-home-support-body-head">
                <p className={`form-note ${pendingActionRequestsError ? 'form-note-error' : ''}`}>
                  {pendingActionReviewNote}
                </p>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => void refreshPendingActionRequests()}
                  disabled={!authSession || pendingActionRequestsLoading}
                >
                  Refresh
                </button>
              </div>
              {pendingActionRequests.length > 0 ? (
                <div className="prompt-home-review-list">
                  {pendingActionRequests.map((actionRequest) => (
                    <button
                      key={actionRequest.action_request_id}
                      type="button"
                      className="prompt-home-thread prompt-home-review-item"
                      onClick={() => onOpenView('assistant')}
                    >
                      <div className="prompt-home-review-item-head">
                        <strong>{actionRequest.summary}</strong>
                        <span className="status-pill status-pill-planned">
                          {actionRequest.lifecycle.label}
                        </span>
                      </div>
                      <span>{actionRequest.description}</span>
                      <small>
                        {actionRequest.agent_name ?? 'Platform foundation'} · {actionRequest.action_type}{' '}
                        · Created {formatPromptTimestamp(actionRequest.created_at)}
                      </small>
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="prompt-home-review-note">
                Unsupported writes stay manual. Use the assistant for review context, then finish
                in the old workspace when a governed action does not exist.
              </p>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => onOpenView('assistant')}
                disabled={!authSession}
              >
                Open Assistant Console
              </button>
            </div>
          </section>

          <section className="surface prompt-home-support-panel prompt-home-destinations">
            <button
              type="button"
              className="prompt-home-support-toggle"
              aria-expanded={supportPanels.direct}
              aria-controls={PROMPT_HOME_DIRECT_PANEL_ID}
              onClick={() => toggleSupportPanel('direct')}
            >
              <div className="prompt-home-support-toggle-copy">
                <span className="eyebrow">Old Console</span>
                <h3>Go direct</h3>
              </div>
              <div className="prompt-home-support-toggle-meta">
                <small>{directPanelSummary}</small>
                <span className="prompt-home-support-toggle-indicator" aria-hidden="true">
                  {supportPanels.direct ? '−' : '+'}
                </span>
              </div>
            </button>

            <div
              id={PROMPT_HOME_DIRECT_PANEL_ID}
              className="prompt-home-support-body"
              hidden={!supportPanels.direct}
            >
              <p className="form-note">
                The traditional screens are still here when you already know where the work belongs.
              </p>

              <div className="prompt-home-destination-list">
                {NAVIGATION_INTENTS.map((intent) => (
                  <button
                    key={intent.targetView}
                    type="button"
                    className="prompt-home-destination"
                    onClick={() => openNavigationIntent(intent, { includeHandoff: false })}
                  >
                    <strong>{promptNavigationIntentLabel(intent)}</strong>
                    <span>{promptNavigationIntentDetail(intent)}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </aside>
      </section>
    </div>
  )
}
