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

function resolveLoopbackFallbackUrls(url: string): string[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const parsedUrl = new URL(url, window.location.href)
    if (parsedUrl.hostname === 'localhost') {
      parsedUrl.hostname = '127.0.0.1'
      return [parsedUrl.toString()]
    }

    if (parsedUrl.hostname === '127.0.0.1') {
      parsedUrl.hostname = 'localhost'
      return [parsedUrl.toString()]
    }

    return []
  } catch {
    return []
  }
}

async function fetchWithApiFallback(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error) {
    const fallbackUrls = resolveLoopbackFallbackUrls(url)
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


export async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  init?: Omit<RequestInit, 'body' | 'method'>,
): Promise<T> {
  return fetchJson<T>(url, {
    ...init,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
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
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
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
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
  })
}
