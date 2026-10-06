import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDatabaseConfig } from "../src/lib/database-config";
import { createDatabaseClient } from "../src/lib/database-provider";
import { db, closeDb, getEntries } from "../src/lib/db";

test("database configuration requires complete remote credentials and forbids Vercel local fallback", () => {
  const local = resolveDatabaseConfig({
    DATABASE_PATH: "/tmp/alps with spaces.sqlite",
  });
  assert.equal(local.provider, "local");
  if (local.provider === "local")
    assert.equal(fileURLToPath(local.url), local.path);
  for (const url of ["libsql://example.turso.io", "https://example.turso.io"]) {
    assert.deepEqual(
      resolveDatabaseConfig({
        TURSO_DATABASE_URL: ` ${url} `,
        TURSO_AUTH_TOKEN: " example-token ",
        VERCEL: "1",
      }),
      { provider: "turso", url, authToken: "example-token" },
    );
    assert.throws(
      () => resolveDatabaseConfig({ TURSO_DATABASE_URL: url }),
      /TURSO_AUTH_TOKEN/,
    );
    assert.throws(
      () =>
        resolveDatabaseConfig({
          TURSO_DATABASE_URL: url,
          TURSO_AUTH_TOKEN: "  ",
        }),
      /TURSO_AUTH_TOKEN/,
    );
  }
  assert.throws(
    () => resolveDatabaseConfig({ VERCEL: "1" }),
    /Vercel.*本地 SQLite/,
  );
  assert.throws(
    () =>
      resolveDatabaseConfig({
        VERCEL: "1",
        DATABASE_PATH: "/tmp/local.sqlite",
      }),
    /Vercel.*本地 SQLite/,
  );
  assert.throws(
    () => resolveDatabaseConfig({ TURSO_AUTH_TOKEN: "example-token" }),
    /TURSO_DATABASE_URL/,
  );
  for (const url of [
    "not-a-url",
    "file:///tmp/test.sqlite",
    "http://example.test",
    "https://user:secret@example.test",
    "ws://example.test",
  ]) {
    assert.throws(
      () =>
        resolveDatabaseConfig({
          TURSO_DATABASE_URL: url,
          TURSO_AUTH_TOKEN: "example-token",
        }),
      /TURSO_DATABASE_URL/,
    );
  }
});

test("remote provider creates a web HTTP client without opening a local file", async () => {
  const client = await createDatabaseClient({
    provider: "turso",
    url: "https://example.invalid",
    authToken: "test-token",
  });
  try {
    assert.equal(client.protocol, "http");
  } finally {
    client.close();
  }
});

test("a failed connection promise is cleared and corrected configuration can retry", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "alps-config-retry-test-"));
  const path = resolve(directory, "must-not-exist.sqlite");
  const names = [
    "DATABASE_PATH",
    "VERCEL",
    "TURSO_DATABASE_URL",
    "TURSO_AUTH_TOKEN",
  ] as const;
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  await closeDb();
  process.env.DATABASE_PATH = path;
  process.env.VERCEL = "1";
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  try {
    await assert.rejects(db(), /Vercel.*本地 SQLite/);
    assert.equal(existsSync(path), false);
    delete process.env.VERCEL;
    process.env.TURSO_DATABASE_URL = "https://example.invalid";
    await assert.rejects(db(), /TURSO_AUTH_TOKEN/);
    assert.equal(existsSync(path), false);
    delete process.env.TURSO_DATABASE_URL;
    assert.equal((await getEntries(undefined, false)).length, 6);
    assert.equal(existsSync(path), true);
  } finally {
    await closeDb();
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
