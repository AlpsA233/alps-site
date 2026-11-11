"use client";

import { useEffect, useRef } from "react";
import type { WeatherTone } from "@/lib/weather";

type WeatherParticlesProps = {
  tone: WeatherTone | null;
  isDay: boolean;
  paused: boolean;
  enabled: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
  turn: number;
};

const PARTICLE_LIMIT = 48;

function countFor(tone: WeatherTone, area: number): number {
  const scale = Math.min(1, area / 900_000);
  const base =
    tone === "rain" || tone === "storm"
      ? 42
      : tone === "snow"
        ? 34
        : tone === "clear"
          ? 18
          : 0;
  return Math.max(
    0,
    Math.min(PARTICLE_LIMIT, Math.round(base * (0.45 + scale * 0.55))),
  );
}

function createParticle(
  tone: WeatherTone,
  width: number,
  height: number,
): Particle {
  if (tone === "rain" || tone === "storm") {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: -0.7 - Math.random() * 0.6,
      vy: 5 + Math.random() * 5,
      size: 7 + Math.random() * 10,
      alpha: 0.12 + Math.random() * 0.18,
      phase: 0,
      turn: 0,
    };
  }
  if (tone === "snow") {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: 0.5 + Math.random() * 0.9,
      size: 0.9 + Math.random() * 1.6,
      alpha: 0.24 + Math.random() * 0.28,
      phase: Math.random() * Math.PI * 2,
      turn: 0,
    };
  }
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.22,
    vy: -0.08 - Math.random() * 0.16,
    size: 0.7 + Math.random() * 1.1,
    alpha: 0.08 + Math.random() * 0.16,
    phase: Math.random() * Math.PI * 2,
    turn: 0,
  };
}

function readInk(canvas: HTMLCanvasElement): [number, number, number] {
  const value = window.getComputedStyle(canvas).color;
  const match = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(value);
  if (!match) return [33, 31, 26];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function WeatherParticles({
  tone,
  isDay,
  paused,
  enabled,
}: WeatherParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled || !tone || paused) return;
    // Fog and cloud read better as the CSS bands; no canvas needed.
    if (tone === "cloud" || tone === "fog") return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = window.matchMedia("(max-width: 700px)");
    if (reduced.matches || narrow.matches) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let ink = readInk(canvas);
    let frame = 0;
    let last = 0;
    let visible = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const seed = () => {
      if (!width || !height) return;
      particles = Array.from({ length: countFor(tone, width * height) }, () =>
        createParticle(tone, width, height),
      );
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const draw = (time: number) => {
      const delta = last ? Math.min(time - last, 64) : 16;
      last = time;
      context.clearRect(0, 0, width, height);
      if (!visible || document.hidden) return;
      const [r, g, b] = ink;

      for (const particle of particles) {
        if (tone === "rain" || tone === "storm") {
          particle.x += particle.vx * (delta / 16.67);
          particle.y += particle.vy * (delta / 16.67);
          if (particle.y > height + particle.size) {
            particle.y = -particle.size;
            particle.x = Math.random() * width;
          }
          if (particle.x < -20) particle.x = width + 10;
          context.strokeStyle = `rgba(${r},${g},${b},${particle.alpha})`;
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(particle.x, particle.y);
          context.lineTo(
            particle.x + particle.vx * 2.2,
            particle.y + particle.size,
          );
          context.stroke();
          continue;
        }

        if (tone === "snow") {
          particle.phase += delta * 0.0012;
          particle.x +=
            (particle.vx + Math.sin(particle.phase) * 0.35) * (delta / 16.67);
          particle.y += particle.vy * (delta / 16.67);
          if (particle.y > height + 6) {
            particle.y = -6;
            particle.x = Math.random() * width;
          }
          if (particle.x < -6) particle.x = width + 4;
          if (particle.x > width + 6) particle.x = -4;
          context.fillStyle = `rgba(${r},${g},${b},${particle.alpha})`;
          context.beginPath();
          context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          context.fill();
          continue;
        }

        // Clear skies: slow dust in daylight, faint stars at night.
        particle.phase += delta * 0.0008;
        particle.x += particle.vx * (delta / 16.67);
        particle.y += particle.vy * (delta / 16.67);
        if (particle.y < -6) {
          particle.y = height + 4;
          particle.x = Math.random() * width;
        }
        if (particle.x < -8) particle.x = width + 4;
        if (particle.x > width + 8) particle.x = -4;
        const twinkle = isDay
          ? 0.6 + Math.sin(particle.phase) * 0.4
          : 0.35 + Math.abs(Math.sin(particle.phase)) * 0.65;
        context.fillStyle = `rgba(${r},${g},${b},${particle.alpha * twinkle})`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
    };

    const tick = (time: number) => {
      if (document.hidden) {
        frame = 0;
        return;
      }
      draw(time);
      frame = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (frame) return;
      last = 0;
      frame = window.requestAnimationFrame(tick);
    };

    const stop = () => {
      if (!frame) return;
      window.cancelAnimationFrame(frame);
      frame = 0;
    };

    const themeObserver = new MutationObserver(() => {
      ink = readInk(canvas);
      if (visible) draw(performance.now());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-site-theme"],
    });

    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        if (visible) start();
        else stop();
      },
      { rootMargin: "80px" },
    );
    visibilityObserver.observe(canvas);

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (visible) start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (visible) draw(performance.now());
    });
    resizeObserver.observe(canvas);

    resize();
    const reducedListener = () => {
      if (reduced.matches || narrow.matches) {
        stop();
        context.clearRect(0, 0, width, height);
      } else {
        resize();
        start();
      }
    };
    reduced.addEventListener("change", reducedListener);
    narrow.addEventListener("change", reducedListener);
    start();

    return () => {
      stop();
      themeObserver.disconnect();
      visibilityObserver.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", reducedListener);
      narrow.removeEventListener("change", reducedListener);
    };
  }, [enabled, isDay, paused, tone]);

  return (
    <canvas
      ref={canvasRef}
      className="weather-desk__particles"
      aria-hidden="true"
    />
  );
}
