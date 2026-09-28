# Intent / 意图：Next.js platform refactor

Date / 日期：2026-09-28. Status / 状态：**maintainer accepted; implementation in progress / 维护者已确认，实施中**。

## Request / 请求

The maintainer requested a TypeScript, integrated Next.js frontend/backend using
Strategist as a reference, a database schema for their review, and React +
shadcn/ui components. This authorizes preparation of the design, not invented
approval of newly proposed contracts or database choices.
维护者要求参考 Strategist 改为 TypeScript + Next.js 前后一体化，提交表结构供其 review，
并使用 React + shadcn/ui 重写界面。该请求允许准备方案，不应虚构新契约/数据库选型已被批准。

## Scope / 范围

- One standalone GroundWork repository/application; learn layering from
  Strategist without depending on its services or source tree at runtime.
  一个独立 GroundWork 工程，参考 Strategist 分层，不运行时依赖其服务或代码目录。
- Five main menus and seven park pages; current API behavior, data history and
  engine-specific semantics; React migration includes legacy lab entry points.
  五个主菜单、七个园区子页，保留接口行为、数据历史和引擎语义；React 迁移包含旧实验室入口。
- MySQL/Prisma relational design proposed for review, followed by approved
  persistence migration. No running database is modified during design review.
  提出 MySQL/Prisma 关系模型供审查，确认后才实施持久化迁移；设计评审不修改运行中的数据库。

## Exclusions / 排除项

No Gazebo/ROS integration, new physics, real-device control, authentication,
multi-tenancy, production deployment, commit/push or automatic source-data
migration. Python Chrono and map import tooling remain Python.
本次不接 Gazebo/ROS、不改物理算法、不做实机控制、登录、多租户、生产部署、提交推送或
自动迁移源数据。Python Chrono 与地图导入工具继续使用 Python。

## Approval / 批准记录

In this conversation on 2026-09-28 the maintainer explicitly accepted MySQL +
Prisma, the proposed schema and plan, with an additional requirement for future
PostgreSQL support. This authorizes local implementation, not deployment or
modification of existing databases. The initial proposal remains uncommitted.
维护者于本对话明确确认：“采用 MySQL + Prisma，并按上述表结构和计划继续实施，但是要求
将来能支持PGSQL”。据此进行本地实施；不授权部署或修改已有数据库。初始提案尚未提交。

Portability: one domain contract/repository API, provider-specific generated
Prisma schemas and separate SQL migration histories. Avoid raw dialect SQL in
business services. Test schema parity now; PostgreSQL live integration requires
an available isolated database and must not be claimed based on validation alone.
兼容策略：统一领域契约/仓储接口，按 provider 生成 Prisma schema，分别维护 SQL 迁移。
业务服务不使用数据库方言 SQL；本轮验证结构一致性，真实 PG 集成需隔离数据库，不能以
schema 校验冒充运行验证。

The maintainer subsequently authorized reading Strategist's local DATABASE_URL and
creating separate test schemas. Only that connection setting was read; no source
business tables were used. / 维护者随后授权读取 Strategist 本机 DATABASE_URL 并另建测试库；
仅使用该连接项，不读取或修改源业务表。
