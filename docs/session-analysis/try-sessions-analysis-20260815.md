# Try-mc 三会话 + 四 Baseline 联合分析：契约注入方式、交付实测与思维链（2026-08-15）

覆盖 Try1（`a0c8952d`）、Try2（`7c5cdb82`）、Try3（`58fbb8be`），并与 Baseline1/2/3、Baseline-Upstream 对照。
任务相同：当前目录用 git 复刻网页版《我的世界》。

## 1. 三 Try 会话总览

| | Try1 | Try2 | Try3 |
|---|---|---|---|
| 会话 id | a0c8952d | 7c5cdb82 | 58fbb8be |
| session 事件预设 | standard-we-contract | zero-anchored-standard | zero-anchored-standard |
| **selected 实际预设** | **zero-anchored-standard-b** | zero-anchored-standard | **standard-we-contract** |
| 契约版本 | B（I 家族，禁句首 let me） | A（we 家族） | A（we 家族） |
| **契约注入方式** | **anchor 消息**（零工具锚点轮） | **anchor 消息**（零工具锚点轮） | **system prompt -200 section**（无锚点轮） |
| 首轮工具 | **0 个**（锚点轮）| **0 个**（锚点轮）| **61 个**（直接全开）|
| 第二轮工具 | 61 + skill-catalog | 61 | — |
| 时长 | ~38 分钟 | ~35 分钟 | ~21 分钟 |
| 游戏代码量 | ~60KB + three r160(671KB) | ~66KB（无库？）+ 模块化 | ~65KB + node_modules three |
| 交付评级（用户实测）| 不好（功能 OK、贴图错）| **最好**（功能 OK、贴图错）| 最难看（全透明）|

## 2. 前几轮工具注入方式（用户关注点）

**Try1 / Try2（zero 系列）——锚点轮模式：**
1. turn1：注入 `anchor-turn` 契约消息（`src=plugin/anchor-turn`，spliced 进 next-turn），**工具列表为空**（零工具锚点轮）
2. 模型在锚点轮只回复确认（Try2 回复："We need a task or question from you to get started"）
3. turn2：用户任务 + skill-catalog 注入 + **61 工具全开**

**Try3（standard-we-contract）——无锚点轮：**
1. turn1 直接：用户任务 + runtime-context 注入 + **61 工具全开**
2. 契约在 system prompt（-200 section），非消息注入

三者的"前几轮工具注入"完全不同：两个有零工具锚点轮，一个没有；一个契约走消息，一个走 system prompt。

## 3. 契约生效矩阵（本次实验核心数据）

| 会话 | 契约 | 注入位置 | 思维链 letMe | 生效？ |
|---|---|---|---|---|
| Try2 | A（we 家族） | **anchor 消息** | **15**（we=242）| ✅ 高度生效 |
| Try1 | B（I 家族） | anchor 消息 | 137（we=57）| ❌ 失效 |
| Try3 | A（we 家族） | **system prompt** | 161（we=49）| ❌ 失效 |

- **同样 A 契约：anchor 消息生效，system prompt 不生效**——锚点消息 > 提示词注入
- **同样 anchor 消息：A 契约生效，B 契约不生效**（Try1 锚点轮模型复述了契约"no let me"，但 turn2 依旧 letMe=135）——模型对"禁 let me"的抗性是本质性的，对"用 we"的顺应是天然的
- 用户实测评级与契约生效性完全一致：**Try2（生效）最好，Try1/Try3（失效）不好**

## 4. 交付实测与代码证据

### 4.1 Try1 / Try2：同一个贴图错误（mipmap 图集混色）

两个会话的纹理都是程序化 canvas 图集，但 **minFilter 用了 mipmap**：

- Try1 `textures.js`：`new THREE.CanvasTexture(canvas)` + `magFilter=NearestFilter`，**未设 minFilter**（默认 `LinearMipmapLinearFilter` + `generateMipmaps=true`）
- Try2 `textures.js`：`minFilter = NearestMipmapLinearFilter` + `generateMipmaps = true`

图集（atlas）在 mipmap 下采样时**相邻 tile 会混色**，方块表面出现杂色/脏污（尤其远距离）。正确做法（Try3/B3）：`minFilter=NearestFilter` + `generateMipmaps=false`。用户描述"单个方块贴图有问题""1 和 2 从渲染的实现上来说是同一个错误"与代码完全吻合。

### 4.2 Try3：全透明（待进一步定位）

Try3 的纹理设置反而是最正确的（NearestFilter、无 mipmap、colorSpace 正确），材质正常（MAT_TRANS alphaTest 0.15 仅树叶/玻璃/水）。代码层未发现明确的"全透明"源；嫌疑方向：场景无 `scene.background`（sky.js 只用灯光+日月+云，未设置背景色）导致黑/透明底，或渲染循环未正确提交。建议用 Playwright 采样 Try3 实际像素复核。

### 4.3 与 Baseline 系列的渲染质量对照

| 会话 | 几何对齐 | 纹理 | 用户评级 |
|---|---|---|---|
| Baseline1 | ✅ 0/1 角点 | 自研像素验证 | 最好 |
| Baseline-Upstream | ✅ 0/1 角点 | three.js | 最好 |
| Try2 | ✅ 0/1 角点 | ❌ mipmap 混色 | 最好但贴图错 |
| Try3 | ✅ | ✅ 纹理设置正确 | 最难看（透明）|

**契约生效（Try2）与交付渲染正确性无关**——Try2 是契约实验里风格最好的，但贴图 bug 与契约无关，是模型实现细节。

## 5. 思维链关键点

### Try1（66 块，256,805 chars）
- 锚点轮 #0（534 chars）：模型困惑"只有契约没有任务"→ 复述契约后等待
- #1 **99,932 chars 超长规划块**（任务到来后一次性全设计）
- #4 44,648 chars 写文件设计块；三.js r160 下载
- 验证：evaluate 39 次（最依赖 evaluate 的状态断言）

### Try2（74 块，212,967 chars）——we 风格全程贯彻
- 锚点轮 #0（785 chars）："We need answer the user... We need comply: reason in first-person plural only"——契约被显式内化
- #2/#3 环境踩坑：pwsh `StandardOutputEncoding` 错误排查 → `Start-Process` 绕行
- #10/#11 自查 bug（存档 key 解码、shouldDrawFace 条件恒真）
- 测试：edit 36 + write 19 + **run_code_unsafe 19**（自写脚本验证）
- 用户消息（09:50）："（提示词开头注入zero版本，限制 I / let me）不用管括号内部的东西，回答我怎么启动"——用户自己标记了注入

### Try3（48 块，276,747 chars）
- #0 **190,103 chars 超巨块**（全会话最大）——设计+实现一体输出
- 首轮直接 61 工具干活；npm install three 后台任务
- 自查：MAT_OPAQUE map:null → 改为直接 import ATLAS_TEXTURE（#8）
- 验证：edit 25 + write 14 + run_code_unsafe 14
- 用户消息（09:50）："（提示词中间注入std版本，限制 I / let me）..."——用户标记 std 注入

## 6. 七会话联合结论

1. **注入方式决定契约效果**：anchor 消息（零工具锚点轮）> system prompt section；A 契约（we 正向引导）> B 契约（let me 禁令）。Try2 是唯一生效样本。
2. **契约生效 ≠ 交付更好**：Try2 风格最纯（we=242/letMe=15）但贴图渲染 bug；Baseline1 无契约（letMe=128）交付最全。风格与渲染质量相互独立。
3. **渲染 bug 与实验变量无关**：Try1/2 的 mipmap 混色、Try3 的透明问题都是模型实现细节——说明**当前实验缺口是"渲染质量验证"**：所有会话的验证都集中在"有无报错/状态/像素颜色"，没有人验证"纹理是否正确显示在方块上"。
4. **letMe 密度再次与"感觉好"脱钩**：Try2（15）与 Baseline1（128）都被评为最好——用户的"好"= 功能完整 + 渲染正确，与词形无关。
5. **锚点轮的成本**：Try1/Try2 各多一个零工具轮（模型困惑"没任务"）；Try3 无锚点轮直接干活但契约失效。锚点轮是"契约生效"的必要代价。

## 7. 建议

1. **渲染验证补课**：给验证清单加"纹理正确性"断言——采样方块面中心像素 vs 期望 tile 颜色（防 mipmap 混色类问题），以及"场景背景/透明度"断言。
2. **契约实验路线**：若目标是"we 风格且交付好"，用 Try2 形态（zero + A 契约锚点消息）并补渲染验证；B 契约（禁 let me）与 system prompt 注入两条路线已证伪。
3. **Try3 透明问题**：先查 scene.background/渲染循环，若为背景缺失则补 sky 背景。
