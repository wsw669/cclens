# CCLens — VS Code 扩展

Claude Code 会话的成本仪表盘与会话摘要浏览，直接在 VS Code 侧边栏查看。

## 功能

- **成本仪表盘**：本月成本 / 预算预警 / 按模型分布 / 近 7 天趋势 / 按项目排行
- **会话摘要**：浏览 CCLens CLI 生成的会话摘要（标题 / 完成了什么 / 关键决策 / 下一步）
- **自动刷新**：检测到会话日志变化后自动重新分析（防抖 60 秒）

## 安装

从 VSIX 安装：

```bash
npm install
npm run package          # 生成 cclens-0.1.0.vsix
code --install-extension cclens-0.1.0.vsix
```

开发调试：在 VS Code 中打开本目录，按 F5 启动扩展开发宿主。

## 设置

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| `cclens.monthlyBudget` | 100 | 月度预算（元） |
| `cclens.warnRatio` | 80 | 警戒线（预算的百分比） |
| `cclens.projectsDir` | `~/.claude/projects` | Claude Code 会话数据目录 |
| `cclens.autoRefresh` | true | 会话日志变化时自动刷新 |

模型价格沿用 CLI 版的 `~/.config/cclens/pricing.json`。

## 架构

- 成本分析在 worker 线程中运行，扫描数百 MB 的会话日志不阻塞编辑器
- 核心分析逻辑与 CCLens CLI 保持一致（见仓库根目录 `src/services/`）
