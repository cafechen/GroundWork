# Roadmap / 路线图

This is a direction, not a delivery promise. / 以下为方向，不是交付承诺。

## Current · Park platform / 当前园区平台

- [x] Five menus, park-owned devices/operations/control/analysis / 五主菜单、园区业务闭环
- [x] SQLite resources, immutable map/model versions and reference guards / 资源持久化与固定版本
- [x] Scene overlays, explicit-route planar simulation, frozen replay and metrics / 场景图层、路线运动学、历史回放和统计
- [ ] Arbitrary-park Chrono model/geometry adapter / 任意园区地图和模型的 Chrono 接入
- [ ] Vendor model assets, sensor rendering, external algorithms / 厂商模型、感知仿真、外部算法
- [ ] Real gateway protocols, observation streams and authorized control / 实机接入、观测流与授权控制

See [current capability matrix](park-platform.md); the legacy and physical-validation
goals below remain distinct. / 以产品手册能力表为准，下列旧版和实测目标不混同。

## v0.1 · Inspectable prototype / 可检查原型

- [x] Local bilingual workbench / 本地中英文工作台
- [x] Four connected modules / 四模块贯通
- [x] Three synthetic demonstrations / 三个合成案例
- [x] Deterministic runs, replay, paired experiments and exports / 确定性实验、回放、配对对比与导出
- [x] Core automated tests and explicit model limitations / 核心自动测试与明确模型边界

## Next · Earn trust in one vehicle topology / 验证一种具体车辆拓扑

v0.2 now integrates copied contracts/behavior SDK, structured-plan road runs,
independent Chrono trains, local map conversion and persistent jobs. See
[the integration manual](unified-workbench.md) and [verification](changes/unified-workbench/review.md).
This does not satisfy the real-hardware calibration items below. / v0.2 已完成
上述代码集成，但不等于完成实车标定；后续条目中的车辆精度目标仍未完成。

- [ ] Pick a real towing configuration: hitch offsets, axle arrangement, trailer count / 明确真实牵引组合的铰接偏置、车轴布置、拖车数量
- [ ] Independent straight/circle/turn analytical test cases and time-step convergence / 独立直线、圆周、转弯解析测试及步长收敛
- [ ] Steering rate and acceleration/braking constraints / 转角速度、加减速与制动约束
- [ ] Payload and fork envelopes; defined docking pose tolerance / 载荷与货叉轮廓、明确的对接位姿容差
- [ ] Importable map/route/vehicle schema and validation errors / 可导入地图、路径、车辆契约与校验错误
- [ ] Configurable pass/fail rules and saved baselines / 可配置验收规则与基线保存

## Later · External reproducibility / 外部复现

- [ ] Headless experiment CLI and parameter sweeps / 无界面批量运行与参数扫描
- [ ] Run bundle import, artifact hash and Git revision provenance / 实验包导入、哈希、Git 版本溯源
- [x] Optional independent Chrono train worker (uncalibrated) / 独立 Chrono 挂车列进程（未实车标定）
- [ ] Optional ROS/MCAP record adapters / 可选 ROS/MCAP 记录适配
- [ ] Multi-resource contention, cancellations and explicit timeouts / 多资源竞争、取消与显式超时
- [ ] Publish reproducible engineering case studies; invite independent replay / 持续发布可复現工程案例，邀请独立复现

## Deliberately out of scope / 刻意不做

Production RCS/WMS, hardware control, perception stacks, safety certification, unverified vendor compatibility and automatic root-cause claims. / 生产 RCS/WMS、硬件控制、感知栈、安全认证、未经验证的厂商兼容、自动根因诊断承诺。
