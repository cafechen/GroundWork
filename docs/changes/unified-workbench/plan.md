# Implementation plan

Request acceptance: the maintainer authorized implementation and robots deployment in the current conversation after reviewing the integration proposal. This plan documents the implementation choices, not a fabricated earlier approval.

1. Snapshot source revision/provenance; move the reusable TypeScript packages and Chrono source into GroundWork; preserve source tests/notices. No source repository edits.
2. Add failing contract tests for normalized run records, planning endpoints, durable storage, unsafe input, backend isolation and result comparison before implementing them.
3. Implement standalone API and optional model provider, native map/scene handling, road engine adapter and an isolated offline Chrono runner. Persist raw and normalized outputs under GroundWork-owned data paths.
4. Connect A/B/C/D to these capabilities, add 3D/2D run inspection without requiring Gazebo or the Robots website, preserve the current fast demo.
5. Run local core/migrated/integration checks and browser QA. Where external dependencies are unavailable, report them explicitly and test on robots with the independent installation.
6. Deploy a timestamped release on port 5180. Verify health, fresh Chrono jobs, persistence, replay and old service liveness. Preserve previous GroundWork release when present; rollback changes only its own process/release pointer.

Risks: vehicle topology differs between engines; AI credentials are not implied permission to spend; copied data may not be redistributable; original RMF and Chrono are separate control stacks; dynamic trailer identities must not be connected across attach/detach; CPU jobs must be bounded and cancellable. Review records must distinguish migrated source, wired functionality, executed checks and remaining integration work.

## Outcome

Implemented and deployed the independent integrated slice. See [review.md](review.md)
for executed tests, reproduced/fixed defects and retained boundaries. RMF is a
map export, not an activated dispatcher; the optional model gateway is unconfigured;
map conversion and full template/search capabilities are CLI/SDK features, not
all dedicated GUI screens. No original product service or private map is required.

## 中文对应计划与结果

维护者在查看集成建议后明确要求实施及 robots 部署；本文记录实施选择，不伪造此前审批。

1. 记录来源版本，平移可复用 TS 和 Chrono，保留测试/声明，不修改源仓库。
2. 为标准化输出、方案端点、存储、不安全输入、后端隔离及对比先补失败契约测试。
3. 独立 API、可选模型服务、地图场景、道路适配与离线 Chrono，原始和标准化证据存本项目。
4. 连接旧 A/B/C/D 和 2D/3D，不要求 Gazebo 或 Robots 网站，保留快速实验台。
5. 本地核心/平移/集成/浏览器验收；缺依赖明确说明，必要时用 robots 独立环境验证。
6. 5180 新时间戳发布，验健康、新 Chrono、持久化、回放及原服务，保留旧版，恢复只动自身。

风险：引擎拓扑不同；有密钥不等于获准消费；复制数据可能无再分发权；RMF 和 Chrono
不同控制栈；动态挂车接挂前后身份不能连错；CPU 任务必须受限可取消。自检区分复制、
接通、执行和剩余工作。

结果：已实施独立切片并预览部署，实际证据见 review。RMF 仅地图导出，模型网关未
配置，转换及完整模板/搜索是 CLI/SDK 而非全量 GUI；不需要原产品服务或私有地图。
