"use client";

import { useEffect, useRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { SITE_TRANSITION_END, useSiteMotion } from "@/components/site-motion";

type MotionRevealProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "span";
  children: ReactNode;
  /** Milliseconds between successive lines. */
  delay?: number;
};

export function MotionReveal({
  as: Element = "div",
  children,
  className = "",
  delay = 0,
  ...props
}: MotionRevealProps) {
  const wrapperRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const hasPlayedRef = useRef(false);
  const motion = useSiteMotion();
  const motionRef = useRef(motion);
  useEffect(() => {
    motionRef.current = motion;
  }, [motion]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content || hasPlayedRef.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches || typeof content.animate !== "function") return;
    let animation: Animation | null = null;
    let observer: IntersectionObserver | null = null;
    const visible = () => {
      const rect = wrapper.getBoundingClientRect();
      return (
        rect.bottom > 0 &&
        rect.top < window.innerHeight * 0.98 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const reveal = (afterTransition = false) => {
      if (
        hasPlayedRef.current ||
        reduced.matches ||
        (!afterTransition && motionRef.current?.transitioning) ||
        !visible()
      )
        return;
      hasPlayedRef.current = true;
      wrapper.dataset.motionReady = "true";
      content.style.willChange = "transform";
      // The animation owns its temporary transform; static HTML is always visible.
      animation = content.animate(
        [
          { transform: "translateY(calc(110% + 0.35em))" },
          { transform: "translateY(0)" },
        ],
        {
          duration: 580,
          delay: Math.max(0, Math.min(300, delay)),
          easing: "cubic-bezier(0.22, 0.68, 0.18, 1)",
          fill: "backwards",
        },
      );
      animation.finished
        .then(() => {
          content.style.removeProperty("will-change");
        })
        .catch(() => {});
      observer?.disconnect();
    };
    const transitionFinished = () => {
      reveal(true);
    };
    const reducedChanged = () => {
      if (reduced.matches) {
        animation?.cancel();
        content.style.removeProperty("will-change");
        observer?.disconnect();
      }
    };
    const focus = () => {
      hasPlayedRef.current = true;
      animation?.cancel();
      observer?.disconnect();
      content.style.removeProperty("will-change");
    };
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) reveal();
        },
        { threshold: 0.1, rootMargin: "0px 0px -2% 0px" },
      );
      observer.observe(wrapper);
    }
    reveal();
    window.addEventListener(SITE_TRANSITION_END, transitionFinished);
    reduced.addEventListener("change", reducedChanged);
    wrapper.addEventListener("focusin", focus);
    return () => {
      // StrictMode can clean up the first animation before its first frame.
      if (animation && animation.playState !== "finished")
        hasPlayedRef.current = false;
      animation?.cancel();
      observer?.disconnect();
      content.style.removeProperty("will-change");
      window.removeEventListener(SITE_TRANSITION_END, transitionFinished);
      reduced.removeEventListener("change", reducedChanged);
      wrapper.removeEventListener("focusin", focus);
    };
  }, [delay]);

  return (
    <Element
      {...props}
      ref={(element) => {
        wrapperRef.current = element;
      }}
      className={`motion-reveal ${className}`.trim()}
    >
      <Element
        ref={(element) => {
          contentRef.current = element;
        }}
        className="motion-reveal__content"
      >
        {children}
      </Element>
    </Element>
  );
}

export default MotionReveal;
