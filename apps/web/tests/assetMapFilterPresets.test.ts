import assert from "node:assert/strict";

import { afterEach, test } from "vitest";

import {
  clearAssetMapFilterPresets,
  getAssetMapFilterPresets,
  saveAssetMapFilterPreset,
} from "../src/shared/assetMapFilterPresets";

type LocalStorageMock = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const originalWindow = globalThis.window;

function installWindowWithStorage(initialEntries: Record<string, string> = {}) {
  const storage = new Map(Object.entries(initialEntries));
  const localStorage: LocalStorageMock = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      storage.set(key, value);
    },
    removeItem: (key) => {
      storage.delete(key);
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  });
}

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
  clearAssetMapFilterPresets();
});

test("asset map filter presets save and replace entries by name", () => {
  installWindowWithStorage();

  saveAssetMapFilterPreset({
    name: "Gulf Coast",
    savedAt: "2026-05-06T00:00:00Z",
    filters: {
      showUserLocation: true,
      showAssets: true,
      showRailRoutes: true,
      showWeather: false,
      showTooltips: true,
      weatherOverlayVisibility: {
        radar: true,
        precipitation: false,
        wind: false,
        temperature: false,
        humidity: false,
        pressure: false,
      },
      weatherOverlayOpacities: {
        radar: 0.64,
        precipitation: 0.72,
        wind: 0.72,
        temperature: 0.72,
        humidity: 0.72,
        pressure: 0.72,
      },
      assetActivityVisibility: {
        Positions: true,
        Shipments: true,
      },
      assetGeographyVisibility: {
        "North America": true,
      },
      selectedCountryCode: "US",
      selectedSubdivisionCode: "US-LA",
      assetSubtypeVisibility: {
        Pipeline: true,
      },
    },
  });
  saveAssetMapFilterPreset({
    name: "gulf coast",
    savedAt: "2026-05-06T01:00:00Z",
    filters: {
      showUserLocation: false,
      showAssets: true,
      showRailRoutes: false,
      showWeather: true,
      showTooltips: false,
      weatherOverlayVisibility: {
        radar: false,
        precipitation: false,
        wind: false,
        temperature: true,
        humidity: true,
        pressure: false,
      },
      weatherOverlayOpacities: {
        radar: 0.72,
        precipitation: 0.72,
        wind: 0.72,
        temperature: 0.83,
        humidity: 0.57,
        pressure: 0.72,
      },
      assetActivityVisibility: {
        Positions: false,
        Inventory: true,
      },
      assetGeographyVisibility: {
        "North America": true,
        EMEA: false,
      },
      selectedCountryCode: "",
      selectedSubdivisionCode: "",
      assetSubtypeVisibility: {
        Pipeline: false,
        Storage: true,
      },
    },
  });

  assert.deepEqual(getAssetMapFilterPresets(), [
    {
      name: "gulf coast",
      savedAt: "2026-05-06T01:00:00Z",
      filters: {
        showUserLocation: false,
        showAssets: true,
        showRailRoutes: false,
        showWeather: true,
        showTooltips: false,
        weatherOverlayVisibility: {
          radar: false,
          precipitation: false,
          wind: false,
          temperature: true,
          humidity: true,
          pressure: false,
        },
        weatherOverlayOpacities: {
          radar: 0.72,
          precipitation: 0.72,
          wind: 0.72,
          temperature: 0.83,
          humidity: 0.57,
          pressure: 0.72,
        },
        assetActivityVisibility: {
          Positions: false,
          Inventory: true,
        },
        assetGeographyVisibility: {
          "North America": true,
          EMEA: false,
        },
        selectedCountryCode: "",
        selectedSubdivisionCode: "",
        assetSubtypeVisibility: {
          Pipeline: false,
          Storage: true,
        },
      },
    },
  ]);
});

test("asset map filter presets backfill overlay defaults for legacy saved entries", () => {
  installWindowWithStorage({
    "ectrm.asset-map-filter-presets.v1": JSON.stringify([
      {
        name: "Legacy preset",
        savedAt: "2026-05-06T02:00:00Z",
        filters: {
          showUserLocation: true,
          showAssets: false,
          showWeather: true,
          showTooltips: true,
          assetActivityVisibility: {
            Positions: true,
          },
          assetGeographyVisibility: {
            "North America": true,
          },
          selectedCountryCode: "US",
          selectedSubdivisionCode: "US-TX",
          assetSubtypeVisibility: {
            Pipeline: true,
          },
        },
      },
    ]),
  });

  assert.deepEqual(getAssetMapFilterPresets(), [
    {
      name: "Legacy preset",
      savedAt: "2026-05-06T02:00:00Z",
      filters: {
        showUserLocation: true,
        showAssets: false,
        showRailRoutes: true,
        showWeather: true,
        showTooltips: true,
        weatherOverlayVisibility: {
          radar: false,
          precipitation: false,
          wind: false,
          temperature: false,
          humidity: false,
          pressure: false,
        },
        weatherOverlayOpacities: {
          radar: 0.72,
          precipitation: 0.72,
          wind: 0.72,
          temperature: 0.72,
          humidity: 0.72,
          pressure: 0.72,
        },
        assetActivityVisibility: {
          Positions: true,
        },
        assetGeographyVisibility: {
          "North America": true,
        },
        selectedCountryCode: "US",
        selectedSubdivisionCode: "US-TX",
        assetSubtypeVisibility: {
          Pipeline: true,
        },
      },
    },
  ]);
});

test("asset map filter presets migrate legacy single-overlay selections into multi-overlay state", () => {
  installWindowWithStorage({
    "ectrm.asset-map-filter-presets.v1": JSON.stringify([
      {
        name: "Legacy radar",
        savedAt: "2026-05-06T03:00:00Z",
        filters: {
          showUserLocation: true,
          showAssets: true,
          showWeather: true,
          showTooltips: true,
          weatherOverlayMode: "radar",
          weatherOverlayOpacity: 0.61,
          assetActivityVisibility: {},
          assetGeographyVisibility: {},
          selectedCountryCode: "",
          selectedSubdivisionCode: "",
          assetSubtypeVisibility: {},
        },
      },
    ]),
  });

  assert.deepEqual(getAssetMapFilterPresets(), [
    {
      name: "Legacy radar",
      savedAt: "2026-05-06T03:00:00Z",
      filters: {
        showUserLocation: true,
        showAssets: true,
        showRailRoutes: true,
        showWeather: true,
        showTooltips: true,
        weatherOverlayVisibility: {
          radar: true,
          precipitation: false,
          wind: false,
          temperature: false,
          humidity: false,
          pressure: false,
        },
        weatherOverlayOpacities: {
          radar: 0.61,
          precipitation: 0.72,
          wind: 0.72,
          temperature: 0.72,
          humidity: 0.72,
          pressure: 0.72,
        },
        assetActivityVisibility: {},
        assetGeographyVisibility: {},
        selectedCountryCode: "",
        selectedSubdivisionCode: "",
        assetSubtypeVisibility: {},
      },
    },
  ]);
});
