import { fetchJson, patchJson, postJson } from '../../shared/api'

export type MessagingWorkspaceConversationSection =
  | 'Starred'
  | 'Channels'
  | 'Follow-up'
  | 'Direct messages'

export type MessagingWorkspaceConversationKind = 'channel' | 'dm'
export type MessagingWorkspaceMemberTone = 'desk' | 'human' | 'ops' | 'system'
export type MessagingWorkspacePostSource = 'human' | 'assistant'
export type MessagingWorkspaceSourceProvider = 'ectrm' | 'slack'
export type MessagingWorkspaceTimelineItemKind = 'system' | 'message'

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
  preview: string
  unread_count: number
  latest_activity_at: string | null
  highlights: string[]
  metrics: MessagingWorkspaceMetricRecord[]
  members: MessagingWorkspaceMemberRecord[]
  timeline: MessagingWorkspaceTimelineItemRecord[]
  source_provider?: MessagingWorkspaceSourceProvider
}

export type MessagingWorkspaceMemberRecord = {
  name: string
  title: string
  presence: string
  initials: string
  tone: MessagingWorkspaceMemberTone
}

export type MessagingWorkspaceAttachmentRecord = {
  label: string
  title: string
  summary: string
  footnote: string
}

export type MessagingWorkspaceMetricRecord = {
  label: string
  value: string
}

export type MessagingWorkspaceTimelineItemRecord = {
  id: string
  kind: MessagingWorkspaceTimelineItemKind
  created_at: string
  source: string | null
  label: string | null
  detail: string | null
  author: MessagingWorkspaceMemberRecord | null
  body: string[]
  reactions: string[]
  attachment: MessagingWorkspaceAttachmentRecord | null
  parent_message_id: string | null
  thread_root_message_id: string | null
  reply_count: number
  thread_participants: string[]
  created_by_user_id: string | null
  created_by_role: string | null
  edited_at: string | null
  deleted_at: string | null
  pinned_at: string | null
}

export type MessagingWorkspaceMessageRecord = {
  message_id: string
  conversation_id: string
  source: MessagingWorkspacePostSource
  body: string
  parent_message_id: string | null
  thread_root_message_id: string | null
  author: MessagingWorkspaceMemberRecord
  assistant_run_id: number | null
  assistant_agent_id: string | null
  assistant_agent_name: string | null
  created_by_user_id: string | null
  created_by_session_id: string | null
  created_by_role: string | null
  reactions: string[]
  attachment: MessagingWorkspaceAttachmentRecord | null
  edited_at: string | null
  deleted_at: string | null
  pinned_at: string | null
  created_at: string
}

export type MessagingWorkspaceState = {
  conversations: MessagingWorkspaceConversationRecord[]
}

export type MessagingSlackRuntimeSettings = {
  enabled: boolean
  configured: boolean
  provider: 'slack_web_api'
  auth_status: 'none' | 'partial' | 'configured'
  configured_channel_count: number
  channel_limit: number
  history_limit: number
}

export type MessagingSlackSyncResult = {
  provider: 'slack_web_api'
  synced_channel_count: number
  created_conversation_count: number
  updated_conversation_count: number
  scanned_message_count: number
  imported_message_count: number
  updated_message_count: number
  skipped_message_count: number
  warnings: string[]
}

export type CreateMessagingWorkspacePostInput = {
  conversation_id: string
  body: string
  source?: MessagingWorkspacePostSource
  parent_message_id?: string | null
  attachment?: MessagingWorkspaceAttachmentRecord | null
  assistant_run_id?: number | null
  assistant_agent_id?: string | null
  assistant_agent_name?: string | null
}

export type UpdateMessagingWorkspacePostInput = {
  body?: string | null
  pinned?: boolean | null
  deleted?: boolean | null
  reactions?: string[] | null
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

export async function loadMessagingSlackSettings(
  apiBase: string,
): Promise<MessagingSlackRuntimeSettings> {
  return fetchJson<MessagingSlackRuntimeSettings>(`${apiBase}/messages/workspace/slack/settings`)
}

export async function syncMessagingSlackWorkspace(
  apiBase: string,
  init?: { accessToken?: string },
): Promise<MessagingSlackSyncResult> {
  return postJson<MessagingSlackSyncResult>(
    `${apiBase}/messages/workspace/slack/sync`,
    {},
    {
      headers: optionalAuthHeaders(init?.accessToken),
    },
  )
}

export async function createMessagingSlackPost(
  apiBase: string,
  payload: CreateMessagingWorkspacePostInput,
  init?: { accessToken?: string },
): Promise<MessagingWorkspaceMessageRecord> {
  return postJson<MessagingWorkspaceMessageRecord>(
    `${apiBase}/messages/workspace/slack/posts`,
    payload as Record<string, unknown>,
    {
      headers: optionalAuthHeaders(init?.accessToken),
    },
  )
}

export async function updateMessagingWorkspacePost(
  apiBase: string,
  messageId: string,
  payload: UpdateMessagingWorkspacePostInput,
  init?: { accessToken?: string },
): Promise<MessagingWorkspaceMessageRecord> {
  return patchJson<MessagingWorkspaceMessageRecord>(
    `${apiBase}/messages/workspace/posts/${messageId}`,
    payload as Record<string, unknown>,
    {
      headers: optionalAuthHeaders(init?.accessToken),
    },
  )
}
