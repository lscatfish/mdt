# 🟫 网页版我的世界 (Web Minecraft)

一个**零运行时依赖**、纯浏览器运行的体素沙盒游戏（类 Minecraft）。原生 JavaScript (ES Modules) + WebGL1 自研实现，无构建步骤、无 CDN、无第三方库，完全离线可用。

## 快速开始

```bash
# 需要 Node.js >= 18（或任何静态文件服务器）
node server.mjs            # 默认端口 8000，可加参数指定端口：node server.mjs 8080
```

打开 <http://127.0.0.1:8000/>（也可用 `python -m http.server` 等任意静态服务器，因 ES 模块无法从 file:// 直接打开）。

URL 参数（可选）：

| 参数 | 作用 | 示例 |
| --- | --- | --- |
| `seed` | 世界种子（数字或字符串） | `?seed=42`、`?seed=hello` |
| `test` | `1` 时进入测试模式：跳过开始遮罩、不请求指针锁定、暴露调试 API | `?test=1&seed=42` |

## 操作说明

| 键 | 功能 |
| --- | --- |
| W A S D | 移动 |
| 鼠标 | 视角（点击画面锁定指针，Esc 释放） |
| 左键 / 右键 | 破坏 / 放置方块（长按连发） |
| 空格 | 跳跃（双击切换飞行）；飞行时上升 |
| Shift | 潜行；飞行时下降 |
| Ctrl | 疾跑 |
| F | 切换飞行模式 |
| 1–8 / 滚轮 | 选择快捷栏方块 |

触屏设备：左侧虚拟摇杆移动，右侧拖动转视角，⛏/🧱 破坏/放置，⬆ 跳跃，🕊 飞行。

存档：点击 **💾 保存** / **📂 读取**（localStorage），也可调 `window.__game.save()/load()`。

## 特性

- **程序化地形**：种子化 2D 分形噪声（simplex + fbm）生成山丘/湖泊（草、泥土、石头、沙、水、基岩），确定性树木
- **体素交互**：Amanatides & Woo 体素射线（准星拾取）、方块破坏/放置、命中方块高亮框
- **第一人称物理**：AABB 轴分离碰撞、重力、跳跃、潜行、疾跑、飞行（noclip 飞行）
- **渲染**：WebGL1 区块网格（面剔除、包围剔除）、程序化 16×16 纹理图集（NEAREST 像素风）、面光照（顶/侧/底）、雾
- **昼夜循环**：天空/雾颜色与全局光照随时间平滑变化，太阳/月亮 HUD
- **音效**：WebAudio 程序合成（挖掘/放置/脚步/跳跃），无音频文件
- **存档**：localStorage 往返（世界区块 + 玩家 + 时间）
- **触屏支持**：虚拟摇杆 + 按钮

## 文件结构

```
index.html            页面骨架 + HUD 按钮 + 开始遮罩
css/style.css         样式（含触屏控件样式）
server.mjs            零依赖静态服务器
js/config.js          方块定义 / 面枚举 / 图集映射 / 物理常量（纯逻辑）
js/noise.js           mulberry32 PRNG + 2D simplex 噪声 + fbm（纯逻辑）
js/world.js           区块存储、地形生成、存档序列化（纯逻辑）
js/raycast.js         体素射线（Amanatides & Woo）（纯逻辑）
js/physics.js         AABB 碰撞与运动（纯逻辑）
js/mesher.js          区块网格生成，顶点严格落在方块单位立方体上（纯逻辑）
js/textures.js        程序化纹理图集（canvas 2D）+ texel 查询
js/renderer.js        WebGL 渲染：网格、天空/雾、昼夜光照、高亮框、readPixels
js/input.js           键鼠 / 指针锁定 / 触屏输入
js/audio.js           WebAudio 合成音效
js/hud.js             2D HUD：准星、快捷栏、太阳/月亮、调试信息
js/main.js            游戏循环、交互、区块流式加载、存档、window.__game 调试 API
tests/unit.mjs        Node 单元测试（26 项）
tests/browser.mjs     Playwright 浏览器级验证（可选安装）
```

“纯逻辑”模块不依赖 DOM/WebGL，可在 Node 中直接单测；浏览器模块只通过 `js/main.js` 装配。

## 测试与验证

### 1. 单元测试（无需浏览器）

```bash
node tests/unit.mjs        # 26 项，退出码 0 = 全绿
```

覆盖：PRNG/噪声确定性、方块读写（含负坐标跨区块）、地形生成规则、射线命中点与网格边界**精确相等**、物理落地/墙面停靠/天花板、网格顶点几何对齐（顶点严格位于方块单位立方体）、透明面剔除、存档序列化往返。

### 2. 浏览器级验证（可选，需 Playwright）

```bash
npm i -D playwright
npx playwright install chromium   # 首次需要下载浏览器
node tests/browser.mjs
```

自动起本地服务器并验证：**零控制台错误**、碰撞落地、射线/破坏/放置、存档往返、**像素级断言**（WebGL readPixels 采样：顶面/侧面纹理 texel 精确匹配、天空清屏色、夜景光照系数 0.35、高亮框与命中方块投影对齐、场景纹理多样性）、真实输入事件路径、开始遮罩流程。

### 验证方法论（本项目开发中实际执行）

用户无法直接查看渲染画面时，渲染正确性通过以下手段程序化证明：

- **像素级**：渲染器开启 `preserveDrawingBuffer`，用 `gl.readPixels` 采样屏幕像素，与 `textures.js` 导出的纹理数据精确比对（顶面中心 texel、命中点 uv 处 texel × 面光照系数、天空清屏色、昼夜差异）；
- **几何对齐**：准星射线命中坐标与网格边界用 `1e-9` 容差断言；高亮框边缘出现在命中方块投影位置（±6px 扫描）；“显示与逻辑一致”通过“中心像素颜色 == 射线命中面在命中 uv 处的 texel 颜色”证明；
- 所有失败项（含测试自身假设错误与真实渲染 bug）均已修复后才继续下一里程碑。

## 已知限制

- 无洞穴/矿石、无怪物、无多人；水仅表面渲染（无游泳物理）
- 水面仅对空气绘制（水下/贴岸侧面不渲染）
- 标签页切到后台时浏览器会节流 rAF（正常行为，切回即恢复）
- 存档位于浏览器 localStorage，清除站点数据会丢失存档
