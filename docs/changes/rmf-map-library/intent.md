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
