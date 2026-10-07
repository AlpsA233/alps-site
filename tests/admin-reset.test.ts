import test, { before } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { PassThrough, Writable } from "node:stream";
import { createSchema } from "../src/lib/database-schema";
import { getAdminCredential } from "../src/lib/admin-credentials";
import { verifyPassword } from "../src/lib/password";
import { createSession, validSession } from "../src/lib/session-store";

const resetModule = "../scripts/reset-admin-password.mjs";
let reset: any;
before(async () => {
  reset = await import(resetModule);
});
const initialHash = "a".repeat(32) + ":" + "b".repeat(128);
const testPassword = "fixture-new-password-123";
const script = resolve("scripts/reset-admin-password.mjs");
const loader = createRequire(import.meta.url).resolve("tsx");

function capturedOutput(isTTY = false) {
  let text = "";
  const output = Object.assign(
    new Writable({
      write(chunk, _encoding, done) {
        text += chunk.toString();
        done();
      },
    }),
    { isTTY, columns: 80 },
  );
  return { output, text: () => text };
}

function temporaryEnvironment() {
  const directory = mkdtempSync(resolve(tmpdir(), "alps-reset-test-"));
  const path = resolve(directory, "chosen.sqlite");
  const envPath = resolve(directory, ".env.local");
  const original = `DATABASE_PATH=${path}\nADMIN_PASSWORD_HASH=${initialHash}\nCUSTOM_VALUE=keep-me\n`;
  writeFileSync(envPath, original);
  return {
    directory,
    path,
    envPath,
    original,
    close: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test("reset arguments require a complete explicit env argument and never offer an implicit yes", () => {
  assert.equal(reset.parseResetArgs([]).envPath, resolve(".env.local"));
  assert.equal(
    reset.parseResetArgs(["--env", "chosen.env"]).envPath,
    resolve("chosen.env"),
  );
  assert.equal(reset.parseResetArgs(["--help"]).help, true);
  for (const args of [
    ["--yes"],
    ["--env"],
    ["--env", "--help"],
    ["unexpected"],
    ["--help", "--env", "chosen.env"],
  ]) {
    assert.throws(() => reset.parseResetArgs(args), reset.AdminResetError);
  }
});

test("declining a local target does not connect or create a database and ignores inherited Turso settings", async () => {
  const fixture = temporaryEnvironment();
  const output = capturedOutput();
  let connections = 0;
  try {
    const result = await reset.main(["--env", fixture.envPath], {
      output: output.output,
      environment: {
        ALPS_ADMIN_PASSWORD: testPassword,
        TURSO_DATABASE_URL: "libsql://inherited.example.invalid",
        TURSO_AUTH_TOKEN: "inherited-token-never-real",
      },
      ask: async () => "no",
      connect: async () => {
        connections++;
        throw new Error("Must not connect");
      },
    });
    assert.equal(result.changed, false);
    assert.equal(connections, 0);
    assert.equal(existsSync(fixture.path), false);
    assert.match(output.text(), /本地 SQLite/);
    assert.ok(output.text().includes(fixture.path));
    assert.equal(output.text().includes("inherited"), false);
    assert.equal(output.text().includes(testPassword), false);
    assert.equal(readFileSync(fixture.envPath, "utf8"), fixture.original);
  } finally {
    fixture.close();
  }
});

test("password mismatch fails before a connection, even after confirming the target", async () => {
  const fixture = temporaryEnvironment();
  const output = capturedOutput(true);
  const answers = ["yes", testPassword, "different-fixture-password"];
  let connections = 0;
  try {
    await assert.rejects(
      reset.main(["--env", fixture.envPath], {
        input: { isTTY: true },
        output: output.output,
        environment: {},
        ask: async () => answers.shift(),
        connect: async () => {
          connections++;
          throw new Error("Must not connect");
        },
      }),
      /两次新密码不一致/,
    );
    assert.equal(connections, 0);
    assert.equal(existsSync(fixture.path), false);
    assert.equal(output.text().includes(testPassword), false);
  } finally {
    fixture.close();
  }
});

test("non-TTY CLI rejects piped plaintext passwords before connecting", () => {
  const fixture = temporaryEnvironment();
  try {
    const result = spawnSync(process.execPath, ["--import", loader, script], {
      cwd: fixture.directory,
      input: `yes\n${testPassword}\n${testPassword}\n`,
      encoding: "utf8",
      env: { NODE_ENV: "test" },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /非交互终端/);
    assert.equal((result.stdout + result.stderr).includes(testPassword), false);
    assert.equal(existsSync(fixture.path), false);
    assert.equal(readFileSync(fixture.envPath, "utf8"), fixture.original);
  } finally {
    fixture.close();
  }
});

test("confirmed CLI updates only the selected database, revokes sessions and limits, and preserves content and env", async () => {
  const fixture = temporaryEnvironment();
  const client = createClient({ url: pathToFileURL(fixture.path).href });
  const profile = '{ "name": "Original profile", "custom": true }';
  const entry = '{ "title": "Original entry", "body": "Keep this paragraph." }';
  try {
    await createSchema(client);
    await getAdminCredential(client, initialHash);
    await client.batch(
      [
        { sql: "INSERT INTO profile (id,data) VALUES (1,?)", args: [profile] },
        {
          sql: "INSERT INTO entries (id,kind,slug,status,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
          args: [
            "unchanged-id",
            "post",
            "unchanged-post",
            "draft",
            entry,
            "2025-01-02T03:04:05.000Z",
            "2026-01-02T03:04:05.000Z",
          ],
        },
        "INSERT INTO login_attempts (id,count,started_at) VALUES (1,8,12345)",
        "INSERT INTO password_change_attempts (id,count,started_at) VALUES (1,8,12345)",
      ],
      "write",
    );
    const token = await createSession(client, initialHash);
    const output = execFileSync(
      process.execPath,
      ["--import", loader, script],
      {
        cwd: fixture.directory,
        input: "yes\n",
        encoding: "utf8",
        env: {
          NODE_ENV: "test",
          ALPS_ADMIN_PASSWORD: testPassword,
          TURSO_DATABASE_URL: "libsql://unrelated.example.invalid",
          TURSO_AUTH_TOKEN: "unrelated-token-never-real",
        },
      },
    );
    const credential = await getAdminCredential(client, initialHash);
    assert.ok(credential);
    assert.notEqual(credential, initialHash);
    assert.equal(await verifyPassword(testPassword, credential), true);
    assert.equal(await validSession(client, token, credential), false);
    for (const table of [
      "sessions",
      "login_attempts",
      "password_change_attempts",
    ]) {
      assert.equal(
        Number(
          (await client.execute(`SELECT count(*) AS count FROM ${table}`))
            .rows[0].count,
        ),
        0,
      );
    }
    assert.equal(
      (await client.execute("SELECT data FROM profile WHERE id=1")).rows[0]
        .data,
      profile,
    );
    const row = (
      await client.execute("SELECT * FROM entries WHERE id='unchanged-id'")
    ).rows[0];
    assert.equal(row.data, entry);
    assert.equal(row.status, "draft");
    assert.equal(row.updated_at, "2026-01-02T03:04:05.000Z");
    assert.equal(readFileSync(fixture.envPath, "utf8"), fixture.original);
    assert.match(output, /后台密码已重设/);
    for (const secret of [
      testPassword,
      initialHash,
      credential,
      token,
      "unrelated-token-never-real",
    ])
      assert.equal(output.includes(secret), false);
    assert.equal(output.includes("unrelated.example.invalid"), false);
  } finally {
    client.close();
    fixture.close();
  }
});

test("a new confirmed database gets schema and credentials without content seeding", async () => {
  const fixture = temporaryEnvironment();
  const output = capturedOutput();
  let client;
  try {
    const result = await reset.main(["--env", fixture.envPath], {
      output: output.output,
      environment: { ALPS_ADMIN_PASSWORD: testPassword },
      ask: async () => "yes",
    });
    assert.equal(result.changed, true);
    client = createClient({ url: pathToFileURL(fixture.path).href });
    for (const table of ["profile", "entries"]) {
      assert.equal(
        Number(
          (await client.execute(`SELECT count(*) AS count FROM ${table}`))
            .rows[0].count,
        ),
        0,
      );
    }
    const credential = await getAdminCredential(client, initialHash);
    assert.ok(credential);
    assert.equal(await verifyPassword(testPassword, credential), true);
    assert.equal(readFileSync(fixture.envPath, "utf8"), fixture.original);
  } finally {
    client?.close();
    fixture.close();
  }
});

test("remote failure reports only a hostname and closes the client without exposing internal credentials", async () => {
  const fixture = temporaryEnvironment();
  const token = "fixture-remote-token-never-real";
  writeFileSync(
    fixture.envPath,
    `TURSO_DATABASE_URL=libsql://chosen.example.invalid\nTURSO_AUTH_TOKEN=${token}\n`,
  );
  const output = capturedOutput();
  let closed = 0;
  try {
    await assert.rejects(
      reset.main(["--env", fixture.envPath], {
        output: output.output,
        environment: { ALPS_ADMIN_PASSWORD: testPassword },
        ask: async () => "yes",
        connect: async (config: any) => {
          assert.equal(config.provider, "turso");
          assert.equal(config.authToken, token);
          return {
            batch: async () => {
              throw new Error(`internal ${token}`);
            },
            close: () => {
              closed++;
            },
          };
        },
      }),
      (error: unknown) =>
        error instanceof reset.AdminResetError &&
        !(error as Error).message.includes(token),
    );
    assert.equal(closed, 1);
    assert.match(output.text(), /远程 Turso：chosen\.example\.invalid/);
    assert.equal(output.text().includes(token), false);
    assert.equal(output.text().includes(testPassword), false);
    assert.equal(existsSync(fixture.path), false);
  } finally {
    fixture.close();
  }
});

test("TTY secret input preserves the answer while never echoing typed text", async () => {
  const input = Object.assign(new PassThrough(), {
    isTTY: true,
    isRaw: false,
    setRawMode(raw: boolean) {
      this.isRaw = raw;
    },
  });
  const output = capturedOutput(true);
  try {
    const answer = reset.readTerminalAnswer(
      "隐藏密码：",
      input,
      output.output,
      { secret: true },
    );
    input.write(`${testPassword}\r`);
    assert.equal(await answer, testPassword);
    assert.equal(output.text(), "隐藏密码：\n");
    assert.equal(input.isRaw, false);
  } finally {
    input.destroy();
    output.output.destroy();
  }
});
