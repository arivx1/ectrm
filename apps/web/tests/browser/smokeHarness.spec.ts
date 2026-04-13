import { expect, test, type Page } from 'playwright/test'

import {
  assertNoHarnessRequestFailures,
  dismissStartHereOverlay,
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

test('single-user smoke signs into the dashboard when one-click access is enabled', async ({ page }) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true })

  try {
    await seedApiBaseOverride(page, harness)
    await page.goto(harness.origin, {
      waitUntil: 'domcontentloaded',
    })

    await dismissStartHereOverlay(page)
    await expect(page.getByRole('button', { name: 'Use local OPS_ADMIN session' })).toBeVisible()

    await page.getByRole('button', { name: 'Use local OPS_ADMIN session' }).click()
    await dismissStartHereOverlay(page)

    await expect(page.getByText('Common Starting Points')).toBeVisible()
    await expect(page.getByText('Signed in as Ops Admin')).toBeVisible()

    assertNoHarnessRequestFailures(harness)
  } finally {
    await harness.close()
  }
})
