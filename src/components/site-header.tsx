"use client";

import Link from "@/components/motion-link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandIcon, BrandLogo } from "@/components/brand";
import "./site-chrome.css";

const links = [
  { href: "/", text: "首页" },
  { href: "/work", text: "作品" },
  { href: "/writing", text: "文字" },
  { href: "/about", text: "关于" },
];

export function SiteHeader({ name, role }: { name: string; role?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const header = useRef<HTMLElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setReady(true);
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    if (navigation.current) navigation.current.scrollTop = 0;
    navigation.current?.querySelector<HTMLAnchorElement>("a")?.focus({
      preventScroll: true,
    });
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      menuButton.current?.focus({ preventScroll: true });
    };
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !header.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);

  return (
    <header
      ref={header}
      className={`site-header site-chrome studio-masthead${open ? " menu-is-open" : ""}`}
      data-ready={ready ? "true" : undefined}
      data-scrolled={scrolled ? "true" : "false"}
      onBlurCapture={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget))
          setOpen(false);
      }}
    >
      <Link
        className="wordmark"
        href="/"
        aria-label={`${name} 首页`}
        onClick={() => setOpen(false)}
      >
        <BrandLogo name={name} />
      </Link>
      <nav
        ref={navigation}
        id="site-navigation"
        className={`site-nav${open ? " is-open" : ""}`}
        aria-label="主导航"
      >
        <p className="site-nav-eyebrow">INDEX / {name.toUpperCase()}</p>
        <div className="site-nav-links">
          {links.map((link, index) => {
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
                onClick={() => setOpen(false)}
              >
                <span className="site-nav-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{link.text}</span>
              </Link>
            );
          })}
        </div>
        <a
          className="header-contact"
          href="#contact"
          onClick={() => setOpen(false)}
        >
          从一封邮件开始 <BrandIcon name="arrow" size={18} />
        </a>
        <p className="site-nav-note">{role || "代码、设计，以及新的想法。"}</p>
      </nav>
      <button
        ref={menuButton}
        type="button"
        className="menu-toggle"
        hidden={!ready}
        aria-label={open ? "关闭目录" : "打开目录"}
        aria-expanded={open}
        aria-controls="site-navigation"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{open ? "Close" : "Menu"}</span>
        <span className="menu-toggle-mark" aria-hidden="true">
          <span />
          <span />
        </span>
      </button>
    </header>
  );
}
