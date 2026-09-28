# Third-party and migrated-code notices

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
