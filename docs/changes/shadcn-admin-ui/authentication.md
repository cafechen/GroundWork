# Authentication review proposal / 登录设计待审查

Scope approved: single administrator, username/password, no registration or roles,
initialization command, database-backed expiring sessions and logout.
已确认范围：单管理员、用户名密码、无注册及角色、命令初始化、数据库会话、过期及退出。
**Table/contract implementation awaits maintainer review. / 表与接口实施待维护者 review。**

## Two additional tables / 新增两张表

Existing 18 business tables are unchanged. Canonical Prisma models generate MySQL
and PostgreSQL schemas; each provider gets an independent additive migration.
原 18 张业务表不改；Prisma 统一模型生成 MySQL/PG，两端分别增加独立迁移。

| Table / 表 | Fields / 字段 | Constraints / 约束 |
| --- | --- | --- |
| `AuthUser` | `id Int`, `username String(64)`, `passwordHash String(255)`, `disabledAt DateTime?`, `createdAt DateTime`, `updatedAt DateTime` | PK id; unique username; initialization/login only use id=1; lowercase ASCII username; no plaintext password / 主键、用户名唯一，初始化/登录只使用 id=1，小写 ASCII，无明文密码 |
| `AuthSession` | `tokenHash String(64)`, `userId Int`, `createdAt DateTime`, `expiresAt DateTime` | PK tokenHash; FK userId→AuthUser; indexes userId and expiresAt; only SHA256 of random token stored / token 哈希主键、用户外键和过期索引，仅保存随机令牌 SHA256 |

Password hashing: Node crypto scrypt with random per-password salt and bounded
cost, timing-safe comparison. Initialization/reset is an explicit local CLI command
with hidden password input; reset invalidates all sessions. No default admin password.
密码采用随机盐 scrypt 及恒定时间比较；本机 CLI 隐藏输入初始化/重置，重置撤销所有会话，
没有默认管理员密码，不在聊天、Git 或命令参数中传递明文密码。

## API and session policy / 接口与会话

- `POST /api/auth/login`: username/password, generic invalid-credentials error,
  small bounded JSON body, bounded process-local request throttling for this
  single-process preview. No claim of distributed/durable brute-force protection.
  登录统一错误、限制请求体，单进程内限频；不声称分布式/重启后持久限频。
- `GET /api/auth/session`: current safe user identity or 401.
  当前用户只返回非秘密标识，未登录 401。
- `POST /api/auth/logout`: revoke server session and expire cookie.
  退出删除服务器会话并清 Cookie。
- Browser cookie: random 256-bit opaque token, HttpOnly, SameSite=Strict, Path=/,
  eight-hour absolute expiry. Secure in HTTPS; explicit insecure-cookie setting
  only for loopback/trusted VPN HTTP testing, with a clear unencrypted-transport warning.
  Cookie 随机 256 位、HttpOnly、Strict、根路径、绝对 8 小时；HTTPS 开 Secure。
  仅显式配置允许本机/可信 VPN HTTP 调试并提示传输未加密。
- Protect all business APIs, exports and pages on the server; unauthenticated
  APIs return 401 JSON, pages redirect to login. Preserve Host/Origin checks;
  database/configuration failures never fall back to anonymous access.
  页面、业务 API、导出均后端保护；API 401、页面跳登录，保留 Host/Origin，故障不回退匿名。
- Only a minimal non-sensitive readiness endpoint is public. Redirect targets
  must be local app paths. Login UI uses upstream styling, not its mock token,
  OAuth buttons, fake users or password-recovery links.
  只公开最小就绪接口，跳转限本站；不使用模板假令牌、OAuth、假账号或未实现的找回密码入口。

## Upgrade and tests / 升级与测试

UI-only changes do not migrate DB. Auth introduces an additive schema upgrade;
the existing routine robots deployment script must refuse it until the explicit
migration/backup procedure is reviewed and executed. No live migration this turn.
UI 不迁移数据库；登录需要增量迁移，日常部署脚本须继续拦截，另行审查备份/迁移后部署，
本轮不直接迁移 robots。

Test on a new isolated groundwork_* MySQL schema: password hashing, invalid/valid
login, tampering/expiry, logout revocation, disabled user, password-reset revocation,
body/rate/origin guards, anonymous page/API/export rejection, authenticated existing
workflows, both languages/themes/mobile and no external network requests.
在新独立测试库验证哈希、登录成败、篡改/过期、退出撤销、禁用、密码重置撤销、请求体/限频/
来源保护、匿名页面/API/导出拒绝、已登录业务流程、双语主题手机及无外部请求。
