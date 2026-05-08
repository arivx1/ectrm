import type { ExpressionSpecification } from "maplibre-gl";
import type {
  WeatherForecastPeriodRecord,
  WeatherLocationRecord,
  WeatherObservationRecord,
} from "../../shared/models";

export type WeatherOverlayMode =
  | "none"
  | "radar"
  | "precipitation"
  | "wind"
  | "temperature"
  | "humidity"
  | "pressure";

export type SelectableWeatherOverlayMode = Exclude<WeatherOverlayMode, "none">;

export type WeatherOverlayVisibilityState = Record<
  SelectableWeatherOverlayMode,
  boolean
>;

export type WeatherOverlayOpacityState = Record<
  SelectableWeatherOverlayMode,
  number
>;

export type WeatherOverlayLegendConfig = {
  gradient: string;
  minLabel: string;
  maxLabel: string;
  summaryLabel: string;
};

export type WeatherOverlayPointRecord = {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  observedAt: string | null;
  forecastStartAt: string | null;
  forecastEndAt: string | null;
  temperatureF: number | null;
  precipitationProbabilityPct: number | null;
  windSpeedMph: number | null;
  windDirectionDegrees: number | null;
  relativeHumidityPct: number | null;
  pressureMb: number | null;
};

type GeoJsonFeature = {
  type: "Feature";
  geometry:
    | {
        type: "Point";
        coordinates: [number, number];
      }
    | {
        type: "LineString";
        coordinates: [number, number][];
      };
  properties: Record<string, string | number | boolean | null>;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

type ScalarOverlayStyleConfig = {
  summaryLabel: string;
  minLabel: string;
  maxLabel: string;
  gradient: string;
  circleColorExpression: ExpressionSpecification;
  glowColorExpression: ExpressionSpecification;
};

type OverlayDataFetchResult = {
  location: WeatherLocationRecord;
  observation: WeatherObservationRecord | null;
  forecast: WeatherForecastPeriodRecord | null;
};

export const DEFAULT_WEATHER_OVERLAY_OPACITY = 0.72;

export const SELECTABLE_WEATHER_OVERLAY_MODES: SelectableWeatherOverlayMode[] =
  [
    "radar",
    "precipitation",
    "wind",
    "temperature",
    "humidity",
    "pressure",
  ];

const WEATHER_OVERLAY_STYLE_BY_MODE: Record<
  Exclude<WeatherOverlayMode, "none" | "radar" | "wind">,
  ScalarOverlayStyleConfig
> = {
  precipitation: {
    summaryLabel: "Next forecast precip chance",
    minLabel: "0%",
    maxLabel: "100%",
    gradient:
      "linear-gradient(90deg, #edf6ff 0%, #a9d7ff 20%, #68b1ff 40%, #2f7ef7 60%, #4c52d7 80%, #7c2d92 100%)",
    circleColorExpression: [
      "interpolate",
      ["linear"],
      ["get", "overlayValue"],
      0,
      "#edf6ff",
      20,
      "#a9d7ff",
      40,
      "#68b1ff",
      60,
      "#2f7ef7",
      80,
      "#4c52d7",
      100,
      "#7c2d92",
    ],
    glowColorExpression: [
      "interpolate",
      ["linear"],
      ["get", "overlayValue"],
      0,
      "#dbeafe",
      20,
      "#93c5fd",
      40,
      "#60a5fa",
      60,
      "#2563eb",
      80,
      "#4338ca",
      100,
      "#6b21a8",
    ],
  },
  temperature: {
    summaryLabel: "Observed or next forecast temperature",
    minLabel: "-20F",
    maxLabel: "110F",
    gradient:
      "linear-gradient(90deg, #53257f 0%, #2f66ff 18%, #39b6ff 34%, #7de184 50%, #f3ef74 68%, #f6a04d 84%, #d73d2f 100%)",
    circleColorExpression: [
      "interpolate",
      ["linear"],
      ["get", "overlayValue"],
      -20,
      "#53257f",
      0,
      "#2f66ff",
      32,
      "#39b6ff",
      50,
      "#7de184",
      68,
      "#f3ef74",
      86,
      "#f6a04d",
      110,
      "#d73d2f",
    ],
    glowColorExpression: [
      "interpolate",
      ["linear"],
      ["get", "overlayValue"],
      -20,
      "#4c1d95",
      0,
      "#1d4ed8",
      32,
      "#0ea5e9",
      50,
      "#22c55e",
      68,
      "#eab308",
      86,
      "#f97316",
      110,
      "#dc2626",
    ],
  },
  humidity: {
    summaryLabel: "Observed or next forecast humidity",
    minLabel: "0%",
    maxLabel: "100%",
    gradient:
      "linear-gradient(90deg, #b46d2d 0%, #e3c47b 18%, #f5efbd 34%, #b7ecdc 50%, #6ccfd4 68%, #3386c7 84%, #21478b 100%)",
    circleColorExpression: [
      "interpolate",
      ["linear"],
      ["get", "overlayValue"],
      0,
      "#b46d2d",
      20,
      "#e3c47b",
      40,
      "#f5efbd",
      60,
      "#b7ecdc",
      80,
      "#6ccfd4",
      100,
      "#21478b",
    ],
    glowColorExpression: [
      "interpolate",
      ["linear"],
      ["get", "overlayValue"],
      0,
      "#92400e",
      20,
      "#d97706",
      40,
      "#facc15",
      60,
      "#5eead4",
      80,
      "#06b6d4",
      100,
      "#1d4ed8",
    ],
  },
  pressure: {
    summaryLabel: "Observed barometric pressure",
    minLabel: "980 mb",
    maxLabel: "1040 mb",
    gradient:
      "linear-gradient(90deg, #264c9e 0%, #5ca7df 20%, #d8f2ff 40%, #f6f2ea 56%, #efc7af 76%, #cf785c 100%)",
    circleColorExpression: [
      "interpolate",
      ["linear"],
      ["get", "overlayValue"],
      980,
      "#264c9e",
      995,
      "#5ca7df",
      1010,
      "#d8f2ff",
      1025,
      "#efc7af",
      1040,
      "#cf785c",
    ],
    glowColorExpression: [
      "interpolate",
      ["linear"],
      ["get", "overlayValue"],
      980,
      "#1d4ed8",
      995,
      "#38bdf8",
      1010,
      "#e0f2fe",
      1025,
      "#fdba74",
      1040,
      "#c2410c",
    ],
  },
};

const COMPASS_DIRECTIONS: Record<string, number> = {
  N: 0,
  NNE: 22.5,
  NE: 45,
  ENE: 67.5,
  E: 90,
  ESE: 112.5,
  SE: 135,
  SSE: 157.5,
  S: 180,
  SSW: 202.5,
  SW: 225,
  WSW: 247.5,
  W: 270,
  WNW: 292.5,
  NW: 315,
  NNW: 337.5,
};

export const WEATHER_OVERLAY_OPTIONS: Array<{
  value: WeatherOverlayMode;
  label: string;
}> = [
  { value: "none", label: "None" },
  { value: "radar", label: "Radar" },
  { value: "precipitation", label: "Precipitation" },
  { value: "wind", label: "Wind" },
  { value: "temperature", label: "Temperature" },
  { value: "humidity", label: "Humidity" },
  { value: "pressure", label: "Pressure" },
];

export function createDefaultWeatherOverlayVisibilityState(): WeatherOverlayVisibilityState {
  return {
    radar: false,
    precipitation: false,
    wind: false,
    temperature: false,
    humidity: false,
    pressure: false,
  };
}

export function createDefaultWeatherOverlayOpacityState(): WeatherOverlayOpacityState {
  return {
    radar: DEFAULT_WEATHER_OVERLAY_OPACITY,
    precipitation: DEFAULT_WEATHER_OVERLAY_OPACITY,
    wind: DEFAULT_WEATHER_OVERLAY_OPACITY,
    temperature: DEFAULT_WEATHER_OVERLAY_OPACITY,
    humidity: DEFAULT_WEATHER_OVERLAY_OPACITY,
    pressure: DEFAULT_WEATHER_OVERLAY_OPACITY,
  };
}

export async function loadWeatherOverlayPointRecord(
  fetcher: (locationCode: string) => Promise<OverlayDataFetchResult>,
  location: WeatherLocationRecord,
): Promise<WeatherOverlayPointRecord | null> {
  const result = await fetcher(location.code);
  return buildWeatherOverlayPointRecord(result.location, {
    observation: result.observation,
    forecast: result.forecast,
  });
}

export function buildWeatherOverlayPointRecord(
  location: WeatherLocationRecord,
  data: {
    observation?: WeatherObservationRecord | null;
    forecast?: WeatherForecastPeriodRecord | null;
  },
): WeatherOverlayPointRecord | null {
  const observation = data.observation ?? null;
  const forecast = data.forecast ?? null;

  const temperatureF =
    fahrenheitFromCelsius(observation?.temperature_celsius) ??
    temperatureFromForecast(forecast);
  const precipitationProbabilityPct =
    finiteNumberOrNull(forecast?.probability_of_precipitation_pct) ?? null;
  const windSpeedMph =
    milesPerHourFromKilometers(observation?.wind_speed_kmh) ??
    parseWindSpeedMph(forecast?.wind_speed);
  const windDirectionDegrees =
    finiteNumberOrNull(observation?.wind_direction_degrees) ??
    parseWindDirectionDegrees(forecast?.wind_direction);
  const relativeHumidityPct =
    finiteNumberOrNull(observation?.relative_humidity_pct) ??
    finiteNumberOrNull(forecast?.relative_humidity_pct);
  const pressureMb = millibarsFromPascals(observation?.barometric_pressure_pa);

  if (
    temperatureF === null &&
    precipitationProbabilityPct === null &&
    windSpeedMph === null &&
    relativeHumidityPct === null &&
    pressureMb === null
  ) {
    return null;
  }

  return {
    code: location.code,
    name: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    observedAt: observation?.observed_at ?? null,
    forecastStartAt: forecast?.start_at ?? null,
    forecastEndAt: forecast?.end_at ?? null,
    temperatureF,
    precipitationProbabilityPct,
    windSpeedMph,
    windDirectionDegrees,
    relativeHumidityPct,
    pressureMb,
  };
}

export function buildWeatherOverlayPointFeatureCollection(
  points: WeatherOverlayPointRecord[],
  mode: Exclude<WeatherOverlayMode, "none" | "radar">,
): GeoJsonFeatureCollection {
  const features: GeoJsonFeature[] = [];

  points.forEach((point) => {
    const value = overlayValueForMode(mode, point);
    if (value === null) {
      return;
    }

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [point.longitude, point.latitude],
      },
      properties: {
        code: point.code,
        name: point.name,
        overlayMode: mode,
        overlayValue: roundOverlayValue(value),
        overlayLabel: formatWeatherOverlayValue(mode, value),
        windDirectionDegrees:
          mode === "wind" ? point.windDirectionDegrees ?? null : null,
      },
    });
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

export function buildWeatherOverlayWindVectorFeatureCollection(
  points: WeatherOverlayPointRecord[],
): GeoJsonFeatureCollection {
  const features: GeoJsonFeature[] = [];

  points.forEach((point) => {
    if (
      point.windSpeedMph === null ||
      point.windDirectionDegrees === null ||
      point.windSpeedMph <= 0
    ) {
      return;
    }

    const lineCoordinates = buildWindVectorCoordinates(
      point.latitude,
      point.longitude,
      point.windDirectionDegrees,
      point.windSpeedMph,
    );

    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: lineCoordinates,
      },
      properties: {
        code: point.code,
        name: point.name,
        overlayValue: roundOverlayValue(point.windSpeedMph),
        overlayLabel: formatWeatherOverlayValue("wind", point.windSpeedMph),
      },
    });
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

export function getWeatherOverlayLegendConfig(
  mode: WeatherOverlayMode,
): WeatherOverlayLegendConfig | null {
  if (mode === "none" || mode === "radar") {
    return null;
  }

  if (mode === "wind") {
    return {
      summaryLabel: "Observed or next forecast wind speed",
      minLabel: "0 mph",
      maxLabel: "60 mph",
      gradient:
        "linear-gradient(90deg, #d8f6f2 0%, #8ae3d1 20%, #47c3be 40%, #3981d8 64%, #6550c8 82%, #7c2d92 100%)",
    };
  }

  return WEATHER_OVERLAY_STYLE_BY_MODE[mode];
}

export function getWeatherOverlayColorExpression(
  mode: Exclude<WeatherOverlayMode, "none" | "radar">,
): {
  circleColor: ExpressionSpecification;
  glowColor: ExpressionSpecification;
} {
  if (mode === "wind") {
    return {
      circleColor: [
        "interpolate",
        ["linear"],
        ["get", "overlayValue"],
        0,
        "#d8f6f2",
        5,
        "#8ae3d1",
        10,
        "#47c3be",
        20,
        "#3981d8",
        35,
        "#6550c8",
        60,
        "#7c2d92",
      ],
      glowColor: [
        "interpolate",
        ["linear"],
        ["get", "overlayValue"],
        0,
        "#99f6e4",
        5,
        "#5eead4",
        10,
        "#2dd4bf",
        20,
        "#2563eb",
        35,
        "#4f46e5",
        60,
        "#6b21a8",
      ],
    };
  }

  const config = WEATHER_OVERLAY_STYLE_BY_MODE[mode];
  return {
    circleColor: config.circleColorExpression,
    glowColor: config.glowColorExpression,
  };
}

export function describeWeatherOverlayMode(mode: WeatherOverlayMode): string {
  switch (mode) {
    case "none":
      return "Weather markers only";
    case "radar":
      return "Live NOAA radar reflectivity";
    case "precipitation":
      return "Forecast precipitation probability";
    case "wind":
      return "Observed or forecast wind speed and direction";
    case "temperature":
      return "Observed or forecast temperature";
    case "humidity":
      return "Observed or forecast humidity";
    case "pressure":
      return "Observed barometric pressure";
    default:
      return "Weather overlay";
  }
}

export function overlayValueForMode(
  mode: Exclude<WeatherOverlayMode, "none" | "radar">,
  point: WeatherOverlayPointRecord,
): number | null {
  switch (mode) {
    case "precipitation":
      return point.precipitationProbabilityPct;
    case "wind":
      return point.windSpeedMph;
    case "temperature":
      return point.temperatureF;
    case "humidity":
      return point.relativeHumidityPct;
    case "pressure":
      return point.pressureMb;
    default:
      return null;
  }
}

export function formatWeatherOverlayValue(
  mode: Exclude<WeatherOverlayMode, "none" | "radar">,
  value: number,
): string {
  switch (mode) {
    case "precipitation":
      return `${Math.round(value)}%`;
    case "wind":
      return `${Math.round(value)} mph`;
    case "temperature":
      return `${Math.round(value)}F`;
    case "humidity":
      return `${Math.round(value)}%`;
    case "pressure":
      return `${Math.round(value)} mb`;
    default:
      return `${Math.round(value)}`;
  }
}

export function fahrenheitFromCelsius(
  value: number | null | undefined,
): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  return ((value as number) * 9) / 5 + 32;
}

export function millibarsFromPascals(
  value: number | null | undefined,
): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  return (value as number) / 100;
}

export function milesPerHourFromKilometers(
  value: number | null | undefined,
): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  return (value as number) * 0.621371;
}

export function parseWindSpeedMph(
  value: string | null | undefined,
): number | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }
  if (/^calm$/i.test(normalizedValue)) {
    return 0;
  }

  const numericParts = normalizedValue.match(/-?\d+(?:\.\d+)?/g);
  if (!numericParts || numericParts.length === 0) {
    return null;
  }

  const rawNumbers = numericParts
    .map((part) => Number.parseFloat(part))
    .filter((candidate) => Number.isFinite(candidate));
  if (rawNumbers.length === 0) {
    return null;
  }

  const averageValue =
    rawNumbers.reduce((sum, candidate) => sum + candidate, 0) /
    rawNumbers.length;
  const lowercaseValue = normalizedValue.toLowerCase();

  if (lowercaseValue.includes("km/h") || lowercaseValue.includes("kph")) {
    return averageValue * 0.621371;
  }
  if (lowercaseValue.includes("m/s")) {
    return averageValue * 2.23694;
  }
  if (lowercaseValue.includes("kt")) {
    return averageValue * 1.15078;
  }

  return averageValue;
}

export function parseWindDirectionDegrees(
  value: string | null | undefined,
): number | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim().toUpperCase();
  if (!normalizedValue) {
    return null;
  }
  if (normalizedValue === "CALM" || normalizedValue === "VARIABLE") {
    return null;
  }

  return COMPASS_DIRECTIONS[normalizedValue] ?? null;
}

function temperatureFromForecast(
  forecast: WeatherForecastPeriodRecord | null,
): number | null {
  if (!forecast || !Number.isFinite(forecast.temperature)) {
    return null;
  }

  const unit = (forecast.temperature_unit ?? "F").trim().toUpperCase();
  if (unit === "C") {
    return fahrenheitFromCelsius(forecast.temperature);
  }
  return forecast.temperature as number;
}

function buildWindVectorCoordinates(
  latitude: number,
  longitude: number,
  windDirectionDegrees: number,
  windSpeedMph: number,
): [number, number][] {
  const directionTowardDegrees = (windDirectionDegrees + 180) % 360;
  const directionRadians = (directionTowardDegrees * Math.PI) / 180;
  const vectorLengthMiles = Math.max(24, Math.min(windSpeedMph * 4.8, 120));
  const latitudeOffset = (Math.cos(directionRadians) * vectorLengthMiles) / 69;
  const longitudeOffset =
    (Math.sin(directionRadians) * vectorLengthMiles) /
    Math.max(69 * Math.cos((latitude * Math.PI) / 180), 1e-6);

  return [
    [longitude, latitude],
    [longitude + longitudeOffset, latitude + latitudeOffset],
  ];
}

function finiteNumberOrNull(
  value: number | null | undefined,
): number | null {
  return Number.isFinite(value) ? (value as number) : null;
}

function roundOverlayValue(value: number): number {
  return Math.round(value * 10) / 10;
}
