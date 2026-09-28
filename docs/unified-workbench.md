# Unified workbench / 统一工作台

This manual describes `/workbench`, not the current park homepage. The newer park
adapter also supports a simplified forklift; the three engines below keep their
separate numerical contracts. / 本文针对 /workbench，不是当前园区首页；新园区适配器
也支持简化叉车，下述旧三引擎仍保留独立数值契约。

## One project / 一个工程

All application code is inside this repository. The copied TS packages use the
`@groundwork/` namespace and npm workspaces; the Chrono worker imports sibling
Python modules. No symlink, HTTP call or import points to Strategist/Robots.
Those names occur only in source provenance and historical tests/documentation.

所有应用代码均在本工程；不要求同时启动另两个产品。第三方 Node/Python/Chrono
依赖仍需安装，“独立工程”不代表重新实现这些开源依赖。

| Area | Entry point | Integration status / 状态 |
| --- | --- | --- |
| A contracts / 方案契约 | `packages/contracts` | Copied schemas; strict plan/scene validation / 已平移，强校验 |
| A planning / 方案编译 | `server/planning.mjs` | Catalog → ScenarioPlan → SceneSpecV2; user JSON and default template / 已接 GUI |
| A model gateway / 模型网关 | `POST /api/model-plan` | Optional, disabled by default; real JSON endpoint, not keyword pretending to be AI / 默认关闭 |
| A map conversion / 地图转换 | `engines/maps/convert.py` | Extracted AEQD, polygon mesh and directed graph conversion; CLI / 独立工具 |
| B road engine / 道路行为 | `packages/scenario-engine` | Full source copy: behavior blocks, templates, LHS/GA search, risk/reference helpers; only plan simulation has dedicated GUI / 完整 SDK，非全部 GUI |
| B rigid bodies / 刚体 | `engines/chrono/physics.py`, `train.py` | Torque-driven tractor and 0–3 passive trailers; actual offline worker / 已接真实计算 |
| B rendering / 可视化 | `src/viewer.js` | Local Three.js geometry proxies from computed frames, optional 2D / 非原 Gzweb 复制品 |
| C operations / 作业 | `train.py`, `src/core/simulation.js` | Stationary coupling, station phases, following, illustrative SOC; separate yard FIFO/gate engine / 不混同模型 |
| C interoperability / 互操作 | `server/exports.mjs` | RMF graph and static SDF export only / 无 live RMF、Gazebo、PLC |
| D jobs / 实验 | `server/jobs.mjs` | File-backed single-worker queue, cancellation, failure/interruption states / 已接通 |
| D evidence / 证据 | `server/domain.mjs` | Versioned normalized results, raw artifacts, provenance, pair deltas, HTML / 已接通 |

## Engines are not interchangeable / 引擎不能混为一谈

- `yard`: original front-steer tractor + single on-axle trailer and rear-steer
  forklift; planar geometry and FIFO crossing. `PASS` requires finished jobs and
  no sampled contact. Among these three legacy engines, only yard has a forklift.
- `road`: migrated car/heavy-truck behavior model; map-bound plans, braking,
  following and lane-change event logic. It is **not** Chrono or forklift physics.
  Full `validationReport` is included in exported JSON.
- `chrono`: Chrono 10 NSC/Bullet system with rigid wheels, torque motors and
  revolute joints. Differential torque controller, not the yard steering model.
  Front-wheel friction is scaled by 0.15 as in the original uncalibrated model.
  Same-vehicle collision is disabled; obstacle meshes are not loaded. Depot
  insertion/removal is abstract handling while stopped, not crane physics.
  Charging/SOC is an illustrative time-compressed state machine.

三个引擎的车辆尺寸、参考点、接触语义不同，禁止直接比较成“物理精度排行榜”。
Chrono 默认合成场景是每车一条独立环线，不证明共享路网调度能力。

Chrono outputs the tractor ground-reference pose and trailer reference pose
with full quaternions. Rendering uses simple boxes; it does not claim exact mesh
geometry. Inactive trailer slots are omitted. Replay does not interpolate across
attach/detach, and uses recorded timestamps rather than a hard-coded frame rate.

`MISSION_COMPLETE` means each vehicle completed at least one modeled cycle and
the worker reported no model error. It is not an aggregate collision or safety
verdict. `NOT_EVALUATED` is used when the requested horizon ends earlier. To check
the stricter imported regression thresholds and a full charging cycle:

```sh
python engines/chrono/check_run.py /absolute/path/to/data/runs/JOB_UUID
```

This checks finite poses, no tractor teleport, stopped attachment, <1 mm hitch
error, <60° articulation, <5° tilt, <1 m path error, counts 0…target, and completion
of a mission/charging cycle. These thresholds come from the original synthetic
regression; no thresholds were relaxed to get a pass. `--partial` omits only
the explicitly requested full-cycle evidence requirement.

## Maps / 地图

Browser import requires a FeatureCollection with
`properties.coordinateSystem = "local-metres"` and 1–48 LineString roads.
Each road may have `properties.id` and `widthM`; missing widths default to 4 m.
Coordinates are never guessed to be WGS84. Imported geometry has no inferred
successors/adjacent lanes; review structured plans before running.

The standalone converter extracts the original projection, non-convex polygon
triangulation, road-envelope conflict and graph generation logic:

```sh
python -m pip install -r engines/maps/requirements.txt
python engines/maps/convert.py examples/local-road.geojson /tmp/groundwork-map-new
# For explicitly georeferenced input:
python engines/maps/convert.py site.geojson /tmp/groundwork-site-new --origin 116.0 40.0
```

Output directory must not already exist. It emits `roads.local.geojson` for
browser import, relative SDF/DAE assets, directed `nav_graph.json` (YAML 1.2 subset),
source SHA-256, projection/assumption report and edge provenance. Buildings that
intersect the 1.2 m road envelope become visual outlines, not unreviewed collision
obstacles. Existing CAD registration is not applied twice. No private map was
copied or uploaded; downstream Gazebo/RMF acceptance remains to be validated.

## Optional model gateway / 可选模型网关

Administrator environment: `GROUNDWORK_MODEL_URL` and optional
`GROUNDWORK_MODEL_KEY`. The endpoint accepts POST JSON `{prompt, catalog,
example, instructions}` and must return a **ScenarioPlan JSON object** directly.
This is a neutral adapter, not a claim that every provider API has this wire
format. Use your own gateway to translate. No credential is sent to the browser.

模型按钮只在服务端配置后启用；输出须通过 Zod 与地图绑定编译。没有模型配置时，
模板和手工方案仍可运行，但不能叫 AI 生成。请求会把用户输入和地图 movement
目录发送至该管理员端点；不要未经许可向外部模型发送客户数据。

## Storage, limits and exports / 存储、限制和导出

Each job directory retains input, state, worker log, result and, for Chrono,
raw JSONL, scene and summary. Job status is separate from simulation verdict.
Unfinished jobs become `interrupted` after restart; they are never auto-relabelled
successful. One worker at a time; 12 queued jobs, 200 stored jobs, 10 minute worker
timeout, 1 MiB request bound. Administrators must monitor disk space and archive
old runs; there is no destructive automatic retention policy.

Comparisons require the same engine/version and case/map identity, display
changed inputs and numeric deltas, and do not invent a universal risk score.
XOSC exports a **trajectory catalog**, not an executable scenario; dynamic
Chrono trailer entities are explicitly rejected by that exporter. SDF export is
static geometry, not a packaged runnable robot control stack.

The old complete yard batch/report workflow remains at `/classic`; the unified
workbench queues the same 6 matched conditions × 2 policies as 12 durable runs.

## Tests / 测试

`npm run build && npm test && npm run test:engines && npm run check`.
The portable migrated suite has 118 assertions across 12 files. Six additional
copied suites require unavailable private maps and are explicitly excluded in
`vitest.config.ts`; they are retained, not reported as passing. No actual customer
telemetry, real vehicle calibration, live RMF or real model-provider call has been
validated by these tests.

## 中文完整操作与边界补充

### 工程与引擎

应用代码在本仓库，TS 包使用 @groundwork workspace，Chrono 导入同目录 Python；
无指向 Strategist/Robots 的运行时软链、HTTP 或导入。来源名称仅用于历史/溯源。
上表中 A 是契约/目录/方案编译/可选模型网关/地图转换，B 是行为 SDK/刚体/回放，
C 是作业与有限导出，D 是持久化队列和证据；并非所有 SDK 功能都有 GUI。

- yard：前轮转向牵引车、单节轴上挂车、后轮转向叉车和平面 FIFO 路口；完成且无采样
  接触才 PASS。在旧三引擎中只有它含叉车；新园区另有平面叉车适配。
- road：汽车/重卡跟车、制动、换道行为，绑定地图方案，导出完整 validationReport；
  不是 Chrono 或叉车力学。
- chrono：Chrono 10 NSC/Bullet 刚体轮、力矩电机、转动关节，差动力矩控制，不是 yard
  转向模型；前轮摩擦系数沿用原模型乘 0.15，未标定。关闭同车碰撞、不载障碍网格，
  静止接挂/摘挂为抽象搬运，不模拟起重机，充电/SOC 为时间压缩示意状态机。

Chrono 输出车头地面参考和挂车参考位姿及完整四元数，以盒体显示不代表精确网格。
不活动挂车不显示，接挂/脱挂不跨段插值，使用真实记录时间戳。MISSION_COMPLETE
指每辆车至少完成一轮建模作业且无模型错误，不代表碰撞/安全评估；时限不足用
NOT_EVALUATED。check_run.py 校验有限位姿、无车头跳变、静止接挂、铰接误差 <1 mm、
折角 <60°、倾角 <5°、路径误差 <1 m、数量在 0 到目标间、作业和充电循环完成；
阈值沿用原回归，未为通过而放宽。--partial 仅省略完整循环证据要求。

### 地图与模型网关

浏览器道路导入要求 FeatureCollection，properties.coordinateSystem 明确为
local-metres，1–48 条 LineString；可指定 id/widthM，宽默认 4 米。不猜测 WGS84，
不推断道路后继/相邻关系，运行前核对结构化方案。

独立转换命令见上文，输出目录必须不存在；产生米制道路 GeoJSON、相对 SDF/DAE、
有向 nav_graph.json（YAML 1.2 子集）、源 SHA-256、投影/假设报告和边来源。
与 1.2 米道路包络相交的建筑只作为视觉轮廓，不直接当未经审查的碰撞体；不重复
应用 CAD 配准。无私有地图上传/复制，Gazebo/RMF 下游接收尚未验证。

模型网关由管理员设置 URL 和可选 KEY，接受 {prompt,catalog,example,instructions}，
直接返回 ScenarioPlan JSON。不是所有供应商的原生格式，需要自己的转换网关；
凭证不发浏览器。输出须过 Zod 和地图编译，默认禁用，模板/手工方案不冒称 AI。
启用后确实把描述和目录发给该端点，客户数据需另行许可。

### 存储、导出与测试

任务目录保留输入、状态、日志、结果，Chrono 另含 JSONL/scene/summary。进程状态与
模型判定分开，重启将未完成任务标 interrupted。单 worker，排队 12，保留任务 200，
超时 10 分钟，旧版请求体 1 MiB；人工管理磁盘，没有自动破坏性清理。

对比要求引擎/版本/执行指纹和案例地图兼容，展示变化输入与指标差，不编造通用风险分。
XOSC 是轨迹目录而非可执行场景，明确拒绝 Chrono 动态挂车；SDF 是静态几何而非
可直接运行的控制栈。旧版 /classic 保留完整批次/报告，统一工作台将 6 条件×2 策略
排为 12 个持久任务。园区 JSON/HTML 外导出目前拒绝，避免丢几何后误导。

构建、Node、TS 和语法命令见上文；便携 TS 测试 12 文件 118 项，六个私有地图套件
在 vitest 配置明确排除、保留源码、不计通过。未验证客户遥测、实车标定、live RMF
或真实模型服务调用。新版园区和测试文档分别见[园区手册](park-platform.md)、[测试](testing.md)。
