import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ProjectionIntegrityPanel } from '../src/workspaces/admin/ProjectionIntegrityPanel'
import { parseProjectionTradeScope } from '../src/workspaces/admin/projectionIntegrityUtils'

describe('ProjectionIntegrityPanel', () => {
  it('normalizes comma and whitespace separated trade scope input', () => {
    expect(parseProjectionTradeScope(' T-2, T-1\nT-2  T-3 ')).toEqual(['T-1', 'T-2', 'T-3'])
  })

  it('renders an access gate when no administrative session is present', () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectionIntegrityPanel, {
        authSession: null,
        formatDate: (value: string | null | undefined) => value ?? 'n/a',
        onOpenSettings: () => undefined,
        onRefreshData: async () => undefined,
      }),
    )

    expect(markup).toContain('Projection Audit and Repair')
    expect(markup).toContain('Administrative session required')
  })

  it('renders the live audit controls for an administrative session', () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectionIntegrityPanel, {
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

    expect(markup).toContain('Refresh Audit')
    expect(markup).toContain('Repair Drifted Trades')
    expect(markup).toContain('Structural Findings')
  })
})
