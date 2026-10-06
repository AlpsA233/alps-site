import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { db, closeDb, getProjectCatalog } from "../src/lib/db";
import type { InStatement } from "@libsql/client";
import { seedEntries, type EntryInput } from "../src/lib/content";
import {
  PAGE_SIZE,
  buildProjectCatalogHref,
  normalizeProjectFilters,
} from "../src/lib/project-catalog";
test("catalog parameters normalize lengths, duplicate values and invalid page numbers", () => {
  assert.deepEqual(normalizeProjectFilters({}), {
    q: "",
    category: "",
    year: "",
    sort: "newest",
    page: 1,
  });
  assert.deepEqual(
    normalizeProjectFilters({
      q: ["  notebook  ", "ignored"],
      category: "  独立开发  ",
      year: " 2026 ",
      sort: "oldest",
      page: ["02", "8"],
    }),
    {
      q: "notebook",
      category: "独立开发",
      year: "2026",
      sort: "oldest",
      page: 2,
    },
  );
  const long = normalizeProjectFilters({
    q: "x".repeat(180),
    category: "中".repeat(90),
    year: "20261",
    sort: "untrusted SQL",
  });
  assert.equal(long.q.length, 100);
  assert.equal(long.category.length, 40);
  assert.equal(long.year, "");
  assert.equal(long.sort, "newest");
  for (const page of [
    "",
    "0",
    "-1",
    "1.5",
    "1e3",
    "2junk",
    "Infinity",
    "NaN",
    "9007199254740992",
  ]) {
    assert.equal(normalizeProjectFilters({ page }).page, 1, page);
  }
  assert.equal(normalizeProjectFilters({ page: " 3 " }).page, 3);
  for (const year of ["202", "20265", "20a6", "2026-01"])
    assert.equal(normalizeProjectFilters({ year }).year, "");
});
test("catalog URLs omit defaults and preserve encoded query values and explicit overrides", () => {
  const defaults = normalizeProjectFilters({});
  assert.equal(PAGE_SIZE, 12);
  assert.equal(buildProjectCatalogHref(defaults), "/work");
  const filters = normalizeProjectFilters({
    q: "  文字 & 100% / ? #  ",
    category: "设计 & 开发",
    year: "2026",
    sort: "oldest",
    page: "3",
  });
  const href = buildProjectCatalogHref(filters);
  const url = new URL(href, "https://example.test");
  assert.equal(url.pathname, "/work");
  assert.equal(url.hash, "");
  assert.equal(url.searchParams.get("q"), filters.q);
  assert.equal(url.searchParams.get("category"), filters.category);
  assert.equal(url.searchParams.get("year"), "2026");
  assert.equal(url.searchParams.get("sort"), "oldest");
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(
    buildProjectCatalogHref(filters, {
      q: "",
      category: "",
      year: "",
      sort: "newest",
      page: 1,
    }),
    "/work",
  );
  const secondPage = new URL(
    buildProjectCatalogHref(filters, { page: 2 }),
    "https://example.test",
  );
  assert.equal(secondPage.searchParams.get("q"), filters.q);
  assert.equal(secondPage.searchParams.get("category"), filters.category);
  assert.equal(secondPage.searchParams.get("page"), "2");
  assert.equal(filters.page, 3);
});
test("SQLite catalog paginates published projects with literal search and stable combined filters", async () => {
  const directory = mkdtempSync(
    resolve(tmpdir(), "alps-project-catalog-test-"),
  );
  const previous = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = resolve(directory, "catalog.sqlite");
  try {
    const database = await db();
    await database.execute("DELETE FROM entries");
    const statements: InStatement[] = [];
    const insertSQL =
      "INSERT INTO entries (id,kind,slug,status,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)";
    const fixture = (
      id: string,
      overrides: Partial<EntryInput>,
      timestamp = "2026-02-01T00:00:00.000Z",
    ) => {
      const data = { ...seedEntries[0], slug: id, ...overrides };
      statements.push({
        sql: insertSQL,
        args: [
          id,
          data.kind,
          data.slug,
          data.status,
          JSON.stringify(data),
          timestamp,
          timestamp,
        ],
      });
    };
    for (let index = 0; index < 26; index++) {
      fixture(
        `project-${String(index).padStart(2, "0")}`,
        {
          title: `作品 ${index}`,
          category: index % 2 === 0 ? "产品设计" : "独立开发",
          year: index < 18 ? "2026" : "2025",
          summary: "常规作品说明",
          tags: "Next.js",
        },
        index >= 13 && index < 18
          ? "2026-03-01T00:00:00.000Z"
          : "2026-02-01T00:00:00.000Z",
      );
    }
    fixture("special-percent", {
      title: "100% 完成",
      category: "视觉实验",
      year: "2024",
      summary: "自然光",
      tags: "摄影",
    });
    fixture("special-under", {
      title: "component_name",
      category: "视觉实验",
      year: "2024",
      summary: "组件",
      tags: "界面",
    });
    fixture("special-slash", {
      title: "路径\\设计",
      category: "工具",
      year: "2024",
      summary: "路径",
      tags: "工具",
    });
    fixture("special-quote", {
      title: "O'Reilly",
      category: "工具",
      year: "2024",
      summary: "出版",
      tags: "书籍",
    });
    fixture("special-safe", {
      title: "needle-title",
      category: "产品设计",
      year: "2024",
      summary: "可搜索的摘要",
      tags: "lookup-tag",
      body: "只在正文不会进入搜索",
    });
    fixture("draft-project", {
      title: "100% needle-title",
      status: "draft",
      category: "隐藏分类",
      year: "2040",
    });
    fixture("published-post", {
      kind: "post",
      title: "100% needle-title",
      category: "文章分类",
      year: "2030",
    });
    await database.batch(statements, "write");
    const query = async (
      values: Record<string, string | string[] | undefined> = {},
    ) => await getProjectCatalog(normalizeProjectFilters(values));
    const first = await query();
    assert.equal(first.total, 31);
    assert.equal(first.totalPublished, 31);
    assert.equal(first.pageCount, 3);
    assert.equal(first.page, 1);
    assert.equal(first.entries.length, 12);
    assert.deepEqual(
      first.entries.map((entry) => entry.id),
      [13, 14, 15, 16, 17, 0, 1, 2, 3, 4, 5, 6].map(
        (index) => `project-${String(index).padStart(2, "0")}`,
      ),
    );
    const all = [
      first,
      await query({ page: "2" }),
      await query({ page: "3" }),
    ].flatMap((result) => result.entries);
    assert.equal(all.length, 31);
    assert.equal(new Set(all.map((entry) => entry.id)).size, 31);
    assert.ok(
      all.every(
        (entry) => entry.kind === "project" && entry.status === "published",
      ),
    );
    assert.deepEqual(
      all.slice(18, 26).map((entry) => entry.id),
      [18, 19, 20, 21, 22, 23, 24, 25].map((index) => `project-${index}`),
    );
    assert.deepEqual(
      all.slice(26).map((entry) => entry.id),
      [
        "special-percent",
        "special-quote",
        "special-safe",
        "special-slash",
        "special-under",
      ],
    );
    const oldest = (
      await Promise.all(
        [1, 2, 3].map(
          async (page) => await query({ sort: "oldest", page: String(page) }),
        ),
      )
    ).flatMap((result) => result.entries);
    assert.equal(new Set(oldest.map((entry) => entry.id)).size, 31);
    assert.deepEqual(
      oldest.slice(0, 5).map((entry) => entry.id),
      [
        "special-percent",
        "special-quote",
        "special-safe",
        "special-slash",
        "special-under",
      ],
    );
    assert.deepEqual(
      oldest.slice(-5).map((entry) => entry.id),
      [13, 14, 15, 16, 17].map((index) => `project-${index}`),
    );
    assert.equal((await query({ page: "999999999" })).page, 3);
    assert.equal((await query({ page: "999999999" })).entries.length, 7);
    assert.equal(
      (await getProjectCatalog({ ...normalizeProjectFilters({}), page: -10 }))
        .page,
      1,
    );
    assert.equal(
      (
        await getProjectCatalog({
          ...normalizeProjectFilters({}),
          page: Infinity,
        })
      ).page,
      1,
    );
    const filtered = await query({
      q: "作品",
      category: "产品设计",
      year: "2025",
      page: "8",
    });
    assert.equal(filtered.total, 4);
    assert.equal(filtered.page, 1);
    assert.equal(filtered.pageCount, 1);
    assert.deepEqual(
      filtered.entries.map((entry) => entry.id),
      ["project-18", "project-20", "project-22", "project-24"],
    );
    assert.equal(filtered.totalPublished, 31);
    assert.deepEqual(filtered.categories, [
      { name: "产品设计", count: 14 },
      { name: "独立开发", count: 13 },
      { name: "工具", count: 2 },
      { name: "视觉实验", count: 2 },
    ]);
    assert.deepEqual(filtered.years, [
      { year: "2026", count: 18 },
      { year: "2025", count: 8 },
      { year: "2024", count: 5 },
    ]);
    assert.equal((await query({ category: "设计" })).total, 0);
    assert.equal((await query({ q: "独立开发" })).total, 13);
    for (const [q, expected] of [
      ["%", "special-percent"],
      ["_", "special-under"],
      ["\\", "special-slash"],
      ["O'Reilly", "special-quote"],
      ["可搜索的摘要", "special-safe"],
      ["lookup-tag", "special-safe"],
      ["needle-title", "special-safe"],
    ]) {
      assert.deepEqual(
        (await query({ q })).entries.map((entry) => entry.id),
        [expected],
        q,
      );
    }
    assert.equal((await query({ q: "只在正文" })).total, 0);
    const missing = await query({ q: "' OR 1=1 --", page: "99" });
    assert.equal(missing.total, 0);
    assert.equal(missing.pageCount, 0);
    assert.equal(missing.page, 1);
    assert.deepEqual(missing.entries, []);
    assert.equal(missing.totalPublished, 31);
    assert.deepEqual(missing.categories, first.categories);
    await database.execute("DELETE FROM entries");
    const empty = await query({ page: "2" });
    assert.equal(empty.totalPublished, 0);
    assert.equal(empty.page, 1);
    assert.equal(empty.pageCount, 0);
    assert.deepEqual(empty.categories, []);
    assert.deepEqual(empty.years, []);
  } finally {
    await closeDb();
    if (previous === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
