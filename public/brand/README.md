# ALPS 编辑式品牌系统

为 Alps 个人网站绘制的原创矢量标识。四瓣折纸模块围绕负空间旋转，与紧密排列的大写 ALPS 粗无衬线字标配合。字标由手工路径组成，无需加载字体。配色为奶油白 `#f5f0e7`、墨黑 `#211f1a` 和朱红 `#e6462d`。

## 内容

- `alps-logo.svg` / `alps-logo-light.svg` / `alps-logo-red.svg`：透明背景的墨黑、奶油白、朱红横向 Logo，另有 960 × 272 PNG。
- `alps-mark.svg` / `alps-wordmark.svg`：独立折纸模块与 ALPS 字标。
- `alps-ridge.svg`：抽象版面分隔图形；文件名为兼容旧组件 API 保留。
- `alps-stamp.svg`：方形排版徽标，由模块、字标及校准线组成。
- `alps-sprite.svg`：14 个可通过 `<use>` 引用的 SVG symbol，支持 `currentColor`。
- `alps-atlas.svg` / `alps-atlas.png` / `alps-atlas@2x.png`：实体排布雪碧图，1x 为 512 × 160，2x 为 1024 × 320，透明背景。
- `alps-atlas.css`：PNG 雪碧图区域样式，自动适配 1x / 2x 屏幕。
- `manifest.json`：SVG ID、视口、雪碧图坐标、三色及导出文件清单。
- `alps-{compass,work,writing,profile,mail,arrow,menu,close,exit,draft}.svg`：10 个独立图标。其中 `compass` 为兼容名称，其新图形是折纸星形。
- `alps-favicon.svg` / `favicon-16.png` / `favicon-32.png` / `apple-touch-icon.png`：朱红方形底色与奶油白模块的浏览器、手机图标。
- `preview.svg` / `preview.png`：1200 × 880 品牌预览板。

## 网站内使用

```tsx
import { BrandIcon, BrandLogo } from "@/components/brand";

<Link href="/" aria-label="Alps 首页"><BrandLogo /></Link>
<BrandIcon name="writing" size={24} />
<BrandIcon name="mark" size={64} label="ALPS 折纸标识" />
```

组件默认将图标视为装饰，功能名称由旁边的文字或按钮提供。仅用图形独立表达意义时传 `label`。后台站名改成其他名称后，会保留模块标记并显示可阅读的站名。

## 引用雪碧图

```html
<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" style="color: #e6462d">
  <use href="/brand/alps-sprite.svg#alps-writing"></use>
</svg>
```

SVG 雪碧图需通过同源 HTTP 服务访问，可调整大小和颜色。实体 PNG 雪碧图可用 CSS background：

```html
<link rel="stylesheet" href="/brand/alps-atlas.css" />
<span class="alps-sprite alps-sprite--writing" aria-hidden="true"></span>
```

PNG 的颜色固定为墨黑；CSS 尺寸和坐标以 1x 计，2x 文件会自动保持相同显示尺寸。使用其他路径时，保留 CSS 与 PNG 文件的相对位置。

## 重新生成

在项目根目录运行 `npm run brand:generate`。矢量源位于 `scripts/generate-brand-assets.mjs`，PNG / CSS 导出位于 `scripts/export-brand-images.mjs`。生成命令也会更新网站的 `public/icon.svg`。先修改源文件，再生成，避免直接编辑导出文件后被覆盖。
