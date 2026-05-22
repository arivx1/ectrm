import { fetchJson, postJson, putJson } from '../../shared/api'
import { buildMutationHeaders, getMutationContext } from '../../shared/mutation'
import type { AssistantPersona } from '../../shared/models'

export type UserAccountRecord = {
  user_id: string
  email: string
  display_name: string
  role: string
  default_assistant_persona: AssistantPersona
  is_active: boolean
  password_set: boolean
  last_login_at: string | null
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
}

export type CreateUserAccountInput = {
  user_id: string
  email: string
  display_name: string
  role: string
  default_assistant_persona?: AssistantPersona
  password: string
}

export type UpdateUserAccountInput = {
  email?: string
  display_name?: string
  role?: string
  default_assistant_persona?: AssistantPersona
  password?: string
}

function userHeaders(): Headers {
  return buildMutationHeaders()
}

export async function listUserAccounts(apiBase: string): Promise<UserAccountRecord[]> {
  return fetchJson<UserAccountRecord[]>(`${apiBase}/users`, {
    headers: userHeaders(),
  })
}

export async function createUserAccount(
  apiBase: string,
  payload: CreateUserAccountInput,
): Promise<UserAccountRecord> {
  const { actorId } = getMutationContext()

  return postJson<UserAccountRecord>(
    `${apiBase}/users`,
    {
      ...payload,
      created_by: actorId,
    },
    {
      headers: userHeaders(),
    },
  )
}

export async function updateUserAccount(
  apiBase: string,
  userId: string,
  payload: UpdateUserAccountInput,
): Promise<UserAccountRecord> {
  const { actorId } = getMutationContext()

  return putJson<UserAccountRecord>(
    `${apiBase}/users/${encodeURIComponent(userId)}`,
    {
      ...payload,
      updated_by: actorId,
    },
    {
      headers: userHeaders(),
    },
  )
}

export async function deactivateUserAccount(apiBase: string, userId: string): Promise<UserAccountRecord> {
  const { actorId } = getMutationContext()

  return postJson<UserAccountRecord>(
    `${apiBase}/users/${encodeURIComponent(userId)}/deactivate`,
    {
      updated_by: actorId,
    },
    {
      headers: userHeaders(),
    },
  )
}

export async function reactivateUserAccount(apiBase: string, userId: string): Promise<UserAccountRecord> {
  const { actorId } = getMutationContext()

  return postJson<UserAccountRecord>(
    `${apiBase}/users/${encodeURIComponent(userId)}/reactivate`,
    {
      updated_by: actorId,
    },
    {
      headers: userHeaders(),
    },
  )
}
