# 栖点项目规则

## 项目边界
- 栖点是自托管软件，以 Docker 和 iStoreOS（LuCI 插件与 `.run` 包）发布；保持轻量并继续使用 SQLite。
- 个人私有产品；未经明确要求，不增加公开分享、协作、注册或付费功能。
- 使用简体中文；保留桌面侧栏、手机底部导航、深浅主题和现有内容类型。
- 功能与界面遵循 `docs/requirements.md` 和 `private_wiki_prototype.html`；保留原型，不直接修改。
- 不引入新依赖、Tailwind 或第三方 UI 库。界面样式只改 `src/styles.css`、`src/styles/workspace.css`，沿用现有 CSS 变量。
- 不使用 Vue Router；页面通过 Pinia 导航状态切换。

## 数据与安全
- 私有 API、附件和备份必须鉴权；生产配置缺失时拒绝访问。
- SQLite 事务成功才算保存；入队不算保存。界面不显示常规输入、编辑、自动保存或发布状态。
- 导入或结构迁移前备份，保持数据兼容；版本冲突不得自动覆盖。
- 不提交 `.dev.vars`、`.env`、`.local/`、`.wrangler/`、备份或真实笔记。

## 受限目录与版本
- 未经明确要求，不修改 `packaging/` 或 `migrations/`。
- `packaging/` 下的 shell 脚本必须兼容 BusyBox `ash`，并保持 LF 换行。
- 版本号只通过 `scripts/` 中的发布脚本修改。

## 变更与验证
- 每项任务先提交方案，列出拟改文件、改法和风险；获得用户确认后再修改代码。
- 每次改动完成前运行类型检查和测试，并汇报实际结果；业务改动还需运行 `pnpm build`。
- 每次代码改动都必须用最新生产构建启动生产预览，逐项验证本次改动涉及的用户可见行为与关键路径；按影响覆盖桌面和手机视口。测试和构建不能替代生产预览验收；无法实际验证的部分须明确标为未验证。
- 按 SQLite/API、DOM、桌面/手机浏览器、实机、Docker 部署分别报告实际验证结果及未验证项；源码检查或构建不代表已发布或部署。
- 使用 Windows 原生环境、PowerShell 终端和 Windows 路径；仅任务明确要求时使用 Bash/WSL/Git Bash，并先说明原因。
- 按任务选择已加载且符合触发条件的技能；用户指定优先。
- 按任务描述自动选择匹配技能：项目文档/报告用 `project-docs`、`codegen-doc`、`md-report-summary`；图表用 `codegen-diagram`、`drawio-diagram`、`excalidraw-diagram`、`pptgen-drawio`；PDF/Office 用 `pdf`、`office-file-process`；论文/专利/公众号写作用 `paper-write`、`patent-write`、`wechat-article-writer`；Skill 与 Prompt 转换用 `skill-prompt-convert`。外部添加技能与 Codex 自带技能功能重合时优先使用外部技能；只加载当前任务相关技能，项目规则和用户授权优先。`allow_implicit_invocation: false` 的技能仅在用户显式调用时使用。
- UI 设计、评审与改版优先使用 `impeccable`，遵循项目现有技术、品牌和设计约束；需要额外设计方向与视觉迭代时使用 `design-taste-frontend`。

## Git/GitHub
- 每个新 Git/GitHub 任务从普通权限 Git 开始，不因历史失败或记忆跳过步骤。
- 尝试顺序：Git → 权限受限时申请提权重试 → 仍失败且可替代时用 `D:\gh.exe` → gh 权限受限时申请提权重试。
- 提权只处理权限/沙箱限制；冲突、参数、认证等错误按原因处理。提权被拒绝后不得换工具绕过。
- 本地提交、分支及工作区操作使用 Git；gh 仅替代其支持的操作。全部失败时报告原因、已完成步骤及当前状态。
