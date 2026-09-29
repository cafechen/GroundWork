# Deployment / 部署

For routine updates of the existing robots Next.js preview, use the
[self-service script](deploy-robots.md): `node scripts/deploy-robots.mjs deploy --apply`.
It requires a clean committed tree and unchanged database schema, reuses protected
remote configuration, and never repeats seed/import. First-time setup remains below.
现有 robots Next.js 的日常更新优先使用上方自助脚本；要求已提交的干净工作区和不变的
数据库结构，复用远端受保护配置，不重复初始化或导入。首次安装仍按下方独立流程。

## Current status / 当前状态

Deployed and checked on **2026-09-29**, current UI source **`2bfe8b2`**:
[robots preview](http://10.9.0.20:5180). Local default remains `127.0.0.1:4173`.
This is a dated verification, not a promise of continued availability.
See [script deployment evidence](changes/robots-deploy-script/review.md) and the
[original Next.js deployment](changes/robots-nextjs-deployment.md).
**2026-09-29 已部署并验收**，当前 UI 源码 **2bfe8b2**，VPN 预览地址如上；本机仍默认 4173。
这是有日期的验收，不是持续在线保证；实际证据和重启命令见部署记录。

- Release / 版本: `/home/steven/src/groundwork/releases/20260929T022745955Z-2bfe8b2-4fcbe390`;
  `current` now selects this release / current 已指向此版本。
- Previous Next.js release retained / 保留上一版本: `releases/20260929-nextjs-baaa97b`.
- Database / 专用库: `groundwork_robots_20260929`; dedicated account only permits
  robots' VPN source and this database / 专用账号仅限 robots VPN 来源及该库。
- Artifacts / 轨迹: `/home/steven/src/groundwork/data/next-runs-20260929`.
- Processes / 进程: user-scoped transient `groundwork-next-web.service` and
  `groundwork-next-worker.service`, **not boot-enabled** / 用户级临时单元，**未开机自启**。
- Legacy data and release retained; backup / 旧数据及版本保留，备份位于
  `/home/steven/src/groundwork/backups/20260929-pre-nextjs`.

```sh
ssh robots 'systemctl --user status groundwork-next-web groundwork-next-worker --no-pager'
ssh robots 'systemctl --user restart groundwork-next-web groundwork-next-worker'
ssh robots 'journalctl --user -u groundwork-next-web -u groundwork-next-worker -n 80 --no-pager'
```

Restart interrupts an active simulation; use a maintenance window. The commands
above require the transient units to still exist; after reboot/user-manager exit,
recreate the current version with `node scripts/deploy-robots.mjs start --apply`
from the reviewed local checkout. Inspect partial service states first; do not
reuse the historical release's hard-coded unit commands or legacy `service.py`.
重启会中断活动仿真，应选维护窗口。上述命令要求临时单元仍存在；重启机器或用户管理器
退出后在审查过的本地代码中用上述脚本启动 current；部分运行先检查，不能复制历史旧目录的
启动命令，也不能使用旧 service.py。

The general runbook below describes preparing another release. Do not repeat
seed/import or start duplicate foreground services on the deployed database/port.
The separate-copy **legacy rollback check passed**; the MySQL dump/restore procedure
below has **not** been drilled and must not be described as verified recovery.
下方通用手册用于准备另一版本，不要在已部署库/端口重复 seed、导入或启动前台副本。
独立副本上的**旧版恢复检查已通过**；下方 MySQL dump/restore **尚未演练**，二者不能混称。

## Prerequisites and configuration / 前提与配置

Use Node >=22.19 and a dedicated MySQL 8+ database, with permissions scoped to
GroundWork. Do not reuse another application's business schema. Provisioning
the server/database and firewall changes require the corresponding authorization.
Use a new release directory, not an overwrite of the live release. Install/build
on the target OS; do not copy macOS `node_modules`, generated Prisma binaries,
`.next`, local secrets or test data to Linux.
使用独立 MySQL 库和限定权限，不能复用其他应用业务库。安装服务/建库/修改防火墙需
对应授权；新建 release，不覆盖运行版本。在目标系统安装构建，不复制 macOS
依赖、Prisma 二进制、.next、本机秘密或测试数据。

Create a protected `.env.local` in the new release, based on [.env.example](../.env.example).
Example values below are placeholders, not credentials or an existing database.
Keep artifacts outside releases; Web and worker must share the same working
directory, database and artifact path. Restrict filesystem permissions to the
runtime account (for example, `chmod 600 .env.local`).
按模板创建受保护的环境文件；下方只是占位值，不是现有连接信息。
轨迹目录放在 release 外，Web/worker 使用相同工作目录、库和轨迹路径，
文件仅运行账户可读写（例如设置权限 600）。

```dotenv
DATABASE_PROVIDER=mysql
DATABASE_URL="mysql://groundwork:REPLACE_WITH_URL_ENCODED_PASSWORD@127.0.0.1:3306/groundwork_robots"
GROUNDWORK_ARTIFACTS=/home/steven/src/groundwork/data/next-runs
GROUNDWORK_ALLOWED_HOSTS=10.9.0.20
GROUNDWORK_ORIGIN=http://10.9.0.20:5180
NEXT_TELEMETRY_DISABLED=1
```

Next.js and `scripts/prisma-provider.mjs` load `.env.local`; direct Prisma CLI,
worker, seed and import commands require explicit loading as below. Add
`GROUNDWORK_CHRONO_PYTHON` only for a verified independent PyChrono installation.
No login/roles/tenant isolation exists. Host/Origin checks are not authentication;
limit access through the trusted VPN/firewall, never expose publicly. Gateway
URLs are configuration only; optional model-gateway calls have a separate
data-sending boundary and must not be enabled implicitly.
Next 与 provider 生成脚本会加载本地环境文件，直接 Prisma CLI、worker、seed 和
导入需显式加载。仅在已验证的独立 PyChrono 环境配置 Python 路径。
无登录/角色/租户隔离，Host/Origin 不是认证；只允许可信 VPN 访问，禁止公网暴露。
设备网关地址仅作配置，可选模型网关会发送数据，不得默认开启。

## Prepare the new release / 准备新版本

Run from the new release directory on robots, after configuring the dedicated
database and environment. These commands create schema/data; do not run them
against a production or unrelated database. Never use `db push` on existing data.
在 robots 新 release 目录、配置独立库后执行；这些命令会建表/写数据，不能指向生产或
无关库，不对现有数据执行 db push。

```sh
npm ci
node --env-file=.env.local scripts/prisma-provider.mjs --generate
node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy --schema prisma/mysql/schema.prisma
npm run build
```

Choose **one** initialization path before starting Web/worker:
启动前**二选一**：

- Fresh preview: `node --env-file=.env.local --import tsx scripts/seed-next.ts`.
  This requires empty resource tables and creates no parks.
  全新预览显式 seed，要求资源表为空，不创建园区。
- Preserve legacy data: stop writes/legacy service, back up SQLite (including
  WAL/SHM if present) and runs, then follow the [import procedure](database/README.md).
  Use copied sources and a new empty `groundwork_*` target; do not seed first.
  Import resources before run files; never point the destination at the old runs
  directory. Review counts, revisions and hashes before cutover.
  保留旧数据则先停写停旧服务，备份 SQLite（存在的 WAL/SHM 一并保留）和实验目录；
  使用副本与新的空目标库，先资源后实验，不先 seed，目标轨迹目录不得等于旧目录，
  切换前核对数量、版本及哈希。

Retain original data and the old release. New writes cannot be rolled back to
SQLite by merely switching a symlink or connection string; export/reconciliation
would be required. PostgreSQL is not a verified deployment alternative yet.
保留原始数据和旧版本；已有新写入后，不能靠软链或连接串切回 SQLite，须导出核对。
PG 尚未实库验证，不能作为已验证的替代部署方案。

## Start, verify and stop / 启停与验收

First check the VPN address is present and inspect port `5180` (for example,
`ss -ltnp 'sport = :5180'`). If occupied, identify the owner; only stop a confirmed
GroundWork legacy process during the approved cutover window. Never blanket-kill
Node/Python or change the other 5173–5176 demos. `scripts/service.py` is
**legacy-only**; no new Next.js system service/autostart has been installed.
先核实 VPN 地址和 5180 占用，确认进程身份；仅在获准切换窗口停止已确认的旧
GroundWork，不能批量杀进程或改其他演示服务。现有 service.py **仅适用旧版**，
没有安装新版系统服务或开机自启。

In two foreground SSH terminals, use the same new release directory:
在两个前台 SSH 终端进入同一新 release 目录：

```sh
# Terminal 1: Web / 终端一：Web
node --env-file=.env.local node_modules/next/dist/bin/next start --hostname 10.9.0.20 --port 5180
```

```sh
# Terminal 2: worker / 终端二：worker
node --env-file=.env.local --import tsx workers/runner.ts
```

This binds Web to the VPN IP, not all interfaces; it will fail if that IP is
unavailable. Keep both terminals open. Ctrl+C in each stops its process; wait for
worker/child exit before backup or release replacement. This is a manual preview,
not a durable process supervisor. Schedule systemd/log rotation separately.
仅监听 VPN 地址，地址不可用则启动失败。保持两个终端；分别 Ctrl+C 停止，
等 worker/子进程退出后再备份或换版本。此为手工预览，不是进程守护；
systemd/日志轮转另行设计部署。

Verify `http://10.9.0.20:5180`, resource inventory and history, then use a synthetic
fixture under the authorized preview. The [ready-yard command](quickstart.md)
with that `BASE_URL` writes new resources and a run; it is not a read-only health
check. Confirm queued→running→completed, nonzero motion, zero sampled contacts,
2D/3D replay and JSON export; inspect both terminals. Test scripts must target a
separate disposable database, not retained user data.
验收页面、资源及历史，再在获准预览用合成示例；远端 ready-yard --apply 会创建资源
和任务，不是只读健康检查。确认状态流转、非零运动、零采样接触、二维三维回放及 JSON，
并检查两终端。自动化写测试只能使用独立测试库，不能指向需保留的用户数据。

Without a worker, jobs stay queued. Queued jobs are claimed after restart; expired
running leases become `interrupted` on a worker tick. A live lease blocks the
single preview slot until released/expired. Interrupted runs are not automatically
retried; preserve their evidence and create a new execution when appropriate.
没有 worker 就一直排队；重启后仍领取排队任务，运行任务租约过期后标记中断，
有效租约占据单执行槽直到释放或过期。中断任务不自动重试，保留证据再按需新建执行。

## MySQL backup and recovery / MySQL 备份恢复

This procedure is documentation, **not a completed restore drill**. Choose a
new protected backup directory and verified database name. Freeze writes and stop
Web/worker first; keep database dump and artifacts from the same window. Configure
a local MySQL login path interactively with `mysql_config_editor` (for example
`groundwork-backup`), not a password in command arguments or shell history.
该流程**尚未实际演练恢复**。选择新的受保护备份目录和已核实库名；停 Web/worker、
冻结写入，数据库与轨迹同窗口备份。用 mysql_config_editor 交互配置本地登录项，
不要把密码写进命令参数或历史。

Example commands, after replacing `/secure/backup/NEW_BACKUP` and confirming the
database/artifact paths; the directory must already exist and files must be new:
下方替换备份目录并确认库名/轨迹路径后使用；目录须已建立，目标文件不得已存在：

```sh
mysqldump --login-path=groundwork-backup --single-transaction --no-tablespaces --set-gtid-purged=OFF --result-file=/secure/backup/NEW_BACKUP/groundwork.sql groundwork_robots
tar -czf /secure/backup/NEW_BACKUP/next-runs.tar.gz -C /home/steven/src/groundwork/data next-runs
```

Check command exit codes and retain the release commit, configuration securely,
database dump (including Prisma migration history), artifacts and checksums.
Never commit backups or secrets. This assumes MySQL tooling and authorized
permissions; resolve privilege/tool-version errors rather than dropping data.
检查退出码，并保存代码提交号、受保护配置、包含 Prisma 迁移历史的库备份、轨迹及校验和；
不得提交备份或秘密。命令需 MySQL 工具及获准权限，遇权限/版本错误先解决，不能删库绕过。

For a restore drill, provision a **new empty** `groundwork_recovery_*` database
and a separate artifact directory. Restore there, never over the active database:
恢复演练先建**新的空** groundwork_recovery_* 库和独立轨迹目录，不覆盖活动库：

```sh
mysql --login-path=groundwork-backup groundwork_recovery_REPLACE < /secure/backup/NEW_BACKUP/groundwork.sql
tar -xzf /secure/backup/NEW_BACKUP/next-runs.tar.gz -C /absolute/new-recovery-data
```

Use the matching release, point a separate protected environment at the restored
database and extracted `next-runs` directory, and regenerate the Prisma client.
Do not seed. Verify resource counts/revisions, artifact hashes and representative
historical replays with Web on an unused loopback port. Keep the worker stopped
until queued executions have been reviewed: starting it can run restored queued
jobs. Apply later reviewed migrations only as part of a separately checked upgrade.
恢复时用匹配代码版本及独立环境文件，指向恢复库和解压的 next-runs 并生成 Prisma 客户端；
不要 seed。在未占用本机端口启动 Web，核对数量、版本、文件哈希和历史回放；
审查恢复的排队任务前不启动 worker，否则会执行它们。后续迁移只在另行核验的升级中应用。

## Historical legacy service / 以下为历史旧服务

The commands and robots state below belong to the old Node/SQLite service.
They are not instructions for the new Next.js app. The helper starts
`scripts/serve.mjs`, not Next.js or its worker. / 以下命令与 robots 状态属于旧 Node/SQLite 服务；
助手启动 scripts/serve.mjs，不会启动 Next.js 或其 worker。

Status below records the earlier legacy deployment on 2026-09-28; later the user
confirmed the machine was powered off. It is not a live availability check.
下述状态记录 2026-09-28 较早的旧版部署；之后用户确认机器已关机，不是实时在线承诺。

## Local / 本机

```sh
npm ci
npm run build:engines
npm run legacy:start
```

Node >=22.19. Defaults to `127.0.0.1:4173`. The `yard` and `road` engines work
without Python. To enable the optional Chrono worker, install Python 3.12 and
PyChrono 10 in an independent environment and set an absolute
`GROUNDWORK_CHRONO_PYTHON` path. The worker uses the core NSC/Bullet engine only.

Node >=22.19，默认监听 `127.0.0.1:4173`；园区平面、yard、road 不需要 Python。
可选 Chrono 需独立 Python 3.12/PyChrono 10 环境，设置绝对 Python 路径；仅使用
核心 NSC/Bullet，不代表任意园区已接入力学。

| Variable / 环境变量 | Meaning / 含义 |
| --- | --- |
| `HOST`, `PORT` | Bind address/port; defaults 127.0.0.1 / 4173 / 监听地址和端口 |
| `GROUNDWORK_ALLOWED_HOSTS` | Comma-separated extra hostnames/IPs, no protocol or port / 额外主机或 IP，逗号分隔，不带协议端口 |
| `GROUNDWORK_DATA` | Absolute run directory recommended; default data/runs / 建议绝对实验目录 |
| `GROUNDWORK_PLATFORM_DB` | SQLite path; default platform.sqlite next to runs directory / 资源库路径，默认与 runs 同级 |
| `GROUNDWORK_CHRONO_PYTHON` | Optional independent worker interpreter / 可选独立力学解释器 |
| `GROUNDWORK_MODEL_URL`, `GROUNDWORK_MODEL_KEY` | Optional external model endpoint/key; disabled by default / 可选模型端点和密钥，默认不接外部 |
| `GROUNDWORK_HOME` | Linux service helper base path; not the Node data-path setting / Linux 服务助手基目录，不是 Node 数据变量 |

`HOST=0.0.0.0` alone does not allow arbitrary Host headers. Use only a trusted
private network and explicitly approved hostnames. Existing HTTP origin handling
is not a ready-made TLS/reverse-proxy configuration; review before changing transport.
只改监听地址不会放开所有 Host。仅在可信私网设置获准主机名；现有 HTTP 来源校验
不是已验证的 TLS/反向代理配置，改变传输方式需另行审查。

## robots preview / robots 预览

- Base directory: `/home/steven/src/groundwork`
- URL: `http://10.1.153.185:5180` (or `http://robots:5180` if your DNS resolves it)
- Releases: `releases/<release-id>`; `current` selects the active release.
- Current preview: `20260928-park-platform-01`; park platform at `/`, old engine
  lab at `/workbench`, map library at `/maps`. See [platform review](changes/product-platform/review.md).
  Previous `20260928-rmf-maps-02` and `20260928-integration-03` are retained.
- Independent runtime: `.tools/node/bin/node`, `.venv-chrono/bin/python`.
- Persistent evidence: `data/runs`; resource database: `data/platform.sqlite`
  (SQLite WAL, schema 1). Process identity: `service.json`; log: `server.log`.
- The original 5173–5176 demos are not stopped or repurposed.

```sh
ssh robots 'python3 /home/steven/src/groundwork/current/scripts/service.py status'
ssh robots 'python3 /home/steven/src/groundwork/current/scripts/service.py stop'
ssh robots 'python3 /home/steven/src/groundwork/current/scripts/service.py start'
```

The helper verifies PID command-line identity before stopping a process. It does
not install system services or boot autostart. After machine reboot, start it
explicitly. The preview is a background application requested by the maintainer,
not a recurring monitoring agent.

Runtime installation on 2026-09-28 used the already-installed Node 24.13.1 binary
as a source for a separate copy, and micromamba's offline clone to relocate the
existing third-party PyChrono 10 environment into `.venv-chrono`. Neither original
runtime directory is needed after installation; application source/assets were
not shared by symlink. Archive/package-cache use during installation is not a
runtime dependency on the old products.

robots 基目录 `/home/steven/src/groundwork`，预览端口 5180；`releases/<id>` 保留各版，
`current` 指向当前 `20260928-park-platform-01`。`/` 为园区、`/workbench` 为旧实验室、
`/maps` 为静态地图。保留 maps-02、integration-03；原 5173–5176 服务不停止或改用。
独立 Node/Python 路径见上表，SQLite 与 runs 在 release 之外；service.json 保存
进程身份，server.log 保存日志。

上述 SSH 命令分别查看、停止、启动 GroundWork。助手先核实 PID 命令身份，不能用于
其他服务；没有安装 systemd 或开机自启，重启机器后需要手工 start。这是获准应用
后台进程，不是周期监控代理。安装时复制现有第三方 Node 24.13.1 并离线克隆 PyChrono
环境到独立前缀，安装后的运行不依赖原产品目录；缓存复用不等于产品运行时依赖。

Release procedure: build/test locally; archive only application files, compiled
workspace packages, and runtime npm dependencies; extract into a **new** release
directory; stop only GroundWork; switch `current`; start and smoke-test. Never
overwrite a live release or use blanket `pkill` against Node/Python/Gazebo.
Rollback selects a retained release after stopping GroundWork; evidence remains
in `data/runs`. Do not select an older release whose schema cannot read newer data.

发布先本地构建测试，只打包应用、编译包和运行依赖，解压到**新 release**，只停
GroundWork，再切 current、启动和验收。不能覆盖运行版或用广泛 pkill。回滚前核实
旧版可读新数据库/实验类型；保留旧目录不等于已验证恢复。旧版不懂 park 任务时不能
盲目回退。上次包来自提交前工作区；后来的 `a634805` 不应当作旧包构建版本。

## Backup and recovery / 备份与恢复

Before any schema/release migration, record active release, application/engine
fingerprints, data paths and queued/running jobs. Use SQLite's backup mechanism,
or stop only GroundWork and copy the whole resource DB plus any `-wal`/`-shm`
sidecars and the runs directory to a new protected backup location. Do not copy
only a live database file; do not erase source data after backup.

迁移前记录 release、应用/引擎指纹、数据路径、排队/运行任务。用 SQLite 备份机制，
或只停止 GroundWork 后把数据库及存在的 `-wal`/`-shm` 边文件和 runs 复制到新的
受保护备份目录。不能仅复制正在运行的主库，也不能备份后删除原数据。

Test recovery on a **separate copy** with compatible code, explicit DB/run paths
and a different loopback port. Check resource/version counts, historical replay and
a synthetic run. Do not run two servers on one job directory. Restoring old data
can discard later records: compare versions and obtain approval before replacement.
There is no automatic restore, production recovery drill or old-schema migration
claim. Archive in the UI keeps history; it is not backup or a reversible restore UI.

用**独立副本**、兼容代码、明确数据库/实验路径和不同本机端口演练恢复；核对资源/
版本数量、历史回放和合成运行，禁止两个服务共用任务目录。旧备份覆盖会丢后续记录，
替换前比较并取得批准。没有自动恢复、生产恢复演练或旧 schema 迁移承诺；界面归档
保留历史，但不是备份，也没有恢复界面。

## Security boundary / 安全边界

This is a **trusted-LAN preview without authentication**, not internet-hosted SaaS.
Only explicitly allowed Host headers are accepted; browser POSTs must carry a
same-origin Origin header and JSON content type. The static server cannot serve
source-side server code, environment files, job files or arbitrary node_modules.
These guards are not a substitute for user auth, TLS or tenant isolation.

Anyone with access to the allowed LAN endpoint can read/write resources, read
experiments, start bounded jobs and cancel jobs. The maintainer explicitly selected
single-user/no-login for this batch. Use synthetic/non-sensitive data only. Do not add public
port forwarding, a public tunnel, real vehicle commands or external model calls
without explicit permission. Protect the data directory through OS permissions.

The job queue is single-process: do not start two servers sharing one data directory.
Workers are subprocess-isolated for cancellation, not a sandbox for arbitrary code;
requests cannot choose an executable, filesystem path or shell command. Monitor
disk usage; no automatic data deletion is enabled.

这是**可信局域网无认证预览**，不是公网 SaaS。只允许白名单 Host；浏览器 POST 需
同源 Origin 及 JSON。静态文件服务限制服务器源码、环境文件、任务文件和任意
node_modules 访问，但这些措施不能替代用户认证、TLS 或租户隔离。

所有可访问允许地址的人都能读写资源、查看/启动/取消有限任务。维护者明确选择
本轮免登录，只可用合成/非敏感数据。未经明确许可不能加公网映射、隧道、实机
命令或外部模型调用。以操作系统权限保护数据；队列是单进程，不可共享数据目录
启动两份服务。子进程用于隔离取消，不是任意代码沙箱；请求不能指定可执行文件、
路径或 shell 命令。需要人工关注磁盘容量，没有自动删除数据的保留策略。
