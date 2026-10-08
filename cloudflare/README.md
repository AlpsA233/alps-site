# 图片存储：R2 + 只读 Worker

Vercel 负责验证后台会话、压缩图片并写入 R2；浏览器直接从图片 Worker 读取，数据库只存 URL。R2 桶保持私有，Worker 只开放本项目生成的 `/media/<uuid>.webp`，不提供上传、列表或删除接口。草稿中的图片链接公开，草稿正文继续受发布状态保护。

没有域名时可使用 `workers.dev`。Cloudflare 将它定位于个人与兴趣项目，业务关键用途建议使用自有域名。[官方说明](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

## 成本

截至 2026-10-08，R2 **Standard** 每月含 10 GB-month 存储、100 万次 Class A、1000 万次 Class B，直接出口流量免费；超额分别为 $0.015/GB-month、$4.50/百万 Class A、$0.36/百万 Class B。开通需要有效支付方式，预算提醒只通知，不会封顶或自动暂停。[R2 定价](https://developers.cloudflare.com/r2/pricing/)、[开通要求](https://developers.cloudflare.com/r2/get-started/)、[预算提醒](https://developers.cloudflare.com/billing/manage/budget-alerts/)

Worker 保持 Free 计划，每天 10 万次请求，超过会返回限额错误；缓存命中也计入 Worker 请求数。示例启用 Workers Cache，并给图片设置一年不可变缓存；每张新图使用新 URL。[Workers 额度](https://developers.cloudflare.com/workers/platform/limits/)、[Workers Cache](https://developers.cloudflare.com/workers/cache/)

不要选择 Infrequent Access 或付费 Cloudflare Images。本方案适合个人站的小规模图片；R2 超额仍可能产生费用，不能当作零费用硬上限。

## 1. 创建桶

登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 **Storage & databases → R2 object storage → Overview**（菜单可能显示 R2）。如果尚未开通，核对 Standard 的免费额度与超额价格后，由你完成支付方式设置。

创建 Standard 桶，例如 `alps-media`，记录页面 Account Details 的 **Account ID** 与实际桶名。保留桶的私有状态，不启用 `r2.dev` 开发地址。[公共桶与开发地址说明](https://developers.cloudflare.com/r2/buckets/public-buckets/)

创建被 Git 忽略且不会被 Next.js 自动读取的 `.env.media.local`：

```dotenv
R2_ACCOUNT_ID=你的账户ID
R2_BUCKET=alps-media
R2_ACCESS_KEY_ID=稍后填写
R2_SECRET_ACCESS_KEY=稍后填写
MEDIA_PUBLIC_BASE_URL=稍后填写
```

## 2. 创建仅限该桶的密钥

R2 Overview → Account Details → **API Tokens → Manage** → 创建 API Token。权限选择 **Object Read & Write**，范围仅选刚才的桶。复制创建结果中的 **Access Key ID** 和 **Secret Access Key**，分别填入上面的两个变量；不要将显示的 Cloudflare API Token 填入 S3 密钥字段。Secret 只在创建时显示，妥善保存。[官方认证步骤](https://developers.cloudflare.com/r2/api/tokens/)

密钥只给 Vercel 服务端，Worker 使用原生 R2 binding，不需要这两项密钥。文件设置为仅当前用户可读写：`chmod 600 .env.media.local`。

## 3. 部署图片 Worker

在项目根目录运行：

```bash
npm run media:config -- worker-config
npx wrangler@latest login
npx wrangler@latest deploy --config cloudflare/wrangler.local.jsonc
```

第一条命令生成被 Git 忽略的配置，使用已记录的账户 ID、桶名、`MEDIA_BUCKET` binding 和缓存设置。默认 Worker 名为 `alps-media`；若账户里已有同名 Worker，先改用一个空闲名称：

```bash
npm run media:config -- worker-config --name alps-site-images
```

**部署会创建或更新配置中指定的 Worker**，运行前核对目标账户和名称，避免覆盖其他服务。浏览器登录授权需要你本人完成。[Wrangler 命令](https://developers.cloudflare.com/workers/wrangler/commands/)

将命令输出的 `https://你的Worker.你的子域.workers.dev` 根地址填入 `MEDIA_PUBLIC_BASE_URL`。不要填 R2 S3 地址，也不要加 `/media`、查询参数或图片文件名。

## 4. 校验与本地启用

```bash
npm run media:config -- validate
npm run media:config -- check
# 可选：仅合并 5 项图床变量，保留数据库与后台密码配置
npm run media:config -- local
```

`check` 只做 R2 小范围列举和 Worker `/health` 检查，不上传或删除图片；通过后仍需上传一次验证整个链路。`local` 执行后重启开发服务，环境变量和新增的数据库上传限速表才会初始化。上传未配置时，新按钮禁用，原有内置封面继续可选。

## 5. 配置 Vercel

```bash
npm run media:config -- clipboard
```

在 Vercel 项目 **Settings → Environment Variables** 中粘贴导入五项变量，配置到 Production，随后重新部署。不要给这些变量加 `NEXT_PUBLIC_` 前缀，也不要替换现有 Turso、密码与站点变量。完成后清空包含密钥的剪贴板：

```bash
npm run media:config -- clear-clipboard
```

若系统剪贴板不可用，在本机编辑器里打开 `.env.media.local` 手动复制。不要将文件内容发到聊天、日志或 Git。Preview 建议使用独立的桶与数据库，避免测试操作影响正式内容。Vercel 环境变量修改需要新部署才生效。[Vercel 环境变量](https://vercel.com/docs/environment-variables)

上线后登录后台，分别验证封面上传与比例裁剪、正文粘贴、保存刷新后内容保留、公开页图片加载。

## 上传行为与维护

- 原图支持 JPEG、PNG、WebP、AVIF，不支持 SVG/GIF；最多 20 MiB、3200 万像素。浏览器压缩为静态 WebP，动画源图经 Canvas 处理会变为静态图片。服务端对原始直传的动画文件拒绝处理。
- 封面提供 3:2、16:9、1:1、4:5；图片实际按选定比例裁剪。不同页面的封面容器仍可能二次裁切，主体建议留在中央。
- 请求限制在 4 MiB 内，以满足 Vercel Functions 4.5 MB 请求上限。服务端重新编码、清除 EXIF，输出最多 2 MiB；封面最长边 1800，正文 2200。[Vercel 限制](https://vercel.com/docs/functions/limitations)
- 编辑器每次可插入最多 5 张图片。临时占位符按唯一 ID 替换，支持继续输入、乱序完成、失败重试及取消。未完成或失败未移除时不能保存。
- 每 10 分钟全站管理员最多 30 次上传尝试，记录存于 SQLite/Turso，共享部署实例统一限速。
- 删除文章、取消编辑或更换封面不会自动删除 R2 对象，避免误删其他正文引用。偶尔在 R2 检查未引用对象与用量；删除后若需立即失效，还需清除 Cloudflare 缓存。
- 未来更换域名时，已有内容保存的是完整图片 URL。先保留旧 Worker 地址可访问，再迁移内容中的 URL，不能只改环境变量后关停旧地址。
