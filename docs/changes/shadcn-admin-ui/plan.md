# Plan / 计划

Approval: maintainer explicitly selected the live demo's style, then confirmed
the single-administrator auth design scope. Implement the visual adaptation now;
prepare and request review of auth tables before implementing authentication.
授权：维护者指定在线演示风格，并确认单管理员登录设计范围；先实施视觉适配，
登录新增表结构准备并请求 review 后再实施，不将沉默当批准。

1. Inspect pinned upstream theme/layout/dashboard/components and license. Retain
   MIT notice and list adapted sources in THIRD_PARTY_NOTICES/source provenance.
   阅读固定源码并保留 MIT、逐项记录改编来源。
2. Adapt reusable primitives into src/components/ui and shell/layout components,
   keeping Next Link/navigation and existing providers; no Vite/router replacement.
   适配组件和布局，保留 Next 路由与 provider，不切换 Vite 或路由系统。
3. Apply theme and page headers to overview/resources/parks/laboratory, with local
   resource filtering and preserved actions; do not touch server/contracts/engines.
   统一主题和页面布局，增加本地资源筛选，保留操作，不改后端、契约或引擎。
4. Use an isolated groundwork_* MySQL schema and loopback server/worker for
   tests. Run npm test, test:next, check, lint, build, database/import suites and
   next-smoke/next-labs-smoke. Add layout/theme/filter/browser acceptance checks;
   inspect actual Chinese/English light/dark desktop/mobile screenshots.
   独立测试库、本机服务/worker 验收，运行上述测试，增加布局主题筛选验收并查看实际截图。
5. Update bilingual README/manual, record failures/fixes and exact evidence in
   review.md. Keep previous unrelated uncommitted deployment-script/docs work.
   同步双语文档，记录问题、修复、实测证据，保留此前未提交部署脚本和文档。

Recovery: this is a UI-only local change; leave robots untouched. Preserve source
history and test data; never reset the dirty worktree or weaken engine assertions.
恢复：仅本地 UI 修改，不动 robots；保留源码历史和测试数据，不重置脏工作区、不放宽引擎断言。
