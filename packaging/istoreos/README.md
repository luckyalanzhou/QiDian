# 栖点 iStoreOS 安装包

本目录用于生成适配 iStoreOS 软件商店手动安装的自解压 `.run`。安装包不包含应用镜像，也不在路由器上编译 Node.js 项目。

## 安装包内容

- `compose.yaml`：iStoreOS 容器配置。
- `.env.example`：首次部署模板。
- `install.sh`：安装和升级入口。
- `luci-app-qidian/`：LuCI 控制器、页面、服务脚本和更新代理。
- 构建时生成的 `version`：与 `package.json` 一致。

安装后文件主要位于：

```text
/opt/qidian/                         Compose 与环境配置
/etc/config/qidian                  LuCI 配置
/etc/init.d/qidian-updater          宿主更新代理
/usr/libexec/istorec/qidian.sh      部署管理脚本
/usr/libexec/istorec/qidian-updater.sh
```

知识库数据不放在 `/opt/qidian`。首次部署时管理脚本读取当前设备 `DockerRootDir`，使用其 `volumes/qidian/data` 目录，并将实际绝对路径写入 `/opt/qidian/.env`。

## 用户安装

1. 从[最新 Release](https://github.com/luckyalanzhou/qidian/releases/latest)下载 `栖点-<版本>.run` 和 `.sha256`。
2. 在 iStore 软件商店选择手动安装并上传 `.run`。
3. 打开 **服务 → 栖点知识库**。
4. 确认 Docker、Compose、端口和数据目录后点击 **安装 / 更新**。
5. 等待实时日志显示容器健康，再打开 Web 创建管理员。

默认端口是 HTTP 9908。首次管理员名称预填 `admin`，没有默认密码。

完整使用说明见 [`docs/deployment.md`](../../docs/deployment.md)。

## 维护者本地构建

需要 Node.js 和 Bash：

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm package:istoreos
```

输出目录：

```text
artifacts/istoreos/qidian-<版本>.run
artifacts/istoreos/qidian-<版本>.run.sha256
```

`build-run.sh` 会检查版本号，复制 LuCI 与管理脚本载荷，再生成带 SHA-256 和 MD5 自校验的 makeself 安装包。

## 正式发布

GitHub Actions 工作流 `iStoreOS Docker release` 只能手动触发。流程会：

1. 运行 `pnpm check`、`pnpm test` 和 `pnpm build`。
2. 以 `package.json` 为唯一版本来源；基准为 `0.0.0`，首次发布为 `0.0.1`。版本采用无固定上限的 `Major.Minor.Patch` 整数格式，不使用前导零。
3. 构建容器并进行健康检查。
4. 构建并推送 `linux/amd64`、`linux/arm64` Docker Hub 镜像，同时更新版本标签和 `latest`。
5. 构建 `.run` 与 SHA-256 校验文件，Release 内仅发布 `栖点-<版本>.run` 和 `栖点-<版本>.run.sha256`。
6. 把版本更新提交到 `main`。
7. 创建草稿 Release，校验安装包和校验文件齐全后发布；失败重跑会恢复同一版本。Release 按编号生成本版优化说明。

工作流需要仓库 Secrets `DOCKERHUB_TOKEN` 和 `RELEASE_PUBLISH_TOKEN`。Docker Hub 用户名已固定为 `luckyalanzhou`，无需另设用户名 Secret。

普通推送到 `main` 不会自动发布；只有手动运行工作流才会构建新镜像和 Release。
工作流默认递增 Patch；发布时可选择 Minor 或 Major。仅修复兼容性问题时递增 Patch，增加向后兼容功能时递增 Minor 并将 Patch 归零，出现不兼容变更时递增 Major 并将 Minor 与 Patch 归零。

## 更新机制

Web 在线更新只向请求目录写入固定任务文件。宿主代理从固定仓库下载版本化 `.run` 和 `.sha256`，校验后执行安装包，再等待 10 秒拉取 Docker Hub 镜像并重启服务。容器不挂载 Docker Socket。

LuCI 手动安装/更新与 Web 在线更新共用操作锁，避免同时重建容器。日志和状态位于该设备数据目录下的 `.qidian-update-control`，不会写入开发者路径。

## 密码重置

```sh
docker exec -it qidian node server/reset-password.mjs
```

运行后按提示选择账号，输入 `Y` 确认重置或 `N` 取消，再输入两次新密码。LuCI 只显示并复制这条命令，不读取或保存密码。

## 升级与卸载约束

- 升级保留 `/opt/qidian/.env`、LuCI 配置和 Docker 数据目录。
- 设备数据路径与已配置路径不一致时停止部署。
- 卸载管理包或容器不得自动删除知识库。
- 数据目录只能由用户在完成备份后明确删除。
