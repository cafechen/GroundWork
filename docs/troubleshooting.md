# Troubleshooting / 故障排查

[Documentation / 文档中心](README.md) · [Ready example / 可运行示例](quickstart.md)

These are current workarounds, not claims that the UX defects have been fixed.
The checks below apply to park planar simulation, not the separate Chrono lab.
以下是当前绕行方法，不表示交互缺陷已经修复；适用于园区平面仿真，不适用于独立 Chrono。

## Device exists but no task can be created / 有设备仍无法创建任务

The generic toast combines multiple prerequisites. Confirm the device belongs to
this park and a **finished, saved route** exists on its map and floor. Registering
a model is not creating an instance; an instance alone is not a task. Real devices
cannot run in simulation. The UI does not yet explain each missing prerequisite.

提示把多个条件混在一起：检查设备属于当前园区，且同一地图、楼层已有**完成并保存
的路线**。设备模型不等于实例，有实例不等于已有任务；真实设备不能用于仿真。
目前界面没有逐项展示缺失条件，这是产品反馈不足。

## How to select positions / 如何点选位置

1. Scene editor → select map/floor → **2D**. 3D is for viewing, not picking.
   / 场景编辑选择地图楼层，切到 **2D**；3D 目前只查看，不点选放置。
2. Change **Browse / Pan** to **Add Route** (or the desired object type).
   / 把“浏览 / 平移”切为“添加 路线”或其他目标类型。
3. Click two distinct free-space points, then **Finish route**. Save the route
   dialog, inspect the object, then **Save scene**.
   / 在空地点击至少两个不同位置，点“完成路线”，保存路线弹窗，再“保存场景”。
4. Reopen the scene and verify the named route is retained; only then create a task.
   / 重新进入确认命名路线仍在，再创建任务。

“At least two route points” means the **current draft** has fewer than two picks;
visible imported green navigation edges do not count as your task route. A blue
“Unfinished route” line is still a draft. **Save scene does not finish that draft**;
the “Saved” badge can therefore be misleading. The route is not an obstacle-avoiding
planner: choose free space wide enough for the whole trailer train.

“至少点击两个路线点”指**当前草稿**的点不足；地图原有绿色导航线不等于任务路线。
蓝色“未完成路线”仍是草稿，**保存场景不会自动完成路线**，所以“已保存”标签可能误导。
路线没有自动避障，必须留出整列车的转弯空间。

## Initial position must be within 2 m / 初始位置须在起点 2 米内

`Device must spawn within 2 m of route start` compares the instance's axle-reference
position to the route's **first** point. In Devices → Edit, set `pose=[x,y,yaw]`
using metres/metres/radians. Position is numeric input, not map-click placement
in the current instance editor. Use the route's first coordinates; orient along
the first segment with `yaw=atan2(y1-y0,x1-x0)` where appropriate.

这条错误比较实例的车轴参考位置与路线**第一个点**。在“设备实例 → 编辑”填写
`pose=[x,y,yaw]`，单位米、米、弧度；实例编辑目前不是地图点选放置。位置可取路线首点，
方向可按第一段 `atan2(y1-y0,x1-x0)` 设置。

Matching coordinates alone is insufficient: check tractor, trailer and drawbar
envelopes and turn clearance. Do not move a tugger into a tiny indoor room just
to pass the distance check. Use the ready yard if you only want a moving example.
仅对齐坐标不够：还要检查牵引车、挂车、牵引杆和转弯余量。不能为了过距离检查
就把整列车放进狭小房间；只想先看效果请使用现成物流园示例。

## Completed but stationary / 显示 completed 却不动

`completed` is the worker/job status, not the model's successful task verdict.
Inspect verdict and metrics. `CONTACT` + `distanceM: 0` is consistent with contact
at the initial pose; inspect event time and body/wall IDs. The engine stops on
sampled wall/restricted-zone contact. A collision is not a playback bug merely
because the timeline advances. No obstacle avoidance is implemented.

小写 `completed` 只是计算进程完成，不代表任务成功。检查判定和指标：`CONTACT`
加 `distanceM: 0` 与初始位置发生接触一致；查看事件时刻及车体/墙 ID。引擎遇墙体
或禁行区采样接触就停止，没有自动避障。时间轴在走、车不走，不一定是回放故障。

If verdict is `COMPLETED` and distance is nonzero, select **Replay**, then **▶**;
seek to the middle of the run, not its final stationary tail. Refresh status only
refreshes job metadata. Loading an old result does not rerun the current scene.

若判定为 `COMPLETED` 且距离非零，选择“回放”再点 **▶**，拖到中间时刻，而非完成后
停住的末尾。“刷新状态”只更新作业信息，打开历史结果不会用当前场景重算。

## Other errors / 其他错误

| Symptom / 现象 | Action / 处理 |
| --- | --- |
| HTTP 409 | Reload latest resource/park and reapply edits; do not force overwrite / 重载最新资源或园区，再合并修改，不强制覆盖 |
| HTTP 403 | Check allowed Host and exact same-origin POST header; not a login issue / 检查 Host 白名单与 POST Origin 是否同源，不是登录问题 |
| Raw JSON validation toast / 原始 JSON 报错 | Read `message`; preserve input and report the schema error. Friendly field-level mapping is incomplete / 阅读 `message`，保留输入报告；字段级友好提示尚不完整 |
| Chrono unavailable / 不可用 | Separate Python/PyChrono setup is required; park Chrono is unsupported regardless / 需独立 Python/PyChrono 环境，但园区 Chrono 仍不支持 |
| No meshes / 模型缺失 | Imported RMF maps do not include external Gazebo/Fuel meshes / RMF 未包含外部 Gazebo/Fuel 网格 |

For a reproducible issue, save synthetic park/model/map revisions, task/run ID,
engine version, browser/Node versions, steps, expected/actual behavior, events and
screenshots. Remove secrets and customer data. Do not change collision thresholds
or invent success metrics to make a case pass.

报告缺陷请保留合成场景、模型、地图版本、任务/实验 ID、引擎和运行时版本、操作步骤、
预期/实际、事件和截图；删除秘密和客户数据。不能放松碰撞阈值或编造指标换取通过。
