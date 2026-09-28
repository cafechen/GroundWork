# Database design review / 数据库结构评审

Status: approved and implemented for MySQL. Tested only in isolated synthetic-data schemas; no production cutover. PostgreSQL schema/migrations are prepared and validated, not live-tested.
状态：MySQL 方案已批准并实施，仅隔离合成数据测试库验证；未切换生产。PG 已准备并校验结构及迁移，未实库测试。

Reviewable source: [prisma/schema.prisma](../../prisma/schema.prisma).
Implementation gate: [intent](../changes/nextjs-platform/intent.md),
[spec](../changes/nextjs-platform/spec.md), [plan](../changes/nextjs-platform/plan.md).
可审查结构见以上 schema，实施范围与门禁见以上意图、规格、计划。

## Accepted decisions / 已确认决策

1. MySQL + Prisma rather than SQLite. This adds a database service; Next.js
   remains one application, not separate frontend/backend deployments.
   MySQL + Prisma 替换 SQLite，需要数据库服务；Next.js 仍是一个前后一体化应用。
2. Shared map/model/gateway libraries; devices, objects and tasks belong to a
   park. One selected revision of each map/model per park at a time.
   地图、模型、网关是共享资源；设备、对象、任务属于园区；同园区同一地图/模型一次绑定一个版本。
3. Keep trusted-LAN single-user mode, without user/tenant tables or login in this
   change. This is not suitable for public exposure.
   保留可信局域网单用户，不在本次引入账号、多租户；不可据此暴露公网。
4. Normalize editable business data, retain immutable version/run snapshots,
   store dense frame files outside the relational database.
   当前业务数据分表，版本和实验输入不可变，高频轨迹帧保留为文件。
5. Preserve current mixed virtual/physical instance registration. No new park
   mode enum or live-control implementation; park runs accept virtual devices only.
   保留当前虚实设备登记方式；不新增园区模式语义或实机控制，园区仿真只接受虚拟设备。

## Table dictionary / 表字典

Identifiers and field types are specified in the schema; the following describes
ownership and meaning. All poses use metres/radians in the pinned map's coordinate
frame; time uses seconds, timestamps UTC, mass kilograms.
字段类型与主外键以 schema 为准；下表说明职责。位姿使用固定版本地图的坐标系，单位
米/弧度，时长秒，时间戳 UTC，质量千克。

| Table / 表 | Important fields / 主要字段 | Meaning / 职责 |
| --- | --- | --- |
| MapAsset | id, name, currentVersion, archivedAt | Shared map identity; current name / 地图身份与当前名称 |
| MapVersion | mapId + version, name, document, contentHash | Immutable complete map including source, floors and geometry / 完整不可变地图及来源、楼层、几何 |
| DeviceModel | id, name, currentVersion, archivedAt | Shared model identity / 设备模型身份 |
| DeviceModelVersion | modelId + version, category, dimensions, wheelbase, limits, mass, trailers, sensors | Immutable definition and version name / 不可变设备定义及版本名称 |
| Gateway | id, version, adapter, location, endpoint | Versioned editable configuration, not live status / 可编辑带版本配置，不代表在线 |
| GatewayChannel | id, gatewayId, name, kind, topic | Named channel belonging to a gateway / 网关的数据通道 |
| Park | id, name, description, version, archivedAt | Aggregate identity and optimistic lock / 园区身份及聚合乐观锁 |
| ParkRevision | parkId + version, snapshot, contentHash | Immutable complete park state / 园区完整历史快照 |
| ParkMap | parkId + mapId, mapVersion, x, y, yaw | Map binding with pinned revision and placement / 固定版本地图绑定及位姿 |
| ParkModel | parkId + modelId, modelVersion | Allowed model and pinned revision / 园区允许使用的模型版本 |
| ParkGateway | parkId + gatewayId | Allowed gateway / 园区接入网关 |
| DeviceInstance | parkId + id, kind, modelId, mapId, levelKey, pose, gatewayId, serial | Concrete virtual or physical instance; model version comes from ParkModel / 虚拟或真实设备；通过园区模型绑定确定版本 |
| DeviceChannelBinding | parkId + deviceId + channelId, gatewayId | Instance subscriptions/configuration / 实例通道绑定配置 |
| SceneObject | parkId + id, type, mapId, levelKey, pose, width, height, value, points | Stations, zones and routes; points is an ordered coordinate list / 站点、区域、路线；points 为有序坐标列表 |
| Task | parkId + id, deviceId, routeId, durationSeconds, speedMps, engine | Editable task definition, not an execution / 可编辑任务定义，不是执行记录 |
| SimulationRun | id, parkId, parkVersion, taskId, engine, status, verdict, inputSnapshot, metrics, lease fields | Immutable input plus mutable execution lifecycle / 固定输入与执行状态生命周期 |
| RunArtifact | id, runId, role, storageKey, contentHash, sizeBytes | Result/frame/report metadata, with relative file key / 结果、轨迹、报告文件索引 |
| AuditEvent | id, at, actor, action, entityKind, entityId, entityVersion, details | Append-only change history / 只追加审计 |

18 tables. Gateway history uses full configuration snapshots in AuditEvent details;
map/model/park histories have dedicated version tables. An audit actor such as
`local-preview` identifies an execution context, **not an authenticated person**.
共 18 张表。网关历史配置完整保存在 AuditEvent.details；地图、模型、园区使用专门版本表。
`local-preview` 等 actor 仅表示执行上下文，**不是经过认证的用户身份**。

## Relations and enforcement / 关系与约束边界

- Composite foreign keys keep devices, scene objects, routes and tasks in their
  own park; park-map/model bindings reference exact resource versions. IDs of
  devices/objects/tasks are park-scoped to preserve existing imports and clones.
  复合外键限制设备、对象、路线、任务的园区归属；地图/模型引用具体版本。
  实例、对象、任务使用园区内 ID，兼容旧数据和克隆。
- Resource archival replaces hard deletion. Foreign keys use RESTRICT, not
  cascading deletion. Removing current children requires dependency checks and
  a transaction; immutable snapshots survive. Current task IDs in runs are
  historical identifiers, not foreign keys to mutable Task rows.
  资源归档而非硬删；外键 RESTRICT，不级联删除。移除当前子对象需检查依赖并事务执行，
  历史快照保留。实验中的 taskId 是历史标识，不指向可变的当前任务行。
- The service must enforce map floor existence, channel/device gateway equality,
  gateway adapter compatibility, virtual/physical rules, route type and distinct
  points, same-map/floor tasks, finite numeric bounds, model geometry limits and
  unsupported engine rejection. These are **not guaranteed by Prisma types**.
  服务层必须验证楼层存在、设备与通道网关一致、适配器兼容、虚实设备规则、路线类型和
  有效点、任务同图同层、数值范围、模型几何限制及不支持的引擎；**Prisma 类型不能保证这些条件**。
- Park children are edited under `Park.version`: check expected revision, update
  normalized rows, append ParkRevision and audit, increment version, commit as
  one transaction. A stale version returns 409, never silent overwrite.
  园区子表修改须校验预期版本；更新业务行、追加快照/审计、递增版本同一事务完成。
  旧版本提交返回 409，不静默覆盖。
- `currentVersion` must resolve to an existing immutable version. Both nullable
  park fields on a run must be null together (legacy labs), or set together
  (park run). The migration must add SQL checks where supported, with matching
  service tests. Both provider migration histories include the nullable-pair CHECK; no immutability triggers are claimed.
  currentVersion 必须对应存在的版本。实验的 parkId/parkVersion 须同时为空（独立实验室）
  或同时存在（园区实验）；正式迁移补充可支持的 SQL CHECK 及服务测试。两套迁移均包含同时为空的 CHECK；未声称有不可变性触发器。
- Prisma does not make rows immutable: repositories must prohibit version/input
  updates, supported by negative tests. Hashing uses versioned canonical JSON
  encoding; original imported input/result files remain byte-preserved.
  Prisma 不提供“不可变行”保证；仓储层禁改历史版本和实验输入，并以反向测试验证。
  哈希使用版本化规范 JSON；导入的原始输入/结果文件保持字节不变。
- `completed` means worker execution ended, not task success. Verdict remains
  engine-specific; CONTACT cannot become PASS during this refactor. Lease fields
  support a persistent worker design, not a claim of existing distributed safety.
  completed 仅表示计算结束，不等于作业成功；保留引擎判定，不能将 CONTACT 改成 PASS。
  租约字段用于常驻 worker 设计，不代表已有分布式可靠性。

## JSON and files / JSON 与文件边界

Use JSON for canonical map geometry, sensor declarations, ordered route points,
immutable snapshots, heterogeneous engine metrics and structured errors. Do not
put all current business records back into a generic `records.data` document.
Frame arrays stay in bounded local artifact storage; the database stores indexes
and checksums. No MinIO, public bucket, video or point-cloud ingestion is added.
JSON 用于地图几何、传感器声明、有序路线点、不可变快照、引擎差异指标、结构化错误；
不再把全部当前业务实体塞入通用 records.data。高频帧保留在受限本地文件目录，数据库
保存索引与校验和。本次不引入 MinIO、公有桶、视频或点云接入。

## Provider portability / 数据库兼容

Canonical model: `prisma/schema.prisma`; generated models:
`prisma/mysql/schema.prisma`, `prisma/postgresql/schema.prisma`.
Each directory owns its `migrations/202609280001_initial/migration.sql` and lock.
主模型生成 MySQL/PG 两套 schema，每套有独立 SQL 历史及 provider lock。

```sh
# After setting DATABASE_PROVIDER and DATABASE_URL in .env.local:
# 先配置对应 provider 和连接串，再执行：
node --env-file=.env.local scripts/prisma-provider.mjs --generate
node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy --schema prisma/postgresql/schema.prisma
```

Use the mysql path for MySQL. Business services use Prisma, Serializable transactions,
bounded P2034 retries and UUID/string identities; no JSON-path queries, native enums,
array columns or vendor SQL. Provider-native float/time types are generated. MySQL
uses utf8mb4_bin for case-sensitive identity behavior. The administrative sandbox
creation helper is MySQL-only, not part of the business repository.
MySQL 改用 mysql 路径。业务层使用 Prisma、可串行化事务、有界冲突重试和字符串 ID，
不用 JSON 路径查询、原生枚举、数组列或方言 SQL；生成对应浮点/时间类型。
MySQL 使用 utf8mb4_bin。建测试库辅助命令仅支持 MySQL，不属于业务仓储。

Changing databases also requires explicit data export/import and equivalent tests.
No automatic live MySQL→PG transfer tool or dual-write exists yet.
切库还需显式数据搬迁和等义测试，目前没有在线 MySQL→PG 自动搬迁或双写工具。

## JSON precision / JSON 精度

Matched-batch membership is an immutable `AuditEvent` (`action=batch.create`,
`entityKind=batches`, `entityId=<UUID>`, versioned manifest in `details`), created
in the same Serializable transaction as twelve `SimulationRun` rows. Summaries
are derived, not separately mutable records. No new table/migration was introduced.
Membership references have no database foreign keys; readers explicitly report
missing/incompatible members rather than claiming successful comparisons. The
preview caps runs at 200 and lists the latest 20 manifests; a larger scheduler
should get a separately reviewed Batch/BatchMember schema, not grow this shortcut.
配对关系保存在只追加审计事件的版本化清单中，与12条实验在同一可串行化事务创建，
汇总按成员状态计算，不新增可变汇总表或迁移。成员引用没有外键，读取显式报告缺失或
不兼容，不冒充比较成功。预览最多200条实验、列最近20批；大规模调度须另审批次专表，
不能无限扩张这一轻量存储方案。

All application-owned JSON columns store
`{encoding:"groundwork-json-v1",payload:"<JSON text>"}`.
Prisma/MySQL native JSON transport was observed to round the last digit of geometry
coordinates; a strict baseline regression caught a 1-ULP distance difference.
The envelope keeps round-trip precision; readers also accept legacy raw JSON.
All hashes operate on decoded domain data (sorted object keys, ordered arrays);
artifact SHA-256 hashes the exact bytes. Do not query nested business keys directly
inside the envelope. Scalar Double columns retain their native DB representation.
应用 JSON 列采用版本化文本封装，避免实测 Prisma/MySQL JSON 通道舍入几何坐标末位；
严格测试曾捕获距离差 1 ULP，修复后原断言通过。兼容读取旧原生 JSON。
领域哈希基于解码数据、排序对象键且保留数组顺序；文件哈希基于原始字节。
不可直接查询封装内业务 JSON 路径；标量 Double 仍使用数据库原生表示。

## Import commands / 导入命令

```sh
# Source paths explicit; dry-run is default / 显式源路径，默认只读预检
node --import tsx scripts/import-sqlite.ts --source /absolute/path/platform.sqlite
node --import tsx scripts/import-runs.ts --source /absolute/path/old-runs
# Apply only after backup, with dedicated groundwork_* target:
# 备份后指定独立目标库，先业务库再实验文件：
node --env-file=.env.local --import tsx scripts/import-sqlite.ts --source /absolute/path/platform.sqlite --apply
node --env-file=.env.local --import tsx scripts/import-runs.ts --source /absolute/path/old-runs --apply
```

SQLite import requires all 18 target tables empty. Run import requires run/artifact
tables empty and a different destination directory. IDs, revisions, timestamps,
source bytes and original artifacts are preserved; legacy active jobs become
interrupted, never resumed automatically. Copy failure may leave new orphan files;
inspect the dedicated destination before retry, never remove source files.
SQLite 导入要求18表为空；实验导入要求实验/文件表为空且目录与源不同。
保留 ID、版本、时间戳和字节；旧活动任务标记中断，不自动重跑。
复制失败可能留下新目标孤立文件，重试前核对专用目标，禁止删除源文件。

## Migration and recovery / 迁移与恢复

1. After schema approval, generate a reviewed migration against an **empty,
   isolated** target database. Never run `db push` against the existing preview.
   表结构确认后，仅向空的隔离目标库生成/验证正式迁移；不得对现有预览库执行 db push。
2. Build a dry-run importer for SQLite records/versions/audit and run files.
   Preserve IDs, all resource and park versions, archival state, timestamps and
   artifacts. Import old gateway version documents as audit snapshot events.
   Dry-run reads source data only and reports invalid references without repair.
   编写 SQLite 和实验文件导入器，默认 dry-run；保留 ID、全部历史版本、归档、时间戳和文件。
   网关旧版本转成完整审计快照。源库只读，报告坏引用，不擅自“修复”。
3. Compare counts, revision lists, references, hashes and representative read
   responses. Explicitly test duplicate park-scoped IDs and archived resources.
   校验数量、版本清单、引用、哈希与典型接口响应，覆盖园区内重名 ID 和归档资源。
4. Cutover requires separate deployment approval, backup and a write-freeze
   window. Keep original SQLite/artifacts and old service available for rollback.
   Do not dual-write. If new writes exist, rollback needs an explicit export and
   reconciliation plan, not simply switching the connection string.
   切换需另行部署确认、备份和停写窗口；保留旧库/文件及服务用于恢复，不做双写。
   新系统已有写入后，回滚须先导出并核对，不能直接切回连接串。

## References / 参考

Strategist's checked-in Prisma schema and service/data layering informed this
proposal. No runtime dependency or environment credentials were copied.
参考 Strategist 仓库的 Prisma 定义与服务/数据分层；未引入运行时依赖，未复制环境凭证。

Official [Prisma relations](https://docs.prisma.io/docs/orm/v6/prisma-schema/data-model/relations)
describe foreign keys and relation modeling. Current tools and verification are
recorded in the [review](../changes/nextjs-platform/review.md); dependency versions
are pinned in package-lock.json.
外键建模参考上述官方文档。草案验证工具版本见自检；当前依赖已锁定，执行证据见自检。
