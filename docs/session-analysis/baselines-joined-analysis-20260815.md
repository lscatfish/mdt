# 四次 Baseline 联合分析：交付实测 + 思维链（2026-08-15）

覆盖四个会话：Baseline1（`14f893a0`）、Baseline2（`9f916db0`）、Baseline3（`d5cc2a80`）、Baseline-Upstream（`347ab4b5`）。
任务均为：在当前目录用 git 复刻网页版《我的世界》。本文件汇总交付实测反馈与思维链分析。

## 1. 会话与配置总览

| | Baseline1 | Baseline2 | Baseline3 | Upstream |
|---|---|---|---|---|
| 会话 id | 14f893a0 | 9f916db0 | d5cc2a80 | 347ab4b5 |
| 安装版本 | 旧版 anchored-standard | 修复版（prepend+无 cap） | 修复版（prepend+无 cap） | upstream 最新版 |
| 首轮工具 | [pwsh, read] | [pwsh, read] | [pwsh, read] | [bash, str_replace_editor] |
| 首轮 maxTokens | 1024 | 256000 | 256000 | 256000 |
| 首轮 skill 注入 | 无（当时无技能） | 无 | 无 | 无 |
| 时长 | ~37 分钟一次完成 | ~34 分钟一次完成 | 首轮中止→"继续"后 22 分钟 | ~23 分钟一次完成 |
| 技术路线 | 零依赖自研 WebGL | three.js r128 | three.js | three.js |
| 游戏代码量 | 90KB（8 模块） | 86KB + 603KB 库 | 68KB + 669KB 库 | ~45KB + 603KB 库 |
| 方块种类 | 19 种 + 4 矿石 | 17 种（无矿石） | 14 种（无矿石） | 含矿石体系 |
| 洞穴/地下 | 3D 噪声洞穴 + 基岩 | 无洞穴 | 有洞穴 | 有洞穴 |
| 浏览器测试 | 70 次 | 40 次 | ~30 次 | 10+ 测试脚本（playwright-core 自建） |
| 结束方式 | completed | completed | completed（恢复后） | completed |

## 2. 用户实测反馈与代码证据

实测评级：**Baseline1 与 Upstream 手感最好**；Baseline2 方块显示与碰撞箱错位；Baseline3 边角碰撞箱轻微问题。

### 2.1 Baseline2：半格错位（实锤）

`js/world.js` 的 `emitFace` 顶点以**方块中心**为原点：

```js
// FACES 角点 p 为 ±0.5（中心对齐）
{ p: [-.5, .5, .5], ... }  // 顶面角点
// 顶点 = lx + c.p[0] → 方块显示占据 [lx-0.5, lx+0.5]
```

而碰撞/射线检测使用逻辑格 `[x, x+1]`（中心 x+0.5）。**显示网格中心落在整数坐标，与逻辑格差半格**——准星拾取、碰撞判定与所见方块错位。用户描述"方块没有在方块的中间""碰撞箱和显示是错位的"与代码完全吻合。

### 2.2 Baseline3：边角碰撞轻微问题

`js/world.js` 的 FACES `p0` 为 0/1 角点，网格与逻辑格**对齐**（无 B2 问题）。`js/player.js` 采用**单轴分离碰撞**（moveAxis 逐轴 resolve，`HALF=0.3`、`eps=0.001`、`maxY = floor(p.y + HEIGHT - eps)`）：标准实现，但单轴分离在方块边角对角移动时存在经典"卡角"现象；会话思维链 #62 也记录过"玩家卡进地形"（y=20.2 而地形 h=32，玩家位于洞穴/地形内部）的排查。与用户"边角碰撞箱稍微有点问题"一致。

### 2.3 对照组：Baseline1 / Upstream 对齐

- Baseline1 `js/mesher.js`：FACES 角点为 **0/1**（`[1,0,0]`/`[0,0,1]`…），网格占据 `[x, x+1]`，与碰撞完全一致。
- Upstream `js/world.js`：FACES `origin: [0,0,0]` 0/1 体系，`findSpawn` 返回 `x+0.5` 中心，同样对齐。

**结论：用户实测评级与代码几何完全对应——0/1 角点体系（B1/upstream/B3）对齐正确，±0.5 中心体系（B2）半格错位。**

### 2.4 重要发现：充分验证为何漏掉半格错位

B2 的思维链验证密度并不低（40 次浏览器测试、`browser_evaluate` 状态断言、像素采样"中心蓝=天空、底部绿=草"、boundingSphere 修复）。**但所有验证都是"颜色/状态"层面**——半格错位不改变像素颜色分布，也不产生 console error，因此全部通过。这是"程序化验证盲区"的典型案例：像素验证能证明"渲染有内容"，不能证明"几何与逻辑对齐"。

## 3. 思维链联合分析

### 3.1 首块决策（分叉点）

| | 首块长度 | 决策 |
|---|---|---|
| B1 | 4,250 chars | 深度规划（I need/I should/plan 列表），对 three.js 犹豫 → **自研** |
| B2 | 425 chars | "I should build... (likely Three.js)" → **一句话锁定 three.js** |
| B3 | 3,483 chars | 环境勘察 + we 风格规划；首轮中止，"继续"后验证网络 → three.js 本地 vendored |
| Upstream | 4,475 chars | 完整规划 + 受限工具应对（npm 装 three 到 /tmp 再拷贝）|

首块长度 10 倍差距（4250 vs 425）直接决定交付：B1 深度规划换来自研完整度（19 方块+矿石+洞穴），B2 快速选型换来省事但功能缩水（17 方块无矿石）。

### 3.2 设计/实现阶段

- B1：46.9k 巨型设计块（8 模块全设计）→ 逐文件实现 → 写时自查 6 个 bug 块
- B2：下载 three.js 后一个 **154k 超巨块**包揽设计+实现；遇 three.js 特有坑（`THREE.Uint32Array` 不存在、boundingSphere 算错）
- B3：每文件独立设计块（3.5-18k），自查最勤（pushFace 双推 indices、moveAxis z 轴错用 x 边界）
- Upstream：37.9k 设计块 + heredoc 截断→换 str_replace_editor 的工具适配

### 3.3 Debug 马拉松（都在"黑屏/画面"上摔跤）

- B1（最惨烈 ~20 分钟）：黑屏 → gl.readPixels → 纹理上传黑 → tile 逐格采样 → 修复。自研渲染器最大坑
- B2：全屏 horizon 色 → 定位 boundingSphere center [0,0,0] → 修复
- B3：指针锁失败 → 注入 `window.__webcraft` debug API 系统化测试
- Upstream：测试脚本自纠（raycast 命中 null → camera rotation 未应用）

### 3.4 验证文化（模型不能读图，各自绕法）

- B1：gl.readPixels 像素采样 + soak 测试 + 性能基准 + 三轮逐文件 review
- B2：browser_evaluate 状态断言 + monkeypatch 指针锁 + 昼夜颜色采样
- B3：debug API + 统计核对（stats.faces vs triangles）+ 1M faces 性能排查
- Upstream：**四层绕行**——npm 装 three、puppeteer-core/playwright-core 自建测试、PIL 像素/ASCII 可视化、Edge headless 截图

### 3.5 词形统计（思维推理）

口径（2026-08-17 更新）：次/1k tokens，分母 = 交付末尾单 Context token（provider usage 权威值，不累积）；
`we`/`I` 为裸代词（已扣组合短语）。

| 指标（次/1k tokens） | B1 | B2 | B3 | Upstream |
|---|---|---|---|---|
| 推理总量 chars | 203,887 | 248,830 | 157,447 | 143,464 |
| we（裸）| 0.26 | 0.24 | 0.65 | 0.48 |
| letMe | **0.65** | 0.46 | 0.33 | 0.02 |
| lets | 0.10 | 0.33 | 1.00 | 1.17 |
| I（裸）| 0.36 | 0.17 | 0.13 | 0.02 |

## 4. 核心结论

1. **首块推理决定交付天花板**：规划深度 → 技术路线 → 功能面。B1/upstream 首块规划深，交付最全；B2 首块快速选型，交付缩水。
2. **letMe 密度 = 推进强度（但锚定轨迹除外）**：B1（0.65/1k）测试最重、功能最全；B3（0.33）与 B2（0.46）中间档；UP（0.02）几乎不用 let me 却最好。letMe 是"推进动作标记"而非能力指标。
3. **we/lets 风格与完成度无关**：B3（we 0.65/lets 1.00）与 upstream（0.48/1.17）同为 we 型（we 家族 2.63 vs 3.32），但交付面差距大。
4. **模型验证存在几何盲区**：B2 半格错位在所有验证下通过——程序化验证（颜色/状态/无报错）无法发现几何错位，需要几何级断言（raycast 采样、AABB 对齐检查）。
5. **中止-恢复可靠**：B3 首轮中止后"继续"无缝衔接，22 分钟完成交付。
6. **用户实测是最终裁决**：B1/upstream 手感最好且代码几何正确；B2/B3 的问题都能在代码层定位——实测反馈与代码证据互为印证。

## 5. 建议

1. **几何对齐验证**：未来 baseline 实验在验证清单中加入"方块中心/碰撞格对齐"断言（如射线命中坐标与显示网格 bounding box 对比），堵住颜色验证盲区。
2. **B2 修复参照**：将 FACES 角点从 ±0.5 中心改为 0/1 角点（B1/upstream/B3 同款），或碰撞/拾取改用显示格中心语义。
3. **B3 边角**：碰撞改为对角合并 resolve 或子步进（B1 已用子步进 `dt/0.016`），可缓解卡角。
4. **风格与配置**：安装配置（cap 开/关）不决定交付质量；首轮锚定与验证文化才是。若追求"最稳交付"，B1 形态（1024 cap + 自研路径 + 像素级验证）是目前最优样本。
