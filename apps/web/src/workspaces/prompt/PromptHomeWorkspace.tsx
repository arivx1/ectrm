import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

import {
  getAssistantConversation,
  listAssistantConversations,
  loadAssistantRuntimeSettings,
  requestAssistantResponse,
} from '../../entities/assistant/api'
import {
  buildPromptNavigationRouteHandoff,
  normalizePromptNavigationIntent,
  parsePromptNavigationIntentsFromAssistantContent,
  promptNavigationIntentDetail,
  promptNavigationIntentLabel,
  type PromptNavigationIntent,
} from '../../entities/app/promptNavigationIntent'
import { appConfig } from '../../shared/config'
import type { AppRouteHandoff } from '../../shared/appRouteHandoff'
import type {
  AssistantActionRequest,
  AssistantConversation,
  AssistantConversationSummary,
  AssistantProvider,
  AssistantRuntimeSettings,
  ViewKey,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type PromptHomeCounts = {
  activeTrades: number | null
  openWorkItems: number | null
  pendingInvoices: number | null
  paymentsDue: number | null
  attentionItems: number | null
}

type PromptHomeWorkspaceProps = {
  authSession: StoredAuthSession | null
  health: string
  counts: PromptHomeCounts
  onOpenView: (view: ViewKey, handoff?: AppRouteHandoff | null) => void
}

type PromptHomeMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  provider?: AssistantProvider
  model?: string
  runId?: number | null
  warnings?: string[]
  actionRequests?: AssistantActionRequest[]
  navigationIntents?: PromptNavigationIntent[]
}

const QUICK_PROMPTS = [
  'What needs my attention right now?',
  'Summarize the open operations queue.',
  'Where should I look for exposure risk today?',
  'Help me decide which workspace to use for a trade issue.',
]

const NAVIGATION_INTENTS: PromptNavigationIntent[] = [
  {
    kind: 'open_workspace',
    targetView: 'dashboard',
    label: 'Open Live Desk',
    rationale: 'Use the old dashboard for market pulse, desk health, and high-level exposure.',
  },
  {
    kind: 'open_workspace',
    targetView: 'trades',
    label: 'Open Trade Capture',
    rationale: 'Use the ticket and blotter workflow when you need to book, inspect, amend, or cancel a trade.',
  },
  {
    kind: 'open_workspace',
    targetView: 'operations',
    label: 'Open Work Queue',
    rationale: 'Use the post-trade queue for confirmations, delivery blockers, approvals, and handoffs.',
  },
  {
    kind: 'open_workspace',
    targetView: 'settlement',
    label: 'Open Settlement',
    rationale: 'Use settlement for invoices, payments, aging, and cash exceptions.',
  },
]

function createPromptMessageId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatCount(value: number | null): string {
  return typeof value === 'number' ? value.toLocaleString() : 'n/a'
}

function formatPromptTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'n/a'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

function summarizePromptConversation(conversation: AssistantConversationSummary): string {
  const pieces = [conversation.provider, conversation.model]
  if (conversation.agent_name) {
    pieces.push(conversation.agent_name)
  }
  return pieces.join(' · ')
}

function resolveDefaultProvider(settings: AssistantRuntimeSettings): AssistantProvider | '' {
  return (
    settings.effective_default_provider ??
    settings.providers.find((provider) => provider.enabled)?.provider ??
    settings.providers.find((provider) => provider.configured)?.provider ??
    ''
  )
}

function buildPromptHomeContext(args: {
  health: string
  counts: PromptHomeCounts
  displayName: string
}): string {
  return [
    'Current workspace: prompt-first operator home.',
    `Authenticated user: ${args.displayName}.`,
    `API health: ${args.health}.`,
    `Active trades: ${formatCount(args.counts.activeTrades)}.`,
    `Open workflow items: ${formatCount(args.counts.openWorkItems)}.`,
    `Pending invoices: ${formatCount(args.counts.pendingInvoices)}.`,
    `Payments due: ${formatCount(args.counts.paymentsDue)}.`,
    `Dashboard attention items: ${formatCount(args.counts.attentionItems)}.`,
    'If the user needs to perform a business write, stage or describe the governed action path instead of claiming it has been executed.',
    'When opening an existing workspace would help, include a fenced navigation_intent JSON block after the user-facing answer. Use shape {"kind":"open_workspace","targetView":"operations","label":"Open Work Queue","rationale":"Why this is the right destination","focus":{"type":"trade","id":"TRD-1001","label":"TRD-1001"},"inspectorTab":"events"}. Navigation intents move the UI only and never execute business changes.',
  ].join('\n')
}

function promptMessagesFromConversation(conversation: AssistantConversation): PromptHomeMessage[] {
  return conversation.messages.map((message) => {
    const parsedResponse =
      message.role === 'assistant'
        ? parsePromptNavigationIntentsFromAssistantContent(message.content, {
            sourceRunId: message.run_id,
            sourceConversationId: conversation.conversation_id,
          })
        : { content: message.content, intents: [] }

    return {
      id: createPromptMessageId(),
      role: message.role,
      content: parsedResponse.content || message.content,
      provider: message.provider ?? undefined,
      model: message.model ?? undefined,
      runId: message.run_id,
      warnings: message.warnings,
      navigationIntents: parsedResponse.intents,
    }
  })
}

export function PromptHomeWorkspace({
  authSession,
  health,
  counts,
  onOpenView,
}: PromptHomeWorkspaceProps) {
  const [runtimeSettings, setRuntimeSettings] = useState<AssistantRuntimeSettings | null>(null)
  const [runtimeError, setRuntimeError] = useState('')
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<PromptHomeMessage[]>([])
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [recentConversations, setRecentConversations] = useState<AssistantConversationSummary[]>([])
  const [conversationHistoryLoading, setConversationHistoryLoading] = useState(false)
  const [conversationHistoryError, setConversationHistoryError] = useState('')
  const [conversationDetailLoading, setConversationDetailLoading] = useState(false)
  const [conversationDetailError, setConversationDetailError] = useState('')

  const operatorContext = useMemo(
    () =>
      buildPromptHomeContext({
        health,
        counts,
        displayName: authSession?.user.display_name ?? 'Signed-out user',
      }),
    [authSession?.user.display_name, counts, health],
  )

  const refreshRecentConversations = useCallback(async () => {
    if (!authSession) {
      setRecentConversations([])
      setConversationHistoryError('')
      return
    }

    setConversationHistoryLoading(true)
    setConversationHistoryError('')
    try {
      const conversations = await listAssistantConversations(appConfig.apiBase, {
        accessToken: authSession.accessToken,
        limit: 4,
      })
      setRecentConversations(conversations)
    } catch (error) {
      setConversationHistoryError(
        error instanceof Error ? error.message : 'Could not load recent prompt threads.',
      )
    } finally {
      setConversationHistoryLoading(false)
    }
  }, [authSession])

  useEffect(() => {
    void refreshRecentConversations()
  }, [refreshRecentConversations])

  async function loadRuntimeSettings(): Promise<AssistantRuntimeSettings> {
    if (runtimeSettings) {
      return runtimeSettings
    }

    try {
      const payload = await loadAssistantRuntimeSettings(appConfig.apiBase)
      setRuntimeSettings(payload)
      setRuntimeError('')
      return payload
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load assistant runtime.'
      setRuntimeError(message)
      throw new Error(message)
    }
  }

  async function submitPrompt(prompt: string) {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt || !authSession || submitting) {
      return
    }

    const userMessage: PromptHomeMessage = {
      id: createPromptMessageId(),
      role: 'user',
      content: trimmedPrompt,
    }
    const nextMessages = [...messages, userMessage]

    setMessages(nextMessages)
    setDraft('')
    setSubmitError('')
    setSubmitting(true)

    try {
      const settings = await loadRuntimeSettings()
      if (!settings.enabled) {
        throw new Error('No configured assistant provider is currently ready on the API.')
      }

      const provider = resolveDefaultProvider(settings)
      const providerDetails = settings.providers.find((entry) => entry.provider === provider)
      if (!provider || !providerDetails?.enabled) {
        throw new Error('No enabled assistant provider is available for the operator prompt.')
      }

      const response = await requestAssistantResponse(
        appConfig.apiBase,
        {
          conversation_id: conversationId ?? undefined,
          provider,
          workspace: 'assistant',
          context: operatorContext,
          use_live_tools: true,
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        },
        {
          accessToken: authSession.accessToken,
        },
      )
      const responseConversationId = response.conversation_id ?? conversationId
      const parsedResponse = parsePromptNavigationIntentsFromAssistantContent(response.message.content, {
        sourceRunId: response.run_id,
        sourceConversationId: responseConversationId,
      })

      setConversationId(responseConversationId)
      setMessages((current) => [
        ...current,
        {
          id: createPromptMessageId(),
          role: 'assistant',
          content: parsedResponse.content || response.message.content,
          provider: response.provider,
          model: response.model,
          runId: response.run_id,
          warnings: response.warnings,
          actionRequests: response.action_requests,
          navigationIntents: parsedResponse.intents,
        },
      ])
      void refreshRecentConversations()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Assistant request failed.')
    } finally {
      setSubmitting(false)
    }
  }

  async function resumeConversation(conversation: AssistantConversationSummary) {
    if (!authSession || submitting || conversationDetailLoading) {
      return
    }

    setConversationDetailLoading(true)
    setConversationDetailError('')
    setSubmitError('')
    try {
      const payload = await getAssistantConversation(
        appConfig.apiBase,
        conversation.conversation_id,
        { accessToken: authSession.accessToken },
      )
      setConversationId(payload.conversation_id)
      setMessages(promptMessagesFromConversation(payload))
      setDraft('')
    } catch (error) {
      setConversationDetailError(
        error instanceof Error ? error.message : 'Could not reopen that prompt thread.',
      )
    } finally {
      setConversationDetailLoading(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitPrompt(draft)
  }

  function handleNavigationIntent(intent: PromptNavigationIntent, includeHandoff = true) {
    const normalizedIntent = normalizePromptNavigationIntent(intent)
    if (!normalizedIntent) {
      setSubmitError('That navigation suggestion is no longer available.')
      return
    }

    onOpenView(
      normalizedIntent.targetView,
      includeHandoff ? buildPromptNavigationRouteHandoff(normalizedIntent) : null,
    )
  }

  const runtimeNote = runtimeError
    ? runtimeError
    : runtimeSettings
      ? `Using ${runtimeSettings.effective_default_provider ?? 'the first enabled provider'} when you send.`
      : 'Assistant runtime will be checked when you send the first prompt.'
  const conversationHistoryNote = !authSession
    ? 'Sign in to reopen recent prompt threads.'
    : conversationHistoryLoading
      ? 'Loading recent prompt threads.'
      : conversationHistoryError
        ? conversationHistoryError
        : conversationDetailLoading
          ? 'Reopening selected prompt thread.'
          : conversationDetailError
            ? conversationDetailError
            : recentConversations.length > 0
              ? `${recentConversations.length} recent prompt thread${recentConversations.length === 1 ? '' : 's'} available.`
              : 'No recent prompt threads yet.'

  return (
    <div className="prompt-home">
      <section className="surface prompt-home-composer-panel">
        <div className="prompt-home-heading">
          <span className="eyebrow">Prompt Home</span>
          <h3>Start with the job in front of you</h3>
          <p>
            Ask for the next best workspace, a grounded summary, or a safe path into
            the old console when a form, report, queue, or approval surface is the
            right place to continue.
          </p>
        </div>

        <form className="prompt-home-composer" onSubmit={handleSubmit}>
          <label className="field">
            <span>Operator prompt</span>
            <textarea
              className="control prompt-home-textarea"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
                setSubmitError('')
              }}
              placeholder="Ask what needs attention, where to go next, or how to handle a trade, queue, exposure, invoice, or report question."
            />
          </label>

          <div className="toolbar settings-actions prompt-home-actions">
            <button
              type="submit"
              className="button button-primary"
              disabled={!authSession || !draft.trim() || submitting}
            >
              {submitting ? 'Sending...' : 'Send Prompt'}
            </button>
            <button type="button" className="button button-ghost" onClick={() => onOpenView('assistant')}>
              Assistant Console
            </button>
          </div>

          <p className={`form-note ${submitError ? 'form-note-error' : ''}`}>
            {submitError || (!authSession ? 'Sign in before sending a protected prompt.' : runtimeNote)}
          </p>
        </form>

        <div className="prompt-home-quick-prompts" aria-label="Quick prompts">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="entity-chip entity-chip-soft"
              onClick={() => setDraft(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      </section>

      <section className="prompt-home-grid">
        <article className="surface prompt-home-chat">
          <div className="section-head">
            <div>
              <span className="eyebrow">Conversation</span>
              <h3>Current prompt thread</h3>
            </div>
            <p>Responses can explain, route, draft, or stage governed actions. They do not directly mutate records.</p>
          </div>

          <div className="prompt-home-chat-log">
            {messages.length === 0 ? (
              <div className="empty-state prompt-home-empty">
                <strong>No prompt yet</strong>
                <p>Use the composer above or pick a quick prompt to start from intent instead of choosing a screen first.</p>
              </div>
            ) : (
              messages.map((message) => (
                <article key={message.id} className={`assistant-message assistant-message-${message.role}`}>
                  <div className="assistant-message-head">
                    <strong>{message.role === 'assistant' ? 'Assistant' : 'You'}</strong>
                    {message.provider && message.model ? <span>{message.provider} · {message.model}</span> : null}
                  </div>
                  <p>{message.content}</p>
                  {message.runId ? (
                    <div className="assistant-message-meta">
                      <span>Run #{message.runId}</span>
                      <button type="button" className="assistant-run-link" onClick={() => onOpenView('assistant')}>
                        Open diagnostics
                      </button>
                    </div>
                  ) : null}
                  {message.actionRequests && message.actionRequests.length > 0 ? (
                    <div className="feedback-banner prompt-home-action-banner">
                      <strong>
                        {message.actionRequests.length.toLocaleString()} governed action request
                        {message.actionRequests.length === 1 ? '' : 's'} staged
                      </strong>
                      <p>Review the request before anything changes in the system.</p>
                      <button type="button" className="button button-secondary" onClick={() => onOpenView('assistant')}>
                        Open Review Path
                      </button>
                    </div>
                  ) : null}
                  {message.navigationIntents && message.navigationIntents.length > 0 ? (
                    <div className="prompt-home-handoff-list" aria-label="Assistant workspace handoffs">
                      {message.navigationIntents.map((intent) => (
                        <button
                          key={`${intent.targetView}-${intent.focus?.type ?? 'workspace'}-${intent.focus?.id ?? intent.label ?? intent.rationale ?? 'handoff'}`}
                          type="button"
                          className="prompt-home-handoff"
                          onClick={() => handleNavigationIntent(intent)}
                        >
                          <strong>{promptNavigationIntentLabel(intent)}</strong>
                          <span>{promptNavigationIntentDetail(intent)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {message.warnings && message.warnings.length > 0 ? (
                    <div className="assistant-message-meta">
                      {message.warnings.map((warning) => (
                        <span key={warning}>{warning}</span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </article>

        <aside className="prompt-home-sidecar">
          <section className="surface prompt-home-recent">
            <div className="section-head">
              <div>
                <span className="eyebrow">Resume</span>
                <h3>Recent prompt threads</h3>
              </div>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => void refreshRecentConversations()}
                disabled={!authSession || conversationHistoryLoading}
              >
                Refresh
              </button>
            </div>
            <p className={`form-note ${conversationHistoryError || conversationDetailError ? 'form-note-error' : ''}`}>
              {conversationHistoryNote}
            </p>
            {recentConversations.length > 0 ? (
              <div className="prompt-home-thread-list">
                {recentConversations.map((conversation) => (
                  <button
                    key={conversation.conversation_id}
                    type="button"
                    className={`prompt-home-thread ${conversationId === conversation.conversation_id ? 'is-selected' : ''}`}
                    onClick={() => void resumeConversation(conversation)}
                    disabled={submitting || conversationDetailLoading}
                  >
                    <strong>{conversation.title}</strong>
                    <span>
                      {conversation.latest_user_message ??
                        conversation.latest_assistant_message ??
                        'Stored prompt thread.'}
                    </span>
                    <small>
                      {summarizePromptConversation(conversation)} · {conversation.run_count} run
                      {conversation.run_count === 1 ? '' : 's'} · Updated{' '}
                      {formatPromptTimestamp(conversation.updated_at)}
                    </small>
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className="surface prompt-home-destinations">
            <div className="section-head">
              <div>
                <span className="eyebrow">Old Console</span>
                <h3>Open a workspace</h3>
              </div>
              <p>The traditional screens are still here when you already know where the work belongs.</p>
            </div>

            <div className="prompt-home-destination-list">
              {NAVIGATION_INTENTS.map((intent) => (
                <button
                  key={intent.targetView}
                  type="button"
                  className="prompt-home-destination"
                  onClick={() => handleNavigationIntent(intent, false)}
                >
                  <strong>{promptNavigationIntentLabel(intent)}</strong>
                  <span>{promptNavigationIntentDetail(intent)}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  )
}
