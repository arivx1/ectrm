import assert from 'node:assert/strict'

import { test } from 'vitest'

import { formatAuthErrorMessage } from '../src/entities/auth/errorMessage'

test('formatAuthErrorMessage turns raw API reachability errors into actionable auth guidance', () => {
  assert.equal(
    formatAuthErrorMessage(
      new Error('Could not reach API at http://127.0.0.1:8000/auth/session or http://localhost:8000/auth/session.'),
      'Could not sign in.',
    ),
    'API unavailable. Check that the backend is running at 127.0.0.1:8000 or localhost:8000, or update API Base Override in Settings.',
  )
})

test('formatAuthErrorMessage preserves non-reachability auth failures', () => {
  assert.equal(
    formatAuthErrorMessage(new Error('Invalid credentials'), 'Could not sign in.'),
    'Invalid credentials',
  )
})

test('formatAuthErrorMessage falls back when no Error instance is available', () => {
  assert.equal(formatAuthErrorMessage(null, 'Could not sign in.'), 'Could not sign in.')
})
