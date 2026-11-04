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
