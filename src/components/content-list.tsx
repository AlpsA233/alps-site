import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import type { Entry } from "@/lib/content";
export function ContentList({
  entries,
  kind,
}: {
  entries: Entry[];
  kind: Entry["kind"];
}) {
  const name = kind === "project" ? "作品" : "文章";
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">
            {kind === "project" ? "PROJECTS" : "WRITING"} / 内容管理
          </p>
          <h1>{name}管理</h1>
          <p>
            共 {entries.length} 条，
            {entries.filter((x) => x.status === "published").length} 条已发布。
          </p>
        </div>
        <Link
          className="button button-dark"
          href={`/admin/content/new?kind=${kind}`}
        >
          <Plus size={17} />
          新建{name}
        </Link>
      </div>
      <div className="admin-panel table-panel">
        <div className="table-scroll">
          <table className="content-table">
            <thead>
              <tr>
                <th>标题</th>
                <th>分类</th>
                <th>状态</th>
                <th>最近更新</th>
                <th>
                  <span className="visually-hidden">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <Link
                      className="table-title"
                      href={`/admin/content/${entry.id}`}
                    >
                      {entry.title}
                    </Link>
                    <span className="table-slug">
                      /{kind === "project" ? "work" : "writing"}/{entry.slug}
                    </span>
                  </td>
                  <td>{entry.category}</td>
                  <td>
                    <span className={`status-badge ${entry.status}`}>
                      {entry.status === "published" ? "已发布" : "草稿"}
                    </span>
                  </td>
                  <td className="date-cell">
                    {new Date(entry.updatedAt).toLocaleDateString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                    })}
                  </td>
                  <td>
                    <Link
                      className="edit-link"
                      href={`/admin/content/${entry.id}`}
                      aria-label={`编辑 ${entry.title}`}
                    >
                      <Pencil size={16} />
                      <span>编辑</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!entries.length && (
          <div className="admin-empty">
            <p>还没有{name}。</p>
            <Link
              className="text-link"
              href={`/admin/content/new?kind=${kind}`}
            >
              创建第一条
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
