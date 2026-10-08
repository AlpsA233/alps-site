import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/media-worker.mjs";

const url =
  "https://alps-media.example.workers.dev/media/82a70ca4-a22c-4c52-9e25-32d85f0a22b7.webp";
const data = new Uint8Array([1, 2, 3]);
function bucket() {
  const calls: string[] = [];
  const object = { size: data.length, httpEtag: '"image-v1"', body: data };
  return {
    calls,
    binding: {
      get: async (key: string) => {
        calls.push(`get:${key}`);
        return object;
      },
      head: async (key: string) => {
        calls.push(`head:${key}`);
        return object;
      },
    },
  };
}
test("worker exposes only UUID image reads and does not allow public writes or listing", async () => {
  const store = bucket();
  for (const [method, path] of [
    ["PUT", url],
    ["DELETE", url],
    ["GET", "https://alps-media.example.workers.dev/"],
    ["GET", url + "?download=true"],
    ["GET", url.replace(".webp", ".svg")],
  ]) {
    const response = await worker.fetch(new Request(path, { method }), {
      MEDIA_BUCKET: store.binding,
    });
    assert.ok([404, 405].includes(response.status));
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(store.calls.length, 0);
});
test("GET streams WebP with an immutable cache and HEAD uses metadata without the body", async () => {
  const store = bucket();
  const response = await worker.fetch(new Request(url), {
    MEDIA_BUCKET: store.binding,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), data);
  const head = await worker.fetch(new Request(url, { method: "HEAD" }), {
    MEDIA_BUCKET: store.binding,
  });
  assert.equal(await head.text(), "");
  assert.equal(head.headers.get("content-length"), "3");
  assert.ok(store.calls[1].startsWith("head:"));
});
test("conditional reads return 304; missing objects and failed storage are never cached", async () => {
  const store = bucket();
  const conditional = await worker.fetch(
    new Request(url, { headers: { "If-None-Match": 'W/"image-v1"' } }),
    { MEDIA_BUCKET: store.binding },
  );
  assert.equal(conditional.status, 304);
  assert.equal(conditional.body, null);
  const absent = await worker.fetch(new Request(url), {
    MEDIA_BUCKET: { get: async () => null },
  });
  assert.equal(absent.status, 404);
  assert.equal(absent.headers.get("cache-control"), "no-store");
  const failure = await worker.fetch(new Request(url), {
    MEDIA_BUCKET: {
      get: async () => {
        throw new Error("private credential");
      },
    },
  });
  assert.equal(failure.status, 502);
  assert.doesNotMatch(await failure.text(), /credential/);
});
