# 项目结构

栖点采用单体部署与模块化代码边界：浏览器界面、同源 API、SQLite 数据和设备管理随各自交付流程构建。本文列出主要目录职责；调用关系、安全与数据约束见[架构说明](architecture.md)，安装与升级见[部署指南](deployment.md)。

```text
.
├── index.html, src/main.ts          Web 入口
├── src/app/                         应用启动与工作区组合
├── src/features/<domain>/           按领域组织的界面、状态与用例
├── src/compat/<domain>/             旧 DOM 页面和迁移兼容适配器
├── src/domain/                      前端领域数据规则
├── src/api/, src/stores/, shared/   API、状态和前后端共享契约
├── server/                          HTTP、自托管应用、SQLite 仓储与适配器
├── migrations/                      SQLite 顺序迁移
├── packaging/docker/                通用 Docker Compose 部署
├── packaging/istoreos/              LuCI、设备脚本和 .run 安装包
├── tests/                            按客户端、服务端及交付边界分类的测试
├── scripts/                          检查、版本和仓库维护脚本
├── docs/                             需求、架构、部署和验证说明
└── private_wiki_prototype.html       原始设计参考，不参与构建
```

## 主要边界

- **Web 应用**：`src/main.ts` 启动 Vue 根应用与认证流程；`src/app/` 负责入口编排，`src/features/` 按编辑器、笔记、书签、同步等领域组织界面与业务动作，`src/compat/` 只保留尚未移除的旧 DOM 兼容实现。
- **领域与共享**：`src/domain/` 放置前端领域数据模块；`shared/` 保存浏览器与服务端共用的数据校验和 API 契约。
- **自托管服务**：`server/features/` 处理 HTTP 领域请求，`server/application/` 编排用例，`server/repositories/` 封装 SQLite 查询，`server/adapters/` 提供数据库适配。数据库结构由 `migrations/` 维护。
- **设备部署**：`packaging/docker/` 提供通用 Compose 配置；`packaging/istoreos/` 管理 LuCI 页面、设备脚本和安装包。两者复用应用镜像但交付物不同。
- **质量与交付**：`tests/client/`、`tests/server/`、`tests/shared/`、`tests/packaging/` 和 `tests/scripts/` 按验证边界归档；`tests/support/` 与 `tests/fixtures/` 保存测试辅助工具和固定样例。`scripts/`、`.github/workflows/` 负责检查、构建和发布。

## 启动与数据流

浏览器从 `index.html` 加载 `src/main.ts`，挂载 `src/app/workspace-app.ts` 的 Vue 工作区，再由 `src/app/application.ts` 启动认证和应用组合。客户端通过 `src/api/` 请求同源服务；服务端依次经过 API 边界、领域功能、应用用例和 Repository，最终由 SQLite 适配器访问数据库。附件和数据库保存在部署挂载的数据目录中。

测试运行器通过 `pnpm test` 自动发现分层目录下的测试；源码类型与静态检查使用 `pnpm check`，前端构建使用 `pnpm build`。部署状态和真实设备行为需要按[验证说明](verification.md)单独验收。
