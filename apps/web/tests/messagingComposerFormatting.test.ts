import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  applyMessagingComposerFormat,
  buildMessagingMentionToken,
  buildQuotedMessagingDraft,
  insertMessagingComposerSnippet,
} from '../src/workspaces/messages/messagingComposerFormatting'

test('applyMessagingComposerFormat wraps selected text for toolbar actions', () => {
  const boldResult = applyMessagingComposerFormat(
    {
      value: 'Desk update',
      selectionStart: 0,
      selectionEnd: 4,
    },
    'bold',
  )

  assert.equal(boldResult.value, '**Desk** update')

  const listResult = applyMessagingComposerFormat(
    {
      value: 'first\nsecond',
      selectionStart: 0,
      selectionEnd: 'first\nsecond'.length,
    },
    'list',
  )

  assert.equal(listResult.value, '- first\n- second')
})

test('buildQuotedMessagingDraft converts paragraphs into blockquote text', () => {
  assert.equal(
    buildQuotedMessagingDraft([
      'Need desk confirmation before 3 PM.',
      'Please keep settlement looped in.',
    ]),
    '> Need desk confirmation before 3 PM.\n>\n> Please keep settlement looped in.',
  )
})

test('mention and emoji insertions preserve the draft around the current cursor', () => {
  const mentionResult = insertMessagingComposerSnippet(
    {
      value: 'Please review this.',
      selectionStart: 0,
      selectionEnd: 0,
    },
    buildMessagingMentionToken('Mia Chen'),
  )

  assert.equal(mentionResult.value, '@[Mia Chen] Please review this.')

  const emojiResult = insertMessagingComposerSnippet(
    {
      value: 'Looks good',
      selectionStart: 'Looks good'.length,
      selectionEnd: 'Looks good'.length,
    },
    ' 👍',
  )

  assert.equal(emojiResult.value, 'Looks good 👍')
})
