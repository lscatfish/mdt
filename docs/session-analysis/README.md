# 会话分析文档集（2026-08-15/16）

对 11 个 Minecraft 复刻实验会话（4 baseline + 3 try-mc + B+template + prompt-adding + baseline-bash + RL-open）的交付实测、思维链与微观指纹分析。
对象会话：B1（14f893a0）、B2（9f916db0）、B3（d5cc2a80）、UP（347ab4b5）、T1（a0c8952d）、T2（7c5cdb82）、T3（58fbb8be）、B+T（65f36716）、PA（6121afd6）、BB（ff3a7c80）、RL（fb6443f2）。

## 文档索引

| 文档 | 内容 |
|---|---|
| [baseline-session-analysis-20260815.md](baseline-session-analysis-20260815.md) | Baseline1 单会话轨迹分析（letMe=127 却交付最好）|
| [upstream-session-analysis-20260815.md](upstream-session-analysis-20260815.md) | Upstream 会话分析（风格指纹 + 受限工具下的完整交付）|
| [baselines-joined-analysis-20260815.md](baselines-joined-analysis-20260815.md) | 四 baseline 联合分析：交付实测 + 思维链（含 B2 半格错位、验证盲区）|
| [try-sessions-analysis-20260815.md](try-sessions-analysis-20260815.md) | 三 try 会话分析：契约注入方式对比（anchor 消息 vs system prompt）|
| [micro-fingerprint-analysis-20260815.md](micro-fingerprint-analysis-20260815.md) | 思维链微观指纹过程文档：词频、短语、搭配动词、情态动词 + modeltest 交叉验证（全量结果已并入综合报告）|
| [bplus-template-analysis-20260815.md](bplus-template-analysis-20260815.md) | B+template（B 契约+模板）：草方块方向 bug、契约未跨中断保持、中等评级 |
| [prompt-adding-analysis-20260815.md](prompt-adding-analysis-20260815.md) | prompt-adding（标准模式+首块提示词）：TDD+texel 验证、黑屏根因（循环未启动）|
| [baseline-bash-session-analysis-20260816.md](baseline-bash-session-analysis-20260816.md) | baseline-bash（anchored-standard-gitbash 首跑）：路径事故思维链、flipY 渲染调试链、potential 缺预判 |
| [rl-open-session-analysis-20260816.md](rl-open-session-analysis-20260816.md) | RL-open（anchored-standard-open 首跑）：官方 minimal 接口锚定实测、方向解算 yaw=0 盲区、水系统性实现 |
| [COMPREHENSIVE-REPORT-20260815.md](COMPREHENSIVE-REPORT-20260815.md) | **综合报告（正式版）**：十一会话启动说明 + 交付实测 + 总表 + 宏观/微观全量结果 + modeltest 交叉验证 + 版本形态附录 |

## 核心结论汇总

1. **首块推理决定交付天花板**：B1/upstream 首块深度规划（勘察→清单→功能→选型→验证），B2 首块仅 425 chars 一句话选型 → 功能缩水。
2. **验证粒度决定正确性**：B1（readPixels 逐 tile）/upstream（像素分类+ASCII）验证到画面内容级；B2/Try1/2/3 停留在颜色分布/状态级 → 半格错位、mipmap 混色、全透明全部漏网。
3. **契约注入效果**：anchor 消息（零工具锚点轮）> system prompt section；A 契约（we 正向引导）> B 契约（let me 禁令）。Try2 是唯一生效样本（we=242/letMe=15）。
4. **微观指纹**：
   - `potential`（预判）是 upstream 专属指纹（134 次，其余 ≤14）
   - `test/check + 具体现象词`是 B1 指纹
   - 代词（I/we）不预测质量；**代词后的动词**才相关——好会话用执行动词（check/test/write/verify），差会话混入发散词（also/think/just）
   - 情态动词：UP/BB/B3 情态三高（合计 4.66/3.85/3.65，B3 与 UP 基本同档——could 143 vs 146 次）但**情态不预测质量**（三高里 B3 中、BB 差；最好的 B1 情态最低）；T3 情态为中位（单 Context 口径下"情态贫乏"不成立），但 "should work" 把假设当验收
5. **思考路径**：所有闭合思考块后必调用工具；B3 首轮 5.5 分钟"纯思考"是唯一例外（未闭合推理流被中止）。长思考总量无害，思考不闭合（不产出结论就持续发散）才有害。
6. **验证盲区**：B2 半格错位（颜色分布验证漏几何）、Try1/2 mipmap 混色（颜色"看起来对"）、B+template 草皮方向（验证量足但粒度没覆盖方向）、prompt-adding 黑屏（验证直接调 render 绕过真实启动路径）、RL 方向解算（推导与实测都只在 yaw=0 退化点自洽）——**验证对象必须等于真实运行路径，验证粒度必须覆盖缺陷粒度，验证角度必须覆盖一般情形**。
7. **用户实测终局评级**：B1 与 UP 最好（两者相当）；B3 与 RL 较好（B3 仅一个小 bug；RL 操作键方向解算有问题、可游泳、未报水渲染问题）；B+T 中等（草皮方向一眼可见）；PA 黑屏修复后"还行"；B2/T1/T2/T3 各有缺陷；**BB 不行**（目录+区块渲染/破坏残留）；几乎所有会话的水渲染有问题（仅 T 系列某会话例外 + RL，未核对代码）。
8. **锚定效应 = 工具面持续约束**（RL 新证据）：首轮官方 minimal 接口（[bash, str_replace_editor] + 一句 persona）实测逐字节成立，但晋升即 63 工具全开 → 轨迹立即回归 standard 系（we 1.74 / let me 0.26 中间带）——**旧 anchored 的全程 minimal 轨迹是小工具面持续约束的产物，不是 schema 一次性锚定**。
9. **实验性质 = 许愿式生成**（见综合报告 0.4）：任务提示词仅一句愿望式目标，**指令层无工程脚手架，但环境层有用户预装的能力脚手架**（4 个 MCP 服务器：playwright/codegraph/context7/server-memory + Matt Pocock 的 skills 集，项目 skill 目录注入 15 项）——11/11 会话交付可运行产物、6/11 评级中等以上（最好 2/较好 2/中等 1/还行 1），自研与 three.js 两条技术路线均完整走通，**模型原生工程能力"还是可以的"**；但方差大（最差 T3 全透明/BB 渲染残留），脚手架仍显著提高下限。**其规划性质属短程规划**：前期一次性架构设计 + 逐块思考-行动交替，无长程规划维护（todo 极少且不持续、无里程碑跟踪；B+T 中断 4h 恢复后约束未保持——全部会话 Context <300k，并非长会话）。
10. **结论边界（见综合报告 0.5）**：唯一可外推结论 = 原生工程能力可用；微观语言特征（let me / I'll / we need / we should 等）**不构成能力检测**，第 5 节统计均为描述性观察；许愿式生成单任务样例**不代表其他场景**；已知不严谨：**Full access 开启时机不一致**（有的开头开、有的中途开）+ **n=1 未重复跑**；**仅供参考，不保证可复现，结论不保证为真**。

## 提示词工程启示（对应文档第 6/7 节）

- 首块规划框架：勘察 → 交付物清单 → 功能规划 → 思考节奏（思考必须与行动交替）→ 技术选型 → 验证方案（像素级+几何对齐）→ 收尾回归
- 微观脚手架：代词后跟执行动词、禁悬置句式（let me also/think/just）、每里程碑枚举 Potential issue、验证报告用"采样→观察→对不对"格式
