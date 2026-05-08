export type GoogleCredentialResponse = {
  credential: string
}

export type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
  scope?: string
  token_type?: string
}

export type GoogleOAuthErrorResponse = {
  type: string
  message?: string
}

type GoogleCredentialCallback = (response: GoogleCredentialResponse) => void
type GoogleTokenCallback = (response: GoogleTokenResponse) => void
type GoogleTokenErrorCallback = (response: GoogleOAuthErrorResponse) => void

type GoogleButtonOptions = Record<string, string | number | boolean>

export type GoogleTokenClient = {
  requestAccessToken: (options?: {
    prompt?: '' | 'consent'
  }) => void
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: {
            client_id: string
            callback: GoogleCredentialCallback
            cancel_on_tap_outside?: boolean
          }) => void
          renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void
        }
        oauth2?: {
          initTokenClient: (options: {
            client_id: string
            scope: string
            callback: GoogleTokenCallback
            error_callback?: GoogleTokenErrorCallback
          }) => GoogleTokenClient
          revoke: (token: string, callback?: () => void) => void
        }
      }
    }
  }
}

let googleIdentityScriptPromise: Promise<void> | null = null

export function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google sign-in is only available in the browser.'))
  }

  if (window.google?.accounts?.id || window.google?.accounts?.oauth2) {
    return Promise.resolve()
  }

  if (googleIdentityScriptPromise) {
    return googleIdentityScriptPromise
  }

  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]')
    const script = existingScript ?? document.createElement('script')

    const handleLoad = () => {
      if (window.google?.accounts?.id || window.google?.accounts?.oauth2) {
        resolve()
        return
      }

      googleIdentityScriptPromise = null
      reject(new Error('Google sign-in did not finish loading.'))
    }

    const handleError = () => {
      googleIdentityScriptPromise = null
      reject(new Error('Could not load the Google sign-in script.'))
    }

    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })

    if (!existingScript) {
      script.dataset.googleIdentity = 'true'
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  })

  return googleIdentityScriptPromise
}
