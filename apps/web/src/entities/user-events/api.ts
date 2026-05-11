import { postJson } from '../../shared/api'
import type { StoredAuthSession } from '../../shared/mutation'

export type UserEventKind = 'HOLIDAY' | 'REMINDER' | 'EVENT' | 'OTHER'

export type CreateUserEventInput = {
  title: string
  kind: UserEventKind
  starts_at: string
  ends_at?: string | null
  all_day: boolean
  timezone: string
  place?: string | null
  description?: string | null
}

export type UserEventRecord = {
  id: number
  title: string
  kind: UserEventKind
  starts_at: string
  ends_at: string | null
  all_day: boolean
  timezone: string | null
  place: string | null
  description: string | null
  is_active: boolean
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  version: number
}

function userEventHeaders(session: StoredAuthSession): Headers {
  return new Headers({ Authorization: `Bearer ${session.accessToken}` })
}

export async function createUserEvent(
  apiBase: string,
  session: StoredAuthSession,
  payload: CreateUserEventInput,
): Promise<UserEventRecord> {
  return postJson<UserEventRecord>(
    `${apiBase}/user-events`,
    {
      ...payload,
      created_by: session.user.user_id,
    },
    {
      headers: userEventHeaders(session),
    },
  )
}
