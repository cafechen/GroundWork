# UI self-review / 界面自检

**Current deployment:** UI code and bilingual docs committed as `2bfe8b2` and
deployed through the script to **http://10.9.0.20:5180** on 2026-09-29.
Read-only desktop/mobile/theme and existing-run playback checks passed; data
preserved. [Deployment evidence](../robots-deploy-script/review.md).
**当前部署：** UI 和双语文档已提交为 `2bfe8b2`，并于 2026-09-29 经脚本部署到 robots；
桌面/手机/主题和既有实验回放只读验收通过，原数据保留，证据见链接。登录未实施。

Follow-up authorization: the maintainer subsequently requested robots deployment
using the script, then explicitly requested committing first. The checks below
remain the UI-stage evidence; before commit, `npm test` (48), `test:next` (16),
`check`, `lint` and `git diff --check` passed again. Deployment results will be
recorded separately; no login/schema change or push is authorized by this step.
后续授权：维护者要求脚本部署 robots，随后明确要求先提交；提交前复验核心 48 项、
Next 16 项、check、lint 和差异检查通过。下文为 UI 阶段证据，部署结果另记；
本步骤不实施登录或改表，不推送。

2026-09-29, same-session self-review, not independent approval. UI implementation
was local and uncommitted at UI-stage verification; authentication tables/backend await detailed review.
No robots deployment or live DB migration was performed during that stage.
同会话自检，非独立审批。UI 阶段验收时界面仅本地实现未提交；登录表和后端待详细审查；
该阶段没有部署 robots 或迁移其数据库。

## Acceptance and scope / 确认与范围

The maintainer explicitly selected shadcn-admin, confirmed its live-demo style,
then accepted designing single-administrator authentication. The second question
asks approval for the two-table/session contract; no response is inferred.
维护者明确指定模板和在线演示风格，随后确认单管理员登录设计范围；第二个问题请求
两张表/会话契约的实施确认，不推定未收到的回复。

Delivered UI: upstream slate light/dark tokens; actual adapted sidebar, sheet,
tooltip, skeleton and mobile hook; Next.js application shell; real-data overview;
four filtered resource lists; seven park subpages; shared laboratory styling.
Local English/Chinese, mobile drawer, keyboard/Escape and existing actions retained.
交付主题与实际适配组件、Next 外壳、真实总览、四类筛选列表、园区七子页及实验室统一样式；
保留双语、手机、键盘/Escape 和既有操作。

## Checks / 检查

Node 22.23.2 / macOS; production Next.js on `127.0.0.1:14173`, dedicated synthetic
DB `groundwork_ui_20260929`, worker artifacts `data/ui-runs-20260929`.
Local Playwright from `/Users/steven/src/sch/Strategist/node_modules/playwright/index.mjs`
and system Chrome were QA tools only, not runtime imports/dependencies.
本机生产构建和独立合成测试库/轨迹；借用 Playwright 仅作测试工具，不是应用运行依赖。

| Check / 检查 | Result / 结果 |
| --- | --- |
| `npm test` | 48 pass, no skips / 48 通过，无跳过 |
| `npm run test:next` | 16 pass, no skips / 16 通过，无跳过 |
| `npm run check`, `npm run lint` | JS parsing, strict TS and ESLint pass / 语法、严格类型和 lint 通过 |
| `npm run build` | Engine packages, Prisma generation, production Next build pass / 完整构建通过 |
| `scripts/admin-ui-smoke.mjs` | Theme persistence, Chinese/English, collapse, mobile close/Escape, name/state filtering, exact row counts, map dialog, no overflow/errors/external requests / 主题持久化、双语、折叠、手机、筛选精确行数及弹窗通过 |
| `scripts/next-smoke.mjs` | Model→park→route→spawn→task→worker→2D/3D replay, English analytics/mobile and draft navigation regression pass / 园区完整流程及草稿导航回归通过 |
| `scripts/next-labs-smoke.mjs` | Five map previews, yard/road runs/exports, unavailable Chrono guard and bilingual classic entry pass / 五图、园区/道路实验及导出、Chrono 禁用保护、双语经典入口通过 |
| `tests-next/database.integration.js` | Pass in `groundwork_ui_verify_20260929`, exact numerical result and job/transaction lifecycle / 独立库通过，保留精确数值和事务/任务断言 |
| `tests-next/import.integration.js`, `tests-next/run-import.integration.js` | Pass in `groundwork_import_ui_20260929`, byte/hash and populated-target rejection preserved / 独立库通过，保留文件哈希和非空库拒绝 |

Browser commands used `BASE_URL=http://127.0.0.1:14173`, the Playwright path above,
and `CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
Database commands used `scripts/with-database.mjs` with the previously authorized
local connection file and explicit isolated DB names; no credentials were printed.
数据库命令使用已授权的本机连接文件和明确隔离库名，不打印凭证。

Final verification: all three browser suites reran successfully after the fixes;
the final read-only layout suite also passed after viewport-only drawer capture.
`npm run check`, lint, `git diff --check` and all 208 local Markdown links across
52 Markdown files passed (including untracked drafts). Loopback Web/worker at
`http://127.0.0.1:14173` remain running for maintainer inspection using synthetic
test data only; this is not the robots deployment.
最终三个浏览器套件均复验通过，抽屉仅截手机视口后的只读布局复验也通过；语法/类型、lint、
Git 差异及 52 份文档的 208 个本地链接通过，包含未跟踪草稿。
本机 14173 的 Web/worker 保留供维护者查看，只有合成测试数据，不是 robots 线上部署。

## Findings and corrections / 发现与修正

1. Template brand link moved outside `<header>`, bypassing the existing unsaved
   scene warning. Added a browser assertion that failed (`false !== true`), then
   marked the link `data-navigation` and included it in the existing guard.
   Rerun proved dismissing the warning preserves both URL and unfinished points.
   品牌移出 header 导致草稿保护遗漏；先复现失败，再补导航标记，复验证明取消离开后 URL/路线点保留。
2. A new filter assertion initially counted accessible rows before Radix released
   its modal select portal (0 vs 1). Wait for the header to be accessible, then
   retain exact row-count assertions. No missing rows are skipped.
   筛选测试曾早于 Radix 弹层关闭读取可访问行，现等待表头再保留严格行数，不跳过缺行。
3. Screenshot inspection found animation-start drawer and scrolled sticky-header
   captures. Snapshot helpers now finish finite animations and scroll to the top;
   this changes capture timing, not application assertions or numerical output.
   截图曾捕获抽屉动画起点及滚动后的吸顶栏，已修正截图时机，不改变断言或数值结果。
4. Import check first refused `groundwork_ui_import_20260929` because the test
   requires `groundwork_import_*`. Created the correctly prefixed new target;
   did not loosen the guard, drop the unused schema or clear existing data.
   首次库名不符被正确拒绝，另建正确前缀空库复验，未放宽保护、删库或清空数据。
5. TypeScript caught a spread of a union of bilingual tuples; changed to explicit
   pair indexing. No dependency upgrades or server/schema/engine changes.
   类型检查发现双语联合元组展开问题，改为显式索引；未升级依赖或改后端/模型结构/引擎。

## Visual/security review and remaining work / 视觉安全检查与待办

Inspected actual Chinese light desktop, English dark desktop, Chinese mobile,
English mobile drawer and 3D replay captures under `artifacts/admin-ui/` and
`artifacts/next-*`. Retained canvas semantics/colors while restyling the shell.
实际查看中英明暗、手机抽屉和三维回放截图，外壳换样式但不改场景语义颜色。

MIT source license/provenance included. No remote fonts/avatars/Clerk/mock user or
sales fixtures. No secret, production/customer data, autonomous agent or real-device
operation added. Existing deployment-script/docs changes were preserved.
保留 MIT 和来源，不引入远程字体/头像/Clerk/假账号/销售数据，不加入秘密、客户数据、
自主代理或实机操作；保留已有部署脚本和文档改动。

Authentication is **not implemented yet**: the existing preview remains no-login
until [authentication.md](authentication.md) is approved and implemented/tested.
At that UI-only stage, no Git commit/push or robots cutover. No new PG, Gazebo or Chrono physics execution
claim. Screenshots prove presentation, not industrial safety or secure authentication.
登录**尚未实现**，待独立方案通过并实现验收；最初 UI 阶段未提交/推送/切换 robots，不声称新增 PG、Gazebo
或 Chrono 实跑验证，截图不能证明安全认证或登录安全。
