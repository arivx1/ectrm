import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'vitest'

import {
  clearGoogleCalendarSession,
  getGoogleCalendarSessionSnapshot,
  saveGoogleCalendarAccessToken,
  saveGoogleCalendarEventCache,
  saveGoogleCalendarScopeGranted,
  saveGoogleCalendarSelection,
} from '../src/entities/calendar/googleCalendarSession.ts'

function createStorageMock(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key) {
      store.delete(key)
    },
    setItem(key, value) {
      store.set(key, value)
    },
  }
}

function createWindowMock() {
  const eventTarget = new EventTarget()

  return {
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
    localStorage: createStorageMock(),
    sessionStorage: createStorageMock(),
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    value: createWindowMock(),
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
})

test('google calendar session snapshot keeps a stable reference when storage is unchanged', () => {
  const initialSnapshot = getGoogleCalendarSessionSnapshot()
  const repeatedInitialSnapshot = getGoogleCalendarSessionSnapshot()

  assert.equal(repeatedInitialSnapshot, initialSnapshot)
  assert.equal(repeatedInitialSnapshot.cachedEvents, initialSnapshot.cachedEvents)

  saveGoogleCalendarSelection({
    selectedCalendarId: 'desk-calendar',
    selectedCalendarSummary: 'Desk Calendar',
  })
  saveGoogleCalendarScopeGranted(true)
  saveGoogleCalendarAccessToken({
    accessToken: 'calendar-token',
    accessTokenExpiresAt: 1_800_000_000_000,
  })
  saveGoogleCalendarEventCache({
    selectedCalendarSummary: 'Desk Calendar',
    cachedAt: '2026-05-08T21:00:00.000Z',
    events: [
      {
        id: 'evt-1',
        summary: 'Morning Risk Check',
        description: null,
        location: null,
        htmlLink: null,
        status: null,
        creatorEmail: null,
        organizerEmail: null,
        start: {
          date: null,
          dateTime: '2026-05-08T15:00:00.000Z',
          timeZone: null,
        },
        end: {
          date: null,
          dateTime: '2026-05-08T15:30:00.000Z',
          timeZone: null,
        },
      },
    ],
  })

  const populatedSnapshot = getGoogleCalendarSessionSnapshot()
  const repeatedPopulatedSnapshot = getGoogleCalendarSessionSnapshot()

  assert.equal(repeatedPopulatedSnapshot, populatedSnapshot)
  assert.equal(repeatedPopulatedSnapshot.cachedEvents, populatedSnapshot.cachedEvents)
  assert.deepEqual(populatedSnapshot, {
    accessToken: 'calendar-token',
    accessTokenExpiresAt: 1_800_000_000_000,
    selectedCalendarId: 'desk-calendar',
    selectedCalendarSummary: 'Desk Calendar',
    scopeGranted: true,
    cachedEvents: [
      {
        id: 'evt-1',
        summary: 'Morning Risk Check',
        description: null,
        location: null,
        htmlLink: null,
        status: null,
        creatorEmail: null,
        organizerEmail: null,
        start: {
          date: null,
          dateTime: '2026-05-08T15:00:00.000Z',
          timeZone: null,
        },
        end: {
          date: null,
          dateTime: '2026-05-08T15:30:00.000Z',
          timeZone: null,
        },
      },
    ],
    cachedAt: '2026-05-08T21:00:00.000Z',
  })

  saveGoogleCalendarScopeGranted(false)

  const updatedSnapshot = getGoogleCalendarSessionSnapshot()
  assert.notEqual(updatedSnapshot, populatedSnapshot)
  assert.equal(updatedSnapshot.scopeGranted, false)
})

test('google calendar session stores durable calendar access in local storage', () => {
  saveGoogleCalendarSelection({
    selectedCalendarId: 'desk-calendar',
    selectedCalendarSummary: 'Desk Calendar',
  })
  saveGoogleCalendarScopeGranted(true)
  saveGoogleCalendarAccessToken({
    accessToken: 'calendar-token',
    accessTokenExpiresAt: 1_800_000_000_000,
  })
  saveGoogleCalendarEventCache({
    selectedCalendarSummary: 'Desk Calendar',
    cachedAt: '2026-05-08T21:00:00.000Z',
    events: [],
  })

  assert.equal(
    window.localStorage.getItem('ectrm.google-calendar.selected-calendar-summary'),
    'Desk Calendar',
  )
  assert.equal(
    window.localStorage.getItem('ectrm.google-calendar.access-token'),
    'calendar-token',
  )
  assert.equal(
    window.localStorage.getItem('ectrm.google-calendar.access-token-expires-at'),
    '1800000000000',
  )
  assert.equal(
    window.localStorage.getItem('ectrm.google-calendar.cached-at'),
    '2026-05-08T21:00:00.000Z',
  )
  assert.equal(
    window.sessionStorage.getItem('ectrm.google-calendar.selected-calendar-summary'),
    null,
  )
  assert.equal(
    window.sessionStorage.getItem('ectrm.google-calendar.access-token'),
    null,
  )
  assert.equal(
    window.sessionStorage.getItem('ectrm.google-calendar.access-token-expires-at'),
    null,
  )
  assert.equal(
    window.sessionStorage.getItem('ectrm.google-calendar.cached-at'),
    null,
  )

  clearGoogleCalendarSession()

  assert.equal(window.localStorage.getItem('ectrm.google-calendar.access-token'), null)
  assert.equal(window.localStorage.getItem('ectrm.google-calendar.cached-at'), null)
})

test('google calendar session snapshot still reads legacy session storage entries', () => {
  window.sessionStorage.setItem(
    'ectrm.google-calendar.selected-calendar-summary',
    'Legacy Desk',
  )
  window.sessionStorage.setItem('ectrm.google-calendar.access-token', 'legacy-token')
  window.sessionStorage.setItem(
    'ectrm.google-calendar.access-token-expires-at',
    '1800000000000',
  )
  window.sessionStorage.setItem(
    'ectrm.google-calendar.cached-at',
    '2026-05-08T22:00:00.000Z',
  )
  window.sessionStorage.setItem(
    'ectrm.google-calendar.cached-events',
    JSON.stringify([
      {
        id: 'evt-legacy',
        summary: 'Legacy Session Event',
        description: null,
        location: null,
        htmlLink: null,
        status: null,
        creatorEmail: null,
        organizerEmail: null,
        start: {
          date: null,
          dateTime: '2026-05-08T15:00:00.000Z',
          timeZone: null,
        },
        end: {
          date: null,
          dateTime: '2026-05-08T15:30:00.000Z',
          timeZone: null,
        },
      },
    ]),
  )

  const snapshot = getGoogleCalendarSessionSnapshot()

  assert.equal(snapshot.selectedCalendarSummary, 'Legacy Desk')
  assert.equal(snapshot.accessToken, 'legacy-token')
  assert.equal(snapshot.accessTokenExpiresAt, 1_800_000_000_000)
  assert.equal(snapshot.cachedAt, '2026-05-08T22:00:00.000Z')
  assert.equal(snapshot.cachedEvents.length, 1)
  assert.equal(snapshot.cachedEvents[0]?.id, 'evt-legacy')
})
