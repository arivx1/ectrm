import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

import {
  approveAssistantActionRequest,
  getAssistantConversation,
  getAssistantRun,
  rejectAssistantActionRequest,
  listAssistantActionRequests,
  listAssistantAgents,
  listAssistantConversations,
  listAssistantRuns,
  loadAssistantRuntimeSettings,
  previewAssistantPromptContext,
  streamAssistantResponse,
} from '../../entities/assistant/api'
import { AssistantActionRequestList } from '../../entities/assistant/AssistantActionRequestList'
import {
  assistantBudgetSignalClass,
  assistantBudgetSignalLabel,
  budgetMeterWidth,
  describeAssistantTokenBudget,
  formatBudgetPercent,
  formatTokenCount,
  isAgentBudgetDepleted,
  isAgentBudgetNearLimit,
} from '../../entities/assistant/budget'
import { appConfig } from '../../shared/config'
import { combineTextFilters, matchesTextFilter } from '../../shared/filtering'
import type {
  AssistantActionRequest,
  AssistantAgent,
  AssistantConversation,
  AssistantConversationSummary,
  AssistantPromptContext,
  AssistantPromptRequest,
  AssistantProvider,
  AssistantRun,
  AssistantRunSummary,
  AssistantRuntimeSettings,
  EventRow,
  PositionRow,
  Trade,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import { WorkspaceLocalFilterBar } from '../../shared/ui/WorkspaceLocalFilterBar'

type AssistantWorkspaceProps = {
  authSession: StoredAuthSession | null
  globalFilter: string
  health: string
  trades: Trade[]
  events: EventRow[]
  positions: PositionRow[]
  selectedTrade: Trade | null
  selectedTradeEvents: EventRow[]
  onOpenSettings: () => void
  onRefreshData: () => Promise<void>
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
  actionRequests?: AssistantActionRequest[]
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
}: Omit<AssistantWorkspaceProps, 'authSession' | 'globalFilter' | 'onOpenSettings' | 'onRefreshData'>): string {
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
    lines.push(`- instrument_type: ${selectedTrade.instrument_type}`)
    lines.push(`- trade_nature: ${selectedTrade.trade_nature}`)
    lines.push(`- trade_structure: ${selectedTrade.trade_structure}`)
    lines.push(`- book: ${selectedTrade.book}`)
    lines.push(`- commodity: ${selectedTrade.commodity}`)
    lines.push(`- counterparty: ${selectedTrade.counterparty ?? 'n/a'}`)
    lines.push(`- pricing_type: ${selectedTrade.pricing_type}`)
    if (selectedTrade.option_type) {
      lines.push(`- option_type: ${selectedTrade.option_type}`)
    }
    if (selectedTrade.option_style) {
      lines.push(`- option_style: ${selectedTrade.option_style}`)
    }
    if (selectedTrade.option_expiration_date) {
      lines.push(`- option_expiration_date: ${selectedTrade.option_expiration_date}`)
    }
    if (selectedTrade.option_strike_price !== null) {
      lines.push(`- option_strike_price: ${selectedTrade.option_strike_price}`)
    }
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

function formatTraceTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'n/a'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

function matchesAssistantMessageFilter(message: ChatMessage, query: string): boolean {
  return matchesTextFilter(query, [
    message.role,
    message.content,
    message.provider,
    message.model,
    message.runId,
    message.runRecordedAt,
    ...(message.warnings ?? []),
    ...(message.toolCalls?.flatMap((toolCall) => [toolCall.tool_name, toolCall.summary]) ?? []),
    ...(message.actionRequests?.flatMap((actionRequest) => [
      actionRequest.action_request_id,
      actionRequest.status,
      actionRequest.summary,
      actionRequest.description,
    ]) ?? []),
  ])
}

function matchesAssistantConversationFilter(conversation: AssistantConversationSummary, query: string): boolean {
  return matchesTextFilter(query, [
    conversation.conversation_id,
    conversation.title,
    conversation.workspace,
    conversation.agent_id,
    conversation.agent_name,
    conversation.provider,
    conversation.model,
    conversation.run_count,
    conversation.latest_run_id,
    conversation.latest_user_message,
    conversation.latest_assistant_message,
    conversation.updated_at,
  ])
}

function matchesAssistantActionRequestFilter(actionRequest: AssistantActionRequest, query: string): boolean {
  return matchesTextFilter(query, [
    actionRequest.action_request_id,
    actionRequest.run_id,
    actionRequest.workspace,
    actionRequest.agent_id,
    actionRequest.agent_name,
    actionRequest.action_type,
    actionRequest.status,
    actionRequest.summary,
    actionRequest.description,
    actionRequest.user_id,
    actionRequest.error_detail,
    actionRequest.created_at,
    actionRequest.decided_at,
    actionRequest.decided_by,
  ])
}

function matchesAssistantRunFilter(run: AssistantRunSummary, query: string): boolean {
  return matchesTextFilter(query, [
    run.conversation_id,
    run.run_id,
    run.status,
    run.workspace,
    run.agent_id,
    run.agent_name,
    run.provider,
    run.model,
    run.use_live_tools,
    run.warning_count,
    run.tool_call_count,
    run.latest_user_message,
    run.assistant_message,
    run.error_detail,
    run.created_at,
    run.completed_at,
  ])
}

function summarizeRunCard(run: AssistantRunSummary): string {
  const pieces = [run.provider, run.model]
  if (run.agent_name) {
    pieces.push(run.agent_name)
  }
  return pieces.join(' · ')
}

function summarizeConversationCard(conversation: AssistantConversationSummary): string {
  const pieces = [conversation.provider, conversation.model]
  if (conversation.agent_name) {
    pieces.push(conversation.agent_name)
  }
  return pieces.join(' · ')
}

function budgetCardToneClass(budgetClass: string): string {
  if (budgetClass === 'is-red') {
    return 'is-budget-red'
  }
  if (budgetClass === 'is-amber') {
    return 'is-budget-amber'
  }
  if (budgetClass === 'is-green') {
    return 'is-budget-green'
  }
  return 'is-budget-pending'
}

function toChatMessagesFromConversation(conversation: AssistantConversation): ChatMessage[] {
  return conversation.messages.map((message) => ({
    id: createChatMessageId(),
    role: message.role,
    content: message.content,
    provider: message.provider ?? undefined,
    model: message.model ?? undefined,
    runId: message.run_id ?? undefined,
    runRecordedAt: message.recorded_at,
    warnings: message.warnings,
    toolCalls: message.tool_calls,
  }))
}

export function AssistantWorkspace({
  authSession,
  globalFilter,
  health,
  trades,
  events,
  positions,
  selectedTrade,
  selectedTradeEvents,
  onOpenSettings,
  onRefreshData,
}: AssistantWorkspaceProps) {
  const [runtimeSettings, setRuntimeSettings] = useState<AssistantRuntimeSettings | null>(null)
  const [agents, setAgents] = useState<AssistantAgent[]>([])
  const [runtimeLoading, setRuntimeLoading] = useState(true)
  const [runtimeError, setRuntimeError] = useState('')
  const [agentBudgetRefreshing, setAgentBudgetRefreshing] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<AssistantProvider | ''>('')
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [includeContext, setIncludeContext] = useState(true)
  const [useLiveTools, setUseLiveTools] = useState(true)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [actionRequestIdsInFlight, setActionRequestIdsInFlight] = useState<number[]>([])
  const [promptPreview, setPromptPreview] = useState<AssistantPromptContext | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [recentConversations, setRecentConversations] = useState<AssistantConversationSummary[]>([])
  const [conversationHistoryLoading, setConversationHistoryLoading] = useState(false)
  const [conversationHistoryError, setConversationHistoryError] = useState('')
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<AssistantConversation | null>(null)
  const [conversationDetailLoading, setConversationDetailLoading] = useState(false)
  const [conversationDetailError, setConversationDetailError] = useState('')
  const [pendingActionRequests, setPendingActionRequests] = useState<AssistantActionRequest[]>([])
  const [pendingActionRequestsLoading, setPendingActionRequestsLoading] = useState(false)
  const [pendingActionRequestsError, setPendingActionRequestsError] = useState('')
  const [recentRuns, setRecentRuns] = useState<AssistantRunSummary[]>([])
  const [runHistoryLoading, setRunHistoryLoading] = useState(false)
  const [runHistoryError, setRunHistoryError] = useState('')
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [selectedRun, setSelectedRun] = useState<AssistantRun | null>(null)
  const [runDetailLoading, setRunDetailLoading] = useState(false)
  const [runDetailError, setRunDetailError] = useState('')
  const [screenFilter, setScreenFilter] = useState('')
  const effectiveScreenFilter = combineTextFilters(globalFilter, screenFilter)

  const contextSummary = buildAssistantContext({
    health,
    trades,
    events,
    positions,
    selectedTrade,
    selectedTradeEvents,
  })
  const hasScreenFilter = effectiveScreenFilter.trim().length > 0
  const visibleMessages = useMemo(
    () => messages.filter((message) => matchesAssistantMessageFilter(message, effectiveScreenFilter)),
    [effectiveScreenFilter, messages],
  )
  const visibleRecentConversations = useMemo(
    () =>
      recentConversations.filter((conversation) => matchesAssistantConversationFilter(conversation, effectiveScreenFilter)),
    [effectiveScreenFilter, recentConversations],
  )
  const visiblePendingActionRequests = useMemo(
    () =>
      pendingActionRequests.filter((actionRequest) =>
        matchesAssistantActionRequestFilter(actionRequest, effectiveScreenFilter),
      ),
    [effectiveScreenFilter, pendingActionRequests],
  )
  const visibleRecentRuns = useMemo(
    () => recentRuns.filter((run) => matchesAssistantRunFilter(run, effectiveScreenFilter)),
    [effectiveScreenFilter, recentRuns],
  )

  function clearConversationSelection() {
    setSelectedConversationId(null)
    setSelectedConversation(null)
    setConversationDetailError('')
    setConversationDetailLoading(false)
    setMessages([])
    setSubmitError('')
  }

  const refreshConversationHistory = useCallback(
    async (preferredConversationId: number | null = null) => {
      if (!authSession) {
        setRecentConversations([])
        setConversationHistoryError('')
        setConversationHistoryLoading(false)
        setSelectedConversationId(null)
        setSelectedConversation(null)
        setConversationDetailError('')
        setConversationDetailLoading(false)
        return
      }

      setConversationHistoryLoading(true)

      try {
        const conversationPayload = await listAssistantConversations(appConfig.apiBase, {
          accessToken: authSession.accessToken,
          limit: 12,
        })
        setRecentConversations(conversationPayload)
        setConversationHistoryError('')
        setSelectedConversationId((current) => {
          if (
            preferredConversationId &&
            conversationPayload.some(
              (conversation) => conversation.conversation_id === preferredConversationId,
            )
          ) {
            return preferredConversationId
          }
          if (current && conversationPayload.some((conversation) => conversation.conversation_id === current)) {
            return current
          }
          return null
        })
      } catch (error) {
        setRecentConversations([])
        setConversationHistoryError(
          error instanceof Error ? error.message : 'Could not load assistant conversations.',
        )
      } finally {
        setConversationHistoryLoading(false)
      }
    },
    [authSession],
  )

  const refreshRunHistory = useCallback(
    async (preferredRunId: number | null = null) => {
      if (!authSession) {
        setRecentRuns([])
        setRunHistoryError('')
        setRunHistoryLoading(false)
        setSelectedRunId(null)
        return
      }

      setRunHistoryLoading(true)

      try {
        const runPayload = await listAssistantRuns(appConfig.apiBase, {
          accessToken: authSession.accessToken,
          limit: 12,
        })
        setRecentRuns(runPayload)
        setRunHistoryError('')
        setSelectedRunId((current) => {
          if (preferredRunId && runPayload.some((run) => run.run_id === preferredRunId)) {
            return preferredRunId
          }
          if (current && runPayload.some((run) => run.run_id === current)) {
            return current
          }
          return null
        })
      } catch (error) {
        setRecentRuns([])
        setRunHistoryError(error instanceof Error ? error.message : 'Could not load assistant runs.')
      } finally {
        setRunHistoryLoading(false)
      }
    },
    [authSession],
  )

  const refreshPendingActionRequests = useCallback(async () => {
    if (!authSession) {
      setPendingActionRequests([])
      setPendingActionRequestsError('')
      setPendingActionRequestsLoading(false)
      return
    }

    setPendingActionRequestsLoading(true)

    try {
      const actionRequestPayload = await listAssistantActionRequests(appConfig.apiBase, {
        accessToken: authSession.accessToken,
        status: 'PENDING',
        limit: 12,
      })
      setPendingActionRequests(actionRequestPayload)
      setPendingActionRequestsError('')
    } catch (error) {
      setPendingActionRequests([])
      setPendingActionRequestsError(
        error instanceof Error ? error.message : 'Could not load pending assistant approvals.',
      )
    } finally {
      setPendingActionRequestsLoading(false)
    }
  }, [authSession])

  const refreshAssistantAgents = useCallback(
    async (options?: { quiet?: boolean }): Promise<boolean> => {
      try {
        const agentPayload = await listAssistantAgents(appConfig.apiBase)
        setAgents(agentPayload)
        if (!options?.quiet) {
          setRuntimeError('')
        }
        return true
      } catch (error) {
        if (!options?.quiet) {
          setAgents([])
          setRuntimeError(error instanceof Error ? error.message : 'Could not load assistant agents.')
        }
        return false
      }
    },
    [],
  )

  async function handleRefreshAgentBudgets() {
    setAgentBudgetRefreshing(true)
    setSubmitError('')
    try {
      const refreshed = await refreshAssistantAgents({ quiet: true })
      if (!refreshed) {
        setSubmitError('Could not refresh agent token budgets.')
      }
    } finally {
      setAgentBudgetRefreshing(false)
    }
  }

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
    if (!authSession) {
      setRecentConversations([])
      setConversationHistoryError('')
      setConversationHistoryLoading(false)
      setSelectedConversationId(null)
      setSelectedConversation(null)
      setConversationDetailError('')
      setConversationDetailLoading(false)
      setMessages([])
      setPendingActionRequests([])
      setPendingActionRequestsError('')
      setPendingActionRequestsLoading(false)
      setRecentRuns([])
      setRunHistoryError('')
      setRunHistoryLoading(false)
      setSelectedRunId(null)
      setSelectedRun(null)
      setRunDetailError('')
      setRunDetailLoading(false)
      return
    }

    void refreshConversationHistory()
    void refreshPendingActionRequests()
    void refreshRunHistory()
  }, [authSession, refreshConversationHistory, refreshPendingActionRequests, refreshRunHistory])

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

    async function loadSelectedConversation() {
      if (!authSession || selectedConversationId === null || submitting) {
        if (!selectedConversationId) {
          setSelectedConversation(null)
          setConversationDetailError('')
          setConversationDetailLoading(false)
        }
        return
      }

      setConversationDetailLoading(true)

      try {
        const conversationPayload = await getAssistantConversation(
          appConfig.apiBase,
          selectedConversationId,
          {
            accessToken: authSession.accessToken,
          },
        )

        if (!cancelled) {
          setSelectedConversation(conversationPayload)
          setMessages(toChatMessagesFromConversation(conversationPayload))
          setSelectedProvider(conversationPayload.provider)
          setSelectedAgentId(conversationPayload.agent_id ?? '')
          setUseLiveTools(conversationPayload.use_live_tools)
          setConversationDetailError('')
        }
      } catch (error) {
        if (!cancelled) {
          setSelectedConversation(null)
          setMessages([])
          setConversationDetailError(
            error instanceof Error ? error.message : 'Could not load assistant conversation.',
          )
        }
      } finally {
        if (!cancelled) {
          setConversationDetailLoading(false)
        }
      }
    }

    void loadSelectedConversation()

    return () => {
      cancelled = true
    }
  }, [authSession, selectedConversationId, submitting])

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
            accessToken: authSession.accessToken,
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

  useEffect(() => {
    let cancelled = false

    async function loadSelectedRun() {
      if (!authSession || selectedRunId === null) {
        setSelectedRun(null)
        setRunDetailError('')
        setRunDetailLoading(false)
        return
      }

      setRunDetailLoading(true)

      try {
        const runPayload = await getAssistantRun(appConfig.apiBase, selectedRunId, {
          accessToken: authSession.accessToken,
        })

        if (!cancelled) {
          setSelectedRun(runPayload)
          setRunDetailError('')
        }
      } catch (error) {
        if (!cancelled) {
          setSelectedRun(null)
          setRunDetailError(error instanceof Error ? error.message : 'Could not load assistant run.')
        }
      } finally {
        if (!cancelled) {
          setRunDetailLoading(false)
        }
      }
    }

    void loadSelectedRun()

    return () => {
      cancelled = true
    }
  }, [authSession, selectedRunId])

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
      const assistantMessageId = createChatMessageId()
      const payload: AssistantPromptRequest = {
        conversation_id: selectedConversationId ?? undefined,
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

      await streamAssistantResponse(appConfig.apiBase, payload, {
        accessToken: authSession.accessToken,
        onEvent: (streamEvent) => {
          if (streamEvent.event === 'conversation') {
            const conversationId = Number(streamEvent.data.conversation_id)
            if (Number.isFinite(conversationId)) {
              setSelectedConversationId(conversationId)
              void refreshConversationHistory(conversationId)
            }
            return
          }

          if (streamEvent.event === 'assistant.metadata') {
            const metadata = streamEvent.data
            const usage =
              metadata.usage && typeof metadata.usage === 'object'
                ? (metadata.usage as Record<string, unknown>)
                : null
            const rawToolCalls = Array.isArray(metadata.tool_calls)
              ? metadata.tool_calls.filter(
                  (
                    toolCall,
                  ): toolCall is {
                    tool_name?: unknown
                    summary?: unknown
                    arguments?: unknown
                    record_count?: unknown
                  } => typeof toolCall === 'object' && toolCall !== null,
                )
              : []
            const runId =
              typeof metadata.run_id === 'number'
                ? metadata.run_id
                : typeof metadata.run_id === 'string'
                  ? Number.parseInt(metadata.run_id, 10)
                  : null
            const conversationId =
              typeof metadata.conversation_id === 'number'
                ? metadata.conversation_id
                : typeof metadata.conversation_id === 'string'
                  ? Number.parseInt(metadata.conversation_id, 10)
                  : null

            if (typeof metadata.provider === 'string') {
              setSelectedProvider(metadata.provider as AssistantProvider)
            }
            if (conversationId && Number.isFinite(conversationId)) {
              setSelectedConversationId(conversationId)
              void refreshConversationHistory(conversationId)
            }
            if (runId && Number.isFinite(runId)) {
              setSelectedRunId(runId)
              void refreshRunHistory(runId)
            }

            setMessages((currentMessages) => [
              ...currentMessages,
              {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                provider:
                  typeof metadata.provider === 'string'
                    ? (metadata.provider as AssistantProvider)
                    : undefined,
                model: typeof metadata.model === 'string' ? metadata.model : undefined,
                runId: runId && Number.isFinite(runId) ? runId : undefined,
                runRecordedAt:
                  typeof metadata.run_recorded_at === 'string' ? metadata.run_recorded_at : undefined,
                usage: usage
                  ? {
                      input_tokens:
                        typeof usage.input_tokens === 'number' ? usage.input_tokens : null,
                      output_tokens:
                        typeof usage.output_tokens === 'number' ? usage.output_tokens : null,
                    }
                  : undefined,
                warnings: Array.isArray(metadata.warnings)
                  ? metadata.warnings.filter((warning): warning is string => typeof warning === 'string')
                  : [],
                toolCalls: rawToolCalls.map((toolCall) => ({
                  tool_name: typeof toolCall.tool_name === 'string' ? toolCall.tool_name : 'tool',
                  summary: typeof toolCall.summary === 'string' ? toolCall.summary : '',
                  arguments:
                    toolCall.arguments && typeof toolCall.arguments === 'object'
                      ? (toolCall.arguments as Record<string, unknown>)
                      : {},
                  record_count:
                    typeof toolCall.record_count === 'number' ? toolCall.record_count : null,
                })),
                actionRequests: Array.isArray(metadata.action_requests)
                  ? metadata.action_requests.filter(
                      (actionRequest): actionRequest is AssistantActionRequest =>
                        typeof actionRequest === 'object' && actionRequest !== null,
                    )
                  : [],
              },
            ])
            return
          }

          if (streamEvent.event === 'assistant.delta') {
            const delta = typeof streamEvent.data.delta === 'string' ? streamEvent.data.delta : ''
            if (!delta) {
              return
            }
            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: `${message.content}${delta}`,
                    }
                  : message,
              ),
            )
            return
          }

          if (streamEvent.event === 'assistant.complete') {
            const completed = streamEvent.data
            const conversationId =
              typeof completed.conversation_id === 'number'
                ? completed.conversation_id
                : typeof completed.conversation_id === 'string'
                  ? Number.parseInt(completed.conversation_id, 10)
                  : null
            const runId =
              typeof completed.run_id === 'number'
                ? completed.run_id
                : typeof completed.run_id === 'string'
                  ? Number.parseInt(completed.run_id, 10)
                  : null

            if (conversationId && Number.isFinite(conversationId)) {
              setSelectedConversationId(conversationId)
              void refreshConversationHistory(conversationId)
            }
            if (runId && Number.isFinite(runId)) {
              setSelectedRunId(runId)
              void refreshRunHistory(runId)
            }
            if (Array.isArray(completed.action_requests) && completed.action_requests.length > 0) {
              void refreshPendingActionRequests()
            }
            void refreshAssistantAgents({ quiet: true })
            return
          }

          if (streamEvent.event === 'error') {
            const detail =
              typeof streamEvent.data.detail === 'string'
                ? streamEvent.data.detail
                : 'Assistant stream failed.'
            throw new Error(detail)
          }
        },
      })
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Assistant request failed.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleActionRequestDecision(
    actionRequestId: number,
    decision: 'approve' | 'reject',
  ) {
    setSubmitError('')
    setActionRequestIdsInFlight((current) => [...current, actionRequestId])

    try {
      const updatedActionRequest =
        decision === 'approve'
          ? await approveAssistantActionRequest(appConfig.apiBase, actionRequestId)
          : await rejectAssistantActionRequest(appConfig.apiBase, actionRequestId)

      setMessages((currentMessages) =>
        currentMessages.map((message) => {
          if (!message.actionRequests?.some((actionRequest) => actionRequest.action_request_id === actionRequestId)) {
            return message
          }

          return {
            ...message,
            actionRequests: message.actionRequests.map((actionRequest) =>
              actionRequest.action_request_id === actionRequestId ? updatedActionRequest : actionRequest,
            ),
          }
        }),
      )

      if (updatedActionRequest.status === 'EXECUTED') {
        await onRefreshData()
      }
      await refreshPendingActionRequests()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Assistant action request failed.')
    } finally {
      setActionRequestIdsInFlight((current) =>
        current.filter((currentActionRequestId) => currentActionRequestId !== actionRequestId),
      )
    }
  }

  const selectedProviderDetails =
    runtimeSettings?.providers.find((provider) => provider.provider === selectedProvider) ?? null
  const selectedAgent = agents.find((agent) => agent.agent_id === selectedAgentId) ?? null
  const selectedAgentBudgetDepleted = isAgentBudgetDepleted(selectedAgent)
  const depletedAgentCount = agents.filter((agent) => isAgentBudgetDepleted(agent)).length
  const watchAgentCount = agents.filter((agent) => isAgentBudgetNearLimit(agent)).length
  const selectedConversationSummary =
    recentConversations.find((conversation) => conversation.conversation_id === selectedConversationId) ?? null
  const selectedRunSummary = recentRuns.find((run) => run.run_id === selectedRunId) ?? null
  const assistantArtifactTotalCount =
    messages.length + recentConversations.length + pendingActionRequests.length + recentRuns.length
  const assistantArtifactMatchedCount =
    visibleMessages.length +
    visibleRecentConversations.length +
    visiblePendingActionRequests.length +
    visibleRecentRuns.length
  const selectedConversationHiddenByFilter =
    hasScreenFilter &&
    selectedConversationSummary !== null &&
    !visibleRecentConversations.some(
      (conversation) => conversation.conversation_id === selectedConversationSummary.conversation_id,
    ) &&
    visibleMessages.length === 0
  const selectedConversationHasNoMessages =
    selectedConversationId !== null &&
    !conversationDetailLoading &&
    !conversationDetailError &&
    messages.length === 0
  const selectedRunHiddenByFilter =
    hasScreenFilter &&
    selectedRunSummary !== null &&
    !visibleRecentRuns.some((run) => run.run_id === selectedRunSummary.run_id)
  const assistantReady = Boolean(
    runtimeSettings?.enabled &&
      authSession &&
      selectedProviderDetails?.enabled &&
      !selectedAgentBudgetDepleted,
  )
  const previewText = renderPromptPreview(promptPreview)
  const activeConversationTitle =
    selectedConversation?.title ?? selectedConversationSummary?.title ?? 'New chat draft'
  const activeConversationStatus = selectedConversation
    ? `Continuing conversation #${selectedConversation.conversation_id}. Last updated ${formatTraceTimestamp(selectedConversation.updated_at)}.`
    : selectedConversationSummary
      ? `Conversation #${selectedConversationSummary.conversation_id} is selected. Last updated ${formatTraceTimestamp(selectedConversationSummary.updated_at)}.`
      : messages.length > 0
        ? 'No saved thread is selected. Sending now will create a brand-new chat.'
        : 'Choose a saved chat from the sidebar or send a first prompt to start a new one.'
  const assistantReadinessNote = !authSession
    ? 'Sign in first. Prompt preview and assistant requests are protected.'
    : !runtimeSettings?.enabled
      ? 'No configured provider is currently ready on the API.'
      : selectedAgentBudgetDepleted && selectedAgent
        ? `${selectedAgent.name} is in the red. No token allocation remains for this agent today.`
        : selectedProviderDetails
          ? `Using ${selectedProviderDetails.label} with ${useLiveTools ? 'live tools enabled' : 'live tools disabled'}.`
          : 'Select a provider to begin.'
  const assistantFilterNote = selectedConversationHiddenByFilter
    ? 'The active chat stays open even when it falls outside the current assistant filters.'
    : selectedRunHiddenByFilter
      ? 'The selected run trace stays open even when it falls outside the current assistant filters.'
      : undefined

  return (
    <div className="stack">
      <WorkspaceLocalFilterBar
        value={screenFilter}
        onChange={setScreenFilter}
        placeholder="Message text, chat title, approval summary, run ID, provider, or model"
        description="Keep assistant filtering local to this screen so you can search messages, saved chats, pending approvals, and run traces without changing anything else in the app."
        totalCount={assistantArtifactTotalCount}
        matchedCount={assistantArtifactMatchedCount}
        resultLabel="assistant artifacts"
        globalValue={globalFilter}
        note={assistantFilterNote}
      />

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
                  <span>Token budget</span>
                  <strong>
                    {depletedAgentCount > 0
                      ? `${depletedAgentCount} red`
                      : watchAgentCount > 0
                        ? `${watchAgentCount} watch`
                        : 'Green'}
                  </strong>
                  <p>
                    {selectedAgent
                      ? describeAssistantTokenBudget(selectedAgent.token_budget)
                      : agents.length > 0
                        ? 'Select a managed agent to inspect its daily token allocation.'
                        : 'Managed agent budgets will appear after active agents are published.'}
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

                {agents.map((agent) => {
                  const budgetClass = assistantBudgetSignalClass(agent.token_budget)
                  return (
                    <button
                      key={agent.agent_id}
                      type="button"
                      className={[
                        'assistant-agent-card',
                        selectedAgentId === agent.agent_id ? 'is-selected' : '',
                        budgetCardToneClass(budgetClass),
                      ].join(' ')}
                      onClick={() => setSelectedAgentId(agent.agent_id)}
                    >
                      <div className="assistant-provider-head">
                        <strong>{agent.name}</strong>
                        <span className={`assistant-budget-signal ${budgetClass}`}>
                          {assistantBudgetSignalLabel(agent.token_budget)}
                        </span>
                      </div>
                      <p>{agent.description}</p>
                      <div className="assistant-agent-budget-row">
                        <span>{agent.scope}</span>
                        <span>{formatBudgetPercent(agent.token_budget)} used</span>
                      </div>
                      <div className={`assistant-budget-meter ${budgetClass}`} aria-hidden="true">
                        <span style={{ width: budgetMeterWidth(agent.token_budget) }} />
                      </div>
                      <small>{describeAssistantTokenBudget(agent.token_budget)}</small>
                      <small>
                        {agent.provider ?? 'inherits provider'} {agent.model ? `· ${agent.model}` : ''}{' '}
                        {agent.allowed_tools.length > 0 ? `· ${agent.allowed_tools.length} live tools` : ''}
                        {agent.allowed_action_types.length > 0 ? ` · ${agent.allowed_action_types.length} actions` : ''}
                      </small>
                    </button>
                  )
                })}
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

          <div className="assistant-conversation-banner">
            <div className="assistant-sidebar-block">
              <strong>{activeConversationTitle}</strong>
              <small>{activeConversationStatus}</small>
            </div>
            {selectedConversationId !== null || messages.length > 0 ? (
              <button
                type="button"
                className="button button-ghost"
                onClick={clearConversationSelection}
                disabled={submitting}
              >
                {selectedConversationId !== null ? 'Leave chat' : 'Clear draft'}
              </button>
            ) : null}
          </div>

          <div className="assistant-chat-log">
            {visibleMessages.length === 0 ? (
              <div className="empty-state assistant-empty-state">
                <strong>
                  {messages.length > 0 && hasScreenFilter
                    ? 'No chat messages match the filter'
                    : selectedConversationHasNoMessages
                      ? 'This chat has no recorded messages yet'
                      : 'No chat selected'}
                </strong>
                <p>
                  {messages.length > 0 && hasScreenFilter
                    ? 'Broaden the local search to bring the current chat transcript back into view.'
                    : selectedConversationHasNoMessages
                      ? 'This saved conversation exists, but no user or assistant messages were recorded in it.'
                      : 'Reopen a stored conversation from the sidebar or send a first request here to begin a separate chat.'}
                </p>
              </div>
            ) : (
              visibleMessages.map((message) => (
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
                      <span>
                        Input tokens:{' '}
                        {message.usage.input_tokens !== null
                          ? formatTokenCount(message.usage.input_tokens)
                          : 'n/a'}
                      </span>
                      <span>
                        Output tokens:{' '}
                        {message.usage.output_tokens !== null
                          ? formatTokenCount(message.usage.output_tokens)
                          : 'n/a'}
                      </span>
                      {message.runId ? <span>Run #{message.runId}</span> : null}
                      {message.runId ? (
                        <button
                          type="button"
                          className={`assistant-run-link ${selectedRunId === message.runId ? 'is-selected' : ''}`}
                          onClick={() => setSelectedRunId(message.runId ?? null)}
                        >
                          {selectedRunId === message.runId ? 'Viewing trace' : 'Open trace'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {!message.usage && message.runId ? (
                    <div className="assistant-message-meta">
                      <span>Run #{message.runId}</span>
                      <button
                        type="button"
                        className={`assistant-run-link ${selectedRunId === message.runId ? 'is-selected' : ''}`}
                        onClick={() => setSelectedRunId(message.runId ?? null)}
                      >
                        {selectedRunId === message.runId ? 'Viewing trace' : 'Open trace'}
                      </button>
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
                  {message.actionRequests && message.actionRequests.length > 0 ? (
                    <AssistantActionRequestList
                      actionRequests={message.actionRequests}
                      actionRequestIdsInFlight={actionRequestIdsInFlight}
                      formatDate={formatTraceTimestamp}
                      onDecision={handleActionRequestDecision}
                      onOpenRun={setSelectedRunId}
                    />
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

              <div className="assistant-sidebar-block">
                <div className="assistant-budget-block-head">
                  <strong>Token budget</strong>
                  {selectedAgent ? (
                    <button
                      type="button"
                      className="button button-ghost assistant-budget-refresh-button"
                      onClick={() => void handleRefreshAgentBudgets()}
                      disabled={agentBudgetRefreshing}
                    >
                      {agentBudgetRefreshing ? 'Refreshing...' : 'Refresh budget'}
                    </button>
                  ) : null}
                </div>
                <small>
                  {selectedAgent
                    ? describeAssistantTokenBudget(selectedAgent.token_budget)
                    : 'Choose a managed agent to see its daily allocation.'}
                </small>
                {selectedAgent ? (
                  <div
                    className={`assistant-budget-meter ${assistantBudgetSignalClass(selectedAgent.token_budget)}`}
                    aria-hidden="true"
                  >
                    <span style={{ width: budgetMeterWidth(selectedAgent.token_budget) }} />
                  </div>
                ) : null}
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
              {submitError || assistantReadinessNote}
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

        <div className="assistant-sidebar-block">
          <div className="assistant-provider-head">
            <strong>Chat threads</strong>
            <button
              type="button"
              className="button button-ghost"
              onClick={clearConversationSelection}
              disabled={submitting}
            >
              Start new chat
            </button>
          </div>
            <p>
              {conversationHistoryLoading
                ? 'Refreshing your recent assistant conversations.'
                : conversationHistoryError
                  ? conversationHistoryError
                : visibleRecentConversations.length > 0
                  ? `${visibleRecentConversations.length} recent conversation${visibleRecentConversations.length === 1 ? '' : 's'} are available for reload.`
                  : hasScreenFilter
                    ? 'No stored conversations match the current local filter.'
                    : 'No stored conversations yet.'}
            </p>
          {visibleRecentConversations.length > 0 ? (
            <div className="assistant-run-list">
              {visibleRecentConversations.map((conversation) => (
                <button
                  key={conversation.conversation_id}
                  type="button"
                  className={`assistant-run-card ${selectedConversationId === conversation.conversation_id ? 'is-selected' : ''}`}
                  onClick={() => {
                    setSubmitError('')
                    setSelectedConversationId(conversation.conversation_id)
                  }}
                  disabled={submitting}
                >
                  <div className="assistant-provider-head">
                    <strong>{conversation.title}</strong>
                    <span className="status-pill status-pill-active">
                      {conversation.run_count} run{conversation.run_count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p>
                    {conversation.latest_user_message ??
                      conversation.latest_assistant_message ??
                      'Stored assistant conversation.'}
                  </p>
                  <small>
                    {summarizeConversationCard(conversation)} · Updated{' '}
                    {formatTraceTimestamp(conversation.updated_at)}
                  </small>
                </button>
              ))}
            </div>
          ) : null}
          <small>
            {conversationDetailLoading
              ? `Loading conversation #${selectedConversationId ?? ''}...`
              : conversationDetailError
                ? conversationDetailError
                : selectedConversation
                  ? `Inspecting conversation #${selectedConversation.conversation_id}.`
                  : selectedConversationSummary
                    ? `Conversation #${selectedConversationSummary.conversation_id} is selected.`
                    : 'No chat is active. Selecting one reopens it; otherwise your next send starts a new thread.'}
          </small>
        </div>

        <div className="assistant-sidebar-block">
          <strong>Pending approvals</strong>
            <p>
              {pendingActionRequestsLoading
                ? 'Refreshing your pending assistant approvals.'
              : pendingActionRequestsError
                ? pendingActionRequestsError
                : visiblePendingActionRequests.length > 0
                  ? `${visiblePendingActionRequests.length} pending assistant action request${visiblePendingActionRequests.length === 1 ? '' : 's'} can be reviewed outside the original chat turn.`
                  : hasScreenFilter
                    ? 'No pending assistant approvals match the current local filter.'
                    : 'No pending assistant action requests are waiting in your inbox.'}
            </p>
          <AssistantActionRequestList
            actionRequests={visiblePendingActionRequests}
            actionRequestIdsInFlight={actionRequestIdsInFlight}
            formatDate={formatTraceTimestamp}
            onDecision={handleActionRequestDecision}
            onOpenRun={setSelectedRunId}
          />
        </div>

        <div className="assistant-sidebar-block">
          <strong>Recent run traces</strong>
            <p>
              {runHistoryLoading
                ? 'Refreshing your recent assistant runs.'
              : runHistoryError
                ? runHistoryError
                : visibleRecentRuns.length > 0
                  ? `${visibleRecentRuns.length} recent runs are available for inspection.`
                  : hasScreenFilter
                    ? 'No stored runs match the current local filter.'
                    : 'No stored runs yet in this session history.'}
            </p>
          {visibleRecentRuns.length > 0 ? (
            <div className="assistant-run-list">
              {visibleRecentRuns.map((run) => (
                <button
                  key={run.run_id}
                  type="button"
                  className={`assistant-run-card ${selectedRunId === run.run_id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedRunId(run.run_id)}
                >
                  <div className="assistant-provider-head">
                    <strong>Run #{run.run_id}</strong>
                    <span className={`status-pill status-pill-${run.status === 'COMPLETED' ? 'active' : 'blocked'}`}>
                      {run.status}
                    </span>
                  </div>
                  <p>{run.latest_user_message ?? run.assistant_message ?? 'Stored assistant run trace.'}</p>
                  <small>{summarizeRunCard(run)}</small>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="assistant-sidebar-block">
          <strong>Selected run trace</strong>
          <p>
            {runDetailLoading
              ? `Loading run #${selectedRunId ?? ''}...`
              : runDetailError
                ? runDetailError
                : selectedRun
                  ? `Inspecting stored trace for run #${selectedRun.run_id}.`
                  : selectedRunSummary
                    ? `Run #${selectedRunSummary.run_id} is selected.`
                    : 'Select a stored run to inspect its trace.'}
          </p>
        </div>

        {selectedRun ? (
          <div className="assistant-run-trace">
            <div className="assistant-run-summary-grid">
              <article className="assistant-run-summary-card">
                <span>Status</span>
                <strong>{selectedRun.status}</strong>
                <small>{selectedRun.provider} · {selectedRun.model}</small>
              </article>
              <article className="assistant-run-summary-card">
                <span>Tokens</span>
                <strong>
                  {selectedRun.input_tokens !== null ? formatTokenCount(selectedRun.input_tokens) : 'n/a'} /{' '}
                  {selectedRun.output_tokens !== null ? formatTokenCount(selectedRun.output_tokens) : 'n/a'}
                </strong>
                <small>Input / output</small>
              </article>
              <article className="assistant-run-summary-card">
                <span>Tools</span>
                <strong>{selectedRun.tool_call_count}</strong>
                <small>{selectedRun.use_live_tools ? 'Live tools enabled' : 'Live tools disabled'}</small>
              </article>
            </div>

            <div className="assistant-sidebar-block">
              <strong>Run metadata</strong>
              <div className="assistant-message-meta">
                <span>Created: {formatTraceTimestamp(selectedRun.created_at)}</span>
                <span>Completed: {formatTraceTimestamp(selectedRun.completed_at)}</span>
                <span>Workspace: {selectedRun.workspace ?? 'n/a'}</span>
                <span>Agent: {selectedRun.agent_name ?? 'Platform foundation'}</span>
              </div>
              {selectedRun.error_detail ? (
                <div className="assistant-message-meta">
                  <span>{selectedRun.error_detail}</span>
                </div>
              ) : null}
            </div>

            {selectedRun.warnings.length > 0 ? (
              <div className="assistant-sidebar-block">
                <strong>Warnings</strong>
                <div className="assistant-run-warning-list">
                  {selectedRun.warnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedRun.tool_calls.length > 0 ? (
              <div className="assistant-tool-list">
                {selectedRun.tool_calls.map((toolCall, index) => (
                  <article key={`selected-run-tool-${toolCall.tool_name}-${index}`} className="assistant-tool-card">
                    <div className="assistant-tool-head">
                      <strong>{toolCall.tool_name}</strong>
                      <span>
                        {toolCall.record_count === null ? 'Record count: n/a' : `Record count: ${toolCall.record_count}`}
                      </span>
                    </div>
                    <p>{toolCall.summary}</p>
                    {Object.keys(toolCall.arguments).length > 0 ? <code>{JSON.stringify(toolCall.arguments)}</code> : null}
                  </article>
                ))}
              </div>
            ) : null}

            <details className="assistant-trace-details" open>
              <summary>Prompt sections ({selectedRun.prompt_sections.length})</summary>
              <div className="assistant-trace-section-list">
                {selectedRun.prompt_sections.map((section) => (
                  <div key={section.key} className="assistant-context-preview">
                    <strong>{section.title}</strong>
                    <pre>{section.content}</pre>
                  </div>
                ))}
              </div>
            </details>

            <details className="assistant-trace-details">
              <summary>Request snapshot ({selectedRun.request_messages.length} messages)</summary>
              <div className="assistant-context-preview">
                <pre>
                  {selectedRun.request_messages
                    .map((message, index) => `${index + 1}. ${message.role}\n${message.content}`)
                    .join('\n\n')}
                </pre>
              </div>
              {selectedRun.application_context ? (
                <div className="assistant-context-preview">
                  <strong>Application context</strong>
                  <pre>{selectedRun.application_context}</pre>
                </div>
              ) : null}
            </details>

            <details className="assistant-trace-details">
              <summary>Rendered system prompt</summary>
              <div className="assistant-context-preview">
                <pre>{selectedRun.rendered_system_prompt}</pre>
              </div>
            </details>
          </div>
        ) : null}

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
    </div>
  )
}
