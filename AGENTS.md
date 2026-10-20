# 栖点项目约定

## 产品与界面

- 以 `docs/requirements.md` 和原始 `private_wiki_prototype.html` 为设计与功能基线。
- 仅供个人私有使用；未经用户提出，不添加公开分享、协作、注册入口或付费服务。
- 原型文件只作参考，不覆盖或删除。正式入口为 `index.html`，代码位于 `src/` 和 `server/`。
- 使用简体中文；保留桌面侧栏、手机底部导航、深浅主题和既有内容类型。

## 数据与安全

- 不能把进入保存队列当作保存成功；写入完成以 Docker 服务端 SQLite 事务成功为准，界面不显示输入、编辑、自动保存或发布的常规状态。
- API 数据和文件访问都必须先鉴权；生产配置缺失时拒绝访问。
- 数据变更保持兼容。导入和结构迁移前保留备份；版本冲突时不自动覆盖。
- 不向版本库添加 `.dev.vars`、`.env`、`.local/`、`.wrangler/`、备份文件或真实用户笔记。

## 验证

- 业务修改运行 `pnpm test`、`pnpm check`、`pnpm build`，或 README 中对应的直接 Node 命令。
- 分别报告 SQLite、DOM 测试、桌面浏览器和手机实机验证。
- Docker 部署状态与本地源码检查分开报告。

## 技能选择

开始代码优化、重构、性能、可靠性或可维护性改进前，先检查当前可用的 Matt Pocock skills，并按任务选择适用项：

- 架构与代码结构：`improve-codebase-architecture`、`codebase-design`
- 疑难问题与性能分析：`diagnosing-bugs`
- 实现与重构：`tdd`、`implement`
- 完成后审查改动：`code-review`

只调用与当前任务相关的技能，并遵循对应技能说明。开始实施前简要说明选用的技能；完成后说明实际检查和结果。
