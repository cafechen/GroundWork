# AI-native SDLC self-audit / 开发流程自检

Historical initial-adoption audit, before `1683576`; do not read its “no HEAD” or
Node 20 statements as the current state. See the [park-platform audit](2026-09-28-park-sdlc.md).
这是 `1683576` 前的初始采用记录；“无 HEAD”和 Node20 等属于当时，不是当前状态，
最新情况见[园区平台自检](2026-09-28-park-sdlc.md)。

Date: 2026-09-28. Reviewer: the same implementation assistant; this is **self-review, not independent assurance**. / 审查者为原实现代理，不是独立审计。

Reference: [The AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook), read on the audit date. Assessment below is of GroundWork's actual files and available development-session evidence, not an official compliance score.

## Request, scope and plan / 本次请求、范围与计划

Source: the maintainer's conversation request to self-check development against the linked playbook and make it the overall principle in README and AGENTS. / 来源：维护者在当前对话要求自检，并将原则写入 README 和 AGENTS。

Authorized scope: inspect source/workflow/tests, rerun local checks, update both READMEs, add AGENTS, document project policy and findings. / 授权范围：检查实现、流程、测试，复跑本地检查，更新双语 README，新增 AGENTS、政策和自检结果。

Plan: read the reference → examine repository evidence → distinguish implemented controls from missing ones → write bounded project rules → validate tests and document links. No simulation behavior changes, remote writes, paid services or production automation. / 计划：阅读原文、检查证据、区分现状缺口、写项目规则、验证测试与链接；不改仿真行为，不写远端，不接付费服务或生产自动化。

The maintainer requested adoption of the reference, not approval of a retrospectively invented v0.1 plan. This document records the current assessment; it is not a backdated approval. / 维护者授权采用参考原则，不等于追认一份不存在的 v0.1 事前计划；本记录不倒签审批。

## Verdict / 结论

**Partial alignment. The prototype has an implementation/verification loop, not a complete AI-native delivery lifecycle.** / **部分符合：已有实现与验证循环，未形成完整的 AI-native 交付生命周期。**

Initial development used the conversation's A/B/C/D scope, produced executable code, ran core checks, exercised the browser and documented model limitations. It did not establish an approved repository-level intent/design/implementation record before coding. Tests were added after the first engine implementation; this is not evidence of test-first development. / 初始开发围绕对话中的四模块需求，完成代码、测试、浏览器检查和模型边界说明；编码前未建立经确认的仓库级需求、设计、实施记录。测试在初版引擎之后添加，不能称为测试先行。

## Evidence by stage / 按阶段检查

| Area | Finding before this change / 修改前发现 | Evidence / 证据 | Disposition / 处理 |
| --- | --- | --- | --- |
| Plan | Partial: goals in conversation/README, no per-change intent or acceptance record / 目标存在，但缺变更级意图及确认记录 | READMEs and prior conversation | Future substantive work requires explicit change records; do not backfill approval / 后续要求记录，不补造审批 |
| Design | Partial: architecture/model limits exist, no separately accepted pre-build spec / 有架构与模型边界，无事前设计确认 | `docs/architecture.md`, README model contract | Document model/contract decisions and tests before future changes / 后续先明确模型、契约和验收 |
| Build | Partial: core/UI separation and deterministic engine; no AGENTS or accepted file-level plan / 有核心分离与确定性，缺代理规则与确认计划 | `src/core/*`, `src/app.js`; no original `AGENTS.md` | AGENTS and policy added now; no claim initial work followed them / 本次补规则，不声称此前已遵守 |
| Test | Local checks present; oracle independence and automation coverage incomplete / 本地检查已有，独立判据和自动化覆盖不足 | 13 core tests; `scripts/browser-smoke.mjs`; `.github/workflows/test.yml` | Keep checks; record missing agent evals, independent physics references and hosted browser CI / 保留验证并记录缺口 |
| Deploy | Not established; local preview only / 未建立，仅本地预览 | No HEAD commit, no release pipeline in repository | No release claim; review/publish/recovery must be authorized separately / 不声称已发布，后续另行审批 |
| Maintain | Defect-prevention tests exist; no operational feedback automation / 有回归案例，无运维反馈自动化 | README says no telemetry; no monitor/incident workflow | Start with manual reproducible defects; do not introduce monitoring silently / 先用人工复现问题闭环 |

## Concrete gaps / 具体缺口

1. **Audit trail:** `git rev-parse --verify HEAD` fails because no first commit exists; `git status` shows the prototype as untracked. No repository-level approval/commit chain can be claimed. / 无首次提交，不能声称已有仓库级审批和提交审计链。
2. **Checks are narrower than the label suggests:** `npm run check` only parses five JavaScript files; it is not lint/type checking and does not explicitly include `src/i18n.js` or scripts. / check 只做五个 JS 文件的语法检查，不能宣称全量静态分析。
3. **CI is configuration, not observed execution:** the workflow lists Node 20/22/24, core tests and syntax checks; no browser job or agent-evaluation job is defined. Hosted runs and remote branch protection were not inspected. / CI 配置不等于实际运行；没有浏览器和代理评估任务，未检查远端运行及保护设置。
4. **Test independence:** resource tests reuse the engine's geometry helpers; this checks consistency but can share the same geometry defect. No independent real-vehicle calibration or analytical trajectory suite was found. / 部分测试与引擎共用几何工具，可能共享错误；尚无实车标定或独立解析轨迹测试集。
5. **Review and guardrails:** no independent reviewer, enforced test protection, secret-scanning hook or plan-approval hook is established. No such service was installed in this change. / 无独立审查或上述强制门禁，本次不擅自安装服务。
6. **Process measurement:** no committed change/release history supports cycle-time or reliability improvement claims. / 缺少提交和发布历史，不能量化声称流程效率或可靠性提升。

These are development-process findings, not a full security or physics audit and not proof that the application has no other defects. / 这是流程自检，不是全面安全或物理审计，也不证明程序没有其他问题。

## Verification / 验证

- Runtime for this audit: Node v20.15.0, npm 10.8.1 on the local macOS workspace. / 本轮运行环境如上，不代表 Node 22/24 的远端结果。
- Reran `npm test` during this audit: **13 passed, 0 failed, 0 skipped**, exit 0. / 本次复跑核心测试通过。
- Reran `npm run check`: exit 0 for the five listed files. / 本次五文件语法检查通过。
- Previous implementation session: browser smoke passed in Chromium 153.0.8010.53 for A/B/C/D, playback, bilingual UI, batch, import/export, 390/320 px overflow, no page errors or external requests. Evidence remains in ignored `artifacts/` and README screenshots. **Not rerun for this documentation-only change.** / 浏览器验收为上轮证据，本轮纯文档修改未重跑。
- After edits, a Node filesystem check passed for **5 documents and 24 relative links**, including the reference URL, final newlines and trailing whitespace. No GitHub CI, branch protection or production deployment was exercised. / 修改后文件检查通过：5 份文档、24 个相对链接、来源链接、末尾换行与行尾空白；未执行远端 CI、分支保护或生产部署验证。

## Changes and remaining work / 本次改动与后续

Added the project principle to both READMEs; introduced `AGENTS.md` and `docs/development-policy.md`; retained this audit. Application code, tests and CI behavior are unchanged. / 本次仅补双语原则、代理规则、开发政策和自检记录，不改应用、测试或 CI 行为。

Next priorities (not performed): obtain maintainer review and authorization for an initial commit/push; define the next model improvement with explicit acceptance; strengthen independent reference tests and reproducible browser CI; then add deterministic guardrails and evaluated agent workflows as separately approved changes. Production monitoring is deferred while there is no production service. / 待办而非已完成：维护者审查并授权首次提交/推送；为下一项模型改进先写验收；补独立参考测试与可复现浏览器 CI；再逐项批准硬性门禁和代理评估。没有生产服务时不引入生产监控。
