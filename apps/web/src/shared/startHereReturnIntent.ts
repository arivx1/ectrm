export type StartHereReturnView = 'trades' | 'risk' | 'operations'

const START_HERE_RETURN_INTENT_STORAGE_KEY = 'ectrm.start-here-return-intent'

function normalizeStartHereReturnView(value: unknown): StartHereReturnView | null {
  switch (value) {
    case 'trades':
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
  }

  return view
}

export function clearStartHereReturnIntent(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(START_HERE_RETURN_INTENT_STORAGE_KEY)
}

export function formatStartHereReturnIntentLabel(view: StartHereReturnView): string {
  switch (view) {
    case 'trades':
      return 'Trade Capture'
    case 'risk':
      return 'Exposure'
    case 'operations':
      return 'Work Queue'
  }
}
