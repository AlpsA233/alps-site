# 个人站图片存储选型

核查日期：2026-10-08。范围：Next.js/Vercel 个人站的封面上传与比例裁剪、Markdown 粘贴图片后自动插入地址。以下只使用官方文档；建议与推论单独标明。

## 建议

**当前约束是图片允许公开、可以添加支付方式、暂时没有域名，建议 R2 Standard + 只读 Workers Free 的 `workers.dev` 出口。** 它无需先购买域名，官方将 `workers.dev` 定位为个人/兴趣项目入口；后续有域名可迁到自定义图片域名。R2 本身仍是按量订阅，需接受超额计费。若要求不添加支付方式、不承担超额账单，则推荐 Cloudinary Free；它比把 Git 仓库当图床更符合图片服务用途，但有共享额度和超额停用边界。

封面比例裁剪可以在浏览器完成再上传，正文图片可以在粘贴时压缩并上传；这两个交互本身不要求购买 Cloudflare Images。具体实现由站点代码负责，存储商负责收发文件。

## Cloudflare R2

| 项目 | 官方当前限制/价格 |
| --- | --- |
| Standard 免费存储 | 每月 10 GB-month；按账期每天的峰值容量取平均，不是每月重新获得 10 GB 可永久累积 |
| 免费操作 | 每月 Class A 100 万次；Class B 1000 万次 |
| 直接出网 | 免费；外接其他按量产品仍可产生费用 |
| 超额 Standard | 存储 $0.015/GB-month；A $4.50/百万次；B $0.36/百万次；计费单位向上取整 |
| 操作含义 | `PutObject`、`ListObjects` 属于 A；`GetObject`、`HeadObject` 属于 B；删除对象免费 |
| 存储类型 | 免费额度仅适用于 Standard，不适用于 Infrequent Access |

来源：[R2 Pricing](https://developers.cloudflare.com/r2/pricing/)（2026-10-01 更新）。

**支付与费用控制。** 开通 R2 要完成 subscription checkout；生成 R2 token 前也必须先 purchase R2。Cloudflare 购买产品要求有效的主要支付方式，接受银行卡、PayPal 等，不能准确表述为“只允许信用卡”。[R2 Get started](https://developers.cloudflare.com/r2/get-started/)、[R2 Authentication](https://developers.cloudflare.com/r2/api/tokens/)、[Create billing profile](https://developers.cloudflare.com/billing/get-started/create-billing-profile/)。

超出免费额度的用量自动计费；budget alerts 只发邮件，**不会暂停或限制使用**。本次查阅的 R2/计费文档未给出 R2 免费额度用完即停止的硬开关，因此不能以官方功能保证账单恒为 $0。限制管理员上传、压缩、缓存、控制总容量和观察用量能降低风险，但公开图片访问仍可能增加 B 类操作。[Usage-based billing](https://developers.cloudflare.com/billing/understand/usage-based-billing/)、[Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)。删除支付方式也不是止损方案：删除前须取消所有付费服务，有附加服务时必须留有支付方式。[Update billing information](https://developers.cloudflare.com/billing/get-started/update-billing-info/)。

**公开交付。** `r2.dev` 是开发测试入口，限流可变（官方描述为每秒数百请求量级），超限返回 429，吞吐量也可能受限；它不支持缓存、WAF、访问控制和 bot management。生产应绑定自定义域名；不要自行将 CNAME 指向 `r2.dev`，官方不支持这种路径，也不保证可靠性和性能。[R2 Limits](https://developers.cloudflare.com/r2/platform/limits/)、[Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)。

自定义域名的 zone 必须在同一 Cloudflare 账号内。免费/Pro 的 DNS 接入只有完整接入（Cloudflare 做权威 DNS），保留原 DNS 的 partial/CNAME 接入仅 Business/Enterprise 提供。因此，零额外 DNS 费用的通常路径是将现有域名的 nameservers 切到 Cloudflare，再连接 `images.<现有域名>`；域名本身仍有注册成本。[Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)、[Primary setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/)、[Partial setup](https://developers.cloudflare.com/dns/zone-setups/partial-setup/)。

**公开草稿与私有存储。** bucket 默认私有；启用公共域名后对象可以通过互联网访问，根目录不能列举对象并不等于保密。随机文件名或草稿文章未发布也不等于私有。若草稿图片允许公开，直接保存稳定公共 URL 最简单；若不允许，应保持草稿 bucket 私有，用管理员鉴权代理或临时 GET 地址预览，发布时复制到公开 bucket，并把文章内地址改为公开地址。这是由官方访问机制得出的实现建议。[Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)。

**凭据与上传。** 长期 Access Key/Secret 只放服务端；推荐只授权目标 bucket 的 Object Read & Write。可由已鉴权服务端上传，或签发短时 PUT URL 给浏览器直传。预签名 URL 本身是持有者令牌，可重复使用至到期；需要限制 MIME、配置 CORS，并校验图片内容与大小。预签名 URL 仅支持 S3 endpoint，不能用于公共自定义域名；不可把会到期的 GET URL永久写入 Markdown。[R2 Authentication](https://developers.cloudflare.com/r2/api/tokens/)、[Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)。

## 暂无域名：R2 + Workers Free

Worker 可以通过 R2 binding 读取 bucket，使用 `https://<worker>.<account>.workers.dev/<object-key>` 提供公共 URL，无需购买或接入域名。官方建议重要的生产服务使用 custom domain/route，但明确 `workers.dev` 可用于非关键的个人或兴趣项目；它与仅用于测试的 `r2.dev` 定位不同。[workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)、[R2 Workers API](https://developers.cloudflare.com/r2/get-started/workers-api/)。

Workers Free 为账号每天 100000 次请求（UTC 午夜重置）、每次 10 ms CPU，超出日请求额度返回 1027，不自动按 Workers Paid 收费；Paid 是另行订阅的最低 $5/月计划。Workers 无额外出网/带宽费。R2 binding 不是免除 R2 计量：读取对象仍用 R2 的 Class B 额度，存储和上传仍按 R2 表格计算。10 ms 是 CPU 时间，不包含等待网络的时间；只读流式返回适合这个限制，裁剪压缩放在浏览器/上传端。[Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)、[Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)、[R2 Pricing](https://developers.cloudflare.com/r2/pricing/)。

**缓存应使用当前文档。** 2026-10-03 更新的 Workers Cache 明确支持 `workers.dev`，配置 `cache.enabled` 后按响应 `Cache-Control` 缓存；缓存命中不执行 Worker，也不读取 R2，但仍计 Workers 请求。没有额外缓存价格，仍受 Workers Free 请求额度约束。它和在 Worker 内手工操作的 Cache API 是不同机制。旧 R2 Cache API 示例仍写 `workers.dev` 的 `caches.default` 不生效，故不应照抄该旧示例声称获得边缘缓存。[Workers Cache](https://developers.cloudflare.com/workers/cache/)、[旧 R2 Cache API 示例](https://developers.cloudflare.com/r2/examples/cache-api/)。

实现建议：R2 bucket 保持未直接公开，只读 Worker 仅允许 GET/HEAD，不提供匿名写入、删除、列举或任意外部 URL 代理；上传继续经 Vercel 已认证后台的服务端 S3 凭据完成。媒体对象使用不可变的随机 key，返回正确 MIME、ETag 与长期 `Cache-Control`。这表示 bucket 私有但指定图片通过 Worker 公开，符合“图片可公开”的产品边界；不应将其表述为图片访问也私有。保持 Worker/account 名称稳定，否则 `workers.dev` 图片地址会改变。[R2 Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)、[workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)。

### Vercel 自身图片代理备选

Next.js `/api/media` 也可以服务端读 R2 并公开返回图片，但会使用 Vercel 的图像交付额度。Hobby 当前包括 100 GB Fast Data Transfer、10 GB Fast Origin Transfer、100 万 CDN requests、100 万 Function invocations，以及 Fluid compute 的 4 CPU 小时、360 GB·小时内存。CDN 命中可省函数和 R2 读取，仍计浏览器传输与 CDN 请求；未命中另外计函数、来源传输和计算。[Hobby](https://vercel.com/docs/plans/hobby)、[CDN usage](https://vercel.com/docs/manage-cdn-usage)、[Function usage and pricing](https://vercel.com/docs/functions/usage-and-pricing)。

函数响应需要显式 CDN 缓存头；普通函数请求/响应 body 上限 4.5 MB，CDN 可缓存的更高上限不等于函数允许返回更大图片。Hobby 超额不自动付费扩容，通常须等待额度恢复。[Cache-Control headers](https://vercel.com/docs/caching/cache-control-headers)、[Function limits](https://vercel.com/docs/functions/limitations#request-body-size)、[Hobby billing cycle](https://vercel.com/docs/plans/hobby#hobby-billing-cycle)。

因此推荐浏览器直接读取 Workers 图片 URL；若再次经 Vercel `/api/media` 或 Next/Image 默认优化路径交付，仍会消耗对应 Vercel 额度。使用 Next/Image 时可选择 `unoptimized`，或使用普通 `<img>`；这属于实现建议。[Vercel Image Optimization](https://vercel.com/docs/image-optimization)。

## 不要混淆 Cloudflare Images

Cloudflare Images Free 只提供对外部原图（例如 R2）的每月 5000 个独特变换；超过后新变换报错而不收费。**将原图直接存进 Images 仅 Paid 提供**：$5/10 万张存储/月、$1/10 万次交付/月；Paid 外部图片变换超过 5000 后 $0.50/1000 个/月。本项目可以只用 R2 + 上传前裁剪/压缩，避免增加 Images 产品。[Images Pricing](https://developers.cloudflare.com/images/pricing/)（2026-07-08 更新）。

## GitHub 独立公开图片仓库

小流量个人站可以通过已鉴权服务端向独立公开仓库提交图片；但官方条款允许对显著过量带宽限流、暂停账号，或提前通知后删除造成负担的仓库。没有查到 `raw.githubusercontent.com` 作为免费图床的可用性 SLA；条款也不保证任意时点/地区可访问。因此它适合作为小规模备选，不能许诺稳定 CDN。[Acceptable Use §9](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies#9-excessive-bandwidth-use)、[Terms of Service §N](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#n-disclaimer-of-warranties)。

普通 Git 文件超过 100 MiB 被阻止；仓库理想小于 1 GB、强烈建议小于 5 GB。这些是仓库建议，不是额外图床免费配额。新上传不断增加提交历史，也增加将来清理或迁移的成本（实现推论）。[About large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)。

Contents API PUT 需 Base64 文件和提交消息；更新需旧 blob SHA，fine-grained PAT 需 Contents: write。官方指出返回的 `download_url` 会过期，不可直接当永久媒体地址；可基于返回的 commit SHA 构造固定版本地址并保存媒体记录（实现建议）。注意该页 1–100 MB 的分段行为描述的是 GET 读取能力，不能误当成 PUT 明确配额。[Contents API](https://docs.github.com/en/rest/repos/contents)、[Permanent links](https://docs.github.com/en/repositories/working-with-files/using-files/getting-permanent-links-to-files)。

PAT REST API 通常每小时 5000 次；创建内容通常还受每分钟 80 次、每小时 500 次的二级限制，也可能有更低或未公开限流。这些 API 限额不能套用于 raw 文件下载。PAT 只保存在 Vercel 服务端，限定目标仓库权限，浏览器通过已认证上传接口调用，禁止把 PAT 放进公开前端变量。[REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)、[Keep API credentials secure](https://docs.github.com/en/rest/authentication/keeping-your-api-credentials-secure)。

公开图片仓库中的草稿图片同样公开；将正文草稿保存在私有数据库不会改变图片仓库的权限。

## 免绑卡备选：Cloudinary Free

Image & Video APIs Free 为 $0，注册无需信用卡，提供 25 credits。**25 credits 是存储、图片流量、转换的共享总额度**：1 credit = 1 GB 存储，或 1 GB 图片交付流量，或 1000 次转换；三种消耗会相加。例如 2 GB 存储 + 20 GB 流量 + 1000 次转换 = 23 credits，而不是各自都有 25 GB/25000 次额度。[Cloudinary Pricing](https://cloudinary.com/pricing)、[Billing and plans — Credits](https://cloudinary.com/documentation/billing_and_plans#credits_free_plan_and_self_service_paid_plans)。

免费计划的转换与流量使用滚动 30 天窗口，不在自然月第一天清零；存储按当前总量计（包含衍生图片等）。超额会收到警告和反复升级通知；不采取措施最终会自动停用，可能影响图片交付，不能保证免费计划永不停止服务。[Billing and plans](https://cloudinary.com/documentation/billing_and_plans#when_you_exceed_your_plan_limits)。

默认 `upload` delivery type 上传后可通过公开 CDN 访问，随机 ID 只能让地址更难猜，不能防访问。私密草稿若选择 Cloudinary，须使用适当的 authenticated delivery/服务端签名设计；仅 `private` 类型还不够保护公开的衍生图。长期 API secret 仍只放服务端。[Media access control](https://cloudinary.com/documentation/control_access_to_media)。

## 当前实现边界

- 接受添加支付方式，暂不购买域名：先用 R2 + Workers Free，保持 Workers Free 计划与 R2 Standard 存储类型。
- 草稿图片允许任何拿到 URL 的人访问：可直接把公共图片 URL 写入 Markdown，无需私密草稿复制发布流程。

以上均不要求把 Vercel 站点迁走。上传路由、文件验证、封面裁剪和编辑器粘贴行为属于后续代码改动；本笔记未修改源码、凭据或部署配置。
