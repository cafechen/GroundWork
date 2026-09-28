# Park platform — implementation plan / 园区平台实施计划

## Active accepted implementation / 当前实施

User approved the revised five-menu park-centric design, not the historical seven
menus below. Implement SQLite asset/version/audit persistence (`node:sqlite`,
existing Node >=22.19), strict schemas, five global pages and seven park tabs.
Keep immutable map/model versions and store park maps, instances, business objects
and tasks as one optimistic-revision aggregate. Seed five RMF maps, internal generic
models and an explicitly local simulation gateway; no branded fake vendor models.
Map edits create new revisions; park references remain pinned. Preserve legacy
`/workbench`, `/classic`, `/maps`, run history and raw upstream map provenance.

New park-run adapter consumes the chosen map floor, declared route, device/model
snapshot and operational objects. First planar tugger/forklift simulation uses
explicit vehicle parameters and sampled footprints; capability-gate unsupported
types/engines. Existing Chrono remains available as a clearly separate mechanics
lab while arbitrary park geometry/dynamics support is verified, not silently
substituted. Real telemetry/control/media adapters remain unconnected and visible.
Verification covers persistence/version/conflict/reference checks, actual route and
parameter effects, physical-instance rejection, job lifecycle, full browser flows,
bilingual/mobile, legacy regression and deployment to the already scoped 5180.

Maintainer confirmed trusted-LAN single-user/no-auth. Current implementation contract
and boundary: [park platform](../../park-platform.md). The implementation uses the
existing shared HTTP module rather than a separate `platform-api.mjs`. No new npm
dependency. Platform DB is `data/platform.sqlite`, independent of historical runs.

## Historical proposal (superseded) / 以下为已取代的初稿

Pending decisions and seven-menu/login proposals below are historical, not active
approval gates. Arbitrary-map Chrono, real data/control and external vendor models
remain explicitly unimplemented; the existing synthetic Chrono lab is preserved.

Status: awaiting acceptance of scope, product model and first delivery boundary.
Request reference: current conversation's eight-point business description.

## P1 — persistent platform and workspace editor / 平台对象与工作空间编辑

1. Introduce dedicated platform contracts rather than reuse the copied
   `packages/contracts/src/workspace.ts` historical loose response types as a new
   database schema. Target `server/platform-contracts.mjs`, `server/platform-store.mjs`,
   `server/platform-api.mjs` and contract/store/API tests. Select a transactional
   local store after confirming Node/runtime constraints; likely SQLite for linked
   assets/versions/instances rather than many interdependent mutable JSON files.
2. Seed map records from the existing catalog, preserving source hashes and
   versions. Separate resource import/metadata from the read-only base assets.
   Archived or referenced records are not destructively deleted.
3. Product management first reuses **generic existing GroundWork** tugger/forklift
   definitions. Add clone/edit/import/export and published version binding. Separate
   shape/configuration support from verified engine support. For mainstream vendor
   models, inspect official source, revision, license, units, joints, meshes and
   controller availability before proposing a named import; do not add random
   brand-named placeholders or claim a quadruped works with a wheeled engine.
4. Persist real devices, gateway records and per-stream bindings, showing explicit
   unconnected/configured states. No implicit cloud connection or stored plaintext
   credential in browser-visible JSON. Introduce simulation entities separately.
5. New `src/platform*.js/css` / entry HTML with the proposed seven menus; extend
   the map renderer for workspace overlay editing rather than mutate static map
   rendering into a fake simulation. Add object inspector, undo/redo, save/reopen,
   floor/frame checks and concurrent-write conflict reporting.
6. Create simulation/physical workspaces as different kinds of the same workspace
   aggregate. Preserve old routes via a legacy entry. Root opens overview; do not
   start an old simulation by default. Old experiment provenance stays unchanged.
7. If actual login is accepted, implement and test authentication before treating
   physical-device records or any credentials as private. Specify the transport
   boundary before deploying credentialed LAN access. No fake login screen.

## P2 — selected-map simulation closed loop / 选定地图上的仿真闭环

1. Freeze workspace revision, product version, virtual entity, route/task/overlay,
   engine configuration and evaluation settings in an immutable run input.
2. Refactor existing engine adapters, not just the viewer: `server/domain.mjs`,
   `server/jobs.mjs`, `server/worker.mjs`, `engines/chrono/physics.py` / `train.py`
   and appropriate kinematic code. Remove implicit synthetic-route fallback from
   the new workspace API. Existing legacy scenarios remain explicitly synthetic.
3. Start with a single-floor tugger case using a declared feasible route and
   supported dimensions/topology. Add route/control and Chrono tests without
   claiming calibrated forklift lifting, perception or quadruped locomotion.
4. Build an adapter capability matrix so a product can be stored/edited without
   falsely becoming runnable in every engine. Implement the selected real fields;
   unsupported controls are disabled or rejected, not silently ignored.
5. Reuse persistent job execution/cancel/restart, replay and report components.
   Add normalized simulation stream/session metadata and a data/analysis page;
   metrics and compare guardrails retain engine-specific meanings.

## Later integration, not silently included / 后续接入而非隐含承诺

Named mainstream robot models; sensor/rendering adapters; external autonomy stacks;
actual remote cloud/edge gateway protocols; bulk video/point-cloud ingestion;
production live monitoring and device-specific remote takeover. Keep their domain
slots and capability states but do not present configuration as functioning integration.

## Verification and recovery / 验证与恢复

- Test resource CRUD, transactions, version pinning, schema migrations, permissions,
  archive behavior and restart persistence in a temporary database.
- Browser: create model derivative → create simulated workspace → select map and
  floor → place/edit stations → save/reopen → create virtual device → run supported
  case → inspect aligned data and report. Include physical workspace registration
  flow without sending real commands. Test both languages and small screens.
- Numeric simulation tests: coordinates, parameter-effect tests, route feasibility,
  control response, hitch/steering conventions, timestep sensitivity and explicit
  unsupported cases. Preserve old tests; legitimate schema changes require recorded
  acceptance, never a relaxed assertion to conceal failure.
- Existing `npm run build`, `npm test`, `npm run test:engines`, `npm run check`, Python
  map tests and maps/workbench/classic smoke suites remain baseline. New checks are
  required; no claim of success before running them.
- Back up store metadata before schema migration; new database namespace plus
  immutable legacy run data allows recovery. No destructive dirty-worktree reset.
- Local verification precedes any approved robots:5180 preview update. Preserve
  older release, run history and other services; no commit/push/publication implied.

## Required decision / 必要确认

Approve seven-menu/domain restructuring and the P1→P2 sequence; confirm P1 actual
single-admin login or continued explicit no-auth local preview. A/B/C/D will cease
to be product navigation; it survives only in historical documentation/legacy demos.
Physical registration is in P1; actual stream/control integrations are not represented
as finished. No detailed implementation approval has yet been recorded.

## 中文对应计划

### 已确认实施

采用最终五菜单/七园区页，而非下方历史七菜单。用 Node>=22.19 内置 SQLite 保存
资源/版本/审计，严格契约；地图模型不可变版本，园区地图/实例/对象/任务为单次乐观
版本聚合。初始化五 RMF、通用内部模型、本地仿真网关，不造厂商模型。地图编辑产生
新版本但园区仍固定旧引用，保留 workbench/classic/maps、实验历史和原图来源。

新园区运行编译选中楼层、路线、实例模型及业务对象，首批平面牵引/叉车按参数和
采样轮廓计算，不支持类型/引擎明确拒绝。Chrono留独立合成力学实验室，任意图适配
验证前不静默替换。真实遥测/控制/媒体适配未接并提示。测试覆盖持久/冲突/引用、
真实参数效果、实机拒绝、队列、浏览器、双语小屏、旧版及获准5180部署。

维护者已选可信局域网免登录。实现使用已有共享 HTTP 模块而非单独 platform-api，
无新增 npm 依赖；data/platform.sqlite 独立于历史 runs。现状见园区手册。

### 历史 P1/P2 提案（已取代，不是当前审批门禁）

P1：建立新平台契约，不把旧 packages/contracts/workspace 的宽松响应类型当数据库。
原拟 contracts/store/api 及契约存储接口测试，确认 Node 后选事务本地库，倾向 SQLite；
五图种子保留来源哈希版本，分离导入元数据与只读底图，不破坏归档/引用历史。模型
先通用牵引/叉车，复制编辑JSON进出版本绑定，区分配置与已验证适配；主流厂商需先
查官方来源、修订、许可、单位、关节、网格、控制器，不加虚假品牌占位或称轮式引擎
支持四足。

实机/网关/逐流绑定持久存储，明示未连/已配置，不偷偷连云或存浏览器可见明文凭证，
仿真实体另分。新 platform JS/CSS 配七菜单（后改五）、场景检查器/撤销/保存/楼层
坐标/冲突；仿真物理同类不同kind（后改园区聚合），旧入口保留，首页不自动开旧实验，
历史来源不改。登录若确认才实现，保护所有API/证据而非假界面，传输边界另定。

P2：冻结空间/产品/实体/路线/图层/引擎/评估；适配domain/jobs/worker及Chrono physics/train
而非只换查看器，新空间不偷偷回退合成路线，旧场景明确合成。先单层牵引可行路线和
拓扑，补控制/Chrono测试但不称已标定叉车/感知/四足。能力矩阵区分可存与可运行，
无效控件禁用/拒绝。复用任务取消重启、回放报告、流/会话元信息、分析及比较保护。

后续而非隐含完成：品牌模型、传感器渲染、外部自动驾驶栈、真实云边协议、大量视频/
点云、在线监控与设备专用接管；保留领域位置，不能把配置当接通。

验证恢复：临时库测试CRUD/事务/固定版本/schema/权限/归档/重启；浏览器走派生模型→
园区选图楼层→业务站点保存→实例→支持案例→数据报告，含实机登记但不发命令、双语
小屏；数值测坐标/参数/可行性/控制/铰接转向/步长/不支持组合，不松旧断言。保留
build/Node/TS/check/Python/map/workbench/classic基线，加新测试；不跑不称通过。
迁移前备元数据，独立库和旧实验保证恢复空间，不重置脏工作区。本地验收后才更新
获准5180，留旧版/历史/其他服务，不隐含提交发布。

历史“必要确认”曾询问七菜单和登录，后来已有五菜单/免登录的明确答复；真实流/控制
仍未实现，A/B/C/D只保留历史模块，不再限制业务导航。
