# TeachInPublic

Open-source online PPT, with course access under your control.

MIT-licensed, self-hosted software for bilingual teaching, course access approval, discussions, notes and time-limited reading links. Optional [managed hosting](https://training.seii.top/) is a separate service; self-hosted installations have no hosting subscription requirement. Dependencies retain their own licenses.

## Start

Node.js 24 is required.

    npm ci
    npm start

The default listener is http://127.0.0.1:3140. Open /admin to sign in. On first startup, initial administrator credentials are written to runtime/admin-access.txt; keep this file private. Runtime data is excluded from Git.

A new installation contains no courses or teaching materials. Create a course in the administrator console, choose its access code, upload Chinese and English Markdown files, review the draft, then publish explicitly. Uploading never publishes automatically. Course codes select a course; they do not bypass identity verification or access approval.

## Materials and teaching

Materials belong to the deployment operator and are uploaded after installation. This repository contains no customer curriculum, internal document paths or product teaching content. See [Markdown format](MARKDOWN_FORMAT.md) for the upload contract and [user guide](USER_GUIDE.md) for classroom workflows.

Chinese and English pages use matching stable IDs. Business versions and content revisions are independent. Replacing a draft, publishing a revision or reorganizing pages preserves prior learning records. Notes, questions and annotations remain associated with their original pages.

The classroom includes a resizable presentation workspace, independent browser tabs, full-window Mermaid diagrams and a mobile layout. External sites may disallow embedding; open them in a separate window in that case.

## Access and collaboration

Administrators configure course permissions, instructors, user security resets, sharing permissions and publication. Learners can discuss, annotate, attach compressed images and keep private notes. Visibility rules apply to replies, attachments, exports and pinned discussions.

Shared reading links have bounded lifetimes and administrator approval controls. Reading analytics are engagement indicators, not proof of learning. Optional Lark integration and scoped agent APIs require configuration and authorization.

## Deployment and verification

Set PUBLIC_URL to your HTTPS origin, RUNTIME_DIR to a private persistent directory, and PORT/HOST as needed. See [deployment](ops/README.md) for proxy, backup and container setup.

    npm test
    npm run check

Browser tests require Playwright and an installed browser. Set PLAYWRIGHT_MODULE and CHROME_PATH if needed. Tests generate synthetic placeholder records; they do not use customer materials or production data.

Never commit credentials, runtime databases, uploads, private documents or browser session files. Back up runtime data before upgrades and verify restoration separately.

## AI-assisted draft creation

In Course management → New course, optionally configure an OpenAI-compatible model connection, upload one TXT/MD/CSV/text-PDF/DOCX file, generate and review both language files, then create the course with its ID, bilingual name and access code. Downloads are valid paired Markdown files under [the format contract](MARKDOWN_FORMAT.md). Creation saves an unpublished draft; publication remains an explicit separate action. The source is sent only to the selected model. Scanned PDFs require OCR first; source images are not imported. Limit: 8 MB source, 150,000 extracted characters, 200 PDF pages and 32 MB expanded DOCX.

Model credentials are write-only in admin responses and remain in private runtime settings. Changing a provider endpoint requires its key. HTTPS is required; hosted custom endpoints must be on the server allowlist (`TRAINING_LLM_ALLOWED_HOSTS`, in addition to common compatible providers). A compatible CoworkerLLM endpoint can expose additional native providers.

Hosting injects a current subscription policy into the core; self-hosted installations have no hosting plan quotas. New courses and all existing note/question image writes consume shared monthly space limits transactionally. Existing contents remain readable after limits are reached. Image quotas count newly uploaded images, not retained image references; deletion does not refund usage. Global model usage reserves an upper bound before dispatch, settles reported input/output tokens and retains unknown usage conservatively. Own-key requests do not consume platform model tokens. Month boundaries use Asia/Shanghai.

### 讲师版本管理授权
管理员可按课程勾选“业务版本与修订管理”，允许指定讲师上传/替换草稿、下载源文件、发布或撤下修订、设置默认业务版本、调整可见范围、删除非当前修订。此授权独立于备课和发布权限，默认关闭；撤销和到期立即生效。操作保留讲师审计身份，不授予课程创建、用户管理、跨课程访问资格继承或托管运营权限。


PPT reading links created with the first-open policy start a separate duration window on each recipient's first authorized material read, not at link creation or approval. Refreshes, status polling, denied access and analytics events do not start or reset a window. Approved recipients share the same window across approved browsers with the same email; preapproved anonymous links use browser identity. Requiring individual approval is recommended when recipient-level enforcement matters. Existing fixed-deadline links preserve their promised deadlines. Revocation and publication restrictions still apply.

Hosted content storage is 100 MB (Basic) / 500 MB (Advanced); sources, parsed copies, revisions, images, discussions and restore archives count. Private notes and private discussions are excluded from merchant cloud backups and restore. The hosting platform alone orchestrates OAuth, schedules and administrator-only restore approval; the core exports an allowlisted teaching snapshot and applies nonpublishing, transactional imports.


### 飞书 / Lark 账号登录与课程选择

管理员配置应用凭据、区域并启用登录，在开放平台登记本部署的 /api/lark/oauth/callback，申请 contact:user.email:readonly。课程入口、管理员和讲师登录页提供扫码入口；已登录用户也可绑定。首次关联要求飞书返回有效邮箱，已登录账户必须邮箱一致；身份键包含应用及区域，跨应用或跨课堂不共享绑定。管理员只有在已通过系统管理员验证的会话中绑定，才能保留该管理身份；普通用户扫码不会获得管理员权限。

OAuth 验证成功可作为登录证明；课程口令、阅读同意、IP及访问审批仍独立生效。首次访客无课程时必须输入口令。再次扫码后显示当前账户的课程列表，优先选择最后学习课程，有当前访问权限时5秒后进入；取消、切换选项、关闭或切到后台会停止倒计时。无权限课程不自动进入，可按原规则申请访问。绑定浏览器/IP的许可不自动转移到新设备。学习记录按原邮箱用户保留。

个人资料设置提供飞书/Lark绑定状态及扫码绑定按钮。未配置登录应用时，学习入口保留禁用的扫码按钮并解释原因；有管理权限的用户可从个人资料进入配置。绑定状态按当前应用核对，切换应用后不会错误显示旧应用已经绑定。


### 课程 AI 问答与课程知识库

自建版无需托管平台或外部向量数据库：管理员在“课程智能问答”中配置 Gemini 密钥池，默认模型为 gemini-flash-latest；学习者在“笔记与问答 → 课程AI问答”提问。一次请求生成中英文答案，语言切换复用本次结果。答案附可核对的原文摘录，教材引用可跳转页面；无检索证据、模型明确证据不足或引用校验失败时，不输出肯定答案。

仅检索当前获准课程默认业务版本的当前正式修订，不检索草稿、讲师稿、私人笔记或讨论。课程 Markdown 无需重复上传；管理员可上传已审核的 UTF-8 MD/TXT 补充资料（每份200KB、每课程业务版本最多30份），绑定当前正式修订。教材升级后旧修订补充资料不参与新答案，需重新审核上传。检索采用本地中英文关键词片段排序，不是向量语义检索；引用校验不能保证答案事实完全正确，仍需人工核对。问题及相关摘录会发给 Google；回答只保存在当前浏览器页面内存，不自动公开到讨论。

密钥池每项包含项目组、名称和 Key；同项目的多个 Key 必须使用相同项目组。轮询选取可用 Key，401/403/408/429、服务端错误、超时或无效响应会使项目组冷却，默认24小时（可配置1–168小时），随后请求可重新尝试。每次最多尝试两个项目组，每次最长25秒；无人可用时明确报错，不伪造答案。Google 限额按项目而非 Key 计算，轮询不增加同项目额度。管理页显示每组冷却结束时间；本功能不依赖飞书通知或后台探测。

API Key 在运行数据库中使用 AES-256-GCM 加密，解密密钥为运行目录的 course-ai.key（仅运行账户可读写）。备份时必须同时保护数据库和该文件，二者一起恢复；单独复制数据库无法恢复模型凭据。管理员接口不回传密钥，不记录问题或回答正文到审计。后台使用本部署管理员权限管理配置与知识库，学习接口沿用课程审批、安全验证、CSRF、课程隔离，并在模型返回时再次核对访问资格与正式修订。

Google 文档：[模型别名说明](https://developers.googleblog.com/continuing-to-bring-you-our-latest-models-with-an-improved-gemini-2-5-flash-and-flash-lite-release/)、[按项目计算限额](https://ai.google.dev/gemini-api/docs/rate-limits)。最新模型别名可能随 Google 更新，管理员可以改为明确模型版本。
