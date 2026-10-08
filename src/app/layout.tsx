import type { Metadata } from "next";
import { SITE_THEME_BOOTSTRAP } from "@/lib/site-theme";
import "@fontsource/cormorant-garamond/latin-400.css";
import "@fontsource/cormorant-garamond/latin-400-italic.css";
import "@fontsource/cormorant-garamond/latin-500.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "@fontsource/caveat/latin-400.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Alps — 代码、设计与日常",
  description:
    "Alps 的个人自留地。记录作品、开发手记，以及生活里值得留下的细节。",
  icons: {
    icon: [
      { url: "/icon.svg?v=alps-editorial-2", type: "image/svg+xml" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          id="site-theme-init"
          dangerouslySetInnerHTML={{ __html: SITE_THEME_BOOTSTRAP }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
