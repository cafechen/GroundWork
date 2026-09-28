# First runnable example / 首个可运行示例

[Documentation / 文档中心](README.md) · [Troubleshooting / 排障](troubleshooting.md)

## Next.js setup / 新架构准备

First complete the database migration, explicit seed, build, web AND worker steps
in the root README. Then run the read-only preflight or explicit `--apply` command
below. The new URL is `/parks/<id>/control`, not the old hash route.
先按根 README 完成数据库迁移、显式初始化、构建并启动 Web 与 worker，
再执行下方预检或 --apply。新 URL 为上述页面路径，不再使用 hash。

The robots URL below is historical and was not redeployed or reverified in this
refactor. / 下方 robots 链接是历史记录，本轮未重新部署或验证在线状态。

## Existing robots preview / 已有 robots 预览

Open the [demo's Operations page](http://10.1.153.185:5180/#parks/33fdfc9f-366f-405c-bb40-38334e24f90a/operations)
on the trusted LAN. Park: **可运行示例 · 牵引车物流园**. Click **Run simulation**;
the control panel polls the job and starts replay when ready. This creates a new
simulation run, not a real vehicle command. No route/device setup is needed.

在可信局域网打开上面的作业链接，进入“可运行示例 · 牵引车物流园”，点击**开始仿真**。
控制面板等待计算完成后自动播放；这是新建仿真实验，不向实车发送命令，无需再画路线
或创建设备。不要把它与原来的“亚朵场景”混淆，原场景没有被覆盖。

To inspect the existing run without another job, enter **Control panel**, choose
**Replay** beside the completed record, then **▶** below the map. Scroll down if
playback controls are below the viewport. Seek the timeline or switch 2D/3D.
只看已有结果：进入“控制面板”，点击完成记录旁的“回放”，再点地图下方 **▶**；
按钮若在屏幕外请向下滚动。可拖动时间轴、切换 2D/3D。

## Reproduce on a fresh checkout / 新环境复现

Requires Node >=22.19 and dependencies/build from the root README. Terminal 1:
需要 Node >=22.19，按根 README 安装和构建；终端一启动：

```sh
npm ci
npm run build
npm start
```

Terminal 2, in the same repository / 终端二，在同一仓库目录：

```sh
# Read-only synthetic preflight; no server/database writes.
# 只做合成数据预检，不写服务器或数据库。
node scripts/ready-yard-demo.mjs

# Explicitly create demo map/model/park and execute one job on YOUR local server.
# 明确向自己的本地服务器新增示例地图、模型、园区并运行一次。
BASE_URL=http://127.0.0.1:4173 node scripts/ready-yard-demo.mjs --apply
```

Use the park URL printed by the script; fresh installations generate different
IDs. `BASE_URL` must be the origin without a trailing slash/path. The script
requires an active local simulation gateway with `state` and `events` channels
(created by the explicit seed command). Use a remote URL only with permission to write there.

使用脚本输出的园区链接，新环境 ID 不同。`BASE_URL` 只填协议、主机、端口，不带
结尾斜杠或路径。脚本要求可用的本地仿真网关含 `state`、`events` 通道，通常启动时
自动初始化。只有获准写入远端时，才把地址换成远端服务器。

An active same-name demo causes a refusal, not overwrite. If creation fails halfway,
use logged IDs to inspect partial resources; this is not one cross-resource
transaction. Preserve existing data, do not delete the database to retry. An existing
demo can simply be rerun from Operations. `--apply` is not a dry run.

同名活动园区已存在会拒绝，不覆盖。中途失败时按日志 ID 检查已创建资源；跨资源
创建不是单次事务。不要为了重试删除数据库。已有示例在作业管理直接重跑即可，
`--apply` 不是试运行模式。

## What should happen / 应看到什么

| Item / 项目 | Expected evidence / 预期证据 |
| --- | --- |
| Scene / 场景 | Synthetic 40 × 32 m yard, central warehouse / 40 × 32 米合成物流园，中央仓库 |
| Vehicle / 车辆 | Generic tugger + one on-axle trailer / 通用牵引车和单节轴上铰接挂车 |
| Motion / 运动 | Start (8,6,0), two rounded turns, finish near (10,24) / 起点 (8,6,0)，两段圆角，终点约 (10,24) |
| Speed / 速度 | Maximum 1.2 m/s, 0.6 m/s slow zone / 最大 1.2 m/s，限速区 0.6 m/s |
| Horizon / 时长 | 65 s; task completes near 51.1 s / 仿真 65 秒，约 51.1 秒完成任务 |
| Result / 结果 | `COMPLETED`, about 54.5300 m, 0 sampled contact episodes, max path error about 0.02950 m / 完成，行驶约 54.5300 米，采样接触 0，最大路径偏差约 0.02950 米 |

Values were measured on the current engine, not display placeholders. Small
cross-runtime floating-point differences are possible. Preflight asserts completion,
nonzero motion/turns, speed-zone effects, all three sampled body envelopes within
yard bounds, zero sampled contacts and repeat determinism.

这些是当前引擎实际计算值，不是界面写死数字；跨运行时可能有微小浮点差异。预检
验证完成、位移和转弯、限速生效、三类车体采样轮廓在园区内、无采样接触和重复确定性。

This is an authored route, not automatic planning. Stations are semantic labels;
no loading mechanics, perception, video, lidar or hardware is simulated. Zero
sampled contacts does not prove continuous clearance or real-world safety. A good
fixture does not fix the editor's known first-use problems.

路线是人工编制而非自动规划；站点只是语义标记，不模拟装卸力学、感知、视频、雷达
或实机。零采样接触不证明连续间隙或现实安全；成功示例不等于编辑器的首次使用问题已修复。

Sources: [fixture](../examples/ready-yard.mjs), [preflight/seeder](../scripts/ready-yard-demo.mjs),
[original evidence / 原始证据](changes/ready-yard-demo.md).
