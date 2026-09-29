# Implementation plan / 实施计划

Status / 状态：accepted on 2026-09-28, implemented and locally committed as 03c88d2 /
维护者已确认，已实施并本地提交。未来 PostgreSQL 兼容要求见 [intent](intent.md)。
MySQL locally verified and subsequently deployed on robots; PostgreSQL live tests
remain pending. See [review](review.md) and [current deployment](../robots-deploy-script/review.md).
MySQL 已本地验证并随后部署 robots；PG 实库测试仍待完成，见自检和当前部署记录。

## Proposed layout / 目标目录

```text
src/app/                 Next.js pages, layouts, API route handlers
src/components/ui/       shadcn/ui components
src/features/            maps, models, gateways, parks, scene, tasks, replay
src/data/                typed client requests and query hooks
src/server/              services, repositories, DB, engine adapters
src/lib/                 shared UI utilities and localization
workers/                 persistent TypeScript job runner
packages/contracts/      shared validation and inferred TypeScript types
packages/scenario-engine/ existing standalone TypeScript engine
engines/                 existing Python/native engine adapters
prisma/schema.prisma     reviewable relational design
prisma/{mysql,postgresql}/migrations/ separate approved provider histories
docs/database/           table dictionary and migration decisions
```

Directories are implemented; remaining parity/verification limits are in review.md.
Server modules are server-only; browser modules must not import Prisma, secrets
or Node process APIs. Shared packages never import the application.
目录已建立；剩余功能差异和验收限制见 review.md。服务端模块隔离，不向浏览器导入 Prisma、秘密或 Node
进程 API；共享包不得反向依赖应用。

## Stages / 阶段

### Continuation accepted / 本轮续作已确认

The maintainer said “请继续” after the implementation handoff. Continue the
already-approved map-viewer and regression-panel parity work: graph/layer filters,
door/lift/model/name overlays, 2D/3D consistency, and durable six-pair regression
summaries. No physics change, new business table, deployment or commit.
维护者在交付后明确要求继续；本轮补齐已批准范围中的地图查看器和回归面板：
导航图/图层过滤、门/电梯/模型位置/名称、2D/3D一致性、持久化六组配对汇总。
不改物理算法，不新增业务表，不部署或提交。

Files: scene/map-layers + map-stage, batch contracts/summary/service/API/React panel,
unit/integration/browser tests and paired docs. Batch manifests use existing
append-only AuditEvent records and atomically create twelve SimulationRun rows;
partial/failed/cancelled pairs never count as passing or comparable. Queue capacity
failure rolls back the entire submission. Reload restores batch membership.
文件涉及地图图层、批次契约/汇总/服务/API/React及对应测试文档。批次清单存于已有
只追加审计，12个任务同事务创建；不完整/失败/取消不能计通过或可比，队列不足整体回滚，
刷新后从持久化清单恢复。只改变显示选项，不改变地图数据或任务输入。

Verification: exact parity with the old runBatch algorithm, invalid pair/fingerprint
guards, atomic queue-capacity integration, refresh/cancel/export browser paths;
five real bundled maps and synthetic floor-hole/rotation fixtures. Check Python
dependencies in a repo-local venv. PG live testing only if an isolated service is available.
验证旧批次算法一致性、配对/指纹拒绝、原子排队、刷新/取消/导出；五张地图及合成孔洞、
旋转样例。Python使用本工程虚拟环境；PG仅在有可用独立服务时实测。

1. **Review gate**: deliver schema + intent/spec/plan, confirm database engine
   and scope. No migrations, package changes or runtime replacement before
   acceptance. Accepted in this conversation; reviewer is the maintainer, not this agent.
   **评审门禁**：交付表结构与意图/规格/计划，确认数据库及范围；此前不迁移、不改包、不替换
   运行时。本阶段已由维护者确认，非代理自行批准。
2. Establish isolated baseline fixtures and golden results; preserve source
   SQLite and run files. Add failing regression tests before any bug fixes.
   建立隔离基线及固定结果，保留源库/实验文件；修复缺陷前先证明回归测试失败。
3. Add Next.js/React/TypeScript tooling and actual shadcn/ui primitives. Port
   contracts and server layers, then worker, maintaining tests. Do not run a
   second old HTTP server behind Next.js. Pin and audit dependency versions.
   配置 Next.js/React/TS 与真实 shadcn/ui 组件；迁移契约、服务层、worker并保留测试，
   不在 Next.js 后面再代理旧服务器；锁定并审查依赖版本。
4. Implement approved Prisma schema/migrations, repositories, importer dry-run,
   versioned transactions, artifacts and job lifecycle using disposable DB tests.
   实现已批准表结构/迁移、仓储、dry-run导入、版本事务、文件和任务生命周期，用临时库测试。
5. Port five menus and seven park tabs feature by feature; migrate legacy map/
   unified/classic lab views and preserve entry URLs or documented redirects.
   Add typed forms, field errors, dirty-state safeguards and renderer cleanup.
   逐项迁移五主菜单及七子页；旧地图库/统一/经典实验室入口保留或明确重定向；补齐类型化
   表单、字段错误、草稿保护和渲染器释放。
6. Run build/type/lint, all existing/adapted unit/engine/Python checks and four
   browser smoke paths. Add database transaction/import tests and production
   build startup checks. Inspect Chinese/English and desktop/narrow screens.
   运行构建/类型/lint、全部原有或等义迁移的单元/引擎/Python测试、四类浏览器测试；
   新增数据库事务/导入和生产构建启动测试；检查中英及大/小屏。
7. Update paired README, AGENTS commands, architecture, API, deployment, testing,
   quickstart, provenance and manuals. Remove dead runtime code only when its
   replacement is verified. Handoff with actual results and unresolved risks.
   同步双语README、AGENTS命令、架构、API、部署、测试、入门、来源及手册；验证替代实现后
   才移除旧运行代码；交付真实结果与剩余风险。

## Verification and recovery / 验证与恢复

- Baseline: Node >=22.19, `npm test`, `npm run check`, engine tests and existing
  browser smoke commands. The old check was JS-only; the new check also runs strict TypeScript.
  基线使用上述命令及引擎/浏览器测试；旧 check 只查 JS；新命令增加严格 TS 检查。
- New acceptance: strict `tsc --noEmit`, lint, Next.js production build, isolated
  MySQL migration/import tests, golden simulation parity, cancellation/restart,
  URL navigation, both languages, no hydration error or leaked renderer loops.
  新验收包含严格类型、lint、生产构建、隔离库迁移/导入、数值一致性、取消/重启、页面导航、
  双语，无 hydration 错误或渲染循环泄漏。
- Keep original source data and the current service untouched during local
  refactoring. No deployment, commit or push without corresponding approval.
  本地重构不碰源数据和现有服务；未获对应批准不部署、不提交、不推送。
- Recovery before cutover is stopping the local new app. Production rollback
  after cutover needs the write-freeze/reconciliation procedure in the database
  proposal. Do not promise lossless rollback after divergent writes.
  切换前停止本地新应用即可恢复原运行方式；切换后按数据库方案停写/核对，不能承诺分叉
  写入后直接回滚不丢数据。
