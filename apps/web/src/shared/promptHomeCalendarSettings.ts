import { useCallback, useSyncExternalStore } from 'react'

const PROMPT_HOME_CALENDAR_CARD_STATE_STORAGE_KEY = 'ectrm.prompt-home.calendar-card-state'
const PROMPT_HOME_CALENDAR_CARD_STATE_STORAGE_EVENT = 'ectrm:prompt-home-calendar-card-state-change'

export const PROMPT_HOME_CALENDAR_CARD_KEYS = ['day', 'week', 'month'] as const

export type PromptHomeCalendarCardKey = (typeof PROMPT_HOME_CALENDAR_CARD_KEYS)[number]

export type PromptHomeCalendarCardStateSnapshot = Partial<
  Record<PromptHomeCalendarCardKey, boolean>
>

function normalizePromptHomeCalendarCardStateSnapshot(
  value: unknown,
): PromptHomeCalendarCardStateSnapshot {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const record = value as Record<string, unknown>
  const snapshot: PromptHomeCalendarCardStateSnapshot = {}

  for (const key of PROMPT_HOME_CALENDAR_CARD_KEYS) {
    if (typeof record[key] === 'boolean') {
      snapshot[key] = record[key]
    }
  }

  return snapshot
}

export function getPromptHomeCalendarCardStateSnapshot(): PromptHomeCalendarCardStateSnapshot {
  if (typeof window === 'undefined') {
    return {}
  }

  const storedValue = window.localStorage.getItem(
    PROMPT_HOME_CALENDAR_CARD_STATE_STORAGE_KEY,
  )
  if (!storedValue) {
    return {}
  }

  try {
    return normalizePromptHomeCalendarCardStateSnapshot(JSON.parse(storedValue))
  } catch {
    return {}
  }
}

export function getPromptHomeCalendarCardStateValue(
  cardKey: PromptHomeCalendarCardKey,
  fallback: boolean,
): boolean {
  const snapshot = getPromptHomeCalendarCardStateSnapshot()
  return typeof snapshot[cardKey] === 'boolean' ? snapshot[cardKey] : fallback
}

export function savePromptHomeCalendarCardStateValue(
  cardKey: PromptHomeCalendarCardKey,
  enabled: boolean,
): boolean {
  const nextSnapshot = {
    ...getPromptHomeCalendarCardStateSnapshot(),
    [cardKey]: enabled,
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      PROMPT_HOME_CALENDAR_CARD_STATE_STORAGE_KEY,
      JSON.stringify(nextSnapshot),
    )
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new Event(PROMPT_HOME_CALENDAR_CARD_STATE_STORAGE_EVENT),
      )
    }
  }

  return enabled
}

function subscribeToPromptHomeCalendarCardState(
  onStoreChange: () => void,
): () => void {
  if (
    typeof window === 'undefined' ||
    typeof window.addEventListener !== 'function' ||
    typeof window.removeEventListener !== 'function'
  ) {
    return () => undefined
  }

  const handleStoreEvent = (event: Event) => {
    if (event.type === 'storage') {
      const storageEvent = event as StorageEvent
      if (
        typeof storageEvent.key === 'string' &&
        storageEvent.key !== PROMPT_HOME_CALENDAR_CARD_STATE_STORAGE_KEY
      ) {
        return
      }
    }

    onStoreChange()
  }

  window.addEventListener(
    PROMPT_HOME_CALENDAR_CARD_STATE_STORAGE_EVENT,
    handleStoreEvent,
  )
  window.addEventListener('storage', handleStoreEvent)

  return () => {
    window.removeEventListener(
      PROMPT_HOME_CALENDAR_CARD_STATE_STORAGE_EVENT,
      handleStoreEvent,
    )
    window.removeEventListener('storage', handleStoreEvent)
  }
}

export function usePersistentPromptHomeCalendarCardState(
  cardKey: PromptHomeCalendarCardKey,
  defaultEnabled: boolean,
): {
  enabled: boolean
  setEnabled: (
    nextValue: boolean | ((currentValue: boolean) => boolean),
  ) => void
} {
  const enabled = useSyncExternalStore(
    subscribeToPromptHomeCalendarCardState,
    () => getPromptHomeCalendarCardStateValue(cardKey, defaultEnabled),
    () => getPromptHomeCalendarCardStateValue(cardKey, defaultEnabled),
  )

  const setEnabled = useCallback(
    (nextValue: boolean | ((currentValue: boolean) => boolean)) => {
      const currentValue = getPromptHomeCalendarCardStateValue(
        cardKey,
        defaultEnabled,
      )
      const resolvedValue =
        typeof nextValue === 'function' ? nextValue(currentValue) : nextValue

      savePromptHomeCalendarCardStateValue(cardKey, resolvedValue)
    },
    [cardKey, defaultEnabled],
  )

  return {
    enabled,
    setEnabled,
  }
}
