# UI specification / 界面规格

Visual direction accepted by the maintainer's live-demo follow-up on 2026-09-29.
The new authentication scope is specified separately in [authentication.md](authentication.md).
维护者于 2026-09-29 指定在线演示风格确认视觉方向；新增登录范围见独立登录规格。

1. Adopt the upstream slate/neutral light and dark theme, compact typography,
   bordered cards, collapsible icon sidebar and mobile drawer. Keep GroundWork
   branding; do not retain the old full-page beige/green theme.
   采用模板灰白/深色主题、紧凑排版、卡片、可折叠图标侧栏及手机抽屉；保留品牌，替换旧米白绿主题。
2. Preserve five primary menus and seven park subpages, URL routes and actions.
   Header supplies current-location context, locale and theme controls. Laboratory
   remains a secondary entry. Do not add template-only customers, sales or accounts.
   保留五主菜单、七园区子页、URL 和操作，顶栏提供位置、语言和主题，实验室为辅助入口。
   不引入模板中的客户、销售或账号模块。
3. Overview uses actual resource/park data; no fabricated revenue, growth curves,
   connectivity or completion claims. Resource lists get consistent toolbars and
   accessible local search/filtering; empty/error states stay explicit.
   总览只用真实资源/园区数据，不编造营收、增长、在线或完成率；列表统一工具栏、可访问的
   本地搜索/筛选，明确空状态和错误。
4. Scene/replay canvases retain coordinate/physics contracts and their purposeful
   scene colors; restyle surrounding controls, not evidence or collision semantics.
   场景/回放保持坐标、算法及语义颜色，只改外围控件，不改证据或碰撞含义。
5. Both Chinese/English and desktop/mobile must work, keyboard focus remains
   visible, drawer/dialog focus and Escape work, theme/locale survive refresh.
   验收双语、桌面/手机、键盘焦点、抽屉/对话框及 Escape，主题和语言刷新后保留。
6. No external fonts, remote avatars, analytics, Clerk or mock personal profile.
   Preserve trusted-LAN boundaries. Authentication replaces the no-login notice
   only after the separately reviewed backend is actually implemented.
   不加载外部字体、头像、分析或 Clerk，不伪造个人账号；保留可信局域网边界，
   独立审查并实际实现登录后才替换“无登录”提示。
