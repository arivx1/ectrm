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

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithApiFallback(url, init)
  if (!response.ok) {
    const text = await response.text()
    if (text) {
      let payload: unknown = null

      try {
        payload = JSON.parse(text)
      } catch {
        // Fall back to the raw response body when it is not valid JSON.
      }

      const errorMessage = extractApiErrorMessage(payload)
      if (errorMessage) {
        throw new Error(errorMessage)
      }
    }

    throw new Error(text || `Request failed: ${response.status}`)
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
