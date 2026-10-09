"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useSiteMotion } from "@/components/site-motion";
import { useMotionPreference } from "@/components/use-motion-preference";
import {
  parseThemePreference,
  resolveSiteTheme,
  SITE_THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/site-theme";

type ThemeContextValue = {
  preference: ThemePreference;
  choose: (preference: ThemePreference, origin: HTMLElement) => void;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyPreference(preference: ThemePreference) {
  const root = document.documentElement;
  root.dataset.siteTheme = resolveSiteTheme(
    preference,
    matchMedia("(prefers-color-scheme: dark)").matches,
  );
  root.dataset.siteThemePreference = preference;
}

export function SiteThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const preferenceRef = useRef<ThemePreference>("system");
  const transition = useRef<ViewTransition | null>(null);
  const pathname = usePathname();
  const motion = useSiteMotion();
  const { paused } = useMotionPreference();

  const finishTransition = useCallback(() => {
    transition.current?.skipTransition();
    transition.current = null;
    document.documentElement.classList.remove("site-theme-changing");
  }, []);

  useEffect(() => {
    // The head script has already resolved the first frame, even if storage is blocked.
    let initial = parseThemePreference(
      document.documentElement.dataset.siteThemePreference,
    );
    try {
      // A site layout can remount after an admin visit without rerunning the head script.
      initial = parseThemePreference(
        localStorage.getItem(SITE_THEME_STORAGE_KEY),
      );
    } catch {}
    preferenceRef.current = initial;
    setPreference(initial);
    applyPreference(initial);
    const colors = matchMedia("(prefers-color-scheme: dark)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const systemChanged = () => {
      if (preferenceRef.current === "system") {
        finishTransition();
        applyPreference("system");
      }
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== SITE_THEME_STORAGE_KEY && event.key !== null) return;
      if (event.storageArea) {
        try {
          if (event.storageArea !== localStorage) return;
        } catch {
          return;
        }
      }
      finishTransition();
      const next = parseThemePreference(event.newValue);
      preferenceRef.current = next;
      setPreference(next);
      applyPreference(next);
    };
    const reducedChanged = () => {
      if (reduced.matches) finishTransition();
    };
    colors.addEventListener("change", systemChanged);
    reduced.addEventListener("change", reducedChanged);
    window.addEventListener("storage", storageChanged);
    window.addEventListener("popstate", finishTransition);
    return () => {
      finishTransition();
      colors.removeEventListener("change", systemChanged);
      reduced.removeEventListener("change", reducedChanged);
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("popstate", finishTransition);
    };
  }, [finishTransition]);

  useEffect(() => {
    finishTransition();
  }, [pathname, motion?.transitioning, finishTransition]);

  const choose = useCallback(
    (next: ThemePreference, origin: HTMLElement) => {
      // Persist immediately; a skipped transition must never lose the user's choice.
      preferenceRef.current = next;
      setPreference(next);
      try {
        localStorage.setItem(SITE_THEME_STORAGE_KEY, next);
      } catch {
        // A private/locked-down browser can still change appearance for this visit.
      }
      finishTransition();
      const resolved = resolveSiteTheme(
        next,
        matchMedia("(prefers-color-scheme: dark)").matches,
      );
      const animate =
        resolved !== document.documentElement.dataset.siteTheme &&
        typeof document.startViewTransition === "function" &&
        !motion?.transitioning &&
        !paused &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!animate) {
        applyPreference(next);
        return;
      }
      const bounds = origin.getBoundingClientRect();
      const root = document.documentElement;
      root.style.setProperty(
        "--theme-origin-x",
        `${bounds.x + bounds.width / 2}px`,
      );
      root.style.setProperty(
        "--theme-origin-y",
        `${bounds.y + bounds.height / 2}px`,
      );
      root.classList.add("site-theme-changing");
      const current = document.startViewTransition(() => {
        // Latest preference wins when users change options during a snapshot.
        applyPreference(preferenceRef.current);
      });
      transition.current = current;
      // Skipping a snapshot rejects ready even when its update/finished succeed.
      void current.ready.catch(() => {});
      void current.finished
        .catch(() => {})
        .finally(() => {
          if (transition.current !== current) return;
          transition.current = null;
          root.classList.remove("site-theme-changing");
        });
    },
    [finishTransition, motion?.transitioning, paused],
  );

  return (
    <ThemeContext.Provider value={{ preference, choose }}>
      {children}
    </ThemeContext.Provider>
  );
}

const options = [
  { value: "light", title: "浅色", caption: "PAPER", swatch: "paper" },
  { value: "dark", title: "深色", caption: "INK", swatch: "ink" },
  { value: "system", title: "跟随系统", caption: "AUTO", swatch: "auto" },
] as const;

export function SiteThemeControl() {
  const theme = useContext(ThemeContext);
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    wrapper.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (!theme) return null;
  return (
    <div
      ref={wrapper}
      className="site-theme-control"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="site-theme-trigger"
        type="button"
        aria-label="切换外观"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" />
          <path d="M16 7a9 9 0 0 1 0 18Z" fill="currentColor" />
          <path d="M16 1v4m0 22v4M1 16h4m22 0h4" stroke="currentColor" />
        </svg>
      </button>
      {open && (
        <div
          id={id}
          className="site-theme-panel"
          role="dialog"
          aria-label="外观设置"
        >
          <fieldset>
            <legend>
              纸与墨 <span>APPEARANCE</span>
            </legend>
            {options.map((option) => (
              <label key={option.value} className="site-theme-option">
                <input
                  type="radio"
                  name={`theme-${id}`}
                  value={option.value}
                  checked={theme.preference === option.value}
                  onChange={() => {
                    if (trigger.current)
                      theme.choose(option.value, trigger.current);
                  }}
                />
                <span
                  className={`site-theme-swatch is-${option.swatch}`}
                  aria-hidden="true"
                />
                <span>{option.title}</span>
                <small>{option.caption}</small>
              </label>
            ))}
          </fieldset>
          <p>换一种光线，继续看。</p>
        </div>
      )}
    </div>
  );
}
