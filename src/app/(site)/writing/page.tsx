import type { Metadata } from "next";
import Form from "next/form";
import { Fragment, type CSSProperties } from "react";
import Link from "@/components/motion-link";
import { getWritingCatalog } from "@/lib/db";
import {
  buildWritingCatalogHref,
  normalizeWritingFilters,
  WRITING_PAGE_SIZE,
} from "@/lib/writing-catalog";
import { readingTime, shortDate } from "@/lib/content";
import { EntryCover } from "@/components/entry-cover";
import { BrandIcon } from "@/components/brand";
import { ArchiveMotion } from "@/components/archive-motion";
import { PrintTitle } from "@/components/print-title";
import "./writing.css";

export const metadata: Metadata = {
  title: "文字",
  description: "Alps 的编辑手记。关于开发、设计，以及普通的生活。",
};

export default async function Writing({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = normalizeWritingFilters(await searchParams);
  const catalog = await getWritingCatalog(filters);
  const activeFilters = { ...filters, page: catalog.page };
  const hasFilters = !!(
    filters.q ||
    filters.category ||
    filters.year ||
    filters.sort !== "newest"
  );
  const start = (catalog.page - 1) * WRITING_PAGE_SIZE;
  const visiblePages = [
    ...new Set([
      1,
      catalog.page - 1,
      catalog.page,
      catalog.page + 1,
      catalog.pageCount,
    ]),
  ]
    .filter((page) => page > 0 && page <= catalog.pageCount)
    .sort((a, b) => a - b);
  const pageHref = (page: number) =>
    `${buildWritingCatalogHref(activeFilters, { page })}#writing-catalog`;

  return (
    <main id="main" className="writing-journal journal-exhibition">
      <ArchiveMotion>
        <header className="journal-heading" data-archive-hero>
          <div className="journal-heading__topline">
            <span>ALPS / AN INDEPENDENT PUBLICATION</span>
            <span>文字，另一种实验。</span>
          </div>
          <div className="journal-heading__copy">
            <h1 aria-label="文字 / Side notes">
              <span>SIDE</span>
              <span>
                <PrintTitle>NOTES</PrintTitle>
                <span className="journal-heading__period">.</span>
              </span>
            </h1>
            <div className="journal-heading__intro">
              <BrandIcon name="mark" size={28} />
              <p>
                一个念头，接着另一个。
                <br />
                关于代码、设计，和还没想清楚的事。
              </p>
            </div>
            <a className="journal-heading__index-link" href="#writing-catalog">
              直接翻到目录 <BrandIcon name="arrow" size={19} />
            </a>
          </div>
          <div className="journal-edition-stage">
            <span
              className="journal-edition-stage__annotation"
              aria-hidden="true"
            >
              a thought, then another.
            </span>
            <details
              className="journal-edition"
              key={buildWritingCatalogHref(activeFilters)}
            >
              <summary className="journal-edition__cover" data-archive-tilt>
                <span className="journal-edition__top">
                  <span>ALPS / NOTES & THOUGHTS</span>
                  <span>VOL. {String(catalog.page).padStart(2, "0")}</span>
                </span>
                <span
                  className="journal-edition__cover-title"
                  aria-hidden="true"
                >
                  未完，
                  <br />
                  待续。
                </span>
                <BrandIcon
                  name="mark"
                  size={112}
                  className="journal-edition__mark"
                />
                <span className="journal-edition__bottom">
                  <span className="journal-edition__closed-label">
                    打开本页扉页
                  </span>
                  <span className="journal-edition__open-label">
                    合上本页扉页
                  </span>
                  <span className="journal-edition__hinge" aria-hidden="true">
                    +
                  </span>
                </span>
              </summary>
              <div className="journal-edition__pages">
                <div className="journal-edition__contents-label">
                  <span>INSIDE THIS ISSUE</span>
                  <span>本页选读</span>
                </div>
                {catalog.entries.length ? (
                  <nav aria-label="本页扉页文章">
                    <ol>
                      {catalog.entries.slice(0, 3).map((post, index) => (
                        <li key={post.id}>
                          <Link href={`/writing/${post.slug}`}>
                            <span
                              className="journal-edition__page-number"
                              aria-hidden="true"
                            >
                              {String(start + index + 1).padStart(2, "0")}
                            </span>
                            <span className="journal-edition__page-copy">
                              <span>
                                {post.category} / {readingTime(post.body)} MIN
                              </span>
                              <strong>{post.title}</strong>
                            </span>
                            <BrandIcon name="arrow" size={18} />
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </nav>
                ) : (
                  <p className="journal-edition__blank">
                    {hasFilters
                      ? "这一页暂时留白。换个关键词，再翻一翻。"
                      : "第一篇文字，还在脑海里。"}
                  </p>
                )}
                <a className="journal-edition__all" href="#writing-catalog">
                  {catalog.entries.length > 3
                    ? "继续翻阅本页目录"
                    : "进入文字目录"}
                  <BrandIcon name="arrow" size={18} />
                </a>
              </div>
            </details>
          </div>
          <div className="journal-heading__footer">
            <span>不是答案，是一个开始。</span>
            <span>
              {String(catalog.totalPublished).padStart(2, "0")} STORIES &
              COUNTING
            </span>
          </div>
        </header>

        <div className="journal-wordband" data-archive-loop aria-hidden="true">
          <div className="journal-wordband__track">
            {[0, 1].map((copy) => (
              <span key={copy}>
                WORDS IN PROGRESS <BrandIcon name="mark" size={28} />
                想法未完，文字继续。 <BrandIcon name="mark" size={28} />
              </span>
            ))}
          </div>
        </div>

        <section
          id="writing-catalog"
          className="journal-catalog"
          aria-labelledby="writing-catalog-title"
        >
          <div className="journal-catalog__heading">
            <h2 id="writing-catalog-title">
              <span>01 / INDEX</span> 文字目录
              <span className="journal-catalog__title-dot">.</span>
            </h2>
            <span className="journal-catalog__aside">
              ALL THE SIDE THOUGHTS
            </span>
          </div>
          <div key={buildWritingCatalogHref(filters, { page: 1 })}>
            <Form
              action="/writing"
              scroll={false}
              className="journal-filters"
              aria-label="查找文字"
            >
              <div className="journal-filters__field journal-filters__search">
                <label htmlFor="writing-query">搜索文字</label>
                <div className="journal-filters__input">
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <circle cx="10.5" cy="10.5" r="6.5" />
                    <path d="m16 16 5 5" />
                  </svg>
                  <input
                    id="writing-query"
                    type="search"
                    name="q"
                    maxLength={100}
                    defaultValue={filters.q}
                    placeholder="标题、关键词或一个念头"
                  />
                </div>
              </div>
              <div className="journal-filters__field">
                <label htmlFor="writing-category">分类</label>
                <select
                  id="writing-category"
                  name="category"
                  defaultValue={filters.category}
                >
                  <option value="">全部分类</option>
                  {filters.category &&
                    !catalog.categories.some(
                      (item) => item.name === filters.category,
                    ) && (
                      <option value={filters.category}>
                        {filters.category}
                      </option>
                    )}
                  {catalog.categories.map(({ name, count }) => (
                    <option key={name} value={name}>
                      {name}（{count}）
                    </option>
                  ))}
                </select>
              </div>
              <div className="journal-filters__field">
                <label htmlFor="writing-year">年份</label>
                <select
                  id="writing-year"
                  name="year"
                  defaultValue={filters.year}
                >
                  <option value="">全部年份</option>
                  {filters.year &&
                    !catalog.years.some(
                      (item) => item.year === filters.year,
                    ) && <option value={filters.year}>{filters.year}</option>}
                  {catalog.years.map(({ year, count }) => (
                    <option key={year} value={year}>
                      {year}（{count}）
                    </option>
                  ))}
                </select>
              </div>
              <div className="journal-filters__field">
                <label htmlFor="writing-sort">排列顺序</label>
                <select
                  id="writing-sort"
                  name="sort"
                  defaultValue={filters.sort}
                >
                  <option value="newest">由新到旧</option>
                  <option value="oldest">由旧到新</option>
                </select>
              </div>
              <button type="submit" className="journal-filters__submit">
                查找 <BrandIcon name="arrow" size={17} />
              </button>
            </Form>
          </div>
          <div className="journal-catalog__status">
            <p role="status" aria-live="polite" aria-atomic="true">
              {catalog.total ? (
                <>
                  <span>{catalog.total} 篇文字</span>
                  <span>
                    {" "}
                    / 显示 {start + 1}–
                    {Math.min(start + WRITING_PAGE_SIZE, catalog.total)}
                  </span>
                </>
              ) : hasFilters ? (
                "未找到匹配文字"
              ) : (
                "暂无文字"
              )}
            </p>
            {hasFilters && (
              <Link
                href="/writing#writing-catalog"
                disableTransition
                className="journal-catalog__clear"
              >
                清除筛选 <BrandIcon name="close" size={13} />
              </Link>
            )}
          </div>

          {catalog.entries.length ? (
            <div className="journal-entries">
              {catalog.entries.map((post, index) => (
                <article
                  className="journal-entry"
                  key={post.id}
                  data-archive-card
                  style={
                    {
                      "--entry-angle": `${index % 2 ? 4 : -4}deg`,
                      "--number-digits": Math.max(
                        2,
                        String(start + index + 1).length,
                      ),
                    } as CSSProperties
                  }
                >
                  <Link
                    href={`/writing/${post.slug}`}
                    className="journal-entry__link"
                    aria-labelledby={`story-title-${post.id}`}
                  >
                    <div className="journal-entry__margin" aria-hidden="true">
                      <span>{String(start + index + 1).padStart(2, "0")}</span>
                      <span>NOTE</span>
                    </div>
                    <div className="journal-entry__frame" data-archive-tilt>
                      {post.coverPath ? (
                        <EntryCover
                          entry={post}
                          className="journal-entry__cover"
                          sizes="(max-width: 700px) 105px, (max-width: 1000px) 175px, 235px"
                        />
                      ) : (
                        <div
                          className="journal-entry__blank"
                          aria-hidden="true"
                        >
                          <BrandIcon name="mark" size={50} />
                          <span>A few words.</span>
                        </div>
                      )}
                    </div>
                    <div className="journal-entry__copy">
                      <div className="journal-entry__meta">
                        <span>{post.category}</span>
                        <span>
                          {post.year}.
                          {shortDate(post.createdAt).replace("/", ".")}
                        </span>
                      </div>
                      <h3 id={`story-title-${post.id}`}>
                        <span>{post.title}</span>
                      </h3>
                      <p className="journal-entry__summary">{post.summary}</p>
                      <div className="journal-entry__foot">
                        <span>{readingTime(post.body)} 分钟阅读</span>
                        <span className="journal-entry__read">
                          <span>阅读这篇</span>
                          <BrandIcon name="arrow" size={19} />
                        </span>
                      </div>
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="journal-catalog__empty">
              <BrandIcon name="mark" size={58} />
              <h3>
                {hasFilters
                  ? "这个念头，还没写下来。"
                  : "第一篇文字，正在路上。"}
              </h3>
              <p>
                {hasFilters
                  ? "换个关键词，或放宽筛选再看看。"
                  : "给想法一点时间。"}
              </p>
              {hasFilters && (
                <Link href="/writing#writing-catalog" disableTransition>
                  翻阅全部文字 <BrandIcon name="arrow" size={17} />
                </Link>
              )}
            </div>
          )}

          {catalog.pageCount > 1 && (
            <nav className="journal-pagination" aria-label="文字分页">
              {catalog.page > 1 ? (
                <Link
                  href={pageHref(catalog.page - 1)}
                  disableTransition
                  className="journal-pagination__step"
                >
                  <span aria-hidden="true">←</span> 上一页
                </Link>
              ) : (
                <span
                  className="journal-pagination__step is-disabled"
                  aria-disabled="true"
                >
                  <span aria-hidden="true">←</span> 上一页
                </span>
              )}
              <div className="journal-pagination__pages">
                {visiblePages.map((page, index) => (
                  <Fragment key={page}>
                    {index > 0 && page - visiblePages[index - 1] > 1 && (
                      <span
                        className="journal-pagination__ellipsis"
                        aria-hidden="true"
                      >
                        …
                      </span>
                    )}
                    <Link
                      href={pageHref(page)}
                      disableTransition
                      aria-label={`第 ${page} 页`}
                      aria-current={page === catalog.page ? "page" : undefined}
                    >
                      {String(page).padStart(2, "0")}
                    </Link>
                  </Fragment>
                ))}
              </div>
              {catalog.page < catalog.pageCount ? (
                <Link
                  href={pageHref(catalog.page + 1)}
                  disableTransition
                  className="journal-pagination__step"
                >
                  下一页 <span aria-hidden="true">→</span>
                </Link>
              ) : (
                <span
                  className="journal-pagination__step is-disabled"
                  aria-disabled="true"
                >
                  下一页 <span aria-hidden="true">→</span>
                </span>
              )}
            </nav>
          )}
          <div className="journal-colophon">
            <span>ALPS / NOTES & THOUGHTS</span>
            <span className="journal-colophon__hand">To be continued...</span>
            <span>
              {String(catalog.page).padStart(2, "0")} /{" "}
              {String(Math.max(1, catalog.pageCount)).padStart(2, "0")}
            </span>
          </div>
        </section>
      </ArchiveMotion>
    </main>
  );
}
