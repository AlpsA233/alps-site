import type { MetadataRoute } from "next";
import { getEntries } from "@/lib/db";
import { getSiteOrigin } from "@/lib/site-url";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin();
  return [
    ...["", "/work", "/writing", "/about"].map((path) => ({
      url: origin + path,
    })),
    ...(await getEntries()).map((entry) => ({
      url: `${origin}/${entry.kind === "project" ? "work" : "writing"}/${entry.slug}`,
      lastModified: entry.updatedAt,
    })),
  ];
}
