# 思维链微观指纹分析：词频、短语与搭配动词（2026-08-15）

对象：Baseline1（14f893a0）、Baseline2（9f916db0）、Baseline3（d5cc2a80）、Baseline-Upstream（347ab4b5）、Try1（a0c8952d）、Try2（7c5cdb82）、Try3（58fbb8be）。
用户实测评级：**Baseline1 与 Upstream 无 bug 最好**；其余五个各有缺陷（B2 半格错位、B3 边角碰撞、Try1/2 贴图混色、Try3 全透明）。
本文从**微观词/短语级**对比好会话与差会话的思维链（此前宏观结论见 baselines-joined-analysis-20260815.md）。

## 1. 高频词指纹

密度单位：**次 / 1k tokens**。口径：交付链路 = 任务消息（含"继续"轮）至"通知完成"；
分母 = **交付链路末尾的单 Context token**（最后一步请求的完整 prompt = 未缓存输入 + 缓存命中输入，
取自会话日志中 provider 返回的 usage，官方 tokenizer 统计；系统提示/工具 schema 一并计入），
**不累积**（各 step 输入相加会重复计数）；大小写不敏感；块内 join("") 保短语完整。
交付 Context token：B1 196k / UP 92k / B2 168k / B3 111k / T1 158k / T2 150k / T3 156k。

| 信号词 | **UP（好）** | **B1（好）** | B2 | B3 | T1 | T2 | T3 |
|---|---|---|---|---|---|---|---|
| **potential** | **1.46** | 0.06 | 0.07 | 0.13 | 0.09 | 0.07 | 0.04 |
| **test** | 0.78 | 0.66 | 0.35 | 0.69 | 0.46 | 0.66 | 0.48 |
| check | 0.50 | 0.47 | 0.62 | 0.92 | 0.83 | 0.61 | 0.70 |
| fine | 1.30 | 0.75 | 1.07 | 1.41 | 0.84 | 0.91 | 0.79 |
| maybe | **2.61** | 0.51 | 0.67 | 1.94 | 0.64 | 1.02 | 0.47 |
| hmm | 0.08 | 0.18 | 0.17 | 0.17 | 0.16 | 0.21 | 0.55 |

### 发现 1：`potential` 是 UP 的专属指纹
- UP：**134 次，1.46/1k tok，句首 126 次**（"Potential issue: ... / Potential bug: ... / Potential material alpha issue..."）
- 其余 6 个会话全部 ≤14 次（≤0.13/1k tok）——**差 11 倍以上**
- 含义：**动手前预判问题**的句式。UP 几乎每个里程碑都在主动列举潜在 bug 并排查

### 发现 2：`test`/`check` 是 B1 的指纹
- B1：test=130（0.66/1k tok）＋具体现象词（black=104、null=74）
- B1 的验证思维是"**我看见什么、对不对**"（"t0→BLACK、t1→BLACK"），不是抽象的"测试通过"
- **注意**：B1 的 test 密度（0.66）与 UP（0.78）接近——B1 工具调用多（write 代码 90KB），
  单 Context（196k）是 UP（92k）的 2.1 倍，稀释了密度；次数仍是 B1 最高（130）

### 发现 3：差会话的"伪信号"
- fine/maybe 密度不区分好坏（UP 的 maybe 最高 240 次 2.61——UP 的 maybe 是"maybe we should test X"探索，差会话的 maybe 是"maybe it works"悬置）
- `hmm` 弱负信号：T3（0.55/1k tok）是 UP（0.08）的 7 倍——全程犹豫

## 2. 短语密度（次/1k tokens）

口径同第 1 节（交付链路 = 任务至"通知完成"，单 Context 分母 = 交付末尾一次请求的完整 prompt token）；
大小写不敏感；`we（裸）`/`I（裸）`已扣除组合短语内的代词——
**明细密度相加 = 家族合计密度**（括号内为次数）。

| 短语 | **B1** | **UP** | B2 | B3 | T1 | T2 | T3 |
|---|---|---|---|---|---|---|---|
| we（裸）| 0.26 (50) | 0.48 (44) | 0.24 (41) | 0.65 (72) | 0.20 (32) | 0.57 (86) | 0.17 (27) |
| let's | 0.10 (20) | 1.17 (107) | 0.33 (55) | 1.00 (112) | 0.06 (10) | 1.02 (153) | 0.03 (5) |
| we can | 0.04 (7) | 0.93 (85) | 0.12 (20) | 0.55 (61) | 0.04 (7) | 0.50 (75) | 0.03 (5) |
| we'll | 0.03 (5) | 0.47 (43) | 0.10 (16) | 0.20 (22) | 0.06 (10) | 0.26 (39) | 0.03 (4) |
| we need | 0.01 (2) | 0.07 (6) | 0.02 (4) | 0.06 (7) | 0.01 (1) | 0.16 (24) | 0.02 (3) |
| **we should** | 0.00 (0) | **0.14 (13)** | 0.00 (0) | 0.03 (3) | 0.00 (0) | 0.06 (9) | 0.01 (2) |
| our | 0.05 (10) | 0.08 (7) | 0.05 (8) | 0.13 (15) | 0.04 (6) | 0.37 (56) | 0.22 (34) |
| 其他 we 组合（we're/we've/we'd/we would）| 0.01 (2) | 0.00 (0) | 0.01 (1) | 0.01 (1) | 0.03 (5) | 0.01 (1) | 0.03 (5) |
| **we 家族合计** | 0.49 (96) | 3.32 (305) | 0.86 (145) | 2.63 (293) | 0.45 (71) | 2.96 (443) | 0.54 (85) |
| let me | 0.65 (128) | 0.02 (2) | 0.46 (77) | 0.33 (37) | 0.85 (135) | 0.10 (15) | 1.00 (156) |
| I（裸）| 0.36 (70) | 0.02 (2) | 0.17 (28) | 0.13 (15) | 0.27 (42) | 0.10 (15) | 0.61 (95) |
| I'll | 0.24 (47) | 0.01 (1) | 0.08 (14) | 0.09 (10) | 0.40 (63) | 0.03 (5) | 0.26 (41) |
| **I should** | 0.04 (7) | 0.00 (0) | 0.03 (5) | 0.00 (0) | **0.08 (13)** | 0.00 (0) | 0.03 (5) |
| I'm | 0.01 (1) | 0.00 (0) | 0.00 (0) | 0.00 (0) | 0.00 (0) | 0.01 (1) | 0.00 (0) |
| I've | 0.00 (0) | 0.00 (0) | 0.01 (2) | 0.00 (0) | 0.01 (1) | 0.00 (0) | 0.00 (0) |
| I'd | 0.00 (0) | 0.00 (0) | 0.02 (4) | 0.01 (1) | 0.00 (0) | 0.00 (0) | 0.01 (1) |
| **I 家族合计** | 1.29 (253) | 0.05 (5) | 0.77 (130) | 0.57 (63) | 1.61 (254) | 0.24 (36) | 1.91 (298) |

### 发现 4：风格两极但质量同优

- UP/B2/B3/T2 = we 型（we 家族密度 0.86-3.32）；T1/T3/B1 = I 型（I 家族密度 1.29-1.91）；**但两极最好的会话（B1、UP）风格完全相反**
- **we should 与 I should 主语跟随代词家族**：we should 几乎只在 we 型（UP=0.14、T2=0.06、B3=0.03），I should 只在 I 型（T1=0.08、B1=0.04、T3=0.03）——**should 的规划语言由家族定型，但两家族都有好会话，主语本身不预测质量**

## 3. 搭配动词（真正的信号）

`let me` 后面跟的动词 Top：

| 会话 | let me + 动词 | 性质 |
|---|---|---|
| **B1（好）** | check:12, test:9, write:7, run:6, verify:5, edit:5 | 全执行/验证 |
| **UP（好）** | 仅 2 次（first/design）| 几乎不用 |
| T1（差） | write:13, check:10, do:10, also:9, think:6 | 混入发散词 |
| **T3（差）** | write:13, **also:18**, check:9, **think:9**, **just:6** | **发散词主导** |
| B2/B3/T2 | check/write/do 为主，少量 also | 中间态 |

### 发现 5：数量相同，质量相反
- **T3 的 let me + also:18**：思维链里全是"let me also consider X / let me also think about Y"——**追加式发散**
- **let me just / let me think about**：悬置不落地
- **B1 的 128 个 let me 全部通向动作**（check/test/write/run/verify——每个都是执行动词）
- **UP 的 let's + 动词**：run:11, check:7, patch:6, define:5, test:4——同样全部执行类

## 4. 句子开头统计

| 会话 | 句首 Top |
|---|---|
| **UP** | potential:126, could:113, we:110, let's:103, good:96, but:95, fine:83, need:58 |
| **B1** | let:112, but:78, also:76, now:74, so:54, use:51, if:41, i'll:40, actually:39 |
| T3 | let:143, the:100, also:100, hmm:68, but:65, now:51, no:49 |

- `but` 句首（反思转折）：B1=78、UP=95——"X works **but** Y might..." 主动找问题
- `actually` 句首（自我修正）：B1=39、UP=29
- **T3 的 hmm 句首 68 次**（全会话最高，UP 仅 9）——犹豫型思维链

## 5. 情态动词（need/should/can/could/might）与搭配

### 5.1 密度（次/1k tokens，口径同第 1 节）

| 词 | **UP（好）** | **B1（好）** | B2 | B3 | T1 | T2 | T3 |
|---|---|---|---|---|---|---|---|
| need | **0.81** | 0.15 | 0.20 | 0.52 | 0.27 | 0.41 | 0.19 |
| should | 0.53 | 0.41 | 0.42 | 0.56 | 0.33 | 0.34 | 0.29 |
| can | **1.44** | 0.32 | 0.46 | 1.05 | 0.40 | 0.83 | 0.42 |
| could | **1.59** | 0.36 | 0.53 | 1.28 | 0.37 | 0.70 | 0.33 |
| might | **0.26** | 0.09 | 0.15 | 0.15 | 0.11 | 0.21 | 0.15 |
| must | 0.03 | 0.04 | 0.06 | 0.09 | 0.08 | 0.10 | 0.08 |

### 5.2 发现 6：UP 是情态动词之王；T3 情态并不贫乏

- **UP：need/can/could/might 四项全会话最高**（0.81/1.44/1.59/0.26）——"we need X / we can Y / could be Z / might break"：需求+能力+可能性探索语言
- **B3 的 should 全会话最高**（0.56）；B1（0.41）的 should 后接 check/plan/produce——规范性反思
- **T3 的 need/can/could 全为中位**（0.19/0.42/0.33），并非最低——旧"T3 情态贫乏"结论是链路累积分母（T3 reasoning 长）的稀释假象，单 Context 口径下不成立

### 5.3 发现 7：should 后的动词分好坏

| 会话 | should + 动词 Top | 性质 |
|---|---|---|
| **B1** | be:31, have:5, show:4, produce:2, plan, check, initialize | 规划+执行 |
| **UP** | be:7, use:5, map:3, show:3, consider:2, persist | 技术规范（"should map to v = 1 - tileY/16"）|
| B2 | be:23, show:8, build:2, proceed, create | 选型后执行 |
| B3 | be:16, work:6, run:3, check, render | 中间态 |
| T1 | be:11, hit:4, ask, acknowledge, check | I-should=13（唯一高）|
| **T3** | be:16, work:5, show:2 | **"should work"（验收假设，非验证）** |

- **T3 的 should + work:5**："should work; Playwright connects..." —— 把"应该能跑"当验收标准
- **B1 的 should + check/plan/produce** —— 把"应该"导向行动
- 主语：I-should 最高是 T1（13，I 系契约），we-should 最高是 UP=13/T2=10（we 系契约）——与代词家族一致

### 5.4 need 的搭配

- **UP**：we need + ensure:5/create:3/test:3/inspect:2 —— "we need ensure..."（省略 to 的祈使需求）
- **B1**：need to + build/create/check/verify + need-N（neighbor/per/actual/ensure）—— "need to verify/check" 验证导向
- **T3**：need to + be/call/change —— 最少最弱

## 6. 结论：微观质量判据

1. **`potential`（预判）是 UP 的无 bug 指纹**：动手前先枚举潜在问题
2. **`test/check + 具体现象`是 B1 的无 bug 指纹**：验证时报告"看见了什么"，而非"通过"
3. **代词本身无关，代词后的动词才相关**：好会话 = 执行/验证动词（check/test/write/verify/run/patch/fix），差会话混入发散动词（also/think/just/maybe）
4. **`fine/maybe` 不是信号**（密度不区分好坏），`hmm`、`let me also`、`let me think`、`let me just` 是弱负信号
5. 光有 potential 词不够：B2 也写过 "Potential issues to watch"（12 次），但词后没有跟排查动作——**词必须驱动行动**（与宏观"思考闭合"结论一致）

## 7. 对提示词工程的启示（微观脚手架）

在 standard-first-block-prompt 基础上可追加（可选）：
- 每个 `let me / let's / we can` 之后必须跟执行动词（check/test/write/verify/run/fix/patch/define）
- 禁止悬置句式：`let me also`、`let me think about`、`let me just`
- 每个里程碑先写一行 "Potential issue: ..." 枚举，再逐个验证
- 验证报告格式："我采样/断言了什么 → 观察到什么 → 对不对"（现象优先，不用"fine/ok"收尾）

---

# 附录 A：modeltest（Project2）11 样本交叉验证（2026-08-16）

数据源：`D:\code\modeltest\evaluator\trajectory_evidence\derived\trajectory_stats.json`
（10 个完成态样本 + 两份 anchored-standard 评审）。这是同一套微观指标在**另一个任务
（Python+ESP32 维护工程，45 项 hidden 测试）**上的独立复验。

## A.1 样本总览

| 样本 | 分数 | let_me/1k | we | i | p50 字符 | 块≈调用比 | Good.首行 | 可见回复 | 句首 Top |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| anchored-standard r1 | **98** | **0.006** | 179 | 17 | **111** | 0.80 | 9 | 1 | now/update/need/good/**potential** |
| anchored-standard r2 | **99** | **0** | 165 | 18 | **144** | 0.81 | 10 | 1 | now/good/update/continue/**potential** |
| minimal r1 | **99** | **0** | 272 | 17 | 235 | 0.91 | 28 | 1 | good/now/need/**potential** |
| minimal r2 | **96** | **0** | 231 | 18 | 239 | 0.88 | 16 | 1 | now/good/need/**potential** |
| gray r1/r2（OpenCode） | 99/96 | 0.28/0.11 | 4/2 | **137/172** | 285/336 | 0.36/0.34 | 0 | 24/25 | **i/i'm/the** |
| flash-minimal | 92 | 0 | 209 | 9 | 128 | 0.97 | 16 | 1 | **need(44)**/now/good/maybe |
| standard | 91 | **1.38** | 11 | 137 | 437 | 0.52 | 4 | 55 | now/the/wait |
| PTC | 92 | **1.17** | 16 | 237 | 550 | 0.57 | 0 | 33 | now/the/while |
| formal（OpenCode） | 93 | **1.08** | 17 | 216 | 973 | 0.43 | 1 | 37 | now/the/wait |
| flash-formal | 92 | **1.27** | 5 | 108 | 365 | 0.45 | 0 | 47 | now/also/the |

## A.2 `potential` 句首检出率（次/1k 字符；括号为次/1k 块）

| 样本 | 分数 | potential 句首 | 检出率 |
|---|---:|---:|---:|
| minimal r1 | 99 | 11 | 0.048（62/1k 块） |
| anchored r1 | 98 | 7 | 0.043（36/1k 块） |
| anchored r2 | 99 | 6 | 0.037（37/1k 块） |
| minimal r2 | 96 | 5 | 0.031（33/1k 块） |
| **其余 7 样本（standard/PTC/formal/gray/flash 全部）** | 91–93 | **0** | **0** |

- 检出仅限**句首 Top12 词表**（modeltest 聚合只保留 Top12，实际值 ≥ 检出值）；
  全词 potential 密度需原始 JSONL，本机无副本（manifest 仅存 SHA-256）。
- **结论：`potential` 句首只出现在 Pro 的 minimal/anchored 轨迹（96–99 分），
  非 minimal 样本 0 检出——与 UP（1.46/1k、句首 126 次）跨任务同向。**

## A.3 情态词句首检出（Top12 内）

| 词 | minimal r1/r2 | anchored r1/r2 | flash-minimal | 其余 7 样本 |
|---|---:|---:|---:|---:|
| need | 14/13 | 9/3 | **44** | 0 |
| potential | 11/5 | 7/6 | 0 | 0 |
| could | 0 | 0 | 4 | 0 |
| maybe | 0 | 0 | 7 | 0 |
| should/would/might/must/can | 0 | 0 | 0 | 0 |

- `need` 句首只出现在 minimal 系（"Need ..." 是晋升后轨迹的标准开头，trigger 实验文档
  同述）；UP 的 need 句首 58 次同向。
- `potential` 句首是 **Pro 专属**：flash-minimal 同 prompt 同工具面却 0 检出
  （Flash 用 need 型）。与 Minecraft 一致：potential 标记 Pro 的高分策略区域。
- should/would/might/must/can 句首全 0——这些词多用于句中，句首本就少见；
  **全词密度无法从公开聚合数据计算**，需原始日志。

## A.4 与 9 会话结论的对照

| 之前的结论 | modeltest 复验 | 修正 |
|---|---|---|
| letMe 计数不预测质量（中间带） | ≤0.3/1k 全 96–99；≥1.0/1k 全 91–93 | 升级为**两极弱指纹**：两端有判别力，中间带（0.3–1.0）无 |
| 代词本身不预测质量 | gray 用 I 型（i=137–172）照样 99；we 型/let-me 型并存 | **三态轨迹确认**：We 型 / Let-me 型 / I 型 |
| 代词后动词才相关 | 高分句首=执行类（update/continue/run/build/add），低分=发散类（wait/interesting/hmm/also） | **跨任务成立**（modeltest 未做此分析，本次补上） |
| 块短而密、闭合块后必调工具 | 高分 p50≤336、块≈调用比 0.8–0.9；低分 p50≥437、比 0.43–0.57 | **最稳定的宏观指纹** |
| potential 是好会话指纹 | 句首 potential 只出现在 96–99 的 minimal 系 | **跨任务成立**（Pro 专属） |
| 词形不预测质量（Flash 反例） | flash-minimal 轨迹完全 minimal 化（let_me=0/we=209）但 92 分不动 | **最强反例**：轨迹指纹 ≠ 能力 |

## A.5 数据局限

- 每配置 n=1–2；同题同渠道；anchored-standard 双跑 98/99 是 8/14 评测形态
  （`e1277b5`，纯工具面锚定，无 cap 无注入剥离），非当前安装形态。
- 句首统计只含 Top12；全词情态/`potential` 密度待原始 JSONL（私有证据目录）。
- 跨 harness（DSH vs OpenCode）的消息切分不一致，数值用于画像不用于直接比较。

---

# 附录 B：anchored-standard 版本号跟踪（2026-08-16）

| 版本 | 提交 | 机制 | 验证 |
|---|---|---|---|
| modeltest 冻结快照 | xiaobright `e1277b5`（feat: publish）+ DSH `47f9438` | **纯工具面锚定**：首轮 wire 只暴露 [shell, read]，首个 tool/call 后恢复 25 工具；system prompt = minimal 完整版；不拦任何注入、无 cap | Project2 **98/99**（8/14 双跑）✅ |
| 加固 | `1154719` | promoteOn: either（首轮无工具调用也不卡死）+ 防呆降级 | — |
| 旧版（fork 基线） | `7f49fb9` | 工具过滤保留 + **新增两机制**（8/15 复现工作 issue #6）：① 首轮 maxTokens=1024 cap（复现 26/32 vs 0/5）；② 首轮剥离 skill-catalog + agent-instructions 注入（在场 0/9 → 剥离后 ~81%） | 复现实验 ✅ |
| 演进 | `65ca3ce` / `c774e60` / `a1e1c1d` / `67c0ee3` | 抑制自动注入上下文 / prepend 时序修复 / minimal 真实工具 schema（#11）/ 晋升后低注入 | — |
| **当前安装** | lscatfish `2fe098a`（与安装目录逐字节一致） | = 工具过滤 + 注入剥离；**cap 已关**（= 评测版的无 cap 形态） | Minecraft 9 会话（UP 无一眼可见 bug） |

**场景区别一句话**：两者首轮都是"只给 2 个工具、首轮结束后恢复 25 个"；评测版除此之外
**什么都不做**，当前安装版**额外把首轮的 skill 目录和 AGENTS.md 注入剥掉**（cap 已关，
与评测版一致）。98/99 分数绑定在评测版形态，当前形态从未在 Project2 同场验证。
