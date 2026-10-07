import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { PasswordChangeForm } from "@/components/password-change-form";

export const metadata: Metadata = { title: "账号安全 · 创作工作台" };

export default async function Security() {
  await requireAdmin();

  return (
    <>
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">SECURITY / 账号安全</p>
          <h1>管理你的后台密码。</h1>
          <p>先输入当前密码，再设置一个新的密码。</p>
        </div>
      </div>
      <div className="security-layout">
        <PasswordChangeForm />
        <aside className="security-note" aria-labelledby="security-note-title">
          <span className="security-note-label">关于这次修改</span>
          <h2 id="security-note-title">所有设备会退出登录。</h2>
          <p>
            修改成功后，你会回到登录页。其他已登录的设备也会退出，请使用新密码重新进入工作台。
          </p>
        </aside>
      </div>
    </>
  );
}
