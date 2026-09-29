# robots Next.js deployment / robots 新架构部署

Date / 日期: 2026-09-29. Release source / 发布源码: `baaa97b`.

Historical first Next.js cutover/import record. The current preview subsequently
updated to `2bfe8b2`; see [deployment status](../deployment.md) and
[script verification](robots-deploy-script/review.md). The hard-coded systemd
commands below reproduce the old release, **not the current restart procedure**.
Use `node scripts/deploy-robots.mjs start --apply` from a reviewed local checkout
for current-version startup after reboot; inspect partial service states first.
这是首次 Next.js 切换/导入历史记录，后来已更新版本。下方写死旧目录的命令仅记录旧版本，
**不是当前启动步骤**；当前重启后在审查过的本地代码中运行上述脚本，部分服务运行时先检查。

## Authorization and scope / 授权与范围

The maintainer requested deployment on robots, then chose the existing MySQL
server with a separate GroundWork database. The earlier explicit permission to
read Strategist's local DATABASE_URL supplies administrative connectivity only;
do not touch its business tables or copy its full environment to robots.
维护者要求在 robots 部署，随后选择现有 MySQL、另建 GroundWork 库。
之前允许读取 Strategist 本机 DATABASE_URL，仅用作管理连接，不访问其业务表，
不将完整环境文件复制到 robots。

Deploy the committed application without changing simulation/UI/schema behavior.
Retain legacy release, SQLite/WAL/SHM and run files; back up before import. New
runtime uses an isolated database, dedicated credentials and separate artifacts.
No public exposure, real devices, changes to other apps, Git push or automatic
boot installation. Only GroundWork preview processes are started.
部署已提交代码，不改仿真、界面和结构。保留旧版本、SQLite 边文件和实验文件，
先备份后导入；新服务使用独立库、专用凭证和轨迹目录。不开放公网、不接实机、
不改其他应用、不推送 Git、不安装开机自启，仅启动 GroundWork 预览进程。

## Plan and acceptance / 计划与验收

1. Confirm SSH identity, VPN address, port 5180 and old process/data state.
   确认 SSH 身份、VPN 地址、5180 占用、旧进程和数据状态。
2. Record exact release, back up stopped legacy data, upload only committed files
   into a new release and install/build for Linux.
   记录发布版本，备份已停止的旧数据，仅上传已提交文件，在新目录安装并构建 Linux 版本。
3. Create a new groundwork_* MySQL database and dedicated scoped account; keep
   secrets out of logs/Git. Migrate, dry-run old data import, apply and compare
   resource/revision counts and artifact hashes. Do not seed an imported database.
   新建专用库和限定账号，凭证不进日志/Git；迁移并预检导入，再执行并核对数量/版本/哈希，
   导入库不执行 seed。
4. Verify preserved history before enabling worker. Start Web on VPN 10.9.0.20:5180
   plus same-release worker, using user-scoped process management if available.
   先核实历史，再启用 worker；Web 仅监听 VPN 和 5180，配合同版本 worker，优先用户级管理。
5. Check API/page security, historical replay and a synthetic run with movement.
   Inspect desktop/mobile and language views. Record actual results and gaps.
   验收接口/页面安全、历史回放和合成运动实验，检查桌面/小屏及语言界面，如实记录缺口。

Recovery: stop only new GroundWork units; keep new MySQL/artifacts unchanged and
select the retained compatible legacy release with original SQLite/runs. After
new writes, switching back needs explicit data reconciliation, not silent loss.
恢复：只停新版 GroundWork 进程，保留新库/轨迹，使用原 SQLite/实验文件及兼容旧版；
新版已有写入后回切需明确核对数据，不能静默丢弃。

## Preflight / 预检

SSH robots resolves to 10.9.0.20 with the previously trusted host key. Raw IP SSH
did not have a trusted known_hosts entry; no host-key checking was disabled.
Host steven-omen-3070 is online; port 5180 is unused, legacy service is stopped.
Legacy current: 20260928-park-platform-01; data ~195 MiB; independent Node 24.13.1.
MySQL 8.0.21 at the configured host is reachable from robots; local administrative
connection can create a scoped account. Docker/sudo are not required or modified.
robots 别名匹配已信任密钥，直接 IP 缺已信任记录，未绕过密钥校验。
机器上线、5180 空闲、旧服务停止；旧版本及约 195 MiB 数据仍在，独立 Node 24.13.1。
现有 MySQL 8.0.21 可从 robots 访问，管理连接可创建限定账号，不需修改 Docker/sudo。

Local preflight: npm test (37), npm run check and npm run test:next (16) passed
on Node 22.23.2. Executed deployment results follow.
本机 Node 22.23.2 的核心 37 项、check、Next 16 项通过；实际部署结果如下。
Same-session self-review, not independent approval. / 同会话自检，不是独立批准。

## Deployed release / 已部署版本

- Commit: `baaa97b5cdd7799052422093d121e9f77395cc01`; archive SHA-256:
  `4e42c4f916f73849b78f3fcfe19f898adc4f893c20a19ad50bc1c0a433cbc305`.
- Release: `/home/steven/src/groundwork/releases/20260929-nextjs-baaa97b`.
  `current` selects it; `previous-nextjs-cutover-20260929` retains the old target.
  发布目录如上，current 已切换，旧目标另保留指针，不删除旧版本。
- Database: `groundwork_robots_20260929`, dedicated account `gwrobots20260929`
  restricted to source `10.9.0.20` and privileges on that database only.
  Random credentials are stored solely in the release's mode-0600 `.env.local`;
  administrative credentials were not uploaded. No Strategist business data touched.
  新库及专用账号仅允许 robots VPN 来源和该库权限，随机凭证仅写入远端 0600 环境文件，
  未上传管理凭证、未触碰 Strategist 业务数据。
- Artifacts: `/home/steven/src/groundwork/data/next-runs-20260929`.
  Backup: `/home/steven/src/groundwork/backups/20260929-pre-nextjs/data`.
  Original SQLite/WAL/SHM and runs remain at their original paths.
  轨迹和备份独立于 release，原始库、边文件和实验目录保留。
- Runtime: independent Node 24.13.1, npm 10.9.8; Linux production build.
  The old standalone Node had no npm; a pure-JS npm tool copy was placed in the
  GroundWork tools prefix, then all application dependencies installed on Linux
  with `npm ci --no-audit --no-fund`. No application dependency copy from macOS.
  旧独立 Node 缺 npm，补齐纯 JS 工具后在 Linux 按锁文件安装应用依赖，未复制 macOS 应用依赖。

Prisma's Node downloader failed TLS both directly and with the command-scoped
proxy, before migration. Downloaded exact-version Linux engines plus checksums
from the official `binaries.prisma.sh` commit
`c2990dca591cba766e3b7ef5d9e8a84796e47ab7`, verified locally and on robots:
Prisma 下载器发生 TLS 失败，迁移尚未开始；改从官方获取同版本 Linux 引擎及校验和，
本地与远端均核对：

| Engine / 引擎 | SHA-256 |
| --- | --- |
| libquery, debian-openssl-3.0.x | `a2924eab1c78a0a7bb67edac5738939fa10589ef073af5542f53812a22e4a7d8` |
| schema-engine, debian-openssl-3.0.x | `5d42b181631fd20bb0ecc5abcdba72575e7f467a0d52f4d5ef1ff28f0c74e6e9` |

Used `PRISMA_QUERY_ENGINE_LIBRARY` / `PRISMA_SCHEMA_ENGINE_BINARY` pointing to
the verified files under the new release's `node_modules/@prisma/engines` during
client generation/migration/build. No TLS/checksum bypass, dependency version
change, system proxy change or runtime proxy setting.
生成、迁移和构建时指定已校验的本地引擎路径；未跳过 TLS/哈希校验、未改依赖版本或系统/运行代理。

## Migration and verification / 迁移与验收

Executed on robots from the new release with its protected environment:
在远端新 release 中使用受保护环境执行：

```sh
node --env-file=.env.local scripts/prisma-provider.mjs --generate
node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy --schema prisma/mysql/schema.prisma
npm run build
node --import tsx scripts/import-sqlite.ts --source /home/steven/src/groundwork/backups/20260929-pre-nextjs/data/platform.sqlite
node --import tsx scripts/import-runs.ts --source /home/steven/src/groundwork/backups/20260929-pre-nextjs/data/runs
node --env-file=.env.local --import tsx scripts/import-sqlite.ts --source /home/steven/src/groundwork/backups/20260929-pre-nextjs/data/platform.sqlite --apply
node --env-file=.env.local --import tsx scripts/import-runs.ts --source /home/steven/src/groundwork/backups/20260929-pre-nextjs/data/runs --apply
npm test
npm run check
npm run test:next
```

These import commands are a record, **not repeatable initialization instructions**
for the now-populated database. No seed was run.
上述导入命令是执行记录，**不能对当前已填充数据库重复执行**，本次没有运行 seed。

| Check / 检查 | Observed result / 实际结果 |
| --- | --- |
| Full backup / 完整备份 | 153 files matched source SHA-256 before reading the copy / 读取副本前 153 文件与源哈希一致 |
| Migration / 迁移 | `202609280001_initial` applied successfully to the new DB only / 仅新库迁移成功 |
| Build + Linux tests / 构建与 Linux 测试 | Production build, 37 core tests, check (JS + TS), 16 Next tests passed / 全部通过 |
| Resource import / 资源导入 | 19 records: 8 maps, 6 models, 2 gateways, 3 parks; 34 immutable versions; 38 source audit events / 数量及内容核对通过 |
| History import / 历史导入 | 29 runs: 27 completed, 2 cancelled; 144 artifacts, 200,434,953 bytes; copied bytes and DB hashes verified / 字节及数据库哈希均核对 |
| Existing history / 原始历史 | Run `6f7ca3be-dd51-4a09-a2f4-17c462d273a0` returns COMPLETED and replays in the new UI / 原结果可通过新接口读取并回放 |
| New simulation / 新仿真 | Run `7bceca6e-3d9b-4fe7-a090-1b74b2ff8644`, queued→completed, COMPLETED, 54.530020589459085 m, 0 sampled contacts, max path error 0.02950015329433999 m, 65 s / 有实际运动、数值指标及报告 |
| Scope preservation / 原场景保持 | Existing demo park unchanged by running; total runs became 30 / 运行不改园区，实验总数变为 30 |
| HTTP / 接口 | Seven main/lab pages 200, Host and missing-Origin guards 403; result JSON and HTML report 200 / 页面、访问防护及导出通过 |
| Browser / 浏览器 | Both historical and new run: real polygon movement/seek, 3D canvas, JSON download, Chinese desktop/English mobile; zero page errors/external requests / 新旧回放、双语小屏通过，无页面异常或外部请求 |
| Recovery / 恢复 | Old release + separate backup copy on 127.0.0.1:5181 served 19 resources, 29 jobs and a completed replay; temporary units stopped / 独立副本恢复通过，临时服务已停 |

Screenshots and downloaded result are retained locally under
`artifacts/robots-nextjs-20260929/` (ignored by Git): `overview-zh.png`,
`replay-2d-zh.png`, `replay-3d-zh.png`, `replay-mobile-en.png`, `replay.json`.
Desktop 3D and mobile English screenshots were visually inspected.
截图及结果保留在上述忽略目录，已实际查看桌面三维和英文小屏截图。

### Findings and corrected check assumptions / 发现与验收脚本修正

- Current normalized park collections do not preserve old JSON insertion order
  (no ordinal columns). The first direct array comparison failed on an archived
  QA park. Current collections were then compared by entity ID/channel name;
  **all 34 historical snapshots, route-point order, values and artifact bytes
  remained strict comparisons**. No stored data or application code was changed.
  当前关系表列表不保证旧 JSON 插入顺序，首次直接数组比较在已归档 QA 园区失败；
  后续按实体 ID/通道名核对集合，全部历史快照、路线点顺序、数值和文件字节仍严格比较。
  未改数据或应用代码；列表顺序可能变化，不宣称逐项展示顺序保留。
- Node fetch's Host override was unsuitable for the probe; native HTTP and direct
  curl confirmed 403. Generic curl initially hit a local proxy; `--noproxy '*'`
  made the VPN check direct. No service security guard was relaxed.
  首次 Host 探针不合适，改原生 HTTP 与直连 curl 验证 403；未放宽服务校验。
- `/.env.local` returns Next's HTML not-found page with HTTP 200, not environment
  contents; unknown API paths return 404. Record this HTTP status nuance rather
  than claiming every unknown page returns 404. No credentials were printed.
  环境文件路径返回未找到 HTML、状态 200，不是环境文件内容；未知 API 为 404。
  如实记录页面状态差异，不声称所有未知页面都是 HTTP 404，未输出凭证。
- Legacy catalog includes audit/security/unavailable-map metadata. Recovery's
  first overly broad object comparison was corrected to compare the four actual
  resource collections, then the retained run count and result. It passed.
  旧目录接口含额外元数据，恢复检查改为明确核对四类资源、实验数及结果后通过。

## Process operations / 进程管理

Only VPN 10.9.0.20:5180 is bound. Two **transient user units**, restart-on-failure,
are running; no system units, sudo changes, linger or boot enablement were added.
They survive individual SSH command exits while the user manager remains alive,
but not a reboot/user-manager shutdown. Stop active jobs deliberately before restart.
只监听 VPN 端口，两个用户级临时单元支持失败重启；未新增系统服务、sudo 权限、linger
或开机自启。用户管理器存活时不依赖单次 SSH 会话，机器/用户管理器重启后须重新创建。

Current-session management / 当前会话管理：

```sh
ssh robots 'systemctl --user status groundwork-next-web groundwork-next-worker --no-pager'
ssh robots 'systemctl --user stop groundwork-next-web groundwork-next-worker'
ssh robots 'journalctl --user -u groundwork-next-web -u groundwork-next-worker -n 80 --no-pager'
```

To recreate absent units after reboot, first confirm VPN/DB reachability and port
5180 is free. Run these **on robots**, not while an existing unit is active:
重启后若单元已不存在，先确认 VPN/数据库可达、5180 空闲，再在 **robots** 执行，不能与现有进程重复：

```sh
systemd-run --user --unit=groundwork-next-web --description="GroundWork Next.js baaa97b preview" --working-directory=/home/steven/src/groundwork/releases/20260929-nextjs-baaa97b --property=Restart=on-failure --property=RestartSec=5 --property=TimeoutStopSec=30 --property=UMask=0077 --setenv=NODE_ENV=production --setenv=PATH=/home/steven/src/groundwork/.tools/node/bin:/usr/local/bin:/usr/bin:/bin /home/steven/src/groundwork/.tools/node/bin/node --env-file=.env.local node_modules/next/dist/bin/next start --hostname 10.9.0.20 --port 5180
systemd-run --user --unit=groundwork-next-worker --description="GroundWork simulation worker baaa97b" --working-directory=/home/steven/src/groundwork/releases/20260929-nextjs-baaa97b --property=Restart=on-failure --property=RestartSec=5 --property=TimeoutStopSec=30 --property=UMask=0077 --setenv=NODE_ENV=production --setenv=PATH=/home/steven/src/groundwork/.tools/node/bin:/usr/local/bin:/usr/bin:/bin /home/steven/src/groundwork/.tools/node/bin/node --env-file=.env.local --import tsx workers/runner.ts
```

The tested legacy recovery copy is retained at
`/home/steven/src/groundwork/recovery-check-20260929/data`; its temporary 5181
listener was stopped. No actual rollback of the new preview occurred. A MySQL
dump/restore drill, new Chrono physics run, PostgreSQL, exhaustive UI write tests,
boot persistence and public/multi-user security remain unverified/out of scope.
已测试的旧恢复副本保留，5181 临时监听已停，未实际回滚新服务。MySQL dump 恢复演练、
新 Chrono 物理实跑、PG、完整 UI 写测试、开机持久化及公网多用户安全不在本次验收范围。

Application files/migration bytes remain at the committed release. This turn
updates local deployment documentation only; no Git commit or push was requested
as part of deployment. No records or old releases were deleted.
应用和迁移保持已提交版本，本轮仅追加本地部署文档；部署请求未包含新 Git 提交或推送，
未删除记录或旧版本。
