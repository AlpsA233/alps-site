"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMotionPreference } from "@/components/use-motion-preference";
import "./archive-motion.css";

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
const damp = (value: number, target: number, dt: number) =>
  value + (target - value) * (1 - Math.exp(-9 * dt));

export function ArchiveMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const { paused } = useMotionPreference();
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const off =
      paused ||
      reduced ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    const controls = [
      ...element.querySelectorAll<HTMLButtonElement>("[data-archive-control]"),
    ];
    const originalDisabled = controls.map((control) => control.disabled);
    controls.forEach((control) => {
      control.disabled = off;
    });
    element.dataset.archiveReady = "true";
    const restoreControls = () => {
      controls.forEach((control, index) => {
        control.disabled = originalDisabled[index];
      });
      delete element.dataset.archiveReady;
    };
    if (off) return restoreControls;

    const hero = element.querySelector<HTMLElement>("[data-archive-hero]");
    const cards = [
      ...element.querySelectorAll<HTMLElement>("[data-archive-card]"),
    ];
    const tilts = [
      ...element.querySelectorAll<HTMLElement>("[data-archive-tilt]"),
    ];
    const loops = [
      ...element.querySelectorAll<HTMLElement>("[data-archive-loop]"),
    ];
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0,
      previous = 0,
      dirty = true,
      heroVisible = true;
    let pointerX = 0,
      pointerY = 0,
      currentX = 0,
      currentY = 0;
    let targetProgress = 0,
      currentProgress = 0;
    const objects = controls.flatMap((control) => {
      const target = control.closest<HTMLElement>("[data-archive-object]");
      return target
        ? [
            {
              target,
              control,
              rotation: 0,
              currentRotation: 0,
              velocity: 0,
              dragging: false,
              distance: 0,
              lastX: 0,
              lastTime: 0,
              pointerId: null as number | null,
            },
          ]
        : [];
    });

    const scrollPaint = () => {
      if (hero) {
        const bounds = hero.getBoundingClientRect();
        targetProgress = clamp(
          (84 - bounds.top) / Math.max(300, bounds.height * 0.9),
        );
      }
      cards.forEach((card) => {
        const bounds = card.getBoundingClientRect();
        card.style.setProperty(
          "--card-reveal",
          String(
            clamp(
              (innerHeight * 0.96 - bounds.top) /
                Math.max(200, innerHeight * 0.5),
            ),
          ),
        );
      });
      dirty = false;
    };
    const paint = (time: number) => {
      frame = 0;
      if (document.hidden) return;
      const dt = previous
        ? clamp((time - previous) / 1000, 0.001, 0.05)
        : 1 / 60;
      previous = time;
      if (dirty) scrollPaint();
      currentX = damp(currentX, pointerX, dt);
      currentY = damp(currentY, pointerY, dt);
      currentProgress = damp(currentProgress, targetProgress, dt);
      let moving =
        Math.abs(currentX - pointerX) + Math.abs(currentY - pointerY) > 0.08 ||
        Math.abs(currentProgress - targetProgress) > 0.002;
      if (heroVisible && hero) {
        hero.style.setProperty("--archive-x", `${currentX}px`);
        hero.style.setProperty("--archive-y", `${currentY}px`);
        hero.style.setProperty("--archive-progress", String(currentProgress));
        hero.style.setProperty("--archive-turn", `${currentProgress * 18}deg`);
        objects.forEach((object) => {
          if (!object.dragging && Math.abs(object.velocity) > 2) {
            object.rotation += object.velocity * dt;
            object.velocity *= Math.exp(-7 * dt);
          }
          object.currentRotation = damp(
            object.currentRotation,
            object.rotation,
            dt,
          );
          object.target.style.setProperty(
            "--object-turn",
            `${object.currentRotation}deg`,
          );
          object.target.style.setProperty("--object-x", `${currentX}px`);
          object.target.style.setProperty(
            "--object-y",
            `${currentY - currentProgress * 25}px`,
          );
          moving ||=
            Math.abs(object.rotation - object.currentRotation) > 0.05 ||
            Math.abs(object.velocity) > 2;
        });
      }
      if (heroVisible && moving) frame = requestAnimationFrame(paint);
      else previous = 0;
    };
    const schedule = () => {
      if (!frame && !document.hidden) frame = requestAnimationFrame(paint);
    };
    const scroll = () => {
      dirty = true;
      schedule();
    };
    const pointer = (event: PointerEvent) => {
      if (!hero || !fine.matches || event.pointerType !== "mouse") return;
      const bounds = hero.getBoundingClientRect();
      pointerX =
        (clamp((event.clientX - bounds.left) / bounds.width) - 0.5) * 36;
      pointerY =
        (clamp((event.clientY - bounds.top) / bounds.height) - 0.5) * 24;
      schedule();
    };
    const leave = () => {
      pointerX = pointerY = 0;
      schedule();
    };

    const objectCleanups = objects.map((object) => {
      const { control, target } = object;
      const down = (event: PointerEvent) => {
        if (
          !fine.matches ||
          event.pointerType !== "mouse" ||
          event.button !== 0
        )
          return;
        event.preventDefault();
        control.focus({ preventScroll: true });
        object.pointerId = event.pointerId;
        object.dragging = true;
        object.distance = object.velocity = 0;
        object.lastX = event.clientX;
        object.lastTime = event.timeStamp;
        target.dataset.dragging = "true";
        control.setPointerCapture(event.pointerId);
      };
      const move = (event: PointerEvent) => {
        if (!object.dragging || object.pointerId !== event.pointerId) return;
        const delta = event.clientX - object.lastX;
        const elapsed = clamp(
          (event.timeStamp - object.lastTime) / 1000,
          0.008,
          0.05,
        );
        object.rotation += delta * 0.4;
        object.velocity = clamp((delta * 0.4) / elapsed, -260, 260);
        object.distance += Math.abs(delta);
        object.lastX = event.clientX;
        object.lastTime = event.timeStamp;
        schedule();
      };
      const release = (event: PointerEvent) => {
        if (object.pointerId !== event.pointerId) return;
        if (
          event.type !== "pointerup" ||
          event.timeStamp - object.lastTime > 100
        )
          object.velocity = 0;
        object.dragging = false;
        object.pointerId = null;
        delete target.dataset.dragging;
        if (control.hasPointerCapture(event.pointerId))
          control.releasePointerCapture(event.pointerId);
        schedule();
      };
      const click = (event: MouseEvent) => {
        if (event.detail === 0 || object.distance < 5) {
          object.rotation += 45;
          object.velocity = 0;
          schedule();
        }
        object.distance = 0;
      };
      const key = (event: KeyboardEvent) => {
        if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
        event.preventDefault();
        object.rotation =
          event.key === "Home"
            ? 0
            : object.rotation + (event.key === "ArrowLeft" ? -30 : 30);
        object.velocity = 0;
        schedule();
      };
      control.addEventListener("pointerdown", down);
      control.addEventListener("pointermove", move, { passive: true });
      control.addEventListener("pointerup", release);
      control.addEventListener("pointercancel", release);
      control.addEventListener("lostpointercapture", release);
      control.addEventListener("click", click);
      control.addEventListener("keydown", key);
      return () => {
        control.removeEventListener("pointerdown", down);
        control.removeEventListener("pointermove", move);
        control.removeEventListener("pointerup", release);
        control.removeEventListener("pointercancel", release);
        control.removeEventListener("lostpointercapture", release);
        control.removeEventListener("click", click);
        control.removeEventListener("keydown", key);
        if (
          object.pointerId !== null &&
          control.hasPointerCapture(object.pointerId)
        )
          control.releasePointerCapture(object.pointerId);
        delete target.dataset.dragging;
        ["--object-turn", "--object-x", "--object-y"].forEach((property) =>
          target.style.removeProperty(property),
        );
      };
    });

    const tiltCleanups = tilts.map((target) => {
      const move = (event: PointerEvent) => {
        if (!fine.matches || event.pointerType !== "mouse") return;
        const bounds = target.getBoundingClientRect();
        const x = clamp((event.clientX - bounds.left) / bounds.width) - 0.5;
        const y = clamp((event.clientY - bounds.top) / bounds.height) - 0.5;
        target.style.setProperty("--tilt-x", `${-y * 8}deg`);
        target.style.setProperty("--tilt-y", `${x * 8}deg`);
        target.style.setProperty("--cover-x", `${x * 14}px`);
        target.style.setProperty("--cover-y", `${y * 14}px`);
      };
      const reset = () => {
        ["--tilt-x", "--tilt-y", "--cover-x", "--cover-y"].forEach((property) =>
          target.style.removeProperty(property),
        );
      };
      target.addEventListener("pointermove", move, { passive: true });
      target.addEventListener("pointerleave", reset);
      return () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerleave", reset);
        reset();
      };
    });
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === hero) {
          heroVisible = entry.isIntersecting;
          if (!heroVisible)
            objects.forEach((object) => {
              object.velocity = 0;
            });
          else scroll();
        } else
          (entry.target as HTMLElement).dataset.loopRunning = String(
            entry.isIntersecting && !document.hidden,
          );
      });
    });
    if (hero) observer.observe(hero);
    loops.forEach((loop) => observer.observe(loop));
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = previous = 0;
        objects.forEach((object) => {
          object.velocity = 0;
        });
        loops.forEach((loop) => {
          loop.dataset.loopRunning = "false";
        });
      } else {
        loops.forEach((loop) => {
          const bounds = loop.getBoundingClientRect();
          loop.dataset.loopRunning = String(
            bounds.bottom > 0 && bounds.top < innerHeight,
          );
        });
        scroll();
      }
    };
    const resize = new ResizeObserver(scroll);
    resize.observe(element);
    hero?.addEventListener("pointermove", pointer, { passive: true });
    hero?.addEventListener("pointerleave", leave);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", scroll, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    scroll();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      objectCleanups.forEach((cleanup) => cleanup());
      tiltCleanups.forEach((cleanup) => cleanup());
      hero?.removeEventListener("pointermove", pointer);
      hero?.removeEventListener("pointerleave", leave);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", scroll);
      document.removeEventListener("visibilitychange", visibility);
      [
        "--archive-progress",
        "--archive-x",
        "--archive-y",
        "--archive-turn",
      ].forEach((property) => hero?.style.removeProperty(property));
      cards.forEach((card) => card.style.removeProperty("--card-reveal"));
      loops.forEach((loop) => delete loop.dataset.loopRunning);
      restoreControls();
    };
  }, [children, paused, reduced]);

  return (
    <div
      ref={root}
      className="archive-motion"
      data-archive-motion={paused || reduced ? "off" : "on"}
    >
      {children}
    </div>
  );
}
