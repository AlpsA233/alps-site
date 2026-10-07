import { createHash, randomBytes } from "node:crypto";
import type { Client, Transaction } from "@libsql/client";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 8;
function hashToken(token: string, credential: string) {
  return createHash("sha256")
    .update(token + ":" + credential)
    .digest("hex");
}
export async function createSession(
  database: Client,
  credential: string,
  now = Date.now(),
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await database.batch(
    [
      { sql: "DELETE FROM sessions WHERE expires_at <= ?", args: [now] },
      {
        sql: "INSERT INTO sessions (token_hash,expires_at) VALUES (?,?)",
        args: [hashToken(token, credential), now + SESSION_SECONDS * 1000],
      },
    ],
    "write",
  );
  return token;
}
export async function validSession(
  database: Pick<Transaction, "execute">,
  token: string,
  credential: string,
  now = Date.now(),
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(token) || !credential) return false;
  const result = await database.execute({
    sql: "SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?",
    args: [hashToken(token, credential), now],
  });
  return result.rows.length > 0;
}
export async function revokeSession(
  database: Client,
  token: string,
  credential: string,
): Promise<void> {
  await database.execute({
    sql: "DELETE FROM sessions WHERE token_hash=?",
    args: [hashToken(token, credential)],
  });
}
export async function claimLoginAttempt(
  database: Client,
  now = Date.now(),
): Promise<boolean> {
  return claimAttempt(database, "login_attempts", now);
}

export async function claimPasswordChangeAttempt(
  database: Client,
  now = Date.now(),
): Promise<boolean> {
  return claimAttempt(database, "password_change_attempts", now);
}

async function claimAttempt(
  database: Client,
  table: "login_attempts" | "password_change_attempts",
  now: number,
): Promise<boolean> {
  // Claim and increment atomically, including across separate serverless instances.
  const result = await database.execute({
    sql: `INSERT INTO ${table} (id,count,started_at) VALUES (1,1,$now)
      ON CONFLICT(id) DO UPDATE SET
        count=CASE
          WHEN excluded.started_at-${table}.started_at >= $window THEN 1
          ELSE ${table}.count+1 END,
        started_at=CASE
          WHEN excluded.started_at-${table}.started_at >= $window THEN excluded.started_at
          ELSE ${table}.started_at END
      WHERE excluded.started_at-${table}.started_at >= $window
        OR ${table}.count < $maximum
      RETURNING count`,
    args: {
      now,
      window: LOGIN_WINDOW_MS,
      maximum: LOGIN_MAX_ATTEMPTS,
    },
  });
  return result.rows.length === 1;
}

export async function clearLoginAttempts(database: Client): Promise<void> {
  await database.execute("DELETE FROM login_attempts WHERE id=1");
}

export async function clearPasswordChangeAttempts(
  database: Client,
): Promise<void> {
  await database.execute("DELETE FROM password_change_attempts WHERE id=1");
}
