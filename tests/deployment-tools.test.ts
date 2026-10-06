import test, { before } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createClient } from "@libsql/client";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { SCHEMA_STATEMENTS } from "../src/lib/database-schema";

// These standalone CLI modules intentionally stay independent of server-only application initialization.
const configModule = "../scripts/deployment-config.mjs";
const migrationModule = "../scripts/migrate-to-turso.mjs";
let config: any;
let migration: any;
before(async () => {
  config = await import(configModule);
  migration = await import(migrationModule);
});
const fakeHash = "a".repeat(32) + ":" + "b".repeat(128);
const fakeConfig = {
  TURSO_DATABASE_URL: "libsql://fixture.example.invalid",
  TURSO_AUTH_TOKEN: "fixture-token-never-real",
  ADMIN_PASSWORD_HASH: fakeHash,
  COOKIE_SECURE: "true",
  NEXT_PUBLIC_SITE_URL: "https://fixture.example.invalid",
};

function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), "alps-deploy-test-"));
  const sourcePath = resolve(directory, "source.sqlite");
  const db = new Database(sourcePath);
  db.pragma("journal_mode = WAL");
  for (const sql of SCHEMA_STATEMENTS) db.exec(sql);
  db.prepare("INSERT INTO profile VALUES (?,?)").run(
    1,
    '{"name":"测试资料","custom":"保留原始 JSON 空格"}',
  );
  const insert = db.prepare("INSERT INTO entries VALUES (?,?,?,?,?,?,?)");
  insert.run(
    "original-project-id",
    "project",
    "original-project",
    "published",
    '{"title":"作品","year":"2022","coverPath":"/images/example.webp"}',
    "2022-01-02T03:04:05.000Z",
    "2024-06-07T08:09:10.000Z",
  );
  insert.run(
    "original-post-id",
    "post",
    "original-post",
    "draft",
    '{ "title": "草稿", "year": "2023", "custom": true }',
    "2023-02-03T04:05:06.000Z",
    "2025-07-08T09:10:11.000Z",
  );
  db.prepare("INSERT INTO migrations VALUES (?,?)").run(
    "content-covers-v1",
    "2024-01-01T00:00:00.000Z",
  );
  db.prepare("INSERT INTO sessions VALUES (?,?)").run(
    "private-session-hash",
    123456,
  );
  db.prepare("INSERT INTO login_attempts VALUES (1,?,?)").run(4, 123456);
  const client = createClient({
    url: pathToFileURL(resolve(directory, "target.sqlite")).href,
  });
  return {
    directory,
    sourcePath,
    db,
    client,
    close() {
      client.close();
      db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("deployment environment is parsed as data and copied without exposing or changing local credentials", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "alps-config-test-"));
  try {
    const localPath = resolve(directory, ".env.local");
    const envPath = resolve(directory, ".env.deploy.local");
    const original = `ADMIN_PASSWORD_HASH=${fakeHash}\nDATABASE_PATH=data/custom.sqlite\n`;
    writeFileSync(localPath, original);
    config.writeDeploymentEnv(
      envPath,
      { ...fakeConfig, ADMIN_PASSWORD_HASH: "", DATABASE_PATH: "local.sqlite" },
      localPath,
    );
    const values = config.syncAdminHash({ envPath, localPath });
    assert.equal(values.ADMIN_PASSWORD_HASH, fakeHash);
    assert.equal(Object.hasOwn(values, "DATABASE_PATH"), false);
    assert.equal(statSync(envPath).mode & 0o777, 0o600);
    assert.equal(readFileSync(localPath, "utf8"), original);
    assert.equal(
      config.clipboardEnvironment(values).split("\n").filter(Boolean).length,
      5,
    );
    assert.throws(
      () => config.writeDeploymentEnv(localPath, values, localPath),
      /不能覆盖/,
    );
    const marker = resolve(directory, "must-not-exist");
    assert.equal(
      config.parseEnv(`VALUE='$(touch ${marker})'`).VALUE,
      `$(touch ${marker})`,
    );
    assert.equal(existsSync(marker), false);
    assert.throws(
      () =>
        config.writeDeploymentEnv(envPath, { TOKEN: "one\ntwo" }, localPath),
      /换行/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cloud validation excludes local paths, insecure cookies, URL credentials, and unsafe placeholders", () => {
  config.validateDeploymentConfig(fakeConfig);
  config.validateDeploymentConfig(
    { ...fakeConfig, NEXT_PUBLIC_SITE_URL: "" },
    { allowAutoSite: true },
  );
  for (const patch of [
    { TURSO_DATABASE_URL: "file:local.sqlite" },
    { TURSO_DATABASE_URL: "https://user:password@example.invalid" },
    { TURSO_DATABASE_URL: "libsql://example.invalid?auth=private" },
    { TURSO_AUTH_TOKEN: "$UNEXPANDED" },
    { COOKIE_SECURE: "false" },
    { NEXT_PUBLIC_SITE_URL: "http://example.invalid" },
    { ADMIN_PASSWORD_HASH: "broken" },
  ])
    assert.throws(() =>
      config.validateDeploymentConfig({ ...fakeConfig, ...patch }),
    );
});

test("configuration CLI reports only names and counts for fake credentials", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "alps-config-output-"));
  try {
    const envPath = resolve(directory, "deploy.env");
    config.writeDeploymentEnv(envPath, fakeConfig);
    const output = execFileSync(
      process.execPath,
      [resolve("scripts/deployment-config.mjs"), "validate", "--env", envPath],
      { encoding: "utf8" },
    );
    assert.match(output, /检查通过.*5 项/);
    assert.equal(output.includes(fakeConfig.TURSO_AUTH_TOKEN), false);
    assert.equal(output.includes(fakeHash), false);
    assert.equal(output.includes(fakeConfig.TURSO_DATABASE_URL), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("default migration dry run makes no backup or target schema writes", async () => {
  const value = fixture();
  try {
    assert.equal(migration.parseMigrationArgs([]).apply, false);
    assert.throws(() => migration.parseMigrationArgs(["--apply", "--dry-run"]));
    const backupDirectory = resolve(value.directory, "backups");
    const result = await migration.migrateDatabase({
      sourcePath: value.sourcePath,
      client: value.client,
      backupDirectory,
    });
    assert.equal(result.written, false);
    assert.equal(result.state, "empty");
    assert.deepEqual(result.counts, {
      profile: 1,
      projects: 1,
      posts: 1,
      drafts: 1,
      migrations: 1,
    });
    assert.equal(existsSync(backupDirectory), false);
    assert.equal(
      (
        await value.client.execute(
          "SELECT name FROM sqlite_master WHERE type='table'",
        )
      ).rows.length,
      0,
    );
  } finally {
    value.close();
  }
});

test("applied migration backs up WAL content and exactly preserves all content while omitting authentication state", async () => {
  const value = fixture();
  try {
    const before = migration.readSourceSnapshot(value.sourcePath);
    const result = await migration.migrateDatabase({
      sourcePath: value.sourcePath,
      client: value.client,
      apply: true,
      backupDirectory: resolve(value.directory, "backups"),
    });
    assert.equal(result.written, true);
    assert.equal(statSync(result.backupPath).mode & 0o777, 0o600);
    assert.deepEqual(migration.readSourceSnapshot(result.backupPath), before);
    assert.deepEqual(migration.readSourceSnapshot(value.sourcePath), before);
    assert.equal(
      Number(
        (await value.client.execute("SELECT COUNT(*) AS count FROM sessions"))
          .rows[0].count,
      ),
      0,
    );
    assert.equal(
      Number(
        (
          await value.client.execute(
            "SELECT COUNT(*) AS count FROM login_attempts",
          )
        ).rows[0].count,
      ),
      0,
    );
    const reread = await migration.migrateSnapshot(value.client, before);
    assert.equal(reread.state, "identical");
    assert.equal(reread.written, false);
    await value.client.execute(
      "INSERT INTO sessions VALUES ('cloud-session',123456)",
    );
    const identical = await migration.migrateDatabase({
      sourcePath: value.sourcePath,
      client: value.client,
      apply: true,
      backupDirectory: resolve(value.directory, "unneeded-backup"),
    });
    assert.equal(identical.state, "identical");
    assert.equal(
      existsSync(resolve(value.directory, "unneeded-backup")),
      false,
    );
    assert.equal(
      Number(
        (await value.client.execute("SELECT COUNT(*) AS count FROM sessions"))
          .rows[0].count,
      ),
      1,
    );
  } finally {
    value.close();
  }
});

test("nonempty different destinations are rejected without backups or overwrites", async () => {
  const value = fixture();
  try {
    await value.client.execute("CREATE TABLE unrelated (data TEXT)");
    await value.client.execute("INSERT INTO unrelated VALUES ('retain-me')");
    const backupDirectory = resolve(value.directory, "backups");
    await assert.rejects(
      migration.migrateDatabase({
        sourcePath: value.sourcePath,
        client: value.client,
        apply: true,
        backupDirectory,
      }),
      /拒绝覆盖/,
    );
    assert.equal(existsSync(backupDirectory), false);
    assert.equal(
      String(
        (await value.client.execute("SELECT data FROM unrelated")).rows[0].data,
      ),
      "retain-me",
    );
    assert.equal(
      (
        await value.client.execute(
          "SELECT name FROM sqlite_master WHERE name='profile'",
        )
      ).rows.length,
      0,
    );
  } finally {
    value.close();
  }
});

test("an import failure rolls back schema and all rows together", async () => {
  const value = fixture();
  try {
    const snapshot = migration.readSourceSnapshot(value.sourcePath);
    // Duplicate the entry ID to trigger the actual database uniqueness constraint.
    snapshot.entries.push(snapshot.entries[0]);
    await assert.rejects(
      migration.migrateSnapshot(value.client, snapshot, { apply: true }),
    );
    assert.equal(
      (
        await value.client.execute(
          "SELECT name FROM sqlite_master WHERE type='table'",
        )
      ).rows.length,
      0,
    );
  } finally {
    value.close();
  }
});

test("legacy sources without a migrations table remain supported and empty sources fail safely", () => {
  const value = fixture();
  try {
    value.db.exec("DROP TABLE migrations");
    assert.deepEqual(
      migration.readSourceSnapshot(value.sourcePath).migrations,
      [],
    );
    value.db.exec("DELETE FROM profile");
    assert.throws(
      () => migration.readSourceSnapshot(value.sourcePath),
      /完整站点资料/,
    );
  } finally {
    value.close();
  }
});
