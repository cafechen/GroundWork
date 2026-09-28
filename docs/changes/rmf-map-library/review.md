# RMF map library — implementation self-review / 实施自检

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
