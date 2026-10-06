import { requireAdmin } from "@/lib/auth";
import { getEntries } from "@/lib/db";
import { ContentList } from "@/components/content-list";
export default async function Posts() {
  await requireAdmin();
  return <ContentList entries={await getEntries("post", false)} kind="post" />;
}
