export type PromptResumeIntent = {
  draft: string
  submitAfterSignIn: boolean
  createdAt: string
}

const PROMPT_RESUME_INTENT_STORAGE_KEY = 'ectrm.prompt-resume-intent'
const PROMPT_RESUME_INTENT_STORAGE_EVENT = 'ectrm:prompt-resume-intent'
const PROMPT_SIGN_IN_RETURN_INTENT_STORAGE_KEY = 'ectrm.prompt-sign-in-return-intent'
const PROMPT_SIGN_IN_RETURN_INTENT_STORAGE_EVENT = 'ectrm:prompt-sign-in-return-intent'
const MAX_PROMPT_RESUME_DRAFT_LENGTH = 4000

let cachedPromptResumeIntentRaw: string | null | undefined
let cachedPromptResumeIntent: PromptResumeIntent | null = null

function emitPromptResumeIntentStorageChange(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return
  }

  window.dispatchEvent(new Event(PROMPT_RESUME_INTENT_STORAGE_EVENT))
}

function emitPromptSignInReturnIntentStorageChange(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return
  }

  window.dispatchEvent(new Event(PROMPT_SIGN_IN_RETURN_INTENT_STORAGE_EVENT))
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue ? trimmedValue : null
}

function normalizeCreatedAt(value: unknown): string {
  const normalizedValue = normalizeOptionalText(value)
  return normalizedValue ?? new Date(0).toISOString()
}

export function normalizePromptResumeIntent(
  value: Partial<PromptResumeIntent> | null | undefined,
): PromptResumeIntent | null {
  const draft = normalizeOptionalText(value?.draft)
  if (!draft) {
    return null
  }

  return {
    draft: draft.slice(0, MAX_PROMPT_RESUME_DRAFT_LENGTH),
    submitAfterSignIn: value?.submitAfterSignIn === true,
    createdAt: normalizeCreatedAt(value?.createdAt),
  }
}

export function getPromptResumeIntent(): PromptResumeIntent | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storedValue = window.localStorage.getItem(PROMPT_RESUME_INTENT_STORAGE_KEY)
  if (storedValue === cachedPromptResumeIntentRaw) {
    return cachedPromptResumeIntent
  }

  cachedPromptResumeIntentRaw = storedValue
  if (!storedValue) {
    cachedPromptResumeIntent = null
    return null
  }

  try {
    cachedPromptResumeIntent = normalizePromptResumeIntent(
      JSON.parse(storedValue) as Partial<PromptResumeIntent>,
    )
    return cachedPromptResumeIntent
  } catch {
    cachedPromptResumeIntent = null
    return null
  }
}

export function savePromptResumeIntent(
  intent: Pick<PromptResumeIntent, 'draft'> & Partial<Omit<PromptResumeIntent, 'draft'>>,
): PromptResumeIntent | null {
  const normalizedIntent = normalizePromptResumeIntent({
    draft: intent.draft,
    submitAfterSignIn: intent.submitAfterSignIn,
    createdAt: intent.createdAt ?? new Date().toISOString(),
  })

  if (typeof window !== 'undefined') {
    if (normalizedIntent) {
      const serializedIntent = JSON.stringify(normalizedIntent)
      cachedPromptResumeIntentRaw = serializedIntent
      cachedPromptResumeIntent = normalizedIntent
      window.localStorage.setItem(PROMPT_RESUME_INTENT_STORAGE_KEY, serializedIntent)
    } else {
      cachedPromptResumeIntentRaw = null
      cachedPromptResumeIntent = null
      window.localStorage.removeItem(PROMPT_RESUME_INTENT_STORAGE_KEY)
    }
    emitPromptResumeIntentStorageChange()
  }

  return normalizedIntent
}

export function clearPromptResumeIntent(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(PROMPT_RESUME_INTENT_STORAGE_KEY)
  cachedPromptResumeIntentRaw = null
  cachedPromptResumeIntent = null
  emitPromptResumeIntentStorageChange()
}

export function subscribePromptResumeIntent(
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
    if (event.key === null || event.key === PROMPT_RESUME_INTENT_STORAGE_KEY) {
      onStoreChange()
    }
  }
  const handleLocalStorageChange = () => {
    onStoreChange()
  }

  window.addEventListener('storage', handleStorageChange)
  window.addEventListener(
    PROMPT_RESUME_INTENT_STORAGE_EVENT,
    handleLocalStorageChange,
  )

  return () => {
    window.removeEventListener('storage', handleStorageChange)
    window.removeEventListener(
      PROMPT_RESUME_INTENT_STORAGE_EVENT,
      handleLocalStorageChange,
    )
  }
}

export function getPromptSignInReturnIntent(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  return normalizeOptionalText(
    window.localStorage.getItem(PROMPT_SIGN_IN_RETURN_INTENT_STORAGE_KEY),
  )
}

export function savePromptSignInReturnIntent(createdAt = new Date().toISOString()): string {
  const normalizedCreatedAt = normalizeCreatedAt(createdAt)
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PROMPT_SIGN_IN_RETURN_INTENT_STORAGE_KEY, normalizedCreatedAt)
    emitPromptSignInReturnIntentStorageChange()
  }

  return normalizedCreatedAt
}

export function clearPromptSignInReturnIntent(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(PROMPT_SIGN_IN_RETURN_INTENT_STORAGE_KEY)
  emitPromptSignInReturnIntentStorageChange()
}

export function subscribePromptSignInReturnIntent(
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
    if (event.key === null || event.key === PROMPT_SIGN_IN_RETURN_INTENT_STORAGE_KEY) {
      onStoreChange()
    }
  }
  const handleLocalStorageChange = () => {
    onStoreChange()
  }

  window.addEventListener('storage', handleStorageChange)
  window.addEventListener(
    PROMPT_SIGN_IN_RETURN_INTENT_STORAGE_EVENT,
    handleLocalStorageChange,
  )

  return () => {
    window.removeEventListener('storage', handleStorageChange)
    window.removeEventListener(
      PROMPT_SIGN_IN_RETURN_INTENT_STORAGE_EVENT,
      handleLocalStorageChange,
    )
  }
}

export function formatPromptResumeIntentLabel(intent: PromptResumeIntent): string {
  const normalizedDraft = intent.draft.replace(/\s+/g, ' ').trim()
  if (normalizedDraft.length <= 64) {
    return `your prompt: "${normalizedDraft}"`
  }

  return `your prompt: "${normalizedDraft.slice(0, 61)}..."`
}
