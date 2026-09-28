# Deployment / 部署

## Current Next.js deployment / 当前 Next.js 部署

Follow the paired root README for database creation, Prisma generation/migrations,
explicit empty-database seed, build, web and worker commands. No robots deployment
was performed for this refactor. / 按根目录双语 README 完成独立库、客户端生成、迁移、
显式空库初始化、构建、Web 与 worker 启动。本轮没有部署 robots。

- Web: `npm start`, loopback port 4173; development: `npm run dev`.
  Worker: `node --env-file=.env.local --import tsx workers/runner.ts`.
  Web and worker need the SAME database, working directory and artifact directory.
  两个进程须使用相同库、工程目录和轨迹目录；未启动 worker 时任务排队。
- Next.js loads `.env.local`; Prisma CLI, worker and seed/import scripts do not
  automatically do so. Use Node's `--env-file` or explicitly exported variables.
  Next 自动加载本地环境文件，其他命令需显式加载。
- Default artifact directory: `data/next-runs`; database and artifacts must be backed
  up together while writes/workers are stopped. Retain immutable source files.
  默认轨迹目录如上；停写并停止 worker 后同时备份数据库与文件，保留原始源文件。
- On a separately authorized LAN deployment, use
  `node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port <port>`
  and set `GROUNDWORK_ALLOWED_HOSTS` to exact hostnames/IPs (comma-separated, no ports).
  With a reverse proxy, set `GROUNDWORK_ORIGIN` to the external origin and enforce Host.
  LAN监听需另获授权并设置主机白名单；代理部署配置外部 Origin 且限制 Host。
- No login, users, roles or tenant isolation. Host/Origin checks do not authenticate.
  Firewall/VPN must restrict access; never expose this preview publicly.
  无登录、角色和租户隔离，来源检查不等于认证；需防火墙/VPN，禁止直接公网暴露。
- Generate Prisma on the target OS. Run the provider's reviewed migration before
  starting the new service. Do not use `db push` against existing data.
  在目标系统生成 Prisma，启动前执行对应迁移，不能对现有数据 db push。
- Optional `GROUNDWORK_CHRONO_PYTHON` and model gateway settings retain their explicit
  dependency/data-sending boundaries. Next telemetry is disabled in package scripts.
  Chrono 与模型网关仍需显式配置；模型调用会发送输入；包脚本禁用 Next 遥测。
- A preview worker is not a multi-host HA scheduler. Expired running leases become
  interrupted, never automatically successful. Reconcile cancelled/crashed artifacts
  before manual cleanup; do not delete source evidence to retry.
  预览 worker 不是多机高可用调度器；过期任务中断，清理前先核对证据。

See [database migration/recovery](database/README.md) before cutover.
切换前阅读数据库迁移与恢复流程。

## Historical legacy service / 以下为历史旧服务

The commands and robots state below belong to the old Node/SQLite service.
For that runtime replace `npm start` with `npm run legacy:start`; these are not
instructions for the new Next.js app. / 以下命令与 robots 状态属于旧 Node/SQLite 服务；
旧服务启动改用 legacy:start，不适用于新 Next.js。

Status below was last verified on 2026-09-28; it is not a live availability check.
下述部署状态最后验证于 2026-09-28，不是实时在线承诺。

## Local / 本机

```sh
npm ci
npm run build
npm start
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
