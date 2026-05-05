import assert from 'node:assert/strict'

import { afterEach, test } from 'vitest'

import {
  clearCollapsibleCardStateSnapshot,
  getCollapsibleCardStateSnapshot,
  getCollapsibleCardStateValue,
  hasCollapsibleCardStateValue,
  saveCollapsibleCardStateValue,
} from '../src/shared/collapsibleCardState'

type LocalStorageMock = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

const originalWindow = globalThis.window

function installWindowWithStorage(initialEntries: Record<string, string> = {}) {
  const storage = new Map(Object.entries(initialEntries))
  const localStorage: LocalStorageMock = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      storage.set(key, value)
    },
    removeItem: (key) => {
      storage.delete(key)
    },
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage },
  })
}

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
  } else {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  }
})

test('reads and writes persisted collapsible card state values', () => {
  installWindowWithStorage()

  assert.equal(getCollapsibleCardStateValue('prompt-home.timeframe-panel', true), true)
  assert.equal(hasCollapsibleCardStateValue('prompt-home.timeframe-panel'), false)

  saveCollapsibleCardStateValue('prompt-home.timeframe-panel', false)
  saveCollapsibleCardStateValue('prompt-home.timeframe.day-card', true)

  assert.deepEqual(getCollapsibleCardStateSnapshot(), {
    'prompt-home.timeframe-panel': false,
    'prompt-home.timeframe.day-card': true,
  })
  assert.equal(getCollapsibleCardStateValue('prompt-home.timeframe-panel', true), false)
  assert.equal(hasCollapsibleCardStateValue('prompt-home.timeframe-panel'), true)

  clearCollapsibleCardStateSnapshot()
  assert.deepEqual(getCollapsibleCardStateSnapshot(), {})
})

test('ignores malformed stored collapsible card state entries', () => {
  installWindowWithStorage({
    'ectrm.collapsible-card-state': JSON.stringify({
      valid: true,
      invalidText: 'true',
      invalidNumber: 1,
    }),
  })

  assert.deepEqual(getCollapsibleCardStateSnapshot(), {
    valid: true,
  })
})
