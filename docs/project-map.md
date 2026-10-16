# 项目组成说明

本文按代码和交付边界说明栖点由哪些部分组成，以及各部分主要负责什么。它侧重回答“代码在哪里、各模块负责什么”；系统调用关系和安全细节见[架构说明](architecture.md)，安装步骤见[部署指南](deployment.md)。

## 项目分层

```text
栖点
├── Web 应用              浏览器中的知识库界面和交互
├── 自托管服务与数据层    登录、API、SQLite、附件和备份
├── Docker 部署           在 Linux、NAS、服务器或路由器容器中运行应用
├── LuCI 设备管理         iStoreOS / OpenWrt 上的安装、服务和更新管理
├── 构建与发布            测试、镜像构建、安装包制作和 GitHub Release
└── 质量与项目资料        自动化测试、需求、架构、部署和验证文档
```

## 各部分的主要内容

### 1. Web 应用：`index.html`、`src/`

`index.html` 是生产 Web 应用的入口，`src/app.js` 组织页面导航、主界面、笔记和书签等功能，`src/styles.css` 提供桌面、手机及浅色和深色主题样式。前端使用原生 JavaScript、Vite 和 Tiptap 编辑器。

主要功能模块：

| 文件 | 主要职责 |
|---|---|
| `src/app.js` | 应用启动、页面与导航、笔记列表和阅读编辑流程、搜索、账号与版本界面 |
| `src/editor.js`、`src/editor-extensions.js` | 富文本编辑器及扩展配置 |
| `src/markdown.js`、`src/paste.js` | Markdown 转换、网页内容清理和粘贴处理 |
| `src/bookmarks.js`、`src/bookmark-data.js` | 书签与文件夹界面、导入导出、整理和数据校验 |
| `src/recycle-bin.js`、`src/trash-data.js` | 回收站显示、恢复、过期清理和清空确认 |
| `src/cloud.js`、`src/vault-merge.js` | 已登录模式的数据 API、保存队列、多设备同步和冲突合并 |
| `src/draft-recovery.js` | 编辑异常或网络中断时的临时恢复处理 |
| `src/credentials.js`、`src/credentials-worker.js`、`src/credentials-wasm.js` | 登录凭据派生与相关计算 |
| `src/release-notes.js` | 版本说明内容 |

`private_wiki_prototype.html` 是早期设计参考，不是生产入口，也不参与构建。

### 2. 自托管服务与数据层：`server/`、`migrations/`

Node.js 服务负责向浏览器提供静态资源与 API，并在 Docker 容器中访问持久化数据。数据库使用 Node 内置 SQLite，数据目录由部署配置挂载到容器 `/data`。

| 路径 | 主要职责 |
|---|---|
| `server/selfhost.mjs` | 启动 HTTP 服务、提供健康检查和静态资源，并接入 SQLite 与设备更新代理状态 |
| `server/api.js` | 账号、会话、知识库、附件、快照备份、头像和版本更新等 API |
| `server/auth.js` | 登录认证、会话校验、来源检查和认证限流 |
| `server/validation.js` | 服务端请求与知识库数据校验 |
| `server/bookmarks.js` | 服务端和浏览器共用的书签 URL 与数据校验逻辑 |
| `server/sqlite-migrations.mjs` | 打开 SQLite 数据库、执行迁移及迁移前备份 |
| `migrations/*.sql` | 按序升级数据库结构，兼容既有设备数据 |
| `server/reset-password.mjs` | 在容器内交互式重置账号密码 |

核心数据包括账号、会话、笔记和书签知识库、附件及正文快照。API 先验证身份，再按账号隔离数据。保存通过带 revision 的 SQLite 更新检测并发修改；只有事务成功后才确认写入。

### 3. Docker 部署：`Dockerfile`、`packaging/docker/`

Docker 镜像承载 Web 服务和 Node.js 服务端，面向 `linux/amd64` 与 `linux/arm64`。容器监听 9908 端口，知识库和附件写入挂载到 `/data` 的持久化存储中。

- `Dockerfile`：分阶段安装依赖、构建 Web 资源并制作运行镜像。
- `packaging/docker/compose.yaml`：通用 Docker Compose 部署定义。
- `packaging/docker/env.example`：通用部署的环境变量模板。

常规部署使用 Compose 和命名卷；iStoreOS / OpenWrt 部署由 LuCI 管理界面配置数据目录。容器不直接承担路由器 LuCI 页面，也不通过 Docker Socket 获取宿主机管理权限。

### 4. LuCI 设备管理：`packaging/istoreos/`

这一部分面向 iStoreOS 和兼容的 OpenWrt，管理容器生命周期及设备端更新。它与 Docker 镜像中的 Web 应用、服务端代码分开构建和部署。

| 路径 | 主要职责 |
|---|---|
| `packaging/istoreos/luci-app-qidian/root/usr/lib/lua/luci/controller/qidian.lua` | 注册 LuCI 菜单和页面路由 |
| `packaging/istoreos/luci-app-qidian/root/usr/lib/lua/luci/model/cbi/qidian.lua` | LuCI 服务、部署配置和日志表单 |
| `packaging/istoreos/luci-app-qidian/root/usr/lib/lua/luci/view/qidian/status.htm` | LuCI 页面视图模板 |
| `packaging/istoreos/luci-app-qidian/root/usr/libexec/istorec/qidian.sh` | 安装、启动、停止、卸载容器及设备环境管理 |
| `packaging/istoreos/luci-app-qidian/root/usr/libexec/istorec/qidian-updater.sh` | 检查并更新 LuCI 管理文件和 Docker 镜像 |
| `packaging/istoreos/luci-app-qidian/root/etc/init.d/qidian-updater` | 通过 procd 管理宿主更新代理进程 |
| `packaging/istoreos/compose.yaml`、`.env.example` | 设备上的容器配置模板 |
| `packaging/istoreos/install.sh` | `.run` 解包后的安装或升级入口 |
| `packaging/istoreos/build-run.sh` | 组装 `.run` 自解压包并生成 SHA-256 文件 |

发布的 `.run` 包含 LuCI、Compose 和设备管理脚本，不包含应用容器镜像；设备通过 Docker Hub 拉取适合自身架构的镜像。管理插件与镜像版本可独立检查，需要更新时由设备端流程执行。

### 5. 构建与发布：`.github/workflows/`、`scripts/`

GitHub Actions 的 `istoreos-release.yml` 是手动触发的正式发布工作流。它执行源码检查、测试和 Web 构建，构建并验证容器，发布多架构 Docker 镜像，制作 `.run` 与校验文件，更新版本号并发布 GitHub Release，最后提升已发布版本镜像为 `latest`。

- `scripts/release-version.mjs`：按选择的版本级别计算或恢复发布版本。
- `scripts/check-sources.mjs`：检查 JavaScript / MJS 源码。
- `scripts/preview.mjs`、`scripts/sqlite-adapter.mjs`：运行本地 SQLite 服务预览所需的适配与启动逻辑。
- `pnpm-lock.yaml`、`pnpm-workspace.yaml`、`package.json`：依赖锁定、包管理配置、版本来源和常用开发命令。

普通推送到 `main` 不等于发布；镜像、`.run` 和 Release 由手动发布工作流交付。具体操作和设备端升级步骤见[iStoreOS / OpenWrt 安装包说明](../packaging/istoreos/README.md)。

### 6. 质量验证与项目资料：`tests/`、`docs/`

`tests/` 使用 Node.js 测试运行器和 JSDOM 覆盖认证、API、SQLite、多设备保存与冲突、编辑器、书签、回收站、LuCI 更新脚本和发布打包等行为。

| 路径 | 内容 |
|---|---|
| `docs/requirements.md` | 产品需求、功能范围和隐私边界 |
| `docs/architecture.md` | 系统调用关系、认证、数据保存、安全和更新机制 |
| `docs/deployment.md` | Docker、iStoreOS / OpenWrt 安装、升级、迁移和诊断 |
| `docs/verification.md` | 自动化测试范围、发布前检查及尚需设备验证的项目 |
| `docs/dockerhub-overview.md` | Docker Hub 镜像使用说明 |
| `packaging/istoreos/README.md` | `.run` 安装包内容、使用和构建发布流程 |

自动化测试和构建不能替代真实路由器、桌面浏览器或手机浏览器验证；各自的验证边界记录在[验证说明](verification.md)。

## 一次典型请求如何经过这些部分

1. 用户在浏览器打开 `index.html`，前端加载笔记或书签页面。
2. `src/cloud.js` 通过同源 `/api/` 请求 Node.js 服务端；本地开发模式使用浏览器开发数据。
3. `server/auth.js` 和 `server/api.js` 校验会话、请求及账号权限。
4. 服务端读取或更新 SQLite，并根据请求处理附件或快照。
5. 若用户从 LuCI 发起设备升级，LuCI 管理页经受限请求与状态目录协调宿主更新代理；代理分别更新管理文件和容器镜像，知识库数据仍留在持久化目录。

## 常用本地命令

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm check
pnpm build
```

Node.js、pnpm 版本和 SQLite 本地预览方式见[README 本地开发](../README.md#本地开发)与[验证说明](verification.md)。
