# CCManager — Claude Code Session Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Claude Code 专属会话管理器：多会话管理 + AI 成本可视化 + 会话知识沉淀。**

一个终端应用，让你同时管理多个 Claude Code 会话——知道每个会话在忙什么、烧了多少钱、上次聊了什么。

## ✨ 为什么你需要它

用 Claude Code 的人都会遇到三个问题：

1. **会话太多管不过来** —— 同时开几个项目，终端窗口切来切去，不知道哪个会话在等你回复
2. **钱花得不明不白** —— token 消耗散落在会话日志里，月底才知道花了多少
3. **会话结束即遗忘** —— 有价值的讨论、决策、下一步计划，随着会话结束烟消云散

CCManager 一次性解决这三个问题。

## 🎯 核心功能

### 会话管理
- 在一个界面里创建、切换、终止 Claude Code 会话
- 实时状态显示：😴 空闲 / ⚙️ 忙 / ⏳ 等你回复
- Git worktree 支持：一个项目并行开多个工作副本，互不干扰
- 会话数据跨 worktree 复制：新副本继承旧会话的上下文

### 💸 成本仪表盘（Cost Dashboard）
- **全量解析**：流式扫描所有会话日志（支持数百 MB 大文件），提取每次调用的 token 消耗
- **多维归因**：按模型 / 项目 / 日期三个维度聚合，一眼看出钱花在哪
- **真实成本计算**：内置主流模型价格表（DeepSeek / GLM / Kimi / 通义 / Claude），支持自定义（`~/.config/ccmanager/pricing.json`）
- **预算预警**：设定月度预算，超支醒目提醒

### 📝 会话摘要（Session Summaries）
- **自动触发**：会话退出时后台自动生成结构化摘要——标题 / 完成了什么 / 关键决策 / 下一步
- **知识沉淀**：摘要按项目归档存入本地知识库，历史会话结论随时回看
- **零打扰**：异步生成，不阻塞任何操作

## 🚀 快速开始

```bash
npm install -g ccmanager
ccmanager
```

或本地运行：

```bash
npm install
npm run build
npm start
```

### 使用成本仪表盘

主菜单选择 **Cost Dashboard**（快捷键 `$`）。

### 使用会话摘要

需要配置 LLM 凭证（任意 OpenAI 兼容 API）：

```bash
export CCM_LLM_API_KEY=sk-xxx
export CCM_LLM_BASE_URL=https://api.deepseek.com/anthropic  # 可选，默认即此
export CCM_LLM_MODEL=deepseek-v4-pro                        # 可选
```

会话退出后自动生成摘要，主菜单选择 **Session Summaries**（快捷键 `S`）浏览。

### 自定义模型价格

```bash
# ~/.config/ccmanager/pricing.json
{
  "deepseek-v4-pro": { "input": 2, "output": 8, "cacheRead": 0.5, "cacheWrite": 2 }
}
```

## 🔧 键盘快捷键

- `Ctrl+E`：从会话返回菜单
- `Esc`：取消 / 返回
- `Ctrl+C`：退出

## 📦 系统要求

| 组件 | 要求 |
|------|------|
| 操作系统 | Windows 10/11 · macOS · Linux |
| Node.js | 20+ |
| Claude Code | [code.claude.com](https://code.claude.com/docs/en/setup) |

## 🧪 测试

```bash
npm test          # 单元测试
npm run typecheck # 类型检查
```

## 📄 更多文档

- [EXTENSIONS.md](EXTENSIONS.md) — 成本可视化与会话摘要模块的设计文档（需求分析→方案→效果数据→迭代计划）
- [docs/](docs/) — 配置、hooks、worktree 等详细文档

## 📜 许可证

MIT License
