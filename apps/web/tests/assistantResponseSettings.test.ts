import assert from 'node:assert/strict'

import { afterEach, test } from 'vitest'

import {
  clearAssistantResponseSettingsSnapshot,
  formatMessagingAgentBrevityPreference,
  getAssistantResponseSettingsSnapshot,
  getDefaultAssistantResponseSettings,
  getMessagingAgentBrevityInstruction,
  normalizeAssistantResponseSettings,
  saveAssistantResponseSettingsSnapshot,
  type AssistantResponseSettings,
} from '../src/shared/assistantResponseSettings'

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

test('assistant response settings default messaging agent replies to brief', () => {
  assert.deepEqual(getDefaultAssistantResponseSettings(), {
    messagingAgentBrevity: 'brief',
  })
  assert.deepEqual(
    normalizeAssistantResponseSettings({
      messagingAgentBrevity: 'verbose',
    } as Partial<AssistantResponseSettings>),
    {
      messagingAgentBrevity: 'brief',
    },
  )
})

test('assistant response settings read, write, and reset the browser preference', () => {
  installWindowWithStorage()

  assert.deepEqual(getAssistantResponseSettingsSnapshot(), {
    messagingAgentBrevity: 'brief',
  })

  assert.deepEqual(
    saveAssistantResponseSettingsSnapshot({ messagingAgentBrevity: 'terse' }),
    {
      messagingAgentBrevity: 'terse',
    },
  )
  assert.deepEqual(getAssistantResponseSettingsSnapshot(), {
    messagingAgentBrevity: 'terse',
  })

  assert.deepEqual(clearAssistantResponseSettingsSnapshot(), {
    messagingAgentBrevity: 'brief',
  })
  assert.deepEqual(getAssistantResponseSettingsSnapshot(), {
    messagingAgentBrevity: 'brief',
  })
})

test('messaging agent brevity labels and instructions stay user-facing', () => {
  assert.equal(formatMessagingAgentBrevityPreference('balanced'), 'Balanced')
  assert.equal(formatMessagingAgentBrevityPreference('brief'), 'Brief')
  assert.equal(formatMessagingAgentBrevityPreference('terse'), 'Terse')
  assert.match(getMessagingAgentBrevityInstruction('terse'), /one short answer/i)
  assert.match(getMessagingAgentBrevityInstruction('brief'), /one to three compact/i)
})
