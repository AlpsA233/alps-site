import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { LoginForm } from "@/components/admin-forms";
import { BrandLogo } from "@/components/brand";
import { getProfile } from "@/lib/db";
export default async function Login() {
  if (await isAdmin()) redirect("/admin");
  const profile = await getProfile();
  return (
    <main className="login-page">
      <aside className="login-art">
        <Link
          className="login-wordmark"
          href="/"
          aria-label={`${profile.name} 首页`}
        >
          <BrandLogo name={profile.name} />
        </Link>
        <div className="login-manifesto">
          <p className="eyebrow">THE OTHER SIDE OF YOUR SPACE</p>
          <h1>
            A quiet place
            <br />
            for your <em>ideas.</em>
          </h1>
          <p>把零散的想法，慢慢做成自己的作品。</p>
        </div>
        <div className="login-image">
          <Image
            src="/images/alps-hero.png"
            alt="阿尔卑斯山的黑白影像"
            width={1122}
            height={1402}
            loading="eager"
            sizes="50vw"
          />
        </div>
        <span className="login-signature">Keep making.</span>
      </aside>
      <section className="login-content">
        <Link href="/" className="login-back">
          返回网站
        </Link>
        <div className="login-inner">
          <Link
            className="login-mobile-brand"
            href="/"
            aria-label={`${profile.name} 首页`}
          >
            <BrandLogo name={profile.name} />
          </Link>
          <p className="eyebrow">YOUR PERSONAL STUDIO</p>
          <h2>欢迎回来。</h2>
          <p className="muted">登录后，继续写你的故事。</p>
          <LoginForm />
        </div>
        <p className="login-bottom">
          {profile.name.toUpperCase()} / CONTENT STUDIO
        </p>
      </section>
    </main>
  );
}
