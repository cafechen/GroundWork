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

原应用数据库、云端服务、用户体系、前端框架不是复用能力的运行时前提；实验历史采用
本地文件，后续园区资源采用独立 SQLite，没有账号系统。完整行为/搜索库保留为 SDK，未接入的外部系统
明确显示未连接，而不是指向原来两个产品的网址。

Source repositories did not expose a blanket root license for all owner-authored
code in the inspected snapshots. The owner's copy instruction is recorded here;
confirm publication/relicensing authority before publicly redistributing copied
code. Do not infer that unreviewed source assets acquired GroundWork's MIT license.
No source repository was modified by this migration.

## 中文来源及授权说明

维护者于 2026-09-28 明确要求把能力复制到一个 GroundWork 工程并在 robots 部署。
这授权实施和指定预览，不授权私有数据上传、第三方重许可、Git 推送或厂商兼容声明。
上表路径、修订号是精确溯源标识，不翻译：

- 契约及场景引擎从 Strategist 的 `6538e7cf391ffe0fc551fe682da9e1785c32a26b`
  整体复制源码和测试，包名改为 `@groundwork`；复制编译配置并新增独立 workspace 清单。
- Chrono 从 Robots 的 `80d2d5398071ffca4f4a7e2bfcd72ba9373b9428` 平移，显式场景
  原点、1–5 车、可选挂车数量/速度，保留力矩、关节、作业算法，独立离线运行。
  原 verify 脚本仍按原五车数据；新 check_run 按场景验证，保留原数值阈值。
- 地图转换抽取投影、网格、道路冲突及有向图逻辑，去掉私有文件、硬编码办公室/
  车辆资源和绘图库；server/workbench/viewer 是新集成，不是复制 Nest/Prisma/React/Gzweb 产品。
- 刻意不复制私有道路/CAD、客户轨迹、凭证、数据库账号、Unitree 模型/策略、Gzweb、
  生产车队命名空间、绝对启动路径、原端口和源码库软链；未修改任何来源仓库。
- 所查来源快照没有覆盖全部自有代码的根许可证。所有者复制要求已记录，但公开
  再分发/重许可权限仍需确认；不得推断平移后自动变成 MIT。

English clarification: runs remain file-backed; the newer park platform uses its
own SQLite resource store. Neither depends on the original products' databases
or account services. Unconnected SDK/system capabilities remain explicitly unconnected.

## Next.js refactor / Next.js 重构来源

`src/simulation` ports the repository's existing JS engines/contracts to TypeScript;
Prisma services and React feature pages are new GroundWork code. Numerical parity
is tested against retained legacy modules. shadcn/ui primitives come from the official
new-york-v4 registry (2026-09-28), with aliases and heading semantics adapted;
see [license](../licenses/shadcn-ui-MIT.txt). Strategist informed layering only.
数值代码由本仓库旧 JS 平移为 TS，服务与 React 业务页为新增代码；以旧模块验证一致性。
shadcn/ui 来自官方注册表并保留许可证，调整别名及标题语义。Strategist 仅作分层参考，
不依赖其服务、源代码路径或凭证运行。
