import assert from "node:assert/strict";

import { test } from "vitest";

import {
  normalizeVoicePlaybackText,
  resolveVoiceAudioPlaybackSupport,
  resolveVoicePlaybackButtonLabel,
  resolveVoicePlaybackSupport,
} from "../src/shared/voicePlayback";

class MockSpeechSynthesisUtterance {
  lang = "en-US";
  onend: (() => void) | null = null;
  onerror: ((event: { error?: string | null }) => void) | null = null;

  constructor(text: string) {
    void text;
  }
}

class MockAudio {
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(src?: string) {
    void src;
  }

  pause() {}

  play() {}
}

test("voice playback detects browser speech synthesis support", () => {
  assert.equal(resolveVoicePlaybackSupport(null), false);
  assert.equal(resolveVoicePlaybackSupport({}), false);
  assert.equal(
    resolveVoicePlaybackSupport({
      speechSynthesis: {
        cancel() {},
        speak() {},
      },
      SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
    }),
    true,
  );
});

test("voice playback detects backend audio playback support", () => {
  assert.equal(resolveVoiceAudioPlaybackSupport(null), false);
  assert.equal(
    resolveVoiceAudioPlaybackSupport({
      Audio: MockAudio,
      URL: {
        createObjectURL: () => "blob:voice",
        revokeObjectURL: () => undefined,
      },
    }),
    true,
  );
  assert.equal(
    resolveVoicePlaybackSupport(
      {
        Audio: MockAudio,
        URL: {
          createObjectURL: () => "blob:voice",
          revokeObjectURL: () => undefined,
        },
      },
      true,
    ),
    true,
  );
});

test("voice playback normalizes message text before speaking", () => {
  assert.equal(normalizeVoicePlaybackText(null), "");
  assert.equal(normalizeVoicePlaybackText(""), "");
  assert.equal(
    normalizeVoicePlaybackText("  Summarize   the\nopen invoices.  "),
    "Summarize the open invoices.",
  );
});

test("voice playback exposes readable toggle labels", () => {
  assert.equal(resolveVoicePlaybackButtonLabel(false), "Read Aloud");
  assert.equal(resolveVoicePlaybackButtonLabel(true), "Stop Reading");
});
