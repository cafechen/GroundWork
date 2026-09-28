# Runnable yard example / 可运行园区示例

Historical creation evidence; source/scripts were subsequently committed in
`a634805`. See [quickstart](../quickstart.md) for current reuse instructions.
历史创建证据，源码/脚本后续进入 `a634805`；当前复现步骤见快速入门。

2026-09-28: maintainer explicitly requested “先给我造一条能跑的数据，我先看看效果，
后面一起优化”. Scope is sample data using the existing platform, not another UI or
engine redesign. No change to 亚朵场景 or existing devices/routes/runs. No deployment,
real gateway connection, authentication change or Git commit.

Plan: create an explicitly synthetic 40 × 32 m yard, generic tugger + one trailer,
roomy route with two rounded turns, start/end semantic stations and a slow zone.
Validate with the unchanged planar engine before creating new named resources on
robots:5180 through its normal API; run once, check completion/zero sampled contact
and nonzero motion, then inspect actual browser playback. Preserve original data.
Geometry, stations and model assumptions are illustrative, not calibrated. The route
is authored, not autonomously planned; loading/unloading labels do not actuate forks.

Acceptance: deterministic result, complete route, zero modeled contact, all three
body footprints remain inside outer bounds, meaningful turn and displacement.
Browser timeline must visibly change vehicle geometry, not just advance a clock.
Persist successful run for user replay and provide a direct park URL.

## Verification / 验证

Implementing-agent self-review only. Node 22.23.2:
`node scripts/ready-yard-demo.mjs` preflight PASS; identical repeat output.
`BASE_URL=http://10.1.153.185:5180 node scripts/ready-yard-demo.mjs --apply`
created only the new example resources via the normal API. Existing 亚朵场景
record deep-equal before/after. No engine code or collision rule changes.

- Park: `33fdfc9f-366f-405c-bb40-38334e24f90a`, name 可运行示例 · 牵引车物流园.
- Map: `03e3c115-07e7-40fa-9cd3-d5925fcb9844`; model: `6a13bd2e-9042-4dd5-9d9e-a3b460cbbfaa`.
- Result: `17d459be-c759-410e-8ff3-481b35cfb262`, `COMPLETED`.
- Distance 54.5300 m; goal reached at 51.1 s in a 65 s horizon; sampled contact
  episodes 0; maximum reference-path error 0.02950 m. All tractor/trailer/drawbar
  sampled vertices inside the yard. Actual slower frames inside the speed zone.
- `npm test`: 37/37 passed; `npm run check` passed.
- `scripts/ready-yard-preview.mjs` against robots: playback advanced and vehicle
  polygons changed, 30 s seek rendered in 3D, no page errors. Screenshot inspected:
  ignored `artifacts/ready-yard-demo-3d.png`. First QA attempt had a script-only
  fetch `.ok()` vs `.ok` mistake, corrected before the successful browser check.

Reuse `examples/ready-yard.mjs` for reproducibility. The apply script requires an
explicit BASE_URL/--apply and refuses duplicate active example parks. Resource
creation spans API calls (not one cross-resource transaction); IDs are logged for
recovery. The preview script only replays existing results, no data writes.

No full legacy UI matrix rerun: no application/engine behavior changed this turn.
No independent physical validation, real commands, new service release or Git commit.

## 中文对应记录

2026-09-28维护者要求“先给我造一条能跑的数据，我先看看效果，后面一起优化”。
范围只是使用现有平台创建示例，不再重构UI/引擎，不改亚朵或已有设备路线实验，
当时不部署新服务、不连真实网关、不改认证、不提交。

计划为40×32米合成园区、通用牵引车和单挂、宽裕双圆角、起终点语义站和限速区；
先用未改引擎验证，再经robots5180正常API新建，运行一次、验完成/零采样接触/非零
位移，并实际检查浏览器回放，保留旧数据。几何/模型示意非标定，路线人工设计
不是自主规划，装卸名称不模拟货叉。

验收为确定性、完成、无建模接触、三类车体采样顶点全在边界内、有转弯和位移；
浏览器不能只走时钟，车体几何必须变化，保留成功记录并给用户直链。

实际为同代理自检：Node22.23.2预检PASS且重复一致，显式--apply经API只增示例；
亚朵记录前后deep-equal，无引擎或接触规则修改。园区/地图/模型/实验UUID见上文，
结果COMPLETED，54.5300米、65秒时限内51.1秒到达、0采样接触、最大偏差0.02950米，
车头/挂车/牵引杆采样顶点在园区内，限速区确有慢帧。37 Node和语法通过；远端
preview脚本验时间推进与多边形移动，30秒seek/3D，无页面错误，实际看截图。
首次QA脚本误把fetch响应.ok当函数，修正后通过，不是应用修复。

fixture可复用，写入脚本要求显式BASE_URL和--apply，拒绝活动同名园区；跨API多次
创建非统一事务，打印ID便于恢复。预览脚本只读。无应用行为修改所以当时未复跑完整
旧版UI矩阵；无独立物理验证、实控、新服务发布或当时Git提交。
