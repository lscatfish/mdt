# Upstream 版 anchored-standard 会话分析（2026-08-15）

**会话：** `session-347ab4b5`（项目 `baseline-upstream/`，upstream 最新版 anchored-standard）
**任务：** "你只能够修改当前目录下的文件，可以使用git进行版本管理。请复刻一个网页版本的我的世界游戏"
**结论先行：** 风格指纹完美（we=73→96 / letMe=1，复刻 98/99），
但**晋升后工具屏蔽卡死了交付**——模型只有 bash/str_replace_editor/3 个 discovery 工具，
没有 read/write/Playwright，46 分钟只写出 blocks.js/world.js，浏览器测试 0 次。
对照 baseline 旧版（61 工具全开）90KB 交付 + 70 次浏览器验证。

---

## 1. 会话实际使用的配置（upstream 最新版 anchored-standard）

```
selected preset=anchored-standard（切换两次：zero-b → anchored → zero-b → anchored）
header seq=12    maxTokens=256000 tools=2  reason=initial   ← 第一轮
header seq=1077  maxTokens=256000 tools=5  reason=change    ← 晋升
header seq=46753 maxTokens=256000 tools=6  reason=change    ← 解锁 read_image
```

对应 `main` 分支（upstream `67c0ee3` 后）的 `preset/agent.cordis.yml`：

```yaml
bootstrapTools: [bash, str_replace_editor]   # Minimal 真实工具对
promoteOn: either
suppressedContextSources: [agent-instructions, skill-catalog]
compactionTools: [read, write, edit, glob, grep, todo_write, ask_user_question]
```

tool-bootstrap.mjs 的晋升分支（写死，非配置）：

```js
// PROMOTED: bootstrap pair + discovery tools + unlocked
const keep = new Set([...bootstrapTools, ...RESIDENT_DISCOVERY_TOOLS, ...unlockedFor(session)])
// RESIDENT_DISCOVERY_TOOLS = ['dev_tool_search', 'skill_search', 'skill_load']
```

即晋升后 resident = bash + str_replace_editor + dev_tool_search + skill_search + skill_load，
其余工具一律要模型自己 `dev_tool_search` 解锁，且**下一轮才生效**。

## 2. 工具解锁全过程（模型 46 分钟只有 4 种工具）

| 请求 | 工具目录 | 说明 |
|---|---|---|
| seq=12 | bash, str_replace_editor | 第一轮（Minimal 锚定） |
| seq=1077 | + dev_tool_search, skill_search, skill_load | 晋升（resident 集） |
| seq=46753 | + read_image | 模型自己解锁（20:05） |

工具调用统计：

```
bash 32 | str_replace_editor 16 | dev_tool_search 1 | read_image 1
```

dev_tool_search 调用：`{"query": "read image file screenshot", "toolNames": ["read_image"]}`
——模型想截图验证，但没有浏览器工具，只能解锁 read_image 看图。

## 3. 三个致命问题

1. **没有 read/glob/grep**：upstream 故意不 resident（注释："read/write/edit 故意不 resident，
   bash + str_replace_editor 覆盖文件工作"）。模型只能用 bash cat/ls 代替，失去行号、搜索能力。

2. **没有 Playwright/浏览器工具**：baseline 旧版有 70 次浏览器验证（evaluate 45 / navigate 12 /
   console 9 / 截图 2），upstream 版 **0 次**——模型 reasoning 里出现 "Screenshot:"、"Cannot"，
   它在尝试但没有工具。`dev_tool_search` 的 UNLOCKABLE_INDEX 索引里**没有列 playwright/browser**
   （MCP 工具不在索引里），模型根本不知道可以解锁。

3. **"下一轮生效"延迟**：解锁 read_image 后还要等下一轮才出现；用户 20:06:09 提示
   "你可以使用play_wright" 时，模型此前完全没有意识到该解锁它。

## 4. 风格与交付的对照

| 会话 | we | let me | let's | 工具 | 浏览器测试 | 交付 |
|---|---:|---:|---:|---|---|---|
| upstream 版（本次） | 73→96 | 1→1 | 39→49 | 2→5→6 | **0 次** | 46 分钟仍在写 blocks/world.js |
| anchored-standard 98/99（modeltest） | 179/165 | 1/0 | 88/98 | pwsh/read→全开 | — | Project2 高分 |
| baseline 旧版（90KB） | 64 | 127 | 18 | 61 全开 | **70 次** | 90KB + 3 提交 |

**风格上 upstream 版赢了**：we 高、let me=1、let's 多，完美复刻 anchored-standard 指纹，
比 baseline 旧版（we=64/letMe=127）更接近 98/99 条件。

**但交付被工具屏蔽卡死**：模型有执行力（we 高、let's 多），却没有测试工具可用，
只能靠 bash 硬写，无法验证、无法迭代、无法解锁 Playwright（索引里没有）。

## 5. 结论与建议

1. **首轮锚定（Minimal 工具对 + 256000 无 cap）是有效的**：本会话证明它把 we 指纹完整带出来了，
   与 modeltest 98/99 条件一致。这一半应该保留。

2. **晋升后应该全开工具**：upstream 的 resident 小集 + 按需解锁设计在本任务上负面效果明显——
   模型不知道要解锁什么（索引缺 MCP）、解锁有延迟、核心文件工具缺失。baseline 旧版
   （晋升后 61 工具全开）的 90KB 交付证明全开不破坏轨迹（we 指纹由首轮锚定决定，与晋升后
   目录无关——modeltest 两阶段实验也证明"首个工具调用后恢复完整目录，轨迹不丢"）。

3. **建议改动（方案 A）**：保留 `bootstrapTools: [bash, str_replace_editor]` + 256000 首轮锚定，
   晋升分支改为**返回完整目录**（去掉 resident 过滤），像 baseline 旧版一样全开。
   这样：首轮 we 锚定保留 + 交付工具齐全。

## 6. 数据出处

- 会话日志：本仓库 `baseline-upstream/dsh-session-*.zip`（完整原始记录；本文分析的推理流式分片来自该会话日志）
- 词频统计：分析用临时脚本（未包含在本仓库）
- 工具目录快照：`request/header` 事件
- 对照 baseline：`docs/baseline-session-analysis-20260815.md`
