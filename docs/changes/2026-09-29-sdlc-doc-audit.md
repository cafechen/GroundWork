# SDLC documentation audit / SDLC 文档审计

## Intent and authorization / 意图与授权

Date: 2026-09-29. Baseline: `377415c` (documentation), `2bfe8b2` (deployed code).
Maintainer request in this conversation: check strict AI-native SDLC alignment
and complete documents that are missing or inconsistent with code.
日期如上；维护者在本对话要求检查 SDLC 文档规范，并补齐缺失及与代码不一致的内容。

The initial request was a documentation-only correction under the existing policy's combined-record
exception. Authorized: read source/history and update bilingual documentation.
Excluded: application/schema/test changes, remote mutations, commit/push, new hooks,
scheduled agents, paid evaluations, or retroactive approval claims.
本次按既有政策采用纯文档合并记录；授权读代码/历史和修订双语文档，不改应用、结构、测试，
不改远端、不提交/推送、不安装钩子或定时代理、不消费评估额度、不补造历史审批。

### Subsequent commit authorization / 后续提交授权

The maintainer then explicitly requested “改完后提交吧。” This authorizes a local
commit of these 25 reviewed documentation files after final scope/link/whitespace
checks, not a push, redeployment or application change. The audit-stage “no commit”
statements below describe the earlier checkpoint, not this subsequent authorization.
维护者随后明确要求“改完后提交吧。”，授权最终范围、链接及空白检查后本地提交这25份文档，
不授权推送、重新部署或改应用。下方审计阶段“未提交”描述为较早检查点，不代表此次授权。

## Specification and plan / 规格与计划

1. Compare the linked playbook with the repository policy and actual artifacts;
   distinguish written guidance, executable checks and verified enforcement.
   对照参考文章、项目政策与实际产物，区分书面约定、可执行检查和已验证的强制保障。
2. Inspect current manuals against routes, schema, worker, UI, tests and deployment
   script; inspect Git history for stage/release provenance. Preserve historical
   evidence with explicit labels and current links instead of rewriting old outcomes.
   对照路由、结构、worker、UI、测试、脚本和 Git 历史；历史证据保留并明确标注，不改写旧结果。
3. Correct current pointers, approval/status ambiguity and stale capability claims;
   add reusable handoff fields and an evidence/gap matrix. No claim of complete
   adoption where hooks, agent evals or independent review do not exist.
   修正入口、审批/状态歧义和过时能力，补交接字段及证据/缺口矩阵；未实现保障不冒称完成。
4. Run documented local Markdown checks, core tests and check/typecheck; record
   exact results separately from prior UI/remote verification. Review the final
   diff for documentation-only scope, bilingual meaning and no credentials.
   执行本地文档检查、核心及类型检查；本次结果与历史 UI/远端验收分开，复核纯文档范围和双语。

Acceptance: current pointers match Git/source; each found inconsistency has a
source path and disposition; unverified gates stay explicit; local links resolve;
no code/database/deployment changes. Recovery: reverse only this documentation
diff after inspection, never reset application work or historical data.
验收：入口与代码/历史吻合，发现有依据和处理状态，缺口显式、链接有效，不改代码/数据库/部署。
恢复仅撤回本次文档差异，不重置应用改动或数据。

## Review / 自检

Completed local documentation correction; uncommitted at the audit checkpoint. Same-session assistant
self-review, not independent approval or certification. The
[six-stage evidence matrix](../sdlc.md) concludes **partial adoption**, not strict
end-to-end enforcement. No historical approval/test outcome has been fabricated.
审计检查点时本地文档修订完成、尚未提交；同会话代理自检，不是独立批准或认证。六阶段矩阵结论为
**部分采用**，不是严格端到端强制执行；未补造历史审批或测试结果。

### Findings and dispositions / 发现与处理

Severity refers to documentation/operational impact, not a new security rating.
Before-edit evidence was read directly from baseline files and Git/source; no
application regression was fixed, so no artificial failing code test was added.
级别仅描述文档/操作影响，不是新增安全评级；修改前证据来自基准文件、历史及源码。
本轮未修应用缺陷，不编造失败代码测试。

| ID / 编号 | Finding and evidence / 发现与依据 | Disposition / 处理 |
| --- | --- | --- |
| D1 · medium / 中 | `docs/README.md` still named baaa97b as current; Git has code 2bfe8b2 and evidence 377415c / 索引落后于已记录部署 | Updated current pointer, separated source/evidence commits / 修正并区分代码与事后文档提交 |
| D2 · medium / 中 | Next.js intent/spec/plan/review and database guide still said robots pending or isolated-tests only, despite deployment/import record / 状态未同步 | Current status plus explicitly historical sections; retain old outcomes / 同步现状并标历史，不改旧结果 |
| D3 · medium / 中 | First deployment record contains hard-coded baaa97b startup paths; current deployment guide referred back to that record / 重启指引可能启动旧版本 | Historical warning and current-version script startup guidance / 标历史并指向 current 启动脚本 |
| D4 · medium / 中 | UI intent's Chinese text still said scope pending; original UI/deploy plans said no commit/cutover / 中英文及阶段权限混用 | Separate accepted UI, pending auth and later commit/deploy requests with review links / 区分已批 UI、待审登录、后续提交部署授权 |
| D5 · low / 低 | Roadmap omitted template UI/script delivery and still marked commit-bound manifests pending / 路线图能力过时 | Mark actual delivery; keep general portable bundles and auth pending / 已有与通用包、登录待办拆分 |
| D6 · medium / 中 | `src/app/api/[operation]/route.ts` reports Chrono from a nonempty env setting; run/batch cancel routes never call body(); docs overstated availability/body checks / 能力及请求体保护描述过宽 | API documents configured flag, cancellation exception, 413/415 and incomplete error bilingual coverage / 按实际边界说明，不改保护代码 |
| D7 · medium / 中 | `.github/workflows/test.yml` runs build/core/Next/engines/type/lint/Python, not browser/real DB/docs/evals; policy listed only core CI / CI 说明不完整 | Aligned test/policy coverage and missing gates; no hosted-CI claim / 同步配置与缺口，不声称远端执行通过 |
| D8 · medium / 中 | `git log --diff-filter=A` places recent intent/spec/plan and code in 03c88d2 or 2bfe8b2 together / 规划记录与实现同提交 | Disclose missing stage commit chain; add reusable evidence/decision/handoff fields, not retrospective approvals / 记录缺口并补字段，不倒签 |
| D9 · medium / 中 | Latest remote browser probe was a temporary local file; recovery success path live-tested, failure path only unit-tested / 远端探针未入库、失败恢复未实演 | Disclose reproducibility/recovery gaps in testing/SDLC guide; keep as future work / 明确复现及恢复缺口，未冒称补文档即完成 |
| D10 · low / 低 | Shell/theme/sidebar layers absent from architecture; schema still has 18 models, no AuthUser/AuthSession or auth routes / 新 UI 分层未记录 | Add UI ownership and explicitly distinguish login proposal from implementation / 补分层及登录提案边界 |

### Acceptance mapping / 验收映射

| Case / 验收项 | Evidence and result / 依据与结果 |
| --- | --- |
| AC1 · source consistency / 代码一致 | Reviewed `src/components`, `src/features`, API handlers, HTTP guards, worker, Prisma models, deployment CLI/helper and Git history; corrected D1–D6/D10 / 按实际源文件纠正声明 |
| AC2 · lifecycle traceability / 生命周期追踪 | `docs/sdlc.md`, current review headers and policy distinguish scope approval, implementation, validation, commit and release; D7–D9 remain explicit gaps / 交接字段和状态已补，自动化缺口仍明确 |
| AC3 · documentation quality / 文档质量 | Both READMEs and relevant bilingual sections aligned; local Markdown/whitespace/language-presence checks pass / 双语人工核对及机械检查通过 |
| AC4 · scope / 范围 | Diff contains Markdown only; no application/schema/test/dependency/workflow changes, remote operations or Git writes / 仅 Markdown，无运行、结构、测试、依赖、CI、远端或 Git 写操作 |

AGENTS change adds navigation links only. Expected behavior: find the current
audit and handoff guide; existing permission/test rules remain unchanged. Link
targets checked, but **no agent behavior evaluation was run**. Same-session
documentation review cannot prove agent compliance or industrial simulation accuracy.
AGENTS 仅增加导航，预期能找到最新审计和交接说明；已有权限/测试规则不变。
链接已核对，但**未运行代理行为评估**，文档自检不证明代理合规或工业仿真精度。

### Commands and results / 命令与结果

Executed from repository root on macOS, Node **22.23.2**, on 2026-09-29:
仓库根目录、上述运行时与日期执行：

| Command / 命令 | Actual result / 实际结果 |
| --- | --- |
| `npm test` | 48 passed; 0 failed/skipped / 48 通过，失败/跳过均0 |
| `npm run check` | Maintained JS parse and strict TypeScript passed / 语法及严格 TS 通过 |
| Documentation command in `docs/testing.md` | 54 documents, 253 local links, 0 errors; includes untracked Markdown / 54份文档、253个本地链接、0错误，含未跟踪文档，空白及双语存在性通过 |
| `git diff --check` | Passed / 通过 |
| `git diff --name-only` and untracked inventory | 25 changed documents, Markdown only; no runtime/schema/CI diff / 25份变更文档，仅 Markdown，运行代码/结构/CI 无差异 |
| `git log -8` and `git log --diff-filter=A` for recent intent files | Verified source/evidence revisions and same-commit stage artifacts / 核实版本及阶段记录同提交 |

No build/Next-unit/lint/browser/database/import/Chrono/PG/remote checks were rerun in this docs-only
turn; their earlier results remain historical evidence. No CI gates, paid scans,
automatic monitoring, backup/recovery drills, commits or pushes were performed.
Markdown checks do not verify external URLs, anchors or translation semantics;
manual code/translation inspection supplements them, not a complete formal audit.
本轮纯文档未重跑构建、Next单测、lint、浏览器、实库、导入、Chrono、PG 或远端检查，旧结果仍按历史使用。
未增加门禁、付费扫描、自动监控、备份恢复演练、提交或推送。文档检查不验证外链、锚点或译义，
人工源码/译文检查作为补充，不构成完整形式化审计。
