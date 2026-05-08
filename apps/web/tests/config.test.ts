import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'vitest'

import { normalizeApiBase } from '../src/shared/config.ts'

type WindowStub = Pick<Window, 'location'>

const originalWindow = globalThis.window

beforeEach(() => {
  const windowStub: WindowStub = {
    location: {
      href: 'http://ectrm.local:5174/app',
      hostname: 'ectrm.local',
      protocol: 'http:',
    } as Location,
  }

  Object.defineProperty(globalThis, 'window', {
    value: windowStub,
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
    return
  }

  Object.defineProperty(globalThis, 'window', {
    value: originalWindow,
    configurable: true,
    writable: true,
  })
})

test('normalizeApiBase keeps an explicit loopback API base intact on non-loopback browser hosts', () => {
  assert.equal(normalizeApiBase('http://127.0.0.1:8000/'), 'http://127.0.0.1:8000')
  assert.equal(normalizeApiBase('http://localhost:8000/'), 'http://localhost:8000')
})

test('normalizeApiBase still resolves relative API bases against the current browser origin', () => {
  assert.equal(normalizeApiBase('/api/'), 'http://ectrm.local:5174/api')
})
