# RMF map library — intent / 意图

Status: maintainer-accepted on 2026-09-28, before implementation.
确认来源：本轮用户明确回复“按‘五张先行、第六张待补，先完成地图层’实施”。

Request: on 2026-09-28 the maintainer requested Hotel, Office, Airport Terminal,
Clinic, Campus and Manufacturing & Logistics from `open-rmf/rmf_demos` as the
first GroundWork maps. This authorizes source investigation, not substitution of
a different industrial scene or a claim of full RMF simulation compatibility.

请求：导入上述六个场景作为首批地图。不得用其他工业场景冒充第六张地图，
也不得把静态地图导入宣称为完整 RMF 仿真接入。

Modules: A owns map selection/import; B displays geometry; C preserves door/lift
metadata without live control; D records map provenance. No changes to existing
vehicle physics, result semantics, customer data or real hardware are proposed.
Keep one standalone repository with no ROS service dependency for map browsing.

Source preflight: `open-rmf/rmf_demos` revision
`7851a5792d19a037833292a3e2a823b0f9e0c111` contains source YAML and images for the
first five requested worlds, about 5 MB combined directory size. Its map package
declares Apache-2.0. Manufacturing & Logistics has only a README video reference;
no corresponding map source occurs in the inspected revision's tree.

[Upstream clarification](https://github.com/open-rmf/rmf_demos/issues/314#issuecomment-3043337631)
attributes that separate demo to ROS-Industrial APAC, not direct Open-RMF project
maintenance. The public `ros-industrial/rmf_industrial` README links a newer
packaged Unreal demo; equivalence to the requested scene and reusable source
licensing have not been established. Do not silently substitute it.

Accepted decision: import the five available maps first, retain the sixth as
explicitly unavailable pending a licensed source, and limit this change to map
geometry/topology inspection rather than new vehicle/door/lift simulation.

已确认：先导入五张有源码的地图，第六张明确标记待取得源码；本批提供地图几何和
拓扑查看，不承诺车辆已能在这些地图上仿真。后者需要另行确认车辆尺寸、路线及设施行为。

## 中文范围与来源补充

本批 A 负责地图选择/导入，B 显示几何，C 保留门/电梯元数据但不控制，D 记录来源。
不改车辆物理、输出语义、客户数据或硬件；独立仓库，浏览不依赖 ROS。

固定上文 rmf_demos 修订：前五张 YAML/图片合计目录约 5MB，地图包声明 Apache-2.0。
第六张只在 README 视频中出现，所查树无对应源码。上游 issue314 说明其来自
ROS-Industrial APAC 而非 Open-RMF 直接维护；rmf_industrial 的 README 指向新 Unreal
打包演示，但与指定场景是否相同及源码许可未确认，不能替代。以上是当时调查记录，
当前第六张仍标待补。
