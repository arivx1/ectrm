import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  getDefaultTimeDisplaySettings,
  normalizeTimeDisplaySettings,
  resolveTimeDisplayTimeZone,
} from '../src/shared/timeDisplaySettings.ts'

test('normalizeTimeDisplaySettings keeps valid values and falls back for invalid input', () => {
  const normalized = normalizeTimeDisplaySettings({
    timeZone: 'America/Chicago',
  })

  assert.equal(normalized.timeZone, 'America/Chicago')
  assert.deepEqual(
    normalizeTimeDisplaySettings({
      timeZone: 'Mars/Olympus_Mons',
    }),
    getDefaultTimeDisplaySettings(),
  )
  assert.deepEqual(
    normalizeTimeDisplaySettings({
      timeZone: 'system',
    }),
    getDefaultTimeDisplaySettings(),
  )
})

test('resolveTimeDisplayTimeZone returns the explicit zone and resolves the system fallback', () => {
  assert.equal(resolveTimeDisplayTimeZone({ timeZone: 'UTC' }), 'UTC')
  assert.ok(resolveTimeDisplayTimeZone({ timeZone: 'system' }).length > 0)
})
