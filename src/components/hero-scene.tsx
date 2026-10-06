"use client";

import { useEffect, useRef, type ReactNode } from "react";

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));
const smoothstep = (start: number, end: number, value: number) => {
  const progress = clamp((value - start) / (end - start));
  return progress * progress * (3 - 2 * progress);
};

export function HeroScene({ children }: { children: ReactNode }) {
  const scene = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = scene.current;
    if (!element) return;
    const pointerArea =
      element.querySelector<HTMLElement>(".cinema-hero-inner");
    if (!pointerArea) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia(
      "(min-width: 701px) and (hover: hover) and (pointer: fine)",
    );
    let bounds = pointerArea.getBoundingClientRect();
    const sceneBounds = element.getBoundingClientRect();
    let inView = sceneBounds.bottom > 0 && sceneBounds.top < window.innerHeight;
    let frame = 0;
    let lastFrameTime = 0;
    let targetX = 0;
    let targetY = 0;
    let targetProgress = 0;
    let currentX = 0;
    let currentY = 0;
    let currentProgress = 0;

    const motionEnabled = () => !reducedMotion.matches && desktop.matches;
    const active = () => motionEnabled() && inView && !document.hidden;

    const paint = (time: number) => {
      frame = 0;
      if (!active()) return;
      const dt = lastFrameTime
        ? clamp((time - lastFrameTime) / 1000, 0.001, 0.05)
        : 1 / 60;
      lastFrameTime = time;
      currentX = damp(currentX, targetX, 7.5, dt);
      currentY = damp(currentY, targetY, 7.5, dt);
      currentProgress = damp(currentProgress, targetProgress, 10, dt);

      element.style.setProperty("--hero-x", `${currentX.toFixed(2)}px`);
      element.style.setProperty("--hero-y", `${currentY.toFixed(2)}px`);
      element.style.setProperty(
        "--hero-lift",
        `${(-currentProgress * 42).toFixed(2)}px`,
      );
      element.style.setProperty(
        "--hero-scale",
        (1.035 + currentProgress * 0.085).toFixed(4),
      );
      element.style.setProperty(
        "--hero-copy-y",
        `${(-currentProgress * 68).toFixed(2)}px`,
      );
      element.style.setProperty(
        "--hero-copy-opacity",
        (1 - smoothstep(0.08, 0.7, currentProgress)).toFixed(3),
      );
      element.style.setProperty(
        "--hero-footer-opacity",
        (1 - smoothstep(0, 0.35, currentProgress)).toFixed(3),
      );
      element.style.setProperty(
        "--hero-copy-visibility",
        currentProgress < 0.7 ? "visible" : "hidden",
      );
      element.style.setProperty(
        "--hero-footer-visibility",
        currentProgress < 0.35 ? "visible" : "hidden",
      );

      if (
        Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > 0.025 ||
        Math.abs(targetProgress - currentProgress) > 0.0005
      ) {
        frame = window.requestAnimationFrame(paint);
      } else {
        lastFrameTime = 0;
      }
    };

    const schedule = () => {
      if (active() && !frame) frame = window.requestAnimationFrame(paint);
    };

    const pause = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      lastFrameTime = 0;
      targetX = targetY = 0;
    };

    const measure = () => {
      if (!active()) return;
      bounds = pointerArea.getBoundingClientRect();
      targetProgress = clamp(-bounds.top / Math.max(bounds.height, 1));
      schedule();
    };

    const point = (event: PointerEvent) => {
      if (!active() || event.pointerType !== "mouse") return;
      const x = clamp((event.clientX - bounds.left) / bounds.width);
      const y = clamp((event.clientY - bounds.top) / bounds.height);
      targetX = (x - 0.5) * -28;
      targetY = (y - 0.5) * -20;
      schedule();
    };

    const leave = () => {
      targetX = targetY = 0;
      schedule();
    };

    const motionPreference = () => {
      pause();
      currentX = currentY = currentProgress = targetProgress = 0;
      for (const property of [
        "--hero-x",
        "--hero-y",
        "--hero-lift",
        "--hero-scale",
        "--hero-copy-y",
        "--hero-copy-opacity",
        "--hero-footer-opacity",
        "--hero-copy-visibility",
        "--hero-footer-visibility",
      ])
        element.style.removeProperty(property);
      measure();
    };

    const visibility = () => {
      if (document.hidden) pause();
      else measure();
    };

    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) measure();
      else pause();
    });
    observer.observe(element);

    const sizeObserver = new ResizeObserver(measure);
    sizeObserver.observe(pointerArea);
    measure();
    pointerArea.addEventListener("pointermove", point, { passive: true });
    pointerArea.addEventListener("pointerleave", leave);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    reducedMotion.addEventListener("change", motionPreference);
    desktop.addEventListener("change", motionPreference);

    return () => {
      pause();
      observer.disconnect();
      sizeObserver.disconnect();
      pointerArea.removeEventListener("pointermove", point);
      pointerArea.removeEventListener("pointerleave", leave);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", visibility);
      reducedMotion.removeEventListener("change", motionPreference);
      desktop.removeEventListener("change", motionPreference);
    };
  }, []);

  return (
    <section id="home-hero" className="cinema-hero" ref={scene}>
      {children}
    </section>
  );
}
