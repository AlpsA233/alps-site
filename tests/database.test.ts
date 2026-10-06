import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@libsql/client";
import {
  db,
  closeDb,
  getEntries,
  getEntry,
  getPublishedEntry,
  saveEntry,
  deleteEntry,
  getProfile,
  saveProfile,
} from "../src/lib/db";
import { defaultProfile, entrySchema, seedEntries } from "../src/lib/content";
import { createSchema } from "../src/lib/database-schema";

const run = promisify(execFile);

test("libSQL file preserves CRUD, publication, profile and empty collections across reopens", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "alps-database-test-"));
  const previous = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = resolve(directory, "test.sqlite");
  try {
    const clients = await Promise.all(Array.from({ length: 8 }, () => db()));
    assert.ok(clients.every((client) => client === clients[0]));
    assert.equal((await getEntries(undefined, false)).length, 6);
    const draft = {
      ...seedEntries[0],
      slug: "isolated-draft",
      status: "draft" as const,
    };
    const id = await saveEntry(draft);
    assert.equal((await getEntry(id))?.status, "draft");
    assert.equal(await getPublishedEntry("project", draft.slug), null);
    await saveEntry({ ...draft, id, status: "published" });
    assert.equal((await getPublishedEntry("project", draft.slug))?.id, id);
    await assert.rejects(saveEntry({ ...draft, status: "published" }));
    await assert.rejects(
      saveEntry({ ...draft, id: "missing-id" }),
      /内容不存在/,
    );
    await saveProfile({ ...(await getProfile()), name: "Persistent name" });
    await closeDb();
    assert.equal((await getPublishedEntry("project", draft.slug))?.id, id);
    assert.equal((await getProfile()).name, "Persistent name");
    await deleteEntry(id);
    assert.equal(await getEntry(id), null);
    for (const entry of await getEntries(undefined, false))
      await deleteEntry(entry.id);
    await closeDb();
    assert.equal((await getEntries(undefined, false)).length, 0);
    assert.equal((await getProfile()).name, "Persistent name");
  } finally {
    await closeDb();
    if (previous === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("existing SQLite cover migration preserves edits, explicit no-cover and timestamps", async () => {
  const directory = mkdtempSync(
    resolve(tmpdir(), "alps-cover-migration-test-"),
  );
  const previous = process.env.DATABASE_PATH;
  const path = resolve(directory, "legacy.sqlite");
  const timestamp = "2026-01-02T03:04:05.000Z";
  const fixture = createClient({ url: pathToFileURL(path).href });
  try {
    await fixture.batch(
      [
        "CREATE TABLE profile (id INTEGER PRIMARY KEY, data TEXT NOT NULL)",
        "CREATE TABLE entries (id TEXT PRIMARY KEY, kind TEXT NOT NULL, slug TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(kind, slug))",
        {
          sql: "INSERT INTO profile (id,data) VALUES (1,?)",
          args: [JSON.stringify({ ...defaultProfile, name: "Owner profile" })],
        },
        ...seedEntries.map(
          (
            { coverPath: _coverPath, coverAlt: _coverAlt, ...legacy },
            index,
          ) => {
            const data: Record<string, unknown> = { ...legacy };
            if (index === 1) data.title = "A renamed personal project";
            if (index === 2) data.coverPath = "";
            if (index === 3) {
              data.coverPath = "/images/custom/owner-photo.webp";
              data.coverAlt = "Owner picture description";
            }
            if (index === 4)
              data.coverAlt = "Description already entered by owner";
            if (index === 5)
              data.body = "An edited paragraph that must survive.";
            return {
              sql: "INSERT INTO entries (id,kind,slug,status,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
              args: [
                `legacy-${index}`,
                legacy.kind,
                legacy.slug,
                legacy.status,
                JSON.stringify(data),
                timestamp,
                timestamp,
              ],
            };
          },
        ),
      ],
      "write",
    );
  } finally {
    fixture.close();
  }
  process.env.DATABASE_PATH = path;
  try {
    assert.equal((await getEntries(undefined, false)).length, 6);
    assert.equal((await getProfile()).name, "Owner profile");
    const all = await Promise.all(
      seedEntries.map((_, index) => getEntry(`legacy-${index}`)),
    );
    assert.equal(all[0]?.coverPath, seedEntries[0].coverPath);
    assert.equal(all[0]?.updatedAt, timestamp);
    assert.equal(all[1]?.title, "A renamed personal project");
    assert.equal(all[1]?.coverPath, "");
    assert.equal(all[2]?.coverPath, "");
    assert.equal(all[3]?.coverPath, "/images/custom/owner-photo.webp");
    assert.equal(all[3]?.coverAlt, "Owner picture description");
    assert.equal(all[4]?.coverPath, "");
    assert.equal(all[4]?.coverAlt, "Description already entered by owner");
    assert.equal(all[5]?.body, "An edited paragraph that must survive.");
    assert.equal(all[5]?.coverPath, seedEntries[5].coverPath);
    assert.equal(all[5]?.updatedAt, timestamp);
    const migration = () =>
      db().then((client) =>
        client.execute({
          sql: "SELECT applied_at FROM migrations WHERE key=?",
          args: ["content-covers-v1"],
        }),
      );
    const firstMigration = (await migration()).rows;
    assert.equal(firstMigration.length, 1);
    await saveEntry(
      entrySchema.parse({ ...all[0], coverPath: "", coverAlt: "" }),
    );
    await saveEntry(
      entrySchema.parse({
        ...all[5],
        coverPath: "/images/custom/new-cover.png",
        coverAlt: "A saved image description",
      }),
    );
    await closeDb();
    assert.equal((await getEntry("legacy-0"))?.coverPath, "");
    assert.equal((await getEntry("legacy-0"))?.coverAlt, "");
    assert.equal(
      (await getEntry("legacy-5"))?.coverPath,
      "/images/custom/new-cover.png",
    );
    assert.equal(
      (await getEntry("legacy-5"))?.coverAlt,
      "A saved image description",
    );
    assert.deepEqual((await migration()).rows, firstMigration);
  } finally {
    await closeDb();
    if (previous === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("schema is reusable without seeding and independent concurrent instances seed only once", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "alps-instance-test-"));
  const path = resolve(directory, "shared.sqlite");
  const fixture = createClient({ url: pathToFileURL(path).href });
  try {
    await createSchema(fixture);
    await createSchema(fixture);
    assert.equal(
      Number(
        (await fixture.execute("SELECT COUNT(*) AS count FROM profile")).rows[0]
          .count,
      ),
      0,
    );
    assert.equal(
      Number(
        (await fixture.execute("SELECT COUNT(*) AS count FROM entries")).rows[0]
          .count,
      ),
      0,
    );
  } finally {
    fixture.close();
  }
  const moduleUrl = pathToFileURL(resolve("src/lib/db.ts")).href;
  const code = `import {db,closeDb,getEntries,getProfile} from ${JSON.stringify(moduleUrl)}; await db(); console.log(JSON.stringify({entries:(await getEntries(undefined,false)).length,name:(await getProfile()).name})); await closeDb();`;
  const env = {
    ...process.env,
    DATABASE_PATH: path,
    TURSO_DATABASE_URL: "",
    TURSO_AUTH_TOKEN: "",
    VERCEL: "",
  };
  const execute = () =>
    run(
      process.execPath,
      [
        "--import",
        "tsx",
        "--conditions=react-server",
        "--input-type=module",
        "--eval",
        code,
      ],
      { env, timeout: 30000 },
    );
  try {
    const initialized = await Promise.all(
      Array.from({ length: 3 }, () => execute()),
    );
    for (const result of initialized)
      assert.deepEqual(JSON.parse(result.stdout.trim()), {
        entries: 6,
        name: defaultProfile.name,
      });
    const cleared = createClient({ url: pathToFileURL(path).href });
    try {
      await cleared.batch(
        [
          "DELETE FROM entries",
          {
            sql: "UPDATE profile SET data=? WHERE id=1",
            args: [JSON.stringify({ ...defaultProfile, name: "Owner kept" })],
          },
        ],
        "write",
      );
    } finally {
      cleared.close();
    }
    const reopened = await Promise.all(
      Array.from({ length: 3 }, () => execute()),
    );
    for (const result of reopened)
      assert.deepEqual(JSON.parse(result.stdout.trim()), {
        entries: 0,
        name: "Owner kept",
      });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
