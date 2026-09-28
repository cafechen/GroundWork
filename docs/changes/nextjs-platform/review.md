# Implementation review / 实施自检

Date / 日期：2026-09-28. Same-session self-review, **not independent approval**.
本记录为同会话自检，不是独立审查。本轮未提交、推送或部署。

## Approval and scope / 批准与范围

Maintainer approved MySQL + Prisma and the proposed Next.js/TypeScript/React/shadcn
plan, adding future PostgreSQL support. They subsequently authorized reading the
Strategist local DATABASE_URL and creating separate schemas. The helper reads only
that setting, replaces the database name and does not print/copy credentials.
维护者确认方案并要求将来支持 PG，随后授权使用 Strategist 本机数据库连接另建 schema。
只使用 DATABASE_URL 并替换库名，不打印或复制凭证。

Created isolated schemas: `groundwork_next_20260928`,
`groundwork_import_20260928`, `groundwork_import_20260928b`.
They contain bundled assets/synthetic tests only and remain available for inspection.
No Strategist business tables, existing GroundWork SQLite, robots service or real
devices were modified. No schema was dropped or existing data cleared.
上述独立库只含内置资源和合成测试数据，保留供检查；未修改 Strategist 业务表、
旧 GroundWork 库或 robots 服务，无实机操作，未删库或清空已有数据。

## Delivered / 实施内容

- Next.js pages/Route Handlers, strict TypeScript contracts/services/repositories,
  React five-menu/seven-tab UI, official shadcn/ui source primitives and Three/SVG lifecycle.
  一体化页面与接口、严格类型分层、五主菜单七子页、真实 shadcn/ui 和渲染器生命周期。
- Approved 18-table Prisma model, independent MySQL/PG migration histories,
  normalized aggregate writes, optimistic revisions and immutable history.
  18表、双迁移历史、事务聚合写入、版本冲突和不可变历史。
- Persistent same-repository worker, before-I/O slot claim, cancellation, leases,
  restart interruption, checksummed result artifacts and engine fingerprint.
  同仓库常驻 worker、I/O 前占槽、取消/租约/恢复、结果校验和源码指纹。
- Typed ports of existing park/yard/domain/export/plan logic, existing internal road SDK,
  optional explicit Python Chrono; React workbench and classic entry.
  数值算法及实验契约平移为 TS，道路 SDK 保留，Chrono 仍显式可选，旧实验入口改为 React。
- Read-only default SQLite/run importers; IDs/revisions/audit/artifact bytes retained.
  导入器默认只读预检，保留 ID、版本、审计和结果字节。
- Bilingual README, architecture, database, API, deployment, testing and transition
  notes; shadcn MIT source attribution. Old JS remains a regression/compatibility
  baseline, not a server behind Next.js.
  双语文档与许可证更新；旧 JS 仅作回归/兼容入口，不藏在 Next.js 后代理。

## Logic and defect evidence / 逻辑及缺陷证据

1. MySQL integration initially failed the strict ready-yard distance assertion:
   `54.53002058945908` versus `54.530020589459085`.
   Prisma's native JSON roundtrip changed a coordinate from
   `25.552914270615126` to `25.55291427061513`.
   JSON-column text envelopes fix this without weakening numerical assertions;
   the unchanged database test now passes. Scalar Double columns were not replaced.
   实测 JSON 通道改变末位，导致严格距离断言失败；文本封装修复后原断言通过，
   未降低精度要求或更改判定，标量 Double 保持原生。
2. First browser assertion compared an ideal world point to a rasterized click.
   It now checks that device spawn exactly matches the actual saved route point,
   not an approximate coordinate. Initial English heading check exposed a div
   used as CardTitle; changed it to a semantic h2 and verified the flow.
   首次点击测试误把理想点当浏览器实际点，修正为精确比较已保存路线点与设备初始位姿；
   英文标题定位暴露语义缺失，CardTitle 改为 h2。
3. Import assertions passed, but fixture cleanup closed SQLite twice; corrected
   the test cleanup, then reran on another empty schema without deleting the first.
   导入断言通过但测试清理重复关闭连接；修正后换独立空库复验，未删除旧测试数据。
4. Dependency audit found vulnerable older Vitest/deepmerge-ts; upgraded to
   Vitest 4.1.11, explicit Vite 7.3.6 peer, deepmerge-ts 8.0.2 override.
   A peer-resolution startup failure was reproduced; normal npm ci and engine tests
   now pass. Final official-registry audit: zero known vulnerabilities.
   修复已发现测试依赖漏洞及 peer 解析失败；最终正常 npm ci 可重装，审计为零。
5. Generated Prisma code was incorrectly included by the old JS parser scan;
   exclude generated third-party source, retain all maintained JS and strict TS.
   旧扫描误包含生成 Prisma 代码，现排除生成物，不排除受维护代码及严格 TS 检查。
6. Map browser checks initially allowed absent rows to be skipped. Replaced that
   with an exact five-map inventory assertion, awaited each loaded row and required
   every preview. The stricter test passes; absent maps can no longer masquerade as success.
   地图测试曾允许跳过缺失行，现严格要求五图、等待加载并逐一预览，严格版已通过。
   Screenshot inspection also bounded the road JSON editor height and mobile table width.
   截图检查同时修正道路 JSON 编辑器高度和小屏表格宽度。

## Initial handoff evidence / 首轮交付证据

Historical results below are retained; continuation results are appended at the end.
保留首轮实际记录；续作结果见文末，不将后来通过倒填为首轮通过。

Runtime: Node 22.23.2, macOS; Next 16.3.6, React 19.3.0, Prisma 6.19.3.
Commands from repository root; exact dependency versions are in package-lock.json.
以下在本仓库执行，实际版本锁定于 lockfile。

| Check / 检查 | Result / 结果 |
| --- | --- |
| `npm ci` | PASS, normal peer resolution / 正常依赖解析重装成功 |
| `npm run build` | PASS, internal packages + Prisma + Next production / 完整生产构建通过 |
| `npm run check`, `npm run lint` | PASS, JS syntax + strict TS + Next ESLint / 语法、类型、lint通过 |
| `npm test` | 37 passed, zero failed/skipped / 37通过、无失败跳过 |
| `npm run test:next` | 9 passed, golden park/yard parity, Chrono normalizer, JSON precision, guards and provider parity / 9项通过 |
| `npm run test:engines` | 118 passed across 12 suites; six private-map suites excluded / 12套件118通过，六私有地图套件排除 |
| `tests-next/database.integration.js` | MySQL PASS: concurrent revision, cross-reference, immutable replay, cancellation, expired lease, live slot, duplicate worker claim / MySQL事务与任务生命周期通过 |
| `tests-next/import.integration.js` | MySQL PASS: original source bytes, IDs/history/audit, nonempty target rejection / 源文件、ID/历史/审计及非空拒绝通过 |
| `tests-next/run-import.integration.js` | MySQL PASS: dry-run no writes, byte hashes, old running→interrupted / 只读预检、文件哈希及中断状态通过 |
| Prisma PostgreSQL `validate` | PASS; schema only, no PG connection / 仅结构，不是PG实库 |
| `npm audit --registry=https://registry.npmjs.org` | 0 known vulnerabilities / 零已知漏洞 |
| `scripts/next-smoke.mjs` | PASS: model→park→route→spawn→task→worker→2D/3D replay, English analytics, mobile / 园区完整流程、双语和小屏通过 |
| `scripts/next-labs-smoke.mjs` | PASS: map previews, yard/road jobs/replay/exports, unavailable Chrono guard, classic bilingual entry / 地图、实验室、导出、Chrono未配置禁用及经典入口通过 |
| `python3 -m unittest discover -s engines/maps -v` | NOT RUN successfully: missing pyproj/PyYAML, 2 import errors / 缺依赖导致2个加载错误，不计通过 |

Database commands were wrapped with the explicit local helper:

```sh
node scripts/with-database.mjs --env-file /Users/steven/src/sch/Strategist/.env.local --database groundwork_next_20260928 -- npm run test:database
node scripts/with-database.mjs --env-file /Users/steven/src/sch/Strategist/.env.local --database groundwork_import_20260928b -- node --import tsx --test tests-next/import.integration.js
node scripts/with-database.mjs --env-file /Users/steven/src/sch/Strategist/.env.local --database groundwork_import_20260928b -- node --import tsx --test tests-next/run-import.integration.js
```

Import tests require a fresh target; the schemas above are now populated. Do not
rerun by deleting them. Create another explicit isolated target if needed.
导入测试须空目标，上述库现已有测试数据；不要删库重跑，需要时另建独立目标。

Browser target was loopback `http://127.0.0.1:14173`, production build + isolated DB/worker.
Playwright was reused as a local QA tool from Strategist's node_modules, with system
Chrome; this does not add an application dependency. Screenshots under ignored
`artifacts/next-*` were visually inspected, including 3D replay and mobile English.
浏览器针对本机生产构建和隔离库；借用本机 Playwright 仅为测试工具，不是产品依赖。
截图位于忽略目录 artifacts，已查看 3D 回放和英文小屏，修正小屏表格列宽。

Final smoke rerun passed all five map previews and both lab engines after the
editor-height correction. Temporary loopback web/worker processes were stopped
after verification; test schemas and artifacts remain for inspection.
编辑器高度修正后最终复验通过五张地图及两种实验室引擎。验收结束已停止临时 Web/worker，
保留测试库与文件供检查。

## Security review / 安全检查

Host/Origin/body limits and path/checksum validation retained; no public binding,
login claim, runtime source-project dependency, model gateway invocation or real
control. Browser smoke observed no page errors or external requests on the park
workflow. No credentials or real data added to git. Next telemetry disabled in
package scripts (the first exploratory build displayed the default telemetry
notice before this setting was added; no claim that it was disabled from the start).
保留请求边界和文件校验，无公网监听、登录认证宣称、运行时跨项目依赖、模型调用或
实机控制。园区浏览器流程无页面异常和外部请求。未将凭证/真实数据加入 Git。
包脚本禁用 Next 遥测；首次探索构建曾显示默认提示，不倒推声称从一开始即禁用。

## Initial handoff limits / 首轮交付时未关闭事项

Final filesystem audit: 108 changed/new files, 134 local Markdown links resolved;
no trailing whitespace or missing final newline. `git diff --check` passed.
文件自检覆盖未跟踪文件：108份文件、134个本地链接，无尾空白或缺换行；Git差异检查通过。

- PG needs a real isolated service and integration tests before a support claim;
  live MySQL→PG transfer tooling is not implemented. / PG待实库验收，无在线跨库搬迁工具。
- Python map conversion and actual Chrono execution were not verified in this
  environment. No Gazebo integration or new physics. / Python工具及Chrono实跑待环境，不含Gazebo。
- React graph filters/facility overlays and aggregate batch dashboard are not fully
  ported; preserved legacy server remains available. Full UI parity is not claimed.
  React 地图图层筛选/设施叠层、批次汇总面板未完整平移，不宣称全部旧UI等价。
- No industrial calibration, authentication, multi-tenant or real gateway ingestion.
  Single local preview worker is not distributed HA. / 无工业标定、认证、多租户、实机接入和高可用承诺。
- Import transaction timeout is bounded (20 s), so large legacy inventories may
  need an explicitly reviewed migration strategy; file-copy failure can leave
  unindexed destination files. Sources remain intact. / 大规模导入需另审迁移策略，
  文件复制失败可能留下目标孤立文件，源数据不改。
- Written SDLC records are not enforced gates or independent review. No stage
  approval commits were fabricated. Deployment/cutover and commit remain separate
  user decisions. / 书面记录不是强制门禁或独立审查，不虚构阶段提交；部署与提交待另行授权。

## Continuation — 2026-09-28 / 续作记录

User requested “请继续”; scope was recorded in plan.md before implementation.
No new business tables, dependencies, physics models, public listener, commit,
push or deployment were introduced. The existing isolated MySQL schema was reused;
Strategist business data was not accessed. / 用户要求继续，先更新计划；未新增业务表、
应用依赖、物理模型或公网监听，未提交/推送/部署；仅复用隔离库，不访问源项目业务数据。

### Implementation and review / 实施与自检

- Shared React map viewer now filters navigation graphs and toggles walls,
  lanes, doors/lifts, model positions and names in SVG/Three.js. Floor holes and
  lift rotations are preserved; removed the misleading rectangular 3D floor
  where source floor geometry was absent. Model points do not claim real meshes.
  React地图统一增加导航图与叠层控制，保留孔洞/旋转，去除无源地板时虚构矩形地板；模型仅位置标记。
- `BatchService` atomically persists twelve queue jobs plus an append-only audit
  manifest. No HTTP simulation loop. Dashboard restores history and derives
  comparable-pair counts, policy verdicts/deltas and reports from persisted jobs.
  单事务保存12任务与审计清单，HTTP不执行仿真；历史可恢复，汇总来自持久化成员。
- Pair compatibility checks engine/version/fingerprint and all configuration
  fields. Missing, failed, cancelled, interrupted or nonfinite evidence cannot pass.
  Cancellation only updates unfinished members and preserves live worker leases.
  比较验证引擎、代码、参数；不完整证据不计通过，取消不释放尚未退出worker的租约。
- The manifest-in-audit compromise is documented in the database review: no FK
  for membership, 200-run preview bound, latest 20 batches. Large-scale scheduling
  requires another reviewed schema, not a claim of production readiness.
  已记录审计清单方案无成员外键、200任务/20批列表边界，大规模须另审批次专表。
- New map/batch unit tests were first executed before their modules existed and
  failed as expected; these were feature red tests, not a claim of reproduced old
  production bugs. The implemented logic then passed unchanged numerical assertions.
  新功能先红后绿；初次缺模块失败不冒称旧线上缺陷复现，数值断言未放宽。
- Browser tests initially read before React remount / Radix portal closure and
  failed with zero accessible nodes. Added bounded waits while retaining exact
  counts for every map/floor. Screenshot review moved the batch panel before the
  long run history so it is not buried at the page bottom.
  浏览器首次因视图/菜单切换尚未完成读取到零节点，增加有界等待，保留全图全楼层精确断言；
  截图检查将批次面板移到历史长列表之前。
- That panel move exposed a genuine mobile grid overflow: the final browser
  assertion failed. Set the grid's base track to minmax(0,1fr) and its child to
  min-width:0; keep the unchanged no-page-overflow assertion and scroll only the table.
  面板移动后最终浏览器断言捕获真实小屏溢出；修复网格轨道与子容器最小宽度，
  保留原“不允许整页横向溢出”断言，仅表格内部滚动。
- API documentation also corrected stale legacy claims about catalog geometry
  omission and serialized errors. CI now includes lint and Next unit tests;
  no remote CI run or enforced branch protection is claimed.
  接口文档纠正沿用旧版的摘要/错误格式描述；CI配置增加lint和Next测试，不宣称远端已执行或强制门禁。

### Continuation evidence / 续作证据

Continuation checks completed locally / 续作本机已执行：

| Check / 检查 | Result / 结果 |
| --- | --- |
| Production build, check/typecheck, lint / 构建、类型、lint | PASS |
| Node core / 核心 | 37 passed, zero failed/skipped / 无失败跳过 |
| Next unit tests / Next单测 | 16 passed, including exact batch parity, rejected evidence, escaped reports, five-map layers / 16通过，含数值、边界、导出及地图 |
| Internal engine tests / 内部引擎 | 118 passed; six private-map suites still excluded / 118通过，六私有地图套件仍排除 |
| `.venv-map-build/bin/python -m unittest discover -s engines/maps -v` | 8 passed after isolated dependency installation / 独立虚拟环境安装依赖后8通过 |
| `tests-next/batch.integration.js` via authorized helper | MySQL PASS: competing submissions create one complete batch, cancellation leaves no artifacts, twelve real worker results equal old batch metrics / 并发原子性、取消与真实12次结果一致 |
| `npm run test:database` via authorized helper | MySQL rerun PASS: exact ready-yard distance, revisions, worker slot/lease/cancellation / 原园区与任务生命周期复验通过 |
| `scripts/next-layers-batches-smoke.mjs` | Final PASS: five maps/eight floors, exact graph/layer counts, unchanged stored maps, JSON/CSV/HTML download, cancelled batch restored on reload, EN mobile no overflow / 五图八层、导出、持久化和小屏通过 |
| `scripts/next-smoke.mjs` | Final rerun PASS: complete park flow, actual worker completion, 2D/3D replay, bilingual/mobile; zero page errors or external requests / 原园区全流程、双语小屏通过，无页面错误或外部请求 |
| `scripts/next-labs-smoke.mjs` | Final rerun PASS: five maps, yard/road real jobs and exports, classic bilingual/mobile; zero page errors / 地图、两类实验及导出、经典入口通过 |

Batch `1d6a8540-8609-4821-9c68-20784b4325ca`: 12 completed, 6 comparable,
baseline passes 6, candidate passes 0, regressions 6. These are measured synthetic
results, not fabricated demo scores. Final cancellation fixture:
`45231c0f-b520-4341-8a59-ec8213373b5f` (12 cancelled, zero compared).
上述批次为worker实测；最终取消样例12条取消、0组可比较，不计为通过。

Visual inspection: `artifacts/next-layers-hotel-L1.png`,
`artifacts/next-batch-panel-mobile-en.png`; all map-floor captures and three
downloaded report files are retained under ignored `artifacts/`. Source map JSON
was not regenerated or modified. / 已检查酒店3D与英文小屏批次截图，保留全图层截图及
三种下载文件；未改写内置地图资源。

Filesystem audit included untracked files: 118 changed/new files, 39 Markdown
documents, 159 local links, no whitespace/language/missing-target issues at that
check. `git diff --check` passed. / 文件检查覆盖未跟踪文件：118改动文件、39文档、159链接，
该次检查无空白、双语缺失或坏路径问题，Git差异检查通过。

Final park/lab browser reruns completed successfully. Temporary loopback Web and
worker processes were stopped after verification; isolated test data and artifacts
were retained. / 最终园区/实验室浏览器复验通过后已停止临时Web和worker，保留隔离数据与证据。

### Remaining boundaries / 当前仍存边界

No dedicated PostgreSQL service was available in this environment, so only schema
preparation/parity is established, not live support. Actual Chrono/Gazebo, industrial
calibration, sensor rendering, live gateways/control, authentication and HA remain
out of scope. Python map conversion is now tested; it does not validate Chrono.
当前无可用专用PG服务，仍不宣称实库支持；Chrono实跑/Gazebo、标定、感知、实机、认证与HA
不在本次范围。Python地图工具已验收，不代表Chrono。提交和部署仍需另行授权。

## Deployment deferred; local commit authorized / 暂缓部署，授权本地提交

The maintainer subsequently requested deployment to robots at VPN IP `10.9.0.20`.
Read-only SSH attempts to the VPN IP / robots alias timed out; the known 5180
HTTP endpoint also timed out. The historical LAN address closed the SSH connection.
No files were uploaded, services changed or databases modified remotely.
维护者随后要求部署至 robots 的 VPN 地址；只读连接检查发现 VPN SSH/5180 超时，
旧局域网入口关闭 SSH 连接。没有上传文件、切换服务或修改远端数据库。

The maintainer then confirmed that the machine was powered off and explicitly
requested a code commit, deferring deployment/testing until tomorrow. This
supersedes the deployment task: commit the verified implementation, tests and
bilingual documentation locally; do not push or deploy. Earlier “not committed”
statements describe their respective verification checkpoints, not this later approval.
维护者确认机器已关机，并要求“先提交代码，明天测试”；据此停止部署，授权本地提交
已验收代码、测试及中英文文档，不推送、不部署。上文未提交描述为当时验收状态，
不代表后续未获授权；实际提交号以本记录所在 Git 提交为准。

Pre-commit rerun: `npm test` (37), `npm run check`, `npm run lint`, and
`npm run test:next` (16) passed. Staging made two previously untracked SQL files
visible to `git diff --cached --check`: both initial provider migrations have one
extra blank line at EOF. Preserve their original bytes/checksums, especially the
already-applied MySQL migration; this is an explicit formatting exception, not
a fully clean staged whitespace check. All other staged files pass that check.
提交前复跑核心37项、check、lint、Next16项均通过。暂存检查首次覆盖原未跟踪的两份
初始迁移SQL，发现各有一个文件末尾空行。保留原字节与校验和，尤其已应用的MySQL迁移；
此处明确作为格式例外，不再称暂存空白检查完全无警告。其他暂存文件检查通过。
