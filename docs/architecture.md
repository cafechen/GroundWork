# Architecture / 架构

## Current Next.js runtime / 当前 Next.js 运行架构

```text
Browser / 浏览器
  React + shadcn/ui + TanStack Query
  Three.js / SVG (view only / 仅显示)
            │ same-origin JSON / 同源接口
Next.js App Router / pages + Route Handlers
            │ Zod contracts, Host/Origin/body guards
            │ 契约、主机/来源/请求大小校验
Services / 服务：园区校验、版本控制、任务编译
            │
Prisma repositories / 仓储 ─── MySQL (default / 默认)
            │                  PostgreSQL (migration prepared / 迁移已备)
            │ durable queue / 持久化任务队列
TypeScript worker / 同仓库独立进程
  ├─ Park + yard kinematics / 园区与旧园区运动学
  ├─ Internal road SDK / 内部道路引擎
  └─ Optional Python Chrono / 可选力学引擎
            │ frozen input + checksum / 冻结输入及校验和
Local artifacts / 本地轨迹文件 ─── result API / 结果接口
```

- `src/app`: pages/API; `src/features`: five menus, seven park tabs, laboratory.
  页面与接口由 App Router 承载，业务 React 页面位于 features。
- `src/contracts/platform.ts`: strict shared Zod contracts; `src/server`: services/repositories.
  前后端共享类型契约，服务与仓储分层。
- `src/simulation`: typed ports of existing numerical logic; `packages` remains internal.
  数值逻辑已平移为 TS，不依赖 UI；内部 packages 保持独立。
- `workers/runner.ts`: claims the single preview slot transactionally before awaited work;
  heartbeat lease, cancellation, expired-run interruption and checksum-indexed artifacts.
  worker 事务占槽后执行，含心跳租约、取消、中断恢复和结果校验。
- `src/features/scene/map-layers.ts`: pure display selection shared by SVG and Three;
  no writes to maps or simulation collision rules. / 双视图共享纯图层筛选，不修改地图或碰撞规则。
- `src/server/services/batches.ts`: atomically persists an audit manifest plus twelve
  runs; `src/simulation/batch-summary.ts` validates matching evidence and derives
  summaries; `src/features/batches.tsx` polls persisted state and exports snapshots.
  批次服务原子保存清单与12任务，纯汇总函数验证证据，React轮询和导出；不在请求内跑仿真。
- No Strategist/Robots runtime dependency, no hidden old HTTP proxy, no Gazebo integration.
  无其他工程运行依赖、无旧 HTTP 代理、本轮未接 Gazebo。
- [Database](database/README.md) specifies 18 tables, JSON precision envelopes, separate
  provider histories and migration limits. PostgreSQL is not yet live-tested.
  数据库文档定义18表、JSON精度封装及双迁移历史；PG尚未实库测试。

## Legacy architecture reference / 以下为旧运行时参考

The following sections describe `npm run legacy:start` and retained engine contracts,
not the default Next.js server. / 以下为旧入口与保留引擎契约，不是默认 Next.js 服务。

## Park platform / 园区平台

`/` serves `platform.html` and `src/platform.js/css`: five global menus, seven
park tabs. `server/platform-contracts.mjs` validates resource JSON;
`server/platform-store.mjs` owns SQLite transactions, immutable revisions and audit;
`server/http.mjs` serves `/api/platform/*`. Parks pin map/model versions and aggregate
business objects, devices and tasks. `src/park-viewer.js` adds overlays and replay.

`compileParkRun` resolves the chosen floor/model/device/task into a frozen request;
`simulatePark` runs `park-planar-1` in the existing worker. No synthetic fallback.
Physical instances, unsupported models and park Chrono requests fail explicitly.
See [product contracts](park-platform.md). The old three-engine UI is `/workbench`;
its history remains separate. Sections below document the preserved legacy components.

根路径使用 platform 页面及 JS/CSS，五主菜单、七园区子菜单；platform-contracts
负责资源校验，platform-store 负责 SQLite 事务、不可变版本、审计，HTTP 层提供
平台 API。园区固定地图模型版本，聚合业务对象、设备和任务；park-viewer 叠加图层
和回放。compileParkRun 将指定楼层/模型/实例/任务解析为冻结请求，simulatePark
在已有 worker 运行 park-planar-1，不回退到合成场景。实机、不支持模型、园区 Chrono
均明确拒绝。旧三引擎界面移至 /workbench，历史列表分开。下文旧模型约束不套用于新园区。

## Static map library / 静态地图层

`/maps` is an independent inspection view linked from the workbench toolbar.
`engines/maps/import_rmf.py` converts pinned RMF source assets at build time to
`assets/maps/rmf/*.json`; `src/map-data.js` validates the separate map schema,
and `src/map-library.js` / `src/map-viewer.js` handle selection and rendering.
No ROS or Python runs when browsing. Selecting a map does not mutate experiment
inputs or results; the existing three engines retain their synthetic scenes.
See [map library](map-library.md) for coordinate, provenance and mesh limitations.

构建期 import_rmf.py 从固定源生成静态 JSON，map-data 校验独立契约，map-library/
map-viewer 选择和渲染；浏览无需 ROS/Python。仅在 /maps 选地图不改变旧三引擎实验。

地图是独立数据契约和查看页面，不把静态导入误认为仿真接入。当前五张可用、一张待源码；
车辆、门禁、电梯仿真另行接入。所有原始资源保留许可与哈希，转换结果单独标识。

## v0.2 integration / 集成层

`server/http.mjs` serves the unified UI and a bounded same-origin API.
`server/jobs.mjs` owns persistent job state and one cancellable subprocess at a
time. Yard/road use `server/worker.mjs`; Chrono uses copied Python workers.
`server/domain.mjs` normalizes results without merging engine meanings.
`src/viewer.js` renders locally installed Three.js geometry proxies or 2D SVG.
See [unified workbench](unified-workbench.md) for model/data/export contracts,
and [deployment](deployment.md) for the explicitly authorized LAN preview.

Unified runs use `schemaVersion:2`, `engine`, `engineVersion`, `caseKey`,
`request`, `validity`, `verdict`, `frames`, `metrics`, `events`, `provenance`.
Job status (`queued/running/completed/failed/cancelled/interrupted`) is separate
from model verdict. Results persist under the GroundWork-owned data directory.

集成层 HTTP 提供旧版工作台和有限同源 API，jobs 持久化任务并串行运行可取消子进程。
yard/road 及园区使用 Node worker，Chrono 使用平移的 Python worker；domain 标准化
输出但不混合引擎语义，viewer 使用本地 Three.js 近似几何或 2D SVG。
统一结果 schemaVersion=2，含 engine、engineVersion、caseKey、request、validity、
verdict、frames、metrics、events、provenance。任务状态与模型判定独立，结果在自身数据目录。

下面的原始数据契约只描述 `yard` / `/classic`。其“无任意地图导入、无持久化”
边界不适用于新增集成层；不会用道路车辆模型替代叉车，也不会把刚体接触算成事故。

## Boundaries / 职责边界

The DOM is an adapter, not the source of truth. `src/core` is dependency-free and runs in both Node and the browser. / DOM 只负责交互和显示；`src/core` 不依赖浏览器，可在 Node 中独立测试。

```text
A: makeScenario(config)
         ↓ validated geometry, routes and task settings
B/C: simulate(config) → fixed-step vehicle + resource states
         ↓ immutable output frames, events and metrics
D: replay / runBatch / htmlReport
         ↓
      browser + downloaded evidence
```

`simulate` rebuilds the fixed yard template from configuration. Passing a scenario object uses its configuration, not its supplied geometry. There is no arbitrary map interface yet. / `simulate` 根据配置重建固定模板；输入场景对象时也只使用其中的配置，不接受任意几何。

## Simulation / 仿真

Each step samples positions, updates lock/door/task state, checks contacts, records a frame, then integrates motion to the next step. Events use simulation time, not wall time. Equal-time requests are processed in stable vehicle order. The second job's release time is the only seeded random variable. / 每步采样当前位置、更新资源/门/任务状态、检测接触、记录帧，再积分到下一步；事件使用仿真时钟，同刻请求按稳定车辆顺序处理。唯一随机变量是第二项任务的释放时间。

The controller steers toward the next waypoint using `atan2(2 L sin(alpha), max(1.2, distance))`, saturated to ±0.6 rad. It switches waypoints within 1.7 m and completes a job within 0.6 m of the final point. This cuts corners and has no final docking-heading criterion. Speed is reduced with steering magnitude. / 控制器追踪下一个目标点，转角限幅 ±0.6 rad，距中间点 1.7 m 内切换目标，距终点 0.6 m 内完成；会切角，不检查最终对接航向，速度随转角增大而降低。

For the tractor: `xdot=v cos(yaw)`, `ydot=v sin(yaw)`, `yawdot=v/L tan(delta)`, `trailerYawDot=v/hitchLength sin(yaw-trailerYaw)`. Wheelbase is 1.8 m. Trailer axle is constrained geometrically at the hitch length behind the hitch. The integration is forward Euler. / 牵引车使用前向欧拉积分的单轨模型，轴距 1.8 m；拖车轴位置由铰接长度几何约束重建。

For the rear-steered forklift, the reference is the front axle and physical rear steering has the opposite sign of the virtual bicycle steering. The chassis envelope is intentionally approximate. / 后轮转向叉车以前轴为参考，物理后轮转角与虚拟单轨转角符号相反；车身轮廓刻意简化。

The approach area is a fixed conservative rectangle around J-01, not an automatically generated stopping zone. A FIFO owner is released only after it has entered and all its polygons have exited the resource. The virtual door is a logical gate, not a physical articulated door. Collisions are recorded without stopping the experiment, so later contacts can also be inspected. / 接近区是固定保守矩形，不是自动计算的制动区。占用者必须先进入，再让全部几何体离开才释放。虚拟门是逻辑门控，不是物理门体；碰撞后继续仿真以检查后续事件。

## Contracts / 数据契约

| Output | Fields / 字段 |
| --- | --- |
| Scene | `schemaVersion`, `id`, `config`, `bounds`, `resource`, `obstacles`, `stations`, `routes` |
| Frame | `t`, `doorOpen`, `owner`, `queue`, `contacts`, `vehicles[]` |
| Vehicle frame | `id`, `kind`, `x`, `y`, `yaw`, `trailerYaw`, `speed`, `steering`, `state`, `reason`, `bodies[]` |
| Event | `t`, `type`, `vehicle`, `detail` |
| Run | `schemaVersion`, `engineVersion`, `scenario`, `status`, `frames`, `events`, `metrics`, `tasks` |
| Batch | config, engine version, six paired conditions, metric deltas, pass counts, regressions |

Task states: `queued → moving ↔ waiting → completed`; the horizon can leave a job incomplete. No cancellation or error-recovery state machine yet. / 任务支持未释放、行驶、等待、完成；超时可能留下未完成任务，暂不支持取消和错误恢复。

Validation rejects non-finite/out-of-range values and non-integral seeds/vehicle counts. Scene imports are capped at 1 MB in the UI. Errors are shown without replacing the valid previous run. Exported reports escape all variable text. / 校验非法数值和范围，种子与车辆数必须为整数；界面导入上限 1 MB；错误不替换已有有效实验，HTML 报告转义所有可变文本。

## Tests and limitations / 测试与局限

Node tests cover geometry primitives, validation, deterministic replay, expected demo outcomes, full-body lock release, door timing, single-vehicle/timeout paths and paired regression. These tests validate this implementation's invariants, **not agreement with measured hardware**. / 自动测试覆盖几何原语、参数校验、确定性、案例结果、完整车体释放、门时序、单车/超时和配对回归；它们证明实现满足自身约束，不证明与实测硬件一致。

Before claiming industrial accuracy, add independent analytical/reference cases, convergence studies, measured topology/dimensions, acceleration/braking, calibrated steering and payload envelopes. / 声称工业精度前，需补独立解析/参考案例、步长收敛性、实测拓扑尺寸、加减速、标定转向和载荷轮廓。
