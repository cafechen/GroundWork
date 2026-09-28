# Intent: standalone GroundWork integration

Date: 2026-09-28. Source: maintainer explicitly requested reusing the previously identified capabilities, copying code into one independent GroundWork project, and deploying on `robots` for preview.

Accepted scope: A scene/operations, B vehicle dynamics, C traffic/device interactions, D experiment storage/replay/comparison; source migration from the maintainer's Strategist and Robots repositories. The original repositories and running services must remain unchanged. No dependency on their checkout paths, APIs or databases after deployment. Third-party libraries remain explicit dependencies.

Exclude public redistribution of private maps, real vehicle control, safety claims, production authentication claims, unauthorized model API usage and automatic Git push. Default assets are synthetic. Unconfigured AI/RMF capabilities must be visible, not replaced silently by fabricated success.

Acceptance: standalone build; original fast-demo tests preserved; migrated contracts/engine tests; scene planning and actual generated trajectories; isolated Chrono execution producing downloadable versioned runs; replay and comparison; bilingual UI; robots LAN preview on a free dedicated port with recovery/stop instructions; existing services unchanged.

## 中文对应记录

日期 2026-09-28。请求来自维护者：复用已识别能力，源码平移进独立 GroundWork，
在 robots 部署预览。确认范围为 A 场景作业、B 车辆力学、C 交通设备交互、D 实验存储/
回放/对比，来源为其 Strategist 和 Robots。不得修改原仓库或运行服务，部署后不依赖
原路径、API 或数据库；第三方库仍明确为依赖。

排除私有地图公开再分发、实车控制、安全及生产认证声明、未授权模型 API 消费、
自动 Git 推送。默认合成资源，未配置 AI/RMF 必须可见，不用虚假成功替代。

验收：独立构建，保留原快速案例测试，通过平移契约和引擎测试，方案生成真实轨迹，
独立 Chrono 计算产生可下载版本化结果，回放/对比和中英界面可用；robots 用独立
空闲端口，提供恢复/停止说明，不影响已有服务。
