"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import "./site-motion.css";
import { BrandIcon } from "@/components/brand";

const COVER_MS = 400;
const REVEAL_MS = 350;
const SLOW_LOAD_MS = 8000;
export const SITE_TRANSITION_END = "site-transitionend";

type NavigateOptions = {
  replace?: boolean;
  scroll?: boolean;
  transitionTypes?: string[];
};
type MotionContextValue = {
  transitioning: boolean;
  navigate: (href: string, options?: NavigateOptions) => boolean;
  cancel: () => void;
};
type Navigation = {
  href: string;
  from: string;
  options: NavigateOptions;
  pushed: boolean;
  observedPending: boolean;
};
type Phase = "idle" | "cover" | "hold" | "reveal";

const MotionContext = createContext<MotionContextValue | null>(null);

export function useSiteMotion() {
  return useContext(MotionContext);
}

export function SiteMotionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [loadState, setLoadState] = useState<"waiting" | "slow" | "failed">(
    "waiting",
  );
  const [isPending, startNavigation] = useTransition();
  const pendingRef = useRef<Navigation | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const wasTransitioningRef = useRef(false);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current.clear();
  }, []);

  const finish = useCallback(() => {
    pendingRef.current = null;
    clearTimers();
    setPhase("idle");
    setLoadState("waiting");
  }, [clearTimers]);

  useEffect(() => {
    if (phase === "idle" && wasTransitioningRef.current) {
      // React has removed the cover before new-page headings begin their reveal.
      window.dispatchEvent(new Event(SITE_TRANSITION_END));
    }
    wasTransitioningRef.current = phase !== "idle";
  }, [phase]);

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, delay);
    timersRef.current.add(timer);
  }, []);

  const pushNavigation = useCallback(
    (navigation: Navigation) => {
      if (pendingRef.current !== navigation || navigation.pushed) return;
      navigation.pushed = true;
      setPhase("hold");
      try {
        // The actual dispatch must be inside the Transition, not its cover timer.
        startNavigation(() => {
          const routeOptions = {
            scroll: navigation.options.scroll ?? true,
            transitionTypes: navigation.options.transitionTypes,
          };
          if (navigation.options.replace)
            router.replace(navigation.href, routeOptions);
          else router.push(navigation.href, routeOptions);
        });
      } catch {
        setLoadState("failed");
      }
    },
    [router, startNavigation],
  );

  const skipAnimation = useCallback(() => {
    const navigation = pendingRef.current;
    if (!navigation) return;
    // Skipping the cover still follows the link; an already dispatched route continues.
    pushNavigation(navigation);
    finish();
  }, [finish, pushNavigation]);

  const navigate = useCallback(
    (href: string, options: NavigateOptions = {}) => {
      if (pendingRef.current || isPending) {
        // A newer link uses Next directly and cannot leave an older cover timer alive.
        finish();
        return false;
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
        return false;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return false;
      }
      if (
        !/^https?:$/.test(url.protocol) ||
        url.origin !== window.location.origin ||
        url.pathname === window.location.pathname ||
        url.pathname === "/admin" ||
        url.pathname.startsWith("/admin/")
      )
        return false;
      const navigation: Navigation = {
        href: `${url.pathname}${url.search}${url.hash}`,
        from: window.location.pathname,
        options,
        pushed: false,
        observedPending: false,
      };
      pendingRef.current = navigation;
      setLoadState("waiting");
      setPhase("cover");
      schedule(() => pushNavigation(navigation), COVER_MS);
      schedule(() => {
        if (pendingRef.current === navigation) setLoadState("slow");
      }, SLOW_LOAD_MS);
      return true;
    },
    [finish, isPending, pushNavigation, schedule],
  );

  useEffect(() => {
    const navigation = pendingRef.current;
    if (!navigation || phase === "reveal") return;
    if (!navigation.pushed) {
      if (pathname !== navigation.from) finish();
      return;
    }
    if (isPending) {
      navigation.observedPending = true;
      return;
    }
    if (pathname === navigation.from) {
      if (navigation.observedPending) setLoadState("failed");
      return;
    }
    // Public pages await their main data before returning JSX (no loading/Suspense
    // fallback). The completed Transition therefore commits the target content.
    // If a page starts streaming a fallback, gate this on its critical-content marker.
    clearTimers();
    setPhase("reveal");
    schedule(finish, REVEAL_MS);
  }, [clearTimers, finish, isPending, pathname, phase, schedule]);

  const transitioning = phase !== "idle";
  useEffect(() => {
    if (!transitioning) return;
    const background = Array.from(
      document.querySelectorAll<HTMLElement>(".studio-shell, .skip-link"),
      (element) => ({ element, wasInert: element.inert }),
    );
    const overlay = overlayRef.current;
    const previousFocus = document.activeElement;
    background.forEach(({ element }) => {
      element.inert = true;
    });
    overlay?.focus({ preventScroll: true });
    return () => {
      background.forEach(({ element, wasInert }) => {
        element.inert = wasInert;
      });
      // Hiding the overlay may already have sent focus to body before this effect.
      if (
        !overlay?.contains(document.activeElement) &&
        document.activeElement !== document.body
      )
        return;
      if (
        previousFocus instanceof HTMLElement &&
        previousFocus !== document.body &&
        previousFocus.isConnected
      ) {
        previousFocus.focus({ preventScroll: true });
      } else {
        const main = document.querySelector<HTMLElement>("main#main, main");
        if (!main) return;
        // Keep -1: removing it while focused sends Chromium focus back to body.
        // It makes the new page focusable without adding a sequential Tab stop.
        if (!main.hasAttribute("tabindex")) main.tabIndex = -1;
        main.focus({ preventScroll: true });
      }
    };
  }, [transitioning]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") skipAnimation();
    };
    const preferences = window.matchMedia("(prefers-reduced-motion: reduce)");
    const preferenceChanged = () => {
      if (preferences.matches) skipAnimation();
    };
    window.addEventListener("popstate", finish);
    window.addEventListener("keydown", escape);
    preferences.addEventListener("change", preferenceChanged);
    return () => {
      clearTimers();
      pendingRef.current = null;
      window.removeEventListener("popstate", finish);
      window.removeEventListener("keydown", escape);
      preferences.removeEventListener("change", preferenceChanged);
    };
  }, [clearTimers, finish, skipAnimation]);

  const context = useMemo(
    () => ({ transitioning, navigate, cancel: finish }),
    [transitioning, navigate, finish],
  );
  return (
    <MotionContext.Provider value={context}>
      {children}
      <div
        ref={overlayRef}
        className="site-transition"
        data-phase={phase}
        role={transitioning ? "dialog" : undefined}
        aria-modal={transitioning || undefined}
        aria-label="页面切换"
        aria-hidden={!transitioning}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (!transitioning || event.key !== "Tab") return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              "a[href], button",
            ),
          );
          if (!controls.length) {
            event.preventDefault();
            return;
          }
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          } else if (document.activeElement === event.currentTarget) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
          }
        }}
        style={{ "--site-reveal-duration": `${REVEAL_MS}ms` } as CSSProperties}
      >
        <div className="site-transition__ridge">
          <div className="site-transition__signature">
            <BrandIcon name="mark" size={108} />
            <span>ALPS</span>
            <p className="site-transition__status" role="status">
              {phase === "reveal"
                ? "页面已就绪"
                : loadState === "failed"
                  ? "暂时未能切换页面，可以重新打开。"
                  : loadState === "slow"
                    ? "网络有些慢，还在等待页面。"
                    : "正在加载页面"}
            </p>
            {(phase === "hold" || phase === "reveal") &&
              loadState !== "waiting" && (
                <div className="site-transition__actions">
                  <a href={pendingRef.current?.href}>直接打开页面</a>
                  <button type="button" onClick={skipAnimation}>
                    跳过动画
                  </button>
                </div>
              )}
          </div>
        </div>
      </div>
    </MotionContext.Provider>
  );
}
