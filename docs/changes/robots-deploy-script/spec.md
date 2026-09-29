# Specification / 约定

Implemented as written; the initial script-only scope was later followed by an
explicitly authorized successful live deployment. [Evidence](review.md).
约定已实现；最初只实现脚本，随后另行获准完成实机部署，证据见自检。

- Fixed authorized target: SSH alias robots, VPN 10.9.0.20:5180, existing
  `/home/steven/src/groundwork`; Node/npm and user systemd must already exist.
  固定已授权目标及独立 Node/npm；不使用 sudo、Docker 或关闭 SSH 主机校验。
- `plan` and `status` are read-only; `deploy` requires `--apply` and a clean Git
  tree, archives an exact commit, and never sends local environment files.
  预览/状态只读；部署显式确认且要求干净工作区，仅上传精确提交，不发送本机环境文件。
- New release and Linux Prisma engines are checksum-verified. Build before
  stopping the live app. Reuse only remote mode-0600 configuration.
  校验源码包与 Linux Prisma 引擎；先构建后停旧服务，仅复用远端受保护配置。
- Require exact applied MySQL migration names/checksums, unchanged canonical
  schema, dedicated database/artifact paths, no queued/running jobs and owned units.
  迁移历史/哈希必须完全匹配，模型结构不变，专用库/轨迹路径及服务身份须校验，无待执行作业。
- Cutover stops only the two named units; health checks read APIs, never submit
  a run. On failure restore old code/services, not data; preserve failed release.
  只切换两个指定单元；验收只读不创建实验，失败恢复旧代码/服务但不回滚数据，保留失败目录。
- `start --apply` recreates missing transient units after reboot, refuses foreign
  units/ports; `logs` is explicit because logs may contain operational data.
  启动可重建临时单元，拒绝无关服务/端口；日志仅显式请求时读取。
- Tests must cover input validation, migration mismatches, command ordering,
  rollback and refusal paths. The original script-only turn required no live
  deployment; the later successful cutover is distinct from a failed-cutover drill.
  测试覆盖输入、迁移不匹配、执行顺序、恢复与拒绝；最初脚本阶段无需切换，后续成功切换不等于失败恢复实演。
