import {
  createDefaultWeatherOverlayOpacityState,
  createDefaultWeatherOverlayVisibilityState,
  DEFAULT_WEATHER_OVERLAY_OPACITY,
  SELECTABLE_WEATHER_OVERLAY_MODES,
  type SelectableWeatherOverlayMode,
  type WeatherOverlayOpacityState,
  type WeatherOverlayVisibilityState,
} from "../entities/weather/mapOverlay";

const ASSET_MAP_FILTER_PRESET_STORAGE_KEY = "ectrm.asset-map-filter-presets.v1";

export type AssetMapFilterPresetRecord = {
  name: string;
  savedAt: string;
  filters: {
    showUserLocation: boolean;
    showAssets: boolean;
    showRailRoutes: boolean;
    showVessels: boolean;
    showWeather: boolean;
    showTooltips: boolean;
    weatherOverlayVisibility: WeatherOverlayVisibilityState;
    weatherOverlayOpacities: WeatherOverlayOpacityState;
    assetActivityVisibility: Record<string, boolean>;
    assetGeographyVisibility: Record<string, boolean>;
    selectedCountryCode: string;
    selectedSubdivisionCode: string;
    assetSubtypeVisibility: Record<string, boolean>;
  };
};

function normalizeBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] =>
        typeof entry[0] === "string" && typeof entry[1] === "boolean",
    ),
  );
}

function normalizeAssetMapFilterPresetRecord(
  value: unknown,
): AssetMapFilterPresetRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as {
    name?: unknown;
    savedAt?: unknown;
    filters?: {
      showUserLocation?: unknown;
      showAssets?: unknown;
      showRailRoutes?: unknown;
      showVessels?: unknown;
      showWeather?: unknown;
      showTooltips?: unknown;
      weatherOverlayMode?: unknown;
      weatherOverlayOpacity?: unknown;
      weatherOverlayVisibility?: unknown;
      weatherOverlayOpacities?: unknown;
      assetActivityVisibility?: unknown;
      assetGeographyVisibility?: unknown;
      selectedCountryCode?: unknown;
      selectedSubdivisionCode?: unknown;
      assetSubtypeVisibility?: unknown;
    };
  };

  const presetName =
    typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (!presetName) {
    return null;
  }

  return {
    name: presetName,
    savedAt:
      typeof candidate.savedAt === "string" && candidate.savedAt.trim()
        ? candidate.savedAt
        : new Date(0).toISOString(),
    filters: {
      showUserLocation: candidate.filters?.showUserLocation !== false,
      showAssets: candidate.filters?.showAssets !== false,
      showRailRoutes: candidate.filters?.showRailRoutes !== false,
      showVessels: candidate.filters?.showVessels !== false,
      showWeather: candidate.filters?.showWeather !== false,
      showTooltips: candidate.filters?.showTooltips !== false,
      weatherOverlayVisibility: normalizeWeatherOverlayVisibility(
        candidate.filters?.weatherOverlayVisibility,
        candidate.filters?.weatherOverlayMode,
      ),
      weatherOverlayOpacities: normalizeWeatherOverlayOpacities(
        candidate.filters?.weatherOverlayOpacities,
        candidate.filters?.weatherOverlayMode,
        candidate.filters?.weatherOverlayOpacity,
      ),
      assetActivityVisibility: normalizeBooleanRecord(
        candidate.filters?.assetActivityVisibility,
      ),
      assetGeographyVisibility: normalizeBooleanRecord(
        candidate.filters?.assetGeographyVisibility,
      ),
      selectedCountryCode:
        typeof candidate.filters?.selectedCountryCode === "string"
          ? candidate.filters.selectedCountryCode
          : "",
      selectedSubdivisionCode:
        typeof candidate.filters?.selectedSubdivisionCode === "string"
          ? candidate.filters.selectedSubdivisionCode
          : "",
      assetSubtypeVisibility: normalizeBooleanRecord(
        candidate.filters?.assetSubtypeVisibility,
      ),
    },
  };
}

function normalizeLegacyWeatherOverlayMode(
  value: unknown,
): SelectableWeatherOverlayMode | null {
  switch (value) {
    case "radar":
    case "precipitation":
    case "wind":
    case "temperature":
    case "humidity":
    case "pressure":
      return value;
    default:
      return null;
  }
}

function normalizeWeatherOverlayOpacityValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_WEATHER_OVERLAY_OPACITY;
  }

  return Math.max(0.2, Math.min(value, 1));
}

function normalizeWeatherOverlayVisibility(
  value: unknown,
  legacyMode: unknown,
): WeatherOverlayVisibilityState {
  const nextState = createDefaultWeatherOverlayVisibilityState();

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;
    SELECTABLE_WEATHER_OVERLAY_MODES.forEach((mode) => {
      nextState[mode] = candidate[mode] === true;
    });
    return nextState;
  }

  const normalizedLegacyMode = normalizeLegacyWeatherOverlayMode(legacyMode);
  if (normalizedLegacyMode) {
    nextState[normalizedLegacyMode] = true;
  }
  return nextState;
}

function normalizeWeatherOverlayOpacities(
  value: unknown,
  legacyMode: unknown,
  legacyOpacity: unknown,
): WeatherOverlayOpacityState {
  const nextState = createDefaultWeatherOverlayOpacityState();

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;
    SELECTABLE_WEATHER_OVERLAY_MODES.forEach((mode) => {
      nextState[mode] = normalizeWeatherOverlayOpacityValue(candidate[mode]);
    });
    return nextState;
  }

  const normalizedLegacyMode = normalizeLegacyWeatherOverlayMode(legacyMode);
  if (normalizedLegacyMode) {
    nextState[normalizedLegacyMode] =
      normalizeWeatherOverlayOpacityValue(legacyOpacity);
  }

  return nextState;
}

function normalizeAssetMapFilterPresetCollection(
  value: unknown,
): AssetMapFilterPresetRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeAssetMapFilterPresetRecord(entry))
    .filter((entry): entry is AssetMapFilterPresetRecord => entry !== null)
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

export function getAssetMapFilterPresetStorageKey(): string {
  return ASSET_MAP_FILTER_PRESET_STORAGE_KEY;
}

export function getAssetMapFilterPresets(): AssetMapFilterPresetRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  const storedValue = window.localStorage.getItem(
    ASSET_MAP_FILTER_PRESET_STORAGE_KEY,
  );
  if (!storedValue) {
    return [];
  }

  try {
    return normalizeAssetMapFilterPresetCollection(JSON.parse(storedValue));
  } catch {
    return [];
  }
}

export function saveAssetMapFilterPreset(
  preset: AssetMapFilterPresetRecord,
): AssetMapFilterPresetRecord[] {
  const normalizedPreset = normalizeAssetMapFilterPresetRecord(preset);
  if (!normalizedPreset) {
    return getAssetMapFilterPresets();
  }

  const nextPresets = [
    normalizedPreset,
    ...getAssetMapFilterPresets().filter(
      (entry) =>
        entry.name.toLowerCase() !== normalizedPreset.name.toLowerCase(),
    ),
  ].sort((left, right) => right.savedAt.localeCompare(left.savedAt));

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      ASSET_MAP_FILTER_PRESET_STORAGE_KEY,
      JSON.stringify(nextPresets),
    );
  }

  return nextPresets;
}

export function clearAssetMapFilterPresets(): AssetMapFilterPresetRecord[] {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ASSET_MAP_FILTER_PRESET_STORAGE_KEY);
  }

  return [];
}
