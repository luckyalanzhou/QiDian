# 栖点 iStoreOS / OpenWrt 安装包

此目录维护 iStoreOS 24.10 / 25.12 与兼容 OpenWrt 设备共用的 `.run` 自解压安装器。GitHub Release 只发布 `.run` 及 SHA-256 校验文件；不构建或发布 `.ipk`、`.apk`。安装包只包含 LuCI 页面、Compose 配置和设备管理脚本，不包含应用镜像，也不在路由器上编译 Node.js 项目。

## 用户安装

1. 从[最新 Release](https://github.com/luckyalanzhou/qidian/releases/latest)下载 `栖点-<版本>.run` 与 `栖点-<版本>.run.sha256`。
2. iStoreOS 在软件商店选择“手动安装”并上传 `.run`；OpenWrt 将两个文件上传到设备并按下方命令校验、执行。
3. 打开 **服务 → 栖点知识库**。
4. 确认 Docker、Compose、端口和数据目录后点击 **部署服务**。
5. 等待实时日志显示容器已启动，再打开 Web 创建管理员。

## LuCI 检查更新

在服务概览的版本信息旁点击 **检查并更新**。LuCI 会分别比较管理插件和当前 Docker 镜像的版本，只更新落后的组件；两者都有更新时会在同一任务中完成。管理插件安装包会先通过 SHA-256 校验。镜像更新会重建容器并保留数据目录；如果容器原本停止，更新后仍保持停止。进度可在 **日志**页查看。

安装需要 UCI、LuCI CBI、`jsonfilter`、Docker 和 Docker Compose。默认端口为 HTTP 9908。首次管理员名称预填 `admin`，没有默认密码。首次部署时管理脚本读取当前设备 Docker Root Dir，将知识库保存在其 `volumes/qidian/data` 目录。

OpenWrt 的终端安装命令：

```sh
sha256sum -c '栖点-<版本>.run.sha256'
sh '栖点-<版本>.run'
```

## 包含文件

- `compose.yaml` 与 `.env.example`：容器配置和首次部署模板。
- `install.sh`：安装或升级入口；保留已有 `.env`、LuCI 配置和知识库数据。
- `luci-app-qidian/root/`：LuCI 页面、服务管理脚本和受限更新代理。
- 构建时生成的 `version`：与 `package.json` 当前版本一致。

## 正式发布

GitHub Actions 工作流 `iStoreOS Docker release` 只能手动触发：

1. 运行 `pnpm check`、`pnpm test` 和 `pnpm build`。
2. 以 `package.json` 为唯一版本来源，默认递增 Patch，也可按兼容性选择 Minor 或 Major。
3. 构建并健康检查 Docker 容器，然后推送 `linux/amd64` 和 `linux/arm64` 镜像的版本标签与 `latest`。
4. 构建 `.run`，验证归档自检和 SHA-256。
5. 将版本更新提交到 `main`，在 GitHub Release 发布 `.run` 与校验文件。

发布需要仓库 Secrets `DOCKERHUB_TOKEN` 和 `RELEASE_PUBLISH_TOKEN`。普通推送到 `main` 不会触发发布。

## Web 在线更新

宿主更新代理从固定仓库下载版本化 `.run` 与 SHA-256，校验通过后安装 LuCI 和管理文件；随后等待 10 秒，拉取适合设备架构的 Docker Hub 镜像并重启服务。容器不挂载 Docker Socket。LuCI 手动安装和 Web 在线更新共用设备操作锁。

## 管理员密码重置

```sh
docker exec -it qidian node server/reset-password.mjs
```

按提示输入账号名，输入 `Y` 确认或 `N` 取消，再输入两次新密码。LuCI 只显示并复制命令，不读取或保存密码。

## 数据保留

- 升级保留 `/opt/qidian/.env`、`/etc/config/qidian` 和 Docker 数据目录。
- 设备数据路径与已有配置不一致时，部署会停止以避免启动空知识库。
- 卸载容器或管理界面不会自动删除知识库数据；删除数据目录前请先完成备份。
