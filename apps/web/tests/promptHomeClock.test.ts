import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  getPromptHomeNextClockTickDelay,
  PROMPT_HOME_CLOCK_TICK_MS,
} from '../src/workspaces/prompt/promptHomeClock'

test('prompt home clock delay waits until the next minute boundary', () => {
  assert.equal(
    getPromptHomeNextClockTickDelay(new Date('2026-05-05T12:11:12.250Z')),
    47_750,
  )
  assert.equal(
    getPromptHomeNextClockTickDelay(new Date('2026-05-05T12:11:59.500Z')),
    500,
  )
})

test('prompt home clock delay returns one minute on exact minute boundaries', () => {
  assert.equal(
    getPromptHomeNextClockTickDelay(new Date('2026-05-05T12:12:00.000Z')),
    PROMPT_HOME_CLOCK_TICK_MS,
  )
})
