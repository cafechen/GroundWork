# RMF map library — implementation plan / 实施计划

Status: maintainer-accepted on 2026-09-28; implemented and verified. See
[review](review.md) for deployment status and the cross-platform serialization fix.

The user explicitly accepted “五张先行、第六张待补，先完成地图层” in the
current conversation before substantive implementation. The earlier preflight
changed no runtime code or deployed service. No commit/push authorization implied.

## Proposed sequence / 建议顺序

1. Obtain acceptance of [intent](intent.md) and [spec](spec.md), including the
   unavailable sixth source and no new simulation behavior in this change.
2. Vendor only required YAML/images and licensing under `assets/maps/rmf/`;
   add a revision/hash manifest and update third-party notices.
3. Add a deterministic converter under `engines/maps/` or `scripts/`, using
   verified upstream transforms. Prefer existing tooling; document any build-only
   YAML/projection dependency. Generated browser JSON needs no ROS runtime.
4. Add bounded map catalog/static delivery to `server/http.mjs`; add a separate
   map-library component in `src/`, linked from `src/workbench.js`. Preserve run
   selection guards and keep map provenance separate from simulation verdicts.
5. Add conversion/schema/security tests and browser coverage. Synchronize both
   READMEs, architecture and a map-library manual with actual supported behavior.
6. Record self-review evidence, then update only the previously authorized
   GroundWork preview on robots:5180 after checking for active jobs. Preserve the
   previous release and all run data; smoke-test before handoff. No commit/push.

## Verification and recovery / 验证与恢复

Planned commands: `npm run build`, `npm test`, `npm run test:engines`,
`npm run check`, existing map-converter tests, new RMF conversion tests,
`scripts/workbench-smoke.mjs`, `scripts/browser-smoke.mjs` and a map browser test.
These are planned checks, not passing results for this change.

The originally planned checks above were subsequently executed; their actual
results (including an initial cross-platform failure and correction) are recorded
in the review. No simulation engines or vehicle models were changed.

Risks: misleading map/run coupling; pixel/WGS84 scale errors; floor misalignment;
omitted lane direction; external assets with unresolved licensing; stale loads;
renderer performance on Airport. Test these explicitly and document unsupported
features. Do not introduce full Gazebo/ROS dispatch to solve a browsing feature.

Recovery: add maps independently of run storage and vehicle contracts; keep
existing synthetic defaults and `/classic`. For deployment, switch only the
GroundWork release pointer back to its prior verified release, retaining data.
Never reset the dirty worktree or touch other services.
