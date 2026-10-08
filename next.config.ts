import type { NextConfig } from "next";
import { normalizeMediaPublicBase } from "./src/lib/media-policy";
const mediaBase = normalizeMediaPublicBase(process.env.MEDIA_PUBLIC_BASE_URL);
const config: NextConfig = {
  distDir: process.env.ALPS_BUILD_DIR || ".next",
  poweredByHeader: false,
  devIndicators: false,
  images: {
    maximumRedirects: 0,
    remotePatterns: mediaBase
      ? [
          {
            protocol: "https",
            hostname: new URL(mediaBase).hostname,
            port: "",
            pathname: "/media/**",
            search: "",
          },
        ]
      : [],
  },
  serverExternalPackages: ["better-sqlite3", "@libsql/client"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
