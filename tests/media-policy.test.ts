import test from "node:test";
import assert from "node:assert/strict";
import {
  hasPendingImageUpload,
  isManagedImageAddress,
  isManagedImageUrl,
  normalizeMediaPublicBase,
} from "../src/lib/media-policy";

const base = "https://alps-media.example.workers.dev";
const id = "4cc80711-4f4b-4849-9661-d84719b9df34";
const image = `${base}/media/${id}.webp`;

test("public media bases require a literal HTTPS public origin", () => {
  for (const value of [base, `${base}/`, "https://images.example.com"]) {
    assert.equal(normalizeMediaPublicBase(value), value.replace(/\/$/, ""));
  }
  for (const value of [
    undefined,
    "",
    "http://images.example.com",
    "https://user:secret@images.example.com",
    "https://images.example.com:443",
    "https://images.example.com:8443",
    "https://images.example.com/media",
    "https://images.example.com/../",
    "https://images.example.com?",
    "https://images.example.com?token=secret",
    "https://images.example.com#",
    "https://images.example.com#fragment",
    "https://localhost",
    "https://test.localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://images.example.com/ ",
    " https://images.example.com",
    "https://images.example.com\\",
    "https://%69mages.example.com",
  ]) {
    assert.equal(normalizeMediaPublicBase(value), "", String(value));
  }
});

test("managed image addresses have only the generated media path and trusted origin", () => {
  assert.equal(isManagedImageAddress(image), true);
  assert.equal(isManagedImageUrl(image, base), true);
  assert.equal(isManagedImageUrl(image, `${base}/`), true);
  assert.equal(isManagedImageUrl(image, ""), false);
  assert.equal(isManagedImageUrl(image, "https://other.example.com"), false);
  assert.equal(
    isManagedImageAddress(`https://other.example.com/media/${id}.webp`),
    true,
  );
  for (const value of [
    "",
    `/media/${id}.webp`,
    image.replace("https:", "http:"),
    image.replace(base, `${base}.evil.example`),
    image.replace("https://", "https://user:password@"),
    image.replace(base, `${base}:443`),
    image.replace(base, `${base}:8443`),
    `${image}?token=secret`,
    `${image}?`,
    `${image}#fragment`,
    `${image}#`,
    `${base}/images/${id}.webp`,
    `${base}/media/${id}.png`,
    `${base}/media/${id}.svg`,
    `${base}/media/file.webp`,
    `${base}/media/../media/${id}.webp`,
    `${base}/media/%2e%2e/media/${id}.webp`,
    `${base}/media%2f${id}.webp`,
    `${base}//media/${id}.webp`,
    `${image}/`,
    `${image}\n`,
  ]) {
    assert.equal(isManagedImageUrl(value, base), false, value);
    if (!value.includes(".evil.example"))
      assert.equal(isManagedImageAddress(value), false, value);
  }
});

test("pending upload markers cannot slip into saved Markdown even when partially edited", () => {
  for (const body of [
    `正文\n\n<!-- alps-image-upload:${id} -->`,
    `<!--alps-image-upload:${id}-->`,
    "<!-- alps-image-upload:partially-edited",
    "<!-- ALPS-IMAGE-UPLOAD:",
  ])
    assert.equal(hasPendingImageUpload(body), true);
  for (const body of ["", `![图片](${image})`, "普通注释 <!-- 已完成 -->"])
    assert.equal(hasPendingImageUpload(body), false);
});
