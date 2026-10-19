# 项目组成说明

本文按代码和交付边界说明栖点由哪些部分组成，以及各部分主要负责什么。它侧重回答“代码在哪里、各模块负责什么”；系统调用关系和安全细节见[架构说明](architecture.md)，安装步骤见[部署指南](deployment.md)。

## 项目分层

```text
栖点
├── Web 应用              浏览器中的知识库界面和交互
├── 自托管服务与数据层    登录、API、SQLite、附件和备份
├── 共享领域规则          浏览器与服务端共用的数据校验、书签规则和 API 契约
├── Docker 部署           在 Linux、NAS、服务器或路由器容器中运行应用
├── LuCI 设备管理         iStoreOS / OpenWrt 上的安装、服务和更新管理
├── 构建与发布            测试、镜像构建、安装包制作和 GitHub Release
└── 质量与项目资料        自动化测试、需求、架构、部署和验证文档
```

## 各部分的主要内容

### 1. Web 应用：`index.html`、`src/`

`index.html` 是生产 Web 应用入口，`src/main.ts` 是唯一启动入口：先通过 `src/workspace-app.ts` 挂载唯一的 Vue 根应用，再动态加载 `src/application.ts` 协调认证与工作区启动。Vite 负责构建。首页仪表盘、笔记列表、阅读与编辑页面、书签工作区、回收站、快速操作面板、桌面侧栏、手机底部导航、认证、个人资料及备份恢复设置界面已按功能拆分；页面视图使用 Vue 3、TypeScript 和 Pinia。Vault Pinia 持有当前账户数据；各工作区页面的激活状态由导航页和 Vault 就绪状态派生，首页、笔记列表、阅读页和侧栏数据按 Vault generation 与导航状态派生，避免 `app.js` 逐页推送激活标志。编辑器的 Tiptap 生命周期、附件上传、内容粘贴与图片插入、本文查找及格式、表格、段落和编辑命令位于 `src/features/editor/`，发布事务状态流由 `note-publish-flow.ts` 管理；备份历史列表由 `BackupHistoryList.vue` 呈现，备份导入导出和历史快照事务由设置功能流程管理。`src/app.js` 仍负责部分应用组合、附件上传、备份历史弹窗、视图投影注入和兼容页面事件分派；`navigation/transitions.ts` 定义页面状态转移，`workspace-navigation-controller.ts` 协调页面切换副作用，`workspace-navigation-events.ts` 管理页面入口和离开编辑确认。导航 Pinia 保存当前页面、筛选条件、笔记编辑上下文和返回列表状态。`src/styles.css` 提供桌面、手机及浅色和深色主题样式，Tiptap 负责富文本编辑。页面迁移仍在进行，Vue 根应用与旧 DOM 兼容边界会逐步收敛。

主要功能模块：

| 文件 | 主要职责 |
|---|---|
| `src/app.js` | 应用组合、数据适配、渲染副作用和兼容页面事件；按功能逐步接入 Vue 与类型化控制器 |
| `src/main.ts` | 唯一启动入口，先挂载 Vue 根应用，再加载应用组合层 |
| `src/application.ts`、`src/features/auth/application-bootstrap.ts` | 协调认证状态读取、首次登录/注册引导、启动错误呈现与工作区启动 |
| `src/workspace-app.ts`、`src/VueFeatures.vue` | 创建唯一 Vue 根应用、集中初始化 Pinia Store 并挂载功能页面 |
| `src/features/lifecycle/workspace-lifecycle.ts` | 统一管理云端刷新、页面恢复事件和过期回收站清理定时器 |
| `src/features/lifecycle/workspace-interaction-runtime.ts` | 集中挂载并成组卸载工作区 DOM、键盘、编辑器和弹窗事件 |
| `src/features/sync/current-vault-snapshot.ts` | 生成冲突合并快照，纳入编辑器未保存内容并排除空白新草稿 |
| `src/features/sync/remote-vault-update-controller.ts` | 应用远端 Vault 更新，保护活动编辑和瞬时新草稿，并处理当前笔记被远端删除时的导航恢复 |
| `src/features/dashboard/` | 首页仪表盘、笔记卡片、书签分组树及 Pinia 状态；`store.ts` 直接从 Vault generation 派生首页投影，并将布局和分组命令交给显式绑定；`snapshot.ts` 纯计算首页卡片、书签层级、计数与展开状态 |
| `src/features/reader/` | 阅读页 Pinia 状态从 Vault 与导航派生；快照模块生成安全正文、目录、阅读时长与操作状态，`reader-actions-store.ts` 提供类型化页面动作，`code-copy.ts` 管理代码块复制，Vue 与兼容页面共用业务处理 |
| `src/features/notes/` | 类型化笔记卡片、基于 Vault generation 的 Pinia 列表快照及笔记新增、复制、草稿保存和类型管理领域动作；页面操作沿用现有保存队列和发布事务 |
| `src/features/notes/note-actions.ts` | 新建笔记模板、编号和默认状态，以及复制笔记时清理发布与收藏状态 |
| `src/features/notes/delete-workflow.ts` | 笔记移入回收站的类型化业务工作流；保留笔记位置并调用统一 Vault 写事务 |
| `src/features/notes/editor-delete-workflow.ts` | 协调编辑器删除确认、空白新笔记丢弃、当前草稿暂存和回收站事务 |
| `src/features/notes/draft-content.ts` | 编辑内容基线与有效草稿判定，识别空白正文、模板、文本、图片和元数据 |
| `src/features/notes/selectors.ts` | 发布视图、草稿识别、列表筛选、搜索和排序等纯查询规则 |
| `src/features/notes/type-actions.ts` | 笔记类型新增、改名、删除及活动和回收站笔记迁移规则 |
| `src/features/notes/type-dialog-flow.ts` | 协调笔记类型变更、后端事务提交、失败回滚、筛选修正和结果通知 |
| `src/features/notes/NoteTypeDialog.vue`、`type-dialog-store.ts` | Vue 笔记类型弹窗及其新增、编辑、删除表单状态 |
| `src/features/categories/CategoryDialog.vue`、`category-dialog-store.ts` | Vue 分类创建弹窗、表单状态及领域校验后的 Vault 事务提交 |
| `src/features/categories/category-dialog-flow.ts` | 校验分类名称并通过 Vault 写事务保存，失败时保留原数据 |
| `src/features/capture/capture-flow.ts` | 清理网页摘录正文、生成草稿并等待 Vault 写事务成功后返回 |
| `src/features/capture/CaptureDialog.vue`、`capture-dialog-store.ts` | Vue 网页摘录弹窗及表单状态；保存仅在摘录流程完成 Vault 写事务后关闭 |
| `src/features/capture/capture-dom-adapter.ts` | 管理摘录编辑区的 DOM 选区、HTML/纯文本插入、换行与代码块粘贴 |
| `src/features/create-menu/CreateMenuDialog.vue`、`store.ts` | Vue 新建入口；笔记、书签和网页摘录通过统一的类型化导航命令进入对应流程 |
| `src/features/trash/` | 回收站 Vue 页面、基于 Vault generation 的 Pinia 快照，以及还原、清空和过期清理工作流；生产页面统一使用自定义确认框，并在 SQLite 保存失败时回滚 |
| `src/features/vault/store.ts` | 当前账号知识库 Vault 快照的 Pinia 所有者；提供受控写入、替换、快照复制和变更 generation |
| `src/features/vault/mutation.ts` | 前端 Vault 写事务边界：复制候选数据、执行共享校验、更新响应式快照、提交后端并在失败时安全回滚 |
| `src/features/vault/persistence.ts` | 统一普通保存队列与等待服务端事务成功的立即保存，并从队列快照中排除空白新草稿 |
| `src/features/sync/cloud-sync-engine.ts` | 管理串行云端保存、多设备更新、revision 冲突合并、重试与登录过期暂停 |
| `src/features/command-palette/` | Vue 3 / TypeScript 快速操作面板及其 Pinia 状态；`Ctrl+K` / `⌘K` 打开面板 |
| `src/features/dialogs/` | Vue 自定义确认与输入弹窗、Pinia 状态及 Promise 调用服务；业务动作沿用原有确认结果接口 |
| `src/features/notifications/` | Vue 提示展示、Pinia 通知状态与自动消失；应用组合层和界面共享同一 Store |
| `src/features/sync/` | Vue 同步冲突复核弹窗、对照版本摘要状态及备份门槛控制器 |
| `src/features/system-updates/controller.ts` | 版本读取、更新提交、状态轮询、重启后目标版本确认与版本弹窗控制 |
| `src/features/auth/AuthGate.vue` | Vue 登录、注册和重新认证界面及账号创建状态 |
| `src/features/auth/authentication-flow.ts` | 登录注册流程状态、初始化策略及认证结果交接 |
| `src/features/auth/mount-auth-gate.ts` | 将认证 Vue 组件接入现有启动和重认证入口 |
| `src/features/account/ProfileSettings.vue` | Vue 个人资料、头像和密码管理界面 |
| `src/features/account/profile-settings-flow.ts` | 账号资料加载、头像更新和密码修改状态流程 |
| `src/features/account/mount-profile-settings.ts` | 将个人资料 Vue 功能接入账号菜单和现有 API |
| `src/features/settings/AppSettings.vue` | Vue 备份、恢复、同步与迁移设置界面 |
| `src/features/settings/mount-app-settings.ts` | 将设置界面接入应用动作和状态边界 |
| `src/features/settings/app-settings-actions.ts` | 设置动作分发；重新载入前保存编辑内容并导出完整备份 |
| `src/features/settings/backup-workflows.ts` | 完整备份导入导出、历史快照下载与恢复事务 |
| `src/features/settings/backup-archive.ts` | 完整备份 ZIP 格式编解码、附件清单校验和解压大小限制 |
| `src/features/settings/backup-data-service.ts` | 协调附件读取与导入、完整备份下载、历史快照 API 和本地预览行为 |
| `src/features/editor/note-publish-flow.ts` | 发布前保存、SQLite 提交、失败重试与防重复状态流程 |
| `src/features/editor/content-insertion.ts` | 编辑器与网页摘录共用的剪贴板识别、安全清理、格式回退和图片上传流程 |
| `src/features/content/html-content.ts` | 统一安全 URL 判定、HTML 白名单清理、纯文本结构化、Markdown 正文展示和粘贴标题提取；DOM 与清理器通过显式依赖注入 |
| `src/features/navigation/` | Vue 桌面侧栏、手机底部导航、Pinia 工作区路由，以及基于 Vault generation 派生的侧栏状态 |
| `src/features/navigation/WorkspaceTopbarMenus.vue` | Vue 主题与账号菜单；菜单展开状态、主题表现和账号头像由 Pinia 管理 |
| `src/features/navigation/WorkspaceBreadcrumb.vue` | Vue 面包屑标题；标题文本由工作区壳层 Pinia 提供 |
| `src/features/navigation/MobileDrawerControls.vue` | Vue 移动端抽屉按钮和遮罩；抽屉状态由工作区壳层 Pinia 管理 |
| `src/features/navigation/workspace-shell-store.ts` | 顶栏菜单、移动端抽屉、主题状态与临时账号标识的 Pinia 所有者 |
| `src/features/navigation/sidebar-store.ts` | 笔记、书签、回收站计数及分类、类型导航快照；由 Pinia 订阅当前账号 Vault 和导航状态 |
| `src/features/navigation/transitions.ts` | 描述首页、笔记类型、笔记、书签和回收站之间的纯状态转移 |
| `src/features/navigation/workspace-navigation-controller.ts` | 按统一顺序保存草稿、更新页面状态、渲染视图并恢复滚动位置 |
| `src/features/navigation/workspace-view-dispatcher.ts` | 按导航状态选择 Vue 页面或兼容 DOM 回退，并统一处理工作区壳层与页面切换副作用 |
| `src/features/navigation/navigation-command.ts`、`navigation-actions-store.ts` | Vue 页面和桌面、手机导航通过类型化命令调用应用导航边界；保留未迁移 DOM 页面使用的事件适配器 |
| `src/features/navigation/workspace-shell-command.ts`、`workspace-shell-actions-store.ts` | Vue 侧栏类型管理、分类创建与笔记删除通过类型化功能命令调用应用工作区边界 |
| `src/features/navigation/workspace-navigation-events.ts` | 处理页面入口点击和离开编辑确认，再调用对应导航或创建功能 |
| `src/features/navigation/workspace-click-router.ts` | 按导航、编辑器、工作区壳层和内容功能顺序分发全局点击事件，首个处理者消费事件 |
| `src/features/navigation/workspace-shell-events.ts` | 路由全局菜单、笔记类型、删除确认、搜索和弹窗关闭交互 |
| `src/features/navigation/workspace-keyboard-events.ts` | 管理工作区快捷键、Escape 菜单关闭与笔记卡片键盘激活 |
| `src/features/navigation/item-menu-controller.ts` | 管理更多菜单的视口定位、展开方向和外部点击关闭 |
| `src/features/navigation/workspace-content-events.ts` | 路由笔记编辑与发布、收藏、删除、备份及移动端入口 |
| `src/features/dialogs/modal-focus-loop.ts` | 让 Tab 键在最上层打开的弹窗内循环移动焦点 |
| `src/features/editor/document-lifecycle.ts` | 处理离开页面提醒，以及编辑草稿在页面离开或隐藏时的保存 |
| `src/features/editor/draft-controller.ts` | 管理编辑器草稿初始化、正文和元数据同步、变更判断及瞬时空白笔记持久化策略 |
| `src/features/editor/file-input-events.ts` | 路由附件和图片选择器事件，并在处理后重置文件输入 |
| `src/features/settings/import-file-events.ts` | 将备份文件选择事件交给设置页导入流程 |
| `src/editor.js`、`src/editor-extensions.js` | 富文本编辑器及扩展配置 |
| `src/markdown.js`、`src/paste.js` | Markdown 转换、网页内容清理和粘贴处理 |
| `src/features/bookmarks/` | Vue 书签工作区、分组树、卡片操作和订阅 Vault 的 Pinia 快照状态；用户动作通过显式绑定进入书签事务控制器 |
| `src/features/reader/` | Vue 笔记阅读页与目录跟随；Pinia 状态按当前账户 Vault 和导航派生阅读快照，`reader-actions-store.ts` 以类型化命令分派阅读操作，`code-copy.ts` 安装代码块复制控件并随组件清理，笔记变更沿用现有保存事务 |
| `src/features/editor/` | Vue 编辑页面、类型化 Pinia 状态、Tiptap 运行时与本文查找控制器，以及工具栏命令模块 |
| `src/features/editor/editor-page-action.ts`、`editor-page-actions-store.ts` | 编辑页保存、附件、HTML 导出、图片选择和删除操作的类型化命令与 Pinia 分派边界 |
| `src/features/editor/page-actions.ts` | 编辑页动作执行与 HTML 导出版本选择流程 |
| `src/features/editor/store.ts` | 持有编辑页视图快照、元数据表单和响应式工具栏选区状态 |
| `src/features/editor/legacy-toolbar-view.ts` | 集中管理迁移测试所需的旧 DOM 工具栏状态、附加操作与布局 |
| `src/features/editor/command-controller.ts` | 类型化的格式、段落、表格和编辑命令，以及分隔文本转表格的输入校验 |
| `src/features/editor/insert-controller.ts` | 处理图片、代码块、表格、提示框、折叠区、链接和符号插入命令 |
| `src/features/editor/toolbar-events.ts` | 将工具栏、斜杠菜单、表格和颜色控件事件路由到编辑器命令模块 |
| `src/features/editor/runtime-controller.ts`、`search-controller.ts` | 严格类型化的 Tiptap 初始化、销毁、编辑事件绑定和本文查找交互 |
| `src/bookmarks.js`、`src/bookmark-data.js` | 书签领域操作、对话框、导入导出、整理、持久化和 DOM 回退视图 |
| `src/recycle-bin.js`、`src/trash-data.js` | 无 Vue 挂载时的回收站兼容视图与回收站数据操作；生产页面使用 `features/trash/` 中的 Vue 页面和事务工作流 |
| `src/api/` | 按认证、账号、更新、知识库、附件和备份组织同源请求及 TypeScript API 契约 |
| `src/api/client.ts` | 统一 `/api` 请求、同源 Cookie、禁用缓存及请求/响应 JSON 契约校验 |
| `src/cloud.js`、`src/vault-merge.js` | `cloud.js` 负责认证、本地草稿恢复和 API 兼容门面；`vault-merge.js` 提供纯数据冲突合并规则，同步队列由 `src/features/sync/cloud-sync-engine.ts` 协调，备份委托给设置数据服务 |
| `src/draft-recovery.js` | 编辑异常或网络中断时的临时恢复处理 |
| `src/credentials.js`、`src/credentials-worker.js`、`src/credentials-wasm.js` | 登录凭据派生与相关计算 |
| `src/release-notes.js` | 版本说明内容 |

### 共享领域规则：`shared/`

`shared/` 保存浏览器和服务端共用的纯数据规则，避免前端导入服务端实现。服务端继续通过 `server/validation.js` 和 `server/bookmarks.js` 提供兼容导出，并将领域校验错误映射到现有 HTTP 状态码。

| 路径 | 主要职责 |
|---|---|
| `shared/vault-validation.js` | 知识库、笔记、草稿、回收站和偏好的标准化与校验 |
| `shared/bookmarks.js` | 书签 URL 规范化、分组深度、数量及编号校验 |
| `shared/api-contracts.js`、`shared/api-contracts.d.ts` | JSON API 请求与响应的运行时校验和前后端共享的 TypeScript 类型 |

`private_wiki_prototype.html` 是早期设计参考，不是生产入口，也不参与构建。

### 2. 自托管服务与数据层：`server/`、`migrations/`

Node.js 服务负责向浏览器提供静态资源与 API，并在 Docker 容器中访问持久化数据。数据库使用 Node 内置 SQLite，数据目录由部署配置挂载到容器 `/data`。

| 路径 | 主要职责 |
|---|---|
| `server/selfhost.mjs` | 初始化 SQLite、读取运行配置并启动服务，负责进程信号关闭 |
| `server/config.mjs` | 解析运行环境配置、固定 9908 端口并校验反向代理信任名单 |
| `server/http-server.mjs` | HTTP 适配、同源 API 转发、静态资源、安全响应头和健康检查 |
| `server/host-updater.mjs` | 通过固定请求与状态文件和宿主设备更新代理通信 |
| `server/api.js` | Origin 检查、会话认证、统一响应与 API 路由分发 |
| `server/application/vault-service.js` | 编排知识库读取、数据校验、revision 乐观锁保存及冲突处理 |
| `server/application/auth-service.js` | 编排首个管理员初始化、注册、登录挑战验证和会话创建 |
| `server/application/system-update-service.js` | 校验最新 Release、比较设备版本、授权并排队设备更新 |
| `server/application/account-service.js` | 编排账号资料和头像数据、密码验证及条件更新事务，不依赖 HTTP 请求对象 |
| `server/application/asset-service.js` | 编排附件上传、分块读取及依据知识库和历史快照引用关系进行安全清理 |
| `server/application/backup-service.js` | 编排账号隔离的快照创建、读取与列表结果，不依赖 HTTP 请求对象 |
| `server/features/auth.js` | 解析认证 API 请求、应用认证限流并设置会话 Cookie |
| `server/features/account.js` | 解析账号资料、头像和密码 API 请求，应用限流并映射 HTTP 响应 |
| `server/features/system-updates.js` | 解析设备版本与更新 API 请求并映射稳定响应 |
| `server/features/vault.js` | 知识库读取、revision 检查及保存 API |
| `server/features/backups.js` | 解析历史快照 API 请求并映射稳定响应契约 |
| `server/repositories/vault-repository.js` | 账号隔离的知识库读写与 revision 条件更新 SQL |
| `server/repositories/backup-repository.js` | 账号隔离的快照查询、创建和最近 20 个版本保留 |
| `server/repositories/asset-repository.js` | 账号隔离的附件分块写入、读取、清理候选与删除 SQL |
| `server/repositories/account-repository.js` | 账号资料和头像存取、密码事务与首账号查询 SQL |
| `server/repositories/auth-repository.js` | 首账号创建与旧库认领事务、登录挑战、会话查询与续期、认证限流 SQL |
| `server/repositories/local-account-repository.mjs` | 容器密码重置命令使用的本机 SQLite 账号查询、密码更新及会话撤销事务 |
| `server/features/assets.js` | 解析附件上传、读取和清理 API 请求，处理请求流及二进制 HTTP 响应 |
| `server/auth.js` | 登录认证、会话校验、来源检查和认证限流 |
| `server/validation.js` | 服务端请求与知识库数据校验 |
| `server/bookmarks.js` | 服务端和浏览器共用的书签 URL 与数据校验逻辑 |
| `server/sqlite-migrations.mjs` | 打开 SQLite 数据库、执行迁移及迁移前备份 |
| `migrations/*.sql` | 按序升级数据库结构，兼容既有设备数据 |
| `server/reset-password.mjs` | 在容器内交互式重置账号密码 |

核心数据包括账号、会话、笔记和书签知识库、附件及正文快照。API 先验证身份，再按账号隔离数据。保存通过带 revision 的 SQLite 更新检测并发修改；只有事务成功后才确认写入。API 路径和数据库 schema 保持兼容；`server/api.js` 负责来源校验、会话授权、统一响应与路由分发，`server/features/` 处理各领域 HTTP 请求，`server/application/` 编排应用用例，`server/repositories/` 封装 SQLite 查询和事务。

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
| `packaging/istoreos/install.sh` | `.run` 解包后安装管理文件并自动部署，在线更新时交由持锁任务部署 |
| `packaging/istoreos/build-run.sh` | 组装 `.run` 自解压包并生成 SHA-256 文件 |

发布的 `.run` 包含 LuCI、Compose 和设备管理脚本，不包含应用容器镜像；设备通过 Docker Hub 拉取适合自身架构的镜像。管理插件与镜像版本可独立检查，需要更新时由设备端流程执行。

### 5. 构建与发布：`.github/workflows/`、`scripts/`

GitHub Actions 的 `istoreos-release.yml` 是手动触发的正式发布工作流。它执行源码检查、测试和 Web 构建，构建并验证容器，发布多架构 Docker 镜像，制作 `.run` 与校验文件，更新版本号并发布 GitHub Release，最后提升已发布版本镜像为 `latest`。

- `scripts/release-version.mjs`：按选择的版本级别计算或恢复发布版本。
- `scripts/check-sources.mjs`：检查 JavaScript / MJS 源码。
- `scripts/sqlite-adapter.mjs`：SQLite 查询适配。
- `pnpm-lock.yaml`、`pnpm-workspace.yaml`、`package.json`：依赖锁定、包管理配置和版本来源。

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
2. `src/cloud.js` 调用 `src/api/` 领域客户端，通过同源 `/api/` 请求 Node.js 服务端。
3. `server/api.js` 校验来源和会话授权，`server/auth.js` 提供认证与限流能力。
4. 服务端读取或更新 SQLite，并根据请求处理附件或快照。
5. 若用户从 LuCI 发起设备升级，LuCI 管理页经受限请求与状态目录协调宿主更新代理；代理分别更新管理文件和容器镜像，知识库数据仍留在持久化目录。
