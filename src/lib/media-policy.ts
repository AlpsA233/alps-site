export const MAX_IMAGE_INPUT_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_OUTPUT_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 32_000_000;
export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];
export type MediaPurpose = "cover" | "body";
export type UploadedImage = {
  url: string;
  width: number;
  height: number;
  size: number;
  format: "webp";
};

const uuidPattern =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const imagePathPattern = new RegExp(`^/media/${uuidPattern}\\.webp$`, "i");
// Partial markers are also unfinished uploads when a user edits the placeholder.
const pendingUploadPattern = /<!--\s*alps-image-upload:/i;

export function normalizeMediaPublicBase(value: string | undefined): string {
  if (!value || value !== value.trim()) return "";
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(
        url.hostname,
      ) ||
      /^\d+(?:\.\d+){3}$/.test(url.hostname) ||
      url.hostname.endsWith(".localhost") ||
      // Require a literal origin: URL parsing must not hide a port, backslash,
      // encoded host, dot segment, or even an empty query/fragment delimiter.
      (value !== url.origin && value !== `${url.origin}/`)
    )
      return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function isManagedImageAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      normalizeMediaPublicBase(url.origin) !== "" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      imagePathPattern.test(url.pathname) &&
      value === `${url.origin}${url.pathname}`
    );
  } catch {
    return false;
  }
}

export function isManagedImageUrl(value: string, publicBase: string): boolean {
  const base = normalizeMediaPublicBase(publicBase);
  return (
    base !== "" &&
    isManagedImageAddress(value) &&
    new URL(value).origin === base
  );
}

export function hasPendingImageUpload(body: string): boolean {
  return pendingUploadPattern.test(body);
}
