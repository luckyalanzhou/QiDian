# 栖点 · QiDian

面向个人使用的 Docker 私人知识库，集中管理笔记、命令、网页摘录、图片、附件和网址书签。数据保存在自己的 Docker 卷中。

## 镜像

```text
docker.io/luckyalanzhou/qidian
```

| 标签 | 用途 |
|---|---|
| `latest` | 最新稳定版本，适合新安装和常规更新 |
| `<版本号>` | 与 GitHub Release 对应，用于固定版本或回滚 |

支持架构：

- `linux/amd64`
- `linux/arm64`

## Docker Compose

仓库提供 [`packaging/docker/compose.yaml`](https://github.com/luckyalanzhou/qidian/blob/main/packaging/docker/compose.yaml)。

```sh
git clone https://github.com/luckyalanzhou/qidian.git
cd qidian
cp packaging/docker/env.example packaging/docker/.env
docker compose --env-file packaging/docker/.env -f packaging/docker/compose.yaml up -d
```

默认访问：

```text
http://设备地址:9908
```

## 直接运行

```sh
docker volume create qidian-data

docker run -d \
  --name qidian \
  --restart unless-stopped \
  --init \
  -p 9908:9908 \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e DATA_DIR=/data \
  -e REGISTRATION_ENABLED=false \
  -e TRUST_PROXY=false \
  -v qidian-data:/data \
  docker.io/luckyalanzhou/qidian:latest
```

## 首次使用

第一次打开时创建管理员。用户名预填 `admin`，密码必须自行设置，镜像没有默认密码。首个管理员创建完成后注册入口默认关闭。

设备管理员重置密码：

```sh
docker exec -it qidian node server/reset-password.mjs
```

按提示输入账号，再输入 `Y` 确认重置或 `N` 取消，然后输入两次新密码。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| 容器端口 | `9908` | 固定端口，不读取 `PORT` 环境变量 |
| `HOST` | `0.0.0.0` | 容器监听地址 |
| `DATA_DIR` | `/data` | SQLite、附件和迁移备份目录 |
| `STATIC_DIR` | `/app/dist` | 前端静态文件目录 |
| `MIGRATIONS_DIR` | `/app/migrations` | SQLite 迁移目录 |
| `REGISTRATION_ENABLED` | `false` | 管理员创建后是否允许其他账号注册 |
| `TRUST_PROXY` | `false` | 是否信任反向代理转发头 |
| `TRUSTED_PROXY_IPS` | 空 | 允许提供转发头的直接代理 IP，多个地址以英文逗号分隔 |
| `QIDIAN_VERSION` | 构建时写入 | 页面和 API 显示的镜像版本 |

不要把 `DATA_DIR` 指向容器临时目录。必须挂载命名卷或宿主持久化目录。

## 数据与安全

- 数据库、账号、笔记、书签和附件都保存在 `/data`。
- 容器重建不会删除已挂载的数据卷。
- 默认 HTTP 只适合可信局域网；公网访问请使用 HTTPS 反向代理。
- 设置 `TRUST_PROXY=true` 时，应同时填写 `TRUSTED_PROXY_IPS`，并确保外部不能绕过代理直接访问容器。
- 栖点不向 GitHub 或 Docker Hub上传知识库内容；它们只用于版本元数据、镜像和安装包分发。

备份时应同时在 Web 导出完整 ZIP，并复制 Docker 卷。

## 更新与回滚

更新：

```sh
docker compose --env-file packaging/docker/.env -f packaging/docker/compose.yaml pull
docker compose --env-file packaging/docker/.env -f packaging/docker/compose.yaml up -d
```

回滚时把 `QIDIAN_IMAGE` 改为需要的版本标签，再执行同样命令。数据库迁移会在启动前创建副本，但回滚跨越数据库结构版本前仍应先备份完整数据卷。

## 健康检查

```sh
curl http://127.0.0.1:9908/healthz
curl http://127.0.0.1:9908/readyz
docker logs --tail=100 qidian
```

`/healthz` 返回 `ok` 表示 HTTP 服务已启动；`/readyz` 返回 `ready` 表示 SQLite 可读取。实际验收还应登录并检查笔记、书签和附件。

## 链接

- [GitHub 仓库](https://github.com/luckyalanzhou/qidian)
- [最新 Release](https://github.com/luckyalanzhou/qidian/releases/latest)
- [完整部署指南](https://github.com/luckyalanzhou/qidian/blob/main/docs/deployment.md)
