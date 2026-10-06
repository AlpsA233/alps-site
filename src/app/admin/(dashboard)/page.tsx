import Link from "next/link";
import { Plus } from "lucide-react";
import { BrandIcon } from "@/components/brand";
import { requireAdmin } from "@/lib/auth";
import { getEntries, getProfile } from "@/lib/db";
export default async function Dashboard() {
  await requireAdmin();
  const [all, profile] = await Promise.all([
    getEntries(undefined, false),
    getProfile(),
  ]);
  const stats = [
    {
      label: "作品",
      value: all.filter((x) => x.kind === "project").length,
      icon: "work",
    },
    {
      label: "文章",
      value: all.filter((x) => x.kind === "post").length,
      icon: "writing",
    },
    {
      label: "未发布草稿",
      value: all.filter((x) => x.status === "draft").length,
      icon: "draft",
    },
  ] as const;
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">OVERVIEW / 创作总览</p>
          <h1>
            欢迎回来，{profile.name}
            <BrandIcon name="mark" size={28} className="admin-heading-star" />
          </h1>
          <p>给想法一个归处，把作品慢慢积累起来。</p>
        </div>
        <Link
          href="/admin/content/new?kind=post"
          className="button button-dark"
        >
          <Plus size={17} />
          写一篇文章
        </Link>
      </div>
      <div className="stats-grid">
        {stats.map((stat) => (
          <div className="stat-card" key={stat.label}>
            <span>
              {stat.label}
              <BrandIcon name={stat.icon} size={19} />
            </span>
            <strong>{String(stat.value).padStart(2, "0")}</strong>
            <p>
              {stat.label === "未发布草稿"
                ? "留给自己继续打磨"
                : "在自己的空间里，留下痕迹"}
            </p>
          </div>
        ))}
      </div>
      <div className="dashboard-columns">
        <section className="admin-panel">
          <div className="panel-heading">
            <h2>最近的内容</h2>
            <span>{all.length} 条内容</span>
          </div>
          {all.length ? (
            <div className="recent-list">
              {all.slice(0, 5).map((entry) => (
                <Link
                  key={entry.id}
                  href={`/admin/content/${entry.id}`}
                  className="recent-row"
                >
                  <div className="recent-icon">
                    <BrandIcon
                      name={entry.kind === "project" ? "work" : "writing"}
                      size={18}
                    />
                  </div>
                  <div>
                    <h3>{entry.title}</h3>
                    <p>
                      {entry.kind === "project" ? "作品" : "文章"} ·{" "}
                      {entry.category}
                    </p>
                  </div>
                  <span className={`status-badge ${entry.status}`}>
                    {entry.status === "published" ? "已发布" : "草稿"}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="admin-empty">还没有内容，从一篇文章开始吧。</p>
          )}
        </section>
        <aside className="studio-note">
          <BrandIcon name="compass" size={47} className="note-star" />
          <p className="eyebrow">ONE THING AT A TIME</p>
          <h2>
            好想法，
            <br />
            值得被留下。
          </h2>
          <p>作品不必一步到位。先把它记录下来，再一点点变好。</p>
          <Link href="/admin/content/new?kind=project">添加一个作品</Link>
          <span className="hand-studio">Start somewhere.</span>
        </aside>
      </div>
      <section className="profile-reminder">
        <div>
          <h2>让读者认识你。</h2>
          <p>更新简介、联系方式和关于页，给网站添上你的个人印记。</p>
        </div>
        <Link href="/admin/profile" className="button button-outline">
          编辑个人资料
        </Link>
      </section>
    </>
  );
}
