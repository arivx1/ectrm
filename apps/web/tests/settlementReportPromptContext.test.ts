import { describe, expect, it } from "vitest";

import {
  buildSettlementPresetPromptDraft,
  buildSettlementReportPromptContext,
} from "../src/workspaces/reports/settlementReportPromptContext";

describe("settlement report prompt context helpers", () => {
  const settlement = {
    activePreset: {
      presetId: 11,
      name: "Desk USD Lens",
      scope: "SHARED" as const,
      filters: {
        book: "CRUDE",
        counterparty: "ALL",
        currency: "USD",
        exceptionType: "SHORT_PAY",
        severity: "blocked",
      },
      canEdit: true,
      updatedAt: null,
      updatedBy: null,
    },
    activePresetName: "Desk USD Lens",
    agingRows: [{ row: 1 }],
    cashPoints: [{ point: 1 }, { point: 2 }],
    exceptionRows: [{ row: 1 }, { row: 2 }, { row: 3 }],
    presetNameInput: "Midwest cash watch",
    presetScopeInput: "SHARED" as const,
    savedPresets: [
      {
        presetId: 11,
        name: "Desk USD Lens",
        scope: "SHARED" as const,
        filters: {
          book: "CRUDE",
          counterparty: "ALL",
          currency: "USD",
          exceptionType: "SHORT_PAY",
          severity: "blocked",
        },
        canEdit: true,
        updatedAt: null,
        updatedBy: null,
      },
      {
        presetId: 12,
        name: "Trader CAD Watch",
        scope: "PERSONAL" as const,
        filters: {
          book: "ALL",
          counterparty: "Shell",
          currency: "CAD",
          exceptionType: "ALL",
          severity: "in-progress",
        },
        canEdit: true,
        updatedAt: null,
        updatedBy: null,
      },
    ],
    settlementFilterActive: true,
    settlementFilters: {
      book: "CRUDE",
      counterparty: "ALL",
      currency: "USD",
      exceptionType: "SHORT_PAY",
      severity: "blocked",
    },
  };

  it("builds a draft that preserves the current scope and preset name input", () => {
    expect(buildSettlementPresetPromptDraft(settlement)).toBe(
      'Create a shared settlement preset named "Midwest cash watch" from the current settlement filters.',
    );
  });

  it("builds structured settlement prompt context from the active lens", () => {
    expect(buildSettlementReportPromptContext(settlement)).toContain("surface: settlement_report");
    expect(buildSettlementReportPromptContext(settlement)).toContain("book: CRUDE");
    expect(buildSettlementReportPromptContext(settlement)).toContain("currency: USD");
    expect(buildSettlementReportPromptContext(settlement)).toContain("exception_type: SHORT_PAY");
    expect(buildSettlementReportPromptContext(settlement)).toContain("severity: blocked");
    expect(buildSettlementReportPromptContext(settlement)).toContain(
      "visible_presets: Desk USD Lens (shared); Trader CAD Watch (personal)",
    );
  });
});
