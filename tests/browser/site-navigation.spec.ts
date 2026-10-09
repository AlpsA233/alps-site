import { expect, test, type Page } from "@playwright/test";

type NavigationSample = {
  elapsed: number;
  phase: string;
  path: string;
  home: boolean;
  work: boolean;
};

declare global {
  interface Window {
    navigationQATimeline: NavigationSample[];
    navigationQAStarted: number;
  }
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) =>
    setTimeout(resolve, Math.max(0, milliseconds)),
  );

const browserErrors = new WeakMap<
  Page,
  { page: string[]; console: string[] }
>();
test.beforeEach(({ page }) => {
  const errors = { page: [] as string[], console: [] as string[] };
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
});
test.afterEach(({ page }, testInfo) => {
  const errors = browserErrors.get(page)!;
  expect(errors.page).toEqual([]);
  // The intentionally missing-route case can emit an expected HTTP 404 log.
  const unexpected = testInfo.title.startsWith("a missing route")
    ? errors.console.filter((message) => !message.includes("404"))
    : errors.console;
  expect(unexpected).toEqual([]);
});

async function recordNavigation(page: Page) {
  await page.addInitScript(() => {
    window.navigationQATimeline = [];
    window.navigationQAStarted = 0;
    let previous = "";
    document.addEventListener("DOMContentLoaded", () => {
      new MutationObserver(() => {
        if (!window.navigationQAStarted) return;
        const sample = {
          elapsed: Math.round(performance.now() - window.navigationQAStarted),
          phase:
            document.querySelector<HTMLElement>(".site-transition")?.dataset
              .phase ?? "absent",
          path: location.pathname,
          home: !!document.querySelector("main.editorial-home"),
          work: !!document.querySelector("main.work-exhibition"),
        };
        const identity = JSON.stringify({ ...sample, elapsed: 0 });
        if (identity === previous) return;
        previous = identity;
        window.navigationQATimeline.push(sample);
      }).observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-phase"],
      });
    });
  });
}

async function startRecording(page: Page) {
  await page.evaluate(() => {
    window.navigationQAStarted = performance.now();
    window.navigationQATimeline = [];
  });
}

async function assertRevealAfterCommit(page: Page) {
  await expect(page.locator("main.work-exhibition")).toBeVisible();
  await expect(page.locator(".site-transition")).toHaveAttribute(
    "data-phase",
    "idle",
  );
  const timeline = await page.evaluate(() => window.navigationQATimeline);
  const reveal = timeline.find((sample) => sample.phase === "reveal");
  expect(
    reveal,
    "the destination must commit before its reveal begins",
  ).toMatchObject({ path: "/work", home: false, work: true });
  return timeline;
}

async function retainWorkResponses(page: Page, origin: string) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let retained = 0;
  await page.route("**/work*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin !== origin ||
      url.pathname !== "/work" ||
      route.request().resourceType() === "document"
    ) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    retained += 1;
    await gate;
    await route.fulfill({ response });
  });
  return { release, retained: () => retained };
}

test("slow navigation stays covered until the destination commits", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  const origin = new URL(baseURL!).origin;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await recordNavigation(page);

  let release!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let heldResponses = 0;
  let deliveredResponses = 0;

  // A fresh context plus a gate on every target fetch also defeats Next prefetch.
  // Fetch upstream first; retaining its actual response reproduces a slow route.
  await context.route("**/work*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin !== origin ||
      url.pathname !== "/work" ||
      route.request().resourceType() === "document"
    ) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const ready = Date.now();
    heldResponses += 1;
    await responseGate;
    await delay(2_100 - (Date.now() - ready));
    await route.fulfill({ response });
    deliveredResponses += 1;
  });

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-studio-ready="true"]');
    await startRecording(page);
    const clicked = Date.now();
    await page.getByRole("link", { name: "作品", exact: true }).click();
    await expect.poll(() => heldResponses).toBeGreaterThan(0);

    // The old bug drops its cover at 800 ms. Sample beyond that deadline while
    // the target response is deliberately still retained, rather than racing IO.
    await delay(1_200 - (Date.now() - clicked));
    const blocked = await page.evaluate(() => {
      const cover = document.querySelector<HTMLElement>(".site-transition")!;
      const style = getComputedStyle(cover);
      const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return {
        elapsed: Math.round(performance.now() - window.navigationQAStarted),
        phase: cover.dataset.phase,
        path: location.pathname,
        home: !!document.querySelector("main.editorial-home"),
        work: !!document.querySelector("main.work-exhibition"),
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
        oldPageProtected: !!hit?.closest(".site-transition"),
        shellInert: !!document
          .querySelector(".studio-shell")
          ?.closest("[inert]"),
      };
    });
    expect(deliveredResponses, "target responses must still be blocked").toBe(
      0,
    );
    expect
      .soft(
        blocked,
        "the old page must remain covered while its route is pending",
      )
      .toMatchObject({
        phase: "hold",
        path: "/",
        home: true,
        work: false,
        visibility: "visible",
        pointerEvents: "auto",
        oldPageProtected: true,
        shellInert: true,
      });
    await testInfo.attach("blocked-route-state", {
      body: Buffer.from(JSON.stringify(blocked, null, 2)),
      contentType: "application/json",
    });

    await delay(2_500 - (Date.now() - clicked));
    release();
    await expect(page.locator("main.work-exhibition")).toBeVisible();
    await expect(page.locator(".site-transition")).toHaveAttribute(
      "data-phase",
      "idle",
    );
    const timeline = await page.evaluate(() => window.navigationQATimeline);
    await testInfo.attach("route-commit-timeline", {
      body: Buffer.from(JSON.stringify(timeline, null, 2)),
      contentType: "application/json",
    });
    expect(
      timeline.find((sample) => sample.phase === "reveal"),
      "reveal must begin with the destination DOM already committed",
    ).toMatchObject({ path: "/work", home: false, work: true });
    expect(errors).toEqual([]);
  } finally {
    release();
    await context.unrouteAll({ behavior: "wait" });
  }
});

test("fast pointer navigation reveals the committed destination", async ({
  page,
}) => {
  await recordNavigation(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await startRecording(page);
  await page.getByRole("link", { name: "作品", exact: true }).click();
  await expect(page.locator(".site-transition")).toBeVisible();
  await assertRevealAfterCommit(page);
});

test("keyboard navigation bypasses the decorative cover", async ({ page }) => {
  await recordNavigation(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await startRecording(page);
  await page.getByRole("link", { name: "作品", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main.work-exhibition")).toBeVisible();
  const phases = await page.evaluate(() =>
    window.navigationQATimeline.map((sample) => sample.phase),
  );
  expect(phases.every((phase) => phase === "idle")).toBe(true);
  await expect(page.locator(".site-transition")).not.toBeVisible();
});

test("reduced motion bypasses the decorative cover", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await recordNavigation(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await startRecording(page);
  await page.getByRole("link", { name: "作品", exact: true }).click();
  await expect(page.locator("main.work-exhibition")).toBeVisible();
  const phases = await page.evaluate(() =>
    window.navigationQATimeline.map((sample) => sample.phase),
  );
  expect(phases.every((phase) => phase === "idle")).toBe(true);
  await expect(page.locator(".site-transition")).not.toBeVisible();
});

test("a newer link wins after skipping a pending route", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  await recordNavigation(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let retained = 0;
  const origin = new URL(baseURL!).origin;
  await context.route("**/work*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin !== origin ||
      url.pathname !== "/work" ||
      route.request().resourceType() === "document"
    ) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    retained += 1;
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-studio-ready="true"]');
    await startRecording(page);
    await page.getByRole("link", { name: "作品", exact: true }).click();
    await expect(page.locator(".site-transition")).toHaveAttribute(
      "data-phase",
      "hold",
    );
    await expect.poll(() => retained).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".site-transition")).not.toBeVisible();
    await expect(page.locator(".studio-shell")).not.toHaveAttribute("inert");
    await expect(
      page.getByRole("link", { name: "作品", exact: true }),
    ).toBeFocused();

    // Route A is dispatched but still pending. Release it immediately after
    // clicking B, while a new decorative cover would still be entering.
    await page.getByRole("link", { name: "文字", exact: true }).click();
    release();
    await expect(
      page,
      "the latest requested route must not lose its dispatch",
    ).toHaveURL(/\/writing$/);
    await expect(page.locator("main.writing-journal")).toBeVisible();
    await expect(page.locator(".site-transition")).not.toBeVisible();
    await expect(page.locator(".studio-shell")).not.toHaveAttribute("inert");
  } finally {
    release();
    await context.unrouteAll({ behavior: "wait" });
    await testInfo.attach("latest-link-timeline", {
      body: Buffer.from(
        JSON.stringify(
          await page.evaluate(() => window.navigationQATimeline),
          null,
          2,
        ),
      ),
      contentType: "application/json",
    });
  }
});

test("slow-load controls trap focus and recover by committing, skipping or opening directly", async ({
  browser,
  baseURL,
}) => {
  const errors: string[] = [];
  // Run the exits concurrently so genuine eight-second waits cost one interval.
  const cases = await Promise.all(
    ["commit", "skip", "direct"].map(async (mode) => {
      const context = await browser.newContext({
        baseURL,
        viewport: { width: 1280, height: 900 },
        colorScheme: mode === "skip" ? "dark" : "light",
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      const gate = await retainWorkResponses(page, new URL(baseURL!).origin);
      await recordNavigation(page);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-studio-ready="true"]');
      await startRecording(page);
      await page.getByRole("link", { name: "作品", exact: true }).click();
      await expect(page.locator(".site-transition")).toHaveAttribute(
        "data-phase",
        "hold",
      );
      await expect.poll(gate.retained).toBeGreaterThan(0);
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("dialog", { name: "页面切换", exact: true }),
      ).toBeFocused();
      return { mode, context, page, gate };
    }),
  );

  try {
    await Promise.all(
      cases.map(async ({ mode, page, gate }) => {
        const direct = page.getByRole("link", {
          name: "直接打开页面",
          exact: true,
        });
        const skip = page.getByRole("button", {
          name: "跳过动画",
          exact: true,
        });
        await expect(skip).toBeVisible({ timeout: 10_000 });
        await expect(page.locator(".site-transition")).toHaveAttribute(
          "data-phase",
          "hold",
        );
        await expect(page.locator("main.editorial-home")).toBeAttached();
        await expect(page.locator(".studio-shell")).toHaveAttribute(
          "inert",
          "",
        );
        await expect(direct).toHaveAttribute("href", "/work");
        if (process.env.ALPS_QA_SCREENSHOT_DIR && mode !== "direct") {
          await page.screenshot({
            path: `${process.env.ALPS_QA_SCREENSHOT_DIR}/navigation-slow-${mode === "skip" ? "dark" : "light"}.png`,
          });
        }
        await page.keyboard.press("Tab");
        await expect(direct).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(skip).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(direct).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(skip).toBeFocused();

        if (mode === "direct") {
          // A document request must bypass retained RSC/prefetch responses.
          await page.keyboard.press("Tab");
          await expect(direct).toBeFocused();
          await page.keyboard.press("Enter");
          await expect(page).toHaveURL(/\/work$/);
          await expect(page.locator("main.work-exhibition")).toBeVisible();
          await expect(page.locator(".site-transition")).not.toBeVisible();
          await expect(page.locator(".studio-shell")).not.toHaveAttribute(
            "inert",
          );
          return;
        }

        if (mode === "skip") {
          await page.keyboard.press("Enter");
          await expect(page.locator(".site-transition")).not.toBeVisible();
          await expect(page.locator(".studio-shell")).not.toHaveAttribute(
            "inert",
          );
          await expect(
            page.getByRole("link", { name: "作品", exact: true }),
          ).toBeFocused();
          await expect(page.locator("main.editorial-home")).toBeVisible();
        }
        gate.release();
        await expect(page.locator("main.work-exhibition")).toBeAttached();
        if (mode === "commit") {
          await expect(page.locator(".site-transition")).toHaveAttribute(
            "data-phase",
            "reveal",
          );
          await expect(skip).toBeFocused();
        }
        await expect(page.locator(".site-transition")).not.toBeVisible();
        await expect(page.locator(".studio-shell")).not.toHaveAttribute(
          "inert",
        );
        await expect(
          page.getByRole("link", { name: "作品", exact: true }),
        ).toBeFocused();
        const timeline = await page.evaluate(() => window.navigationQATimeline);
        if (mode === "skip") {
          expect(timeline.some((sample) => sample.phase === "reveal")).toBe(
            false,
          );
        } else {
          expect(
            timeline.find((sample) => sample.phase === "reveal"),
          ).toMatchObject({ path: "/work", home: false, work: true });
        }
      }),
    );
    expect(errors).toEqual([]);
  } finally {
    for (const { gate } of cases) gate.release();
    await Promise.all(
      cases.map(async ({ context, page }) => {
        await page.unrouteAll({ behavior: "wait" });
        await context.close();
      }),
    );
  }
});

test("Escape during the entering cover still follows the link", async ({
  page,
}) => {
  await recordNavigation(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await startRecording(page);
  await page.getByRole("link", { name: "作品", exact: true }).click();
  await expect(page.locator(".site-transition")).toHaveAttribute(
    "data-phase",
    "cover",
  );
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/work$/);
  await expect(page.locator("main.work-exhibition")).toBeVisible();
  await expect(page.locator(".site-transition")).not.toBeVisible();
  await expect(page.locator(".studio-shell")).not.toHaveAttribute("inert");
  const phases = await page.evaluate(() =>
    window.navigationQATimeline.map((sample) => sample.phase),
  );
  expect(phases).toContain("cover");
  expect(phases).not.toContain("reveal");
});

test("back during the cover cancels obsolete route dispatch", async ({
  page,
}) => {
  await page.goto("/about", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "首页", exact: true }).click();
  await expect(page.locator("main.editorial-home")).toBeVisible();
  await expect(page.locator(".site-transition")).not.toBeVisible();
  await page.getByRole("link", { name: "作品", exact: true }).click();
  await expect(page.locator(".site-transition")).toHaveAttribute(
    "data-phase",
    "cover",
  );
  await page.goBack();
  await expect(page).toHaveURL(/\/about$/);
  await delay(600);
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator(".site-transition")).not.toBeVisible();
  await expect(page.locator(".studio-shell")).not.toHaveAttribute("inert");
});

test("navigation from a removed trigger restores meaningful focus", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("a.poster-sticker").click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator(".site-transition")).not.toBeVisible();
  const focused = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      connected: active?.isConnected,
      meaningful: active?.matches(
        "main, a[href], button, input, select, textarea",
      ),
      insideHiddenCover: !!active?.closest(
        '.site-transition[aria-hidden="true"]',
      ),
    };
  });
  expect(focused).toEqual({
    connected: true,
    meaningful: true,
    insideHiddenCover: false,
  });
});

test("a missing route removes its provider and cannot leave a blocking cover", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });
  // A stale public link can point at a deleted/unpublished page.
  const workLink = page.getByRole("link", { name: "作品", exact: true });
  await workLink.evaluate((link) =>
    link.setAttribute("href", "/navigation-missing-page"),
  );
  await workLink.click();
  await expect(page).toHaveURL(/\/navigation-missing-page$/);
  await expect(page.locator("main.not-found")).toBeVisible();
  await expect(page.locator(".site-transition")).not.toBeVisible();
  await expect(page.locator(".studio-shell[inert]")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "回到首页", exact: true }),
  ).toBeVisible();
});
