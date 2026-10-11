import type { Metadata } from "next";
import Link from "@/components/motion-link";
import { notFound } from "next/navigation";
import { getPublishedEntry } from "@/lib/db";
import { Markdown } from "@/components/markdown";
import { BrandIcon } from "@/components/brand";
import { EntryCover } from "@/components/entry-cover";
import { MotionReveal } from "@/components/motion-reveal";
import { PrintInk, PrintRule } from "@/components/print-title";
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
        <PrintInk className="print-link-copy">所有作品</PrintInk>
      </Link>
      <header className="project-detail-heading">
        <div>
          <p className="eyebrow">
            <PrintInk>A SELECTED PROJECT / {entry.year}</PrintInk>
          </p>
          <h1>
            <MotionReveal as="span">
              <PrintInk>{entry.title}</PrintInk>
            </MotionReveal>
          </h1>
          <p>
            <PrintInk>{entry.subtitle}</PrintInk>
          </p>
        </div>
        <div className="project-spec">
          <dl>
            <dt>
              <PrintInk>类型</PrintInk>
            </dt>
            <dd>
              <PrintInk>{entry.category}</PrintInk>
            </dd>
            <dt>
              <PrintInk>年份</PrintInk>
            </dt>
            <dd>
              <PrintInk>{entry.year}</PrintInk>
            </dd>
            <dt>
              <PrintInk>关键词</PrintInk>
            </dt>
            <dd>
              <PrintInk>{entry.tags.split(",").join(" / ")}</PrintInk>
            </dd>
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
        <PrintRule />
        <span className="hand-note-inline">
          <PrintInk className="print-ink--accent">
            On to the next idea.
          </PrintInk>
        </span>
        <Link className="text-link" href="/work">
          <PrintInk className="print-link-copy">回到作品集</PrintInk>
        </Link>
      </div>
    </main>
  );
}
