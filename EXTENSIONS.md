# CCManager 扩展功能：成本可视化 + 会话知识沉淀

> 本仓库在开源会话管理器 [kbwo/ccmanager](https://github.com/kbwo/ccmanager) 基础上进行了**聚焦重构**：将 9 种 AI 助手支持收敛为 Claude Code 专属，并新增成本可视化与会话知识沉淀两个模块，解决 AI 编程助手使用中的两类核心痛点。

## 一、为什么要做（需求分析）

ccmanager 解决了"会话太多管不过来"的问题，但作为重度 AI 编程助手用户，还有两个痛点没有被覆盖：

### 痛点 1：成本盲区 💸
每天和多个 AI agent 交互，token 在不知不觉中消耗：
- **不知道花了多少钱**：8 种 agent 的会话记录散落在各自目录，没有任何聚合视图
- **不知道钱花在哪**：哪个模型最烧钱？哪个项目消耗最大？缓存省了多少？
- **没有预警机制**：经常是月底看账单才吓一跳

### 痛点 2：会话即弃 🧠
一次有价值的会话结束后，它的"资产"就丢失了：
- 讨论了什么、做了哪些决策、下一步该做什么——全部烟消云散
- 下次恢复会话要重新读上下文、重新解释背景
- 长期积累的经验无法复用

## 二、功能设计

### 模块 A：成本仪表盘（Cost Dashboard）

**一句话**：把散落的会话记录变成一张"AI 消费账单"。

- **全量解析**：扫描 Claude Code 项目目录下所有会话 JSONL，流式解析（支持数百 MB 大文件）
- **多维聚合**：按模型 / 按项目 / 按日期三个维度统计 token 消耗与费用
- **成本计算引擎**：内置主流模型价格表（DeepSeek / GLM / Kimi / 通义 / Claude），支持用户自定义价格（`~/.config/ccmanager/pricing.json`）
- **预算预警**：设定月度预算与警戒线，超支时在仪表盘顶部醒目提示

### 模块 B：会话摘要与知识沉淀（Session Summaries）

**一句话**：给每次会话配一个"会议纪要员"。

- **自动触发**：会话退出时自动在后台生成摘要，不阻塞操作
- **结构化摘要**：LLM 输出四段式结构——标题 / 完成了什么 / 关键决策 / 下一步
- **持久化存储**：markdown 存入本地知识库（`~/.config/ccmanager/summaries/<project>/`），按项目归档
- **浏览视图**：内置摘要列表与详情视图，随时回看历史会话的结论

## 三、技术架构

```
session JSONL (Claude Code)
        │
        ├─→ costAnalyzer（流式解析 → token 聚合 → 成本计算）
        │        └─→ CostDashboard（Ink TUI 视图）
        │
        └─→ sessionSummarizer（转录提取 → LLM 摘要 → markdown 持久化）
                 └─→ SummariesView（摘要浏览视图）
```

- 成本分析：Node.js 流式 readline，单遍扫描，内存占用与文件大小无关
- 摘要生成：任意 OpenAI 兼容 API（默认 DeepSeek Anthropic 兼容端点），通过 `CCM_LLM_API_KEY` 等环境变量配置
- UI：React Ink 终端组件，与 ccmanager 原有交互模式一致（Esc 返回 / 快捷键）

## 四、效果验证

使用真实使用数据（4 个模型、24 个会话、2,222 条消息）验证：

| 指标 | 数值 |
|------|------|
| 总成本统计 | ¥118.2 |
| 最大单一模型成本 | deepseek-v4-pro ¥108.6（91.9%） |
| 缓存读 token 总量 | 202.1M（占总输入 97%+） |
| 摘要生成端到端耗时 | < 10s（60 条消息截断） |

**单元测试**：新增 17 个测试用例，覆盖解析容错、聚合正确性、价格匹配、摘要 JSON 容错、markdown 往返一致性；原项目 57 个测试全部保持通过（零回归）。

## 五、使用方式

```bash
# 启动后主菜单新增两个入口
$ Cost Dashboard      # 成本仪表盘
S Session Summaries   # 会话摘要浏览
```

成本价格自定义：
```bash
# ~/.config/ccmanager/pricing.json
{ "deepseek-v4-pro": { "input": 2, "output": 8, "cacheRead": 0.5, "cacheWrite": 2 } }
```

摘要功能需要配置 LLM 凭证：
```bash
export CCM_LLM_API_KEY=sk-xxx
export CCM_LLM_BASE_URL=https://api.deepseek.com/anthropic  # 可选，默认即此
export CCM_LLM_MODEL=deepseek-v4-pro                        # 可选
```

## 六、迭代计划

- [ ] 预算预警的通知集成（超支时推送桌面通知）
- [ ] 摘要质量评测集（构建 benchmark 对比不同 prompt 的效果）
- [ ] 多 agent 会话目录支持（Codex / Gemini 的会话数据）
- [ ] 按日/周的成本趋势折线图

## 许可证

与原项目一致：MIT License
