"use client";

import { useEffect, useRef } from "react";
import { useMotionPreference } from "@/components/use-motion-preference";
import { useSiteMotion } from "@/components/site-motion";
import "./site-print-atmosphere.css";

// One plate supplies both the fixed field and the inverse ink inside each glyph.
// Explicit text clipping keeps photographs and vermillion accents in their own colors.
type Point = readonly [number, number];
function curve(start: Point, control: Point, end: Point): Point[] {
  return Array.from({ length: 20 }, (_, index) => {
    const t = (index + 1) / 20;
    return [
      (1 - t) ** 2 * start[0] + 2 * (1 - t) * t * control[0] + t ** 2 * end[0],
      (1 - t) ** 2 * start[1] + 2 * (1 - t) * t * control[1] + t ** 2 * end[1],
    ];
  });
}
const PLATE: Point[] = [
  [840, -160],
  [1680, -160],
  [1680, 550],
  ...curve([1680, 550], [1560, 830], [1250, 714]),
  [492, 422],
  ...curve([492, 422], [434, 400], [463, 350]),
];
const PLATE_POINTS = PLATE.map((point) => point.join(",")).join(" ");

function titleGeometry(title: HTMLElement, shell: HTMLElement) {
  const rect = title.getBoundingClientRect();
  const style = getComputedStyle(title);
  const width = parseFloat(style.width);
  const height = parseFloat(style.height);
  let matrix = new DOMMatrix();
  // Undo both the glyph's rotation and any transformed ancestor. Translation is
  // already accounted for by its screen rect; this keeps the shared plate fixed.
  for (
    let node: HTMLElement | null = title;
    node && node !== shell;
    node = node.parentElement
  ) {
    const transform =
      node === title ? style.transform : getComputedStyle(node).transform;
    if (transform !== "none")
      matrix = new DOMMatrix(transform).multiply(matrix);
  }
  const corners = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ].map(([x, y]) => ({
    x: matrix.a * x + matrix.c * y,
    y: matrix.b * x + matrix.d * y,
  }));
  const minX = Math.min(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  return { rect, minX, minY, inverse: matrix.inverse() };
}

export function SitePrintAtmosphere() {
  const ref = useRef<HTMLDivElement>(null);
  const phase = useRef(0);
  const { paused, togglePaused } = useMotionPreference();
  const pausedRef = useRef(paused);
  const motion = useSiteMotion();

  useEffect(() => {
    pausedRef.current = paused;
    window.dispatchEvent(new Event("alps-print-refresh"));
  }, [paused]);

  useEffect(() => {
    const layer = ref.current;
    const shell = layer?.closest<HTMLElement>(".studio-shell");
    if (!layer || !shell) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = window.matchMedia("(max-width: 700px)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    let titles: HTMLElement[] = [];
    let frame = 0;
    let lastTime = 0;
    let lastPaint = 0;
    let width = layer.clientWidth;
    let height = layer.clientHeight;
    let joltAt = -Infinity;
    let settleUntil = 0;
    let disposed = false;

    const playing = () =>
      !pausedRef.current &&
      !reduced.matches &&
      !narrow.matches &&
      !document.hidden;

    const paint = (time: number) => {
      width = layer.clientWidth;
      height = layer.clientHeight;
      const x = Math.sin(phase.current) * 40;
      const y = Math.sin(phase.current + 0.5) * 12;
      const age = time - joltAt;
      const jolt =
        playing() && age >= 0 && age < 360
          ? age < 120
            ? age / 120
            : (360 - age) / 240
          : 0;
      const dx = x - 2 * jolt;
      const dy = y + jolt;
      // Read together before writing: at most four hero glyphs are aligned.
      const positions = titles.map((title) => ({
        title,
        ...titleGeometry(title, shell),
      }));
      layer.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
      for (const { title, rect, minX, minY, inverse } of positions) {
        if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > height)
          continue;
        const clip = PLATE.map(([x, y]) => {
          const px = (x * width) / 1440 + dx - rect.left + minX;
          const py = (y * height) / 1000 + dy - rect.top + minY;
          return `${(inverse.a * px + inverse.c * py).toFixed(2)}px ${(inverse.b * px + inverse.d * py).toFixed(2)}px`;
        }).join(",");
        title.style.setProperty("--print-clip", `polygon(${clip})`);
      }
      shell.dataset.printReady = "true";
    };

    const tick = (time: number) => {
      frame = 0;
      const running = playing();
      if (
        !running &&
        (time > settleUntil || document.hidden || narrow.matches)
      ) {
        lastTime = 0;
        return;
      }
      if (running && lastTime)
        phase.current +=
          Math.min(time - lastTime, 100) * ((Math.PI * 2) / 64000);
      lastTime = running ? time : 0;
      // The plate is deliberately slow. 30 fps also tracks existing hero transforms.
      if (time - lastPaint >= 32) {
        paint(time);
        lastPaint = time;
      }
      frame = window.requestAnimationFrame(tick);
    };
    const refresh = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      // A paused plate stays still, but newly mounted type can have a short
      // MotionReveal entrance. Follow that geometry until it has settled.
      settleUntil = performance.now() + 1600;
      paint(performance.now());
      if (!document.hidden && !narrow.matches)
        frame = window.requestAnimationFrame(tick);
    };
    const titleResize = new ResizeObserver(refresh);
    const scan = () => {
      titles = [...shell.querySelectorAll<HTMLElement>("[data-print-title]")];
      titleResize.disconnect();
      titleResize.observe(layer);
      titles.forEach((title) => titleResize.observe(title));
      refresh();
    };
    const resize = () => {
      width = layer.clientWidth;
      height = layer.clientHeight;
      refresh();
    };
    const scroll = () => {
      // Follow scrolling text immediately; the plate stays viewport fixed even
      // when paused. This avoids waiting for the slower ambient animation tick.
      paint(performance.now());
    };
    const hover = (event: PointerEvent) => {
      if (!fine.matches || !playing() || !(event.target instanceof Element))
        return;
      const title = event.target.closest("[data-print-title]");
      if (
        !title ||
        (event.relatedTarget instanceof Node &&
          title.contains(event.relatedTarget))
      )
        return;
      joltAt = performance.now();
    };
    const observer = new MutationObserver(scan);
    observer.observe(shell, { childList: true, subtree: true });
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("alps-print-refresh", refresh);
    document.addEventListener("visibilitychange", refresh);
    shell.addEventListener("pointerover", hover);
    reduced.addEventListener("change", refresh);
    narrow.addEventListener("change", refresh);
    document.fonts.addEventListener("loadingdone", refresh);
    document.fonts.ready.then(() => {
      if (!disposed) refresh();
    });
    scan();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      titleResize.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("alps-print-refresh", refresh);
      document.removeEventListener("visibilitychange", refresh);
      shell.removeEventListener("pointerover", hover);
      reduced.removeEventListener("change", refresh);
      narrow.removeEventListener("change", refresh);
      document.fonts.removeEventListener("loadingdone", refresh);
      delete shell.dataset.printReady;
    };
  }, []);

  return (
    <>
      <div ref={ref} className="print-atmosphere" aria-hidden="true">
        <svg
          viewBox="0 0 1440 1000"
          preserveAspectRatio="none"
          focusable="false"
        >
          <polygon
            className="print-atmosphere__registration"
            points={PLATE_POINTS}
          />
          <polygon className="print-atmosphere__plate" points={PLATE_POINTS} />
        </svg>
      </div>
      <div className="print-grain" aria-hidden="true" />
      <button
        className="print-motion-toggle"
        type="button"
        onClick={togglePaused}
        aria-pressed={paused}
        aria-label={paused ? "开启动效" : "暂停动效"}
        inert={motion?.transitioning || undefined}
      >
        动效：{paused ? "停" : "开"}
      </button>
    </>
  );
}
