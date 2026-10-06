# Alps · Personal Space

一个基于 **Next.js 16.3.8 / React 19.3 / TypeScript / SQLite（本地）与 Turso libSQL（云端）** 的个人网站，带可直接使用的单人内容后台，可部署到 Vercel。

视觉采用实验编辑与拼贴排版：奶油白 `#f5f0e7`、朱红 `#e6462d` 和墨黑 `#211f1a`，以巨幅无衬线文字、错位卡片、细线和手写批注建立节奏。Manrope 用于拉丁正文与大字，Cormorant Garamond 用于少量展示文字，中文使用系统字体，Caveat 用于手写批注。字体随项目本地打包，不依赖 Google Fonts 网络请求。

首页从奶油白海报首屏开始：站名字母与朱红折纸拼贴物件叠放，随后进入斜向文字带、滚动显墨宣言、墨黑背景的作品卡片堆叠、文章索引和个人介绍。固定导航采用紧密 ALPS 字标与四瓣折纸标记，朱红联系页尾以“LET’S / MAKE / SOMETHING.”收尾。作品与文字目录采用不同的互动展览形式：巨幅 WORK 字母与可旋转封面拼贴、SIDE NOTES 字母与可展开的朱红刊物。关于和详情页统一品牌与配色，后台内容管理功能保留。

首页透明拼贴素材位于 `public/images/studio/`，生成提示与导出说明见 [`public/images/studio/PROMPTS.md`](public/images/studio/PROMPTS.md)。六张作品、文字封面保存在 `public/images/content/`，均为本地 WebP。

## 本地运行

使用最新 Node 22 LTS；项目通过 `engines.node=22.x` 固定构建与运行版本。本地 libSQL 与迁移工具包含原生 Node 模块，应在实际运行系统安装依赖。Vercel 在线请求通过 `@libsql/client/web` 连接远程数据库。

```bash
npm install
npm run admin:setup
npm run dev
```

- 前台：http://127.0.0.1:3000
- 后台：http://127.0.0.1:3000/admin
- 初始密码：查看本机 `data/admin-access.txt`。首次交付已完成初始化，无需再次初始化即可登录。

`admin:setup` 生成高强度随机密码，scrypt 哈希写入 `.env.local`。如要指定自己的密码（至少 12 个字符），可通过环境变量 `ALPS_ADMIN_PASSWORD` 调用这个命令；不要把密码提交到 Git。确认记录密码后可以删除 `data/admin-access.txt`。重新运行初始化会修改密码并使旧会话失效；运行中的服务需要重启。

若 3000 端口已占用：`npm run dev -- --port 3001`。

## 已实现

- 首页、作品集、作品详情、文章列表、文章详情、关于页。
- 响应式桌面与移动布局，手机导航，键盘焦点与减少动态效果支持。
- 后台密码登录、总览、作品和文章的新建/修改/删除、草稿与发布。
- Markdown 正文编辑和实时预览。
- 文字文章与后台文章预览共享手稿式 Markdown；作品详情及作品预览保留普通排版。`/reading-lab` 提供独立阅读样张和可展开的 Markdown 源码，不修改文章内容，也不进入 sitemap。
- 作品与文章可选择六张原创封面、编辑图片说明或移除封面，所选封面保存到 SQLite。
- 首页首屏的朱红拼贴物件支持鼠标拖动旋转、点击旋转与左右方向键 / Home 复位；平滑指针位移与旋转惯性使用带时间修正的阻尼。滚动控制站名字母展开、抬升与物件姿态。
- 首页宣言随滚动逐句加深墨色；精选作品采用带缩放的 sticky 卡片堆叠，手机改为纵向卡片。
- `/work` 作品目录使用双列封面网格，手机为单列；支持关键词、分类、年份筛选及新旧顺序。SQLite 在服务端筛选、计数并每页取 12 条，网址保留条件，分页支持浏览器返回。分类和年份选项来自全部已发布作品；草稿和文章不进入目录或筛选统计。
- 作品目录首屏展示当前页最多三张公开封面的拼贴装置，可点击旋转、鼠标拖动与惯性释放，左右方向键调整、Home 复位。索引的纸框封面随指针倾斜，编号展签与图片在悬停和聚焦时回应；大标题、摘要和详情入口持续可见。
- `/writing` 以可展开的朱红刊物开场，扉页展示当前筛选页最多三篇真实文章入口。原生 `details/summary` 支持键盘、触屏和无 JavaScript，关闭装饰动效后仍可展开。下方大编号索引保留标题、摘要、封面、关键词/分类/年份/顺序筛选与每页 10 条分页。
- 标题按行从遮罩中露出，详情正文保持正常阅读。作品和文章保留系统指针，不显示跟随指针的文字提示。
- 首页文章索引在桌面鼠标悬停或键盘聚焦时显示倾斜封面预览；关于区使用四瓣折纸图形、大字号与手写批注。
- 首页提供动效开关；系统减少动态效果、离屏和页面隐藏时有相应降级与暂停处理。
- 前台内部页面切换使用朱红整页遮罩与四瓣折纸品牌标记；保持 Next 链接、站内锚点、外链和修饰键打开新标签的行为。
- 可编辑的站名、身份、首页标题/简介、关于正文、邮箱、GitHub、地点和合作状态。
- SQLite 持久保存；草稿不进入前台、详情路由或 sitemap。
- 服务端校验、同源 Server Actions、受保护页面及每个写入动作独立验证登录状态。
- scrypt 密码校验、数据库会话、HttpOnly / SameSite=Strict Cookie、7 天会话期限、退出撤销、密码修改后会话失效。
- 登录限速：单管理员入口每 10 分钟最多 8 次尝试，成功登录后清除累计次数。
- 页面标题、描述、favicon、robots 与动态 sitemap；后台禁止搜索引擎索引。

所有示例作品、文章、简介均为可替换的演示内容，不代表真实项目履历。邮箱 `hello@example.com` 是占位值，应在后台“个人资料”中替换。项目链接留空时前台不会显示“访问项目”。

## 动效与降级

首页动效围绕拼贴物件和排版展开：指针位置驱动物件轻微位移，拖动与点击驱动旋转，滚动驱动字母展开、宣言显墨、作品卡片缩放，以及文章标题与品牌图形的位移和旋转。文字带与物件浮动只在相应区域可见时循环。页面右下角的开关可暂停首页交互与循环动效。

实现使用 CSS 变换、原生 Web Animations API、`requestAnimationFrame` 与观察器，没有 WebGL 或额外动效依赖。鼠标拖动和指针视差只对精细鼠标指针启用；触屏保留原生纵向滚动与点击，窄屏不使用首屏滚动展开和作品 sticky 堆叠。系统开启“减少动态效果”时跳过首页动效、标题入场与页面遮罩，内容和导航仍可直接使用。页面隐藏时停止动画帧与循环；组件卸载时清理观察器、动画和事件监听。

作品与文字目录共享 `ArchiveMotion`：用滚动进度编排装饰文字和封面，用精细指针控制封面倾斜，作品拼贴使用带时间修正的旋转惯性。循环字带仅在可见时运行，两页都有独立动效开关；减少动效或暂停时停用旋转装置与装饰动画，保留原生刊物展开、搜索、分页和详情链接。服务端负责目录数据与筛选，客户端只增强展示与交互。

## 品牌图片与雪碧图

`public/brand/` 提供原创四瓣折纸标记、紧密大写 ALPS 粗无衬线路径字标、方形排版徽标、抽象分隔图形和 10 个配套图标。前台与后台通过 `src/components/brand.tsx` 统一引用 SVG 雪碧图；另有透明 PNG 雪碧图的 1x / 2x 版本与对应 CSS。部分文件名保留旧名称以兼容组件 API，实际图形已采用新品牌。

查看素材说明：`public/brand/README.md`。运行 `npm run brand:generate` 可从源文件重新导出整套素材及 favicon。浏览器访问 `/brand/preview.svg` 可查看品牌版面。

## 作品与文字封面

后台的作品、文章编辑页都有“封面图片”下拉选择与预览，可修改“图片说明”，选择“不使用封面”可恢复纯文字版式。六张封面的母题分别是阅读桌、植物笔记、黑白山径、午后小路、折纸与玻璃、手工尺与草稿；每张为 1400×933 WebP，由内置图像生成工具单独生成。

现有数据库首次应用 `content-covers-v1` 迁移时，只为标题仍与示例一致且完全没有封面字段的旧示例补齐封面。已经编辑的内容、明确选择的空封面与更新时间会保留。迁移只执行一次；升级前的本地数据库备份位于 `data/backups/`。

## 文章的 Markdown 样式

使用普通 Markdown 写作即可，文章正文和后台文章实时预览统一呈现这些效果：

- `~~旧想法~~`：内容模糊保留在行内。鼠标经过或键盘聚焦时揭示；点击文字显示约 5 秒，眼睛按钮或 Escape 可收起。支持跨行、手机点击和标记内的链接，无 JavaScript 时显示普通删除线，打印时也保持可读。
- `**重点**`：略微放大字号、加深墨色；`*轻轻强调*`：淡色铅笔划线。
- `> 旁注`：细线和页边批注式引用；`---`：四瓣折纸品牌分隔标记；有序列表使用页码式编号。
- 代码块保留等宽字体、语言标签和局部横向滚动；图片使用纸边及图片说明。
- 支持 GFM 表格、任务列表和 `[^note]` 脚注。手机表格在自身区域横向滚动，脚注可跳转和返回正文。

效果不依赖原始 HTML；Markdown 中的原始 HTML 保持文本呈现，链接仍使用默认安全 URL 处理。正文持续保留正常的文字选择和系统指针。

## 数据与备份

本地默认数据库：`data/alps.sqlite`，首次访问时创建并写入一次示例数据。清空内容后不会自动重新填充。SQLite 采用 WAL；数据目录、所有真实环境文件与初始凭据文件都被 Git 忽略。

自行托管、并配有持久磁盘时，可在 `.env.local` 设置：

```dotenv
DATABASE_PATH=/absolute/path/to/persistent-data/alps.sqlite
NEXT_PUBLIC_SITE_URL=https://your-domain.example
COOKIE_SECURE=true
```

请用 SQLite 自带的备份功能做在线备份，或者在服务停止后复制整个数据目录。不要只复制正在写入的 `.sqlite` 而遗漏 WAL。更新程序不需要删除数据库。

## 部署到 Vercel + Turso

Vercel 运行 Next.js 页面和后台 Server Actions；Turso 持久保存个人资料、作品、文章、登录会话和登录限流记录。`public/` 下现有图片与 Logo 随源码部署，不需要额外对象存储。尚未提供用户上传功能；将来增加上传时应再接入对象存储。

数据库使用 **Turso Cloud 的 libSQL 引擎**，与 `@libsql/client` 兼容。若通过 CLI 创建，使用 `turso db create alps-site`，不加 `--tursodb`。也可使用 [Vercel Marketplace 的 Turso Cloud](https://vercel.com/marketplace/tursocloud) 集成。引擎区别见 [Turso 官方快速开始](https://docs.turso.tech/quickstart)，远程驱动选择见 [Turso 的 Vercel 部署说明](https://docs.turso.tech/integrations/vercel)。

1. 创建一个空的 libSQL 数据库，取得连接地址与**读写 Token**。先迁移，再部署网站，避免首次访问写入示例内容占用目标数据库。
2. 在本地准备独立的 `.env.deploy.local`，填写下表变量。它不影响开发服务的 `.env.local`，也不会提交到 Git。辅助工具会校验配置、复用现有后台密码哈希，并可将部署变量复制到剪贴板。
3. 运行迁移预检；确认后执行正式迁移。工具会先以 SQLite 在线备份方式保存源数据库快照，再事务导入个人资料、内容和迁移记录，保留 ID、发布时间、草稿、封面与 Markdown。不会迁移旧登录会话或登录尝试。完整读回校验，目标存在其他内容时拒绝覆盖。
4. 将源码提交到你自己的 GitHub 仓库，在 [Vercel 新项目](https://vercel.com/new) 导入。Framework 选 Next.js，Root Directory 是项目根目录，Node 是 22.x；安装和构建使用默认设置。环境变量至少配置到 Production，首次部署前保存。
5. 上线后访问首页、目录、详情与 `/admin`，验证编辑内容在刷新后仍保留。将正式 HTTPS 域名填入 `NEXT_PUBLIC_SITE_URL`，环境变量更新后重新部署。没有填写站点地址时，应用使用 Vercel 提供的生产域名生成 sitemap 和 metadata。

| 变量                   | 来源 / 用途                                        |
| ---------------------- | -------------------------------------------------- |
| `TURSO_DATABASE_URL`   | Turso 的 `libsql://...` 或 `https://...` 连接地址  |
| `TURSO_AUTH_TOKEN`     | Turso 读写 Token，仅服务端使用                     |
| `ADMIN_PASSWORD_HASH`  | 复用 `.env.local` 的 scrypt 哈希，后台仍使用原密码 |
| `COOKIE_SECURE`        | `true`，正式后台通过 HTTPS 访问                    |
| `NEXT_PUBLIC_SITE_URL` | 正式 HTTPS 网址；首次部署可先省略                  |

不要在 Vercel 配置本地 `DATABASE_PATH`。检测到 Vercel 环境但缺少 Turso 配置时，应用会明确报错，避免把内容写进临时文件。数据库 Token 和密码哈希不能使用 `NEXT_PUBLIC_` 前缀。

Preview 环境如需可用，应连接**另一个测试数据库**并设置独立后台密码，避免预览中的编辑操作修改正式数据。本地开发默认保留 SQLite。Vercel 改动环境变量需要新部署才能生效，参见 [官方环境变量说明](https://vercel.com/docs/environment-variables)。

迁移默认预检，只有 `--apply` 会写入目标数据库：

```bash
npm run deploy:migrate -- --dry-run
npm run deploy:migrate -- --apply
```

配置与迁移脚本均从 `.env.deploy.local` 读取云端连接信息。不要通过聊天或源码提交 Token；迁移备份保存在被忽略的 `data/backups/` 中。

## 生产运行

```bash
npm run build
npm run start
```

默认只监听 `127.0.0.1`。自行托管时，可采用单个 Node 服务加 HTTPS 反向代理，把 SQLite 数据放在持久目录或挂载的持久卷里，保留 `.env.local`。Vercel 等 Serverless 环境使用上面的 Turso 方案；不要让多个实例共享本地 SQLite 文件。

生产模式默认使用 Secure Cookie，所以后台应通过 HTTPS 访问。只在本机验证生产构建时，可临时设置 `COOKIE_SECURE=false`；正式上线保持 true。

## 验证

```bash
npm run typecheck
npm test
npm run build
```

需要同时保留开发预览并验证生产构建时，可运行 `ALPS_BUILD_DIR=.next-verify npm run build`；隔离构建目录避免覆盖正在使用的 `.next`。验证构建若需启动，也应使用相同的 `ALPS_BUILD_DIR`。

测试覆盖会话伪造/过期/撤销/密码轮换、登录限速恢复、密码校验、危险 URL 和输入校验、初始化保留现有环境文件，以及封面路径校验、旧数据库迁移和封面持久化。作品与文字目录另有多页数据、稳定排序、组合筛选、字面特殊字符、参数规范化和草稿隔离测试。Markdown 回归直接渲染实际组件，覆盖两种排版的隔离、删除标记的服务端降级、表格/任务/脚注、代码标签和不安全内容。浏览器验收应另行检查首页拼贴物件、滚动排版、文章封面预览和动效开关，以及后台内容操作、目录搜索/清除/翻页/返回、Markdown 揭示与脚注跳转、键盘焦点与移动端显示。

## 目录

```text
src/app/(site)/   前台路由
src/app/admin/    后台路由与样式
src/components/  页面与表单组件
src/lib/         数据访问、输入校验、会话与服务端动作
public/          本地字体包以外的静态素材、图标
scripts/         后台初始化、部署配置与迁移
tests/          安全与初始化回归测试
data/           运行期数据（Git 忽略）
```

依赖版本依据 npm registry 与 [Next.js 官方 2026 年 9 月安全更新](https://nextjs.org/blog/september-2026-security-release)核对。认证与 Server Actions 实现参考 [官方认证文档](https://nextjs.org/docs/app/guides/authentication)、[数据安全文档](https://nextjs.org/docs/app/guides/data-security)。
