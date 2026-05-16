import type { StoredAuthSession } from '../../shared/mutation'

export type MessagingAgentSessionResolution =
  | {
      session: StoredAuthSession
      source: 'existing_session'
    }
  | {
      session: null
      source: 'sign_in_required'
    }

type ResolveMessagingAgentSessionArgs = {
  authSession: StoredAuthSession | null
}

export async function resolveMessagingAgentSession(
  args: ResolveMessagingAgentSessionArgs,
): Promise<MessagingAgentSessionResolution> {
  if (args.authSession) {
    return {
      session: args.authSession,
      source: 'existing_session',
    }
  }

  return {
    session: null,
    source: 'sign_in_required',
  }
}
