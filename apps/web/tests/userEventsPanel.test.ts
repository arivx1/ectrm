import assert from 'node:assert/strict'

import { test } from 'vitest'

import { createApiError } from '../src/shared/api'
import { formatUserEventSaveError } from '../src/workspaces/settings/userEventsPanelSupport'

test('formatUserEventSaveError adds restart and migration guidance for reachability failures', () => {
  const message = formatUserEventSaveError(
    createApiError(
      'Could not reach API at http://127.0.0.1:8000/user-events or http://localhost:8000/user-events.',
    ),
  )

  assert.match(message, /Could not reach API at http:\/\/127\.0\.0\.1:8000\/user-events or http:\/\/localhost:8000\/user-events\./)
  assert.match(message, /Make sure the API is running on 127\.0\.0\.1:8000\./)
  assert.match(
    message,
    /\.\/\.venv\/bin\/alembic -c apps\/api\/alembic\.ini upgrade a4b5c6d7e8fa/,
  )
})

test('formatUserEventSaveError adds migration guidance when the table is missing', () => {
  const message = formatUserEventSaveError(
    createApiError('no such table: user_defined_events', { status: 500 }),
  )

  assert.match(message, /Custom events need the latest database migration\./)
  assert.match(
    message,
    /\.\/\.venv\/bin\/alembic -c apps\/api\/alembic\.ini upgrade a4b5c6d7e8fa/,
  )
})
