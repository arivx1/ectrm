import { expect, test, type Locator, type Page } from "playwright/test";

import {
  assertNoHarnessRequestFailures,
  dismissStartHereOverlay,
  formatRecordedRequests,
  seedApiBaseOverride,
  seedSignedInSession,
  startSmokeHarness,
} from "./support/smokeHarness";

async function readMobileShellMetrics(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".app-shell");
    const mainStage = document.querySelector(".main-stage");
    const sideRail = document.querySelector(".side-rail");
    const mobileTopbar = document.querySelector(".mobile-topbar");
    if (
      !(shell instanceof HTMLElement) ||
      !(mainStage instanceof HTMLElement) ||
      !(sideRail instanceof HTMLElement) ||
      !(mobileTopbar instanceof HTMLElement)
    ) {
      throw new Error("Expected shell elements were not rendered.");
    }

    return {
      mainStageWidth: Math.round(mainStage.getBoundingClientRect().width),
      shellTrackCount: getComputedStyle(shell)
        .gridTemplateColumns.split(/\s+/)
        .filter(Boolean).length,
      sideRailHidden: sideRail.hasAttribute("hidden"),
      sideRailVisible:
        getComputedStyle(sideRail).display !== "none" &&
        !sideRail.hasAttribute("hidden"),
      mobileTopbarVisible: getComputedStyle(mobileTopbar).display !== "none",
      viewportWidth: window.innerWidth,
    };
  });
}

async function selectExactSearchValue(
  scope: Locator,
  placeholder: string,
  value: string,
  expectedDisplayValue: string,
): Promise<void> {
  const input = scope.getByPlaceholder(placeholder);
  await input.click();
  await input.fill(value);
  await input.press("Tab");
  await expect(input).toHaveValue(expectedDisplayValue);
}

async function signInFromPromptHome(page: Page): Promise<void> {
  const authGate = page.locator(".auth-gate-stage");
  await expect(authGate).toBeVisible();
  await expect(page.getByLabel("Operator prompt")).toHaveCount(0);
  await expect(
    authGate.getByRole("button", { name: "Single Sign On" }),
  ).toBeVisible();
  await authGate.getByRole("button", { name: "Single Sign On" }).click();
  await expect(authGate).toBeHidden();
  await expect(page.getByText("Signed in as Ops Admin")).toBeVisible();
}

async function signOutFromPromptHome(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page.locator(".auth-gate-stage")).toBeVisible();
  await expect(page.getByLabel("Operator prompt")).toHaveCount(0);
}

async function installSpeechSynthesisRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const speechLog: string[] = [];

    class MockSpeechSynthesisUtterance {
      text: string;
      lang = "en-US";
      onend: (() => void) | null = null;
      onerror: ((event: { error?: string | null }) => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, "__promptHomeSpeechLog", {
      configurable: true,
      value: speechLog,
      writable: true,
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: MockSpeechSynthesisUtterance,
      writable: true,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {},
        speak(utterance: MockSpeechSynthesisUtterance) {
          speechLog.push(utterance.text);
          window.setTimeout(() => {
            utterance.onend?.();
          }, 0);
        },
      },
      writable: true,
    });
  });
}

async function readPromptHomeSpeechLog(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const promptHomeWindow = window as Window & {
      __promptHomeSpeechLog?: string[];
    };
    return [...(promptHomeWindow.__promptHomeSpeechLog ?? [])];
  });
}

async function expectLocatorsOnSameLine(
  first: Locator,
  second: Locator,
): Promise<void> {
  const [firstBox, secondBox] = await Promise.all([
    first.boundingBox(),
    second.boundingBox(),
  ]);
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  if (!firstBox || !secondBox) {
    return;
  }

  expect(Math.abs(firstBox.y - secondBox.y)).toBeLessThanOrEqual(10);
}

async function expectLocatorNearRightEdge(
  container: Locator,
  target: Locator,
  threshold = 40,
): Promise<void> {
  const [containerBox, targetBox] = await Promise.all([
    container.boundingBox(),
    target.boundingBox(),
  ]);
  expect(containerBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  if (!containerBox || !targetBox) {
    return;
  }

  expect(
    containerBox.x + containerBox.width - (targetBox.x + targetBox.width),
  ).toBeLessThanOrEqual(threshold);
}

async function expectLocatorAbove(
  first: Locator,
  second: Locator,
  threshold = 12,
): Promise<void> {
  const [firstBox, secondBox] = await Promise.all([
    first.boundingBox(),
    second.boundingBox(),
  ]);
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  if (!firstBox || !secondBox) {
    return;
  }

  expect(firstBox.y).toBeLessThanOrEqual(secondBox.y + threshold);
}

test("dashboard smoke boots against the seeded browser harness", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=dashboard`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    await expect(page.getByText("Market Monitor Board")).toBeVisible();
    await expect(page.getByText("Desk Headlines")).toBeVisible();
    await expect(page.getByText("Pricing gap on T-AMEND-100")).toBeVisible();
    await expect(page.getByText("Watchlist Alerts")).toBeVisible();
    await expect(
      page
        .locator(".watchlist-alert-list")
        .getByText(/Pricing exceptions:/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save Watchlist" }).click();
    await expect(page.getByText("Saved terminal watchlist", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Instrument Brief" })).toBeVisible();
    await expect(page.getByText("Common Starting Points")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open Exposure" }).first(),
    ).toBeVisible();

    await page.getByLabel("Monitor preset").selectOption({ label: "Market Overview" });
    await expect(
      page.getByText(
        "Lead with a terminal-style market strip and monitor board before rolling into desk reporting, prices, exposure, and attention.",
      ),
    ).toBeVisible();
    await expect(page.locator("#quick-start")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add Common Starting Points" }),
    ).toBeVisible();

    await page.keyboard.press("Alt+F");
    await expect(page.getByLabel("Search current screen")).toBeFocused();
    await page.keyboard.press("Alt+2");
    await expect(page).toHaveURL(/view=dashboard/);

    await page.keyboard.press("Control+K");
    await expect(
      page.getByRole("dialog", { name: "Open a workspace or record" }),
    ).toBeVisible();
    await page.getByLabel("Search terminal navigation targets").fill("risk");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/view=risk/);
    await page.keyboard.press("Alt+1");
    await expect(page).toHaveURL(/view=dashboard/);
    await expect(page.getByText("Market Monitor Board")).toBeVisible();

    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Terminal Shortcuts" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Terminal Shortcuts" })).toBeHidden();

    const gasFocusRow = page
      .locator(".market-monitor-focus-row")
      .filter({ hasText: "NATURAL GAS" });
    await expect(gasFocusRow).toBeVisible();
    await gasFocusRow.getByRole("button", { name: "Open Brief" }).click();
    await expect(page).toHaveURL(/focusType=market_instrument/);
    await expect(page.getByText("Commodity Class Brief")).toBeVisible();
    await expect(
      page.locator("#instrument-brief").getByText("T-AMEND-100", { exact: true }),
    ).toBeVisible();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("dashboard candidate drilldowns hand off into focused operations context", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=dashboard`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    const confirmationRow = page
      .locator(".dashboard-issue-row")
      .filter({ hasText: "Confirmation backlog" });
    await expect(confirmationRow).toBeVisible();
    await expect(confirmationRow.getByText("1 open")).toBeVisible();

    await confirmationRow
      .getByRole("button", { name: "Open candidates" })
      .click();
    await expect(
      page.getByText(
        "Priority: Older unconfirmed trades rise first in the confirmation queue.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Review the confirmation blocker with the operations owner.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open confirmation" }).click();

    const handoffBanner = page.locator(".workspace-focus-banner");
    await expect(page).toHaveURL(/view=operations/);
    await expect(page).toHaveURL(/handoff=assistant/);
    await expect(page).toHaveURL(/focusTrade=T-AMEND-100/);
    await expect(page).toHaveURL(/focusFilter=41/);
    await expect(handoffBanner.getByText("Open confirmation")).toBeVisible();
    await expect(
      handoffBanner.getByText(
        "This trade already has a confirmation row that needs issue or follow-through.",
      ),
    ).toBeVisible();
    await expect(handoffBanner.getByText("Trade: T-AMEND-100")).toBeVisible();
    await expect(handoffBanner.getByText("Filter: 41")).toBeVisible();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("shipments truck workflow renders checkpoint history and corrections", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=shipments`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    const deliveryQueue = page.locator(".shipment-queue-stack");
    const detailPanel = page.locator(".shipment-editor-panel");
    const timeline = detailPanel.locator(".timeline");

    await expect(page.getByText("Cross-Mode Delivery Board")).toBeVisible();
    await expect(deliveryQueue.getByText("T-TRUCK-SMOKE-1").first()).toBeVisible();
    await expect(
      deliveryQueue.getByText("Latest truck checkpoint: Departed pickup").first(),
    ).toBeVisible();
    await expect(detailPanel.getByText("Truck Dispatch Workflow")).toBeVisible();
    await expect(timeline.getByText("Truck checkpoint: Departed pickup")).toBeVisible();
    await expect(
      timeline.getByText("Truck checkpoint correction: Arrived pickup"),
    ).toBeVisible();

    const correctedCheckpoint = timeline
      .locator(".timeline-item-card")
      .filter({ hasText: "Corrected truck checkpoint: Arrived pickup" });
    await expect(correctedCheckpoint.getByText("Corrected", { exact: true })).toBeVisible();
    await expect(
      timeline.getByText("Arrival was posted with the wrong time.").first(),
    ).toBeVisible();

    const runQueue = detailPanel
      .locator(".shipment-card")
      .filter({ hasText: "Truck Run Queue" })
      .first();
    await expect(runQueue.getByText("Run 1", { exact: true }).first()).toBeVisible();
    await expect(runQueue.getByText("Departed pickup").first()).toBeVisible();
    const openRunButton = detailPanel.getByRole("button", { name: "Open Run" }).first();
    if (await openRunButton.isVisible().catch(() => false)) {
      await openRunButton.click();
    }

    await expect(detailPanel.getByText("Selected Run 1", { exact: true })).toBeVisible();
    await expect(detailPanel.getByText("Tracking Health: STALE TRACKING")).toBeVisible();
    await expect(detailPanel.getByText("ETA ON TIME")).toBeVisible();
    await expect(
      detailPanel.getByText("Latest truck checkpoint: Departed pickup").first(),
    ).toBeVisible();

    const checkpointSection = detailPanel
      .locator(".shipment-reset-section")
      .filter({ hasText: "Truck Checkpoints" })
      .first();
    await expect(
      checkpointSection.getByText("Active checkpoints: Departed pickup"),
    ).toBeVisible();
    await expect(
      checkpointSection
        .locator(".position-card")
        .filter({ hasText: "Departed pickup" })
        .getByRole("button", { name: "Reverse Checkpoint" }),
    ).toBeVisible();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("shipments truck workflow records normalized tracking signals", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=shipments`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    const detailPanel = page.locator(".shipment-editor-panel");
    await expect(detailPanel.getByText("Truck Dispatch Workflow")).toBeVisible();
    const openRunButton = detailPanel.getByRole("button", { name: "Open Run" }).first();
    if (await openRunButton.isVisible().catch(() => false)) {
      await openRunButton.click();
    }

    await expect(detailPanel.getByText("Selected Run 1", { exact: true })).toBeVisible();
    const signalSection = detailPanel
      .locator(".shipment-card")
      .filter({ hasText: "Tracking Signals" })
      .first();
    await expect(signalSection.getByText("POSITION", { exact: true })).toBeVisible();
    await expect(signalSection.getByText("MATCHED", { exact: true }).first()).toBeVisible();

    await signalSection.getByLabel("Provider Event ID").fill("CALL-SMOKE-NEW");
    await signalSection.getByLabel("Signal Type").fill("ETA_UPDATE");
    await signalSection.getByLabel("Signal Occurred At").fill("2026-05-10T10:15");
    await signalSection.getByLabel("Stop Match").selectOption("STOP-SMOKE-2");
    await signalSection.getByLabel("Signal Location").fill("HOUSTON");
    await signalSection.getByLabel("External Status").fill("Driver is en route to destination");
    await signalSection.getByLabel("Normalized Status").fill("IN_TRANSIT");
    await signalSection.getByLabel("Match Confidence").fill("0.9");
    await signalSection.getByLabel("Destination ETA").fill("2026-05-10T14:45");
    await signalSection.getByLabel("Dispatcher Signal Note").fill("Driver called with an updated ETA.");
    await signalSection.getByRole("button", { name: "Record Tracking Signal" }).click();

    await expect(signalSection.getByText("Signal 18 recorded as MATCHED.")).toBeVisible();
    await expect(signalSection.getByText("ETA UPDATE", { exact: true }).first()).toBeVisible();
    await expect(signalSection.getByText("Driver called with an updated ETA.")).toBeVisible();
    await expect(detailPanel.getByText("Tracking Health: CLEAR")).toBeVisible();

    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
    ).toEqual([]);
    expect(harness.mutationRequests).toEqual([
      {
        method: "POST",
        path: "/truck-movements/MOVE-SMOKE-1/tracking-signals",
        search: "",
      },
    ]);
  } finally {
    await harness.close();
  }
});

test("scheduling and operations surface truck tracking exceptions read-only", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=scheduling`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    const schedulingExceptionTile = page
      .locator(".workspace-tile")
      .filter({ hasText: "Truck Tracking Exceptions" })
      .first();
    await expect(schedulingExceptionTile.getByText("Deterministic Tracking Watch")).toBeVisible();
    await expect(schedulingExceptionTile.getByText("STALE TRACKING")).toBeVisible();
    await expect(schedulingExceptionTile.getByText("T-TRUCK-SMOKE-1")).toBeVisible();
    await expect(schedulingExceptionTile.getByText("ACTION REQUIRED", { exact: true })).toBeVisible();

    await page.goto(`${harness.origin}/?view=operations`, {
      waitUntil: "domcontentloaded",
    });

    const operationsExceptionTile = page
      .locator(".workspace-tile")
      .filter({ hasText: "Truck Tracking Exceptions" })
      .first();
    await expect(operationsExceptionTile.getByText("Deterministic Tracking Watch")).toBeVisible();
    await expect(operationsExceptionTile.getByText("STALE TRACKING")).toBeVisible();
    await expect(operationsExceptionTile.getByText("T-TRUCK-SMOKE-1")).toBeVisible();
    await expect(operationsExceptionTile.getByText("ACTION REQUIRED", { exact: true })).toBeVisible();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("shipments truck workflow surfaces blocked checkpoint reversals near the stop", async ({
  page,
}) => {
  const harness = await startSmokeHarness();
  const blockedReversalMessage =
    "DEPARTED_PICKUP cannot be reversed while downstream truck stop STOP-SMOKE-2 has active progress. Reverse or correct downstream stop progress first.";

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=shipments`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    const detailPanel = page.locator(".shipment-editor-panel");
    await expect(detailPanel.getByText("Truck Dispatch Workflow")).toBeVisible();
    const openRunButton = detailPanel.getByRole("button", { name: "Open Run" }).first();
    if (await openRunButton.isVisible().catch(() => false)) {
      await openRunButton.click();
    }

    await expect(detailPanel.getByText("Selected Run 1", { exact: true })).toBeVisible();
    const checkpointSection = detailPanel
      .locator(".shipment-reset-section")
      .filter({ hasText: "Truck Checkpoints" })
      .first();
    await expect(
      checkpointSection.getByText("Active checkpoints: Departed pickup"),
    ).toBeVisible();

    await checkpointSection
      .getByLabel("Correction Reason")
      .fill("Dispatcher tried to correct the pickup departure before clearing downstream progress.");
    await checkpointSection
      .locator(".position-card")
      .filter({ hasText: "Departed pickup" })
      .getByRole("button", { name: "Reverse Checkpoint" })
      .click();

    await expect(checkpointSection.getByText(blockedReversalMessage)).toBeVisible();
    await expect(detailPanel.getByText("Selected Run 1", { exact: true })).toBeVisible();
    await expect(
      checkpointSection.getByText("Active checkpoints: Departed pickup"),
    ).toBeVisible();

    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
    ).toEqual([]);
    expect(harness.mutationRequests).toEqual([
      {
        method: "POST",
        path: "/truck-stops/STOP-SMOKE-1/checkpoints/3/reverse",
        search: "",
      },
    ]);
  } finally {
    await harness.close();
  }
});

test("mobile shell keeps the main stage full-width and the nav drawer behaves like an overlay", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await page.setViewportSize({
      width: 390,
      height: 844,
    });
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=dashboard`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    const closedMetrics = await readMobileShellMetrics(page);
    expect(closedMetrics.mobileTopbarVisible).toBe(true);
    expect(closedMetrics.sideRailHidden).toBe(true);
    expect(closedMetrics.sideRailVisible).toBe(false);
    expect(closedMetrics.shellTrackCount).toBe(1);
    expect(closedMetrics.mainStageWidth).toBeGreaterThanOrEqual(
      closedMetrics.viewportWidth - 48,
    );

    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await expect(page.locator(".side-rail")).toBeVisible();

    const openMetrics = await readMobileShellMetrics(page);
    expect(openMetrics.sideRailHidden).toBe(false);
    expect(openMetrics.sideRailVisible).toBe(true);
    expect(
      Math.abs(openMetrics.mainStageWidth - closedMetrics.mainStageWidth),
    ).toBeLessThanOrEqual(16);

    await page.getByRole("button", { name: "Close navigation menu" }).click();
    await expect(page.locator(".side-rail")).toHaveAttribute("hidden", "");

    const restoredMetrics = await readMobileShellMetrics(page);
    expect(restoredMetrics.sideRailHidden).toBe(true);
    expect(restoredMetrics.mainStageWidth).toBeGreaterThanOrEqual(
      restoredMetrics.viewportWidth - 48,
    );

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("settlement candidate drilldowns hand off into focused invoice and payment context", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=settlement`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    const invoiceTile = page
      .locator(".tile-section-card")
      .filter({ hasText: "Unissued Invoices" });
    await expect(invoiceTile).toBeVisible();
    await expect(invoiceTile.getByText("1")).toBeVisible();
    await invoiceTile.getByRole("button", { name: "Open candidates" }).click();
    await expect(
      page.getByText(
        "Priority: Ready-to-issue invoice candidates rise before blocked previews.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Ready to issue the first invoice from settlement."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open invoice ledger" }).click();

    let handoffBanner = page.locator(".workspace-focus-banner");
    await expect(page).toHaveURL(/view=settlement/);
    await expect(page).toHaveURL(/handoff=assistant/);
    await expect(page).toHaveURL(/focusTrade=T-AMEND-100/);
    await expect(handoffBanner.getByText("Open invoice ledger")).toBeVisible();
    await expect(
      handoffBanner.getByText(
        "This trade is ready for invoice issuance in settlement.",
      ),
    ).toBeVisible();
    await expect(handoffBanner.getByText("Trade: T-AMEND-100")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open Focused Trade" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Show Full Settlement" }).click();
    await expect(page).not.toHaveURL(/handoff=assistant/);
    await expect(page.locator(".workspace-focus-banner")).toBeHidden();

    const paymentTile = page
      .locator(".tile-section-card")
      .filter({ hasText: "Due / Overdue" });
    await expect(paymentTile).toBeVisible();
    await paymentTile.getByRole("button", { name: "Open candidates" }).click();
    await expect(
      page.getByText(
        "Priority: Overdue cash rises ahead of merely due payments.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Collect overdue cash against invoice INV-501."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open payment queue" }).click();

    handoffBanner = page.locator(".workspace-focus-banner");
    await expect(page).toHaveURL(/view=settlement/);
    await expect(page).toHaveURL(/handoff=assistant/);
    await expect(page).toHaveURL(/focusType=invoice/);
    await expect(page).toHaveURL(/focusId=501/);
    await expect(handoffBanner.getByText("Open payment queue")).toBeVisible();
    await expect(
      handoffBanner.getByText(
        "This trade has overdue cash follow-through that belongs in the payment queue.",
      ),
    ).toBeVisible();
    await expect(handoffBanner.getByText("Invoice: INV-501")).toBeVisible();
    await expect(handoffBanner.getByText("Filter: 501")).toBeVisible();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("single-user smoke signs into the prompt home when one-click access is enabled", async ({
  page,
}) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true });

  try {
    await seedApiBaseOverride(page, harness);
    await page.goto(harness.origin, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.locator(".auth-gate-stage")).toBeVisible();
    await expect(page.locator(".workspace-topbar-prompt")).toHaveCount(0);
    await expect(page.locator(".hero")).toHaveCount(0);
    await expect(page.locator(".nav-global-filter")).toHaveCount(0);
    await expect(page.getByLabel("Operator prompt")).toHaveCount(0);
    await signInFromPromptHome(page);

    await expect(page.getByLabel("Operator prompt")).toBeVisible();
    await expect(page.getByText("Signed in as Ops Admin")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Assistant Console", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Recent blocker triage/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Show live context" }),
    ).toHaveCount(0);
    await expect(page.getByText("Contextual starting points")).toHaveCount(0);
    await expect(page.getByText("Recent prompt threads")).toHaveCount(0);
    await expect(page.locator(".prompt-home-map-card")).toContainText(
      "all 1 shown on map",
    );
    await expect(page.locator(".prompt-home-map-card")).toContainText(
      "Map Records1 map record",
    );
    await expect(page.locator(".prompt-home-map-card")).not.toContainText(
      "No map-ready assets yet.",
    );

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("prompt home prompt card expands and collapses independently", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.goto(harness.origin, {
      waitUntil: "domcontentloaded",
    });

    const promptCard = page.locator(".prompt-home-prompt-card");
    const promptCardBody = page.locator("#prompt-home-prompt-card-panel");
    const promptCardToggle = promptCard.locator(
      ".prompt-home-prompt-card-toggle",
    );
    const operatorPrompt = page.getByLabel("Operator prompt");
    const currentPromptThread = promptCard.locator(".prompt-home-chat");

    await expect(promptCard).toContainText("Ask the desk assistant");
    await expect(promptCardToggle).toContainText("Hide card");
    await expect(promptCardBody).toBeVisible();
    await expect(operatorPrompt).toBeVisible();
    await expect(page.locator(".prompt-home-quick-prompts")).toHaveCount(0);
    await expect(currentPromptThread).toBeVisible();

    await promptCardToggle.click();
    await expect(promptCardToggle).toContainText("Show card");
    await expect(promptCardBody).toBeHidden();
    await expect(operatorPrompt).toBeHidden();
    await expect(currentPromptThread).toBeHidden();

    await promptCardToggle.click();
    await expect(promptCardToggle).toContainText("Hide card");
    await expect(promptCardBody).toBeVisible();
    await expect(operatorPrompt).toBeVisible();
    await expect(currentPromptThread).toBeVisible();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("prompt home verbalize auto-reads assistant replies only when enabled", async ({
  page,
}) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true });

  try {
    await installSpeechSynthesisRecorder(page);
    await seedApiBaseOverride(page, harness);
    await page.goto(harness.origin, {
      waitUntil: "domcontentloaded",
    });

    await signInFromPromptHome(page);

    const operatorPrompt = page.getByLabel("Operator prompt");
    const verbalizeToggle = page.getByRole("checkbox", { name: "Verbalize" });

    await expect(verbalizeToggle).not.toBeChecked();

    await operatorPrompt.fill("Where should I handle the confirmation blocker?");
    await page.getByRole("button", { name: "Send Prompt" }).click();
    await expect(
      page.locator(".assistant-message-assistant").first(),
    ).toContainText("Operations is the right place to continue");
    await expect.poll(() => readPromptHomeSpeechLog(page)).toEqual([]);

    await verbalizeToggle.check();
    await operatorPrompt.fill("Where should I handle the invoice settlement item?");
    await page.getByRole("button", { name: "Send Prompt" }).click();
    await expect(
      page.locator(".assistant-message-assistant").filter({
        hasText: "Settlement is the right place to continue",
      }),
    ).toContainText("Settlement is the right place to continue");
    await expect
      .poll(async () => (await readPromptHomeSpeechLog(page)).at(-1) ?? null)
      .toBe(
        "Settlement is the right place to continue because the open item is invoice and payment follow-through.",
      );

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("checkbox", { name: "Verbalize" }),
    ).not.toBeChecked();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("prompt home keeps the simplified map visible while desk time cards collapse independently", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await page
      .context()
      .grantPermissions(["geolocation"], { origin: harness.origin });
    await page.context().setGeolocation({
      latitude: 29.7604,
      longitude: -95.3698,
    });
    await seedSignedInSession(page, harness);
    await page.goto(harness.origin, {
      waitUntil: "domcontentloaded",
    });

    const deskTimePanel = page.locator("#prompt-home-timeframe-panel");
    const deskTimeHead = page.locator(".prompt-home-timeframe-panel-head");
    const dayPanel = page.locator("#prompt-home-day-panel");
    const weekPanel = page.locator("#prompt-home-week-panel");
    const monthPanel = page.locator("#prompt-home-month-panel");
    const mapPanel = page.locator("#prompt-home-map-panel");
    const deskTimeToggle = page.locator(
      ".prompt-home-timeframe-panel-toggle-action",
    );
    const deskTimeCopy = page.locator(".prompt-home-timeframe-panel-copy");
    const mapToggle = page.locator(".prompt-home-map-card-toggle");
    const mapFiltersCard = page.locator(
      ".prompt-home-map-card .asset-map-filters-card",
    );
    const mapFiltersToggle = mapFiltersCard.locator(
      ".asset-map-filters-card-toggle",
    );
    const mapFiltersBody = mapFiltersCard.locator(
      ".asset-map-filters-card-body",
    );
    const savePresetInput = mapFiltersCard.getByLabel("Save map filters as");
    const savedPresetSelect = mapFiltersCard.getByLabel(
      "Saved map filter presets",
    );
    const savePresetButton = mapFiltersCard.getByRole("button", {
      name: "Save",
    });
    const mapRecordsCard = page.locator(
      ".prompt-home-map-card .asset-map-records-card",
    );
    const mapRecordsToggle = mapRecordsCard.locator(
      ".asset-map-records-card-toggle",
    );
    const mapRecordsBody = mapRecordsCard.locator(
      ".asset-map-records-card-body",
    );
    const myLocationToggle = page.getByRole("checkbox", {
      name: "My Location",
    });
    const assetsToggle = page.getByRole("checkbox", { name: "Assets" });
    const weatherToggle = page.getByRole("checkbox", { name: "Weather" });
    const activityControls = page.getByLabel("Activity visibility controls");
    const geographyControls = page.getByLabel("Geography visibility controls");
    const assetTypeControls = page.getByLabel("Asset type visibility controls");
    const countrySearch = page.getByRole("searchbox", {
      name: "Country",
    });
    const subdivisionSearch = page.getByRole("searchbox", {
      name: "State or Territory",
    });
    const northAmericaToggle = page.getByRole("checkbox", {
      name: "North America",
    });
    const positionsActivityToggle = page.getByRole("checkbox", {
      name: "Positions",
    });
    const shipmentsActivityToggle = page.getByRole("checkbox", {
      name: "Shipments",
    });
    const inventoryActivityToggle = page.getByRole("checkbox", {
      name: "Inventory",
    });
    const tooltipToggle = page.getByRole("checkbox", { name: "Tooltips" });
    const weatherOverlayControls = page.getByLabel("Weather overlay controls");
    const radarOverlayToggle = weatherOverlayControls.getByRole("checkbox", {
      name: "Radar",
    });
    const dayCard = page
      .locator(".prompt-home-time-meter-card")
      .filter({ has: dayPanel });
    const weekCard = page
      .locator(".prompt-home-time-meter-card")
      .filter({ has: weekPanel });
    const monthCard = page
      .locator(".prompt-home-time-meter-card")
      .filter({ has: monthPanel });
    const dayToggle = page.locator(
      ".prompt-home-time-meter-card:has(#prompt-home-day-panel) .prompt-home-time-meter-card-toggle",
    );
    const weekToggle = page.locator(
      ".prompt-home-time-meter-card:has(#prompt-home-week-panel) .prompt-home-time-meter-card-toggle",
    );
    const monthToggle = page.locator(
      ".prompt-home-time-meter-card:has(#prompt-home-month-panel) .prompt-home-time-meter-card-toggle",
    );
    const timeZoneSelect = page.getByLabel("Preferred time zone");

    await expect(deskTimePanel).toBeVisible();
    await expect(dayPanel).toBeVisible();
    await expect(weekPanel).toBeVisible();
    await expect(monthPanel).toBeVisible();
    await expect(mapPanel).toBeVisible();
    await expect(page.locator(".prompt-home-map-card")).not.toContainText(
      "No map-ready assets yet.",
    );
    await expect(page.locator(".prompt-home-map-card")).not.toContainText(
      "Asset footprint preview",
    );
    await expect(page.locator(".prompt-home-map-card")).not.toContainText(
      "Preview map-ready assets and shared spatial overlays without leaving Home.",
    );
    await expect(page.locator(".prompt-home-map-card")).not.toContainText(
      "Map Scope",
    );
    await expect(page.locator(".prompt-home-map-card")).not.toContainText(
      "map-ready assets are currently plotted in Home.",
    );
    await expect(page.locator(".prompt-home-map-card")).not.toContainText(
      "All currently loaded assets meet the map-ready rules.",
    );
    await expect(mapToggle).toContainText("Map");
    await expect(mapToggle).toContainText("Hide card");
    await expect(mapFiltersCard).toContainText("Map Filters");
    await expect(mapFiltersToggle).toContainText("Hide card");
    await expect(mapFiltersBody).toBeVisible();
    await expect(myLocationToggle).toBeVisible();
    await expect(myLocationToggle).toBeChecked();
    await expect(assetsToggle).toBeVisible();
    await expect(assetsToggle).toBeChecked();
    await expect(weatherToggle).toBeVisible();
    await expect(weatherToggle).toBeChecked();
    await expect(activityControls).toBeVisible();
    await expect(
      activityControls.getByText("Activity", { exact: true }),
    ).toBeVisible();
    await expect(positionsActivityToggle).toBeChecked();
    await expect(shipmentsActivityToggle).toBeChecked();
    await expect(inventoryActivityToggle).toBeChecked();
    await expect(page.getByText("Geography")).toBeVisible();
    await expect(northAmericaToggle).toBeVisible();
    await expect(northAmericaToggle).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "South America" }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "EMEA" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "APAC" })).toBeVisible();
    await expect(
      geographyControls.getByRole("button", { name: "Uncheck all" }),
    ).toBeVisible();
    await expect(countrySearch).toBeVisible();
    await expect(countrySearch).toHaveAttribute("placeholder", "All countries");
    await countrySearch.fill("United");
    await expect(countrySearch).toHaveValue("United");
    await countrySearch.fill("");
    await expect(subdivisionSearch).toBeVisible();
    await expect(subdivisionSearch).toHaveAttribute(
      "placeholder",
      "All states or territories",
    );
    await subdivisionSearch.fill("LA");
    await expect(subdivisionSearch).toHaveValue("LA");
    await subdivisionSearch.fill("");
    await expect(tooltipToggle).toBeVisible();
    await expect(tooltipToggle).toBeChecked();
    await expect(weatherOverlayControls).toBeVisible();
    await expect(radarOverlayToggle).toBeVisible();
    await expect(radarOverlayToggle).toBeChecked();
    await expect(
      weatherOverlayControls.getByRole("checkbox", { name: "Precipitation" }),
    ).toHaveCount(0);
    await expect(
      weatherOverlayControls.getByRole("checkbox", { name: "Temperature" }),
    ).toHaveCount(0);
    await expect(page.getByText("Asset Types")).toBeVisible();
    await expect(
      assetTypeControls.getByRole("button", { name: "Uncheck all" }),
    ).toBeVisible();
    await expect(savePresetInput).toBeVisible();
    await expect(savePresetInput).toHaveAttribute(
      "placeholder",
      "Filter preset name",
    );
    await expect(savedPresetSelect).toBeVisible();
    await expect(savedPresetSelect).toBeDisabled();
    await expect(savedPresetSelect).toHaveValue("");
    await expectLocatorsOnSameLine(savePresetButton, savedPresetSelect);
    await expect(savePresetButton).toBeDisabled();
    await expect(
      page.getByRole("checkbox", { name: "Pipeline" }),
    ).toBeChecked();
    await expect(page.getByText(/tracked weather points visible/)).toHaveCount(0);
    await expect(page.locator(".asset-map-weather-marker")).toHaveCount(0);
    await expect(page.locator(".asset-map-weather-preview")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Where I am" })).toHaveCount(
      0,
    );
    await expect(page.locator(".asset-map-user-marker")).toBeVisible();
    await expect(timeZoneSelect).toBeVisible();
    await expectLocatorNearRightEdge(deskTimeHead, deskTimeToggle);
    await mapFiltersToggle.click();
    await expect(mapFiltersToggle).toContainText("Show card");
    await expect(mapFiltersBody).toBeHidden();
    await mapFiltersToggle.click();
    await expect(mapFiltersToggle).toContainText("Hide card");
    await expect(mapFiltersBody).toBeVisible();
    await expect(savePresetButton).toBeDisabled();
    await savePresetInput.fill("Smoke Home Filters");
    await expect(savePresetButton).toBeEnabled();
    await savePresetButton.click();
    await expect(mapFiltersCard).toContainText(
      'Saved preset "Smoke Home Filters".',
    );
    await expect(savedPresetSelect).toBeEnabled();
    await expect(savedPresetSelect).toHaveValue("Smoke Home Filters");
    await expect(savedPresetSelect).toContainText("Smoke Home Filters");
    const savedPresets = await page.evaluate(() =>
      JSON.parse(
        window.localStorage.getItem("ectrm.asset-map-filter-presets.v1") ??
          "[]",
      ),
    );
    const smokeHomePreset = savedPresets.find(
      (entry: {
        name?: string;
        filters?: {
          assetActivityVisibility?: Record<string, boolean>;
          showAssets?: boolean;
          showWeather?: boolean;
          selectedCountryCode?: string;
        };
      }) => entry?.name === "Smoke Home Filters",
    );
    expect(smokeHomePreset).toBeTruthy();
    expect(smokeHomePreset.filters?.assetActivityVisibility?.Positions).toBe(
      true,
    );
    expect(smokeHomePreset.filters?.showAssets).toBe(true);
    expect(smokeHomePreset.filters?.showWeather).toBe(true);
    expect(smokeHomePreset.filters?.selectedCountryCode).toBe("");
    await positionsActivityToggle.uncheck();
    await expect(page.locator(".asset-map-marker")).toHaveCount(1);
    await shipmentsActivityToggle.uncheck();
    await expect(page.locator(".prompt-home-map-card")).toContainText(
      "No selected activities are visible right now.",
    );
    await savedPresetSelect.selectOption("");
    await expect(savedPresetSelect).toHaveValue("");
    await savedPresetSelect.selectOption("Smoke Home Filters");
    await expect(mapFiltersCard).toContainText(
      'Loaded preset "Smoke Home Filters".',
    );
    await expect(savedPresetSelect).toHaveValue("Smoke Home Filters");
    await expect(positionsActivityToggle).toBeChecked();
    await expect(shipmentsActivityToggle).toBeChecked();
    await expect(page.locator(".asset-map-marker")).toHaveCount(1);
    await expect(mapRecordsCard).toContainText("Map Records");
    await expect(mapRecordsCard).toContainText(/\d+ map records?/);
    await expect(mapRecordsToggle).toContainText("Show card");
    await expect(mapRecordsBody).toBeHidden();

    await assetTypeControls
      .getByRole("button", { name: "Uncheck all" })
      .click();
    await expect(
      assetTypeControls.getByRole("button", { name: "Check all" }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "Pipeline" }),
    ).not.toBeChecked();
    await expect(page.locator(".prompt-home-map-card")).toContainText(
      "No selected asset types are visible right now.",
    );
    await tooltipToggle.uncheck();
    await expect(page.locator(".asset-map-marker-tooltip")).toHaveCount(0);

    await assetTypeControls.getByRole("button", { name: "Check all" }).click();
    await expect(
      assetTypeControls.getByRole("button", { name: "Uncheck all" }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "Pipeline" }),
    ).toBeChecked();
    await geographyControls
      .getByRole("button", { name: "Uncheck all" })
      .click();
    await expect(
      geographyControls.getByRole("button", { name: "Check all" }),
    ).toBeVisible();
    await expect(northAmericaToggle).not.toBeChecked();
    await geographyControls.getByRole("button", { name: "Check all" }).click();
    await expect(
      geographyControls.getByRole("button", { name: "Uncheck all" }),
    ).toBeVisible();
    await expect(northAmericaToggle).toBeChecked();
    await tooltipToggle.check();
    await mapRecordsToggle.click();
    await expect(mapRecordsToggle).toContainText("Hide card");
    await expect(mapRecordsBody).toBeVisible();
    await expect(
      mapRecordsBody.getByRole("button", {
        name: "Focus GULF_PIPELINE on map",
      }),
    ).toBeVisible();

    await dayToggle.click();
    await expect(dayPanel).toBeHidden();
    await expect(dayCard).toContainText("Desk window HE07 to HE22");
    await expect(dayCard).toContainText("venue sessions");
    await expectLocatorsOnSameLine(
      dayCard.locator(".prompt-home-time-meter-card-collapsed-line strong"),
      dayCard.locator(".prompt-home-time-meter-card-summary"),
    );
    await expectLocatorNearRightEdge(
      dayCard,
      dayCard.locator(".prompt-home-time-meter-card-toggle-meta"),
    );
    await expectLocatorAbove(
      dayCard.locator(".prompt-home-time-meter-card-toggle-meta"),
      dayCard.locator(".status-pill"),
    );

    await weekToggle.click();
    await expect(weekPanel).toBeHidden();
    await expect(weekCard).toContainText("Sunday through Saturday");
    await expect(weekCard).toContainText("Week progress");
    await expectLocatorsOnSameLine(
      weekCard.locator(".prompt-home-time-meter-card-collapsed-line strong"),
      weekCard.locator(".prompt-home-time-meter-card-summary"),
    );
    await expectLocatorNearRightEdge(
      weekCard,
      weekCard.locator(".prompt-home-time-meter-card-toggle-meta"),
    );
    await expectLocatorAbove(
      weekCard.locator(".prompt-home-time-meter-card-toggle-meta"),
      weekCard.locator(".status-pill"),
    );

    await monthToggle.click();
    await expect(monthPanel).toBeHidden();
    await expect(monthCard).toContainText("1 through EOM");
    await expect(monthCard).toContainText("days this month");
    await expectLocatorsOnSameLine(
      monthCard.locator(".prompt-home-time-meter-card-collapsed-line strong"),
      monthCard.locator(".prompt-home-time-meter-card-summary"),
    );
    await expectLocatorNearRightEdge(
      monthCard,
      monthCard.locator(".prompt-home-time-meter-card-toggle-meta"),
    );
    await expectLocatorAbove(
      monthCard.locator(".prompt-home-time-meter-card-toggle-meta"),
      monthCard.locator(".status-pill"),
    );

    await expect(
      page.locator(".prompt-home-map-card .asset-map-canvas-shell"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open Map Workspace" }),
    ).toBeVisible();
    await expect(page.locator(".asset-map-user-marker")).toBeVisible();
    await page.waitForFunction(
      () => document.querySelectorAll(".asset-map-marker").length > 0,
    );
    await expect(page.locator(".asset-map-weather-marker")).toHaveCount(0);
    await expect(page.locator(".asset-map-weather-preview")).toHaveCount(0);

    await myLocationToggle.uncheck();
    await expect(page.locator(".asset-map-user-marker")).toHaveCount(0);
    await myLocationToggle.check();
    await expect(page.locator(".asset-map-user-marker")).toBeVisible();

    await assetsToggle.uncheck();
    await expect(page.locator(".asset-map-marker")).toHaveCount(0);
    await assetsToggle.check();
    await page.waitForFunction(
      () => document.querySelectorAll(".asset-map-marker").length > 0,
    );

    await weatherToggle.uncheck();
    await expect(page.locator(".asset-map-weather-marker")).toHaveCount(0);
    await expect(page.locator(".asset-map-weather-preview")).toHaveCount(0);
    await weatherToggle.check();
    await expect(page.locator(".asset-map-weather-marker")).toHaveCount(0);

    await mapToggle.click();
    await expect(mapPanel).toBeHidden();
    await expect(mapToggle).toContainText("Show card");

    await deskTimeToggle.click();
    await expect(deskTimePanel).toBeHidden();
    await expect(deskTimeToggle).toContainText("Show card");
    await expect(deskTimeCopy).toContainText(
      /\d{1,2}:\d{2}\s(?:AM|PM)\s\|\sHE\d{2}\s\|\s(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s\|\s[A-Z][a-z]{2}\s\d{2}/,
    );
    await expect(timeZoneSelect).toHaveCount(0);
    await expect(mapPanel).toBeHidden();

    await mapToggle.click();
    await expect(mapPanel).toBeVisible();
    await expect(page.locator(".asset-map-user-marker")).toBeVisible();

    await deskTimeToggle.click();
    await expect(deskTimePanel).toBeVisible();
    await expect(timeZoneSelect).toBeVisible();

    await dayToggle.click();
    await weekToggle.click();
    await monthToggle.click();

    await expect(dayPanel).toBeVisible();
    await expect(weekPanel).toBeVisible();
    await expect(monthPanel).toBeVisible();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("prompt home add event opens the custom events settings card", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.goto(harness.origin, {
      waitUntil: "domcontentloaded",
    });

    const startHereOverlay = page.locator(".start-here-dialog");
    if (await startHereOverlay.isVisible().catch(() => false)) {
      await dismissStartHereOverlay(page);
    }

    const addEventLink = page.getByRole("link", { name: "Add Event" });
    const customEventsCard = page.locator("#settings-custom-events-card");
    const customEventsPanel = page.locator(
      "#settings-custom-events-card-panel",
    );

    await expect(addEventLink).toHaveAttribute(
      "href",
      "/?view=settings#settings-custom-events-card",
    );

    await addEventLink.click();

    await expect(page).toHaveURL(
      /\/\?view=settings#settings-custom-events-card$/,
    );
    await expect(customEventsCard).toBeVisible();
    await expect(customEventsPanel).toBeVisible();
    await expect(page.getByLabel("Event name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Event" })).toBeVisible();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("prompt home collapse state survives sign-out and sign-in", async ({
  page,
}) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true });

  try {
    await seedApiBaseOverride(page, harness);
    await page.goto(harness.origin, {
      waitUntil: "domcontentloaded",
    });

    await signInFromPromptHome(page);

    const deskTimePanel = page.locator("#prompt-home-timeframe-panel");
    const weekPanel = page.locator("#prompt-home-week-panel");
    const deskTimeToggle = page.locator(
      ".prompt-home-timeframe-panel-toggle-action",
    );
    const weekToggle = page.locator(
      ".prompt-home-time-meter-card:has(#prompt-home-week-panel) .prompt-home-time-meter-card-toggle",
    );
    const timeZoneSelect = page.getByLabel("Preferred time zone");

    await expect(deskTimePanel).toBeVisible();
    await expect(weekPanel).toBeVisible();
    await expect(timeZoneSelect).toBeVisible();

    await weekToggle.click();
    await expect(weekPanel).toBeHidden();

    await deskTimeToggle.click();
    await expect(deskTimePanel).toBeHidden();

    await signOutFromPromptHome(page);
    await signInFromPromptHome(page);

    await expect(deskTimePanel).toBeHidden();
    await expect(timeZoneSelect).toHaveCount(0);

    await deskTimeToggle.click();
    await expect(deskTimePanel).toBeVisible();
    await expect(weekPanel).toBeHidden();
    await expect(timeZoneSelect).toBeVisible();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("stored signed-out prompt draft resumes and sends after sign-in", async ({
  page,
}) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true });

  try {
    await seedApiBaseOverride(page, harness);
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "ectrm.prompt-resume-intent",
        JSON.stringify({
          draft: "Where should I handle the confirmation blocker?",
          submitAfterSignIn: true,
          createdAt: "2026-05-16T12:00:00.000Z",
        }),
      );
    });
    await page.goto(harness.origin, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.locator(".auth-gate-stage")).toBeVisible();
    await expect(page.getByLabel("Operator prompt")).toHaveCount(0);
    await expect(
      page.getByText("After sign-in, sending your prompt:"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Single Sign On" }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Single Sign On" })
      .click();

    await expect(page).toHaveURL(/^(?!.*view=settings).*$/);
    await expect(page.getByText("Signed in as Ops Admin")).toBeVisible();
    await expect(
      page
        .locator(".assistant-message-user")
        .getByText("Where should I handle the confirmation blocker?"),
    ).toBeVisible();
    await expect(
      page
        .locator(".assistant-message-assistant")
        .getByText("Operations is the right place to continue"),
    ).toBeVisible();
    await expect(
      page.locator(".assistant-message-assistant"),
    ).not.toContainText("navigation_intent");
    await expect(
      page
        .locator(".prompt-home-handoff")
        .filter({ hasText: "Open Work Queue" }),
    ).toBeVisible();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("prompt home opens a promoted deterministic route directly", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.goto(harness.origin, {
      waitUntil: "domcontentloaded",
    });

    const promotedRoutes = page
      .locator("section")
      .filter({
        has: page.getByRole("heading", {
          name: "Go straight to proven destinations",
        }),
      })
      .first();
    await expect(promotedRoutes).toBeVisible();
    await expect(
      promotedRoutes.getByText("Promoted routes: 1 ready."),
    ).toBeVisible();
    await expect(promotedRoutes.getByText("Trade: T-AMEND-100")).toBeVisible();
    await expect(promotedRoutes.getByText("4/5 accepted")).toBeVisible();

    await promotedRoutes
      .getByRole("button", { name: "Open confirmation" })
      .click();

    await expect(page).toHaveURL(/view=operations/);
    await expect(page).toHaveURL(/handoff=assistant/);
    await expect(page).toHaveURL(/focusTrade=T-AMEND-100/);
    await expect(page).toHaveURL(/focusFilter=41/);
    await expect(
      page.locator(".workspace-focus-banner").getByText("Open confirmation"),
    ).toBeVisible();
    await expect(
      page
        .locator(".workspace-focus-banner")
        .getByText(
          "This trade already has a confirmation row that needs issue or follow-through.",
        ),
    ).toBeVisible();

    expect(harness.promptNavigationOutcomeRequests).toContainEqual({
      method: "POST",
      path: "/assistant/prompt-navigation-outcomes",
      search: "",
    });

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("prompt home accepts an assistant handoff into the old operations workspace", async ({
  page,
}) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true });

  try {
    await seedApiBaseOverride(page, harness);
    await page.goto(harness.origin, {
      waitUntil: "domcontentloaded",
    });

    await signInFromPromptHome(page);

    await page
      .getByLabel("Operator prompt")
      .fill("Where should I handle the confirmation blocker?");
    await page.getByRole("button", { name: "Send Prompt" }).click();

    const assistantHandoff = page
      .locator(".prompt-home-handoff")
      .filter({ hasText: "Open Work Queue" });
    await expect(assistantHandoff).toBeVisible();
    await expect(
      page.locator(".assistant-message-assistant"),
    ).not.toContainText("navigation_intent");

    await assistantHandoff.click();

    await expect(page).toHaveURL(/view=operations/);
    await expect(page).toHaveURL(/handoff=assistant/);
    await expect(page).toHaveURL(/focusTrade=T-AMEND-100/);
    await expect(page.getByText("Assistant run #8801")).toBeVisible();
    await expect(page.getByText("Trade: T-AMEND-100")).toBeVisible();
    await expect(
      page.getByText(
        "Review the confirmation blocker with the operations owner",
      ),
    ).toBeVisible();

    await page.getByRole("button", { name: "Show Full Queue" }).click();
    await expect(page).toHaveURL(/view=operations/);
    await expect(page).not.toHaveURL(/handoff=assistant/);
    await expect(page.getByText("Assistant run #8801")).toBeHidden();

    await page.goto(`${harness.origin}/?view=admin`, {
      waitUntil: "domcontentloaded",
    });

    const outcomeSection = page.locator("#assistant-outcome-metrics");
    await expect(
      outcomeSection.getByRole("heading", { name: "Recent Handoff Outcomes" }),
    ).toBeVisible();
    await expect(outcomeSection.getByText("Accepted handoff")).toBeVisible();
    await expect(
      outcomeSection.getByText("Open Work Queue").first(),
    ).toBeVisible();

    expect(harness.promptNavigationOutcomeRequests).toContainEqual({
      method: "POST",
      path: "/assistant/runs/8801/prompt-navigation-outcomes",
      search: "",
    });

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("prompt home dismisses an assistant handoff and records the dismissed route", async ({
  page,
}) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true });

  try {
    await seedApiBaseOverride(page, harness);
    await page.goto(harness.origin, {
      waitUntil: "domcontentloaded",
    });

    await signInFromPromptHome(page);

    await page
      .getByLabel("Operator prompt")
      .fill("Where should I handle the confirmation blocker?");
    await page.getByRole("button", { name: "Send Prompt" }).click();

    const assistantMessage = page
      .locator(".assistant-message-assistant")
      .last();
    await assistantMessage
      .getByRole("button", { name: "Dismiss Open Work Queue" })
      .click();

    await expect(assistantMessage.locator(".prompt-home-handoff")).toHaveCount(
      0,
    );

    await page.goto(`${harness.origin}/?view=admin`, {
      waitUntil: "domcontentloaded",
    });

    const outcomeSection = page.locator("#assistant-outcome-metrics");
    await expect(outcomeSection.getByText("Dismissed handoff")).toBeVisible();
    await expect(
      outcomeSection.getByText("Open Work Queue").first(),
    ).toBeVisible();

    expect(harness.promptNavigationOutcomeRequests).toContainEqual({
      method: "POST",
      path: "/assistant/runs/8801/prompt-navigation-outcomes",
      search: "",
    });
    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("prompt home accepts an assistant handoff into settlement workspace", async ({
  page,
}) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true });

  try {
    await seedApiBaseOverride(page, harness);
    await page.goto(harness.origin, {
      waitUntil: "domcontentloaded",
    });

    await signInFromPromptHome(page);

    await page
      .getByLabel("Operator prompt")
      .fill("Where should I handle the invoice settlement item?");
    await page.getByRole("button", { name: "Send Prompt" }).click();

    const assistantHandoff = page
      .locator(".prompt-home-handoff")
      .filter({ hasText: "Open Settlement" });
    await expect(assistantHandoff).toBeVisible();
    await expect(
      page.locator(".assistant-message-assistant"),
    ).not.toContainText("navigation_intent");

    await assistantHandoff.click();

    await expect(page).toHaveURL(/view=settlement/);
    await expect(page).toHaveURL(/handoff=assistant/);
    await expect(page).toHaveURL(/focusTrade=T-AMEND-100/);
    await expect(page.getByText("Assistant run #8801")).toBeVisible();
    await expect(page.getByText("Trade: T-AMEND-100")).toBeVisible();
    await expect(
      page.getByText("Review settlement follow-through for T-AMEND-100"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open Focused Trade" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Show Full Settlement" }).click();
    await expect(page).toHaveURL(/view=settlement/);
    await expect(page).not.toHaveURL(/handoff=assistant/);
    await expect(page.getByText("Assistant run #8801")).toBeHidden();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("prompt home accepts an assistant handoff into trade capture", async ({
  page,
}) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true });

  try {
    await seedApiBaseOverride(page, harness);
    await page.goto(harness.origin, {
      waitUntil: "domcontentloaded",
    });

    await signInFromPromptHome(page);

    await page
      .getByLabel("Operator prompt")
      .fill("Open trade capture to amend T-AMEND-100");
    await page.getByRole("button", { name: "Send Prompt" }).click();

    const assistantHandoff = page
      .locator(".prompt-home-handoff")
      .filter({ hasText: "Open Trade Capture" });
    await expect(assistantHandoff).toBeVisible();
    await expect(
      page.locator(".assistant-message-assistant"),
    ).not.toContainText("navigation_intent");

    await assistantHandoff.click();

    await expect(page).toHaveURL(/view=trades/);
    await expect(page).toHaveURL(/trade=T-AMEND-100/);
    await expect(page).toHaveURL(/handoff=assistant/);
    await expect(page).toHaveURL(/tradeTab=amend/);
    await expect(page.getByText("Assistant run #8801")).toBeVisible();
    await expect(page.getByText("Trade: T-AMEND-100")).toBeVisible();
    await expect(page.getByText("Inspector: amend")).toBeVisible();
    await expect(
      page.getByText("Open the amend panel for T-AMEND-100"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Show Full Blotter" }).click();
    await expect(page).toHaveURL(/view=trades/);
    await expect(page).not.toHaveURL(/handoff=assistant/);
    await expect(page).not.toHaveURL(/tradeTab=amend/);
    await expect(page.getByText("Assistant run #8801")).toBeHidden();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("assistant feedback smoke persists response feedback through chat reload and admin outcome metrics", async ({
  page,
}) => {
  const harness = await startSmokeHarness();
  const feedbackNote = "Surface the confirmation queue owner before routing.";

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=assistant`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    const composer = page.locator("form.assistant-composer");
    await expect(composer).toBeVisible();
    await composer
      .getByLabel("Prompt")
      .fill("Where should I handle the confirmation blocker?");
    await composer.getByRole("button", { name: "Send Prompt" }).click();

    const assistantMessage = page
      .locator(".assistant-message-assistant")
      .filter({ hasText: "Operations is the right place to continue" });
    await expect(assistantMessage).toBeVisible();

    await assistantMessage.getByRole("button", { name: "Add note" }).click();
    await assistantMessage
      .getByPlaceholder("What should change in this answer?")
      .fill(feedbackNote);
    await assistantMessage.getByRole("button", { name: "Needs work" }).click();

    await expect(assistantMessage.getByText("Saved needs work")).toBeVisible();
    await expect(
      assistantMessage.getByPlaceholder("What should change in this answer?"),
    ).toHaveValue(feedbackNote);

    await page.getByRole("button", { name: "Start new chat" }).click();
    await expect(page.getByText("No chat selected")).toBeVisible();
    await page.getByRole("button", { name: /Recent blocker triage/ }).click();

    const reloadedAssistantMessage = page
      .locator(".assistant-message-assistant")
      .filter({ hasText: "Operations is the right place to continue" });
    await expect(
      reloadedAssistantMessage.getByText("Saved needs work"),
    ).toBeVisible();
    await expect(
      reloadedAssistantMessage.getByPlaceholder(
        "What should change in this answer?",
      ),
    ).toHaveValue(feedbackNote);

    await page.goto(`${harness.origin}/?view=admin`, {
      waitUntil: "domcontentloaded",
    });

    const outcomeSection = page.locator("#assistant-outcome-metrics");
    const feedbackSummary = outcomeSection
      .locator(".assistant-run-summary-card")
      .filter({ hasText: "User feedback" });

    await expect(outcomeSection).toBeVisible();
    await expect(feedbackSummary.getByText("1/3")).toBeVisible();
    await expect(
      outcomeSection.getByRole("heading", { name: "Workspace Signals" }),
    ).toBeVisible();
    await expect(
      outcomeSection.getByRole("heading", { name: "Recent Run Notes" }),
    ).toBeVisible();
    await expect(outcomeSection.getByText(feedbackNote)).toBeVisible();

    expect(harness.mutationRequests).toContainEqual({
      method: "POST",
      path: "/assistant/runs/8801/feedback",
      search: "",
    });
    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
    ).toHaveLength(0);
  } finally {
    await harness.close();
  }
});

test("admin smoke shows the role-derived pilot lineup and sync action", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=admin`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    const agentControl = page
      .locator("section")
      .filter({
        has: page.getByRole("heading", { name: "Managed Agent Control" }),
      })
      .first();
    const roleCatalog = agentControl.locator(".assistant-role-catalog-shell");

    await expect(agentControl).toBeVisible();
    await expect(
      agentControl.getByText("Role profiles", { exact: true }),
    ).toBeVisible();
    await expect(
      agentControl
        .locator(".assistant-admin-agent-card")
        .filter({ hasText: "Ops Governor" }),
    ).toBeVisible();
    await expect(agentControl.getByText("Evals PASS")).toBeVisible();
    const constructionReview = agentControl.locator(
      ".assistant-admin-construction-review:not(.assistant-admin-draft-construction-review)",
    );
    await expect(constructionReview).toContainText("Saved Construction Preview");
    await expect(constructionReview).toContainText("Context provenance");
    await expect(constructionReview).toContainText("Managed agent overlay");
    await expect(constructionReview).toContainText("Fallback");
    await expect(
      roleCatalog.getByRole("button", { name: /Pre-Trade Structuring Agent/ }),
    ).toBeVisible();
    await expect(roleCatalog.getByText("Phase 1").first()).toBeVisible();

    await agentControl
      .getByRole("button", { name: "Sync Pilot Lineup" })
      .click();
    await expect(
      agentControl.getByText(
        "Pilot lineup synchronized: 0 created, 1 updated across 1 seeded defaults.",
      ),
    ).toBeVisible();

    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
    ).toHaveLength(0);
    expect(harness.mutationRequests).toEqual([
      {
        method: "POST",
        path: "/admin/data/assistant-agents/seed",
        search: "",
      },
    ]);
  } finally {
    await harness.close();
  }
});

test("assistant smoke submits a governed agent change request and admin marks it applied", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=assistant`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    const agentDirectory = page.locator(".assistant-agent-directory");
    await expect(agentDirectory).toBeVisible();
    await agentDirectory
      .getByRole("button", { name: /Ops Governor/ })
      .click();

    const changePanel = page.locator(".assistant-agent-change-panel");
    await expect(changePanel.getByText("Suggest agent changes")).toBeVisible();
    await changePanel.getByRole("button", { name: "Narrow access" }).click();
    await changePanel.getByLabel("Requested authority").selectOption("DRAFT");
    await changePanel.getByRole("button", { name: "Admin Console" }).click();
    await changePanel.getByRole("button", { name: "Cancel trade" }).click();
    await changePanel
      .locator("label.field")
      .filter({ has: page.getByText("Change summary", { exact: true }) })
      .locator("textarea")
      .fill("Narrow Ops Governor to draft authority for trade review.");
    await changePanel
      .locator("label.field")
      .filter({ has: page.getByText("Business problem", { exact: true }) })
      .locator("textarea")
      .fill("The current smoke workflow needs reviewable guidance, not staged cancellation authority.");
    await changePanel
      .locator("label.field")
      .filter({ has: page.getByText("Proposed mission", { exact: true }) })
      .locator("textarea")
      .fill("Keep Ops Governor focused on explaining trade blockers before any action staging.");

    await changePanel.getByRole("button", { name: "Submit request" }).click();

    await expect(
      changePanel.getByText("Change request #9001 is queued for admin review."),
    ).toBeVisible();
    const submittedRequestCard = changePanel
      .locator(".assistant-agent-request-card")
      .filter({ hasText: "#9001 Ops Governor" });
    await expect(submittedRequestCard).toBeVisible();
    await expect(submittedRequestCard).toContainText("Narrow access");
    await expect(submittedRequestCard).toContainText("REQUESTED");

    await page.goto(`${harness.origin}/?view=admin`, {
      waitUntil: "domcontentloaded",
    });

    const profileRequestPanel = page.locator(".assistant-profile-request-panel");
    const reviewCard = profileRequestPanel
      .locator(".assistant-profile-request-card")
      .filter({ hasText: "#9001 Ops Governor" });
    await expect(reviewCard).toBeVisible();
    await expect(reviewCard).toContainText("Narrow access");
    await expect(reviewCard).toContainText("target Ops Governor");

    await reviewCard
      .getByPlaceholder("Owner, prompt, tools/actions, and eval cases reviewed.")
      .fill("Approved narrower authority for the smoke request.");
    await reviewCard.getByRole("button", { name: "Approve" }).click();

    await expect(reviewCard).toContainText("APPROVED");
    await expect(
      reviewCard.getByText("Approved narrower authority for the smoke request."),
    ).toBeVisible();
    await reviewCard.getByRole("button", { name: "Load Review Draft" }).click();
    await expect(
      page.getByText("Loaded request #9001 into the review draft for Ops Governor."),
    ).toBeVisible();
    await expect(reviewCard.getByRole("button", { name: "Mark Applied" })).toBeDisabled();
    const draftConstructionReview = page.locator(
      ".assistant-admin-draft-construction-review",
    );
    await expect(draftConstructionReview).toContainText(
      "Unsaved Draft Construction",
    );
    await expect(draftConstructionReview).toContainText("Authority ceiling");
    await expect(draftConstructionReview).toContainText("STAGE -> DRAFT");
    await expect(draftConstructionReview).toContainText("Allowed actions");
    await expect(draftConstructionReview).toContainText("cancel_trade -> None");
    await page.getByRole("button", { name: "Save Agent" }).click();
    await expect(page.getByText(/Ops Governor saved as version/)).toBeVisible();
    await expect(reviewCard).toContainText("Applied revision proof");
    await expect(reviewCard).toContainText("Saved configuration diff");
    await expect(reviewCard).toContainText("Authority ceiling:");
    await expect(reviewCard).toContainText("STAGE -> DRAFT");
    await expect(reviewCard).toContainText("Allowed action types:");
    await expect(reviewCard).toContainText("cancel_trade -> None");

    await reviewCard.getByRole("button", { name: "Mark Applied" }).click();

    await expect(reviewCard).toContainText("ACTIVATED");
    await expect(
      page.getByText(/Profile request #9001 is now marked as applied to ops-governor via revision #/),
    ).toBeVisible();

    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
    ).toHaveLength(0);
    expect(harness.mutationRequests).toEqual([
      {
        method: "POST",
        path: "/assistant/profile-requests",
        search: "",
      },
      {
        method: "POST",
        path: "/admin/assistant/profile-requests/9001/approve",
        search: "",
      },
      {
        method: "PUT",
        path: "/admin/assistant/agents/ops-governor",
        search: "",
      },
      {
        method: "POST",
        path: "/admin/assistant/profile-requests/9001/activate",
        search: "",
      },
    ]);
  } finally {
    await harness.close();
  }
});

test("signed-out dashboard renders only the auth gate", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedApiBaseOverride(page, harness);
    await page.goto(`${harness.origin}/?view=dashboard`, {
      waitUntil: "domcontentloaded",
    });

    const startHereOverlay = page.locator(".start-here-dialog");
    const authGate = page.locator(".auth-gate-stage");
    await expect(authGate).toBeVisible();
    await expect(startHereOverlay).toHaveCount(0);
    await expect(page.locator(".side-rail")).toHaveCount(0);
    await expect(page.locator(".mobile-topbar")).toHaveCount(0);
    await expect(page.getByLabel("Operator prompt")).toHaveCount(0);
    await expect(authGate.getByLabel("User ID or Email")).toBeVisible();
    await expect(
      authGate.getByRole("button", { name: "Log In" }),
    ).toBeVisible();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("signed-in start-here stays hidden after the user's first-login session", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedApiBaseOverride(page, harness);
    await page.goto(`${harness.origin}/?view=dashboard`, {
      waitUntil: "domcontentloaded",
    });

    const startHereOverlay = page.locator(".start-here-dialog");
    await expect(page.locator(".auth-gate-stage")).toBeVisible();
    await expect(startHereOverlay).toHaveCount(0);

    await page.evaluate(() => {
      window.localStorage.setItem(
        "ectrm.auth-session",
        JSON.stringify({
          sessionId: "smoke-session-1",
          accessToken: "smoke-access-token",
          expiresAt: "2099-01-01T00:00:00Z",
          showStartHere: true,
          user: {
            user_id: "ops_admin",
            email: "ops@example.com",
            display_name: "Ops Admin",
            role: "OPS_ADMIN",
          },
        }),
      );
    });

    await page.goto(`${harness.origin}/?view=dashboard`, {
      waitUntil: "domcontentloaded",
    });

    await expect(startHereOverlay).toBeVisible();
    await startHereOverlay
      .getByRole("button", { name: "Open Exposure" })
      .click();

    await expect(page).toHaveURL(/view=risk/);
    await expect(startHereOverlay).toBeHidden();

    await page.evaluate(() => {
      window.localStorage.setItem(
        "ectrm.auth-session",
        JSON.stringify({
          sessionId: "smoke-session-2",
          accessToken: "smoke-access-token",
          expiresAt: "2099-01-01T00:00:00Z",
          showStartHere: false,
          user: {
            user_id: "ops_admin",
            email: "ops@example.com",
            display_name: "Ops Admin",
            role: "OPS_ADMIN",
          },
        }),
      );
    });

    await page.goto(`${harness.origin}/?view=dashboard`, {
      waitUntil: "domcontentloaded",
    });

    await expect(startHereOverlay).toBeHidden();
    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("legacy guide route is no longer exposed", async ({ page }) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=guide`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    await expect(page).not.toHaveURL(/view=guide/);
    await expect(page.getByRole("link", { name: /How It Works/ })).toHaveCount(0);
    expect(harness.mutationRequests).toHaveLength(0);
    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(
        harness.unexpectedRequests,
      )}`,
    ).toHaveLength(0);
  } finally {
    await harness.close();
  }
});

test("prompt home fails closed for invalid workspace handoff payloads", async ({
  page,
}) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true });

  try {
    await seedApiBaseOverride(page, harness);
    await page.goto(harness.origin, {
      waitUntil: "domcontentloaded",
    });

    await signInFromPromptHome(page);

    await page.getByLabel("Operator prompt").fill("Give me a broken handoff.");
    await page.getByRole("button", { name: "Send Prompt" }).click();

    const assistantMessage = page
      .locator(".assistant-message-assistant")
      .last();
    await expect(assistantMessage).toBeVisible();
    await expect(assistantMessage).toContainText(
      "Stay on Home for now while we confirm the route.",
    );
    await expect(assistantMessage).toContainText(
      "A workspace handoff suggestion could not be applied and was ignored.",
    );
    await expect(assistantMessage).not.toContainText("```navigation_intent");
    await expect(assistantMessage.locator(".prompt-home-handoff")).toHaveCount(
      0,
    );

    await expect(page).not.toHaveURL(/view=operations/);
    await expect(page).not.toHaveURL(/view=trades/);

    await page.goto(`${harness.origin}/?view=admin`, {
      waitUntil: "domcontentloaded",
    });

    const outcomeSection = page.locator("#assistant-outcome-metrics");
    const failedOutcome = outcomeSection
      .locator(".assistant-feedback-insight")
      .filter({ hasText: "Failed handoff" })
      .filter({ hasText: "Invalid handoff payload" })
      .first();
    await expect(failedOutcome).toBeVisible();

    expect(harness.promptNavigationOutcomeRequests).toContainEqual({
      method: "POST",
      path: "/assistant/runs/8801/prompt-navigation-outcomes",
      search: "",
    });

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("prompt home stages a governed action with inline review context and syncs after approval", async ({
  page,
}) => {
  const harness = await startSmokeHarness({ singleUserAuthEnabled: true });

  try {
    await seedApiBaseOverride(page, harness);
    await page.goto(harness.origin, {
      waitUntil: "domcontentloaded",
    });

    await signInFromPromptHome(page);

    await page
      .getByLabel("Operator prompt")
      .fill(
        "Cancel the selected trade and explain that approval is still required.",
      );
    await page.getByRole("button", { name: "Send Prompt" }).click();

    const assistantMessage = page
      .locator(".assistant-message-assistant")
      .last();
    const actionCard = assistantMessage
      .locator(".assistant-action-card")
      .first();

    await expect(
      assistantMessage.getByText(
        "I staged a governed cancellation request for T-AMEND-100. Review the evidence below before anything changes. Approval is still required.",
      ),
    ).toBeVisible();
    await expect(actionCard).toContainText("Cancel trade T-AMEND-100");
    await expect(actionCard).toContainText("Requester: trader.alpha");
    await expect(actionCard).toContainText("Owning work object");
    await expect(actionCard).toContainText("Trade T-AMEND-100");
    await expect(actionCard).toContainText("Missing evidence");
    await expect(actionCard).toContainText(
      "Signed unwind confirmation has not been uploaded yet.",
    );
    await expect(actionCard).toContainText("Stale-state basis");
    await expect(actionCard).toContainText("Trade Status: ACTIVE");
    await expect(actionCard).toContainText("Dry-run preview");
    await expect(
      assistantMessage.getByRole("button", { name: "Open Assistant Console" }),
    ).toBeVisible();

    await actionCard.getByRole("button", { name: "Approve" }).click();

    await expect(actionCard).toContainText("Executed");
    await expect(actionCard).toContainText("Review: Approved as-is");
    await expect(actionCard).toContainText("trade_status: CANCELLED");
    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
    ).toHaveLength(0);
    expect(harness.mutationRequests).toEqual([
      {
        method: "POST",
        path: "/assistant/action-requests/7001/approve",
        search: "",
      },
    ]);
  } finally {
    await harness.close();
  }
});

test("signed-in smoke captures a trade and selects the created ticket", async ({
  page,
}) => {
  const harness = await startSmokeHarness();
  const createdTradeId = "TRD-10001";
  const nextSuggestedTradeId = "TRD-10002";

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=trades`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    const createForm = page.locator("form.trade-form.trade-form-feature");
    await expect(createForm).toBeVisible();
    await expect(
      createForm.getByRole("button", { name: "Create Trade" }),
    ).toBeEnabled();
    await expect(
      createForm.getByRole("heading", { name: createdTradeId }),
    ).toBeVisible();

    await selectExactSearchValue(
      createForm,
      "Search by book name or code",
      "WEST_POWER",
      "West Power Desk (WEST_POWER)",
    );
    await selectExactSearchValue(
      createForm,
      "Search by name or code",
      "CASCADE_UTIL",
      "Cascade Utility (CASCADE_UTIL)",
    );
    await selectExactSearchValue(
      createForm,
      "Search by location name or code",
      "WAHA_POOL",
      "Waha Pool (WAHA_POOL)",
    );
    await selectExactSearchValue(
      createForm,
      "Search by commodity name or code",
      "WAHA_GAS",
      "Waha Gas (WAHA_GAS)",
    );
    await createForm
      .locator("label.field")
      .filter({ hasText: "Quantity Unit" })
      .locator("select")
      .selectOption("MMBTU");
    await createForm
      .locator("label.field")
      .filter({ hasText: "Trade Currency" })
      .locator("select")
      .selectOption("USD");
    await createForm
      .locator("label.field")
      .filter({ hasText: "Price Unit" })
      .locator("select")
      .selectOption("USD/MMBTU");
    await createForm
      .locator("label.field")
      .filter({ hasText: /^Price Differential/ })
      .locator("input")
      .fill("4.25");
    await createForm
      .locator("label.field")
      .filter({ hasText: /^Volume$/ })
      .locator("input")
      .fill("12500");

    await createForm.getByRole("button", { name: "Create Trade" }).click();

    await expect(page).toHaveURL(
      new RegExp(`view=trades(?:&|$).*trade=${createdTradeId}`),
    );
    await expect(
      page.getByRole("button", {
        name: new RegExp(`Trade: ${createdTradeId} WAHA_GAS`),
      }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page
        .locator(".operational-inspector-summary-copy")
        .getByText("WAHA_GAS", { exact: true }),
    ).toBeVisible();
    await expect(
      createForm.getByRole("heading", { name: nextSuggestedTradeId }),
    ).toBeVisible();

    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
    ).toHaveLength(0);
    expect(harness.mutationRequests).toEqual([
      {
        method: "POST",
        path: "/events",
        search: "",
      },
    ]);
  } finally {
    await harness.close();
  }
});

test("admin smoke rejects a pending assistant approval from the governance inbox", async ({
  page,
}) => {
  const harness = await startSmokeHarness();
  const requestSummary = "Cancel trade T-AMEND-100";

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=admin`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    const approvalsSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Pending Approvals" }) })
      .first();
    const approvalActionCard = approvalsSection
      .locator(".assistant-action-card")
      .first();
    const approvalSummary = approvalActionCard
      .locator("strong")
      .filter({ hasText: requestSummary });

    await expect(approvalsSection).toBeVisible();
    await expect(
      approvalsSection.getByText(
        "1 pending assistant action request require review.",
      ),
    ).toBeVisible();
    await expect(approvalSummary).toBeVisible();
    await expect(
      approvalsSection.getByText("Requester: trader.alpha"),
    ).toBeVisible();
    await expect(
      approvalsSection.getByText("Type: cancel_trade"),
    ).toBeVisible();
    await expect(approvalsSection.getByText("Run #701")).toBeVisible();

    await approvalActionCard
      .getByRole("button", { name: "Open trace" })
      .click();
    await expect(
      approvalsSection.getByText("Audit trace for run #701", { exact: true }),
    ).toBeVisible();
    await expect(approvalsSection.getByText("Run started")).toBeVisible();
    await expect(
      approvalsSection.getByText("Tool call: get_trade_by_id"),
    ).toBeVisible();
    await approvalsSection.getByRole("button", { name: "Close trace" }).click();

    await approvalsSection.getByRole("button", { name: "Reject" }).click();

    await expect(
      approvalsSection.getByText(`${requestSummary} has been rejected.`),
    ).toBeVisible();
    await expect(
      approvalsSection.getByText(
        "No assistant action requests are currently waiting for approval.",
      ),
    ).toBeVisible();
    await expect(approvalSummary).toHaveCount(0);
    await expect(
      approvalsSection.getByText("Requester: trader.alpha"),
    ).toHaveCount(0);

    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
    ).toHaveLength(0);
    expect(harness.mutationRequests).toEqual([
      {
        method: "POST",
        path: "/assistant/action-requests/7001/reject",
        search: "",
      },
    ]);
  } finally {
    await harness.close();
  }
});

test("admin smoke approves and executes a pending assistant approval from the governance inbox", async ({
  page,
}) => {
  const harness = await startSmokeHarness();
  const requestSummary = "Cancel trade T-AMEND-100";

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=admin`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    const approvalsSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Pending Approvals" }) })
      .first();
    const approvalActionCard = approvalsSection
      .locator(".assistant-action-card")
      .first();
    const approvalSummary = approvalActionCard
      .locator("strong")
      .filter({ hasText: requestSummary });

    await expect(approvalsSection).toBeVisible();
    await expect(
      approvalsSection.getByText(
        "1 pending assistant action request require review.",
      ),
    ).toBeVisible();
    await expect(approvalSummary).toBeVisible();
    await expect(
      approvalActionCard.getByText("Requester: trader.alpha"),
    ).toBeVisible();
    await expect(
      approvalActionCard.getByText("Type: cancel_trade"),
    ).toBeVisible();
    await expect(approvalActionCard.getByText("Run #701")).toBeVisible();

    await approvalsSection.getByRole("button", { name: "Approve" }).click();

    await expect(
      approvalsSection.getByText(`${requestSummary} has been executed.`),
    ).toBeVisible();
    await expect(
      approvalsSection.getByText(
        "No assistant action requests are currently waiting for approval.",
      ),
    ).toBeVisible();
    await expect(approvalSummary).toHaveCount(0);
    await expect(
      approvalsSection.getByText("Requester: trader.alpha"),
    ).toHaveCount(0);

    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
    ).toHaveLength(0);
    expect(harness.mutationRequests).toEqual([
      {
        method: "POST",
        path: "/assistant/action-requests/7001/approve",
        search: "",
      },
    ]);
  } finally {
    await harness.close();
  }
});
