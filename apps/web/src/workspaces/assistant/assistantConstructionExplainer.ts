import type {
  AssistantActionDefinition,
  AssistantActionType,
  AssistantAgent,
  AssistantAgentOrchestrationPattern,
  AssistantAgentProfileKind,
  AssistantPromptContext,
  AssistantPromptSection,
  AssistantPromptSectionSource,
  AssistantRun,
  AssistantRuntimeSettings,
  AssistantAgentSkillDefinition,
  AssistantAgentSkillKey,
} from '../../shared/models'
import { buildAssistantAgentAccessSummary } from './assistantWorkspaceAccessSummary'

export type AssistantConstructionExplainerCard = {
  key: string
  title: string
  summary: string
  details: string[]
  chips: string[]
}

export type AssistantConstructionExplainerSourceGroup = {
  source: AssistantPromptSectionSource
  label: string
  count: number
  titles: string[]
}

export type AssistantConstructionExplainerProvenanceRow = {
  key: string
  title: string
  sourceLabel: string
  details: string[]
  usesFallback: boolean
}

export type AssistantConstructionExplainer = {
  heading: string
  summary: string
  cards: AssistantConstructionExplainerCard[]
  sourceGroups: AssistantConstructionExplainerSourceGroup[]
  provenanceRows: AssistantConstructionExplainerProvenanceRow[]
}

type BuildAssistantConstructionExplainerInput = {
  activeAgent: AssistantAgent | null
  activeAgentName: string | null
  activeAgentRoleKey: string | null
  activeAgentProfileKind: AssistantAgentProfileKind | null
  promptPreview: AssistantPromptContext | null
  selectedRun: AssistantRun | null
  activeGroundingSections: AssistantPromptSection[]
  includeContext: boolean
  useLiveTools: boolean
  runtimeSettings: Pick<
    AssistantRuntimeSettings,
    'available_skills' | 'available_tools' | 'available_action_types'
  > | null
  agentRoster: AssistantAgent[]
}

const SOURCE_LABELS: Record<AssistantPromptSectionSource, string> = {
  system: 'System contract',
  organization: 'Organization guidance',
  user: 'User identity',
  business: 'Business rules',
  data: 'Operational data',
  tool: 'Tool evidence',
  world: 'World context',
  workspace: 'Workspace guidance',
  application: 'Application context',
  agent: 'Managed agent overlay',
}

const SOURCE_ORDER: AssistantPromptSectionSource[] = [
  'system',
  'organization',
  'user',
  'business',
  'world',
  'workspace',
  'application',
  'agent',
  'data',
  'tool',
]

function formatCatalogLabel(value: string): string {
  return value
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatProfileKind(value: AssistantAgentProfileKind | null): string {
  if (value === 'ROLE_DERIVED') {
    return 'Role-derived'
  }
  if (value === 'CURATED') {
    return 'Curated'
  }
  if (value === 'CUSTOM') {
    return 'Custom'
  }
  return 'Foundation'
}

function formatOrchestrationPattern(pattern: AssistantAgentOrchestrationPattern | null | undefined): string {
  switch (pattern) {
    case 'MANAGER':
      return 'Manager'
    case 'TRIAGE':
      return 'Triage'
    case 'PARALLEL':
      return 'Parallel'
    case 'EVALUATOR':
      return 'Evaluator'
    case 'SINGLE':
      return 'Single'
    default:
      return 'Foundation'
  }
}

function formatSkillLabel(
  value: AssistantAgentSkillKey,
  definitionsByName: ReadonlyMap<AssistantAgentSkillKey, AssistantAgentSkillDefinition>,
): string {
  return definitionsByName.get(value)?.label ?? formatCatalogLabel(value)
}

function formatActionLabel(
  value: AssistantActionType,
  definitionsByName: ReadonlyMap<AssistantActionType, AssistantActionDefinition>,
): string {
  return definitionsByName.get(value)?.label ?? formatCatalogLabel(value)
}

function groupPromptSections(
  sections: AssistantPromptSection[],
): AssistantConstructionExplainerSourceGroup[] {
  const grouped = new Map<AssistantPromptSectionSource, AssistantConstructionExplainerSourceGroup>()

  sections.forEach((section) => {
    const existing = grouped.get(section.source)
    if (existing) {
      existing.count += 1
      if (existing.titles.length < 3 && !existing.titles.includes(section.title)) {
        existing.titles.push(section.title)
      }
      return
    }

    grouped.set(section.source, {
      source: section.source,
      label: SOURCE_LABELS[section.source],
      count: 1,
      titles: [section.title],
    })
  })

  return SOURCE_ORDER.flatMap((source) => {
    const group = grouped.get(source)
    return group ? [group] : []
  })
}

function formatPromptSectionDetail(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  return String(value)
}

function summarizePromptSectionProvenance(
  sections: AssistantPromptSection[],
): AssistantConstructionExplainerProvenanceRow[] {
  return sections.map((section) => {
    const contract =
      section.contract_key && section.contract_version
        ? `${section.contract_key} v${section.contract_version}`
        : section.contract_key
    const details = [
      SOURCE_LABELS[section.source],
      formatPromptSectionDetail(section.scope),
      formatPromptSectionDetail(section.kind),
      section.freshness ? `freshness ${section.freshness}` : null,
      section.owner ? `owner ${section.owner}` : null,
      section.owner_reference ? `ref ${section.owner_reference}` : null,
      contract ? `contract ${contract}` : null,
      section.merge_strategy ? `merge ${section.merge_strategy}` : null,
    ].filter((detail): detail is string => Boolean(detail))

    return {
      key: section.key,
      title: section.title,
      sourceLabel: SOURCE_LABELS[section.source],
      details,
      usesFallback: Boolean(section.uses_fallback),
    }
  })
}

function summarizeHierarchy(activeAgent: AssistantAgent | null, agentRoster: AssistantAgent[]): string[] {
  if (!activeAgent) {
    return ['No named parent or subordinate hierarchy applies while the platform foundation is selected.']
  }

  const details = [`Pattern: ${formatOrchestrationPattern(activeAgent.orchestration_pattern)}`]
  const parentAgent =
    activeAgent.parent_agent_id?.trim()
      ? agentRoster.find((agent) => agent.agent_id === activeAgent.parent_agent_id) ?? null
      : null

  details.push(`Reports to: ${parentAgent?.name ?? 'No parent agent wired'}`)
  details.push(
    activeAgent.managed_agent_ids.length > 0
      ? `Manages: ${activeAgent.managed_agent_ids
          .map((agentId) => agentRoster.find((agent) => agent.agent_id === agentId)?.name ?? agentId)
          .join(' · ')}`
      : 'Manages: No subordinate agents wired',
  )
  if (activeAgent.delegation_guidance?.trim()) {
    details.push(`Delegation: ${activeAgent.delegation_guidance.trim()}`)
  }
  return details
}

export function buildAssistantConstructionExplainer({
  activeAgent,
  activeAgentName,
  activeAgentRoleKey,
  activeAgentProfileKind,
  promptPreview,
  selectedRun,
  activeGroundingSections,
  includeContext,
  useLiveTools,
  runtimeSettings,
  agentRoster,
}: BuildAssistantConstructionExplainerInput): AssistantConstructionExplainer {
  const sourceGroups = groupPromptSections(activeGroundingSections)
  const provenanceRows = summarizePromptSectionProvenance(activeGroundingSections)
  const provider = selectedRun?.provider ?? promptPreview?.provider ?? 'Runtime default'
  const model = selectedRun?.model ?? promptPreview?.model ?? 'Preview unavailable'
  const workspace = selectedRun?.workspace ?? 'assistant'
  const liveToolsEnabled = selectedRun ? selectedRun.use_live_tools : useLiveTools
  const applicationContextAttached = selectedRun
    ? Boolean(selectedRun.application_context?.trim())
    : includeContext
  const effectiveAgentName = activeAgent?.name ?? activeAgentName
  const effectiveRoleKey = activeAgent?.role_key ?? activeAgentRoleKey
  const effectiveProfileKind = activeAgent?.profile_kind ?? activeAgentProfileKind ?? null
  const skillDefinitionsByName = new Map(
    (runtimeSettings?.available_skills ?? []).map((definition) => [definition.name, definition]),
  )
  const actionDefinitionsByName = new Map(
    (runtimeSettings?.available_action_types ?? []).map((definition) => [definition.name, definition]),
  )
  const accessSummary = buildAssistantAgentAccessSummary(activeAgent, runtimeSettings)
  const accessDetails = accessSummary.detail.split('|').map((detail) => detail.trim())
  const capabilityLabels = activeAgent?.capabilities ?? []
  const skillLabels = activeAgent
    ? activeAgent.skills.map((skill) => formatSkillLabel(skill, skillDefinitionsByName))
    : []
  const actionLabels = activeAgent
    ? activeAgent.allowed_action_types.map((action) => formatActionLabel(action, actionDefinitionsByName))
    : []
  const heading = selectedRun ? 'Stored run construction' : 'Next request construction'
  const summary = selectedRun
    ? `Showing how run #${selectedRun.run_id} was assembled with ${provider} · ${model}.`
    : promptPreview
      ? `Showing how the next request will be assembled with ${provider} · ${model}.`
      : 'Prompt construction preview is unavailable until the runtime is ready.'

  return {
    heading,
    summary,
    sourceGroups,
    provenanceRows,
    cards: [
      {
        key: 'request-lens',
        title: 'Request lens',
        summary: selectedRun
          ? 'This explainer is reflecting a stored trace, not the unsent composer draft.'
          : 'This explainer is reflecting the next request that would be sent from the current composer state.',
        details: [
          `Workspace: ${workspace}`,
          `Live tools: ${liveToolsEnabled ? 'Enabled' : 'Disabled'}`,
          `Application context: ${applicationContextAttached ? 'Attached' : 'Not attached'}`,
          `Grounding sections: ${activeGroundingSections.length}`,
        ],
        chips: [provider, model],
      },
      {
        key: 'agent-layer',
        title: 'Named agent layer',
        summary: effectiveAgentName
          ? `${effectiveAgentName} overlays the shared platform foundation for this request.`
          : 'No named agent overlay is selected, so the platform foundation handles this request directly.',
        details: [
          `Role profile: ${effectiveRoleKey ? formatCatalogLabel(effectiveRoleKey) : 'No named role pinned'}`,
          `Profile kind: ${formatProfileKind(effectiveProfileKind)}`,
          activeAgent?.human_owner_role
            ? `Owner role: ${activeAgent.human_owner_role}`
            : 'Owner role: Shared operator context',
          activeAgent?.authority_ceiling
            ? `Authority ceiling: ${activeAgent.authority_ceiling}`
            : 'Authority ceiling: Prompt only',
        ],
        chips: activeAgent ? [formatOrchestrationPattern(activeAgent.orchestration_pattern)] : [],
      },
      {
        key: 'guidance',
        title: 'Prompt guidance',
        summary:
          activeAgent?.specialization_summary ??
          activeAgent?.description ??
          'General operator guidance comes from the platform foundation and the currently loaded prompt sections.',
        details: [
          activeAgent?.activation_notes?.trim()
            ? `Activation notes: ${activeAgent.activation_notes.trim()}`
            : selectedRun
              ? 'Guidance note: Stored run traces preserve the prompt sections that were actually used at execution time.'
              : 'Guidance note: Prompt preview reflects the server-built request before send.',
          activeAgent?.delegation_guidance?.trim()
            ? `Delegation: ${activeAgent.delegation_guidance.trim()}`
            : 'Delegation: No explicit delegation guidance pinned',
          promptPreview?.warnings.length
            ? `Warnings: ${promptPreview.warnings.join(' · ')}`
            : selectedRun?.warnings.length
              ? `Warnings: ${selectedRun.warnings.join(' · ')}`
              : 'Warnings: No prompt warnings surfaced',
        ],
        chips: [],
      },
      {
        key: 'skills-capabilities',
        title: 'Capabilities and skills',
        summary: activeAgent
          ? `${activeAgent.capabilities.length} capabilities and ${skillLabels.length} pinned skills are shaping this request.`
          : 'No named skill bundle is pinned. The platform foundation relies on shared runtime guidance instead.',
        details: [
          capabilityLabels.length > 0
            ? `Capabilities: ${capabilityLabels.join(' · ')}`
            : 'Capabilities: No explicit capability set pinned',
          skillLabels.length > 0
            ? `Skills: ${skillLabels.join(' · ')}`
            : 'Skills: No explicit skill bundle pinned',
          activeAgent
            ? 'Skill priority is not ranked in the current schema; pinned skills are treated as an unordered set.'
            : 'No named managed skill set is active while the platform foundation is selected.',
        ],
        chips: [...capabilityLabels, ...skillLabels],
      },
      {
        key: 'access',
        title: 'Access boundaries',
        summary: accessSummary.summary,
        details: [
          ...accessDetails,
          actionLabels.length > 0
            ? `Action labels: ${actionLabels.join(' · ')}`
            : activeAgent
              ? 'Action labels: No governed actions granted'
              : 'Action labels: No named governed action set',
        ],
        chips: [],
      },
      {
        key: 'hierarchy',
        title: 'Hierarchy and delegation',
        summary: activeAgent
          ? `${formatOrchestrationPattern(activeAgent.orchestration_pattern)} pattern with ${
              activeAgent.managed_agent_ids.length
            } subordinate${activeAgent.managed_agent_ids.length === 1 ? '' : 's'} in scope.`
          : 'No named hierarchy is active while the platform foundation is selected.',
        details: summarizeHierarchy(activeAgent, agentRoster),
        chips: [],
      },
    ],
  }
}
