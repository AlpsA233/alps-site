import test from "node:test";
import assert from "node:assert/strict";
import { entrySchema } from "../src/lib/content";

const entry = {
  kind: "post",
  title: "上传样张",
  subtitle: "",
  slug: "image-sample",
  summary: "图片与文字。",
  body: "一段正文。",
  category: "手记",
  year: "2026",
  tags: "",
  status: "draft",
  theme: "paper",
  url: "",
  coverAlt: "测试封面",
};
const image =
  "https://alps-media.example.workers.dev/media/4cc80711-4f4b-4849-9661-d84719b9df34.webp";

test("entry validation accepts generated cover addresses and rejects arbitrary remote images", () => {
  const parsed = entrySchema.parse({ ...entry, coverPath: image });
  assert.equal(parsed.coverPath, image);
  for (const coverPath of [
    "https://example.com/cover.webp",
    `${image}?token=secret`,
    image.replace("https:", "http:"),
    image.replace(".webp", ".svg"),
    "https://user:secret@example.com/media/4cc80711-4f4b-4849-9661-d84719b9df34.webp",
  ])
    assert.equal(
      entrySchema.safeParse({ ...entry, coverPath }).success,
      false,
      coverPath,
    );
});

test("saved entries cannot contain full or partially edited upload markers", () => {
  for (const kind of ["post", "project"]) {
    for (const body of [
      "正文\n<!-- alps-image-upload:4cc80711-4f4b-4849-9661-d84719b9df34 -->",
      "正文\n<!-- ALPS-IMAGE-UPLOAD:edited",
    ])
      assert.equal(
        entrySchema.safeParse({ ...entry, kind, body, coverPath: "" }).success,
        false,
      );
    assert.equal(
      entrySchema.safeParse({
        ...entry,
        kind,
        body: `正文\n\n![图片](${image})`,
        coverPath: "",
      }).success,
      true,
    );
  }
});
