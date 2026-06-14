import { ALL_FILTER_VALUE, type SettlementReportLensFilters } from "./settlementReportLens";
import type { SettlementReportPreset } from "./settlementReportLens";
import type { SettlementReportLensState } from "./useSettlementReportLens";

type SettlementPromptContextState = Pick<
  SettlementReportLensState,
  | "activePreset"
  | "activePresetName"
  | "cashPoints"
  | "exceptionRows"
  | "presetNameInput"
  | "presetScopeInput"
  | "savedPresets"
  | "settlementFilterActive"
  | "settlementFilters"
  | "agingRows"
>;

function normalizedFilterValue(value: string): string | null {
  const trimmedValue = value.trim();
  if (!trimmedValue || trimmedValue === ALL_FILTER_VALUE) {
    return null;
  }
  return trimmedValue;
}

function formatVisiblePresetLabel(preset: SettlementReportPreset): string {
  return preset.scope === "SHARED" ? `${preset.name} (shared)` : `${preset.name} (personal)`;
}

function activeFilterEntries(
  filters: SettlementReportLensFilters,
): Array<[keyof SettlementReportLensFilters, string]> {
  return (
    [
      ["book", normalizedFilterValue(filters.book)],
      ["counterparty", normalizedFilterValue(filters.counterparty)],
      ["currency", normalizedFilterValue(filters.currency)],
      ["exceptionType", normalizedFilterValue(filters.exceptionType)],
      ["severity", normalizedFilterValue(filters.severity)],
    ] satisfies Array<[keyof SettlementReportLensFilters, string | null]>
  ).filter((entry): entry is [keyof SettlementReportLensFilters, string] => entry[1] !== null);
}

export function buildSettlementPresetPromptDraft(settlement: SettlementPromptContextState): string {
  const presetName = settlement.presetNameInput.trim();
  const scopeLabel = settlement.presetScopeInput === "SHARED" ? "shared" : "personal";

  if (presetName) {
    return `Create a ${scopeLabel} settlement preset named "${presetName}" from the current settlement filters.`;
  }

  return `Create a ${scopeLabel} settlement preset from the current settlement filters and name it "<enter preset name>".`;
}

export function buildSettlementReportPromptContext(settlement: SettlementPromptContextState): string {
  const filterEntries = activeFilterEntries(settlement.settlementFilters);
  const visiblePresetLabels = settlement.savedPresets.slice(0, 8).map(formatVisiblePresetLabel);
  const lines = [
    "surface: settlement_report",
    "workspace: reports",
    `filter_state: ${settlement.settlementFilterActive ? "active" : "none"}`,
    `active_preset_name: ${settlement.activePresetName ?? "none"}`,
    `active_preset_scope: ${settlement.activePreset?.scope ?? "none"}`,
    `draft_scope: ${settlement.presetScopeInput}`,
    `draft_name_input: ${settlement.presetNameInput.trim() || "none"}`,
    `aging_row_count: ${settlement.agingRows.length}`,
    `cash_point_count: ${settlement.cashPoints.length}`,
    `exception_row_count: ${settlement.exceptionRows.length}`,
    `visible_preset_count: ${settlement.savedPresets.length}`,
    `visible_presets: ${visiblePresetLabels.length > 0 ? visiblePresetLabels.join("; ") : "none"}`,
  ];

  for (const [key, value] of filterEntries) {
    switch (key) {
      case "exceptionType":
        lines.push(`exception_type: ${value}`);
        break;
      default:
        lines.push(`${key}: ${value}`);
        break;
    }
  }

  return lines.join("\n");
}
