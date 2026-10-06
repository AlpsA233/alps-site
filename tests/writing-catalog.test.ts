import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  db,
  closeDb,
  getWritingCatalog,
  getProjectCatalog,
  getAnotherPublishedPost,
} from "../src/lib/db";
import type { InStatement } from "@libsql/client";
import { seedEntries, type EntryInput } from "../src/lib/content";
import { normalizeProjectFilters } from "../src/lib/project-catalog";
import {
  WRITING_PAGE_SIZE,
  buildWritingCatalogHref,
  normalizeWritingFilters,
} from "../src/lib/writing-catalog";
test("writing parameters normalize repeated values, length limits and invalid paging", () => {
  assert.deepEqual(normalizeWritingFilters({}), {
    q: "",
    category: "",
    year: "",
    sort: "newest",
    page: 1,
  });
  assert.deepEqual(
    normalizeWritingFilters({
      q: ["  阅读  ", "discarded"],
      category: ["  随笔  ", "设计"],
      year: "2026",
      sort: "oldest",
      page: "02",
    }),
    { q: "阅读", category: "随笔", year: "2026", sort: "oldest", page: 2 },
  );
  const capped = normalizeWritingFilters({
    q: "x".repeat(120),
    category: "中".repeat(50),
    year: "2026-01",
    sort: "desc; DROP TABLE entries",
  });
  assert.equal(capped.q.length, 100);
  assert.equal(capped.category.length, 40);
  assert.equal(capped.year, "");
  assert.equal(capped.sort, "newest");
  for (const page of [
    "0",
    "-2",
    "1.1",
    "1e2",
    "3junk",
    "NaN",
    "Infinity",
    "9007199254740992",
  ])
    assert.equal(normalizeWritingFilters({ page }).page, 1);
  assert.equal(normalizeWritingFilters({ page: " 4 " }).page, 4);
  assert.equal(normalizeWritingFilters({ year: " 2025 " }).year, "2025");
});
test("writing URLs omit defaults, encode search values and retain filters while paging", () => {
  assert.equal(WRITING_PAGE_SIZE, 10);
  const defaults = normalizeWritingFilters({});
  assert.equal(buildWritingCatalogHref(defaults), "/writing");
  const filters = normalizeWritingFilters({
    q: "风景 & 100% / ? #",
    category: "随笔 & 设计",
    year: "2025",
    sort: "oldest",
    page: "4",
  });
  const url = new URL(
    buildWritingCatalogHref(filters, { page: 2 }),
    "https://example.test",
  );
  assert.equal(url.pathname, "/writing");
  assert.equal(url.hash, "");
  assert.equal(url.searchParams.get("q"), filters.q);
  assert.equal(url.searchParams.get("category"), filters.category);
  assert.equal(url.searchParams.get("year"), "2025");
  assert.equal(url.searchParams.get("sort"), "oldest");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(filters.page, 4);
  assert.equal(
    buildWritingCatalogHref(filters, {
      q: "",
      category: "",
      year: "",
      sort: "newest",
      page: 1,
    }),
    "/writing",
  );
});
test("writing SQL returns ten-row pages, stable order and exact filters without drafts or projects", async () => {
  const directory = mkdtempSync(
    resolve(tmpdir(), "alps-writing-catalog-test-"),
  );
  const previous = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = resolve(directory, "writing.sqlite");
  try {
    const database = await db();
    await database.execute("DELETE FROM entries");
    const statements: InStatement[] = [];
    const insertSQL =
      "INSERT INTO entries (id,kind,slug,status,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)";
    const fixture = (
      id: string,
      values: Partial<EntryInput>,
      timestamp = "2026-02-01T00:00:00.000Z",
    ) => {
      const input = { ...seedEntries[3], slug: id, ...values };
      statements.push({
        sql: insertSQL,
        args: [
          id,
          input.kind,
          input.slug,
          input.status,
          JSON.stringify(input),
          timestamp,
          timestamp,
        ],
      });
    };
    for (let index = 0; index < 26; index++)
      fixture(
        `post-${String(index).padStart(2, "0")}`,
        {
          title: `文章 ${index}`,
          category: index % 2 === 0 ? "随笔" : "设计",
          year: index < 18 ? "2026" : "2025",
          summary: "常规摘要",
          tags: "笔记",
        },
        index >= 13 && index < 18
          ? "2026-03-01T00:00:00.000Z"
          : "2026-02-01T00:00:00.000Z",
      );
    fixture("special-percent", {
      title: "100% 完成",
      category: "山野",
      year: "2024",
      summary: "森林",
      tags: "摄影",
    });
    fixture("special-under", {
      title: "note_name",
      category: "山野",
      year: "2024",
      summary: "笔记",
      tags: "观察",
    });
    fixture("special-slash", {
      title: "路径\\叙事",
      category: "工具",
      year: "2024",
      summary: "路径",
      tags: "脚本",
    });
    fixture("special-quote", {
      title: "O'Reilly",
      category: "工具",
      year: "2024",
      summary: "书籍",
      tags: "阅读",
    });
    fixture("special-safe", {
      title: "needle-title",
      category: "随笔",
      year: "2024",
      summary: "可搜索的摘要",
      tags: "lookup-tag",
      body: "仅在正文的暗号",
    });
    fixture("draft-post", {
      title: "100% needle-title",
      status: "draft",
      category: "隐藏分类",
      year: "2040",
    });
    fixture("published-project", {
      kind: "project",
      title: "100% needle-title",
      category: "作品分类",
      year: "2030",
    });
    await database.batch(statements, "write");
    const query = async (
      params: Record<string, string | string[] | undefined> = {},
    ) => await getWritingCatalog(normalizeWritingFilters(params));
    const first = await query();
    assert.equal(first.total, 31);
    assert.equal(first.totalPublished, 31);
    assert.equal(first.pageCount, 4);
    assert.equal(first.page, 1);
    assert.equal(first.entries.length, 10);
    assert.deepEqual(
      first.entries.map((entry) => entry.id),
      [13, 14, 15, 16, 17, 0, 1, 2, 3, 4].map(
        (index) => `post-${String(index).padStart(2, "0")}`,
      ),
    );
    const pages = [
      first,
      ...(await Promise.all(
        [2, 3, 4].map(async (page) => await query({ page: String(page) })),
      )),
    ];
    assert.deepEqual(
      pages.map((result) => result.entries.length),
      [10, 10, 10, 1],
    );
    const newest = pages.flatMap((result) => result.entries);
    assert.equal(new Set(newest.map((entry) => entry.id)).size, 31);
    assert.ok(
      newest.every(
        (entry) => entry.kind === "post" && entry.status === "published",
      ),
    );
    assert.deepEqual(
      newest.slice(18, 26).map((entry) => entry.id),
      [18, 19, 20, 21, 22, 23, 24, 25].map((index) => `post-${index}`),
    );
    assert.deepEqual(
      newest.slice(26).map((entry) => entry.id),
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
        [1, 2, 3, 4].map(
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
      [13, 14, 15, 16, 17].map((index) => `post-${index}`),
    );
    assert.equal((await query({ page: "999999" })).page, 4);
    assert.equal((await query({ page: "999999" })).entries.length, 1);
    assert.equal(
      (await getWritingCatalog({ ...normalizeWritingFilters({}), page: -9 }))
        .page,
      1,
    );
    assert.equal(
      (
        await getWritingCatalog({
          ...normalizeWritingFilters({}),
          page: Infinity,
        })
      ).page,
      1,
    );
    const filtered = await query({
      q: "文章",
      category: "随笔",
      year: "2025",
      page: "2",
    });
    assert.equal(filtered.total, 4);
    assert.equal(filtered.pageCount, 1);
    assert.equal(filtered.page, 1);
    assert.deepEqual(
      filtered.entries.map((entry) => entry.id),
      ["post-18", "post-20", "post-22", "post-24"],
    );
    assert.equal(filtered.totalPublished, 31);
    assert.deepEqual(filtered.categories, [
      { name: "随笔", count: 14 },
      { name: "设计", count: 13 },
      { name: "山野", count: 2 },
      { name: "工具", count: 2 },
    ]);
    assert.deepEqual(filtered.years, [
      { year: "2026", count: 18 },
      { year: "2025", count: 8 },
      { year: "2024", count: 5 },
    ]);
    assert.equal((await query({ category: "随" })).total, 0);
    assert.equal((await query({ q: "设计" })).total, 13);
    for (const [q, id] of [
      ["%", "special-percent"],
      ["_", "special-under"],
      ["\\", "special-slash"],
      ["O'Reilly", "special-quote"],
      ["needle-title", "special-safe"],
      ["可搜索的摘要", "special-safe"],
      ["lookup-tag", "special-safe"],
    ])
      assert.deepEqual(
        (await query({ q })).entries.map((entry) => entry.id),
        [id],
        q,
      );
    assert.equal((await query({ q: "仅在正文的暗号" })).total, 0);
    const missing = await query({ q: "' OR 1=1 --", page: "99" });
    assert.equal(missing.total, 0);
    assert.equal(missing.pageCount, 0);
    assert.equal(missing.page, 1);
    assert.deepEqual(missing.entries, []);
    assert.deepEqual(missing.categories, first.categories);
    assert.deepEqual(missing.years, first.years);
    const projects = await getProjectCatalog(normalizeProjectFilters({}));
    assert.equal(projects.total, 1);
    assert.equal(projects.entries[0].id, "published-project");
    assert.deepEqual(projects.categories, [{ name: "作品分类", count: 1 }]);
    await database.execute("DELETE FROM entries");
    const empty = await query({ page: "3" });
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
test("continue reading selects one other published post in stable order and returns null when none remains", async () => {
  const directory = mkdtempSync(
    resolve(tmpdir(), "alps-continue-reading-test-"),
  );
  const previous = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = resolve(directory, "another-post.sqlite");
  try {
    const database = await db();
    await database.execute("DELETE FROM entries");
    const statements: InStatement[] = [];
    const insertSQL =
      "INSERT INTO entries (id,kind,slug,status,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)";
    const fixture = (
      id: string,
      values: Partial<EntryInput>,
      timestamp = "2026-03-01T00:00:00.000Z",
    ) => {
      const input = { ...seedEntries[3], slug: id, year: "2026", ...values };
      statements.push({
        sql: insertSQL,
        args: [
          id,
          input.kind,
          input.slug,
          input.status,
          JSON.stringify(input),
          timestamp,
          timestamp,
        ],
      });
    };
    fixture("current", {}, "2026-06-01T00:00:00.000Z");
    fixture("stable-b", {});
    fixture("stable-a", {});
    fixture(
      "old-year-later-date",
      { year: "2025" },
      "2027-01-01T00:00:00.000Z",
    );
    fixture("draft-newest", { status: "draft", year: "2040" });
    fixture("project-newest", { kind: "project", year: "2030" });
    await database.batch(statements, "write");
    assert.equal((await getAnotherPublishedPost("current"))?.id, "stable-a");
    assert.equal((await getAnotherPublishedPost("stable-a"))?.id, "current");
    await database.execute({
      sql: "DELETE FROM entries WHERE id = ?",
      args: ["current"],
    });
    assert.equal((await getAnotherPublishedPost("stable-b"))?.id, "stable-a");
    await database.execute({
      sql: "DELETE FROM entries WHERE id = ?",
      args: ["stable-a"],
    });
    assert.equal(
      (await getAnotherPublishedPost("stable-b"))?.id,
      "old-year-later-date",
    );
    await database.execute({
      sql: "DELETE FROM entries WHERE id = ?",
      args: ["old-year-later-date"],
    });
    assert.equal(await getAnotherPublishedPost("stable-b"), null);
    await database.execute({
      sql: "DELETE FROM entries WHERE id = ?",
      args: ["stable-b"],
    });
    assert.equal(await getAnotherPublishedPost("missing-id"), null);
  } finally {
    await closeDb();
    if (previous === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
