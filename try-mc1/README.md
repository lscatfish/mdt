# 网页版我的世界（Minecraft Web Clone）

（zero B 无提示词模板）单方块渲染异常，看起来是贴图异常

一个纯前端（无构建步骤、无外部网络依赖）的体素沙盒游戏，运行在浏览器中。Three.js 已本地化存放在 `lib/`，打开网页即可游玩。

## 运行

需要 Node.js（仅用于本地静态服务器）：

```bash
npm start
# 或 node tools/serve.mjs
```

然后浏览器打开 <http://localhost:8123>（推荐 Chrome/Edge 桌面版，需鼠标与键盘）。

> 由于浏览器 ES Module 的同源限制，不能直接双击 `index.html`（file://），必须通过 HTTP 服务器访问。

## 操作

| 按键 | 功能 |
| --- | --- |
| `W A S D` | 移动 |
| 鼠标 | 视角（点击画面捕获鼠标） |
| 左键（按住） | 破坏方块 |
| 右键 | 放置方块 |
| 中键 | 选取准星指向的方块 |
| 滚轮 / `1`-`9`、`0` | 切换快捷栏方块 |
| `空格` | 跳跃 / 水中上浮 / 飞行上升 |
| 双击空格或 `F` | 开关飞行（`Shift` 下降，`Ctrl` 疾飞） |
| `Ctrl` | 疾跑 |
| `Shift` | 潜行减速（飞行时下降） |
| `F3` | 调试信息 |
| `Esc` | 暂停菜单（保存 / 回主菜单） |

## 特性

- **体素世界**：确定性程序生成（Simplex 噪声 fbm），含草地、沙滩、水域、洞穴、雪山、树木与基岩层
- **分块引擎**：16×64×16 区块按距离流式生成/卸载，面剔除 + 纹理图集 + 顶点色光照，水面半透明渲染
- **玩家物理**：AABB 分轴碰撞、重力/跳跃、游泳、飞行、摔落反馈、视角晃动
- **交互**：DDA 体素射线瞄准、持续破坏进度高亮、方块放置防穿模
- **昼夜循环**：太阳/月亮、星空、云层、动态雾与水下雾
- **存档**：世界种子、玩家状态与全部方块修改保存到 `localStorage`，30 秒自动保存
- **音效**：WebAudio 合成破坏/放置/落地音效
- **零依赖运行**：Three.js r160 本地文件，纹理全部程序化生成

## 目录结构

```
index.html            入口页面与菜单
css/style.css         界面样式
lib/three.module.min.js  Three.js（本地依赖）
src/config.js         常量与方块定义
src/noise.js          Simplex 噪声 / fbm
src/textures.js       程序化 16px 纹理图集
src/world.js          地形生成、区块流、存档
src/mesher.js         区块网格构建（面剔除 + UV）
src/player.js         玩家物理与体素射线
src/audio.js          WebAudio 音效
src/hud.js            快捷栏 / 菜单 / 调试面板
src/main.js           主循环与整合
tools/serve.mjs       本地静态服务器
```

## 调试接口

控制台可用 `window.__mc`：`startNewWorld(seed)`、`saveWorld()`、`breakBlock()`、
`placeBlock()`、`world()`、`player()` 等，便于自动化测试与二次开发。
