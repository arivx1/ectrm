import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { JobSchedulingPanel } from '../src/workspaces/admin/JobSchedulingPanel'

describe('JobSchedulingPanel', () => {
  it('renders an access gate when no administrative session is present', () => {
    const markup = renderToStaticMarkup(
      createElement(JobSchedulingPanel, {
        authSession: null,
        formatDate: (value: string | null | undefined) => value ?? 'n/a',
        onOpenSettings: () => undefined,
      }),
    )

    expect(markup).toContain('Job Scheduling')
    expect(markup).toContain('Administrative session required')
  })

  it('renders schedule creation and queue controls for an administrative session', () => {
    const markup = renderToStaticMarkup(
      createElement(JobSchedulingPanel, {
        authSession: {
          sessionId: 'session-1',
          accessToken: 'token-1',
          expiresAt: '2099-01-01T00:00:00Z',
          user: {
            user_id: 'ops.admin',
            email: 'ops@example.com',
            display_name: 'Ops Admin',
            role: 'ADMIN',
          },
        },
        formatDate: (value: string | null | undefined) => value ?? 'n/a',
        onOpenSettings: () => undefined,
      }),
    )

    expect(markup).toContain('Scheduled jobs')
    expect(markup).toContain('Create schedule')
    expect(markup).toContain('Run Due Time Triggers')
    expect(markup).toContain('Deterministic task')
    expect(markup).toContain('Queue Matching Event')
    expect(markup).toContain('Recent Runs')
  })
})
