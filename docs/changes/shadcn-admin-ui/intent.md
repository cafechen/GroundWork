# shadcn-admin UI / 界面重设计意图

Current status: UI implemented/verified, committed as `2bfe8b2` and deployed with
separate explicit permission. Auth design scope accepted, detailed implementation
still pending. See [review](review.md); original visual-stage boundaries follow.
当前：UI 已实施验收、提交并获单独授权部署；登录设计范围已确认，详细实施仍待审。
见自检，下文保留最初视觉阶段边界。

2026-09-29 maintainer request: use https://github.com/satnaing/shadcn-admin to
redesign the UI after the previous component-only migration looked unchanged.
维护者指定使用上述免费模板重做界面；此前只换组件，视觉变化不明显。

Use upstream revision `e16c87f213a5ba5e45964e9b67c792105ec74d26`, MIT,
Copyright (c) 2024 Sat Naing. Adapt source with attribution, not a new runtime
dependency on an external checkout. 保留原许可及固定版本来源，在本工程适配源码，不依赖外部工程运行。

Scope: application shell, overview, four resource lists, seven park tabs and
laboratory presentation; responsive bilingual navigation and consistent components.
范围：应用框架、总览、四类资源列表、园区七子页、实验室视觉，响应式双语导航和统一组件。
Preserve Next.js/React, MySQL/Prisma, APIs, worker, simulation metrics and existing
data. The visual stage has no schema migration, Gazebo or live device features;
authentication was subsequently added by the maintainer as a separately reviewed stage.
保留现有技术架构、接口、数据与仿真逻辑；视觉阶段不迁移、不加 Gazebo 或实机功能；
维护者随后追加登录需求，按独立审查阶段处理。

The user subsequently selected the live demo's visual style and approved designing
single-administrator username/password authentication, without registration or roles.
The visual direction is accepted; authentication table review is a separate gate.
用户随后确认在线演示风格，并确认设计单管理员用户名密码登录（无注册/角色）；
视觉方向已确认，登录新增表结构单独等待 review。
No commit/push or robots cutover is included without corresponding authorization.
未经对应授权不提交、推送或切换 robots；后续明确授权及实际结果见上方状态和自检。
