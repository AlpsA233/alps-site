import Database from "better-sqlite3";
import { createClient } from "@libsql/client/web";
import { chmodSync, mkdirSync, rmSync, openSync, closeSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { SCHEMA_STATEMENTS } from "../src/lib/database-schema.ts";
import {
  DeploymentConfigError,
  readEnv,
  validateTursoConfig,
} from "./deployment-config.mjs";

export class MigrationError extends Error {}

const CONTENT_TABLES = {
  profile: { columns: ["id", "data"], order: "id" },
  entries: {
    columns: [
      "id",
      "kind",
      "slug",
      "status",
      "data",
      "created_at",
      "updated_at",
    ],
    order: "id",
  },
  migrations: { columns: ["key", "applied_at"], order: "key" },
};

function normalizedRows(rows, columns) {
  return rows.map((row) =>
    Object.fromEntries(
      columns.map((key) => [
        key,
        key === "id" && columns.length === 2
          ? Number(row[key])
          : String(row[key]),
      ]),
    ),
  );
}

export function readSourceSnapshot(path) {
  let source;
  try {
    source = new Database(path, { readonly: true, fileMustExist: true });
    return source.transaction(() => {
      const tables = new Set(
        source
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all()
          .map((row) => row.name),
      );
      if (!tables.has("profile") || !tables.has("entries"))
        throw new MigrationError(
          "来源不是 Alps 内容数据库：缺少 profile 或 entries 表。",
        );
      const snapshot = {};
      for (const [table, { columns, order }] of Object.entries(
        CONTENT_TABLES,
      )) {
        snapshot[table] = tables.has(table)
          ? normalizedRows(
              source
                .prepare(
                  `SELECT ${columns.join(",")} FROM ${table} ORDER BY ${order}`,
                )
                .all(),
              columns,
            )
          : [];
      }
      if (snapshot.profile.length !== 1 || snapshot.profile[0].id !== 1)
        throw new MigrationError("来源必须包含一条完整站点资料。");
      for (const row of [...snapshot.profile, ...snapshot.entries]) {
        try {
          const data = JSON.parse(row.data);
          if (!data || typeof data !== "object" || Array.isArray(data))
            throw new Error();
        } catch {
          throw new MigrationError(
            "来源包含无效的内容 JSON；请先修复本地内容。",
          );
        }
      }
      return snapshot;
    })();
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError(
      "无法只读打开来源 SQLite，或其表结构不兼容；请检查 --source 路径。",
    );
  } finally {
    source?.close();
  }
}

export async function createConsistentBackup(sourcePath, backupDirectory) {
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  chmodSync(backupDirectory, 0o700);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = resolve(
    backupDirectory,
    `alps-before-turso-${stamp}-${randomUUID().slice(0, 8)}.sqlite`,
  );
  let source;
  try {
    // Restrict permissions before the SQLite backup API writes any database bytes.
    closeSync(openSync(path, "wx", 0o600));
    source = new Database(sourcePath, { readonly: true, fileMustExist: true });
    await source.backup(path);
    chmodSync(path, 0o600);
    return { path, snapshot: readSourceSnapshot(path) };
  } catch (error) {
    rmSync(path, { force: true });
    if (error instanceof MigrationError) throw error;
    throw new MigrationError(
      "无法创建一致的 SQLite 在线备份；云端内容未写入。",
    );
  } finally {
    source?.close();
  }
}

async function readTargetSnapshot(client, knownTables) {
  const tables =
    knownTables ||
    (
      await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
    ).rows.map((row) => String(row.name));
  const snapshot = {};
  const statements = [];
  const resultTables = [];
  for (const [table, { columns, order }] of Object.entries(CONTENT_TABLES)) {
    snapshot[table] = [];
    if (tables.includes(table)) {
      statements.push(
        `SELECT ${columns.join(",")} FROM ${table} ORDER BY ${order}`,
      );
      resultTables.push(table);
    }
  }
  for (const table of tables.filter(
    (name) => !Object.hasOwn(CONTENT_TABLES, name),
  )) {
    const quoted = '"' + table.replace(/"/g, '""') + '"';
    statements.push(`SELECT COUNT(*) AS count FROM ${quoted}`);
    resultTables.push(null);
  }
  let otherRows = 0;
  // One network request reads every table in the same transaction snapshot.
  const results = statements.length ? await client.batch(statements) : [];
  results.forEach((result, index) => {
    const table = resultTables[index];
    if (table)
      snapshot[table] = normalizedRows(
        result.rows,
        CONTENT_TABLES[table].columns,
      );
    else otherRows += Number(result.rows[0].count);
  });
  return { snapshot, otherRows, tables };
}

function sameSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function rowCount(snapshot) {
  return Object.values(snapshot).reduce(
    (total, rows) => total + rows.length,
    0,
  );
}
function inspectTarget(source, target) {
  if (sameSnapshot(source, target.snapshot)) return "identical";
  if (rowCount(target.snapshot) || target.otherRows)
    throw new MigrationError(
      "目标数据库已有不同内容或登录记录，已拒绝覆盖。请改用空的 libSQL 数据库。",
    );
  return "empty";
}

export function snapshotCounts(snapshot) {
  return {
    profile: snapshot.profile.length,
    projects: snapshot.entries.filter((row) => row.kind === "project").length,
    posts: snapshot.entries.filter((row) => row.kind === "post").length,
    drafts: snapshot.entries.filter((row) => row.status === "draft").length,
    migrations: snapshot.migrations.length,
  };
}

export async function migrateSnapshot(
  client,
  snapshot,
  { apply = false } = {},
) {
  const transaction = await client.transaction(apply ? "write" : "read");
  let verificationTables;
  try {
    const target = await readTargetSnapshot(transaction);
    const state = inspectTarget(snapshot, target);
    if (state === "identical" || !apply) {
      await transaction.commit();
      return { state, written: false, counts: snapshotCounts(snapshot) };
    }
    const statements = [...SCHEMA_STATEMENTS];
    for (const [table, { columns }] of Object.entries(CONTENT_TABLES)) {
      // Bound arguments retain raw JSON, original ids and timestamps exactly.
      for (const row of snapshot[table])
        statements.push({
          sql: `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
          args: columns.map((key) => row[key]),
        });
    }
    // Keep the entire import in one request within Turso's transaction lifetime.
    await transaction.batch(statements);
    verificationTables = [
      ...new Set([
        ...target.tables,
        ...Object.keys(CONTENT_TABLES),
        "sessions",
        "login_attempts",
      ]),
    ];
    if (
      !sameSnapshot(
        snapshot,
        (await readTargetSnapshot(transaction, verificationTables)).snapshot,
      )
    )
      throw new MigrationError("事务内完整读回校验失败，已回滚迁移。");
    await transaction.commit();
  } finally {
    transaction.close();
  }
  const verification = await client.transaction("read");
  try {
    if (
      !sameSnapshot(
        snapshot,
        (await readTargetSnapshot(verification, verificationTables)).snapshot,
      )
    )
      throw new MigrationError(
        "提交后的完整读回校验未通过；请保留备份并停止部署。",
      );
    await verification.commit();
  } finally {
    verification.close();
  }
  return { state: "imported", written: true, counts: snapshotCounts(snapshot) };
}

export async function migrateDatabase({
  sourcePath,
  client,
  apply = false,
  backupDirectory = resolve("data/backups"),
  onBackup = () => {},
}) {
  // Validate before creating a backup; --dry-run performs no local or remote writes.
  const initial = readSourceSnapshot(sourcePath);
  if (!apply) return migrateSnapshot(client, initial);
  const preliminary = await migrateSnapshot(client, initial);
  if (preliminary.state === "identical") return preliminary;
  const backup = await createConsistentBackup(sourcePath, backupDirectory);
  onBackup(backup.path);
  return {
    ...(await migrateSnapshot(client, backup.snapshot, { apply: true })),
    backupPath: backup.path,
  };
}

export function parseMigrationArgs(args) {
  const options = {
    apply: false,
    envPath: resolve(".env.deploy.local"),
    sourcePath: undefined,
    backupDirectory: resolve("data/backups"),
  };
  let mode;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--apply" || arg === "--dry-run") {
      if (mode && mode !== arg)
        throw new MigrationError("--apply 与 --dry-run 不可同时指定。");
      mode = arg;
      options.apply = arg === "--apply";
    } else if (
      ["--env", "--source", "--backup-dir"].includes(arg) &&
      args[index + 1] &&
      !args[index + 1].startsWith("--")
    ) {
      options[
        {
          "--env": "envPath",
          "--source": "sourcePath",
          "--backup-dir": "backupDirectory",
        }[arg]
      ] = resolve(args[++index]);
    } else
      throw new MigrationError(
        "用法：deploy:migrate [--dry-run|--apply] [--source SQLite文件] [--env 部署文件] [--backup-dir 目录]",
      );
  }
  return options;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseMigrationArgs(args);
  const config = readEnv(options.envPath);
  validateTursoConfig(config);
  if (!options.sourcePath) {
    const local = readEnv(resolve(".env.local"), { optional: true });
    options.sourcePath = resolve(local.DATABASE_PATH || "data/alps.sqlite");
  }
  if (resolve(options.envPath) === resolve(".env.local"))
    throw new MigrationError(
      "迁移须读取专用 .env.deploy.local，避免与本地服务环境混用。",
    );
  const client = createClient({
    url: config.TURSO_DATABASE_URL,
    authToken: config.TURSO_AUTH_TOKEN,
  });
  try {
    const result = await migrateDatabase({
      ...options,
      client,
      onBackup: (path) =>
        console.log(`在线一致备份已保存至 ${path}；现在开始云端事务。`),
    });
    console.log(
      `${options.apply ? "迁移" : "只读预检"}完成：${result.state === "identical" ? "目标与来源完全一致，无需写入" : result.written ? "事务导入并完整校验通过" : "目标为空，可迁移"}。`,
    );
    console.log(
      `站点资料 ${result.counts.profile}；作品 ${result.counts.projects}；文章 ${result.counts.posts}；其中草稿 ${result.counts.drafts}；迁移标记 ${result.counts.migrations}。`,
    );
    console.log("登录会话与登录限流记录不会导入。");
  } finally {
    client.close();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    // Driver errors can contain URLs or tokens. Only our curated messages leave this process.
    console.error(
      error instanceof MigrationError || error instanceof DeploymentConfigError
        ? error.message
        : "迁移连接或数据库操作失败；请检查 libSQL 引擎、读写 token 与网络。内部错误和凭据未输出。",
    );
    process.exitCode = 1;
  }
}
