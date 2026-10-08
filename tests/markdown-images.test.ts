import test from "node:test";
import assert from "node:assert/strict";
import {
  hasMarkdownImagePlaceholders,
  insertMarkdownImageMarkers,
  isMarkdownImageType,
  MARKDOWN_IMAGE_LENGTH_ERROR,
  markdownImageAlt,
  markdownImageMarker,
  MAX_MARKDOWN_LENGTH,
  removeMarkdownImageMarker,
  replaceMarkdownImageMarker,
  uploadedMarkdownImage,
} from "../src/lib/markdown-images";

const first = "5fe7f9fa-2b83-483d-a324-6a6a4cdfe012";
const second = "dde9c622-96af-4a3c-9d62-6a41ec5efbc2";
const firstMarker = markdownImageMarker(first);
const secondMarker = markdownImageMarker(second);
const firstImage = uploadedMarkdownImage(
  "第一张",
  "https://images.example/first.webp",
);
const secondImage = uploadedMarkdownImage(
  "第二张",
  "https://images.example/second.webp",
);

test("image markers replace the selection and form separate Markdown paragraphs", () => {
  const result = insertMarkdownImageMarkers(
    "前段选中后段",
    [first, second],
    2,
    4,
  );
  assert.ok(result.ok);
  assert.equal(
    result.body,
    `前段\n\n${firstMarker}\n\n${secondMarker}\n\n后段`,
  );
  assert.equal(result.selection, result.body.indexOf("后段"));

  const betweenParagraphs = insertMarkdownImageMarkers(
    "前段\n\n后段",
    [first],
    4,
  );
  assert.ok(betweenParagraphs.ok);
  assert.equal(betweenParagraphs.body, `前段\n\n${firstMarker}\n\n后段`);

  const empty = insertMarkdownImageMarkers("", [first]);
  assert.ok(empty.ok);
  assert.equal(empty.body, firstMarker);
  assert.equal(empty.selection, firstMarker.length);
});

test("missing selections append while supplied selections stay within the current body", () => {
  const appended = insertMarkdownImageMarkers("前文\n", [first]);
  assert.ok(appended.ok);
  assert.equal(appended.body, `前文\n\n${firstMarker}`);

  const clamped = insertMarkdownImageMarkers("前文", [first], -10, 99);
  assert.ok(clamped.ok);
  assert.equal(clamped.body, firstMarker);

  const unchanged = insertMarkdownImageMarkers("前文", [], 1);
  assert.ok(unchanged.ok);
  assert.deepEqual(unchanged, { ok: true, body: "前文", selection: 1 });
});

test("out-of-order completions preserve image order and intervening author edits", () => {
  const insertion = insertMarkdownImageMarkers(
    "开头\n\n结尾",
    [first, second],
    4,
  );
  assert.ok(insertion.ok);
  const edited = `新增开头\n\n${insertion.body}\n\n刚写的结尾`;
  const secondCompleted = replaceMarkdownImageMarker(
    edited,
    second,
    secondImage,
  );
  assert.ok(secondCompleted.ok);
  assert.ok(secondCompleted.found);
  assert.ok(secondCompleted.body.includes(firstMarker));
  const firstCompleted = replaceMarkdownImageMarker(
    secondCompleted.body,
    first,
    firstImage,
  );
  assert.ok(firstCompleted.ok);
  assert.equal(
    firstCompleted.body,
    `新增开头\n\n开头\n\n${firstImage}\n\n${secondImage}\n\n结尾\n\n刚写的结尾`,
  );
  assert.equal(hasMarkdownImagePlaceholders(firstCompleted.body), false);
});

test("deleted markers and another article prevent stale completions from changing text", () => {
  for (const body of ["作者删除了占位符", "另一篇文章", ""]) {
    assert.deepEqual(replaceMarkdownImageMarker(body, first, firstImage), {
      ok: true,
      body,
      found: false,
    });
  }
  const existingImage = "![手动填写的图片](https://images.example/manual.webp)";
  assert.deepEqual(
    replaceMarkdownImageMarker(existingImage, first, firstImage),
    {
      ok: true,
      body: existingImage,
      found: false,
    },
  );
});

test("copied markers resolve together without leaving a completed upload placeholder", () => {
  const body = `复制前文\n\n${firstMarker}\n\n复制后文\n\n${firstMarker}\n\n${secondMarker}`;
  const completed = replaceMarkdownImageMarker(body, first, firstImage);
  assert.ok(completed.ok);
  assert.equal(completed.body.split(firstImage).length - 1, 2);
  assert.ok(completed.body.endsWith(secondMarker));
  assert.ok(!completed.body.includes(firstMarker));
});

test("removal changes only the matching marker and preserves the author's whitespace", () => {
  const body = `\n\n前文\n\n${firstMarker}\n\n${secondMarker}\n\n${firstMarker}\n\n后文\n`;
  assert.equal(
    removeMarkdownImageMarker(body, first),
    `\n\n前文\n\n\n\n${secondMarker}\n\n\n\n后文\n`,
  );
  assert.equal(removeMarkdownImageMarker("没有占位符", first), "没有占位符");
});

test("insertion refuses an over-limit body without returning partial inserted content", () => {
  const body = "字".repeat(MAX_MARKDOWN_LENGTH - firstMarker.length - 2);
  const atLimit = insertMarkdownImageMarkers(body, [first]);
  assert.ok(atLimit.ok);
  assert.equal(atLimit.body.length, MAX_MARKDOWN_LENGTH);

  const refused = insertMarkdownImageMarkers(`${body}字`, [first]);
  assert.deepEqual(refused, { ok: false, error: MARKDOWN_IMAGE_LENGTH_ERROR });
  assert.equal(hasMarkdownImagePlaceholders(body), false);

  const fullBody = "字".repeat(MAX_MARKDOWN_LENGTH);
  const replaceSelection = insertMarkdownImageMarkers(
    fullBody,
    [first],
    0,
    fullBody.length,
  );
  assert.ok(replaceSelection.ok);
  assert.equal(replaceSelection.body, firstMarker);
});

test("a body edited up to the limit keeps its recoverable marker until space is available", () => {
  const longImage = uploadedMarkdownImage(
    "一段较长的图片说明",
    `https://images.example/${"a".repeat(100)}.webp`,
  );
  const body = `${"字".repeat(MAX_MARKDOWN_LENGTH - firstMarker.length)}${firstMarker}`;
  const refused = replaceMarkdownImageMarker(body, first, longImage);
  assert.deepEqual(refused, { ok: false, error: MARKDOWN_IMAGE_LENGTH_ERROR });
  assert.ok(body.endsWith(firstMarker));

  const shortened = body.slice(200);
  const retried = replaceMarkdownImageMarker(shortened, first, longImage);
  assert.ok(retried.ok);
  assert.ok(retried.body.endsWith(longImage));
  assert.ok(retried.body.length <= MAX_MARKDOWN_LENGTH);
});

test("the limit considers every copied marker before applying a replacement", () => {
  const body = `${firstMarker}\n\n${firstMarker}`;
  const longImage = uploadedMarkdownImage(
    "图片",
    `https://images.example/${"a".repeat(100)}.webp`,
  );
  const refusal = replaceMarkdownImageMarker(
    body,
    first,
    longImage,
    body.length + longImage.length,
  );
  assert.deepEqual(refusal, { ok: false, error: MARKDOWN_IMAGE_LENGTH_ERROR });
});

test("image labels escape Markdown syntax and collapse line breaks", () => {
  assert.equal(markdownImageAlt("travel.note.jpg"), "travel.note");
  assert.equal(markdownImageAlt("folder/风景.png"), "风景");
  assert.equal(
    markdownImageAlt("[相片]\\重拍\r\n说明.png"),
    "\\[相片\\]\\\\重拍 说明",
  );
  assert.equal(markdownImageAlt("image.png", true), "图片");
  assert.equal(markdownImageAlt(""), "图片");
  assert.equal(
    uploadedMarkdownImage(
      markdownImageAlt("[相片].png"),
      "https://images.example/a(b).webp",
    ),
    "![\\[相片\\]](https://images.example/a%28b%29.webp)",
  );
});

test("reserved markers and supported image types are explicit", () => {
  assert.ok(hasMarkdownImagePlaceholders(firstMarker));
  assert.ok(
    hasMarkdownImagePlaceholders("<!-- alps-image-upload:accidentally-edited"),
  );
  assert.ok(hasMarkdownImagePlaceholders("<!--\nALPS-IMAGE-UPLOAD:broken -->"));
  assert.equal(
    hasMarkdownImagePlaceholders("普通正文 <!-- 作者注释 -->"),
    false,
  );
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif"]) {
    assert.equal(isMarkdownImageType(type), true);
  }
  for (const type of [
    "",
    "text/plain",
    "image/gif",
    "image/svg+xml",
    "image/jpg",
  ]) {
    assert.equal(isMarkdownImageType(type), false);
  }
  assert.throws(() => markdownImageMarker("bad --> marker"), /标识无效/);
});

test("invalid image URLs cannot inject Markdown or an unsafe destination", () => {
  for (const url of [
    "javascript:alert(1)",
    "http://images.example/a.webp",
    "https://images.example/a.webp)\n![evil](https://evil.example/b.webp",
    "https://images.example/风景.webp",
    "https://images.example/\\image.webp",
    "https://images.example/<image>.webp",
  ]) {
    assert.throws(() => uploadedMarkdownImage("图片", url), /地址无效/);
  }
});
