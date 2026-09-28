# Unified workbench / 统一工作台

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
  no sampled contact. This is the only engine with the current forklift model.
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
