# 栖点 QiDian

栖点是一款自托管的个人知识库，通过 Docker 在自己的设备上运行，用来保存和整理笔记、网页摘录、图片、附件与网址书签。数据保存在设备的 Docker 数据目录或命名卷中。

## 功能

- 富文本笔记，支持 Markdown、表格、代码块、图片、附件、提示块和折叠内容。
- 网页摘录与网址书签，保留书签文件夹层级，支持 HTML 导入导出、搜索、整理和批量操作。
- Docker 服务端使用 SQLite 持久化数据，支持正文历史、回收站、自动快照和完整 ZIP 备份。
- 账号登录、多设备数据同步、并发修改检测及冲突保护。
- 桌面与手机适配，支持浅色、深色和跟随系统主题；偏好设置按账号同步。
- iStoreOS 与兼容的 OpenWrt 提供 LuCI 管理界面，可部署、更新 Docker 服务并查看操作日志。

## 安装

栖点应用运行在 Docker 容器中。iStoreOS 和兼容的 OpenWrt 使用 `.run` 自解压安装管理界面；其他 Linux、NAS 和服务器可直接使用 Docker Compose。

| 设备环境 | 安装方式 |
|---|---|
| iStoreOS 24.10 / 25.12 | 从[最新 Release](https://github.com/luckyalanzhou/qidian/releases/latest)下载 `栖点-<版本>.run`，在 iStore“手动安装”上传 |
| OpenWrt 24.10 / 25.12 | 下载相同 `.run`，在设备终端以 root 校验并执行 |
| Linux、NAS、服务器 | 使用下方 Docker Compose 命令启动 |

发布只提供 `.run` 自解压安装包及其 SHA-256 校验文件。iStoreOS 24.10 与 25.12 均通过 iStore“手动安装”使用，不受系统底层采用 opkg 或 apk 的影响；OpenWrt 设备可从终端执行同一个 `.run`。

OpenWrt 和 iStoreOS 的设备端需要预先安装并启动 Docker、Docker Compose、LuCI 和 `jsonfilter`。安装包只提供管理界面与设备脚本；Docker 会拉取适合设备架构的应用镜像。应用镜像支持 `amd64` 和 `arm64`。完整步骤、SHA-256 校验命令和数据迁移说明见[部署指南](docs/deployment.md)。

### Docker Compose 示例

需要 Docker Engine、Docker Compose 插件和 Git：

```sh
git clone --depth 1 https://github.com/luckyalanzhou/qidian.git
cd qidian
cp packaging/docker/env.example packaging/docker/.env
docker compose --env-file packaging/docker/.env -f packaging/docker/compose.yaml up -d
```

启动后访问 `http://<设备地址>:9908`。首次使用时创建管理员账号并自行设置密码；系统没有默认密码。通用 Docker 部署使用 `qidian-data` 命名卷保存数据。

## 数据与安全

- LuCI 部署会读取设备当前的 Docker Root Dir，并在其 `volumes/qidian/data` 下保存知识库数据。
- 容器重建和应用更新会保留数据。可在账号设置中导出完整 ZIP 备份；删除 Docker 数据卷会永久删除其中内容。
- 默认使用 HTTP，建议仅在可信局域网访问。需要从公网访问时，应配置 HTTPS 反向代理，并阻止外部直接访问应用端口。

## 版本与兼容性

- Docker Hub 提供 [`luckyalanzhou/qidian`](https://hub.docker.com/r/luckyalanzhou/qidian) 镜像，支持 `linux/amd64` 和 `linux/arm64`。
- iStoreOS 管理界面仅提供 `.run` 自解压安装包；应用容器镜像支持 iStoreOS 24.10 / 25.12 所需的 Docker 平台架构。
- 每次成功的手动发布会在同一 GitHub Release 提供 `.run` 和 SHA-256 校验文件。工作流先发布固定版本的多架构镜像，确认 Release 已公开后再把该版本提升为 `latest`；普通推送到 `main` 不会触发发布。
- 发布版本号以 `package.json` 为准；当前版本、历史版本、版本说明和下载文件见 [GitHub Releases](https://github.com/luckyalanzhou/qidian/releases)。Web 在线更新统一下载 `.run` 管理安装包。
- LuCI 部署页可分别检查并更新管理插件与 Docker 镜像；两者都有更新时会在同一任务中完成。

## 本地开发

需要 Node.js 24 和 pnpm 11：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

运行测试、语法检查和生产构建：

```sh
pnpm test
pnpm check
pnpm build
```

`pnpm dev` 使用浏览器本地开发数据。需要验证完整 SQLite 服务时，可运行 `pnpm build` 后执行 `pnpm preview:sqlite`。本地预览数据库位于 `.local/preview.sqlite`，不要提交真实笔记、数据库或环境配置。

## 文档

| 文档 | 内容 |
|---|---|
| [部署指南](docs/deployment.md) | OpenWrt、iStoreOS、Docker 安装、迁移、更新和诊断 |
| [架构说明](docs/architecture.md) | 前后端、鉴权、数据保存与更新机制 |
| [需求与边界](docs/requirements.md) | 产品功能、隐私边界和验收要求 |
| [验证说明](docs/verification.md) | 自动化验证范围与设备验收清单 |
| [Docker Hub 镜像说明](docs/dockerhub-overview.md) | 镜像参数和容器配置 |
| [iStoreOS / OpenWrt 安装包说明](packaging/istoreos/README.md) | `.run` 的安装、构建与发布流程 |

## 许可证

仓库当前未提供 `LICENSE` 文件，也未声明开源许可证。若需复用或再分发本项目，请先确认并取得相应授权。
