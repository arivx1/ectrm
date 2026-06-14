import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AssistantControlTowerPanel } from '../src/workspaces/admin/AssistantControlTowerPanel'
import type { AssistantControlTowerSummary } from '../src/shared/models'

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

const seededSummary = {
  generated_at: '2026-04-22T12:00:00Z',
  created_after: null,
  created_before: null,
  roster: {
    total_count: 5,
    active_count: 2,
    draft_count: 1,
    paused_count: 1,
    retired_count: 1,
    action_capable_count: 1,
    missing_eval_coverage_count: 1,
    policy_warning_count: 1,
  },
  runs: {
    total_count: 2,
    completed_count: 1,
    failed_count: 1,
    warning_count: 1,
    tool_call_count: 2,
    latest_run_at: '2026-04-22T11:30:00Z',
  },
  actions: {
    total_count: 4,
    pending_count: 1,
    failed_count: 1,
    rejected_count: 1,
    executed_count: 1,
    preview_blocked_count: 1,
    oldest_pending_action: {
      action_request_id: 42,
      action_type: 'issue_trade_invoice',
      summary: 'Issue invoice',
      agent_id: 'risky-agent',
      agent_name: 'Risky Agent',
      user_id: 'ops_beta',
      created_at: '2026-04-22T07:00:00Z',
      age_seconds: 18_000,
    },
  },
  work_packages: {
    total_count: 4,
    accepted_count: 1,
    in_progress_count: 1,
    implemented_count: 2,
    dismissed_count: 0,
    stale_count: 1,
    stale_accepted_count: 1,
    stale_in_progress_count: 0,
    implemented_with_pr_count: 1,
    implemented_with_commit_count: 1,
    implemented_with_eval_count: 1,
    implemented_with_tests_count: 2,
    implemented_with_docs_count: 1,
    implemented_missing_evidence_count: 0,
  },
  trust_signals: [
    {
      agent_id: 'risky-agent',
      agent_name: 'Risky Agent',
      status: 'ACTIVE',
      role_key: null,
      profile_kind: 'CUSTOM',
      signal_type: 'POLICY_WARNING',
      severity: 'danger',
      summary: 'Policy definition needs review.',
      details: ['Risky Agent has ACTION capability and must declare explicit allowed_action_types.'],
      pending_action_count: 1,
      failed_action_count: 1,
      warning_run_count: 0,
      eval_status: 'BLOCKED',
    },
    {
      agent_id: 'watch-agent',
      agent_name: 'Watch Agent',
      status: 'ACTIVE',
      role_key: null,
      profile_kind: 'CUSTOM',
      signal_type: 'RUN_WARNING',
      severity: 'warning',
      summary: '1 run emitted warnings.',
      details: ['Review warning details before increasing autonomy.'],
      pending_action_count: 0,
      failed_action_count: 0,
      warning_run_count: 1,
      eval_status: 'NOT_REQUIRED',
    },
    {
      agent_id: 'ops-agent',
      agent_name: 'Ops Agent',
      status: 'ACTIVE',
      role_key: null,
      profile_kind: 'CUSTOM',
      signal_type: 'STALE_WORK_PACKAGE',
      severity: 'warning',
      summary: '1 work package is stale without shipped proof.',
      details: ['Accepted package has been idle for more than 72 hours.'],
      pending_action_count: 0,
      failed_action_count: 0,
      warning_run_count: 0,
      eval_status: 'NOT_REQUIRED',
    },
  ],
} satisfies AssistantControlTowerSummary

describe('AssistantControlTowerPanel', () => {
  it('renders seeded control posture for an administrative session', () => {
    const markup = renderToStaticMarkup(
      createElement(AssistantControlTowerPanel, {
        authSession: adminSession,
        formatDate: (value: string | null | undefined) => value ?? 'n/a',
        onOpenSettings: () => undefined,
        initialSummary: seededSummary,
      }),
    )

    expect(markup).toContain('Human Watch Floor')
    expect(markup).toContain('Phase 1 autonomy posture')
    expect(markup).toContain('Agent Roster')
    expect(markup).toContain('2 active · 1 paused · 1 draft')
    expect(markup).toContain('Pending Actions')
    expect(markup).toContain('Tracked Packages')
    expect(markup).toContain('2 implemented · 1 in progress · 1 accepted')
    expect(markup).toContain('Stale Packages')
    expect(markup).toContain('0 in progress · 1 accepted · 72h+ without shipped proof')
    expect(markup).toContain('Implemented Proof')
    expect(markup).toContain('1 PR · 1 eval · 2 test · 1 doc')
    expect(markup).toContain('Issue invoice')
    expect(markup).toContain('issue trade invoice')
    expect(markup).toContain('5.0h waiting')
    expect(markup).toContain('Risky Agent')
    expect(markup).toContain('Policy warning')
    expect(markup).toContain('Watch Agent')
    expect(markup).toContain('Ops Agent')
    expect(markup).toContain('Review Stale Packages')
    expect(markup).toContain('href="#assistant-agent-management"')
    expect(markup).toContain('href="#assistant-agent-work-packages"')
    expect(markup).toContain('href="#assistant-approval-inbox"')
    expect(markup).toContain('Narrow Scope')
    expect(markup).toContain('Pause Agent')
  })

  it('does not reveal protected control data to non-admin users', () => {
    const markup = renderToStaticMarkup(
      createElement(AssistantControlTowerPanel, {
        authSession: {
          ...adminSession,
          user: {
            ...adminSession.user,
            role: 'TRADER',
          },
        },
        formatDate: (value: string | null | undefined) => value ?? 'n/a',
        onOpenSettings: () => undefined,
        initialSummary: seededSummary,
      }),
    )

    expect(markup).toContain('Administrative access required')
    expect(markup).toContain('Only OPS_ADMIN or ADMIN users can inspect protected agent control data.')
    expect(markup).not.toContain('Risky Agent')
    expect(markup).not.toContain('Issue invoice')
  })
})
