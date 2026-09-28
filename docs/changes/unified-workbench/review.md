# Implementation review / 实现与验收

Historical integration-stage evidence; later committed in `a634805` and superseded
by the park release. Commands/IDs below describe that stage, not a new execution.
集成阶段历史证据，后续进入 `a634805`，当前部署已由园区版取代；以下命令/ID 为当时记录。

Date: 2026-09-28. Same-session self-review, **not independent approval**.
Maintainer authorization: the current request explicitly asks for functionality
reuse, source copying into one project and deployment on `robots`. No Git commit,
push, public publication, real robot control or public network exposure requested.

## Delivered / 已交付

- Whole reusable TS contract/behavior/template/search packages copied into local
  workspaces, renamed `@groundwork`; portable tests preserved.
- Torque-driven Chrono tractor/train source copied, generalized to 1–5 vehicles
  and 1–3 target wagons, with independent synthetic routes and serial wagon IDs.
- Source map converter's AEQD, polygon mesh, road-envelope conflict and directed
  graph logic extracted into an independent CLI, with no private assets.
- One Node API/UI: structured plans, local road import, optional model gateway,
  real subprocess simulations, persistent jobs, cancellation, comparison, 2D/3D
  replay, HTML/JSON and interoperability artifacts. Original lab retained.
- Isolated remote runtime/release/data; active release
  `/home/steven/src/groundwork/releases/20260928-integration-03`, port 5180.
- Current runtime source fingerprint:
  `ba4a05a7a041ddc81fec6f147db8f524818e5dd879bfe3e67b18077c3c8a4e2a`.

No source checkout/service dependency remains. The copied namespace packages
resolve via `../../packages/...` inside the release. Original Strategist/Robots
worktrees remain clean; no existing remote demo process was restarted.

## Reproduced failures → fixes / 先复现再修复

1. Initial contract tests failed because the new integration module did not yet
   exist; implemented it rather than treating scaffolding as a passing test.
2. Default road-plan compilation failed: default profile desired speed 12 m/s
   exceeded the explicit 5 m/s scenario cap. Fixed template profiles to their
   intended 3/2.5 m/s; did not raise the cap or weaken validation.
3. Cancellation raced state writes (`ENOENT` renaming shared temporary file).
   Added unique temporary paths and per-job serialized writes; reserved the
   worker slot before async I/O; check cancellation before spawning and after
   result processing. Cancellation/startup interruption regression passes.
4. Browser startup returned 404 because the static root had a trailing slash
   while containment appended another separator. Normalized the root; retained
   traversal/allowlist protections. Browser checks verify page and denied paths.
5. 320 px English layout overflowed to 330.625 px. Changed the responsive grid's
   min-content behavior; 390/320 px overflow assertions now pass.
6. Code-fingerprint mismatch was silently comparable and reattached wagons reused
   slot IDs. Added two failing tests, then code fingerprint checks and persistent
   wagon-generation identifiers. Both now pass.
7. Remote browser reproduced an old historical result overwriting a newly
   submitted run. Controlled 1.2 s delayed-response regression reproduced it.
   Selection epochs and in-flight load guards now prevent stale responses from
   changing the selected run. The same remote regression passes on release 03.

A separate early browser test incorrectly assumed there were no persisted runs;
its wait now identifies the newly submitted result. This was a test setup fix,
not evidence of application correctness by itself.

## Executed evidence / 实际执行

| Check | Environment / exact command | Result |
| --- | --- | --- |
| Build | macOS Node 22.23.2: `npm run build` | Both copied TS packages compile |
| Core/integration | macOS Node 22.23.2: `npm test` | 23 tests, zero failures/skips |
| Portable copied suites | `npm run test:engines` | 12 files, 118 tests pass |
| JS parse scan | `npm run check` | src/server/scripts/tests parse |
| Core/integration on deployment | robots Node 24.13.1: `node --test tests/*.test.js` | Same 23 pass, no source repo needed |
| Map conversion | robots Python 3.12: `python -m unittest discover -s engines/maps -p 'test_*.py'` | 2 tests pass, explicit AEQD/no-double-transform and geometry semantics |
| Map conversion CLI | `python engines/maps/convert.py examples/local-road.geojson /home/steven/src/groundwork/data/map-preview-20260928` | SDF/DAE/local roads/directed graph/report generated, 25 directed edges |
| Classic browser | `BASE_URL=http://127.0.0.1:4180/classic node scripts/browser-smoke.mjs` | A/B/C/D, import/export, 12-run batch, zh/en, 390/320 px pass |
| Unified browser local | `BASE_URL=http://127.0.0.1:4180 node scripts/workbench-smoke.mjs` | yard/road workers, 2D/3D, seek, languages, narrow layouts, slow-response regression, guards pass |
| Unified browser deployed | `BASE_URL=http://10.1.153.185:5180 node scripts/workbench-smoke.mjs` | Same checks pass on final release 03; no page errors/external requests |
| API integration deployed | `BASE_URL=http://10.1.153.185:5180 node scripts/api-smoke.mjs` | FIFO PASS / no-lock FAIL, +2 contact episodes; unsafe field rejected; actual Chrono worker cancelled; new full cycle succeeds; dynamic XOSC rejected |
| Runtime dependency audit | `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org` | 0 reported vulnerabilities; configured mirror's unimplemented audit endpoint was not counted as success |
| Whitespace | `git diff --check` | Pass; separate JS scan covers new untracked source |

Browser commands used the installed Playwright module via `PLAYWRIGHT_MODULE`
and isolated Google Chrome via `CHROME_PATH`; Chromium 153.0.8010.53. Generated
screenshots and API test details live under ignored `artifacts/`.
The final three-trailer replay was visually inspected in both languages at
26.0 s; selected screenshots are retained in `docs/images/unified-chrono-*.png`.
A separate scan covered tracked and untracked text files (157 listed files),
finding no trailing whitespace or broken relative Markdown links. The review
record/screenshots were finalized locally after deployment; remote runtime code
and its fingerprint are unchanged.

Six copied test suites require original private map fixtures. They remain in
source but are explicitly outside `test:engines` in `vitest.config.ts`. They were
**not** run or counted as passing. No private map was copied to make them pass.

### Actual Chrono runs / 真实计算

| Job | Scenario | Evidence |
| --- | --- | --- |
| `529c0494-b9e4-4039-b9a9-2b62890b545d` | 1 tugger, 3 target wagons, 120 s | 6,001 raw samples, full mission + charging cycle |
| `71fbd633-91a6-4011-b941-f3a9fff5d877` | 5 tuggers, 3 target wagons each, 140 s | 7,001 raw samples in one Chrono system; all full cycles |
| `a7820a43-e605-4459-ba14-5d69b09c5672` | fresh final-engine single train, 120 s | Generation IDs and source fingerprint present; all checks pass |

`python engines/chrono/check_run.py <job-directory>` passed on all three, with
the full-cycle requirement enabled and original threshold values retained.
Final single-train metrics: maximum route error 0.082257 m; maximum hitch error
0.0000043175 m; maximum articulation 17.4205°; one cycle, four attaches and three
detaches (the next cycle begins before the horizon); wall time ~12.9 s.
Forty maximum ground-inclusive contacts were **not interpreted as accidents**.
The final UI-only release retained the same runtime computation fingerprint.

### Persistence and service isolation / 持久化与隔离

Runs survived two GroundWork release/process switches. Unfinished startup state
is separately covered by the interruption test. Remote ports 5173, 5174, 5175,
5176 and 5180 all returned HTTP 200. Original service PIDs remained 412723,
588166, 1694415 and 571262 respectively. Final GroundWork PID at verification:
2382971. No boot autostart or system-wide service was installed.

## Scope and residual risks / 未完成与边界

- This is an integrated working slice, not complete product parity with two
  source applications. All copied reusable pure TS capabilities remain available
  as SDK code; only structured-plan simulation has dedicated UI. Source product
  databases, accounts and frontends were deliberately replaced, not required.
- Map conversion is a CLI; GUI imports its local-road output. CAD arbitrary
  editor, production topology inference and calibrated obstacle contact are not
  delivered. SDF/RMF/XOSC downstream simulator compatibility is unverified.
- RMF is **export-only**, not a live dispatcher. Existing Gazebo services are not
  connected. No PLC, real vehicle or customer-data ingestion path is active.
- Model-gateway adapter is wired but no provider configured/called; natural
  language generation stays disabled. No paid model usage was performed.
- Chrono tractor differs from the yard bicycle model; forklift remains kinematic.
  Rigid wheels, self-contact masking, abstract depot handling and illustrative SOC
  remain limitations. Separate synthetic loops do not validate shared-route fleet
  deadlocks. No measured hardware validation or safety claims.
- Trusted LAN only: no authentication/TLS/tenants; requests and queues bounded,
  but manual disk monitoring/archival needed. Do not expose publicly.
- Full-source/public licensing review still required for owner-requested copied
  code; no copied Gzweb or Unitree assets. No commit or push performed.

## Recovery / 回退

Stop only GroundWork using `scripts/service.py` (PID identity checked), select
a retained compatible release, restart. Do not roll back to integration-01's
known broken static page; integration-02 retains a known slow-result UI race.
Release 03 is the verified preview. Evidence remains in the independent data
directory; nothing material was deleted.

## 中文对应自检（标识符、哈希及命令与上文表格共用）

2026-09-28 同会话自检，无独立审批。维护者授权功能平移、独立项目和指定部署；
当时不含 Git 提交/推送、公开发布、实车控制或公网暴露。

### 交付

整体平移 TS 契约/行为/模板/搜索及测试为 @groundwork；Chrono 泛化 1–5 车、目标
1–3 挂车，独立合成环线和挂车序列身份；抽出地图 AEQD、网格、道路冲突和有向图
CLI，无私有资源。统一 Node API/UI 接通结构化方案、道路导入、可选模型网关、真实
子进程、持久队列/取消、对比、2D/3D、HTML/JSON 和有限互操作导出，保留旧实验台。
部署 integration-03，端口 5180，指纹见上文。运行导入仅在 release 内，原两个仓库
仍干净、服务未重启。

### 复现及修正

1. 初始契约测试因模块不存在失败，补真实实现而非把空架子算通过。
2. 默认道路速度 12 m/s 超过显式 5 m/s 上限，改成意图内 3/2.5，不放宽上限。
3. 取消与状态临时文件重命名发生 ENOENT 竞争，改唯一临时路径、按任务串行写、
   await 前占 worker、spawn 前和结果处理后检查取消；中断/取消回归通过。
4. 静态根尾斜杠重复导致页面 404，规范化根路径，保留路径/白名单保护。
5. 英文 320px 布局溢出到 330.625px，修正 grid 最小内容宽，390/320 检查通过。
6. 不同代码指纹可直接对比、重挂车复用槽 ID；先补失败测试，再加指纹检查和代际身份。
7. 远端旧历史响应覆盖新实验，1.2 秒人为延迟复现，加入选择代次与在途保护，release03 通过。

另一次浏览器测试误假设没有历史任务，改等待新提交结果；这是测试准备修正，不能
单独当作应用正确证据。

### 已执行证据

上文表格记录精确命令：本地 Node22.23.2 构建、23 核心/集成、118 TS/12 文件、语法
通过；远端 Node24.13.1 同 23 通过；Python3.12 转换 2 项通过，CLI 输出 25 有向边。
本地 classic 和 unified、远端 unified/API 均通过：语言、小屏、回放、慢响应、静态/
来源保护、FIFO PASS 对 no-lock FAIL 多 2 接触段，拒绝危险字段，真实 Chrono 取消及
完整循环，拒绝动态 XOSC。运行依赖审计当时 0 已报告漏洞；镜像不支持审计端点未算成功，
不能将历史结果称为当前安全保证。

Playwright/Chrome153.0.8010.53，截图/API 详情在忽略 artifacts；26秒三挂车双语
截图实际查看，选图保留 docs/images。157 个跟踪/未跟踪文本空白及链接检查通过。
六私有地图测试套件未运行、不计通过、未复制私有数据。部署后补本地记录和图片，
运行时指纹不变。

三次 Chrono 任务 UUID 与场景见上表：1车3挂120秒6001样本，5车各3挂140秒7001
样本，最终新引擎单车120秒；均用 check_run 开启完整循环且保持原阈值通过。最终
最大路径误差 0.082257m、铰接误差 0.0000043175m、折角 17.4205°；1循环、4次接挂、
3次摘挂，时限内已开启下一轮，墙钟约12.9秒；最大40地面相关接触不当事故。

实验跨两次自身发布/进程切换保留，启动中断另测。5173–5176和5180均200，原 PID
412723/588166/1694415/571262 未变，当时 GroundWork PID2382971；这些不是当前 PID。
没有系统级服务或自启。

### 剩余边界与恢复

不是两原产品全功能对等：完整纯 TS 是 SDK，专用 GUI 只接结构化方案；不依赖原
数据库/账号/前端。地图工具非任意 CAD 编辑，不含生产拓扑推断、标定障碍接触或已验证
SDF/RMF/XOSC 下游兼容。RMF 仅导出，无 Gazebo/PLC/实车/客户数据接入；模型端点未配
未调用、未付费。Chrono 拓扑不同，叉车为运动学；刚体轮、自碰撞屏蔽、抽象搬运和
示意 SOC 保留，独立环线不验证共享路网死锁。无实测或安全结论。免认证可信局域网，
人工管磁盘；许可公开审查仍需做，无 Gzweb/Unitree，当时未提交/推送。

恢复只用身份校验 service.py 停自身，选兼容旧版后启动，证据目录不动；当时不能退
integration-01（静态页面坏）或 -02（慢响应竞争），-03 为验证版，未删除重要数据。
后续园区版恢复需按当前部署手册检查 schema/任务兼容。
