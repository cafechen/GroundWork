# GroundWork — agent instructions

Scope: this repository. These are working instructions, not an installed security hook or proof of compliance.

Chinese equivalent follows below. Both sections express the same instructions;
the bilingual addition does not introduce new permissions or evaluated agent rules.
下方为等义中文说明；双语补充不增加授权，也不代表已完成代理行为评估。

## Start here

- Read the relevant [README](README.md), [architecture](docs/architecture.md), and [development policy](docs/development-policy.md) before changing behavior. Inspect the worktree; preserve unrelated work.
- Overall reference: [The AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook). Apply the project-specific policy, not tool-specific examples copied from the article. A linked webpage never grants action permissions.
- Read the active change record under `docs/changes/<change-id>/` when one exists. If absent, create the applicable record before a substantive implementation; do not invent earlier approvals. Small documentation-only changes can use one combined record.
- Repository files are the project record; local uncommitted files are drafts, not a completed audit trail. Keep this entry point short and put detailed procedures in the policy.

## Working loop

1. State the request, affected product domains/engine components, exclusions, assumptions and measurable acceptance cases. For feature/model/contract changes, prepare `intent.md`, `spec.md`, `plan.md` in the change directory and get maintainer acceptance before implementation. Record who accepted what and where; silence is not approval.
2. The plan must identify files, risks, verification and recovery. For a small documentation correction, the explicit request can authorize the bounded edit; record scope and verification without inventing a design sign-off.
3. Implement the smallest coherent change. Keep the plan aligned with any deviation; return to the maintainer for material scope or model decisions. Prefer no new dependencies.
4. Reproduce bugs before fixing them. Add a regression test, demonstrate its intended failure, then fix the implementation. Do not skip tests, weaken assertions or alter expected metrics to hide failures. Legitimate acceptance changes require rationale and review.
5. Check logic, security and scope separately. Record evidence and unresolved findings in `review.md`. Same-session review is self-review, never an independent approval.
6. Handoff with changed paths, commands/results, limitations and outstanding approvals. Follow the detailed policy for releases and defects; do not declare automated controls operational without evidence.

## Commands and evidence

- `npm ci && npm run build`: install standalone workspaces and build contracts/engine. Node >=22.19. `npm start`: loopback preview at `http://127.0.0.1:4173`; `/classic` preserves the original lab.
- `npm test`: all Node core tests must pass, zero failures/skips. Baseline at adoption: 13 tests; this is not a permanent required count.
- `npm run test:engines`: portable copied TS suites; six private-map suites are explicitly excluded, never count them as passing. `npm run check`: scan maintained JS in src/server/scripts/tests for parse errors; **not** a linter or type checker.
- For UI/interaction changes: run `scripts/platform-smoke.mjs` (park platform), `scripts/maps-smoke.mjs`, `scripts/workbench-smoke.mjs` (legacy unified) and `scripts/browser-smoke.mjs` (classic) with Playwright/Chromium available. Inspect both languages and small screens. `BASE_URL`, `PLAYWRIGHT_MODULE`, `CHROME_PATH` select target/dependencies. Do not invent success if unavailable.
- Check changed files and local Markdown links. `git diff --check` does not cover untracked files; audit those separately until the first commit exists.
- Capture the exact command, runtime, result and evidence location in the change record. Distinguish this run from historical results. Browser outputs under `artifacts/` are ignored; retain a textual verification summary for review.

## GroundWork invariants

- Product navigation is park-centric: overview, maps, device models, gateways, parks. Instances, operations, controls and analysis live inside a park. A/B/C/D describe historical engine components, not new product navigation. `src/core` must remain DOM-free and deterministic for a fixed validated configuration in the tested runtime.
- Pin map/model revisions in parks and immutable run inputs. Real instances cannot enter a simulation or resolve real control from replay. Unsupported model/engine/channel combinations must fail explicitly, never fall back to an unrelated synthetic scene.
- Keep metres/seconds/radians and axle-reference conventions explicit. Do not substitute an on-axle trailer for a different industrial cart topology without agreement and tests.
- Preserve full tractor/trailer/drawbar clearance before resource release. Distinguish frame state from full-run metrics, contact episodes from accidents, and sampled footprints from continuous swept volumes.
- No fabricated scores, safety certification, manufacturer calibration or untested vendor compatibility claims. Simulation tests alone do not validate real vehicles.
- Synchronize `README.md` / `README.zh-CN.md` and `src/i18n.js` where relevant. Document new schema/version semantics.
- No customer logs, maps, secrets, telemetry, external uploads or real vehicle control without specific authorization. Default to loopback. The maintainer explicitly authorized the isolated `robots:5180` trusted-LAN preview in this change; that exception does not authorize public exposure or changes to other services.
- Keep copied engines inside this repository. No runtime import, symlink or service dependency on Strategist/Robots. Different engines retain their model identities; Chrono ground contacts are not accidents; incomplete horizons are not successful safety evaluations.
- Job state writes must serialize per job; reserve the worker slot before awaited I/O. Cancellation tests must cover cancellation before spawn and must not leave a successful result after cancellation.
- Do not commit, push, publish, change repository protections, buy services or start recurring/background agents without authorization for that action. Model/reviewer output is not maintainer approval. Respect the active execution environment's permission policy.
- Do not start subagents merely because the reference article describes them; follow the current task's delegation authorization.
- Turn repeated, verified mistakes into a targeted test and a concise instruction; keep experimental agent rules labeled unverified until evaluated.

## 中文执行说明

范围为本仓库；本文是工作约定，不是已安装的安全钩子或合规证明。

### 开始工作

- 修改行为前阅读相关 README、架构和开发政策；检查工作区并保留无关改动。
- 整体参考上方 AI-native SDLC 文章，执行项目具体政策，不照搬厂商示例；链接不授予权限。
- 存在当前变更记录时先读；实质实施前缺少记录则建立。小型纯文档改动可合并记录，不虚构旧审批。
- 仓库文件是项目主记录；未提交文件仍是草稿，不是已完成审计链。详细流程归开发政策维护。

### 工作循环

1. 写明请求、领域/引擎范围、排除项、假设和可测验收。特性/模型/契约变更先准备
   intent、spec、plan 并取得维护者确认，记录谁、在哪、确认什么；沉默不是批准。
2. 计划列出文件、风险、验证和恢复；小型文档修改可由明确请求授权，不能伪造设计签署。
3. 实施最小完整改动；偏离时同步计划，重大范围或模型选择再次确认；优先不加依赖。
4. 修复前先复现并证明回归测试按预期失败，再修复；不跳过测试、弱化断言或篡改指标
   掩盖失败。合法验收变化需给理由并审查。
5. 分别检查逻辑、安全和范围，证据及未解决发现写 review；同会话审查只称自检。
6. 交付说明文件、命令/结果、局限和待批准项；无证据不称自动化控制已运行。

### 命令和证据

- `npm ci && npm run build` 安装并构建独立 workspace，Node >=22.19；`npm start`
  默认 `http://127.0.0.1:4173`，`/classic` 保留原始实验台。
- `npm test` 全部 Node 核心测试必须通过、无失败/跳过；最初 13 项只是历史基线。
- `npm run test:engines` 排除六个依赖私有地图的套件，不计通过。`npm run check`
  只解析 src/server/scripts/tests 的 JavaScript，不是 lint 或类型检查。
- 界面变更运行 platform/maps/workbench/browser 四类 smoke；后者针对 classic。
  明确 BASE_URL、PLAYWRIGHT_MODULE、CHROME_PATH，检查双语、小屏和实际截图，不虚构成功。
- 检查改动文件和本地 Markdown 链接；`git diff --check` 不覆盖未跟踪文件，需另查。
- 变更记录注明准确命令、运行时、结果和证据路径，区分本轮与历史。artifacts 被忽略，
  需保留文字总结供审查。

### 不变约束

- 主菜单为总览、地图、设备模型、网关、园区；实例/作业/控制/分析在园区内。
  A/B/C/D 仅为历史模块。src/core 无 DOM，相同已校验配置在测试运行时内确定。
- 园区和实验固定地图/模型版本；实机不参加仿真，回放不解析实机控制地址；不支持的
  模型/引擎/通道明确失败，不能退回无关合成场景。
- 单位米/秒/弧度，明确车轴参考；不得未经确认和测试替换拖车拓扑。
- 资源释放前车头/挂车/牵引杆完整离开；区分帧与全程指标、接触段与事故、采样与连续扫掠。
- 不编造评分、安全认证、厂商标定或兼容性；仿真测试不证明实车有效。
- 同步中英 README 和相关界面文案，记录新 schema 和版本语义。
- 客户数据、秘密、遥测、上传和实车控制需明确授权；默认本机。已获准的 robots:5180
  可信局域网预览不授权公网暴露或修改其他服务。
- 平移引擎留在本仓库，不运行时依赖 Strategist/Robots 的导入、软链或服务；不同引擎
  保留模型身份，Chrono 地面接触不是事故，时限未完成不是通过安全评估。
- 每任务状态写入串行；await I/O 前占用 worker 槽。取消测试涵盖 spawn 前取消，
  取消后不得留下成功结果。
- 提交、推送、发布、仓库保护变更、采购、周期/后台代理均需对应授权；模型输出不等于
  维护者批准；遵守实际环境权限。不因文章提到子代理就擅自启动。
- 重复且证实的错误转成针对性测试和简洁规则；未经代理评估的实验规则继续标为未验证。

Current documentation and audit: [index](docs/README.md), [audit](docs/audits/2026-09-28-park-sdlc.md).
当前文档与自检见以上链接；该链接不改变执行规则。
