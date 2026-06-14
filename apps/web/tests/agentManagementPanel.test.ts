import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AgentManagementPanel } from '../src/workspaces/admin/AgentManagementPanel'

const adminSession = {
  sessionId: 'session-1',
  accessToken: 'token-1',
  expiresAt: '2099-01-01T00:00:00Z',
  user: {
    user_id: 'ops.admin',
    email: 'ops@example.com',
    display_name: 'Ops Admin',
    role: 'OPS_ADMIN',
  },
}

describe('AgentManagementPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the create draft skills selector isolated from edit-only controls on the server', () => {
    vi.stubGlobal('window', {
      location: {
        hash: '#assistant-agent-builder',
      },
    })

    const markup = renderToStaticMarkup(
      createElement(AgentManagementPanel, {
        authSession: adminSession,
        formatDate: (value: string | null | undefined) => value ?? 'n/a',
        onOpenSettings: () => undefined,
      }),
    )

    const skillHeadings = markup.match(/<strong>Skills<\/strong>/g) ?? []

    expect(markup).toContain("Make the agent&#x27;s build recipe explicit")
    expect(markup).not.toContain('Keep the specialization explicit so users can see how this agent is built.')
    expect(skillHeadings).toHaveLength(1)
  })
})
