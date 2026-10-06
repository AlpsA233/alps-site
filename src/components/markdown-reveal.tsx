"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

const isPlainPrimaryClick = (
  event: Pick<
    MouseEvent,
    "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
  >,
) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

export function DeletedText({ children }: { children: ReactNode }) {
  const textId = useId();
  const deletion = useRef<HTMLModElement>(null);
  const timer = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [insideLink, setInsideLink] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [timed, setTimed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const revealed = ready && !dismissed && (hovered || focused || timed);
  const revealedState = useRef(false);

  const cancelTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    cancelTimer();
    revealedState.current = false;
    setTimed(false);
    // An active hover/focus must not immediately undo Escape or a second click.
    setDismissed(true);
  }, [cancelTimer]);

  const revealTemporarily = useCallback(() => {
    cancelTimer();
    // Native link listeners need the new state before a rapid second click arrives.
    revealedState.current = true;
    setDismissed(false);
    setTimed(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setTimed(false);
    }, 5000);
  }, [cancelTimer]);

  useEffect(() => {
    revealedState.current = revealed;
  }, [revealed]);

  useEffect(() => {
    const link = deletion.current?.closest("a");
    setInsideLink(Boolean(link));
    // Without hydration, a deletion remains readable and has no inactive control.
    setReady(true);
    if (!link) return cancelTimer;

    // An outer Markdown link receives focus and clicks outside the child <del>.
    const focus = () => {
      if (link.matches(":focus-visible")) {
        revealedState.current = true;
        setFocused(true);
        setDismissed(false);
      }
    };
    const blur = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (!(next instanceof Node) || !link.contains(next)) setFocused(false);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && revealedState.current) {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      }
    };
    const click = (event: MouseEvent) => {
      if (revealedState.current || !isPlainPrimaryClick(event)) return;
      event.preventDefault();
      revealTemporarily();
    };
    link.addEventListener("focus", focus);
    link.addEventListener("blur", blur);
    link.addEventListener("keydown", keyDown, true);
    link.addEventListener("click", click, true);
    return () => {
      cancelTimer();
      link.removeEventListener("focus", focus);
      link.removeEventListener("blur", blur);
      link.removeEventListener("keydown", keyDown, true);
      link.removeEventListener("click", click, true);
    };
  }, [cancelTimer, dismiss, revealTemporarily]);

  const toggle = () => {
    if (revealed) dismiss();
    else revealTemporarily();
  };

  return (
    <del
      ref={deletion}
      className="markdown-deletion"
      data-ready={ready ? "true" : undefined}
      data-revealed={revealed ? "true" : "false"}
      onClick={(event) => {
        if (insideLink) return;
        const link =
          event.target instanceof Element ? event.target.closest("a") : null;
        if (link && (revealed || !isPlainPrimaryClick(event))) return;
        event.preventDefault();
        revealTemporarily();
      }}
      onPointerEnter={(event) => {
        if (
          (event.pointerType === "mouse" || event.pointerType === "pen") &&
          window.matchMedia("(hover: hover) and (pointer: fine)").matches
        ) {
          setHovered(true);
          setDismissed(false);
        }
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={(event) => {
        // Pointer/touch focus should not extend the five-second reveal indefinitely.
        if (event.target.matches(":focus-visible")) {
          setFocused(true);
          setDismissed(false);
        }
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && revealed) {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        }
      }}
    >
      <span id={textId} className="markdown-deletion__text">
        {children}
      </span>
      {ready && !insideLink && (
        <button
          type="button"
          className="markdown-deletion__trigger"
          aria-controls={textId}
          aria-expanded={revealed}
          aria-label={
            revealed ? "收起删除内容" : "临时显示删除内容，约5秒后收起"
          }
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            aria-hidden="true"
          >
            <path d="M2 9s2.5-4.5 7-4.5S16 9 16 9s-2.5 4.5-7 4.5S2 9 2 9Z" />
            <circle cx="9" cy="9" r="2" />
          </svg>
          <span className="sr-only">
            {revealed ? "收起删除内容" : "临时显示删除内容"}
          </span>
        </button>
      )}
    </del>
  );
}
