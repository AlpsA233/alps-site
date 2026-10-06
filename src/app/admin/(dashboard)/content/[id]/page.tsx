import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getEntry } from "@/lib/db";
import { EntryForm } from "@/components/admin-forms";
export default async function Editor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  await requireAdmin();
  const entry = await getEntry((await params).id);
  if (!entry) notFound();
  return (
    <>
      <Link
        className="admin-back"
        href={entry.kind === "project" ? "/admin/projects" : "/admin/posts"}
      >
        返回{entry.kind === "project" ? "作品" : "文章"}列表
      </Link>
      <div className="admin-page-heading editor-heading">
        <div>
          <p className="eyebrow">
            EDIT {entry.kind === "project" ? "PROJECT" : "STORY"}
          </p>
          <h1>继续打磨。</h1>
        </div>
      </div>
      <EntryForm
        key={entry.id}
        entry={entry}
        kind={entry.kind}
        created={(await searchParams).created === "1"}
      />
    </>
  );
}
