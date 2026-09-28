# Contributing / 参与贡献

Small, reproducible improvements are more useful than broad claims. / 小而可复现的改进，比宽泛能力承诺更有价值。

1. Run `npm ci`, `npm run build`, `npm test`, `npm run test:engines`, `npm run check`. / 修改前后构建、测试及语法检查。
2. Keep physics, geometry and scheduling in `src/core`, `packages`, `engines`; do not couple them to the DOM. / 核心算法不要依赖界面。
3. Include the failing configuration, engine version, expected result and evidence for simulation changes. / 仿真修改提供失败配置、版本、预期和依据。
4. Add both English and Chinese user-facing copy. / 用户文案保持中英文同步。
5. Label assumptions, synthetic cases and unvalidated models. / 明确假设、合成场景及未验证模型。
6. Do not contribute proprietary/customer data or credentials without permission. / 不提交未经授权的客户数据或凭证。

Read [AGENTS](AGENTS.md) and the [development policy](docs/development-policy.md)
before substantive changes. Record accepted scope, a reproducible failing case for
fixes, tests and self-review; request review for model/security/release decisions.
See [testing](docs/testing.md) for commands and excluded suites. Follow
[the documentation index](docs/README.md) to keep Chinese and English in sync.
开始前阅读代理说明和开发政策。记录确认范围、修复前失败案例、测试和自检；模型、
安全与发布决策需审查。测试命令和排除项、双语文档入口见以上链接。

New original contributions are intended for the project's [MIT license](LICENSE).
Copied third-party code/assets retain their own terms; do not imply that copying
relicenses them. Review [third-party notices](THIRD_PARTY_NOTICES.md) and
[provenance](docs/source-provenance.md) before redistribution.
新增原创贡献以项目 MIT 许可为目标；第三方代码/资源仍遵守自身条款，复制不等于
重新许可。再分发前检查第三方声明和来源记录。
