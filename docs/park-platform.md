# Park platform / 园区平台

This manual describes the current React/Next.js application at `03c88d2`, not the
retained legacy UI. Start Web **and** worker using the [README](../README.md).
本文对应当前 React/Next.js 应用，不是保留的旧界面。按 README 同时启动 Web 和 worker。

## Navigation / 导航

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

Main paths: `/`, `/maps`, `/models`, `/gateways`, `/parks`.
Park pages use `/parks/<id>/<tab>`, not legacy hash URLs.
主页面路径如上；园区使用独立页面路径，不再使用旧版 hash 地址。

## Resource management / 资源管理

| Area / 功能 | Current controls / 当前操作 | Boundary / 边界 |
| --- | --- | --- |
| Maps / 地图 | Create/edit normalized JSON, choose a JSON file (up to 4 MiB), view floors and layers, download JSON, clone/archive / 创建编辑规范化 JSON、选择 JSON 文件（最大 4 MiB）、楼层图层预览、下载、克隆归档 | No blank-map drawing wizard, CAD/SDF/URDF/mesh importer / 无空白地图绘制向导或 CAD/SDF/URDF/网格导入器 |
| Device models / 设备模型 | Create/edit category, dimensions, wheelbase, limits, mass, trailer parameters and sensor declarations; view/download JSON, clone/archive / 编辑类型、尺寸、轴距、限制、质量、挂车及传感器声明，查看下载、克隆归档 | No full-model file-import UI or vendor calibration; declarations do not simulate sensors / 无整模型文件导入界面或厂商标定；声明不代表传感器仿真 |
| Gateways / 网关 | Configure simulation/external adapter, location, endpoint and channels JSON; view/download, clone/archive / 配置适配器、位置、端点及通道，查看下载、克隆归档 | Configuration only; no connection/heartbeat/video/lidar / 仅配置，未实现连接、心跳、视频、雷达 |
| Parks / 园区 | Create/edit name, description and map/model/gateway bindings; open, clone/archive / 创建编辑名称、说明及资源绑定，打开、克隆归档 | Maps/models pin revisions; multiple bindings are not spatial map stitching or cross-floor routing / 地图模型固定版本；多绑定不代表拼图或跨层导航 |

Seed explicitly supplies Hotel, Office, Airport Terminal, Clinic and Campus maps,
generic models and a simulation gateway, but no park. Manufacturing & Logistics
awaits source; Campus is topology-only and external model meshes are absent.
For a known moving example, use the [ready yard](quickstart.md).
显式 seed 提供五张地图、通用模型和仿真网关，不自动建园区；第六张待源码，
Campus 仅拓扑，外部模型网格缺失。先看能跑的示例请用快速入门。

## Create and run a park / 创建园区并运行

Scene tools include `select`, `route`, `charging`, `parking`, `loading`, `unloading`,
`waypoint`, `door`, `restricted` and `speed`. In 2D, choose a non-route object tool
and click to place it; edit name, position, heading and dimensions in its dialog,
apply to the draft, then save the scene. Restricted/speed zones affect the current
simulation; charging, door and loading stations do not perform equipment actions.
场景工具包括选择、路线、充电、停靠、装货、卸货、路点、门、禁行区及限速区，
下拉值为上述英文标识。二维中选择非路线对象工具并点击放置，在弹窗编辑名称、位置、
朝向和尺寸，应用草稿后保存场景。禁行区/限速区影响当前仿真，充电、门、装卸站点不执行设备动作。

1. **Parks → Create**: select map(s), model(s) and the local simulation gateway.
   **园区管理 → 创建**：绑定地图、设备模型和本地仿真网关。
2. **Scene editor → 2D**: choose the map/floor, select tool `route`, then click
   at least two distinct points in clear space. The orange dashed line is a draft.
   **场景编辑 → 2D**：选择地图楼层、工具 `route`，在空旷区域点击至少两个不同的点；
   橙色虚线是未完成草稿。
3. Click **Finish route**, edit its name/points in the dialog, then **Apply to draft**.
   Click **Save scene** to persist. Save is disabled while unfinished route points
   remain; finish or clear the draft first. Undo/redo changes the local scene draft.
   点击**完成路线**，在弹窗编辑名称/坐标并**应用到草稿**，再**保存场景**。
   有未完成路线点时不能保存，须先完成或清除；撤销/重做作用于本地场景草稿。
4. **Devices → Create device**: choose a virtual instance, allowed model, same
   map/floor, simulation gateway and its state/events channels. Click the embedded
   2D map to set x/y (yaw stays unchanged), enter numeric pose, or **Use route start**
   to copy the first point and first-segment heading. **Save device** persists it;
   this does not guarantee whole-body/trailer clearance.
   **设备实例 → 创建设备**：选择虚拟设备、模型、同图同层及仿真网关通道。
   在弹窗二维地图点选 x/y（不改航向）、输入数值，或**使用路线起点**复制首点和首段航向，
   最后**保存设备**。这不保证完整车身/挂车无碰撞。
5. **Operations → Create task**: select device, same-map/floor route, speed and
   duration. Missing-device/route notices identify prerequisites; save the scene
   before running. Click **Start simulation**; this queues work, not live playback.
   **作业管理 → 创建任务**：选择设备、同图同层路线、速度和时长；按缺少设备/路线提示补齐，
   保存场景后点**开始仿真**。此时提交计算队列，不是直接播放动画。
6. Open **Control panel**, wait for completion, then select **Replay** beside the run.
   Playback starts when a result is loaded; use Play/Pause, timeline, speed and
   2D/3D. JSON is downloadable here; HTML reports are available through the
   [report API](api.md), not a current park-panel button.
   打开**控制面板**等待完成，在对应记录旁点**回放**；结果加载后自动播放，
   可播放暂停、拖动时间轴、调速和切换二维三维。面板可下载 JSON；
   HTML 报告通过接口获取，当前园区面板没有该按钮。
7. **Analytics** displays fetched runs and raw metrics (API caps the run list at
   200). **Settings** edits the description and exports configuration JSON; save
   drafts first when exporting persisted state. Change resource bindings through
   the park list's **Edit** dialog.
   **统计分析**展示已获取实验及原始指标（接口列表最多 200 条），不再是旧版最近 30 条。
   **园区配置**可改说明、导出 JSON；需要导出已持久化状态时先保存草稿。
   资源绑定在园区列表的**编辑**弹窗修改。

Route start proximity (within 2 m) does not prove clearance. A `CONTACT` result
with zero distance means the simulation found contact without movement; a finished
worker job is not a successful route. See [troubleshooting](troubleshooting.md).
距起点两米内只满足初始位置检查，不证明车体无碰撞。零距离且 CONTACT 表示未移动便检测到接触；
进程 completed 不等于作业完成，详见排障。

## Implemented boundary / 已实现边界

- Single virtual tugger/forklift/AMR, explicit route, forward planar tracking,
  wall/restricted-zone sampled contact and speed zones. No multi-device scheduling,
  obstacle avoidance, reverse docking, perception or load/door/lift actuation.
  单虚拟牵引车/叉车/AMR、显式路线前进跟踪、墙体禁行区采样接触及限速；
  无多机调度、避障、倒车对接、感知、装卸/门/电梯动作。
- Quadruped/custom definitions can be stored but are rejected by the park simulator.
  Physical instances only register assets; replay never controls real devices.
  四足/自定义模型可登记但园区仿真拒绝运行；真实设备仅登记，回放不控制实机。
- `/workbench` offers separate yard/road/optional Chrono experiments and persistent
  six-pair yard regression. Chrono uses its own synthetic worlds, not arbitrary
  park maps or edited park models. No Gazebo integration.
  独立实验室提供 yard/road/可选 Chrono 与持久化六组配对回归；
  Chrono 未连接任意园区地图或模型编辑参数，没有 Gazebo 接入。
- Layer/graph filters change display only, not collision geometry. Imported lanes
  are not automatically task routes. Facility markers are not complete meshes.
  图层/导航图筛选仅改显示，不改碰撞；导入导航线不自动成为任务路线，设施标记不代表完整网格。

## Data and execution / 数据与执行

Current contracts and persistence live in `src/contracts` and `src/server`;
MySQL/Prisma uses 18 normalized tables with immutable snapshots. Dense artifacts
default to `data/next-runs`. PostgreSQL schema/migrations exist, but live PG tests
remain pending. SQLite and `data/runs` belong to the explicit legacy server.
当前契约和存储位于上述目录，MySQL/Prisma 使用 18 张业务表及不可变快照；
轨迹默认存 data/next-runs。PG 有结构及迁移但待实库验证，SQLite/data/runs 属旧服务。

Parks pin map/model revisions; gateway references follow editable configuration.
Stale writes return 409. Referenced resources cannot be archived while an active
park uses them; archival retains history. Exported park JSON contains local IDs,
not a self-contained portable asset bundle. No hard-delete/restore-resource UI.
园区固定地图/模型版本，网关引用可编辑配置；旧版本写入返回 409。
活动园区引用中的资源不能归档；归档保留历史。园区导出含本地 ID，不是独立资源包，
没有资源硬删除/恢复界面。

Runs freeze input and version identities; replay reads the frozen map revision.
A separate worker claims queued jobs. Queued jobs survive restart; running jobs
with expired leases become interrupted on the next worker tick, not successful
or automatically resumed. Graceful worker shutdown interrupts its current job.
The preview permits one active job, up to 12 queued and 200 stored runs.
实验冻结输入和版本，回放读取历史地图。独立 worker 领取队列；排队任务重启后仍可执行，
运行任务租约到期后在 worker 下一轮检查标记中断，不冒充成功或自动续算；
worker 正常退出中断当前任务。预览限制单活动任务、最多 12 条排队及 200 条存储实验。

Back up the MySQL database and artifacts together after stopping writers/workers.
Use reviewed migrations and explicit legacy import, not automatic seed or database
replacement. See [database](database/README.md), [API](api.md) and [deployment](deployment.md).
停写并停 worker 后一起备份 MySQL 与轨迹；使用审查后的迁移和显式旧数据导入，
不是自动 seed 或替换现有数据库。操作见数据库、接口和部署文档。

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

`park-planar-1` 使用米、秒、弧度和地图 +x/+y 平面，航向逆时针为正。车身包络以
参考车轴为中心：牵引车参考后轴，叉车参考前轴；叉车物理后轮转角与虚拟单轨转角
符号相反。可带一节轴上铰接挂车，铰接点在牵引车参考点；不代表工业万向轮拖车，
没有货叉或载荷几何。AMR 暂用同一单轨近似，不是独立验证的底盘模型。

前向欧拉步长 0.05 秒，回放帧间隔 0.1 秒；名义加速度 1 m/s²、减速度 1.5 m/s²，
接触或跟踪失效时理想瞬停。纯追踪跟随显式折线，**无路径规划或自动避障**。
初始位置须距首点不超过 2 米；路径剩余小于 0.3 米且离终点小于 0.35 米判完成，
不检查最终航向；路径偏差超过 5 米停止。墙宽固定近似 0.1 米，地图边界、地板孔洞、
外部网格、门/电梯和其他设备不作为碰撞障碍。

只统计墙体/禁行区的离散多边形接触；车头、挂车、牵引杆分别计接触段，不是事故数。
帧数据是仿真真值，不是相机/雷达数据。`CONTACT`、`COMPLETED`、`INCOMPLETE` 是模型
结论，与作业进程状态独立。无厂商标定或实测验证，完成不等于园区安全批准。

## Security / 安全

Maintainer confirmed trusted-LAN, single-user, **no login** for this batch. Anyone
who can reach the allowed endpoint can read and modify all preview assets and jobs.
No credentials, customer data, cloud requests, physical commands or remote takeover.
Gateway endpoint strings are stored configuration, never fetched by the server.
Host/origin checks are not user authentication or TLS. See [deployment](deployment.md).

维护者选择本轮可信局域网单用户、**不登录**。任何可访问允许地址的人都可读写预览
资源和任务；不得放凭证、客户数据或接通实车。外部网关地址仅存配置，服务器不会
主动访问。Host/Origin 检查不等于认证或 TLS，详见[部署](deployment.md)。
