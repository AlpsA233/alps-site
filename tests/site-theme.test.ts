import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import {
  parseThemePreference,
  resolveSiteTheme,
  SITE_THEME_BOOTSTRAP,
  SITE_THEME_STORAGE_KEY,
} from "../src/lib/site-theme";

function firstFrame(
  saved: unknown,
  systemDark: boolean,
  storageBlocked = false,
) {
  const dataset: Record<string, string> = {};
  runInNewContext(SITE_THEME_BOOTSTRAP, {
    document: { documentElement: { dataset } },
    window: { matchMedia: () => ({ matches: systemDark }) },
    localStorage: {
      getItem(key: string) {
        assert.equal(key, SITE_THEME_STORAGE_KEY);
        if (storageBlocked) throw new Error("Storage unavailable");
        return saved;
      },
    },
  });
  return dataset;
}

test("the first frame respects saved appearance and system defaults before hydration", () => {
  for (const systemDark of [true, false]) {
    for (const saved of [
      null,
      "system",
      "dark",
      "light",
      "broken",
      "",
      undefined,
    ]) {
      const preference = parseThemePreference(saved);
      assert.deepEqual(firstFrame(saved, systemDark), {
        siteTheme: resolveSiteTheme(preference, systemDark),
        siteThemePreference: preference,
      });
    }
  }
});

test("denied browser storage still paints the system theme without throwing", () => {
  assert.deepEqual(firstFrame("light", true, true), {
    siteTheme: "dark",
    siteThemePreference: "system",
  });
  assert.deepEqual(firstFrame("dark", false, true), {
    siteTheme: "light",
    siteThemePreference: "system",
  });
});

test("manual themes stay fixed when the operating system appearance changes", () => {
  assert.equal(resolveSiteTheme("dark", false), "dark");
  assert.equal(resolveSiteTheme("light", true), "light");
  assert.equal(resolveSiteTheme("system", false), "light");
  assert.equal(resolveSiteTheme("system", true), "dark");
});
