# Park platform — implementation self-review / 实施自检

Historical implementation/deployment evidence; later committed in `a634805`.
Subsequent user-reported first-use defects are tracked in the
[current audit](../../audits/2026-09-28-park-sdlc.md), not erased by these passes.
历史实施/部署证据，后续进入 `a634805`；后续首次使用缺陷见当前审计，不能被当时通过记录抹去。

## Current verification / 当前验证（2026-09-28）

Reviewer: implementing agent only, not independent domain approval. Product/menu
refactor accepted by maintainer; login explicitly kept trusted-LAN/no-auth. No Git
commit/push performed. Current contract and remaining adapters are in
[park platform](../../park-platform.md).

- Node 22.23.2: `npm run build`, `npm test` (37 tests), `npm run check` passed.
- `npm run test:engines`: 118 tests / 12 files passed; six private-map suites remain
  explicitly excluded, not counted as passing.
- Python 3.14.6 isolated environment: `python -m unittest discover -s engines/maps -v`:
  8 tests passed. Exact binary `/private/tmp/groundwork-map-python-20260928/bin/python`.
- Chrome 153.0.8010.53 / Playwright, base `http://127.0.0.1:4180`:
  `node scripts/platform-smoke.mjs` passed resource creation/version edit, multi-map
  park, object placement/routes/undo/redo/save, leave protection, virtual device and
  task, real worker completion, automatic replay, 2D/3D, metrics/report, reload,
  physical registration and disabled execution, API physical rejection, revision
  conflict, referenced archive guard and direct snapshot submission rejection.
- `scripts/workbench-smoke.mjs`, `scripts/maps-smoke.mjs`, `scripts/browser-smoke.mjs`
  passed adjacent flows. Classic uses `BASE_URL=http://127.0.0.1:4180/classic`;
  others use base 4180. Both languages and 390/320 px; no JS errors or external requests.
- Screenshots under ignored `artifacts/platform-*.png`; manually inspected control
  and narrow-screen layout. These are rendering evidence, not physical validation.
- Browser module: `/Users/steven/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`;
  executable `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

### Findings addressed / 已处理发现

1. Unbound device channels were accepted. New test failed with “Missing expected
   exception”; store now requires a gateway before channels, and test passes.
2. Legacy exporters would silently omit park wall/overlay geometry. Regression
   first failed, then bounded park JSON/HTML export; unsupported RMF/SDF/XOSC reject.
3. New root replaces the old UI; legacy smoke navigation changed to `/workbench`,
   without relaxing its behavior assertions. Legacy history excludes park engine.
4. Async browser tests initially checked before UI fetch/render completed; waits
   now target actual ready map/language state, preserving the same intended checks.
5. HTTP LAN browsers may lack secure-context `crypto.randomUUID`; IDs use supported
   `crypto.getRandomValues`, not weak pseudo-random IDs or a login requirement.
6. Scene route JSON is checked before local SVG rendering; no raw string coordinates
   are interpolated. Server independently validates all persisted inputs.

### Residual limits / 残余边界

No manufacturer calibration, real-world/timestep-convergence validation, external
sensor pipelines, cloud protocol adapters, accounts or real control. Arbitrary-park
Chrono remains unimplemented; separate legacy lab only. Multiple assets are bound
to a park but views/runs are single-floor/single-device; no combined-world routing.
Stations are semantic except speed/restricted zones. Mass/sensors are definition
fields only. Missing meshes, floor holes/bounds/other devices are not obstacles.
SQLite starts schema 1; no migration from an older platform schema exists. Archive
retains history but has no restore UI. Exported parks contain local IDs, not bundles.

### Remote preview / 远端预览

Released to the already authorized isolated `http://10.1.153.185:5180`, release
`20260928-park-platform-01`, Node 24.13.1. Remote `node --test tests/*.test.js`:
37/37 passed before switch. Checked zero queued/running jobs before stopping only
GroundWork; old release `20260928-rmf-maps-02` and all 19 historical jobs retained.
New platform DB is outside releases at `/home/steven/src/groundwork/data/platform.sqlite`.
Ports 5173–5176 and 5180 each returned HTTP 200 after switch.

`BASE_URL=http://10.1.153.185:5180 node scripts/platform-smoke.mjs`: full flow passed,
including real HTTP (non-secure-context) ID creation, zh/en, 390/320 px, no browser
errors or external requests. QA-created resources were archived, not erased;
results/history remain. `node scripts/api-smoke.mjs` passed legacy paired regression,
Chrono cancellation and 120 s mission with attach/detach/charge completion. Chrono
run `ef92a8ce-1238-4acf-895c-34740a0d7800`: max hitch residual 0.00000431749 m;
ground-inclusive contacts are not collisions. This tests the separate mechanics lab,
not a park dynamics adapter.

Remote workbench and map browser smoke suites also passed after new park history
existed: old yard/road execution, delayed-result race, static/origin guards, all
five maps/eight floors, zh/en and 390/320 px. Local QA server on 4180 was stopped;
only the explicitly requested robots preview remains running.

Application archive SHA256:
`9a2cff0d32ec11749833480609942d904d2f00636addb57e2050a2d773891584`.
Executed engine fingerprint:
`9851c8f58009af9ae52ad23cfb7c36e47aff0a23d6cfe2d618ed8c26f1e009b9`.
Worktree based on Git `1683576ab980b90435a7b148f1eee472c84d9a0b` plus uncommitted
changes from this and prior tasks; this is not a committed release. Deployment
notes and Python patch-version correction were written locally after packaging,
so the archived pre-deployment review is not the final audit record.

## Historical pre-implementation review / 以下为实施前历史记录

Status: planning only; no new platform runtime behavior implemented or deployed.
Reviewer: implementing agent, self-review only. / 仅方案阶段、单代理自检。

## Inspected current code / 已核对的现状

- `src/workbench.js`: primary navigation still A/B/C/D, shared run state and synthetic
  engine selection. Cannot be transformed into resource management by labels alone.
- `src/map-library.js`, `assets/maps/rmf/`: static map library with five imports,
  no persistent per-user map/workspace edit model.
- `server/domain.mjs`: engine requests do not reference a platform workspace/product
  version; `makeChronoScene` constructs synthetic capsule-loop routes.
- `engines/chrono/physics.py`: rigid-body dimensions/masses are coded in the vehicle
  builder; `train.py` derives service phases from route fractions. Product editing
  and business-station editing must reach those builders to have actual effect.
- `server/jobs.mjs`: reusable run storage and job lifecycle, not asset registry.
- `packages/contracts/src/workspace.ts`: copied loose historical scene/conversation
  response types, not the newly requested business domain.
- `server/http.mjs`: trusted-LAN preview without authentication. A login UI alone
  would not protect APIs/static artifacts or qualify as account security.

## Findings / 结论

New product/domain contracts and persistent resource relationships are required.
Reuse verified engines and data/rendering components behind adapters. Preserve
real-vs-simulated identity, published asset versions and actual connectivity state.
Do not claim a product model import automatically supplies an algorithm, physics
adapter or sensor renderer. Remote takeover is a separate authority/safety boundary.

Wrote intent/spec/plan drafts before substantive code per AGENTS.md. Existing dirty
worktree and deployed map preview remain unchanged. Application tests not rerun for
this planning-only turn. Await maintainer acceptance of detailed scope and login
boundary before implementing the refactor.

## 中文对应自检

### 实施与验证阶段

2026-09-28 实施代理自检，非独立领域批准；维护者已接受菜单重构、可信局域网免登录。
当时未提交/推送，具体契约见园区手册。Node22.23.2 构建、37核心、语法通过，TS12文件
118项通过、六私有地图排除；隔离 Python3.14.6 执行地图8项通过，解释器路径见上文。

Chrome153.0.8010.53/Playwright、本地4180，platform-smoke 覆盖创建/版本编辑、多图
园区、对象路线/撤销重做保存/离开保护、虚拟实例任务、真实worker完成、自动回放、
2D/3D/指标报告/刷新、实机登记执行禁用和API拒绝、冲突、引用归档保护、拒绝直接
快照提交。邻近workbench/maps/classic（classic需/classic地址）通过，中英390/320
无JS错误/外部请求。截图在artifacts，实际检查控制和窄屏，仅证明渲染非物理。
工具模块/浏览器完整路径见上文。

处理发现：无网关通道曾被接受，先失败后加绑定约束；旧导出漏园区墙/图层，回归先
失败后限制为JSON/HTML、拒绝RMF/SDF/XOSC；新根替换旧UI，旧smoke改workbench而
未松断言；异步测试等待实际地图/语言就绪；HTTP非安全上下文缺randomUUID，改
getRandomValues而非弱随机或要求登录；路线JSON在SVG前校验，服务端仍独立校验。

残余：无厂商/实测/步长收敛、传感器管线、云协议、账号/实控；任意园区Chrono未接，
仅独立旧实验室。多资源绑定但单层/单设备显示计算，无跨图；站点除限速禁行外为
语义，质量/传感器仅定义。外部网格、孔洞、边界、其他设备不做障碍。库schema1无
旧版迁移，归档无恢复UI，导出园区不是资源包。

### 远端预览

已获准5180发布park-platform-01，Node24.13.1，切换前远端37测试通过并确认无活跃
任务，只停自身；保留maps-02和19历史任务，新SQLite在release外。5173–5176/5180
切换后均200。远端完整platform-smoke含真实HTTP ID创建、中英小屏，无错误/外部
请求；QA资源归档不抹历史。API烟测含旧回归、Chrono取消和120秒完整接挂/充电任务，
任务UUID及误差见上文；最大铰接误差0.00000431749m，地面接触不是碰撞事故，也不是
园区力学适配验证。

新园区历史存在后，远端workbench/maps再次通过：yard/road、延迟竞争、静态/来源
保护、五图八层、中英390/320。本地4180停，只保留用户要求的远端预览。打包SHA和
执行指纹如上；包基于1683576加未提交修改，不是当时Git发布。部署记录及Python补丁
版本更正在本地打包后完成，包内审查不是最终记录。

### 更早的实施前记录（历史）

当时仅方案、自检，无新代码/部署。检查发现：workbench仍A/B/C/D且合成引擎，不能
只改标签；maps静态无持久用户图层；domain不含平台/产品版本，Chrono创建合成环线；
physics车身尺寸质量硬编码、train用路径比例作业，模型站点编辑必须实际到构建器才
有效；jobs可复用但不是资产库；旧workspace契约宽松不适合新领域；HTTP免认证，
登录UI不能保护API/证据。

因此先写intent/spec/plan，需新领域和持久关系，以适配器复用引擎/数据/渲染，保留
虚实身份、版本和实际连接状态。模型导入不自动带算法/物理/传感器，接管另定权限
和安全。当时保留脏工作区/预览、未为纯规划重跑测试，并等待范围/登录选择；这些
后来已确认，不是当前阻塞。
