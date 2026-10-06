"use client";

import { useEffect, useRef, type ReactNode } from "react";
import "./motion-media.css";

export function MotionMedia({
  children,
  className = "",
  enabled = true,
}: {
  children: ReactNode;
  className?: string;
  enabled?: boolean;
}) {
  const media = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = media.current;
    if (!enabled || !element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    let visible = false;
    let frame = 0;
    let previousTime = 0;
    let current = 0;
    let target = 0;

    const active = () =>
      visible && !document.hidden && !reduced.matches && fine.matches;
    const paint = (time: number) => {
      frame = 0;
      if (!active()) return;
      const dt = previousTime
        ? Math.min((time - previousTime) / 1000, 0.064)
        : 1 / 60;
      previousTime = time;
      current += (target - current) * (1 - Math.exp(-9 * dt));
      element.style.setProperty("--media-y", `${current.toFixed(2)}px`);
      if (Math.abs(target - current) > 0.04)
        frame = requestAnimationFrame(paint);
      else previousTime = 0;
    };
    const measure = () => {
      if (!active()) return;
      const bounds = element.getBoundingClientRect();
      const progress = Math.max(
        0,
        Math.min(
          1,
          (window.innerHeight - bounds.top) /
            (window.innerHeight + bounds.height),
        ),
      );
      target = (0.5 - progress) * bounds.height * 0.07;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const preference = () => {
      cancelAnimationFrame(frame);
      frame = previousTime = 0;
      current = target = 0;
      element.style.setProperty("--media-y", "0px");
      measure();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) measure();
        else {
          cancelAnimationFrame(frame);
          frame = previousTime = 0;
        }
      },
      { rootMargin: "80px" },
    );
    const resize = new ResizeObserver(measure);
    observer.observe(element);
    resize.observe(element);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure, { passive: true });
    document.addEventListener("visibilitychange", preference);
    reduced.addEventListener("change", preference);
    fine.addEventListener("change", preference);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", preference);
      reduced.removeEventListener("change", preference);
      fine.removeEventListener("change", preference);
    };
  }, [enabled]);

  return (
    <div
      ref={media}
      className={className}
      data-motion-media={enabled || undefined}
    >
      {children}
    </div>
  );
}
