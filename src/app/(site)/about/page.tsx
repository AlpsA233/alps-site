import type { Metadata } from "next";
import Image from "next/image";
import { getProfile } from "@/lib/db";
import { Markdown } from "@/components/markdown";
import { BrandIcon } from "@/components/brand";
import { MotionReveal } from "@/components/motion-reveal";
import { MotionMedia } from "@/components/motion-media";
import "./about.css";
export const metadata: Metadata = { title: "关于" };
export default async function About() {
  const profile = await getProfile();
  return (
    <main id="main" className="about-editorial">
      <header className="about-editorial-heading">
        <div className="about-editorial-kicker">
          <p>03 / A HUMAN BEHIND THE SCREEN</p>
          <span>关于我</span>
        </div>
        <div className="about-editorial-title">
          <h1>
            <MotionReveal as="span">{profile.name}</MotionReveal>
          </h1>
          <p>
            认识一个名字
            <br />
            背后的人。
          </p>
        </div>
      </header>
      <figure className="about-editorial-landscape">
        <MotionMedia className="about-editorial-image">
          <Image
            src="/images/studio/editorial-object-v1.webp"
            alt="朱红纸带、镜面球与玻璃片组成的抽象拼贴"
            width={1400}
            height={933}
            preload
            sizes="(max-width:700px) 90vw, (max-width:1480px) 90vw, 1352px"
          />
        </MotionMedia>
        <figcaption>
          <span>AN OPEN MIND. A WORK IN PROGRESS.</span>
          <BrandIcon name="ridge" width={52} height={26} />
        </figcaption>
      </figure>
      <section
        className="about-editorial-story"
        aria-labelledby="about-story-title"
      >
        <aside className="about-editorial-specs" aria-label="个人资料">
          <BrandIcon name="stamp" size={66} />
          <dl>
            <div>
              <dt>身份 / PRACTICE</dt>
              <dd>{profile.role}</dd>
            </div>
            <div>
              <dt>坐标 / BASE</dt>
              <dd>{profile.location || "在线"}</dd>
            </div>
            <div>
              <dt>此刻 / RIGHT NOW</dt>
              <dd className="about-editorial-status">
                {profile.available === "yes" && <span aria-hidden="true" />}
                {profile.available === "yes"
                  ? "欢迎新的交流"
                  : "专注于手上的事"}
              </dd>
            </div>
          </dl>
        </aside>
        <div className="about-editorial-biography">
          <p className="about-editorial-section-label">一些关于我的事</p>
          <h2 id="about-story-title">
            <MotionReveal as="span">你好，很高兴认识你。</MotionReveal>
          </h2>
          <Markdown body={profile.about} />
          <div className="about-editorial-contact">
            <p>
              {profile.available === "yes"
                ? "欢迎聊聊新想法、合作，或者你正在做的事。"
                : "正在专注于手上的事，也欢迎来信交流。"}
            </p>
            <a href={`mailto:${profile.email}`}>
              {profile.email}
              <BrandIcon name="arrow" size={20} />
            </a>
          </div>
          <p className="about-editorial-signature">Still curious.</p>
        </div>
      </section>
    </main>
  );
}
