"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import { useMotionPreference } from "@/components/use-motion-preference";
import { useSiteMotion } from "@/components/site-motion";
import plateGeometry from "./print-plate-v4.json";
import "./site-print-atmosphere.css";

// Display the complete generated print, including its alpha fringe and red ink.
// Only the neutral ink body is traced, solely for the overlapping type projection.
type Point = readonly [number, number];
const PLATE: Point[] = plateGeometry.points.map(([x, y]) => [x, y]);
const PLATE_POINTS = PLATE.map((point) => point.join(",")).join(" ");
const TOP_Y = Math.min(...PLATE.map(([, y]) => y));
const TOP_ENTRY_X = Math.min(
  ...PLATE.filter(([, y]) => y === TOP_Y).map(([x]) => x),
);
// Keep the cropped image edges outside the viewport throughout its drift.
// CSS-pixel margins also cover narrow desktop windows without moving the plate
// farther into the composition than a percentage-based enlargement would.
const OVERSCAN_X = 48;
const OVERSCAN_Y = 20;

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
  const plateRef = useRef<SVGGElement>(null);
  const darkFilterId = useId();
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
      // Native image pixels map to viewport pixels through one uniform scale.
      // Cover the viewport plus the drift margins, cropping excess rather than
      // changing the angles, grain proportions or baked registration thickness.
      const widthScale = (width + OVERSCAN_X * 2) / plateGeometry.width;
      const scale = Math.max(
        widthScale,
        (height + OVERSCAN_Y * 2) / plateGeometry.height,
      );
      // Anchor the top ink entry when a tall viewport requires extra scale.
      // This retains the diagonal's relation to the headline across formats.
      const originX = -OVERSCAN_X + (widthScale - scale) * TOP_ENTRY_X;
      const originY = -OVERSCAN_Y;
      // Read together before writing so text and inline shapes share the plate.
      const positions = titles.map((title) => ({
        title,
        ...titleGeometry(title, shell),
      }));
      plateRef.current?.setAttribute(
        "transform",
        `translate(${originX} ${originY}) scale(${scale})`,
      );
      layer.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
      for (const { title, rect, minX, minY, inverse } of positions) {
        if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > height)
          continue;
        const clip = PLATE.map(([x, y]) => {
          const px = x * scale + originX + dx - rect.left + minX;
          const py = y * scale + originY + dy - rect.top + minY;
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
      titles = [...shell.querySelectorAll<HTMLElement>("[data-print-ink]")];
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
      <div
        ref={ref}
        className="print-atmosphere"
        aria-hidden="true"
        style={
          { "--print-dark-filter": `url(#${darkFilterId})` } as CSSProperties
        }
      >
        <svg focusable="false">
          <defs>
            <filter id={darkFilterId} colorInterpolationFilters="sRGB">
              <feColorMatrix
                type="matrix"
                values="0.358 -1.358 0 0 0.9644 -0.586 -0.414 0 0 0.9285 -0.8395 0.8395 -1 0 0.857 0 0 0 1 0"
              />
            </filter>
          </defs>
          <g ref={plateRef}>
            <polygon
              className="print-atmosphere__geometry"
              fill="none"
              stroke="none"
              points={PLATE_POINTS}
            />
            <image
              className="print-atmosphere__texture"
              href="/backgrounds/print-plate-v4.webp"
              x="0"
              y="0"
              width={plateGeometry.width}
              height={plateGeometry.height}
              preserveAspectRatio="xMinYMin meet"
            />
          </g>
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
