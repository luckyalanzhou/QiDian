# 部署指南

栖点是本地 Docker 服务，默认监听 HTTP 9908。iStoreOS 使用 `.run` 和 LuCI 管理；其他 Linux、NAS 和服务器使用标准 Docker Compose。

## 部署方式

| 环境 | 应用来源 | 数据位置 | 更新方式 |
|---|---|---|---|
| iStoreOS | GitHub Release 的 `.run` + Docker Hub 镜像 | 当前设备 Docker Root Dir 下 `volumes/qidian/data` | Web 在线更新或 LuCI 安装/更新 |
| 通用 Docker | Docker Hub 镜像 | `qidian-data` 命名卷 | Compose 拉取并重建 |

镜像支持 `linux/amd64` 和 `linux/arm64`，Docker 会自动选择当前设备架构。设备无需安装 Node.js、pnpm，也不会在设备上构建前端。

## iStoreOS 安装

### 准备

1. 在 iStoreOS 中安装并启动 Docker。
2. 确认设备可以访问 GitHub Release 和 Docker Hub。
3. 确认用于 Docker Root Dir 的磁盘有足够空间。

### 安装步骤

1. 打开[最新 Release](https://github.com/luckyalanzhou/qidian/releases/latest)，下载 `栖点-<版本>.run` 和对应的 `.sha256`。
2. 在 iStore 软件商店进入 **手动安装**，上传 `.run` 文件。
3. 安装完成后进入 **服务 → 栖点知识库**。
4. 检查页面显示的 Docker 状态、端口和数据目录。
5. 点击 **安装 / 更新**，在弹窗中等待实时日志显示服务已启动。
6. 点击 **打开栖点并创建管理员**。
7. 管理员名称默认填入 `admin`，可自行修改；密码必须现场设置，系统没有默认密码。

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
APP_PORT=9908
REGISTRATION_ENABLED=false
TRUST_PROXY=false
QIDIAN_IMAGE=docker.io/luckyalanzhou/qidian:latest
```

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

## 局域网与公网访问

局域网可直接使用：

```text
http://设备局域网地址:9908
```

HTTP 不加密账号和内容，只应在可信网络使用。路由器端口转发由设备网络环境决定，栖点不会自动配置防火墙、DDNS 或 UPnP。

公网访问建议在可信边界部署 HTTPS 反向代理，并在环境文件设置：

```dotenv
TRUST_PROXY=true
```

反向代理须正确设置 `X-Forwarded-Proto`、`X-Forwarded-Host`、`X-Forwarded-For`，并禁止公网绕过代理直接访问 9908。局域网地址和域名都可以登录，但同一浏览器会按不同站点分别保存 Cookie。

## 注册和密码

首个管理员创建后默认禁止继续注册。需要新增账号时：

- iStoreOS：在 LuCI 勾选 **允许创建其他账号**，再执行 **安装 / 更新**。
- 通用 Docker：把 `.env` 中 `REGISTRATION_ENABLED` 改为 `true`，再重建容器。

创建完成后建议重新关闭。账号名和密码是唯一登录凭据。

设备管理员重置密码：

```sh
docker exec -it qidian node server/reset-password.mjs
```

按照提示输入账号名，输入 `Y` 确认重置或 `N` 取消，再输入两次新密码。密码不回显。重置完成后已有会话会失效。

## 更新

### iStoreOS Web 在线更新

版本序号已从旧版 `0.1.x` 重置为 `0.0.0`。现有旧版设备首次迁移时，请先从 Release 手动下载并安装新版 `.run`，再到 LuCI 点击一次 **安装 / 更新**；完成后即可使用 Web 在线更新。

1. 登录栖点，点击顶栏版本号。
2. 确认当前版本、最新版本和 Release 说明。
3. 点击 **检查并更新**。
4. Web 先确认当前编辑已经写入 SQLite，再提交更新任务。
5. 宿主代理下载 `.run` 和 SHA-256，校验后更新管理文件。
6. 设备等待 10 秒，然后拉取镜像并重建容器。
7. Web 持续显示实时日志；目标版本健康后倒计时 5 秒并自动刷新。

更新期间不要重复点击，也不要关闭设备电源。失败时保留日志和重试按钮；也可回到 LuCI 手动安装新版 `.run`。

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
4. 在 LuCI 点击安装/更新并检查日志。
5. 登录后核对笔记、书签、附件和历史，再保留旧设备备份。

不要直接复制旧设备 `/opt/qidian/.env`，其中包含旧宿主绝对路径。

## 日志与诊断

iStoreOS LuCI 的栖点页面内切换 **服务 / 日志**，不离开当前页面；运行中的操作会自动刷新最近 64 KiB 输出。日志面板和部署弹窗跟随 LuCI 当前浅色 / 深色主题。终端检查：

```sh
cd /opt/qidian
docker compose ps
docker compose logs --tail=100 qidian
curl http://127.0.0.1:9908/healthz
cat /etc/qidian-version
docker exec qidian printenv QIDIAN_VERSION
```

通用 Docker：

```sh
docker compose --env-file packaging/docker/.env -f packaging/docker/compose.yaml ps
docker compose --env-file packaging/docker/.env -f packaging/docker/compose.yaml logs --tail=100 qidian
curl http://127.0.0.1:9908/healthz
```

`/healthz` 返回 `ok` 只表示 HTTP 服务存活。还应登录并检查 SQLite 数据、附件下载和实际页面版本。

## 卸载

卸载应用前先导出 ZIP并复制数据目录。

- 删除容器或卸载 `.run` 不应自动删除知识库数据。
- 只有用户明确删除 iStoreOS 数据目录或 `qidian-data` 卷时，数据才会被移除。
- 重新安装时应确认 LuCI 显示的数据路径与原知识库一致。
