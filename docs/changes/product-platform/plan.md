# Park platform — implementation plan / 园区平台实施计划

## Active accepted implementation / 当前实施

User approved the revised five-menu park-centric design, not the historical seven
menus below. Implement SQLite asset/version/audit persistence (`node:sqlite`,
existing Node >=22.19), strict schemas, five global pages and seven park tabs.
Keep immutable map/model versions and store park maps, instances, business objects
and tasks as one optimistic-revision aggregate. Seed five RMF maps, internal generic
models and an explicitly local simulation gateway; no branded fake vendor models.
Map edits create new revisions; park references remain pinned. Preserve legacy
`/workbench`, `/classic`, `/maps`, run history and raw upstream map provenance.

New park-run adapter consumes the chosen map floor, declared route, device/model
snapshot and operational objects. First planar tugger/forklift simulation uses
explicit vehicle parameters and sampled footprints; capability-gate unsupported
types/engines. Existing Chrono remains available as a clearly separate mechanics
lab while arbitrary park geometry/dynamics support is verified, not silently
substituted. Real telemetry/control/media adapters remain unconnected and visible.
Verification covers persistence/version/conflict/reference checks, actual route and
parameter effects, physical-instance rejection, job lifecycle, full browser flows,
bilingual/mobile, legacy regression and deployment to the already scoped 5180.

Maintainer confirmed trusted-LAN single-user/no-auth. Current implementation contract
and boundary: [park platform](../../park-platform.md). The implementation uses the
existing shared HTTP module rather than a separate `platform-api.mjs`. No new npm
dependency. Platform DB is `data/platform.sqlite`, independent of historical runs.

## Historical proposal (superseded) / 以下为已取代的初稿

Pending decisions and seven-menu/login proposals below are historical, not active
approval gates. Arbitrary-map Chrono, real data/control and external vendor models
remain explicitly unimplemented; the existing synthetic Chrono lab is preserved.

Status: awaiting acceptance of scope, product model and first delivery boundary.
Request reference: current conversation's eight-point business description.

## P1 — persistent platform and workspace editor / 平台对象与工作空间编辑

1. Introduce dedicated platform contracts rather than reuse the copied
   `packages/contracts/src/workspace.ts` historical loose response types as a new
   database schema. Target `server/platform-contracts.mjs`, `server/platform-store.mjs`,
   `server/platform-api.mjs` and contract/store/API tests. Select a transactional
   local store after confirming Node/runtime constraints; likely SQLite for linked
   assets/versions/instances rather than many interdependent mutable JSON files.
2. Seed map records from the existing catalog, preserving source hashes and
   versions. Separate resource import/metadata from the read-only base assets.
   Archived or referenced records are not destructively deleted.
3. Product management first reuses **generic existing GroundWork** tugger/forklift
   definitions. Add clone/edit/import/export and published version binding. Separate
   shape/configuration support from verified engine support. For mainstream vendor
   models, inspect official source, revision, license, units, joints, meshes and
   controller availability before proposing a named import; do not add random
   brand-named placeholders or claim a quadruped works with a wheeled engine.
4. Persist real devices, gateway records and per-stream bindings, showing explicit
   unconnected/configured states. No implicit cloud connection or stored plaintext
   credential in browser-visible JSON. Introduce simulation entities separately.
5. New `src/platform*.js/css` / entry HTML with the proposed seven menus; extend
   the map renderer for workspace overlay editing rather than mutate static map
   rendering into a fake simulation. Add object inspector, undo/redo, save/reopen,
   floor/frame checks and concurrent-write conflict reporting.
6. Create simulation/physical workspaces as different kinds of the same workspace
   aggregate. Preserve old routes via a legacy entry. Root opens overview; do not
   start an old simulation by default. Old experiment provenance stays unchanged.
7. If actual login is accepted, implement and test authentication before treating
   physical-device records or any credentials as private. Specify the transport
   boundary before deploying credentialed LAN access. No fake login screen.

## P2 — selected-map simulation closed loop / 选定地图上的仿真闭环

1. Freeze workspace revision, product version, virtual entity, route/task/overlay,
   engine configuration and evaluation settings in an immutable run input.
2. Refactor existing engine adapters, not just the viewer: `server/domain.mjs`,
   `server/jobs.mjs`, `server/worker.mjs`, `engines/chrono/physics.py` / `train.py`
   and appropriate kinematic code. Remove implicit synthetic-route fallback from
   the new workspace API. Existing legacy scenarios remain explicitly synthetic.
3. Start with a single-floor tugger case using a declared feasible route and
   supported dimensions/topology. Add route/control and Chrono tests without
   claiming calibrated forklift lifting, perception or quadruped locomotion.
4. Build an adapter capability matrix so a product can be stored/edited without
   falsely becoming runnable in every engine. Implement the selected real fields;
   unsupported controls are disabled or rejected, not silently ignored.
5. Reuse persistent job execution/cancel/restart, replay and report components.
   Add normalized simulation stream/session metadata and a data/analysis page;
   metrics and compare guardrails retain engine-specific meanings.

## Later integration, not silently included / 后续接入而非隐含承诺

Named mainstream robot models; sensor/rendering adapters; external autonomy stacks;
actual remote cloud/edge gateway protocols; bulk video/point-cloud ingestion;
production live monitoring and device-specific remote takeover. Keep their domain
slots and capability states but do not present configuration as functioning integration.

## Verification and recovery / 验证与恢复

- Test resource CRUD, transactions, version pinning, schema migrations, permissions,
  archive behavior and restart persistence in a temporary database.
- Browser: create model derivative → create simulated workspace → select map and
  floor → place/edit stations → save/reopen → create virtual device → run supported
  case → inspect aligned data and report. Include physical workspace registration
  flow without sending real commands. Test both languages and small screens.
- Numeric simulation tests: coordinates, parameter-effect tests, route feasibility,
  control response, hitch/steering conventions, timestep sensitivity and explicit
  unsupported cases. Preserve old tests; legitimate schema changes require recorded
  acceptance, never a relaxed assertion to conceal failure.
- Existing `npm run build`, `npm test`, `npm run test:engines`, `npm run check`, Python
  map tests and maps/workbench/classic smoke suites remain baseline. New checks are
  required; no claim of success before running them.
- Back up store metadata before schema migration; new database namespace plus
  immutable legacy run data allows recovery. No destructive dirty-worktree reset.
- Local verification precedes any approved robots:5180 preview update. Preserve
  older release, run history and other services; no commit/push/publication implied.

## Required decision / 必要确认

Approve seven-menu/domain restructuring and the P1→P2 sequence; confirm P1 actual
single-admin login or continued explicit no-auth local preview. A/B/C/D will cease
to be product navigation; it survives only in historical documentation/legacy demos.
Physical registration is in P1; actual stream/control integrations are not represented
as finished. No detailed implementation approval has yet been recorded.
