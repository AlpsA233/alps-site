import type { Client } from "@libsql/client";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveDatabaseConfig, type DatabaseConfig } from "./database-config";

export async function createDatabaseClient(
  config: DatabaseConfig = resolveDatabaseConfig(),
): Promise<Client> {
  if (config.provider === "turso") {
    const { createClient } = await import("@libsql/client/web");
    return createClient({ url: config.url, authToken: config.authToken });
  }
  await mkdir(dirname(config.path), { recursive: true });
  const { createClient } = await import("@libsql/client");
  const client = createClient({ url: config.url, timeout: 5000 });
  try {
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA busy_timeout = 5000");
    return client;
  } catch (error) {
    client.close();
    throw error;
  }
}
