import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getProfile } from "@/lib/db";
import { SiteMotionProvider } from "@/components/site-motion";
import { SiteThemeProvider } from "@/components/site-theme";
import { SitePrintAtmosphere } from "@/components/site-print-atmosphere";
import { getSiteOrigin } from "@/lib/site-url";
import "./studio.css";
import "@/components/site-theme.css";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function generateMetadata(): Promise<Metadata> {
  const profile = await getProfile();
  return {
    metadataBase: new URL(getSiteOrigin()),
    title: {
      default: `${profile.name} — 代码、设计与日常`,
      template: `%s · ${profile.name}`,
    },
    description: profile.intro.replace(/\n/g, " "),
  };
}
export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();
  return (
    <SiteMotionProvider>
      <SiteThemeProvider>
        <a className="skip-link" href="#main">
          跳转到内容
        </a>
        <div className="site-shell studio-shell">
          <SitePrintAtmosphere />
          <SiteHeader name={profile.name} role={profile.role} />
          {children}
          <SiteFooter profile={profile} />
        </div>
      </SiteThemeProvider>
    </SiteMotionProvider>
  );
}
