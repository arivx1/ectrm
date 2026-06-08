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
  await expect(profileAvatarButton(page)).toBeVisible();
}

async function signOutFromPromptHome(page: Page): Promise<void> {
  await profileAvatarButton(page).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.locator(".auth-gate-stage")).toBeVisible();
  await expect(page.getByLabel("Operator prompt")).toHaveCount(0);
}

function profileAvatarButton(page: Page): Locator {
  return page.getByRole("button", {
    name: "Open profile menu for Ops Admin",
  });
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

async function expectLocatorStableX(
  locator: Locator,
  expectedX: number,
  threshold = 1,
): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  expect(Math.abs(Math.round(box.x) - expectedX)).toBeLessThanOrEqual(threshold);
}

async function expectLocatorsSameHeight(
  locators: Locator[],
  threshold = 1,
): Promise<void> {
  const boxes = await Promise.all(locators.map((locator) => locator.boundingBox()));
  for (const box of boxes) {
    expect(box).not.toBeNull();
  }

  const heights = boxes
    .filter((box): box is NonNullable<typeof box> => box !== null)
    .map((box) => Math.round(box.height));
  const expectedHeight = heights[0];
  expect(expectedHeight).toBeDefined();
  if (typeof expectedHeight !== "number") {
    return;
  }

  for (const height of heights) {
    expect(Math.abs(height - expectedHeight)).toBeLessThanOrEqual(threshold);
  }
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

test("home smoke boots against the seeded browser harness", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=dashboard`, {
      waitUntil: "domcontentloaded",
    });

    const persistentTopbar = page.locator(".workspace-topbar-persistent");
    await expect(page.locator(".start-here-dialog")).toHaveCount(0);
    await expect(persistentTopbar).toBeVisible();
    await expect(persistentTopbar.getByText("Apps", { exact: true })).toBeVisible();
    await expect(persistentTopbar.getByText("Tokens Today")).toBeVisible();
    await expect(persistentTopbar.getByText("4,200", { exact: true })).toBeVisible();
    await expect(persistentTopbar.getByText("DB Client")).toBeVisible();
    await expect(persistentTopbar.getByText("DB Server")).toBeVisible();
    await expect(persistentTopbar.getByText("1 KB", { exact: true })).toBeVisible();
    await expect(persistentTopbar.getByText("0 B", { exact: true })).toBeVisible();
    await expect(persistentTopbar.getByText("Data Out")).toBeVisible();
    await expect(persistentTopbar.getByText("Data In")).toBeVisible();
    await expect(persistentTopbar.locator(".workspace-topbar-data-metric-data-out strong")).toContainText("/s");
    await expect(persistentTopbar.locator(".workspace-topbar-data-metric-data-in strong")).toContainText("/s");
    await expect(profileAvatarButton(page)).toBeVisible();
    const persistentTopbarSearchTrigger = persistentTopbar.locator(
      ".terminal-command-trigger",
    );
    const persistentBackButton = persistentTopbar.locator(".app-back-button-desktop");
    await expectLocatorsSameHeight([
      persistentBackButton,
      persistentTopbarSearchTrigger,
      persistentTopbar.locator(".terminal-shortcut-trigger"),
      persistentTopbar.locator(".workspace-topbar-token"),
      persistentTopbar.locator(".workspace-topbar-db-size"),
      persistentTopbar.locator(".hero-session-pill"),
      persistentTopbar.locator(".profile-avatar-trigger"),
    ]);
    await expectLocatorsOnSameLine(
      persistentTopbarSearchTrigger,
      persistentTopbar.locator(".hero-session-pill"),
    );
    await expectLocatorsOnSameLine(
      persistentTopbar.locator(".workspace-topbar-token"),
      persistentTopbar.locator(".workspace-topbar-db-size"),
    );
    await expectLocatorsOnSameLine(
      persistentTopbar.locator(".workspace-topbar-db-size"),
      persistentTopbar.locator(".profile-avatar-trigger"),
    );
    const stableTopbarSearchX = Math.round(
      (await persistentTopbarSearchTrigger.boundingBox())?.x ?? 0,
    );
    await expect(page.getByText("Home apps")).toHaveCount(0);
    await expect(page.locator(".prompt-home-preset-switcher select")).toContainText(
      "Waste & Recyclables",
    );
    await expect(page.getByText("Saved Views")).toBeVisible();
    await expect(page.getByRole("button", { name: /Manage Apps/ })).toBeVisible();
    await expect(page.getByText("Desk Assistant")).toBeVisible();
    await expect(page.getByText("Live Desk")).toHaveCount(0);
    const strataProduct = page.getByRole("radio", { name: "Strata" });
    const nexusProduct = page.getByRole("radio", { name: "Nexus" });
    await expect(strataProduct).toHaveAttribute("aria-checked", "true");
    await expect(nexusProduct).toHaveAttribute("aria-checked", "false");
    await nexusProduct.click();
    await expect(nexusProduct).toHaveAttribute("aria-checked", "true");
    await expect(strataProduct).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("navigation", { name: "Nexus" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Relationship CRM" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tools", exact: true })).toBeVisible();
    await expect(persistentTopbar.getByText("CRM", { exact: true })).toBeVisible();
    await expect(persistentBackButton).toBeEnabled();
    await expect(persistentBackButton).toHaveAttribute("aria-label", "Go back to Strata");
    await expectLocatorStableX(persistentTopbarSearchTrigger, stableTopbarSearchX);
    await expect(page.locator(".nexus-crm-workspace").getByRole("heading", { name: "CRM" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Clients" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Opportunities" })).toHaveAttribute("aria-selected", "false");
    await expect(page.getByRole("tab", { name: "Disqualified" })).toHaveAttribute("aria-selected", "false");
    await expect(page.getByRole("tab", { name: "Lost" })).toHaveAttribute("aria-selected", "false");
    await expect(page.getByRole("tab", { name: "On Hold" })).toHaveAttribute("aria-selected", "false");
    await expect(page.getByRole("tab", { name: "TAM" })).toHaveAttribute("aria-selected", "false");
    await expect(page.getByRole("tab", { name: "Companies" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Contacts" })).toHaveAttribute("aria-selected", "false");
    const nexusCrmSheet = page.locator(".nexus-crm-workspace .data-sheet-table");
    const nexusCrmDataRows = nexusCrmSheet.locator("tbody tr:not(.nexus-client-entry-row)");
    const nexusClientEntryRow = page.locator(".nexus-crm-workspace .nexus-client-entry-row");
    await expect(
      nexusCrmDataRows.first().getByRole("button", { name: "Client: Abercore" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sync Attio" }).click();
    await expect(
      page.getByText("Attio sync prepared 2 proposed CRM changes for review.", {
        exact: true,
      }),
    ).toBeVisible();
    const attioSyncReview = page.getByRole("dialog", { name: "Proposed CRM Changes" });
    await expect(attioSyncReview).toBeVisible();
    await expect(attioSyncReview.getByText("Hartree Partners", { exact: true })).toBeVisible();
    await expect(attioSyncReview.getByText("Ionex Minerals", { exact: true })).toBeVisible();
    const ionexSyncReviewRow = attioSyncReview.locator("li").filter({ hasText: "Ionex Minerals" });
    await expect(ionexSyncReviewRow).toContainText("Disqualification reason Outside ICP");
    await expect(attioSyncReview.getByText("Client", { exact: true })).toBeVisible();
    await expect(attioSyncReview.getByRole("button", { name: "Reject All" })).toBeInViewport();
    await expect(attioSyncReview.getByRole("button", { name: "Accept All Changes" })).toBeInViewport();
    const hartreeBackgroundEnrichment = page.waitForResponse((response) => {
      const request = response.request();
      return (
        request.method() === "POST" &&
        response.url().includes("/integrations/attio/client-enrichment") &&
        (request.postData() ?? "").includes("Hartree Partners")
      );
    });
    await attioSyncReview.getByRole("button", { name: "Accept All Changes" }).click();
    await expect(page.getByText("Accepted Attio sync: 0 existing updates and 2 new companies.", { exact: true })).toBeVisible();
    await hartreeBackgroundEnrichment;
    await expect(attioSyncReview).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Clients" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Companies" })).toHaveAttribute("aria-selected", "true");
    await expect(nexusCrmSheet.getByRole("button", { name: "Type Sort" })).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: "Closed ARR Sort" })).toBeVisible();
    await expect(nexusCrmSheet.getByRole("button", { name: "Open ARR Sort" })).toBeVisible();
    await expect(nexusCrmSheet.getByRole("button", { name: "Closed Deals Sort" })).toBeVisible();
    await expect(nexusCrmSheet.getByRole("button", { name: "Open Deals Sort" })).toBeVisible();
    await expect(nexusCrmSheet.getByRole("button", { name: "Disqualified Deals Sort" })).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: "Lost Deals Sort" })).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: "On Hold Deals Sort" })).toHaveCount(0);
    const nexusClientColumnHeader = nexusCrmSheet.locator("thead tr").first().locator("th").nth(1);
    const clientResizeHandle = nexusCrmSheet.getByRole("separator", { name: "Resize Client column" });
    await expect(clientResizeHandle).toBeVisible();
    const clientColumnBeforeResize = await nexusClientColumnHeader.boundingBox();
    const clientResizeHandleBox = await clientResizeHandle.boundingBox();
    if (!clientColumnBeforeResize || !clientResizeHandleBox) {
      throw new Error("Nexus CRM client column resize geometry was not available");
    }
    await page.mouse.move(
      clientResizeHandleBox.x + clientResizeHandleBox.width / 2,
      clientResizeHandleBox.y + clientResizeHandleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      clientResizeHandleBox.x + clientResizeHandleBox.width / 2 + 90,
      clientResizeHandleBox.y + clientResizeHandleBox.height / 2,
    );
    await page.mouse.up();
    const clientColumnAfterResize = await nexusClientColumnHeader.boundingBox();
    expect(clientColumnAfterResize?.width ?? 0).toBeGreaterThan(clientColumnBeforeResize.width + 40);
    await nexusCrmSheet.getByLabel("Filter Client").fill("Hartree Partners");
    await expect(nexusCrmDataRows).toHaveCount(1);
    const hartreeSyncedClientRow = nexusCrmDataRows.first();
    await expect(hartreeSyncedClientRow.getByRole("button", { name: "Client: Hartree Partners" })).toBeVisible();
    await expect(hartreeSyncedClientRow.getByLabel("Closed ARR: Hartree Partners")).toHaveValue("$240,000");
    await expect(hartreeSyncedClientRow.getByLabel("Open ARR: Hartree Partners")).toHaveValue("");
    await expect(hartreeSyncedClientRow.getByLabel("Closed Deals: Hartree Partners")).toHaveValue("2");
    await expect(hartreeSyncedClientRow.getByLabel("Open Deals: Hartree Partners")).toHaveValue("");
    await page.locator(".nexus-crm-workspace").getByRole("button", { name: "Reset Table" }).click();
    await page.getByRole("tab", { name: "Opportunities" }).click();
    await expect(page.getByRole("tab", { name: "Opportunities" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Companies" })).toHaveAttribute("aria-selected", "true");
    await expect(nexusCrmSheet.getByRole("button", { name: "Type Sort" })).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: "Owner Sort" })).toBeVisible();
    await expect(nexusCrmSheet.getByRole("button", { name: "Deal Status Sort" })).toBeVisible();
    await expect(nexusCrmSheet.getByRole("button", { name: "Disqualified Deals Sort" })).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: "Lost Deals Sort" })).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: "On Hold Deals Sort" })).toHaveCount(0);
    await expect(nexusClientEntryRow.getByLabel("New type")).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: /^Client:/ })).toHaveCount(0);
    await nexusClientEntryRow.getByLabel("New client").fill("Blue Ridge Trading");
    await nexusClientEntryRow.getByLabel("New owner").fill("Morgan");
    await nexusClientEntryRow.getByLabel("New deal status").fill("Evaluation (SQO)");
    await nexusClientEntryRow.getByLabel("New next action").fill("Send onboarding packet");
    await nexusClientEntryRow.getByRole("button", { name: "Add" }).click();
    await expect(
      nexusCrmDataRows.last().getByRole("button", { name: "Client: Blue Ridge Trading" }),
    ).toBeVisible();
    await nexusCrmSheet.getByLabel("Filter Client").fill("Blue Ridge Trading");
    await expect(nexusCrmDataRows).toHaveCount(1);
    const blueRidgeCrmRow = nexusCrmDataRows.filter({ hasText: "Blue Ridge Trading" });
    await expect(blueRidgeCrmRow.getByRole("button", { name: "Client: Blue Ridge Trading" })).toBeVisible();
    await expect(blueRidgeCrmRow.getByLabel("Owner: Blue Ridge Trading")).toHaveValue("Morgan");
    await expect(blueRidgeCrmRow.getByLabel("Deal Status: Blue Ridge Trading")).toHaveValue("Evaluation (SQO)");
    await expect(blueRidgeCrmRow.getByText("Send onboarding packet", { exact: true })).toBeVisible();
    await page.locator(".nexus-crm-workspace").getByRole("button", { name: "Reset Table" }).click();
    await page.getByRole("tab", { name: "Disqualified" }).click();
    await expect(page.getByRole("tab", { name: "Disqualified" })).toHaveAttribute("aria-selected", "true");
    await expect(nexusCrmSheet.getByRole("button", { name: "Type Sort" })).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: "Owner Sort" })).toBeVisible();
    await expect(nexusCrmSheet.getByRole("button", { name: "Disqualified Deals Sort" })).toBeVisible();
    await expect(nexusCrmSheet.getByRole("button", { name: "Lost Deals Sort" })).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: "On Hold Deals Sort" })).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: "Disqualification Reason Sort" })).toBeVisible();
    await expect(nexusCrmSheet.getByRole("button", { name: "Lost Reason Sort" })).toHaveCount(0);
    await expect(nexusClientEntryRow.getByLabel("New deal status")).toHaveValue("Disqualified");
    await expect(nexusCrmDataRows).toHaveCount(1);
    const ionexCrmRow = nexusCrmDataRows.filter({ hasText: "Ionex Minerals" });
    await expect(ionexCrmRow.getByRole("button", { name: "Client: Ionex Minerals" })).toBeVisible();
    await expect(ionexCrmRow.getByLabel("Disqualification Reason: Ionex Minerals")).toHaveValue("Outside ICP");
    await nexusClientEntryRow.getByLabel("New client").fill("Cinder Materials");
    await nexusClientEntryRow.getByLabel("New owner").fill("Avery");
    await nexusClientEntryRow.getByLabel("New disqualification reason").fill("Outside ICP");
    await nexusClientEntryRow.getByRole("button", { name: "Add" }).click();
    await expect(nexusCrmDataRows).toHaveCount(2);
    await expect(nexusCrmSheet.getByRole("button", { name: "Client: Cinder Materials" })).toBeVisible();
    const cinderCrmRow = nexusCrmDataRows.filter({ hasText: "Cinder Materials" });
    await expect(cinderCrmRow.getByLabel("Deal Status: Cinder Materials")).toHaveValue("Disqualified");
    await expect(cinderCrmRow.getByLabel("Disqualified Deals: Cinder Materials")).toHaveValue("1");
    await expect(cinderCrmRow.getByLabel("Disqualification Reason: Cinder Materials")).toHaveValue(
      "Outside ICP",
    );
    await page.getByRole("tab", { name: "Lost" }).click();
    await expect(page.getByRole("tab", { name: "Lost" })).toHaveAttribute("aria-selected", "true");
    await expect(nexusCrmSheet.getByRole("button", { name: "Disqualified Deals Sort" })).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: "Lost Deals Sort" })).toBeVisible();
    await expect(nexusCrmSheet.getByRole("button", { name: "On Hold Deals Sort" })).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: "Disqualification Reason Sort" })).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: "Lost Reason Sort" })).toBeVisible();
    await expect(nexusClientEntryRow.getByLabel("New deal status")).toHaveValue("Lost");
    await expect(nexusCrmSheet.getByRole("button", { name: /^Client:/ })).toHaveCount(0);
    await nexusClientEntryRow.getByLabel("New client").fill("Delta Alloy");
    await nexusClientEntryRow.getByLabel("New owner").fill("Jordan");
    await nexusClientEntryRow.getByLabel("New lost reason").fill("No budget");
    await nexusClientEntryRow.getByRole("button", { name: "Add" }).click();
    await nexusCrmSheet.getByLabel("Filter Client").fill("Delta Alloy");
    await expect(nexusCrmDataRows).toHaveCount(1);
    await expect(nexusCrmSheet.getByRole("button", { name: "Client: Delta Alloy" })).toBeVisible();
    await expect(nexusCrmDataRows.first().getByLabel("Deal Status: Delta Alloy")).toHaveValue("Lost");
    await expect(nexusCrmDataRows.first().getByLabel("Lost Deals: Delta Alloy")).toHaveValue("1");
    await expect(nexusCrmDataRows.first().getByLabel("Lost Reason: Delta Alloy")).toHaveValue("No budget");
    await page.locator(".nexus-crm-workspace").getByRole("button", { name: "Reset Table" }).click();
    await page.getByRole("tab", { name: "On Hold" }).click();
    await expect(page.getByRole("tab", { name: "On Hold" })).toHaveAttribute("aria-selected", "true");
    await expect(nexusCrmSheet.getByRole("button", { name: "Disqualified Deals Sort" })).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: "Lost Deals Sort" })).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: "On Hold Deals Sort" })).toBeVisible();
    await expect(nexusCrmSheet.getByRole("button", { name: "Disqualification Reason Sort" })).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: "Lost Reason Sort" })).toHaveCount(0);
    await expect(nexusClientEntryRow.getByLabel("New deal status")).toHaveValue("On Hold");
    await nexusClientEntryRow.getByLabel("New client").fill("Fallow Trading");
    await nexusClientEntryRow.getByLabel("New owner").fill("Taylor");
    await nexusClientEntryRow.getByRole("button", { name: "Add" }).click();
    await expect(nexusCrmDataRows).toHaveCount(1);
    await expect(nexusCrmSheet.getByRole("button", { name: "Client: Fallow Trading" })).toBeVisible();
    await expect(nexusCrmDataRows.first().getByLabel("Deal Status: Fallow Trading")).toHaveValue("On Hold");
    await expect(nexusCrmDataRows.first().getByLabel("On Hold Deals: Fallow Trading")).toHaveValue("1");
    await page.getByRole("tab", { name: "Clients" }).click();
    await expect(page.getByRole("tab", { name: "Clients" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "TAM" }).click();
    await expect(page.getByRole("tab", { name: "TAM" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "Import CSV/XLS" })).toBeVisible();
    await expect(nexusCrmSheet.getByRole("button", { name: "Type Sort" })).toHaveCount(0);
    await expect(nexusCrmSheet.getByRole("button", { name: "Contact Count Sort" })).toBeVisible();
    await expect(nexusClientEntryRow.getByLabel("New type")).toHaveCount(0);
    const tamImportCsv = [
      "Company,Next Action",
      "Hartree Partners,Skip existing client",
      ...Array.from({ length: 54 }, (_value, index) => {
        const rowNumber = String(index + 1).padStart(2, "0");
        return `Paged TAM Company ${rowNumber},Qualify fit ${rowNumber}`;
      }),
      "Acme Smelter,Qualify fit",
    ].join("\n");
    await page.locator('input[aria-label="Import TAM companies"]').setInputFiles({
      name: "tam-import.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(tamImportCsv),
    });
    await expect(
      page.getByText("Imported 55 TAM companies from tam-import.csv. Skipped 1 row.", { exact: true }),
    ).toBeVisible();
    const nexusCrmStatus = page.locator(".nexus-crm-workspace .data-sheet-status");
    await expect(nexusCrmStatus).toContainText("Showing 1-50 of 55 rows");
    await expect(nexusCrmStatus).toContainText("Page 1 of 2");
    await expect(nexusCrmDataRows).toHaveCount(50);
    await nexusCrmStatus.getByRole("button", { name: "Next" }).click();
    await expect(nexusCrmStatus).toContainText("Showing 51-55 of 55 rows");
    await expect(nexusCrmDataRows).toHaveCount(5);
    await nexusCrmSheet.getByLabel("Filter Client").fill("Acme Smelter");
    await expect(nexusCrmDataRows).toHaveCount(1);
    const importedTamRow = nexusCrmDataRows.filter({ hasText: "Acme Smelter" });
    await expect(importedTamRow.getByRole("button", { name: "Client: Acme Smelter" })).toBeVisible();
    await expect(importedTamRow.getByText("Qualify fit", { exact: true })).toBeVisible();
    await page.locator(".nexus-crm-workspace").getByRole("button", { name: "Reset Table" }).click();
    await page.getByRole("tab", { name: "Clients" }).click();
    await expect(page.getByRole("tab", { name: "Clients" })).toHaveAttribute("aria-selected", "true");
    await nexusCrmSheet.getByRole("button", { name: "Client Sort" }).click();
    await expect(
      nexusCrmDataRows.first().getByRole("button", { name: "Client: Abercore" }),
    ).toBeVisible();
    await nexusCrmSheet.getByRole("button", { name: "Client Asc" }).click();
    await expect(
      nexusCrmDataRows.first().getByRole("button", { name: "Client: Westfeldt Brothers" }),
    ).toBeVisible();
    await nexusCrmSheet.getByLabel("Filter Client").fill("Hartree Partners");
    await expect(nexusCrmDataRows).toHaveCount(1);
    await expect(nexusCrmSheet.getByRole("button", { name: "Client: Hartree Partners" })).toBeVisible();
    await nexusCrmSheet.getByRole("button", { name: "Client: Hartree Partners" }).click();
    const nexusClientWorkspace = page.locator(".nexus-client-workspace");
    await expect(persistentTopbar.getByText("Hartree Partners", { exact: true })).toBeVisible();
    await expect(persistentBackButton).toBeEnabled();
    await expect(persistentBackButton).toHaveAttribute("aria-label", "Go back to CRM");
    await expectLocatorStableX(persistentTopbarSearchTrigger, stableTopbarSearchX);
    await expect(nexusClientWorkspace.getByRole("heading", { name: "Hartree Partners" })).toBeVisible();
    const nexusAttioSection = nexusClientWorkspace.locator(".nexus-attio-section");
    const nexusContactSection = nexusClientWorkspace.locator(".nexus-client-contacts");
    const nexusGrainSection = nexusClientWorkspace.locator(".nexus-grain-section");
    const nexusLinearSection = nexusClientWorkspace.locator(".nexus-linear-section");
    await expect(nexusAttioSection.getByText("Hartree Partners", { exact: true })).toBeVisible();
    await expect(nexusAttioSection.getByText("hartreepartners.com", { exact: true })).toBeVisible();
    await expect(nexusAttioSection.getByText("Alex Hartree", { exact: true })).toBeVisible();
    await expect(nexusAttioSection.getByText("Hartree Partners (Expansion)", { exact: true })).toBeVisible();
    await expect(nexusClientWorkspace.getByRole("link", { name: "Hartree client playbook" })).toHaveAttribute(
      "href",
      "https://www.notion.so/hartree-client-playbook",
    );
    await expect(
      nexusClientWorkspace.getByText("96% confidence - page title starts with client name - Last edited Jun 6, 2026", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(nexusGrainSection.getByRole("link", { name: "Hartree weekly call" })).toHaveAttribute(
      "href",
      "https://grain.com/share/recording/grain-hartree-weekly",
    );
    await expect(nexusGrainSection.getByText("Jun 6, 2026 - 30m - 2 participants - zoom", { exact: true })).toBeVisible();
    await expect(nexusLinearSection.getByRole("link", { name: "NEX-42 - Hartree risk workflow follow-up" })).toHaveAttribute(
      "href",
      "https://linear.app/nexus/issue/NEX-42/hartree-risk-workflow-follow-up",
    );
    await expect(
      nexusLinearSection.getByText("In Progress (started) - NEX - Assigned to Morgan Ops - Priority High - Client Integrations", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(nexusLinearSection.getByText("Labels client, hartree", { exact: true })).toBeVisible();
    await nexusClientWorkspace.getByLabel("Notion link title").fill("Hartree risk notes");
    await nexusClientWorkspace.getByLabel("Notion page URL").fill("notion.so/hartree-risk-notes");
    await nexusClientWorkspace.getByRole("button", { name: "Add Notion Link" }).click();
    await expect(nexusClientWorkspace.getByRole("link", { name: "Hartree risk notes" })).toHaveAttribute(
      "href",
      "https://notion.so/hartree-risk-notes",
    );
    await nexusClientWorkspace.getByLabel("Grain link title").fill("Hartree kickoff replay");
    await nexusClientWorkspace.getByLabel("Grain recording URL").fill("grain.com/share/recording/hartree-kickoff");
    await nexusClientWorkspace.getByRole("button", { name: "Add Grain Link" }).click();
    await expect(nexusGrainSection.getByRole("link", { name: "Hartree kickoff replay" })).toHaveAttribute(
      "href",
      "https://grain.com/share/recording/hartree-kickoff",
    );
    await expect(nexusContactSection.getByText("1 contact", { exact: true })).toBeVisible();
    await expect(nexusContactSection.getByText("Alex Hartree", { exact: true })).toBeVisible();
    await expect(nexusContactSection.getByText("Commercial lead - alex.hartree@example.com", { exact: true })).toBeVisible();
    await nexusClientWorkspace.getByRole("button", { name: "Add Contact" }).click();
    const addContactDialog = page.getByRole("dialog", { name: "Add Contact" });
    await expect(addContactDialog).toBeVisible();
    await expect(addContactDialog.getByText("Hartree Partners", { exact: true })).toBeVisible();
    await addContactDialog.getByLabel("First Name").fill("Jane");
    await addContactDialog.getByLabel("Last Name").fill("Hartree");
    await addContactDialog.getByLabel("Role", { exact: true }).fill("Head of Origination");
    await addContactDialog.getByLabel("Time at Role").fill("3 years");
    await addContactDialog.getByLabel("Previous Role").fill("Commodity research lead");
    await addContactDialog.getByLabel("University", { exact: true }).fill("Tulane University");
    await addContactDialog.getByLabel("University 2").fill("University of Chicago");
    await addContactDialog.getByLabel("Location").fill("New Orleans, LA");
    await addContactDialog.getByRole("button", { name: "Save Contact" }).click();
    await expect(addContactDialog).toHaveCount(0);
    await expect(nexusContactSection.getByText("2 contacts", { exact: true })).toBeVisible();
    await expect(nexusContactSection.getByText("Jane Hartree", { exact: true })).toBeVisible();
    await expect(
      nexusContactSection.getByText(
        "Head of Origination - 3 years - Previous Commodity research lead - Tulane University - University of Chicago - New Orleans, LA",
        { exact: true },
      ),
    ).toBeVisible();
    await nexusClientWorkspace.getByLabel("Add to-do").fill("Call Hartree about June positions");
    await nexusClientWorkspace.getByRole("button", { name: "Add To-Do" }).click();
    await expect(
      nexusClientWorkspace.getByText("Call Hartree about June positions", { exact: true }),
    ).toBeVisible();
    await persistentBackButton.click();
    await expect(persistentTopbar.getByText("CRM", { exact: true })).toBeVisible();
    const hartreeCrmRow = page.locator(".nexus-crm-workspace .data-sheet-table tbody tr").filter({ hasText: "Hartree" });
    await expect(hartreeCrmRow.getByRole("button", { name: "Client: Hartree Partners" })).toBeVisible();
    await expect(hartreeCrmRow.getByText("2 contacts", { exact: true })).toBeVisible();
    await expect(hartreeCrmRow.getByText("1 open", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Contacts" }).click();
    await expect(page.getByRole("tab", { name: "Contacts" })).toHaveAttribute("aria-selected", "true");
    const nexusContactSheet = page.locator(".nexus-contact-base .data-sheet-table");
    const nexusContactRows = nexusContactSheet.locator("tbody tr");
    await expect(nexusContactSheet.getByRole("separator", { name: "Resize Company column" })).toBeVisible();
    await expect(nexusContactSheet.getByRole("button", { name: "Role Sort", exact: true })).toBeVisible();
    await expect(nexusContactSheet.getByRole("button", { name: "Location Sort" })).toBeVisible();
    await expect(nexusContactSheet.getByRole("button", { name: "Contact: Alex Hartree" })).toBeVisible();
    await expect(nexusContactSheet.getByRole("button", { name: "Contact: Jane Hartree" })).toBeVisible();
    await nexusContactSheet.getByLabel("Filter Company").fill("Hartree");
    await expect(nexusContactRows).toHaveCount(2);
    const janeContactRow = nexusContactRows.filter({ hasText: "Jane Hartree" });
    await expect(janeContactRow.getByText("Head of Origination", { exact: true })).toBeVisible();
    await expect(janeContactRow.getByText("3 years", { exact: true })).toBeVisible();
    await expect(janeContactRow.getByText("Commodity research lead", { exact: true })).toBeVisible();
    await expect(janeContactRow.getByText("Tulane University", { exact: true })).toBeVisible();
    await expect(janeContactRow.getByText("University of Chicago", { exact: true })).toBeVisible();
    await expect(janeContactRow.getByText("New Orleans, LA", { exact: true })).toBeVisible();
    await page.locator(".nexus-crm-workspace").getByRole("button", { name: "Reset Table" }).click();
    await page.getByRole("button", { name: "Work To-Do", exact: true }).click();
    const nexusTodoWorkspace = page.locator(".nexus-todo-workspace");
    await expect(persistentTopbar.getByText("To-Do", { exact: true })).toBeVisible();
    await expect(persistentBackButton).toBeEnabled();
    await expect(persistentBackButton).toHaveAttribute("aria-label", "Go back to CRM");
    await expectLocatorStableX(persistentTopbarSearchTrigger, stableTopbarSearchX);
    await expect(nexusTodoWorkspace.getByRole("heading", { name: "To-Do" })).toBeVisible();
    await expect(
      nexusTodoWorkspace.getByText("Call Hartree about June positions", { exact: true }),
    ).toBeVisible();
    await expect(
      nexusTodoWorkspace
        .locator(".nexus-todo-list-global li")
        .filter({ hasText: "Call Hartree about June positions" })
        .getByText("Hartree Partners", { exact: true }),
    ).toBeVisible();
    await nexusTodoWorkspace.getByLabel("New to-do").fill("Review freight docs");
    await nexusTodoWorkspace.getByRole("button", { name: "Add To-Do" }).click();
    await expect(nexusTodoWorkspace.getByText("Review freight docs", { exact: true })).toBeVisible();
    await persistentBackButton.click();
    await expect(persistentTopbar.getByText("CRM", { exact: true })).toBeVisible();
    await expect(persistentBackButton).toHaveAttribute("aria-label", "Go back to Strata");
    await page.getByRole("button", { name: "Tools", exact: true }).click();
    const nexusToolsWorkspace = page.locator(".nexus-tools-workspace");
    await expect(persistentTopbar.getByText("Tools", { exact: true })).toBeVisible();
    await expect(persistentBackButton).toBeEnabled();
    await expect(persistentBackButton).toHaveAttribute("aria-label", "Go back to CRM");
    await expect(nexusToolsWorkspace.getByRole("heading", { name: "Tools", exact: true })).toBeVisible();
    const nexusToolsSheet = nexusToolsWorkspace.locator(".data-sheet-table");
    const nexusToolEntryRow = nexusToolsWorkspace.locator(".nexus-tool-entry-row");
    const nexusToolDataRows = nexusToolsSheet.locator("tbody tr:not(.nexus-tool-entry-row)");
    await expect(nexusToolsSheet).toBeVisible();
    await expect(nexusToolsSheet.getByRole("button", { name: "Access Method Sort" })).toBeVisible();
    await expect(nexusToolsSheet.getByRole("button", { name: "Application Sort" })).toBeVisible();
    await expect(nexusToolsSheet.getByRole("button", { name: "Browser Sort" })).toBeVisible();
    await expect(nexusToolsSheet.getByRole("button", { name: "API Sort" })).toBeVisible();
    await expect(nexusToolsSheet.getByRole("separator", { name: "Resize Tool column" })).toBeVisible();
    await nexusToolEntryRow.getByLabel("New tool", { exact: true }).fill("Nexus Handbook");
    await expect(nexusToolEntryRow.getByRole("button", { name: "Add" })).toBeEnabled();
    await nexusToolEntryRow.getByRole("button", { name: "Add" }).click();
    await expect(nexusToolDataRows).toHaveCount(1);
    await expect(nexusToolsSheet.getByRole("textbox", { name: "Tool: Nexus Handbook" })).toBeVisible();
    await expect(nexusToolsSheet.getByRole("textbox", { name: "Link: Nexus Handbook" })).toHaveValue("");
    await expect(
      nexusToolDataRows
        .filter({ has: page.getByRole("textbox", { name: "Tool: Nexus Handbook" }) })
        .getByRole("checkbox", { name: "Access Method: Nexus Handbook" }),
    ).not.toBeChecked();
    await nexusToolEntryRow.getByLabel("New tool", { exact: true }).fill("Nexus Portal");
    await nexusToolEntryRow.getByLabel("New tool link", { exact: true }).fill("example.com/nexus");
    await nexusToolEntryRow.getByLabel("New tool access method", { exact: true }).check();
    await nexusToolEntryRow.getByLabel("New tool browser", { exact: true }).check();
    await nexusToolEntryRow.getByLabel("New tool API", { exact: true }).check();
    await nexusToolEntryRow.getByRole("button", { name: "Add" }).click();
    await expect(nexusToolDataRows).toHaveCount(2);
    await expect(nexusToolsSheet.getByRole("textbox", { name: "Tool: Nexus Portal" })).toBeVisible();
    await expect(nexusToolsSheet.getByRole("textbox", { name: "Link: Nexus Portal" })).toHaveValue("https://example.com/nexus");
    const nexusPortalRow = nexusToolDataRows.filter({
      has: page.getByRole("textbox", { name: "Tool: Nexus Portal" }),
    });
    await expect(nexusPortalRow.getByRole("checkbox", { name: "Access Method: Nexus Portal" })).toBeChecked();
    await expect(nexusPortalRow.getByRole("checkbox", { name: "Application: Nexus Portal" })).not.toBeChecked();
    await expect(nexusPortalRow.getByRole("checkbox", { name: "Browser: Nexus Portal" })).toBeChecked();
    await expect(nexusPortalRow.getByRole("checkbox", { name: "API: Nexus Portal" })).toBeChecked();
    await nexusPortalRow.getByRole("textbox", { name: "Tool: Nexus Portal" }).fill("Nexus Control Room");
    const nexusControlRoomRow = nexusToolDataRows.filter({
      has: page.getByRole("textbox", { name: "Tool: Nexus Control Room" }),
    });
    await nexusControlRoomRow.getByRole("textbox", { name: "Link: Nexus Control Room" }).fill("control.example.com");
    await nexusControlRoomRow.getByRole("textbox", { name: "Link: Nexus Control Room" }).press("Tab");
    await expect(nexusControlRoomRow.getByRole("textbox", { name: "Link: Nexus Control Room" })).toHaveValue(
      "https://control.example.com",
    );
    await nexusControlRoomRow.getByRole("checkbox", { name: "Application: Nexus Control Room" }).check();
    await nexusControlRoomRow.getByRole("checkbox", { name: "Browser: Nexus Control Room" }).uncheck();
    await expect(nexusControlRoomRow.getByRole("checkbox", { name: "Access Method: Nexus Control Room" })).toBeChecked();
    await expect(nexusControlRoomRow.getByRole("checkbox", { name: "Application: Nexus Control Room" })).toBeChecked();
    await expect(nexusControlRoomRow.getByRole("checkbox", { name: "Browser: Nexus Control Room" })).not.toBeChecked();
    await expect(nexusControlRoomRow.getByRole("checkbox", { name: "API: Nexus Control Room" })).toBeChecked();
    await nexusControlRoomRow.getByRole("button", { name: "ID: Nexus Control Room" }).dblclick();
    const nexusControlRoomMenu = page.getByRole("menu", { name: "Options for Nexus Control Room" });
    await expect(nexusControlRoomMenu.getByRole("menuitem", { name: "Open" })).toBeVisible();
    await expect(nexusControlRoomMenu.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    await page.keyboard.press("Escape");
    await nexusToolDataRows
      .filter({ has: page.getByRole("textbox", { name: "Tool: Nexus Handbook" }) })
      .getByRole("button", { name: "ID: Nexus Handbook" })
      .dblclick();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(nexusToolsSheet.getByRole("textbox", { name: "Tool: Nexus Handbook" })).toHaveCount(0);
    await expect(nexusToolDataRows).toHaveCount(1);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".start-here-dialog")).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Strata" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("radio", { name: "Nexus" }).click();
    await expect(persistentTopbar.getByText("CRM", { exact: true })).toBeVisible();
    await nexusCrmSheet.getByLabel("Filter Client").fill("Hartree Partners");
    await expect(nexusCrmDataRows).toHaveCount(1);
    await expect(nexusCrmSheet.getByRole("button", { name: "Client: Hartree Partners" })).toBeVisible();
    await expect(nexusCrmDataRows.filter({ hasText: "Hartree" }).getByText("2 contacts", { exact: true })).toBeVisible();
    await page.locator(".nexus-crm-workspace").getByRole("button", { name: "Reset Table" }).click();
    await page.getByRole("button", { name: "Tools", exact: true }).click();
    await expect(persistentTopbar.getByText("Tools", { exact: true })).toBeVisible();
    await expect(nexusToolsSheet.getByRole("textbox", { name: "Tool: Nexus Control Room" })).toBeVisible();
    await expect(nexusToolsSheet.getByRole("textbox", { name: "Link: Nexus Control Room" })).toHaveValue(
      "https://control.example.com",
    );
    const restoredNexusToolRow = nexusToolDataRows.filter({
      has: page.getByRole("textbox", { name: "Tool: Nexus Control Room" }),
    });
    await expect(restoredNexusToolRow.getByRole("checkbox", { name: "Application: Nexus Control Room" })).toBeChecked();
    await expect(restoredNexusToolRow.getByRole("checkbox", { name: "Browser: Nexus Control Room" })).not.toBeChecked();
    await expect(nexusToolDataRows).toHaveCount(1);
    await persistentBackButton.click();
    await expect(persistentTopbar.getByText("CRM", { exact: true })).toBeVisible();
    await expect(persistentBackButton).toHaveAttribute("aria-label", "Go back to Strata");
    await persistentBackButton.click();
    await expect(strataProduct).toHaveAttribute("aria-checked", "true");
    await expect(nexusProduct).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("navigation", { name: "Strata" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Relationship CRM" })).toHaveCount(0);
    await expect(persistentTopbar.getByText("Apps", { exact: true })).toBeVisible();
    await expectLocatorStableX(persistentTopbarSearchTrigger, stableTopbarSearchX);
    await page.keyboard.press("Alt+1");
    await expect(persistentTopbar.getByText("Apps", { exact: true })).toBeVisible();
    await expectLocatorStableX(persistentTopbarSearchTrigger, stableTopbarSearchX);
    await expect(page.getByText("Desk Assistant")).toBeVisible();

    await page.keyboard.press("Control+K");
    await expect(
      page.getByRole("dialog", { name: "Open a workspace or record" }),
    ).toBeVisible();
    await page.getByLabel("Search terminal navigation targets").fill("risk");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/view=risk/);
    await expect(persistentTopbar).toBeVisible();
    await expect(persistentTopbar.getByText("Exposure", { exact: true })).toBeVisible();
    await expectLocatorStableX(persistentTopbarSearchTrigger, stableTopbarSearchX);
    await dismissStartHereOverlay(page);
    await page.keyboard.press("Alt+1");
    await expect(persistentTopbar.getByText("Apps", { exact: true })).toBeVisible();
    await expectLocatorStableX(persistentTopbarSearchTrigger, stableTopbarSearchX);
    await expect(page.getByText("Desk Assistant")).toBeVisible();

    await page.keyboard.press("?");
    const shortcutsDialog = page.getByRole("dialog", { name: "Terminal Shortcuts" });
    await expect(shortcutsDialog).toBeVisible();
    await expect(shortcutsDialog.getByText("Home", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(shortcutsDialog).toBeHidden();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("nexus tools grid edits and persists saved tool values", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=dashboard`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.locator(".start-here-dialog")).toHaveCount(0);
    await page.getByRole("radio", { name: "Nexus" }).click();
    await page.getByRole("button", { name: "Tools", exact: true }).click();

    const nexusToolsWorkspace = page.locator(".nexus-tools-workspace");
    const nexusToolsSheet = nexusToolsWorkspace.locator(".data-sheet-table");
    const nexusToolEntryRow = nexusToolsWorkspace.locator(".nexus-tool-entry-row");
    const nexusToolDataRows = nexusToolsSheet.locator("tbody tr:not(.nexus-tool-entry-row)");

    await expect(nexusToolsWorkspace.getByRole("heading", { name: "Tools", exact: true })).toBeVisible();
    await nexusToolEntryRow.getByLabel("New tool", { exact: true }).fill("Nexus Portal");
    await nexusToolEntryRow.getByLabel("New tool link", { exact: true }).fill("portal.example.com");
    await nexusToolEntryRow.getByLabel("New tool access method", { exact: true }).check();
    await nexusToolEntryRow.getByRole("button", { name: "Add" }).click();

    await expect(nexusToolDataRows).toHaveCount(1);
    const nexusPortalRow = nexusToolDataRows.filter({
      has: page.getByRole("textbox", { name: "Tool: Nexus Portal" }),
    });
    await expect(nexusPortalRow.getByRole("textbox", { name: "Link: Nexus Portal" })).toHaveValue(
      "https://portal.example.com",
    );
    await expect(nexusPortalRow.getByRole("checkbox", { name: "Access Method: Nexus Portal" })).toBeChecked();
    await expect(nexusPortalRow.getByRole("checkbox", { name: "Application: Nexus Portal" })).not.toBeChecked();

    await nexusPortalRow.getByRole("textbox", { name: "Tool: Nexus Portal" }).fill("Nexus Admin Portal");
    const nexusAdminPortalRow = nexusToolDataRows.filter({
      has: page.getByRole("textbox", { name: "Tool: Nexus Admin Portal" }),
    });
    await nexusAdminPortalRow.getByRole("textbox", { name: "Link: Nexus Admin Portal" }).fill("admin.example.com");
    await nexusAdminPortalRow.getByRole("textbox", { name: "Link: Nexus Admin Portal" }).press("Tab");
    await nexusAdminPortalRow.getByRole("checkbox", { name: "Access Method: Nexus Admin Portal" }).uncheck();
    await nexusAdminPortalRow.getByRole("checkbox", { name: "Application: Nexus Admin Portal" }).check();
    await nexusAdminPortalRow.getByRole("checkbox", { name: "Browser: Nexus Admin Portal" }).check();
    await nexusAdminPortalRow.getByRole("checkbox", { name: "API: Nexus Admin Portal" }).check();

    await expect(nexusAdminPortalRow.getByRole("textbox", { name: "Link: Nexus Admin Portal" })).toHaveValue(
      "https://admin.example.com",
    );
    await expect(nexusAdminPortalRow.getByRole("checkbox", { name: "Access Method: Nexus Admin Portal" })).not.toBeChecked();
    await expect(nexusAdminPortalRow.getByRole("checkbox", { name: "Application: Nexus Admin Portal" })).toBeChecked();
    await expect(nexusAdminPortalRow.getByRole("checkbox", { name: "Browser: Nexus Admin Portal" })).toBeChecked();
    await expect(nexusAdminPortalRow.getByRole("checkbox", { name: "API: Nexus Admin Portal" })).toBeChecked();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("radio", { name: "Nexus" }).click();
    await page.getByRole("button", { name: "Tools", exact: true }).click();

    const restoredNexusToolRow = nexusToolDataRows.filter({
      has: page.getByRole("textbox", { name: "Tool: Nexus Admin Portal" }),
    });
    await expect(restoredNexusToolRow).toHaveCount(1);
    await expect(restoredNexusToolRow.getByRole("textbox", { name: "Link: Nexus Admin Portal" })).toHaveValue(
      "https://admin.example.com",
    );
    await expect(restoredNexusToolRow.getByRole("checkbox", { name: "Access Method: Nexus Admin Portal" })).not.toBeChecked();
    await expect(restoredNexusToolRow.getByRole("checkbox", { name: "Application: Nexus Admin Portal" })).toBeChecked();
    await expect(restoredNexusToolRow.getByRole("checkbox", { name: "Browser: Nexus Admin Portal" })).toBeChecked();
    await expect(restoredNexusToolRow.getByRole("checkbox", { name: "API: Nexus Admin Portal" })).toBeChecked();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("home recommended action opens the settlement workspace", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=dashboard`, {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", {
        name: "Settlement · T-AMEND-100",
      }),
    ).toBeVisible();
    await page.evaluate(() => {
      window.localStorage.setItem(
        "ectrm.start-here-onboarding",
        JSON.stringify({
          dismissedWhileSignedOut: false,
          dismissedAuthenticatedSessionId: "smoke-session-1",
        }),
      );
    });
    await page.getByRole("button", { name: "Settlement", exact: true }).click();

    await expect(page).toHaveURL(/view=settlement/);
    await expect(page.getByRole("heading", { name: "Open Settlement Queue" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Settlement Control Board" })).toBeVisible();

    assertNoHarnessRequestFailures(harness);
  } finally {
    await harness.close();
  }
});

test("Strata and Nexus restore independent color mode preferences", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "ectrm.start-here-onboarding",
        JSON.stringify({
          dismissedWhileSignedOut: false,
          dismissedAuthenticatedSessionId: "smoke-session-1",
        }),
      );
      window.localStorage.setItem(
        "ectrm.appearance-settings",
        JSON.stringify({
          colorMode: "dark",
          workspaceMode: "default",
          lightMode: {
            accent: "#127c6c",
            highlight: "#4c78b6",
          },
          darkMode: {
            accent: "#3dd6a0",
            highlight: "#4ea7ff",
          },
        }),
      );
    });
    await page.goto(`${harness.origin}/?view=dashboard`, {
      waitUntil: "domcontentloaded",
    });

    const root = page.locator("html");
    await expect(root).toHaveAttribute("data-color-mode", "dark");
    await page.getByRole("radio", { name: "Nexus" }).click();
    await expect(root).toHaveAttribute("data-color-mode", "dark");
    await expect(page.locator(".appearance-toggle-desktop")).toHaveAttribute(
      "aria-label",
      "Switch to light mode",
    );
    await page.locator(".appearance-toggle-desktop").click();
    await expect(root).toHaveAttribute("data-color-mode", "light");
    await page.getByRole("radio", { name: "Strata" }).click();
    await expect(root).toHaveAttribute("data-color-mode", "dark");

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

    const settlementQueue = page.locator("#settlement-queue");
    await expect(settlementQueue).toBeVisible();
    await expect(
      settlementQueue.getByRole("tab", { name: /Ready to invoice\s*1/ }),
    ).toBeVisible();
    await expect(
      settlementQueue.getByRole("tab", { name: /Payment due\s*0/ }),
    ).toBeVisible();
    await expect(
      settlementQueue.getByRole("tab", { name: /Exceptions\s*0/ }),
    ).toBeVisible();
    await expect(
      settlementQueue.getByRole("tab", { name: /All\s*1/ }),
    ).toBeVisible();
    await expect(settlementQueue).toContainText("Invoice-ready trades");
    const readyInvoiceRow = settlementQueue
      .locator(".settlement-worklist-item")
      .filter({ hasText: "T-AMEND-100" });
    await expect(readyInvoiceRow).toBeVisible();
    await expect(readyInvoiceRow).toContainText("Issue invoice");
    await expect(readyInvoiceRow).toHaveAttribute("aria-pressed", "true");
    await expect(settlementQueue).toContainText("Invoice Ledger");
    await expect(settlementQueue).not.toContainText("Payment Ledger");
    await expect(settlementQueue).not.toContainText("Move");
    await settlementQueue.getByRole("tab", { name: /Payment due\s*0/ }).click();
    await expect(settlementQueue).toContainText("No payment due rows");
    await settlementQueue.getByRole("tab", { name: /Ready to invoice\s*1/ }).click();

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
    await expect(page.locator(".workspace-topbar")).toHaveCount(0);
    await expect(page.locator(".hero")).toHaveCount(0);
    await expect(page.locator(".nav-global-filter")).toHaveCount(0);
    await expect(page.getByLabel("Operator prompt")).toHaveCount(0);
    await signInFromPromptHome(page);

    await expect(page.locator(".workspace-topbar-persistent")).toBeVisible();
    await expect(page.getByLabel("Operator prompt")).toBeVisible();
    await expect(profileAvatarButton(page)).toBeVisible();
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

test("home price rows open the filtered price report on double-click", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await seedSignedInSession(page, harness);
    await page.goto(harness.origin, {
      waitUntil: "domcontentloaded",
    });

    const priceRow = page.getByRole("button", {
      name: "Double-click to open the price report for Henry Hub IFERC",
    });
    await expect(priceRow).toBeVisible();
    await expect(priceRow).toContainText("HENRY_HUB_GAS");
    await expect(priceRow).toContainText("Price Datetime");

    const homeUrl = page.url();
    await priceRow.click();
    await expect(page).toHaveURL(homeUrl);

    await priceRow.dblclick();
    await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("reports");
    await expect.poll(() => new URL(page.url()).searchParams.get("focusType")).toBe("report");
    await expect.poll(() => new URL(page.url()).searchParams.get("focusId")).toBe("reports-price-bi");
    await expect.poll(() => new URL(page.url()).searchParams.get("focusFilter")).toBe("HH_IFERC");
    await expect(
      page.getByRole("heading", {
        name: "HENRY_HUB_GAS, Henry Hub IFERC, ICE",
      }),
    ).toBeVisible();
    await expect(page.getByText("Price-only report section filtered to the selected price index.")).toBeVisible();
    await expect(page.getByText("Desk reporting and analyst outputs")).toHaveCount(0);
    await expect(page.getByText("Latest Price")).toBeVisible();

    await page.getByRole("button", { name: "Review Sources" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("admin");
    await expect.poll(() => new URL(page.url()).hash).toBe("#admin-price-sources");
    await expect(page.getByText(/Price source inventory ·/)).toBeVisible();

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

    await expect(promptCard).toContainText("Desk Assistant");
    await expect(promptCardToggle).toHaveAttribute(
      "aria-label",
      "Collapse Desk Assistant",
    );
    await expect(promptCardBody).toBeVisible();
    await expect(operatorPrompt).toBeVisible();
    await expect(page.locator(".prompt-home-quick-prompts")).toHaveCount(0);
    await expect(currentPromptThread).toBeVisible();

    await promptCardToggle.click();
    await expect(promptCardToggle).toHaveAttribute(
      "aria-label",
      "Expand Desk Assistant",
    );
    await expect(promptCardBody).toBeHidden();
    await expect(operatorPrompt).toBeHidden();
    await expect(currentPromptThread).toBeHidden();

    await promptCardToggle.click();
    await expect(promptCardToggle).toHaveAttribute(
      "aria-label",
      "Collapse Desk Assistant",
    );
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

test("prompt home keeps the simplified map visible while time apps collapse independently", async ({
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
    const exchangesPanel = page.locator("#prompt-home-exchanges-panel");
    const calendarPanel = page.locator("#prompt-home-calendar-panel");
    const pricesCard = page.locator(".prompt-home-prices-card");
    const newsCard = page.locator(".prompt-home-news-card");
    const deskTimeHead = page.locator(".prompt-home-timeframe-panel-head");
    const dayPanel = page.locator("#prompt-home-day-panel");
    const weekPanel = page.locator("#prompt-home-week-panel");
    const monthPanel = page.locator("#prompt-home-month-panel");
    const mapPanel = page.locator("#prompt-home-map-panel");
    const deskTimeToggle = page.locator(
      ".prompt-home-timeframe-panel-toggle-action",
    );
    const exchangesToggle = page.locator(".prompt-home-exchanges-card-toggle");
    const calendarToggle = page.locator(
      ".prompt-home-calendar-card-toggle-action",
    );
    const deskTimeCopy = page.locator(".prompt-home-timeframe-panel-copy");
    const deskTimeSummary = deskTimeCopy.locator(
      ".prompt-home-timeframe-panel-summary",
    );
    const mapToggle = page.locator(".prompt-home-map-card-toggle");
    const mapActions = page.getByLabel("Map actions");
    const mapFiltersDialog = page.getByRole("dialog", { name: "Map Filters" });
    const calendarSettingsDialog = page.getByRole("dialog", {
      name: "Calendar Settings",
    });
    const savePresetInput = mapFiltersDialog.getByLabel("Save map filters as");
    const savedPresetSelect = mapFiltersDialog.getByLabel(
      "Saved map filter presets",
    );
    const savePresetButton = mapFiltersDialog.getByRole("button", {
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
    const myLocationToggle = mapFiltersDialog.getByRole("checkbox", {
      name: "My Location",
    });
    const assetsToggle = mapFiltersDialog.getByRole("checkbox", {
      name: "Assets",
    });
    const weatherToggle = mapFiltersDialog.getByRole("checkbox", {
      name: "Weather",
    });
    const activityControls = mapFiltersDialog.getByLabel(
      "Activity visibility controls",
    );
    const geographyControls = mapFiltersDialog.getByLabel(
      "Geography visibility controls",
    );
    const assetTypeControls = mapFiltersDialog.getByLabel(
      "Asset type visibility controls",
    );
    const countrySearch = mapFiltersDialog.getByRole("searchbox", {
      name: "Country",
    });
    const subdivisionSearch = mapFiltersDialog.getByRole("searchbox", {
      name: "State or Territory",
    });
    const northAmericaToggle = mapFiltersDialog.getByRole("checkbox", {
      name: "North America",
    });
    const positionsActivityToggle = mapFiltersDialog.getByRole("checkbox", {
      name: "Positions",
    });
    const shipmentsActivityToggle = mapFiltersDialog.getByRole("checkbox", {
      name: "Shipments",
    });
    const inventoryActivityToggle = mapFiltersDialog.getByRole("checkbox", {
      name: "Inventory",
    });
    const tooltipToggle = mapFiltersDialog.getByRole("checkbox", {
      name: "Tooltips",
    });
    const weatherOverlayControls = mapFiltersDialog.getByLabel(
      "Weather overlay controls",
    );
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
    await expect(exchangesPanel).toBeVisible();
    await expect(calendarPanel).toBeVisible();
    await calendarPanel.getByRole("button", { name: "Settings" }).click();
    await expect(calendarSettingsDialog).toBeVisible();
    await expect(calendarSettingsDialog).toContainText("Active calendars");
    await expect(calendarSettingsDialog).toContainText(
      "Available Google calendars",
    );
    await calendarSettingsDialog.getByRole("button", { name: "Done" }).click();
    await expect(calendarSettingsDialog).toHaveCount(0);
    await expect(
      pricesCard.locator(".prompt-home-prices-ticker-strip"),
    ).toBeVisible();
    await expect(
      pricesCard.locator(".prompt-home-prices-ticker-item").first(),
    ).toContainText(/HENRY_HUB_GAS · 3\.21 USD\/MMBTU/);
    const priceActions = pricesCard.getByLabel("Market price actions");
    await expect(priceActions).toBeVisible();
    await expect(
      priceActions.getByRole("button", { name: "Filter" }),
    ).toBeVisible();
    await expect(
      priceActions.getByRole("button", { name: "Sync latest prices" }),
    ).toBeVisible();
    await expect(
      priceActions.getByRole("button", { name: "Errors" }),
    ).toBeVisible();
    await expect(
      priceActions.getByRole("button", { name: "Sources" }),
    ).toBeVisible();
    await pricesCard
      .getByRole("button", { name: "Collapse Market Prices" })
      .click();
    await expect(priceActions).toHaveCount(0);
    await pricesCard.getByRole("button", { name: "Expand Market Prices" }).click();
    await expect(priceActions).toBeVisible();
    await expect(
      pricesCard.locator(".prompt-home-prices-filter-bar"),
    ).toHaveCount(0);
    await pricesCard.getByRole("button", { name: "Filter" }).click();
    const priceFiltersDialog = page.getByRole("dialog", { name: "Filters" });
    await expect(priceFiltersDialog).toBeVisible();
    await expect(priceFiltersDialog.getByLabel("Price filters")).toBeVisible();
    await expect(
      priceFiltersDialog.getByPlaceholder("Code, market, commodity, type"),
    ).toBeVisible();
    await expect(priceFiltersDialog.getByLabel("Provider")).toBeVisible();
    await expect(priceFiltersDialog.getByLabel("Commodity")).toBeVisible();
    await expect(priceFiltersDialog.getByLabel("Index")).toBeVisible();
    await expect(
      priceFiltersDialog.getByLabel("Filter by mark status"),
    ).toBeVisible();
    await priceFiltersDialog.getByRole("button", { name: "Done" }).click();
    await expect(priceFiltersDialog).toHaveCount(0);
    await expect(
      newsCard.locator(".prompt-home-news-headline-strip"),
    ).toBeVisible();
    const newsActions = newsCard.getByLabel("Market news actions");
    await expect(newsActions).toBeVisible();
    await expect(newsActions.getByRole("button", { name: "Filter" })).toBeVisible();
    await expect(newsCard.locator(".prompt-home-news-filter-bar")).toHaveCount(0);
    await newsActions.getByRole("button", { name: "Filter" }).click();
    const newsFiltersDialog = page.locator(".prompt-home-news-filter-dialog");
    await expect(newsFiltersDialog).toBeVisible();
    await expect(newsFiltersDialog.getByLabel("News filters")).toBeVisible();
    await expect(
      newsFiltersDialog.getByPlaceholder("OPEC, LNG, storm impacts"),
    ).toBeVisible();
    await expect(newsFiltersDialog.getByLabel("Commodity")).toBeVisible();
    await expect(newsFiltersDialog.getByLabel("Market Location")).toBeVisible();
    await expect(newsFiltersDialog.getByLabel("Supply Effect")).toBeVisible();
    await expect(newsFiltersDialog.getByLabel("Demand Effect")).toBeVisible();
    await newsFiltersDialog.getByRole("button", { name: "Done" }).click();
    await expect(newsFiltersDialog).toHaveCount(0);
    await expect(newsCard).toContainText(
      "Henry Hub gas holds steady in smoke fixture",
    );
    await expect(newsCard).not.toContainText("Live headline context");
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
    await expect(mapToggle).toHaveAttribute("aria-label", "Collapse Asset map");
    await expect(mapActions).toBeVisible();
    await expect(
      mapActions.getByRole("button", { name: "Filter" }),
    ).toBeVisible();
    await expect(
      page.locator(".prompt-home-map-card .asset-map-filters-card"),
    ).toHaveCount(0);
    await mapActions.getByRole("button", { name: "Filter" }).click();
    await expect(mapFiltersDialog).toBeVisible();
    await expect(
      mapFiltersDialog.locator(".asset-map-filters-dialog-body"),
    ).toBeVisible();
    await expect(
      mapFiltersDialog.getByText("Map Filters", { exact: true }),
    ).toBeVisible();
    await mapFiltersDialog.getByRole("button", { name: "Close" }).click();
    await expect(mapFiltersDialog).toHaveCount(0);
    await mapToggle.click();
    await expect(mapActions).toHaveCount(0);
    await mapToggle.click();
    await expect(mapActions).toBeVisible();
    await mapActions.getByRole("button", { name: "Filter" }).click();
    await expect(mapFiltersDialog).toBeVisible();
    await expect(
      mapFiltersDialog.locator(".asset-map-filters-dialog-body"),
    ).toBeVisible();
    await expect(
      mapFiltersDialog.getByLabel("Map layer visibility controls"),
    ).toBeVisible();
    await expect(
      mapFiltersDialog.getByRole("button", { name: "Done" }),
    ).toBeVisible();
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
    await expect(mapFiltersDialog.getByText("Geography")).toBeVisible();
    await expect(northAmericaToggle).toBeVisible();
    await expect(northAmericaToggle).toBeChecked();
    await expect(
      mapFiltersDialog.getByRole("checkbox", { name: "South America" }),
    ).toBeVisible();
    await expect(
      mapFiltersDialog.getByRole("checkbox", { name: "EMEA" }),
    ).toBeVisible();
    await expect(
      mapFiltersDialog.getByRole("checkbox", { name: "APAC" }),
    ).toBeVisible();
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
    await expect(mapFiltersDialog.getByText("Asset Types")).toBeVisible();
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
    await expect(savePresetButton).toBeDisabled();
    await expect(
      mapFiltersDialog.getByRole("checkbox", { name: "Pipeline" }),
    ).toBeChecked();
    await expect(page.getByText(/tracked weather points visible/)).toHaveCount(0);
    await expect(page.locator(".asset-map-weather-marker")).toHaveCount(0);
    await expect(page.locator(".asset-map-weather-preview")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Where I am" })).toHaveCount(
      0,
    );
    await expect(page.locator(".asset-map-user-marker")).toBeVisible();
    await expect(page.locator(".prompt-home-exchanges-card")).toContainText(
      "major venue sessions",
    );
    await expect(page.locator(".prompt-home-exchanges-card")).toContainText(
      "ICE Brent",
    );
    await expect(page.locator(".prompt-home-exchanges-card")).toContainText(
      "Alpha Vantage exchange coverage",
    );
    await expect(page.locator(".prompt-home-exchanges-card")).toContainText(
      "NASDAQ, NYSE, AMEX, BATS",
    );
    await expect(page.locator(".prompt-home-calendar-card")).toContainText(
      "Calendar",
    );
    await expect(exchangesToggle).toHaveAttribute(
      "aria-label",
      "Collapse Exchanges",
    );
    await expect(calendarToggle).toHaveAttribute(
      "aria-label",
      "Collapse Calendar",
    );
    await expect(timeZoneSelect).toBeVisible();
    await expectLocatorNearRightEdge(deskTimeHead, deskTimeToggle);
    await expect(savePresetButton).toBeDisabled();
    await savePresetInput.fill("Smoke Home Filters");
    await expect(savePresetButton).toBeEnabled();
    await savePresetButton.click();
    await expect(mapFiltersDialog).toContainText(
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
    await expect(mapFiltersDialog).toContainText(
      'Loaded preset "Smoke Home Filters".',
    );
    await expect(savedPresetSelect).toHaveValue("Smoke Home Filters");
    await expect(positionsActivityToggle).toBeChecked();
    await expect(shipmentsActivityToggle).toBeChecked();
    await expect(page.locator(".asset-map-marker")).toHaveCount(1);
    await expect(mapRecordsCard).toContainText("Map Records");
    await expect(mapRecordsCard).toContainText(/\d+ map records?/);
    await expect(mapRecordsToggle).toHaveAttribute(
      "aria-label",
      "Expand Map Records",
    );
    await expect(mapRecordsBody).toBeHidden();

    await assetTypeControls
      .getByRole("button", { name: "Uncheck all" })
      .click();
    await expect(
      assetTypeControls.getByRole("button", { name: "Check all" }),
    ).toBeVisible();
    await expect(
      mapFiltersDialog.getByRole("checkbox", { name: "Pipeline" }),
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
      mapFiltersDialog.getByRole("checkbox", { name: "Pipeline" }),
    ).toBeChecked();
    await tooltipToggle.check();
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
    await mapFiltersDialog.getByRole("button", { name: "Done" }).click();
    await expect(mapFiltersDialog).toHaveCount(0);
    await mapRecordsToggle.click();
    await expect(mapRecordsToggle).toHaveAttribute(
      "aria-label",
      "Collapse Map Records",
    );
    await expect(mapRecordsBody).toBeVisible();
    await expect(
      mapRecordsBody.getByRole("button", {
        name: "Focus GULF_PIPELINE on map",
      }),
    ).toBeVisible();

    await dayToggle.click();
    await expect(dayPanel).toBeHidden();
    await expect(dayCard).toContainText("Desk window HE07 to HE22");
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

    await mapToggle.click();
    await expect(mapPanel).toBeHidden();
    await expect(mapToggle).toHaveAttribute("aria-label", "Expand Asset map");

    await deskTimeToggle.click();
    await expect(deskTimePanel).toBeHidden();
    await expect(deskTimeToggle).toHaveAttribute(
      "aria-label",
      "Expand Desk Time",
    );
    await expect(deskTimeSummary).toHaveText(
      /^\s*\d{1,2}:\d{2}\s(?:AM|PM)\s\|\sHE\d{2}\s*$/,
    );
    await expect(timeZoneSelect).toHaveCount(0);
    await expect(exchangesPanel).toBeVisible();
    await expect(calendarPanel).toBeVisible();
    await expect(mapPanel).toBeHidden();

    await exchangesToggle.click();
    await expect(exchangesPanel).toBeHidden();
    await expect(exchangesToggle).toHaveAttribute(
      "aria-label",
      "Expand Exchanges",
    );
    await expect(deskTimePanel).toBeHidden();
    await expect(calendarPanel).toBeVisible();
    await exchangesToggle.click();
    await expect(exchangesPanel).toBeVisible();

    await calendarToggle.click();
    await expect(calendarPanel).toBeHidden();
    await expect(calendarToggle).toHaveAttribute(
      "aria-label",
      "Expand Calendar",
    );
    await expect(deskTimePanel).toBeHidden();
    await expect(exchangesPanel).toBeVisible();
    await calendarToggle.click();
    await expect(calendarPanel).toBeVisible();

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
    await expect(profileAvatarButton(page)).toBeVisible();
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

    await page.goto(`${harness.origin}/?view=admin#assistant-outcome-metrics`, {
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

    await page.goto(`${harness.origin}/?view=admin#assistant-outcome-metrics`, {
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

    await page.goto(`${harness.origin}/?view=admin#assistant-outcome-metrics`, {
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
    await page.goto(`${harness.origin}/?view=admin#assistant-agent-builder`, {
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
    await agentControl.getByRole("tab", { name: /Editor & Evals/ }).click();
    const evalCatalog = agentControl.locator(".assistant-agent-eval-catalog");
    await expect(evalCatalog).toHaveCount(1);
    await expect(evalCatalog).toContainText("Behavior Regression Cases");
    await expect(agentControl.getByText("Saved Behavior Cases")).toHaveCount(0);
    const constructionReview = agentControl.locator(
      ".assistant-admin-construction-review:not(.assistant-admin-draft-construction-review)",
    );
    await expect(constructionReview).toContainText("Saved Construction Preview");
    await expect(constructionReview).toContainText("Context provenance");
    await expect(constructionReview).toContainText("Managed agent overlay");
    await expect(constructionReview).toContainText("Fallback");

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

    await page.goto(`${harness.origin}/?view=admin#assistant-agent-profile-requests`, {
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
    await expect(reviewCard.getByRole("button", { name: "Mark Applied" })).toBeDisabled();
    await reviewCard.getByRole("button", { name: "Load Review Draft" }).click();
    await expect(
      page.getByText("Loaded request #9001 into the review draft for Ops Governor."),
    ).toBeVisible();
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

    await page.goto(`${harness.origin}/?view=admin#assistant-outcome-metrics`, {
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

test("prompt home approves a staged Home view and opens the saved instance", async ({
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
      .fill("Make me a view to see HH NG.");
    await page.getByRole("button", { name: "Send Prompt" }).click();

    const assistantMessage = page
      .locator(".assistant-message-assistant")
      .last();
    const actionCard = assistantMessage
      .locator(".assistant-action-card")
      .first();

    await expect(
      assistantMessage.getByText(
        "I staged a Home view request for HH NG. Review the card mix and filters before anything changes. Approval is still required.",
      ),
    ).toBeVisible();
    await expect(actionCard).toContainText('Create Home view "HH NG Watch"');
    await expect(actionCard).toContainText("Requester: ops_admin");
    await expect(actionCard).toContainText("Home view HH NG Watch");
    await expect(actionCard).toContainText("Dry-run preview");

    await actionCard.getByRole("button", { name: "Approve" }).click();

    await expect(actionCard).toContainText("Executed");
    await expect(actionCard).toContainText("Review: Approved as-is");
    await expect(actionCard).toContainText("home_view_definition");

    await page.reload({ waitUntil: "domcontentloaded" });
    const viewSwitcher = page.locator(".prompt-home-view-switcher select");
    await expect(viewSwitcher).toContainText("HH NG Watch");
    await viewSwitcher.selectOption({ label: "HH NG Watch" });
    await page.getByRole("button", { name: /Manage Apps/ }).click();
    await expect(page.locator(".prompt-home-view-actions")).toContainText(
      "HH NG Watch",
    );
    await expect(page.locator(".prompt-home-view-actions")).toContainText(
      "Personal",
    );

    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
    ).toHaveLength(0);
    expect(harness.mutationRequests).toEqual([
      {
        method: "POST",
        path: "/assistant/action-requests/7101/approve",
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

test("pre-trade smoke carries approved recommendation context into trade capture", async ({
  page,
}) => {
  const harness = await startSmokeHarness();
  const scenarioName = "Smoke Henry Hub offset";
  const createdTradeId = "TRD-10001";

  try {
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=pretrade`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    const scenarioTile = page.locator("#pretrade-brief");
    await expect(scenarioTile).toBeVisible();
    await scenarioTile
      .locator("label.field")
      .filter({ hasText: /^Scenario Name/ })
      .locator("input")
      .fill(scenarioName);
    await scenarioTile
      .locator("label.field")
      .filter({ hasText: /^Thesis/ })
      .locator("textarea")
      .fill("Use the smoke recommendation to reduce the Henry Hub prompt long.");
    await scenarioTile
      .locator("label.field")
      .filter({ hasText: /^Counterparty/ })
      .locator("select")
      .selectOption("ALPHA_MKT");
    await scenarioTile
      .locator("label.field")
      .filter({ hasText: /^Side/ })
      .locator("select")
      .selectOption("SELL");
    await scenarioTile
      .locator("label.field")
      .filter({ hasText: /^Indicative Price/ })
      .locator("input")
      .fill("3.18");
    await scenarioTile
      .locator("label.field")
      .filter({ hasText: /^Target Volume/ })
      .locator("input")
      .fill("12500");
    await scenarioTile
      .locator("label.field")
      .filter({ hasText: /^Price Unit/ })
      .locator("select")
      .selectOption("USD/MMBTU");
    await scenarioTile
      .locator("label.field")
      .filter({ hasText: /^Delivery Start/ })
      .locator("input")
      .fill("2026-05-01");
    await scenarioTile
      .locator("label.field")
      .filter({ hasText: /^Delivery End/ })
      .locator("input")
      .fill("2026-05-31");

    const readinessPanel = page.locator(
      "#pretrade-recommendation .pretrade-readiness-panel",
    );
    await expect(readinessPanel).toContainText(
      "Proceed with smoke-offset review.",
    );
    await expect(readinessPanel).toContainText("Source Freshness");
    await expect(readinessPanel).toContainText(
      "Latest Henry Hub IFERC mark is stale",
    );
    await expect(
      readinessPanel.getByRole("button", { name: "Submit For Review" }),
    ).toBeVisible();
    await readinessPanel
      .getByRole("button", { name: "Submit For Review" })
      .click();

    const reviewCards = page.locator(
      "#pretrade-reviews .workspace-tile-body > .stack > .pretrade-card-list > article.pretrade-record-card",
    );
    const reviewCard = reviewCards.filter({ hasText: scenarioName });
    await expect(reviewCard).toBeVisible();
    await expect(reviewCard).toContainText("OPEN");
    await expect(reviewCard).toContainText("Proceed with smoke-offset review.");
    await reviewCard
      .getByPlaceholder("Add a reviewer note. Approval requires a comment.")
      .fill("Approved for smoke handoff into Trade Capture.");
    await expect(reviewCard.getByRole("button", { name: "Approve" })).toBeEnabled();
    await reviewCard.getByRole("button", { name: "Approve" }).click();
    await expect(reviewCard).toContainText("APPROVED");
    await expect(
      reviewCard.getByRole("button", { name: "Open Ticket" }),
    ).toBeVisible();
    await reviewCard.getByRole("button", { name: "Open Ticket" }).click();

    await expect(page).toHaveURL(/view=trades/);
    const createForm = page.locator("form.trade-form.trade-form-feature");
    await expect(createForm).toBeVisible();
    await expect(createForm).toContainText("Approved pre-trade review attached");
    await expect(createForm).toContainText(`Review #1 ${scenarioName}`);
    await expect(createForm).toContainText("Recommendation #1 is attached with score 78");
    await expect(createForm).toContainText("Opportunity: RISK REDUCTION");
    await expect(createForm).toContainText(
      "Sources: 1 of 3 source snapshots need review",
    );
    await expect(createForm).toContainText("Still Aligned");
    await expect(
      createForm.getByPlaceholder("Search by book name or code"),
    ).toHaveValue(/GULF_GAS/);
    await expect(
      createForm.getByPlaceholder("Search by name or code"),
    ).toHaveValue(/ALPHA_MKT/);
    await expect(
      createForm.getByPlaceholder("Search by commodity name or code"),
    ).toHaveValue(/HENRY_HUB_GAS/);
    await expect(
      createForm
        .locator("label.field")
        .filter({ hasText: /^Volume$/ })
        .locator("input"),
    ).toHaveValue("12500");

    await expect(
      createForm.getByRole("button", { name: "Create Trade" }),
    ).toBeEnabled();
    await createForm.getByRole("button", { name: "Create Trade" }).click();

    await expect(page).toHaveURL(
      new RegExp(`view=trades(?:&|$).*trade=${createdTradeId}`),
    );
    await expect(
      page.getByRole("button", {
        name: new RegExp(`Trade: ${createdTradeId} HENRY_HUB_GAS`),
      }),
    ).toHaveAttribute("aria-selected", "true");
    expect(harness.operationWorkItemRequests).toHaveLength(1);
    expect(harness.operationWorkItemRequests[0].trade_id).toBe(createdTradeId);
    expect(harness.operationWorkItemRequests[0].notes ?? "").toContain(
      "Pre-trade governance context attached from approved shared review.",
    );
    expect(harness.operationWorkItemRequests[0].notes ?? "").toContain(
      `Review: #1 ${scenarioName}`,
    );
    expect(harness.operationWorkItemRequests[0].notes ?? "").toContain(
      "Source freshness: 1 of 3 source snapshots need review",
    );

    expect(
      harness.unexpectedRequests,
      `Unhandled mock API requests:\n${formatRecordedRequests(harness.unexpectedRequests)}`,
    ).toHaveLength(0);
    expect(harness.mutationRequests).toEqual([
      {
        method: "POST",
        path: "/pretrade/recommendations/runs",
        search: "",
      },
      {
        method: "POST",
        path: "/pretrade/reviews",
        search: "",
      },
      {
        method: "PATCH",
        path: "/pretrade/reviews/1",
        search: "",
      },
      {
        method: "POST",
        path: "/events",
        search: "",
      },
      {
        method: "POST",
        path: "/operations/work-items",
        search: "",
      },
    ]);
  } finally {
    await harness.close();
  }
});

test("pre-trade smoke keeps the primary review action visible on narrow screens", async ({
  page,
}) => {
  const harness = await startSmokeHarness();

  try {
    await page.setViewportSize({ width: 390, height: 900 });
    await seedSignedInSession(page, harness);
    await page.goto(`${harness.origin}/?view=pretrade`, {
      waitUntil: "domcontentloaded",
    });

    await dismissStartHereOverlay(page);

    const readinessPanel = page.locator(
      "#pretrade-recommendation .pretrade-readiness-panel",
    );
    await expect(readinessPanel).toContainText("Review Readiness");
    await expect(readinessPanel).toContainText("Source Freshness");
    const submitAction = readinessPanel.getByRole("button", {
      name: "Submit For Review",
    });
    await expect(submitAction).toBeVisible();
    const actionBox = await submitAction.boundingBox();
    expect(actionBox).not.toBeNull();
    expect(actionBox?.width ?? 0).toBeGreaterThan(120);

    assertNoHarnessRequestFailures(harness);
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
    await page.goto(`${harness.origin}/?view=admin#assistant-approval-inbox`, {
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
    await page.goto(`${harness.origin}/?view=admin#assistant-approval-inbox`, {
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
