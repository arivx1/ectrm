import type {
  AssistantAgent,
  AssistantPromptContext,
  AssistantPromptSection,
  AssistantRun,
  AssistantRuntimeSettings,
} from '../../shared/models'
import { buildAssistantConstructionExplainer } from './assistantConstructionExplainer'

type AssistantConstructionExplainerPanelProps = {
  activeAgent: AssistantAgent | null
  activeGroundingSections: AssistantPromptSection[]
  agents: AssistantAgent[]
  promptPreview: AssistantPromptContext | null
  runtimeSettings: Pick<
    AssistantRuntimeSettings,
    'available_skills' | 'available_tools' | 'available_action_types'
  > | null
  selectedRun: AssistantRun | null
  includeContext: boolean
  useLiveTools: boolean
  onSelectAgent: (agentId: string) => void
}

export function AssistantConstructionExplainerPanel({
  activeAgent,
  activeGroundingSections,
  agents,
  promptPreview,
  runtimeSettings,
  selectedRun,
  includeContext,
  useLiveTools,
  onSelectAgent,
}: AssistantConstructionExplainerPanelProps) {
  const explainer = buildAssistantConstructionExplainer({
    activeAgent,
    activeAgentName: selectedRun?.agent_name ?? promptPreview?.agent_name ?? null,
    activeAgentRoleKey: selectedRun?.agent_role_key ?? promptPreview?.agent_role_key ?? null,
    activeAgentProfileKind: selectedRun?.agent_profile_kind ?? promptPreview?.agent_profile_kind ?? null,
    promptPreview,
    selectedRun,
    activeGroundingSections,
    includeContext,
    useLiveTools,
    runtimeSettings,
    agentRoster: agents,
  })

  const parentAgent =
    activeAgent?.parent_agent_id?.trim()
      ? agents.find((agent) => agent.agent_id === activeAgent.parent_agent_id) ?? null
      : null
  const managedAgents = activeAgent
    ? activeAgent.managed_agent_ids
        .map((agentId) => agents.find((agent) => agent.agent_id === agentId) ?? null)
        .filter((agent): agent is AssistantAgent => agent !== null)
    : []

  return (
    <div className="assistant-construction-panel">
      <div className="assistant-construction-head">
        <strong>{explainer.heading}</strong>
        <p>{explainer.summary}</p>
      </div>

      <div className="assistant-construction-card-list">
        {explainer.cards.map((card) => (
          <article key={card.key} className="assistant-construction-card">
            <strong>{card.title}</strong>
            <p>{card.summary}</p>
            {card.chips.length > 0 ? (
              <div className="assistant-agent-chip-list">
                {card.chips.map((chip) => (
                  <span key={`${card.key}-${chip}`}>{chip}</span>
                ))}
              </div>
            ) : null}
            {card.details.length > 0 ? (
              <div className="assistant-construction-detail-list">
                {card.details.map((detail) => (
                  <small key={`${card.key}-${detail}`}>{detail}</small>
                ))}
              </div>
            ) : null}
            {card.key === 'hierarchy' && (parentAgent || managedAgents.length > 0) ? (
              <div className="assistant-agent-link-row">
                {parentAgent ? (
                  <button
                    type="button"
                    className="assistant-run-link"
                    onClick={() => onSelectAgent(parentAgent.agent_id)}
                  >
                    Parent: {parentAgent.name}
                  </button>
                ) : null}
                {managedAgents.map((agent) => (
                  <button
                    key={agent.agent_id}
                    type="button"
                    className="assistant-run-link"
                    onClick={() => onSelectAgent(agent.agent_id)}
                  >
                    Subordinate: {agent.name}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        ))}

        <article className="assistant-construction-card">
          <strong>Context sources</strong>
          <p>
            {explainer.sourceGroups.length > 0
              ? `${explainer.sourceGroups.length} source categor${explainer.sourceGroups.length === 1 ? 'y is' : 'ies are'} contributing prompt context right now.`
              : 'No prompt sections are loaded yet, so context source grouping is unavailable.'}
          </p>
          {explainer.sourceGroups.length > 0 ? (
            <div className="assistant-construction-source-list">
              {explainer.sourceGroups.map((group) => (
                <div key={group.source} className="assistant-construction-source-card">
                  <div className="assistant-provider-head">
                    <strong>{group.label}</strong>
                    <span>{group.count}</span>
                  </div>
                  <small>{group.titles.join(' · ')}</small>
                </div>
              ))}
            </div>
          ) : (
            <small>Prompt sections will appear here after the runtime builds a preview or you inspect a stored run.</small>
          )}
          {explainer.provenanceRows.length > 0 ? (
            <div className="assistant-construction-provenance-list">
              <strong>Context provenance</strong>
              {explainer.provenanceRows.slice(0, 8).map((row) => (
                <div key={row.key} className="assistant-construction-provenance-row">
                  <div className="assistant-provider-head">
                    <strong>{row.title}</strong>
                    {row.usesFallback ? <span>Fallback</span> : <span>{row.sourceLabel}</span>}
                  </div>
                  <small>{row.details.join(' · ')}</small>
                </div>
              ))}
              {explainer.provenanceRows.length > 8 ? (
                <small>{explainer.provenanceRows.length - 8} additional prompt sections are included in the rendered preview.</small>
              ) : null}
            </div>
          ) : null}
        </article>
      </div>
    </div>
  )
}
