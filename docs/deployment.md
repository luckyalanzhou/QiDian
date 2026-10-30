# 部署指南

栖点是本地 Docker 服务，默认监听 HTTP 9908。iStoreOS 24.10、25.12 和兼容的 OpenWrt 使用同一种 `.run` 安装包；iStoreOS 从 iStore“手动安装”上传，OpenWrt 由 root 在终端执行。安装器自动部署，LuCI 提供后续管理。其他 Linux、NAS 和服务器使用 Docker Compose。

## 部署方式

| 环境 | 应用来源 | 数据位置 | 更新方式 |
|---|---|---|---|
| iStoreOS 24.10 / 25.12 | GitHub Release 的 `.run` + Docker Hub 镜像 | 当前设备 Docker Root Dir 下 `volumes/qidian/data` | Web 在线更新或 iStore“手动安装” `.run` |
| OpenWrt 24.10 / 25.12 | GitHub Release 的 `.run` + Docker Hub 镜像 | 当前设备 Docker Root Dir 下 `volumes/qidian/data` | Web 在线更新或 root 终端执行 `.run` |
| 通用 Docker | Docker Hub 镜像 | `qidian-data` 命名卷 | Compose 拉取并重建 |

## 发布产物

GitHub Actions 的 `iStoreOS Docker verification and release` 工作流会在发往 `main` 的 Pull Request 上运行源码检查和容器 smoke test；手动 `workflow_dispatch` 始终执行正式发布。每次成功的发布只提供 `.run` 管理安装包及 SHA-256 校验文件：

- iStoreOS / OpenWrt：`栖点-<版本>.run`

普通推送到 `main` 不会触发发布构建。该工作流先构建并推送固定版本的多架构 Docker 镜像，校验并公开 GitHub Release 后再将该版本提升为 `latest`；安装包本身不包含应用镜像。

镜像支持 `linux/amd64` 和 `linux/arm64`，Docker 会自动选择当前设备架构。设备无需安装 Node.js、pnpm，也不会在设备上构建前端。

本地运行自托管服务需 Node.js 22.13 或更高版本；服务端使用内置 `node:sqlite` 模块。该 API 从 Node.js 22.5 提供，并从 22.13 起无需 `--experimental-sqlite` 参数；Node 22 中仍标记为实验功能。项目镜像使用 Node 24，该 API 从 24.15 起标记为 Release Candidate。[Node.js 22 SQLite 文档](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html)、[Node.js 24 SQLite 文档](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)

## iStoreOS 与 OpenWrt 安装

iStoreOS 24.10 与 25.12 都通过 iStore“手动安装”使用同一 `.run` 包。OpenWrt 使用同一个安装包，在设备终端以 root 执行。自解压安装器直接部署 LuCI 文件，不调用 `opkg` 或 `apk`。

### 准备

1. 在 iStoreOS 中安装并启动 Docker，并确保 Docker Compose 可用（支持 `docker compose` 或 `docker-compose`）。
2. `.run` 安装器要求系统提供 UCI、LuCI CBI 和 `jsonfilter`；标准 iStoreOS 通常已具备这些组件。
3. 确认设备可以访问 GitHub Release 和 Docker Hub。
4. 确认 Docker Root Dir 所在磁盘有足够空间。

### iStoreOS 安装步骤

1. 打开[最新 Release](https://github.com/luckyalanzhou/qidian/releases/latest)，下载 `栖点-<版本>.run` 和对应的 `.sha256`。
2. 在 iStore 软件商店进入 **手动安装**，上传 `.run` 文件。
3. 安装器自动拉取对应版本镜像并部署；升级保留配置、数据和原来的启停状态。
4. 完成后进入 **服务 → 栖点知识库**，点击 **打开栖点**。
5. 首次访问创建管理员，名称预填 `admin`，密码自行设置，无默认密码。

部署失败时，在 LuCI **日志**页查看原因，解决后点击 **重试部署**。正常状态不显示部署按钮和依赖就绪提示。修改端口、注册或反代设置后，点击 **保存并应用**即可应用到容器，无需重新拉取镜像。

### OpenWrt 安装步骤

设备须已安装 UCI、LuCI CBI、`jsonfilter`、Docker 和 Docker Compose。将 Release 的 `.run` 与同名 `.sha256` 上传到设备后，以 root 执行：

```sh
sha256sum -c '栖点-<版本>.run.sha256'
sh '栖点-<版本>.run'
```

安装器会自动部署 Docker 容器；完成后在 LuCI **服务 → 栖点知识库**查看状态。

LuCI 每次部署都会读取当前设备的 Docker Root Dir。若已有 `.env` 指向另一数据目录，脚本会停止并提示，避免误启动一个空知识库。

## 通用 Docker 安装

需要 Docker Engine、Docker Compose 插件和 Git：

```sh
git clone https://github.com/luckyalanzhou/qidian.git
cd qidian
cp packaging/docker/env.example packaging/docker/.env
```

可编辑 `packaging/docker/.env`：

```dotenv
APP_BIND_ADDRESS=0.0.0.0
REGISTRATION_ENABLED=false
TRUST_PROXY=false
TRUSTED_PROXY_IPS=
QIDIAN_IMAGE=docker.io/luckyalanzhou/qidian:latest
```

服务固定监听并映射设备 TCP 端口 `9908`。

启动服务：

```sh
docker compose --env-file packaging/docker/.env -f packaging/docker/compose.yaml pull
docker compose --env-file packaging/docker/.env -f packaging/docker/compose.yaml up -d
docker compose --env-file packaging/docker/.env -f packaging/docker/compose.yaml ps
```

浏览器访问 `http://<设备地址>:9908`。查看数据卷实际位置：

```sh
docker volume inspect qidian-data
```

删除容器不会删除命名卷；执行 `docker volume rm qidian-data` 会永久删除知识库。

容量提醒按 `/data` 所在文件系统统计。在 Linux 与 iStoreOS 上，Docker 命名卷位于 Docker Root Dir 下，提醒反映该目录所在文件系统的使用率；该文件系统是否是额外挂载的数据盘，取决于 Docker Root Dir 的配置。在 Windows Docker Desktop 上，默认命名卷位于 Linux 虚拟机磁盘，提醒不代表 Windows 盘剩余空间。若需要按 Windows 盘统计，需将 `/data` 绑定到该盘上的目录；更改现有实例挂载前，应先备份并迁移数据。

## 局域网与公网访问

局域网可直接使用：

```text
http://设备局域网地址:9908
```

HTTP 不加密账号和内容，只应在可信网络使用。路由器端口转发由设备网络环境决定，栖点不会自动配置防火墙、DDNS 或 UPnP。

公网访问建议在可信边界部署 HTTPS 反向代理，并在环境文件设置：

```dotenv
TRUST_PROXY=true
TRUSTED_PROXY_IPS=127.0.0.1
```

`TRUSTED_PROXY_IPS` 填写直接连接容器的反向代理 IP，多个地址以英文逗号分隔。反向代理须正确设置 `X-Forwarded-Proto`、`X-Forwarded-Host`、`X-Forwarded-For`，并禁止公网绕过代理直接访问 9908。启用 `TRUST_PROXY` 却未填写有效 IP 时，服务会在打开数据库前拒绝启动。局域网地址和域名都可以登录，但同一浏览器会按不同站点分别保存 Cookie。

iStoreOS LuCI 可在 **基本设置** 中启用 **信任反向代理**，并填写直接连接栖点容器的代理 IP。点击 **保存并应用** 后，LuCI 会应用 UCI 配置并重建栖点容器；仅保存不会重建容器，也不会拉取新镜像。默认关闭；未使用反向代理时保持关闭即可。LuCI 当前仅接受一个代理 IP。

## 注册和密码

首个管理员创建后默认禁止继续注册。需要新增账号时：

- iStoreOS：在 LuCI 勾选 **允许创建其他账号**，点击 **保存并应用**。
- 通用 Docker：把 `.env` 中 `REGISTRATION_ENABLED` 改为 `true`，再重建容器。

创建完成后建议重新关闭。账号名和密码是唯一登录凭据。

设备管理员重置密码：

```sh
docker exec -it qidian node server/reset-password.mjs
```

按照提示输入账号名，输入 `Y` 确认重置或 `N` 取消，再输入两次新密码。密码不回显。重置完成后已有会话、该账号未使用的浏览器扩展配对码和已签发令牌会失效；若该账号启用了两步验证，管理员重置也会关闭两步验证并清除恢复码，但不会删除知识库数据。扩展需重新配对。

可选两步验证默认关闭，可在 **个人资料 → 两步验证** 中设置。自托管实例在首次发起两步验证绑定时，按需在持久化数据目录创建 `totp-encryption.key`，用于加密 SQLite 中的身份验证器密钥。保留该文件并与数据库一起纳入设备级备份；栖点知识库导出包不包含此安装密钥。若密钥损坏或丢失，用户仍可用一次性恢复码登录并关闭两步验证；也可由设备管理员重置该账号密码。不要通过删除密钥文件生成新密钥。

## 更新

### LuCI 更新

在 **服务 → 栖点知识库**的服务概览中，点击版本旁的 **检查更新**。LuCI 会分别比较已安装管理插件和当前容器镜像与最新 Release 的版本，只更新落后的部分；两者都需要更新时会在同一任务里完成。插件安装包通过 SHA-256 校验后才执行，镜像更新会保留 Docker 数据目录。原本停止的容器更新后仍保持停止。查看 **日志**页可跟踪结果。

Web 和 LuCI 在线更新使用 `latest` 镜像，替换容器前校验版本；若 `latest` 尚未同步到目标 Release，保留现有容器并提示稍后重试。

### LuCI Web 在线更新

若 Web 提示“设备端在线更新服务未就绪”，先在 iStoreOS 的软件包管理器安装或更新一次栖点管理组件，确保宿主更新代理已启动；之后可继续从 Web 在线更新管理组件和容器镜像。也可从 Release 手动安装当前 `.run` 完成首次部署。在线更新不依赖设备采用 opkg 还是 apk。

1. 登录栖点，点击顶栏版本号。
2. 确认当前版本、最新版本和 Release 说明。
3. 点击 **检查并更新**。
4. Web 先确认当前编辑已经写入 SQLite，再提交更新任务。
5. 宿主代理下载带版本号的 `.run` 与 SHA-256 校验文件，校验后更新管理文件。
6. 设备等待 10 秒，然后拉取镜像并重建容器。
7. Web 持续显示实时日志；目标版本健康后倒计时 5 秒并自动刷新。

更新期间不要重复点击，也不要关闭设备电源。失败时保留日志和重试按钮；也可回到 LuCI 或设备软件包管理器手动安装对应版本。

LuCI 部署与更新、Web 在线更新均会在新容器健康检查通过后清理本次替换下来的栖点旧镜像。其他容器仍在引用、存在其他应用标签或无法确认归属的镜像会保留；更新失败或容器保持停止时也会保留旧镜像。清理不涉及数据卷、知识库目录、附件、配置和备份，不执行全局 Docker 资源清理。需要回退时可重新拉取对应的版本镜像。

### 通用 Docker 更新

```sh
git pull --ff-only
docker compose --env-file packaging/docker/.env -f packaging/docker/compose.yaml pull
docker compose --env-file packaging/docker/.env -f packaging/docker/compose.yaml up -d
```

需要固定版本时，将 `QIDIAN_IMAGE` 从 `latest` 改为明确版本，例如 `docker.io/luckyalanzhou/qidian:0.0.1`，再重新拉取和启动。

## 数据备份与迁移

更新前建议完成两份备份：

1. 在 Web 设置中导出完整 ZIP。
2. 停止容器后复制整个 Docker 数据目录或命名卷。

iStoreOS 迁移到新设备：

1. 在旧设备停止栖点并复制完整 `volumes/qidian/data`。
2. 在新设备安装 `.run`，让 LuCI 显示新设备的数据目录。
3. 停止新设备容器，把旧数据复制到新目录并保持文件权限可读写。
4. 在 LuCI 点击 **启动服务**并检查日志。
5. 登录后核对笔记、书签、附件和历史，再保留旧设备备份。

不要直接复制旧设备 `/opt/qidian/.env`，其中包含旧宿主绝对路径。

## 日志与诊断

在 LuCI 栖点页面打开 **日志**，操作期间自动刷新最近 64 KiB 输出。终端检查：

```sh
cd /opt/qidian
docker compose ps
docker compose logs --tail=100 qidian
curl http://127.0.0.1:9908/healthz
curl http://127.0.0.1:9908/readyz
cat /etc/qidian-version
docker exec qidian printenv QIDIAN_VERSION
```

通用 Docker：

```sh
docker compose --env-file packaging/docker/.env -f packaging/docker/compose.yaml ps
docker compose --env-file packaging/docker/.env -f packaging/docker/compose.yaml logs --tail=100 qidian
curl http://127.0.0.1:9908/healthz
curl http://127.0.0.1:9908/readyz
```

`/healthz` 返回 `ok` 只表示 HTTP 服务存活；`/readyz` 返回 `ready` 表示服务可以读取 SQLite。还应登录并检查附件下载和实际页面版本。

## 卸载

卸载前建议先导出 ZIP 并复制数据目录。

- LuCI 的 **卸载容器** 只移除 Docker 容器，不会卸载管理界面，也会保留 Docker 数据目录中的知识库数据。
- `.run` 安装器目前没有配套的卸载命令；不要把卸载容器当成卸载 `.run` 管理文件。
- 删除 Docker 数据目录或 `qidian-data` 卷会删除其中的知识库数据。重新安装时应确认 LuCI 显示的数据路径与原知识库一致。
