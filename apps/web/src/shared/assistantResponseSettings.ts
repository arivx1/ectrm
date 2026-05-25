const ASSISTANT_RESPONSE_SETTINGS_STORAGE_KEY = 'ectrm.assistant-response-settings'

export type MessagingAgentBrevityPreference = 'balanced' | 'brief' | 'terse'

export type AssistantResponseSettings = {
  messagingAgentBrevity: MessagingAgentBrevityPreference
}

export type MessagingAgentBrevityOption = {
  value: MessagingAgentBrevityPreference
  label: string
  detail: string
}

export const MESSAGING_AGENT_BREVITY_OPTIONS: MessagingAgentBrevityOption[] = [
  {
    value: 'balanced',
    label: 'Balanced',
    detail: 'Short, but complete when evidence or governance context matters.',
  },
  {
    value: 'brief',
    label: 'Brief',
    detail: 'One to three compact sentences or bullets with the next step.',
  },
  {
    value: 'terse',
    label: 'Terse',
    detail: 'One short answer and only the most important next step.',
  },
]

const DEFAULT_ASSISTANT_RESPONSE_SETTINGS: AssistantResponseSettings = Object.freeze({
  messagingAgentBrevity: 'brief',
})

export function getDefaultAssistantResponseSettings(): AssistantResponseSettings {
  return {
    messagingAgentBrevity: DEFAULT_ASSISTANT_RESPONSE_SETTINGS.messagingAgentBrevity,
  }
}

export function normalizeMessagingAgentBrevityPreference(
  value: unknown,
): MessagingAgentBrevityPreference {
  return MESSAGING_AGENT_BREVITY_OPTIONS.some((option) => option.value === value)
    ? (value as MessagingAgentBrevityPreference)
    : DEFAULT_ASSISTANT_RESPONSE_SETTINGS.messagingAgentBrevity
}

export function normalizeAssistantResponseSettings(
  value: Partial<AssistantResponseSettings> | null | undefined,
): AssistantResponseSettings {
  return {
    messagingAgentBrevity: normalizeMessagingAgentBrevityPreference(
      value?.messagingAgentBrevity,
    ),
  }
}

export function getAssistantResponseSettingsSnapshot(): AssistantResponseSettings {
  if (typeof window === 'undefined') {
    return getDefaultAssistantResponseSettings()
  }

  const storedValue = window.localStorage.getItem(ASSISTANT_RESPONSE_SETTINGS_STORAGE_KEY)
  if (!storedValue) {
    return getDefaultAssistantResponseSettings()
  }

  try {
    return normalizeAssistantResponseSettings(
      JSON.parse(storedValue) as Partial<AssistantResponseSettings>,
    )
  } catch {
    return getDefaultAssistantResponseSettings()
  }
}

export function saveAssistantResponseSettingsSnapshot(
  snapshot: AssistantResponseSettings,
): AssistantResponseSettings {
  const normalizedSnapshot = normalizeAssistantResponseSettings(snapshot)

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      ASSISTANT_RESPONSE_SETTINGS_STORAGE_KEY,
      JSON.stringify(normalizedSnapshot),
    )
  }

  return normalizedSnapshot
}

export function clearAssistantResponseSettingsSnapshot(): AssistantResponseSettings {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(ASSISTANT_RESPONSE_SETTINGS_STORAGE_KEY)
  }

  return getDefaultAssistantResponseSettings()
}

export function formatMessagingAgentBrevityPreference(
  value: MessagingAgentBrevityPreference,
): string {
  return (
    MESSAGING_AGENT_BREVITY_OPTIONS.find((option) => option.value === value)?.label ??
    'Brief'
  )
}

export function getMessagingAgentBrevityInstruction(
  value: MessagingAgentBrevityPreference,
): string {
  switch (value) {
    case 'balanced':
      return 'Keep replies concise, but include the evidence or governance context needed for a safe decision. Avoid restating the whole thread.'
    case 'terse':
      return 'Reply in one short answer with the single most important next step. Use more detail only for policy, safety, or approval-critical context.'
    case 'brief':
    default:
      return 'Reply in one to three compact sentences or bullets. Lead with the answer or next step, and avoid narrative recap.'
  }
}
