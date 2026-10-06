import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Original folded-module artwork and hand-drawn ALPS lettering.
// All lettering in exported logos is an outline, independent of installed fonts.
const output = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../public/brand",
);
const ink = "#211f1a";
const paper = "#f5f0e7";
const red = "#e6462d";
const module = `<path fill="currentColor" d="M32 5h23v21l-18 5-5-8V5Z"/>`;
const mark = `<g>${[0, 90, 180, 270].map((turn) => `<g transform="rotate(${turn} 32 32)">${module}</g>`).join("")}</g>`;
const wordmark = `<path fill="currentColor" fill-rule="evenodd" d="M1 50 15 14h12l14 36H30l-3-8H14l-3 8H1Zm16-16h7l-3.5-11L17 34Z"/><path fill="currentColor" d="M43 14h10v27h17v9H43V14Z"/><path fill="currentColor" fill-rule="evenodd" d="M73 50V14h19c24 0 24 25 0 25h-9v11H73Zm10-27v7h8c10 0 10-7 0-7h-8Z"/><path fill="currentColor" d="M149 16v10c-5-3-11-4-16-4-5 0-7 1-7 3 0 2 4 3 9 4 15 3 20 9 15 17-6 10-26 9-37 2V37c6 4 14 7 20 7 5 0 8-1 8-3 0-2-5-3-9-4-14-3-20-8-16-16 5-10 22-10 33-5Z"/>`;
// Compatibility names describe API slots; these are editorial divider and badge.
const divider = `<path fill="currentColor" d="M3 24h16v16H3zM25 29h49v6H25z"/><g transform="translate(86 8) scale(.72)">${mark}</g>`;
const badge = `<path fill="currentColor" fill-rule="evenodd" d="M3 3h94v94H3V3Zm4 4v86h86V7H7Z"/><g transform="translate(21 11) scale(.36)">${wordmark}</g><g transform="translate(24 32) scale(.82)">${mark}</g><path fill="currentColor" d="M10 80h12v3H10zM78 80h12v3H78zM10 14h5v5h-5zM85 14h5v5h-5z"/>`;
const icon = (content) =>
  `<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="square" stroke-linejoin="miter">${content}</g>`;
const symbols = [
  { id: "alps-mark", viewBox: "0 0 64 64", content: mark },
  { id: "alps-wordmark", viewBox: "0 0 160 64", content: wordmark },
  { id: "alps-ridge", viewBox: "0 0 128 64", content: divider },
  { id: "alps-stamp", viewBox: "0 0 100 100", content: badge },
  {
    id: "alps-compass",
    viewBox: "0 0 24 24",
    content: `<g transform="scale(.375)">${mark}</g>`,
  },
  {
    id: "alps-work",
    viewBox: "0 0 24 24",
    content: icon(`<path d="M3 6h7l3 3h8v12H3V6ZM3 13h18M8 6V3h13v3"/>`),
  },
  {
    id: "alps-writing",
    viewBox: "0 0 24 24",
    content: icon(`<path d="M3 3h12l6 6v12H3V3Zm12 0v6h6M7 12h10M7 16h6"/>`),
  },
  {
    id: "alps-profile",
    viewBox: "0 0 24 24",
    content: icon(`<path d="M3 3h18v18H3V3ZM9 7h6v6H9V7Zm-2 14v-5h10v5"/>`),
  },
  {
    id: "alps-mail",
    viewBox: "0 0 24 24",
    content: icon(`<path d="M3 6h18v14H3V6Zm0 0 9 9 9-9M3 20l5-5m13 5-5-5"/>`),
  },
  {
    id: "alps-arrow",
    viewBox: "0 0 24 24",
    content: icon(`<path d="M4 20 20 4M7 4h13v13"/>`),
  },
  {
    id: "alps-menu",
    viewBox: "0 0 24 24",
    content: icon(`<path d="M3 6h18M3 12h12M3 18h18"/>`),
  },
  {
    id: "alps-close",
    viewBox: "0 0 24 24",
    content: icon(`<path d="m4 4 16 16M20 4 4 20"/>`),
  },
  {
    id: "alps-exit",
    viewBox: "0 0 24 24",
    content: icon(`<path d="M9 3H3v18h6m3-9h9m-5-5 5 5-5 5"/>`),
  },
  {
    id: "alps-draft",
    viewBox: "0 0 24 24",
    content: icon(
      `<path d="M3 3h14v18H3V3ZM7 7h6M7 11h6M7 15h3m7-10h4v14h-4"/>`,
    ),
  },
];
const svg = (viewBox, content, color = ink, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${color ? ` color="${color}"` : ""}${label ? ` role="img" aria-label="${label}"` : ""}>${content}</svg>\n`;
const logo = `<g transform="translate(0 2)">${mark}</g><g transform="translate(76 0)">${wordmark}</g>`;
const positioned = (id, x, y, width, color = ink) => {
  const symbol = symbols.find((entry) => entry.id === id);
  const [, , originalWidth] = symbol.viewBox.split(" ").map(Number);
  return `<g color="${color}" transform="translate(${x} ${y}) scale(${width / originalWidth})">${symbol.content}</g>`;
};
const atlasItems = [
  { id: "alps-mark", x: 0, y: 0, width: 64, height: 64 },
  { id: "alps-wordmark", x: 80, y: 0, width: 160, height: 64 },
  { id: "alps-ridge", x: 256, y: 0, width: 128, height: 64 },
  { id: "alps-stamp", x: 400, y: 0, width: 100, height: 100 },
  ...symbols
    .slice(4)
    .map((symbol, index) => ({
      id: symbol.id,
      x: index * 48,
      y: 128,
      width: 24,
      height: 24,
    })),
];
const atlas = atlasItems
  .map((item) => positioned(item.id, item.x, item.y, item.width))
  .join("");
const text = (x, y, value, size = 12, color = ink, attrs = "") =>
  `<text x="${x}" y="${y}" fill="${color}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" ${attrs}>${value}</text>`;
const labels = symbols
  .slice(4)
  .map((symbol, index) => {
    const x = 64 + index * 110;
    const name =
      symbol.id === "alps-compass" ? "spark" : symbol.id.replace("alps-", "");
    return `${positioned(symbol.id, x + 20, 724, 32)}${text(x, 791, name, 11)}`;
  })
  .join("");
const board = `<rect width="1200" height="880" fill="${paper}"/><path d="M64 76h1072M64 367h1072M64 658h1072M64 815h1072" stroke="${ink}" stroke-opacity=".25"/>${text(64, 48, "ALPS / AN INDEPENDENT PRACTICE", 12, ink, 'letter-spacing="1.5"')}${text(1136, 48, "IDENTITY SYSTEM / 2026", 11, ink, 'text-anchor="end"')}${positioned("alps-wordmark", 62, 60, 792)}${positioned("alps-mark", 945, 143, 167, red)}${text(67, 338, "A personal point of view. Folded into four parts.", 17)}${text(1136, 338, "01 — LETTERS / MODULES", 11, red, 'text-anchor="end"')}<rect x="64" y="403" width="489" height="219" fill="${red}"/><g color="${paper}" transform="translate(98 447) scale(1.75)">${logo}</g>${text(96, 594, "PRIMARY / REVERSE", 11, paper, 'letter-spacing="1"')}${text(591, 424, "02 / FOLDED MODULE", 11)}${positioned("alps-mark", 602, 457, 114)}<rect x="730" y="458" width="54" height="54" fill="${red}"/>${positioned("alps-mark", 736, 464, 42, paper)}${text(730, 540, "APP ICON", 10)}${text(841, 424, "03 / EDITORIAL BADGE", 11)}${positioned("alps-stamp", 882, 455, 114, red)}${positioned("alps-ridge", 588, 563, 213, red)}${text(1065, 482, "INK", 10)}<rect x="1065" y="492" width="70" height="27" fill="${ink}"/>${text(1065, 543, "VERMILION", 10)}<rect x="1065" y="553" width="70" height="27" fill="${red}"/>${text(64, 693, "04 / EVERYDAY SYMBOLS", 11, ink, 'letter-spacing="1"')}${text(1136, 693, "24 × 24 / CURRENTCOLOR", 11, ink, 'text-anchor="end"')}${labels}${text(64, 852, "IDEAS. SYSTEMS. SMALL THINGS.", 11, red, 'letter-spacing="1.3"')}${text(1136, 852, "ALPS × STUDIO", 11, ink, 'text-anchor="end"')}`;

await mkdir(output, { recursive: true });
const individualFiles = Object.fromEntries(
  symbols
    .filter(({ id }) => id !== "alps-mark")
    .map(({ id, viewBox, content }) => [
      `${id}.svg`,
      svg(viewBox, content, ink, id),
    ]),
);
const files = {
  ...individualFiles,
  "alps-sprite.svg": svg(
    "0 0 512 160",
    symbols
      .map(
        ({ id, viewBox, content }) =>
          `<symbol id="${id}" viewBox="${viewBox}">${content}</symbol>`,
      )
      .join(""),
    null,
  ),
  "alps-logo.svg": svg("0 0 240 68", logo, ink, "ALPS"),
  "alps-logo-light.svg": svg("0 0 240 68", logo, paper, "ALPS"),
  "alps-logo-red.svg": svg("0 0 240 68", logo, red, "ALPS"),
  "alps-mark.svg": svg("0 0 64 64", mark, ink, "ALPS folded module"),
  "alps-favicon.svg": svg(
    "0 0 64 64",
    `<rect width="64" height="64" fill="${red}"/><g transform="translate(8 8) scale(.75)">${mark}</g>`,
    paper,
  ),
  "alps-atlas.svg": svg(
    "0 0 512 160",
    atlas,
    ink,
    "ALPS logo and icon sprite sheet",
  ),
  "preview.svg": svg(
    "0 0 1200 880",
    board,
    ink,
    "ALPS editorial visual identity",
  ),
  "manifest.json":
    JSON.stringify(
      {
        name: "ALPS editorial identity",
        version: 2,
        author: "Alps",
        license: "Original project artwork; available for use in this website",
        palette: { ink, paper, red },
        sprite: "/brand/alps-sprite.svg",
        symbols: symbols.map(({ id, viewBox }) => ({ id, viewBox })),
        atlas: {
          src: "/brand/alps-atlas.svg",
          width: 512,
          height: 160,
          items: atlasItems,
        },
        exports: [
          "alps-logo.svg",
          "alps-logo-light.svg",
          "alps-logo-red.svg",
          "alps-mark.svg",
          ...Object.keys(individualFiles),
          "alps-favicon.svg",
          "alps-atlas.svg",
          "preview.svg",
        ],
      },
      null,
      2,
    ) + "\n",
};
await Promise.all(
  Object.entries(files).map(([filename, content]) =>
    writeFile(resolve(output, filename), content),
  ),
);
console.log(
  `Generated ${Object.keys(files).length} ALPS editorial assets in ${output}`,
);
