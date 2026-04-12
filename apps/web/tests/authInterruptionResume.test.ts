import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'vitest'

import {
  clearAuthInterruptionResumeSnapshot,
  getAuthInterruptionResumeSnapshot,
  normalizeAuthInterruptionResumeSnapshot,
  saveAuthInterruptionResumeSnapshot,
} from '../src/shared/authInterruptionResume.ts'

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
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
})

test('auth interruption resume snapshot round-trips supported fields', () => {
  saveAuthInterruptionResumeSnapshot({
    reason: 'session_expired',
    url: '/?view=trades&trade=T-AMEND-100',
    continueLabel: 'the amendment for trade T-AMEND-100',
    inspectorTab: 'amend',
  })

  assert.deepEqual(getAuthInterruptionResumeSnapshot(), {
    reason: 'session_expired',
    url: '/?view=trades&trade=T-AMEND-100',
    continueLabel: 'the amendment for trade T-AMEND-100',
    inspectorTab: 'amend',
  })

  clearAuthInterruptionResumeSnapshot()
  assert.equal(getAuthInterruptionResumeSnapshot(), null)
})

test('auth interruption resume snapshot normalization rejects incomplete data', () => {
  assert.equal(
    normalizeAuthInterruptionResumeSnapshot({
      reason: 'session_expired',
      url: '   ',
      continueLabel: 'Exposure',
      inspectorTab: 'risk',
    }),
    null,
  )

  assert.deepEqual(
    normalizeAuthInterruptionResumeSnapshot({
      reason: 'session_expired',
      url: '/?view=risk',
      continueLabel: 'Exposure',
      inspectorTab: 'invalid',
    }),
    {
      reason: 'session_expired',
      url: '/?view=risk',
      continueLabel: 'Exposure',
      inspectorTab: null,
    },
  )
})
