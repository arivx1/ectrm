import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'

import {
  loadGoogleCalendars,
  loadUpcomingGoogleCalendarEvents,
  resolvePreferredGoogleCalendarId,
} from '../src/entities/calendar/googleCalendar.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('resolvePreferredGoogleCalendarId keeps a stored selection when it still exists', () => {
  assert.equal(
    resolvePreferredGoogleCalendarId(
      [
        { id: 'team', summary: 'Team', description: null, primary: false, accessRole: 'owner', backgroundColor: null, timeZone: null },
        { id: 'primary', summary: 'Primary', description: null, primary: true, accessRole: 'owner', backgroundColor: null, timeZone: null },
      ],
      'team',
    ),
    'team',
  )
})

test('loadGoogleCalendars requests the Google calendar list with a bearer token and normalizes the response', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(
      JSON.stringify({
        items: [
          {
            id: 'primary',
            summary: 'Trading Desk',
            primary: true,
            accessRole: 'owner',
            backgroundColor: '#00897b',
            timeZone: 'America/Los_Angeles',
          },
        ],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }) as typeof fetch

  const payload = await loadGoogleCalendars('calendar-token')

  assert.deepEqual(payload, [
    {
      id: 'primary',
      summary: 'Trading Desk',
      description: null,
      primary: true,
      accessRole: 'owner',
      backgroundColor: '#00897b',
      timeZone: 'America/Los_Angeles',
    },
  ])
  assert.equal(calls.length, 1)
  assert.equal(
    calls[0]?.url,
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&showHidden=false&showDeleted=false',
  )
  assert.equal(new Headers(calls[0]?.init?.headers).get('Authorization'), 'Bearer calendar-token')
})

test('loadUpcomingGoogleCalendarEvents encodes the calendar id and sends the expected time window', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(
      JSON.stringify({
        items: [
          {
            id: 'evt-1',
            summary: 'Morning Risk Check',
            htmlLink: 'https://calendar.google.com/calendar/event?eid=123',
            start: {
              dateTime: '2026-05-07T16:00:00Z',
            },
            end: {
              dateTime: '2026-05-07T16:30:00Z',
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }) as typeof fetch

  const now = new Date('2026-05-07T12:00:00.000Z')
  const payload = await loadUpcomingGoogleCalendarEvents('calendar-token', 'desk calendar', {
    now,
    days: 3,
    maxResults: 5,
  })

  assert.deepEqual(payload, [
    {
      id: 'evt-1',
      summary: 'Morning Risk Check',
      description: null,
      location: null,
      htmlLink: 'https://calendar.google.com/calendar/event?eid=123',
      status: null,
      creatorEmail: null,
      organizerEmail: null,
      start: {
        date: null,
        dateTime: '2026-05-07T16:00:00Z',
        timeZone: null,
      },
      end: {
        date: null,
        dateTime: '2026-05-07T16:30:00Z',
        timeZone: null,
      },
    },
  ])
  assert.equal(calls.length, 1)
  assert.equal(
    calls[0]?.url,
    'https://www.googleapis.com/calendar/v3/calendars/desk%20calendar/events?singleEvents=true&orderBy=startTime&timeMin=2026-05-07T12%3A00%3A00.000Z&timeMax=2026-05-10T12%3A00%3A00.000Z&maxResults=5',
  )
  assert.equal(new Headers(calls[0]?.init?.headers).get('Authorization'), 'Bearer calendar-token')
})
