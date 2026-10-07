import test from "node:test";
import assert from "node:assert/strict";
import { createClient, type Client } from "@libsql/client";
import { randomBytes, scrypt } from "node:crypto";
import { verifyPassword } from "../src/lib/password";
import {
  createSession,
  validSession,
  revokeSession,
  claimLoginAttempt,
  clearLoginAttempts,
  SESSION_SECONDS,
  LOGIN_WINDOW_MS,
  LOGIN_MAX_ATTEMPTS,
} from "../src/lib/session-store";
import {
  entrySchema,
  profileSchema,
  seedEntries,
  defaultProfile,
} from "../src/lib/content";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  statSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
async function temporaryDb() {
  const directory = mkdtempSync(resolve(tmpdir(), "alps-security-test-"));
  const url = pathToFileURL(resolve(directory, "security.sqlite")).href;
  const clients: Client[] = [];
  const connect = () => {
    const client = createClient({ url });
    clients.push(client);
    return client;
  };
  const close = () => {
    for (const client of clients) if (!client.closed) client.close();
    rmSync(directory, { recursive: true, force: true });
  };
  const database = connect();
  try {
    await database.batch(
      [
        "CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)",
        "CREATE TABLE login_attempts (id INTEGER PRIMARY KEY, count INTEGER NOT NULL, started_at INTEGER NOT NULL)",
      ],
      "write",
    );
  } catch (error) {
    close();
    throw error;
  }
  return { database, connect, close };
}
test("sessions reject tampering, expire, revoke, and invalidate after password reset", async () => {
  const fixture = await temporaryDb();
  const database = fixture.database;
  try {
    const now = 100000;
    const token = await createSession(database, "credential-one", now);
    assert.equal(token.length, 64);
    assert.equal(
      await validSession(database, token, "credential-one", now + 1),
      true,
    );
    assert.equal(
      await validSession(database, "z".repeat(64), "credential-one", now),
      false,
    );
    assert.equal(
      await validSession(database, "a".repeat(64), "credential-one", now),
      false,
    );
    assert.equal(await validSession(database, token, "", now), false);
    assert.equal(
      await validSession(database, token, "credential-two", now),
      false,
    );
    assert.equal(
      await validSession(
        database,
        token,
        "credential-one",
        now + SESSION_SECONDS * 1000 - 1,
      ),
      true,
    );
    assert.equal(
      await validSession(
        database,
        token,
        "credential-one",
        now + SESSION_SECONDS * 1000,
      ),
      false,
    );
    const stored = (
      await database.execute("SELECT token_hash,expires_at FROM sessions")
    ).rows[0];
    assert.notEqual(stored.token_hash, token);
    assert.equal(stored.expires_at, now + SESSION_SECONDS * 1000);
    await revokeSession(database, token, "credential-one");
    assert.equal(
      await validSession(database, token, "credential-one", now),
      false,
    );
  } finally {
    fixture.close();
  }
});
test("login attempts persist the limit and recover at the exact window boundary", async () => {
  const fixture = await temporaryDb();
  const database = fixture.database;
  try {
    const now = 10000;
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++)
      assert.equal(await claimLoginAttempt(database, now + i), true);
    database.close();
    const reopened = fixture.connect();
    assert.equal(await claimLoginAttempt(reopened, now + 500), false);
    assert.equal(
      await claimLoginAttempt(reopened, now + LOGIN_WINDOW_MS - 1),
      false,
    );
    assert.equal(
      await claimLoginAttempt(reopened, now + LOGIN_WINDOW_MS),
      true,
    );
  } finally {
    fixture.close();
  }
});
test("concurrent login claims across clients allow only eight attempts and reset atomically", async () => {
  const fixture = await temporaryDb();
  const clients = [
    fixture.database,
    fixture.connect(),
    fixture.connect(),
    fixture.connect(),
  ];
  try {
    const now = 50000;
    const claimConcurrently = (time: number) =>
      Promise.all(
        Array.from({ length: 32 }, (_, index) =>
          claimLoginAttempt(clients[index % clients.length], time),
        ),
      );
    const claims = await claimConcurrently(now);
    assert.equal(claims.filter(Boolean).length, LOGIN_MAX_ATTEMPTS);
    const stored = (
      await clients[1].execute(
        "SELECT count,started_at FROM login_attempts WHERE id=1",
      )
    ).rows[0];
    assert.equal(stored.count, LOGIN_MAX_ATTEMPTS);
    assert.equal(stored.started_at, now);
    assert.equal(
      (await claimConcurrently(now + LOGIN_WINDOW_MS - 1)).filter(Boolean)
        .length,
      0,
    );
    assert.equal(
      (await claimConcurrently(now + LOGIN_WINDOW_MS)).filter(Boolean).length,
      LOGIN_MAX_ATTEMPTS,
    );
    const renewed = (
      await clients[2].execute(
        "SELECT count,started_at FROM login_attempts WHERE id=1",
      )
    ).rows[0];
    assert.equal(renewed.count, LOGIN_MAX_ATTEMPTS);
    assert.equal(renewed.started_at, now + LOGIN_WINDOW_MS);
    await clearLoginAttempts(clients[0]);
    assert.equal(
      await claimLoginAttempt(clients[3], now + LOGIN_WINDOW_MS + 1),
      true,
    );
    assert.equal(
      (await clients[1].execute("SELECT count FROM login_attempts WHERE id=1"))
        .rows[0].count,
      1,
    );
  } finally {
    fixture.close();
  }
});
test("sessions persist across clients and reopening, expire cleanly, and revoke across instances", async () => {
  const fixture = await temporaryDb();
  try {
    const now = 500000;
    const token = await createSession(
      fixture.database,
      "shared-credential",
      now,
    );
    const peer = fixture.connect();
    assert.equal(
      await validSession(peer, token, "shared-credential", now),
      true,
    );
    fixture.database.close();
    const reopened = fixture.connect();
    assert.equal(
      await validSession(reopened, token, "shared-credential", now),
      true,
    );
    const expired = await createSession(
      peer,
      "shared-credential",
      now - SESSION_SECONDS * 1000,
    );
    assert.equal(
      await validSession(reopened, expired, "shared-credential", now),
      false,
    );
    const replacement = await createSession(reopened, "shared-credential", now);
    assert.notEqual(replacement, token);
    assert.equal(
      (await peer.execute("SELECT token_hash FROM sessions")).rows.length,
      2,
    );
    await revokeSession(peer, token, "shared-credential");
    assert.equal(
      await validSession(reopened, token, "shared-credential", now),
      false,
    );
    assert.equal(
      await validSession(peer, replacement, "shared-credential", now),
      true,
    );
    assert.equal(
      await validSession(peer, replacement, "rotated-credential", now),
      false,
    );
    assert.equal(
      (await reopened.execute("SELECT token_hash FROM sessions")).rows.length,
      1,
    );
  } finally {
    fixture.close();
  }
});
test("password verification rejects wrong passwords and malformed stored hashes", async () => {
  const salt = randomBytes(16);
  const key = await new Promise<Buffer>((resolve, reject) =>
    scrypt(
      "correct-test-password",
      salt,
      64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
  const encoded = salt.toString("hex") + ":" + key.toString("hex");
  assert.equal(await verifyPassword("correct-test-password", encoded), true);
  assert.equal(await verifyPassword("wrong-test-password", encoded), false);
  assert.equal(await verifyPassword("correct-test-password", "invalid"), false);
});
test("content validation rejects script URLs, unsafe slugs, invalid status and oversized content", () => {
  const entry = seedEntries[0];
  assert.equal(entrySchema.safeParse(entry).success, true);
  for (const patch of [
    { url: "javascript:alert(1)" },
    { slug: "../admin" },
    { status: "hidden" },
    { body: "a".repeat(50001) },
    { title: "" },
  ])
    assert.equal(entrySchema.safeParse({ ...entry, ...patch }).success, false);
  assert.equal(profileSchema.safeParse(defaultProfile).success, true);
  assert.equal(
    profileSchema.safeParse({
      ...defaultProfile,
      github: "javascript:alert(1)",
    }).success,
    false,
  );
});
test("cover validation accepts old content and local raster paths while rejecting remote URLs and traversal", () => {
  const {
    coverPath: _coverPath,
    coverAlt: _coverAlt,
    ...legacy
  } = seedEntries[0];
  const parsed = entrySchema.parse(legacy);
  assert.equal(parsed.coverPath, "");
  assert.equal(parsed.coverAlt, "");
  for (const coverPath of [
    "",
    "/images/content/margin-v1.webp",
    "/images/my_photo-2.png",
    "/images/custom/photo.jpeg",
    "/images/custom/photo.avif",
  ]) {
    assert.equal(
      entrySchema.safeParse({ ...legacy, coverPath }).success,
      true,
      coverPath,
    );
  }
  for (const coverPath of [
    "https://example.com/cover.webp",
    "//example.com/cover.webp",
    "data:image/png;base64,abc",
    "/other/cover.webp",
    "/images/../cover.webp",
    "/images/content/../../secret.png",
    "/images/%2e%2e/cover.webp",
    "/images/cover.webp?size=2",
    "/images/cover.webp#fragment",
    "/images/cover.svg",
    "/images//cover.webp",
    "/images/cover.webp/",
    "/images/cover.webp\n",
    "/images/cover.webpx",
    "/images/my photo.webp",
  ]) {
    assert.equal(
      entrySchema.safeParse({ ...legacy, coverPath }).success,
      false,
      coverPath,
    );
  }
  assert.equal(
    entrySchema.safeParse({ ...legacy, coverAlt: "a".repeat(181) }).success,
    false,
  );
});
test("one-character admin setup preserves an environment file with no terminal newline and protects credentials", async () => {
  const temp = mkdtempSync(resolve(tmpdir(), "alps-setup-test-"));
  try {
    writeFileSync(
      resolve(temp, ".env.local"),
      "DATABASE_PATH=data/custom.sqlite",
    );
    execFileSync(process.execPath, [resolve("scripts/setup-admin.mjs")], {
      cwd: temp,
      env: { NODE_ENV: "test", ALPS_ADMIN_PASSWORD: "x" },
      stdio: "pipe",
    });
    const env = readFileSync(resolve(temp, ".env.local"), "utf8");
    assert.match(
      env,
      /DATABASE_PATH=data\/custom.sqlite\nADMIN_PASSWORD_HASH=[a-f0-9]{32}:[a-f0-9]{128}\n/,
    );
    const credential = env.match(/^ADMIN_PASSWORD_HASH=(.+)$/m)?.[1];
    assert.ok(credential);
    assert.equal(await verifyPassword("x", credential), true);
    assert.equal(statSync(resolve(temp, ".env.local")).mode & 0o777, 0o600);
    assert.equal(
      statSync(resolve(temp, "data/admin-access.txt")).mode & 0o777,
      0o600,
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("admin setup rejects explicit empty and oversized passwords without writing credential files", () => {
  const temp = mkdtempSync(resolve(tmpdir(), "alps-setup-invalid-test-"));
  const envPath = resolve(temp, ".env.local");
  const original = "DATABASE_PATH=data/custom.sqlite";
  try {
    writeFileSync(envPath, original);
    for (const password of ["", "x".repeat(257)]) {
      assert.throws(() =>
        execFileSync(process.execPath, [resolve("scripts/setup-admin.mjs")], {
          cwd: temp,
          env: { NODE_ENV: "test", ALPS_ADMIN_PASSWORD: password },
          stdio: "pipe",
        }),
      );
      assert.equal(readFileSync(envPath, "utf8"), original);
      assert.equal(existsSync(resolve(temp, "data/admin-access.txt")), false);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
