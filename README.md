# TeachInPublic

Build your teaching in public, with learner access under your control.

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
