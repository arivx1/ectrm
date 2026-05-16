import {
  createSingleUserAuthSession,
  type SessionResponse,
} from '../../entities/auth/api'
import {
  loadPublicRuntimeSettings,
  type PublicRuntimeSettings,
} from '../../entities/app/api'
import type { StoredAuthSession } from '../../shared/mutation'

export type MessagingAgentSessionResolution =
  | {
      session: StoredAuthSession
      source: 'existing_session' | 'single_user_session'
    }
  | {
      session: null
      source: 'sign_in_required'
    }

type ResolveMessagingAgentSessionArgs = {
  apiBase: string
  authSession: StoredAuthSession | null
  onSessionSync: (session: StoredAuthSession | null) => Promise<void> | void
}

type ResolveMessagingAgentSessionDependencies = {
  createSingleUserAuthSession: (apiBase: string) => Promise<SessionResponse>
  loadPublicRuntimeSettings: (apiBase: string) => Promise<PublicRuntimeSettings>
}

function mapSessionResponse(session: SessionResponse): StoredAuthSession {
  return {
    sessionId: session.session_id,
    accessToken: session.access_token,
    expiresAt: session.expires_at,
    user: session.user,
  }
}

export async function resolveMessagingAgentSession(
  args: ResolveMessagingAgentSessionArgs,
  dependencies: ResolveMessagingAgentSessionDependencies = {
    createSingleUserAuthSession,
    loadPublicRuntimeSettings,
  },
): Promise<MessagingAgentSessionResolution> {
  if (args.authSession) {
    return {
      session: args.authSession,
      source: 'existing_session',
    }
  }

  const runtimeSettings = await dependencies.loadPublicRuntimeSettings(args.apiBase)
  if (!runtimeSettings.single_user_auth_enabled) {
    return {
      session: null,
      source: 'sign_in_required',
    }
  }

  const nextSession = mapSessionResponse(
    await dependencies.createSingleUserAuthSession(args.apiBase),
  )
  await args.onSessionSync(nextSession)
  return {
    session: nextSession,
    source: 'single_user_session',
  }
}
