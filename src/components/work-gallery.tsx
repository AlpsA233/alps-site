"use client";

import Link from "@/components/motion-link";
import { useEffect, useId, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
} from "react";
import type { Entry } from "@/lib/content";
import { BrandIcon } from "@/components/brand";
import { EntryCover } from "@/components/entry-cover";
import {
  advanceGalleryInertia,
  advanceGallerySnap,
  clampGalleryPosition,
  nearestGalleryStop,
} from "@/components/gallery-motion";
import "./work-gallery.css";

type Drag = {
  pointerId: number;
  x: number;
  y: number;
  scrollLeft: number;
  lastPosition: number;
  lastTime: number;
  velocity: number;
  moving: boolean;
};
type Motion = {
  phase: "inertia" | "snap";
  position: number;
  velocity: number;
  target: number;
};

// Keep the browsing position during a visit, including a trip into a detail page.
const rememberedGalleryIndex = new Map<string, number>();

function slidePosition(track: HTMLDivElement, index: number) {
  const slide = track.querySelectorAll<HTMLElement>(".work-gallery__slide")[
    index
  ];
  if (!slide) return 0;
  return clampGalleryPosition(
    slide.offsetLeft + slide.offsetWidth / 2 - track.clientWidth / 2,
    track.scrollWidth - track.clientWidth,
  );
}

function galleryStops(track: HTMLDivElement) {
  return Array.from(
    track.querySelectorAll(".work-gallery__slide"),
    (_, index) => slidePosition(track, index),
  );
}

export function WorkGallery({
  entries,
  id,
}: {
  entries: Entry[];
  id?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const motionRef = useRef<Motion | null>(null);
  const motionFrameRef = useRef(0);
  const frameTimeRef = useRef(0);
  const visualRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const suppressClickRef = useRef(false);
  const hintId = useId();
  const trackId = useId();
  const [position, setPosition] = useState({
    index: 0,
    previous: false,
    next: entries.length > 1,
  });
  const [viewport, setViewport] = useState<number | undefined>();
  const galleryKey = `${id ?? "gallery"}:${entries.map((entry) => entry.id).join(",")}`;

  function resetVisual(track: HTMLDivElement) {
    visualRef.current = 0;
    track.style.setProperty("--gallery-tilt", "0deg");
    track.style.setProperty("--gallery-roll", "0deg");
    track.style.setProperty("--gallery-scale", "1");
    track.style.setProperty("--gallery-image-shift", "0%");
    track.style.setProperty("--gallery-image-scale", "1.035");
  }

  function stopMotion(reset = true) {
    if (motionFrameRef.current) cancelAnimationFrame(motionFrameRef.current);
    motionFrameRef.current = 0;
    frameTimeRef.current = 0;
    motionRef.current = null;
    const track = trackRef.current;
    if (!track) return;
    delete track.dataset.animating;
    track.style.removeProperty("scroll-snap-type");
    if (reset) resetVisual(track);
  }

  function runMotion(now: number) {
    motionFrameRef.current = 0;
    const track = trackRef.current;
    if (!track) return;
    const seconds = Math.min(
      0.064,
      Math.max(0, (now - (frameTimeRef.current || now - 16.67)) / 1000),
    );
    frameTimeRef.current = now;
    const maximum = Math.max(0, track.scrollWidth - track.clientWidth);
    const motion = motionRef.current;
    let visualVelocity = 0;
    if (motion) {
      const next =
        motion.phase === "inertia"
          ? advanceGalleryInertia(motion, seconds, maximum)
          : advanceGallerySnap(motion, motion.target, seconds, maximum);
      motion.position = next.position;
      motion.velocity = next.velocity;
      track.scrollLeft = next.position;
      visualVelocity = next.velocity;
      if (motion.phase === "inertia" && Math.abs(next.velocity) < 65) {
        motion.phase = "snap";
        motion.target = nearestGalleryStop(next.position, galleryStops(track));
      }
      if (
        motion.phase === "snap" &&
        Math.abs(motion.position - motion.target) < 0.35 &&
        Math.abs(motion.velocity) < 5
      ) {
        track.scrollLeft = clampGalleryPosition(motion.target, maximum);
        motionRef.current = null;
        delete track.dataset.animating;
        track.style.removeProperty("scroll-snap-type");
        visualVelocity = 0;
      }
    } else if (dragRef.current?.moving) {
      const drag = dragRef.current;
      visualVelocity =
        drag.velocity * Math.exp(-Math.max(0, now - drag.lastTime - 32) / 90);
    }
    const target = reducedMotionRef.current
      ? 0
      : Math.max(-1, Math.min(1, visualVelocity / 1600));
    visualRef.current +=
      (target - visualRef.current) * (1 - Math.exp(-seconds / 0.085));
    const visual = visualRef.current;
    track.style.setProperty(
      "--gallery-tilt",
      `${(-visual * 2.6).toFixed(3)}deg`,
    );
    track.style.setProperty(
      "--gallery-roll",
      `${(visual * 0.28).toFixed(3)}deg`,
    );
    track.style.setProperty(
      "--gallery-scale",
      `${(1 - Math.abs(visual) * 0.024).toFixed(4)}`,
    );
    track.style.setProperty(
      "--gallery-image-shift",
      `${(visual * 1.1).toFixed(3)}%`,
    );
    track.style.setProperty(
      "--gallery-image-scale",
      `${(1.035 + Math.abs(visual) * 0.014).toFixed(4)}`,
    );
    if (
      motionRef.current ||
      Math.abs(target) > 0.001 ||
      Math.abs(visual) > 0.001
    ) {
      motionFrameRef.current = requestAnimationFrame(runMotion);
    } else {
      frameTimeRef.current = 0;
      resetVisual(track);
    }
  }

  function scheduleMotion() {
    if (!motionFrameRef.current) {
      if (!frameTimeRef.current) frameTimeRef.current = performance.now();
      motionFrameRef.current = requestAnimationFrame(runMotion);
    }
  }

  function snapTo(target: number, velocity = 0, coast = false) {
    const track = trackRef.current;
    if (!track) return;
    stopMotion(false);
    if (reducedMotionRef.current) {
      resetVisual(track);
      track.scrollLeft = clampGalleryPosition(
        target,
        track.scrollWidth - track.clientWidth,
      );
      return;
    }
    track.style.scrollSnapType = "none";
    track.dataset.animating = "true";
    motionRef.current = {
      phase: coast && Math.abs(velocity) >= 65 ? "inertia" : "snap",
      position: track.scrollLeft,
      velocity,
      target,
    };
    scheduleMotion();
  }

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const remembered = rememberedGalleryIndex.get(galleryKey);
    if (remembered !== undefined && entries.length) {
      track.scrollLeft = slidePosition(
        track,
        Math.min(remembered, entries.length - 1),
      );
    }
    let frame = 0;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = preference.matches;
    const update = () => {
      frame = 0;
      const maximum = Math.max(0, track.scrollWidth - track.clientWidth);
      const left = clampGalleryPosition(track.scrollLeft, maximum);
      const stops = galleryStops(track);
      const nearest = nearestGalleryStop(left, stops);
      const next = {
        index: Math.max(0, stops.indexOf(nearest)),
        previous: left > 2,
        next: left < maximum - 2,
      };
      rememberedGalleryIndex.set(galleryKey, next.index);
      if (rememberedGalleryIndex.size > 32) {
        const oldest = rememberedGalleryIndex.keys().next().value;
        if (oldest !== undefined) rememberedGalleryIndex.delete(oldest);
      }
      setPosition((current) =>
        current.index === next.index &&
        current.previous === next.previous &&
        current.next === next.next
          ? current
          : next,
      );
      setViewport(document.documentElement.clientWidth);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resize = () => {
      interrupt();
      schedule();
    };
    const changePreference = () => {
      reducedMotionRef.current = preference.matches;
      interrupt();
    };
    const interrupt = () => {
      stopMotion();
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag?.moving) {
        suppressClickRef.current = true;
        delete track.dataset.dragging;
        if (track.hasPointerCapture(drag.pointerId))
          track.releasePointerCapture(drag.pointerId);
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(track);
    track
      .querySelectorAll(".work-gallery__slide")
      .forEach((slide) => observer.observe(slide));
    window.addEventListener("resize", resize);
    window.addEventListener("blur", interrupt);
    document.addEventListener("visibilitychange", interrupt);
    track.addEventListener("scroll", schedule, { passive: true });
    preference.addEventListener("change", changePreference);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", interrupt);
      document.removeEventListener("visibilitychange", interrupt);
      track.removeEventListener("scroll", schedule);
      preference.removeEventListener("change", changePreference);
      cancelAnimationFrame(frame);
      interrupt();
    };
  }, [entries, galleryKey]);

  function goTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    dragRef.current = null;
    delete track.dataset.dragging;
    snapTo(
      slidePosition(track, Math.max(0, Math.min(index, entries.length - 1))),
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.target !== event.currentTarget ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(position.index + (event.key === "ArrowRight" ? 1 : -1));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      goTo(event.key === "Home" ? 0 : entries.length - 1);
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    suppressClickRef.current = false;
    stopMotion();
    if (
      event.pointerType !== "mouse" ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      lastPosition: event.currentTarget.scrollLeft,
      lastTime: performance.now(),
      velocity: 0,
      moving: false,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !(event.buttons & 1))
      return;
    const difference = event.clientX - drag.x;
    if (!drag.moving) {
      if (
        Math.abs(difference) < 6 ||
        Math.abs(difference) < Math.abs(event.clientY - drag.y)
      )
        return;
      drag.moving = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.dataset.dragging = "true";
      event.currentTarget.style.scrollSnapType = "none";
    }
    event.preventDefault();
    const now = performance.now();
    const elapsed = Math.max(1, now - drag.lastTime);
    const next = clampGalleryPosition(
      drag.scrollLeft - difference,
      event.currentTarget.scrollWidth - event.currentTarget.clientWidth,
    );
    const sampledVelocity = Math.max(
      -2600,
      Math.min(2600, ((next - drag.lastPosition) / elapsed) * 1000),
    );
    drag.velocity +=
      (sampledVelocity - drag.velocity) * (1 - Math.exp(-elapsed / 48));
    drag.lastPosition = next;
    drag.lastTime = now;
    event.currentTarget.scrollLeft = next;
    if (!reducedMotionRef.current) scheduleMotion();
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.moving) return;
    suppressClickRef.current = true;
    delete event.currentTarget.dataset.dragging;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const velocity =
      drag.velocity *
      Math.exp(-Math.max(0, performance.now() - drag.lastTime) / 100);
    snapTo(
      nearestGalleryStop(
        event.currentTarget.scrollLeft,
        galleryStops(event.currentTarget),
      ),
      velocity,
      event.type === "pointerup",
    );
  }

  function onPointerLeave() {
    if (dragRef.current && !dragRef.current.moving) dragRef.current = null;
  }

  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (
      !suppressClickRef.current ||
      event.detail === 0 ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }

  if (!entries.length)
    return <p className="empty-message">新的作品正在酝酿中。</p>;

  return (
    <div
      id={id}
      className="work-gallery"
      style={
        viewport
          ? ({ "--gallery-viewport": `${viewport}px` } as CSSProperties)
          : undefined
      }
    >
      <div className="work-gallery__tools">
        <p id={hintId} className="work-gallery__hint">
          <span className="work-gallery__desktop-hint">
            拖动，或用方向键浏览
          </span>
          <span className="work-gallery__touch-hint">左右滑动，慢慢看</span>
        </p>
        <div className="work-gallery__navigation">
          <span
            className="work-gallery__position"
            aria-live="polite"
            aria-atomic="true"
          >
            {String(position.index + 1).padStart(2, "0")}
            <span> / {String(entries.length).padStart(2, "0")}</span>
          </span>
          <button
            type="button"
            aria-label="查看上一个作品"
            aria-controls={trackId}
            disabled={!position.previous}
            onClick={() => goTo(position.index - 1)}
          >
            <BrandIcon
              name="arrow"
              size={22}
              className="work-gallery__previous-icon"
            />
          </button>
          <button
            type="button"
            aria-label="查看下一个作品"
            aria-controls={trackId}
            disabled={!position.next}
            onClick={() => goTo(position.index + 1)}
          >
            <BrandIcon
              name="arrow"
              size={22}
              className="work-gallery__next-icon"
            />
          </button>
        </div>
      </div>
      <div
        id={trackId}
        ref={trackRef}
        className="work-gallery__track"
        role="region"
        aria-label="作品画廊"
        aria-describedby={hintId}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onPointerLeave={onPointerLeave}
        onClickCapture={onClickCapture}
        onWheel={() => stopMotion()}
      >
        {entries.map((entry, index) => (
          <article
            className={`work-gallery__slide theme-${entry.theme}`}
            key={entry.id}
          >
            <Link
              href={`/work/${entry.slug}`}
              className="work-gallery__link"
              draggable={false}
            >
              <div className="work-gallery__frame">
                {entry.coverPath ? (
                  <EntryCover
                    entry={entry}
                    className="work-gallery__cover"
                    sizes="(max-width:700px) 86vw, (max-width:1282px) 78vw, 1000px"
                  />
                ) : (
                  <div className="work-gallery__fallback">
                    <span>ALPS / SELECTED WORK</span>
                    <div>
                      <h3>{entry.title}</h3>
                      <p>{entry.subtitle}</p>
                    </div>
                    <BrandIcon name="ridge" width={130} height={65} />
                  </div>
                )}
                <span className="work-gallery__open">
                  <span>查看作品</span>
                  <BrandIcon name="arrow" size={22} />
                </span>
              </div>
              <div className="work-gallery__caption">
                <span className="work-gallery__number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{entry.title}</h3>
                  <p>{entry.category}</p>
                </div>
                <span className="work-gallery__year">{entry.year}</span>
              </div>
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
