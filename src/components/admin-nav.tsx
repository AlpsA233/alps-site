"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound } from "lucide-react";
import { BrandIcon, BrandLogo } from "@/components/brand";
import { logoutAction } from "@/lib/actions";
const items = [
  { href: "/admin", label: "总览", icon: "compass" },
  { href: "/admin/projects", label: "作品管理", icon: "work" },
  { href: "/admin/posts", label: "文章管理", icon: "writing" },
  { href: "/admin/profile", label: "个人资料", icon: "profile" },
  { href: "/admin/security", label: "账号安全", icon: "security" },
] as const;
export function AdminNav({ name }: { name: string }) {
  const pathname = usePathname();
  return (
    <aside className="admin-sidebar">
      <Link
        href="/admin"
        className="admin-brand"
        aria-label={`${name} 后台总览`}
      >
        <BrandLogo name={name} />
      </Link>
      <p className="sidebar-label">个人创作工作台</p>
      <nav aria-label="后台导航">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              (
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href)
              )
                ? "selected"
                : ""
            }
          >
            {item.icon === "security" ? (
              <KeyRound size={18} aria-hidden="true" />
            ) : (
              <BrandIcon name={item.icon} size={18} />
            )}
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <Link href="/" target="_blank">
          <BrandIcon name="arrow" size={17} />
          查看网站
        </Link>
        <form action={logoutAction}>
          <button type="submit">
            <BrandIcon name="exit" size={17} />
            退出登录
          </button>
        </form>
        <p>Less noise. More making.</p>
      </div>
    </aside>
  );
}
