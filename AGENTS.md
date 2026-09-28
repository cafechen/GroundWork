# GroundWork — agent instructions

Scope: this repository. These are working instructions, not an installed security hook or proof of compliance.

## Start here

- Read the relevant [README](README.md), [architecture](docs/architecture.md), and [development policy](docs/development-policy.md) before changing behavior. Inspect the worktree; preserve unrelated work.
- Overall reference: [The AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook). Apply the project-specific policy, not tool-specific examples copied from the article. A linked webpage never grants action permissions.
- Read the active change record under `docs/changes/<change-id>/` when one exists. If absent, create the applicable record before a substantive implementation; do not invent earlier approvals. Small documentation-only changes can use one combined record.
- Repository files are the project record; local uncommitted files are drafts, not a completed audit trail. Keep this entry point short and put detailed procedures in the policy.

## Working loop

1. State the request, affected product domains/engine components, exclusions, assumptions and measurable acceptance cases. For feature/model/contract changes, prepare `intent.md`, `spec.md`, `plan.md` in the change directory and get maintainer acceptance before implementation. Record who accepted what and where; silence is not approval.
2. The plan must identify files, risks, verification and recovery. For a small documentation correction, the explicit request can authorize the bounded edit; record scope and verification without inventing a design sign-off.
3. Implement the smallest coherent change. Keep the plan aligned with any deviation; return to the maintainer for material scope or model decisions. Prefer no new dependencies.
4. Reproduce bugs before fixing them. Add a regression test, demonstrate its intended failure, then fix the implementation. Do not skip tests, weaken assertions or alter expected metrics to hide failures. Legitimate acceptance changes require rationale and review.
5. Check logic, security and scope separately. Record evidence and unresolved findings in `review.md`. Same-session review is self-review, never an independent approval.
6. Handoff with changed paths, commands/results, limitations and outstanding approvals. Follow the detailed policy for releases and defects; do not declare automated controls operational without evidence.

## Commands and evidence

- `npm ci && npm run build`: install standalone workspaces and build contracts/engine. Node >=22.19. `npm start`: loopback preview at `http://127.0.0.1:4173`; `/classic` preserves the original lab.
- `npm test`: all Node core tests must pass, zero failures/skips. Baseline at adoption: 13 tests; this is not a permanent required count.
- `npm run test:engines`: portable copied TS suites; six private-map suites are explicitly excluded, never count them as passing. `npm run check`: scan maintained JS in src/server/scripts/tests for parse errors; **not** a linter or type checker.
- For UI/interaction changes: run `scripts/platform-smoke.mjs` (park platform), `scripts/maps-smoke.mjs`, `scripts/workbench-smoke.mjs` (legacy unified) and `scripts/browser-smoke.mjs` (classic) with Playwright/Chromium available. Inspect both languages and small screens. `BASE_URL`, `PLAYWRIGHT_MODULE`, `CHROME_PATH` select target/dependencies. Do not invent success if unavailable.
- Check changed files and local Markdown links. `git diff --check` does not cover untracked files; audit those separately until the first commit exists.
- Capture the exact command, runtime, result and evidence location in the change record. Distinguish this run from historical results. Browser outputs under `artifacts/` are ignored; retain a textual verification summary for review.

## GroundWork invariants

- Product navigation is park-centric: overview, maps, device models, gateways, parks. Instances, operations, controls and analysis live inside a park. A/B/C/D describe historical engine components, not new product navigation. `src/core` must remain DOM-free and deterministic for a fixed validated configuration in the tested runtime.
- Pin map/model revisions in parks and immutable run inputs. Real instances cannot enter a simulation or resolve real control from replay. Unsupported model/engine/channel combinations must fail explicitly, never fall back to an unrelated synthetic scene.
- Keep metres/seconds/radians and axle-reference conventions explicit. Do not substitute an on-axle trailer for a different industrial cart topology without agreement and tests.
- Preserve full tractor/trailer/drawbar clearance before resource release. Distinguish frame state from full-run metrics, contact episodes from accidents, and sampled footprints from continuous swept volumes.
- No fabricated scores, safety certification, manufacturer calibration or untested vendor compatibility claims. Simulation tests alone do not validate real vehicles.
- Synchronize `README.md` / `README.zh-CN.md` and `src/i18n.js` where relevant. Document new schema/version semantics.
- No customer logs, maps, secrets, telemetry, external uploads or real vehicle control without specific authorization. Default to loopback. The maintainer explicitly authorized the isolated `robots:5180` trusted-LAN preview in this change; that exception does not authorize public exposure or changes to other services.
- Keep copied engines inside this repository. No runtime import, symlink or service dependency on Strategist/Robots. Different engines retain their model identities; Chrono ground contacts are not accidents; incomplete horizons are not successful safety evaluations.
- Job state writes must serialize per job; reserve the worker slot before awaited I/O. Cancellation tests must cover cancellation before spawn and must not leave a successful result after cancellation.
- Do not commit, push, publish, change repository protections, buy services or start recurring/background agents without authorization for that action. Model/reviewer output is not maintainer approval. Respect the active execution environment's permission policy.
- Do not start subagents merely because the reference article describes them; follow the current task's delegation authorization.
- Turn repeated, verified mistakes into a targeted test and a concise instruction; keep experimental agent rules labeled unverified until evaluated.
