# 栖点 QiDian

栖点是通过 Docker 自托管的个人知识库，用于管理笔记、网页摘录和书签，数据保存在自己的设备上。

## 功能

- 富文本编辑、Markdown 粘贴、表格、代码块、图片和附件。
- 分组书签、搜索、批量整理及 HTML 导入导出。
- SQLite 持久化、历史恢复、回收站和 ZIP 备份。
- 账号隔离、多设备同步、编辑冲突保护。
- 桌面与手机界面，支持浅色、深色和跟随系统主题。

## 安装

| 设备环境 | 安装方式 |
|---|---|
| iStoreOS 24.10 / 25.12 | 从[最新 Release](https://github.com/luckyalanzhou/qidian/releases/latest)下载 `栖点-<版本>.run`，在 iStore“手动安装”上传 |
| 兼容的 OpenWrt | 下载相同 `.run`，在设备终端以 root 校验并执行 |
| Linux、NAS、服务器 | 使用下方 Docker Compose 命令启动 |

iStoreOS / OpenWrt 需要 Docker、Docker Compose、UCI、LuCI CBI 和 `jsonfilter`。安装 `.run` 后进入 **服务 → 栖点知识库**，点击 **安装 / 更新**。镜像支持 `amd64`、`arm64`；校验及部署步骤见[部署指南](docs/deployment.md)。

### Docker Compose

需要 Docker Engine、Docker Compose 插件和 Git：

```sh
git clone --depth 1 https://github.com/luckyalanzhou/qidian.git
cd qidian
cp packaging/docker/env.example packaging/docker/.env
docker compose --env-file packaging/docker/.env -f packaging/docker/compose.yaml up -d
```

启动后访问 `http://<设备地址>:9908`，首次访问创建管理员并设置密码，无默认密码。

## 数据与安全

- LuCI 数据保存在当前 Docker Root Dir 下的 `volumes/qidian/data`；通用 Docker 使用 `qidian-data` 命名卷。
- 更新保留数据；可在账号设置中导出 ZIP 备份。删除数据目录或数据卷会丢失内容。
- 默认使用 HTTP，仅用于可信局域网；公网访问需配置 HTTPS 反向代理并限制直连应用端口。

## 更新

版本说明与 `.run` 安装包见 [GitHub Releases](https://github.com/luckyalanzhou/qidian/releases)，镜像见 [Docker Hub](https://hub.docker.com/r/luckyalanzhou/qidian)。

LuCI 点击 **检查并更新** 可更新管理插件和镜像；支持宿主更新代理的部署也可在 Web 顶部版本入口更新。通用 Docker 使用 Compose 拉取镜像并重建容器，命令见[部署指南](docs/deployment.md#通用-docker-更新)。

## 文档

| 文档 | 内容 |
|---|---|
| [项目组成说明](docs/project-map.md) | 项目分层、目录职责和典型请求流转 |
| [部署指南](docs/deployment.md) | OpenWrt、iStoreOS、Docker 安装、迁移、更新和诊断 |
| [架构说明](docs/architecture.md) | 前后端、鉴权、数据保存与更新机制 |
| [需求与边界](docs/requirements.md) | 产品功能、隐私边界和验收要求 |
| [验证说明](docs/verification.md) | 自动化验证范围与设备验收清单 |
| [Docker Hub 镜像说明](docs/dockerhub-overview.md) | 镜像参数和容器配置 |
| [iStoreOS / OpenWrt 安装包说明](packaging/istoreos/README.md) | `.run` 的安装、构建与发布流程 |

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
