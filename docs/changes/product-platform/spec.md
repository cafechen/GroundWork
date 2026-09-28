# Park platform — specification / 园区平台规格

## Current contract / 当前契约

The maintainer's final five-menu, seven park-tab design supersedes the earlier
seven-menu/workspace proposal. See [park platform](../../park-platform.md) for the
implemented schema, full workflow, numerical meaning and capability matrix.

Acceptance: persisted resources/versions; multi-map/model/gateway park; scene
add/edit/delete/undo/redo/save; park-owned virtual/physical instances; genuine
selected-floor/model/route planar run; automatic job feedback and frozen replay;
computed metrics/reports; Chinese/English and mobile; legacy regression. Immutable
references, stale-write protection, bad-reference rejection and physical/virtual
gateway guards are mandatory. No account login, real commands or external requests.

Chrono on arbitrary park maps, video/pointcloud/sensor simulation, vendor/URDF models,
multi-device planning, cross-map routing and real takeover remain later adapters,
not completed work. Primitive mass/sensor values are definition-only in kinematics.

## Historical initial proposal / 以下为历史初稿

The following target model is retained for context, not a current capability claim
or an outstanding approval requirement. Its navigation and login proposal were replaced.

Status: proposed, not implemented. All features below are target behavior unless
explicitly marked existing. / 以下是目标行为，不是当前能力声明。

## Navigation / 导航

| Main menu / 一级菜单 | Content / 内容 |
| --- | --- |
| Overview / 总览 | Recent workspaces, maps/products/devices, last runs and actual connection status; no fabricated live metrics |
| Map management / 地图管理 | Imported base maps, metadata, floor/frame information, versions, preview, clone/import/export, archive and usage references |
| Product models / 产品模型 | Type library, editable derived models, geometry/physics/sensors/interfaces, versions and engine support matrix |
| Device instances / 设备实例 | Registered real devices, product version binding, identity, gateway/channel binding, last observed state |
| Gateways & channels / 接入网关 | Deployment location, gateway capabilities, channel schemas, connection diagnostics and credential references |
| Workspaces / 工作空间 | Unified list filtered by simulation/physical; create, clone, archive and enter the appropriate workspace |
| Data & analysis / 数据与分析 | Runs/sessions, streams/artifacts, time-aligned replay, events, metrics, comparisons, fault investigation and reports |

Settings holds account/session/security configuration; it is not a robot-control menu.
Overview links to resources and workspaces rather than automatically launching an
old demo. Main navigation and persistent object names are bilingual.

## Object boundaries / 对象边界

1. **MapAsset / MapVersion**: an immutable published base-map revision plus draft
   editing/import metadata. Include units, coordinate system, floor frames, bounds,
   calibration provenance and available/missing geometry. Existing five RMF maps
   become seeded records, not mutable shared global files.
2. **ProductModel / ProductVersion**: type/template, not a live device. Include
   category (wheeled robot, quadruped, tugger, forklift, etc.), visual assets,
   collision bodies, topology/joints, dimensions, mass/inertia/limits, sensor mounts,
   interface schemas and per-engine adapter support. Display-only model, editable
   configuration and validated simulation support are separate capability states.
   Cloning produces an owned draft; published versions are immutable. Parameters
   unsupported by an engine must not silently appear to affect its simulation.
3. **DeviceInstance**: a real asset, serial/identity, pinned product version,
   optional calibration override, gateway bindings and observed connectivity.
   Registering a device does not prove that it is connected. A real device cannot
   become simulated by changing a boolean on an active connection.
4. **SimulationEntity**: workspace-local virtual device referencing a product
   version, spawn pose and supported overrides. It is not a registered physical
   asset and cannot resolve a physical command endpoint. A run freezes its state.
5. **Gateway / ChannelBinding**: gateway location (local/edge/cloud), adapter kind,
   explicitly configured endpoint, credential reference, inbound/outbound capabilities
   and connection state. Binding identifies structured telemetry, logs/events,
   image/video, point cloud or command channels individually; one generic URL is
   insufficient. Metadata save must not trigger arbitrary remote requests.
6. **Workspace / WorkspaceRevision**: kind, pinned base-map version, floor,
   coordinate transforms, business overlay, memberships, runtime/algorithm binding
   and evaluation configuration. Persist drafts; runs use immutable snapshots.
7. **Run / ObservationSession / Artifact / Metric / Event**: analysis records tied
   to workspace revision and device/entity/product identities. Preserve event time,
   receive time, clock domain, frame ID, provenance and content hashes where applicable.

地图更新不漂移旧工作空间；产品更新不静默替换实机标定或旧实验；真实设备与仿真
实体不共用可执行控制地址。实例管理是资产登记，在线状态必须来自真实握手/心跳。

## Workspace editor / 工作空间编辑器

Base map plus a versioned **business overlay**, not destructive rewriting of the
shared base map. Initial object types: charging, parking, loading, unloading,
waypoint, door, restricted area and speed zone. Each carries ID, name, level,
pose/geometry, orientation, type-specific properties and optional route binding.

Support add/select/move/rotate/edit/delete (draft only), undo/redo, validation,
save/reopen and import/export. Existing base-map facilities remain identifiable;
an overlay must not duplicate or override one invisibly. Door display geometry,
simulated door logic and a real door gateway binding are distinct capabilities.

P1 object editing does not itself promise charging physics, cargo handling, door
actuation, lift travel or route feasibility. Unsupported behavior stays explicit.
Publication rejects invalid floors, references, NaN/invalid dimensions and unsafe
model/asset paths; optimistic revision checks prevent lost updates.

## Simulation workspace / 仿真工作空间（重点）

Inside a simulation workspace: scene editing → virtual entities → tasks/routes →
algorithm & physics settings → run/batch → synchronized replay & evaluation.
Algorithms consume declared observations and issue supported commands through an
adapter; the physics adapter consumes actual selected map/overlay/product values
that it supports. Merely running the old hard-coded loop over a new map is rejected.

The first integrated slice targets one selected floor, the existing tugger topology,
explicit start/goal and route, and a bounded set of effective vehicle parameters.
Forklift kinematics stays a separate adapter; do not label it a Chrono lifting model.
Both planning/control checks and rigid-body checks need independent tests. Record
which values really affect an engine, which are visualization-only, and which are
unsupported. A route through a nav graph is not proof a trailer train can turn there.

Output includes workspace/map/product snapshots, algorithm/engine version, seed,
step size, observations/commands/poses, task events and derived metrics. Validate
reachability, tracking error, stop/docking tolerances and completion for supported
kinematics; validate hitch constraints, articulation, stability and modeled contact
for supported mechanics. Do not rebrand ground-contact counts as obstacle collisions.

Sensor truth/kinematic state is labeled **ground truth**. Synthetic lidar, rendered
camera, noise/latency and perception validation are separate capabilities, not
assumed from a declared sensor or a vehicle pose stream. Uploaded URDF/SDF/mesh
assets do not automatically supply a working controller or physically valid model.

## Physical workspace / 物理工作空间

Select registered devices and their actual gateway bindings, place/map their frame
transforms, and inspect measured telemetry/events/artifacts. Future operations:
live status, synchronized data inspection, fault hypotheses/evidence and authorized
remote takeover. The first scope registers these objects and capabilities; it does
not pretend an arbitrary cloud gateway is integrated.

Real control stays disabled until there is a specified device/protocol, authenticated
operator, exclusive command lease, bounded commands, stale-command expiration,
heartbeat/dead-man behavior, stop/abort path, audit trail and safety validation.
Replay and analysis are read-only and must never resend commands to real devices.

## Shared data and security / 统一数据与安全

Use a shared envelope with explicit `origin` (simulation/physical), workspace,
entity, stream schema/version, timestamps and frame/unit metadata. Large binary
artifacts are bounded stored files/object references, not unbounded JSON fields.
Time alignment must expose missing/late data and clock uncertainty. Comparisons
require compatible model/map/metric definitions; unknown metrics are unavailable,
not zero or fabricated pass results. Fault location is evidence-assisted investigation,
not automatic root-cause certification.

Proposed P1 authentication: single-admin login, hashed secret, server-validated
session, expiry/logout, CSRF and rate limits; protect all platform APIs, artifacts
and legacy routes consistently. No built-in universal password. Credentialed LAN
use requires transport protection; public exposure, TLS/DNS changes and multi-tenant
access control are not implied. Confirm actual login versus continued local single-user
preview before implementing this security boundary.

## Acceptance / 验收

- P1: refreshed navigation, five maps plus unavailable sixth; persistent model
  clone/edit/version; real-device registration with no fabricated online state;
  gateway/channel configuration with no implicit network activity; create/save/
  reopen both workspace kinds; edit business overlay without changing shared maps.
- P1: model modifications do not mutate published versions; referenced versions
  cannot be hard-deleted; cross-workspace edits are isolated; stale writes rejected.
  A physical device cannot be selected as a virtual run entity/control endpoint.
- P2: changing selected map/route/vehicle supported parameters changes actual
  simulation inputs/output; unsupported combinations fail before job launch. Run
  snapshots survive subsequent edits; restart restores jobs/resources correctly.
- P2: reproduce one selected-map tugger route/control case and one Chrono mechanics
  case, with documented physical/coordinate assumptions and independent reference
  tests. Compare runs only with compatible provenance and distinguish incomplete
  horizons from successful validation. No claim that every indoor lane fits a tugger.
- Both: correct zh/en and desktop/mobile behavior, preserved historical runs,
  source/license provenance, input validation and error preservation, audit logging
  for material resource changes; real control remains off without separate acceptance.
- Login, if accepted: unauthorized reads/writes denied, session expiry/logout and
  CSRF tested; private endpoints/artifacts cannot be bypassed through legacy pages.

## 中文对应规格

### 当前契约

维护者最终五主菜单、七园区页取代历史七菜单/工作空间提案。当前 schema、工作流、
数值与能力表见园区手册。验收为资源/版本持久化，多图/模型/网关园区，场景增删改/
撤销重做/保存，园区虚实实例，实际选层/模型/路线平面运行，自动作业反馈、冻结回放、
计算指标报告、中英/手机及旧版回归。固定引用、过期写保护、坏引用拒绝、虚实网关
校验必需。无账号、真实命令或外部请求；任意园区 Chrono、视频点云/传感器、厂商/URDF、
多机规划、跨图路由和实机接管均未实现，质量/传感器仅定义。

### 历史目标模型（下述并非已实现声明）

初稿菜单：总览看工作空间/资源/最近任务和真实连接状态，不造指标；地图管理含元数据/
楼层坐标/版本/预览/复制导入导出/归档/引用；产品模型含模板、几何物理传感器接口、
版本和引擎支持矩阵；设备实例登记真实身份、模型版本、网关通道及观测连接；接入网关
含位置、能力、schema、诊断、凭证引用；工作空间分仿真/物理列表；数据分析含会话、
同步流/事件/指标/对比/故障/报告。设置放账号会话安全，不是控制菜单。名称双语，
总览不自动启动旧演示。此七菜单和登录目标已废止。

对象边界：

1. MapAsset/MapVersion：不可变发布地图与草稿元信息，单位、坐标、楼层、边界、标定
   来源及几何缺口；五 RMF 作为种子记录，不改共享原文件。
2. ProductModel/ProductVersion：设备类型不是实机；含外观、碰撞体、拓扑关节、尺寸/
   质量惯性/限制、传感器安装、接口和适配矩阵。仅显示、可编辑、已验证仿真三者不同；
   复制创建草稿、发布不可变；不支持参数不得假装影响仿真。
3. DeviceInstance：真实资产身份、固定模型、可选标定覆盖、网关及观测连接；登记不是
   上线，不能改布尔值就把活动实机变仿真。
4. SimulationEntity：空间局部虚拟实体，固定模型、初始位姿、支持的覆盖参数，冻结到
   实验，不是实物资产、不能解析实车控制端点。
5. Gateway/ChannelBinding：本地/边缘/云位置、适配器、显式端点、凭证引用、输入输出
   能力/连接；结构化遥测、日志事件、视频、点云、命令逐通道定义，一个URL不够。
   保存元数据不能触发任意外部请求。
6. Workspace/WorkspaceRevision：类型、固定地图楼层、坐标变换、业务图层、成员、运行
   算法和评估配置；草稿持久化，运行用不可变快照。
7. Run/ObservationSession/Artifact/Metric/Event：绑定空间版本与实例模型身份，保留
   事件/接收时间、时钟域、坐标系、来源及适用的内容哈希。

地图更新不漂移历史，产品更新不静默改实机标定或实验；虚实不共用控制地址，上线
必须来自真实握手/心跳。

编辑器在底图上叠加版本化业务图层而非改共享图；充电、停车、装卸、路点、门、禁行、
限速对象含ID、名称、楼层、位姿几何、类型参数及可选路线绑定。目标支持增选移转改删、
撤销重做、验证保存重开、导入导出；原设施需可识别，不可无提示重复覆盖。门视觉、
仿真动作、真实网关三者不同。P1编辑不承诺充电物理、搬货、开门、乘梯或路径可行；
拒绝坏楼层/引用/非数值/尺寸/不安全路径，用乐观版本防丢更新。

仿真目标流程：编辑→虚拟实体→任务路线→算法物理设置→运行批次→同步回放评估。
算法应通过适配器消费声明观测/发支持命令，物理使用真实选中地图和参数，不能在新图
上套旧硬编码环线。首切片为单层、已知牵引拓扑、显式起终点路线和有限有效参数；
叉车运动学不称 Chrono举升。规划控制与刚体均需独立测试，标清有效/仅视觉/不支持；
导航图连通不证明挂车可转。

目标输出含空间地图模型快照、算法/引擎版本、种子、步长、观测命令位姿、事件和指标；
运动学检查可达/跟踪/停车对接/完成，力学检查铰接/折角/稳定/建模接触，不把地面接触
称障碍事故。位姿真值不是雷达/相机/噪声时延/感知验证；上传 URDF/SDF/mesh 不自动
获得控制器或有效物理模型。

物理空间目标为选真实设备/绑定/坐标，查看实测遥测事件，未来状态、同步数据、
故障假设证据和授权接管；初范围只登记，不假装任意云网关已接。实控须明确设备协议、
认证操作人、独占命令租约、命令范围/过期、心跳失联保护、停止路径、审计和安全验证；
回放分析只读，绝不重放到实车。

共享数据目标区分 origin、空间、实体、流schema、时间和单位坐标；大二进制用有界
文件/对象引用，时间对齐暴露缺失/延迟/时钟误差；比较需兼容模型地图指标，不知道的
值为不可用，不填0或伪造通过；故障定位是证据辅助而非根因认证。初稿单管理员登录
提议含哈希口令、服务端会话、过期登出、CSRF/限速，覆盖旧入口与证据、不设万能密码，
传输保护另定；后来选择免登录，不能当成已经实现。

历史验收：P1 五地图第六待补、模型复制/版本不变、实机登记不造在线、网关不自动连、
两空间持久重开/图层不改底图、引用不硬删/跨空间隔离/过期写拒绝/虚实隔离；P2 改
地图路线有效参数确实改变输出，不支持运行前拒绝，快照和重启保留；有选图牵引与
独立 Chrono案例、坐标假设/参考检查、兼容对比、不把时限不足算完成，不保证室内道
适合牵引车。两阶段均验双语小屏、历史/许可、输入错误和审计，实控继续关闭。若曾
接受登录则另需未授权拒绝/会话CSRF/旧入口绕过测试；该条件未在本轮启用。
