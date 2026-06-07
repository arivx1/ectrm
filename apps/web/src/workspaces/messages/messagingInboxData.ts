import type { PromptHomeCounts } from '../prompt/promptHomeStarters'
import type {
  MessagingWorkspaceConversationRecord,
  MessagingWorkspaceMessageRecord,
  MessagingWorkspacePostSource,
  MessagingWorkspaceSourceProvider,
  MessagingWorkspaceTimelineItemRecord,
} from '../../entities/messages/api'

export type MessagingInboxMessageType =
  | 'Email'
  | 'Slack'
  | 'To-Do'
  | 'Issue'
  | 'App Message'

export type MessagingInboxMessage = {
  id: string
  type: MessagingInboxMessageType
  lane: string
  sender: string
  subject: string
  preview: string
  body: string[]
  meta: string
  status: string
  timestamp: string
  unread: boolean
  replyHint: string
}

export type MessagingWorkspaceSection =
  | 'Starred'
  | 'Channels'
  | 'Follow-up'
  | 'Direct messages'

export type MessagingWorkspaceMemberTone = 'desk' | 'human' | 'ops' | 'system'

export type MessagingWorkspaceMember = {
  name: string
  title: string
  presence: string
  initials: string
  tone: MessagingWorkspaceMemberTone
}

export type MessagingWorkspaceAttachment = {
  label: string
  title: string
  summary: string
  footnote: string
}

export type MessagingWorkspaceTimelineItem =
  | {
      id: string
      kind: 'system'
      label: string
      detail: string
    }
  | MessagingWorkspaceTimelineMessage

export type MessagingWorkspaceTimelineMessage = {
  id: string
  kind: 'message'
  author: MessagingWorkspaceMember
  timestamp: string
  body: string[]
  source?: MessagingWorkspacePostSource
  parentMessageId?: string | null
  threadRootMessageId?: string | null
  replyCount?: number
  threadParticipants?: string[]
  createdByUserId?: string | null
  createdByRole?: string | null
  editedAt?: string | null
  deletedAt?: string | null
  pinnedAt?: string | null
  reactions?: string[]
  attachment?: MessagingWorkspaceAttachment | null
}

export type MessagingWorkspaceChannelMetric = {
  label: string
  value: string
}

export type MessagingAssistantWorkspace =
  | 'assistant'
  | 'operations'
  | 'settlement'
  | 'dashboard'
  | 'trades'
  | 'risk'
  | 'reports'

export type MessagingWorkspaceChannel = {
  id: string
  section: MessagingWorkspaceSection
  kind: 'channel' | 'dm'
  label: string
  preview: string
  timestamp: string
  unreadCount: number
  description: string
  topic: string
  connectedWorkspace: string
  assistantWorkspace: MessagingAssistantWorkspace
  composerHint: string
  highlights: string[]
  metrics: MessagingWorkspaceChannelMetric[]
  members: MessagingWorkspaceMember[]
  timeline: MessagingWorkspaceTimelineItem[]
  sourceProvider: MessagingWorkspaceSourceProvider
}

export type MessagingWorkspacePost = {
  id: string
  author: MessagingWorkspaceMember
  timestamp: string
  body: string
  source?: MessagingWorkspacePostSource
  parentMessageId?: string | null
  threadRootMessageId?: string | null
  reactions?: string[]
  attachment?: MessagingWorkspaceAttachment | null
  createdByUserId?: string | null
  createdByRole?: string | null
  editedAt?: string | null
  deletedAt?: string | null
  pinnedAt?: string | null
}

type SlackMessagingInboxCandidate = {
  conversation: MessagingWorkspaceConversationRecord
  message: MessagingWorkspaceTimelineItemRecord
  body: string[]
  preview: string
  authorName: string
  createdAtMs: number
}

const DEFAULT_HOME_SLACK_MESSAGE_LIMIT = 4

function formatMessageTimestamp(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function normalizeAssistantWorkspace(value: string): MessagingAssistantWorkspace {
  switch (value) {
    case 'assistant':
    case 'operations':
    case 'settlement':
    case 'dashboard':
    case 'trades':
    case 'risk':
    case 'reports':
      return value
    default:
      return 'assistant'
  }
}

function formatCountLabel(
  value: number | null,
  singular: string,
  plural = `${singular}s`,
): string {
  if (typeof value !== 'number') {
    return `No ${plural} loaded`
  }

  const noun = value === 1 ? singular : plural
  return `${value.toLocaleString()} ${noun}`
}

function formatCountValue(value: number | null, fallback = 'n/a'): string {
  return typeof value === 'number' ? value.toLocaleString() : fallback
}

function buildTodoDetail(counts: PromptHomeCounts): string {
  const totalSentence =
    typeof counts.openWorkItems === 'number'
      ? `${formatCountLabel(counts.openWorkItems, 'open work item')} ${
          counts.openWorkItems === 1 ? 'is' : 'are'
        } currently tracked across the app.`
      : 'Open work items will appear here once queue data is loaded.'
  const operationsSentence =
    typeof counts.operationsQueueItems === 'number'
      ? `${formatCountLabel(counts.operationsQueueItems, 'operations queue item')} ${
          counts.operationsQueueItems === 1 ? 'sits' : 'sit'
        } in operations.`
      : 'Operations queue counts are not loaded yet.'
  const settlementSentence =
    typeof counts.settlementQueueItems === 'number'
      ? `${formatCountLabel(counts.settlementQueueItems, 'settlement queue item')} ${
          counts.settlementQueueItems === 1 ? 'sits' : 'sit'
        } in settlement.`
      : 'Settlement queue counts are not loaded yet.'

  return `${totalSentence} ${operationsSentence} ${settlementSentence}`
}

function buildIssueDetail(counts: PromptHomeCounts): string {
  const attentionSentence =
    typeof counts.attentionItems === 'number'
      ? `${formatCountLabel(counts.attentionItems, 'attention item')} ${
          counts.attentionItems === 1 ? 'is' : 'are'
        } surfaced for review right now.`
      : 'Attention items will appear here once the dashboard summary is loaded.'
  const stalePricingSentence =
    typeof counts.stalePricingItems === 'number'
      ? `${formatCountLabel(counts.stalePricingItems, 'stale pricing item')} ${
          counts.stalePricingItems === 1 ? 'is' : 'are'
        } tied to pricing follow-through.`
      : 'Pricing follow-through counts are not loaded yet.'

  return `${attentionSentence} ${stalePricingSentence}`
}

export function formatMessagingWorkspacePostBody(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
}

function buildMessagePreview(item: MessagingWorkspaceTimelineMessage): string {
  if (item.deletedAt) {
    return 'Message deleted.'
  }

  return (item.body[0] ?? '').replace(/@\[(.+?)\]/g, '@$1')
}

function normalizeInboxMessageText(value: string): string {
  return value.replace(/@\[(.+?)\]/g, '@$1').replace(/\s+/g, ' ').trim()
}

function isSlackMessagingConversation(
  conversation: MessagingWorkspaceConversationRecord,
): boolean {
  return (
    conversation.source_provider === 'slack' ||
    conversation.conversation_id.startsWith('slack-')
  )
}

function buildSlackInboxCandidate(
  conversation: MessagingWorkspaceConversationRecord,
  message: MessagingWorkspaceTimelineItemRecord,
): SlackMessagingInboxCandidate | null {
  if (message.kind !== 'message' || message.deleted_at) {
    return null
  }

  const body = message.body
    .map(normalizeInboxMessageText)
    .filter((paragraph) => paragraph.length > 0)
  if (body.length === 0) {
    return null
  }

  const createdAtMs = Date.parse(message.created_at)

  return {
    conversation,
    message,
    body,
    preview: normalizeInboxMessageText(body.join(' ')),
    authorName: message.author?.name?.trim() || 'Slack',
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
  }
}

function normalizeTimelineMessage(
  item: MessagingWorkspaceTimelineMessage,
): MessagingWorkspaceTimelineMessage {
  return {
    ...item,
    source: item.source ?? 'human',
    parentMessageId: item.parentMessageId ?? null,
    threadRootMessageId: item.threadRootMessageId ?? item.parentMessageId ?? item.id,
    replyCount: item.replyCount ?? 0,
    threadParticipants: item.threadParticipants ?? [],
    createdByUserId: item.createdByUserId ?? null,
    createdByRole: item.createdByRole ?? null,
    editedAt: item.editedAt ?? null,
    deletedAt: item.deletedAt ?? null,
    pinnedAt: item.pinnedAt ?? null,
    reactions: item.reactions ?? [],
    attachment: item.attachment ?? null,
  }
}

function rebuildMessagingWorkspaceChannel(
  channel: MessagingWorkspaceChannel,
  timeline: MessagingWorkspaceTimelineItem[],
  options?: {
    unreadCount?: number
  },
): MessagingWorkspaceChannel {
  const normalizedTimeline = timeline.map((item) =>
    item.kind === 'message' ? normalizeTimelineMessage(item) : item,
  )
  const replyCounts = new Map<string, number>()
  const threadParticipants = new Map<string, string[]>()
  const seenParticipants = new Map<string, Set<string>>()

  for (const item of normalizedTimeline) {
    if (item.kind !== 'message' || !item.parentMessageId) {
      continue
    }

    const rootId = item.threadRootMessageId ?? item.parentMessageId
    replyCounts.set(rootId, (replyCounts.get(rootId) ?? 0) + 1)

    const seen = seenParticipants.get(rootId) ?? new Set<string>()
    if (!seen.has(item.author.name)) {
      seen.add(item.author.name)
      seenParticipants.set(rootId, seen)
      threadParticipants.set(rootId, [...(threadParticipants.get(rootId) ?? []), item.author.name])
    }
  }

  const enrichedTimeline = normalizedTimeline.map((item) => {
    if (item.kind !== 'message') {
      return item
    }

    if (item.parentMessageId) {
      return {
        ...item,
        replyCount: 0,
      }
    }

    return {
      ...item,
      threadRootMessageId: item.threadRootMessageId ?? item.id,
      replyCount: replyCounts.get(item.id) ?? 0,
      threadParticipants: threadParticipants.get(item.id) ?? [],
    }
  })

  const latestTimelineItem = enrichedTimeline[enrichedTimeline.length - 1]
  const nextPreview =
    latestTimelineItem?.kind === 'message'
      ? buildMessagePreview(latestTimelineItem)
      : latestTimelineItem?.detail ?? channel.preview

  const members: MessagingWorkspaceMember[] = []
  for (const item of enrichedTimeline) {
    if (item.kind !== 'message') {
      continue
    }
    if (members.some((member) => member.name === item.author.name)) {
      continue
    }
    members.push(item.author)
  }

  return {
    ...channel,
    preview: nextPreview || channel.preview,
    timestamp:
      latestTimelineItem?.kind === 'message'
        ? latestTimelineItem.timestamp
        : latestTimelineItem?.kind === 'system'
          ? channel.timestamp
          : channel.timestamp,
    unreadCount: options?.unreadCount ?? channel.unreadCount,
    members,
    timeline: enrichedTimeline,
  }
}

export function appendMessagingWorkspacePost(
  channel: MessagingWorkspaceChannel,
  post: MessagingWorkspacePost,
): MessagingWorkspaceChannel {
  const paragraphs = post.deletedAt ? [] : formatMessagingWorkspacePostBody(post.body)
  if (paragraphs.length === 0 && !post.deletedAt) {
    return channel
  }

  const nextItem: MessagingWorkspaceTimelineMessage = normalizeTimelineMessage({
    id: post.id,
    kind: 'message',
    author: post.author,
    timestamp: post.timestamp,
    body: paragraphs,
    source: post.source ?? 'human',
    parentMessageId: post.parentMessageId ?? null,
    threadRootMessageId: post.threadRootMessageId ?? post.parentMessageId ?? post.id,
    reactions: post.reactions,
    attachment: post.attachment ?? null,
    createdByUserId: post.createdByUserId ?? null,
    createdByRole: post.createdByRole ?? null,
    editedAt: post.editedAt ?? null,
    deletedAt: post.deletedAt ?? null,
    pinnedAt: post.pinnedAt ?? null,
  })

  const existingIndex = channel.timeline.findIndex(
    (item) => item.kind === 'message' && item.id === post.id,
  )
  const nextTimeline =
    existingIndex >= 0
      ? channel.timeline.map((item, index) => (index === existingIndex ? nextItem : item))
      : [...channel.timeline, nextItem]

  return rebuildMessagingWorkspaceChannel(channel, nextTimeline, { unreadCount: 0 })
}

export function updateMessagingWorkspaceChannelPost(
  channel: MessagingWorkspaceChannel,
  postId: string,
  updater: (post: MessagingWorkspacePost) => MessagingWorkspacePost,
): MessagingWorkspaceChannel {
  const nextTimeline = channel.timeline.map((item) => {
    if (item.kind !== 'message' || item.id !== postId) {
      return item
    }

    const updatedPost = updater({
      id: item.id,
      author: item.author,
      timestamp: item.timestamp,
      body: item.body.join('\n\n'),
      source: item.source,
      parentMessageId: item.parentMessageId,
      threadRootMessageId: item.threadRootMessageId,
      reactions: item.reactions,
      attachment: item.attachment ?? null,
      createdByUserId: item.createdByUserId,
      createdByRole: item.createdByRole,
      editedAt: item.editedAt,
      deletedAt: item.deletedAt,
      pinnedAt: item.pinnedAt,
    })

    return normalizeTimelineMessage({
      id: updatedPost.id,
      kind: 'message',
      author: updatedPost.author,
      timestamp: updatedPost.timestamp,
      body: updatedPost.deletedAt ? [] : formatMessagingWorkspacePostBody(updatedPost.body),
      source: updatedPost.source ?? item.source,
      parentMessageId: updatedPost.parentMessageId ?? item.parentMessageId,
      threadRootMessageId:
        updatedPost.threadRootMessageId ??
        updatedPost.parentMessageId ??
        item.threadRootMessageId ??
        item.id,
      reactions: updatedPost.reactions ?? item.reactions,
      attachment: updatedPost.attachment ?? item.attachment ?? null,
      createdByUserId: updatedPost.createdByUserId ?? item.createdByUserId,
      createdByRole: updatedPost.createdByRole ?? item.createdByRole,
      editedAt: updatedPost.editedAt ?? item.editedAt,
      deletedAt: updatedPost.deletedAt ?? item.deletedAt,
      pinnedAt: updatedPost.pinnedAt ?? item.pinnedAt,
    })
  })

  return rebuildMessagingWorkspaceChannel(channel, nextTimeline, {
    unreadCount: channel.unreadCount,
  })
}

export function buildMessagingWorkspacePostFromRecord(
  record: MessagingWorkspaceMessageRecord,
  timestamp: string,
): MessagingWorkspacePost {
  return {
    id: record.message_id,
    author: {
      name: record.author.name,
      title: record.author.title,
      presence: record.author.presence,
      initials: record.author.initials,
      tone: record.author.tone,
    },
    timestamp,
    body: record.body,
    source: record.source,
    parentMessageId: record.parent_message_id,
    threadRootMessageId: record.thread_root_message_id,
    reactions: record.reactions,
    attachment: record.attachment
      ? {
          label: record.attachment.label,
          title: record.attachment.title,
          summary: record.attachment.summary,
          footnote: record.attachment.footnote,
        }
      : null,
    createdByUserId: record.created_by_user_id,
    createdByRole: record.created_by_role,
    editedAt: record.edited_at,
    deletedAt: record.deleted_at,
    pinnedAt: record.pinned_at,
  }
}

export function buildMessagingWorkspaceChannelsFromRecords(
  records: MessagingWorkspaceConversationRecord[],
): MessagingWorkspaceChannel[] {
  return [...records]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((record) =>
      rebuildMessagingWorkspaceChannel(
        {
          id: record.conversation_id,
          section: record.section,
          kind: record.kind,
          label: record.label,
          preview: record.preview,
          timestamp: record.latest_activity_at ? formatMessageTimestamp(record.latest_activity_at) : '',
          unreadCount: record.unread_count,
          description: record.description,
          topic: record.topic,
          connectedWorkspace: record.connected_workspace,
          assistantWorkspace: normalizeAssistantWorkspace(record.assistant_workspace),
          composerHint: record.composer_hint,
          highlights: record.highlights,
          metrics: record.metrics.map((metric) => ({
            label: metric.label,
            value: metric.value,
          })),
          members: record.members.map((member) => ({
            name: member.name,
            title: member.title,
            presence: member.presence,
            initials: member.initials,
            tone: member.tone,
          })),
          timeline: record.timeline.flatMap<MessagingWorkspaceTimelineItem>((item) => {
            if (item.kind === 'system') {
              return item.label && item.detail
                ? [
                    {
                      id: item.id,
                      kind: 'system' as const,
                      label: item.label,
                      detail: item.detail,
                    },
                  ]
                : []
            }

            if (!item.author) {
              return []
            }

            return [
              {
                id: item.id,
                kind: 'message' as const,
                author: {
                  name: item.author.name,
                  title: item.author.title,
                  presence: item.author.presence,
                  initials: item.author.initials,
                  tone: item.author.tone,
                },
                timestamp: formatMessageTimestamp(item.created_at),
                body: item.body,
                source:
                  item.source === 'assistant' || item.source === 'human'
                    ? item.source
                    : 'human',
                parentMessageId: item.parent_message_id,
                threadRootMessageId: item.thread_root_message_id,
                replyCount: item.reply_count,
                threadParticipants: item.thread_participants,
                createdByUserId: item.created_by_user_id,
                createdByRole: item.created_by_role,
                editedAt: item.edited_at,
                deletedAt: item.deleted_at,
                pinnedAt: item.pinned_at,
                reactions: item.reactions.length > 0 ? item.reactions : undefined,
                attachment: item.attachment
                  ? {
                      label: item.attachment.label,
                      title: item.attachment.title,
                      summary: item.attachment.summary,
                      footnote: item.attachment.footnote,
                    }
                  : null,
              },
            ]
          }),
          sourceProvider:
            record.source_provider ??
            (record.conversation_id.startsWith('slack-') ? 'slack' : 'ectrm'),
        },
        record.timeline.flatMap<MessagingWorkspaceTimelineItem>((item) => {
          if (item.kind === 'system') {
            return item.label && item.detail
              ? [
                  {
                    id: item.id,
                    kind: 'system' as const,
                    label: item.label,
                    detail: item.detail,
                  },
                ]
              : []
          }

          if (!item.author) {
            return []
          }

          return [
            {
              id: item.id,
              kind: 'message' as const,
              author: {
                name: item.author.name,
                title: item.author.title,
                presence: item.author.presence,
                initials: item.author.initials,
                tone: item.author.tone,
              },
              timestamp: formatMessageTimestamp(item.created_at),
              body: item.body,
              source:
                item.source === 'assistant' || item.source === 'human'
                  ? item.source
                  : 'human',
              parentMessageId: item.parent_message_id,
              threadRootMessageId: item.thread_root_message_id,
              replyCount: item.reply_count,
              threadParticipants: item.thread_participants,
              createdByUserId: item.created_by_user_id,
              createdByRole: item.created_by_role,
              editedAt: item.edited_at,
              deletedAt: item.deleted_at,
              pinnedAt: item.pinned_at,
              reactions: item.reactions.length > 0 ? item.reactions : undefined,
              attachment: item.attachment
                ? {
                    label: item.attachment.label,
                    title: item.attachment.title,
                    summary: item.attachment.summary,
                    footnote: item.attachment.footnote,
                  }
                : null,
            },
          ]
        }),
        {
          unreadCount: record.unread_count,
        },
      ),
    )
}

export function buildSlackMessagingInboxMessages(
  records: MessagingWorkspaceConversationRecord[],
  options: { limit?: number } = {},
): MessagingInboxMessage[] {
  const normalizedLimit =
    typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? Math.max(0, Math.trunc(options.limit))
      : DEFAULT_HOME_SLACK_MESSAGE_LIMIT
  if (normalizedLimit <= 0) {
    return []
  }

  const candidates = records.flatMap<SlackMessagingInboxCandidate>((conversation) => {
    if (!isSlackMessagingConversation(conversation)) {
      return []
    }

    return conversation.timeline.flatMap((message) => {
      const candidate = buildSlackInboxCandidate(conversation, message)
      return candidate ? [candidate] : []
    })
  })

  return candidates
    .sort((left, right) => {
      const createdDelta = right.createdAtMs - left.createdAtMs
      return createdDelta !== 0
        ? createdDelta
        : left.message.id.localeCompare(right.message.id)
    })
    .slice(0, normalizedLimit)
    .map((candidate) => {
      const lane = candidate.conversation.label || '#slack'
      const unread = candidate.conversation.unread_count > 0
      const timestamp =
        candidate.createdAtMs > 0
          ? formatMessageTimestamp(candidate.message.created_at)
          : candidate.conversation.latest_activity_at
            ? formatMessageTimestamp(candidate.conversation.latest_activity_at)
            : ''

      return {
        id: `slack-home-${candidate.conversation.conversation_id}-${candidate.message.id}`,
        type: 'Slack',
        lane,
        sender: candidate.authorName,
        subject: `${candidate.authorName} posted in ${lane}`,
        preview: candidate.preview,
        body: candidate.body,
        meta: `Slack · ${lane}`,
        status: unread ? 'Unread' : 'Synced',
        timestamp,
        unread,
        replyHint:
          'Reply from Messages so the local record and Slack thread stay together.',
      }
    })
}

export function buildMessagingWorkspaceChannels(
  counts: PromptHomeCounts,
): MessagingWorkspaceChannel[] {
  const ectrmDesk: MessagingWorkspaceMember = {
    name: 'ECTRM Desk',
    title: 'System notification',
    presence: 'Watching the desk',
    initials: 'EC',
    tone: 'desk',
  }
  const approvalsBot: MessagingWorkspaceMember = {
    name: 'Approvals Bot',
    title: 'Action request lane',
    presence: 'Reviewing',
    initials: 'AB',
    tone: 'system',
  }
  const northshore: MessagingWorkspaceMember = {
    name: 'Northshore LNG',
    title: 'Counterparty contact',
    presence: 'Awaiting reply',
    initials: 'NL',
    tone: 'human',
  }
  const opsQueue: MessagingWorkspaceMember = {
    name: 'Operations Queue',
    title: 'Desk queue digest',
    presence: 'Tracking handoffs',
    initials: 'OQ',
    tone: 'ops',
  }
  const settlementControl: MessagingWorkspaceMember = {
    name: 'Settlement Control',
    title: 'Cash and invoice follow-through',
    presence: 'Monitoring',
    initials: 'SC',
    tone: 'ops',
  }
  const dashboardAttention: MessagingWorkspaceMember = {
    name: 'Dashboard Attention',
    title: 'Desk signal feed',
    presence: 'Flagging exceptions',
    initials: 'DA',
    tone: 'system',
  }

  return [
    {
      id: 'ectrm-assistant',
      section: 'Starred',
      kind: 'channel',
      label: '#ectrm-assistant',
      preview:
        'Governed action draft is ready for desk review with provenance and stop conditions attached.',
      timestamp: '1h ago',
      unreadCount: 1,
      description: 'Governed assistant drafts, approvals, and operator replies stay in one lane.',
      topic:
        'Keep governed assistant activity in the same feed as desk work, approval follow-through, and counterparty context.',
      connectedWorkspace: 'Assistant Console',
      assistantWorkspace: 'assistant',
      composerHint:
        'Reply here to keep assistant guidance threaded beside the operational follow-up it affects.',
      highlights: [
        'Action draft AR-204 is staged for review.',
        'Prompt context and tool evidence are ready in the assistant console.',
      ],
      metrics: [
        { label: 'Governed drafts', value: '1 new' },
        { label: 'Desk attention', value: formatCountValue(counts.attentionItems) },
        { label: 'Open work', value: formatCountValue(counts.openWorkItems) },
      ],
      members: [ectrmDesk, opsQueue, approvalsBot],
      timeline: [
        {
          id: 'assistant-day',
          kind: 'system',
          label: 'Today',
          detail: 'Action draft AR-204 moved into governed review.',
        },
        {
          id: 'assistant-msg-1',
          kind: 'message',
          author: ectrmDesk,
          timestamp: '1:07 PM',
          body: [
            'Assistant staged a governed action draft for the Northshore timing exception.',
            'The recommendation keeps approval, provenance, and rollback expectations attached to the proposed workflow item.',
          ],
          reactions: ['ack 3', 'needs review 1'],
          attachment: {
            label: 'Action draft',
            title: 'AR-204 governed action draft',
            summary:
              'Owner: Desk Ops. Stop conditions: missing counterparty confirmation, settlement conflict, or delivery variance without explanation.',
            footnote:
              'Open Assistant Console for prompt context, evidence, and the approval record.',
          },
        },
        {
          id: 'assistant-msg-2',
          kind: 'message',
          author: opsQueue,
          timestamp: '1:12 PM',
          body: [
            'Keep this threaded with the nomination conversation so Operations can react without switching screens.',
          ],
          reactions: ['aligned 2'],
        },
        {
          id: 'assistant-msg-3',
          kind: 'message',
          author: approvalsBot,
          timestamp: '1:14 PM',
          body: [
            'Approval packet is ready with owner, inputs, outputs, stop conditions, audit hooks, and rollback notes.',
          ],
        },
      ],
      sourceProvider: 'ectrm',
    },
    {
      id: 'counterparty-email',
      section: 'Channels',
      kind: 'channel',
      label: '#counterparty-email',
      preview:
        'Northshore asked for desk confirmation before 3 PM and attached a revised timing note for the next nomination window.',
      timestamp: '3m ago',
      unreadCount: 2,
      description: 'Counterparty communication stays readable like chat while still carrying email context.',
      topic:
        'Use this lane for external timing notes, commercial clarifications, and the handoff back into operations or settlement.',
      connectedWorkspace: 'Operations',
      assistantWorkspace: 'operations',
      composerHint:
        'Reply with desk confirmation or route the lane into Operations without losing the message context.',
      highlights: [
        'Counterparty deadline: confirm by 3 PM.',
        'Revised delivery window can flow straight into Operations once acknowledged.',
      ],
      metrics: [
        { label: 'Ops queue', value: formatCountValue(counts.operationsQueueItems) },
        { label: 'Settlement queue', value: formatCountValue(counts.settlementQueueItems) },
        { label: 'Payments due', value: formatCountValue(counts.paymentsDue) },
      ],
      members: [northshore, opsQueue, settlementControl],
      timeline: [
        {
          id: 'northshore-day',
          kind: 'system',
          label: 'Today',
          detail: 'Northshore revised the delivery note and requested confirmation.',
        },
        {
          id: 'northshore-msg-1',
          kind: 'message',
          author: northshore,
          timestamp: '2:57 PM',
          body: [
            'We revised the delivery window for the next nomination cycle and need desk confirmation before 3 PM.',
            'Please keep the commercial note attached if Operations needs the full context.',
          ],
          attachment: {
            label: 'Attached note',
            title: 'Northshore revised delivery window',
            summary:
              'Updated timing note captures the revised slot, nomination checkpoint, and counterparty ask for same-day confirmation.',
            footnote: 'This prototype keeps the attachment summary inside the same conversation stream.',
          },
        },
        {
          id: 'northshore-msg-2',
          kind: 'message',
          author: opsQueue,
          timestamp: '3:01 PM',
          body: [
            'Operations can take this into the queue as soon as the desk confirms whether to accept the revised timing.',
          ],
          reactions: ['on it 1'],
        },
        {
          id: 'northshore-msg-3',
          kind: 'message',
          author: settlementControl,
          timestamp: '3:04 PM',
          body: [
            'Flagging that one payment due item may move if the revised window changes the invoice sequence.',
          ],
        },
      ],
      sourceProvider: 'ectrm',
    },
    {
      id: 'ops-follow-through',
      section: 'Follow-up',
      kind: 'channel',
      label: '#ops-follow-through',
      preview:
        'Queue work reads like a shared lane here instead of separate dashboard counters and launch cards.',
      timestamp: '12m ago',
      unreadCount: 0,
      description: 'Queue pressure becomes a visible channel so operators can review it like a real thread.',
      topic:
        'Keep confirmations, delivery blockers, and queue digests readable in the same conversation surface as email and assistant follow-up.',
      connectedWorkspace: 'Operations',
      assistantWorkspace: 'operations',
      composerHint:
        'Use this lane to leave handoff notes before opening the work queue for a specific blocker.',
      highlights: [
        buildTodoDetail(counts),
        'Older unresolved operations work can rise first without leaving the messaging surface.',
      ],
      metrics: [
        { label: 'Open work', value: formatCountValue(counts.openWorkItems) },
        { label: 'Ops queue', value: formatCountValue(counts.operationsQueueItems) },
        { label: 'Settlement queue', value: formatCountValue(counts.settlementQueueItems) },
      ],
      members: [opsQueue, ectrmDesk],
      timeline: [
        {
          id: 'ops-day',
          kind: 'system',
          label: 'Today',
          detail: 'Daily work queue digest posted to the desk lane.',
        },
        {
          id: 'ops-msg-1',
          kind: 'message',
          author: opsQueue,
          timestamp: '2:48 PM',
          body: [
            buildTodoDetail(counts),
            'This is the prototype version of turning queue pressure into a message thread instead of a separate launcher card.',
          ],
        },
        {
          id: 'ops-msg-2',
          kind: 'message',
          author: opsQueue,
          timestamp: '2:52 PM',
          body: [
            'Queue review can start here first, then jump into the workboard only when record-level controls are needed.',
          ],
          reactions: ['yes 4'],
        },
      ],
      sourceProvider: 'ectrm',
    },
    {
      id: 'desk-attention',
      section: 'Follow-up',
      kind: 'channel',
      label: '#desk-attention',
      preview:
        'Exposure and stale pricing issues can stack like shared chat messages instead of disconnected alert tiles.',
      timestamp: '26m ago',
      unreadCount: 1,
      description: 'Desk attention arrives as a conversational stream rather than isolated summary counters.',
      topic:
        'Treat pricing gaps, exposure signals, and exceptions as one shared lane so triage decisions stay visible.',
      connectedWorkspace: 'Home',
      assistantWorkspace: 'dashboard',
      composerHint:
        'Keep notes on risk triage here, then open Home or Risk when the thread needs deeper analysis.',
      highlights: [
        buildIssueDetail(counts),
        'Pricing and exposure signals become easier to scan when they share the same visual language as chat.',
      ],
      metrics: [
        { label: 'Attention', value: formatCountValue(counts.attentionItems) },
        { label: 'Stale pricing', value: formatCountValue(counts.stalePricingItems) },
        { label: 'Pending pricing', value: formatCountValue(counts.pendingPricingTrades) },
      ],
      members: [dashboardAttention, ectrmDesk],
      timeline: [
        {
          id: 'attention-day',
          kind: 'system',
          label: 'Today',
          detail: 'Desk attention summary refreshed from dashboard signals.',
        },
        {
          id: 'attention-msg-1',
          kind: 'message',
          author: dashboardAttention,
          timestamp: '2:34 PM',
          body: [
            buildIssueDetail(counts),
            'This lane is meant to feel like a shared desk channel where issues stack in one place instead of scattering across summary tiles.',
          ],
          reactions: ['watching 2'],
        },
        {
          id: 'attention-msg-2',
          kind: 'message',
          author: ectrmDesk,
          timestamp: '2:37 PM',
          body: [
            'If the risk story is clearer in this format, we can keep issue triage visible before routing into the deeper workspace.',
          ],
        },
      ],
      sourceProvider: 'ectrm',
    },
    {
      id: 'settlement-control',
      section: 'Direct messages',
      kind: 'dm',
      label: '@settlement-control',
      preview:
        'Settlement wants to know whether the revised Northshore window should delay the next invoice handoff.',
      timestamp: '41m ago',
      unreadCount: 0,
      description: 'Direct settlement follow-up can live in the same product language as channels and queue digests.',
      topic:
        'Use direct messages for focused invoice and payment coordination without losing the surrounding desk conversation.',
      connectedWorkspace: 'Settlement',
      assistantWorkspace: 'settlement',
      composerHint:
        'Keep invoice and payment clarifications visible here before opening the settlement workspace.',
      highlights: [
        `${formatCountLabel(counts.pendingInvoices, 'pending invoice')} waiting for settlement review.`,
        `${formatCountLabel(counts.paymentsDue, 'payment due item')} tied to cash follow-through.`,
      ],
      metrics: [
        { label: 'Pending invoices', value: formatCountValue(counts.pendingInvoices) },
        { label: 'Payments due', value: formatCountValue(counts.paymentsDue) },
        { label: 'Pending settlement', value: formatCountValue(counts.pendingSettlementTrades) },
      ],
      members: [settlementControl, opsQueue],
      timeline: [
        {
          id: 'settlement-day',
          kind: 'system',
          label: 'Earlier today',
          detail: 'Settlement follow-up split from the Northshore thread for cash coordination.',
        },
        {
          id: 'settlement-msg-1',
          kind: 'message',
          author: settlementControl,
          timestamp: '2:19 PM',
          body: [
            'Before we issue the next invoice handoff, confirm whether the revised Northshore timing should delay the settlement sequence.',
          ],
        },
        {
          id: 'settlement-msg-2',
          kind: 'message',
          author: opsQueue,
          timestamp: '2:24 PM',
          body: [
            'Operations will update this lane once the delivery window is confirmed so settlement does not have to chase the queue separately.',
          ],
          reactions: ['thanks 1'],
        },
      ],
      sourceProvider: 'ectrm',
    },
  ]
}

export function buildMessagingInboxMessages(
  counts: PromptHomeCounts,
): MessagingInboxMessage[] {
  return [
    {
      id: 'email',
      type: 'Email',
      lane: '#counterparty-email',
      sender: 'contracts@northshorelng.example',
      subject: 'Northshore sent a revised delivery window',
      preview:
        'Counterparty asked for desk confirmation before 3 PM and attached a revised timing note for the next nomination window.',
      body: [
        'Northshore updated the delivery window on the attached note and asked for confirmation before 3 PM.',
        'This is a sample inbox email on Home so we can shape the communication center as a real message surface before wiring live sources.',
      ],
      meta: 'Counterparty email · Example inbox row',
      status: 'Unread',
      timestamp: '3m ago',
      unread: true,
      replyHint:
        'Reply with desk confirmation or hand off the thread to Operations.',
    },
    {
      id: 'todo',
      type: 'To-Do',
      lane: '#ops-follow-through',
      sender: 'Operations Queue',
      subject: `${formatCountLabel(counts.openWorkItems, 'open work item')} waiting for follow-through`,
      preview:
        'Queue work is still split across operations and settlement, so this row acts like a to-do message instead of forcing a separate launcher card.',
      body: [
        buildTodoDetail(counts),
        'This sample turns queue pressure into a message thread so operators can scan it the same way they scan email or desk chat.',
      ],
      meta: 'Home queue digest · Example inbox row',
      status: 'Queued',
      timestamp: '12m ago',
      unread: false,
      replyHint:
        'Turn this lane into live queue digests or route directly into the workboard.',
    },
    {
      id: 'issue',
      type: 'Issue',
      lane: '#desk-attention',
      sender: 'Dashboard Attention',
      subject: `${formatCountLabel(counts.attentionItems, 'attention item')} surfaced for review`,
      preview:
        'The issue lane can read like an inbox too, with desk attention and pricing follow-through arriving as messages instead of only summary counters.',
      body: [
        buildIssueDetail(counts),
        'This lane is meant to feel like a shared desk channel where issues stack in one place instead of scattering across summary tiles.',
      ],
      meta: 'Desk attention digest · Example inbox row',
      status: 'Active',
      timestamp: '26m ago',
      unread: true,
      replyHint:
        'Open the related workspace, then keep the same message shell for follow-up notes.',
    },
    {
      id: 'app-message',
      type: 'App Message',
      lane: '#ectrm-assistant',
      sender: 'ECTRM Desk',
      subject: 'Assistant staged a governed action draft',
      preview:
        'In-app notifications can sit beside emails, to-dos, and issues so the communication center feels like one inbox instead of four unrelated cards.',
      body: [
        'This sample app message shows the fourth communication type in the inbox.',
        'The next step can replace these examples with live assistant, email, to-do, and issue records while keeping the same Home layout.',
      ],
      meta: 'System notification · Example inbox row',
      status: 'New',
      timestamp: '1h ago',
      unread: false,
      replyHint:
        'Keep governed assistant activity visible in the same feed as external and operational follow-up.',
    },
  ]
}
