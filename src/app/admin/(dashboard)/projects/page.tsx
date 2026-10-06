import { requireAdmin } from "@/lib/auth";
import { getEntries } from "@/lib/db";
import { ContentList } from "@/components/content-list";
export default async function Projects() {
  await requireAdmin();
  return (
    <ContentList entries={await getEntries("project", false)} kind="project" />
  );
}
