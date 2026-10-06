import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/site-url";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/admin/"] },
    sitemap: `${origin}/sitemap.xml`,
  };
}
