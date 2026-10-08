"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, SESSION_COOKIE } from "./auth";
import { db, saveEntry, deleteEntry, getEntry, saveProfile } from "./db";
import { entrySchema, profileSchema } from "./content";
import { verifyPassword } from "./password";
import { changeAdminPassword, getAdminCredential } from "./admin-credentials";
import { getMediaPublicBase } from "./media";
import { isManagedImageUrl } from "./media-policy";
import {
  createSession,
  revokeSession,
  claimLoginAttempt,
  clearLoginAttempts,
  SESSION_SECONDS,
} from "./session-store";
export type ActionState = { error?: string; success?: string };
export async function loginAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const password = form.get("password");
  if (
    typeof password !== "string" ||
    password.length < 1 ||
    password.length > 256
  )
    return { error: "请输入有效密码。" };
  const database = await db();
  const hash = await getAdminCredential(
    database,
    process.env.ADMIN_PASSWORD_HASH,
  );
  if (!hash)
    return {
      error:
        "后台还未初始化，请配置初始密码，或运行 npm run admin:reset 恢复访问。",
    };
  if (!(await claimLoginAttempt(database)))
    return { error: "尝试次数较多，请在 10 分钟后重试。" };
  if (!(await verifyPassword(password, hash)))
    return { error: "密码不正确，请重试。" };
  await clearLoginAttempts(database);
  const cookieStore = await cookies();
  const previous = cookieStore.get(SESSION_COOKIE)?.value;
  if (previous) await revokeSession(database, previous, hash);
  const token = await createSession(database, hash);
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.COOKIE_SECURE !== "false",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  redirect("/admin");
}
export async function logoutAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const database = await db();
    const credential = await getAdminCredential(
      database,
      process.env.ADMIN_PASSWORD_HASH,
    );
    if (credential) await revokeSession(database, token, credential);
  }
  cookieStore.delete(SESSION_COOKIE);
  redirect("/admin/login");
}
export async function changePasswordAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value || "";
  let result;
  try {
    result = await changeAdminPassword(
      await db(),
      process.env.ADMIN_PASSWORD_HASH,
      {
        sessionToken,
        currentPassword: form.get("currentPassword"),
        newPassword: form.get("newPassword"),
        confirmPassword: form.get("confirmPassword"),
      },
    );
  } catch {
    return { error: "修改失败，请稍后重试。" };
  }
  if (!result.ok) return { error: result.error };
  cookieStore.delete(SESSION_COOKIE);
  redirect("/admin/login?passwordChanged=1");
}
export async function saveEntryAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const raw = Object.fromEntries(form);
  if (!raw.id) delete raw.id;
  // Keep images when an older, already-open editor submits without the new fields.
  if (
    typeof raw.id === "string" &&
    raw.id.length <= 80 &&
    (!form.has("coverPath") || !form.has("coverAlt"))
  ) {
    const existing = await getEntry(raw.id);
    if (existing) {
      if (!form.has("coverPath")) raw.coverPath = existing.coverPath;
      if (!form.has("coverAlt")) raw.coverAlt = existing.coverAlt;
    }
  }
  const parsed = entrySchema.safeParse(raw);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message || "请检查输入内容。" };
  if (
    parsed.data.coverPath.startsWith("https://") &&
    !isManagedImageUrl(parsed.data.coverPath, getMediaPublicBase())
  )
    return { error: "封面地址不属于当前配置的图床，请重新上传。" };
  let id: string;
  try {
    id = await saveEntry(parsed.data);
  } catch (error) {
    if (error instanceof Error && /UNIQUE/.test(error.message))
      return { error: "这个访问路径已被使用，请换一个。" };
    return { error: "保存失败，请稍后重试。" };
  }
  revalidatePath("/", "layout");
  if (!parsed.data.id) redirect(`/admin/content/${id}?created=1`);
  return {
    success:
      parsed.data.status === "published"
        ? "已保存并发布，前台已更新。"
        : "草稿已保存，仅在后台可见。",
  };
}
export async function deleteEntryAction(form: FormData) {
  await requireAdmin();
  const id = form.get("id");
  if (typeof id !== "string" || id.length > 80) return;
  const entry = await getEntry(id);
  if (!entry) return;
  await deleteEntry(id);
  revalidatePath("/", "layout");
  redirect(entry.kind === "project" ? "/admin/projects" : "/admin/posts");
}
export async function saveProfileAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message || "请检查输入内容。" };
  try {
    await saveProfile(parsed.data);
  } catch {
    return { error: "保存失败，请稍后重试。" };
  }
  revalidatePath("/", "layout");
  return { success: "个人资料已保存，前台已更新。" };
}
