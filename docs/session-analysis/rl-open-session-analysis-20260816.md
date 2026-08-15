# RL-open 会话思维链分析：anchored-standard-open 首跑（2026-08-16）

对象：`RL-open/`（Minecraft 复刻），预设 `anchored-standard-open`（新预设首跑：首轮严格官方
Minimal RL 接口锚定 + 晋升后全开），DeepSeek V4 Pro / reasoningEffort=max / Windows。会话 `fb6443f2`
（3:30 起，单 turn，126 steps，无追问轮）。

用户观察：**效果较好（与 B3 同档）；操作键的按键方向解算有问题；可以游泳**。用户未报告水渲染问题。

## 1. 宏观轨迹

- **首轮锚定实测成功**：`request/header`（reason: initial）= tools(2) `[bash, str_replace_editor]`，
  system = `You are a helpful software engineer assistant.`（46 字符，minimal 原样），maxTokens 256000，
  contextWindow 1000000。无 skill 注入、无 AGENTS.md、无 runtime context——与官方 minimal 完全一致。
- **晋升实测成功**：step 2（首个工具调用后）`request/header`（reason: change）= **63 工具全开** +
  skill-catalog 注入恢复（15 项 skill 列表）。system 保持一句 persona；AGENTS.md 未注入是因为项目目录
  没有 AGENTS.md 文件（注入器按目录查找，合理空，非缺陷）。
- **首轮行为**：仅 1 次 bash 探测调用；**str_replace_editor 全程 0 调用**——模型晋升后选用 dsh 原生
  edit/write 组合。
- 139 次工具调用：playwright 系 74（evaluate 39 / navigate 10 / wait_for 9 / console_messages 5 / click 4）、
  edit 31、write 13、bash 13、read 3、read_image 1、todo_write 2、pwsh 1、job_output 1、job_kill 1。
- 交付：1 个 commit `bc5fcba`（"feat: 实现网页版我的世界 WebCraft（体素地形、第一人称、方块交互、昼夜循环）"），
  7 个模块文件；`package-lock.json` 工作区未提交。完成报告：81 区块构建、像素无黑屏、射线破坏/放置生效、
  网格自动重建、跳跃/飞行/落地物理正常、存档跨刷新恢复、控制台零错误。

## 2. 微观指纹（交付 Context 138,669 tokens；密度 = 次/1k tokens，大小写不敏感口径）

口径同综合报告 0.3：交付链路 = 唯一 turn（1–126 steps）；分母 = 交付末尾单 Context（provider usage 权威值，
**不累积**）；块内 join("")、块间 join("\n")。

| 信号词 | **RL-open** | UP（最好） | B1（最好） | B3（较好） | BB（不行） |
|---|---:|---:|---:|---:|---:|
| let me | 36（0.26） | 2（0.02） | 128（0.65） | 37（0.33） | 6（0.04） |
| we 家族合计 | **241（1.74）** | 305（3.32） | 96（0.49） | 293（2.63） | 566（3.44） |
| we（裸）| 50（0.36） | 44（0.48） | 50（0.26） | 72（0.65） | 138（0.84） |
| let's | 100（0.72） | 107（1.17） | 20（0.10） | 112（1.00） | 192（1.17） |
| we should | 3（0.02） | 13（0.14） | 0（0.00） | 3（0.03） | 18（0.11） |
| **potential** | 20（0.14） | 134（1.46） | 11（0.06） | 14（0.13） | 21（0.13） |
| could | 94（0.68） | 146（1.59） | 71（0.36） | 143（1.28） | 215（1.31） |
| should | 50（0.36） | 49（0.53） | 80（0.41） | 62（0.56） | 104（0.63） |
| can | 91（0.66） | 132（1.44） | 62（0.32） | 117（1.05） | 169（1.03） |
| need | 20（0.14） | 74（0.81） | 29（0.15） | 58（0.52） | 96（0.58） |
| maybe | 139（1.00） | 240（2.61） | 100（0.51） | 216（1.94） | 299（1.82） |
| hmm | 10（0.07） | 7（0.08） | 36（0.18） | 19（0.17） | 42（0.26） |
| **fine** | **182（1.31）** | 119（1.30） | 146（0.75） | 157（1.41） | 146（0.89） |
| test | 63（0.45） | 72（0.78） | 130（0.66） | 77（0.69） | 106（0.64） |
| check | 72（0.52） | 46（0.50） | 93（0.47） | 103（0.92） | 90（0.55） |
| I 家族合计 | 57（0.41） | 5（0.05） | 253（1.29） | 63（0.57） | 25（0.15） |

块长 p50 = **430 字符**（standard 437 几乎一致）——**晋升后块粒度立即回到 standard 形态**
（对比 anchored 98/99 为 111/144、BB 630）；max = 65,792 字符 = step 3 晋升后首个完整架构设计块。

句首 Top：`let:132（let's 主导）/ good:80 / we:73 / fine:67 / also:61 / use:60 / but:54 / could:50 / now:46 / water:28`
——**"Let's …" 主动规划型 + "Good/Fine" 验收确认型**（对比 BB 现象报告型、B1"我看见什么"型、UP potential 型）。

let me 搭配动词：执行类为主（inspect/write/run/check/plan/design/clean/compute/modify/fix/edit/implement/
test/read/apply），发散词极少（also:3、think:2，占比低）；**let's 搭配 100% 执行类**
（check:8/test:7/do:7/add:6/write:5/inspect:4/define:4/set:4/try:3/implement:3）。

## 3. 思维链三段深读

### 3.1 锚定接口成立，但锚定期只有 1 个 step

首轮（step 1–2）：1 次 bash 探测（无 str_replace_editor），推理里已有 4 次 let me；step 2 晋升后
**step 3 立即产出 65,792 字符的完整架构设计**（"Let me design carefully for quality"——文件结构、
9 种方块、程序化纹理图集、噪声/FBM、区块存储、隐藏面剔除网格、水/玻璃/树叶透明处理、输入系统、
昼夜光照、存档），随后 123 个 step 按此蓝图推进。

**关键对比**：anchored-standard 98/99（let_me=1/0）与 BB（let_me=6）是全程 minimal 轨迹——那些预设
晋升后工具面仍是"resident 隐藏式小集合"（模型全程只见少量工具）。RL 晋升即 63 工具全开，轨迹立刻
回归 standard 系。**轨迹锚定 = 工具面约束的持久性，不是 schema 的一次性效应**；新预设"首轮锚定+晋升
全开"的设计决定了锚定天然只作用于首轮。

### 3.2 方向解算：推导与验证都在 yaw=0 退化点自洽（用户实测 bug）

用户实测"操作键的按键方向解算有问题"。思维链证据：

- **step 11 数学推导**："Player movement math review. Camera yaw: forward = (sin yaw, 0, -cos yaw);
  strafe right = (cos yaw, 0, sin yaw)。At yaw=0 → (0,0,-1) correct… At yaw=0 → (1,0,0) = +X. Correct."
  ——推导本身正确，但**验证只落在 yaw=0**。
- **step 86 验证计划**："Simulate with p.pos.set(spawn); **yaw=0**; for 120 frames input.forward=true;
  **check z decreases**"——实测验证同样只覆盖 yaw=0 前进。
- step 59 曾质疑 three.js `camera.rotation.set` → `getWorldDirection` 的矩阵更新机制（"did we update
  camera matrix?"），最终归因于 REACH=6 射程，方向机制本身未被深挖。

**根因模式**：yaw=0 时 sin(0)=0，所有交叉项/符号误差都被消掉，退化点自洽；非零 yaw 的旋转顺序（YXZ）、
鼠标 dx→yaw 的正负、strafe 交叉项从未被推导检验或实测覆盖。**这是继 BB flipY（框架默认值盲区）之后的
第二个盲区模式：退化点验证闭合**——验证了"默认朝向正确"，没有验证"一般角度正确"。

### 3.3 水：系统性设计 + 显式实现游泳物理（用户实测可游泳）

- step 3 架构设计即含水的透明渲染规划（water 独立几何/材质）；
- step 61–62 处理"出生点在水下"的物理（水面站立/游泳判定）；
- **step 74 显式实现游泳浮力**："Deep water: can't ascend. Add simple buoyancy/swim… gravity reduced,
  jump keeps speed… Implement in player.update: inWater"；
- step 93–117 持续验证水（句首 water=28）。
- 用户实测"可以游泳"✓，**且未报告水渲染问题**——与此前"几乎所有会话水渲染都有问题（仅 T 系列某会话
  例外）"的模式形成对照，RL 成为目前唯一一个用户未报水问题的非 T 会话样本。

### 3.4 验证风格：覆盖面广，但角度单一

playwright 74 次（evaluate 39 为主）重验证；完成报告逐项声明（81 区块/无黑屏/射线/网格重建/物理/存档/
零控制台错误）。验证粒度细、覆盖面广，**但交互验证集中在默认朝向**——方向解算漏网，与宏观结论
"验证粒度 ≥ 缺陷粒度"对照：这里验证**粒度**够，**角度**不够。

## 4. 与既有结论的对照

| 之前结论 | 本会话验证 |
|---|---|
| 首轮窄工具面锚定 → minimal 轨迹（let_me≈0） | **仅首轮成立**：RL 首轮接口与官方 minimal 逐字节一致，但 step 2 即晋升，全程 let_me=36（0.26）为中间带 |
| 轨迹指纹 ≠ 能力 | 再次成立：RL 轨迹介于 anchored 带（we 2.6–3.4）与 standard 带（we 0.5–0.9）之间（1.74），评级较好——中间带轨迹对应中间质量 |
| 轨迹锚定与工具面持续时间成正比 | **新结论**：旧 anchored 全程小工具面 → 全程 minimal 轨迹；RL 晋升即全开 → 轨迹立即回归 standard 系。issue #11 的 5/5 全程锚定（工具面从不扩大）不矛盾 |
| potential 是好会话指纹 | RL 0.14（与 BB/B3 并列第二档）——预判了已知风险点，但方向解算（未知的旋转行为）不在预判清单，同 BB flipY 模式 |
| 验证粒度 ≥ 缺陷粒度 | 粒度细但角度单一：默认朝向全覆盖、非零 yaw 零覆盖——**退化点验证闭合**是新盲区模式 |
| 水渲染几乎全有问题 | **对照样本**：RL 显式实现游泳浮力 + 用户未报水渲染问题 |

**新发现 1（锚定机制）**：`str_replace_editor` 存在 ≠ 被使用——首轮模型只用 bash 探测，晋升后在 63 工具里
选 edit/write。锚定接口的"纯净性"（首轮 request 只有 2 工具）成立，但模型的实际工具选择由任务形态决定
（全栈项目 → bash + 文件编辑组合）。

**新发现 2（fine 词）**：fine=182（1.31，全会话次数第一、密度第二，仅次于 B3 1.41）+ hmm=10（0.07，
全会话最低档）——"快速检查、频繁确认、很少悬置"的轨迹；配合句首 Good/Fine 是**验收确认型**语言。

## 5. 结论

1. **anchored-standard-open 预设机制全部按设计工作**：首轮 request = 官方 minimal 接口（bash +
   str_replace_editor + 一句 persona + 零注入）、step 2 晋升全开（63 工具 + skill 注入恢复）、无
   resident 隐藏组件、Git Bash 路径约定修复版（ed8c747）全程无路径事故。**预设本身无缺陷**。
2. **但"首轮锚定"在轨迹层面只产生微弱残留**（we 1.74 / let me 0.26 均落中间带）——**锚定效应与工具面
   持续时间成正比**：旧预设全程小工具面 → 全程 minimal 轨迹；新预设晋升即全开 → 轨迹立即回归
   standard 系。若目标是"全程 minimal 轨迹"，需要保持小工具面；若目标是"严格官方 RL 接口开局"，本预设
   达成。
3. **方向解算 bug 的思维链根因**：推导（step 11）与验证（step 86）都只在 yaw=0 退化点自洽——sin(0)=0
   消掉全部交叉项误差；非零 yaw 的旋转顺序/符号从未被覆盖。**"退化点验证闭合"是继"框架默认值盲区"
   （BB flipY）后第二个预判/验证盲区模式**，且这次的代价是用户实机按键方向错误。
4. **水**：系统性设计 + 显式游泳物理（step 74），用户实测可游泳、未报水渲染问题——与水问题普遍模式
   形成对照样本。
5. 评级"较好"（与 B3 同档）与轨迹中间带一致：质量不差于 anchored 系最优（B1/UP 带），但方向解算
   这一个用户可见缺陷把上限钉在"较好"。

## 6. 数据局限

- n=1；未核对源码（用户指示只分析思维链），方向 bug 的具体代码根因未定位。
- 用户未报水渲染问题 ≠ 水渲染必然正常（用户关注点集中在操作体验）。
- `package-lock.json` 工作区未提交（交付收尾小瑕疵）。
- 句首统计为全量（非 Top12）；块长基于聚合后 89 块。
