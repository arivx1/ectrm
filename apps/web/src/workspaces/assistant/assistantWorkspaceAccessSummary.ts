import type { AssistantAgent, AssistantRuntimeSettings } from '../../shared/models'

export type AssistantAgentAccessSummary = {
  heading: string
  summary: string
  detail: string
}

function summarizeAgentList(values: readonly string[], emptyLabel: string): string {
  return values.length > 0 ? values.join(' · ') : emptyLabel
}

export function buildAssistantAgentAccessSummary(
  selectedAgent: AssistantAgent | null,
  runtimeSettings: Pick<AssistantRuntimeSettings, 'available_tools'> | null,
): AssistantAgentAccessSummary {
  if (!selectedAgent) {
    return {
      heading: 'Platform foundation access',
      summary:
        'No named agent is selected, so the next request uses the shared runtime catalog without an agent-specific allowlist.',
      detail: runtimeSettings?.available_tools.length
        ? `Published runtime tools: ${runtimeSettings.available_tools.map((tool) => tool.name).join(' · ')}`
        : 'No published runtime tools are currently exposed by the API.',
    }
  }

  return {
    heading: `${selectedAgent.name} access`,
    summary: `${selectedAgent.name} is limited to ${selectedAgent.allowed_tools.length} live tool(s), ${selectedAgent.allowed_action_types.length} governed action type(s), and ${selectedAgent.allowed_workspaces.length} workspace(s).`,
    detail: [
      `Tools: ${summarizeAgentList(selectedAgent.allowed_tools, 'No live tools granted')}`,
      `Actions: ${summarizeAgentList(selectedAgent.allowed_action_types, 'No governed actions granted')}`,
      `Workspaces: ${summarizeAgentList(selectedAgent.allowed_workspaces, 'No workspaces scoped')}`,
    ].join(' | '),
  }
}
