"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
const damp = (value: number, target: number, dt: number) =>
  value + (target - value) * (1 - Math.exp(-8 * dt));

export function EditorialStage({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [systemReduced, setSystemReduced] = useState(false);

  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const element = root.current;
    if (
      !element ||
      paused ||
      systemReduced ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const hero = element.querySelector<HTMLElement>("[data-hero]");
    const heroFrame = element.querySelector<HTMLElement>("[data-hero-frame]");
    const control = element.querySelector<HTMLButtonElement>(
      "[data-object-control]",
    );
    const manifesto = element.querySelector<HTMLElement>("[data-manifesto]");
    const work = element.querySelector<HTMLElement>("[data-work]");
    const notes = element.querySelector<HTMLElement>("[data-notes]");
    const person = element.querySelector<HTMLElement>("[data-person]");
    const words = [...element.querySelectorAll<HTMLElement>("[data-ink-word]")];
    const cards = [
      ...element.querySelectorAll<HTMLElement>("[data-project-card]"),
    ];
    const magnetics = [
      ...element.querySelectorAll<HTMLElement>("[data-magnetic]"),
    ];
    if (!hero || !heroFrame || !control) return;
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0,
      previous = 0,
      visible = true,
      dirty = true;
    let pointerX = 0,
      pointerY = 0,
      currentX = 0,
      currentY = 0;
    let rotation = 0,
      currentRotation = 0,
      velocity = 0,
      currentProgress = 0,
      targetProgress = 0;
    let dragging = false,
      lastX = 0,
      dragDistance = 0;
    const entryAnimations: Animation[] = [];

    const scrollPaint = () => {
      const viewport = innerHeight;
      const rect = hero.getBoundingClientRect();
      targetProgress =
        innerWidth > 700
          ? clamp(-rect.top / Math.max(1, rect.height - viewport + 84))
          : 0;
      if (manifesto) {
        const bounds = manifesto.getBoundingClientRect();
        const progress = clamp(
          (viewport * 0.88 - bounds.top) / Math.max(1, bounds.height * 0.72),
        );
        words.forEach((word, index) => {
          word.style.opacity = String(
            0.22 + 0.78 * clamp(progress * (words.length + 1) - index),
          );
        });
      }
      if (work && innerWidth > 700) {
        const bounds = work.getBoundingClientRect();
        const progress = clamp(
          (140 - bounds.top) / Math.max(1, bounds.height - viewport * 0.65),
        );
        cards.forEach((card, index) =>
          card.style.setProperty(
            "--card-scale",
            String(1 - 0.065 * clamp(progress * cards.length - index)),
          ),
        );
      }
      if (notes) {
        const bounds = notes.getBoundingClientRect();
        const progress = clamp(
          (viewport - bounds.top) / (viewport + bounds.height),
        );
        notes.style.setProperty(
          "--notes-x",
          `${(progress - 0.5) * (innerWidth > 700 ? 75 : 12)}px`,
        );
        notes.style.setProperty("--notes-turn", `${progress * 160}deg`);
      }
      if (person) {
        const bounds = person.getBoundingClientRect();
        person.style.setProperty(
          "--person-turn",
          `${clamp((viewport - bounds.top) / (viewport + bounds.height)) * 120 - 35}deg`,
        );
      }
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
      if (!dragging && Math.abs(velocity) > 0.05) {
        rotation += velocity * dt * 35;
        velocity *= Math.exp(-6 * dt);
      }
      currentX = damp(currentX, pointerX, dt);
      currentY = damp(currentY, pointerY, dt);
      currentRotation = damp(currentRotation, rotation, dt);
      currentProgress = damp(currentProgress, targetProgress, dt);
      if (visible) {
        hero.style.setProperty("--hero-spread", `${currentProgress * 55}px`);
        hero.style.setProperty("--hero-rise", `${-currentProgress * 30}px`);
        hero.style.setProperty("--hero-turn", `${currentProgress * 5}deg`);
        hero.style.setProperty(
          "--object-x",
          `${currentX - currentProgress * 55}px`,
        );
        hero.style.setProperty(
          "--object-y",
          `${currentY - currentProgress * 90}px`,
        );
        hero.style.setProperty(
          "--object-turn",
          `${-8 + currentRotation + currentProgress * 32}deg`,
        );
        hero.style.setProperty(
          "--object-scale",
          String(1 - currentProgress * 0.12),
        );
        hero.style.setProperty("--cross-turn", `${currentProgress * 180}deg`);
      }
      if (
        visible &&
        (Math.abs(pointerX - currentX) + Math.abs(pointerY - currentY) > 0.08 ||
          Math.abs(rotation - currentRotation) > 0.05 ||
          Math.abs(velocity) > 0.05 ||
          Math.abs(targetProgress - currentProgress) > 0.002)
      )
        frame = requestAnimationFrame(paint);
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
      if (!fine.matches || event.pointerType !== "mouse") return;
      if (dragging) {
        const delta = event.clientX - lastX;
        lastX = event.clientX;
        rotation += delta * 0.38;
        velocity = clamp(delta * 0.38, -14, 14);
        dragDistance += Math.abs(delta);
      } else {
        const bounds = heroFrame.getBoundingClientRect();
        pointerX =
          (clamp((event.clientX - bounds.left) / bounds.width) - 0.5) * 28;
        pointerY =
          (clamp((event.clientY - bounds.top) / bounds.height) - 0.5) * 18;
      }
      schedule();
    };
    const leave = () => {
      if (!dragging) {
        pointerX = pointerY = 0;
        schedule();
      }
    };
    const down = (event: PointerEvent) => {
      if (!fine.matches || event.pointerType !== "mouse" || event.button !== 0)
        return;
      event.preventDefault();
      control.focus({ preventScroll: true });
      dragging = true;
      lastX = event.clientX;
      dragDistance = velocity = 0;
      element.dataset.studioDragging = "true";
      control.setPointerCapture(event.pointerId);
    };
    const release = (event: PointerEvent) => {
      dragging = false;
      delete element.dataset.studioDragging;
      if (control.hasPointerCapture(event.pointerId))
        control.releasePointerCapture(event.pointerId);
      schedule();
    };
    const click = (event: MouseEvent) => {
      if (event.detail === 0 || dragDistance < 5) {
        rotation += 55;
        velocity = 0;
        schedule();
      }
      dragDistance = 0;
    };
    const keyboard = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
      event.preventDefault();
      velocity = 0;
      rotation =
        event.key === "Home"
          ? 0
          : rotation + (event.key === "ArrowLeft" ? -35 : 35);
      schedule();
    };
    const magneticListeners = magnetics.map((target) => {
      const move = (event: PointerEvent) => {
        if (!fine.matches || event.pointerType !== "mouse") return;
        const bounds = target.getBoundingClientRect();
        target.style.setProperty(
          "--mag-x",
          `${clamp(event.clientX - bounds.left - bounds.width / 2, -40, 40) * 0.13}px`,
        );
        target.style.setProperty(
          "--mag-y",
          `${clamp(event.clientY - bounds.top - bounds.height / 2, -40, 40) * 0.13}px`,
        );
      };
      const reset = () => {
        target.style.removeProperty("--mag-x");
        target.style.removeProperty("--mag-y");
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
      for (const entry of entries) {
        if (entry.target === hero) {
          visible = entry.isIntersecting;
          hero.dataset.heroVisible = String(visible);
          if (visible) scroll();
        } else
          (entry.target as HTMLElement).dataset.loopRunning = String(
            entry.isIntersecting && !document.hidden,
          );
      }
    });
    observer.observe(hero);
    element
      .querySelectorAll<HTMLElement>("[data-loop]")
      .forEach((loop) => observer.observe(loop));
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = previous = 0;
        hero.dataset.heroVisible = "false";
        element
          .querySelectorAll<HTMLElement>("[data-loop]")
          .forEach((loop) => (loop.dataset.loopRunning = "false"));
      } else {
        hero.dataset.heroVisible = String(visible);
        element
          .querySelectorAll<HTMLElement>("[data-loop]")
          .forEach(
            (loop) =>
              (loop.dataset.loopRunning = String(
                loop.getBoundingClientRect().bottom > 0 &&
                  loop.getBoundingClientRect().top < innerHeight,
              )),
          );
        scroll();
      }
    };
    const resize = new ResizeObserver(scroll);
    resize.observe(element);
    element.dataset.studioReady = "true";
    // Server-rendered content is readable before the brief entrance sequence.
    element
      .querySelectorAll<HTMLElement>("[data-hero-letter]")
      .forEach((letter, index) => {
        entryAnimations.push(
          letter.animate(
            [
              { transform: "translateY(105%) rotate(9deg)", opacity: 0 },
              { transform: "translateY(0) rotate(0deg)", opacity: 1 },
            ],
            {
              duration: 950,
              delay: 70 * index,
              easing: "cubic-bezier(.16,1.08,.3,1)",
              fill: "backwards",
            },
          ),
        );
      });
    const object = element.querySelector<HTMLElement>("[data-hero-object]");
    if (object)
      entryAnimations.push(
        object.animate(
          [
            {
              opacity: 0,
              transform: "translateY(100px) rotate(-35deg) scale(.68)",
            },
            { opacity: 1, transform: "translateY(0) rotate(-8deg) scale(1)" },
          ],
          {
            duration: 1100,
            delay: 180,
            easing: "cubic-bezier(.16,1,.3,1)",
            fill: "backwards",
          },
        ),
      );
    heroFrame.addEventListener("pointermove", pointer, { passive: true });
    heroFrame.addEventListener("pointerleave", leave);
    control.addEventListener("pointerdown", down);
    control.addEventListener("pointerup", release);
    control.addEventListener("pointercancel", release);
    control.addEventListener("lostpointercapture", release);
    control.addEventListener("click", click);
    control.addEventListener("keydown", keyboard);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", scroll, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    scroll();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      entryAnimations.forEach((animation) => animation.cancel());
      magneticListeners.forEach((cleanup) => cleanup());
      heroFrame.removeEventListener("pointermove", pointer);
      heroFrame.removeEventListener("pointerleave", leave);
      control.removeEventListener("pointerdown", down);
      control.removeEventListener("pointerup", release);
      control.removeEventListener("pointercancel", release);
      control.removeEventListener("lostpointercapture", release);
      control.removeEventListener("click", click);
      control.removeEventListener("keydown", keyboard);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", scroll);
      document.removeEventListener("visibilitychange", visibility);
      delete element.dataset.studioReady;
      delete element.dataset.studioDragging;
      delete hero.dataset.heroVisible;
      [
        "--hero-spread",
        "--hero-rise",
        "--hero-turn",
        "--object-x",
        "--object-y",
        "--object-turn",
        "--object-scale",
        "--cross-turn",
      ].forEach((property) => hero.style.removeProperty(property));
      words.forEach((word) => word.style.removeProperty("opacity"));
      cards.forEach((card) => card.style.removeProperty("--card-scale"));
      notes?.style.removeProperty("--notes-x");
      notes?.style.removeProperty("--notes-turn");
      person?.style.removeProperty("--person-turn");
      element
        .querySelectorAll<HTMLElement>("[data-loop]")
        .forEach((loop) => delete loop.dataset.loopRunning);
    };
  }, [paused, systemReduced]);

  return (
    <div
      ref={root}
      className="editorial-motion"
      data-motion={paused || systemReduced ? "off" : "on"}
    >
      {children}
      {!systemReduced && (
        <button
          type="button"
          className="studio-motion-toggle"
          aria-pressed={paused}
          aria-label={paused ? "开启动效" : "暂停动效"}
          onClick={() => setPaused((value) => !value)}
        >
          动效：{paused ? "停" : "开"}
        </button>
      )}
    </div>
  );
}
