import Link from "@/components/motion-link";
import { BrandIcon, BrandLogo } from "@/components/brand";
import type { Profile } from "@/lib/content";
import { MotionReveal } from "@/components/motion-reveal";

export function SiteFooter({ profile }: { profile: Profile }) {
  return (
    <footer className="contact-footer studio-footer" id="contact">
      <div className="contact-footer-topline">
        <p className="contact-footer-label">GOOD IDEAS START WITH A HELLO.</p>
        <span>{profile.location}</span>
      </div>
      <div className="contact-footer-stage">
        <h2 className="contact-footer-title">
          <MotionReveal as="span" className="contact-footer-line">
            LET’S
          </MotionReveal>
          <MotionReveal as="span" className="contact-footer-line" delay={70}>
            MAKE
          </MotionReveal>
          <MotionReveal as="span" className="contact-footer-line" delay={140}>
            SOMETHING.
          </MotionReveal>
        </h2>
        <div className="contact-footer-note">
          <span aria-hidden="true">↙</span>
          <p>
            下一个想法，
            <br />
            一起发生。
          </p>
          <span className="contact-footer-note-caption">
            A NOTE TO THE FUTURE
          </span>
        </div>
      </div>
      <div className="contact-footer-details">
        <p>
          想法、合作，或只是打个招呼。
          <br />
          我们从一封邮件开始。
        </p>
        <a className="contact-footer-email" href={`mailto:${profile.email}`}>
          <span>{profile.email}</span>
          <BrandIcon name="arrow" size={28} />
        </a>
        <a
          className="contact-footer-github"
          href={profile.github}
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub <BrandIcon name="arrow" size={18} />
        </a>
      </div>
      <div className="contact-footer-base">
        <Link
          className="contact-footer-logo"
          href="/"
          aria-label={`${profile.name} 首页`}
        >
          <BrandLogo name={profile.name} />
        </Link>
        <p>
          © {new Date().getFullYear()} {profile.name}
        </p>
        <span className="contact-footer-signature">ALWAYS IN THE MAKING.</span>
        <a className="contact-footer-top" href="#main">
          回到上面 <span aria-hidden="true">↑</span>
        </a>
      </div>
    </footer>
  );
}
