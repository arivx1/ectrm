import { useEffect, useEffectEvent, useRef, useState } from 'react'

export type VoiceComposerRecognitionAlternativeLike = {
  transcript?: string | null
}

export type VoiceComposerRecognitionResultLike = {
  length: number
  isFinal: boolean
  [index: number]: VoiceComposerRecognitionAlternativeLike
}

export type VoiceComposerRecognitionResultListLike = {
  length: number
  [index: number]: VoiceComposerRecognitionResultLike
}

type VoiceComposerRecognitionEventLike = {
  results: VoiceComposerRecognitionResultListLike
}

type VoiceComposerRecognitionErrorEventLike = {
  error?: string | null
}

type VoiceComposerRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: VoiceComposerRecognitionErrorEventLike) => void) | null
  onresult: ((event: VoiceComposerRecognitionEventLike) => void) | null
  start(): void
  stop(): void
  abort(): void
}

type VoiceComposerRecognitionConstructor = new () => VoiceComposerRecognitionLike

type VoiceComposerBrowserLike = {
  SpeechRecognition?: VoiceComposerRecognitionConstructor
  webkitSpeechRecognition?: VoiceComposerRecognitionConstructor
}

type VoiceRecorderSupportLike = {
  isTypeSupported?(candidate: string): boolean
}

type VoiceRecorderBrowserLike = {
  MediaRecorder?: typeof MediaRecorder
  mediaRecorder?: VoiceRecorderSupportLike | null
  navigator?: {
    mediaDevices?: {
      getUserMedia?(constraints: MediaStreamConstraints): Promise<MediaStream>
    }
  }
}

type VoiceComposerStatusTone = 'default' | 'error'

type VoiceComposerBackendTranscriptionOptions = {
  enabled: boolean
  supportedContentTypes: string[]
  transcribeAudio(audioFile: File): Promise<string>
  unavailableMessage?: string
}

type UseVoiceComposerOptions = {
  draft: string
  onDraftChange(nextDraft: string): void
  language?: string
  backendTranscription?: VoiceComposerBackendTranscriptionOptions
}

type VoiceComposerController = {
  buttonLabel: string
  canToggle: boolean
  listening: boolean
  statusMessage: string
  statusTone: VoiceComposerStatusTone
  cancelListening(): void
  toggleListening(): void
}

const READY_STATUS_MESSAGE = 'Use your microphone to dictate the prompt.'
const RECORDING_READY_STATUS_MESSAGE = 'Record a short voice note and we will transcribe it into the prompt.'
const LISTENING_STATUS_MESSAGE = 'Listening... speak now.'
const RECORDING_STATUS_MESSAGE = 'Recording... tap again to stop.'
const TRANSCRIBING_STATUS_MESSAGE = 'Transcribing voice note...'
const UNSUPPORTED_STATUS_MESSAGE = 'Voice dictation is not supported in this browser.'

const VOICE_RECORDER_MIME_TYPE_CANDIDATES: Record<string, string[]> = {
  'audio/mp4': ['audio/mp4'],
  'audio/mpeg': ['audio/mpeg', 'audio/mp3'],
  'audio/ogg': ['audio/ogg;codecs=opus', 'audio/ogg'],
  'audio/wav': ['audio/wav', 'audio/wave'],
  'audio/webm': ['audio/webm;codecs=opus', 'audio/webm'],
}

function normalizeVoiceComposerText(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().replace(/\s+/g, ' ')
}

function normalizeOptionalVoiceMessage(value: unknown): string | null {
  const normalizedValue = normalizeVoiceComposerText(value)
  return normalizedValue ? normalizedValue : null
}

function resolveVoiceComposerConstructor(
  browser: Partial<VoiceComposerBrowserLike> | null | undefined,
): VoiceComposerRecognitionConstructor | null {
  if (!browser) {
    return null
  }

  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null
}

function buildVoiceRecorderMimeTypeCandidates(supportedContentTypes: string[]): string[] {
  const uniqueCandidates = new Set<string>()
  const normalizedContentTypes =
    supportedContentTypes.length > 0 ? supportedContentTypes : ['audio/webm']

  normalizedContentTypes.forEach((contentType) => {
    const normalizedContentType = normalizeVoiceComposerText(contentType).toLowerCase()
    const candidates =
      VOICE_RECORDER_MIME_TYPE_CANDIDATES[normalizedContentType] ?? [normalizedContentType]

    candidates.forEach((candidate) => {
      if (candidate) {
        uniqueCandidates.add(candidate)
      }
    })
  })

  return Array.from(uniqueCandidates)
}

function resolveVoiceRecorderSupportHandle(
  browser: Partial<VoiceRecorderBrowserLike> | null | undefined,
): VoiceRecorderSupportLike | typeof MediaRecorder | null {
  if (!browser) {
    return null
  }

  return browser.MediaRecorder ?? browser.mediaRecorder ?? null
}

function resolveVoiceRecorderUnavailableMessage(
  backendTranscription: VoiceComposerBackendTranscriptionOptions | undefined,
): string {
  return normalizeOptionalVoiceMessage(backendTranscription?.unavailableMessage) ?? UNSUPPORTED_STATUS_MESSAGE
}

function stopVoiceRecorderStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}

function resolveVoiceRecordingMode(
  speechRecognitionSupported: boolean,
  recorderSupported: boolean,
  backendTranscription: VoiceComposerBackendTranscriptionOptions | undefined,
): 'speech' | 'record' | 'none' {
  if (speechRecognitionSupported) {
    return 'speech'
  }

  if (backendTranscription?.enabled && recorderSupported) {
    return 'record'
  }

  return 'none'
}

export function resolveVoiceComposerSupport(
  browser: Partial<VoiceComposerBrowserLike> | null | undefined,
): boolean {
  return resolveVoiceComposerConstructor(browser) !== null
}

export function resolveVoiceRecorderSupport(
  browser: Partial<VoiceRecorderBrowserLike> | null | undefined,
): boolean {
  return Boolean(resolveVoiceRecorderSupportHandle(browser) && browser?.navigator?.mediaDevices?.getUserMedia)
}

export function resolveVoiceRecorderMimeType(
  recorder: VoiceRecorderSupportLike | null | undefined,
  supportedContentTypes: string[],
): string | null {
  const candidates = buildVoiceRecorderMimeTypeCandidates(supportedContentTypes)
  if (candidates.length === 0) {
    return null
  }

  if (typeof recorder?.isTypeSupported !== 'function') {
    return candidates[0] ?? null
  }

  return candidates.find((candidate) => recorder.isTypeSupported?.(candidate)) ?? null
}

export function resolveVoiceRecordingFileExtension(mimeType: string): string {
  const normalizedMimeType = mimeType.split(';', 1)[0]?.trim().toLowerCase()

  switch (normalizedMimeType) {
    case 'audio/mp3':
    case 'audio/mpeg':
      return 'mp3'
    case 'audio/mp4':
      return 'mp4'
    case 'audio/ogg':
      return 'ogg'
    case 'audio/wav':
    case 'audio/wave':
      return 'wav'
    case 'audio/webm':
    default:
      return 'webm'
  }
}

export function mergeVoiceComposerDraft(existingDraft: string, transcript: string): string {
  const normalizedTranscript = normalizeVoiceComposerText(transcript)
  if (!normalizedTranscript) {
    return existingDraft
  }

  if (!existingDraft) {
    return normalizedTranscript
  }

  if (/\n\s*$/.test(existingDraft)) {
    return `${existingDraft}${normalizedTranscript}`
  }

  if (/\s$/.test(existingDraft)) {
    return `${existingDraft}${normalizedTranscript}`
  }

  return `${existingDraft} ${normalizedTranscript}`
}

export function collectVoiceComposerTranscript(
  results: VoiceComposerRecognitionResultListLike,
): {
  finalTranscript: string
  interimTranscript: string
} {
  const finalChunks: string[] = []
  const interimChunks: string[] = []

  for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
    const result = results[resultIndex]
    if (!result || typeof result.length !== 'number') {
      continue
    }

    const transcriptChunks: string[] = []
    for (let alternativeIndex = 0; alternativeIndex < result.length; alternativeIndex += 1) {
      const transcript = normalizeVoiceComposerText(result[alternativeIndex]?.transcript)
      if (transcript) {
        transcriptChunks.push(transcript)
      }
    }

    const transcript = transcriptChunks.join(' ').trim()
    if (!transcript) {
      continue
    }

    if (result.isFinal) {
      finalChunks.push(transcript)
    } else {
      interimChunks.push(transcript)
    }
  }

  return {
    finalTranscript: finalChunks.join(' ').trim(),
    interimTranscript: interimChunks.join(' ').trim(),
  }
}

export function describeVoiceComposerError(error: string | null | undefined): string {
  switch (error) {
    case 'aborted':
      return 'Voice dictation was canceled.'
    case 'audio-capture':
      return 'No microphone input was detected. Check your microphone and try again.'
    case 'network':
      return 'Voice dictation lost network access. Please try again.'
    case 'no-speech':
      return 'No speech was detected. Try speaking a little closer to the microphone.'
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was blocked. Allow microphone access and try again.'
    default:
      return 'Voice dictation stopped unexpectedly. Please try again.'
  }
}

export function useVoiceComposer({
  draft,
  onDraftChange,
  language = 'en-US',
  backendTranscription,
}: UseVoiceComposerOptions): VoiceComposerController {
  const browser =
    typeof window === 'undefined'
      ? null
      : (window as Partial<VoiceComposerBrowserLike & VoiceRecorderBrowserLike>)
  const speechRecognitionSupported = resolveVoiceComposerSupport(browser)
  const recorderSupported = resolveVoiceRecorderSupport(browser)
  const recordingMode = resolveVoiceRecordingMode(
    speechRecognitionSupported,
    recorderSupported,
    backendTranscription,
  )
  const idleStatusMessage =
    recordingMode === 'speech'
      ? READY_STATUS_MESSAGE
      : recordingMode === 'record'
        ? RECORDING_READY_STATUS_MESSAGE
        : resolveVoiceRecorderUnavailableMessage(backendTranscription)

  const recognitionRef = useRef<VoiceComposerRecognitionLike | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recorderChunksRef = useRef<BlobPart[]>([])
  const recorderMimeTypeRef = useRef<string | null>(null)
  const draftRef = useRef(draft)
  const committedTranscriptRef = useRef('')
  const canceledRef = useRef(false)
  const sessionCapturedTranscriptRef = useRef(false)
  const sessionFailedRef = useRef(false)

  const [listening, setListening] = useState(false)
  const [statusTone, setStatusTone] = useState<VoiceComposerStatusTone>('default')
  const [statusMessage, setStatusMessage] = useState(idleStatusMessage)

  draftRef.current = draft

  useEffect(() => {
    if (listening || statusTone === 'error') {
      return
    }

    setStatusMessage(idleStatusMessage)
  }, [idleStatusMessage, listening, statusTone])

  const resetRecorderSession = useEffectEvent(() => {
    recorderChunksRef.current = []
    recorderMimeTypeRef.current = null
    mediaRecorderRef.current = null
    stopVoiceRecorderStream(mediaStreamRef.current)
    mediaStreamRef.current = null
  })

  const handleRecognitionStart = useEffectEvent(() => {
    canceledRef.current = false
    sessionFailedRef.current = false
    setListening(true)
    setStatusTone('default')
    setStatusMessage(LISTENING_STATUS_MESSAGE)
  })

  const handleRecognitionEnd = useEffectEvent(() => {
    setListening(false)
    committedTranscriptRef.current = ''

    if (sessionFailedRef.current) {
      sessionFailedRef.current = false
      sessionCapturedTranscriptRef.current = false
      return
    }

    if (canceledRef.current) {
      canceledRef.current = false
      sessionCapturedTranscriptRef.current = false
      setStatusTone('default')
      setStatusMessage(idleStatusMessage)
      return
    }

    setStatusTone('default')
    setStatusMessage(
      sessionCapturedTranscriptRef.current
        ? 'Voice draft captured.'
        : 'Voice dictation ended without any transcript.',
    )
    sessionCapturedTranscriptRef.current = false
  })

  const handleRecognitionError = useEffectEvent((event: VoiceComposerRecognitionErrorEventLike) => {
    sessionFailedRef.current = true
    sessionCapturedTranscriptRef.current = false
    setListening(false)
    setStatusTone('error')
    setStatusMessage(describeVoiceComposerError(event.error))
  })

  const handleRecognitionResult = useEffectEvent((event: VoiceComposerRecognitionEventLike) => {
    const { finalTranscript, interimTranscript } = collectVoiceComposerTranscript(event.results)
    const previousCommittedTranscript = committedTranscriptRef.current
    let appendedTranscript = finalTranscript

    if (previousCommittedTranscript && finalTranscript.startsWith(previousCommittedTranscript)) {
      appendedTranscript = finalTranscript.slice(previousCommittedTranscript.length).trim()
    }

    if (appendedTranscript) {
      const nextDraft = mergeVoiceComposerDraft(draftRef.current, appendedTranscript)
      draftRef.current = nextDraft
      onDraftChange(nextDraft)
      committedTranscriptRef.current = finalTranscript
      sessionCapturedTranscriptRef.current = true
    }

    setStatusTone('default')
    setStatusMessage(
      interimTranscript ? `Listening... ${interimTranscript}` : LISTENING_STATUS_MESSAGE,
    )
  })

  const finalizeRecording = useEffectEvent(async () => {
    const audioChunks = recorderChunksRef.current
    const mimeType = recorderMimeTypeRef.current ?? 'audio/webm'

    resetRecorderSession()
    setListening(false)

    if (sessionFailedRef.current) {
      sessionFailedRef.current = false
      return
    }

    if (canceledRef.current) {
      canceledRef.current = false
      setStatusTone('default')
      setStatusMessage(idleStatusMessage)
      return
    }

    if (!backendTranscription?.enabled) {
      setStatusTone('error')
      setStatusMessage(resolveVoiceRecorderUnavailableMessage(backendTranscription))
      return
    }

    if (audioChunks.length === 0) {
      setStatusTone('error')
      setStatusMessage('No audio was captured. Please try again.')
      return
    }

    setStatusTone('default')
    setStatusMessage(TRANSCRIBING_STATUS_MESSAGE)

    try {
      const audioBlob = new Blob(audioChunks, { type: mimeType })
      const audioFile = new File(
        [audioBlob],
        `voice-note.${resolveVoiceRecordingFileExtension(mimeType)}`,
        { type: mimeType },
      )
      const transcript = await backendTranscription.transcribeAudio(audioFile)
      const nextDraft = mergeVoiceComposerDraft(draftRef.current, transcript)
      draftRef.current = nextDraft
      onDraftChange(nextDraft)
      setStatusTone('default')
      setStatusMessage('Voice draft captured.')
    } catch (error) {
      setStatusTone('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Voice transcription failed. Please try again.',
      )
    }
  })

  useEffect(() => {
    if (!recognitionRef.current) {
      return
    }

    recognitionRef.current.lang = language
  }, [language])

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {
          // Ignore browser cleanup failures during teardown.
        }
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop()
        } catch {
          // Ignore browser cleanup failures during teardown.
        }
      }

      stopVoiceRecorderStream(mediaStreamRef.current)
    }
  }, [])

  function ensureRecognition(): VoiceComposerRecognitionLike | null {
    if (recognitionRef.current) {
      return recognitionRef.current
    }

    const Recognition = resolveVoiceComposerConstructor(browser)
    if (!Recognition) {
      return null
    }

    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = language
    recognition.onstart = handleRecognitionStart
    recognition.onend = handleRecognitionEnd
    recognition.onerror = handleRecognitionError
    recognition.onresult = handleRecognitionResult
    recognitionRef.current = recognition
    return recognition
  }

  const startRecording = useEffectEvent(async () => {
    if (!browser?.MediaRecorder || !browser.navigator?.mediaDevices?.getUserMedia) {
      setStatusTone('error')
      setStatusMessage(resolveVoiceRecorderUnavailableMessage(backendTranscription))
      return
    }

    const mimeType = resolveVoiceRecorderMimeType(
      browser.MediaRecorder,
      backendTranscription?.supportedContentTypes ?? [],
    )
    if (!mimeType) {
      setStatusTone('error')
      setStatusMessage('This browser cannot record a supported audio format for transcription.')
      return
    }

    canceledRef.current = false
    sessionFailedRef.current = false
    sessionCapturedTranscriptRef.current = false
    recorderChunksRef.current = []
    recorderMimeTypeRef.current = mimeType

    try {
      const stream = await browser.navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new browser.MediaRecorder(stream, { mimeType })

      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder
      recorder.onstart = () => {
        setListening(true)
        setStatusTone('default')
        setStatusMessage(RECORDING_STATUS_MESSAGE)
      }
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recorderChunksRef.current.push(event.data)
        }
      }
      recorder.onerror = () => {
        sessionFailedRef.current = true
        setListening(false)
        setStatusTone('error')
        setStatusMessage('Voice recording failed. Please try again.')
      }
      recorder.onstop = () => {
        void finalizeRecording()
      }
      recorder.start()
    } catch (error) {
      resetRecorderSession()
      setListening(false)
      setStatusTone('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Could not access your microphone for recording.',
      )
    }
  })

  const toggleListening = useEffectEvent(() => {
    switch (recordingMode) {
      case 'speech': {
        const recognition = ensureRecognition()
        if (!recognition) {
          setStatusTone('error')
          setStatusMessage(UNSUPPORTED_STATUS_MESSAGE)
          return
        }

        if (listening) {
          canceledRef.current = true

          try {
            recognition.stop()
          } catch {
            setListening(false)
          }
          return
        }

        committedTranscriptRef.current = ''
        sessionCapturedTranscriptRef.current = false
        sessionFailedRef.current = false
        canceledRef.current = false

        try {
          recognition.lang = language
          recognition.start()
        } catch (error) {
          setListening(false)
          setStatusTone('error')
          setStatusMessage(
            error instanceof Error
              ? error.message
              : 'Voice dictation could not start. Please try again.',
          )
        }
        return
      }

      case 'record': {
        if (listening) {
          if (!mediaRecorderRef.current) {
            setListening(false)
            return
          }

          canceledRef.current = false

          try {
            mediaRecorderRef.current.stop()
          } catch {
            resetRecorderSession()
            setListening(false)
          }
          return
        }

        void startRecording()
        return
      }

      case 'none':
      default:
        setStatusTone('error')
        setStatusMessage(resolveVoiceRecorderUnavailableMessage(backendTranscription))
    }
  })

  const cancelListening = useEffectEvent(() => {
    canceledRef.current = true
    sessionFailedRef.current = false
    sessionCapturedTranscriptRef.current = false

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort()
      } catch {
        setListening(false)
      }
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch {
        resetRecorderSession()
      }
    } else {
      resetRecorderSession()
    }

    setListening(false)
    setStatusTone('default')
    setStatusMessage(idleStatusMessage)
  })

  return {
    buttonLabel:
      listening
        ? recordingMode === 'record'
          ? 'Stop Recording'
          : 'Stop Dictation'
        : recordingMode === 'record'
          ? 'Record Voice'
          : recordingMode === 'speech'
            ? 'Use Microphone'
            : 'Voice Unavailable',
    canToggle: recordingMode !== 'none',
    listening,
    statusMessage,
    statusTone,
    cancelListening,
    toggleListening,
  }
}
