import { useCallback, useSyncExternalStore } from 'react'

const COLLAPSIBLE_CARD_STATE_STORAGE_KEY = 'ectrm.collapsible-card-state'
const COLLAPSIBLE_CARD_STATE_STORAGE_EVENT = 'ectrm:collapsible-card-state-change'

export type CollapsibleCardStateSnapshot = Record<string, boolean>

function normalizeCollapsibleCardStateSnapshot(
  value: unknown,
): CollapsibleCardStateSnapshot {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] =>
        typeof entry[0] === 'string' && typeof entry[1] === 'boolean',
    ),
  )
}

export function getCollapsibleCardStateSnapshot(): CollapsibleCardStateSnapshot {
  if (typeof window === 'undefined') {
    return {}
  }

  const storedValue = window.localStorage.getItem(COLLAPSIBLE_CARD_STATE_STORAGE_KEY)
  if (!storedValue) {
    return {}
  }

  try {
    return normalizeCollapsibleCardStateSnapshot(JSON.parse(storedValue))
  } catch {
    return {}
  }
}

export function clearCollapsibleCardStateSnapshot(): CollapsibleCardStateSnapshot {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(COLLAPSIBLE_CARD_STATE_STORAGE_KEY)
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event(COLLAPSIBLE_CARD_STATE_STORAGE_EVENT))
    }
  }

  return {}
}

export function hasCollapsibleCardStateValue(cardKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(getCollapsibleCardStateSnapshot(), cardKey)
}

export function getCollapsibleCardStateValue(cardKey: string, fallback: boolean): boolean {
  const snapshot = getCollapsibleCardStateSnapshot()
  return typeof snapshot[cardKey] === 'boolean' ? snapshot[cardKey] : fallback
}

export function saveCollapsibleCardStateValue(cardKey: string, expanded: boolean): boolean {
  const nextSnapshot = {
    ...getCollapsibleCardStateSnapshot(),
    [cardKey]: expanded,
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      COLLAPSIBLE_CARD_STATE_STORAGE_KEY,
      JSON.stringify(nextSnapshot),
    )
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event(COLLAPSIBLE_CARD_STATE_STORAGE_EVENT))
    }
  }

  return expanded
}

function subscribeToCollapsibleCardState(onStoreChange: () => void): () => void {
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
        storageEvent.key !== COLLAPSIBLE_CARD_STATE_STORAGE_KEY
      ) {
        return
      }
    }

    onStoreChange()
  }

  window.addEventListener(COLLAPSIBLE_CARD_STATE_STORAGE_EVENT, handleStoreEvent)
  window.addEventListener('storage', handleStoreEvent)

  return () => {
    window.removeEventListener(COLLAPSIBLE_CARD_STATE_STORAGE_EVENT, handleStoreEvent)
    window.removeEventListener('storage', handleStoreEvent)
  }
}

export function usePersistentCollapsibleCardState(
  cardKey: string,
  defaultExpanded: boolean,
): {
  expanded: boolean
  hasPersistedValue: boolean
  setExpanded: (
    nextValue: boolean | ((currentValue: boolean) => boolean),
  ) => void
} {
  const expanded = useSyncExternalStore(
    subscribeToCollapsibleCardState,
    () => getCollapsibleCardStateValue(cardKey, defaultExpanded),
    () => defaultExpanded,
  )
  const hasPersistedValue = useSyncExternalStore(
    subscribeToCollapsibleCardState,
    () => hasCollapsibleCardStateValue(cardKey),
    () => false,
  )

  const setExpanded = useCallback(
    (nextValue: boolean | ((currentValue: boolean) => boolean)) => {
      const currentValue = getCollapsibleCardStateValue(cardKey, defaultExpanded)
      const resolvedValue =
        typeof nextValue === 'function'
          ? nextValue(currentValue)
          : nextValue

      saveCollapsibleCardStateValue(cardKey, resolvedValue)
    },
    [cardKey, defaultExpanded],
  )

  return {
    expanded,
    hasPersistedValue,
    setExpanded,
  }
}
