# GroundWork

**回到物理，回到事实。** Ground 品牌下的工业车辆仿真与证据平台。

[English](README.md) · [文档中心](docs/README.md) · [架构](docs/architecture.md) · [数据库](docs/database/README.md)

## 当前架构

TypeScript、Next.js App Router、React、真实 shadcn/ui（Radix）、Tailwind CSS、TanStack Query 和 Three.js。Next.js 统一承载页面及 API；常驻 TypeScript worker 执行仿真。Prisma **默认 MySQL**。PostgreSQL 已有生成式 schema 和独立 SQL 迁移，但**尚未通过真实 PostgreSQL 集成测试**。切换需要重新生成客户端、执行迁移和显式搬迁数据，不是只改连接串。

应用独立运行，不需要 Strategist/Robots 的运行时导入、服务或凭证。Python Chrono 仍为可选组件。本轮未接入 Gazebo，也未替换物理模型。

## 本地启动

需要 **Node.js 22.19+**、独立 MySQL 8+ 数据库和现代浏览器。参照 [.env.example](.env.example) 配置 `.env.local`，不要使用其他应用的业务库，不提交凭证。Next.js 与 Prisma provider 生成脚本自动读取该文件；直接 Prisma CLI、seed/导入脚本和 worker 要显式加载：

```sh
npm ci
node --env-file=.env.local scripts/prisma-provider.mjs --generate
node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy --schema prisma/mysql/schema.prisma
node --env-file=.env.local --import tsx scripts/seed-next.ts
npm run build
npm start
# 第二个终端：
node --env-file=.env.local --import tsx workers/runner.ts
```

初始化只允许资源空库。开发模式使用 `npm run dev`，同时启动 worker。打开 **http://127.0.0.1:4173**，两个进程分别 Ctrl+C 停止。未运行 worker 时任务保持排队。当前仍为**可信局域网、单用户、无登录预览**，不能暴露公网。见[部署文档](docs/deployment.md)。

现有 robots 预览的同结构更新，可在测试通过、已提交且干净的工作区执行
`node scripts/deploy-robots.mjs deploy --apply`。[自助部署手册](docs/deploy-robots.md)
包含只读计划/状态检查、机器重启后启动、保护措施和限制；不自动迁移数据库或导入数据。

shadcn-admin 新界面版本 **`2bfe8b2`** 已部署至 **http://10.9.0.20:5180**，
原数据保留，浏览器与回放只读验收通过。见[部署验收](docs/changes/robots-deploy-script/review.md)。

## 产品流程

后台界面现按 **shadcn-admin** 模板适配：可折叠侧栏、手机抽屉、明暗主题、真实资源总览及
可筛选列表。见[界面手册与登录边界](docs/admin-ui.md)。视觉适配不改仿真模型；新增登录后端
属于单独审查阶段，不用模板假登录冒充真实认证。

五个主菜单：**总览、地图管理、设备模型、接入网关、园区管理**。园区内包含概览、场景编辑、设备实例、作业管理、控制面板、统计分析、园区配置。

1. 复用或导入地图，定义设备模型，登记网关配置。
2. 创建园区，固定地图及模型版本，绑定网关。
3. 在 2D 选择路线工具，点击至少两个点，完成路线并**保存场景**。
4. 创建虚拟设备，点击初始位置或使用已保存路线起点；整车净空仍需验证。
5. 创建同地图同楼层任务，仿真后在 2D/3D 回放冻结结果并查看指标。

[园区操作手册](docs/park-platform.md) · [已预检园区示例](docs/quickstart.md) · [故障排查](docs/troubleshooting.md)。`completed` 仅表示计算结束，不是安全判定。

内置五张 RMF 地图：酒店、办公室、机场、诊所、校园；制造与物流待补源码。校园只有拓扑，外部网格未包含。React 地图预览支持楼层选择、2D/3D、导航图/图层筛选、设施叠层及 JSON 导出。

虚拟牵引车、叉车、AMR 保留平面运动学、显式路线、墙体/禁行区接触检测和限速区。机器狗仅支持定义。传感器和质量声明不会自动生成感知或动力学。实机及网关仍**仅登记配置**，未接遥测、视频、点云和远程接管。

## 实验室与兼容入口

`/workbench` 提供 React 版园区运动学、道路、可选 Chrono 实验；`/classic` 为园区运动学专用入口。任务统一进入持久化队列，支持回放、取消、基线比较和受约束的 JSON/HTML/XOSC/RMF/SDF 导出。12 次回归按钮原子保存六组配对，支持刷新后恢复历史、汇总指标、取消及 JSON/CSV/HTML 报告。未完成或不兼容配对不计为通过。

地图预览支持导航图筛选，独立开关路线、墙体、门、电梯及模型位置，并可在 2D/3D 中显示站点名称。这些仅为显示设置，不改变碰撞几何；模型标记不是厂商实体网格。

Chrono 仍使用独立合成力学世界，不接任意园区地图。`GROUNDWORK_CHRONO_PYTHON` 需指向已验证的 PyChrono 解释器。不同引擎并非同一已标定车辆的可互换后端；地面接触不是事故数。本次重构不声称完成新的 Chrono 真实运行验证。

旧 JavaScript UI 和服务器保留为显式兼容入口及回归基线：`npm run legacy:start`。Next.js **没有代理旧服务器**。历史 A/B/C/D 截图及手册对应旧服务器，不代表 React 页面逐像素一致。

## 数据与验证

18 张关系表管理资源和园区设备、对象、任务；不可变版本、实验输入、租约、文件校验和及审计保留证据。轨迹默认位于 `data/next-runs`。JSON 列使用版本化文本封装，避免 Prisma JSON 通道舍入几何浮点数，由仓储层解码。见[表字典与迁移](docs/database/README.md)。

SQLite 和实验文件导入器默认 dry-run，必须显式指定源路径；备份后仅向独立空目标应用，不修改源文件。2026-09-29 已从 baaa97b 部署 robots 可信 VPN 预览，并将旧资源/历史导入独立 MySQL 库。见[部署证据](docs/changes/robots-nextjs-deployment.md)。这不是生产发布，未配置开机自启。

```sh
npm run build
npm test
npm run test:next
npm run test:engines
npm run check
npm run lint
# 必须显式使用独立 groundwork_* 测试库，并停止平时运行的 worker：
node --env-file=.env.local --import tsx --test tests-next/database.integration.js
```

真实证据见[测试](docs/testing.md)和[变更自检](docs/changes/nextjs-platform/review.md)。六个依赖私有地图的引擎套件仍排除，不计通过。测试不是工业安全认证。

## AI-native SDLC

整体参考 [The AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook)。实施前记录意图、规格、计划和维护者批准；复现缺陷、补回归证据，分别检查逻辑、安全和范围。数值引擎独立于 UI，保留单位和模型身份，同步中英，不能放宽物理检查以获得 PASS。

执行规则见 [AGENTS.md](AGENTS.md) 和[开发政策](docs/development-policy.md)。同会话审查只是自检，不是独立批准；书面规则不证明已有强制 CI 门禁或完整落地。提交、推送、部署、上传及实机控制需要对应授权。

## 许可证

原创代码采用 [MIT](LICENSE)。见[第三方声明](THIRD_PARTY_NOTICES.md)和[源码来源](docs/source-provenance.md)。未经许可不上传客户地图、日志或凭证。
