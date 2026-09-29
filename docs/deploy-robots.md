# Deploy to robots / 自助部署到 robots

This helper repeats **same-schema updates of the existing Next.js preview**.
It is not a fresh-machine installer, MySQL provisioning tool or production release system.
本脚本用于**现有 Next.js 预览的同数据库结构更新**，不是新机器安装器、MySQL 建库器或生产发布系统。

## Quick commands / 常用命令

Run locally from the GroundWork repository, using Node **22.19+**, Git, SSH/SCP
and curl. `ssh robots` must already work with a trusted host key; connect the VPN.
The server needs the existing independent Node/npm, user systemd, tar and ss.
在本机 GroundWork 根目录执行，需 Node 22.19+、Git、SSH/SCP、curl 和 VPN；
先确认 `ssh robots` 可用且主机指纹可信。远端沿用独立 Node/npm、用户 systemd、tar 和 ss。

```sh
# Read-only plan and remote status / 只读计划与远端状态
node scripts/deploy-robots.mjs plan
node scripts/deploy-robots.mjs status

# Review, test and commit your changes first. Then deploy HEAD:
# 先审查、测试并提交改动，再部署 HEAD：
node scripts/deploy-robots.mjs deploy --apply

# Or an explicitly reviewed commit/tag / 或已审查的提交、标签：
node scripts/deploy-robots.mjs deploy --apply --ref YOUR_COMMIT_OR_TAG

# After robots reboots and VPN is ready / robots 重启且 VPN 就绪后：
node scripts/deploy-robots.mjs start --apply

# Troubleshooting / 排查
node scripts/deploy-robots.mjs logs
node scripts/deploy-robots.mjs --help
```

Open **http://10.9.0.20:5180**. Deploy requires a clean working tree, including
untracked files; it never commits or pushes for you. Only the selected commit is
archived, not your working files, `.env.local`, dependencies or build output.
`plan` prints the commit and dirty status without SSH/downloads/writes; it is not
a remote readiness test. `status` reads service state and checks APIs when both
services are active; inactive states are reported, not automatically repaired.
访问上述 VPN 地址。部署要求工作区干净（含未跟踪文件），不会代你提交或推送；
只打包指定提交，不打包工作文件、本机配置、依赖或构建产物。
plan 仅本地展示版本和脏状态，不连接远端、不下载、不写文件，不等于远端就绪检查。
status 读取服务状态，两服务均运行时检查接口；停止状态只报告，不自动修复。

**Maintenance window:** finish/cancel all queued/running jobs and stop using the
UI/API during deployment. This single-user preview has no global maintenance-mode
write lock. Do not run another deployment/restart or submit jobs concurrently.
**维护窗口：**先完成或取消排队/运行任务，部署期间停止操作页面和接口。
单用户预览尚无全局维护模式写锁，不要同时部署、重启或提交作业。

## What happens / 脚本做什么

1. Resolve an exact Git commit; reject dirty trees and tracked `.env*` secrets
   (the committed `.env.example` is allowed). Create a unique release archive.
   确定精确提交，拒绝脏工作区及受跟踪环境秘密文件（允许 .env.example），创建唯一版本包。
2. Download **Linux x64 Debian/Ubuntu OpenSSL 3** Prisma engines on the local
   computer, using the engine commit in that revision's lockfile. Check official
   uncompressed SHA256, upload, and verify SHA256 again on robots. HTTPS/SSH
   verification is never disabled. This avoids robots' previously observed Node
   TLS download problem; local curl still needs official-source network access.
   本机按锁文件版本下载 Linux Prisma 引擎，核对官方解压后 SHA256，上传后再校验；
   不禁用 HTTPS/SSH 校验。避开此前远端 Node 下载问题，本机仍需能访问官方源。
3. Create a release under `/home/steven/src/groundwork/releases/`; copy the
   **remote current release's mode-0600 `.env.local`**, retaining its dedicated
   MySQL connection and external artifact directory. Run `npm ci` and production
   build there while the previous release continues serving. Build/install logs
   stay in that release, mode 0600; they may contain sensitive diagnostics.
   新建 release，复用远端 current 的 0600 环境文件、独立库和外部轨迹目录；
   旧服务运行时安装构建。构建日志留在新目录、权限 0600，可能含敏感诊断信息。
4. Refuse changes to the canonical Prisma schema or any unapplied, missing,
   failed or checksum-mismatched migration. Confirm the service identities and
   empty job queue. Stop Web, recheck the queue, then stop worker.
   拒绝 Prisma 结构变化、迁移遗漏/未执行/失败/哈希变化；检查服务身份和空队列，
   先停 Web，再查队列，最后停 worker。
5. Start both new transient user services on the original VPN IP/port. Read `/`,
   `/api/platform`, `/api/runs`; require both services active. Then atomically
   switch `current`, retaining `previous-<release-id>` and `deployment.json`.
   启动新 Web/worker，仍仅监听原 VPN 地址；只读检查首页/资源/实验接口及进程状态，
   成功后原子切换 current，保留上一版本链接和部署清单。

No automatic seed/import, MySQL account/database creation, migrations, backup,
data deletion, Gazebo installation, real-device operation, firewall change or
sudo. No test job is submitted. HTTP checks do not prove animation or physics.
The separate worker is still required; this does not merge it into Next.js.
不自动初始化、导入、建账号/库、迁移、备份、删数据、安装 Gazebo、操作实机、改防火墙
或使用 sudo，不提交测试作业；接口验收不证明动画或物理精度，worker 仍是独立进程。

## Failure and recovery / 失败与恢复

- Before cutover, a download/build/schema/queue failure leaves the old service
  alone. Failed release/upload directories remain for diagnosis; no automatic
  retention cleanup is installed. / 切换前失败不影响旧服务；失败目录/上传包保留，无自动清理。
- During cutover, caught failures attempt to restore old code/services. This is
  **not database rollback**: writes already accepted by either version remain.
  Review code/data compatibility even when the schema is unchanged.
  切换中捕获异常会尝试恢复旧代码和服务，**不是数据库回滚**；已接受的数据写入仍保留，
  即使表结构不变也须审查业务数据兼容性。
- Power loss, forced termination, SSH interruption or failed recovery may require
  manual intervention. Inspect `status`, `logs`, `current`, `previous-*`, private
  build logs and `.deploy-lock/owner.json` before retrying. Only remove a stale
  lock after confirming its PID is no longer running and reconciling service
  working directories with `current`. Do not blindly delete data, release trees,
  lock directories or kill all Node processes.
  断电、强制退出、SSH 中断或恢复失败可能需人工处理；先查状态、日志、软链、构建日志
  和锁内 PID。确认旧进程不存在且服务目录与 current 一致后才清理过期锁；
  不盲删数据、版本、锁或批量杀 Node。
- If the database schema changes, stop and use a reviewed migration/backup plan
  in [deployment](deployment.md). The helper deliberately has no `--force` or
  `--migrate` bypass. Database dump/restore has not been drilled on this server.
  结构变化应使用另行审查的备份/迁移计划，没有 force/migrate 绕过参数；
  当前机器尚未完成 MySQL dump/restore 演练。
- `start --apply` is idempotent when both services are healthy. After reboot it
  recreates missing transient units and may process already queued jobs. If only
  one service is running, it refuses and asks for inspection. **No boot autostart**:
  the user manager still has `Linger=no`; services depend on that manager's lifetime.
  两服务正常时 start 不重复启动；重启后重建临时单元，可能开始执行已有排队任务。
  仅一个服务运行时拒绝自动处理。**未配置开机自启**，用户管理器仍为 Linger=no。

Fresh-machine/database setup and one-time SQLite/run imports remain separate,
explicit procedures in [deployment](deployment.md) and [database guide](database/README.md).
There is no dependency on Strategist credentials. Do not rerun imports against the
deployed database. For evidence, see [script self-review](changes/robots-deploy-script/review.md)
and the [original successful deployment](changes/robots-nextjs-deployment.md).
新机器/数据库安装及一次性 SQLite/实验导入按独立手册显式执行，不依赖 Strategist 凭证，
不向已部署库重复导入。脚本自检和原部署的实测证据分别记录，不能混称。
