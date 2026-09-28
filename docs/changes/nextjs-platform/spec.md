# Specification / 规格

Status / 状态：maintainer accepted; implementation in progress / 维护者已确认，实施中。

Additional accepted requirement: future PostgreSQL support. Keep business code
provider-neutral, generate both providers' schemas from one model definition,
and keep independent migration histories. Switching providers requires generate,
migrate and explicit data transfer; changing DATABASE_URL alone is insufficient.
新增已确认要求：未来支持 PostgreSQL。业务代码不依赖数据库方言，从一个模型定义生成
两种 schema，分别维护迁移历史；切库需重新生成客户端、迁移及显式数据转移，不能只改连接串。

## Target architecture / 目标架构

| Layer / 层 | Responsibility / 职责 |
| --- | --- |
| Next.js App Router | React layouts/pages and same-origin Route Handlers / React 页面、布局及同源后端接口 |
| React features + shadcn/ui | Forms, tables, dialogs, navigation, scene editing and replay / 表单、表格、对话框、导航、场景编辑、回放 |
| Client data layer | Typed API, query cache, cancellation, revision-aware mutation / 类型化请求、缓存、取消、版本化写入 |
| Server services | Authorization boundary for preview, validation, transactions, task compilation / 预览访问边界、校验、事务、任务编译 |
| Repositories + Prisma | MySQL business tables and immutable snapshots / MySQL 业务表及不可变快照 |
| Worker in same repository | Persistent Node process for jobs; TS engines and Python adapter / 同仓库常驻任务进程、TS 引擎与 Python 适配器 |
| Artifact storage | Bounded local result/frame files / 有边界的本地结果与轨迹文件 |

Strategist is React/Vite + NestJS + MySQL/Prisma, **not Next.js**. Adopt its strict
shared contracts and service/repository boundaries, not its framework stack.
Next.js is a single web application; a worker process is still necessary for
long-running simulation. It is not a second independent product or a dependency
on Strategist. Do not run physics in a React component or a long HTTP request.
Strategist 实际是 React/Vite + NestJS + MySQL/Prisma，**不是 Next.js**。参考共享契约与
服务/仓储分层，不照搬框架。Next.js 是一个 Web 应用，耗时仿真仍需要同工程 worker 进程，
不是另一个产品或 Strategist 依赖；不在 React 组件或长 HTTP 请求中运行物理仿真。

Use [Next.js Server/Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
and [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers).
Use [shadcn/ui source components](https://ui.shadcn.com/docs/installation), not a
CSS theme that merely resembles them. Select supported, audited dependency
versions when implementation is accepted; do not treat the reference project's
older package versions as an automatic security endorsement.
按上述官方机制区分服务端/客户端组件与接口，使用真正的 shadcn/ui 源组件，不只改相似配色。
实施获准后选择并审查依赖版本，不把参考项目旧版本当作安全背书。

## Product acceptance / 产品验收

1. Preserve overview, map management, device models, gateways, park management;
   park overview, scene editor, instances, operations, controls, analytics and
   settings. URLs are addressable; loading, empty, error and stale-write states
   are visible in both languages and on narrow screens.
   保留五主菜单、七园区子页；页面可直接访问，双语/小屏覆盖加载、空白、失败、冲突状态。
2. Existing maps and model versions, gateway channel setup, park creation,
   instance creation, route editing/save, task execution and replay work through
   React + typed services. No iframe, raw HTML injection or hidden old Node
   server can be counted as the completed Next.js migration.
   地图/模型版本、网关通道、园区/实例创建、路线保存、任务执行和回放经 React 与类型化服务
   完成；iframe、直接注入旧 HTML、暗中代理旧服务器不算迁移完成。
3. Reproduce the ready-yard baseline before refactoring. After migration,
   preserve engine identity, input semantics, metrics and verdict for fixed
   fixtures. Improve error presentation without weakening spawn/contact checks.
   重构前复现可运行园区基线；重构后固定样例的引擎、输入、指标、判定保持一致。
   改善错误展示，不放松初始位置或接触校验。
4. React owns renderer mount/update/disposal; Three.js remains a view, not the
   simulation engine. Switching pages must release listeners, animation loops
   and GPU resources. Do not reset unsaved drafts on background refetch.
   React 管理渲染器挂载、更新、释放；Three.js 只是视图。切页清理监听、动画、GPU资源，
   后台刷新不得覆盖未保存草稿。
5. Preserve trusted-LAN/no-login policy, Host/Origin/body-limit checks, safe
   artifact paths, input validation and archived-resource restrictions. Real
   instances cannot run simulation or receive replay control commands.
   保留可信局域网免登录、Host/Origin/请求大小限制、安全文件路径、输入及归档校验。
   实机不能参加仿真，回放不能发送实机控制指令。
6. Structured API errors expose a readable bilingual message and field details,
   not raw Zod JSON or internal stack traces. Optimistic conflicts are explicit.
   结构化错误提供双语信息与字段详情，不直接显示 Zod JSON/内部堆栈；版本冲突明确提示。

## Persistence and worker acceptance / 数据与执行验收

Use the [database proposal](../../database/README.md). Prove revision conflicts,
foreign-park reference rejection, immutable historical replay, and read-only
source import. Cancellation before spawn, serialized result writes, single-slot
claim before awaited work, and restart recovery require automated tests. An
expired running lease becomes interrupted, never silently successful or blindly
re-executed. No multi-host/high-availability claim is made.
采用数据库提案；测试版本冲突、跨园区引用拒绝、历史回放不变、源库只读导入。
取消先于 spawn、结果串行写、await 前占槽、重启恢复均需测试。过期运行租约标记中断，
不得伪报成功或盲目重跑。不宣称多机高可用。

Strict TypeScript covers maintained application, server and JS engine migration.
Existing typed packages remain internal. Python/native simulation dependencies
are explicit exceptions, not reimplemented in TypeScript. No blanket `any`,
`@ts-nocheck`, or JS wrapper counted as a typed conversion.
受维护应用、服务端、JS 引擎逐步转为严格 TypeScript；已有 TS 包保持内部依赖。
Python/原生仿真依赖是明确例外，不用 TS 重写。禁止以大量 any、ts-nocheck 或简单包裹旧 JS
冒充完成类型迁移。
