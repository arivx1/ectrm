import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ProjectionMonitoringPanel } from '../src/workspaces/admin/ProjectionMonitoringPanel'

describe('ProjectionMonitoringPanel', () => {
  it('renders an access gate when no administrative session is present', () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectionMonitoringPanel, {
        authSession: null,
        formatDate: (value: string | null | undefined) => value ?? 'n/a',
        onOpenSettings: () => undefined,
        onRefreshData: async () => undefined,
      }),
    )

    expect(markup).toContain('Projection Monitoring')
    expect(markup).toContain('Administrative session required')
  })

  it('renders the live monitoring controls for an administrative session', () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectionMonitoringPanel, {
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
        onRefreshData: async () => undefined,
      }),
    )

    expect(markup).toContain('Projection Monitoring')
    expect(markup).toContain('Run Monitor Now')
    expect(markup).toContain('Save Monitoring')
    expect(markup).toContain('Policy')
    expect(markup).toContain('Recent Alerts')
    expect(markup).toContain('Recent Deliveries')
  })
})
