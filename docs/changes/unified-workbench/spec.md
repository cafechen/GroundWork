# Specification

GroundWork becomes a single Node workspace with local TypeScript contracts/scenario-engine packages, a file-backed application API, browser workbench and Python Chrono worker. Source is copied, not linked to sibling repositories. Historical demo remains available as the fast kinematic backend.

- A: synthetic yard/road templates, explicit local-metre maps, source-aware GeoJSON import, structured plans and optional configured model generation. Unsupported plan actions are rejected.
- B: migrated Chrono torque-driven tractor and dynamic 0–3 trailer model, with original calibration limitations. Separate model identity from the existing bicycle preview. Runs preserve full-body poses.
- C: migrated service phases, trailer attachment/detachment and following; existing crossing mutex/door fault demo remains. RMF conversion/adapter code is independent and optional; activation may not connect to existing vehicle namespaces or control services.
- D: durable scene/run records, asynchronous jobs, cancellation, versioned frames/events/metrics, browser replay, JSON/report downloads and baseline comparison. Scenario validity and test verdict are separate. Ground contacts are not accident counts.

Data includes coordinate frame, engine/model version, configuration, source provenance and result quality. Chrono output uses simulator time; plots and playback never infer physical correctness from rendering. Imported logs do not gain PASS simply because parsing succeeded.

Deployment: dedicated `/home/steven/src/groundwork` area, LAN port 5180, own data and environment paths, no mutation of existing 5173–5176 services. No system-wide installation or automatic startup. HTTP writes require same-origin requests and bounded validated payloads; shell command inputs are never accepted from clients. This is a trusted-LAN demo, not a public service.
