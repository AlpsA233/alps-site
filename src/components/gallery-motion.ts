export type GalleryMotion = { position: number; velocity: number };

export function clampGalleryPosition(position: number, maximum: number) {
  return Math.max(0, Math.min(position, Math.max(0, maximum)));
}

export function nearestGalleryStop(position: number, stops: readonly number[]) {
  if (!stops.length) return 0;
  return stops.reduce((nearest, stop) =>
    Math.abs(stop - position) < Math.abs(nearest - position) ? stop : nearest,
  );
}

export function advanceGalleryInertia(
  state: GalleryMotion,
  seconds: number,
  maximum: number,
): GalleryMotion {
  const decay = Math.exp(-6.2 * Math.max(0, seconds));
  const proposed = state.position + (state.velocity * (1 - decay)) / 6.2;
  const position = clampGalleryPosition(proposed, maximum);
  return {
    position,
    velocity: position === proposed ? state.velocity * decay : 0,
  };
}

export function advanceGallerySnap(
  state: GalleryMotion,
  target: number,
  seconds: number,
  maximum: number,
): GalleryMotion {
  const time = Math.max(0, seconds);
  const stop = clampGalleryPosition(target, maximum);
  const displacement = state.position - stop;
  const coefficient = state.velocity + 13 * displacement;
  const decay = Math.exp(-13 * time);
  const proposed = stop + (displacement + coefficient * time) * decay;
  const position = clampGalleryPosition(proposed, maximum);
  return {
    position,
    velocity:
      position === proposed
        ? (state.velocity - 13 * coefficient * time) * decay
        : 0,
  };
}
