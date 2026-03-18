export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const text = await response.text()
    if (text) {
      let payload:
        | {
            detail?: unknown
            error?: {
              message?: unknown
            }
          }
        | null = null

      try {
        payload = JSON.parse(text) as {
          detail?: unknown
          error?: {
            message?: unknown
          }
        }
      } catch {
        // Fall back to the raw response body when it is not valid JSON.
      }

      if (typeof payload?.detail === 'string' && payload.detail.trim()) {
        throw new Error(payload.detail)
      }

      if (typeof payload?.error?.message === 'string' && payload.error.message.trim()) {
        throw new Error(payload.error.message)
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
