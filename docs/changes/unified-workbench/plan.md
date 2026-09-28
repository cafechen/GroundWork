# Implementation plan

Request acceptance: the maintainer authorized implementation and robots deployment in the current conversation after reviewing the integration proposal. This plan documents the implementation choices, not a fabricated earlier approval.

1. Snapshot source revision/provenance; move the reusable TypeScript packages and Chrono source into GroundWork; preserve source tests/notices. No source repository edits.
2. Add failing contract tests for normalized run records, planning endpoints, durable storage, unsafe input, backend isolation and result comparison before implementing them.
3. Implement standalone API and optional model provider, native map/scene handling, road engine adapter and an isolated offline Chrono runner. Persist raw and normalized outputs under GroundWork-owned data paths.
4. Connect A/B/C/D to these capabilities, add 3D/2D run inspection without requiring Gazebo or the Robots website, preserve the current fast demo.
5. Run local core/migrated/integration checks and browser QA. Where external dependencies are unavailable, report them explicitly and test on robots with the independent installation.
6. Deploy a timestamped release on port 5180. Verify health, fresh Chrono jobs, persistence, replay and old service liveness. Preserve previous GroundWork release when present; rollback changes only its own process/release pointer.

Risks: vehicle topology differs between engines; AI credentials are not implied permission to spend; copied data may not be redistributable; original RMF and Chrono are separate control stacks; dynamic trailer identities must not be connected across attach/detach; CPU jobs must be bounded and cancellable. Review records must distinguish migrated source, wired functionality, executed checks and remaining integration work.

## Outcome

Implemented and deployed the independent integrated slice. See [review.md](review.md)
for executed tests, reproduced/fixed defects and retained boundaries. RMF is a
map export, not an activated dispatcher; the optional model gateway is unconfigured;
map conversion and full template/search capabilities are CLI/SDK features, not
all dedicated GUI screens. No original product service or private map is required.
