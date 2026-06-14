import type { AssistantPersona } from '../../shared/models'
import { fetchJson, patchJson, postJson, requestOk } from '../../shared/api'
import { buildMutationHeaders } from '../../shared/mutation'

export type AuthenticatedUser = {
  user_id: string
  email: string
  display_name: string
  first_name: string | null
  last_name: string | null
  preferred_timezone: string | null
  primary_location: string | null
  role: string
  default_assistant_persona: AssistantPersona
  assistant_context_blurb: string | null
}

export type UpdateCurrentUserProfileInput = {
  display_name?: string
  first_name?: string | null
  last_name?: string | null
  preferred_timezone?: string | null
  primary_location?: string | null
  default_assistant_persona?: AssistantPersona
  assistant_context_blurb?: string | null
}

export type SessionResponse = {
  session_id: string
  access_token: string
  expires_at: string
  show_start_here: boolean
  user: AuthenticatedUser
}

export type CurrentSessionResponse = {
  session_id: string
  expires_at: string
  user: AuthenticatedUser
}

export async function bootstrapAdminSession(
  apiBase: string,
  payload: {
    bootstrap_token: string
    user_id: string
    email: string
    display_name: string
    password: string
  },
): Promise<SessionResponse> {
  return postJson<SessionResponse>(`${apiBase}/auth/bootstrap-admin`, payload)
}

export async function createAuthSession(
  apiBase: string,
  payload: {
    identifier: string
    password: string
  },
): Promise<SessionResponse> {
  return postJson<SessionResponse>(`${apiBase}/auth/session`, payload)
}

export async function createGoogleAuthSession(
  apiBase: string,
  payload: {
    id_token: string
  },
): Promise<SessionResponse> {
  return postJson<SessionResponse>(`${apiBase}/auth/google-session`, payload)
}

export async function createSingleUserAuthSession(apiBase: string): Promise<SessionResponse> {
  return postJson<SessionResponse>(`${apiBase}/auth/single-user-session`, {})
}

export async function loadCurrentSession(apiBase: string): Promise<CurrentSessionResponse> {
  return fetchJson<CurrentSessionResponse>(`${apiBase}/auth/me`, {
    headers: buildMutationHeaders(),
  })
}

export async function updateCurrentUserProfile(
  apiBase: string,
  payload: UpdateCurrentUserProfileInput,
): Promise<AuthenticatedUser> {
  return patchJson<AuthenticatedUser>(`${apiBase}/auth/me/profile`, payload, {
    headers: buildMutationHeaders(),
  })
}

export async function logoutCurrentSession(apiBase: string): Promise<void> {
  await postJson<void>(`${apiBase}/auth/logout`, {}, { headers: buildMutationHeaders() })
}

export async function sendSessionHeartbeat(apiBase: string): Promise<void> {
  await requestOk(`${apiBase}/auth/heartbeat`, {
    method: 'POST',
    headers: buildMutationHeaders(),
  })
}
