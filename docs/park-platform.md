# Park platform / 园区平台

The current root UI is a park-centric engineering preview. The accepted navigation is:
当前首页是以园区为中心的研发预览，菜单为：

```text
总览 / Overview
地图管理 / Maps
设备模型管理 / Device models
接入网关 / Gateways
园区管理 / Parks
  园区概览 / Overview
  场景编辑 / Scene editor
  设备实例 / Devices
  作业管理 / Operations
  控制面板 / Control panel
  统计分析 / Analytics
  园区配置 / Settings
```

## First experiment / 第一个实验

1. Maps → Create a blank map, e.g. 60 × 40 m. The five RMF maps can also be selected;
   they contain real imported topology, but not all obstacle meshes. Manufacturing
   & Logistics remains unavailable. / 创建 60 × 40 m 空白地图，或选择已有五张 RMF
   地图；第六张仍待源码，不伪造。RMF 拓扑可用不等于环境碰撞几何完整。
2. Models → use a generic tugger/forklift/AMR or clone/edit/import normalized JSON.
   These are uncalibrated internal models, not vendor-validated robots. / 使用、复制、
   编辑或导入设备模型；内置为通用未标定模型，不是厂商认证模型。
3. Parks → Create → select map(s), model version(s), local simulation gateway.
   / 创建园区并选择地图、设备模型版本、本地仿真网关。
4. Scene editor → 2D → Route → click (8,10), (28,10), Finish route; inspect/edit the
   exact points and Save park. Add semantic stations or restricted/speed zones.
   Undo/redo applies to this scene draft. / 2D 场景编辑中画路线，完成路线后可精确编辑
   坐标，再保存园区。可放置充电、停车、装卸、门、禁行区、限速区等业务对象。
5. Devices → virtual tugger, selected model/map/floor, spawn (8,10,0), local gateway,
   channels `["state","events"]`. / 创建设备实例，类型选虚拟，指定同一地图楼层，
   初始位姿 (8,10,0)，绑定本地仿真网关及通道。
6. Operations → task for that device/route, speed 1 m/s, duration 30 s → Run simulation.
   Control panel refreshes status automatically, then starts playback. / 创建 30 秒、
   1 m/s 的任务并运行；控制面板自动更新作业状态，完成后播放。
7. Seek or switch 2D/3D; inspect Analytics and download JSON/HTML evidence.
   / 拖动时间轴、切换 2D/3D、查看统计分析并下载 JSON/HTML 证据。

## Implemented boundary / 已实现边界

| Area / 功能 | Current behavior / 当前行为 | Not implemented / 未实现 |
| --- | --- | --- |
| Resources / 资源 | Create/edit/clone/import/export/archive; immutable saved versions, reference checks / 增改复制、JSON 导入导出、归档、版本与引用检查 | CAD/URDF/mesh import, vendor fidelity / CAD、URDF、网格及厂商标定 |
| Parks / 园区 | Multiple map/model/gateway references; per-floor scene; object editor, undo/redo; persisted instances/tasks / 多资源绑定、分层编辑、撤销重做、设备任务持久化 | Cross-map routing, combined spatial map, concurrent multi-user editing / 跨图路径、空间拼图、多用户协作 |
| Devices / 设备 | Explicit virtual/physical identity; versioned model; gateway/channel registration / 区分虚实、固定模型版本、登记网关与通道 | Actual heartbeat, video, lidar, protocol adapters / 真实心跳、视频、雷达及协议接入 |
| Simulation / 仿真 | Single device, selected floor/route/model; forward-only pursuit; walls and restricted zones checked; speed zones / 单设备显式路线、选定模型、墙体禁行区采样接触、限速区 | Multi-device scheduling, route planning, perception, reverse docking, lift/load/door actuation / 多机调度、路径规划、感知、倒车、举升装卸门动作 |
| Controls / 控制 | Queued/running/completed/failed/cancelled jobs, automatic feedback, replay/seek, historical snapshots / 队列状态、自动反馈、回放定位、历史快照 | Real operation or takeover / 实机作业和接管 |
| Analysis / 分析 | Computed distance, path error, contacts, completion; latest 30 result rows, report/provenance / 实际距离、偏差、接触和完成指标、最近 30 次明细、报告溯源 | Physical telemetry, automatic diagnosis, unlike-case regression conclusions / 实测数据、自动诊断、非配对回归结论 |

Quadruped/custom types are **definition-only** and rejected by the current simulator.
Chrono remains available at `/workbench` on its explicit synthetic scenarios; it does
not consume arbitrary park maps or edited device parameters. Defining mass/sensors
does not make them effective in planar kinematics. / 四足和自定义类型仅定义，运行明确
拒绝。Chrono 仍在旧版力学实验室使用合成场景；未接通任意园区地图与设备参数。
质量和传感器定义不参与当前平面运动学。

## Data contract and recovery / 数据契约与恢复

- `server/platform-contracts.mjs`: strict resource schemas and bounds. Imports are
  JSON data only, limited to 4 MiB; no executable/plugin upload. / 严格结构与范围检查，
  JSON 导入上限 4 MiB，不执行上传内容。
- `server/platform-store.mjs`: Node SQLite (`user_version=1`), WAL, transactions,
  optimistic `version` writes, immutable version records, metadata audit. Current
  DB: `data/platform.sqlite`, or `GROUNDWORK_PLATFORM_DB`. Runs stay in `data/runs`
  or `GROUNDWORK_DATA`; default database is a sibling of the runs directory.
- Global records have generated IDs. Parks pin maps/models by `{id,version}`;
  gateways are mutable configuration references. A saved park is a single revision
  containing references, map transforms, business objects, devices and tasks.
  Changes create versions; outdated writes return 409, no silent overwrite.
- Archiving does not erase data/history. Referenced resources cannot be archived
  while an active park uses them. Exported park JSON retains local resource IDs;
  it is **not a self-contained portable asset bundle**. No hard deletion/restore UI.
- Runs freeze effective model values, route, geometry, business objects and version
  identities. Historical replay fetches the frozen map version, never latest.
  UI names may be current labels outside replay; the pinned version remains explicit.
- Back up the database with SQLite's backup mechanism, or stop GroundWork and copy
  the database **and any WAL/SHM sidecars together** with run data. Never copy only a
  live main database. There are no historical platform schema migrations yet.

## Numerical meaning / 数值含义

`park-planar-1`: metres/seconds/radians, +x/+y map plane, CCW yaw. Axle-centred chassis
envelope; tractor rear-axle or forklift front-axle reference. Virtual bicycle steering
with reversed physical rear-steering sign for forklift. Optional one on-axle trailer,
hitch at tractor reference; no industrial caster-cart or fork/payload geometry.
AMR currently uses the same bicycle proxy, not an independently validated drivetrain.

Fixed forward Euler step 0.05 s; frame interval 0.1 s. Nominal acceleration 1 m/s²,
deceleration 1.5 m/s², ideal instantaneous stop on sampled contact/tracking failure.
Pure pursuit follows the declared polyline; **there is no obstacle avoidance or
route planner**. Spawn must be within 2 m of start. Completion requires progress
within 0.3 m of route length and position within 0.35 m of goal; final heading is
not checked. Path error above 5 m stops motion. Wall width is a fixed 0.1 m proxy.
Map bounds, floor holes, external model meshes, doors/lifts and other parked devices
are not collision obstacles. Do not interpret `COMPLETED` as site safety approval.

Only wall/restricted-zone sampled polygon contacts count; tractor/trailer/drawbar
onsets are distinct episodes, not accidents. Frame data is simulation ground truth,
not a camera/lidar stream. `CONTACT`, `COMPLETED`, `INCOMPLETE` are model verdicts,
independent of job execution status. No manufacturer calibration or real-world tests.

## Security / 安全

Maintainer confirmed trusted-LAN, single-user, **no login** for this batch. Anyone
who can reach the allowed endpoint can read and modify all preview assets and jobs.
No credentials, customer data, cloud requests, physical commands or remote takeover.
Gateway endpoint strings are stored configuration, never fetched by the server.
Host/origin checks are not user authentication or TLS. See [deployment](deployment.md).
