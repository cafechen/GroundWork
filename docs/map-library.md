# Map library / 地图资源库

## Next.js transition / Next.js 迁移说明

The current default is React/Next.js + MySQL/Prisma; see the root README and
[implementation review](changes/nextjs-platform/review.md). Five menus and seven
park tabs are retained. Old hash URLs become `/parks/<id>/<tab>`.
当前默认 React/Next.js + MySQL/Prisma；五主菜单和七子页保留，旧 hash URL 改为页面路径。

Current React previews include floor/2D/3D, graph selection, lane/wall/facility/model
position toggles and optional names. Floors preserve holes; lifts preserve yaw and
floor membership. Display toggles never change collision rules; missing meshes
remain markers, and Campus does not gain invented floor geometry. The detailed
screenshots below belong to `npm run legacy:start`, not exact current UI layouts.
当前 React 支持楼层、2D/3D、导航图筛选、路线/墙/设施/模型位置开关与名称显示；
保留地板孔洞、电梯旋转和楼层关系。隐藏图层不改变碰撞规则；缺失网格只画位置标记，
Campus 不虚构地板。下方截图属于旧版入口，不代表当前 React 的精确布局。

## Legacy detailed reference / 以下为旧版详细参考

Open `/maps` or the **Map library** link in the workbench engine toolbar.
打开 `/maps`，或点击实验工作台引擎栏中的“地图资源库”。

This is a static map inspection surface, separate from experiment replay. Map
selection does **not** change the yard, road or Chrono simulation input. There
is no run button here, live RMF/ROS dependency, fleet scheduling, door actuation,
lift movement or collision evaluation. / 此页只查看静态地图，选择地图不会改变现有
仿真输入；没有车辆运行、调度、门禁或电梯动作，也不提供碰撞验证结论。

| Map / 地图 | Floors / 楼层 | Imported / 已导入 |
| --- | --- | --- |
| Hotel / 酒店 | L1, L2, L3 (0, 8, 16 m) | Floors, walls, lanes, doors, lifts, model anchors / 地板、墙、路线、门、电梯、模型位置 |
| Office / 办公室 | L1 | Floors, walls, lanes, doors, model anchors / 地板、墙、路线、门、模型位置 |
| Airport Terminal / 机场航站楼 | L1 | Floors, walls, lanes, doors, model anchors / 地板、墙、路线、门、模型位置 |
| Clinic / 诊所 | L1, L2 (0, 10 m) | Floors, walls, lanes, doors, lifts, model anchors / 地板、墙、路线、门、电梯、模型位置 |
| Campus / 校园 | L1 | Geographic navigation topology and external environment anchor / 地理坐标导航拓扑、外部环境模型位置 |
| Manufacturing & Logistics / 制造与物流 | Unavailable / 待补 | Source not found in pinned repository; disabled, no substitute / 所核查仓库无对应源码，不用其他场景替代 |

## Inspection / 查看

- Select a map, floor and navigation graph. 2D shows one-way arrows and optional
  waypoint names; 3D shows wall/floor geometry, lane direction and facility outlines.
  Toggle layers independently. / 切换地图、楼层、导航图及图层；2D 可开站点名称，
  两种模式均显示路线方向和设施。双向路段不画箭头。
- Drag to pan in 2D or orbit in 3D; scroll to zoom; **Fit** resets zoom and 2D pan.
  Each floor is viewed separately at local z=0; stored elevation is shown in the
  selector and inspector. / 2D 拖拽平移，3D 拖拽旋转，滚轮缩放，“全景”复位；
  单层视图中本层置于 z=0，但数据仍保留楼层真实标高值。
- Inspect named waypoints, facility names and external model references in the
  side panel. Export normalized JSON/original YAML and inspect source hashes.
  Source PNGs can be opened separately; they are not collision models or an
  automatically registered textured background. / 侧栏查看站点、设施、模型引用，
  下载 JSON/YAML 并核对来源。原始图片单独查看，不作为碰撞模型或已配准贴图。
- Chinese/English, desktop/mobile. A failed map fetch preserves the last valid
  map; a late response cannot override a newer selection. / 支持中英文及移动端；
  读取失败保留旧地图，旧请求不能覆盖新选择。

## Geometry fidelity / 几何边界

The source `building.yaml` supplies metric calibration, graph indices,
directionality, named vertices, floor polygons, wall segments, doors, lift cabin
dimensions and external model placements. Typed parameters and source YAML are
retained. Walls use upstream's default **2.5 m height / 0.1 m thickness**, not
manufacturer calibration. Doors are colored segments, not moving panels; lifts
are cabin outlines, not simulated platforms. / 保留原始地图语义，但墙高/厚度为上游
默认示意值，门是线段、电梯是轮廓，没有动作仿真。

Furniture and other Gazebo/Fuel assets are **not included**. Optional dots show
their positions, not dimensions, appearance or collision envelopes. Campus
supplies no wall/floor polygons in its YAML; its buildings live in an external
environment mesh. Thus Campus currently displays its navigation topology, not
the complete architectural scene. The display must not be used to assess vehicle
clearance. / 家具等外部网格未导入；模型点只有位置，不能当作尺寸或碰撞包络。
Campus 建筑在外部网格中，因此当前仅显示导航拓扑；不能据此判断车辆通行净距。

## Coordinates and reproducibility / 坐标与复现

- `reference_image`: mean measured metres/pixel; negate image y; align other
  floors to the reference via the upstream all-pair fiducial bearing/scale rule.
  Airport's missing coordinate-system field uses the upstream reference-image
  default. Missing metric calibration is rejected rather than using pixels.
- Campus: WGS84 longitude/latitude → EPSG:3414 easting/northing → subtract
  `(22000,31500)` metres, matching upstream generated-world offsets. Never treat
  degrees as metres or apply the projection twice. Serialized projected coordinates
  are rounded to a 1 micrometre grid to remove platform-dependent floating-point
  last bits; this is storage precision, **not map accuracy**.
- Hotel floor alignment is approximate because source fiducials are measured.
  Preserve this uncertainty; no claim of survey accuracy or a calibrated twin.

图片坐标依据测量尺换算并反转 y 轴，多层通过基准点对齐；Campus 严格使用指定投影
及平移，投影结果以 1 微米为存储粒度消除跨平台浮点末位差异，这不是地图精度声明。
楼层对齐保留原始测量误差，不声称测绘精度或数字孪生标定。

Source revision: `open-rmf/rmf_demos@7851a5792d19a037833292a3e2a823b0f9e0c111`.
Transform reference: `rmf_traffic_editor@06e91e59830804848bf127ba1d8882bc968084d0`.
Apache-2.0 notices and original licenses are preserved; see
[third-party notices](../THIRD_PARTY_NOTICES.md).

Browser assets are checked in; ordinary `npm ci && npm run build` needs no Python.
To regenerate (from the repository root): / 普通浏览无需 Python；重新生成时：

```sh
python3 -m venv .venv-map-build
.venv-map-build/bin/pip install -r engines/maps/requirements-rmf.txt
.venv-map-build/bin/python engines/maps/import_rmf.py
.venv-map-build/bin/python -m unittest discover -s engines/maps -p test_import_rmf.py -v
npm test
```

The importer validates all five inputs before writing JSON. It is a pinned demo
asset builder, **not an arbitrary YAML upload endpoint**. Repeated builds in the
tested environment produce identical JSON bytes. Node tests verify raw source
hashes and structural counts; Python tests check scale, axes, rotation/translation,
SVY21 natural origin, invalid input and generation consistency.

Schema `1`: `id`, localized `name`, `source`, `units`, `coordinateTransform`,
`levels`, `lifts`, `capabilities`, `warnings`. Each level has source-indexed
vertices, lanes with `graph`/`bidirectional`, wall/door edges, floor/hole polygons,
model anchors, transform and bounds. Its schema is distinct from run schema `2`;
`capabilities.simulation` and `liveControl` are always false.

这些能力标记描述静态地图本身，不否认后续园区适配器可读取部分墙体做平面仿真。
Static-asset flags do not prevent the separate park adapter using a subset of walls
for planar checks; neither means complete physics or live control.

### 中文复现与契约补充

reference_image 采用测量线平均米/像素，反转图像 y，按上游全基准点对的方位/比例
规则对齐其他楼层；Airport 缺少坐标系字段时用上游图片默认值，缺失米制标定则拒绝。
Campus 从 WGS84 经纬度投影 EPSG:3414，再减 (22000,31500) 米；不将角度当米，
不重复投影。上述来源及数学参考固定修订，保留 Apache-2.0 原文。

转换器先校验五张输入再写 JSON，是固定演示资源构建器，不是任意 YAML 上传端点。
已测环境重复生成字节一致；Node 核对原文件哈希和结构计数，Python 测比例、轴、
旋转平移、SVY21 自然原点、非法输入和一致生成。上面的命令从仓库根目录运行。

静态 schema 1 含 id、双语名称、来源、单位、坐标变换、楼层、电梯、能力和警告；
每层有原索引顶点、带 graph/bidirectional 的导航边、墙门边、地板/孔洞、模型位置、
变换和边界。与实验 schema 2 不同。可选 maps-smoke 使用 BASE_URL 及与工作台
相同的 Playwright/Chrome 环境变量；已执行结果和缺口见变更自检。

Optional browser QA: `BASE_URL=http://127.0.0.1:4180 node scripts/maps-smoke.mjs`;
same `PLAYWRIGHT_MODULE` and `CHROME_PATH` overrides as workbench QA. See the
[change review](changes/rmf-map-library/review.md) for executed checks and limitations.
