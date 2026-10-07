"use client";

import Link from "@/components/motion-link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand";
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

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

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
    </header>
  );
}
