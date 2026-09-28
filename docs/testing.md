# Testing and evidence / 测试与证据

[Documentation / 文档中心](README.md) · [Policy / 政策](development-policy.md)

Run from repository root. Use Node >=22.19; Python is optional for application
startup but required for converter tests. Do not interpret omitted tests as passes.
所有命令在仓库根目录运行，Node >=22.19；启动不强制 Python，地图转换测试需要。
未执行或排除的测试不能算通过。

## Local checks / 本地检查

```sh
npm ci
npm run build
npm test
npm run test:engines
npm run check
node scripts/ready-yard-demo.mjs
```

| Check / 检查 | Coverage and limits / 覆盖与局限 |
| --- | --- |
| Build / 构建 | TypeScript contracts/engine packages only; not a full UI typecheck / 仅 TS 契约和引擎包，不是全 UI 类型检查 |
| `npm test` | Node geometry, core, maps, job lifecycle, resource/version guards, park simulation; 37 tests at baseline / 基线 37 项 |
| `test:engines` | 118 tests in 12 files; six private-map suites explicitly excluded in `vitest.config.ts` / 12 文件 118 项，另 6 私有地图套件明确排除 |
| `check` | JS parsing in src/server/scripts/tests; not lint, security scan or agent eval / 仅语法解析，不是 lint、安全扫描或代理评估 |
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

## Browser and API checks / 浏览器与接口验收

Install/use Playwright and Chromium separately. `PLAYWRIGHT_MODULE` may be an
absolute module path, `CHROME_PATH` an executable path. Start a disposable local
server/data directory, then set each script's `BASE_URL` explicitly:
另行准备 Playwright 和 Chromium；环境变量可指定已有模块和浏览器路径。先启动
使用临时数据目录的本地服务，再明确指定各脚本地址：

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
Reported unfinished-route/initial-contact UX failures remain open in the
[current audit](audits/2026-09-28-park-sdlc.md).

不能证明实车标定、完整地图碰撞几何、连续碰撞检测、任意园区 Chrono、实机接入、
远端 CI 成功、分支保护或代理行为评估。浏览器测试按已知有效路线和位姿执行，
不能证明首次使用者无需协助就能成功。未完成路线/初始接触问题仍记录在[本轮审计](audits/2026-09-28-park-sdlc.md)。

The checked-in CI runs build/core/engine/parse/Python checks on Node 22/24 and
Python 3.12. It currently does **not** run browser QA, the ready-yard preflight,
Chrono, docs-link checks, agent evals or release approval gates. A workflow file
is not evidence that GitHub ran or enforced it.

仓库 CI 配置为 Node 22/24、Python 3.12 的构建、核心/引擎/语法/地图测试；当前不含
浏览器、示例预检、Chrono、文档链接、代理评估和发布审批门禁。配置存在不代表
GitHub 已执行或强制合并门禁。

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
