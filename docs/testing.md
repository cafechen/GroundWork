# Testing and evidence / 测试与证据

[Documentation / 文档中心](README.md) · [Policy / 政策](development-policy.md)

Run from repository root. Use Node >=22.19; Python is optional for application
startup but required for converter tests. Do not interpret omitted tests as passes.
所有命令在仓库根目录运行，Node >=22.19；启动不强制 Python，地图转换测试需要。
未执行或排除的测试不能算通过。

## Next.js acceptance / Next.js 验收

The shadcn-admin layout has an additional read-only browser suite:
`BASE_URL=http://127.0.0.1:14173 node scripts/admin-ui-smoke.mjs`.
Use a separately seeded isolated test deployment, Playwright and Chrome as below.
It checks desktop/mobile navigation, light/dark + language persistence, filtering,
map dialogs, overflow, and external requests. Screenshots are under `artifacts/admin-ui/`.
The existing park suite now also verifies cancelling brand navigation preserves
an unfinished route. Snapshot capture waits out finite animations and scrolls to
the top so fixed/sticky navigation is not misleadingly captured mid-page.
模板布局另有上述只读浏览器测试，仍须预先初始化的独立测试环境及浏览器；验证主题、语言、
导航、筛选、地图弹窗、溢出与外部请求，截图位于 artifacts/admin-ui。
园区测试增加“取消品牌导航保留未完成路线”；截图结束有限动画并回到顶部，避免固定导航截图错位。

```sh
npm ci
npm run build
npm test
npm run test:next
npm run test:engines
npm run check
npm run lint
# Isolated groundwork_* database only; stop the normal worker first.
# 仅独立测试库；先停止平时运行的 worker，避免与测试进程争抢任务。
node --env-file=.env.local --import tsx --test tests-next/database.integration.js
# Idle dedicated database; creates 24 synthetic jobs, retains evidence
# 空闲专用库；新增24条合成实验并保留证据
node --env-file=.env.local --import tsx --test tests-next/batch.integration.js
# Separate env file pointing to a migrated, EMPTY groundwork_import_* database.
# 独立环境文件指向已迁移的空导入库，不要复用上面的运行测试库。
node --env-file=.env.import.local --import tsx --test tests-next/import.integration.js
# Same import target is usable only while its run/artifact tables are still empty.
# 同一导入库仅在实验/文件表仍为空时可继续执行；不要清空旧库来重跑。
node --env-file=.env.import.local --import tsx --test tests-next/run-import.integration.js
# Running Next.js and worker, isolated database / 已启动新 Web 和 worker
BASE_URL=http://127.0.0.1:4173 node scripts/next-smoke.mjs
BASE_URL=http://127.0.0.1:4173 node scripts/next-labs-smoke.mjs
# After batch integration; Web running, worker stopped for deterministic cancellation
# 批次实库测试后执行；Web启动、worker停止，以确定性验证排队取消
BASE_URL=http://127.0.0.1:4173 node scripts/next-layers-batches-smoke.mjs
```

`PLAYWRIGHT_MODULE` / `CHROME_PATH` can select local test tools; neither is an
application dependency. `next-smoke`, `next-labs-smoke` and
`next-layers-batches-smoke` create or cancel synthetic jobs/resources. The
`admin-ui-smoke` suite is read-only but still enforces a loopback target; all these
suites are intended for isolated tests, not production. `check` includes strict
TypeScript, while lint is separate.
工具路径不是产品运行依赖；前三个 Next 浏览器套件会新增或取消合成作业/资源；
admin-ui-smoke 只读但仍限制本机地址。上述套件全部用于隔离测试，不得指向生产。
check 包含严格类型检查，lint 单独执行。

New smoke paths cover park workflow, all five maps/eight floors, graph/layer
controls, persistent batch summaries/cancellation/exports, unified lab and classic entry.
Old four smoke scripts below target the retained legacy DOM and must not be
misreported as new React tests. Current results/limits live in
[Next.js review](changes/nextjs-platform/review.md), [UI review](changes/shadcn-admin-ui/review.md)
and [deployment review](changes/robots-deploy-script/review.md).
新测试覆盖园区、五张地图八个楼层、图层筛选、持久化批次/取消/导出及实验室；下方四个旧脚本针对旧 DOM，
不能冒称验证新 React。真实结果和缺口见变更自检。

## Historical legacy checks / 历史旧运行时检查

```sh
npm ci
npm run build:engines
npm test
npm run test:engines
node scripts/check.mjs
node scripts/ready-yard-demo.mjs
```

| Check / 检查 | Coverage and limits / 覆盖与局限 |
| --- | --- |
| `build:engines` | TypeScript contracts/engine packages only; not a full UI typecheck / 仅 TS 契约和引擎包，不是全 UI 类型检查 |
| `npm test` | Node geometry, core, maps, job lifecycle, resource/version guards, park simulation; 37 tests at baseline / 基线 37 项 |
| `test:engines` | 118 tests in 12 files; six private-map suites explicitly excluded in `vitest.config.ts` / 12 文件 118 项，另 6 私有地图套件明确排除 |
| `node scripts/check.mjs` | JS parsing only; unlike current `npm run check`, this does not invoke TypeScript / 只解析 JS；不同于当前包含 TS 的 npm run check，不是 lint、安全扫描或代理评估 |
| Demo preflight / 示例预检 | In-memory real planar calculations and deterministic/geometry assertions; no network writes / 内存中实际平面计算，不写远端 |

Python converter tests / Python 地图转换测试：

```sh
python3 -m venv .venv-map-build
.venv-map-build/bin/pip install -r engines/maps/requirements.txt -r engines/maps/requirements-rmf.txt
.venv-map-build/bin/python -m unittest discover -s engines/maps -v
```

Eight tests at baseline. Regenerate RMF JSON only when intended with
`.venv-map-build/bin/python engines/maps/import_rmf.py`; review the generated diff.
These tests do not install or test PyChrono. See the [legacy manual](unified-workbench.md)
for strict `engines/chrono/check_run.py` full-cycle verification.
基线 8 项；只有需要更新资源时才运行生成器并审查差异。这些测试不安装或验证
PyChrono；严格完整循环检查见[旧版手册](unified-workbench.md)。

## Legacy browser and API checks / 旧版浏览器与接口验收

Install/use Playwright and Chromium separately. `PLAYWRIGHT_MODULE` may be an
absolute module path, `CHROME_PATH` an executable path. Start a disposable local
legacy server (`npm run legacy:start`)/data directory, then set each script's `BASE_URL` explicitly:
另行准备 Playwright 和 Chromium；环境变量可指定已有模块和浏览器路径。先启动
使用临时数据目录的本地旧服务（npm run legacy:start），再明确指定各脚本地址：

```sh
BASE_URL=http://127.0.0.1:4173 node scripts/platform-smoke.mjs
BASE_URL=http://127.0.0.1:4173 node scripts/maps-smoke.mjs
BASE_URL=http://127.0.0.1:4173 node scripts/workbench-smoke.mjs
BASE_URL=http://127.0.0.1:4173/classic node scripts/browser-smoke.mjs
BASE_URL=http://127.0.0.1:4173 node scripts/api-smoke.mjs
BASE_URL=http://127.0.0.1:4173 node scripts/ready-yard-preview.mjs
```

Platform/workbench/API checks **write resources and jobs**; use only authorized
targets. Some checks require optional Chrono or a previously seeded ready yard;
absence is not a pass. Platform QA archives its test resources, retaining history.
Ready-yard preview only replays existing data. Screenshots go to ignored `artifacts/`;
inspect them and record runtime, target, commands, results and image paths in review.

平台/工作台/API 验收会**新增资源或任务**，只能使用获准目标。有些检查需 Chrono 或
先创建示例；缺失不能算通过。平台验收归档测试资源而保留历史；示例回放检查只读。
截图在忽略的 `artifacts/`，需实际查看并记录运行时、目标、命令、结果和证据路径。

## What the current suite does not prove / 目前测试不能证明什么

No real vehicle calibration, complete map collision geometry, continuous collision
detection, arbitrary-park Chrono, live gateway/control, hosted CI success, branch
protection or agent-behavior evaluation. The browser suite follows a known valid
route/pose flow; it does not prove an unaided first-time user can create a safe run.
The [pre-Next.js audit](audits/2026-09-28-park-sdlc.md) recorded unfinished-route
and initial-contact failures. Current React disables saving unfinished route points
and supports picking/alignment of device spawn; that does not establish automatic
clearance checks or resolve every first-use difficulty.

不能证明实车标定、完整地图碰撞几何、连续碰撞检测、任意园区 Chrono、实机接入、
远端 CI 成功、分支保护或代理行为评估。浏览器测试按已知有效路线和位姿执行，
不能证明首次使用者无需协助就能成功。[迁移前审计](audits/2026-09-28-park-sdlc.md)记录的
未完成路线/初始接触问题属于历史；React 已禁止保存未完成路线点并支持初始位置点选/对齐，
不等于已有自动净空验证或解决所有首次使用困难。

The checked-in CI runs build/core/Next/engine/parse/type/lint/Python checks on Node 22/24 and
Python 3.12. It currently does **not** run browser QA, the ready-yard preflight,
Chrono, docs-link checks, agent evals or release approval gates. A workflow file
is not evidence that GitHub ran or enforced it.

仓库 CI 配置为 Node 22/24、Python 3.12 的构建、核心/Next/引擎/语法/类型/lint/地图测试；当前不含
浏览器、示例预检、Chrono、文档链接、代理评估和发布审批门禁。配置存在不代表
GitHub 已执行或强制合并门禁。

The CI file also lacks real MySQL/PostgreSQL integration and import checks. Local
database passes do not close this CI gap. Current core coverage includes the 11
deployment-helper tests (`node --test tests/deploy-robots.test.js`); these test
guards/orchestration, not live failed-cutover recovery. The latest remote UI check
used a temporary read-only probe, not a checked-in portable remote smoke command;
do not weaken local suite target guards to recreate it on a shared deployment.
CI 同样不含真实 MySQL/PG 或导入测试；本地通过不等于 CI 已覆盖。当前核心测试含11项
部署助手测试，验证保护/编排，不代表失败切换实演。最近远端 UI 检查使用临时只读探针，
尚无入库的可移植远端浏览器命令；不能为复现而放宽本地套件地址保护。

## Documentation checks / 文档检查

The following read-only check includes untracked Markdown under the repository
root and docs directory. It checks file targets (not URL availability or anchor
semantics), whitespace and presence of both languages. Manually check translation
meaning and capability claims against code as well. It is not installed as a CI gate.

以下只读检查覆盖根目录和 docs 中含未跟踪的 Markdown，核对本地目标文件、空白和
双语存在性，不核实外网可达或锚点语义；还需人工按代码检查译文和能力声明。未加入 CI 门禁。

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import path from 'node:path';
const files = fs.readdirSync('.').filter(f => f.endsWith('.md'));
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.md')) files.push(p);
  }
}
walk('docs');
let links = 0;
const errors = [];
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  if (!text.endsWith('\n') || /[\t ]+$/m.test(text)) errors.push(`${f}: whitespace`);
  const prose = text.replace(/\x60{3}[\s\S]*?\x60{3}/g, '');
  if (!/[\u3400-\u9fff]/.test(prose) || !/[A-Za-z]{3}/.test(prose)) errors.push(`${f}: language`);
  for (const m of prose.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(m[1])) continue;
    links++;
    const target = decodeURIComponent(m[1].split('#')[0]);
    if (!fs.existsSync(path.resolve(path.dirname(f), target))) errors.push(`${f}: ${target}`);
  }
}
console.log({ documents: files.length, relativeLinks: links, errors });
if (errors.length) process.exit(1);
JS
git diff --check
```
