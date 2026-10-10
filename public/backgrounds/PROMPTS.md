# 印刷背景素材

`print-plate-v2.webp` 是使用内置 `image_gen` 工具生成的透明位图，经无损 WebP 编码后供前台使用。生成时以此前确认的 UI 原型作为编辑参照，提取墨面，清除文字、导航和作品卡片。它负责真实的颗粒与墨层变化。

`src/components/print-plate-v2.json` 保存由同一张图的 alpha 通道提取的外轮廓，忽略内部缺墨孔。背景裁切、朱红错位边和文字反色共享该轮廓。每帧仅做位移与坐标投影，不重新采样或生成材质。深色模式使用相同素材和轮廓，调整墨层颜色映射。

素材和轮廓共同延伸到视口外：横向各 48px、纵向各 20px，覆盖缓慢漂移的范围，避免图片裁切边滑入屏内。该余量固定为屏幕像素，缩窄桌面窗口时也保持一致。

朱红线单独绘制为 0.7px 的断续细线，错位约 2px；这样缩放后仍保持极细，不把整张 UI 烘焙进背景。原始 PNG 留在本机生成目录，网站部署只依赖仓库里的 WebP 和轮廓数据。

## 最终编辑提示词

```text
Use case: background-extraction. Edit target: the attached original UI design reference. Produce ONLY its black diagonal printmaking background slab on genuine transparent alpha, as a production background sprite. Remove ALL website elements: ALPS logo, navigation, WORK lettering including its white parts, red dot, all copy, arrows, red project card and photographs, horizontal rules and black footer ticker. Remove the cream-paper background to transparency. Preserve the ORIGINAL ink slab's exact placement, diagonal angles, silhouette and proportions in this same image canvas: black ink enters through the top near 44% of canvas width, extends past the top/right image edges, has a small softly rounded lower-left turn at approximately 31% width and 39% height, then a straight diagonal lower edge toward the lower right at approximately 69% width and 65% height; the right boundary runs diagonally from beyond the upper-right down toward that lower-right end. Preserve the broad slanted shape visible in the reference; do NOT replace it with a rectangle or a long vertical rounded patch. Fill any areas occupied by removed white lettering and project imagery with the matching dense matte charcoal ink, continuing the original fine natural print grain. Texture must closely match the original reference: fine, low-contrast ink pinholes and delicate dry-print irregularity. Edges have VERY fine fiber fuzz and 1-2 pixel print erosion, no deep notches, triangular saw teeth, torn-paper chunks, fabric, leather, large scratches, smoke, blur or shadows. Remove the red registration stripe from the output asset, since an ultra-fine red edge will be composited separately. Maintain high coverage dense warm charcoal #25231f in the interior. Keep exact composition and scale of the reference slab, including its intersection with the top/right canvas borders; do not introduce margins, objects or new design. The result should be a flat isolated ink impression on truly transparent background, not a complete UI, not a visible black or checkerboard backdrop.
```
