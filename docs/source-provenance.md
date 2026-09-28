# Source provenance / 源码迁移记录

The maintainer explicitly requested reuse by copying code into one GroundWork
project and deploying on `robots` in the current conversation (2026-09-28).
This is implementation/deployment authority, not permission to upload private
data, relicense third-party assets, push Git commits or claim vendor compatibility.

| GroundWork path | Source | Source revision | Treatment |
| --- | --- | --- | --- |
| `packages/contracts/src` | Strategist `packages/contracts/src` | `6538e7cf391ffe0fc551fe682da9e1785c32a26b` | Whole source/test copy; package namespace changed to `@groundwork` |
| `packages/scenario-engine/src` | Strategist `packages/scenario-engine/src` | same | Whole source/test copy; runtime imports remain inside GroundWork |
| `tsconfig.base.json`, package tsconfigs | Strategist compiler settings | same | Copied; standalone npm workspace package manifests added |
| `engines/chrono/physics.py` | Robots `experiments/chrono_tugger/physics.py` | `80d2d5398071ffca4f4a7e2bfcd72ba9373b9428` | Explicit scene origin, 1–5 vehicles; isolated offline invocation |
| `engines/chrono/train.py` | Robots `experiments/chrono_tugger/train.py` | same | Target trailer count/speed configurable; same torque/joint/service algorithms |
| `engines/chrono/verify*.py` | Robots original verification scripts | same | Historical verifiers retained, still expect original five-vehicle artifacts |
| `engines/chrono/check_run.py` | Adapted from train verifier | same | Portable scene-aware regression checks, original numeric limits retained |
| `engines/maps/convert.py` | Robots `geojson_factory/tools/build_map.py` | same | Extracted projection, mesh, conflict and directed graph logic; removed private files, hard-coded office/vehicle assets and plotting stack |
| `server/`, `src/workbench.*`, `src/viewer.js` | New GroundWork integration | this change | File-backed orchestration and standalone UI, not copied Nest/Prisma/React/Gzweb products |

Intentionally not copied: private road/CAD maps, customer trajectories, credentials,
database/account records, Unitree models/policies, Gzweb bundle, production fleet
namespaces, absolute launch paths, ports and source-repository symlinks.

原应用数据库、云端服务、用户体系、前端框架不是复用能力的运行时前提；本次采用
本地文件替代数据库和账号系统。完整行为/搜索库保留为 SDK，未接入的外部系统
明确显示未连接，而不是指向原来两个产品的网址。

Source repositories did not expose a blanket root license for all owner-authored
code in the inspected snapshots. The owner's copy instruction is recorded here;
confirm publication/relicensing authority before publicly redistributing copied
code. Do not infer that unreviewed source assets acquired GroundWork's MIT license.
No source repository was modified by this migration.
