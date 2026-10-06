import type { Metadata } from "next";
import Link from "@/components/motion-link";
import { notFound } from "next/navigation";
import { getPublishedEntry } from "@/lib/db";
import { Markdown } from "@/components/markdown";
import { BrandIcon } from "@/components/brand";
import { EntryCover } from "@/components/entry-cover";
import { MotionReveal } from "@/components/motion-reveal";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const entry = await getPublishedEntry("project", (await params).slug);
  return entry ? { title: entry.title, description: entry.summary } : {};
}
export default async function Project({ params }: Props) {
  const entry = await getPublishedEntry("project", (await params).slug);
  if (!entry) notFound();
  return (
    <main id="main" className="project-page">
      <Link className="back-link" href="/work">
        所有作品
      </Link>
      <header className="project-detail-heading">
        <div>
          <p className="eyebrow">A SELECTED PROJECT / {entry.year}</p>
          <h1>
            <MotionReveal as="span">{entry.title}</MotionReveal>
          </h1>
          <p>{entry.subtitle}</p>
        </div>
        <div className="project-spec">
          <dl>
            <dt>类型</dt>
            <dd>{entry.category}</dd>
            <dt>年份</dt>
            <dd>{entry.year}</dd>
            <dt>关键词</dt>
            <dd>{entry.tags.split(",").join(" / ")}</dd>
          </dl>
          {entry.url && (
            <a
              href={entry.url}
              className="button button-dark"
              target="_blank"
              rel="noopener noreferrer"
            >
              访问项目
            </a>
          )}
        </div>
      </header>
      {entry.coverPath ? (
        <EntryCover
          entry={entry}
          className="project-detail-cover"
          sizes="(max-width:700px) 90vw, 1200px"
          preload
          parallax
        />
      ) : (
        <section
          className={`detail-art theme-${entry.theme}`}
          aria-label="项目封面"
        >
          <div className="project-art">
            <div className="art-top">
              <span>ALPS / SELECTED WORK</span>
              <span>{entry.year}</span>
            </div>
            <div className="art-center">
              <span
                className={entry.theme === "ink" ? "art-hand" : "art-title"}
              >
                {entry.title}
              </span>
              <span className="art-subtitle">{entry.subtitle}</span>
            </div>
            <div className="art-bottom">
              <span>{entry.category}</span>
              <BrandIcon name="ridge" width={50} height={25} />
            </div>
          </div>
        </section>
      )}
      <section className="project-detail-body">
        <aside>
          <p className="eyebrow">THE STORY BEHIND</p>
          <h2>关于这个作品</h2>
          <p>{entry.summary}</p>
        </aside>
        <Markdown body={entry.body} />
      </section>
      <div className="project-end">
        <span className="hand-note-inline">On to the next idea.</span>
        <Link className="text-link" href="/work">
          回到作品集
        </Link>
      </div>
    </main>
  );
}
