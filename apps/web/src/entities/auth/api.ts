import { fetchJson, postJson } from '../../shared/api'
import { buildMutationHeaders } from '../../shared/mutation'

export type AuthenticatedUser = {
  user_id: string
  email: string
  display_name: string
  role: string
}

export type SessionResponse = {
  session_id: string
  access_token: string
  expires_at: string
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

export async function loadCurrentSession(apiBase: string): Promise<CurrentSessionResponse> {
  return fetchJson<CurrentSessionResponse>(`${apiBase}/auth/me`, {
    headers: buildMutationHeaders(),
  })
}

export async function logoutCurrentSession(apiBase: string): Promise<void> {
  await postJson<void>(`${apiBase}/auth/logout`, {}, { headers: buildMutationHeaders() })
}
