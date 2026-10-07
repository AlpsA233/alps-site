import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { validSession } from "./session-store";
import { getAdminCredential } from "./admin-credentials";
export const SESSION_COOKIE = "alps_admin_session";
export async function isAdmin() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const database = await db();
  const credential = await getAdminCredential(
    database,
    process.env.ADMIN_PASSWORD_HASH,
  );
  if (!credential) return false;
  return await validSession(database, token, credential);
}
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}
