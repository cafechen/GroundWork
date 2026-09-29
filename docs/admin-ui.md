# Admin UI / 后台界面

GroundWork now adapts [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)
revision `e16c87f213a5ba5e45964e9b67c792105ec74d26`, matching the maintainer-selected
[live-demo style](https://shadcn-admin.netlify.app/). It remains a Next.js application,
not a Vite/TanStack Router replacement. MIT source attribution is recorded in
[third-party notices](../THIRD_PARTY_NOTICES.md).
GroundWork 按维护者指定的在线演示风格改编上述固定版本模板；仍是 Next.js 工程，
没有换成 Vite/TanStack Router，MIT 来源和改编范围见第三方声明。

## Navigation and appearance / 导航与外观

- Desktop: five primary menus in an icon sidebar, with Laboratory under Engineering.
  The top-left sidebar button collapses/expands navigation; Ctrl/Cmd+B is also available.
  桌面：图标侧栏包含五主菜单，研发工具下保留实验室；顶栏按钮或 Ctrl/Cmd+B 折叠侧栏。
- Mobile: the same button opens a modal drawer. Selecting a page closes it; the
  close button, outside click and Escape dismiss it. Main content remains scrollable;
  wide tables scroll horizontally inside their container.
  手机：按钮打开模态抽屉，选页面自动收起，也可用关闭按钮、外侧点击或 Escape；
  内容正常滚动，宽表格在自身容器内横向滚动。
- Moon/sun toggles light/dark; EN/中文 switches languages. These preferences are
  local to this browser and survive refresh. No fonts, avatars or analytics are
  fetched from external providers.
  月亮/太阳切换明暗，EN/中文切换语言，偏好保存在当前浏览器并跨刷新保留；
  不请求外部字体、头像或分析服务。
- Overview counts current non-archived resources and lists real park workspaces.
  The workflow panel is guidance, not a fabricated task-progress or safety metric.
  总览统计真实未归档资源、列出真实园区；工作流是操作说明，不是编造的进度或安全指标。
- Maps/models/gateways/parks share name search, all/not-archived/archived filters,
  result count, table actions and explicit empty/error states. Search/filtering is
  local presentation only and does not update resource data.
  四类资源共用名称搜索、状态筛选、结果数、操作及空/错误状态；筛选仅在本地显示，不写资源数据。
- Park subpages remain Overview, Scene editor, Devices, Operations, Control panel,
  Analytics and Settings. Scene coordinates, colors, collision rules and replay
  evidence are unchanged. Unsaved drafts are guarded when navigating, including
  the new sidebar brand link.
  园区七子页不变，场景坐标、语义颜色、碰撞规则、回放证据不改；未保存草稿在导航时受保护，
  包括新的侧栏品牌链接。

## Authentication boundary / 登录边界

The maintainer approved **designing** single-administrator authentication. The
[two-table proposal](changes/shadcn-admin-ui/authentication.md) is awaiting detailed
review; this visual-stage implementation still runs the existing **no-login trusted-LAN
preview**. Do not interpret a template shell or shield icon as access control.
There is no fake login, default password, registration, Clerk integration or OAuth.
维护者已确认单管理员登录的设计范围；两张新增表的详细方案待 review，当前视觉阶段仍是
**无登录可信局域网预览**。外壳和盾牌图标不等于访问控制，不提供假登录、默认密码、
注册、Clerk 或 OAuth。

Revision `2bfe8b2` was deployed by the script on 2026-09-29 to
**http://10.9.0.20:5180**, with read-only UI and existing-run replay verification.
版本 2bfe8b2 已于 2026-09-29 经脚本部署到上述 VPN 地址，界面及既有实验回放只读验收通过。

Future local UI changes are not automatically deployed to robots. Keep deployed-source
evidence separate from local screenshots and tests. See [change review](changes/shadcn-admin-ui/review.md)
for actual acceptance results and remaining work.
本地界面改动不会自动部署到 robots；线上版本证据与本地截图/测试分开记录，实际验收和待办见变更自检。
