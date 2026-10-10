# 印刷背景素材

当前前台使用 `print-plate-v3.webp`，由内置 `image_gen` 工具编辑 v2 印版生成，并经无损 WebP 编码保存。保留原来的斜向印版构图，把明显亮斑、粗颗粒和破口改为低对比的微细墨纹。实际素材为 1422×1106；它负责真实的墨层变化。

`src/components/print-plate-v3.json` 保存由该图 alpha 通道提取的外轮廓。仅用于提取轮廓的 mask 做一次 3×3 中值处理，使用 alpha 128 的边界，再按 1 源像素误差简化；图片本身不做平滑或重绘。轮廓没有急角或回折。背景裁切、朱红错位边和文字反色共享该轮廓。每帧只做位移与坐标投影，不重新生成材质。深色模式使用同一素材与轮廓进行静态颜色映射。

素材和轮廓共同延伸到视口外：横向各 48px、纵向各 20px，覆盖缓慢漂移的范围，避免图片裁切边滑入屏内。该余量固定为屏幕像素，缩窄桌面窗口时也保持一致。

朱红线采用 0.5px 连续细线、圆角连接，错位固定为屏幕坐标 (-0.75px, +0.9px)，避免缩放后出现尖刺和脏厚边。纹理以 72% 强度叠加到稳定墨底，保留细节而不抢眼。原始 PNG 留在本机生成目录，部署只依赖仓库里的 WebP 与轮廓数据。v2 作为历史素材保留，前台不再读取。

## 最终编辑提示词

```text
Use case: precise-object-edit. Edit target: the referenced isolated diagonal charcoal ink slab. Make a refined production-grade high-resolution transparent bitmap for a premium editorial website. Keep its SAME canvas proportions, overall diagonal silhouette, position, rounded lower-left turn and top/right cropped boundaries. The image has NO text, UI, red stripe, photographs, objects, shadow or backdrop. The current material looks coarse, distressed and fabric-like: REPLACE that surface with dense warm-black fine lithographic ink, almost uniform matte #26231f, with extremely subtle stochastic micro-grain in a narrow 2–4 RGB-level range. Remove all pale speckle clusters, scratches, streaks, cloudy mottling, torn-paper chunks, thread/fibers and obvious holes. The ink should feel like a freshly printed high-end art catalogue on smooth uncoated paper, not sandpaper, leather or worn cloth. Refine the outer boundary into a calm straight diagonal, with a smoothly rounded bend; preserve only barely perceptible organic ink edge variation, at most 1–2 source pixels. No sawteeth, triangular dents, deep notches, splintered projections or fringes. Use precise antialiased alpha with a 1-pixel transition, and a fully opaque dense interior. Do NOT add a grey fringe, white halo, embossing, glow, blur or transparency within the main ink body. Preserve true transparent alpha outside the slab. Prioritize impeccable macro/micro edge quality: at normal website display size the silhouette is crisp and quiet; at 200% zoom the edge still looks fine, without large pixel chunks or angular tears. Deliver approximately 3072px wide or higher with matching reference aspect ratio, with genuine additional fine detail, not a visibly enlarged low-resolution image. Change only texture and edge refinement, preserve the reference silhouette/composition.
```
