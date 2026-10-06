import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { validSession } from "./session-store";
export const SESSION_COOKIE = "alps_admin_session";
export async function isAdmin() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const credential = process.env.ADMIN_PASSWORD_HASH || "";
  if (!token || !credential) return false;
  return await validSession(await db(), token, credential);
}
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}
