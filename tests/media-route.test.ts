import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { NextRequest } from "next/server";
import {
  claimMediaUploadAttempt,
  createMediaUploadHandler,
  MediaUploadError,
  readImageBody,
} from "../src/lib/media";
import { createSchema } from "../src/lib/database-schema";
import {
  MAX_IMAGE_INPUT_BYTES,
  type UploadedImage,
} from "../src/lib/media-policy";

const uploaded: UploadedImage = {
  url: "https://fixture.example.workers.dev/media/4cc80711-4f4b-4849-9661-d84719b9df34.webp",
  width: 40,
  height: 20,
  size: 50,
  format: "webp",
};

function fixture(
  options: {
    admin?: boolean;
    configured?: boolean;
    quota?: boolean;
    uploadError?: Error;
  } = {},
) {
  const calls: string[] = [];
  const handler = createMediaUploadHandler({
    isAdmin: async () => {
      calls.push("auth");
      return options.admin ?? true;
    },
    claimAttempt: async () => {
      calls.push("quota");
      return options.quota ?? true;
    },
    isConfigured: () => {
      calls.push("config");
      return options.configured ?? true;
    },
    upload: async (input, mime, purpose) => {
      calls.push("upload");
      assert.deepEqual(input, Buffer.from("fixture"));
      assert.equal(mime, "image/png");
      assert.equal(purpose, "body");
      if (options.uploadError) throw options.uploadError;
      return uploaded;
    },
  });
  return { handler, calls };
}

function request(
  options: {
    origin?: string | null;
    url?: string;
    mime?: string;
    headers?: Record<string, string>;
    body?: BodyInit | null;
  } = {},
) {
  const url =
    options.url ||
    "https://preview.example.vercel.app/api/admin/media?purpose=body";
  const headers = new Headers({
    "content-type": options.mime || "image/png",
    ...options.headers,
  });
  if (options.origin !== null)
    headers.set("origin", options.origin || new URL(url).origin);
  return new Request(url, {
    method: "POST",
    headers,
    body: options.body === undefined ? "fixture" : options.body,
  });
}

test("origin and authorization failures leave the request body completely unread", async () => {
  for (const origin of [
    null,
    "https://evil.example",
    "null",
    "https://preview.example.vercel.app/path",
    "https://preview.example.vercel.app:8443",
  ]) {
    const value = fixture();
    const incoming = request({ origin });
    const response = await value.handler(incoming);
    assert.equal(response.status, 403);
    assert.equal(incoming.bodyUsed, false);
    assert.deepEqual(value.calls, []);
  }
  const value = fixture({ admin: false });
  const incoming = request();
  const response = await value.handler(incoming);
  assert.equal(response.status, 401);
  assert.equal(incoming.bodyUsed, false);
  assert.deepEqual(value.calls, ["auth"]);
});

test("same-origin preview and local ports use their actual request origin", async () => {
  for (const url of [
    "https://preview.example.vercel.app/api/admin/media?purpose=body",
    "http://127.0.0.1:3007/api/admin/media?purpose=body",
    "http://localhost:3011/api/admin/media?purpose=body",
  ]) {
    const value = fixture();
    const response = await value.handler(request({ url }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), uploaded);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(value.calls, ["auth", "quota", "config", "upload"]);
  }
});

test("actual NextRequest uses the validated browser Host despite loopback URL normalization", async () => {
  for (const [url, host, origin] of [
    ["http://127.0.0.1:3007", "127.0.0.1:3007", "http://127.0.0.1:3007"],
    ["http://localhost:3011", "localhost:3011", "http://localhost:3011"],
    ["http://[::1]:3007", "[::1]:3007", "http://[::1]:3007"],
    [
      "https://127.0.0.1:3007",
      "preview.example.vercel.app",
      "https://preview.example.vercel.app",
    ],
    [
      "https://preview.example.vercel.app",
      "preview.example.vercel.app",
      "https://preview.example.vercel.app",
    ],
    ["http://127.0.0.1:80", "127.0.0.1:80", "http://127.0.0.1"],
    [
      "https://preview.example.vercel.app:443",
      "preview.example.vercel.app:443",
      "https://preview.example.vercel.app",
    ],
    [
      "https://preview.example.vercel.app",
      "PREVIEW.EXAMPLE.VERCEL.APP",
      "https://preview.example.vercel.app",
    ],
  ]) {
    const value = fixture();
    const incoming = new NextRequest(`${url}/api/admin/media?purpose=body`, {
      method: "POST",
      headers: {
        host,
        origin,
        "content-type": "image/png",
        "x-forwarded-host": "ignored.evil.example",
      },
      body: "fixture",
    });
    assert.equal(
      (await value.handler(incoming)).status,
      200,
      `${host} ${origin}`,
    );
    assert.deepEqual(value.calls, ["auth", "quota", "config", "upload"]);
  }
});

test("invalid Host authorities and cross-origin aliases fail before authentication or body reading", async () => {
  for (const host of [
    "",
    "user@preview.example.vercel.app",
    "user:password@preview.example.vercel.app",
    "preview.example.vercel.app/path",
    "preview.example.vercel.app\\path",
    "preview.example.vercel.app?query",
    "preview.example.vercel.app#fragment",
    "%70review.example.vercel.app",
    "preview..example.vercel.app",
    "-preview.example.vercel.app",
    "preview-.example.vercel.app",
    "preview.example.vercel.app:0",
    "preview.example.vercel.app:65536",
    "preview.example.vercel.app:0443",
    "preview.example.vercel.app:443:443",
    "preview.example.vercel.app:",
    "preview.example.vercel.app,evil.example",
    "http://preview.example.vercel.app",
    "127.1:3007",
    "0x7f000001:3007",
    "2130706433:3007",
    "::1:3007",
    "[invalid]:3007",
    "[::1]junk:3007",
  ]) {
    const value = fixture();
    const incoming = request({ headers: { host } });
    assert.equal((await value.handler(incoming)).status, 403, host);
    assert.deepEqual(value.calls, [], host);
    assert.equal(incoming.bodyUsed, false, host);
  }

  for (const [url, host, origin] of [
    ["http://127.0.0.1:3007", "127.0.0.1:3007", "http://localhost:3007"],
    ["http://localhost:3007", "localhost:3007", "http://127.0.0.1:3007"],
    ["http://localhost:3007", "localhost:3007", "http://localhost:3008"],
    [
      "https://preview.example.vercel.app",
      "preview.example.vercel.app",
      "http://preview.example.vercel.app",
    ],
    [
      "https://preview.example.vercel.app",
      "preview.example.vercel.app",
      "https://ignored.evil.example",
    ],
  ]) {
    const value = fixture();
    const incoming = new NextRequest(`${url}/api/admin/media?purpose=body`, {
      method: "POST",
      headers: {
        host,
        origin,
        "content-type": "image/png",
        "x-forwarded-host": "ignored.evil.example",
      },
      body: "fixture",
    });
    assert.equal((await value.handler(incoming)).status, 403);
    assert.deepEqual(value.calls, []);
    assert.equal(incoming.bodyUsed, false);
  }
});

test("quota, missing configuration and metadata failures are checked before reading", async () => {
  for (const [options, status] of [
    [{ quota: false }, 429],
    [{ configured: false }, 503],
  ] as const) {
    const value = fixture(options);
    const incoming = request();
    assert.equal((await value.handler(incoming)).status, status);
    assert.equal(incoming.bodyUsed, false);
    assert.ok(!value.calls.includes("upload"));
  }
  const invalidRequests: NonNullable<Parameters<typeof request>[0]>[] = [
    { url: "https://preview.example.vercel.app/api/admin/media?purpose=other" },
    { mime: "image/svg+xml" },
    { mime: "image/gif" },
    { mime: "image/png; charset=utf-8" },
    { headers: { "content-encoding": "gzip" } },
    { headers: { "content-length": "invalid" } },
  ];
  for (const options of invalidRequests) {
    const value = fixture();
    const incoming = request(options);
    assert.equal((await value.handler(incoming)).status, 400);
    assert.equal(incoming.bodyUsed, false);
    assert.ok(!value.calls.includes("upload"));
  }
});

test("bounded reading rejects dishonest lengths, cancels oversized streams and accepts the exact limit", async () => {
  const tooLarge = request({
    headers: { "content-length": String(MAX_IMAGE_INPUT_BYTES + 1) },
  });
  await assert.rejects(
    readImageBody(tooLarge),
    (error: unknown) =>
      error instanceof MediaUploadError && error.status === 413,
  );
  assert.equal(tooLarge.bodyUsed, false);

  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_IMAGE_INPUT_BYTES));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() {
      cancelled = true;
    },
  });
  const oversized = new Request("https://fixture.example/api", {
    method: "POST",
    headers: { "content-length": "1" },
    body: stream,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(
    readImageBody(oversized),
    (error: unknown) =>
      error instanceof MediaUploadError && error.status === 413,
  );
  assert.equal(cancelled, true);

  const exact = request({
    body: new Uint8Array(MAX_IMAGE_INPUT_BYTES),
    headers: { "content-length": "1" },
  });
  assert.equal((await readImageBody(exact)).length, MAX_IMAGE_INPUT_BYTES);
  for (const body of [null, ""]) {
    await assert.rejects(
      readImageBody(request({ body })),
      (error: unknown) =>
        error instanceof MediaUploadError && error.status === 400,
    );
  }
});

test("typed image failures retain safe status messages and unknown failures are sanitized", async () => {
  for (const [error, status] of [
    [new MediaUploadError(400, "图片格式无效。"), 400],
    [new MediaUploadError(413, "图片过大。"), 413],
    [new MediaUploadError(503, "图片存储不可用。"), 503],
    [new Error("secret fixture details"), 503],
  ] as const) {
    const value = fixture({ uploadError: error });
    const response = await value.handler(request());
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(typeof body.error, "string");
    assert.equal(
      JSON.stringify(body).includes("secret fixture details"),
      false,
    );
  }
  const handler = createMediaUploadHandler({
    isAdmin: async () => {
      throw new Error("secret auth details");
    },
    claimAttempt: async () => {
      throw new Error("unreachable");
    },
    isConfigured: () => true,
    upload: async () => uploaded,
  });
  const incoming = request();
  const response = await handler(incoming);
  assert.equal(response.status, 503);
  assert.equal(incoming.bodyUsed, false);
  assert.equal(
    JSON.stringify(await response.json()).includes("secret auth details"),
    false,
  );
});

test("malformed and failed authorized requests consume the shared quota", async () => {
  const database = createClient({ url: ":memory:" });
  try {
    await createSchema(database);
    let uploads = 0;
    const handler = createMediaUploadHandler({
      isAdmin: async () => true,
      claimAttempt: () => claimMediaUploadAttempt(database, 1_000_000),
      isConfigured: () => true,
      upload: async () => {
        uploads++;
        throw new MediaUploadError(503, "存储失败。");
      },
    });
    for (let index = 0; index < 30; index++) {
      const response = await handler(
        request(index % 2 ? { mime: "image/gif" } : {}),
      );
      assert.equal(response.status, index % 2 ? 400 : 503);
    }
    const last = request();
    assert.equal((await handler(last)).status, 429);
    assert.equal(last.bodyUsed, false);
    assert.equal(uploads, 15);
  } finally {
    database.close();
  }
});
