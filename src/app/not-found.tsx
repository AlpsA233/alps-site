import Link from "next/link";
import { BrandLogo } from "@/components/brand";
export default function NotFound() {
  return (
    <main className="not-found">
      <Link className="wordmark" href="/" aria-label="Alps 首页">
        <BrandLogo />
      </Link>
      <p className="eyebrow">404 / A LITTLE DETOUR</p>
      <h1>
        这条小路，
        <br />
        还没有通向这里。
      </h1>
      <p>页面可能已经移动，或还未发布。</p>
      <Link className="button button-dark" href="/">
        回到首页
      </Link>
      <span className="hand-note-inline">Let's find another way.</span>
    </main>
  );
}
