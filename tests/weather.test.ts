import test from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../next.config";
import {
  buildWeatherUrl,
  describeWeather,
  fetchWeather,
  formatPlaceLabel,
  hasAskedForPlace,
  isSupportedWeatherCode,
  isValidCoordinate,
  markAskedForPlace,
  parseWeatherResponse,
  readSavedPlace,
  requestVisitorPlace,
  roundCoordinate,
  splitTemperature,
  WEATHER_ASKED_KEY,
  WEATHER_PLACE_KEY,
  WEATHER_PLACE_TTL_MS,
  writeSavedPlace,
} from "../src/lib/weather";

const KNOWN_CODES = [
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77,
  80, 81, 82, 85, 86, 95, 96, 99,
];

const READING = {
  timezone: "Asia/Shanghai",
  current: {
    time: "2026-11-11T14:20",
    temperature_2m: 18.4,
    weather_code: 2,
    is_day: 1,
    apparent_temperature: 17.1,
  },
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
  };
}

function blockedStorage() {
  return {
    getItem(): string | null {
      throw new Error("blocked");
    },
    setItem(): void {
      throw new Error("blocked");
    },
    removeItem(): void {
      throw new Error("blocked");
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function asFetch(
  impl: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return impl as typeof fetch;
}

test("every supported WMO code maps to a finished description", () => {
  for (const code of KNOWN_CODES) {
    assert.equal(isSupportedWeatherCode(code), true, `code ${code} known`);
    const description = describeWeather(code, true);
    assert.ok(description.labelZh.length, `code ${code} has a Chinese label`);
    assert.ok(description.labelEn.length, `code ${code} has an English label`);
    assert.ok(description.handNote.length, `code ${code} has a hand note`);
    assert.ok(
      ["sun", "moon", "cloud", "rain", "snow", "storm", "fog"].includes(
        description.icon,
      ),
      `code ${code} has a glyph`,
    );
    assert.ok(
      ["clear", "cloud", "rain", "snow", "storm", "fog"].includes(
        description.tone,
      ),
      `code ${code} has a tone`,
    );
  }
  assert.equal(isSupportedWeatherCode(42), false);
  assert.equal(describeWeather(42, true).labelEn, "WEATHER");
});

test("clear skies switch to a night glyph without changing the copy", () => {
  const day = describeWeather(0, true);
  const night = describeWeather(0, false);
  assert.equal(day.icon, "sun");
  assert.equal(night.icon, "moon");
  assert.equal(night.labelZh, day.labelZh);
  assert.equal(night.labelEn, day.labelEn);
});

test("coordinates must be finite and stay on the planet", () => {
  assert.equal(isValidCoordinate(31.23, 121.47), true);
  assert.equal(isValidCoordinate(-90, -180), true);
  assert.equal(isValidCoordinate(90, 180), true);
  for (const [lat, lon] of [
    [91, 0],
    [-91, 0],
    [0, 181],
    [0, -181],
    [Number.NaN, 0],
    [0, Number.POSITIVE_INFINITY],
    ["31", "121"],
    [null, 0],
    [undefined, undefined],
  ]) {
    assert.equal(
      isValidCoordinate(lat, lon),
      false,
      `${String(lat)}, ${String(lon)} rejected`,
    );
  }
  assert.equal(roundCoordinate(31.2304), 31.23);
  assert.equal(roundCoordinate(-31.2304), -31.23);
});

test("the request rounds coordinates and asks for the rendered features", () => {
  const url = new URL(buildWeatherUrl(31.2304, 121.4737));
  assert.equal(
    url.origin + url.pathname,
    "https://api.open-meteo.com/v1/forecast",
  );
  assert.equal(url.searchParams.get("latitude"), "31.23");
  assert.equal(url.searchParams.get("longitude"), "121.47");
  assert.equal(url.searchParams.get("timezone"), "auto");
  assert.equal(
    url.searchParams.get("current"),
    "temperature_2m,weather_code,is_day,apparent_temperature",
  );
});

test("response parsing accepts a complete payload and rejects partial ones", () => {
  const reading = parseWeatherResponse(READING);
  assert.ok(reading);
  assert.equal(reading.temperature, 18);
  assert.equal(reading.apparent, 17);
  assert.equal(reading.code, 2);
  assert.equal(reading.isDay, true);
  assert.equal(reading.time, "2026-11-11T14:20");
  assert.equal(reading.timezone, "Asia/Shanghai");
  assert.equal(reading.labelZh, "多云");
  assert.equal(reading.icon, "cloud");
  assert.equal(reading.tone, "cloud");

  assert.equal(parseWeatherResponse(null), null);
  assert.equal(parseWeatherResponse({}), null);
  assert.equal(parseWeatherResponse({ current: null }), null);
  assert.equal(
    parseWeatherResponse({
      ...READING,
      current: { ...READING.current, temperature_2m: "18" },
    }),
    null,
  );
  assert.equal(
    parseWeatherResponse({
      ...READING,
      current: { ...READING.current, weather_code: 100 },
    }),
    null,
  );
  assert.equal(
    parseWeatherResponse({
      ...READING,
      current: { ...READING.current, weather_code: 2.5 },
    }),
    null,
  );
  assert.equal(
    parseWeatherResponse({
      ...READING,
      current: { ...READING.current, is_day: 2 },
    }),
    null,
  );

  const noTimezone = parseWeatherResponse({ current: READING.current });
  assert.equal(noTimezone?.timezone, "");
  assert.equal(noTimezone?.apparent, 17);
});

test("fetchWeather returns null instead of throwing when the service fails", async () => {
  let seenUrl = "";
  const ok = await fetchWeather(
    31.2304,
    121.4737,
    asFetch(async (url) => {
      seenUrl = String(url);
      return jsonResponse(READING);
    }),
  );
  assert.equal(ok?.labelZh, "多云");
  assert.match(seenUrl, /latitude=31\.23/);

  assert.equal(
    await fetchWeather(
      0,
      0,
      asFetch(async () => jsonResponse({}, 500)),
    ),
    null,
  );
  assert.equal(
    await fetchWeather(
      0,
      0,
      asFetch(async () => {
        throw new Error("network down");
      }),
    ),
    null,
  );
  assert.equal(
    await fetchWeather(
      0,
      0,
      asFetch(async () => new Response("not json")),
    ),
    null,
  );

  let called = false;
  assert.equal(
    await fetchWeather(
      91,
      0,
      asFetch(async () => {
        called = true;
        return jsonResponse(READING);
      }),
    ),
    null,
  );
  assert.equal(called, false, "invalid coordinates never touch the network");
});

test("temperature splits into a sign and rolling digits", () => {
  assert.deepEqual(splitTemperature(18), {
    sign: "",
    digits: [1, 8],
    text: "18",
  });
  assert.deepEqual(splitTemperature(-3.4), {
    sign: "−",
    digits: [3],
    text: "−3",
  });
  assert.deepEqual(splitTemperature(0.4), { sign: "", digits: [0], text: "0" });
  assert.deepEqual(splitTemperature(-0.4), {
    sign: "",
    digits: [0],
    text: "0",
  });
  assert.deepEqual(splitTemperature(120.6), {
    sign: "",
    digits: [1, 2, 1],
    text: "121",
  });
});

test("place labels keep the timezone readable", () => {
  assert.equal(formatPlaceLabel("Asia/Shanghai"), "ASIA / SHANGHAI");
  assert.equal(formatPlaceLabel("America/New_York"), "AMERICA / NEW YORK");
  assert.equal(formatPlaceLabel("Asia"), "ASIA");
  assert.equal(formatPlaceLabel(""), "YOUR SKY");
  assert.equal(formatPlaceLabel("   "), "YOUR SKY");
});

test("the saved place cache expires, rejects bad entries and survives blocked storage", () => {
  const now = 1_800_000_000_000;
  const storage = memoryStorage();
  writeSavedPlace(storage, 31.2304, 121.4737, now);
  const saved = JSON.parse(storage.data.get(WEATHER_PLACE_KEY) ?? "null");
  assert.equal(saved.lat, 31.23);
  assert.equal(saved.lon, 121.47);
  assert.equal(saved.savedAt, now);

  assert.deepEqual(readSavedPlace(storage, now + 1_000), {
    lat: 31.23,
    lon: 121.47,
    savedAt: now,
  });
  assert.equal(readSavedPlace(storage, now + WEATHER_PLACE_TTL_MS + 1), null);

  const malformed = memoryStorage({ [WEATHER_PLACE_KEY]: "{" });
  assert.equal(readSavedPlace(malformed, now), null);

  const outOfRange = memoryStorage({
    [WEATHER_PLACE_KEY]: JSON.stringify({ lat: 120, lon: 0, savedAt: now }),
  });
  assert.equal(readSavedPlace(outOfRange, now), null);

  const future = memoryStorage({
    [WEATHER_PLACE_KEY]: JSON.stringify({
      lat: 10,
      lon: 10,
      savedAt: now + 120_000,
    }),
  });
  assert.equal(readSavedPlace(future, now), null);

  assert.equal(readSavedPlace(blockedStorage(), now), null);
  writeSavedPlace(blockedStorage(), 1, 1, now);
});

test("the asked flag is remembered per browser and tolerates blocked storage", () => {
  const storage = memoryStorage();
  assert.equal(hasAskedForPlace(storage), false);
  markAskedForPlace(storage);
  assert.equal(hasAskedForPlace(storage), true);
  assert.equal(storage.data.get(WEATHER_ASKED_KEY), "1");
  assert.equal(hasAskedForPlace(blockedStorage()), true);
});

test("a browser without geolocation reports unsupported instead of throwing", async () => {
  const result = await requestVisitorPlace();
  assert.deepEqual(result, { ok: false, reason: "unsupported" });
});

test("the site allows same-origin geolocation but keeps camera and microphone off", async () => {
  assert.equal(typeof nextConfig.headers, "function");
  const groups = await nextConfig.headers?.();
  assert.ok(groups);
  const headers = new Map<string, string>();
  for (const group of groups) {
    for (const header of group.headers) headers.set(header.key, header.value);
  }
  const policy = headers.get("Permissions-Policy") ?? "";
  assert.match(policy, /geolocation=\(self\)/);
  assert.match(policy, /camera=\(\)/);
  assert.match(policy, /microphone=\(\)/);
  assert.equal(headers.get("X-Frame-Options"), "DENY");
});
