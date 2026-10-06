import "server-only";
import type { Client, InStatement, Row } from "@libsql/client";
import { randomUUID } from "node:crypto";
import {
  defaultProfile,
  seedEntries,
  type Entry,
  type EntryInput,
  type Profile,
} from "./content";
import {
  PAGE_SIZE,
  normalizeProjectFilters,
  type ProjectCatalog,
  type ProjectCatalogFilters,
} from "./project-catalog";
import {
  WRITING_PAGE_SIZE,
  normalizeWritingFilters,
  type WritingCatalog,
  type WritingCatalogFilters,
} from "./writing-catalog";
import { createDatabaseClient } from "./database-provider";
import { createSchema } from "./database-schema";

const globalDb = globalThis as unknown as { alpsLibsql?: Promise<Client> };

async function initialize(client: Client): Promise<void> {
  await createSchema(client);
  const transaction = await client.transaction("write");
  try {
    // The write transaction serializes separate instances. Only the connection
    // that inserts the singleton profile owns the first-run seed.
    const [profile, migration] = await transaction.batch([
      {
        sql: "INSERT OR IGNORE INTO profile (id,data) VALUES (1,?)",
        args: [JSON.stringify(defaultProfile)],
      },
      {
        sql: "SELECT key FROM migrations WHERE key = ?",
        args: ["content-covers-v1"],
      },
    ]);
    const recordCoverMigration: InStatement = {
      sql: "INSERT OR IGNORE INTO migrations (key, applied_at) VALUES (?, ?)",
      args: ["content-covers-v1", new Date().toISOString()],
    };
    if (profile.rowsAffected === 1) {
      await transaction.batch([
        ...seedEntries.map((entry, index) => {
          const timestamp = new Date(
            Date.UTC(
              Number(entry.year),
              entry.kind === "post" ? 8 - (index % 3) : 7 - index,
              12,
            ),
          ).toISOString();
          return {
            sql: "INSERT INTO entries (id,kind,slug,status,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
            args: [
              randomUUID(),
              entry.kind,
              entry.slug,
              entry.status,
              JSON.stringify(entry),
              timestamp,
              timestamp,
            ],
          };
        }),
        // New seed content already includes covers; avoid legacy reads on a
        // cloud write transaction with a short lifetime.
        recordCoverMigration,
      ]);
    } else if (!migration.rows.length) {
      const legacyEntries = await transaction.batch(
        seedEntries.map((seed) => ({
          sql: "SELECT id, data FROM entries WHERE kind = ? AND slug = ?",
          args: [seed.kind, seed.slug],
        })),
      );
      const updates: InStatement[] = [];
      for (const [index, result] of legacyEntries.entries()) {
        const seed = seedEntries[index];
        const row = result.rows[0];
        if (!row) continue;
        const data = JSON.parse(String(row.data));
        // Only missing fields identify legacy examples; empty or customized
        // image choices and all original timestamps remain untouched.
        if (
          data.title !== seed.title ||
          Object.hasOwn(data, "coverPath") ||
          Object.hasOwn(data, "coverAlt")
        )
          continue;
        updates.push({
          sql: "UPDATE entries SET data = ? WHERE id = ?",
          args: [
            JSON.stringify({
              ...data,
              coverPath: seed.coverPath,
              coverAlt: seed.coverAlt,
            }),
            String(row.id),
          ],
        });
      }
      await transaction.batch([...updates, recordCoverMigration]);
    }
    await transaction.commit();
  } finally {
    transaction.close();
  }
}

export function db(): Promise<Client> {
  if (!globalDb.alpsLibsql) {
    const connecting = (async () => {
      const client = await createDatabaseClient();
      try {
        await initialize(client);
        return client;
      } catch (error) {
        client.close();
        throw error;
      }
    })();
    globalDb.alpsLibsql = connecting;
    // Failed connections must be retryable after fixing configuration/connectivity.
    void connecting.catch(() => {
      if (globalDb.alpsLibsql === connecting) delete globalDb.alpsLibsql;
    });
  }
  return globalDb.alpsLibsql;
}

export async function closeDb(): Promise<void> {
  const pending = globalDb.alpsLibsql;
  delete globalDb.alpsLibsql;
  if (!pending) return;
  try {
    (await pending).close();
  } catch {
    // Failed initialization already closes its client.
  }
}

function fromRow(row: Row): Entry {
  return {
    coverPath: "",
    coverAlt: "",
    ...JSON.parse(String(row.data)),
    id: String(row.id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
export async function getProfile(): Promise<Profile> {
  const result = await (
    await db()
  ).execute("SELECT data FROM profile WHERE id = 1");
  if (!result.rows[0]) throw new Error("站点资料不存在。");
  return JSON.parse(String(result.rows[0].data));
}
export async function saveProfile(profile: Profile): Promise<void> {
  await (
    await db()
  ).execute({
    sql: "UPDATE profile SET data = ? WHERE id = 1",
    args: [JSON.stringify(profile)],
  });
}
export async function getEntries(
  kind?: Entry["kind"],
  publishedOnly = true,
): Promise<Entry[]> {
  const filters: string[] = [];
  const args: string[] = [];
  if (kind) {
    filters.push("kind = ?");
    args.push(kind);
  }
  if (publishedOnly) filters.push("status = 'published'");
  const result = await (
    await db()
  ).execute({
    sql: `SELECT * FROM entries ${filters.length ? "WHERE " + filters.join(" AND ") : ""} ORDER BY created_at DESC`,
    args,
  });
  return result.rows.map(fromRow);
}
export async function getEntry(id: string): Promise<Entry | null> {
  const result = await (
    await db()
  ).execute({ sql: "SELECT * FROM entries WHERE id = ?", args: [id] });
  return result.rows[0] ? fromRow(result.rows[0]) : null;
}
export async function getProjectCatalog(
  filters: ProjectCatalogFilters,
): Promise<ProjectCatalog> {
  return getPublishedCatalog(
    "project",
    normalizeProjectFilters({ ...filters, page: String(filters.page) }),
    PAGE_SIZE,
  );
}
export async function getWritingCatalog(
  filters: WritingCatalogFilters,
): Promise<WritingCatalog> {
  return getPublishedCatalog(
    "post",
    normalizeWritingFilters({ ...filters, page: String(filters.page) }),
    WRITING_PAGE_SIZE,
  );
}
async function getPublishedCatalog(
  kind: Entry["kind"],
  normalized: ProjectCatalogFilters | WritingCatalogFilters,
  pageSize: number,
): Promise<ProjectCatalog> {
  const publishedEntries =
    kind === "project"
      ? "kind = 'project' AND status = 'published'"
      : "kind = 'post' AND status = 'published'";
  const conditions = [publishedEntries];
  const args: string[] = [];
  if (normalized.q) {
    const literal = normalized.q.replace(
      /[\\%_]/g,
      (character) => `\\${character}`,
    );
    const pattern = `%${literal}%`;
    conditions.push(
      `(${["title", "summary", "tags", "category"].map((field) => `json_extract(data, '$.${field}') LIKE ? ESCAPE '\\'`).join(" OR ")})`,
    );
    args.push(pattern, pattern, pattern, pattern);
  }
  if (normalized.category) {
    conditions.push("json_extract(data, '$.category') = ?");
    args.push(normalized.category);
  }
  if (normalized.year) {
    conditions.push("json_extract(data, '$.year') = ?");
    args.push(normalized.year);
  }
  const where = conditions.join(" AND ");
  const transaction = await (await db()).transaction("read");
  try {
    const count = await transaction.execute({
      sql: `SELECT COUNT(*) AS count FROM entries WHERE ${where}`,
      args,
    });
    const total = Number(count.rows[0].count);
    const pageCount = Math.ceil(total / pageSize);
    const page = Math.min(normalized.page, Math.max(1, pageCount));
    const direction = normalized.sort === "oldest" ? "ASC" : "DESC";
    const [entries, published, categories, years] = await transaction.batch([
      {
        sql: `SELECT id, data, created_at, updated_at FROM entries WHERE ${where}
        ORDER BY json_extract(data, '$.year') ${direction}, created_at ${direction}, id ASC LIMIT ? OFFSET ?`,
        args: [...args, pageSize, (page - 1) * pageSize],
      },
      `SELECT COUNT(*) AS count FROM entries WHERE ${publishedEntries}`,
      `SELECT json_extract(data, '$.category') AS name, COUNT(*) AS count FROM entries WHERE ${publishedEntries} GROUP BY name ORDER BY count DESC, name ASC`,
      `SELECT json_extract(data, '$.year') AS year, COUNT(*) AS count FROM entries WHERE ${publishedEntries} GROUP BY year ORDER BY year DESC`,
    ]);
    await transaction.commit();
    return {
      entries: entries.rows.map(fromRow),
      total,
      page,
      pageCount,
      totalPublished: Number(published.rows[0].count),
      categories: categories.rows.map((row) => ({
        name: String(row.name),
        count: Number(row.count),
      })),
      years: years.rows.map((row) => ({
        year: String(row.year),
        count: Number(row.count),
      })),
    };
  } finally {
    transaction.close();
  }
}
export async function getPublishedEntry(
  kind: Entry["kind"],
  slug: string,
): Promise<Entry | null> {
  const result = await (
    await db()
  ).execute({
    sql: "SELECT * FROM entries WHERE kind = ? AND slug = ? AND status = 'published'",
    args: [kind, slug],
  });
  return result.rows[0] ? fromRow(result.rows[0]) : null;
}
export async function getAnotherPublishedPost(
  currentId: string,
): Promise<Entry | null> {
  const result = await (
    await db()
  ).execute({
    sql: `SELECT id, data, created_at, updated_at FROM entries WHERE kind = 'post' AND status = 'published' AND id <> ? ORDER BY json_extract(data, '$.year') DESC, created_at DESC, id ASC LIMIT 1`,
    args: [currentId],
  });
  return result.rows[0] ? fromRow(result.rows[0]) : null;
}
export async function saveEntry(input: EntryInput): Promise<string> {
  const id = input.id || randomUUID();
  const now = new Date().toISOString();
  if (input.id) {
    const result = await (
      await db()
    ).execute({
      sql: "UPDATE entries SET kind=?, slug=?, status=?, data=?, updated_at=? WHERE id=?",
      args: [
        input.kind,
        input.slug,
        input.status,
        JSON.stringify(input),
        now,
        id,
      ],
    });
    if (!result.rowsAffected) throw new Error("内容不存在");
  } else {
    await (
      await db()
    ).execute({
      sql: "INSERT INTO entries (id,kind,slug,status,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
      args: [
        id,
        input.kind,
        input.slug,
        input.status,
        JSON.stringify(input),
        now,
        now,
      ],
    });
  }
  return id;
}
export async function deleteEntry(id: string): Promise<void> {
  await (
    await db()
  ).execute({ sql: "DELETE FROM entries WHERE id=?", args: [id] });
}
