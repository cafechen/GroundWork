# Runnable yard example / 可运行园区示例

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
