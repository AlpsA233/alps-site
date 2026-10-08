import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import type { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { createSchema } from "../src/lib/database-schema";
import {
  claimMediaUploadAttempt,
  getMediaPublicBase,
  isMediaConfigured,
  MEDIA_UPLOAD_MAX_ATTEMPTS,
  MEDIA_UPLOAD_WINDOW_MS,
  MediaUploadError,
  prepareImage,
  uploadMedia,
} from "../src/lib/media";
import {
  isManagedImageUrl,
  MAX_IMAGE_INPUT_BYTES,
  MAX_IMAGE_OUTPUT_BYTES,
} from "../src/lib/media-policy";

const environment = {
  R2_ACCOUNT_ID: "a".repeat(32),
  R2_ACCESS_KEY_ID: "fixture-access-key",
  R2_SECRET_ACCESS_KEY: "fixture-secret-key",
  R2_BUCKET: "fixture-media",
  MEDIA_PUBLIC_BASE_URL: "https://fixture.example.workers.dev",
};

function rejectsStatus(status: number) {
  return (error: unknown) =>
    error instanceof MediaUploadError && error.status === status;
}

async function png(width = 32, height = 20) {
  return sharp({
    create: { width, height, channels: 3, background: "#e6462d" },
  })
    .png()
    .toBuffer();
}

test("media configuration is complete, validated and never returns a partial public base", async () => {
  assert.equal(isMediaConfigured(environment), true);
  assert.equal(
    getMediaPublicBase(environment),
    environment.MEDIA_PUBLIC_BASE_URL,
  );
  for (const key of Object.keys(environment)) {
    const partial = { ...environment, [key]: "" };
    assert.equal(isMediaConfigured(partial), false, key);
    assert.equal(getMediaPublicBase(partial), "", key);
  }
  for (const patch of [
    { R2_ACCOUNT_ID: "account/other" },
    { R2_ACCESS_KEY_ID: "key\nheader" },
    { R2_SECRET_ACCESS_KEY: "secret\nheader" },
    { R2_BUCKET: "../other-bucket" },
    { MEDIA_PUBLIC_BASE_URL: "http://fixture.example.workers.dev" },
    { MEDIA_PUBLIC_BASE_URL: "https://fixture.example.workers.dev/media" },
  ]) {
    assert.equal(isMediaConfigured({ ...environment, ...patch }), false);
  }
  let writes = 0;
  await assert.rejects(
    uploadMedia(await png(), "image/png", "body", {
      environment: {},
      putObject: async () => {
        writes++;
      },
    }),
    rejectsStatus(503),
  );
  assert.equal(writes, 0);
});

test("all supported formats become static WebP with bounded dimensions", async () => {
  const source = sharp({
    create: { width: 2500, height: 1250, channels: 3, background: "#f5f0e7" },
  });
  const formats = [
    [await source.clone().jpeg().toBuffer(), "image/jpeg"],
    [await source.clone().png().toBuffer(), "image/png"],
    [await source.clone().webp().toBuffer(), "image/webp"],
    [await source.clone().avif({ effort: 0 }).toBuffer(), "image/avif"],
  ] as const;
  for (const [input, mime] of formats) {
    const cover = await prepareImage(input, mime, "cover");
    assert.equal(cover.width, 1800);
    assert.equal(cover.height, 900);
    assert.ok(cover.data.length <= MAX_IMAGE_OUTPUT_BYTES);
    assert.equal((await sharp(cover.data).metadata()).format, "webp");
  }
  const body = await prepareImage(formats[0][0], "image/jpeg", "body");
  assert.equal(body.width, 2200);
  assert.equal(body.height, 1100);
  const small = await prepareImage(await png(), "image/png", "body");
  assert.equal(small.width, 32);
  assert.equal(small.height, 20);
});

test("decoding applies EXIF orientation and removes source metadata", async () => {
  const input = await sharp({
    create: { width: 80, height: 40, channels: 3, background: "red" },
  })
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Artist: "private fixture author" } })
    .jpeg()
    .toBuffer();
  const source = await sharp(input).metadata();
  assert.equal(source.orientation, 6);
  assert.ok(source.exif);
  const image = await prepareImage(input, "image/jpeg", "cover");
  assert.equal(image.width, 40);
  assert.equal(image.height, 80);
  const metadata = await sharp(image.data).metadata();
  assert.equal(metadata.orientation, undefined);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
});

test("server rejects forged MIME, corrupt data, SVG, GIF and oversized input", async () => {
  await assert.rejects(
    prepareImage(await png(), "image/jpeg", "body"),
    rejectsStatus(400),
  );
  await assert.rejects(
    prepareImage(Buffer.from("<svg/>"), "image/png", "body"),
    rejectsStatus(400),
  );
  await assert.rejects(
    prepareImage(Buffer.from("GIF89a"), "image/webp", "body"),
    rejectsStatus(400),
  );
  await assert.rejects(
    prepareImage(Buffer.from([255, 216, 255, 0]), "image/jpeg", "body"),
    rejectsStatus(400),
  );
  await assert.rejects(
    prepareImage(Buffer.alloc(MAX_IMAGE_INPUT_BYTES + 1), "image/png", "body"),
    rejectsStatus(413),
  );
  await assert.rejects(
    prepareImage(Buffer.alloc(0), "image/png", "body"),
    rejectsStatus(400),
  );
});

test("server rejects excessive pixels and animation including APNG headers", async () => {
  await assert.rejects(
    prepareImage(await png(8000, 4001), "image/png", "body"),
    rejectsStatus(413),
  );
  const frames = await sharp(
    Buffer.concat([
      Buffer.alloc(20 * 20 * 3, 255),
      Buffer.alloc(20 * 20 * 3, 0),
    ]),
    { raw: { width: 20, height: 40, pageHeight: 20, channels: 3 } },
  )
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  assert.equal((await sharp(frames, { animated: true }).metadata()).pages, 2);
  await assert.rejects(
    prepareImage(frames, "image/webp", "body"),
    rejectsStatus(400),
  );

  // libvips may render the first APNG frame as an ordinary PNG; reject acTL
  // before decoding rather than silently accepting that animated source.
  const ordinary = await png();
  const animationControl = Buffer.alloc(20);
  animationControl.writeUInt32BE(8, 0);
  animationControl.write("acTL", 4);
  animationControl.writeUInt32BE(2, 8);
  const apng = Buffer.concat([
    ordinary.subarray(0, 33),
    animationControl,
    ordinary.subarray(33),
  ]);
  await assert.rejects(
    prepareImage(apng, "image/png", "body"),
    rejectsStatus(400),
  );
});

test("output size is bounded for detailed images without changing their aspect ratio", async () => {
  const input = await sharp(randomBytes(1900 * 1900 * 3), {
    raw: { width: 1900, height: 1900, channels: 3 },
  })
    .jpeg({ quality: 70 })
    .toBuffer();
  assert.ok(input.length <= MAX_IMAGE_INPUT_BYTES);
  const image = await prepareImage(input, "image/jpeg", "body");
  assert.ok(image.data.length <= MAX_IMAGE_OUTPUT_BYTES);
  assert.equal(image.width, 1900);
  assert.equal(image.height, 1900);
});

test("uploads write a fresh immutable WebP object and sanitize storage failures", async () => {
  const commands: PutObjectCommand[] = [];
  const input = await png();
  const options = {
    environment,
    putObject: async (command: PutObjectCommand) => {
      commands.push(command);
    },
  };
  const first = await uploadMedia(input, "image/png", "body", options);
  const second = await uploadMedia(input, "image/png", "cover", options);
  assert.equal(commands.length, 2);
  assert.notEqual(first.url, second.url);
  for (const [index, command] of commands.entries()) {
    assert.equal(command.input.Bucket, "fixture-media");
    assert.match(command.input.Key || "", /^media\/[0-9a-f-]{36}\.webp$/);
    assert.equal(command.input.ContentType, "image/webp");
    assert.equal(
      command.input.CacheControl,
      "public, max-age=31536000, immutable",
    );
    assert.equal(command.input.Metadata, undefined);
    assert.ok(command.input.Body instanceof Buffer);
    const result = index === 0 ? first : second;
    assert.ok(isManagedImageUrl(result.url, environment.MEDIA_PUBLIC_BASE_URL));
    assert.equal(result.size, (command.input.Body as Buffer).length);
    assert.equal(result.format, "webp");
    assert.equal(result.width, 32);
    assert.equal(result.height, 20);
  }
  await assert.rejects(
    uploadMedia(input, "image/png", "body", {
      environment,
      putObject: async () => {
        throw new Error("fixture-secret-key storage detail");
      },
    }),
    (error: unknown) =>
      error instanceof MediaUploadError &&
      error.status === 503 &&
      !error.message.includes("fixture-secret-key"),
  );
});

test("upload quota is atomic across clients and recovers at the exact window boundary", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "alps-media-quota-test-"));
  const url = pathToFileURL(resolve(directory, "fixture.sqlite")).href;
  const database = createClient({ url, timeout: 5000 });
  const peer = createClient({ url, timeout: 5000 });
  try {
    await database.execute("PRAGMA journal_mode=WAL");
    await createSchema(database);
    const now = 2_000_000;
    const results = await Promise.all(
      Array.from({ length: 45 }, (_, index) =>
        claimMediaUploadAttempt(index % 2 ? peer : database, now),
      ),
    );
    assert.equal(results.filter(Boolean).length, MEDIA_UPLOAD_MAX_ATTEMPTS);
    assert.equal(
      await claimMediaUploadAttempt(database, now + MEDIA_UPLOAD_WINDOW_MS - 1),
      false,
    );
    assert.equal(
      await claimMediaUploadAttempt(peer, now + MEDIA_UPLOAD_WINDOW_MS),
      true,
    );
    const row = (
      await database.execute(
        "SELECT count,started_at FROM media_upload_attempts WHERE id=1",
      )
    ).rows[0];
    assert.equal(Number(row.count), 1);
    assert.equal(Number(row.started_at), now + MEDIA_UPLOAD_WINDOW_MS);
  } finally {
    database.close();
    peer.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
