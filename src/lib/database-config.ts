import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type DatabaseConfig =
  | { provider: "local"; path: string; url: string }
  | { provider: "turso"; url: string; authToken: string };

// Pure configuration resolution: no file, network or database access.
export function resolveDatabaseConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DatabaseConfig {
  const remoteUrl = env.TURSO_DATABASE_URL?.trim();
  const authToken = env.TURSO_AUTH_TOKEN?.trim();
  if (remoteUrl) {
    let parsed: URL;
    try {
      parsed = new URL(remoteUrl);
    } catch {
      throw new Error(
        "TURSO_DATABASE_URL 必须是有效的 libsql:// 或 https:// 地址。",
      );
    }
    if (
      !["libsql:", "https:"].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error(
        "TURSO_DATABASE_URL 必须是有效的 libsql:// 或 https:// 地址。",
      );
    }
    if (!authToken) {
      throw new Error(
        "已配置 TURSO_DATABASE_URL，请同时配置 TURSO_AUTH_TOKEN。",
      );
    }
    return { provider: "turso", url: remoteUrl, authToken };
  }
  if (env.VERCEL) {
    throw new Error(
      "Vercel 运行需要 TURSO_DATABASE_URL 和 TURSO_AUTH_TOKEN，不能使用本地 SQLite 文件。",
    );
  }
  if (authToken) {
    throw new Error("已配置 TURSO_AUTH_TOKEN，请同时配置 TURSO_DATABASE_URL。");
  }
  const path = resolve(
    /* turbopackIgnore: true */ env.DATABASE_PATH || "data/alps.sqlite",
  );
  return { provider: "local", path, url: pathToFileURL(path).href };
}
