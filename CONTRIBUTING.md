# Contributing / 参与贡献

Small, reproducible improvements are more useful than broad claims. / 小而可复现的改进，比宽泛能力承诺更有价值。

1. Run `npm ci`, `npm run build`, `npm test`, `npm run test:engines`, `npm run check`. / 修改前后构建、测试及语法检查。
2. Keep physics, geometry and scheduling in `src/core`, `packages`, `engines`; do not couple them to the DOM. / 核心算法不要依赖界面。
3. Include the failing configuration, engine version, expected result and evidence for simulation changes. / 仿真修改提供失败配置、版本、预期和依据。
4. Add both English and Chinese user-facing copy. / 用户文案保持中英文同步。
5. Label assumptions, synthetic cases and unvalidated models. / 明确假设、合成场景及未验证模型。
6. Do not contribute proprietary/customer data or credentials without permission. / 不提交未经授权的客户数据或凭证。

By contributing, you agree to license your contribution under the project's MIT license. / 贡献内容采用项目 MIT 许可证。
