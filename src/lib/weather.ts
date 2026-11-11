// Weather desk data layer. Deliberately free of React and `server-only` so the
// mapping stays testable in Node and the client component can share it.
// Coordinates never leave the browser: the page talks to Open-Meteo directly.

export type WeatherIcon =
  "sun" | "moon" | "cloud" | "rain" | "snow" | "storm" | "fog";

export type WeatherTone = "clear" | "cloud" | "rain" | "snow" | "storm" | "fog";

export type WeatherDescription = {
  labelZh: string;
  labelEn: string;
  handNote: string;
  icon: WeatherIcon;
  tone: WeatherTone;
};

export type WeatherReading = WeatherDescription & {
  temperature: number;
  apparent: number;
  code: number;
  isDay: boolean;
  time: string;
  timezone: string;
};

export const WEATHER_PLACE_KEY = "alps-weather-place";
export const WEATHER_ASKED_KEY = "alps-weather-asked";
export const WEATHER_PLACE_TTL_MS = 6 * 60 * 60 * 1000;
export const WEATHER_TIMEOUT_MS = 4_000;

const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

type CodeEntry = Omit<WeatherDescription, "icon" | "tone"> & {
  icon: WeatherIcon;
  tone: WeatherTone;
};

// WMO 4677 weather codes returned by Open-Meteo. Unknown codes fall back to a
// neutral cloud description rather than breaking the module.
const WEATHER_CODES: Record<number, CodeEntry> = {
  0: {
    labelZh: "晴",
    labelEn: "CLEAR",
    handNote: "a wide open sky.",
    icon: "sun",
    tone: "clear",
  },
  1: {
    labelZh: "大致晴朗",
    labelEn: "MAINLY CLEAR",
    handNote: "almost clear.",
    icon: "sun",
    tone: "clear",
  },
  2: {
    labelZh: "多云",
    labelEn: "PARTLY CLOUDY",
    handNote: "a little cloudy.",
    icon: "cloud",
    tone: "cloud",
  },
  3: {
    labelZh: "阴",
    labelEn: "OVERCAST",
    handNote: "all grey.",
    icon: "cloud",
    tone: "cloud",
  },
  45: {
    labelZh: "雾",
    labelEn: "FOG",
    handNote: "fog in the margins.",
    icon: "fog",
    tone: "fog",
  },
  48: {
    labelZh: "冻雾",
    labelEn: "RIME FOG",
    handNote: "everything softened.",
    icon: "fog",
    tone: "fog",
  },
  51: {
    labelZh: "小毛毛雨",
    labelEn: "LIGHT DRIZZLE",
    handNote: "a fine drizzle.",
    icon: "rain",
    tone: "rain",
  },
  53: {
    labelZh: "毛毛雨",
    labelEn: "DRIZZLE",
    handNote: "a fine drizzle.",
    icon: "rain",
    tone: "rain",
  },
  55: {
    labelZh: "浓毛毛雨",
    labelEn: "DENSE DRIZZLE",
    handNote: "the air is wet.",
    icon: "rain",
    tone: "rain",
  },
  56: {
    labelZh: "冻毛毛雨",
    labelEn: "FREEZING DRIZZLE",
    handNote: "cold in the air.",
    icon: "rain",
    tone: "rain",
  },
  57: {
    labelZh: "浓冻毛毛雨",
    labelEn: "DENSE FREEZING DRIZZLE",
    handNote: "cold and wet.",
    icon: "rain",
    tone: "rain",
  },
  61: {
    labelZh: "小雨",
    labelEn: "LIGHT RAIN",
    handNote: "a little rain.",
    icon: "rain",
    tone: "rain",
  },
  63: {
    labelZh: "中雨",
    labelEn: "RAIN",
    handNote: "bring an umbrella.",
    icon: "rain",
    tone: "rain",
  },
  65: {
    labelZh: "大雨",
    labelEn: "HEAVY RAIN",
    handNote: "stay inside.",
    icon: "rain",
    tone: "rain",
  },
  66: {
    labelZh: "冻雨",
    labelEn: "FREEZING RAIN",
    handNote: "watch your step.",
    icon: "rain",
    tone: "rain",
  },
  67: {
    labelZh: "强冻雨",
    labelEn: "HEAVY FREEZING RAIN",
    handNote: "everything is glass.",
    icon: "rain",
    tone: "rain",
  },
  71: {
    labelZh: "小雪",
    labelEn: "LIGHT SNOW",
    handNote: "a quiet snow.",
    icon: "snow",
    tone: "snow",
  },
  73: {
    labelZh: "中雪",
    labelEn: "SNOW",
    handNote: "a quiet snow.",
    icon: "snow",
    tone: "snow",
  },
  75: {
    labelZh: "大雪",
    labelEn: "HEAVY SNOW",
    handNote: "let it pile up.",
    icon: "snow",
    tone: "snow",
  },
  77: {
    labelZh: "米雪",
    labelEn: "SNOW GRAINS",
    handNote: "tiny ice, falling.",
    icon: "snow",
    tone: "snow",
  },
  80: {
    labelZh: "小阵雨",
    labelEn: "LIGHT SHOWERS",
    handNote: "passing showers.",
    icon: "rain",
    tone: "rain",
  },
  81: {
    labelZh: "中阵雨",
    labelEn: "SHOWERS",
    handNote: "passing showers.",
    icon: "rain",
    tone: "rain",
  },
  82: {
    labelZh: "大阵雨",
    labelEn: "VIOLENT SHOWERS",
    handNote: "here and gone.",
    icon: "rain",
    tone: "rain",
  },
  85: {
    labelZh: "小阵雪",
    labelEn: "LIGHT SNOW SHOWERS",
    handNote: "snow, in passing.",
    icon: "snow",
    tone: "snow",
  },
  86: {
    labelZh: "大阵雪",
    labelEn: "HEAVY SNOW SHOWERS",
    handNote: "snow, in passing.",
    icon: "snow",
    tone: "snow",
  },
  95: {
    labelZh: "雷暴",
    labelEn: "THUNDERSTORM",
    handNote: "a storm, briefly.",
    icon: "storm",
    tone: "storm",
  },
  96: {
    labelZh: "雷暴伴小冰雹",
    labelEn: "THUNDERSTORM WITH HAIL",
    handNote: "hail in the air.",
    icon: "storm",
    tone: "storm",
  },
  99: {
    labelZh: "雷暴伴大冰雹",
    labelEn: "HEAVY THUNDERSTORM",
    handNote: "hail in the air.",
    icon: "storm",
    tone: "storm",
  },
};

const FALLBACK_DESCRIPTION: WeatherDescription = {
  labelZh: "天气",
  labelEn: "WEATHER",
  handNote: "the sky, as is.",
  icon: "cloud",
  tone: "cloud",
};

export function describeWeather(
  code: number,
  isDay: boolean,
): WeatherDescription {
  const entry = WEATHER_CODES[code];
  if (!entry) return FALLBACK_DESCRIPTION;
  // Clear and mainly-clear skies have a night glyph; the copy stays the same.
  const icon = entry.icon === "sun" && !isDay ? ("moon" as const) : entry.icon;
  return {
    labelZh: entry.labelZh,
    labelEn: entry.labelEn,
    handNote: entry.handNote,
    icon,
    tone: entry.tone,
  };
}

export function isSupportedWeatherCode(code: number): boolean {
  return Object.hasOwn(WEATHER_CODES, code);
}

export function isValidCoordinate(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

// Two decimals keeps roughly a kilometre of precision: enough for weather,
// deliberately not enough to store a street address.
export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildWeatherUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(roundCoordinate(lat)),
    longitude: String(roundCoordinate(lon)),
    current: "temperature_2m,weather_code,is_day,apparent_temperature",
    timezone: "auto",
  });
  return `${WEATHER_ENDPOINT}?${params.toString()}`;
}

export function parseWeatherResponse(value: unknown): WeatherReading | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const current = record.current;
  if (!current || typeof current !== "object") return null;
  const reading = current as Record<string, unknown>;

  const temperature = reading.temperature_2m;
  const code = reading.weather_code;
  const isDay = reading.is_day;
  if (typeof temperature !== "number" || !Number.isFinite(temperature))
    return null;
  if (
    typeof code !== "number" ||
    !Number.isInteger(code) ||
    code < 0 ||
    code > 99
  )
    return null;
  if (isDay !== 0 && isDay !== 1) return null;

  const apparent =
    typeof reading.apparent_temperature === "number" &&
    Number.isFinite(reading.apparent_temperature)
      ? reading.apparent_temperature
      : temperature;

  return {
    temperature: Math.round(temperature),
    apparent: Math.round(apparent),
    code,
    isDay: isDay === 1,
    time: typeof reading.time === "string" ? reading.time : "",
    timezone: typeof record.timezone === "string" ? record.timezone : "",
    ...describeWeather(code, isDay === 1),
  };
}

export async function fetchWeather(
  lat: number,
  lon: number,
  fetchImpl: typeof fetch = fetch,
): Promise<WeatherReading | null> {
  if (!isValidCoordinate(lat, lon)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
  try {
    const response = await fetchImpl(buildWeatherUrl(lat, lon), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return parseWeatherResponse(await response.json());
  } catch {
    // Network failure, timeout and malformed JSON all degrade to the same
    // quiet state: the desk shows its invitation instead of an error.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function formatPlaceLabel(timezone: string): string {
  const parts = timezone
    .trim()
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/_/g, " ").toUpperCase());
  return parts.length ? parts.join(" / ") : "YOUR SKY";
}

export type TemperatureParts = {
  sign: string;
  digits: number[];
  text: string;
};

export function splitTemperature(value: number): TemperatureParts {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "−" : "";
  const digits = String(Math.abs(rounded))
    .split("")
    .map((digit) => Number(digit));
  return { sign, digits, text: `${sign}${Math.abs(rounded)}` };
}

export type SavedPlace = {
  lat: number;
  lon: number;
  savedAt: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage) return storage;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readSavedPlace(
  storage?: StorageLike | null,
  now = Date.now(),
): SavedPlace | null {
  const target = getStorage(storage);
  if (!target) return null;
  try {
    const raw = target.getItem(WEATHER_PLACE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const { lat, lon, savedAt } = record;
    if (!isValidCoordinate(lat, lon)) return null;
    if (
      typeof savedAt !== "number" ||
      !Number.isFinite(savedAt) ||
      savedAt > now + 60_000 ||
      now - savedAt > WEATHER_PLACE_TTL_MS
    )
      return null;
    return {
      lat: roundCoordinate(lat as number),
      lon: roundCoordinate(lon as number),
      savedAt,
    };
  } catch {
    return null;
  }
}

export function writeSavedPlace(
  storage: StorageLike | null | undefined,
  lat: number,
  lon: number,
  now = Date.now(),
): void {
  const target = getStorage(storage);
  if (!target || !isValidCoordinate(lat, lon)) return;
  try {
    target.setItem(
      WEATHER_PLACE_KEY,
      JSON.stringify({
        lat: roundCoordinate(lat),
        lon: roundCoordinate(lon),
        savedAt: now,
      }),
    );
  } catch {
    // A blocked storage only disables the cache; the reading still shows.
  }
}

export function clearSavedPlace(storage?: StorageLike | null): void {
  const target = getStorage(storage);
  try {
    target?.removeItem(WEATHER_PLACE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

export function hasAskedForPlace(storage?: StorageLike | null): boolean {
  const target = getStorage(storage);
  if (!target) return true;
  try {
    return target.getItem(WEATHER_ASKED_KEY) === "1";
  } catch {
    return true;
  }
}

export function markAskedForPlace(storage?: StorageLike | null): void {
  const target = getStorage(storage);
  try {
    target?.setItem(WEATHER_ASKED_KEY, "1");
  } catch {
    // Ignore unavailable storage.
  }
}

export type VisitorPlaceResult =
  | { ok: true; lat: number; lon: number }
  | { ok: false; reason: "denied" | "unavailable" | "unsupported" };

export function requestVisitorPlace(
  now = Date.now(),
): Promise<VisitorPlaceResult> {
  void now;
  if (
    typeof navigator === "undefined" ||
    !navigator.geolocation ||
    typeof navigator.geolocation.getCurrentPosition !== "function"
  )
    return Promise.resolve({ ok: false, reason: "unsupported" });

  return new Promise<VisitorPlaceResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          ok: true,
          lat: roundCoordinate(position.coords.latitude),
          lon: roundCoordinate(position.coords.longitude),
        }),
      (error) =>
        resolve({
          ok: false,
          reason:
            error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
        }),
      {
        timeout: 9_000,
        maximumAge: 10 * 60 * 1000,
        enableHighAccuracy: false,
      },
    );
  });
}
