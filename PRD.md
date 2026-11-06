# 栖点产品需求文档（PRD）

## 1. 文档范围

本文描述栖点当前产品目标、已实现能力、技术约束与验收标准，供产品和开发工作对齐使用。功能描述以当前代码、测试和部署配置为依据；本文不是未来路线图。

## 2. 产品目标

栖点为个人提供一个可自行部署、由本人管理数据的知识工作区，让用户能在同一处记录笔记、整理网页书签、收集网页内容，并在需要时搜索、恢复和备份资料。

### 目标用户

- 希望自托管个人知识资料的个人用户。
- 需要在桌面和手机上查看、整理笔记与网址的用户。
- 希望通过 Docker 或 iStoreOS 设备部署服务的用户。

### 产品目标

1. 让用户能快速记录和组织结构化或富文本笔记、书签与网页摘录。
2. 让个人资料能通过搜索、分类、标签和书签分组被再次找到。
3. 让数据保存在自托管服务的 SQLite 存储中，并提供备份、恢复和数据迁移路径。
4. 通过账号认证保护私有知识库、附件与备份访问。
5. 保持轻量部署，支持 Docker 与 iStoreOS 发布方式。

## 3. 产品边界

### 包含

- 个人知识管理，不依赖公开内容平台。
- 笔记、书签、网页摘录及其附件、分类、标签和分组。
- 搜索、导航、回收站、账户设置、备份与恢复。
- 自托管服务、SQLite 数据存储、Docker 和 iStoreOS 发布。
- 桌面侧栏、手机底部导航、深浅主题及现有内容类型。

### 不包含

- 公开分享或公开内容页面。
- 多人协作、组织空间或邀请成员。
- 付费订阅或商业计费。
- 将 SQLite 替换为其他数据库、增加重型前端框架或 UI 依赖。
- 未经产品明确决策的路线图能力。

## 4. 核心功能与用户流程

### 4.1 账户与私人空间

用户打开服务后创建首个所有者账号或登录。首次部署可创建首个所有者；注册开关关闭时，不允许之后新增账号。用户可配置个人资料、修改密码、管理会话，并可选择启用基于身份验证器的两步验证和恢复码。

### 4.2 笔记与网页摘录

用户创建、编辑、分类和搜索笔记；可将网页正文或文本通过网页摘录入口保存为笔记。支持的编辑能力包括富文本格式、内容类型及附件。界面以事务成功作为保存完成依据；冲突时提示用户处理，不自动覆盖较新的数据。

### 4.3 书签

用户添加网址、整理文件夹、标记常用书签、搜索书签，并导入或导出浏览器书签 HTML。经用户配对授权的 Chrome 扩展仅用于向当前账号新增书签。

### 4.4 搜索、删除与恢复

全局搜索覆盖笔记和书签。删除的笔记和书签进入回收站，可在保留期内恢复；超过保留期的项目会被清理。当前界面标示的保留期为 30 天。

### 4.5 备份、恢复与迁移

用户可导出包含知识库、附件和元数据的完整 ZIP，导入备份，并查看或恢复服务端 SQLite 历史快照。迁移与破坏性操作应保留可恢复副本；版本冲突不得静默覆盖用户数据。

## 5. 技术架构

```text
桌面浏览器 / 手机浏览器 / Chrome 扩展
                  │
             Vue 3 前端
      TypeScript · Pinia · Vite
                  │ HTTP API
       Node.js 自托管 HTTP 服务
                  │
        SQLite 数据库与附件存储
```

### 技术组成

- 前端使用 Vue 3、TypeScript、Pinia 和 Vite；页面按 Pinia 导航状态切换，不引入 Vue Router。
- Node.js 服务负责静态资源、认证、私有 API、附件与备份访问以及自托管系统功能。
- SQLite 是服务端主要持久化数据库；SQL 迁移按顺序执行，迁移前对已有数据库创建备份。
- Docker 使用多阶段构建镜像，持久数据挂载到 `/data`，服务端口为 `9908`。
- iStoreOS 通过 LuCI 配置和 `.run` 发布包管理 Docker 部署与更新。
- Chrome 扩展通过配对授权调用扩展 API 新增书签。

### 项目约束

- 保持个人私有产品定位和轻量自托管形态。
- 不增加新依赖、Tailwind 或第三方 UI 库；样式沿用现有 CSS 变量与受限样式文件。
- 私有 API、附件与备份需要鉴权；生产配置缺失时拒绝访问。
- 只有 SQLite 事务成功才视为保存成功；入队不等于持久化完成。
- 导入或结构迁移前备份，保持数据兼容；冲突不得自动覆盖。
- 版本号只通过 `scripts/` 发布脚本修改；未经明确要求不修改 `packaging/` 或 `migrations/`。

## 6. 验收标准

以下标准描述当前产品必须持续满足的行为。对应测试路径用于追溯验证依据；执行具体版本验收时，仍需运行相关测试并按项目规则检查生产预览。

### 6.1 账户和隐私

- [ ] 首次部署可创建首个所有者账号；注册关闭后，不能创建额外账号。
- [ ] 未认证请求不能读取或修改私人知识库、附件、备份和账户资料。
- [ ] 用户启用两步验证后，密码校验后还必须验证动态验证码或一次性恢复码才能建立会话。
- [ ] 错误登录受到节流；退出后相应会话不能继续访问私有 API。

参考测试：`tests/server/auth.test.mjs`、`tests/server/auth-service.test.mjs`、`tests/server/totp.test.mjs`、`tests/server/api.test.mjs`。

### 6.2 笔记与书签

- [ ] 用户可以新建、编辑、查找和删除笔记；成功保存后重新载入仍能读取已提交内容。
- [ ] 用户可以添加、编辑、分组、标记常用、搜索、导入和导出书签。
- [ ] 全局搜索结果能区分笔记与书签，并能打开对应条目。
- [ ] 网页摘录内容可以保存为笔记；扩展授权只允许其约定的新增书签能力。
- [ ] 当客户端基于过期版本提交数据时，系统拒绝自动覆盖，并给用户保留处理冲突的机会。

参考测试：`tests/client/ui/ui-editor.test.mjs`、`tests/client/ui/ui-bookmarks.test.mjs`、`tests/client/sync/remote-vault-update-controller.test.mjs`、`tests/server/bookmark-metadata-route.test.mjs`、`tests/server/api.test.mjs`、`tests/browser-extension/popup.test.mjs`。

### 6.3 回收站、备份与迁移

- [ ] 删除的笔记和书签可在回收站中查看并恢复；界面保留期为 30 天，过期项目会按策略清理。
- [ ] 完整备份包含知识库数据、附件清单和附件内容；导入前校验结构与附件完整性。
- [ ] 用户可查看、下载或恢复服务端历史快照；备份和恢复操作失败时不报告成功。
- [ ] 已有 SQLite 数据库执行结构迁移前创建备份；迁移失败时保留原有可用数据。

参考测试：`tests/client/trash/trash-workflows.test.mjs`、`tests/client/ui/ui-backup-import.test.mjs`、`tests/server/backup-service.test.mjs`、`tests/server/backup-archive-stream.test.mjs`、`tests/server/sqlite-migrations-transaction.test.mjs`。

### 6.4 界面与部署

- [ ] 桌面界面保留侧栏导航，手机界面提供底部导航；浅色与深色主题均可使用现有主要内容类型。
- [ ] Docker 容器启动后，`/readyz` 返回就绪状态；未认证访问私人 API 返回未授权响应。
- [ ] Docker 部署使用持久化数据卷，重启容器后数据仍可读取。
- [ ] iStoreOS 发布可通过 LuCI 与 `.run` 包安装或更新，升级不重置用户数据配置。

参考测试：`tests/client/ui/ui-workspace.test.mjs`、`tests/client/appearance/theme-controller.test.mjs`、`tests/packaging/istoreos/istoreos-install.test.mjs`、`tests/packaging/istoreos/istoreos-updater.test.mjs`；Docker 健康检查和 API 冒烟检查见 `.github/workflows/istoreos-release.yml`。

### 6.5 非功能要求

- [ ] 支持 Node.js `>=22.13.0` 的项目环境和仓库锁定的依赖版本。
- [ ] `pnpm check`、`pnpm test`、`pnpm build` 在提交前全部通过。
- [ ] 每次代码变更均用最新生产构建启动预览，并按受影响的关键路径覆盖桌面和手机视口；未实际验证的平台须明确记录。

## 7. 需求依据与维护

本文件以当前代码、测试、`package.json`、`Dockerfile`、`packaging/` 配置和 `.github/workflows/istoreos-release.yml` 为依据。产品能力发生变化时，应同步更新 README 与本 PRD；不得仅因某条需求写入本文就将其视为已实现。
