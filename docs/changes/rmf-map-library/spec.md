# RMF map library — proposed specification / 规格草案

Historical accepted specification; execution evidence is in [review](review.md).
历史确认规格；实际执行见自检，下面“实施中”为当时状态。

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

## 中文对应规格补充

从旧 Module A 可进入独立地图库，支持双语、楼层、2D/3D、导航和设施；保留源 YAML/
图片、许可、URL、固定修订及文件哈希，浏览本地生成资源无需 ROS/Gazebo/另一仓库/
云服务。不把旧合成轨迹画到新选 RMF 图上当作真实仿真。

标准化契约字段如上，楼层保留标高、命名顶点、单/双向边、graph ID、墙、地板孔洞、
门、模型引用和原参数；单位米/弧度。Hotel0/8/16米，Clinic0/10米。图片图需测量比例、
y 轴变换和跨层对齐，按上游验证，不猜共同缩放；Airport 无字段时核实默认。
Campus 使用 WGS84→EPSG3414 和 (22000,31500) 原点，不能把度当米或重复投影。

同版本 pyproj 在 macOS ARM/Linux x86 仍发生字节重建差异后，新增投影坐标 1 微米
存储网格；保留精确字节断言，不作为地图精度声明。非法/非有限坐标、坏索引、
不支持坐标系、不安全路径、缺标定要明确失败，保留先前有效地图/实验。外部网格缺失
要提示，不能编造障碍几何。

验收：五张及预期楼层可读，第六禁用无伪造；比例/轴/楼层/投影有数值参考测试，
边方向和图身份不丢；来源哈希许可可查且重建可复现；双语和桌面/手机可用，快速
切图/楼层及失败请求不污染选择，实际看截图；原运行回放历史和 classic 正常，
不暗示旧引擎已用新地图；文本转义、路径限制，不自动拉模型，核心/语法通过无意外跳过。
