# CCLens — Claude Code Session Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Claude Code 专属会话管理器：多会话管理 + AI 成本可视化 + 会话知识沉淀。**

一个终端应用，让你同时管理多个 Claude Code 会话——知道每个会话在忙什么、烧了多少钱、上次聊了什么。

## ✨ 为什么你需要它

用 Claude Code 的人都会遇到三个问题：

1. **会话太多管不过来** —— 同时开几个项目，终端窗口切来切去，不知道哪个会话在等你回复
2. **钱花得不明不白** —— token 消耗散落在会话日志里，月底才知道花了多少
3. **会话结束即遗忘** —— 有价值的讨论、决策、下一步计划，随着会话结束烟消云散

CCLens 一次性解决这三个问题。

## 🎯 核心功能

### 会话管理
- 在一个界面里创建、切换、终止 Claude Code 会话
- 实时状态显示：😴 空闲 / ⚙️ 忙 / ⏳ 等你回复
- Git worktree 支持：一个项目并行开多个工作副本，互不干扰
- 会话数据跨 worktree 复制：新副本继承旧会话的上下文

### 💸 成本仪表盘（Cost Dashboard）
- **全量解析**：流式扫描所有会话日志（支持数百 MB 大文件），提取每次调用的 token 消耗
- **多维归因**：按模型 / 项目 / 日期三个维度聚合，一眼看出钱花在哪
- **真实成本计算**：内置主流模型价格表（DeepSeek / GLM / Kimi / 通义 / Claude），支持自定义（`~/.config/cclens/pricing.json`）
- **预算预警**：设定月度预算，超支醒目提醒

### 📝 会话摘要（Session Summaries）
- **自动触发**：会话退出时后台自动生成结构化摘要——标题 / 完成了什么 / 关键决策 / 下一步
- **知识沉淀**：摘要按项目归档存入本地知识库，历史会话结论随时回看
- **零打扰**：异步生成，不阻塞任何操作

## 🚀 快速开始

前置要求：Node.js 20+（构建与运行只需要 Node 和 npm）。

```bash
git clone https://github.com/wsw669/cclens.git
cd cclens
npm install
npm run build
npm start
```

开发时也支持 Bun 工作流：`bun install && bun run dev`。

## 🧩 VS Code 扩展

同一套能力，两种形态：仓库里的 [vscode-ext/](vscode-ext/) 是配套的 VS Code 扩展，在编辑器侧边栏直接看成本仪表盘与浏览会话摘要。

- **本月成本 + 预算预警**：大数字 + 进度条，超预算红色醒目提醒
- **按模型 / 按项目 / 近 7 天趋势**：一眼看出钱花在哪
- **会话摘要浏览**：CLI 在会话退出时自动生成摘要，扩展里实时可见（闭环：终端生成 → 编辑器里看）
- **不阻塞编辑器**：成本分析在 worker 线程运行，扫描数百 MB 会话日志时编辑器照常流畅

安装：

```bash
cd vscode-ext
npm install
npm run package                       # 生成 cclens-0.1.0.vsix
code --install-extension cclens-0.1.0.vsix
```

### 使用成本仪表盘

主菜单选择 **Cost Dashboard**（快捷键 `$`）。

### 使用会话摘要

需要配置 LLM 凭证（任意 OpenAI 兼容 API）：

```bash
export CCLENS_LLM_API_KEY=sk-xxx
export CCLENS_LLM_BASE_URL=https://api.deepseek.com/anthropic  # 可选，默认即此
export CCLENS_LLM_MODEL=deepseek-v4-pro                        # 可选
```

会话退出后自动生成摘要，主菜单选择 **Session Summaries**（快捷键 `S`）浏览。

### 🔌 会话结束自动摘要（SessionEnd 钩子）

不管在哪里使用 Claude Code（CLI 或 VS Code 插件），只要会话结束，cclens 都能自动生成摘要：利用 Claude Code 的 SessionEnd 钩子，会话结束时自动调用本仓库的摘要脚本。

安装：在 `~/.claude/settings.json` 中加入（替换为本仓库的实际路径）：

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"<本仓库路径>/scripts/summarize-session-end.mjs\"",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

需要先配置上面的 LLM 凭证。摘要结果与 CLI 生成的完全一致，存于 `~/.config/cclens/summaries/`，VS Code 扩展实时可见；同一会话不会重复生成。

> 提示：摘要生成会将会话内容发送到你配置的 LLM API（这是摘要功能的本质）。

### 自定义模型价格

```bash
# ~/.config/cclens/pricing.json
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

## 🙏 致谢

本项目基于开源会话管理器 [kbwo/ccmanager](https://github.com/kbwo/ccmanager) 聚焦重构：将 9 种 AI 助手支持裁剪为 Claude Code 专属，并新增成本可视化与会话知识沉淀模块。

## 📜 许可证

MIT License
