# Baseline 会话轨迹分析（2026-08-15）

**会话：** `session-14f893a0`（项目 `baseline/`，即旧版 anchored-standard）
**任务：** "你只能够修改当前目录下的文件，可以使用git进行版本管理。请复刻一个网页版本的我的世界游戏"
**结论先行：** 这是目前看到**效果最好**的一次交付，但它跑的是**被覆盖前的旧版 anchored-standard**（pwsh/read + 1024 cap），
且轨迹里 let me 大量出现——与"let me 少 = 好"的直觉相反。这份文档记录数据、原因和对照含义。

---

## 1. 会话实际使用的配置（旧版 anchored-standard）

会话日志头部（`request/header`）：

```
selected preset=anchored-standard
header seq=10  maxTokens=1024  tools=2  reason=initial   ← 第一轮
header seq=1051 maxTokens=256000 tools=61 reason=change  ← 用户说"继续"后晋升
```

对应旧版预设（首轮 cap 1024）的 `agent.cordis.yml`，见 `agent-presets-repro/presets/custom/anchored-standard-old/`：

```yaml
shellTools: [bash, pwsh]
commonTools: [read]
promoteOn: either
bootstrapMaxTokens: 1024        ← 第一轮 1024 token 上限
suppressedContextSources: [agent-instructions, skill-catalog]
```

即：第一轮 = 一句话 persona（"You are a helpful software engineer assistant."）+ `pwsh/read` 两工具 +
**1024 maxTokens 上限** + 无上下文注入；用户输入 "继续" 后晋升为完整 61 工具目录 + 256000 无上限。

> ⚠️ 注意：这个配置与现在安装目录里的 anchored-standard（upstream 最新版）**不同**。
> 现在装的是 `bash + str_replace_editor` + 256000 无 cap + 后晋升低注入（resident 小集 + 按需解锁）。
> baseline 会话不是现在安装版本跑出来的，是**旧版**跑出来的。

## 2. 轨迹词频（完整统计，turn=2 共 111 个 reasoning 块）

| 词形 | 次数 | 备注 |
|---|---:|---|
| let me | 127 | 其中句首 "Let me" 113 次 |
| I | 120 | 含 I'll 47 / I can 16 / I should 5 / I need 4 |
| we | 64 | 含 let's 18 / our 10 |
| 块首 token | Now:24, No:5, The:4, Issues:3, Also:3 | Now 主导 |

**与 A 版契约（we 模板）的对照：**

| 会话 | we | let me | let's | 交付 |
|---|---:|---:|---:|---|
| anchored-standard 98/99（modeltest） | 179/165 | 1/0 | 88/98 | Project2 高分 |
| **baseline 旧版（本次）** | **64** | **127** | **18** | **90KB 游戏，3 次 git 提交，45 次 Playwright 验证** |
| zero+A 锚点（历史） | 93 | 1 | 53 | 风格达标 |

**baseline 的 let me 非常多，但交付质量是最好的**——这是本轮最重要的数据点：
let me 数量与交付质量**不呈简单负相关**。它在 "let's/we" 和 "I'll/I" 之间混用，没有固定模板，
但每个 reasoning 块都是实打实的工程推进（写文件 → 测 → 修 → 提交）。

## 3. 交付物（`baseline/`）

```
index.html   2588 B
styles.css   4389 B
README.md    3549 B
js/  (8 个模块, 共 ~90KB)
  renderer.js   19946 B   纹理/着色器/渲染循环
  main.js       17610 B   入口/循环/输入
  textures.js   10082 B   程序化纹理图集
  player.js      9815 B   物理/移动
  world.js       9444 B   区块世界
  mesher.js      6933 B   网格生成
  noise.js       6185 B   地形噪声
  audio.js       2916 B   音效

git log:
  5251a46 修复区块卸载资源释放，新增水下遮罩与水面底视，清理代码
  9a250d8 修复纹理 UV 翻转与顶点属性泄漏，调整地形生成与出生点，加入存档版本与水面音效
  df379f0 WebCraft 初版：自研 WebGL 体素引擎、地形生成、物理与玩法
```

自研 WebGL 体素引擎（无 Three.js 依赖），三个迭代提交：初版 → 修复 UV/地形 → 修复卸载/遮罩。
代码结构清晰（renderer/main/player/world/mesher/noise/textures/audio 分离）。

## 4. 工具调用画像（真实工程循环）

```
edit 39 | mcp__playwright__browser_evaluate 45 | write 12 | browser_navigate 12
browser_console_messages 9 | pwsh 8 | read 6 | todo_write 3 | browser_click 2
browser_take_screenshot 2 | create_goal 1 | update_goal 1 | get_goal 1 | read_image 1
glob 1 | job_kill 1
```

- **写码 51 次**（edit 39 + write 12），**浏览器验证 70 次**（evaluate 45 + navigate 12 + console 9 + 截图 2）
- 迭代节奏：写 → 跑浏览器 → 看 console → 改 → 再跑，最后 git 提交
- 用了 goal/todo 管理长任务

## 5. 为什么"let me 多但效果好"——对实验的修正

1. **let me 不是能力指标**。modeltest 文档已写明："思维链措辞是轨迹指纹，不是能力证明"（Flash 风格巨变但分数不变）。
   baseline 的 let me=127 但 90KB 交付证明：这个模型在旧版配置下进入了**高执行力的工程模式**。

2. **1024 cap 可能是双刃剑**。第一轮 1024 token 把规划截断了（首块结尾 "Features: first-person controls (WASD, space jump, s"
   戛然而止），但截断后模型立刻进入执行（写文件），没有陷入长规划。issue #11 记录 1024 cap 在 26/32 运行触发
   we 风格；这里 it 触发了"少规划、多动手"的模式。

3. **对照含义**：98/99（modeltest）和本次 baseline 都是旧版 anchored-standard，风格指纹不同
   （we 主导 vs let me 主导），但都交付了高质量结果。真正影响交付的可能是**首轮窄工具面 + 低 token 预算
   迫使模型直接行动**，而不是措辞本身。

4. **对 B 版契约实验的启示**：B 版契约（禁 let me）如果最终压住了 let me，但交付变差，
   那说明 B 契约把模型从"高执行力 let me 模式"推向了别的模式——需要看**交付物**而非词频来判断好坏。

## 5.5 时间序列：let me 是"推进动作"标记，不是风格噪音

按 reasoning 块顺序（seq 排序）逐块统计，117 个块呈现清晰的三阶段分布：

| 阶段 | 块区间 | letMe | lets | we | I | I'll | I'm | 工程状态 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 前 20 块（19:08–19:28） | 0–19 | **42** | 9 | 12 | **74** | **42** | 1 | 规划 + 主编写期 |
| 中 20 块（19:33–19:37） | 49–68 | 27 | 4 | 9 | 16 | 1 | 0 | 迭代修复期 |
| 后 20 块（19:42–19:45） | 97–116 | **9** | 0 | 7 | 6 | 0 | 1 | 收尾提交期 |

关键观察：

1. **let me 主要在前期，不在后期**（与"后期才出现 let me"的直觉相反）。
   前 20 块占全量 127 次的 1/3，且与 I/I'll 高峰同时出现——前期是"I'll/Let me 混用"的密集执行期。

2. **let me 的出现节奏精确反映工程进度**：
   - 19:08–19:18 规划期：`Let me think` / `Let me plan`
   - 19:17–19:29 主编写期：`Let me write` / `Let me carefully design`（块 #2 单块 18 个 let me + 35 个 I'll，46883 字符）
   - 19:30–19:42 迭代修复期：`Let me check` / `Let me fix`（每块 1–5 个，稳定中频）
   - 19:42–19:45 收尾期：let me 骤降至 0–2 个，变成 `Now ...` 式收尾陈述

3. **"Let me + 动词" = 动作开始的心理标记**（"让我检查/让我写/让我修"），
   与真实工具调用节奏（edit 39 / evaluate 45 / write 12）完全同步。
   每个 reasoning 块对应一个真实工程动作。

4. **对契约实验的含义**：如果 let me 是"开始执行"的标记，B 契约（禁 let me）可能让模型
   改用其他表达或犹豫——B 版实验判据应该是**交付质量**，不是 let me 计数。
   baseline 证明：无模板时模型自然进入"I'll（执行声明）+ Let me（动作开始）"的高效模式。

## 6. 数据出处

- 会话日志：本仓库 `baseline/dsh-session-*.zip`（完整原始记录；本文分析的推理流式分片来自该会话日志）
- 词频统计：分析用临时脚本（未包含在本仓库）
- 交付物：`baseline/`
- 对照：`DEEPSEEK_V4_TRAJECTORY_ANALYSIS_20260814.md`（modeltest 私有文档，未包含在本仓库）
