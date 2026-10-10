import { expect, test, type Page, type TestInfo } from "@playwright/test";
import sharp from "sharp";

type RGB = readonly [number, number, number];
const near = (pixels: Buffer, offset: number, color: RGB, tolerance = 4) =>
  color.every(
    (channel, index) => Math.abs(pixels[offset + index] - channel) <= tolerance,
  );
const brightness = (color: RGB) =>
  color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
const pixelBrightness = (pixels: Buffer, offset: number) =>
  brightness([pixels[offset], pixels[offset + 1], pixels[offset + 2]]);

async function openWork(page: Page, theme: "light" | "dark", paused = true) {
  await page.addInitScript(
    ({ theme, paused }) => {
      localStorage.setItem("alps-site-theme", theme);
      localStorage.setItem("alps-motion-preference", paused ? "off" : "on");
    },
    { theme, paused },
  );
  await page.goto("/work", { waitUntil: "networkidle" });
  await expect(page.locator(".studio-shell")).toHaveAttribute(
    "data-print-ready",
    "true",
  );
  await page.evaluate(() => document.fonts.ready);
}

// Compare actual rasterized glyph interiors with two independent reference
// renders: normal type on paper, and the plate with the heading hidden. This
// catches a missing inverse layer even if its clip CSS variables look correct.
async function assertInversePixels(
  page: Page,
  testInfo: TestInfo,
  label: string,
) {
  const sample = await page
    .locator(".work-exhibition__title > [data-print-title]")
    .evaluate((title) => {
      const rect = title.getBoundingClientRect();
      // Read existing nodes only; appending probes would trigger the plate's
      // MutationObserver and could accidentally repair a stale initial clip.
      const inverse = title.querySelector(".print-title__inverse")!;
      const plate = document.querySelector(".print-atmosphere__plate")!;
      const colors = [
        getComputedStyle(title).color,
        getComputedStyle(inverse).color,
        getComputedStyle(plate).fill,
      ].map((color) => color.match(/\d+/g)!.map(Number).slice(0, 3));
      return { rect: rect.toJSON(), colors };
    });
  const [ink, paper, field] = sample.colors as unknown as RGB[];
  const midpoint = (brightness(field) + brightness(paper)) / 2;
  const darkerField = brightness(field) < brightness(paper);
  const inField = (pixels: Buffer, offset: number) => {
    const light = pixelBrightness(pixels, offset);
    return darkerField ? light < midpoint - 6 : light > midpoint + 6;
  };
  const actualImage = await page.screenshot();
  const baselineStyle = await page.addStyleTag({
    content:
      ".print-atmosphere,.print-title__inverse { visibility:hidden!important }",
  });
  const baselineImage = await page.screenshot();
  await baselineStyle.evaluate((element) =>
    element.parentNode?.removeChild(element),
  );
  const fieldStyle = await page.addStyleTag({
    content:
      ".work-archive__heading h1,.work-archive__heading h1 * { visibility:hidden!important }",
  });
  const fieldImage = await page.screenshot();
  await fieldStyle.evaluate((element) =>
    element.parentNode?.removeChild(element),
  );
  const [actual, baseline, plate] = await Promise.all(
    [actualImage, baselineImage, fieldImage].map(async (image) => {
      const { data, info } = await sharp(image)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return {
        data,
        width: info.width,
        height: info.height,
        channels: info.channels,
      };
    }),
  );
  let inside = 0;
  let inverseMatches = 0;
  let outside = 0;
  let normalMatches = 0;
  const { width, height, channels } = actual;
  for (
    let y = Math.max(1, Math.ceil(sample.rect.top + 2));
    y < Math.min(height - 1, sample.rect.bottom - 2);
    y++
  ) {
    for (
      let x = Math.max(1, Math.ceil(sample.rect.left + 2));
      x < Math.min(width - 1, sample.rect.right - 2);
      x++
    ) {
      const offset = (y * width + x) * channels;
      // Exclude antialiasing, the edge, photographs, and overlapping objects.
      const interior = [-1, 0, 1].every((dy) =>
        [-1, 0, 1].every((dx) =>
          near(baseline.data, ((y + dy) * width + x + dx) * channels, ink),
        ),
      );
      if (!interior) continue;
      // The plate is textured, so a single flat RGB value is no longer a valid
      // interior reference. Classify both themes by their paper/field midpoint,
      // and require a stable neighborhood away from the clipped ink boundary.
      const fieldInterior = [-1, 0, 1].every((dy) =>
        [-1, 0, 1].every((dx) =>
          inField(plate.data, ((y + dy) * width + x + dx) * channels),
        ),
      );
      const paperInterior = [-1, 0, 1].every((dy) =>
        [-1, 0, 1].every((dx) =>
          near(plate.data, ((y + dy) * width + x + dx) * channels, paper),
        ),
      );
      if (fieldInterior) {
        inside++;
        if (near(actual.data, offset, paper, 12)) inverseMatches++;
      } else if (paperInterior) {
        outside++;
        if (near(actual.data, offset, ink, 12)) normalMatches++;
      }
    }
  }
  const result = {
    inside,
    inverseCoverage: inverseMatches / inside,
    outside,
    normalCoverage: normalMatches / outside,
  };
  await testInfo.attach(`${label}-pixel-coverage`, {
    body: Buffer.from(JSON.stringify(result, null, 2)),
    contentType: "application/json",
  });
  expect(
    inside,
    "the screenshot must contain real glyph interiors inside the plate",
  ).toBeGreaterThan(1_000);
  expect(
    outside,
    "the screenshot must also contain normal type outside the plate",
  ).toBeGreaterThan(1_000);
  expect(
    result.inverseCoverage,
    "glyphs inside the plate must actually render in the inverse paper color",
  ).toBeGreaterThan(0.99);
  expect(
    result.normalCoverage,
    "type outside the plate must retain its normal ink color",
  ).toBeGreaterThan(0.99);
}

test.use({ viewport: { width: 1047, height: 1133 } });

test("work introduction does not cover the moving print field", async ({
  page,
}) => {
  await openWork(page, "light");
  const surface = await page
    .locator(".work-exhibition__statement")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, shadow: style.boxShadow };
    });
  expect(
    surface,
    "the introduction must let the viewport-fixed print field pass behind it",
  ).toEqual({
    background: "rgba(0, 0, 0, 0)",
    shadow: "none",
  });
  const entry = page.getByRole("link", { name: "进入作品索引", exact: true });
  await expect(entry).toHaveCount(1);
  await expect(page.locator(".work-exhibition__statement a[href]")).toHaveCount(
    1,
  );
  await expect(
    page.locator(
      ".work-exhibition__statement .print-title__inverse a,.work-exhibition__statement .print-title__inverse button,.work-exhibition__statement .print-title__inverse [tabindex]",
    ),
  ).toHaveCount(0);
  await entry.focus();
  await expect(entry).toBeFocused();
  await expect(entry).toHaveAttribute("href", "#project-catalog");
});

test("the print image loads, decodes and supplies real raster texture", async ({
  page,
}, testInfo) => {
  const response = page.waitForResponse(
    (result) =>
      new URL(result.url()).pathname === "/backgrounds/print-plate-v2.webp",
  );
  await openWork(page, "light");
  expect((await response).status()).toBe(200);
  const texture = page.locator(".print-atmosphere__texture");
  await expect(texture).toHaveAttribute(
    "href",
    "/backgrounds/print-plate-v2.webp",
  );
  const decoded = await texture.evaluate(async (element) => {
    const image = new Image();
    image.src = element.getAttribute("href")!;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  expect(decoded.width).toBeGreaterThan(500);
  expect(decoded.height).toBeGreaterThan(300);

  const assertPlateOverscan = async () => {
    const coverage = await page
      .locator(".print-atmosphere__plate")
      .evaluate((element) => {
        const polygon = element as SVGPolygonElement;
        const group = polygon.closest("g")!;
        const matrix = group.getScreenCTM()!;
        const points = Array.from(
          { length: polygon.points.numberOfItems },
          (_, index) => {
            const point = polygon.points.getItem(index);
            return new DOMPoint(point.x, point.y).matrixTransform(matrix);
          },
        );
        return {
          right: Math.max(...points.map((point) => point.x)) - innerWidth,
          top: -Math.min(...points.map((point) => point.y)),
        };
      });
    expect(
      coverage.right,
      "the real transformed plate must extend beyond the viewport to cover leftward drift",
    ).toBeGreaterThanOrEqual(42);
    expect(
      coverage.top,
      "the plate must cover its vertical drift without exposing the source image's crop",
    ).toBeGreaterThanOrEqual(13);
  };
  await assertPlateOverscan();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await assertPlateOverscan();
  await page.setViewportSize({ width: 1047, height: 1133 });
  await page.evaluate(() => new Promise(requestAnimationFrame));

  const fieldColor = await page
    .locator(".print-atmosphere__plate")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      const shell = element.closest(".studio-shell")!;
      const field = style.fill.match(/\d+/g)!.map(Number).slice(0, 3);
      const paper = getComputedStyle(
        shell.querySelector(".work-exhibition__title .print-title__inverse")!,
      )
        .color.match(/\d+/g)!
        .map(Number)
        .slice(0, 3);
      const opacity = Number(style.fillOpacity);
      return field.map((channel, index) =>
        Math.round(channel * opacity + paper[index] * (1 - opacity)),
      );
    });
  // Isolate the ink surface from all hero type/art and the site's separate grain.
  const foregroundStyle = await page.addStyleTag({
    content:
      ".work-archive__heading,.work-archive__heading *,.print-grain { visibility:hidden!important }",
  });
  const texturedImage = await page.screenshot();
  const flatStyle = await page.addStyleTag({
    content: ".print-atmosphere__texture { visibility:hidden!important }",
  });
  const flatImage = await page.screenshot();
  await flatStyle.evaluate((element) =>
    element.parentNode?.removeChild(element),
  );
  await foregroundStyle.evaluate((element) =>
    element.parentNode?.removeChild(element),
  );
  const [textured, flat] = await Promise.all(
    [texturedImage, flatImage].map(async (image) => {
      const { data, info } = await sharp(image)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return { data, ...info };
    }),
  );
  const levels: number[] = [];
  let changed = 0;
  for (let y = 2; y < flat.height - 2; y += 2) {
    for (let x = 2; x < flat.width - 2; x += 2) {
      const offset = (y * flat.width + x) * flat.channels;
      const stable = [-1, 0, 1].every((dy) =>
        [-1, 0, 1].every((dx) =>
          near(
            flat.data,
            ((y + dy) * flat.width + x + dx) * flat.channels,
            fieldColor as unknown as RGB,
            3,
          ),
        ),
      );
      if (!stable) continue;
      const level = pixelBrightness(textured.data, offset);
      levels.push(level);
      if (Math.abs(level - pixelBrightness(flat.data, offset)) > 1) changed++;
    }
  }
  levels.sort((a, b) => a - b);
  const mean = levels.reduce((sum, level) => sum + level, 0) / levels.length;
  const deviation = Math.sqrt(
    levels.reduce((sum, level) => sum + (level - mean) ** 2, 0) / levels.length,
  );
  const spread =
    levels[Math.floor(levels.length * 0.95)] -
    levels[Math.floor(levels.length * 0.05)];
  await testInfo.attach("ink-raster-texture", {
    body: Buffer.from(
      JSON.stringify(
        { decoded, samples: levels.length, changed, deviation, spread },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
  expect(
    levels.length,
    "sample the actual inside of the printed plate",
  ).toBeGreaterThan(1_000);
  expect(
    changed,
    "the raster image must visibly affect the ink surface",
  ).toBeGreaterThan(1_000);
  expect(
    deviation,
    "the ink surface must contain texture rather than a flat fill",
  ).toBeGreaterThan(0.4);
  expect(
    spread,
    "fine ink texture must vary over several brightness levels",
  ).toBeGreaterThan(1);
});

for (const theme of ["light", "dark"] as const) {
  test(`WORK has real inverse glyphs in ${theme} mode after resize and scroll`, async ({
    page,
  }, testInfo) => {
    await openWork(page, theme);
    await assertInversePixels(page, testInfo, `${theme}-initial`);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => scrollTo(0, 72));
    await page.waitForTimeout(100);
    await assertInversePixels(page, testInfo, `${theme}-resized-scrolled`);
  });
}

test("the fixed print field stops and resumes through the global motion control", async ({
  page,
}) => {
  await openWork(page, "light", false);
  const plate = page.locator(".print-atmosphere");
  const transform = () =>
    plate.evaluate((element) => getComputedStyle(element).transform);
  const moving = await transform();
  await expect.poll(transform).not.toBe(moving);
  await page.getByRole("button", { name: "暂停动效", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "开启动效", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const paused = await transform();
  await page.evaluate(() => scrollTo(0, 100));
  await page.waitForTimeout(120);
  expect(
    await transform(),
    "scrolling must not move the paused viewport plate",
  ).toBe(paused);
  await page.getByRole("button", { name: "开启动效", exact: true }).click();
  await expect.poll(transform).not.toBe(paused);
});

test("phone and reduced-motion layouts keep a single accessible index link", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWork(page, "dark");
  await expect(page.locator(".print-atmosphere")).not.toBeVisible();
  const entry = page.getByRole("link", { name: "进入作品索引", exact: true });
  await expect(entry).toHaveCount(1);
  await entry.focus();
  await expect(entry).toBeFocused();
  const size = await page.evaluate(() => ({
    viewport: innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(size.content).toBeLessThanOrEqual(size.viewport);
});
