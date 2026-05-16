import { fetchJson, postJson } from '../../shared/api'

export type MessagingWorkspaceConversationSection =
  | 'Starred'
  | 'Channels'
  | 'Follow-up'
  | 'Direct messages'

export type MessagingWorkspaceConversationKind = 'channel' | 'dm'
export type MessagingWorkspaceMemberTone = 'desk' | 'human' | 'ops' | 'system'
export type MessagingWorkspacePostSource = 'human' | 'assistant'

export type MessagingWorkspaceConversationRecord = {
  conversation_id: string
  section: MessagingWorkspaceConversationSection
  kind: MessagingWorkspaceConversationKind
  label: string
  connected_workspace: string
  assistant_workspace: string
  description: string
  topic: string
  composer_hint: string
  sort_order: number
  message_count: number
  latest_message_preview: string | null
  latest_message_at: string | null
}

export type MessagingWorkspaceMemberRecord = {
  name: string
  title: string
  presence: string
  initials: string
  tone: MessagingWorkspaceMemberTone
}

export type MessagingWorkspaceMessageRecord = {
  message_id: string
  conversation_id: string
  source: MessagingWorkspacePostSource
  body: string
  author: MessagingWorkspaceMemberRecord
  assistant_run_id: number | null
  assistant_agent_id: string | null
  assistant_agent_name: string | null
  created_by_user_id: string | null
  created_by_session_id: string | null
  created_by_role: string | null
  created_at: string
}

export type MessagingWorkspaceState = {
  conversations: MessagingWorkspaceConversationRecord[]
  messages: MessagingWorkspaceMessageRecord[]
}

export type CreateMessagingWorkspacePostInput = {
  conversation_id: string
  body: string
  source?: MessagingWorkspacePostSource
  assistant_run_id?: number | null
  assistant_agent_id?: string | null
  assistant_agent_name?: string | null
}

function optionalAuthHeaders(accessToken?: string): Headers | undefined {
  const normalizedAccessToken = accessToken?.trim()
  if (!normalizedAccessToken) {
    return undefined
  }

  return new Headers({ Authorization: `Bearer ${normalizedAccessToken}` })
}

export async function loadMessagingWorkspaceState(
  apiBase: string,
  init?: { accessToken?: string },
): Promise<MessagingWorkspaceState> {
  return fetchJson<MessagingWorkspaceState>(`${apiBase}/messages/workspace`, {
    headers: optionalAuthHeaders(init?.accessToken),
  })
}

export async function createMessagingWorkspacePost(
  apiBase: string,
  payload: CreateMessagingWorkspacePostInput,
  init?: { accessToken?: string },
): Promise<MessagingWorkspaceMessageRecord> {
  return postJson<MessagingWorkspaceMessageRecord>(
    `${apiBase}/messages/workspace/posts`,
    payload as Record<string, unknown>,
    {
      headers: optionalAuthHeaders(init?.accessToken),
    },
  )
}
