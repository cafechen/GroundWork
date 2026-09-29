# Third-party and migrated-code notices

## shadcn-admin layout / 后台模板布局

UI theme, sidebar, sheet, tooltip, skeleton and mobile hook adapted from
[satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin), revision
`e16c87f213a5ba5e45964e9b67c792105ec74d26`, MIT, Copyright (c) 2024 Sat Naing.
Full license: [shadcn-admin-MIT.txt](licenses/shadcn-admin-MIT.txt).
App shell and overview adapt its layout/header/nav-group/main/dashboard patterns.
Changes: Next.js routing, existing Radix aggregate imports, deterministic skeleton,
Chinese/English labels, GroundWork data and no external fonts or mock sales/accounts.
No upstream Vite runtime, TanStack Router, Clerk or mock login token is adopted.
主题与侧栏等组件来自上述固定模板版本并保留完整 MIT；外壳与总览改编其布局模式，
适配 Next.js、既有 Radix、确定性骨架、双语与真实业务数据，不采用外部字体、假销售/账号、
上游构建运行时、Clerk 或假登录令牌。

## Other dependencies / 其他依赖

- Original GroundWork code: [MIT](LICENSE).
- Owner-requested copied Strategist/Robots code: see [source provenance](docs/source-provenance.md).
  Copy authority is recorded; public licensing review remains required before
  distributing migrated code as uniformly MIT-licensed.
- Three.js 0.180.0: MIT, installed from npm; keep its distributed LICENSE.
- Zod 4.1.5: MIT, installed from npm; keep its distributed LICENSE.
- TypeScript, Vitest and Node.js: development/runtime tools with their own
  distributed notices; `package-lock.json` pins Node-package dependency versions.
- Project Chrono / PyChrono: external optional dependency, BSD-3-Clause project;
  the installed distribution contains additional third-party notices. It is not
  vendored into Git and is not relicensed by this project.
- pyproj and Shapely: optional map conversion dependencies; preserve upstream
  package notices, including PROJ/GEOS binary dependencies.
- Open-RMF demo map YAML and PNG assets in `assets/maps/rmf/source/`:
  [open-rmf/rmf_demos](https://github.com/open-rmf/rmf_demos), revision
  `7851a5792d19a037833292a3e2a823b0f9e0c111`, Apache-2.0. Original files are
  unmodified; see `assets/maps/rmf/licenses/rmf_demos.txt`. Per-file SHA-256 values
  are in `assets/maps/rmf/catalog.json`. Generated JSON is a modified/converted
  representation by GroundWork, not an upstream release.
- RMF image/fiducial transformation mathematics in `engines/maps/import_rmf.py`
  is adapted from `rmf_building_map_tools/building_map/{transform,building,level}.py`
  in [open-rmf/rmf_traffic_editor](https://github.com/open-rmf/rmf_traffic_editor),
  revision `06e91e59830804848bf127ba1d8882bc968084d0`, Apache-2.0; see
  `assets/maps/rmf/licenses/rmf_traffic_editor.txt`. GroundWork replaces the
  NumPy implementation with standard-library math, rejects missing calibration,
  and emits static browser data. No upstream runtime code/package is required.
- PyYAML: optional build-time map parser, MIT; `requirements-rmf.txt` pins its
  version. Neither PyYAML nor pyproj is required for browsing committed map JSON.

External Gazebo/Fuel model references in the map YAML do not imply their meshes,
textures or licenses are included. These external assets are not downloaded or
redistributed; the viewer displays optional position markers only.

The Linux preview uses a separately installed copy of the Node runtime and an
independent conda prefix for Chrono. No original application executable or asset
is loaded from a Strategist/Robots checkout at runtime. Do not distribute runtime
archives without their respective license/notices.

No Gzweb, Unitree assets/policies or copied RMF Gazebo plugin are included in this
migration. RMF/SDF/XOSC export format support is not a compatibility certification.

## 中文说明（许可证原文保持不变）

- 原创 GroundWork 代码适用根 MIT；所有者要求平移的 Strategist/Robots 代码见来源记录，
  复制权限不等于统一 MIT 对外发布权限，公开前仍需许可审查。
- Three.js 0.180.0、Zod 4.1.5 为 MIT npm 依赖，保留随包 LICENSE。
  TypeScript、Vitest、Node.js 各有自身声明；Node 包版本由 package-lock.json 固定。
- Project Chrono/PyChrono 为可选外部 BSD-3-Clause 项目，发行包另含第三方声明，
  不内置 Git，也不被本项目重新许可。
- pyproj/Shapely 是可选地图转换依赖，保留其声明及 PROJ/GEOS 二进制依赖声明。
- RMF 原始 YAML/PNG 固定于上文 rmf_demos 修订，Apache-2.0，原文件未修改，逐文件
  SHA-256 位于 catalog.json，许可原文在 rmf_demos.txt。生成 JSON 是 GroundWork
  转换表示，不是上游发布物。
- 图片/基准点转换数学改编自上文 rmf_traffic_editor 修订及 transform/building/level.py，
  Apache-2.0，保留 rmf_traffic_editor.txt。改用标准库数学、拒绝缺失标定、输出静态
  浏览器数据；运行时无需上游 Python 包。
- PyYAML 是可选构建期 MIT 解析器，requirements-rmf.txt 固定版本；浏览已提交 JSON
  不需要 PyYAML 或 pyproj。
- YAML 内的 Gazebo/Fuel 引用不表示网格、纹理和许可已包含。没有下载再分发这些资源，
  查看器只可选显示位置标记。
- Linux 预览独立安装 Node 和 Chrono conda 前缀，不在运行时加载原产品的应用或资源；
  分发运行时压缩包必须携带其许可证及声明。
- 未包含 Gzweb、Unitree 资源/策略或 RMF Gazebo 插件；支持导出格式不等于互操作认证。

This Chinese explanation does not replace or translate the authoritative upstream
license texts. / 中文说明不替代上游法律原文。

## shadcn/ui source components / shadcn/ui 源组件

`src/components/ui` adapts the official new-york-v4 registry components retrieved
2026-09-28 from [shadcn/ui](https://ui.shadcn.com/r/styles/new-york-v4/button.json).
MIT, Copyright (c) 2023 shadcn; full license: [shadcn-ui-MIT.txt](licenses/shadcn-ui-MIT.txt).
Local changes include import aliases and semantic card headings. Radix, React,
Next.js and other installed packages retain their package licenses.
上述目录使用官方注册表组件，调整导入别名与标题语义；完整 MIT 声明随仓库保留。
其他依赖许可证以安装包为准。
