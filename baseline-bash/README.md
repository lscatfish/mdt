# WebCraft — 网页版《我的世界》

一个纯前端实现的体素沙盒游戏复刻，包含：

- 程序化无限地形（丘陵、山脉、湖泊、洞穴、矿脉、树木）
- 区块化网格与面剔除、顶点环境光遮蔽（AO）、像素纹理图集
- 第一人称移动、跳跃、碰撞、游泳、双击空格/F 切换飞行
- 挖掘 / 放置方块、方块高亮、破坏粒子与程序化音效
- 9 格快捷栏、暂停菜单、世界修改自动保存到 localStorage

## 运行

```bash
npm install   # 可选：three 已作为依赖写入 package.json
npm start
```

然后打开 <http://localhost:8000>。

> 也可以使用任意静态服务器，例如 `python -m http.server 8000`。
> 不建议直接双击 `index.html`（浏览器会因 `file://` 限制 ES Module 加载）。

## 操作

| 按键 | 功能 |
| --- | --- |
| W A S D / 方向键 | 移动 |
| 鼠标 | 视角 |
| 左键（按住可连续） | 破坏方块 |
| 右键（按住可连续） | 放置方块 |
| 空格 | 跳跃 / 飞行上升 |
| 双击空格 或 F | 切换飞行 |
| Shift | 潜行 / 飞行下降 |
| Ctrl | 疾跑 |
| 1-9 / 鼠标滚轮 | 选择快捷栏方块 |
| Esc | 暂停 |

## 技术说明

- 渲染基于本地打包的 [Three.js](https://threejs.org/)（`vendor/three.module.js` 与 `vendor/three.core.js`，MIT 协议见 `vendor/THREE-LICENSE.txt`）。
- 地形使用确定性值噪声 + fBm，同一世界种子每次生成完全一致。
- 玩家编辑以“坐标 -> 方块”的增量形式存入 `localStorage`，重新载入后叠加到程序化地形上。

## 目录结构

```
index.html          入口页面
css/style.css       UI 样式
js/main.js          启动
js/game.js          主循环与系统装配
js/world.js         区块管理 / 地形 / 射线检测
js/chunk.js         区块数据 / 网格构建 / 材质
js/player.js        玩家物理与碰撞
js/controls.js      键鼠输入
js/textures.js      程序化纹理图集
js/noise.js         噪声函数
js/particles.js     粒子效果
js/audio.js         程序化音效
js/hud.js           UI
server.js           零依赖静态服务器
vendor/             本地 Three.js
```
