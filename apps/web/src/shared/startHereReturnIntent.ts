export type StartHereReturnView = 'trades' | 'events' | 'risk' | 'operations'

const START_HERE_RETURN_INTENT_STORAGE_KEY = 'ectrm.start-here-return-intent'
const START_HERE_RETURN_INTENT_STORAGE_EVENT = 'ectrm:start-here-return-intent'

function emitStartHereReturnIntentStorageChange(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return
  }

  window.dispatchEvent(new Event(START_HERE_RETURN_INTENT_STORAGE_EVENT))
}

function normalizeStartHereReturnView(value: unknown): StartHereReturnView | null {
  switch (value) {
    case 'trades':
    case 'events':
    case 'risk':
    case 'operations':
      return value
    default:
      return null
  }
}

export function getStartHereReturnIntent(): StartHereReturnView | null {
  if (typeof window === 'undefined') {
    return null
  }

  return normalizeStartHereReturnView(
    window.localStorage.getItem(START_HERE_RETURN_INTENT_STORAGE_KEY),
  )
}

export function saveStartHereReturnIntent(view: StartHereReturnView): StartHereReturnView {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(START_HERE_RETURN_INTENT_STORAGE_KEY, view)
    emitStartHereReturnIntentStorageChange()
  }

  return view
}

export function clearStartHereReturnIntent(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(START_HERE_RETURN_INTENT_STORAGE_KEY)
  emitStartHereReturnIntentStorageChange()
}

export function subscribeStartHereReturnIntent(
  onStoreChange: () => void,
): () => void {
  if (
    typeof window === 'undefined' ||
    typeof window.addEventListener !== 'function' ||
    typeof window.removeEventListener !== 'function'
  ) {
    return () => {}
  }

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === null || event.key === START_HERE_RETURN_INTENT_STORAGE_KEY) {
      onStoreChange()
    }
  }
  const handleLocalStorageChange = () => {
    onStoreChange()
  }

  window.addEventListener('storage', handleStorageChange)
  window.addEventListener(
    START_HERE_RETURN_INTENT_STORAGE_EVENT,
    handleLocalStorageChange,
  )

  return () => {
    window.removeEventListener('storage', handleStorageChange)
    window.removeEventListener(
      START_HERE_RETURN_INTENT_STORAGE_EVENT,
      handleLocalStorageChange,
    )
  }
}

export function formatStartHereReturnIntentLabel(view: StartHereReturnView): string {
  switch (view) {
    case 'trades':
      return 'Trade Capture'
    case 'events':
      return 'Activity Feed'
    case 'risk':
      return 'Exposure'
    case 'operations':
      return 'Work Queue'
  }
}
