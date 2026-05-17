export type MessagingComposerFormatAction =
  | 'bold'
  | 'italic'
  | 'link'
  | 'list'
  | 'code'

export const DEFAULT_MESSAGING_EMOJI_OPTIONS = ['👍', '✅', '👀', '🎯', '🙂'] as const
export const DEFAULT_MESSAGING_REACTION_OPTIONS = ['👍', '✅', '👀', '🔥'] as const

export type MessagingComposerSelection = {
  value: string
  selectionStart: number
  selectionEnd: number
}

export type MessagingComposerSelectionResult = {
  value: string
  selectionStart: number
  selectionEnd: number
}

function wrapSelection(
  state: MessagingComposerSelection,
  prefix: string,
  suffix: string,
  fallback: string,
): MessagingComposerSelectionResult {
  const selectedText = state.value.slice(state.selectionStart, state.selectionEnd)
  const replacement = `${prefix}${selectedText || fallback}${suffix}`
  const value = `${state.value.slice(0, state.selectionStart)}${replacement}${state.value.slice(state.selectionEnd)}`
  const cursorStart = state.selectionStart + prefix.length
  const cursorEnd = cursorStart + (selectedText || fallback).length

  return {
    value,
    selectionStart: cursorStart,
    selectionEnd: cursorEnd,
  }
}

function formatListSelection(state: MessagingComposerSelection): MessagingComposerSelectionResult {
  const selectedText = state.value.slice(state.selectionStart, state.selectionEnd) || 'List item'
  const lines = selectedText.split('\n').map((line) => `- ${line.trim() || 'List item'}`)
  const replacement = lines.join('\n')
  const value = `${state.value.slice(0, state.selectionStart)}${replacement}${state.value.slice(state.selectionEnd)}`

  return {
    value,
    selectionStart: state.selectionStart,
    selectionEnd: state.selectionStart + replacement.length,
  }
}

export function applyMessagingComposerFormat(
  state: MessagingComposerSelection,
  action: MessagingComposerFormatAction,
): MessagingComposerSelectionResult {
  switch (action) {
    case 'bold':
      return wrapSelection(state, '**', '**', 'bold text')
    case 'italic':
      return wrapSelection(state, '_', '_', 'italic text')
    case 'link':
      return wrapSelection(state, '[', '](https://example.com)', 'link text')
    case 'list':
      return formatListSelection(state)
    case 'code': {
      const selectedText = state.value.slice(state.selectionStart, state.selectionEnd)
      if (selectedText.includes('\n')) {
        return wrapSelection(state, '```\n', '\n```', 'code block')
      }
      return wrapSelection(state, '`', '`', 'code')
    }
  }
}

export function buildQuotedMessagingDraft(paragraphs: string[]): string {
  return paragraphs
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n'),
    )
    .join('\n>\n')
}

export function insertMessagingComposerSnippet(
  state: MessagingComposerSelection,
  snippet: string,
): MessagingComposerSelectionResult {
  const value = `${state.value.slice(0, state.selectionStart)}${snippet}${state.value.slice(state.selectionEnd)}`
  const nextCursor = state.selectionStart + snippet.length

  return {
    value,
    selectionStart: nextCursor,
    selectionEnd: nextCursor,
  }
}

export function buildMessagingMentionToken(name: string): string {
  return `@[${name.trim()}] `
}
