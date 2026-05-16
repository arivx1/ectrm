import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'

import {
  listAssistantAgents,
  loadAssistantRuntimeSettings,
  streamAssistantResponse,
  type AssistantStreamEvent,
} from '../../entities/assistant/api'
import { appConfig } from '../../shared/config'
import type { AssistantPromptRequest, AssistantProvider } from '../../shared/models'
import { shouldSendMessageOnKeyDown } from './messagingComposerKeybindings'
import { resolveMessagingAgentSession } from './messagingAgentSession'
import {
  appendMessagingWorkspacePost,
  buildMessagingWorkspaceChannels,
  type MessagingWorkspaceChannel,
  type MessagingWorkspaceMember,
  type MessagingWorkspacePost,
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
}

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

function buildComposerAuthor(authSession: StoredAuthSession | null): MessagingWorkspaceMember {
  if (authSession) {
    return {
      name: authSession.user.display_name,
      title: 'Desk operator',
      presence: 'You',
      initials: buildMemberInitials(authSession.user.display_name),
      tone: 'human',
    }
  }

  return {
    name: 'Guest Operator',
    title: 'Prototype author',
    presence: 'Signed-out preview',
    initials: 'GO',
    tone: 'human',
  }
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

export function MessagingWorkspace({
  authSession,
  counts,
  onSessionSync,
  onOpenPrompt,
  onOpenAssistant,
  onOpenOperations,
  onOpenSettlement,
}: MessagingWorkspaceProps) {
  const baseChannels = useMemo(() => buildMessagingWorkspaceChannels(counts), [counts])
  const [postedMessagesByChannelId, setPostedMessagesByChannelId] = useState<
    Record<string, MessagingWorkspacePost[]>
  >({})
  const [draftsByChannelId, setDraftsByChannelId] = useState<Record<string, string>>({})
  const [composerStatusByChannelId, setComposerStatusByChannelId] = useState<
    Record<string, string>
  >({})
  const [assistantReplyChannelId, setAssistantReplyChannelId] = useState<string | null>(null)
  const feedRef = useRef<HTMLDivElement | null>(null)
  const composerFormRef = useRef<HTMLFormElement | null>(null)

  const channels = useMemo(
    () =>
      baseChannels.map((channel) =>
        (postedMessagesByChannelId[channel.id] ?? []).reduce(
          (nextChannel, post) => appendMessagingWorkspacePost(nextChannel, post),
          channel,
        ),
      ),
    [baseChannels, postedMessagesByChannelId],
  )
  const selectedChannel = channels[0] ?? null
  const selectedChannelDraft = selectedChannel ? draftsByChannelId[selectedChannel.id] ?? '' : ''
  const selectedChannelStatus = selectedChannel
    ? composerStatusByChannelId[selectedChannel.id] ?? ''
    : ''
  const sendDisabled = !selectedChannel || selectedChannelDraft.trim().length === 0
  const assistantReplyPending = selectedChannel
    ? assistantReplyChannelId === selectedChannel.id
    : false

  useEffect(() => {
    const feedNode = feedRef.current
    if (!feedNode || !selectedChannel) {
      return
    }

    feedNode.scrollTop = feedNode.scrollHeight
  }, [selectedChannel, selectedChannel?.id, selectedChannel?.timeline.length])

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
  }

  function appendPostToChannel(channelId: string, post: MessagingWorkspacePost) {
    setPostedMessagesByChannelId((current) => ({
      ...current,
      [channelId]: [...(current[channelId] ?? []), post],
    }))
  }

  function updatePostInChannel(
    channelId: string,
    postId: string,
    updater: (post: MessagingWorkspacePost) => MessagingWorkspacePost,
  ) {
    setPostedMessagesByChannelId((current) => ({
      ...current,
      [channelId]: (current[channelId] ?? []).map((post) =>
        post.id === postId ? updater(post) : post,
      ),
    }))
  }

  function postDraftToThread(channel: MessagingWorkspaceChannel, body: string): string {
    const trimmedBody = body.trim()
    const timestamp = formatMessageTimestamp(new Date())

    appendPostToChannel(channel.id, {
      id: createLocalPostId(`${channel.id}-post`),
      author: buildComposerAuthor(authSession),
      timestamp,
      body: trimmedBody,
    })

    setDraftsByChannelId((current) => ({
      ...current,
      [channel.id]: '',
    }))

    return timestamp
  }

  function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedChannel) {
      return
    }

    const nextDraft = selectedChannelDraft.trim()
    if (!nextDraft) {
      return
    }

    const timestamp = postDraftToThread(selectedChannel, nextDraft)
    setComposerStatusByChannelId((current) => ({
      ...current,
      [selectedChannel.id]: `Posted to ${selectedChannel.label} at ${timestamp}.`,
    }))
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

    const userTimestamp = postDraftToThread(selectedChannel, nextDraft)
    if (!previewRoutingDecision.shouldReply) {
      setComposerStatusByChannelId((current) => ({
        ...current,
        [selectedChannel.id]: previewRoutingDecision.rationale,
      }))
      return
    }

    const sessionResolution = await resolveMessagingAgentSession({
      apiBase: appConfig.apiBase,
      authSession,
      onSessionSync,
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
      [selectedChannel.id]:
        sessionResolution.source === 'single_user_session'
          ? `Posted to ${selectedChannel.label} at ${userTimestamp}. Messaging agent claimed the local OPS_ADMIN session and is drafting a reply...`
          : `Posted to ${selectedChannel.label} at ${userTimestamp}. Agent is drafting a reply...`,
    }))

    try {
      const assistantPostId = createLocalPostId(`${selectedChannel.id}-assistant`)
      let assistantMessageStarted = false
      let stagedActionRequestCount = 0
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

            appendPostToChannel(selectedChannel.id, {
              id: assistantPostId,
              author: buildAssistantAuthor(selectedChannel, metadata),
              timestamp: formatMessageTimestamp(new Date()),
              body: 'Drafting a reply...',
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
                body: '',
              })
              assistantMessageStarted = true
            }

            updatePostInChannel(selectedChannel.id, assistantPostId, (post) => ({
              ...post,
              body: post.body === 'Drafting a reply...' ? delta : `${post.body}${delta}`,
            }))
            return
          }

          if (streamEvent.event === 'assistant.complete') {
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

  return (
    <div className="messaging-workspace">
      <section className="surface messaging-desk-shell">
        {selectedChannel ? (
          <>
            <section
              className="messaging-desk-channel"
              aria-label={`Message ${selectedChannel.label}`}
            >
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
                {selectedChannel.timeline.map((item) =>
                  item.kind === 'system' ? (
                    <div key={item.id} className="messaging-desk-divider">
                      <span>{item.label}</span>
                      <small>{item.detail}</small>
                    </div>
                  ) : (
                    <article key={item.id} className="messaging-desk-message">
                      <div
                        className="messaging-desk-message-avatar"
                        data-tone={item.author.tone}
                        aria-hidden="true"
                      >
                        {item.author.initials}
                      </div>
                      <div className="messaging-desk-message-body">
                        <div className="messaging-desk-message-head">
                          <strong>{item.author.name}</strong>
                          <span>{item.author.title}</span>
                          <small>{item.timestamp}</small>
                        </div>
                        {item.body.map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                        {item.attachment ? (
                          <div className="messaging-desk-attachment">
                            <span>{item.attachment.label}</span>
                            <strong>{item.attachment.title}</strong>
                            <p>{item.attachment.summary}</p>
                            <small>{item.attachment.footnote}</small>
                          </div>
                        ) : null}
                        {item.reactions?.length ? (
                          <div className="messaging-desk-reactions">
                            {item.reactions.map((reaction) => (
                              <span key={reaction}>{reaction}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ),
                )}
              </div>

              <form
                ref={composerFormRef}
                className="messaging-desk-composer"
                onSubmit={handleSendMessage}
              >
                <div className="messaging-desk-composer-toolbar">
                  <span>Draft reply</span>
                  <div className="messaging-desk-composer-tools" aria-hidden="true">
                    <span>B</span>
                    <span>I</span>
                    <span>Link</span>
                    <span>List</span>
                    <span>Code</span>
                  </div>
                </div>
                <textarea
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
                  {selectedChannelStatus || 'Messages posted here stay in the visible thread instead of routing away.'}
                </p>
              </form>
            </section>

            <aside className="messaging-desk-context">
              <section className="messaging-desk-context-card">
                <span className="eyebrow">Thread details</span>
                <strong>Keep desk context attached</strong>
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
        ) : null}
      </section>
    </div>
  )
}
