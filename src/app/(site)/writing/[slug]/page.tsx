import type { Metadata } from "next";
import Link from "@/components/motion-link";
import { notFound } from "next/navigation";
import {
  getPublishedEntry,
  getAnotherPublishedPost,
  getProfile,
} from "@/lib/db";
import { readingTime } from "@/lib/content";
import { Markdown } from "@/components/markdown";
import { BrandIcon } from "@/components/brand";
import { EntryCover } from "@/components/entry-cover";
import { MotionReveal } from "@/components/motion-reveal";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const entry = await getPublishedEntry("post", (await params).slug);
  return entry ? { title: entry.title, description: entry.summary } : {};
}
export default async function Post({ params }: Props) {
  const entry = await getPublishedEntry("post", (await params).slug);
  if (!entry) notFound();
  const [profile, next] = await Promise.all([
    getProfile(),
    getAnotherPublishedPost(entry.id),
  ]);
  return (
    <main id="main" className="article-page">
      <Link className="back-link" href="/writing">
        所有文字
      </Link>
      <header className="article-heading">
        <p className="eyebrow">{entry.category} / NOTES & THOUGHTS</p>
        <h1>
          <MotionReveal as="span">{entry.title}</MotionReveal>
        </h1>
        <p className="article-summary">{entry.summary}</p>
        <div className="article-meta">
          <span className="author-initial">
            {profile.name.slice(0, 1).toUpperCase()}
          </span>
          <span>{profile.name}</span>
          <span>·</span>
          <time dateTime={entry.createdAt}>
            {new Date(entry.createdAt).toLocaleDateString("zh-CN", {
              timeZone: "Asia/Shanghai",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
          <span>·</span>
          <span>{readingTime(entry.body)} 分钟阅读</span>
        </div>
      </header>
      {entry.coverPath && (
        <EntryCover
          entry={entry}
          className="article-cover"
          sizes="(max-width: 700px) 90vw, 900px"
          preload
          parallax
        />
      )}
      <div className="article-body">
        <Markdown body={entry.body} variant="journal" />
        <div className="article-end">
          <span>
            <BrandIcon name="mark" size={28} />
          </span>
          <p>谢谢你读到这里。</p>
          <span className="hand-note-inline">Until the next thought.</span>
        </div>
        <div className="article-tags">
          {entry.tags
            .split(",")
            .filter(Boolean)
            .map((tag) => (
              <span key={tag}>{tag.trim()}</span>
            ))}
        </div>
        {next && (
          <Link className="next-story" href={`/writing/${next.slug}`}>
            {next.coverPath && (
              <EntryCover
                entry={next}
                className="next-story-cover"
                sizes="(max-width:700px) 90vw, 700px"
              />
            )}
            <p className="eyebrow">ANOTHER THOUGHT / 继续阅读</p>
            <h2>{next.title}</h2>
            <p>{next.summary}</p>
          </Link>
        )}
      </div>
    </main>
  );
}
