# Troubleshooting / 故障排查

[Documentation / 文档中心](README.md) · [Ready example / 可运行示例](quickstart.md)

This guide describes the current Next.js/React UI, not the old hash-route UI.
Checks apply to park planar simulation, not the separate Chrono lab. Better
editing guidance does not establish obstacle avoidance or real-world safety.
本文对应当前 Next.js/React 界面，不是旧 hash 界面；适用于园区平面仿真，不适用于
独立 Chrono。编辑引导改进不等于实现自动避障或证明实车安全。

## Device exists but no task can be created / 有设备仍无法创建任务

The task button is disabled when there are no devices or routes; separate notices
identify those two missing prerequisites. Confirm the device belongs to
this park and a **finished, saved route** exists on its map and floor. Registering
a model is not creating an instance; an instance alone is not a task. Real devices
cannot run in simulation. The task editor lists virtual devices and routes on the
selected device's map/floor; an empty route selector means no matching saved route.

无设备或路线时“创建任务”禁用，并分别提示缺少项。检查设备属于当前园区，且同一地图、楼层已有**完成并保存
的路线**。设备模型不等于实例，有实例不等于已有任务；真实设备不能用于仿真。
任务编辑器列出虚拟设备，并按设备地图/楼层筛选路线；路线选项为空说明没有匹配的已保存路线。

## How to select positions / 如何点选位置

1. Scene editor → select map/floor → **2D**. 3D is for viewing, not picking.
   / 场景编辑选择地图楼层，切到 **2D**；3D 目前只查看，不点选放置。
2. Set **Drawing tool** to **route** (or the desired object type).
   / 将“绘图工具”设为 **route** 或其他目标类型；当前工具值仍显示英文标识。
3. Click two distinct free-space points, then **Finish route**. Save the route
   dialog with **Apply to draft**, then **Save scene**.
   / 在空地点击至少两个不同位置，点“完成路线”，在弹窗点“应用到草稿”，再“保存场景”。
4. Reopen the scene and verify the named route is retained; only then create a task.
   / 重新进入确认命名路线仍在，再创建任务。

“At least two route points” means the **current draft** has fewer than two picks;
visible imported green navigation edges do not count as your task route. Orange
dashed points are a draft. **Save scene is disabled while route points remain**;
finish the route or use **Clear draft** first. Finishing creates an in-memory route;
the object dialog changes only the draft, and Save scene persists it. The route is not an obstacle-avoiding
planner: choose free space wide enough for the whole trailer train.

“至少点击两个路线点”指**当前草稿**的点不足；地图原有绿色导航线不等于任务路线。
橙色虚线仍是草稿，**存在路线草稿点时“保存场景”禁用**；先完成路线或清除草稿。
完成路线只建立内存中的对象，弹窗修改也只作用于草稿，最后必须保存场景才持久化。
路线没有自动避障，必须留出整列车的转弯空间。

## Initial position must be within 2 m / 初始位置须在起点 2 米内

`Device must spawn within 2 m of route start` compares the instance's axle-reference
position to the route's **first** point. In Devices → Edit, set `pose=[x,y,yaw]`
using metres/metres/radians, click the initial position in the editor's **2D** map,
or press **Use route start: <name>**. That button copies the first route point and
sets `yaw=atan2(y1-y0,x1-x0)`; clicking the map changes x/y but retains yaw.
Press **Save device** to persist the instance.

这条错误比较实例的车轴参考位置与路线**第一个点**。在“设备实例 → 编辑”填写
`pose=[x,y,yaw]`，单位米、米、弧度；也可在编辑器的 **2D** 地图点选，或点
“使用路线起点：名称”。该按钮复制路线首点并按首段计算航向；地图点选只修改 x/y，
保留现有 yaw。最后点“保存设备”持久化。

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

If verdict is `COMPLETED` and distance is nonzero, open **Control panel** and select
**Replay**; loading the result starts playback. If paused, press **Play**;
seek to the middle of the run, not its final stationary tail;
the execution list polls job metadata automatically. Loading an old result does not rerun the current scene.

若判定为 `COMPLETED` 且距离非零，在控制面板选择“回放”，载入后自动播放；暂停后可点
“播放”。拖到中间时刻，而非完成后停住的末尾。执行列表自动轮询，打开历史结果不会用当前场景重算。

## Other errors / 其他错误

| Symptom / 现象 | Action / 处理 |
| --- | --- |
| HTTP 409 | Reload latest resource/park and reapply edits; do not force overwrite / 重载最新资源或园区，再合并修改，不强制覆盖 |
| HTTP 403 | Check allowed Host and exact same-origin POST header; not a login issue / 检查 Host 白名单与 POST Origin 是否同源，不是登录问题 |
| Validation failure / 校验失败 | API returns readable `error`, `code`, optional `issues`; preserve input and field path. Raw serialized Zod arrays are not the intended current UI / 返回可读错误码与可选字段详情；保留输入及字段路径，原始Zod数组不是当前界面的预期展示 |
| Jobs stay queued / 任务一直排队 | Start the worker with the same database/artifact configuration; inspect its terminal. Restart does not discard queued jobs / 启动相同库和轨迹配置的worker并检查终端；重启不会丢弃排队任务 |
| `interrupted` after restart / 重启后中断 | Expired running leases are marked interrupted; inspect before manually rerunning. They are not resumed automatically / 运行中租约过期标记中断，检查后手工重跑，不自动续跑 |
| Batch rejected / 批次被拒绝 | A batch needs 12 free queued-job slots and room under the 200-run cap; no automatic deletion / 批次需12个空闲排队名额且总量不超过200；不自动清理数据 |
| Chrono unavailable / 不可用 | Separate Python/PyChrono setup is required; park Chrono is unsupported regardless / 需独立 Python/PyChrono 环境，但园区 Chrono 仍不支持 |
| No meshes / 模型缺失 | Imported RMF maps do not include external Gazebo/Fuel meshes / RMF 未包含外部 Gazebo/Fuel 网格 |

For a reproducible issue, save synthetic park/model/map revisions, task/run ID,
engine version, browser/Node versions, steps, expected/actual behavior, events and
screenshots. Remove secrets and customer data. Do not change collision thresholds
or invent success metrics to make a case pass.

报告缺陷请保留合成场景、模型、地图版本、任务/实验 ID、引擎和运行时版本、操作步骤、
预期/实际、事件和截图；删除秘密和客户数据。不能放松碰撞阈值或编造指标换取通过。
