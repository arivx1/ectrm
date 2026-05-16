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

  let sessionChangeCount = 0
  const resolution = await resolveMessagingAgentSession(
    {
      apiBase: 'http://localhost:8000',
      authSession,
      onSessionSync: async () => {
        sessionChangeCount += 1
      },
    },
    {
      createSingleUserAuthSession: async () => {
        throw new Error('should not request a single-user session')
      },
      loadPublicRuntimeSettings: async () => {
        throw new Error('should not load runtime settings when a session already exists')
      },
    },
  )

  assert.equal(resolution.source, 'existing_session')
  assert.deepEqual(resolution.session, authSession)
  assert.equal(sessionChangeCount, 0)
})

test('messaging agent can claim a single-user session when the backend enables it', async () => {
  const changedSessions: unknown[] = []
  const resolution = await resolveMessagingAgentSession(
    {
      apiBase: 'http://localhost:8000',
      authSession: null,
      onSessionSync: async (session) => {
        changedSessions.push(session)
      },
    },
    {
      createSingleUserAuthSession: async () => ({
        session_id: 'single-user-session',
        access_token: 'single-user-token',
        expires_at: '2026-05-16T00:00:00Z',
        user: {
          user_id: 'ops_admin',
          email: 'ops@example.com',
          display_name: 'Ops Admin',
          role: 'OPS_ADMIN',
        },
      }),
      loadPublicRuntimeSettings: async () => ({
        app_version: 'test',
        database: {
          dialect: 'sqlite',
          name: 'ectrm',
          size_bytes: null,
          table_count: 0,
          record_count: 0,
        },
        cors_allow_origins: [],
        mutation_protection_enabled: true,
        bootstrap_admin_enabled: false,
        single_user_auth_enabled: true,
        google_auth: {
          enabled: false,
          client_id: null,
          auto_create_users: false,
        },
        projection_monitoring_email: {
          transport: 'local_archive',
          provider_hint: 'none',
          smtp_host: null,
          smtp_port: null,
          sender: 'noreply@example.com',
          recipient_count: 0,
          auth_status: 'none',
        },
        session_ttl_hours: 8,
        eia_base_url: 'https://example.com',
        eia_timeout_seconds: 30,
        assistant: {
          enabled: true,
          default_provider: 'openai',
          effective_default_provider: 'openai',
          provider_model_overrides: {},
          available_providers: ['openai'],
          unavailable_providers: [],
        },
        pagination: {
          standard_default: 50,
          standard_max: 2000,
          admin_default: 100,
          admin_max: 1000,
        },
      }),
    },
  )

  assert.equal(resolution.source, 'single_user_session')
  assert.deepEqual(resolution.session?.user.display_name, 'Ops Admin')
  assert.deepEqual(changedSessions, [resolution.session])
})

test('messaging agent requires manual sign-in when single-user auth is disabled', async () => {
  const resolution = await resolveMessagingAgentSession(
    {
      apiBase: 'http://localhost:8000',
      authSession: null,
      onSessionSync: async () => {
        throw new Error('should not update the session when single-user auth is disabled')
      },
    },
    {
      createSingleUserAuthSession: async () => {
        throw new Error('should not request a single-user session when disabled')
      },
      loadPublicRuntimeSettings: async () => ({
        app_version: 'test',
        database: {
          dialect: 'sqlite',
          name: 'ectrm',
          size_bytes: null,
          table_count: 0,
          record_count: 0,
        },
        cors_allow_origins: [],
        mutation_protection_enabled: true,
        bootstrap_admin_enabled: false,
        single_user_auth_enabled: false,
        google_auth: {
          enabled: false,
          client_id: null,
          auto_create_users: false,
        },
        projection_monitoring_email: {
          transport: 'local_archive',
          provider_hint: 'none',
          smtp_host: null,
          smtp_port: null,
          sender: 'noreply@example.com',
          recipient_count: 0,
          auth_status: 'none',
        },
        session_ttl_hours: 8,
        eia_base_url: 'https://example.com',
        eia_timeout_seconds: 30,
        assistant: {
          enabled: true,
          default_provider: 'openai',
          effective_default_provider: 'openai',
          provider_model_overrides: {},
          available_providers: ['openai'],
          unavailable_providers: [],
        },
        pagination: {
          standard_default: 50,
          standard_max: 2000,
          admin_default: 100,
          admin_max: 1000,
        },
      }),
    },
  )

  assert.equal(resolution.source, 'sign_in_required')
  assert.equal(resolution.session, null)
})
