# Intent: standalone GroundWork integration

Date: 2026-09-28. Source: maintainer explicitly requested reusing the previously identified capabilities, copying code into one independent GroundWork project, and deploying on `robots` for preview.

Accepted scope: A scene/operations, B vehicle dynamics, C traffic/device interactions, D experiment storage/replay/comparison; source migration from the maintainer's Strategist and Robots repositories. The original repositories and running services must remain unchanged. No dependency on their checkout paths, APIs or databases after deployment. Third-party libraries remain explicit dependencies.

Exclude public redistribution of private maps, real vehicle control, safety claims, production authentication claims, unauthorized model API usage and automatic Git push. Default assets are synthetic. Unconfigured AI/RMF capabilities must be visible, not replaced silently by fabricated success.

Acceptance: standalone build; original fast-demo tests preserved; migrated contracts/engine tests; scene planning and actual generated trajectories; isolated Chrono execution producing downloadable versioned runs; replay and comparison; bilingual UI; robots LAN preview on a free dedicated port with recovery/stop instructions; existing services unchanged.
