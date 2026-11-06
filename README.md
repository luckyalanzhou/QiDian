# 栖点

栖点是面向个人的自托管知识工作区，用笔记保存内容、用书签整理网址，并可把网页正文摘录为笔记。数据存放在自己管理的服务和 SQLite 数据库中，适合希望在个人设备或家庭服务器上管理知识资料的人。

栖点通过 Docker 和 iStoreOS 发布。产品需求与可验证标准见 [PRD](PRD.md)。

## 核心功能

- **笔记**：创建和编辑笔记，支持富文本内容、分类、标签、附件和内容类型。
- **书签**：保存网址，按文件夹整理、标记常用项，并导入或导出浏览器书签 HTML。
- **网页摘录**：将网页正文或文本摘录并保存为笔记。
- **查找与导航**：搜索笔记和书签，使用命令面板、桌面侧栏或手机底部导航切换内容。
- **回收站**：恢复误删内容；回收站中的笔记和书签按产品保留策略清理。
- **备份与恢复**：导出包含知识库和附件的完整 ZIP，导入备份，并查看服务端历史快照。
- **账户安全**：账号密码登录、可选两步验证与恢复码、会话管理；浏览器扩展可在配对授权后新增书签。
- **外观**：支持浅色与深色主题，并适配桌面和手机布局。

栖点是个人私有产品，当前不提供公开分享、多人协作或付费计划。

## 自托管运行

### Docker Compose

仓库中的 Compose 配置使用 Docker Hub 上的多架构镜像，并创建名为 `qidian-data` 的持久卷。首次运行：

```sh
docker compose -f packaging/docker/compose.yaml up -d
```

浏览器访问 `http://<服务器地址>:9908`，按页面引导创建首个所有者账号。首次创建所有者后，默认不开放后续注册。Compose 环境变量示例见 [`packaging/docker/env.example`](packaging/docker/env.example)；使用反向代理时，应按配置说明设置可信代理地址。

### iStoreOS

iStoreOS 发布包提供 LuCI 配置界面、安装脚本和 `.run` 安装包，并通过 Docker 运行服务。可在项目发布页下载对应设备架构的 `.run` 包；设备端安装与升级由 LuCI 页面和随包工具管理。相关配置模板位于 [`packaging/istoreos`](packaging/istoreos)。

## 技术架构

- **前端**：Vue 3、TypeScript、Pinia 和 Vite。页面导航由 Pinia 状态管理，不使用 Vue Router。
- **服务端**：Node.js HTTP 服务提供静态资源和 JSON API，完成认证、知识库、附件、备份、账户设置及系统更新等操作。
- **持久化**：SQLite 保存账户、知识库、附件元数据和备份快照；数据库结构按序执行 SQL 迁移。
- **部署**：Docker 镜像采用构建阶段与精简运行阶段；iStoreOS 通过 LuCI 与 `.run` 包管理 Docker 部署。
- **浏览器扩展**：Chrome 扩展通过经配对授权的 API 入口新增书签。

## 本地开发

需要 Node.js `>=22.13.0`。安装依赖后可使用仓库脚本：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

常用检查命令：

```sh
pnpm check
pnpm test
pnpm build
```

`pnpm dev` 用于本地前端开发；生产构建由 `pnpm build` 生成。自托管 SQLite 预览入口为 `pnpm preview:sqlite`，其参数和环境配置请以 [`scripts/preview.mjs`](scripts/preview.mjs) 为准。

## 产品需求

产品目标、范围边界、核心流程、技术约束和验收标准见 [PRD.md](PRD.md)。
