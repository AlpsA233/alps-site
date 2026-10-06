import "server-only";

export function getSiteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const vercelDomain =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const value =
    configured ||
    (vercelDomain ? `https://${vercelDomain}` : "http://127.0.0.1:3000");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("NEXT_PUBLIC_SITE_URL 必须是 http:// 或 https:// 地址。");
  }
  if (process.env.VERCEL && url.protocol !== "https:") {
    throw new Error("Vercel 上的 NEXT_PUBLIC_SITE_URL 必须使用 HTTPS。");
  }
  return url.origin;
}
