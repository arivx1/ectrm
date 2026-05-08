export class ApiError extends Error {
  status: number
  correlationId: string | null

  constructor(message: string, init?: { status?: number; correlationId?: string | null }) {
    super(formatApiErrorMessage(message, init?.correlationId))
    this.name = 'ApiError'
    this.status = init?.status ?? 0
    this.correlationId = init?.correlationId?.trim() || null
  }
}

function formatApiErrorMessage(message: string, correlationId?: string | null): string {
  const normalizedMessage = message.trim() || 'Request failed.'
  const normalizedCorrelationId = correlationId?.trim()

  if (!normalizedCorrelationId) {
    return normalizedMessage
  }

  const suffix = `Correlation ID: ${normalizedCorrelationId}`
  if (normalizedMessage.includes(suffix)) {
    return normalizedMessage
  }

  return `${normalizedMessage} ${suffix}`
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function appendUniqueUrl(urls: string[], candidate: string): void {
  if (!urls.includes(candidate)) {
    urls.push(candidate)
  }
}

function resolveApiFallbackUrls(url: string): string[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const parsedUrl = new URL(url, window.location.href)
    const fallbackUrls: string[] = []

    if (isLoopbackHost(parsedUrl.hostname)) {
      const alternateLoopbackUrl = new URL(parsedUrl.toString())
      alternateLoopbackUrl.hostname = parsedUrl.hostname === 'localhost' ? '127.0.0.1' : 'localhost'
      appendUniqueUrl(fallbackUrls, alternateLoopbackUrl.toString())
    }

    if (isLoopbackHost(parsedUrl.hostname) && !isLoopbackHost(window.location.hostname)) {
      const browserHostnameUrl = new URL(parsedUrl.toString())
      browserHostnameUrl.hostname = window.location.hostname
      appendUniqueUrl(fallbackUrls, browserHostnameUrl.toString())
    }

    return fallbackUrls
  } catch {
    return []
  }
}

async function fetchWithApiFallback(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error) {
    const fallbackUrls = resolveApiFallbackUrls(url)
    for (const fallbackUrl of fallbackUrls) {
      try {
        return await fetch(fallbackUrl, init)
      } catch {
        // Try the next loopback alias before surfacing the connection issue.
      }
    }

    const attemptedUrls = [url, ...fallbackUrls].filter(
      (candidate, index, values) => values.indexOf(candidate) === index,
    )

    if (attemptedUrls.length > 1) {
      throw new Error(`Could not reach API at ${attemptedUrls.join(' or ')}.`)
    }

    if (error instanceof Error) {
      throw new Error(`Could not reach API at ${url}. ${error.message}`)
    }

    throw new Error(`Could not reach API at ${url}.`)
  }
}

export function getResponseCorrelationId(response: Pick<Response, 'headers'>): string | null {
  const headerValue = response.headers.get('x-correlation-id')
  return headerValue?.trim() || null
}

function extractPayloadCorrelationId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidate = payload as {
    correlation_id?: unknown
    error?: {
      correlation_id?: unknown
    }
  }

  if (typeof candidate.correlation_id === 'string' && candidate.correlation_id.trim()) {
    return candidate.correlation_id
  }

  if (typeof candidate.error?.correlation_id === 'string' && candidate.error.correlation_id.trim()) {
    return candidate.error.correlation_id
  }

  return null
}

function extractApiErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidate = payload as {
    detail?: unknown
    error?: {
      message?: unknown
    }
  }

  if (typeof candidate.detail === 'string' && candidate.detail.trim()) {
    return candidate.detail
  }

  if (Array.isArray(candidate.detail)) {
    const messages = candidate.detail
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null
        }

        const maybeMessage = (item as { msg?: unknown }).msg
        return typeof maybeMessage === 'string' && maybeMessage.trim() ? maybeMessage : null
      })
      .filter((message): message is string => Boolean(message))

    if (messages.length > 0) {
      return messages.join('. ')
    }
  }

  if (typeof candidate.error?.message === 'string' && candidate.error.message.trim()) {
    return candidate.error.message
  }

  return null
}

export function createApiError(
  message: string,
  init?: { status?: number; correlationId?: string | null },
): ApiError {
  return new ApiError(message, init)
}

export async function buildApiError(response: Response): Promise<ApiError> {
  const responseCorrelationId = getResponseCorrelationId(response)
  const text = await response.text()
  if (text) {
    let payload: unknown = null

    try {
      payload = JSON.parse(text)
    } catch {
      // Fall back to the raw response body when it is not valid JSON.
    }

    const errorMessage = extractApiErrorMessage(payload)
    const payloadCorrelationId = extractPayloadCorrelationId(payload)
    const correlationId = responseCorrelationId || payloadCorrelationId
    if (errorMessage) {
      return createApiError(errorMessage, {
        status: response.status,
        correlationId,
      })
    }

    return createApiError(text, {
      status: response.status,
      correlationId,
    })
  }

  return createApiError(`Request failed: ${response.status}`, {
    status: response.status,
    correlationId: responseCorrelationId,
  })
}

export async function requestOk(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetchWithApiFallback(url, init)
  if (!response.ok) {
    throw await buildApiError(response)
  }

  return response
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await requestOk(url, init)
  if (response.status === 204 || response.status === 205) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

function mergeHeaders(
  baseHeaders: HeadersInit | undefined,
  extraHeaders?: Record<string, string>,
): Headers {
  const merged = new Headers(baseHeaders)
  for (const [name, value] of Object.entries(extraHeaders ?? {})) {
    merged.set(name, value)
  }
  return merged
}


export async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  init?: Omit<RequestInit, 'body' | 'method'>,
): Promise<T> {
  return fetchJson<T>(url, {
    ...init,
    method: 'POST',
    headers: mergeHeaders(init?.headers, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
}

export async function putJson<T>(
  url: string,
  body: Record<string, unknown>,
  init?: Omit<RequestInit, 'body' | 'method'>,
): Promise<T> {
  return fetchJson<T>(url, {
    ...init,
    method: 'PUT',
    headers: mergeHeaders(init?.headers, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
}

export async function patchJson<T>(
  url: string,
  body: Record<string, unknown>,
  init?: Omit<RequestInit, 'body' | 'method'>,
): Promise<T> {
  return fetchJson<T>(url, {
    ...init,
    method: 'PATCH',
    headers: mergeHeaders(init?.headers, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
}

export async function postFormData<T>(
  url: string,
  body: FormData,
  init?: Omit<RequestInit, 'body' | 'method'>,
): Promise<T> {
  return fetchJson<T>(url, {
    ...init,
    method: 'POST',
    body,
  })
}
