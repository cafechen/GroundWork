# Architecture / 架构

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

## Static map library / 静态地图层

`/maps` is an independent inspection view linked from the workbench toolbar.
`engines/maps/import_rmf.py` converts pinned RMF source assets at build time to
`assets/maps/rmf/*.json`; `src/map-data.js` validates the separate map schema,
and `src/map-library.js` / `src/map-viewer.js` handle selection and rendering.
No ROS or Python runs when browsing. Selecting a map does not mutate experiment
inputs or results; the existing three engines retain their synthetic scenes.
See [map library](map-library.md) for coordinate, provenance and mesh limitations.

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
