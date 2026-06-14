const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'

export const GOOGLE_CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
export const GOOGLE_CALENDAR_UPCOMING_WINDOW_DAYS = 7
export const GOOGLE_CALENDAR_UPCOMING_MAX_RESULTS = 8

type GoogleCalendarListPayload = {
  items?: unknown
}

type GoogleCalendarEventsPayload = {
  items?: unknown
}

type GoogleCalendarErrorPayload = {
  error?: {
    message?: unknown
  }
}

export type GoogleCalendarListEntry = {
  id: string
  summary: string
  description: string | null
  primary: boolean
  accessRole: string | null
  backgroundColor: string | null
  timeZone: string | null
}

export type GoogleCalendarEventBoundary = {
  date: string | null
  dateTime: string | null
  timeZone: string | null
}

export type GoogleCalendarEvent = {
  id: string
  summary: string
  description: string | null
  location: string | null
  htmlLink: string | null
  status: string | null
  creatorEmail: string | null
  organizerEmail: string | null
  start: GoogleCalendarEventBoundary
  end: GoogleCalendarEventBoundary
}

export type LoadUpcomingGoogleCalendarEventsOptions = {
  now?: Date
  days?: number
  maxResults?: number
}

export type DescribeGoogleCalendarEventWindowOptions = {
  now?: Date
  timeZone?: string
}

function readOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim()
  return normalizedValue || null
}

export function parseGoogleCalendarDateOnly(value: string | null): Date | null {
  if (!value) {
    return null
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

export function formatGoogleCalendarDateLabel(
  value: Date,
  options: DescribeGoogleCalendarEventWindowOptions = {},
): string {
  const now = options.now ?? new Date()
  const timeZone = options.timeZone

  const normalizeDate = (candidate: Date): Date =>
    timeZone
      ? new Date(
          new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(candidate),
        )
      : candidate

  const normalizedValue = normalizeDate(value)
  const normalizedNow = normalizeDate(now)

  if (isSameDay(normalizedValue, normalizedNow)) {
    return 'Today'
  }

  const tomorrow = startOfDay(normalizedNow)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (isSameDay(normalizedValue, tomorrow)) {
    return 'Tomorrow'
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(value)
}

export function describeGoogleCalendarEventWindow(
  event: GoogleCalendarEvent,
  options: DescribeGoogleCalendarEventWindowOptions = {},
): {
  primary: string
  secondary: string
} {
  const now = options.now ?? new Date()
  const timeZone = options.timeZone

  if (event.start.dateTime) {
    const start = new Date(event.start.dateTime)
    const end = event.end.dateTime ? new Date(event.end.dateTime) : null
    const dayLabel = formatGoogleCalendarDateLabel(start, { now, timeZone })
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
    })

    return {
      primary: dayLabel,
      secondary: end ? `${timeFormatter.format(start)} - ${timeFormatter.format(end)}` : timeFormatter.format(start),
    }
  }

  if (event.start.date) {
    const start = parseGoogleCalendarDateOnly(event.start.date)
    const exclusiveEnd = parseGoogleCalendarDateOnly(event.end.date)
    if (!start) {
      return {
        primary: 'Date unavailable',
        secondary: 'All day',
      }
    }

    if (!exclusiveEnd) {
      return {
        primary: formatGoogleCalendarDateLabel(start, { now, timeZone }),
        secondary: 'All day',
      }
    }

    const inclusiveEnd = new Date(exclusiveEnd)
    inclusiveEnd.setDate(inclusiveEnd.getDate() - 1)

    if (isSameDay(start, inclusiveEnd)) {
      return {
        primary: formatGoogleCalendarDateLabel(start, { now, timeZone }),
        secondary: 'All day',
      }
    }

    return {
      primary: `${formatGoogleCalendarDateLabel(start, { now, timeZone })} - ${new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(inclusiveEnd)}`,
      secondary: 'All day',
    }
  }

  return {
    primary: 'Schedule unavailable',
    secondary: 'Google Calendar did not return a start time.',
  }
}

function toGoogleCalendarBoundary(value: unknown): GoogleCalendarEventBoundary {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    date: readOptionalText(candidate.date),
    dateTime: readOptionalText(candidate.dateTime),
    timeZone: readOptionalText(candidate.timeZone),
  }
}

async function fetchGoogleCalendarJson<T>(
  path: string,
  options: {
    accessToken: string
    searchParams?: URLSearchParams
  },
): Promise<T> {
  const { accessToken, searchParams } = options
  const normalizedToken = accessToken.trim()
  if (!normalizedToken) {
    throw new Error('Google Calendar access is not connected yet.')
  }

  const url = new URL(`${GOOGLE_CALENDAR_API_BASE}${path}`)
  if (searchParams) {
    url.search = searchParams.toString()
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${normalizedToken}`,
    },
  })

  if (!response.ok) {
    let detail = `Google Calendar request failed with status ${response.status}.`

    try {
      const payload = (await response.json()) as GoogleCalendarErrorPayload
      const errorMessage = readOptionalText(payload.error?.message)
      if (errorMessage) {
        detail = errorMessage
      }
    } catch {
      // Fall back to the status-based message when the Google response is not JSON.
    }

    throw new Error(detail)
  }

  return response.json() as Promise<T>
}

export function resolvePreferredGoogleCalendarId(
  calendars: GoogleCalendarListEntry[],
  preferredCalendarId?: string | null,
): string | null {
  const normalizedPreferredCalendarId = preferredCalendarId?.trim() ?? ''
  if (normalizedPreferredCalendarId) {
    const existingPreferredCalendar = calendars.find((calendar) => calendar.id === normalizedPreferredCalendarId)
    if (existingPreferredCalendar) {
      return existingPreferredCalendar.id
    }
  }

  const primaryCalendar = calendars.find((calendar) => calendar.primary)
  if (primaryCalendar) {
    return primaryCalendar.id
  }

  return calendars[0]?.id ?? null
}

export async function loadGoogleCalendars(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const payload = await fetchGoogleCalendarJson<GoogleCalendarListPayload>('/users/me/calendarList', {
    accessToken,
    searchParams: new URLSearchParams({
      minAccessRole: 'reader',
      showHidden: 'false',
      showDeleted: 'false',
    }),
  })

  const items = Array.isArray(payload.items) ? payload.items : []
  return items.flatMap((item) => {
    const candidate = item && typeof item === 'object' ? (item as Record<string, unknown>) : null
    if (!candidate) {
      return []
    }

    const id = readOptionalText(candidate.id)
    if (!id) {
      return []
    }

    return [
      {
        id,
        summary: readOptionalText(candidate.summary) ?? id,
        description: readOptionalText(candidate.description),
        primary: candidate.primary === true,
        accessRole: readOptionalText(candidate.accessRole),
        backgroundColor: readOptionalText(candidate.backgroundColor),
        timeZone: readOptionalText(candidate.timeZone),
      } satisfies GoogleCalendarListEntry,
    ]
  })
}

export async function loadUpcomingGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  options: LoadUpcomingGoogleCalendarEventsOptions = {},
): Promise<GoogleCalendarEvent[]> {
  const normalizedCalendarId = calendarId.trim()
  if (!normalizedCalendarId) {
    return []
  }

  const now = options.now ?? new Date()
  const days = Math.max(1, Math.trunc(options.days ?? GOOGLE_CALENDAR_UPCOMING_WINDOW_DAYS))
  const maxResults = Math.max(1, Math.trunc(options.maxResults ?? GOOGLE_CALENDAR_UPCOMING_MAX_RESULTS))
  const windowEnd = new Date(now.getTime() + days * 86_400_000)

  const payload = await fetchGoogleCalendarJson<GoogleCalendarEventsPayload>(
    `/calendars/${encodeURIComponent(normalizedCalendarId)}/events`,
    {
      accessToken,
      searchParams: new URLSearchParams({
        singleEvents: 'true',
        orderBy: 'startTime',
        timeMin: now.toISOString(),
        timeMax: windowEnd.toISOString(),
        maxResults: String(maxResults),
      }),
    },
  )

  const items = Array.isArray(payload.items) ? payload.items : []
  return items.flatMap((item) => {
    const candidate = item && typeof item === 'object' ? (item as Record<string, unknown>) : null
    if (!candidate) {
      return []
    }

    const id = readOptionalText(candidate.id)
    if (!id) {
      return []
    }

    return [
      {
        id,
        summary: readOptionalText(candidate.summary) ?? 'Untitled event',
        description: readOptionalText(candidate.description),
        location: readOptionalText(candidate.location),
        htmlLink: readOptionalText(candidate.htmlLink),
        status: readOptionalText(candidate.status),
        creatorEmail: readOptionalText(
          candidate.creator && typeof candidate.creator === 'object'
            ? (candidate.creator as Record<string, unknown>).email
            : null,
        ),
        organizerEmail: readOptionalText(
          candidate.organizer && typeof candidate.organizer === 'object'
            ? (candidate.organizer as Record<string, unknown>).email
            : null,
        ),
        start: toGoogleCalendarBoundary(candidate.start),
        end: toGoogleCalendarBoundary(candidate.end),
      } satisfies GoogleCalendarEvent,
    ]
  })
}
