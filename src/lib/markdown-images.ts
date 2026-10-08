import { IMAGE_MIME_TYPES } from "./media-policy";

export const MAX_MARKDOWN_LENGTH = 50_000;
export const MAX_MARKDOWN_IMAGES_PER_INSERT = 5;
export const MARKDOWN_IMAGE_LENGTH_ERROR =
  "正文最多 50,000 字，请删减内容后再插入或重试图片。";

type MarkdownChange =
  { ok: true; body: string; selection: number } | { ok: false; error: string };

export function isMarkdownImageType(type: string): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(type);
}

export function markdownImageMarker(id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("图片上传标识无效。");
  }
  return `<!-- alps-image-upload:${id} -->`;
}

export function hasMarkdownImagePlaceholders(body: string): boolean {
  return /<!--\s*alps-image-upload:/i.test(body);
}

function paragraphPadding(text: string, before: boolean): string {
  if (!text) return "";
  const newlines = before ? text.match(/\n*$/)?.[0] : text.match(/^\n*/)?.[0];
  return "\n".repeat(Math.max(0, 2 - (newlines?.length ?? 0)));
}

/** Insert all markers together so completion order cannot reorder the images. */
export function insertMarkdownImageMarkers(
  body: string,
  ids: readonly string[],
  selectionStart = body.length,
  selectionEnd = selectionStart,
  maxLength = MAX_MARKDOWN_LENGTH,
): MarkdownChange {
  const start = Math.max(0, Math.min(body.length, selectionStart));
  const end = Math.max(start, Math.min(body.length, selectionEnd));
  if (!ids.length) return { ok: true, body, selection: start };

  const before = body.slice(0, start);
  const after = body.slice(end);
  const inserted =
    paragraphPadding(before, true) +
    ids.map(markdownImageMarker).join("\n\n") +
    paragraphPadding(after, false);
  const nextBody = before + inserted + after;
  if (nextBody.length > maxLength) {
    return { ok: false, error: MARKDOWN_IMAGE_LENGTH_ERROR };
  }
  return {
    ok: true,
    body: nextBody,
    selection: before.length + inserted.length,
  };
}

export function markdownImageAlt(name: string, clipboard = false): string {
  if (clipboard) return "图片";
  const basename =
    name
      .split("/")
      .at(-1)
      ?.replace(/\.[^.]+$/, "") || "图片";
  return basename
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

export function uploadedMarkdownImage(alt: string, url: string): string {
  // The upload client validates managed URLs; keep this helper safe independently.
  if (!/^https:\/\/[^\s<>"\\]+$/.test(url) || !/^[\x21-\x7e]+$/.test(url)) {
    throw new Error("图片地址无效，请重试上传。");
  }
  const destination = url.replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `![${alt}](${destination})`;
}

/** Resolve against the current text, including markers copied by the author. */
export function replaceMarkdownImageMarker(
  body: string,
  id: string,
  markdown: string,
  maxLength = MAX_MARKDOWN_LENGTH,
): { ok: true; body: string; found: boolean } | { ok: false; error: string } {
  const marker = markdownImageMarker(id);
  if (!body.includes(marker)) return { ok: true, body, found: false };
  const nextBody = body.split(marker).join(markdown);
  if (nextBody.length > maxLength) {
    return { ok: false, error: MARKDOWN_IMAGE_LENGTH_ERROR };
  }
  return { ok: true, body: nextBody, found: true };
}

export function removeMarkdownImageMarker(body: string, id: string): string {
  return body.split(markdownImageMarker(id)).join("");
}
