import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { EntryForm } from "@/components/admin-forms";
import { isMediaConfigured } from "@/lib/media";
export default async function New({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  await requireAdmin();
  const kind = (await searchParams).kind === "project" ? "project" : "post";
  return (
    <>
      <Link
        className="admin-back"
        href={kind === "project" ? "/admin/projects" : "/admin/posts"}
      >
        返回{kind === "project" ? "作品" : "文章"}列表
      </Link>
      <div className="admin-page-heading editor-heading">
        <div>
          <p className="eyebrow">
            NEW {kind === "project" ? "PROJECT" : "STORY"}
          </p>
          <h1>一个新的{kind === "project" ? "作品" : "故事"}。</h1>
        </div>
      </div>
      <EntryForm
        key={`${kind}:new`}
        kind={kind}
        mediaReady={isMediaConfigured()}
      />
    </>
  );
}
