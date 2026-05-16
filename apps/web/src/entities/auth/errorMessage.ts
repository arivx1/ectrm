import {
  isApiReachabilityMessage,
  summarizeWorkspaceIssueMessage,
} from '../app/workspaceLoading'

export function formatAuthErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  if (!(error instanceof Error)) {
    return fallbackMessage
  }

  const message = error.message.trim() || fallbackMessage
  if (isApiReachabilityMessage(message)) {
    return summarizeWorkspaceIssueMessage(message)
  }

  return message
}
