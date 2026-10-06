import { requireAdmin } from "@/lib/auth";
import { getProfile } from "@/lib/db";
import { AdminNav } from "@/components/admin-nav";
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const profile = await getProfile();
  return (
    <div className="admin-shell">
      <AdminNav name={profile.name} />
      <div className="admin-body">
        <header className="admin-topbar">
          <span>你的个人创作空间</span>
          <div>
            <span className="admin-avatar">
              {profile.name.slice(0, 1).toUpperCase()}
            </span>
            <span>{profile.name}</span>
          </div>
        </header>
        <main className="admin-main" id="main">
          {children}
        </main>
        <footer className="admin-footer">一点一点，积累自己的作品。</footer>
      </div>
    </div>
  );
}
