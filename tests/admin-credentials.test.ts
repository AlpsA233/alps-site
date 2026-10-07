import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { createSchema } from "../src/lib/database-schema";
import {
  getAdminCredential,
  changeAdminPassword,
  resetAdminCredential,
} from "../src/lib/admin-credentials";
import {
  hashPassword,
  isPasswordHash,
  verifyPassword,
} from "../src/lib/password";
import {
  createSession,
  validSession,
  claimLoginAttempt,
  claimPasswordChangeAttempt,
  clearPasswordChangeAttempts,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
} from "../src/lib/session-store";

const originalPassword = "fixture-original-password";
const replacementPassword = "fixture-replacement-password";
let originalHash: string;
let replacementHash: string;

before(async () => {
  // Reuse two real hashes; do not hash a password again for every fixture.
  originalHash = await hashPassword(originalPassword);
  replacementHash = await hashPassword(replacementPassword);
});

test("password hashing rejects empty and oversized passwords", async () => {
  await assert.rejects(hashPassword(""));
  await assert.rejects(hashPassword("x".repeat(257)));
});

async function fixture() {
  const directory = mkdtempSync(
    resolve(tmpdir(), "alps-admin-credential-test-"),
  );
  const url = pathToFileURL(resolve(directory, "credentials.sqlite")).href;
  const clients: Client[] = [];
  function connect() {
    const client = createClient({ url, timeout: 5000 });
    clients.push(client);
    return client;
  }
  const first = connect();
  const second = connect();
  const close = () => {
    for (const client of clients) if (!client.closed) client.close();
    rmSync(directory, { recursive: true, force: true });
  };
  try {
    await first.execute("PRAGMA journal_mode=WAL");
    await first.execute("PRAGMA busy_timeout=5000");
    await second.execute("PRAGMA busy_timeout=5000");
    await createSchema(first);
    return { first, second, connect, close };
  } catch (error) {
    close();
    throw error;
  }
}

async function rows(database: Client) {
  return (
    await database.execute(
      "SELECT id,password_hash,updated_at FROM admin_credentials ORDER BY id",
    )
  ).rows;
}

function passwordInput(
  sessionToken: string,
  patch: Record<string, unknown> = {},
) {
  return {
    sessionToken,
    currentPassword: originalPassword,
    newPassword: replacementPassword,
    confirmPassword: replacementPassword,
    ...patch,
  };
}

test("admin credentials reject absent or malformed bootstrap values and initialize only from a valid hash", async () => {
  const value = await fixture();
  try {
    for (const bootstrap of [
      undefined,
      "",
      "plain-text-is-not-a-hash",
      "a".repeat(32) + ":" + "b".repeat(127),
    ]) {
      assert.equal(await getAdminCredential(value.first, bootstrap), null);
      assert.equal((await rows(value.first)).length, 0);
    }
    assert.ok(isPasswordHash(originalHash));
    assert.ok(isPasswordHash(replacementHash));
    for (const invalid of [undefined, null, 42, {}, "", "not-a-hash"])
      assert.equal(isPasswordHash(invalid), false);
    assert.ok(
      (await getAdminCredential(value.first, originalHash)) === originalHash,
    );
    assert.equal((await rows(value.first)).length, 1);
  } finally {
    value.close();
  }
});

test("concurrent first clients agree on one bootstrap credential and later environment changes never overwrite it", async () => {
  const value = await fixture();
  try {
    const initialized = await Promise.all([
      getAdminCredential(value.first, originalHash),
      getAdminCredential(value.second, replacementHash),
      getAdminCredential(value.first, originalHash),
      getAdminCredential(value.second, replacementHash),
    ]);
    assert.ok(
      initialized[0] === originalHash || initialized[0] === replacementHash,
    );
    assert.ok(initialized.every((credential) => credential === initialized[0]));
    assert.equal((await rows(value.first)).length, 1);
    const before = await rows(value.first);
    for (const bootstrap of [
      undefined,
      "broken",
      originalHash,
      replacementHash,
    ]) {
      assert.ok(
        (await getAdminCredential(value.second, bootstrap)) === initialized[0],
      );
      assert.deepEqual(await rows(value.first), before);
    }
  } finally {
    value.close();
  }
});

test("password rotation is immediate across clients, survives reconnecting, ignores old environment hashes and revokes every device", async () => {
  const value = await fixture();
  try {
    await getAdminCredential(value.first, originalHash);
    const currentDevice = await createSession(value.first, originalHash);
    const otherDevice = await createSession(value.second, originalHash);
    const result = await changeAdminPassword(
      value.first,
      originalHash,
      passwordInput(currentDevice),
    );
    assert.deepEqual(result, { ok: true });
    const updated = await getAdminCredential(value.second, originalHash);
    assert.ok(updated && isPasswordHash(updated) && updated !== originalHash);
    assert.equal(await verifyPassword(replacementPassword, updated), true);
    assert.equal(await verifyPassword(originalPassword, updated), false);
    assert.equal(
      await validSession(value.first, currentDevice, updated),
      false,
    );
    assert.equal(await validSession(value.second, otherDevice, updated), false);
    assert.equal(
      (await value.first.execute("SELECT token_hash FROM sessions")).rows
        .length,
      0,
    );
    assert.ok(
      (await getAdminCredential(value.connect(), undefined)) === updated,
    );
    const newSession = await createSession(value.second, updated);
    assert.equal(await validSession(value.first, newSession, updated), true);
  } finally {
    value.close();
  }
});

test("one-character and eleven-character passwords rotate successfully across clients and revoke previous sessions", async () => {
  const value = await fixture();
  try {
    let credential = await getAdminCredential(value.first, originalHash);
    assert.ok(credential);
    let currentPassword = originalPassword;
    for (const newPassword of ["x", "y".repeat(11)]) {
      const currentToken = await createSession(value.first, credential);
      const otherToken = await createSession(value.second, credential);
      assert.deepEqual(
        await changeAdminPassword(
          value.first,
          originalHash,
          passwordInput(currentToken, {
            currentPassword,
            newPassword,
            confirmPassword: newPassword,
          }),
        ),
        { ok: true },
      );
      const rotated = await getAdminCredential(value.second, originalHash);
      assert.ok(rotated && rotated !== credential);
      assert.equal(await verifyPassword(newPassword, rotated), true);
      assert.equal(await verifyPassword(currentPassword, rotated), false);
      assert.equal(
        await validSession(value.first, currentToken, rotated),
        false,
      );
      assert.equal(
        await validSession(value.second, otherToken, rotated),
        false,
      );
      assert.equal(
        (await value.first.execute("SELECT token_hash FROM sessions")).rows
          .length,
        0,
      );
      credential = rotated;
      currentPassword = newPassword;
    }
    assert.ok(
      (await getAdminCredential(value.connect(), undefined)) === credential,
    );
  } finally {
    value.close();
  }
});

test("wrong current password and missing, malformed, or expired sessions cannot rotate a credential", async () => {
  const value = await fixture();
  try {
    await getAdminCredential(value.first, originalHash);
    const validToken = await createSession(value.first, originalHash);
    const expiredToken = await createSession(value.first, originalHash, 1);
    const before = await rows(value.first);
    for (const input of [
      passwordInput(validToken, { currentPassword: "fixture-wrong-password" }),
      passwordInput(validToken, { currentPassword: null }),
      passwordInput(""),
      passwordInput("invalid-token"),
      passwordInput("0".repeat(64)),
      passwordInput(expiredToken),
    ]) {
      const result = await changeAdminPassword(
        value.first,
        originalHash,
        input,
      );
      assert.equal(result.ok, false);
      if (!result.ok)
        assert.ok(typeof result.error === "string" && result.error.length > 0);
      assert.deepEqual(await rows(value.first), before);
    }
    assert.equal(
      await validSession(value.second, validToken, originalHash),
      true,
    );
  } finally {
    value.close();
  }
});

test("mismatched confirmation, empty, oversized, repeated and non-string passwords leave the credential and current session intact", async () => {
  const value = await fixture();
  try {
    await getAdminCredential(value.first, originalHash);
    const sessionToken = await createSession(value.first, originalHash);
    const before = await rows(value.first);
    for (const patch of [
      { confirmPassword: "fixture-other-confirmation" },
      { newPassword: "", confirmPassword: "" },
      { newPassword: "x".repeat(257), confirmPassword: "x".repeat(257) },
      { newPassword: originalPassword, confirmPassword: originalPassword },
      { newPassword: 123, confirmPassword: 123 },
      { newPassword: replacementPassword, confirmPassword: null },
    ]) {
      const result = await changeAdminPassword(
        value.first,
        originalHash,
        passwordInput(sessionToken, patch),
      );
      assert.equal(result.ok, false);
      assert.deepEqual(await rows(value.first), before);
    }
    assert.equal(
      await validSession(value.second, sessionToken, originalHash),
      true,
    );
  } finally {
    value.close();
  }
});

test("password changes have their own eight-attempt limit and cannot reuse login capacity", async () => {
  const value = await fixture();
  try {
    await getAdminCredential(value.first, originalHash);
    const sessionToken = await createSession(value.first, originalHash);
    for (let index = 0; index < LOGIN_MAX_ATTEMPTS; index++) {
      const result = await changeAdminPassword(
        value.first,
        originalHash,
        passwordInput(sessionToken, {
          currentPassword: "fixture-wrong-password",
        }),
      );
      assert.equal(result.ok, false);
    }
    // A correct password must now be blocked, rather than allowing unlimited retries.
    const blocked = await changeAdminPassword(
      value.second,
      originalHash,
      passwordInput(sessionToken),
    );
    assert.equal(blocked.ok, false);
    assert.ok(
      (await getAdminCredential(value.first, originalHash)) === originalHash,
    );
    assert.equal(await claimLoginAttempt(value.second), true);
    assert.equal(
      await validSession(value.first, sessionToken, originalHash),
      true,
    );
    await value.first.execute({
      sql: "UPDATE password_change_attempts SET started_at=? WHERE id=1",
      args: [Date.now() - LOGIN_WINDOW_MS - 1],
    });
    assert.deepEqual(
      await changeAdminPassword(
        value.second,
        originalHash,
        passwordInput(sessionToken),
      ),
      { ok: true },
    );
    assert.equal(
      (await value.first.execute("SELECT count FROM password_change_attempts"))
        .rows.length,
      0,
    );
  } finally {
    value.close();
  }
});

test("password-change throttling is atomic across clients and recovers at the ten-minute boundary", async () => {
  const value = await fixture();
  const now = 1000000;
  try {
    const claims = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        claimPasswordChangeAttempt(index % 2 ? value.first : value.second, now),
      ),
    );
    assert.equal(claims.filter(Boolean).length, 8);
    assert.equal(claims.filter((claim) => !claim).length, 4);
    assert.equal(
      await claimPasswordChangeAttempt(value.second, now + LOGIN_WINDOW_MS - 1),
      false,
    );
    assert.equal(
      await claimPasswordChangeAttempt(value.first, now + LOGIN_WINDOW_MS),
      true,
    );
    await clearPasswordChangeAttempts(value.second);
    assert.equal(
      (await value.first.execute("SELECT count FROM password_change_attempts"))
        .rows.length,
      0,
    );
    assert.equal(await claimPasswordChangeAttempt(value.first, now), true);
  } finally {
    value.close();
  }
});

test("exhausted login limits do not block a valid password change and successful rotation clears login throttling", async () => {
  const value = await fixture();
  try {
    await getAdminCredential(value.first, originalHash);
    const sessionToken = await createSession(value.first, originalHash);
    for (let index = 0; index < LOGIN_MAX_ATTEMPTS; index++)
      assert.equal(await claimLoginAttempt(value.first), true);
    assert.equal(await claimLoginAttempt(value.second), false);
    assert.deepEqual(
      await changeAdminPassword(
        value.second,
        originalHash,
        passwordInput(sessionToken),
      ),
      { ok: true },
    );
    assert.equal(
      (await value.first.execute("SELECT count FROM login_attempts")).rows
        .length,
      0,
    );
    assert.equal(
      (await value.first.execute("SELECT count FROM password_change_attempts"))
        .rows.length,
      0,
    );
    assert.equal(await claimLoginAttempt(value.first), true);
  } finally {
    value.close();
  }
});

test("concurrent valid rotations have exactly one winner and cannot overwrite an intervening credential", async () => {
  const value = await fixture();
  try {
    await getAdminCredential(value.first, originalHash);
    const firstToken = await createSession(value.first, originalHash);
    const secondToken = await createSession(value.second, originalHash);
    const results = await Promise.all([
      changeAdminPassword(value.first, originalHash, passwordInput(firstToken)),
      changeAdminPassword(
        value.second,
        originalHash,
        passwordInput(secondToken),
      ),
    ]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(results.filter((result) => !result.ok).length, 1);
    const final = await getAdminCredential(value.first, undefined);
    assert.ok(final && final !== originalHash);
    assert.equal(await verifyPassword(replacementPassword, final), true);
    assert.equal(await validSession(value.first, firstToken, final), false);
    assert.equal(await validSession(value.second, secondToken, final), false);
  } finally {
    value.close();
  }
});

test("CLI recovery rejects invalid hashes, persists the new credential and revokes all sessions and login limits", async () => {
  const value = await fixture();
  try {
    await getAdminCredential(value.first, originalHash);
    const firstToken = await createSession(value.first, originalHash);
    const secondToken = await createSession(value.second, originalHash);
    const before = await rows(value.first);
    await assert.rejects(resetAdminCredential(value.first, "not-a-valid-hash"));
    assert.deepEqual(await rows(value.first), before);
    assert.equal(
      await validSession(value.second, firstToken, originalHash),
      true,
    );
    for (let index = 0; index < LOGIN_MAX_ATTEMPTS; index++)
      await claimLoginAttempt(value.first);
    assert.equal(await claimLoginAttempt(value.first), false);
    for (let index = 0; index < 8; index++)
      await claimPasswordChangeAttempt(value.first);
    assert.equal(await claimPasswordChangeAttempt(value.first), false);
    await resetAdminCredential(value.second, replacementHash);
    assert.ok(
      (await getAdminCredential(value.first, originalHash)) === replacementHash,
    );
    assert.ok(
      (await getAdminCredential(value.connect(), undefined)) ===
        replacementHash,
    );
    assert.equal(
      await validSession(value.first, firstToken, replacementHash),
      false,
    );
    assert.equal(
      await validSession(value.second, secondToken, replacementHash),
      false,
    );
    assert.equal(
      (await value.first.execute("SELECT token_hash FROM sessions")).rows
        .length,
      0,
    );
    assert.equal(
      (await value.first.execute("SELECT count FROM login_attempts")).rows
        .length,
      0,
    );
    assert.equal(
      (await value.first.execute("SELECT count FROM password_change_attempts"))
        .rows.length,
      0,
    );
    assert.equal(await claimLoginAttempt(value.first), true);
    assert.equal(await claimPasswordChangeAttempt(value.first), true);
  } finally {
    value.close();
  }
});
