import { useEffect, useEffectEvent, useRef, useState } from 'react'

import {
  loadGoogleIdentityScript,
  type GoogleOAuthErrorResponse,
  type GoogleTokenClient,
  type GoogleTokenResponse,
} from '../../entities/auth/googleIdentity'
import {
  GOOGLE_CALENDAR_READONLY_SCOPE,
  describeGoogleCalendarEventWindow,
  loadGoogleCalendars,
  loadUpcomingGoogleCalendarEvents,
  resolvePreferredGoogleCalendarId,
  type GoogleCalendarEvent,
  type GoogleCalendarListEntry,
} from '../../entities/calendar/googleCalendar'
import {
  clearGoogleCalendarSession,
  getGoogleCalendarSessionSnapshot,
  googleCalendarSessionTokenIsUsable,
  saveGoogleCalendarAccessToken,
  saveGoogleCalendarEventCache,
  saveGoogleCalendarScopeGranted,
  saveGoogleCalendarSelection,
} from '../../entities/calendar/googleCalendarSession'

type GoogleCalendarPanelProps = {
  googleClientId: string | null
  googleAuthEnabled: boolean
  runtimeSettingsLoading: boolean
  runtimeSettingsError?: string
}

type CalendarAction = 'connect' | 'refresh' | 'disconnect' | 'load' | null

function describeGoogleCalendarOauthError(error: GoogleOAuthErrorResponse): string {
  switch (error.type) {
    case 'popup_closed':
      return 'Google Calendar connection was closed before access was granted.'
    case 'popup_failed_to_open':
      return 'The browser blocked the Google Calendar sign-in window.'
    default:
      return error.message?.trim() || 'Could not connect to Google Calendar.'
  }
}
function formatLastLoadedAt(value: string | null): string {
  if (!value) {
    return 'Not yet loaded'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Not yet loaded'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

export function GoogleCalendarPanel({
  googleClientId,
  googleAuthEnabled,
  runtimeSettingsLoading,
  runtimeSettingsError = '',
}: GoogleCalendarPanelProps) {
  const initialCalendarSession = getGoogleCalendarSessionSnapshot()
  const configuredClientId = googleClientId?.trim() ?? ''
  const [oauthReady, setOauthReady] = useState(false)
  const [oauthError, setOauthError] = useState('')
  const [calendarAction, setCalendarAction] = useState<CalendarAction>(null)
  const [calendarError, setCalendarError] = useState('')
  const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([])
  const [events, setEvents] = useState<GoogleCalendarEvent[]>(() => initialCalendarSession.cachedEvents)
  const [selectedCalendarId, setSelectedCalendarId] = useState(initialCalendarSession.selectedCalendarId)
  const [accessToken, setAccessToken] = useState<string | null>(initialCalendarSession.accessToken)
  const [accessTokenExpiresAt, setAccessTokenExpiresAt] = useState<number | null>(
    initialCalendarSession.accessTokenExpiresAt,
  )
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(initialCalendarSession.cachedAt)
  const [scopeGranted, setScopeGranted] = useState(initialCalendarSession.scopeGranted)
  const tokenClientRef = useRef<GoogleTokenClient | null>(null)
  const requestSequenceRef = useRef(0)

  const calendarConfigured = Boolean(configuredClientId)
  const calendarConnected = Boolean(accessToken || events.length > 0 || calendars.length > 0)
  const currentCalendar = calendars.find((calendar) => calendar.id === selectedCalendarId) ?? null

  useEffect(() => {
    setOauthReady(false)
    setOauthError('')
    tokenClientRef.current = null

    if (!configuredClientId) {
      return
    }

    let cancelled = false

    async function initializeGoogleIdentity() {
      try {
        await loadGoogleIdentityScript()
        if (!cancelled) {
          setOauthReady(true)
        }
      } catch (error) {
        if (!cancelled) {
          setOauthError(error instanceof Error ? error.message : 'Could not load the Google identity library.')
        }
      }
    }

    void initializeGoogleIdentity()

    return () => {
      cancelled = true
    }
  }, [configuredClientId])

  async function loadCalendarSnapshot(token: string, preferredCalendarId: string) {
    const requestId = requestSequenceRef.current + 1
    requestSequenceRef.current = requestId
    setCalendarAction('load')
    setCalendarError('')

    try {
      const nextCalendars = await loadGoogleCalendars(token)
      if (requestSequenceRef.current !== requestId) {
        return
      }

      setCalendars(nextCalendars)

      const nextCalendarId = resolvePreferredGoogleCalendarId(nextCalendars, preferredCalendarId)
      const nextCalendarSummary =
        nextCalendars.find((calendar) => calendar.id === nextCalendarId)?.summary ?? null
      setSelectedCalendarId(nextCalendarId ?? '')
      saveGoogleCalendarSelection({
        selectedCalendarId: nextCalendarId ?? '',
        selectedCalendarSummary: nextCalendarSummary,
      })

      const nextEvents = nextCalendarId ? await loadUpcomingGoogleCalendarEvents(token, nextCalendarId) : []
      if (requestSequenceRef.current !== requestId) {
        return
      }

      setEvents(nextEvents)
      const cachedAt = new Date().toISOString()
      setLastLoadedAt(cachedAt)
      saveGoogleCalendarEventCache({
        selectedCalendarSummary: nextCalendarSummary,
        events: nextEvents,
        cachedAt,
      })
    } catch (error) {
      if (requestSequenceRef.current !== requestId) {
        return
      }

      setCalendarError(error instanceof Error ? error.message : 'Could not load Google Calendar.')
    } finally {
      if (requestSequenceRef.current === requestId) {
        setCalendarAction(null)
      }
    }
  }

  async function loadEventsForCalendar(token: string, calendarId: string) {
    const requestId = requestSequenceRef.current + 1
    requestSequenceRef.current = requestId
    setCalendarAction('load')
    setCalendarError('')

    try {
      const nextEvents = await loadUpcomingGoogleCalendarEvents(token, calendarId)
      if (requestSequenceRef.current !== requestId) {
        return
      }

      setEvents(nextEvents)
      const cachedAt = new Date().toISOString()
      const selectedCalendarSummary =
        calendars.find((calendar) => calendar.id === calendarId)?.summary ?? null
      setLastLoadedAt(cachedAt)
      saveGoogleCalendarEventCache({
        selectedCalendarSummary,
        events: nextEvents,
        cachedAt,
      })
    } catch (error) {
      if (requestSequenceRef.current !== requestId) {
        return
      }

      setCalendarError(error instanceof Error ? error.message : 'Could not refresh Google Calendar.')
    } finally {
      if (requestSequenceRef.current === requestId) {
        setCalendarAction(null)
      }
    }
  }

  const handleTokenResponse = useEffectEvent(async (response: GoogleTokenResponse) => {
    const token = response.access_token?.trim() ?? ''
    if (!token) {
      setCalendarAction(null)
      setCalendarError(response.error_description?.trim() || 'Google did not return a calendar access token.')
      return
    }

    setAccessToken(token)
    setAccessTokenExpiresAt(
      typeof response.expires_in === 'number' && Number.isFinite(response.expires_in)
        ? Date.now() + Math.max(response.expires_in - 60, 0) * 1000
        : null,
    )
    setScopeGranted(true)
    saveGoogleCalendarAccessToken({
      accessToken: token,
      accessTokenExpiresAt:
        typeof response.expires_in === 'number' && Number.isFinite(response.expires_in)
          ? Date.now() + Math.max(response.expires_in - 60, 0) * 1000
          : null,
    })
    saveGoogleCalendarScopeGranted(true)
    await loadCalendarSnapshot(token, selectedCalendarId)
  })

  useEffect(() => {
    if (!oauthReady || !configuredClientId) {
      return
    }

    const googleOauth = window.google?.accounts?.oauth2
    if (!googleOauth) {
      setOauthError('Google Calendar authorization did not finish loading in this browser.')
      return
    }

    tokenClientRef.current = googleOauth.initTokenClient({
      client_id: configuredClientId,
      scope: GOOGLE_CALENDAR_READONLY_SCOPE,
      callback: (response) => {
        void handleTokenResponse(response)
      },
      error_callback: (error) => {
        setCalendarAction(null)
        setCalendarError(describeGoogleCalendarOauthError(error))
      },
    })

    return () => {
      tokenClientRef.current = null
    }
  }, [configuredClientId, oauthReady])

  function clearCalendarState() {
    requestSequenceRef.current += 1
    setAccessToken(null)
    setAccessTokenExpiresAt(null)
    setCalendars([])
    setEvents([])
    setSelectedCalendarId('')
    setLastLoadedAt(null)
    setScopeGranted(false)
    clearGoogleCalendarSession()
  }

  function requestGoogleCalendarToken(prompt: '' | 'consent') {
    if (!tokenClientRef.current) {
      setCalendarError('Google Calendar is not ready in this browser yet.')
      return
    }

    setCalendarAction(prompt === 'consent' ? 'connect' : 'refresh')
    setCalendarError('')
    tokenClientRef.current.requestAccessToken({ prompt })
  }

  function handleConnectCalendar() {
    requestGoogleCalendarToken('consent')
  }

  function handleRefreshCalendar() {
    if (
      accessToken &&
      googleCalendarSessionTokenIsUsable({
        accessToken,
        accessTokenExpiresAt,
      })
    ) {
      void loadCalendarSnapshot(accessToken, selectedCalendarId)
      return
    }

    requestGoogleCalendarToken('')
  }

  function handleDisconnectCalendar() {
    const tokenToRevoke = accessToken?.trim() ?? ''
    clearCalendarState()

    if (!tokenToRevoke || !window.google?.accounts?.oauth2?.revoke) {
      return
    }

    setCalendarAction('disconnect')
    window.google.accounts.oauth2.revoke(tokenToRevoke, () => {
      setCalendarAction(null)
    })
  }

  const runtimeDetail = googleAuthEnabled
    ? 'The same Google client configuration that powers browser sign-in can also request readonly calendar access.'
    : 'Google app sign-in is disabled, but the exposed client ID can still power readonly browser calendar access.'

  return (
    <article className="surface">
      <div className="section-head">
        <div>
          <span className="eyebrow">Calendar</span>
          <h3>Google Calendar</h3>
        </div>
        <p>Pull the next few events from your Google Calendar into the app without storing calendar data on the ECTRM API.</p>
      </div>

      {runtimeSettingsLoading ? (
        <div className="skeleton-stack">
          <div className="skeleton-block" />
          <div className="skeleton-block" />
        </div>
      ) : runtimeSettingsError ? (
        <div className="empty-state">
          <strong>Runtime settings unavailable</strong>
          <p>The app could not confirm whether Google Calendar access is configured because the public runtime settings endpoint did not load.</p>
        </div>
      ) : !calendarConfigured ? (
        <div className="empty-state">
          <strong>Calendar connection is not configured</strong>
          <p>
            Set <code>GOOGLE_AUTH_CLIENT_ID</code> on the API first, then reload this workspace to enable the browser-side calendar reader.
          </p>
        </div>
      ) : oauthError ? (
        <div className="empty-state">
          <strong>Google identity could not load</strong>
          <p>{oauthError}</p>
        </div>
      ) : (
        <div className="google-calendar-panel">
          <div className="settings-summary-grid">
            <article className="settings-summary-card">
              <span>Connection</span>
              <strong>
                {calendarConnected ? 'Connected' : scopeGranted ? 'Reconnect needed' : 'Not connected'}
              </strong>
              <p>
                {calendarConnected
                  ? currentCalendar
                    ? `Showing ${currentCalendar.summary} from the next 7 days.`
                    : 'Calendar data is connected and ready to refresh.'
                  : runtimeDetail}
              </p>
            </article>
            <article className="settings-summary-card">
              <span>Access</span>
              <strong>Readonly</strong>
              <p>The panel only asks Google for calendar read access and keeps access tokens in the browser session.</p>
            </article>
            <article className="settings-summary-card">
              <span>Last synced</span>
              <strong>{formatLastLoadedAt(lastLoadedAt)}</strong>
              <p>{calendarConnected ? 'Use Refresh when you need a newer upcoming-events snapshot.' : 'Connect a calendar to pull the first snapshot.'}</p>
            </article>
          </div>

          <div className="toolbar settings-actions google-calendar-toolbar">
            <button
              type="button"
              className="button button-primary"
              onClick={handleConnectCalendar}
              disabled={!oauthReady || calendarAction === 'connect' || calendarAction === 'load'}
            >
              {calendarAction === 'connect' ? 'Connecting…' : calendarConnected ? 'Reconnect Calendar' : 'Connect Google Calendar'}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={handleRefreshCalendar}
              disabled={!oauthReady || !calendarConnected || calendarAction === 'refresh' || calendarAction === 'load'}
            >
              {calendarAction === 'refresh' || calendarAction === 'load' ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              className="button button-ghost"
              onClick={handleDisconnectCalendar}
              disabled={!calendarConnected || calendarAction === 'disconnect'}
            >
              {calendarAction === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>

          {calendarError ? <p className="form-note form-note-error">{calendarError}</p> : null}

          {calendarConnected ? (
            <>
              <div className="google-calendar-filter-grid">
                <label className="field">
                  <span>Calendar</span>
                  <select
                    className="control"
                    value={selectedCalendarId}
                    onChange={(event) => {
                      const nextCalendarId = event.target.value
                      const nextCalendarSummary =
                        calendars.find((calendar) => calendar.id === nextCalendarId)?.summary ?? null
                      setSelectedCalendarId(nextCalendarId)
                      saveGoogleCalendarSelection({
                        selectedCalendarId: nextCalendarId,
                        selectedCalendarSummary: nextCalendarSummary,
                      })

                      if (
                        accessToken &&
                        googleCalendarSessionTokenIsUsable({
                          accessToken,
                          accessTokenExpiresAt,
                        }) &&
                        nextCalendarId
                      ) {
                        void loadEventsForCalendar(accessToken, nextCalendarId)
                      } else {
                        setEvents([])
                      }
                    }}
                  >
                    {calendars.map((calendar) => (
                      <option key={calendar.id} value={calendar.id}>
                        {calendar.primary ? `${calendar.summary} (Primary)` : calendar.summary}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="form-note">
                Upcoming events stay scoped to the next 7 days. Google Calendar event content is fetched directly from the browser and is not persisted by ECTRM.
              </p>

              {events.length > 0 ? (
                <div className="google-calendar-event-list">
                  {events.map((event) => {
                    const window = describeGoogleCalendarEventWindow(event)
                    return (
                      <article key={event.id} className="google-calendar-event-row">
                        <div className="google-calendar-event-copy">
                          <strong>{event.summary}</strong>
                          <p>
                            {window.primary} · {window.secondary}
                          </p>
                          {event.location ? <span>{event.location}</span> : null}
                          {!event.location && event.organizerEmail ? <span>{event.organizerEmail}</span> : null}
                        </div>
                        <div className="google-calendar-event-meta">
                          {event.htmlLink ? (
                            <a href={event.htmlLink} target="_blank" rel="noreferrer">
                              Open in Google
                            </a>
                          ) : (
                            <span className="google-calendar-event-status">{event.status ?? 'Scheduled'}</span>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No upcoming events found</strong>
                  <p>The selected calendar does not have any events scheduled in the next 7 days.</p>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <strong>Connect your Google Calendar</strong>
              <p>Authorize readonly access to load upcoming events into this workspace. The connection stays browser-side so the API never stores your Google token.</p>
            </div>
          )}
        </div>
      )}
    </article>
  )
}
