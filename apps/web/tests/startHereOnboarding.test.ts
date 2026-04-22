import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  dismissStartHereOnboarding,
  getDefaultStartHereOnboardingSnapshot,
  normalizeStartHereOnboardingSnapshot,
  shouldPresentStartHereOnboarding,
} from '../src/shared/startHereOnboarding.ts'

const authenticatedSession = {
  sessionId: 'session-1',
  accessToken: 'token-1',
  expiresAt: '2026-04-12T18:00:00Z',
  user: {
    user_id: 'ops_admin',
    email: 'ops@example.com',
    display_name: 'Ops Admin',
    role: 'OPS_ADMIN',
  },
} as const

test('start-here onboarding defaults to visible for signed-out and newly signed-in users', () => {
  const snapshot = getDefaultStartHereOnboardingSnapshot()

  assert.equal(shouldPresentStartHereOnboarding(snapshot, null), true)
  assert.equal(shouldPresentStartHereOnboarding(snapshot, authenticatedSession), true)
})

test('dismissing the signed-out onboarding hides only the signed-out version', () => {
  const nextSnapshot = dismissStartHereOnboarding(getDefaultStartHereOnboardingSnapshot(), null)

  assert.equal(shouldPresentStartHereOnboarding(nextSnapshot, null), false)
  assert.equal(shouldPresentStartHereOnboarding(nextSnapshot, authenticatedSession), true)
})

test('dismissing the signed-in onboarding hides only that auth session', () => {
  const nextSnapshot = dismissStartHereOnboarding(
    getDefaultStartHereOnboardingSnapshot(),
    authenticatedSession,
  )

  assert.equal(shouldPresentStartHereOnboarding(nextSnapshot, authenticatedSession), false)
  assert.equal(
    shouldPresentStartHereOnboarding(nextSnapshot, {
      ...authenticatedSession,
      sessionId: 'session-2',
    }),
    true,
  )
  assert.equal(shouldPresentStartHereOnboarding(nextSnapshot, null), true)
})

test('start-here onboarding snapshot normalization drops invalid values safely', () => {
  const snapshot = normalizeStartHereOnboardingSnapshot({
    dismissedWhileSignedOut: true,
    dismissedAuthenticatedSessionId: '   ',
  })

  assert.deepEqual(snapshot, {
    dismissedWhileSignedOut: true,
    dismissedAuthenticatedSessionId: null,
  })
})
