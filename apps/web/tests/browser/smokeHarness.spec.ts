import { expect, test, type Locator, type Page } from 'playwright/test'

import {
  assertNoHarnessRequestFailures,
  dismissStartHereOverlay,
  formatRecordedRequests,
  seedApiBaseOverride,
  seedSignedInSession,
  startSmokeHarness,
} from './support/smokeHarness'

async function readMobileShellMetrics(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector('.app-shell')
    const mainStage = document.querySelector('.main-stage')
    const sideRail = document.querySelector('.side-rail')
    const mobileTopbar = document.querySelector('.mobile-topbar')
    if (!(shell instanceof HTMLElement) || !(mainStage instanceof HTMLElement) || !(sideRail instanceof HTMLElement) || !(mobileTopbar instanceof HTMLElement)) {
      throw new Error('Expected shell elements were not rendered.')
    }

    return {
      mainStageWidth: Math.round(mainStage.getBoundingClientRect().width),
      shellTrackCount: getComputedStyle(shell).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      sideRailHidden: sideRail.hasAttribute('hidden'),
      sideRailVisible: getComputedStyle(sideRail).display !== 'none' && !sideRail.hasAttribute('hidden'),
      mobileTopbarVisible: getComputedStyle(mobileTopbar).display !== 'none',
      viewportWidth: window.innerWidth,
    }
  })
}

async function selectExactSearchValue(
  scope: Locator,
  placeholder: string,
  value: string,
  expectedDisplayValue: string,
): Promise<void> {
  const input = scope.getByPlaceholder(placeholder)
  await input.click()
  await input.fill(value)
  await input.press('Tab')
  await expect(input).toHaveValue(expectedDisplayValue)
}

async function signInFromPromptHome(page: Page): Promise<void> {
  await expect(page.getByText('Start with the job in front of you')).toBeVisible()
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Use local OPS_ADMIN session' })).toBeVisible()
  await page.getByRole('button', { name: 'Use local OPS_ADMIN session' }).click()
  await expect(page.getByText('Signed in as Ops Admin')).toBeVisible()
}

async function expandPromptHomeLiveContext(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Show live context' }).click()
  await expect(page.getByRole('button', { name: 'Hide live context' })).toBeVisible()
}

test('dashboard smoke boots against the seeded browser harness', async ({ page }) => {
  const harness = await startSmokeHarness()

  try {
    await seedSignedInSession(page, harness)
    await page.goto(`${harness.origin}/?view=dashboard`, {
      waitUntil: 'domcontentloaded',
    })

    await dismissStartHereOverlay(page)

    await expect(page.getByText('Common Starting Points')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Exposure' }).first()).toBeVisible()

    assertNoHarnessRequestFailures(harness)
  } finally {
    await harness.close()
  }
})

test('mobile shell keeps the main stage full-width and the nav drawer behaves like an overlay', async ({ page }) => {
  const harness = await startSmokeHarness()

  try {
    await page.setViewportSize({
      width: 390,
      height: 844,
    })
    await seedSignedInSession(page, harness)
    await page.goto(`${harness.origin}/?view=dashboard`, {
      waitUntil: 'domcontentloaded',
    })

    await dismissStartHereOverlay(page)

    const closedMetrics = await readMobileShellMetrics(page)
    expect(closedMetrics.mobileTopbarVisible).toBe(true)
    expect(closedMetrics.sideRailHidden).toBe(true)
    expect(closedMetrics.sideRailVisible).toBe(false)
    expect(closedMetrics.shellTrackCount).toBe(1)
    expect(closedMetrics.mainStageWidth).toBeGreaterThanOrEqual(closedMetrics.viewportWidth - 48)

    await page.getByRole('button', { name: 'Open navigation menu' }).click()
    await expect(page.locator('.side-rail')).toBeVisible()

    const openMetrics = await readMobileShellMetrics(page)
    expect(openMetrics.sideRailHidden).toBe(false)
    expect(openMetrics.sideRailVisible).toBe(true)
    expect(Math.abs(openMetrics.mainStageWidth - closedMetrics.mainStageWidth)).toBeLessThanOrEqual(16)

    await page.getByRole('button', { name: 'Close navigation menu' }).click()
    await expect(page.locator('.side-rail')).toHaveAttribute('hidden', '')

    const restoredMetrics = await readMobileShellMetrics(page)
    expect(restoredMetrics.sideRailHidden).toBe(true)
    expect(restoredMetrics.mainStageWidth).toBeGreaterThanOrEqual(restoredMetrics.viewportWidth - 48)

    assertNoHarnessRequestFailures(harness)
  } finally {
    await harness.close()
  }
})

test('single-user smoke signs into the prompt home when one-click access is enabled', async ({ page }) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true })

  try {
    await seedApiBaseOverride(page, harness)
    await page.goto(harness.origin, {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByText('Start with the job in front of you')).toBeVisible()
    await expect(page.getByText('You can draft the prompt here. We will only send it after you sign in.')).toBeVisible()
    await signInFromPromptHome(page)

    await expect(page.getByText('Start with the job in front of you')).toBeVisible()
    await expect(page.getByText('Signed in as Ops Admin')).toBeVisible()
    await expect(page.getByRole('button', { name: /Assistant Console/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Recent blocker triage/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show live context' })).toBeVisible()
    await expect(page.locator('.prompt-home-starter').filter({ hasText: 'Clear operations blockers' })).toBeHidden()

    assertNoHarnessRequestFailures(harness)
  } finally {
    await harness.close()
  }
})

test('signed-out prompt draft resumes and sends after sign-in', async ({ page }) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true })

  try {
    await seedApiBaseOverride(page, harness)
    await page.goto(harness.origin, {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByText('Start with the job in front of you')).toBeVisible()
    await page.getByLabel('Operator prompt').fill('Where should I handle the confirmation blocker?')
    await page.getByRole('button', { name: 'Sign In to Send Prompt' }).click()

    await expect(page).toHaveURL(/view=settings/)
    await expect(page.getByText('After sign-in, sending your prompt:')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Use local OPS_ADMIN session' })).toBeVisible()

    await page.getByRole('button', { name: 'Use local OPS_ADMIN session' }).click()

    await expect(page).toHaveURL(/^(?!.*view=settings).*$/)
    await expect(page.getByText('Signed in as Ops Admin')).toBeVisible()
    await expect(page.locator('.assistant-message-user').getByText('Where should I handle the confirmation blocker?')).toBeVisible()
    await expect(page.locator('.assistant-message-assistant').getByText('Operations is the right place to continue')).toBeVisible()
    await expect(page.locator('.assistant-message-assistant')).not.toContainText('navigation_intent')
    await expect(page.locator('.prompt-home-handoff').filter({ hasText: 'Open Work Queue' })).toBeVisible()

    assertNoHarnessRequestFailures(harness)
  } finally {
    await harness.close()
  }
})

test('prompt home contextual starter asks from live context and hands off to operations', async ({ page }) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true })

  try {
    await seedApiBaseOverride(page, harness)
    await page.goto(harness.origin, {
      waitUntil: 'domcontentloaded',
    })

    await signInFromPromptHome(page)
    await expandPromptHomeLiveContext(page)

    const operationsStarter = page.locator('.prompt-home-starter').filter({ hasText: 'Clear operations blockers' })
    await expect(operationsStarter).toBeVisible()
    await operationsStarter.getByRole('button', { name: 'Ask about operations blockers' }).click()

    await expect(page.locator('.assistant-message-user').getByText('Summarize the open operations queue')).toBeVisible()
    await expect(page.locator('.assistant-message-assistant').getByText('Operations is the right place to continue')).toBeVisible()

    const assistantHandoff = page.locator('.prompt-home-handoff').filter({ hasText: 'Open Work Queue' })
    await expect(assistantHandoff).toBeVisible()
    await assistantHandoff.click()

    await expect(page).toHaveURL(/view=operations/)
    await expect(page).toHaveURL(/handoff=assistant/)
    await expect(page.getByText('Assistant run #8801')).toBeVisible()

    assertNoHarnessRequestFailures(harness)
  } finally {
    await harness.close()
  }
})

test('prompt home contextual starter can open the old workspace directly', async ({ page }) => {
  const harness = await startSmokeHarness()

  try {
    await seedSignedInSession(page, harness)
    await page.goto(harness.origin, {
      waitUntil: 'domcontentloaded',
    })

    await expandPromptHomeLiveContext(page)

    const settlementStarter = page.locator('.prompt-home-starter').filter({ hasText: 'Review invoices and payments' })
    await expect(settlementStarter).toBeVisible()
    await settlementStarter.getByRole('button', { name: 'Open Settlement' }).click()

    await expect(page).toHaveURL(/view=settlement/)
    await expect(page.getByRole('heading', { name: 'Issue invoices, track cash, and clear disputes' })).toBeVisible()

    assertNoHarnessRequestFailures(harness)
  } finally {
    await harness.close()
  }
})

test('prompt home accepts an assistant handoff into the old operations workspace', async ({ page }) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true })

  try {
    await seedApiBaseOverride(page, harness)
    await page.goto(harness.origin, {
      waitUntil: 'domcontentloaded',
    })

    await signInFromPromptHome(page)

    await page.getByLabel('Operator prompt').fill('Where should I handle the confirmation blocker?')
    await page.getByRole('button', { name: 'Send Prompt' }).click()

    const assistantHandoff = page.locator('.prompt-home-handoff').filter({ hasText: 'Open Work Queue' })
    await expect(assistantHandoff).toBeVisible()
    await expect(page.locator('.assistant-message-assistant')).not.toContainText('navigation_intent')

    await assistantHandoff.click()

    await expect(page).toHaveURL(/view=operations/)
    await expect(page).toHaveURL(/handoff=assistant/)
    await expect(page).toHaveURL(/focusTrade=T-AMEND-100/)
    await expect(page.getByText('Assistant run #8801')).toBeVisible()
    await expect(page.getByText('Trade: T-AMEND-100')).toBeVisible()
    await expect(page.getByText('Review the confirmation blocker with the operations owner')).toBeVisible()

    await page.getByRole('button', { name: 'Show Full Queue' }).click()
    await expect(page).toHaveURL(/view=operations/)
    await expect(page).not.toHaveURL(/handoff=assistant/)
    await expect(page.getByText('Assistant run #8801')).toBeHidden()

    assertNoHarnessRequestFailures(harness)
  } finally {
    await harness.close()
  }
})

test('prompt home accepts an assistant handoff into settlement workspace', async ({ page }) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true })

  try {
    await seedApiBaseOverride(page, harness)
    await page.goto(harness.origin, {
      waitUntil: 'domcontentloaded',
    })

    await signInFromPromptHome(page)

    await page.getByLabel('Operator prompt').fill('Where should I handle the invoice settlement item?')
    await page.getByRole('button', { name: 'Send Prompt' }).click()

    const assistantHandoff = page.locator('.prompt-home-handoff').filter({ hasText: 'Open Settlement' })
    await expect(assistantHandoff).toBeVisible()
    await expect(page.locator('.assistant-message-assistant')).not.toContainText('navigation_intent')

    await assistantHandoff.click()

    await expect(page).toHaveURL(/view=settlement/)
    await expect(page).toHaveURL(/handoff=assistant/)
    await expect(page).toHaveURL(/focusTrade=T-AMEND-100/)
    await expect(page.getByText('Assistant run #8801')).toBeVisible()
    await expect(page.getByText('Trade: T-AMEND-100')).toBeVisible()
    await expect(page.getByText('Review settlement follow-through for T-AMEND-100')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Focused Trade' })).toBeVisible()

    await page.getByRole('button', { name: 'Show Full Settlement' }).click()
    await expect(page).toHaveURL(/view=settlement/)
    await expect(page).not.toHaveURL(/handoff=assistant/)
    await expect(page.getByText('Assistant run #8801')).toBeHidden()

    assertNoHarnessRequestFailures(harness)
  } finally {
    await harness.close()
  }
})

test('prompt home accepts an assistant handoff into trade capture', async ({ page }) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true })

  try {
    await seedApiBaseOverride(page, harness)
    await page.goto(harness.origin, {
      waitUntil: 'domcontentloaded',
    })

    await signInFromPromptHome(page)

    await page.getByLabel('Operator prompt').fill('Open trade capture to amend T-AMEND-100')
    await page.getByRole('button', { name: 'Send Prompt' }).click()

    const assistantHandoff = page.locator('.prompt-home-handoff').filter({ hasText: 'Open Trade Capture' })
    await expect(assistantHandoff).toBeVisible()
    await expect(page.locator('.assistant-message-assistant')).not.toContainText('navigation_intent')

    await assistantHandoff.click()

    await expect(page).toHaveURL(/view=trades/)
    await expect(page).toHaveURL(/trade=T-AMEND-100/)
    await expect(page).toHaveURL(/handoff=assistant/)
    await expect(page).toHaveURL(/tradeTab=amend/)
    await expect(page.getByText('Assistant run #8801')).toBeVisible()
    await expect(page.getByText('Trade: T-AMEND-100')).toBeVisible()
    await expect(page.getByText('Inspector: amend')).toBeVisible()
    await expect(page.getByText('Open the amend panel for T-AMEND-100')).toBeVisible()

    await page.getByRole('button', { name: 'Show Full Blotter' }).click()
    await expect(page).toHaveURL(/view=trades/)
    await expect(page).not.toHaveURL(/handoff=assistant/)
    await expect(page).not.toHaveURL(/tradeTab=amend/)
    await expect(page.getByText('Assistant run #8801')).toBeHidden()

    assertNoHarnessRequestFailures(harness)
  } finally {
    await harness.close()
  }
})

test('prompt home reopens recent prompt threads without entering the assistant console', async ({ page }) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true })

  try {
    await seedApiBaseOverride(page, harness)
    await page.goto(harness.origin, {
      waitUntil: 'domcontentloaded',
    })

    await signInFromPromptHome(page)

    await page.getByRole('button', { name: /Recent blocker triage/ }).click()

    await expect(page.locator('.assistant-message-user').getByText('Where should I handle the confirmation blocker?')).toBeVisible()
    await expect(page.locator('.assistant-message-assistant').getByText('Operations is the right place to continue')).toBeVisible()
    await expect(page.locator('.assistant-message-assistant')).not.toContainText('navigation_intent')
    await expect(page.locator('.prompt-home-handoff').filter({ hasText: 'Open Work Queue' })).toBeVisible()
    await expect(page).toHaveURL(/^(?!.*view=assistant).*$/)

    assertNoHarnessRequestFailures(harness)
  } finally {
    await harness.close()
  }
})

test('assistant feedback smoke persists response feedback through chat reload and admin outcome metrics', async ({ page }) => {
  const harness = await startSmokeHarness()
  const feedbackNote = 'Surface the confirmation queue owner before routing.'

  try {
    await seedSignedInSession(page, harness)
    await page.goto(`${harness.origin}/?view=assistant`, {
      waitUntil: 'domcontentloaded',
    })

    await dismissStartHereOverlay(page)

    const composer = page.locator('form.assistant-composer')
    await expect(composer).toBeVisible()
    await composer.getByLabel('Prompt').fill('Where should I handle the confirmation blocker?')
    await composer.getByRole('button', { name: 'Send Prompt' }).click()

    const assistantMessage = page
      .locator('.assistant-message-assistant')
      .filter({ hasText: 'Operations is the right place to continue' })
    await expect(assistantMessage).toBeVisible()

    await assistantMessage.getByRole('button', { name: 'Add note' }).click()
    await assistantMessage.getByPlaceholder('What should change in this answer?').fill(feedbackNote)
    await assistantMessage.getByRole('button', { name: 'Needs work' }).click()

    await expect(assistantMessage.getByText('Saved needs work')).toBeVisible()
    await expect(assistantMessage.getByPlaceholder('What should change in this answer?')).toHaveValue(feedbackNote)

    await page.getByRole('button', { name: 'Start new chat' }).click()
    await expect(page.getByText('No chat selected')).toBeVisible()
    await page.getByRole('button', { name: /Recent blocker triage/ }).click()

    const reloadedAssistantMessage = page
      .locator('.assistant-message-assistant')
      .filter({ hasText: 'Operations is the right place to continue' })
    await expect(reloadedAssistantMessage.getByText('Saved needs work')).toBeVisible()
    await expect(reloadedAssistantMessage.getByPlaceholder('What should change in this answer?')).toHaveValue(feedbackNote)

    await page.goto(`${harness.origin}/?view=admin`, {
      waitUntil: 'domcontentloaded',
    })

    const outcomeSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Outcome Metrics' }) })
      .first()
    const feedbackSummary = outcomeSection.locator('.assistant-run-summary-card').filter({ hasText: 'User feedback' })

    await expect(outcomeSection).toBeVisible()
    await expect(feedbackSummary.getByText('1/3')).toBeVisible()
    await expect(outcomeSection.getByRole('heading', { name: 'Workspace Signals' })).toBeVisible()
    await expect(outcomeSection.getByRole('heading', { name: 'Recent Run Notes' })).toBeVisible()
    await expect(outcomeSection.getByText(feedbackNote)).toBeVisible()

    expect(harness.mutationRequests).toContainEqual({
      method: 'POST',
      path: '/assistant/runs/8801/feedback',
      search: '',
    })
    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
    ).toHaveLength(0)
  } finally {
    await harness.close()
  }
})

test('admin smoke shows the role-derived pilot lineup and sync action', async ({ page }) => {
  const harness = await startSmokeHarness()

  try {
    await seedSignedInSession(page, harness)
    await page.goto(`${harness.origin}/?view=admin`, {
      waitUntil: 'domcontentloaded',
    })

    await dismissStartHereOverlay(page)

    const agentControl = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Managed Agent Control' }) })
      .first()
    const roleCatalog = agentControl.locator('.assistant-role-catalog-shell')

    await expect(agentControl).toBeVisible()
    await expect(agentControl.getByText('Role profiles', { exact: true })).toBeVisible()
    await expect(agentControl.getByRole('button', { name: /Ops Governor/ })).toBeVisible()
    await expect(agentControl.getByText('Evals PASS')).toBeVisible()
    await expect(roleCatalog.getByRole('button', { name: /Pre-Trade Structuring Agent/ })).toBeVisible()
    await expect(roleCatalog.getByText('Phase 1').first()).toBeVisible()

    await agentControl.getByRole('button', { name: 'Sync Pilot Lineup' }).click()
    await expect(
      agentControl.getByText('Pilot lineup synchronized: 0 created, 2 updated across 13 role profiles.'),
    ).toBeVisible()

    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
    ).toHaveLength(0)
    expect(harness.mutationRequests).toEqual([
      {
        method: 'POST',
        path: '/admin/data/assistant-agents/seed',
        search: '',
      },
    ])
  } finally {
    await harness.close()
  }
})

test('signed-out start-here routes trade capture intent into the auth gate', async ({ page }) => {
  const harness = await startSmokeHarness()

  try {
    await seedApiBaseOverride(page, harness)
    await page.goto(`${harness.origin}/?view=dashboard`, {
      waitUntil: 'domcontentloaded',
    })

    const startHereOverlay = page.locator('.start-here-dialog')
    await expect(startHereOverlay).toBeVisible()
    await expect(startHereOverlay.getByRole('button', { name: 'Sign In for Trade Capture' })).toBeVisible()

    await startHereOverlay.getByRole('button', { name: 'Sign In for Trade Capture' }).click()

    await expect(page).toHaveURL(/view=settings/)
    await expect(startHereOverlay).toBeHidden()

    const authGate = page.locator('.auth-gate-stage')
    await expect(authGate).toBeVisible()
    await expect(
      authGate.getByText(
        "After sign-in, opening Trade Capture. We'll take you straight there after authentication succeeds.",
      ),
    ).toBeVisible()
    await expect(authGate.getByLabel('User ID or Email')).toBeVisible()
    await expect(authGate.getByRole('button', { name: 'Enter Console' })).toBeVisible()

    assertNoHarnessRequestFailures(harness)
  } finally {
    await harness.close()
  }
})

test('signed-in smoke captures a trade and selects the created ticket', async ({ page }) => {
  const harness = await startSmokeHarness()
  const createdTradeId = 'TRD-10001'
  const nextSuggestedTradeId = 'TRD-10002'

  try {
    await seedSignedInSession(page, harness)
    await page.goto(`${harness.origin}/?view=trades`, {
      waitUntil: 'domcontentloaded',
    })

    await dismissStartHereOverlay(page)

    const createForm = page.locator('form.trade-form.trade-form-feature')
    await expect(createForm).toBeVisible()
    await expect(createForm.getByRole('button', { name: 'Create Trade' })).toBeEnabled()
    await expect(createForm.getByRole('heading', { name: createdTradeId })).toBeVisible()

    await selectExactSearchValue(
      createForm,
      'Search by book name or code',
      'WEST_POWER',
      'West Power Desk (WEST_POWER)',
    )
    await selectExactSearchValue(
      createForm,
      'Search by name or code',
      'CASCADE_UTIL',
      'Cascade Utility (CASCADE_UTIL)',
    )
    await selectExactSearchValue(
      createForm,
      'Search by location name or code',
      'WAHA_POOL',
      'Waha Pool (WAHA_POOL)',
    )
    await selectExactSearchValue(
      createForm,
      'Search by commodity name or code',
      'WAHA_GAS',
      'Waha Gas (WAHA_GAS)',
    )
    await createForm.locator('label.field').filter({ hasText: 'Quantity Unit' }).locator('select').selectOption('MMBTU')
    await createForm.locator('label.field').filter({ hasText: 'Trade Currency' }).locator('select').selectOption('USD')
    await createForm.locator('label.field').filter({ hasText: 'Price Unit' }).locator('select').selectOption('USD/MMBTU')
    await createForm.locator('label.field').filter({ hasText: /^Price Differential/ }).locator('input').fill('4.25')
    await createForm.locator('label.field').filter({ hasText: /^Volume$/ }).locator('input').fill('12500')

    await createForm.getByRole('button', { name: 'Create Trade' }).click()

    await expect(page).toHaveURL(new RegExp(`view=trades(?:&|$).*trade=${createdTradeId}`))
    await expect(
      page.getByRole('button', { name: new RegExp(`Trade: ${createdTradeId} WAHA_GAS`) }),
    ).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.operational-inspector-summary-copy').getByText('WAHA_GAS', { exact: true })).toBeVisible()
    await expect(createForm.getByRole('heading', { name: nextSuggestedTradeId })).toBeVisible()

    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
    ).toHaveLength(0)
    expect(harness.mutationRequests).toEqual([
      {
        method: 'POST',
        path: '/events',
        search: '',
      },
    ])
  } finally {
    await harness.close()
  }
})

test('admin smoke rejects a pending assistant approval from the governance inbox', async ({ page }) => {
  const harness = await startSmokeHarness()
  const requestSummary = 'Cancel trade T-AMEND-100'

  try {
    await seedSignedInSession(page, harness)
    await page.goto(`${harness.origin}/?view=admin`, {
      waitUntil: 'domcontentloaded',
    })

    await dismissStartHereOverlay(page)

    const approvalsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Pending Approvals' }) })
      .first()
    const approvalActionCard = approvalsSection.locator('.assistant-action-card').first()
    const approvalSummary = approvalActionCard.locator('strong').filter({ hasText: requestSummary })

    await expect(approvalsSection).toBeVisible()
    await expect(approvalsSection.getByText('1 pending assistant action request require review.')).toBeVisible()
    await expect(approvalSummary).toBeVisible()
    await expect(approvalsSection.getByText('Requester: trader.alpha')).toBeVisible()
    await expect(approvalsSection.getByText('Type: cancel_trade')).toBeVisible()
    await expect(approvalsSection.getByText('Run #701')).toBeVisible()

    await approvalActionCard.getByRole('button', { name: 'Open trace' }).click()
    await expect(approvalsSection.getByText('Audit trace for run #701')).toBeVisible()
    await expect(approvalsSection.getByText('Run started')).toBeVisible()
    await expect(approvalsSection.getByText('Tool call: get_trade_by_id')).toBeVisible()
    await approvalsSection.getByRole('button', { name: 'Close trace' }).click()

    await approvalsSection.getByRole('button', { name: 'Reject' }).click()

    await expect(approvalsSection.getByText(`${requestSummary} has been rejected.`)).toBeVisible()
    await expect(
      approvalsSection.getByText('No assistant action requests are currently waiting for approval.'),
    ).toBeVisible()
    await expect(approvalSummary).toHaveCount(0)
    await expect(approvalsSection.getByText('Requester: trader.alpha')).toHaveCount(0)

    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
    ).toHaveLength(0)
    expect(harness.mutationRequests).toEqual([
      {
        method: 'POST',
        path: '/assistant/action-requests/7001/reject',
        search: '',
      },
    ])
  } finally {
    await harness.close()
  }
})

test('admin smoke approves and executes a pending assistant approval from the governance inbox', async ({ page }) => {
  const harness = await startSmokeHarness()
  const requestSummary = 'Cancel trade T-AMEND-100'

  try {
    await seedSignedInSession(page, harness)
    await page.goto(`${harness.origin}/?view=admin`, {
      waitUntil: 'domcontentloaded',
    })

    await dismissStartHereOverlay(page)

    const approvalsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Pending Approvals' }) })
      .first()
    const approvalActionCard = approvalsSection.locator('.assistant-action-card').first()
    const approvalSummary = approvalActionCard.locator('strong').filter({ hasText: requestSummary })

    await expect(approvalsSection).toBeVisible()
    await expect(approvalsSection.getByText('1 pending assistant action request require review.')).toBeVisible()
    await expect(approvalSummary).toBeVisible()
    await expect(approvalActionCard.getByText('Requester: trader.alpha')).toBeVisible()
    await expect(approvalActionCard.getByText('Type: cancel_trade')).toBeVisible()
    await expect(approvalActionCard.getByText('Run #701')).toBeVisible()

    await approvalsSection.getByRole('button', { name: 'Approve' }).click()

    await expect(approvalsSection.getByText(`${requestSummary} has been executed.`)).toBeVisible()
    await expect(
      approvalsSection.getByText('No assistant action requests are currently waiting for approval.'),
    ).toBeVisible()
    await expect(approvalSummary).toHaveCount(0)
    await expect(approvalsSection.getByText('Requester: trader.alpha')).toHaveCount(0)

    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
    ).toHaveLength(0)
    expect(harness.mutationRequests).toEqual([
      {
        method: 'POST',
        path: '/assistant/action-requests/7001/approve',
        search: '',
      },
    ])
  } finally {
    await harness.close()
  }
})
