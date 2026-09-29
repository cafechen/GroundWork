# Intent / 意图

Current status: committed as `2bfe8b2`; successful live script deployment separately
authorized and verified on 2026-09-29. See [follow-up plan](plan.md) and [evidence](review.md).
当前：已提交，后续单独获准于 2026-09-29 实机部署且验收通过；下文为最初仅脚本化的范围。

2026-09-29 maintainer request: “将刚才的部署过程固化为一个脚本，下次我自己部署。”
The request authorizes codifying the existing robots preview deployment, not a new
live cutover, database redesign, production service or automatic boot setup.
维护者请求将已完成的部署脚本化；本轮不再次切换线上、不改数据库设计、不扩展为生产或开机自启。

Scope: committed release packaging, target build, protected configuration reuse,
same-schema cutover/recovery, read-only verification and restart after reboot.
范围：已提交版本打包、目标机构建、复用受保护配置、同结构切换/恢复、只读验收和重启后启动。
No Strategist dependency, credentials in Git, seed/import, schema mutation or
automatic database rollback. Existing deployment documentation is preserved.
不依赖 Strategist、不提交凭证、不重复初始化/导入、不修改或自动回滚数据库；保留已有部署记录。
