import { useEffect, useState, type FormEvent } from 'react'

import {
  listAssistantAgents,
  loadAssistantRuntimeSettings,
  previewAssistantPromptContext,
  requestAssistantResponse,
} from '../../entities/assistant/api'
import { appConfig } from '../../shared/config'
import type {
  AssistantAgent,
  AssistantPromptContext,
  AssistantPromptRequest,
  AssistantProvider,
  AssistantRuntimeSettings,
  EventRow,
  PositionRow,
  Trade,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type AssistantWorkspaceProps = {
  authSession: StoredAuthSession | null
  health: string
  trades: Trade[]
  events: EventRow[]
  positions: PositionRow[]
  selectedTrade: Trade | null
  selectedTradeEvents: EventRow[]
  onOpenSettings: () => void
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  provider?: AssistantProvider
  model?: string
  runId?: number | null
  runRecordedAt?: string | null
  usage?: {
    input_tokens: number | null
    output_tokens: number | null
  }
  warnings?: string[]
  toolCalls?: {
    tool_name: string
    summary: string
    arguments: Record<string, unknown>
    record_count: number | null
  }[]
}

function createChatMessageId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function buildAssistantContext({
  health,
  trades,
  events,
  positions,
  selectedTrade,
  selectedTradeEvents,
}: Omit<AssistantWorkspaceProps, 'authSession' | 'onOpenSettings'>): string {
  const lines = [
    `API health: ${health}.`,
    `Loaded trades: ${trades.length}.`,
    `Loaded events: ${events.length}.`,
    `Loaded positions: ${positions.length}.`,
  ]

  if (selectedTrade) {
    lines.push('Selected trade:')
    lines.push(`- trade_id: ${selectedTrade.trade_id}`)
    lines.push(`- status: ${selectedTrade.status}`)
    lines.push(`- trade_nature: ${selectedTrade.trade_nature}`)
    lines.push(`- trade_structure: ${selectedTrade.trade_structure}`)
    lines.push(`- book: ${selectedTrade.book}`)
    lines.push(`- commodity: ${selectedTrade.commodity}`)
    lines.push(`- counterparty: ${selectedTrade.counterparty ?? 'n/a'}`)
    lines.push(`- pricing_type: ${selectedTrade.pricing_type}`)
    if (selectedTrade.volume !== null) {
      lines.push(`- volume: ${selectedTrade.volume}`)
    }
    if (selectedTrade.price !== null) {
      lines.push(`- price: ${selectedTrade.price}`)
    }
  }

  if (selectedTradeEvents.length > 0) {
    lines.push('Recent selected-trade events:')
    selectedTradeEvents.slice(0, 6).forEach((event) => {
      lines.push(`- ${event.event_type} at ${event.occurred_at}`)
    })
  }

  return lines.join('\n')
}

function renderPromptPreview(preview: AssistantPromptContext | null): string {
  if (!preview) {
    return 'Prompt preview unavailable.'
  }

  const lines = [
    `Provider: ${preview.provider}`,
    `Model: ${preview.model}`,
    `Generated: ${preview.generated_at}`,
  ]

  if (preview.agent_name) {
    lines.push(`Agent: ${preview.agent_name}`)
  }

  if (preview.warnings.length > 0) {
    lines.push('')
    lines.push('Warnings:')
    preview.warnings.forEach((warning) => {
      lines.push(`- ${warning}`)
    })
  }

  preview.sections.forEach((section) => {
    lines.push('')
    lines.push(`[${section.title}]`)
    lines.push(section.content)
  })

  return lines.join('\n')
}

export function AssistantWorkspace({
  authSession,
  health,
  trades,
  events,
  positions,
  selectedTrade,
  selectedTradeEvents,
  onOpenSettings,
}: AssistantWorkspaceProps) {
  const [runtimeSettings, setRuntimeSettings] = useState<AssistantRuntimeSettings | null>(null)
  const [agents, setAgents] = useState<AssistantAgent[]>([])
  const [runtimeLoading, setRuntimeLoading] = useState(true)
  const [runtimeError, setRuntimeError] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<AssistantProvider | ''>('')
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [includeContext, setIncludeContext] = useState(true)
  const [useLiveTools, setUseLiveTools] = useState(true)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [promptPreview, setPromptPreview] = useState<AssistantPromptContext | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')

  const contextSummary = buildAssistantContext({
    health,
    trades,
    events,
    positions,
    selectedTrade,
    selectedTradeEvents,
  })

  useEffect(() => {
    let cancelled = false

    async function loadRuntime() {
      try {
        const [runtimePayload, agentPayload] = await Promise.all([
          loadAssistantRuntimeSettings(appConfig.apiBase),
          listAssistantAgents(appConfig.apiBase),
        ])

        if (!cancelled) {
          setRuntimeSettings(runtimePayload)
          setAgents(agentPayload)
          setRuntimeError('')
        }
      } catch (error) {
        if (!cancelled) {
          setRuntimeSettings(null)
          setAgents([])
          setRuntimeError(error instanceof Error ? error.message : 'Could not load assistant runtime.')
        }
      } finally {
        if (!cancelled) {
          setRuntimeLoading(false)
        }
      }
    }

    loadRuntime()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!runtimeSettings || selectedProvider) {
      return
    }

    const firstEnabledProvider =
      runtimeSettings.providers.find((provider) => provider.enabled)?.provider ??
      runtimeSettings.effective_default_provider ??
      runtimeSettings.providers.find((provider) => provider.configured)?.provider ??
      ''

    setSelectedProvider(firstEnabledProvider)
  }, [runtimeSettings, selectedProvider])

  useEffect(() => {
    if (selectedAgentId && !agents.some((agent) => agent.agent_id === selectedAgentId)) {
      setSelectedAgentId('')
    }
  }, [agents, selectedAgentId])

  useEffect(() => {
    let cancelled = false

    async function loadPromptPreview() {
      if (!authSession || !runtimeSettings?.enabled || !selectedProvider) {
        setPromptPreview(null)
        setPreviewError('')
        setPreviewLoading(false)
        return
      }

      setPreviewLoading(true)

      try {
        const payload = await previewAssistantPromptContext(
          appConfig.apiBase,
          {
            agent_id: selectedAgentId || undefined,
            provider: selectedProvider,
            workspace: 'assistant',
            context: includeContext ? contextSummary : undefined,
            use_live_tools: useLiveTools,
          },
          {
            headers: { Authorization: `Bearer ${authSession.accessToken}` },
          },
        )

        if (!cancelled) {
          setPromptPreview(payload)
          setPreviewError('')
        }
      } catch (error) {
        if (!cancelled) {
          setPromptPreview(null)
          setPreviewError(error instanceof Error ? error.message : 'Could not load prompt preview.')
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false)
        }
      }
    }

    loadPromptPreview()

    return () => {
      cancelled = true
    }
  }, [authSession, contextSummary, includeContext, runtimeSettings, selectedAgentId, selectedProvider, useLiveTools])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedDraft = draft.trim()
    if (!trimmedDraft || !selectedProvider || !authSession) {
      return
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      {
        id: createChatMessageId(),
        role: 'user',
        content: trimmedDraft,
      },
    ]

    setMessages(nextMessages)
    setDraft('')
    setSubmitError('')
    setSubmitting(true)

    try {
      const payload: AssistantPromptRequest = {
        agent_id: selectedAgentId || undefined,
        provider: selectedProvider,
        workspace: 'assistant',
        context: includeContext ? contextSummary : undefined,
        use_live_tools: useLiveTools,
        messages: nextMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      }

      const response = await requestAssistantResponse(appConfig.apiBase, payload, {
        headers: { Authorization: `Bearer ${authSession.accessToken}` },
      })

      setSelectedProvider(response.provider)
      setMessages([
        ...nextMessages,
        {
          id: createChatMessageId(),
          role: 'assistant',
          content: response.message.content,
          provider: response.provider,
          model: response.model,
          runId: response.run_id,
          runRecordedAt: response.run_recorded_at,
          usage: response.usage,
          warnings: response.warnings,
          toolCalls: response.tool_calls,
        },
      ])
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Assistant request failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedProviderDetails =
    runtimeSettings?.providers.find((provider) => provider.provider === selectedProvider) ?? null
  const selectedAgent = agents.find((agent) => agent.agent_id === selectedAgentId) ?? null
  const assistantReady = Boolean(runtimeSettings?.enabled && authSession && selectedProviderDetails?.enabled)
  const previewText = renderPromptPreview(promptPreview)

  return (
    <div className="workspace-grid assistant-grid">
      <section className="stack">
        <article className="surface">
          <div className="section-head">
            <div>
              <span className="eyebrow">Assistant Runtime</span>
              <h3>Prompt Management Workspace</h3>
            </div>
            <p>
              Route prompts through managed providers and agent profiles, then inspect the exact
              server-built grounding context before you send the message.
            </p>
          </div>

          {runtimeLoading ? (
            <div className="empty-state assistant-empty-state">
              <strong>Loading assistant runtime</strong>
              <p>Fetching providers, active agents, and tool availability from the API.</p>
            </div>
          ) : runtimeSettings ? (
            <>
              <div className="settings-summary-grid">
                <article className="settings-summary-card">
                  <span>Effective default</span>
                  <strong>{runtimeSettings.effective_default_provider ?? 'None configured'}</strong>
                  <p>
                    {runtimeSettings.effective_default_provider
                      ? 'This provider answers when you do not override it.'
                      : 'No configured provider is ready on the API yet.'}
                  </p>
                </article>
                <article className="settings-summary-card">
                  <span>Managed agents</span>
                  <strong>{agents.length}</strong>
                  <p>
                    {agents.length > 0
                      ? 'Active prompt profiles are available for selection.'
                      : 'The platform foundation prompt is active even without a named agent.'}
                  </p>
                </article>
                <article className="settings-summary-card">
                  <span>Available tools</span>
                  <strong>{runtimeSettings.available_tools.length}</strong>
                  <p>
                    {runtimeSettings.available_tools.length > 0
                      ? 'Live assistant tools are published by the backend runtime.'
                      : 'No tool definitions are currently exposed by the API.'}
                  </p>
                </article>
              </div>

              <div className="assistant-provider-grid">
                {runtimeSettings.providers.map((provider) => {
                  const selected = provider.provider === selectedProvider
                  const tone = provider.enabled ? 'active' : 'cancelled'
                  return (
                    <button
                      key={provider.provider}
                      type="button"
                      className={`assistant-provider-card ${selected ? 'is-selected' : ''}`}
                      onClick={() => {
                        setSubmitError('')
                        setSelectedProvider(provider.provider)
                      }}
                      disabled={!provider.configured}
                    >
                      <div className="assistant-provider-head">
                        <strong>{provider.label}</strong>
                        <span className={`status-pill status-pill-${tone}`}>
                          {provider.enabled ? 'Ready' : provider.configured ? 'Disabled' : 'Needs key'}
                        </span>
                      </div>
                      <p>{provider.default_model}</p>
                      <small>{provider.configured ? provider.base_url : `Set ${provider.setup_env_var} on the API`}</small>
                    </button>
                  )
                })}
              </div>

              <div className="assistant-agent-grid">
                <button
                  type="button"
                  className={`assistant-agent-card ${selectedAgentId ? '' : 'is-selected'}`}
                  onClick={() => setSelectedAgentId('')}
                >
                  <div className="assistant-provider-head">
                    <strong>Platform Foundation</strong>
                    <span className="status-pill status-pill-active">Default</span>
                  </div>
                  <p>Use the shared org, user, data, and world context without a named agent override.</p>
                  <small>Good for general operator questions and prompt review.</small>
                </button>

                {agents.map((agent) => (
                  <button
                    key={agent.agent_id}
                    type="button"
                    className={`assistant-agent-card ${selectedAgentId === agent.agent_id ? 'is-selected' : ''}`}
                    onClick={() => setSelectedAgentId(agent.agent_id)}
                  >
                    <div className="assistant-provider-head">
                      <strong>{agent.name}</strong>
                      <span className="status-pill status-pill-active">{agent.scope}</span>
                    </div>
                    <p>{agent.description}</p>
                    <small>
                      {agent.provider ?? 'inherits provider'} {agent.model ? `· ${agent.model}` : ''}{' '}
                      {agent.allowed_tools.length > 0 ? `· ${agent.allowed_tools.length} live tools` : ''}
                    </small>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state assistant-empty-state">
              <strong>Assistant runtime unavailable</strong>
              <p>{runtimeError || 'The API did not return assistant runtime settings.'}</p>
            </div>
          )}
        </article>

        <article className="surface assistant-chat-shell">
          <div className="section-head">
            <div>
              <span className="eyebrow">Conversation</span>
              <h3>Grounded Prompt Console</h3>
            </div>
            <p>
              The sidebar preview comes from the server, so the prompt you inspect here is the same
              one used for the next request.
            </p>
          </div>

          <div className="assistant-chat-log">
            {messages.length === 0 ? (
              <div className="empty-state assistant-empty-state">
                <strong>No conversation yet</strong>
                <p>
                  Choose a provider and optional agent, review the prompt preview, and send a first
                  request when you are ready.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`assistant-message assistant-message-${message.role}`}
                >
                  <div className="assistant-message-head">
                    <strong>{message.role === 'assistant' ? 'Assistant' : 'You'}</strong>
                    {message.provider && message.model ? (
                      <span>{message.provider} · {message.model}</span>
                    ) : null}
                  </div>
                  <p>{message.content}</p>
                  {message.usage ? (
                    <div className="assistant-message-meta">
                      <span>Input tokens: {message.usage.input_tokens ?? 'n/a'}</span>
                      <span>Output tokens: {message.usage.output_tokens ?? 'n/a'}</span>
                      {message.runId ? <span>Run #{message.runId}</span> : null}
                    </div>
                  ) : null}
                  {!message.usage && message.runId ? (
                    <div className="assistant-message-meta">
                      <span>Run #{message.runId}</span>
                    </div>
                  ) : null}
                  {message.toolCalls && message.toolCalls.length > 0 ? (
                    <div className="assistant-tool-list">
                      {message.toolCalls.map((toolCall, index) => (
                        <article
                          key={`${message.id}-${toolCall.tool_name}-${index}`}
                          className="assistant-tool-card"
                        >
                          <div className="assistant-tool-head">
                            <strong>{toolCall.tool_name}</strong>
                            <span>
                              {toolCall.record_count === null
                                ? 'Record count: n/a'
                                : `Record count: ${toolCall.record_count}`}
                            </span>
                          </div>
                          <p>{toolCall.summary}</p>
                          {Object.keys(toolCall.arguments).length > 0 ? (
                            <code>{JSON.stringify(toolCall.arguments)}</code>
                          ) : null}
                        </article>
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

          <form className="assistant-composer" onSubmit={handleSubmit}>
            <div className="assistant-composer-toolbar assistant-composer-toolbar-agents">
              <label className="field">
                <span>Provider</span>
                <select
                  className="control"
                  value={selectedProvider}
                  onChange={(event) => {
                    setSubmitError('')
                    setSelectedProvider(event.target.value as AssistantProvider)
                  }}
                >
                  <option value="" disabled>
                    Select provider
                  </option>
                  {runtimeSettings?.providers.map((provider) => (
                    <option
                      key={provider.provider}
                      value={provider.provider}
                      disabled={!provider.configured}
                    >
                      {provider.label} {provider.configured ? '' : '(configure key first)'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Agent</span>
                <select
                  className="control"
                  value={selectedAgentId}
                  onChange={(event) => setSelectedAgentId(event.target.value)}
                >
                  <option value="">Platform foundation</option>
                  {agents.map((agent) => (
                    <option key={agent.agent_id} value={agent.agent_id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="assistant-toggle">
                <input
                  type="checkbox"
                  checked={includeContext}
                  onChange={(event) => setIncludeContext(event.target.checked)}
                />
                <span>Include current application context</span>
              </label>
            </div>

            <div className="assistant-composer-toolbar assistant-composer-toolbar-agents">
              <div className="assistant-sidebar-block">
                <strong>Prompt preview</strong>
                <small>
                  {previewLoading
                    ? 'Refreshing the server-built prompt preview.'
                    : promptPreview
                      ? `Using ${promptPreview.provider} · ${promptPreview.model}.`
                      : previewError || 'Prompt preview is unavailable until the runtime is ready.'}
                </small>
              </div>

              <div className="assistant-sidebar-block">
                <strong>Selected agent</strong>
                <small>{selectedAgent ? selectedAgent.description : 'Platform foundation with no named agent override.'}</small>
              </div>

              <label className="assistant-toggle">
                <input
                  type="checkbox"
                  checked={useLiveTools}
                  onChange={(event) => setUseLiveTools(event.target.checked)}
                />
                <span>Allow live tools</span>
              </label>
            </div>

            <label className="field">
              <span>Prompt</span>
              <textarea
                className="control assistant-textarea"
                value={draft}
                onChange={(event) => {
                  setSubmitError('')
                  setDraft(event.target.value)
                }}
                placeholder="Explain the selected trade, summarize recent activity, or compare how two agent profiles would handle this workflow."
              />
            </label>

            <div className="toolbar settings-actions">
              <button
                type="submit"
                className="button button-primary"
                disabled={!assistantReady || !draft.trim() || submitting}
              >
                {submitting ? 'Sending...' : 'Send Prompt'}
              </button>
              <button type="button" className="button button-ghost" onClick={onOpenSettings}>
                Open Settings
              </button>
            </div>

            <p className={`form-note ${submitError ? 'form-note-error' : ''}`}>
              {submitError
                ? submitError
                : !authSession
                  ? 'Sign in first. Prompt preview and assistant requests are protected.'
                  : !runtimeSettings?.enabled
                    ? 'No configured provider is currently ready on the API.'
                    : selectedProviderDetails
                      ? `Using ${selectedProviderDetails.label} with ${useLiveTools ? 'live tools enabled' : 'live tools disabled'}.`
                      : 'Select a provider to begin.'}
            </p>
          </form>
        </article>
      </section>

      <aside className="surface assistant-sidebar">
        <div className="section-head">
          <div>
            <span className="eyebrow">Prompt Preview</span>
            <h3>Server Grounding</h3>
          </div>
          <p>
            This preview is generated by the backend using the authenticated user, business context,
            live inventory, and optional managed agent profile.
          </p>
        </div>

        <div className="assistant-sidebar-block">
          <strong>Current mode</strong>
          <p>
            {includeContext
              ? 'App context is attached to the prompt preview.'
              : 'Only server-owned org and user context is attached to the prompt preview.'}
          </p>
          <small>{useLiveTools ? 'Live tools are enabled for the next request.' : 'Live tools are disabled for the next request.'}</small>
        </div>

        <div className="assistant-sidebar-block">
          <strong>Published tools</strong>
          <p>
            {runtimeSettings?.available_tools.length
              ? runtimeSettings.available_tools.map((tool) => tool.name).join(' · ')
              : 'No tools published'}
          </p>
        </div>

        <div className="assistant-sidebar-block">
          <strong>Prompt status</strong>
          <p>
            {previewLoading
              ? 'Refreshing preview...'
              : previewError
                ? previewError
                : promptPreview
                  ? `${promptPreview.sections.length} sections are currently grounding the prompt.`
                  : 'Preview not available'}
          </p>
        </div>

        <div className="assistant-context-preview">
          <pre>{previewText}</pre>
        </div>

        <div className="assistant-sidebar-block">
          <strong>Local context snapshot</strong>
          <small>This is the client-side context summary that can be attached to the request.</small>
        </div>

        <div className="assistant-context-preview">
          <pre>{contextSummary}</pre>
        </div>
      </aside>
    </div>
  )
}
