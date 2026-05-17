import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import {
  listAssistantAgents,
  loadAssistantRuntimeSettings,
  streamAssistantResponse,
  type AssistantStreamEvent,
} from '../../entities/assistant/api'
import {
  createMessagingWorkspacePost,
  loadMessagingWorkspaceState,
  updateMessagingWorkspacePost,
  type MessagingWorkspaceState,
} from '../../entities/messages/api'
import { appConfig } from '../../shared/config'
import type { AssistantPromptRequest, AssistantProvider } from '../../shared/models'
import {
  applyMessagingComposerFormat,
  buildMessagingMentionToken,
  buildQuotedMessagingDraft,
  DEFAULT_MESSAGING_EMOJI_OPTIONS,
  DEFAULT_MESSAGING_REACTION_OPTIONS,
  insertMessagingComposerSnippet,
  type MessagingComposerFormatAction,
} from './messagingComposerFormatting'
import { shouldSendMessageOnKeyDown } from './messagingComposerKeybindings'
import { resolveMessagingAgentSession } from './messagingAgentSession'
import {
  appendMessagingWorkspacePost,
  buildMessagingWorkspaceChannelsFromRecords,
  buildMessagingWorkspacePostFromRecord,
  type MessagingWorkspaceAttachment,
  type MessagingWorkspaceChannel,
  type MessagingWorkspaceMember,
  type MessagingWorkspacePost,
  type MessagingWorkspaceTimelineMessage,
  updateMessagingWorkspaceChannelPost,
} from './messagingInboxData'
import { decideMessagingAgentRoute } from './messagingAgentRouter'
import type { StoredAuthSession } from '../../shared/mutation'
import type { PromptHomeCounts } from '../prompt/promptHomeStarters'

type MessagingWorkspaceProps = {
  authSession: StoredAuthSession | null
  counts: PromptHomeCounts
  onSessionSync: (session: StoredAuthSession | null) => Promise<void> | void
  onOpenPrompt: () => void
  onOpenAssistant: () => void
  onOpenOperations: () => void
  onOpenSettlement: () => void
  onSelectConversation: (conversationId: string | null) => void
  selectedConversationId: string | null
  initialWorkspaceState?: MessagingWorkspaceState | null
}

const MENTION_TOKEN_PATTERN = /@\[(.+?)\]/g

function buildMemberInitials(label: string): string {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)

  if (parts.length === 0) {
    return 'ME'
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function formatMessageTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function createLocalPostId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function buildAssistantAuthor(
  selectedChannel: MessagingWorkspaceChannel,
  metadata: Record<string, unknown>,
): MessagingWorkspaceMember {
  const agentName =
    typeof metadata.agent_name === 'string' && metadata.agent_name.trim().length > 0
      ? metadata.agent_name.trim()
      : 'ECTRM Assistant'

  return {
    name: agentName,
    title: `Managed agent · ${selectedChannel.connectedWorkspace}`,
    presence: 'Responding in thread',
    initials: buildMemberInitials(agentName),
    tone: 'system',
  }
}

function buildThreadContext(selectedChannel: MessagingWorkspaceChannel): string {
  const recentTimeline = selectedChannel.timeline
    .slice(-6)
    .map((item) => {
      if (item.kind === 'system') {
        return `System: ${item.label} - ${item.detail}`
      }

      return `${item.author.name} (${item.author.title}) at ${item.timestamp}: ${item.body.join(' ')}`
    })
    .join('\n')

  return [
    `Slack-style desk channel: ${selectedChannel.label}`,
    `Connected workspace: ${selectedChannel.connectedWorkspace}`,
    `Operational topic: ${selectedChannel.topic}`,
    `Reply style: concise desk-thread response with clear next step.`,
    `Authority: do not externally commit the firm or send counterparty communication as completed fact; draft, explain, or stage governed follow-up only.`,
    `Current highlights: ${selectedChannel.highlights.join(' | ')}`,
    'Recent thread:',
    recentTimeline,
  ].join('\n')
}

function formatAuditTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function getThreadRootId(message: MessagingWorkspaceTimelineMessage): string {
  return message.threadRootMessageId ?? message.parentMessageId ?? message.id
}

function canEditMessage(
  message: MessagingWorkspaceTimelineMessage,
  authSession: StoredAuthSession | null,
): boolean {
  return Boolean(
    authSession?.user.user_id &&
      message.createdByUserId &&
      authSession.user.user_id === message.createdByUserId &&
      !message.deletedAt,
  )
}

function canPinMessage(authSession: StoredAuthSession | null): boolean {
  return Boolean(authSession?.user.user_id)
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function buildComposerAttachment(file: File): MessagingWorkspaceAttachment {
  const normalizedType = file.type.trim() || 'Unknown file type'
  return {
    label: 'Attachment',
    title: file.name,
    summary: `${normalizedType} • ${formatAttachmentSize(file.size)}`,
    footnote: 'Added from the desk composer.',
  }
}

function renderParagraphWithMentions(paragraph: string) {
  const segments: ReactNode[] = []
  let lastIndex = 0

  for (const match of paragraph.matchAll(MENTION_TOKEN_PATTERN)) {
    const mentionToken = match[0]
    const mentionName = match[1]
    const mentionIndex = match.index ?? -1
    if (mentionIndex < 0) {
      continue
    }

    if (mentionIndex > lastIndex) {
      segments.push(paragraph.slice(lastIndex, mentionIndex))
    }
    segments.push(
      <span key={`${mentionToken}-${mentionIndex}`} className="messaging-desk-mention">
        @{mentionName}
      </span>,
    )
    lastIndex = mentionIndex + mentionToken.length
  }

  if (lastIndex < paragraph.length) {
    segments.push(paragraph.slice(lastIndex))
  }

  return segments.length > 0 ? segments : [paragraph]
}

export function MessagingWorkspace(props: MessagingWorkspaceProps) {
  const {
    authSession,
    onOpenPrompt,
    onOpenAssistant,
    onOpenOperations,
    onOpenSettlement,
    onSelectConversation,
    selectedConversationId,
    initialWorkspaceState = null,
  } = props

  const [channels, setChannels] = useState<MessagingWorkspaceChannel[]>(() =>
    initialWorkspaceState
      ? buildMessagingWorkspaceChannelsFromRecords(initialWorkspaceState.conversations)
      : [],
  )
  const [draftsByChannelId, setDraftsByChannelId] = useState<Record<string, string>>({})
  const [attachmentsByChannelId, setAttachmentsByChannelId] = useState<
    Record<string, MessagingWorkspaceAttachment | null>
  >({})
  const [threadDraftsByRootId, setThreadDraftsByRootId] = useState<Record<string, string>>({})
  const [composerStatusByChannelId, setComposerStatusByChannelId] = useState<
    Record<string, string>
  >({})
  const [composerPalette, setComposerPalette] = useState<'mentions' | 'emoji' | null>(null)
  const [selectedThreadRootIdByChannelId, setSelectedThreadRootIdByChannelId] = useState<
    Record<string, string | null>
  >({})
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState<string>('')
  const [pendingMessageActionId, setPendingMessageActionId] = useState<string | null>(null)
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null)
  const [threadReplyPendingRootId, setThreadReplyPendingRootId] = useState<string | null>(null)
  const [assistantReplyChannelId, setAssistantReplyChannelId] = useState<string | null>(null)
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string>('')
  const [workspaceLoading, setWorkspaceLoading] = useState<boolean>(!initialWorkspaceState)
  const feedRef = useRef<HTMLDivElement | null>(null)
  const composerFormRef = useRef<HTMLFormElement | null>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)

  const selectedChannel =
    channels.find((channel) => channel.id === selectedConversationId) ?? channels[0] ?? null
  const selectedChannelDraft = selectedChannel ? draftsByChannelId[selectedChannel.id] ?? '' : ''
  const selectedChannelAttachment = selectedChannel
    ? attachmentsByChannelId[selectedChannel.id] ?? null
    : null
  const selectedThreadRootId = selectedChannel
    ? selectedThreadRootIdByChannelId[selectedChannel.id] ?? null
    : null
  const selectedChannelStatus = selectedChannel
    ? composerStatusByChannelId[selectedChannel.id] ?? ''
    : ''
  const selectedThreadRoot: MessagingWorkspaceTimelineMessage | null =
    selectedChannel && selectedThreadRootId
      ? selectedChannel.timeline.find(
          (item): item is MessagingWorkspaceTimelineMessage =>
            item.kind === 'message' &&
            !item.parentMessageId &&
            getThreadRootId(item) === selectedThreadRootId,
        ) ?? null
      : null
  const selectedThreadReplies: MessagingWorkspaceTimelineMessage[] =
    selectedChannel && selectedThreadRoot
      ? selectedChannel.timeline.filter(
          (item): item is MessagingWorkspaceTimelineMessage =>
            item.kind === 'message' &&
            Boolean(item.parentMessageId) &&
            getThreadRootId(item) === selectedThreadRoot.id,
        )
      : []
  const selectedThreadDraft = selectedThreadRoot
    ? threadDraftsByRootId[selectedThreadRoot.id] ?? ''
    : ''
  const sendDisabled = !selectedChannel || selectedChannelDraft.trim().length === 0
  const assistantReplyPending = selectedChannel
    ? assistantReplyChannelId === selectedChannel.id
    : false
  const visibleTimeline =
    selectedChannel?.timeline.filter(
      (item) => item.kind === 'system' || !item.parentMessageId,
    ) ?? []

  useEffect(() => {
    const feedNode = feedRef.current
    if (!feedNode || !selectedChannel) {
      return
    }

    feedNode.scrollTop = feedNode.scrollHeight
  }, [selectedChannel, selectedChannel?.id, selectedChannel?.timeline.length])

  useEffect(() => {
    if (!selectedChannel) {
      if (selectedConversationId !== null && channels.length === 0) {
        onSelectConversation(null)
      }
      return
    }

    if (selectedConversationId !== selectedChannel.id) {
      onSelectConversation(selectedChannel.id)
    }
  }, [channels.length, onSelectConversation, selectedChannel, selectedConversationId])

  useEffect(() => {
    setEditingMessageId(null)
    setEditingDraft('')
    setComposerPalette(null)
    setReactionPickerMessageId(null)
  }, [selectedChannel?.id])

  useEffect(() => {
    let active = true
    setWorkspaceLoading(true)

    void loadMessagingWorkspaceState(appConfig.apiBase, {
      accessToken: authSession?.accessToken,
    })
      .then((state) => {
        if (!active) {
          return
        }

        setChannels(buildMessagingWorkspaceChannelsFromRecords(state.conversations))
        setWorkspaceLoadError('')
        setWorkspaceLoading(false)
      })
      .catch((error) => {
        if (!active) {
          return
        }
        setWorkspaceLoadError(
          error instanceof Error
            ? error.message
            : 'Could not load persisted message history for this workspace.',
        )
        setWorkspaceLoading(false)
      })

    return () => {
      active = false
    }
  }, [authSession?.accessToken])

  function handleDraftChange(event: ChangeEvent<HTMLTextAreaElement>) {
    if (!selectedChannel) {
      return
    }

    const nextDraft = event.target.value

    setDraftsByChannelId((current) => ({
      ...current,
      [selectedChannel.id]: nextDraft,
    }))
    setComposerStatusByChannelId((current) => {
      if (!current[selectedChannel.id]) {
        return current
      }

      return {
        ...current,
        [selectedChannel.id]: '',
      }
    })
  }

  function handleThreadDraftChange(event: ChangeEvent<HTMLTextAreaElement>) {
    if (!selectedThreadRoot) {
      return
    }

    setThreadDraftsByRootId((current) => ({
      ...current,
      [selectedThreadRoot.id]: event.target.value,
    }))
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      !shouldSendMessageOnKeyDown({
        key: event.key,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
      return
    }

    if (sendDisabled || assistantReplyPending) {
      return
    }

    event.preventDefault()
    composerFormRef.current?.requestSubmit()
  }

  function handleThreadDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      !shouldSendMessageOnKeyDown({
        key: event.key,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
      return
    }

    if (!selectedThreadRoot || selectedThreadDraft.trim().length === 0) {
      return
    }

    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  function applyComposerFormatting(action: MessagingComposerFormatAction) {
    if (!selectedChannel) {
      return
    }

    const textarea = composerTextareaRef.current
    if (!textarea) {
      return
    }

    const result = applyMessagingComposerFormat(
      {
        value: selectedChannelDraft,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
      },
      action,
    )

    setDraftsByChannelId((current) => ({
      ...current,
      [selectedChannel.id]: result.value,
    }))

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
      })
    }
  }

  function insertComposerSnippet(snippet: string) {
    if (!selectedChannel) {
      return
    }

    const textarea = composerTextareaRef.current
    if (!textarea) {
      return
    }

    const result = insertMessagingComposerSnippet(
      {
        value: selectedChannelDraft,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
      },
      snippet,
    )

    setDraftsByChannelId((current) => ({
      ...current,
      [selectedChannel.id]: result.value,
    }))

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
      })
    }
  }

  function handleMentionInsert(memberName: string) {
    insertComposerSnippet(buildMessagingMentionToken(memberName))
    setComposerPalette(null)
  }

  function handleEmojiInsert(emoji: string) {
    insertComposerSnippet(emoji)
    setComposerPalette(null)
  }

  function handleAttachmentPick() {
    attachmentInputRef.current?.click()
  }

  function handleAttachmentSelected(event: ChangeEvent<HTMLInputElement>) {
    if (!selectedChannel) {
      return
    }

    const selectedFile = event.target.files?.[0]
    if (!selectedFile) {
      return
    }

    setAttachmentsByChannelId((current) => ({
      ...current,
      [selectedChannel.id]: buildComposerAttachment(selectedFile),
    }))
    setComposerStatusByChannelId((current) => ({
      ...current,
      [selectedChannel.id]: `Attached ${selectedFile.name}.`,
    }))
    event.target.value = ''
  }

  function handleClearAttachment() {
    if (!selectedChannel) {
      return
    }

    setAttachmentsByChannelId((current) => ({
      ...current,
      [selectedChannel.id]: null,
    }))
  }

  function handleClearDraft() {
    if (!selectedChannel) {
      return
    }

    setDraftsByChannelId((current) => ({
      ...current,
      [selectedChannel.id]: '',
    }))
    setComposerStatusByChannelId((current) => ({
      ...current,
      [selectedChannel.id]: 'Draft cleared.',
    }))
    setAttachmentsByChannelId((current) => ({
      ...current,
      [selectedChannel.id]: null,
    }))
  }

  function handleConversationSelect(conversationId: string) {
    if (conversationId === selectedConversationId) {
      return
    }
    onSelectConversation(conversationId)
  }

  function handleThreadSelect(rootMessageId: string | null) {
    if (!selectedChannel) {
      return
    }

    setSelectedThreadRootIdByChannelId((current) => ({
      ...current,
      [selectedChannel.id]: rootMessageId,
    }))
  }

  function quoteMessageIntoComposer(message: MessagingWorkspaceTimelineMessage) {
    if (!selectedChannel) {
      return
    }

    const quotedBody = buildQuotedMessagingDraft(
      message.deletedAt ? ['Message deleted.'] : message.body,
    )
    const nextDraft = selectedChannelDraft.trim()
      ? `${selectedChannelDraft.trim()}\n\n${quotedBody}\n\n`
      : `${quotedBody}\n\n`

    setDraftsByChannelId((current) => ({
      ...current,
      [selectedChannel.id]: nextDraft,
    }))
    setComposerStatusByChannelId((current) => ({
      ...current,
      [selectedChannel.id]: `Quoted ${message.author.name} into the channel composer.`,
    }))

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        composerTextareaRef.current?.focus()
      })
    }
  }

  function appendPostToChannel(channelId: string, post: MessagingWorkspacePost) {
    setChannels((current) =>
      current.map((channel) =>
        channel.id === channelId ? appendMessagingWorkspacePost(channel, post) : channel,
      ),
    )
  }

  function updatePostInChannel(
    channelId: string,
    postId: string,
    updater: (post: MessagingWorkspacePost) => MessagingWorkspacePost,
  ) {
    setChannels((current) =>
      current.map((channel) =>
        channel.id === channelId
          ? updateMessagingWorkspaceChannelPost(channel, postId, updater)
          : channel,
      ),
    )
  }

  async function postDraftToThread(
    channel: MessagingWorkspaceChannel,
    body: string,
    options?: {
      parentMessageId?: string | null
      attachment?: MessagingWorkspaceAttachment | null
    },
  ): Promise<MessagingWorkspacePost> {
    const trimmedBody = body.trim()
    const persistedPost = await createMessagingWorkspacePost(
      appConfig.apiBase,
      {
        conversation_id: channel.id,
        body: trimmedBody,
        parent_message_id: options?.parentMessageId ?? null,
        attachment: options?.attachment ?? null,
      },
      {
        accessToken: authSession?.accessToken,
      },
    )
    const timestamp = formatMessageTimestamp(new Date(persistedPost.created_at))
    const persistedPostView = buildMessagingWorkspacePostFromRecord(persistedPost, timestamp)

    appendPostToChannel(channel.id, persistedPostView)

    return persistedPostView
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedChannel) {
      return
    }

    const nextDraft = selectedChannelDraft.trim()
    if (!nextDraft) {
      return
    }

    try {
      const persistedPost = await postDraftToThread(selectedChannel, nextDraft, {
        attachment: selectedChannelAttachment,
      })
      setDraftsByChannelId((current) => ({
        ...current,
        [selectedChannel.id]: '',
      }))
      setAttachmentsByChannelId((current) => ({
        ...current,
        [selectedChannel.id]: null,
      }))
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]: `Posted to ${selectedChannel.label} at ${persistedPost.timestamp}.`,
      }))
    } catch (error) {
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]:
          error instanceof Error ? error.message : `Could not post to ${selectedChannel.label}.`,
      }))
    }
  }

  async function handleAskAssistant() {
    if (!selectedChannel) {
      return
    }

    const nextDraft = selectedChannelDraft.trim()
    if (!nextDraft) {
      return
    }

    const previewRoutingDecision = decideMessagingAgentRoute({
      channel: selectedChannel,
      draft: nextDraft,
      agents: [],
    })

    let userTimestamp = ''
    try {
      const persistedPost = await postDraftToThread(selectedChannel, nextDraft, {
        attachment: selectedChannelAttachment,
      })
      setDraftsByChannelId((current) => ({
        ...current,
        [selectedChannel.id]: '',
      }))
      setAttachmentsByChannelId((current) => ({
        ...current,
        [selectedChannel.id]: null,
      }))
      userTimestamp = persistedPost.timestamp
    } catch (error) {
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]:
          error instanceof Error ? error.message : `Could not post to ${selectedChannel.label}.`,
      }))
      return
    }
    if (!previewRoutingDecision.shouldReply) {
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]: previewRoutingDecision.rationale,
      }))
      return
    }

    const sessionResolution = await resolveMessagingAgentSession({
      authSession,
    })

    if (!sessionResolution.session) {
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]: `Posted to ${selectedChannel.label} at ${userTimestamp}. Sign in to let the messaging agent reply in this environment.`,
      }))
      return
    }

    const replySession = sessionResolution.session
    setAssistantReplyChannelId(selectedChannel.id)
    setComposerStatusByChannelId((current) => ({
      ...current,
      [selectedChannel.id]: `Posted to ${selectedChannel.label} at ${userTimestamp}. Agent is drafting a reply...`,
    }))

    try {
      const assistantPostId = createLocalPostId(`${selectedChannel.id}-assistant`)
      let assistantMessageStarted = false
      let stagedActionRequestCount = 0
      let assistantRunId: number | null = null
      let assistantAgentId: string | null = null
      let assistantAgentName: string | null = null
      let assistantReplyBody = ''
      const [runtimeSettings, agents] = await Promise.all([
        loadAssistantRuntimeSettings(appConfig.apiBase),
        listAssistantAgents(appConfig.apiBase),
      ])

      const provider = runtimeSettings.effective_default_provider ?? runtimeSettings.default_provider
      if (!runtimeSettings.enabled || !provider) {
        throw new Error('Assistant runtime is unavailable. Configure an assistant provider to reply in-thread.')
      }

      const routingDecision = decideMessagingAgentRoute({
        channel: selectedChannel,
        draft: nextDraft,
        agents,
      })

      if (!routingDecision.shouldReply) {
        setComposerStatusByChannelId((current) => ({
          ...current,
          [selectedChannel.id]: routingDecision.rationale,
        }))
        return
      }

      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]: `${routingDecision.rationale} Agent is drafting a reply...`,
      }))

      const payload: AssistantPromptRequest = {
        agent_id: routingDecision.targetAgent?.agent_id,
        provider: provider as AssistantProvider,
        workspace: routingDecision.targetWorkspace,
        context: buildThreadContext(selectedChannel),
        use_live_tools: true,
        messages: [
          {
            role: 'user',
            content: nextDraft,
          },
        ],
      }

      await streamAssistantResponse(appConfig.apiBase, payload, {
        accessToken: replySession.accessToken,
        onEvent: (streamEvent: AssistantStreamEvent) => {
          if (streamEvent.event === 'assistant.metadata') {
            const metadata =
              streamEvent.data && typeof streamEvent.data === 'object'
                ? (streamEvent.data as Record<string, unknown>)
                : {}

            stagedActionRequestCount = Array.isArray(metadata.action_requests)
              ? metadata.action_requests.length
              : 0
            assistantRunId =
              typeof metadata.run_id === 'number' ? metadata.run_id : assistantRunId
            assistantAgentId =
              typeof metadata.agent_id === 'string' ? metadata.agent_id : assistantAgentId
            assistantAgentName =
              typeof metadata.agent_name === 'string' ? metadata.agent_name : assistantAgentName

            appendPostToChannel(selectedChannel.id, {
              id: assistantPostId,
              author: buildAssistantAuthor(selectedChannel, metadata),
              timestamp: formatMessageTimestamp(new Date()),
              body: 'Drafting a reply...',
              source: 'assistant',
            })
            assistantMessageStarted = true
            return
          }

          if (streamEvent.event === 'assistant.delta') {
            const delta =
              typeof streamEvent.data.delta === 'string' ? streamEvent.data.delta : ''
            if (!delta) {
              return
            }

            if (!assistantMessageStarted) {
              appendPostToChannel(selectedChannel.id, {
                id: assistantPostId,
                author: {
                  name: 'ECTRM Assistant',
                  title: `Managed agent · ${selectedChannel.connectedWorkspace}`,
                  presence: 'Responding in thread',
                  initials: 'EA',
                  tone: 'system',
                },
                timestamp: formatMessageTimestamp(new Date()),
                body: delta,
                source: 'assistant',
              })
              assistantMessageStarted = true
              assistantReplyBody += delta
              return
            }

            updatePostInChannel(selectedChannel.id, assistantPostId, (post) => ({
              ...post,
              body: post.body === 'Drafting a reply...' ? delta : `${post.body}${delta}`,
            }))
            assistantReplyBody += delta
            return
          }

          if (streamEvent.event === 'assistant.complete') {
            const completeAgentId =
              typeof streamEvent.data.agent_id === 'string'
                ? streamEvent.data.agent_id
                : assistantAgentId
            const completeAgentName =
              typeof streamEvent.data.agent_name === 'string'
                ? streamEvent.data.agent_name
                : assistantAgentName
            const completeRunId =
              typeof streamEvent.data.run_id === 'number'
                ? streamEvent.data.run_id
                : assistantRunId
            const finalBody = assistantReplyBody.trim()

            if (finalBody) {
              void createMessagingWorkspacePost(
                appConfig.apiBase,
                {
                  conversation_id: selectedChannel.id,
                  body: finalBody,
                  source: 'assistant',
                  assistant_run_id: completeRunId,
                  assistant_agent_id: completeAgentId,
                  assistant_agent_name: completeAgentName,
                },
                {
                  accessToken: replySession.accessToken,
                },
              )
                .then((persistedAssistantPost) => {
                  const persistedTimestamp = formatMessageTimestamp(
                    new Date(persistedAssistantPost.created_at),
                  )
                  updatePostInChannel(
                    selectedChannel.id,
                    assistantPostId,
                    () =>
                      buildMessagingWorkspacePostFromRecord(
                        persistedAssistantPost,
                        persistedTimestamp,
                      ),
                  )
                })
                .catch(() => {
                  // Keep the visible in-thread assistant draft even if the
                  // persistence follow-up fails, and surface the failure in the
                  // composer status below.
                })
            }

            setComposerStatusByChannelId((current) => ({
              ...current,
              [selectedChannel.id]:
                stagedActionRequestCount > 0
                  ? `${routingDecision.rationale} Agent replied in ${selectedChannel.label} and staged ${stagedActionRequestCount.toLocaleString()} governed action request${stagedActionRequestCount === 1 ? '' : 's'}.`
                  : `${routingDecision.rationale} Agent replied in ${selectedChannel.label}.`,
            }))
          }
        },
      })
    } catch (error) {
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]:
          error instanceof Error ? error.message : 'Agent reply failed in this thread.',
      }))
    } finally {
      setAssistantReplyChannelId((current) =>
        current === selectedChannel.id ? null : current,
      )
    }
  }

  async function handleThreadReplySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedChannel || !selectedThreadRoot) {
      return
    }

    const nextDraft = selectedThreadDraft.trim()
    if (!nextDraft) {
      return
    }

    setThreadReplyPendingRootId(selectedThreadRoot.id)
    try {
      const persistedReply = await postDraftToThread(selectedChannel, nextDraft, {
        parentMessageId: selectedThreadRoot.id,
      })
      setThreadDraftsByRootId((current) => ({
        ...current,
        [selectedThreadRoot.id]: '',
      }))
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]: `Replied in thread at ${persistedReply.timestamp}.`,
      }))
    } catch (error) {
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]:
          error instanceof Error ? error.message : 'Could not post the thread reply.',
      }))
    } finally {
      setThreadReplyPendingRootId((current) =>
        current === selectedThreadRoot.id ? null : current,
      )
    }
  }

  function handleStartEditing(message: MessagingWorkspaceTimelineMessage) {
    setEditingMessageId(message.id)
    setEditingDraft(message.body.join('\n\n'))
  }

  function handleCancelEditing() {
    setEditingMessageId(null)
    setEditingDraft('')
  }

  async function handleSaveEdit(message: MessagingWorkspaceTimelineMessage) {
    if (!selectedChannel) {
      return
    }

    const nextDraft = editingDraft.trim()
    if (!nextDraft) {
      return
    }

    setPendingMessageActionId(message.id)
    try {
      const updatedRecord = await updateMessagingWorkspacePost(
        appConfig.apiBase,
        message.id,
        {
          body: nextDraft,
        },
        {
          accessToken: authSession?.accessToken,
        },
      )
      appendPostToChannel(
        selectedChannel.id,
        buildMessagingWorkspacePostFromRecord(
          updatedRecord,
          formatMessageTimestamp(new Date(updatedRecord.created_at)),
        ),
      )
      setEditingMessageId(null)
      setEditingDraft('')
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]: 'Message updated.',
      }))
    } catch (error) {
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]:
          error instanceof Error ? error.message : 'Could not update the message.',
      }))
    } finally {
      setPendingMessageActionId((current) => (current === message.id ? null : current))
    }
  }

  async function handleDeleteMessage(message: MessagingWorkspaceTimelineMessage) {
    if (!selectedChannel) {
      return
    }

    setPendingMessageActionId(message.id)
    try {
      const updatedRecord = await updateMessagingWorkspacePost(
        appConfig.apiBase,
        message.id,
        {
          deleted: true,
        },
        {
          accessToken: authSession?.accessToken,
        },
      )
      appendPostToChannel(
        selectedChannel.id,
        buildMessagingWorkspacePostFromRecord(
          updatedRecord,
          formatMessageTimestamp(new Date(updatedRecord.created_at)),
        ),
      )
      if (editingMessageId === message.id) {
        setEditingMessageId(null)
        setEditingDraft('')
      }
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]: 'Message deleted.',
      }))
    } catch (error) {
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]:
          error instanceof Error ? error.message : 'Could not delete the message.',
      }))
    } finally {
      setPendingMessageActionId((current) => (current === message.id ? null : current))
    }
  }

  async function handleTogglePin(message: MessagingWorkspaceTimelineMessage) {
    if (!selectedChannel) {
      return
    }

    setPendingMessageActionId(message.id)
    try {
      const updatedRecord = await updateMessagingWorkspacePost(
        appConfig.apiBase,
        message.id,
        {
          pinned: !message.pinnedAt,
        },
        {
          accessToken: authSession?.accessToken,
        },
      )
      appendPostToChannel(
        selectedChannel.id,
        buildMessagingWorkspacePostFromRecord(
          updatedRecord,
          formatMessageTimestamp(new Date(updatedRecord.created_at)),
        ),
      )
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]: updatedRecord.pinned_at ? 'Message pinned.' : 'Message unpinned.',
      }))
    } catch (error) {
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]:
          error instanceof Error ? error.message : 'Could not update the pin state.',
      }))
    } finally {
      setPendingMessageActionId((current) => (current === message.id ? null : current))
    }
  }

  async function handleToggleReaction(
    message: MessagingWorkspaceTimelineMessage,
    reaction: string,
  ) {
    if (!selectedChannel) {
      return
    }

    setPendingMessageActionId(message.id)
    try {
      const nextReactions = message.reactions?.includes(reaction)
        ? (message.reactions ?? []).filter((item) => item !== reaction)
        : [...(message.reactions ?? []), reaction]
      const updatedRecord = await updateMessagingWorkspacePost(
        appConfig.apiBase,
        message.id,
        {
          reactions: nextReactions,
        },
        {
          accessToken: authSession?.accessToken,
        },
      )
      appendPostToChannel(
        selectedChannel.id,
        buildMessagingWorkspacePostFromRecord(
          updatedRecord,
          formatMessageTimestamp(new Date(updatedRecord.created_at)),
        ),
      )
      setReactionPickerMessageId((current) => (current === message.id ? null : current))
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]:
          nextReactions.length > 0
            ? `Updated reactions on ${message.author.name}'s message.`
            : `Cleared reactions from ${message.author.name}'s message.`,
      }))
    } catch (error) {
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]:
          error instanceof Error ? error.message : 'Could not update reactions.',
      }))
    } finally {
      setPendingMessageActionId((current) => (current === message.id ? null : current))
    }
  }

  function renderMessage(message: MessagingWorkspaceTimelineMessage, options?: { compact?: boolean }) {
    const isEditing = editingMessageId === message.id
    const editDisabled = pendingMessageActionId === message.id || editingDraft.trim().length === 0
    const allowEdit = canEditMessage(message, authSession)
    const allowPin = canPinMessage(authSession)
    const allowReact = canPinMessage(authSession) && !message.deletedAt
    const threadActionLabel = message.parentMessageId ? 'Open thread' : 'Reply in thread'
    const threadTimestamp = formatAuditTimestamp(message.editedAt)
    const pinTimestamp = formatAuditTimestamp(message.pinnedAt)
    const isCompact = options?.compact ?? false

    return (
      <article
        key={message.id}
        className={`messaging-desk-message${isCompact ? ' is-compact' : ''}`}
      >
        <div
          className="messaging-desk-message-avatar"
          data-tone={message.author.tone}
          aria-hidden="true"
        >
          {message.author.initials}
        </div>
        <div className="messaging-desk-message-body">
          <div className="messaging-desk-message-head">
            <strong>{message.author.name}</strong>
            <span>{message.author.title}</span>
            <small>{message.timestamp}</small>
            {message.pinnedAt ? <em className="messaging-desk-message-badge">Pinned</em> : null}
            {message.deletedAt ? <em className="messaging-desk-message-badge">Deleted</em> : null}
          </div>

          {isEditing ? (
            <div className="messaging-desk-inline-editor">
              <textarea
                aria-label={`Edit message from ${message.author.name}`}
                value={editingDraft}
                onChange={(event) => setEditingDraft(event.target.value)}
              />
              <div className="messaging-desk-inline-editor-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={handleCancelEditing}
                  disabled={pendingMessageActionId === message.id}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => void handleSaveEdit(message)}
                  disabled={editDisabled}
                >
                  Save edit
                </button>
              </div>
            </div>
          ) : message.deletedAt ? (
            <p className="messaging-desk-message-deleted">Message deleted.</p>
          ) : (
            message.body.map((paragraph) => (
              <p key={paragraph}>{renderParagraphWithMentions(paragraph)}</p>
            ))
          )}

          {message.attachment && !message.deletedAt ? (
            <div className="messaging-desk-attachment">
              <span>{message.attachment.label}</span>
              <strong>{message.attachment.title}</strong>
              <p>{message.attachment.summary}</p>
              <small>{message.attachment.footnote}</small>
            </div>
          ) : null}
          {message.reactions?.length && !message.deletedAt ? (
            <div className="messaging-desk-reactions">
              {message.reactions.map((reaction) => (
                <button
                  key={reaction}
                  type="button"
                  className={`messaging-desk-reaction${pendingMessageActionId === message.id ? ' is-busy' : ''}`}
                  onClick={() => void handleToggleReaction(message, reaction)}
                  disabled={!allowReact || pendingMessageActionId === message.id}
                >
                  {reaction}
                </button>
              ))}
            </div>
          ) : null}

          <div className="messaging-desk-message-actions">
            <button
              type="button"
              className="button button-ghost"
              onClick={() => handleThreadSelect(getThreadRootId(message))}
            >
              {threadActionLabel}
            </button>
            {message.replyCount ? (
              <small>
                {message.replyCount.toLocaleString()} repl{message.replyCount === 1 ? 'y' : 'ies'}
              </small>
            ) : null}
            <button
              type="button"
              className="button button-ghost"
              onClick={() => quoteMessageIntoComposer(message)}
            >
              Quote
            </button>
            {allowReact ? (
              <button
                type="button"
                className="button button-ghost"
                onClick={() =>
                  setReactionPickerMessageId((current) =>
                    current === message.id ? null : message.id,
                  )
                }
                disabled={pendingMessageActionId === message.id}
              >
                React
              </button>
            ) : null}
            {allowPin ? (
              <button
                type="button"
                className="button button-ghost"
                onClick={() => void handleTogglePin(message)}
                disabled={pendingMessageActionId === message.id}
              >
                {message.pinnedAt ? 'Unpin' : 'Pin'}
              </button>
            ) : null}
            {allowEdit ? (
              <>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => handleStartEditing(message)}
                  disabled={pendingMessageActionId === message.id || isEditing}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => void handleDeleteMessage(message)}
                  disabled={pendingMessageActionId === message.id}
                >
                  Delete
                </button>
              </>
            ) : null}
          </div>

          {reactionPickerMessageId === message.id ? (
            <div className="messaging-desk-reaction-picker">
              {DEFAULT_MESSAGING_REACTION_OPTIONS.map((reactionOption) => (
                <button
                  key={reactionOption}
                  type="button"
                  className="messaging-desk-reaction"
                  onClick={() => void handleToggleReaction(message, reactionOption)}
                  disabled={pendingMessageActionId === message.id}
                >
                  {reactionOption}
                </button>
              ))}
            </div>
          ) : null}

          {threadTimestamp ? (
            <small className="messaging-desk-message-meta">Edited {threadTimestamp}</small>
          ) : null}
          {!threadTimestamp && pinTimestamp ? (
            <small className="messaging-desk-message-meta">Pinned {pinTimestamp}</small>
          ) : null}
        </div>
      </article>
    )
  }

  return (
    <div className="messaging-workspace">
      <section className="surface messaging-desk-shell">
        {selectedChannel ? (
          <>
            <section
              className="messaging-desk-channel"
              aria-label={`Message ${selectedChannel.label}`}
            >
              <nav
                className="messaging-desk-conversation-strip"
                aria-label="Conversation list"
              >
                {channels.map((channel) => {
                  const isSelected = channel.id === selectedChannel.id
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      className={`messaging-desk-conversation-tab${isSelected ? ' is-selected' : ''}`}
                      aria-pressed={isSelected}
                      onClick={() => handleConversationSelect(channel.id)}
                    >
                      <div className="messaging-desk-conversation-tab-head">
                        <strong>{channel.label}</strong>
                        {channel.unreadCount > 0 ? (
                          <span>{channel.unreadCount.toLocaleString()}</span>
                        ) : null}
                      </div>
                      <small>
                        {channel.kind === 'dm' ? 'Direct message' : 'Channel'} ·{' '}
                        {channel.connectedWorkspace}
                      </small>
                      <p>{channel.preview}</p>
                    </button>
                  )
                })}
              </nav>

              <header className="messaging-desk-channel-header">
                <div className="messaging-desk-channel-copy">
                  <div className="messaging-desk-channel-title-row">
                    <strong>{selectedChannel.label}</strong>
                    <span>{selectedChannel.kind === 'dm' ? 'Direct message' : 'Channel'}</span>
                    <span>{selectedChannel.connectedWorkspace}</span>
                  </div>
                  <p>{selectedChannel.description}</p>
                  <small>{selectedChannel.topic}</small>
                </div>
                <div className="messaging-desk-channel-header-meta">
                  <span>{selectedChannel.members.length.toLocaleString()} members</span>
                  <span>{selectedChannel.unreadCount.toLocaleString()} unread</span>
                </div>
              </header>

              <div className="messaging-desk-feed" ref={feedRef}>
                {visibleTimeline.map((item) =>
                  item.kind === 'system' ? (
                    <div key={item.id} className="messaging-desk-divider">
                      <span>{item.label}</span>
                      <small>{item.detail}</small>
                    </div>
                  ) : (
                    renderMessage(item)
                  ),
                )}
              </div>

              <form
                ref={composerFormRef}
                className="messaging-desk-composer"
                onSubmit={handleSendMessage}
              >
                <input
                  ref={attachmentInputRef}
                  type="file"
                  className="messaging-desk-hidden-file-input"
                  onChange={handleAttachmentSelected}
                />
                <div className="messaging-desk-composer-toolbar">
                  <span>Draft reply</span>
                  <div className="messaging-desk-composer-tools">
                    <button type="button" onClick={() => applyComposerFormatting('bold')}>
                      B
                    </button>
                    <button type="button" onClick={() => applyComposerFormatting('italic')}>
                      I
                    </button>
                    <button type="button" onClick={() => applyComposerFormatting('link')}>
                      Link
                    </button>
                    <button type="button" onClick={() => applyComposerFormatting('list')}>
                      List
                    </button>
                    <button type="button" onClick={() => applyComposerFormatting('code')}>
                      Code
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setComposerPalette((current) =>
                          current === 'mentions' ? null : 'mentions',
                        )
                      }
                    >
                      @Mention
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setComposerPalette((current) =>
                          current === 'emoji' ? null : 'emoji',
                        )
                      }
                    >
                      Emoji
                    </button>
                    <button type="button" onClick={handleAttachmentPick}>
                      Attach
                    </button>
                  </div>
                </div>
                {composerPalette === 'mentions' ? (
                  <div className="messaging-desk-composer-palette">
                    {selectedChannel.members.map((member) => (
                      <button
                        key={member.name}
                        type="button"
                        onClick={() => handleMentionInsert(member.name)}
                      >
                        @{member.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                {composerPalette === 'emoji' ? (
                  <div className="messaging-desk-composer-palette">
                    {DEFAULT_MESSAGING_EMOJI_OPTIONS.map((emoji) => (
                      <button key={emoji} type="button" onClick={() => handleEmojiInsert(emoji)}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
                {selectedChannelAttachment ? (
                  <div className="messaging-desk-composer-attachment">
                    <div>
                      <span>{selectedChannelAttachment.label}</span>
                      <strong>{selectedChannelAttachment.title}</strong>
                      <small>{selectedChannelAttachment.summary}</small>
                    </div>
                    <button type="button" className="button button-ghost" onClick={handleClearAttachment}>
                      Remove
                    </button>
                  </div>
                ) : null}
                {selectedThreadRoot ? (
                  <p className="messaging-desk-thread-pill">
                    Thread open for {selectedThreadRoot.author.name}. New channel messages still post to{' '}
                    {selectedChannel.label}.
                  </p>
                ) : null}
                <textarea
                  ref={composerTextareaRef}
                  aria-label={`Message ${selectedChannel.label}`}
                  placeholder={`Message ${selectedChannel.label}`}
                  value={selectedChannelDraft}
                  enterKeyHint="send"
                  onChange={handleDraftChange}
                  onKeyDown={handleDraftKeyDown}
                />
                <div className="messaging-desk-composer-foot">
                  <small>
                    {authSession
                      ? `Replying as ${authSession.user.display_name}. ${selectedChannel.composerHint}`
                      : `Prototype composer while signed out. ${selectedChannel.composerHint}`}
                  </small>
                  <div className="messaging-desk-composer-actions">
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={handleClearDraft}
                      disabled={selectedChannelDraft.length === 0 || assistantReplyPending}
                    >
                      Clear draft
                    </button>
                    <button
                      type="submit"
                      className="button button-primary"
                      disabled={sendDisabled || assistantReplyPending}
                    >
                      Send message
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void handleAskAssistant()}
                      disabled={sendDisabled || assistantReplyPending}
                    >
                      {assistantReplyPending ? 'Messaging agent deciding...' : 'Let messaging agent decide'}
                    </button>
                  </div>
                </div>
                <p className="messaging-desk-composer-status">
                  {selectedChannelStatus ||
                    workspaceLoadError ||
                    'Messages posted here stay in the visible thread instead of routing away.'}
                </p>
              </form>
            </section>

            <aside className="messaging-desk-context">
              <section className="messaging-desk-context-card">
                <span className="eyebrow">Thread details</span>
                {selectedThreadRoot ? (
                  <>
                    <strong>
                      {selectedThreadRoot.replyCount
                        ? `${selectedThreadRoot.replyCount.toLocaleString()} threaded repl${selectedThreadRoot.replyCount === 1 ? 'y' : 'ies'}`
                        : 'Start the thread here'}
                    </strong>
                    <p>
                      Keep side replies attached to the originating message instead of flattening every follow-up into the channel feed.
                    </p>
                    <div className="messaging-desk-thread-panel">
                      {renderMessage(selectedThreadRoot, { compact: true })}
                      <div className="messaging-desk-thread-replies">
                        {selectedThreadReplies.length > 0 ? (
                          selectedThreadReplies.map((reply) =>
                            renderMessage(reply, { compact: true }),
                          )
                        ) : (
                          <p className="messaging-desk-thread-empty">
                            No replies yet. Use this lane to keep the side conversation attached.
                          </p>
                        )}
                      </div>
                      <form
                        className="messaging-desk-thread-composer"
                        onSubmit={handleThreadReplySubmit}
                      >
                        <textarea
                          aria-label={`Reply in thread for ${selectedThreadRoot.author.name}`}
                          placeholder={`Reply in thread to ${selectedThreadRoot.author.name}`}
                          value={selectedThreadDraft}
                          onChange={handleThreadDraftChange}
                          onKeyDown={handleThreadDraftKeyDown}
                        />
                        <div className="messaging-desk-thread-composer-actions">
                          <button
                            type="button"
                            className="button button-ghost"
                            onClick={() => handleThreadSelect(null)}
                          >
                            Close thread
                          </button>
                          <button
                            type="submit"
                            className="button button-primary"
                            disabled={
                              selectedThreadDraft.trim().length === 0 ||
                              threadReplyPendingRootId === selectedThreadRoot.id
                            }
                          >
                            {threadReplyPendingRootId === selectedThreadRoot.id
                              ? 'Sending thread reply...'
                              : 'Send thread reply'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </>
                ) : (
                  <>
                    <strong>Select a message to thread</strong>
                    <p>
                      Reply in thread keeps message-specific follow-up attached to the originating post instead of appending everything to the channel timeline.
                    </p>
                  </>
                )}
              </section>

              <section className="messaging-desk-context-card">
                <strong>Lane context</strong>
                <p>{selectedChannel.topic}</p>
                <div className="messaging-desk-metric-list">
                  {selectedChannel.metrics.map((metric) => (
                    <article key={metric.label} className="messaging-desk-metric-card">
                      <span>{metric.label}</span>
                      <strong>{metric.value}</strong>
                    </article>
                  ))}
                </div>
              </section>

              <section className="messaging-desk-context-card">
                <strong>People in this lane</strong>
                <div className="messaging-desk-member-list">
                  {selectedChannel.members.map((member) => (
                    <article key={member.name} className="messaging-desk-member-card">
                      <div
                        className="messaging-desk-member-avatar"
                        data-tone={member.tone}
                        aria-hidden="true"
                      >
                        {member.initials}
                      </div>
                      <div>
                        <strong>{member.name}</strong>
                        <p>{member.title}</p>
                        <small>{member.presence}</small>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="messaging-desk-context-card">
                <strong>Why this reads more like Slack</strong>
                <ul className="messaging-desk-highlight-list">
                  {selectedChannel.highlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
              </section>

              <section className="messaging-desk-context-card">
                <strong>Jump routes</strong>
                <p>
                  Use messaging as the front door, then open the deeper workspace
                  only when you need record-level controls.
                </p>
                <div className="messaging-desk-jump-actions">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={onOpenPrompt}
                  >
                    Open Home
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={onOpenAssistant}
                  >
                    Open Assistant Console
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={onOpenOperations}
                  >
                    Open Work Queue
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={onOpenSettlement}
                  >
                    Open Settlement
                  </button>
                </div>
              </section>
            </aside>
          </>
        ) : (
          <div className="messaging-desk-empty">
            <span className="eyebrow">{workspaceLoading ? 'Loading' : 'Messages'}</span>
            <strong>
              {workspaceLoading ? 'Loading desk messages' : 'No messaging channels available'}
            </strong>
            <p>
              {workspaceLoadError ||
                'The shared desk thread will appear here when workspace messages are available.'}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
