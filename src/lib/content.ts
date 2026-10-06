import { z } from "zod";

export const entrySchema = z.object({
  id: z.string().max(80).optional(),
  kind: z.enum(["project", "post"]),
  title: z.string().trim().min(1, "请填写标题").max(100),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "路径只能使用小写字母、数字和连字符")
    .max(100),
  subtitle: z.string().trim().max(140),
  category: z.string().trim().min(1, "请填写分类").max(40),
  year: z.string().regex(/^20\d{2}$/, "请填写四位年份"),
  summary: z.string().trim().min(1, "请填写摘要").max(600),
  body: z.string().trim().min(1, "请填写正文").max(50000),
  tags: z.string().trim().max(180),
  status: z.enum(["draft", "published"]),
  theme: z.enum(["lime", "ink", "paper"]),
  coverPath: z
    .union([
      z.literal(""),
      z
        .string()
        .max(300)
        .regex(
          /^\/images\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:avif|webp|png|jpe?g)$(?![\s\S])/,
          "封面需使用 /images/ 下的本地图片路径（WebP、PNG、JPEG 或 AVIF）",
        ),
    ])
    .default(""),
  coverAlt: z.string().trim().max(180).default(""),
  url: z.union([
    z.literal(""),
    z
      .url()
      .max(2000)
      .refine((v) => /^https?:\/\//.test(v), "链接必须使用 http 或 https"),
  ]),
});
export type EntryInput = z.infer<typeof entrySchema>;
export type Entry = EntryInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
export const contentCoverOptions = [
  {
    path: "/images/content/margin-v1.webp",
    label: "留白 · 阅读与纸张",
    alt: "窗边阅读桌上摊开的书与米色阅读器",
  },
  {
    path: "/images/content/field-notes-v1.webp",
    label: "Field Notes · 观察与记录",
    alt: "方格笔记本、压制蕨叶与黑色钢笔，旁边是笔记板",
  },
  {
    path: "/images/content/letters-from-the-mountain-v1.webp",
    label: "山间来信 · 旅途影像",
    alt: "黑白山脊、云层与穿过草地的步道",
  },
  {
    path: "/images/content/time-for-nothing-v1.webp",
    label: "无用的时间 · 日常片刻",
    alt: "午后阳光穿过树叶，在林间小径上投下斑驳影子",
  },
  {
    path: "/images/content/quiet-interfaces-v1.webp",
    label: "安静的界面 · 设计随记",
    alt: "米白色折纸与烟灰色半透明玻璃在自然光下叠放",
  },
  {
    path: "/images/content/start-small-v1.webp",
    label: "小工具 · 开发手记",
    alt: "黄铜折尺放在米色工作台上，旁边是方格草稿纸和深绿铅笔",
  },
] as const;
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(40),
  role: z.string().trim().min(1).max(100),
  headline: z.string().trim().min(1).max(160),
  intro: z.string().trim().min(1).max(800),
  about: z.string().trim().min(1).max(8000),
  email: z.email("请输入有效邮箱"),
  github: z
    .url()
    .max(2000)
    .refine((v) => /^https:\/\//.test(v), "请使用 https 链接"),
  location: z.string().trim().max(60),
  available: z.enum(["yes", "no"]),
});
export type Profile = z.infer<typeof profileSchema>;
export const defaultProfile: Profile = {
  name: "Alps",
  role: "独立开发者 / 设计爱好者",
  headline: "把好奇心，\n做成看得见的东西。",
  intro: "你好，我是 Alps。写代码，也观察生活。\n在这里，收藏作品，记录想法。",
  about:
    "我喜欢把复杂的问题，变成简单、顺手的体验。\n\n对我来说，开发是一种观察世界的方式。从一行代码、一个交互，到一个完整的产品，有趣的部分往往发生在技术与日常之间。\n\n这里是我的小小自留地。收集完成的作品，也记录那些暂时没有答案的思考。工作之外，我会走路、拍照，偶尔去山里，把注意力从屏幕上移开。\n\n如果你也在做有意思的事情，欢迎聊聊。",
  email: "hello@example.com",
  github: "https://github.com/AlpsA233",
  location: "中国 · 在线",
  available: "yes",
};
export const seedEntries: EntryInput[] = [
  {
    kind: "project",
    title: "留白",
    slug: "margin",
    subtitle: "一个安静的阅读空间",
    category: "产品设计 · 开发",
    year: "2026",
    summary:
      "把注意力还给文字。一个去掉冗余功能的阅读与收藏实验，让每次打开都更接近一本书。",
    body: "## 起点\n\n我们每天收集很多链接，却很少认真读完它们。我想做一个安静的地方，留下真正值得反复阅读的内容。\n\n## 设计选择\n\n让文章成为主角。没有信息流，没有提醒，只有舒服的字距、阅读进度和恰到好处的留白。\n\n## 实现\n\n使用 Next.js 构建，内容以 Markdown 保存。为窄屏重新安排阅读节奏，让桌面和手机都可以从容地读完一篇长文。\n\n> 好的工具，有时只是让你忘记工具本身。",
    tags: "Next.js, TypeScript, 阅读",
    status: "published",
    theme: "lime",
    coverPath: "/images/content/margin-v1.webp",
    coverAlt: contentCoverOptions[0].alt,
    url: "",
  },
  {
    kind: "project",
    title: "Field Notes",
    slug: "field-notes",
    subtitle: "给散落的想法，一个归处",
    category: "独立开发",
    year: "2026",
    summary:
      "一个轻量的个人笔记实验。让记录足够简单，让重新发现一条旧想法成为小小的惊喜。",
    body: "## 为什么做\n\n灵感很少按顺序出现。Field Notes 把短句、链接和零碎观察放在同一张桌面上。\n\n## 从记录到连接\n\n用标签替代层层文件夹，保留最少的编辑操作。搜索与时间线让旧记录仍然容易找到。\n\n## 技术\n\nTypeScript、React 与 SQLite。这个项目让我重新思考：一个工具做到多小，仍然能带来价值？",
    tags: "React, SQLite, 个人工具",
    status: "published",
    theme: "ink",
    coverPath: "/images/content/field-notes-v1.webp",
    coverAlt: contentCoverOptions[1].alt,
    url: "",
  },
  {
    kind: "project",
    title: "山间来信",
    slug: "letters-from-the-mountain",
    subtitle: "一场关于慢下来的影像实验",
    category: "视觉实验",
    year: "2025",
    summary:
      "把旅行中的照片与片段文字重新编排，做成可以在浏览器里翻阅的旅途手记。",
    body: "## 收集\n\n山里的时间有自己的刻度。风、云和几次停下来拍照的瞬间，构成这份手记。\n\n## 编排\n\n没有复杂的交互。用大幅照片和短段落留下呼吸的空间，让阅读跟着旅途慢下来。\n\n## 收获\n\n这是一次关于网页节奏的实验：画面、文字与空白之间，怎样形成自己的叙事。",
    tags: "摄影, Web, 叙事",
    status: "published",
    theme: "paper",
    coverPath: "/images/content/letters-from-the-mountain-v1.webp",
    coverAlt: contentCoverOptions[2].alt,
    url: "",
  },
  {
    kind: "post",
    title: "写代码之外，还需要一点无用的时间",
    slug: "time-for-nothing",
    subtitle: "",
    category: "日常观察",
    year: "2026",
    summary:
      "散步、发呆、看一朵云。那些没有产出的时刻，有时恰好让一个问题变得清楚。",
    body: "有一段时间，我习惯把每个空隙都填满。等待的时候看文档，走路的时候听播客，连休息也想找到一个理由。\n\n后来我发现，很多真正有用的想法，出现时我并没有在努力思考。\n\n## 给注意力一点余地\n\n当屏幕熄灭，问题并没有停止生长。它只是换了一种不那么紧绷的方式，慢慢找到连接。\n\n一次没有目的地的散步，可能比在桌前多坐半小时更有帮助。看到街边招牌上的字距，听到两个人聊天的节奏，都可能变成下一次设计里的细节。\n\n## 不必为所有时间命名\n\n我开始允许一天里有一些时间，没有清晰的成果。\n\n不是为了提高效率，也不需要证明它的价值。只是留一点空间，让生活自己发生。\n\n> 有些答案，需要你先离开问题。",
    tags: "生活, 注意力",
    status: "published",
    theme: "paper",
    coverPath: "/images/content/time-for-nothing-v1.webp",
    coverAlt: contentCoverOptions[3].alt,
    url: "",
  },
  {
    kind: "post",
    title: "好的界面，应该懂得何时保持安静",
    slug: "quiet-interfaces",
    subtitle: "",
    category: "设计随记",
    year: "2026",
    summary: "设计不总是添加。有时，把多余的东西拿走，才是最难也最值得的一步。",
    body: "我们很容易为一个界面加上新的按钮、提示和动效。每一个增加都有自己的理由，叠在一起却可能让原本简单的事情变得疲惫。\n\n## 先问一个问题\n\n用户此刻真正想做什么？如果一个元素无法帮助回答这个问题，它也许可以先退后一步。\n\n## 让重要的东西自然出现\n\n层级不只来自大小和颜色，也来自间距与节奏。一个足够清楚的页面，可以用更少的声音引导人。\n\n我喜欢那些使用之后几乎记不起界面的产品。任务完成得很自然，注意力留在了内容上。",
    tags: "设计, 界面",
    status: "published",
    theme: "paper",
    coverPath: "/images/content/quiet-interfaces-v1.webp",
    coverAlt: contentCoverOptions[4].alt,
    url: "",
  },
  {
    kind: "post",
    title: "从一个小工具开始",
    slug: "start-small",
    subtitle: "",
    category: "开发手记",
    year: "2025",
    summary:
      "不必等到一个完美的想法。为自己解决一个真实的小问题，就是很好的开始。",
    body: "最开始，只是想把每天重复的一件事变简单。\n\n我没有写很长的计划，先做了一个能用的版本。它很小，也不够精致，但在第一次真正解决问题的时候，我知道这个方向值得继续。\n\n## 让反馈来自使用\n\n用了几天，才发现哪些功能经常需要，哪些最初觉得必要的东西其实可以删掉。\n\n## 留下继续的余地\n\n小工具的好处是，可以在它变得庞大之前，理解它真正要服务的事情。\n\n做完比想完更有帮助。",
    tags: "开发, 独立产品",
    status: "published",
    theme: "paper",
    coverPath: "/images/content/start-small-v1.webp",
    coverAlt: contentCoverOptions[5].alt,
    url: "",
  },
];
export function readingTime(body: string) {
  return Math.max(1, Math.ceil(body.length / 450));
}
export function shortDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  });
}
