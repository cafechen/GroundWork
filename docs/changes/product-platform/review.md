# Park platform — implementation self-review / 实施自检

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
