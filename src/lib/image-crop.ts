export type CropSize = { width: number; height: number };
export type CropPoint = { x: number; y: number };
export type CropRect = CropPoint & CropSize;

export type CropGeometry = {
  image: CropSize;
  viewport: CropSize;
  zoom: number;
  scale: number;
  center: CropPoint;
  minCenter: CropPoint;
  maxCenter: CropPoint;
  source: CropRect;
  rendered: CropRect;
};

export const MAX_CROP_ZOOM = 4;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function validSize(size: CropSize) {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}

/** Center coordinates are fractions of the original image, independent of the preview size. */
export function getCropGeometry(
  image: CropSize,
  viewport: CropSize,
  zoom = 1,
  center: CropPoint = { x: 0.5, y: 0.5 },
): CropGeometry {
  if (!validSize(image) || !validSize(viewport)) {
    throw new RangeError(
      "Image and crop dimensions must be positive and finite.",
    );
  }
  const safeZoom = clamp(Number.isFinite(zoom) ? zoom : 1, 1, MAX_CROP_ZOOM);
  const scale =
    Math.max(viewport.width / image.width, viewport.height / image.height) *
    safeZoom;
  const width = Math.min(image.width, viewport.width / scale);
  const height = Math.min(image.height, viewport.height / scale);
  const minCenter = {
    x: width / (2 * image.width),
    y: height / (2 * image.height),
  };
  const maxCenter = { x: 1 - minCenter.x, y: 1 - minCenter.y };
  const clampedCenter = {
    x: clamp(
      Number.isFinite(center.x) ? center.x : 0.5,
      minCenter.x,
      maxCenter.x,
    ),
    y: clamp(
      Number.isFinite(center.y) ? center.y : 0.5,
      minCenter.y,
      maxCenter.y,
    ),
  };
  const source = {
    x: clamp(clampedCenter.x * image.width - width / 2, 0, image.width - width),
    y: clamp(
      clampedCenter.y * image.height - height / 2,
      0,
      image.height - height,
    ),
    width,
    height,
  };
  return {
    image,
    viewport,
    zoom: safeZoom,
    scale,
    center: {
      x: (source.x + width / 2) / image.width,
      y: (source.y + height / 2) / image.height,
    },
    minCenter,
    maxCenter,
    source,
    rendered: {
      x: -source.x * scale,
      y: -source.y * scale,
      width: image.width * scale,
      height: image.height * scale,
    },
  };
}

/** A positive screen delta moves the image right/down, so the crop center moves left/up. */
export function moveCropCenter(
  geometry: CropGeometry,
  delta: CropPoint,
): CropPoint {
  return {
    x: clamp(
      geometry.center.x - delta.x / (geometry.scale * geometry.image.width),
      geometry.minCenter.x,
      geometry.maxCenter.x,
    ),
    y: clamp(
      geometry.center.y - delta.y / (geometry.scale * geometry.image.height),
      geometry.minCenter.y,
      geometry.maxCenter.y,
    ),
  };
}

/** Use whole ratio units so the exported pixel dimensions preserve the selected aspect exactly. */
export function getCropOutputSize(
  source: CropSize,
  aspect: CropSize,
  maxEdge = 1800,
): CropSize {
  if (
    !validSize(source) ||
    !validSize(aspect) ||
    !Number.isInteger(aspect.width) ||
    !Number.isInteger(aspect.height) ||
    !Number.isFinite(maxEdge) ||
    maxEdge < 1
  ) {
    throw new RangeError(
      "Crop output dimensions and integer aspect must be valid.",
    );
  }
  let divisor = aspect.width;
  let remainder = aspect.height;
  while (remainder) {
    [divisor, remainder] = [remainder, divisor % remainder];
  }
  const unit = {
    width: aspect.width / divisor,
    height: aspect.height / divisor,
  };
  const multiplier = Math.floor(
    Math.min(
      source.width / unit.width,
      source.height / unit.height,
      maxEdge / Math.max(unit.width, unit.height),
    ) + 1e-10,
  );
  if (multiplier < 1) {
    throw new RangeError(
      "图片尺寸太小，无法按当前比例输出，请选择其他比例或图片。",
    );
  }
  return { width: unit.width * multiplier, height: unit.height * multiplier };
}
