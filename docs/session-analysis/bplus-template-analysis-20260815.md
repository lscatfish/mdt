# B+template 会话分析：草方块方向 bug + 思维链 + 微观指纹（2026-08-15）

会话：`65f36716`（--D-code-mdt-B~002Btemplate--），预设 zero-anchored-standard-b（B 契约 + 模板），交付目录 `B+template/`。

## 1. 会话总览

| 项目 | 值 |
|---|---|
| session 事件预设 | standard-we-contract |
| **selected 实际预设** | **zero-anchored-standard-b**（B 契约 anchor 消息）|
| 首轮 | anchor-turn 注入 + **零工具锚点轮** → 61 工具 |
| 时间线 | 11:01 创建 → 11:05 锚点轮 → turn2（11:05-11:13 设计+部分文件）→ **中断 4 小时** → 15:06 "继续"（resume）→ turn3（15:08-15:35 主体开发）→ "后台还有服务运行？" 收尾 |
| 交付 | index/css + 9 个 src 模块（~60KB）+ three.module.js（1.27MB）+ serve.py |
| 用户评级 | **中等**：渲染有模有样、区块渲染无问题、功能像世界；但**一眼可见草方块贴图方向 bug**；水有问题（另述）|

## 2. 草方块方向 bug（用户一眼可见，代码实锤）

`src/mesher.js` 的 UV 映射：

```js
const ua = u0 + inset, ub = u0 + uStep - inset;
const va = v0 + inset, vb = v0 + vStep - inset;   // va = tile 顶部（草皮行）
...
u: a === 0 ? ua : ub,
v: b === 0 ? va : vb,        // ← b=0 → 纹理顶部（草皮）
```

FACES（constants.js）：

```js
{ dir: [0,1,0],  t1:'x', t2:'z', corners:[[0,0],[0,1],[1,1],[1,0]] },  // 顶面 ✓
{ dir: [0,0,1],  t1:'x', t2:'y', corners:[[0,0],[1,0],[1,1],[0,1]] },  // +Z：v 随 y
{ dir: [0,0,-1], t1:'x', t2:'y', corners:[[0,0],[0,1],[1,1],[1,0]] },  // -Z：v 随 y
{ dir: [1,0,0],  t1:'y', t2:'z', ... },  // +X：v 随 z（不随 y！）
{ dir: [-1,0,0], t1:'y', t2:'z', ... },  // -X：v 随 z
```

- **±Z 面**（t2='y'）：`b=0 → y=0（方块底）→ va（草皮）`——**草皮画在方块底部**
- **±X 面**（t2='z'）：v 根本不随 y——草皮沿 z 轴显示为一条窄带（方块 z 方向 1/4 处），**不在 y 顶部**
- 顶面（grassTop）无方向图案所以正常

**根因**：侧面纹理的"上下"（v 轴）没有统一映射到世界 y 轴；±X 面 t2 用了 'z'，±Z 面 corners 的 b 顺序把草皮映射到 y=0。对照 B1/upstream 的侧边实现（侧面 v 恒随 y 且 y=1 对应纹理顶部），B+template 两侧都反/错位。

## 3. 宏观：思维链关键点（99 块，287,518 chars）

- **锚点轮**（turn1，286 chars）：I 风格确认契约（"I should probably ask... I'll respond"）
- **turn2**（9 块）：#5 **47,605 chars 大设计块**（含 git/网络排查）+ 写 textures/constants/noise
- **turn3**（86 块，15:08 "继续"后）：#10 16,856 chars 继续规划 → #12 **自查 mesher 导入缺失 bug** → #13 matrixAutoUpdate/frustum 分析 → #14 水浮力公式质疑 → #15/#17 game.js 大设计块（11k）
- **中断-恢复**：与 B3 同款（4 小时 gap 后"继续"无缝衔接，todo/goal 状态保留）
- 验证：check=146/test=110/verify=39（量不少）——但漏了草方块方向（**验证粒度问题**：像素采样验证了"有内容"，没验证"方向/朝向"）

## 4. 微观指纹

### 4.1 词频/信号（对比七会话）

| 信号 | B+template | UP（好）| B1（好）| T3（差）|
|---|---|---|---|---|
| potential | **2（0.01/1k）** | 134 | 11 | 7 |
| hmm | 119（0.60/1k）| 9 | 36 | 87 |
| wait | 133 | 32 | 52 | 88 |
| maybe | 163 | 240 | 100 | 73 |
| fine | 142 | 119 | 146 | 123 |
| but | 340 | 224 | 247 | 155 |
| 句首 let | **233** | — | 112 | 143 |
| 句首 hmm | 105 | — | — | 68 |

### 4.2 短语

- **let me=261（1.33/1k，全会话最高）**，句首 231——B 契约+模板**彻底失效**（turn2 曾压到 45，turn3 继续后爆到 212）
- let me + 动词：check:34, test:11, run:10, **also:10**, write:10, **just:9**, add:9, verify:8——执行类为主但混入发散
- 纯 I 系：I'll=68、I should=11、I need=10、let's=7、**we need=0 / we should=0**（we 家族几乎为零）

### 4.3 情态

- **should=142（0.72/1k，全会话最高）**——但 should + **be:46**（1/3 是 "should be" 描述性），check:4 少
- could=0.47、can=0.41、might=0.22、need=0.17（低）
- I-should=11（无 we-should）

### 4.4 微观画像

**"letMe 之王 + potential 缺失 + should-be 堆砌 + hmm/wait 犹豫"**——微观上属于差会话家族（与 T3 同类），但交付是中等（渲染基本正确）。说明：微观指纹判别"思维链质量"，而交付"中等"来自 check/test 验证量够（区块渲染验证充分）但**验证粒度没覆盖"纹理方向"这类视觉细节**——与 B2 半格、Try1/2 mipmap 同类漏网，只是漏的是"方向"。

## 5. 与七会话对比的定位

- 宏观：首块规划中等（47k 设计块有）、验证量足但粒度不够细（漏方向）
- 微观：letMe 密度最高（1.33）、potential 最低（0.01）、should 最高但 be 化
- 用户实测"中等"与微观"差"指纹的偏离 = 验证量（check/test/verify 不低）部分补偿了思维链质量——**验证量的多少决定下限，验证粒度决定上限**

## 6. 结论

1. **草方块方向 bug = 侧面 UV 的 v 轴未映射到世界 y**（±X 面 t2 用 z、±Z 面 b 顺序反）——"一眼可见"类缺陷
2. **B 契约+模板在长会话中衰减**：turn2 letMe=45（模板生效）→ turn3 212（完全失效）——约束的时效性
3. **验证粒度再证**：check/test 数量充足（146/110）仍漏"方向"——需要"纹理朝向断言"（如采样草皮行应在 y 顶部的断言）
4. **中断-恢复**：4 小时中断后 resume 无缝（todo/goal 保留）——DSH 恢复机制稳定
