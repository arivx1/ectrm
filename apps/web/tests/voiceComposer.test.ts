import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  collectVoiceComposerTranscript,
  describeVoiceComposerError,
  mergeVoiceComposerDraft,
  resolveVoiceComposerSupport,
  resolveVoiceRecorderMimeType,
  resolveVoiceRecorderSupport,
  resolveVoiceRecordingFileExtension,
  type VoiceComposerRecognitionResultListLike,
} from '../src/shared/voiceComposer'

class MockSpeechRecognition {
  continuous = false
  interimResults = false
  lang = 'en-US'
  onstart = null
  onend = null
  onerror = null
  onresult = null

  start() {}

  stop() {}

  abort() {}
}

test('voice composer detects browser speech recognition support', () => {
  assert.equal(resolveVoiceComposerSupport(null), false)
  assert.equal(resolveVoiceComposerSupport({}), false)
  assert.equal(resolveVoiceComposerSupport({ SpeechRecognition: MockSpeechRecognition }), true)
  assert.equal(resolveVoiceComposerSupport({ webkitSpeechRecognition: MockSpeechRecognition }), true)
})

test('voice composer detects recorder support when media devices and MediaRecorder exist', () => {
  assert.equal(resolveVoiceRecorderSupport(null), false)
  assert.equal(resolveVoiceRecorderSupport({}), false)
  assert.equal(
    resolveVoiceRecorderSupport({
      mediaRecorder: {},
      navigator: {
        mediaDevices: {
          getUserMedia: async () => ({
            getTracks: () => [],
          }),
        },
      },
    }),
    true,
  )
})

test('voice composer selects a recorder mime type the backend accepts', () => {
  const mimeType = resolveVoiceRecorderMimeType(
    {
      isTypeSupported: (candidate) => candidate === 'audio/webm;codecs=opus' || candidate === 'audio/webm',
    },
    ['audio/webm', 'audio/mp4'],
  )

  assert.equal(mimeType, 'audio/webm;codecs=opus')
  assert.equal(resolveVoiceRecordingFileExtension('audio/webm;codecs=opus'), 'webm')
  assert.equal(resolveVoiceRecordingFileExtension('audio/mp4'), 'mp4')
})

test('voice composer merges transcript text into an existing draft', () => {
  assert.equal(mergeVoiceComposerDraft('', 'summarize exposure'), 'summarize exposure')
  assert.equal(
    mergeVoiceComposerDraft('Please help', 'summarize exposure'),
    'Please help summarize exposure',
  )
  assert.equal(
    mergeVoiceComposerDraft('Please help\n', 'summarize exposure'),
    'Please help\nsummarize exposure',
  )
  assert.equal(mergeVoiceComposerDraft('Please help', '   '), 'Please help')
})

test('voice composer separates final and interim transcript chunks', () => {
  const results = {
    length: 3,
    0: {
      length: 1,
      isFinal: true,
      0: { transcript: 'Show me' },
    },
    1: {
      length: 1,
      isFinal: true,
      0: { transcript: 'open invoices' },
    },
    2: {
      length: 1,
      isFinal: false,
      0: { transcript: 'for today' },
    },
  } satisfies VoiceComposerRecognitionResultListLike

  assert.deepEqual(collectVoiceComposerTranscript(results), {
    finalTranscript: 'Show me open invoices',
    interimTranscript: 'for today',
  })
})

test('voice composer maps common browser errors to readable messages', () => {
  assert.match(describeVoiceComposerError('audio-capture'), /No microphone input/)
  assert.match(describeVoiceComposerError('not-allowed'), /Microphone access was blocked/)
  assert.match(describeVoiceComposerError('no-speech'), /No speech was detected/)
  assert.match(describeVoiceComposerError('anything-else'), /Voice dictation stopped unexpectedly/)
})
