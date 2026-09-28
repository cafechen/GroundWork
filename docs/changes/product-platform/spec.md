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
