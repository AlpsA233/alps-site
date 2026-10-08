"use client";

import Link from "@/components/motion-link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand";
import { SiteThemeControl } from "@/components/site-theme";
import "./site-chrome.css";

const links = [
  { href: "/", text: "首页" },
  { href: "/work", text: "作品" },
  { href: "/writing", text: "文字" },
  { href: "/about", text: "关于" },
];

export function SiteHeader({ name }: { name: string; role?: string }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const progressBar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const root = document.documentElement;
      const distance = root.scrollHeight - root.clientHeight;
      const progress =
        distance > 0 ? Math.max(0, Math.min(1, window.scrollY / distance)) : 0;
      progressBar.current?.style.setProperty(
        "--reading-progress",
        String(progress),
      );
      setScrolled(window.scrollY > 24);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // Body observation also covers replaced pages, loaded images and expanded details.
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("pageshow", schedule);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [pathname]);

  return (
    <header
      className="site-header site-chrome studio-masthead"
      data-scrolled={scrolled ? "true" : "false"}
    >
      <Link className="wordmark" href="/" aria-label={`${name} 首页`}>
        <BrandLogo name={name} />
      </Link>
      <nav id="site-navigation" className="site-nav" aria-label="主导航">
        <div className="site-nav-links">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={active ? "active" : undefined}
                aria-current={active ? "page" : undefined}
              >
                {link.text}
              </Link>
            );
          })}
        </div>
      </nav>
      <SiteThemeControl />
      <div
        ref={progressBar}
        className="studio-reading-progress"
        aria-hidden="true"
      />
    </header>
  );
}
