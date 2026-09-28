# Documentation / 文档中心

Current application baseline: `a634805` (2026-09-28). Documentation updates may be
uncommitted; see the [current audit](audits/2026-09-28-park-sdlc.md).
当前应用基线：`a634805`（2026-09-28）；文档可能含尚未提交的补充，见[本轮自检](audits/2026-09-28-park-sdlc.md)。

Documents use either paired English/Chinese files or bilingual sections in one
file. Historical change records describe their original stage, not today's feature
set. Original upstream licenses, identifiers, schemas and commands remain unchanged.
文档采用中英配对文件或同文件双语章节。历史变更记录只描述当时阶段，不代表今天的
功能；上游许可证原文、标识符、契约字段和命令不翻译改写。

## Use the platform / 使用平台

| Guide / 文档 | Purpose / 用途 |
| --- | --- |
| [English README](../README.md) / [中文 README](../README.zh-CN.md) | Install, navigation, boundaries / 安装、菜单、能力边界 |
| [First runnable example / 首个可运行示例](quickstart.md) | A complete, prechecked tugger run / 已预检的牵引车完整实验 |
| [Park manual / 园区手册](park-platform.md) | Resources, scenes, devices, operations and metrics / 资源、场景、设备、作业和指标 |
| [Troubleshooting / 故障排查](troubleshooting.md) | Route saving, initial pose, contact and replay / 路线保存、初始位姿、接触与回放 |
| [Maps / 地图库](map-library.md) | Five RMF maps, coordinates, missing geometry / 五张 RMF 地图、坐标与几何缺口 |
| [Deployment / 部署与恢复](deployment.md) | Local/LAN setup, data and release boundaries / 本地与局域网、数据和发布边界 |
| [Legacy workbench / 旧版实验室](unified-workbench.md) | Yard, road and independent Chrono / 园区、道路与独立 Chrono |

## Develop and verify / 开发与验证

| Guide / 文档 | Purpose / 用途 |
| --- | --- |
| [Architecture / 架构](architecture.md) | Ownership and engine-specific contracts / 模块职责及不同引擎契约 |
| [API and data / 接口与数据](api.md) | Endpoints, revisions, schemas and errors / 接口、版本、结构与错误 |
| [Testing / 测试](testing.md) | Reproducible commands and evidence limits / 可复现命令与证据边界 |
| [Roadmap / 路线图](roadmap.md) | Implemented versus planned / 已有与规划 |
| [Contributing / 贡献](../CONTRIBUTING.md) | Change and verification requirements / 修改和验证要求 |
| [Agent instructions / 代理说明](../AGENTS.md) | Working entry point / 工作入口 |
| [Development policy / 开发政策](development-policy.md) | Project-specific AI-native SDLC rules / 项目 SDLC 约定 |
| [Current SDLC audit / 当前 SDLC 自检](audits/2026-09-28-park-sdlc.md) | Evidence, gaps and next actions / 证据、缺口和后续行动 |
| [Initial SDLC audit / 初始自检](audits/2026-09-28-ai-native-sdlc.md) | Historical adoption snapshot / 采用原则时的历史快照 |
| [Source provenance / 源码来源](source-provenance.md) | Copied-code origins and redistribution caveats / 平移来源和再分发限制 |
| [Third-party notices / 第三方说明](../THIRD_PARTY_NOTICES.md) | Dependency and asset notices / 依赖及资源声明 |

## Change history / 变更历史

| Change / 变更 | Records / 记录 |
| --- | --- |
| Unified workbench / 统一工作台 | [Intent / 意图](changes/unified-workbench/intent.md) · [Spec / 规格](changes/unified-workbench/spec.md) · [Plan / 计划](changes/unified-workbench/plan.md) · [Review / 自检](changes/unified-workbench/review.md) |
| RMF maps / RMF 地图 | [Intent / 意图](changes/rmf-map-library/intent.md) · [Spec / 规格](changes/rmf-map-library/spec.md) · [Plan / 计划](changes/rmf-map-library/plan.md) · [Review / 自检](changes/rmf-map-library/review.md) |
| Park platform / 园区平台 | [Intent / 意图](changes/product-platform/intent.md) · [Spec / 规格](changes/product-platform/spec.md) · [Plan / 计划](changes/product-platform/plan.md) · [Review / 自检](changes/product-platform/review.md) |
| Runnable example / 可运行示例 | [Record / 记录](changes/ready-yard-demo.md) |
| Documentation and audit / 文档与审计 | [Record / 记录](changes/bilingual-docs-and-sdlc.md) |

Historical records that say “not committed” describe the moment they were written.
Their implementation and records were subsequently committed together as `a634805`;
this does not establish separate pre-implementation approval commits or a release
built from that later commit. / 历史“未提交”指撰写当时；后续统一进入 `a634805`，
不能据此倒推成分阶段事前审批，也不能称旧部署由这个后来的提交构建。
