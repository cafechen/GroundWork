# Self-review / 自检

Follow-up on 2026-09-29: the maintainer requested live script deployment, then
explicitly requested committing first. Reproduced dirty-tree refusal; read-only
status confirmed both original services active. No safety-gate change is needed
to solve that refusal once reviewed changes are committed. The proposed worktree
snapshot alternative was withdrawn before delivery. Core 48 tests, Next 16 tests,
check/typecheck, lint and diff whitespace checks passed again before commit.
后续维护者要求实机部署并先提交；已复现脏工作区拒绝，旧双服务正常。提交后即可解决，
无需放宽保护；临时考虑的工作区快照方案已撤回。提交前复验核心48项、Next16项、
check/类型、lint和差异检查均通过。下文为最初脚本实现阶段的历史证据。

Date: 2026-09-29. Same-session implementation review, **not independent approval**.
Status: implemented locally, unit-checked and remote read-only checks passed;
the new script has **not performed a live cutover/reboot/recovery drill**.
日期 2026-09-29；同会话自检，**不是独立审批**。本地实现和单测、远端只读检查完成；
**未用新脚本实际切换、重启机器或演练恢复**。原手工部署证据不能替代脚本完整实机验收。

## Evidence / 证据

Local runtime: Node 22.23.2, macOS. Commands from repository root:
本机 Node 22.23.2、macOS，仓库根目录执行：

| Command / 命令 | Result / 结果 |
| --- | --- |
| `node --test tests/deploy-robots.test.js` | 11 passed, no skips / 11 通过，无跳过 |
| `npm test` | 48 passed, no skips / 48 通过，无跳过 |
| `npm run test:next` | 16 passed, no skips / 16 通过，无跳过 |
| `npm run check` | Maintained JS parsing + strict TypeScript passed / JS 语法及严格 TS 通过 |
| `npm run lint` | Existing src/workers/tests-next scope passed / 原有检查范围通过 |
| `node scripts/deploy-robots.mjs --help` | Bilingual commands rendered / 双语帮助正确输出 |
| `node scripts/deploy-robots.mjs plan` | Reports exact HEAD `baaa97b` and dirty tree, no remote writes / 正确报告版本和脏工作区，无远端写入 |
| `node scripts/deploy-robots.mjs status` | Both existing units active, three HTTP/JSON checks passed / 两服务运行，三个只读接口检查通过 |
| Actual `deploy --apply` with this dirty worktree / 当前脏工作区实际尝试部署 | Exit 1 before downloads/SSH, expected refusal / 下载和 SSH 前退出 1，符合拒绝预期 |
| Local Markdown link/whitespace scan + `git diff --check` | 46 Markdown files, 193 local links, no errors; includes untracked docs / 46 文档、193 本地链接，无错误，含未跟踪文档 |

An additional read-only SSH probe executed the helper's configuration, migration
checksum and idle-queue guards against the current release using its installed
Prisma client. All passed; credentials stayed on robots, no query wrote data.
Also verified `systemctl --user show` for a nonexistent unit returns `not-found`
with a successful status, matching the helper's reboot handling assumption.
额外通过 SSH 在当前版本以已有 Prisma 客户端只读执行配置权限、迁移哈希、空队列校验，
均通过；凭证未离开 robots，无数据库写入。核实不存在 systemd 单元的 show 返回
not-found 且退出成功，与重启后处理假设一致。

## Logic, security and scope / 逻辑、安全、范围

- Tests cover explicit mutation flags, Git-ref validation, quoting, safe release
  IDs, official engine hashes, dedicated configuration, exact migration history,
  real `simulationRun` delegate, two queue gates, success order and recovery errors.
  测试覆盖显式写操作、Git 参数、引用转义、版本路径、引擎哈希、配置和迁移历史、
  实际 simulationRun 仓储、两次队列门禁、切换顺序及恢复失败。
- Same-schema policy prevents implicit migrations and eliminates an untested
  automatic down-migration path. It does not prove data-format compatibility,
  database drift absence or a consistent backup. Maintain a reviewed backup plan.
  同结构策略避免隐式迁移及未经验证的反向迁移；不证明业务格式兼容、无结构漂移或
  已有一致备份，备份仍须单独审查执行。
- Only named owned user units are touched; VPN binding unchanged. Secret-bearing
  config/logs stay mode 0600 on robots; the tar and engines contain no local env.
  No sudo, Docker, Strategist dependency, public exposure or real robot control.
  只操作身份核对后的指定单元，保持 VPN 监听；远端配置/日志保持 0600，上传不含本机
  环境文件，不使用 sudo、Docker、Strategist、不暴露公网、不操作实机。
- Failure recovery is unit-tested orchestration, not a live recovery claim.
  Maintenance is operator-enforced; there is no application-wide write freeze.
  Forced termination/SSH loss can leave a stale lock/partial cutover. Inspect
  before retrying; retained releases/uploads are not automatically deleted.
  恢复流程经单元测试，不声称实机演练；维护窗口由操作者遵守，没有应用全局写锁。
  强制退出/SSH 丢失可能遗留锁或部分切换，须人工检查；不自动删除保留目录。
- No app/UI/schema change, so no new browser, physics, database-write/import or
  PostgreSQL integration runs this turn. No new production build/cutover, Git
  commit or push. Those require their own execution evidence/authorization.
  本轮不改应用/UI/结构，未重复浏览器、物理、数据库写入/导入或 PG 测试；
  未重新生产构建、线上切换、Git 提交或推送，这些需分别执行验收或授权。

Handoff: [operator guide](../../deploy-robots.md). Before the first use, review and
commit this work, ensure a maintenance window and verify the selected revision's
compatibility; retain the old release/data. / 交付前述操作手册；首次使用前审查提交，
安排维护窗口，确认目标版本兼容性并保留旧版本和数据。
