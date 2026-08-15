# ⛏ WebCraft —— 网页版我的世界

（提示词中间注入std版本，限制 I / let me）存在严重渲染异常（只渲染了少量的面）

纯前端体素沙盒游戏，复刻 Minecraft 的核心体验。零构建、零依赖运行时（three.js 已 vendored），打开浏览器即可游玩。

## 运行

```bash
npm run dev      # 等价于 node server.js
# 打开 http://localhost:5173
```

无需 `npm install`（`vendor/three.module.js` 已随仓库提交）；`node_modules` 仅用于想升级 three 时参考。

## 操作

| 按键 | 功能 |
| --- | --- |
| 鼠标 | 视角（指针锁定） |
| WASD | 移动 |
| 空格 | 跳跃 / 双击空格切换飞行（飞行时上下） |
| Shift | 潜行（飞行时下降） |
| Ctrl | 疾跑（视野拉大） |
| 鼠标左键（按住） | 破坏方块 |
| 鼠标右键（按住） | 放置方块 |
| 鼠标中键 | 拾取准星所指方块 |
| 1-9 / 滚轮 | 选择快捷栏方块 |
| F | 切换飞行 |
| M | 静音 |
| F3 | 调试信息（FPS / 坐标 / 种子） |
| Esc | 暂停 |

## 特性

- 无限世界：fBm 高度场地形、草原/沙漠生物群系、湖泊海洋、树木、洞穴、煤矿/铁矿
- 16 种方块：草、泥土、石头、圆石、沙、原木、树叶、木板、玻璃、水、砖、矿石、基岩……
- 区块化网格：只渲染暴露面，逐顶点环境光遮蔽（AO），不透明/半透明双通道
- 第一人称物理：AABB 逐轴碰撞、重力、跳跃、疾跑、游泳、飞行
- 破坏/放置：按方块硬度计时挖掘、放置碰撞检测、破坏粒子、合成音效
- 昼夜循环：太阳/月亮、天空与雾颜色渐变、云层漂移（10 分钟一天）
- 存档：种子与所有改动持久化到 localStorage；"新建世界"重新随机种子

## 调试模式

- `?demo` —— 跳过开始界面，指针锁定不可用时退回拖拽视角（供自动化测试）
- `?seed=42` —— 指定世界种子（不覆盖本地存档）
- `window.__mc3` —— 测试接口：`getState()` / `teleport(x,y,z)` / `breakBlock()` / `placeBlock()` / `debugSet(x,y,z,id)` / `setTime(t)` / `sampleScreen()`（同步渲染并采样 9×9 像素颜色）

## 目录结构

```
index.html        页面与 HUD/覆盖层样式
server.js         零依赖静态服务器
vendor/           three.module.js（vendored，含 MIT 许可）
src/
  noise.js        种子化 2D/3D 值噪声 + fBm
  blocks.js       方块注册表（id/硬度/纹理面/碰撞属性）
  textures.js     程序化 16x16 纹理图集（canvas 绘制）
  world.js        世界生成（地形/树/洞穴/矿石）、区块、存档
  chunkmesh.js    区块网格构建（面剔除 + AO + 双通道）
  player.js       玩家物理（AABB 碰撞/游泳/飞行）
  raycast.js      体素 DDA 射线检测
  sky.js          昼夜循环、光照、云层
  particles.js    破坏粒子
  sounds.js       WebAudio 合成音效
  ui.js           快捷栏/准星/调试面板/覆盖层
  main.js         主循环、区块流式加载、输入与交互
```

## 技术说明

- 渲染：three.js `MeshLambertMaterial` + 顶点色（AO×面朝向明暗），`NearestFilter` 无 mipmap 保持像素风
- 区块 16×64×16，渲染半径 5 区块，按距离优先流式生成/建网格，远处雾隐 + 卸载
- 世界生成完全由种子决定：同一坐标的方块可独立重现，因此跨区块边界的面剔除/AO 与物理查询都直接可用
- 玩家改动以「区块 + 索引」稀疏表记录，生成时回放，修改时增量更新并重新建网格
