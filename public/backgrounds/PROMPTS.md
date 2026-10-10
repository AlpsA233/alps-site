# 印刷背景素材

最初确认的 UI 参照保存在 [print-background-reference.png](../../docs/design/print-background-reference.png)，便于后续校对材质，页面不读取该 UI 图。

当前前台直接显示 `print-plate-v4.webp`。内置 `image_gen` 以最初确认的 UI 图为材质参照，先移除文字、导航、照片与卡片并生成透明印版，再校正墨面颗粒与边缘密度。暖黑墨面、半透明印刷毛边及两侧断续朱红残印一起保存在同一张图片中。最终生成尺寸为 1421×1107，保存为保留 RGBA 的无损 WebP；不通过代码重绘可见轮廓或红线。

浅色模式以 100% 不透明度直接显示图片，不添加底形，不通过多边形裁掉毛边。深色模式使用 sRGB 颜色矩阵将中性暖黑映射为暖纸色，并保留朱红色相与原始 alpha。每帧只改变整体位置及文字投影坐标，不重新生成材质。

`src/components/print-plate-v4.json` 仅保存黑墨主体的分析轮廓，用于文字局部反色；半透明外沿与朱红残印不计入黑墨主体。这个分析轮廓在页面中没有可见填充或描边，也不用于裁切图片。主体分析使用 alpha 128、中性色与暗度筛选，取最大连通区域并对分析 mask 做一次 3×3 中值处理。文字边界随后按弧长进行 12 源像素窗口、σ=3 的高斯平滑，并按 0.3 源像素误差简化，以免反色文字跟着细颗粒缺口形成尖角。平滑轮廓相对初步分析轮廓最大偏差为 2.13 源像素；图片本身没有进行平滑或重绘。

图像和分析轮廓始终使用素材的原生 1421×1107 坐标，并共用一个等比缩放与平移矩阵；SVG 使用屏幕像素坐标，图片自身保留原始宽高比。缩放采用覆盖窗口及漂移余量的最大比例，避免横纵分别拉伸导致底角、颗粒和朱红边变形。横向以墨面顶部入场点为锚，纵向向上延伸 20px；横向至少留出两侧各 48px 的漂移余量。超出视口的部分自然裁切，宽屏不强行把底角全部塞进屏内。文字反色使用完全相同的映射，再补偿标题自身旋转与位移。

部署只依赖仓库中的 WebP 与轮廓数据。v2、v3 作为历史素材保留，前台不再读取。

## 最终校正提示词

输入 1 为最初确认的 UI 图，输入 2 为第一轮透明提取结果；通过内置工具编辑并要求真实透明背景。

```text
Use case: style-transfer. Asset: final transparent website ink background sprite. Input image 1 is the ORIGINAL approved UI and is the sole material reference. Input image 2 is the transparent extraction to EDIT. Keep image 2's transparent background, exact canvas, slab silhouette, position and framing. Make only one correction: match image 1's finer, much quieter print material, replacing image 2's exaggerated gritty finish. The interior is overwhelmingly dense warm charcoal (#24221d); most of its tiny irregular grain varies only 5–13 RGB levels, with very sparse brighter pinholes. Remove the conspicuous white/tan sandpaper speckles. Do not eliminate grain into perfectly flat digital paint. The edge is finely feathered ink with semitransparent pixels and slight low-amplitude erosion, never a thick grey/beige border, stitched seam, torn paper, coarse saw teeth or bright frayed chunks. Reduce the currently broad light grey rim to the delicate soft dry-print fringe visible in image 1, roughly 2–4 source pixels of transition, occasionally finer pale fibers. Retain a faint, broken vermilion misregistered impression just outside the two slanted SIDE edges, matching image 1: faded reddish-orange residue with irregular coverage and narrow pale gap, not an intense bright red glow or continuous smooth vector outline. Red is absent from nearly all of the lower diagonal edge. Black ink, grey feathering and red residual print remain together in this single raster image. Preserve genuine transparent alpha outside the impressions and through edge pinholes. No text, letters, UI, logo, project card, photos, shadow, paper background or checkerboard. Do not redraw the composition. Match the ORIGINAL reference's actual subtle pigment densities and edge softness.
```
