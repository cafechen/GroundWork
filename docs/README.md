# Documentation / 文档中心

Current runtime: Next.js/MySQL, deployed on robots on 2026-09-29 from `baaa97b`:
[VPN preview](http://10.9.0.20:5180). See [deployment evidence](changes/robots-nextjs-deployment.md),
[documentation alignment](changes/nextjs-docs-alignment.md) and
[implementation review](changes/nextjs-platform/review.md). No Git push in this deployment.
当前为 Next.js/MySQL，2026-09-29 已从 baaa97b 部署到 robots，VPN 地址如上；
部署、文档及实现证据见对应记录，本次部署未推送 Git。

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
| [Self-service robots deployment / robots 自助部署](deploy-robots.md) | Script commands, protected updates and restart / 脚本命令、安全更新与重启 |
| [Admin UI / 后台界面](admin-ui.md) | shadcn-admin layout, themes, mobile and login boundary / 模板布局、主题、手机及登录边界 |
| [Laboratories / 实验室](unified-workbench.md) | Current React/batch guide, then explicitly historical reference / 当前React与批次说明，下附标明历史的详细参考 |

## Develop and verify / 开发与验证

| Guide / 文档 | Purpose / 用途 |
| --- | --- |
| [Architecture / 架构](architecture.md) | Ownership and engine-specific contracts / 模块职责及不同引擎契约 |
| [Database / 数据库设计](database/README.md) | 18 tables, provider migrations / 18 张表及双数据库迁移 |
| [API and data / 接口与数据](api.md) | Endpoints, revisions, schemas and errors / 接口、版本、结构与错误 |
| [Testing / 测试](testing.md) | Reproducible commands and evidence limits / 可复现命令与证据边界 |
| [Roadmap / 路线图](roadmap.md) | Implemented versus planned / 已有与规划 |
| [Contributing / 贡献](../CONTRIBUTING.md) | Change and verification requirements / 修改和验证要求 |
| [Agent instructions / 代理说明](../AGENTS.md) | Working entry point / 工作入口 |
| [Development policy / 开发政策](development-policy.md) | Project-specific AI-native SDLC rules / 项目 SDLC 约定 |
| [Next.js implementation review / 当前实现自检](changes/nextjs-platform/review.md) | Current implementation evidence and remaining limits / 当前实现证据及剩余边界 |
| [Historical park SDLC audit / 历史园区自检](audits/2026-09-28-park-sdlc.md) | Pre-Next.js findings; not current UI status / Next.js迁移前发现，不代表当前UI状态 |
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
| Next.js refactor / Next.js 重构 | [Intent / 意图](changes/nextjs-platform/intent.md) · [Spec / 规格](changes/nextjs-platform/spec.md) · [Plan / 计划](changes/nextjs-platform/plan.md) · [Review / 自检](changes/nextjs-platform/review.md) |
| Next.js documentation alignment / 文档对齐 | [Record / 记录](changes/nextjs-docs-alignment.md) |
| robots Next.js deployment / 新架构部署 | [Record / 记录](changes/robots-nextjs-deployment.md) |
| robots deployment script / 部署脚本 | [Intent / 意图](changes/robots-deploy-script/intent.md) · [Spec / 规格](changes/robots-deploy-script/spec.md) · [Plan / 计划](changes/robots-deploy-script/plan.md) · [Review / 自检](changes/robots-deploy-script/review.md) |
| shadcn-admin redesign / 后台重设计 | [Intent / 意图](changes/shadcn-admin-ui/intent.md) · [Spec / 规格](changes/shadcn-admin-ui/spec.md) · [Plan / 计划](changes/shadcn-admin-ui/plan.md) · [Auth proposal / 登录待审方案](changes/shadcn-admin-ui/authentication.md) · [Review / 自检](changes/shadcn-admin-ui/review.md) |

Historical records that say “not committed” describe the moment they were written.
The pre-Next.js park implementation and its records were subsequently committed as `a634805`;
this does not establish separate pre-implementation approval commits or a release
built from that later commit. / 历史“未提交”指撰写当时；迁移前园区实现与记录后续进入 `a634805`，
不能据此倒推成分阶段事前审批，也不能称旧部署由这个后来的提交构建。
