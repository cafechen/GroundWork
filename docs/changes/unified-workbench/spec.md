# Specification

GroundWork becomes a single Node workspace with local TypeScript contracts/scenario-engine packages, a file-backed application API, browser workbench and Python Chrono worker. Source is copied, not linked to sibling repositories. Historical demo remains available as the fast kinematic backend.

- A: synthetic yard/road templates, explicit local-metre maps, source-aware GeoJSON import, structured plans and optional configured model generation. Unsupported plan actions are rejected.
- B: migrated Chrono torque-driven tractor and dynamic 0–3 trailer model, with original calibration limitations. Separate model identity from the existing bicycle preview. Runs preserve full-body poses.
- C: migrated service phases, trailer attachment/detachment and following; existing crossing mutex/door fault demo remains. RMF conversion/adapter code is independent and optional; activation may not connect to existing vehicle namespaces or control services.
- D: durable scene/run records, asynchronous jobs, cancellation, versioned frames/events/metrics, browser replay, JSON/report downloads and baseline comparison. Scenario validity and test verdict are separate. Ground contacts are not accident counts.

Data includes coordinate frame, engine/model version, configuration, source provenance and result quality. Chrono output uses simulator time; plots and playback never infer physical correctness from rendering. Imported logs do not gain PASS simply because parsing succeeded.

Deployment: dedicated `/home/steven/src/groundwork` area, LAN port 5180, own data and environment paths, no mutation of existing 5173–5176 services. No system-wide installation or automatic startup. HTTP writes require same-origin requests and bounded validated payloads; shell command inputs are never accepted from clients. This is a trusted-LAN demo, not a public service.

## 中文对应规格

单个 Node workspace，内置 TS 契约/场景引擎、文件持久化 API、浏览器工作台和 Python
Chrono worker。复制源码而非链接同级仓库；保留历史快速运动学实验台。

- A：合成园区/道路模板、明确米制地图、带来源 GeoJSON、结构化方案及可选已配置模型
  生成；不支持的动作拒绝。
- B：平移力矩驱动牵引车和动态 0–3 挂车，保留未标定边界；与原单轨预览区分模型，
  保存全部车体位姿。
- C：平移分站作业、接挂脱挂、跟车；保留路口互斥/门故障。RMF 转换适配独立可选，
  不能擅自接入已有车队命名空间或控制服务。
- D：持久场景/实验、异步队列、取消、版本化帧/事件/指标、回放、JSON/报告和基线
  对比；场景有效性与测试结论分开，地面接触不是事故。

记录坐标系、引擎/模型版本、配置、来源和结果质量；Chrono 使用仿真时钟，不因画面
正确就断言物理正确，日志解析成功不能自动 PASS。

部署基目录和端口如上，独立数据/环境，不改 5173–5176，不安装系统服务或自启。
HTTP 写入同源且体积/结构受限，不允许客户端 shell 命令；仅可信局域网而非公网。
