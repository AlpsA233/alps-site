export type SiteTheme = "light" | "dark";
export type ThemePreference = SiteTheme | "system";

export const SITE_THEME_STORAGE_KEY = "alps-site-theme";

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveSiteTheme(
  preference: ThemePreference,
  systemDark: boolean,
): SiteTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

// Runs in the head before any page is painted; no React or storage permission required.
export const SITE_THEME_BOOTSTRAP = `(() => {
  let preference = "system";
  try {
    const saved = localStorage.getItem("${SITE_THEME_STORAGE_KEY}");
    if (saved === "light" || saved === "dark") preference = saved;
  } catch {}
  const dark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.siteTheme = dark ? "dark" : "light";
  document.documentElement.dataset.siteThemePreference = preference;
})();`;
