import Image from "next/image";
import Link from "@/components/motion-link";
import { BrandIcon } from "@/components/brand";
import { EntryCover } from "@/components/entry-cover";
import { MotionReveal } from "@/components/motion-reveal";
import { EditorialStage } from "@/components/editorial-stage";
import { PrintTitle } from "@/components/print-title";
import { getEntries, getProfile } from "@/lib/db";
import { readingTime } from "@/lib/content";
import type { CSSProperties } from "react";
import "./home.css";

export default async function Home() {
  const [profile, allProjects, allPosts] = await Promise.all([
    getProfile(),
    getEntries("project"),
    getEntries("post"),
  ]);
  const projects = allProjects.slice(0, 3),
    posts = allPosts.slice(0, 3);
  const name = profile.name.toUpperCase();
  return (
    <main id="main" className="editorial-home">
      <EditorialStage>
        <section
          className="poster-hero"
          data-hero
          aria-labelledby="poster-title"
        >
          <div className="poster-frame" data-hero-frame>
            <div className="poster-topline">
              <span>INDEPENDENT MIND. HANDS-ON MAKER.</span>
              <span className="poster-availability">
                <i aria-hidden="true" />
                {profile.available === "yes"
                  ? "开放交流与合作"
                  : "正在创造新东西"}
              </span>
            </div>
            <h1
              id="poster-title"
              className="poster-name"
              aria-label={profile.name}
              style={
                {
                  "--name-fit": 4 / Math.max(4, Array.from(name).length),
                } as CSSProperties
              }
            >
              {Array.from(name).map((letter, index) => (
                <PrintTitle
                  key={index}
                  data-hero-letter
                  aria-hidden="true"
                  style={
                    {
                      "--letter-index": index,
                      "--letter-distance":
                        index - (Array.from(name).length - 1) / 2,
                    } as CSSProperties
                  }
                >
                  {letter}
                </PrintTitle>
              ))}
            </h1>
            <div className="poster-cross" aria-hidden="true">
              <svg viewBox="0 0 80 80" fill="none">
                <path
                  d="M40 6v68M6 40h68"
                  stroke="currentColor"
                  strokeWidth="1"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="32"
                  stroke="currentColor"
                  strokeWidth=".5"
                />
              </svg>
            </div>
            <div className="poster-object" data-hero-object>
              <button
                type="button"
                className="poster-object-button"
                data-object-control
                aria-label="旋转朱红拼贴装置：点击旋转，鼠标拖动，左右方向键调整，Home 键复位"
                aria-keyshortcuts="ArrowLeft ArrowRight Home"
              >
                <Image
                  src="/images/studio/editorial-object-v1.webp"
                  alt="朱红折叠纸带与镜面球、玻璃片组成的原创拼贴装置"
                  width={1400}
                  height={933}
                  sizes="(max-width:700px) 100vw, 62vw"
                  preload
                  draggable={false}
                />
              </button>
              <span className="poster-play-note" aria-hidden="true">
                go on, play a little.
              </span>
            </div>
            <Link className="poster-sticker" href="/about" data-magnetic>
              <BrandIcon name="mark" size={29} />
              <span>
                A LITTLE
                <br />
                DIFFERENT.
              </span>
              <BrandIcon name="arrow" size={17} />
            </Link>
            <div className="poster-bottomline">
              <div className="poster-intro">
                <p>{profile.role}</p>
                <h2>{profile.headline}</h2>
              </div>
              <a className="poster-explore" href="#selected-work" data-magnetic>
                <span>往下，看看作品</span>
                <span className="poster-explore-icon">
                  <BrandIcon name="arrow" size={24} />
                </span>
              </a>
              <span className="poster-edition">
                PERSONAL SPACE
                <br />
                EST. IN CURIOSITY
              </span>
            </div>
          </div>
        </section>
        <div className="editorial-ticker-viewport" aria-hidden="true">
          <div className="editorial-ticker" data-loop>
            <div className="editorial-ticker-track">
              {[0, 1].map((copy) => (
                <span key={copy}>
                  CODE WITH INTENT <BrandIcon name="mark" size={34} /> DESIGN
                  WITH FEELING <BrandIcon name="mark" size={34} /> STAY A LITTLE
                  DIFFERENT <BrandIcon name="mark" size={34} />
                </span>
              ))}
            </div>
          </div>
        </div>
        <section
          className="editorial-manifesto"
          data-manifesto
          aria-labelledby="manifesto-title"
        >
          <div className="editorial-section-label">
            <span>01 / THE WAY I SEE IT</span>
            <span>想法，如何发生。</span>
          </div>
          <div className="manifesto-layout">
            <p className="manifesto-aside">
              写代码，做设计。
              <br />
              总想多试一种可能。
            </p>
            <div>
              <h2 id="manifesto-title" className="manifesto-statement">
                <span data-ink-word>逻辑，</span>
                <span data-ink-word>也要有直觉。</span>
                <br />
                <span data-ink-word>功能，</span>
                <span data-ink-word>也可以有性格。</span>
                <br />
                <span data-ink-word>把好奇心，</span>
                <span className="manifesto-red" data-ink-word>
                  做成体验。
                </span>
              </h2>
              <div className="manifesto-bottom">
                <p>{profile.intro}</p>
                <span>
                  less expected.
                  <br />
                  more you.
                </span>
              </div>
            </div>
          </div>
        </section>
        <section
          id="selected-work"
          className="editorial-work"
          data-work
          aria-labelledby="editorial-work-title"
        >
          <div className="editorial-work-heading">
            <div>
              <p className="editorial-section-label">
                02 / SELECTED EXPERIMENTS
              </p>
              <h2 id="editorial-work-title">
                <MotionReveal as="span">
                  Made <em>real.</em>
                </MotionReveal>
              </h2>
            </div>
            <Link className="editorial-line-link" href="/work" data-magnetic>
              所有作品 <sup>{String(allProjects.length).padStart(2, "0")}</sup>
              <BrandIcon name="arrow" size={22} />
            </Link>
          </div>
          <div className="editorial-project-stack">
            {projects.map((project, index) => (
              <article
                className="editorial-project"
                key={project.id}
                data-project-card
                style={
                  {
                    "--card-index": index,
                    "--card-angle": index % 2 ? 1.2 : -1.2,
                  } as CSSProperties
                }
              >
                <div className="editorial-project-bar">
                  <span>
                    SELECTED WORK / {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{project.year}</span>
                </div>
                <Link
                  href={"/work/" + project.slug}
                  className="editorial-project-link"
                >
                  <div className="editorial-project-image">
                    {project.coverPath ? (
                      <EntryCover
                        entry={project}
                        sizes="(max-width:700px) 85vw, 58vw"
                      />
                    ) : (
                      <div className="editorial-project-placeholder">
                        <BrandIcon name="mark" size={120} />
                      </div>
                    )}
                    <span className="editorial-project-caption">
                      {project.category}
                    </span>
                  </div>
                  <div className="editorial-project-copy">
                    <span className="editorial-project-number">
                      ({String(index + 1).padStart(2, "0")})
                    </span>
                    <h3>{project.title}</h3>
                    <p>{project.summary}</p>
                    <span className="editorial-project-open">
                      打开这个作品 <BrandIcon name="arrow" size={27} />
                    </span>
                  </div>
                </Link>
              </article>
            ))}
            {!projects.length && (
              <p className="editorial-empty">一些新想法，正在发生。</p>
            )}
          </div>
          <p className="editorial-work-end">
            IDEAS ARE NICE. MAKING THEM IS BETTER.
          </p>
        </section>
        <section
          className="editorial-notes"
          data-notes
          aria-labelledby="editorial-notes-title"
        >
          <div className="editorial-section-label">
            <span>03 / NOTES & SIDE THOUGHTS</span>
            <Link href="/writing" className="editorial-line-link">
              所有文字 <BrandIcon name="arrow" size={20} />
            </Link>
          </div>
          <h2 id="editorial-notes-title" className="editorial-notes-title">
            <span data-notes-word>
              In <em>between.</em>
            </span>
            <BrandIcon name="mark" size={86} />
          </h2>
          <div className="editorial-note-list">
            {posts.map((post, index) => (
              <Link
                key={post.id}
                className="editorial-note"
                href={"/writing/" + post.slug}
              >
                <span className="editorial-note-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="editorial-note-copy">
                  <span className="editorial-note-category">
                    {post.category} / {post.year}
                  </span>
                  <h3>{post.title}</h3>
                </div>
                <span className="editorial-note-time">
                  {readingTime(post.body)} MIN READ
                </span>
                {post.coverPath && (
                  <EntryCover
                    entry={post}
                    className="editorial-note-preview"
                    sizes="200px"
                  />
                )}
                <BrandIcon
                  name="arrow"
                  size={29}
                  className="editorial-note-arrow"
                />
              </Link>
            ))}
            {!posts.length && (
              <p className="editorial-empty">下一段文字，还在脑海里。</p>
            )}
          </div>
        </section>
        <section
          className="editorial-person"
          data-person
          aria-labelledby="editorial-person-title"
        >
          <div className="editorial-person-art" aria-hidden="true">
            <span className="editorial-person-micro">
              NOT A STUDIO.
              <br />
              JUST AN OPEN MIND.
            </span>
            <BrandIcon name="mark" size={330} />
            <span className="editorial-person-hand">a work in progress.</span>
          </div>
          <div className="editorial-person-copy">
            <p className="editorial-section-label">04 / THE HUMAN PART</p>
            <h2 id="editorial-person-title">
              <MotionReveal as="span">一个人，</MotionReveal>
              <MotionReveal as="span" delay={100}>
                许多种可能。
              </MotionReveal>
            </h2>
            <p>
              你好，我是 {profile.name}。<br />
              在代码和设计之间，寻找自己的表达。
            </p>
            <Link href="/about" className="editorial-line-link" data-magnetic>
              更多关于我 <BrandIcon name="arrow" size={23} />
            </Link>
          </div>
        </section>
      </EditorialStage>
    </main>
  );
}
