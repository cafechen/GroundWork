# Plan / 计划

## Follow-up deployment / 后续部署

2026-09-29: the maintainer explicitly requested using the script to deploy to
robots and fixing it if blocked. Actual `deploy --apply` refused the uncommitted
UI tree before any network writes; `status` confirmed both old services healthy.
维护者明确要求脚本部署并修复阻碍；实际部署因 UI 尚未提交在联网前被拒绝，旧服务正常。

The maintainer then requested “那你先提交吧。” Commit the reviewed UI, bilingual
documentation and deployment helper first, then deploy that clean revision.
The briefly started snapshot-mode alternative and its test were withdrawn;
no worktree bypass is shipped. Keep all schema, migration, queue and recovery gates.
维护者随后明确要求先提交；先提交已验收的 UI、双语文档和脚本，再部署干净版本。
刚开始添加的快照方案和对应测试已撤回，不交付工作区绕过选项，保留全部原安全门禁。

Sequence: core/Next/check/lint → commit → live build/cutover → read-only API/data/UI verification →
bilingual evidence. UI integration evidence remains in the UI change record.
顺序：检查、提交、实机部署、只读验收、双语记录。
These requests authorize commit and deployment, not push, auth, migration or
changes to other services. Recovery keeps the old release.
请求授权提交和部署，不授权推送、登录、迁移或其他服务变更；保留旧版本恢复。

## Original script-only plan / 最初仅实现脚本的计划

The maintainer's explicit request is the authorization to automate the already
performed preview procedure within the above bounds; no separate architecture or
schema approval is inferred. Implementation details receive same-session self-review.
维护者明确请求授权既有流程脚本化；不推定新增架构/结构审批，实施细节做同会话自检。

1. Add dependency-free local and remote Node helpers under `scripts/deploy/` and
   a `scripts/deploy-robots.mjs` entry. Add isolated Node tests under `tests/`.
   增加无新依赖的本地/远端助手、单入口和隔离测试。
2. Preserve the two existing transient unit names, paths and VPN binding.
   Require maintenance and identical migrations instead of automating untested
   MySQL backup/restore or changing databases. 保留部署约定，结构升级另行审查。
3. Add bilingual operator guide and README/index links. Run help/plan, core tests,
   Next unit tests, check, lint and local Markdown link checks. If reachable, run
   read-only remote status; do not perform cutover or database write tests.
   补双语手册、索引并执行相应检查；可达时只读检查状态，不做线上切换/数据库写测试。
4. Record actual evidence and limitations in review.md. Retain old release and
   artifacts. No automatic cleanup, DB migration, commit or push.
   记录实测和局限，保留旧版本与轨迹，不自动清理、迁移、提交或推送。
