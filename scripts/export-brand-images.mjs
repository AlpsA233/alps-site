import { copyFile, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

await import("./generate-brand-assets.mjs");
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(project, "public/brand");
const images = [
  ["alps-atlas.svg", "alps-atlas.png", 512, 160],
  ["alps-atlas.svg", "alps-atlas@2x.png", 1024, 320],
  ["alps-logo.svg", "alps-logo.png", 960, 272],
  ["alps-logo-light.svg", "alps-logo-light.png", 960, 272],
  ["alps-logo-red.svg", "alps-logo-red.png", 960, 272],
  ["alps-mark.svg", "alps-mark.png", 256, 256],
  ["alps-favicon.svg", "favicon-16.png", 16, 16],
  ["alps-favicon.svg", "favicon-32.png", 32, 32],
  ["alps-favicon.svg", "apple-touch-icon.png", 180, 180],
  ["preview.svg", "preview.png", 1200, 880],
];

await Promise.all(
  images.map(([source, target, width, height]) =>
    sharp(resolve(output, source), { density: 288 })
      .resize(width, height)
      .png()
      .toFile(resolve(output, target)),
  ),
);
await copyFile(
  resolve(output, "alps-favicon.svg"),
  resolve(project, "public/icon.svg"),
);

const manifestPath = resolve(output, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.atlas.png = "/brand/alps-atlas.png";
manifest.atlas.png2x = "/brand/alps-atlas@2x.png";
manifest.exports.push(...images.map(([, target]) => target), "alps-atlas.css");
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const spriteCss = [
  "/* Generated from manifest.json. Coordinates are CSS pixels at 1x. */",
  ".alps-sprite {",
  "  display: inline-block;",
  '  background-image: url("./alps-atlas.png");',
  '  background-image: image-set(url("./alps-atlas.png") 1x, url("./alps-atlas@2x.png") 2x);',
  "  background-repeat: no-repeat;",
  "  background-size: 512px 160px;",
  "  flex-shrink: 0;",
  "}",
  ...manifest.atlas.items.map(
    ({ id, x, y, width, height }) =>
      `.alps-sprite--${id.replace("alps-", "")} { width: ${width}px; height: ${height}px; background-position: ${-x}px ${-y}px; }`,
  ),
  "",
].join("\n");
await writeFile(resolve(output, "alps-atlas.css"), spriteCss);
console.log(
  `Exported ${images.length} PNG images, CSS atlas and site favicon.`,
);
