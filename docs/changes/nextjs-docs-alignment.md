# Next.js documentation alignment / Next.js 文档与代码对齐

Date / 日期: 2026-09-28. Base implementation / 对照代码: `03c88d2`.
Maintainer request / 维护者请求: “请将文档和代码保持一致并提交。”

## Scope and plan / 范围与计划

This request authorizes correcting bilingual documentation and committing it
locally. It does not authorize new application behavior, push, remote deployment
or database changes. Keep historical evidence as historical, not rewrite past results.
本次授权修正文档并本地提交，不新增应用行为、不推送、不部署、不改数据库；
历史证据保留为历史，不重写过去的验收结果。

1. Match current React controls in the park manual, quickstart and troubleshooting.
   园区手册、入门和排障按当前 React 控件与流程重写。
2. Correct queued/running restart semantics using workers/runner.ts.
   根据worker实现修正排队/运行中任务重启语义。
3. Document a manual VPN deployment and MySQL backup/recovery procedure, explicitly
   unexecuted on robots; the existing service.py remains legacy-only.
   补手工VPN部署及MySQL备份恢复步骤，明确robots尚未执行，service.py仅适用旧版。
4. Update current status/index/test guidance; retain historical manuals and screenshots
   with clear labels. Pair English/Chinese meaning, not just language presence.
   同步状态、索引及测试指引，旧手册截图明确标历史，逐段核对中英文含义。
5. Check local links, commands against checked-in scripts, documentation regressions,
   npm test/check and the staged diff; commit only this scoped documentation change.
   检查链接、命令、已发现文档错误、核心测试/check及暂存差异，仅提交本次文档改动。

## Evidence and limits / 证据与局限

Pre-change inspection found stale position-picking/route-saving guidance,
contradictory seed translations, inaccurate restart behavior and “not committed”
status after 03c88d2. No remote commands are part of this correction.
修改前已发现点选/路线保存旧说明、seed译文矛盾、重启语义及提交状态错误；
本轮不执行远端命令。以下为同会话自检，不是独立审查。

## Delivered and source checks / 完成内容与代码核对

- Replaced the obsolete park manual with current resource forms, scene tools,
  route/device/task workflow, replay/export controls and MySQL persistence.
  Checked `src/features/resources.tsx`, `src/features/parks.tsx`, shared contracts
  and the run service; no runtime code changed.
  按资源/园区 React 实现、共享契约及实验服务重写操作手册，不改运行代码。
- Corrected worker restart/lease behavior, API origin override and run-list limits
  against `workers/runner.ts`, `src/server/http.ts` and `src/server/services/runs.ts`.
  按源码修正重启租约语义、Origin 覆盖和实验列表上限。
- Aligned paired READMEs, explicit seed/worker setup, test build order and separate
  import-test environment. Added manual VPN deployment and MySQL recovery steps;
  marked `scripts/service.py` as legacy-only and remote procedures unexecuted.
  同步双语 README、显式初始化/worker、先构建后测试及独立导入测试环境；
  补手工 VPN 部署和 MySQL 恢复，明确旧助手边界及远端步骤未执行。
- Updated status/index/roadmap and current-review links without rewriting historical
  test results. AGENTS edits clarify existing current/legacy command and translation
  ownership; expected behavior is to select the matching UI test suite and maintain
  React copy, not route new UI work through the old server/i18n file. Checked both
  language sections against package scripts and source. No new permissions, hooks,
  or agent-behavior evaluation results are introduced.
  更新状态、索引、路线图及自检入口，不倒填历史结果。AGENTS 仅厘清当前/旧版命令及
  翻译归属，预期按界面选择验收脚本、维护 React 文案，不误用旧服务器/i18n；
  中英文已按包脚本与源码核对，不新增权限、钩子或虚构代理评估通过。

## Verification / 验证

Run from the repository root on macOS with Node 22.23.2. This documentation-only
turn reran the following; earlier MySQL/browser evidence remains in the implementation
review and is not claimed as a new execution here.
本轮在仓库根目录、macOS/Node 22.23.2 执行以下检查；旧 MySQL/浏览器证据保留在实现自检，
不冒称本轮重新执行。

| Check / 检查 | Result / 结果 |
| --- | --- |
| `npm test` | 37 passed, zero failed/skipped / 37 项通过，无失败/跳过 |
| `npm run check` | Maintained JS parsing and strict TypeScript passed / JS 语法及严格 TS 通过 |
| `npm run test:next` | 16 passed, zero failed/skipped / 16 项通过，无失败/跳过 |
| Documentation check from `docs/testing.md` | 40 documents, 173 local links, zero missing files/whitespace/language-presence errors / 40 文档、173 本地链接，无缺失文件、空白或语言存在性错误 |
| Source/translation review | Current UI commands, worker semantics, package commands and paired language meaning checked manually / 人工按代码核对当前界面、worker、包命令及双语含义 |
| `git diff --check` | Passed; untracked documentation included in the separate document scan / 通过，未跟踪新文档另纳入文档扫描 |

No application/schema/dependency/migration-byte changes, database operations,
network deployment or push. Production build, browser QA, database integration,
PG runtime tests and the new backup/restore runbook were **not rerun/executed** in
this documentation turn. Link checks do not validate web availability or anchors.
Local commit is authorized by the request; final staged-file inspection precedes it.
本轮无应用、结构、依赖或迁移字节修改，无数据库操作、部署或推送；未重跑生产构建、
浏览器、实库/PG 验证，也未执行新增备份恢复流程。链接检查不验证外网和锚点。
维护者已授权本地提交，提交前再核对暂存文件范围。
