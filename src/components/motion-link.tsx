"use client";

import NextLink from "next/link";
import { forwardRef, useCallback, useRef } from "react";
import type { ComponentProps } from "react";
import { useSiteMotion } from "@/components/site-motion";

export type MotionLinkProps = Omit<ComponentProps<typeof NextLink>, "ref"> & {
  disableTransition?: boolean;
};

const MotionLink = forwardRef<HTMLAnchorElement, MotionLinkProps>(
  function MotionLink(
    { disableTransition = false, onNavigate, onClick, ...props },
    forwardedRef,
  ) {
    const motion = useSiteMotion();
    const anchorRef = useRef<HTMLAnchorElement | null>(null);
    const pointerNavigationRef = useRef(false);
    const setRef = useCallback(
      (anchor: HTMLAnchorElement | null) => {
        anchorRef.current = anchor;
        if (typeof forwardedRef === "function") forwardedRef(anchor);
        else if (forwardedRef) forwardedRef.current = anchor;
      },
      [forwardedRef],
    );

    return (
      <NextLink
        {...props}
        ref={setRef}
        onClick={(event) => {
          pointerNavigationRef.current =
            event.detail > 0 &&
            event.button === 0 &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.shiftKey;
          if (!pointerNavigationRef.current) motion?.cancel();
          onClick?.(event);
        }}
        onNavigate={(event) => {
          let callerPrevented = false;
          onNavigate?.({
            ...event,
            preventDefault: () => {
              callerPrevented = true;
              event.preventDefault();
            },
          });
          if (
            callerPrevented ||
            disableTransition ||
            !pointerNavigationRef.current ||
            !motion ||
            props.legacyBehavior
          )
            return;
          const href = anchorRef.current?.href;
          if (!href) return;
          if (
            motion.navigate(href, {
              replace: props.replace,
              scroll: props.scroll,
              transitionTypes: props.transitionTypes,
            })
          )
            event.preventDefault();
        }}
      />
    );
  },
);

export { MotionLink };
export default MotionLink;
