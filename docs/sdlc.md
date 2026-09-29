# AI-native SDLC evidence and handoffs / 证据与交接

[Policy / 政策](development-policy.md) · [Documentation / 文档中心](README.md)

Reference: [The AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook),
rechecked 2026-09-29. We use its six-stage loop and versioned handoffs; the table
below is a GroundWork assessment, not a certification or a verbatim implementation
of the article. Having four Markdown files does not establish complete adoption.
参考文章于 2026-09-29 复核；采用六阶段循环及版本化交接，以下是本项目评估，不是认证或
逐项照搬。存在四份 Markdown 不等于完整落实。

## Current evidence / 当前证据

Baseline: local `377415c`, deployed application `2bfe8b2`, on 2026-09-29.
This document does not query live service availability or hosted GitHub controls.
基准为上述本地和部署版本；本文件不代表本轮探测线上可用性或 GitHub 远端控制。

| Stage / 阶段 | Present evidence / 已有证据 | Gap / 缺口 |
| --- | --- | --- |
| Plan / 意图 | Requests, exclusions, constraints in [change records](README.md#change-history--变更历史) / 变更记录保存请求和边界 | Approvals mostly recorded from conversation; no separate stage commits for recent work / 多为对话批准，没有分阶段提交链 |
| Design / 设计 | Specs/plans and [18-table schema](database/README.md); [auth proposal](changes/shadcn-admin-ui/authentication.md) explicitly pending / 规格、计划、已批结构与待审登录方案分开 | Historical documents were committed with implementation, not proven pre-implementation gates / 同实现提交，不证明事前门禁 |
| Build / 实现 | Typed source, pinned dependencies, tests, bilingual manuals and source provenance / 类型代码、锁定依赖、测试、双语及来源 | AGENTS is guidance, not an installed enforcement hook / 代理说明不是已安装钩子 |
| Test / 验证 | Core/Next/engine suites, isolated MySQL/import/browser evidence; [CI configuration](../.github/workflows/test.yml) / 本地实测与 CI 配置 | No agent eval harness; hosted CI/required checks unverified; browser/DB/docs not in CI / 无代理评估，远端保障未验，部分检查仅本地 |
| Deploy / 部署 | Exact committed code, script guards, retained previous release, [live cutover evidence](changes/robots-deploy-script/review.md) / 提交、脚本门禁、旧版本及实机切换 | Self-review only; no enforced human approval hook, live failed-cutover or MySQL restore drill / 仅自检，无强制人工审批钩子及失败切换/数据库恢复实演 |
| Maintain / 维护 | [Troubleshooting](troubleshooting.md), manually reported defects and regression records / 排障、人工报障和回归记录 | No scheduled monitoring, deterministic alert bands, agent triage or measured incident SLA / 无定时监控、告警阈值、自动分诊及实测响应指标 |

**Assessment: partial adoption with explicit evidence, not strict end-to-end
enforcement.** Documentation repair can resolve inaccurate claims, but cannot
retroactively create approvals, independent review, passing evals or recovery drills.
**结论：有证据的部分采用，不是严格的端到端强制执行。** 文档修订能纠正声明，不能补造
事前审批、独立审查、评估通过或恢复演练。

## Reusable change record / 可复用变更记录

Use `docs/changes/<change-id>/{intent,spec,plan,review}.md` for substantive work;
the policy permits one combined record for bounded documentation-only work.
Each field below must contain evidence or explicitly say pending/not applicable,
with a reason. These are documentation fields, not newly installed automation.
实质变更用四文件，有限纯文档变更可合并；字段填实际依据或注明待办/不适用及理由。
以下是记录字段，不是新增自动化保障。

| Record / 文件 | Fields to fill / 填写字段 |
| --- | --- |
| intent.md | ID/date/owner; baseline revision; request source and original wording; problem/users/outcome; included/excluded scope; data/hardware/cost limits; unresolved decisions / 编号日期负责人、基准、请求原文、问题用户目标、范围约束及待定项 |
| spec.md | Accepted versus proposed decisions; affected contract/schema/coordinates/UI/security; numbered acceptance cases with expected results; unsupported/error cases; migration implications / 已批与待审决策、契约结构坐标界面安全、编号验收及边界、迁移影响 |
| plan.md | Decision record; paths/order; alternatives and deviations; risk; exact verification commands/isolated target; recovery and stop conditions; next handoff / 决策记录、文件顺序替代及偏离、风险、命令及隔离目标、恢复停止条件及交接 |
| review.md | Baseline and tested revision/tree status; acceptance→source→test→result mapping; failures before fixes; logic/security/scope findings with severity/path; evidence location; exceptions; residual risks; approval/release status / 版本与工作区、验收到代码测试结果映射、先失败证据、三级自检问题、证据、例外、风险和批准发布状态 |

Decision row: `date | actor | request/issue reference | accepted scope | rejected
or pending scope | recorded revision`. Copy only a short relevant user statement;
if no durable message URL exists, say “this conversation” and retain exact wording,
not an invented issue/PR number. An implementation approval is not commit, push,
deployment, schema-change or real-device authorization.
决策记录包含日期、主体、请求出处、确认范围、拒绝/待定范围和记录版本。无持久消息链接时
注明本对话并保留短原文，不编造 issue/PR；实施批准不自动授权提交、推送、部署、改表或实机。

Acceptance row: `case ID | source/contract | command + runtime + target | expected
result | actual result | evidence path | status`. Keep expectation and actual
result separate. “Planned”, “not run”, “failed”, “passed”, and “historical pass”
are different statuses; test counts must include failures/skips, not only passes.
验收行包含编号、代码/契约、命令运行时目标、预期、实际、证据和状态；计划、未跑、失败、
通过、历史通过不能混用，数量需包含失败/跳过。

## Release and incident handoff / 发布与缺陷交接

- Before an authorized deployment, name the exact commit and target, check the
  source tree, record test/review evidence, pending decisions, data/schema effects,
  maintenance window and recovery version. The script's `--apply` is an explicit
  operation flag, **not proof of maintainer approval**.
  获准部署前明确提交与目标、检查工作区，记录验收/待定项、数据影响、维护窗口及恢复版本；
  `--apply` 只是操作确认参数，**不是维护者审批证明**。
- After deployment, record the code revision separately from later documentation
  commits, result/health evidence, old release/data retention, actual recovery tests
  and remaining limitations. Do not redeploy merely to make a post-release report
  appear inside the source archive being reported on.
  部署后区分代码版本和事后文档提交，记录健康、保留项、实际恢复测试及局限；不为让事后报告
  出现在它描述的源码包内而无意义重部署。
- For a defect, record reporter/date, synthetic inputs and pinned versions,
  reproduction, expected/actual behavior, impact and evidence. Then add a failing
  regression, fix within approved scope, rerun unchanged assertions and link the
  result to the next change. Customer data needs separate permission/minimization.
  缺陷记录报告人日期、合成输入与版本、步骤预期实际、影响证据；进入失败回归、获准修复、
  原断言复验和后续变更链接。客户数据需单独授权和最小化。

No recurring agent, paid scan or new service is authorized by this document.
Next improvements require separately scoped implementation: portable remote
read-only UI QA (the latest probe was temporary), CI docs/browser/DB coverage,
agent-rule evals, approval enforcement and recovery drills. Owners/priorities
remain for the maintainer to assign; no invented dates or performance statistics.
本文不授权定时代理、付费扫描或新服务；可移植远端只读 UI 验收（最近探针为临时文件）、
CI 文档/浏览器/实库、代理规则评估、审批保障及恢复演练另行立项，负责人和优先级待维护者安排。
