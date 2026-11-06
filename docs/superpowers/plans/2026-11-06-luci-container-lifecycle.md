# LuCI 容器生命周期与安装配置实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将栖点 LuCI 页面改为按容器生命周期显示安装、升级/应用、启动、停止、重启和删除操作，并为镜像与数据目录提供预设下拉和自定义输入。

**Architecture:** LuCI CBI 模型负责根据 Docker 和容器状态生成唯一的底部操作按钮，状态模板只展示状态和网页入口。`qidian.sh` 继续作为唯一的容器操作边界，新增安全的删除流程并复用现有镜像归属校验。安装配置通过 UCI 保存，部署时由脚本读取并验证。

**Tech Stack:** LuCI Lua CBI、LuCI view JavaScript、BusyBox ash、Docker CLI、现有 shell 测试。

**Spec:** 本次用户确认的 LuCI 生命周期与安装配置方案。

## Global Constraints

- 保持 SQLite、Docker 和 iStoreOS 发布方式。
- shell 脚本兼容 BusyBox `ash`，保持 LF 换行。
- 删除操作只针对栖点容器和明确归属的栖点镜像，不使用全局清理命令。
- 数据目录切换不自动迁移数据，提交前显示确认提示。
- 不修改 `migrations/`，不提交真实数据或本地配置。

## Review Focus

- 未安装时只显示安装入口，首次安装不由页面加载自动触发部署。
- 运行中和已停止状态显示互斥的生命周期操作，避免重复提交并发操作。
- 删除前必须确认容器已停止，镜像被其他容器引用时保留镜像并报告原因。
- 自定义镜像只能使用栖点仓库命名空间和合法标签，自定义目录必须是绝对路径。
- Docker 不可用、操作失败和升级失败时状态与日志仍然可见。

### Task 1: 生命周期脚本边界

**Files:**
- Modify: `packaging/istoreos/luci-app-qidian/root/usr/libexec/istorec/qidian.sh`
- Test: `tests/packaging/istoreos/qidian.sh.test.mjs`

- [ ] 为 `remove` 增加停止状态检查、容器删除、归属镜像删除和失败保留逻辑。
- [ ] 为 `configured_image` 和 `data_path` 增加统一校验，拒绝越权镜像和相对路径。
- [ ] 为启动、停止、重启、安装和删除保留现有操作锁及日志结果契约。
- [ ] 运行相关 shell 单测并覆盖容器运行中、已停止、镜像被引用和 Docker 不可用场景。

### Task 2: CBI 安装配置和底部操作

**Files:**
- Modify: `packaging/istoreos/luci-app-qidian/root/usr/lib/lua/luci/model/cbi/qidian.lua`
- Modify: `packaging/istoreos/luci-app-qidian/root/etc/config/qidian`
- Test: `tests/packaging/istoreos/*.test.mjs`

- [ ] 将镜像字段改为栖点仓库预设、已配置值和自定义标签输入组合。
- [ ] 将数据目录字段改为默认路径、当前路径和自定义绝对路径输入组合。
- [ ] 移除独立的“检查更新”和“服务控制”按钮。
- [ ] 根据容器状态创建唯一的底部按钮组，运行中显示“升级/应用、停止、重启”，已停止显示“升级/应用、启动、删除”，未安装显示“安装”。
- [ ] 在数据目录变更和删除操作前增加确认提示。

### Task 3: 服务状态展示

**Files:**
- Modify: `packaging/istoreos/luci-app-qidian/root/usr/lib/lua/luci/view/qidian/status.htm`
- Test: `tests/packaging/istoreos/*.test.mjs`

- [ ] 顶部显示未安装、运行中、已停止、操作中和 Docker 不可用状态。
- [ ] 仅运行中显示“打开栖点”，操作完成后刷新状态和底部操作。
- [ ] 保留版本与日志可见性，不重复提供更新和服务控制入口。

### Task 4: 打包验证

- [ ] 运行 `pnpm check`、相关测试和 `pnpm build`。
- [ ] 构建 LuCI `.run` 包并检查 BusyBox shell 语法、LF 换行和包内路径。
- [ ] 在可用的本地 Docker/模拟环境验证安装、启动、停止、重启、删除和重新安装状态流转。

