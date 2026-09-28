# RMF map library — implementation self-review / 实施自检

Historical map-stage evidence, later included in `a634805`; the park release now
supersedes maps-02. IDs and runtime statements below are historical, not live checks.
地图阶段历史证据，后续进入 `a634805`，园区版已取代 maps-02；下方 ID/状态不代表实时检查。

Date: 2026-09-28. Reviewer: implementing agent; self-review only.
Status: implemented and verified locally and on Linux; corrected preview selected
as `20260928-rmf-maps-02`. Final deployed browser evidence is recorded below.
Maintainer accepted the five-map-first/static-map scope in the conversation on
2026-09-28 before implementation. No independent reviewer or Git commit yet.

Evidence: public upstream sparse clone and `git ls-tree -r --name-only HEAD` at
`7851a5792d19a037833292a3e2a823b0f9e0c111`; inspected map YAML headers, floor
elevations, Campus projection parameters and package license declaration.
Read the source repository README and GitHub issue #314 comments via public API.

- Available: `hotel/hotel.building.yaml`, `office/office.building.yaml`,
  `airport_terminal/airport_terminal.building.yaml`, `clinic/clinic.building.yaml`,
  `campus/campus.building.yaml` under `rmf_demos_maps/maps/`.
- Blocking exact six-map completion: Manufacturing & Logistics source is absent
  from the inspected tree. No equivalent, licensed source has been verified.
- Significant model boundary: existing synthetic engines cannot be claimed to
  use imported RMF geometry merely because it is displayed.
- Existing dirty implementation files preserved. Runtime additions are a separate
  `/maps` page, bounded static assets, a workbench link and MIME/route entries;
  no simulation request/physics/result changes.

## Executed evidence / 已执行验证

Local runtime: Node 22.23.2; Python 3.14 temporary isolated venv, PyYAML 6.0.2,
pyproj 3.7.2, Shapely 2.1.2; NumPy 2.4.4 only for comparison with upstream code.
Browser: installed Chrome 153.0.8010.53, Playwright, software WebGL.

- `npm run build`: both copied TypeScript packages build successfully.
- `npm test`: 26 tests passed, 0 failed/skipped (includes 3 new map tests).
- `npm run test:engines`: 118 tests / 12 files passed; the existing six private-map
  suites remain explicitly excluded, not counted as passed.
- `npm run check`: all maintained JavaScript parses; not lint/type validation.
- `python -m unittest discover -s engines/maps -v`: 8 passed (6 RMF + 2 existing).
  Covers calibration, image-axis sign, analytical rotated/scaled floor alignment,
  EPSG:3414 natural origin and offsets, invalid inputs and byte-identical rebuild.
- Independent implementation comparison: loaded unmodified upstream `transform.py`,
  `fiducial.py`, `wgs84_transform.py` from revision
  `06e91e59830804848bf127ba1d8882bc968084d0` in the temporary clone. Applied them
  to every source vertex on all 8 floors before canonical serialization; maximum difference from GroundWork
  was `1.0048591735576161e-14 m`. This establishes algorithm agreement, **not**
  physical/survey accuracy. Hotel L2 transform retained as numeric regression.
  Campus projected coordinates subsequently use a documented 1 micrometre storage
  grid for cross-platform reproducibility; see the correction record below.
- `BASE_URL=http://127.0.0.1:4180 node scripts/maps-smoke.mjs`: five maps/eight floors
  in 2D/3D, graph and layer controls, disabled sixth entry, delayed stale response,
  failed fetch preserving prior map, zh/en, 390/320 px widths passed; no page errors
  or external requests. Screenshots under `artifacts/map-*.png` (ignored).
- `BASE_URL=http://127.0.0.1:4180 node scripts/workbench-smoke.mjs`: yard/road
  experiments, replay, history selection race, languages, mobile and static/origin
  guards passed. `BASE_URL=http://127.0.0.1:4180/classic node scripts/browser-smoke.mjs`:
  classic A/B/C/D, batch, playback, import/export and mobile passed.
- Visually inspected Hotel Chinese 2D, Airport 3D and Clinic English 320 px
  screenshots: controls readable, map rendered, no horizontal overflow. Optional
  labels are dense at full-map scale; zoom is available. 3D is per-floor, not a
  simultaneous multi-storey view.
- `git diff --check` and relative Markdown link checks passed. Raw source hashes
  verified by Node tests. CI YAML includes Python checks; hosted CI not run here.

## Scope/security/remaining limitations / 范围、安全及局限

- Static local JSON only; no YAML upload endpoint, external model fetching,
  customer data, live hardware, cloud API, Strategist/Robots runtime dependency.
- Finite coordinates, valid edge indices, bounded counts, safe image paths and
  explicit non-simulation capability required before rendering. Variable text is
  escaped or assigned via textContent; failed loads preserve the selected map.
- No full Gazebo visual assets: furniture uses optional position markers, not
  invented dimensions. Campus's external architectural mesh is not included and
  this limitation is prominent. Wall height/thickness are upstream display defaults.
- Door/lift metadata is retained but no dynamic behavior or clearance evaluation
  is claimed. The existing run button still computes a synthetic experiment; map
  browsing has no run button and does not replace that experiment's geometry.
- Manufacturing & Logistics remains blocked on a licensed corresponding source;
  this was explicitly accepted for the first batch.
- All review is same-agent self-review. No safety or vendor compatibility claims;
  no commit, push or public exposure authorized/performed.

## Cross-platform defect and correction / 跨平台复现问题与修正

After initial deployment, the extra Linux Python test reproduced a failure in
`test_sources_conversion_and_determinism`: Campus JSON differed in floating-point
last bits. It failed with system PyYAML 6.0.1 / pyproj 3.6.1 and **also** with the
project-pinned PyYAML 6.0.2 / pyproj 3.7.2 in a new independent build venv. This was
not merely an old dependency issue. Existing map browsing and geometry checks passed.

Correction: canonicalize projected metric coordinates to 6 decimal places
(1 micrometre) before serializing and calculating bounds. The transform metadata
records `coordinateQuantumMetres`. Source assets/hashes are unchanged; the exact
byte-equality test is retained, not weakened. Unit tests additionally require the
canonical output grid. This is a storage precision boundary, not a physical
accuracy claim or a different vehicle model. Both platforms must reproduce the
generated files before the corrected preview is selected.

Correction verification: local Node 26/26 and Python 8/8 passed again, syntax check
passed. Linux Python 3.12 with pinned dependencies passed all 6 RMF tests, including
**exact byte equality** for all generated files; remote Node map tests 3/3 passed.
Canonical Campus coordinate displacement relative to unrounded upstream projection
is at most `6.270313425635988e-7 m` over the 157 source vertices. No test assertion
was relaxed; only the converter, generated Campus output and precision metadata changed.

## robots preview / 部署记录

- New release: `/home/steven/src/groundwork/releases/20260928-rmf-maps-02`.
- Archive SHA-256: `70abefd07efdecec54936549acd97f50066e1b28933be0304651e2cda882a99b`;
  verified identical after transfer. This is a dirty-worktree preview, not a Git release.
- URL: `http://10.1.153.185:5180/maps`. No active jobs before each scoped restart.
  Existing run data preserved; original 5173–5176 endpoints returned HTTP 200 and
  were not restarted or modified.
- Retained rollback: `20260928-integration-03` (pre-map), plus `20260928-rmf-maps-01`
  (initial map UI; lacks cross-platform canonical serialization fix). Prefer -02.
- Independent `.venv-map-build` is only for reproducibility checks, not runtime.
  Existing system and Chrono dependencies were not modified.
- The initial deployed -01 passed both maps and workbench browser suites, including
  map source errors/races and real yard/road jobs. Corrected -02 browser recheck:
  `BASE_URL=http://10.1.153.185:5180 node scripts/maps-smoke.mjs` passed all five
  maps/eight floors, 2D/3D, layers/graphs, source-failure preservation, stale-load
  protection, zh/en and 390/320 px checks, with no page errors/external requests.
  Final service PID 2405964; no queued/running jobs, all five ports returned 200.
  Local temporary port 4180 service was stopped after QA.
- This final review/deployment status is a local documentation update after the
  archive was built; the archive contains its pre-deployment review, not this final
  status. No commit or push performed.

## 中文对应自检（精确哈希、命令及路径沿用上文）

2026-09-28 实施代理自检，无独立审查；实现前对话已确认五图/静态范围，当时未 Git
提交。公共稀疏克隆及 ls-tree 核实固定修订，读取 YAML 头、标高、Campus 投影、
包许可、README 和 issue314。hotel/office/airport_terminal/clinic/campus 均有源码，
第六张所查树无匹配许可源码。静态显示不证明合成引擎使用该几何；保留脏工作区，
仅新增 maps 页面、有限静态资源、入口及 MIME/路由，不改物理和实验契约。

### 实际验证

本地 Node22.23.2、Python3.14 临时环境，PyYAML6.0.2、pyproj3.7.2、Shapely2.1.2，
NumPy2.4.4 仅用于上游对比；Chrome153.0.8010.53/Playwright/软件 WebGL。
构建、26 Node（新增3）、118 TS/12文件、语法、8 Python（6新2旧）通过；六私有地图
套件排除，不计通过。Python 覆盖标定、y轴、解析旋转缩放楼层、自然原点和偏移、
非法输入及重建字节一致。

另直接加载固定上游未改 transform/fiducial/wgs84_transform，比较8层全部原顶点，
规范化存储前最大差 1.0048591735576161e-14m，证明算法一致而非测绘准确；HotelL2
变换保存为回归。Campus 后加存储量化见下文。

本地 maps 测五图八层、2D/3D、图层导航、禁用第六、慢响应、失败保留、双语及390/320，
无页面错误或外部请求；workbench 测真实 yard/road、回放/历史竞争/语言/小屏/来源
保护；classic 测四模块、批次、播放、导入导出、小屏。实际检查酒店中文2D、机场3D、
诊所英文320截图，无横向溢出；全景标签较密，可放大；3D单层，不是多层同屏。
空白/链接、原资源哈希通过；CI含Python但未运行远端CI。截图在忽略 artifacts。

### 边界

仅本地静态 JSON，无任意 YAML 上传、外部模型抓取、客户数据、实机、云或原产品
运行依赖。渲染前检查有限数、索引、数量、图片路径和非仿真标记；转义文本，失败
保留地图。家具只有位置，Campus无建筑网格；墙高厚为示意默认。门电梯只保留数据，
无动作或净距结论；maps页无运行，旧按钮仍用合成几何。第六缺源是已接受限制，
无安全/兼容声明，无当时提交、推送或公网发布。

### 跨平台失败与修正

初次 Linux test_sources_conversion_and_determinism 失败，Campus 浮点末位不同。
系统 PyYAML6.0.1/pyproj3.6.1 失败，另装固定6.0.2/3.7.2仍失败，不是简单依赖过旧；
查看和几何检查正常。修正投影米坐标先圆整6位再序列化/求边界，写 coordinateQuantumMetres，
不改原资源/哈希、不弱化字节断言，并新增网格约束测试。属于存储精度非地图精度。

修正后本地26 Node、8Python、语法再次通过；LinuxPython3.12固定依赖6RMF包含
所有生成文件精确字节一致，远端Node3地图通过。157校园顶点相对未圆整上游最大
位移6.270313425635988e-7m，只改转换器、Campus生成结果和精度元数据。

### 部署与恢复记录

maps-02 新release及压缩包SHA见上文，传输前后相同，是脏工作区预览不是Git发布。
每次只停自身前确认无活跃任务，保留实验，原5173–5176均200且未重启。保留
integration-03及maps-01，后者缺跨平台修复，当时优先02。独立 map-build 环境仅
复现，不改系统/Chrono依赖。01曾通过map/workbench；02再次远端map全流程通过，
无错误/外部请求，当时PID2405964、五端口200，无队列任务；本地4180已停。
最终部署自检在本地打包后补写，包里仅含部署前记录；当时未提交推送。当前恢复
必须另看园区版兼容性，不能直接套用旧版状态。
