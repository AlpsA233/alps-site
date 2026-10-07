import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { createSchema } from "../src/lib/database-schema";
import { hashPassword } from "../src/lib/password";
import {
  changeAdminPassword,
  getAdminCredential,
} from "../src/lib/admin-credentials";
import {
  createSession,
  revokeSession,
  validSession,
} from "../src/lib/session-store";

const currentPassword = "regression-original-password";
const newPassword = "regression-replacement-password";
let credential: string;

before(async () => {
  credential = await hashPassword(currentPassword);
});

async function fixture() {
  const directory = mkdtempSync(
    resolve(tmpdir(), "alps-credential-races-test-"),
  );
  const url = pathToFileURL(resolve(directory, "fixture.sqlite")).href;
  const database = createClient({ url, timeout: 5000 });
  const peer = createClient({ url, timeout: 5000 });
  const close = () => {
    database.close();
    peer.close();
    rmSync(directory, { recursive: true, force: true });
  };
  try {
    await database.execute("PRAGMA journal_mode=WAL");
    await createSchema(database);
    await getAdminCredential(database, credential);
    return { database, peer, close };
  } catch (error) {
    close();
    throw error;
  }
}

function passwordInput(sessionToken: string) {
  return {
    sessionToken,
    currentPassword,
    newPassword,
    confirmPassword: newPassword,
  };
}

async function credentialRows(database: Client) {
  return (
    await database.execute(
      "SELECT password_hash,updated_at FROM admin_credentials WHERE id=1",
    )
  ).rows;
}

test("a sessions DELETE failure rolls back the password update and every device session", async () => {
  const value = await fixture();
  try {
    const currentDevice = await createSession(value.database, credential);
    const otherDevice = await createSession(value.peer, credential);
    const previousCredential = await credentialRows(value.database);
    const previousSessions = (
      await value.database.execute(
        "SELECT token_hash,expires_at FROM sessions ORDER BY token_hash",
      )
    ).rows;
    await value.database.execute(
      "CREATE TRIGGER fail_session_deletion BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT, 'fixture session deletion failure'); END",
    );

    // The trigger fails after the credential UPDATE, inside the same real SQL
    // transaction. Neither the new hash nor partial session deletion may persist.
    await assert.rejects(
      changeAdminPassword(
        value.database,
        credential,
        passwordInput(currentDevice),
      ),
      /fixture session deletion failure/,
    );
    assert.deepEqual(await credentialRows(value.peer), previousCredential);
    assert.deepEqual(
      (
        await value.peer.execute(
          "SELECT token_hash,expires_at FROM sessions ORDER BY token_hash",
        )
      ).rows,
      previousSessions,
    );
    assert.equal(
      await validSession(value.peer, currentDevice, credential),
      true,
    );
    assert.equal(await validSession(value.peer, otherDevice, credential), true);
    // A separate connection can write again: failure did not leave a write lock.
    await value.peer.execute("DROP TRIGGER fail_session_deletion");
  } finally {
    value.close();
  }
});

test("logout after password derivation wins when the write transaction rechecks the session", async () => {
  const value = await fixture();
  try {
    const currentDevice = await createSession(value.database, credential);
    const otherDevice = await createSession(value.peer, credential);
    const previousCredential = await credentialRows(value.database);
    let transactionRequests = 0;
    const database = new Proxy(value.database, {
      get(target, property) {
        if (property === "transaction") {
          return async (...args: Parameters<Client["transaction"]>) => {
            transactionRequests++;
            // This boundary is reached only after current-password verification
            // and new-key derivation. Commit a real logout before BEGIN, without
            // sleeps or relying on how quickly scrypt completes.
            assert.equal(
              await validSession(value.peer, currentDevice, credential),
              true,
            );
            await revokeSession(value.peer, currentDevice, credential);
            return target.transaction(...args);
          };
        }
        const member = Reflect.get(target, property, target);
        return typeof member === "function" ? member.bind(target) : member;
      },
    });

    const result = await changeAdminPassword(
      database,
      credential,
      passwordInput(currentDevice),
    );
    assert.equal(transactionRequests, 1);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /登录已失效/);
    assert.deepEqual(await credentialRows(value.peer), previousCredential);
    assert.equal(
      await validSession(value.peer, currentDevice, credential),
      false,
    );
    assert.equal(await validSession(value.peer, otherDevice, credential), true);
  } finally {
    value.close();
  }
});
