import {
  getMessagingAgentBrevityInstruction,
  type AssistantResponseSettings,
} from '../../shared/assistantResponseSettings'
import type { MessagingWorkspaceChannel } from './messagingInboxData'

export function buildThreadContext(
  selectedChannel: MessagingWorkspaceChannel,
  responseSettings: AssistantResponseSettings,
): string {
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
    `Reply style: ${getMessagingAgentBrevityInstruction(responseSettings.messagingAgentBrevity)}`,
    `Authority: do not externally commit the firm or send counterparty communication as completed fact; draft, explain, or stage governed follow-up only.`,
    `Current highlights: ${selectedChannel.highlights.join(' | ')}`,
    'Recent thread:',
    recentTimeline,
  ].join('\n')
}
