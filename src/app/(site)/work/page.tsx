import type { Metadata } from "next";
import Form from "next/form";
import { Fragment } from "react";
import { getProjectCatalog } from "@/lib/db";
import {
  buildProjectCatalogHref,
  normalizeProjectFilters,
  PAGE_SIZE,
} from "@/lib/project-catalog";
import Link from "@/components/motion-link";
import { BrandIcon } from "@/components/brand";
import { EntryCover } from "@/components/entry-cover";
import { ArchiveMotion } from "@/components/archive-motion";
import { PrintInk, PrintTitle } from "@/components/print-title";
import "./work.css";
export const metadata: Metadata = { title: "作品" };
export default async function Work({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = normalizeProjectFilters(await searchParams);
  const catalog = await getProjectCatalog(filters);
  const activeFilters = { ...filters, page: catalog.page };
  const hasFilters = !!(
    filters.q ||
    filters.category ||
    filters.year ||
    filters.sort !== "newest"
  );
  const start = (catalog.page - 1) * PAGE_SIZE;
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
  const installationEntries = catalog.entries
    .filter((entry) => entry.coverPath)
    .slice(0, 3);
  const pageHref = (page: number) =>
    `${buildProjectCatalogHref(activeFilters, { page })}#project-catalog`;
  return (
    <main id="main" className="work-archive work-exhibition">
      <ArchiveMotion>
        <header className="work-archive__heading" data-archive-hero>
          <div className="work-exhibition__masthead">
            <p className="work-archive__eyebrow">
              <PrintInk>ALPS / INDEPENDENT PRACTICE</PrintInk>
            </p>
            <PrintInk>OBJECTS, IDEAS & EXPERIMENTS</PrintInk>
          </div>
          <h1 aria-label="作品 / Selected work">
            <span className="work-exhibition__title">
              <PrintTitle>WORK</PrintTitle>
              <span className="work-exhibition__period">.</span>
            </span>
          </h1>
          <div className="work-exhibition__hero-bottom">
            <div className="work-exhibition__statement">
              <p className="work-exhibition__edition">
                <PrintInk className="print-ink--accent">
                  一场持续更新的个人展览
                </PrintInk>
              </p>
              <h2>
                <PrintInk>Ideas,</PrintInk>
                <br />
                <em>
                  <PrintInk>made tangible.</PrintInk>
                </em>
              </h2>
              <p className="work-archive__intro">
                <PrintInk>一些做出来的想法。</PrintInk>
                <br />
                <PrintInk>有可以使用的作品，也有正在长出形状的实验。</PrintInk>
              </p>
              <a href="#project-catalog" className="work-exhibition__enter">
                <PrintInk className="work-exhibition__enter-label">
                  <span>进入作品索引</span>
                  <BrandIcon name="arrow" size={21} />
                </PrintInk>
              </a>
            </div>
            <div className="work-exhibition__installation" data-archive-object>
              <div
                className="work-exhibition__installation-art"
                aria-hidden="true"
              >
                <div className="work-exhibition__installation-top">
                  <span>EXHIBITION / ALPS</span>
                  <BrandIcon name="mark" size={24} />
                </div>
                <div className="work-exhibition__collage">
                  {installationEntries.length ? (
                    installationEntries.map((entry, index) => (
                      <div
                        className={`work-exhibition__collage-card work-exhibition__collage-card--${index + 1}`}
                        key={entry.id}
                      >
                        <EntryCover
                          entry={entry}
                          className="work-exhibition__collage-image"
                          sizes="(max-width: 700px) 60vw, 30vw"
                          preload={index === 0}
                        />
                        <span>
                          {String(
                            start + catalog.entries.indexOf(entry) + 1,
                          ).padStart(2, "0")}{" "}
                          / {entry.title}
                        </span>
                      </div>
                    ))
                  ) : (
                    <BrandIcon
                      name="mark"
                      size={180}
                      className="work-exhibition__collage-mark"
                    />
                  )}
                </div>
                <div className="work-exhibition__installation-bottom">
                  <span>
                    {String(catalog.totalPublished).padStart(2, "0")} OBJECTS
                    <br />
                    AND COUNTING
                  </span>
                  <span>↗</span>
                </div>
              </div>
              <button
                type="button"
                disabled
                data-archive-control
                className="work-exhibition__installation-control"
                aria-label="转动作品拼贴。点击旋转，鼠标拖动，左右方向键调整，Home 复位。"
              >
                <span>
                  <span className="work-exhibition__control-live">
                    TURN ME / 转一转
                  </span>
                  <span className="work-exhibition__control-static">
                    EXHIBITION / ALPS
                  </span>
                </span>
                <BrandIcon name="arrow" size={18} />
              </button>
              <p className="work-exhibition__installation-note">
                点击旋转 / 鼠标拖动
              </p>
            </div>
          </div>
          <div className="work-exhibition__hero-foot">
            <PrintInk>SELECTED WORKS, OPEN ENDED.</PrintInk>
            <PrintInk>VIEW INDEX ↓</PrintInk>
          </div>
        </header>
        <div
          className="work-exhibition__ticker"
          data-archive-loop
          aria-hidden="true"
        >
          <div className="work-exhibition__ticker-track">
            {[0, 1].map((copy) => (
              <div className="work-exhibition__ticker-copy" key={copy}>
                <span>SELECTED WORKS</span>
                <BrandIcon name="mark" size={32} />
                <em>from ideas to objects</em>
                <BrandIcon name="mark" size={32} />
                <span>ALWAYS IN PROGRESS</span>
                <BrandIcon name="mark" size={32} />
              </div>
            ))}
          </div>
        </div>
        <section
          id="project-catalog"
          className="work-catalog"
          aria-labelledby="work-catalog-title"
        >
          <div className="work-exhibition__index-heading">
            <h2 id="work-catalog-title" className="work-catalog__title">
              The index.<span>作品索引</span>
            </h2>
            <span className="work-exhibition__index-count">
              {String(catalog.totalPublished).padStart(2, "0")}
              <small>PUBLIC OBJECTS</small>
            </span>
          </div>
          <Form
            action="/work"
            scroll={false}
            key={buildProjectCatalogHref(filters, { page: 1 })}
            className="work-catalog__filters"
            aria-label="查找作品"
          >
            <div className="work-catalog__field work-catalog__search">
              <label htmlFor="work-query">搜索作品</label>
              <div className="work-catalog__search-input">
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
                  id="work-query"
                  name="q"
                  type="search"
                  maxLength={100}
                  defaultValue={filters.q}
                  placeholder="名称、关键词或想法"
                />
              </div>
            </div>
            <div className="work-catalog__field">
              <label htmlFor="work-category">分类</label>
              <select
                id="work-category"
                name="category"
                defaultValue={filters.category}
              >
                <option value="">全部分类</option>
                {filters.category &&
                  !catalog.categories.some(
                    (item) => item.name === filters.category,
                  ) && (
                    <option value={filters.category}>{filters.category}</option>
                  )}
                {catalog.categories.map(({ name, count }) => (
                  <option key={name} value={name}>
                    {name}（{count}）
                  </option>
                ))}
              </select>
            </div>
            <div className="work-catalog__field">
              <label htmlFor="work-year">年份</label>
              <select id="work-year" name="year" defaultValue={filters.year}>
                <option value="">全部年份</option>
                {filters.year &&
                  !catalog.years.some((item) => item.year === filters.year) && (
                    <option value={filters.year}>{filters.year}</option>
                  )}
                {catalog.years.map(({ year, count }) => (
                  <option key={year} value={year}>
                    {year}（{count}）
                  </option>
                ))}
              </select>
            </div>
            <div className="work-catalog__field">
              <label htmlFor="work-sort">排列顺序</label>
              <select id="work-sort" name="sort" defaultValue={filters.sort}>
                <option value="newest">由新到旧</option>
                <option value="oldest">由旧到新</option>
              </select>
            </div>
            <button className="work-catalog__submit" type="submit">
              查找 <BrandIcon name="arrow" size={17} />
            </button>
          </Form>
          <div className="work-catalog__status">
            <p role="status" aria-live="polite" aria-atomic="true">
              {catalog.total ? (
                <>
                  <span>{catalog.total} 件作品</span>
                  <span className="work-catalog__range">
                    {" "}
                    / 显示 {start + 1}–
                    {Math.min(start + PAGE_SIZE, catalog.total)}
                  </span>
                </>
              ) : hasFilters ? (
                "未找到匹配作品"
              ) : (
                "暂无作品"
              )}
            </p>
            {hasFilters && (
              <Link
                href="/work#project-catalog"
                disableTransition
                className="work-catalog__clear"
              >
                清除筛选 <BrandIcon name="close" size={13} />
              </Link>
            )}
          </div>
          {catalog.entries.length ? (
            <div className="work-catalog__grid">
              {catalog.entries.map((entry, index) => (
                <article
                  key={entry.id}
                  className="work-catalog__item"
                  data-archive-card
                >
                  <Link
                    href={`/work/${entry.slug}`}
                    className="work-catalog__card"
                    aria-labelledby={`project-title-${entry.id}`}
                  >
                    <div
                      className={`work-catalog__frame theme-${entry.theme}`}
                      data-archive-tilt
                    >
                      <div className="work-catalog__viewport">
                        {entry.coverPath ? (
                          <EntryCover
                            entry={entry}
                            className="work-catalog__cover"
                            sizes="(max-width: 700px) 90vw, (max-width: 1480px) 46vw, 660px"
                            preload={index < 2}
                          />
                        ) : (
                          <div
                            className="work-catalog__placeholder"
                            aria-hidden="true"
                          >
                            <BrandIcon name="ridge" width={105} height={52} />
                            <span>{entry.title}</span>
                          </div>
                        )}
                      </div>
                      <span
                        className="work-exhibition__cover-number"
                        aria-hidden="true"
                      >
                        {String(start + index + 1).padStart(2, "0")}
                      </span>
                      <div
                        className="work-exhibition__cover-label"
                        aria-hidden="true"
                      >
                        <span>
                          EXHIBIT / {String(start + index + 1).padStart(2, "0")}
                        </span>
                        <span>{entry.category}</span>
                      </div>
                    </div>
                    <div className="work-catalog__caption">
                      <span className="work-catalog__number">
                        {String(start + index + 1).padStart(2, "0")}
                      </span>
                      <div className="work-catalog__copy">
                        <h3 id={`project-title-${entry.id}`}>{entry.title}</h3>
                        <p className="work-catalog__category">
                          {entry.category}
                        </p>
                      </div>
                      <span className="work-catalog__year">{entry.year}</span>
                      <BrandIcon
                        name="arrow"
                        size={20}
                        className="work-catalog__arrow"
                      />
                    </div>
                    <p className="work-catalog__summary">{entry.summary}</p>
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="work-catalog__empty">
              <BrandIcon name="ridge" width={82} height={41} />
              <h3>
                {hasFilters ? "还没找到这个作品。" : "新的作品正在酝酿中。"}
              </h3>
              <p>
                {hasFilters
                  ? "换一个关键词，或放宽筛选再看看。"
                  : "把想法做成作品，需要一点时间。"}
              </p>
              {hasFilters && (
                <Link
                  href="/work#project-catalog"
                  disableTransition
                  className="work-catalog__empty-link"
                >
                  查看全部作品 <BrandIcon name="arrow" size={17} />
                </Link>
              )}
            </div>
          )}
          {catalog.pageCount > 1 && (
            <nav className="work-catalog__pagination" aria-label="作品分页">
              {catalog.page > 1 ? (
                <Link
                  href={pageHref(catalog.page - 1)}
                  disableTransition
                  className="work-catalog__page-step"
                >
                  <span aria-hidden="true">←</span> 上一页
                </Link>
              ) : (
                <span
                  className="work-catalog__page-step is-disabled"
                  aria-disabled="true"
                >
                  <span aria-hidden="true">←</span> 上一页
                </span>
              )}
              <div className="work-catalog__pages">
                {visiblePages.map((page, index) => (
                  <Fragment key={page}>
                    {index > 0 && page - visiblePages[index - 1] > 1 && (
                      <span
                        className="work-catalog__ellipsis"
                        aria-hidden="true"
                      >
                        …
                      </span>
                    )}
                    <Link
                      href={pageHref(page)}
                      disableTransition
                      aria-current={page === catalog.page ? "page" : undefined}
                      aria-label={`第 ${page} 页`}
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
                  className="work-catalog__page-step"
                >
                  下一页 <span aria-hidden="true">→</span>
                </Link>
              ) : (
                <span
                  className="work-catalog__page-step is-disabled"
                  aria-disabled="true"
                >
                  下一页 <span aria-hidden="true">→</span>
                </span>
              )}
            </nav>
          )}
        </section>
        <div className="work-exhibition__colophon">
          <BrandIcon name="mark" size={42} />
          <p className="work-archive__sign">More ideas on the way.</p>
          <span>
            END OF THIS SELECTION
            <br />
            KEEP EXPLORING.
          </span>
        </div>
      </ArchiveMotion>
    </main>
  );
}
