import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type RenderedMarkdown = {
  journal: string;
  plain: string;
  gfm: string;
  code: string;
  safeJournal: string;
  safePlain: string;
  linkedDeletion: string;
  scriptExecuted: boolean;
};

const inlineBody =
  "## 一点想法\n\n正文 **重要的事**、*轻轻标记* 与 ~~保留的修改~~，还有 ~普通波浪线~。\n\n> 旁注也值得读。\n\n---";
const gfmBody = [
  "| 主题 | 次数 |",
  "| :--- | ---: |",
  "| 阅读 | 2 |",
  "",
  "- [x] 已完成",
  "- [ ] 待完成",
  "",
  "一处补记[^note]，以及再次引用[^note]。",
  "",
  "[^note]: 这里是补记内容。",
].join("\n");
const codeBody = [
  "行内 `answer`。",
  "",
  "```ts",
  "const answer: number = 42;",
  "```",
  "",
  "```",
  "<script>notExecutable()</script>",
  "```",
].join("\n");
const unsafeBody = [
  "[正常外链](https://example.test/read)",
  "",
  "[坏链接](javascript:evil)",
  "",
  "[混合大小写](JaVaScRiPt:evil)",
  "",
  "[数据协议](data:text/html;base64,PHNjcmlwdD4=)",
  "",
  "[实体编码](javascript&#58;evil)",
  "",
  "<script>globalThis.__markdownTestXss = true</script>",
  "",
  '<img src="x" onerror="globalThis.__markdownTestXss = true">',
].join("\n");

function attributes(tag: string) {
  return Object.fromEntries(
    Array.from(tag.matchAll(/([\w-]+)="([^"]*)"/g), (match) => [
      match[1],
      match[2],
    ]),
  );
}

test("the application Markdown renderer preserves semantics, journal extensions and safe SSR fallbacks", async (t) => {
  const project = process.cwd();
  const work = resolve(project, "work");
  mkdirSync(work, { recursive: true });
  const directory = mkdtempSync(resolve(work, "markdown-ssr-test-"));
  const runner = resolve(directory, "render.mjs");
  const component = pathToFileURL(
    resolve(project, "src/components/markdown.tsx"),
  ).href;
  const source = `
    import { registerHooks } from "node:module";
    import { readFileSync } from "node:fs";
    import { createElement } from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    registerHooks({
      load(url, context, nextLoad) {
        if (url.endsWith(".css")) return { format: "module", source: "", shortCircuit: true };
        return nextLoad(url, context);
      }
    });
    const { Markdown } = await import(${JSON.stringify(component)});
    const input = JSON.parse(readFileSync(0, "utf8"));
    const render = (body, variant) => renderToStaticMarkup(createElement(Markdown, { body, ...(variant ? { variant } : {}) }));
    globalThis.__markdownTestXss = false;
    process.stdout.write(JSON.stringify({
      journal: render(input.inlineBody, "journal"),
      plain: render(input.inlineBody),
      gfm: render(input.gfmBody, "journal"),
      code: render(input.codeBody, "journal"),
      safeJournal: render(input.unsafeBody, "journal"),
      safePlain: render(input.unsafeBody),
      linkedDeletion: render("[~~链接中的修改~~](https://example.test/notes)", "journal"),
      scriptExecuted: globalThis.__markdownTestXss
    }));
  `;
  let rendered: RenderedMarkdown;
  try {
    writeFileSync(runner, source);
    // npm test uses react-server; this child deliberately renders with normal React.
    const output = execFileSync(process.execPath, ["--import", "tsx", runner], {
      cwd: project,
      env: { ...process.env, NODE_OPTIONS: "" },
      input: JSON.stringify({ inlineBody, gfmBody, codeBody, unsafeBody }),
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    rendered = JSON.parse(output) as RenderedMarkdown;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  await t.test(
    "journal formatting keeps strong/em/del semantics and readable deletion text before hydration",
    () => {
      assert.match(rendered.journal, /^<div class="prose prose-journal">/);
      assert.match(rendered.journal, /<strong>重要的事<\/strong>/);
      assert.match(rendered.journal, /<em>轻轻标记<\/em>/);
      assert.match(
        rendered.journal,
        /<del\b[^>]*class="markdown-deletion"[^>]*>[\s\S]*?保留的修改[\s\S]*?<\/del>/,
      );
      assert.match(rendered.journal, /~普通波浪线~/);
      const deletion = rendered.journal.match(
        /<del\b[^>]*>[\s\S]*?<\/del>/,
      )?.[0];
      assert.ok(deletion);
      assert.doesNotMatch(
        deletion,
        /data-ready=|<button\b|\bhidden(?:=|\s|>)|aria-hidden="true"|style=/,
      );
      assert.match(deletion, /class="markdown-deletion__text"/);
      assert.match(rendered.journal, /class="markdown-section-title">一点想法/);
      assert.match(rendered.journal, /class="markdown-quote-copy"/);
      assert.match(
        rendered.journal,
        /class="markdown-divider" role="separator"/,
      );
      assert.match(
        rendered.linkedDeletion,
        /<a\b[^>]*href="https:\/\/example\.test\/notes"[^>]*><del\b/,
      );
      assert.doesNotMatch(rendered.linkedDeletion, /<button\b/);
    },
  );

  await t.test(
    "the default plain renderer retains the original unadorned headings, quote and deletion notation",
    () => {
      assert.match(rendered.plain, /^<div class="prose">/);
      assert.match(rendered.plain, /<h2>一点想法<\/h2>/);
      assert.match(rendered.plain, /<strong>重要的事<\/strong>/);
      assert.match(rendered.plain, /<em>轻轻标记<\/em>/);
      assert.match(rendered.plain, /~~保留的修改~~/);
      assert.match(
        rendered.plain,
        /<blockquote>\s*<p>旁注也值得读。<\/p>\s*<\/blockquote>/,
      );
      assert.match(rendered.plain, /<hr\s*\/>/);
      assert.doesNotMatch(
        rendered.plain,
        /markdown-deletion|markdown-section-|markdown-quote-|markdown-divider|data-ready|<del\b/,
      );
    },
  );

  await t.test(
    "journal GFM tables, tasks and footnotes expose accessible HTML and working return anchors",
    () => {
      assert.match(
        rendered.gfm,
        /class="markdown-table" tabindex="0" role="region" aria-label="表格，可横向滚动"/,
      );
      assert.match(rendered.gfm, /<table>/);
      assert.match(rendered.gfm, /<th style="text-align:left">主题<\/th>/);
      assert.match(rendered.gfm, /<th style="text-align:right">次数<\/th>/);
      assert.match(rendered.gfm, /class="contains-task-list"/);
      assert.equal(
        (rendered.gfm.match(/class="task-list-item"/g) || []).length,
        2,
      );
      const checkboxes =
        rendered.gfm.match(/<input\b[^>]*type="checkbox"[^>]*>/g) || [];
      assert.equal(checkboxes.length, 2);
      assert.ok(
        checkboxes.every((tag) => attributes(tag).disabled !== undefined),
      );
      assert.ok(attributes(checkboxes[0]).checked !== undefined);
      assert.equal(attributes(checkboxes[1]).checked, undefined);

      const references = (
        rendered.gfm.match(/<a\b[^>]*data-footnote-ref[^>]*>/g) || []
      ).map(attributes);
      const returns = (
        rendered.gfm.match(/<a\b[^>]*data-footnote-backref[^>]*>/g) || []
      ).map(attributes);
      const ids = new Set(
        Array.from(
          rendered.gfm.matchAll(/\bid="([^"]+)"/g),
          (match) => match[1],
        ),
      );
      assert.equal(references.length, 2);
      assert.equal(returns.length, 2);
      assert.equal(
        new Set(references.map((reference) => reference.id)).size,
        2,
      );
      assert.ok(
        references.every((reference) => reference.id.startsWith("journal-")),
      );
      for (const reference of references) {
        assert.ok(ids.has(reference.href.slice(1)));
        assert.ok(ids.has(reference["aria-describedby"]));
        assert.ok(returns.some((back) => back.href === `#${reference.id}`));
      }
      assert.ok(
        returns.every((back) => back["aria-label"].includes("返回文中引用")),
      );
      assert.match(rendered.gfm, /页边补记/);
      assert.match(rendered.gfm, /这里是补记内容。/);
    },
  );

  await t.test(
    "journal fenced code displays its actual language and escaped text with an unlabelled fallback",
    () => {
      assert.equal(
        (rendered.code.match(/<figure class="markdown-code">/g) || []).length,
        2,
      );
      assert.match(
        rendered.code,
        /<figcaption><span>CODE \/ 一小段实现<\/span><span>ts<\/span><\/figcaption>/,
      );
      assert.match(
        rendered.code,
        /<figcaption><span>CODE \/ 一小段实现<\/span><span>TEXT<\/span><\/figcaption>/,
      );
      assert.match(
        rendered.code,
        /<code class="language-ts">const answer: number = 42;/,
      );
      assert.match(rendered.code, /行内 <code>answer<\/code>/);
      assert.match(
        rendered.code,
        /&lt;script&gt;notExecutable\(\)&lt;\/script&gt;/,
      );
      assert.doesNotMatch(rendered.code, /<script\b/);
    },
  );

  await t.test(
    "both variants block unsafe URLs and render raw HTML as inert text",
    () => {
      assert.equal(rendered.scriptExecuted, false);
      for (const html of [rendered.safeJournal, rendered.safePlain]) {
        const anchors = (html.match(/<a\b[^>]*>/g) || []).map(attributes);
        assert.equal(anchors.length, 5);
        assert.ok(
          anchors.every(
            (anchor) =>
              !/^(?:javascript|vbscript|data):/i.test(anchor.href || ""),
          ),
        );
        const external = anchors.find(
          (anchor) => anchor.href === "https://example.test/read",
        );
        assert.ok(external);
        assert.equal(external.target, "_blank");
        assert.equal(external.rel, "noopener noreferrer");
        assert.doesNotMatch(html, /<script\b|<img\b|<[^>]*\sonerror=/i);
        assert.match(html, /&lt;script&gt;/);
      }
    },
  );
});
