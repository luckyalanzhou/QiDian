# 栖点 · QiDian

栖点是面向个人使用的 Docker 私人知识库，用来整理笔记、命令、网页摘录、图片、附件和网址书签。数据保存在自己的设备中。

## 主要功能

- 笔记与书签是两个同级入口，桌面使用侧栏，手机使用底部导航。
- 富文本编辑器基于 Tiptap 3，支持标题、列表、表格、代码块、图片、提示块和折叠内容。
- 可粘贴网页富文本、标准 Markdown 或普通文字；空白笔记可从粘贴内容自动填充标题。
- 草稿实时写入 Docker 服务端 SQLite；发布后进入个人阅读列表。
- 多个已登录设备共享同一份数据，并对并发修改进行版本检查、合并和冲突保护。
- 主题、粘贴方式、侧栏和书签布局及分组展开状态按账号保存，并在设备间同步。
- 书签保留浏览器目录层级，支持 HTML 导入导出、搜索、整理、批量移动和删除；首页分组可切换单列或双列。
- 图片、附件、正文历史和完整 ZIP 备份都按账号隔离。
- Web 可检查 GitHub Release；iStoreOS 安装更新代理后，可在线更新 Docker 服务并查看实时日志。

## 下载与部署

### iStoreOS

从[最新 GitHub Release](https://github.com/luckyalanzhou/qidian/releases/latest)下载 `栖点-<版本>.run` 和对应的 SHA-256 文件，在 iStore 软件商店中手动上传安装。随后进入 **服务 → 栖点知识库**，点击 **安装 / 更新**。

安装包只提供 LuCI 页面、Compose 和设备管理脚本。应用本体来自 Docker Hub 多架构镜像：

```text
docker.io/luckyalanzhou/qidian:latest
```

LuCI 会读取当前设备的 Docker Root Dir，并把数据保存在该设备的 `volumes/qidian/data` 下，不使用开发者设备或旧设备的路径。

### 通用 Docker

```sh
git clone https://github.com/luckyalanzhou/qidian.git
cd qidian
cp packaging/docker/env.example packaging/docker/.env
docker compose --env-file packaging/docker/.env -f packaging/docker/compose.yaml up -d
```

默认访问地址是 `http://<设备地址>:9908`。通用 Docker 使用 `qidian-data` 命名卷保存数据库和附件。

完整安装、迁移、更新与诊断步骤见[部署指南](docs/deployment.md)。

## 首次使用与账号

新设备第一次打开栖点时会进入管理员创建页，账号名称预填 `admin`，密码必须自行设置；系统没有默认密码。首个管理员创建后，注册入口默认关闭。

登录会话连续 3 天未使用会失效，最长 7 天必须重新登录。使用账号名和密码登录。需要由设备管理员重置密码时，在设备终端执行：

```sh
docker exec -it qidian node server/reset-password.mjs
```

按提示输入账号，再输入 `Y` 确认重置或 `N` 取消，然后输入两次新密码。重置密码会注销该账号的已有会话，不删除笔记、书签或附件。

## 数据与更新

- iStoreOS：数据位于 LuCI 显示的 Docker Root Dir 下 `volumes/qidian/data`。
- 通用 Docker：数据位于 Docker 管理的 `qidian-data` 卷。
- 容器重建和应用更新不会删除数据卷。
- 删除数据目录或 Docker 卷会永久删除知识库，操作前应先导出完整 ZIP 并备份挂载目录。
- iStoreOS Web 在线更新会下载并校验新版 `.run`，更新管理文件，等待 10 秒后重启 Docker；新版本服务可用后，网页再倒计时 5 秒自动刷新。

栖点默认使用 HTTP。请在可信局域网使用；公网访问应由可信反向代理提供 HTTPS，并阻止外部直接访问后端端口。

## 本地开发

需要 Node.js 24 和 pnpm 11：

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 使用浏览器本地开发数据。测试完整 SQLite 服务：

```powershell
pnpm build
pnpm preview:sqlite
```

然后访问 `http://127.0.0.1:8788`。预览数据库保存在 `.local/preview.sqlite`，不得提交真实笔记、数据库或环境配置。

## 验证

```powershell
pnpm check
pnpm test
pnpm build
```

自动化测试覆盖 SQLite API、账号隔离、保存冲突、书签、编辑器、更新代理和 iStoreOS 安装包结构。LuCI、端口转发、桌面浏览器和手机实机仍需在目标设备上验收。

## 文档

| 文档 | 用途 |
|---|---|
| [需求与边界](docs/requirements.md) | 产品功能、非目标和验收要求 |
| [架构说明](docs/architecture.md) | 前后端、鉴权、数据保存和更新机制 |
| [部署指南](docs/deployment.md) | iStoreOS、通用 Docker、迁移、更新和诊断 |
| [验证说明](docs/verification.md) | 自动化范围与设备验收清单 |
| [Docker Hub 说明](docs/dockerhub-overview.md) | 镜像 Overview 文案与容器参数 |
| [iStoreOS 打包说明](packaging/istoreos/README.md) | `.run` 内容、维护者构建和发布关系 |

原始设计基线保存在 `private_wiki_prototype.html`。正式入口是 `index.html`，实现代码位于 `src/` 和 `server/`。
