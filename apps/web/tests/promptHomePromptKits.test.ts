import assert from 'node:assert/strict'
import { test } from 'vitest'

import { PROMPT_HOME_PROMPT_KITS } from '../src/workspaces/prompt/promptHomePromptKits'

test('prompt home prompt kits cover the main operator jobs from trade through accounting', () => {
  assert.deepEqual(
    PROMPT_HOME_PROMPT_KITS.map((promptKit) => ({
      key: promptKit.key,
      label: promptKit.label,
      suggestedPromptCount: promptKit.suggestedPrompts.length,
      workspaceLinkCount: promptKit.workspaceLinks.length,
    })),
    [
      {
        key: 'trade',
        label: 'Trade',
        suggestedPromptCount: 2,
        workspaceLinkCount: 2,
      },
      {
        key: 'schedule',
        label: 'Schedule',
        suggestedPromptCount: 2,
        workspaceLinkCount: 2,
      },
      {
        key: 'manage-shipments',
        label: 'Manage Shipments',
        suggestedPromptCount: 2,
        workspaceLinkCount: 2,
      },
      {
        key: 'manage-risk',
        label: 'Manage Risk',
        suggestedPromptCount: 3,
        workspaceLinkCount: 2,
      },
      {
        key: 'settle',
        label: 'Settle',
        suggestedPromptCount: 2,
        workspaceLinkCount: 2,
      },
      {
        key: 'accounting',
        label: 'Accounting',
        suggestedPromptCount: 2,
        workspaceLinkCount: 2,
      },
    ],
  )

  const tradeKit = PROMPT_HOME_PROMPT_KITS[0]
  const riskKit = PROMPT_HOME_PROMPT_KITS[3]
  const accountingKit = PROMPT_HOME_PROMPT_KITS[5]

  assert.match(tradeKit?.suggestedPrompts[0]?.prompt ?? '', /real or simulated/i)
  assert.match(
    tradeKit?.suggestedPrompts[0]?.prompt ?? '',
    /tell you the data or want you to build the trade/i,
  )
  assert.match(
    tradeKit?.suggestedPrompts[0]?.prompt ?? '',
    /make my positions flat, minimize my exposure, hedge my risk, speculate, or look for arbitrage opportunities/i,
  )
  assert.match(tradeKit?.suggestedPrompts[0]?.prompt ?? '', /drafting and analysis only/i)
  assert.match(riskKit?.suggestedPrompts[2]?.prompt ?? '', /Strait of Hormuz/i)
  assert.equal(accountingKit?.workspaceLinks[0]?.view, 'reports')
  assert.equal(accountingKit?.workspaceLinks[1]?.view, 'events')
})
