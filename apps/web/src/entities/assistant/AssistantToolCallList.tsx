import { AssistantEvidenceList } from './AssistantEvidenceList'
import type { AssistantToolCall } from '../../shared/models'

type AssistantToolCallListProps = {
  toolCalls: AssistantToolCall[]
  callerAgentName?: string | null
  selectedRunId?: number | null
  onOpenRun?: (runId: number) => void
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function isCoordinationTool(toolName: string): boolean {
  return toolName === 'consult_managed_agent' || toolName === 'enlist_managed_agent'
}

function coordinationToolLabel(toolName: string): string {
  return toolName === 'enlist_managed_agent' ? 'Delegated execution' : 'Advisory consultation'
}

function coordinationPromptLabel(toolName: string): string {
  return toolName === 'enlist_managed_agent' ? 'Delegated task' : 'Consultation prompt'
}

function CoordinationToolCard({
  toolCall,
  callerAgentName,
  selectedRunId,
  onOpenRun,
}: {
  toolCall: AssistantToolCall
  callerAgentName?: string | null
  selectedRunId?: number | null
  onOpenRun?: (runId: number) => void
}) {
  const outputPreview =
    toolCall.output_preview && typeof toolCall.output_preview === 'object'
      ? toolCall.output_preview
      : {}
  const targetAgentName =
    readString(outputPreview.agent_name) ??
    readString(toolCall.arguments.agent_name) ??
    readString(toolCall.arguments.agent_id) ??
    'Managed agent'
  const callerLabel = callerAgentName?.trim() || 'This agent'
  const workspace =
    readString(outputPreview.workspace) ?? readString(toolCall.arguments.workspace)
  const sharedPrompt =
    readString(toolCall.arguments.task) ??
    readString(toolCall.arguments.question) ??
    null
  const sharedContext = readString(toolCall.arguments.context)
  const answer = readString(outputPreview.answer)
  const warnings = readStringList(outputPreview.warnings)
  const delegatedRunId = readNumber(outputPreview.run_id)
  const actionRequestCount = readNumber(outputPreview.action_request_count)
  const executedActionCount = readNumber(outputPreview.executed_action_count)
  const pendingActionCount = readNumber(outputPreview.pending_action_count)
  const failedActionCount = readNumber(outputPreview.failed_action_count)

  return (
    <article className="assistant-tool-card assistant-tool-card-coordination">
      <div className="assistant-tool-head">
        <strong>{toolCall.tool_name}</strong>
        <span>{coordinationToolLabel(toolCall.tool_name)}</span>
      </div>

      <div className="assistant-message-meta assistant-tool-meta">
        <span>
          {callerLabel} -&gt; {targetAgentName}
        </span>
        {workspace ? <span>Workspace: {workspace}</span> : null}
        {delegatedRunId ? <span>Delegated run #{delegatedRunId}</span> : null}
      </div>

      {sharedPrompt ? (
        <div className="assistant-tool-detail-block">
          <strong>{coordinationPromptLabel(toolCall.tool_name)}</strong>
          <p>{sharedPrompt}</p>
        </div>
      ) : null}

      {sharedContext ? (
        <div className="assistant-tool-detail-block">
          <strong>Shared context</strong>
          <p>{sharedContext}</p>
        </div>
      ) : null}

      {answer ? (
        <div className="assistant-tool-detail-block">
          <strong>{toolCall.tool_name === 'enlist_managed_agent' ? 'Returned answer' : 'Consultation answer'}</strong>
          <p>{answer}</p>
        </div>
      ) : (
        <p>{toolCall.summary}</p>
      )}

      {toolCall.tool_name === 'enlist_managed_agent' &&
      (actionRequestCount !== null ||
        executedActionCount !== null ||
        pendingActionCount !== null ||
        failedActionCount !== null ||
        delegatedRunId !== null) ? (
        <div className="assistant-message-meta assistant-tool-meta">
          {actionRequestCount !== null ? <span>Action requests: {actionRequestCount}</span> : null}
          {executedActionCount !== null ? <span>Executed: {executedActionCount}</span> : null}
          {pendingActionCount !== null ? <span>Pending: {pendingActionCount}</span> : null}
          {failedActionCount !== null ? <span>Failed: {failedActionCount}</span> : null}
          {delegatedRunId !== null && onOpenRun ? (
            <button
              type="button"
              className={`assistant-run-link ${selectedRunId === delegatedRunId ? 'is-selected' : ''}`}
              onClick={() => onOpenRun(delegatedRunId)}
            >
              {selectedRunId === delegatedRunId ? 'Viewing delegated run' : 'Open delegated run'}
            </button>
          ) : null}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="assistant-tool-warning-list">
          {warnings.map((warning) => (
            <span key={`${toolCall.tool_name}-${warning}`}>{warning}</span>
          ))}
        </div>
      ) : null}
    </article>
  )
}

function GenericToolCard({ toolCall }: { toolCall: AssistantToolCall }) {
  return (
    <article className="assistant-tool-card">
      <div className="assistant-tool-head">
        <strong>{toolCall.tool_name}</strong>
        <span>
          {toolCall.record_count === null ? 'Record count: n/a' : `Record count: ${toolCall.record_count}`}
        </span>
      </div>
      <p>{toolCall.summary}</p>
      {Object.keys(toolCall.arguments).length > 0 ? (
        <code>{JSON.stringify(toolCall.arguments)}</code>
      ) : null}
      {toolCall.evidence_items && toolCall.evidence_items.length > 0 ? (
        <AssistantEvidenceList evidenceItems={toolCall.evidence_items} compact />
      ) : null}
    </article>
  )
}

export function AssistantToolCallList({
  toolCalls,
  callerAgentName,
  selectedRunId,
  onOpenRun,
}: AssistantToolCallListProps) {
  if (toolCalls.length === 0) {
    return null
  }

  return (
    <div className="assistant-tool-list">
      {toolCalls.map((toolCall, index) =>
        isCoordinationTool(toolCall.tool_name) ? (
          <CoordinationToolCard
            key={`${toolCall.tool_name}-${index}`}
            toolCall={toolCall}
            callerAgentName={callerAgentName}
            selectedRunId={selectedRunId}
            onOpenRun={onOpenRun}
          />
        ) : (
          <GenericToolCard key={`${toolCall.tool_name}-${index}`} toolCall={toolCall} />
        ),
      )}
    </div>
  )
}
