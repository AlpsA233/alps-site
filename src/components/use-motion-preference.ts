"use client";

import { useSyncExternalStore } from "react";

export const MOTION_PREFERENCE_KEY = "alps-motion-preference";
export const MOTION_PREFERENCE_EVENT = "alps-motion-preference";

type MotionPreference = "on" | "off";

let paused = false;
let initialized = false;
let preferMemory = false;

function readStoredPaused() {
  try {
    return window.localStorage.getItem(MOTION_PREFERENCE_KEY) === "off";
  } catch {
    return paused;
  }
}

function getSnapshot() {
  if (typeof window === "undefined") return false;
  if (!initialized || !preferMemory) {
    paused = readStoredPaused();
    initialized = true;
  }
  return paused;
}

function getServerSnapshot() {
  return false;
}

function subscribe(onStoreChange: () => void) {
  getSnapshot();

  const preferenceChanged = (event: Event) => {
    const preference = (event as CustomEvent<unknown>).detail;
    if (preference !== "on" && preference !== "off") return;
    paused = preference === "off";
    // Same-document events remain authoritative when storage is unavailable.
    try {
      preferMemory =
        window.localStorage.getItem(MOTION_PREFERENCE_KEY) !== preference;
    } catch {
      preferMemory = true;
    }
    onStoreChange();
  };
  const storageChanged = (event: StorageEvent) => {
    if (event.key !== MOTION_PREFERENCE_KEY && event.key !== null) return;
    if (event.storageArea) {
      try {
        if (event.storageArea !== window.localStorage) return;
      } catch {}
    }
    paused = event.key !== null && event.newValue === "off";
    preferMemory = false;
    onStoreChange();
  };

  window.addEventListener(MOTION_PREFERENCE_EVENT, preferenceChanged);
  window.addEventListener("storage", storageChanged);
  // Close the gap between rendering the snapshot and installing listeners.
  if (!preferMemory) {
    const storedPaused = readStoredPaused();
    if (storedPaused !== paused) {
      paused = storedPaused;
      onStoreChange();
    }
  }

  return () => {
    window.removeEventListener(MOTION_PREFERENCE_EVENT, preferenceChanged);
    window.removeEventListener("storage", storageChanged);
  };
}

function togglePaused() {
  paused = !getSnapshot();
  preferMemory = true;
  const preference: MotionPreference = paused ? "off" : "on";
  try {
    window.localStorage.setItem(MOTION_PREFERENCE_KEY, preference);
    preferMemory = false;
  } catch {}
  window.dispatchEvent(
    new CustomEvent<MotionPreference>(MOTION_PREFERENCE_EVENT, {
      detail: preference,
    }),
  );
}

export function useMotionPreference() {
  return {
    paused: useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot),
    togglePaused,
  };
}
