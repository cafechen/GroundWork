# RMF map library — proposed specification / 规格草案

Status: maintainer-accepted on 2026-09-28; implementation in progress.
本轮用户确认“五张先行、第六张待补，先完成地图层”，实施中。

## Scope / 范围

- Six named catalog entries; five available sources and one unavailable entry.
  Unavailable entries cannot be selected as imported/runnable maps.
- A map-library view reachable from Module A: Chinese/English names, floor
  selection, 2D/3D static inspection, navigation graph and facility overlays.
- Preserve source YAML/images, license, repository URL, pinned revision and
  file hashes. Generated data is local; browsing does not require ROS, Gazebo,
  another project checkout, network access or cloud services.
- Keep imported map inspection separate from existing synthetic experiments.
  Do not draw their vehicle trajectories on a newly selected RMF map.

六个目录项中仅五个可用；地图查看与现有合成实验分开。门、电梯只是数据及可视化，
没有调度、开门、电梯运行、碰撞或安全验证承诺。外部模型引用保留名称和位置；
未导入真实网格的模型明确标记为示意，不伪造外观、尺寸或碰撞轮廓。

## Coordinate/data contract / 坐标与数据

Proposed normalized schema: `schemaVersion`, `id`, localized `name`, `source`,
`units`, `coordinateTransform`, `levels`, `lifts`, `capabilities`, `warnings`.
Levels retain elevation, vertices and names, directed/bidirectional lanes,
graph IDs, walls, floors/holes, doors and model references where present.
Numeric geometry uses metres and radians; retain original parameter metadata.

Hotel has L1/L2/L3 at 0/8/16 m; Clinic has L1/L2 at 0/10 m. Reference-image maps
need measured scale, image-axis conversion and cross-floor alignment. Verify
against upstream transformation logic, not a guessed common image scale.
Airport omits an explicit coordinate-system field; verify upstream default.
Campus explicitly uses WGS84, `generate_crs: EPSG:3414`, and suggested offsets
(22000, 31500). Preserve that declared projection/origin; do not treat degrees
as metres or apply a second projection.

Projected output uses a 1 micrometre serialization grid to canonicalize floating
point last bits across platforms; no map-accuracy claim. This implementation
detail was added after reproducing a byte-rebuild failure with the same pinned
pyproj version on macOS ARM and Linux x86. The exact-byte assertion is retained.

Invalid/non-finite coordinates, broken vertex references, unsupported coordinate
systems, unsafe asset paths and missing calibration must fail clearly without
replacing the previous valid map/run. Missing external mesh assets must produce
visible limitations, not invented obstacle geometry.

## Acceptance / 验收

1. Five source maps load locally with the expected levels; the sixth is visibly
   unavailable and has no fabricated geometry or runnable state.
2. Scale, axes, floor alignment and Campus projection have numeric reference
   tests. Directed edges and graph identities survive conversion.
3. Source revision, hashes and license are inspectable; conversion is reproducible.
4. Both languages and desktop/mobile map selection work, including rapid map/floor
   switching, failed loads and geometry inspection; no stale response replaces
   the selected map. Inspect actual screenshots.
5. Existing run/playback/history and `/classic` remain functional. Imported-map
   UI never implies existing engines are using its geometry when they are not.
6. Source/config text is escaped, paths bounded and no external model fetched
   implicitly. Core tests and syntax checks pass with zero unexpected skips.
