import { useCallback, useEffect, useRef, useState } from 'react'

type VoicePlaybackUtteranceErrorEventLike = {
  error?: string | null
}

type VoicePlaybackUtteranceLike = {
  lang: string
  onend: (() => void) | null
  onerror: ((event: VoicePlaybackUtteranceErrorEventLike) => void) | null
}

type VoicePlaybackUtteranceConstructor = new (text: string) => VoicePlaybackUtteranceLike

type VoicePlaybackEngineLike = {
  cancel(): void
  speak(utterance: VoicePlaybackUtteranceLike): void
}

type VoicePlaybackAudioLike = {
  currentTime: number
  onended: (() => void) | null
  onerror: (() => void) | null
  pause(): void
  play(): Promise<void> | void
}

type VoicePlaybackAudioConstructor = new (src?: string) => VoicePlaybackAudioLike

type VoicePlaybackBrowserLike = {
  Audio?: VoicePlaybackAudioConstructor
  speechSynthesis?: VoicePlaybackEngineLike
  SpeechSynthesisUtterance?: VoicePlaybackUtteranceConstructor
  URL?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>
}

type VoicePlaybackBackendSynthesisOptions = {
  enabled: boolean
  synthesizeAudio(text: string): Promise<Blob>
}

type UseVoicePlaybackOptions = {
  backendSynthesis?: VoicePlaybackBackendSynthesisOptions
  language?: string
}

type VoicePlaybackController = {
  activePlaybackId: string | null
  supported: boolean
  canPlay(text: string): boolean
  isPlaying(messageId: string): boolean
  stopPlayback(): void
  togglePlayback(messageId: string, text: string): void
}

export function normalizeVoicePlaybackText(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().replace(/\s+/g, ' ')
}

function resolveVoicePlaybackEngine(
  browser: Partial<VoicePlaybackBrowserLike> | null | undefined,
): VoicePlaybackEngineLike | null {
  return browser?.speechSynthesis ?? null
}

function resolveVoicePlaybackUtteranceConstructor(
  browser: Partial<VoicePlaybackBrowserLike> | null | undefined,
): VoicePlaybackUtteranceConstructor | null {
  return browser?.SpeechSynthesisUtterance ?? null
}

function resolveVoicePlaybackAudioConstructor(
  browser: Partial<VoicePlaybackBrowserLike> | null | undefined,
): VoicePlaybackAudioConstructor | null {
  return browser?.Audio ?? null
}

function resolveVoicePlaybackUrlHandle(
  browser: Partial<VoicePlaybackBrowserLike> | null | undefined,
): Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> | null {
  if (browser?.URL) {
    return browser.URL
  }

  if (typeof URL === 'undefined') {
    return null
  }

  return URL
}

export function resolveVoiceAudioPlaybackSupport(
  browser: Partial<VoicePlaybackBrowserLike> | null | undefined,
): boolean {
  return Boolean(
    resolveVoicePlaybackAudioConstructor(browser) &&
      resolveVoicePlaybackUrlHandle(browser),
  )
}

export function resolveVoicePlaybackSupport(
  browser: Partial<VoicePlaybackBrowserLike> | null | undefined,
  backendSynthesisEnabled = false,
): boolean {
  return Boolean(
    resolveVoicePlaybackEngine(browser) &&
      resolveVoicePlaybackUtteranceConstructor(browser),
  ) || (backendSynthesisEnabled && resolveVoiceAudioPlaybackSupport(browser))
}

export function resolveVoicePlaybackButtonLabel(isPlaying: boolean): string {
  return isPlaying ? 'Stop Reading' : 'Read Aloud'
}

export function useVoicePlayback({
  backendSynthesis,
  language = 'en-US',
}: UseVoicePlaybackOptions = {}): VoicePlaybackController {
  const browser =
    typeof window === 'undefined'
      ? null
      : (window as Partial<VoicePlaybackBrowserLike>)
  const speechSynthesisSupported = Boolean(
    resolveVoicePlaybackEngine(browser) &&
      resolveVoicePlaybackUtteranceConstructor(browser),
  )
  const backendAudioSupported = Boolean(
    backendSynthesis?.enabled && resolveVoiceAudioPlaybackSupport(browser),
  )
  const supported = resolveVoicePlaybackSupport(browser, Boolean(backendSynthesis?.enabled))
  const activePlaybackSessionRef = useRef(0)
  const activePlaybackIdRef = useRef<string | null>(null)
  const audioPlaybackRef = useRef<VoicePlaybackAudioLike | null>(null)
  const audioPlaybackUrlRef = useRef<string | null>(null)
  const [activePlaybackId, setActivePlaybackId] = useState<string | null>(null)

  const releaseAudioPlayback = useCallback(() => {
    if (audioPlaybackRef.current) {
      try {
        audioPlaybackRef.current.pause()
        audioPlaybackRef.current.currentTime = 0
      } catch {
        // Ignore browser audio cleanup failures.
      }

      audioPlaybackRef.current.onended = null
      audioPlaybackRef.current.onerror = null
      audioPlaybackRef.current = null
    }

    const objectUrl = audioPlaybackUrlRef.current
    if (objectUrl) {
      try {
        resolveVoicePlaybackUrlHandle(browser)?.revokeObjectURL(objectUrl)
      } catch {
        // Ignore browser object URL cleanup failures.
      }

      audioPlaybackUrlRef.current = null
    }
  }, [browser])

  const stopPlayback = useCallback(() => {
    activePlaybackSessionRef.current += 1
    activePlaybackIdRef.current = null
    setActivePlaybackId(null)

    try {
      resolveVoicePlaybackEngine(browser)?.cancel()
    } catch {
      // Ignore browser speech synthesis cancellation failures.
    }

    releaseAudioPlayback()
  }, [browser, releaseAudioPlayback])

  useEffect(() => {
    return () => {
      stopPlayback()
    }
  }, [stopPlayback])

  const canPlay = useCallback((text: string) => normalizeVoicePlaybackText(text).length > 0, [])

  const isPlaying = useCallback((messageId: string) => activePlaybackId === messageId, [activePlaybackId])

  const togglePlayback = useCallback(
    (messageId: string, text: string) => {
      const normalizedText = normalizeVoicePlaybackText(text)
      if (!normalizedText) {
        return
      }

      if (activePlaybackIdRef.current === messageId) {
        stopPlayback()
        return
      }

      activePlaybackSessionRef.current += 1
      const playbackSession = activePlaybackSessionRef.current
      activePlaybackIdRef.current = messageId
      setActivePlaybackId(messageId)

      const playbackEngine = resolveVoicePlaybackEngine(browser)
      const Utterance = resolveVoicePlaybackUtteranceConstructor(browser)
      if (speechSynthesisSupported && playbackEngine && Utterance) {
        releaseAudioPlayback()

        try {
          playbackEngine.cancel()
        } catch {
          // Ignore cancellation failures before starting the next utterance.
        }

        const utterance = new Utterance(normalizedText)
        utterance.lang = language
        utterance.onend = () => {
          if (activePlaybackSessionRef.current !== playbackSession) {
            return
          }

          activePlaybackIdRef.current = null
          setActivePlaybackId(null)
        }
        utterance.onerror = () => {
          if (activePlaybackSessionRef.current !== playbackSession) {
            return
          }

          activePlaybackIdRef.current = null
          setActivePlaybackId(null)
        }

        try {
          playbackEngine.speak(utterance)
          return
        } catch {
          activePlaybackIdRef.current = null
          setActivePlaybackId(null)
          return
        }
      }

      if (!backendAudioSupported || !backendSynthesis?.enabled) {
        activePlaybackIdRef.current = null
        setActivePlaybackId(null)
        return
      }

      try {
        playbackEngine?.cancel()
      } catch {
        // Ignore cancellation failures before starting the next utterance.
      }
      releaseAudioPlayback()

      void (async () => {
        try {
          const audioBlob = await backendSynthesis.synthesizeAudio(normalizedText)
          if (activePlaybackSessionRef.current !== playbackSession) {
            return
          }

          const AudioConstructor = resolveVoicePlaybackAudioConstructor(browser)
          const urlHandle = resolveVoicePlaybackUrlHandle(browser)
          if (!AudioConstructor || !urlHandle) {
            activePlaybackIdRef.current = null
            setActivePlaybackId(null)
            return
          }

          const objectUrl = urlHandle.createObjectURL(audioBlob)
          audioPlaybackUrlRef.current = objectUrl

          const audio = new AudioConstructor(objectUrl)
          audioPlaybackRef.current = audio
          audio.onended = () => {
            if (activePlaybackSessionRef.current !== playbackSession) {
              return
            }

            activePlaybackIdRef.current = null
            setActivePlaybackId(null)
            releaseAudioPlayback()
          }
          audio.onerror = () => {
            if (activePlaybackSessionRef.current !== playbackSession) {
              return
            }

            activePlaybackIdRef.current = null
            setActivePlaybackId(null)
            releaseAudioPlayback()
          }

          await audio.play()
        } catch {
          if (activePlaybackSessionRef.current !== playbackSession) {
            return
          }

          activePlaybackIdRef.current = null
          setActivePlaybackId(null)
          releaseAudioPlayback()
        }
      })()
    },
    [backendAudioSupported, backendSynthesis, browser, language, releaseAudioPlayback, speechSynthesisSupported, stopPlayback],
  )

  return {
    activePlaybackId,
    supported,
    canPlay,
    isPlaying,
    stopPlayback,
    togglePlayback,
  }
}
