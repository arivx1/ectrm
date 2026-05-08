import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'vitest'

import {
  clearPromptResumeIntent,
  clearPromptSignInReturnIntent,
  formatPromptResumeIntentLabel,
  getPromptResumeIntent,
  getPromptSignInReturnIntent,
  normalizePromptResumeIntent,
  savePromptResumeIntent,
  savePromptSignInReturnIntent,
} from '../src/shared/promptResumeIntent.ts'

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

test('prompt resume intent round-trips a protected draft', () => {
  assert.equal(getPromptResumeIntent(), null)

  savePromptResumeIntent({
    draft: '  Where should I handle the invoice blocker?  ',
    applicationContext: '  surface: settlement_report\nbook: CRUDE  ',
    summaryTargets: ['settlement.invoice_pending_count'],
    submitAfterSignIn: true,
    createdAt: '2026-04-22T09:00:00Z',
  })

  assert.deepEqual(getPromptResumeIntent(), {
    draft: 'Where should I handle the invoice blocker?',
    applicationContext: 'surface: settlement_report\nbook: CRUDE',
    summaryTargets: ['settlement.invoice_pending_count'],
    submitAfterSignIn: true,
    createdAt: '2026-04-22T09:00:00Z',
  })

  clearPromptResumeIntent()
  assert.equal(getPromptResumeIntent(), null)
})

test('prompt resume intent rejects blank drafts and labels safely', () => {
  assert.equal(normalizePromptResumeIntent({ draft: '   ', submitAfterSignIn: true }), null)

  const intent = normalizePromptResumeIntent({
    draft:
      'Summarize the operations queue and send me to the right workspace for the confirmation blocker.',
    submitAfterSignIn: false,
    createdAt: '2026-04-22T09:05:00Z',
  })

  assert.ok(intent)
  assert.equal(
    formatPromptResumeIntentLabel(intent),
    'your prompt: "Summarize the operations queue and send me to the right works..."',
  )
})

test('prompt resume intent returns stable snapshots for React subscriptions', () => {
  savePromptResumeIntent({
    draft: 'Where should I start?',
    submitAfterSignIn: false,
    createdAt: '2026-04-22T09:10:00Z',
  })

  assert.equal(getPromptResumeIntent(), getPromptResumeIntent())
})

test('prompt sign-in return intent round-trips without a draft', () => {
  assert.equal(getPromptSignInReturnIntent(), null)

  savePromptSignInReturnIntent('2026-04-22T09:15:00Z')
  assert.equal(getPromptSignInReturnIntent(), '2026-04-22T09:15:00Z')

  clearPromptSignInReturnIntent()
  assert.equal(getPromptSignInReturnIntent(), null)
})
