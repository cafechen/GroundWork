# GroundWork development policy / 开发政策

Status: adopted as project guidance by the maintainer's request on 2026-09-28; enforcement is only as implemented below. / 状态：按维护者 2026-09-28 的请求建立项目指导原则；实际执行保障以文末清单为准。

Reference: [Anthropic — The AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook), consulted 2026-09-28. We use its lifecycle perspective; the requirements below are GroundWork-specific decisions, not a translation or a claim of Anthropic certification. / 参考其生命周期视角；以下是 GroundWork 的具体约定，不是原文翻译或认证声明。

## 1. Project constraints / 项目约束

GroundWork is a solo-maintained, local-first prototype for closed-yard towing/forklift validation. A change should improve inspectable engineering evidence, not merely demo appearance. Runtime independence from cloud accounts, honest physical assumptions and reproducible synthetic examples are primary constraints. / 本项目面向个人维护的封闭园区牵引车/叉车验证；改动应提升可检查的工程证据，而不只是演示效果。无需云账号、明确物理假设、可复现合成案例是优先约束。

The maintainer owns product priorities, model assumptions and permission to publish. An agent may propose or implement authorized changes; it cannot approve its own work on behalf of that maintainer. / 维护者决定产品优先级、建模假设和发布权限；代理不得代替维护者批准自己的成果。

## 2. Change records / 变更记录

For each substantive feature, model or contract change, create `docs/changes/<change-id>/` containing:

| Record | GroundWork-required content / 必填内容 |
| --- | --- |
| `intent.md` | Request source/date, affected users/product domains/engine components, desired result, exclusions, budget/data/hardware constraints, open questions; A/B/C/D applies only to legacy components / 请求来源和日期、用户与产品领域/引擎、目标、排除项、成本/数据/硬件约束、待定问题；A/B/C/D 仅用于历史模块 |
| `spec.md` | Coordinate/vehicle assumptions, input/output schema, boundary/error behavior, UI languages, acceptance cases with expected evidence / 坐标和车辆假设、输入输出契约、边界与错误行为、双语界面、验收案例及证据 |
| `plan.md` | Files, implementation order, alternatives, risks, commands and recovery approach; record acceptance before substantive coding / 文件、顺序、备选方案、风险、验证命令与恢复方式；实质编码前记录确认 |
| `review.md` | Results by acceptance case, exact checks, findings/severity, limitations, review identity and decision still needed / 按验收项记录结果、实际检查、问题与级别、局限、审查身份、待定决策 |

Statuses should say what happened: draft, maintainer-accepted, implemented, verified, released; never infer acceptance from the existence of a file. Record a conversation/issue/PR reference and the accepted scope. When Git history exists, include its revision; before it exists, say so. / 状态必须反映事实；文件存在不等于已批准。保留对话、issue 或 PR 引用和确认范围；有 Git 版本时记录版本，没有时如实写明。

Small documentation-only edits may combine these fields in one record. The initial policy adoption uses the [self-audit](audits/2026-09-28-ai-native-sdlc.md) as that combined record. Do not retrospectively manufacture approved planning documents for v0.1. / 小型纯文档修改可合并记录；本次采用自检报告作合并记录，不为 v0.1 伪造事前审批。

The repo is the canonical home for project decisions. README is an overview, AGENTS is the agent entry point, this policy owns the workflow, architecture owns current model conventions, and change records own individual decisions. Reference these records rather than creating contradictory copies. Policy changes require the maintainer's request or review. / 仓库是项目决策的唯一主记录；各文档分工明确，避免互相矛盾的副本。政策变更需要维护者请求或审查。

Use the [handoff field guide](sdlc.md) to record acceptance cases, decision scope,
revision, commands and evidence consistently. This explains the existing record
requirements; it does not authorize Git actions or install automatic gates.
使用交接字段说明统一验收项、决策范围、版本、命令和证据；它细化已有记录要求，
不授权 Git 操作、不安装自动门禁。

## 3. Verification proportional to risk / 按风险验证

| Change | Required evidence / 所需证据 |
| --- | --- |
| A: template/import | Valid round trip, invalid/range cases, no replacement of a valid run on failure / 有效往返、非法输入、不破坏已有结果 |
| B: geometry/motion | Analytic or independent reference cases where applicable, units/topology, changed metrics and step-size sensitivity; disclose missing real-world evidence / 适用时补解析或独立参考、单位拓扑、指标变化和步长敏感性，说明实测缺口 |
| C: traffic/device | Ownership and all-body release invariants, door timing, waiting/timeout and interacting-vehicle cases / 占用与完整车体释放、门时序、等待/超时及交互案例 |
| D: replay/report | Determinism, frame/event time alignment, matched comparison conditions, export provenance and HTML escaping / 确定性、帧事件时间、配对控制变量、导出溯源与转义 |
| UI | Exercise the changed flow and adjacent interactions, English/Chinese, desktop/mobile screenshots; inspect actual rendering / 变更及邻近交互、中英文、桌面/手机实际渲染 |
| Documentation | Relative links, command accuracy, bilingual consistency and distinction between current/planned capability / 链接、命令、双语和已实现/计划能力一致 |

Run `npm test` and `npm run check` before handoff. These commands do not establish physical accuracy, full static analysis or complete security coverage. Never use a screenshot as proof of collision mathematics or a passing unit suite as proof of usability. / 交付前执行核心测试和语法检查；它们不证明物理精度、完整静态分析或全面安全。截图不证明碰撞算法正确，单测不证明交互可用。

For a defect, record the failing case before the fix and preserve its acceptance intent. An assertion may change only when the requirement or the test itself is demonstrably wrong; explain the change and obtain review, rather than disguising a regression. / 缺陷修复先证明失败，保留验收意图；确需改断言时说明需求或测试错误的依据并审查，不掩盖退化。

Review findings must include a path, reproduction/evidence and impact. Prioritize wrong physical/operational results, data exposure, authorization violations and false claims over style. A one-agent self-check must be labeled as such. High-impact model/schema/security/release changes need maintainer review; independent domain review remains desirable when available. / 审查问题需有位置、证据和影响；优先处理错误结论、数据暴露、越权和虚假能力。单代理检查标为自检；高影响变更需要维护者审查，具备条件时增加独立领域审查。

## 4. Agent rules are testable inputs / 代理规则也要验证

Changes to AGENTS, future skills/hooks or agent configuration must describe expected behavior and representative checks. GroundWork starter cases: reject an unapproved customer-log upload; preserve a trailer-release assertion while fixing its implementation; label sampled collision limits correctly; retain the previous valid run after a malformed import. / 修改代理规则需说明预期行为及代表性检查：拒绝未经授权的客户日志上传、修复代码而保留拖车释放断言、正确标注离散碰撞局限、非法导入保留旧实验。

Running the application tests is **not** an agent behavior evaluation. Until an executable evaluation harness is added and actually run, report these as proposed cases, not passed evaluations. Do not spend API credits or schedule agents without authorization. / 应用测试不等于代理行为评估。没有实际运行评估程序，就只能称为候选案例；未经授权不消费 API 额度或启动定时代理。

## 5. Release and maintenance / 发布与维护

Current delivery is local preview, the explicitly approved trusted-LAN preview and downloaded evidence, not production deployment. Before a future release: identify the exact revision, provide verification/review evidence, define a recoverable previous version and a tested recovery procedure, and obtain publishing approval. Do not use destructive Git resets as a rollback policy. / 当前交付为本地预览、已获明确授权的可信局域网预览及导出，不是生产部署。未来发布须明确版本、验证审查证据、可恢复旧版本及经过验证的恢复步骤，并获得授权；不得把破坏性 Git 重置当作回滚策略。

For now, maintenance begins with a manually reported defect: save its minimum synthetic config, engine/runtime versions, expected/actual behavior and result; turn it into a change record and regression test. Real customer data requires separate permission and minimization. Autonomous monitoring, cloud logs and automatic remediation are not installed or implicitly authorized. / 当前由人工报告缺陷开始，保存最小合成配置、引擎/运行时版本、预期与实际，进入变更记录和回归测试。真实数据单独授权并最小化；未安装或默认授权自主监控、云日志及自动修复。

Track useful signals when records exist: first-pass check results, review-discovered defects, recurring failures, time to reproduce and independently reproduced scenarios. Do not invent historical productivity or reliability metrics. / 有记录后再跟踪首次检查、审查发现、重复缺陷、复现耗时及外部复现案例，不编造历史效率或可靠性指标。

## 6. Enforced today versus required next / 现有保障与后续要求

For dated evidence, see the [Next.js review](changes/nextjs-platform/review.md),
[UI review](changes/shadcn-admin-ui/review.md) and
[script deployment review](changes/robots-deploy-script/review.md).
The [pre-Next.js park audit](audits/2026-09-28-park-sdlc.md) is historical evidence.
带日期证据见 Next.js、UI 和脚本部署自检；迁移前园区审计保留为历史，不把初始采用记录当现状。

- Present: input validation; core/Next/engine tests; isolated MySQL/import and browser suites; CI configuration for build/JS/TS/lint/core/Next/engine/Python checks; same-schema robots deployment script with a verified successful cutover. / 已有输入校验、核心/Next/引擎、独立 MySQL/导入及浏览器测试；CI 配置构建/语法/类型/lint/核心/Next/引擎/Python 检查；同结构部署脚本及一次成功实机切换。
- Not verified: hosted CI runs and GitHub branch protection. A workflow file is not proof that remote checks ran or that merging is blocked on failure. / 未验证：远端 CI 运行及分支保护；配置文件不等于检查已运行或失败必然阻止合并。
- Not installed: test-edit protection, secret scanning hooks, enforced plan approval, agent eval harness, automated PR review, production deployment/recovery and autonomous monitoring. / 未安装：测试编辑保护、密钥扫描钩子、强制计划审批、代理评估、自动 PR 审查、生产发布恢复及自主监控。
- AGENTS/README/policy are behavioral instructions, not an OS sandbox or unbypassable gate. Respect the actual environment's controls; add automation in separately scoped, reviewed work. / 文档是行为指导，不是系统沙箱或不可绕过的门禁；自动化另行定范围和审查。

The [six-stage assessment](sdlc.md) records partial adoption. In particular, recent
intent/spec/plan files entered Git together with implementation, not as separately
approved stage commits. The preview deploy script does not validate a named human
approval; its recovery orchestration is unit-tested, not a live failed-cutover or
MySQL restore drill. Do not infer production readiness from successful preview deployment.
六阶段评估结论为部分采用；近期意图/规格/计划与实现同批提交，并非逐阶段审批提交链。
脚本不校验具名人工授权，恢复流程有单测但未实演失败切换或 MySQL 恢复；预览部署成功不代表生产就绪。

## Definition of done / 完成条件

- [ ] Scope, assumptions and acceptance are recorded; required decisions are accepted. / 范围、假设、验收已记录，必要决策已确认。
- [ ] Relevant tests/checks ran; skipped/unavailable checks are disclosed. / 检查已执行，未执行项明确披露。
- [ ] Review addresses model correctness, data/permission boundaries and requirement fit. / 审查覆盖模型、数据权限和需求符合性。
- [ ] English/Chinese documentation and actual behavior agree. / 双语文档与行为一致。
- [ ] Evidence is reviewable, residual risks visible, approval identity/status truthful. / 证据可审、风险可见、审批身份状态真实。
- [ ] Local work, Git commits, remote pushes and releases are reported separately. / 本地修改、提交、推送、发布分别报告。
