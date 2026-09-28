# RMF map library — implementation plan / 实施计划

Status: maintainer-accepted on 2026-09-28; implemented and verified. See
[review](review.md) for deployment status and the cross-platform serialization fix.

The user explicitly accepted “五张先行、第六张待补，先完成地图层” in the
current conversation before substantive implementation. The earlier preflight
changed no runtime code or deployed service. No commit/push authorization implied.

## Proposed sequence / 建议顺序

1. Obtain acceptance of [intent](intent.md) and [spec](spec.md), including the
   unavailable sixth source and no new simulation behavior in this change.
2. Vendor only required YAML/images and licensing under `assets/maps/rmf/`;
   add a revision/hash manifest and update third-party notices.
3. Add a deterministic converter under `engines/maps/` or `scripts/`, using
   verified upstream transforms. Prefer existing tooling; document any build-only
   YAML/projection dependency. Generated browser JSON needs no ROS runtime.
4. Add bounded map catalog/static delivery to `server/http.mjs`; add a separate
   map-library component in `src/`, linked from `src/workbench.js`. Preserve run
   selection guards and keep map provenance separate from simulation verdicts.
5. Add conversion/schema/security tests and browser coverage. Synchronize both
   READMEs, architecture and a map-library manual with actual supported behavior.
6. Record self-review evidence, then update only the previously authorized
   GroundWork preview on robots:5180 after checking for active jobs. Preserve the
   previous release and all run data; smoke-test before handoff. No commit/push.

## Verification and recovery / 验证与恢复

Planned commands: `npm run build`, `npm test`, `npm run test:engines`,
`npm run check`, existing map-converter tests, new RMF conversion tests,
`scripts/workbench-smoke.mjs`, `scripts/browser-smoke.mjs` and a map browser test.
These are planned checks, not passing results for this change.

The originally planned checks above were subsequently executed; their actual
results (including an initial cross-platform failure and correction) are recorded
in the review. No simulation engines or vehicle models were changed.

Risks: misleading map/run coupling; pixel/WGS84 scale errors; floor misalignment;
omitted lane direction; external assets with unresolved licensing; stale loads;
renderer performance on Airport. Test these explicitly and document unsupported
features. Do not introduce full Gazebo/ROS dispatch to solve a browsing feature.

Recovery: add maps independently of run storage and vehicle contracts; keep
existing synthetic defaults and `/classic`. For deployment, switch only the
GroundWork release pointer back to its prior verified release, retaining data.
Never reset the dirty worktree or touch other services.

## 中文对应计划

维护者于 2026-09-28 在实质实现前确认“五张先行、第六张待补，先完成地图层”；
更早的预检没改代码或部署，不隐含提交/推送许可。现已实施验证，部署和跨平台修复
见 review。

顺序：确认范围与第六张缺源；仅把所需 YAML/图片/许可放 assets/maps/rmf，加版本/
哈希清单和声明；按验证过的上游变换实现确定性转换，说明构建期 YAML/投影依赖，
生成 JSON 无 ROS 运行依赖；HTTP 有界静态服务、独立 src 地图库及 workbench 入口，
保留实验选择保护和分离来源/判定；补转换、schema、安全和浏览器测试，同步 README/
架构/手册；记录自检后，检查活跃作业，只更新已获准5180，保留旧版和全部实验再验收。

计划运行构建、Node/TS/语法、原转换及新 RMF Python、workbench/classic/maps 浏览器。
最初这些是计划，后续实际通过及初始跨平台失败修正均记 review；没有改变引擎或车辆。

风险重点：地图与仿真误连、像素/经纬度尺度、跨层错位、方向丢失、外部资源许可、
过期响应、机场渲染性能；明确测试，不为浏览功能引入全 Gazebo/ROS。恢复保持独立
地图与原默认/classic，必要时只切自身兼容 release、保留数据；不重置脏工作区或动其他服务。
