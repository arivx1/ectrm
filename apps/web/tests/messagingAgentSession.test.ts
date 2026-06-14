import assert from 'node:assert/strict'
import { test } from 'vitest'

import { resolveMessagingAgentSession } from '../src/workspaces/messages/messagingAgentSession'

test('messaging agent reuses the current auth session when one already exists', async () => {
  const authSession = {
    sessionId: 'existing-session',
    accessToken: 'existing-token',
    expiresAt: '2026-05-16T00:00:00Z',
    user: {
      user_id: 'ops_admin',
      email: 'ops@example.com',
      display_name: 'Ops Admin',
      role: 'OPS_ADMIN',
    },
  }

  const resolution = await resolveMessagingAgentSession({
    authSession,
  })

  assert.equal(resolution.source, 'existing_session')
  assert.deepEqual(resolution.session, authSession)
})

test('messaging agent requires explicit sign-in when no authenticated session exists', async () => {
  const resolution = await resolveMessagingAgentSession({
    authSession: null,
  })

  assert.equal(resolution.source, 'sign_in_required')
  assert.equal(resolution.session, null)
})

test('messaging agent does not auto-claim the local single-user admin session', async () => {
  const resolution = await resolveMessagingAgentSession({
    authSession: null,
  })

  assert.notEqual(resolution.source, 'existing_session')
  assert.equal(resolution.source, 'sign_in_required')
  assert.equal(resolution.session, null)
})
