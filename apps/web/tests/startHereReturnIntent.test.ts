import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'vitest'

import {
  clearStartHereReturnIntent,
  formatStartHereReturnIntentLabel,
  getStartHereReturnIntent,
  saveStartHereReturnIntent,
} from '../src/shared/startHereReturnIntent.ts'

function createLocalStorageMock(): Storage {
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

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: createLocalStorageMock(),
    },
    configurable: true,
    writable: true,
  })
  window.localStorage.clear()
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
})

test('start-here return intent stores only supported workspace targets', () => {
  assert.equal(getStartHereReturnIntent(), null)

  saveStartHereReturnIntent('trades')
  assert.equal(getStartHereReturnIntent(), 'trades')

  window.localStorage.setItem('ectrm.start-here-return-intent', 'dashboard')
  assert.equal(getStartHereReturnIntent(), null)

  clearStartHereReturnIntent()
  assert.equal(getStartHereReturnIntent(), null)
})

test('start-here return intent labels stay user-facing', () => {
  assert.equal(formatStartHereReturnIntentLabel('trades'), 'Trade Capture')
  assert.equal(formatStartHereReturnIntentLabel('risk'), 'Exposure')
  assert.equal(formatStartHereReturnIntentLabel('operations'), 'Work Queue')
})
