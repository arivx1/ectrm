import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'vitest'

import {
  ProfileAvatarMenu,
} from '../src/entities/app/ProfileAvatarMenu'
import {
  profileAvatarStorageKey,
  userInitials,
} from '../src/entities/app/profileAvatarMenuSupport'
import type { StoredAuthSession } from '../src/shared/mutation'

const authSession: StoredAuthSession = {
  sessionId: 'session-1',
  accessToken: 'token-1',
  expiresAt: '2026-06-05T18:00:00Z',
  user: {
    user_id: 'ops_admin',
    email: 'ops@example.com',
    display_name: 'Ops Admin',
    first_name: 'Ops',
    last_name: 'Admin',
    preferred_timezone: 'America/Chicago',
    primary_location: null,
    role: 'OPS_ADMIN',
    default_assistant_persona: 'trader',
    assistant_context_blurb: null,
  },
}

test('profile avatar menu derives stable initials and storage keys', () => {
  assert.equal(profileAvatarStorageKey('ops_admin'), 'ectrm.profile-avatar.ops_admin')
  assert.equal(userInitials(authSession.user), 'OA')
  assert.equal(
    userInitials({
      ...authSession.user,
      first_name: null,
      last_name: null,
      display_name: 'Desk Controller',
    }),
    'DC',
  )
})

test('profile avatar menu renders the signed-in user as an avatar trigger', () => {
  const markup = renderToStaticMarkup(
    createElement(ProfileAvatarMenu, {
      authSession,
      onOpenSettings: () => undefined,
      onSignOut: async () => undefined,
      signOutPending: false,
    }),
  )

  assert.match(markup, /Open profile menu for Ops Admin/)
  assert.match(markup, /profile-avatar-trigger/)
  assert.match(markup, />OA</)
  assert.doesNotMatch(markup, /Signed in as/)
})

test('profile avatar menu renders nothing without a session', () => {
  const markup = renderToStaticMarkup(
    createElement(ProfileAvatarMenu, {
      authSession: null,
      onOpenSettings: () => undefined,
      onSignOut: async () => undefined,
      signOutPending: false,
    }),
  )

  assert.equal(markup, '')
})
