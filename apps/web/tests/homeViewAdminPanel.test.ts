import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { HomeViewAdminPanel } from '../src/workspaces/admin/HomeViewAdminPanel'

const adminSession = {
  sessionId: 'session-1',
  accessToken: 'token-1',
  expiresAt: '2099-01-01T00:00:00Z',
  user: {
    user_id: 'ops_admin',
    email: 'ops@example.com',
    display_name: 'Ops Admin',
    role: 'OPS_ADMIN',
  },
}

describe('HomeViewAdminPanel', () => {
  it('renders an admin gate for non-admin sessions', () => {
    const markup = renderToStaticMarkup(
      createElement(HomeViewAdminPanel, {
        authSession: {
          ...adminSession,
          user: {
            ...adminSession.user,
            role: 'TRADER',
          },
        },
        formatDate: (value: string | null | undefined) => value ?? 'n/a',
        onOpenSettings: () => undefined,
      }),
    )

    expect(markup).toContain('Shared Home Inventory')
    expect(markup).toContain('administrative session')
  })

  it('renders shared Home inventory structure for admins', () => {
    const markup = renderToStaticMarkup(
      createElement(HomeViewAdminPanel, {
        authSession: adminSession,
        formatDate: (value: string | null | undefined) => value ?? 'n/a',
        onOpenSettings: () => undefined,
      }),
    )

    expect(markup).toContain('Shared Home Inventory')
    expect(markup).toContain('Inventory')
    expect(markup).toContain('Lifecycle')
    expect(markup).toContain('Compatibility')
  })
})
