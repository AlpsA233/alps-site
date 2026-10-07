import type { Client } from "@libsql/client";
import { hashPassword, isPasswordHash, verifyPassword } from "./password";
import { claimPasswordChangeAttempt, validSession } from "./session-store";

export type PasswordChangeInput = {
  sessionToken: string;
  currentPassword: unknown;
  newPassword: unknown;
  confirmPassword: unknown;
};
export type PasswordChangeResult = { ok: true } | { ok: false; error: string };

// Environment credentials only bootstrap a new database. Always read the shared
// record so warm serverless instances cannot keep accepting a previous password.
export async function getAdminCredential(
  database: Client,
  bootstrapCredential: string | undefined,
): Promise<string | null> {
  const read = () =>
    database.execute("SELECT password_hash FROM admin_credentials WHERE id=1");
  let result = await read();
  if (!result.rows.length && isPasswordHash(bootstrapCredential)) {
    await database.execute({
      sql: "INSERT OR IGNORE INTO admin_credentials (id,password_hash,updated_at) VALUES (1,?,?)",
      args: [bootstrapCredential, new Date().toISOString()],
    });
    result = await read();
  }
  const credential = result.rows[0]?.password_hash;
  // A malformed persisted credential fails closed, rather than falling back to
  // an old environment value and silently restoring access with an old password.
  return isPasswordHash(credential) ? credential : null;
}

export async function changeAdminPassword(
  database: Client,
  bootstrapCredential: string | undefined,
  input: PasswordChangeInput,
): Promise<PasswordChangeResult> {
  const { currentPassword, newPassword, confirmPassword, sessionToken } = input;
  if (
    typeof currentPassword !== "string" ||
    !currentPassword.length ||
    currentPassword.length > 256
  )
    return { ok: false, error: "请输入有效的当前密码。" };
  if (
    typeof newPassword !== "string" ||
    newPassword.length < 1 ||
    newPassword.length > 256
  )
    return { ok: false, error: "新密码不能为空，且不能超过 256 个字符。" };
  if (newPassword !== confirmPassword)
    return { ok: false, error: "两次输入的新密码不一致。" };
  if (newPassword === currentPassword)
    return { ok: false, error: "新密码不能与当前密码相同。" };

  const credential = await getAdminCredential(database, bootstrapCredential);
  if (!credential || !(await validSession(database, sessionToken, credential)))
    return { ok: false, error: "登录已失效，请重新登录后修改密码。" };
  if (!(await claimPasswordChangeAttempt(database)))
    return { ok: false, error: "验证次数较多，请在 10 分钟后重试。" };
  if (!(await verifyPassword(currentPassword, credential)))
    return { ok: false, error: "当前密码不正确，请重试。" };

  // Derive the expensive key before starting a short-lived cloud transaction.
  const replacement = await hashPassword(newPassword);
  const transaction = await database.transaction("write");
  try {
    // A logout or another password change during derivation must win.
    if (!(await validSession(transaction, sessionToken, credential))) {
      await transaction.rollback();
      return { ok: false, error: "登录已失效，请重新登录后修改密码。" };
    }
    const updated = await transaction.execute({
      sql: "UPDATE admin_credentials SET password_hash=?,updated_at=? WHERE id=1 AND password_hash=?",
      args: [replacement, new Date().toISOString(), credential],
    });
    if (updated.rowsAffected !== 1) {
      await transaction.rollback();
      return { ok: false, error: "密码已发生变化，请重新登录后再试。" };
    }
    await transaction.batch([
      "DELETE FROM sessions",
      "DELETE FROM login_attempts",
      "DELETE FROM password_change_attempts",
    ]);
    await transaction.commit();
    return { ok: true };
  } finally {
    transaction.close();
  }
}

// For an explicitly confirmed operator recovery, never a public server action.
export async function resetAdminCredential(
  database: Client,
  encoded: string,
): Promise<void> {
  if (!isPasswordHash(encoded)) throw new Error("无效的密码哈希。");
  await database.batch(
    [
      {
        sql: "INSERT INTO admin_credentials (id,password_hash,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash,updated_at=excluded.updated_at",
        args: [encoded, new Date().toISOString()],
      },
      "DELETE FROM sessions",
      "DELETE FROM login_attempts",
      "DELETE FROM password_change_attempts",
    ],
    "write",
  );
}
