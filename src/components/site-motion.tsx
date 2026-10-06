"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import "./site-motion.css";
import { BrandIcon } from "@/components/brand";

const COVER_MS = 400;
const REVEAL_MS = 350;
const MAX_TRANSITION_MS = 800;
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
  started: number;
  pushed: boolean;
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
  const [revealDuration, setRevealDuration] = useState(REVEAL_MS);
  const pendingRef = useRef<Navigation | null>(null);
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

  const navigate = useCallback(
    (href: string, options: NavigateOptions = {}) => {
      if (
        pendingRef.current ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      )
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
        started: performance.now(),
        pushed: false,
      };
      pendingRef.current = navigation;
      setRevealDuration(REVEAL_MS);
      setPhase("cover");
      schedule(() => {
        if (pendingRef.current !== navigation) return;
        navigation.pushed = true;
        setPhase("hold");
        try {
          const routeOptions = {
            scroll: options.scroll ?? true,
            transitionTypes: options.transitionTypes,
          };
          if (options.replace) router.replace(navigation.href, routeOptions);
          else router.push(navigation.href, routeOptions);
        } catch {
          finish();
        }
      }, COVER_MS);
      // Slow routes continue through Next; the decorative cover never traps the page.
      schedule(finish, MAX_TRANSITION_MS);
      return true;
    },
    [finish, router, schedule],
  );

  useEffect(() => {
    const navigation = pendingRef.current;
    if (!navigation || pathname === navigation.from) return;
    if (!navigation.pushed) {
      finish();
      return;
    }
    const remaining = Math.max(
      0,
      MAX_TRANSITION_MS - (performance.now() - navigation.started),
    );
    const duration = Math.min(REVEAL_MS, remaining);
    if (duration < 40) {
      finish();
      return;
    }
    setRevealDuration(duration);
    setPhase("reveal");
    schedule(finish, duration);
  }, [finish, pathname, schedule]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    const preferences = window.matchMedia("(prefers-reduced-motion: reduce)");
    const preferenceChanged = () => {
      if (preferences.matches) finish();
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
  }, [clearTimers, finish]);

  const context = useMemo(
    () => ({ transitioning: phase !== "idle", navigate, cancel: finish }),
    [phase, navigate, finish],
  );
  return (
    <MotionContext.Provider value={context}>
      {children}
      <div
        className="site-transition"
        data-phase={phase}
        aria-hidden="true"
        style={
          { "--site-reveal-duration": `${revealDuration}ms` } as CSSProperties
        }
      >
        <div className="site-transition__ridge">
          <div className="site-transition__signature">
            <BrandIcon name="mark" size={108} />
            <span>ALPS</span>
          </div>
        </div>
      </div>
    </MotionContext.Provider>
  );
}
