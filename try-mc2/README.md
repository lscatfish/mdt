# WebCraft · 网页我的世界

（提示词开头注入zero版本，限制 I / let me），单方块渲染异常，是有颜色的渲染，看起来是贴图异常
一个在浏览器里运行的第一人称体素沙盒游戏,使用原生 JavaScript + Three.js 编写,零构建步骤、零外部素材(全部纹理与音效程序化生成)。

## 快速开始

```bash
# 方式一:双击
start-game.bat

# 方式二:命令行
node tools/server.mjs
# 然后浏览器打开 http://localhost:8080
```

> 需要 Node.js(仅用于本地静态服务器)。游戏本身加载 `vendor/three.module.js`,不依赖 CDN,可离线运行。

## 玩法

- **WASD** 移动,**鼠标** 视角,**空格** 跳跃/游泳,**Shift** 潜行,**R** 疾跑
- **左键** 按住挖掘方块(生存模式有挖掘进度),**右键** 放置方块,**中键** 拾取瞄准的方块
- **滚轮 / 1-9** 切换快捷栏
- **C** 切换创造/生存模式;创造模式下 **双击空格** 飞行
- **F3** 调试信息,**M** 静音,**Esc** 暂停
- 生存模式有跌落伤害与生命值,生命归零后回到出生点

## 特性

- 无限程序化地形:Simplex 噪声丘陵、山脉、沙滩、海洋、洞穴与森林
- 区块化网格:剔除隐藏面、逐面明暗与顶点环境光遮蔽(AO)
- 程序化 16×16 像素纹理图集与 WebAudio 合成音效
- 昼夜循环(约 10 分钟一天)、太阳/月亮/星空、动态雾效与云层
- 水:半透明水面、水下雾效、游泳
- 本地存档:被修改的区块、玩家状态与物品数量存到 localStorage,每 15 秒自动保存
- 调试面板:FPS、位置、朝向、区块/渲染统计

## 目录结构

```
index.html        页面与 HUD
styles.css        像素风 UI
vendor/           Three.js ES 模块(本地化)
src/
  main.js         启动与主循环
  world.js        区块数据与地形生成
  mesher.js       面剔除/网格/AO/区块渲染管理
  player.js       第一人称物理与碰撞
  raycast.js      体素 DDA 射线
  controls.js     键鼠与指针锁定
  sky.js          天空着色器、昼夜、云
  textures.js     程序化纹理图集
  blocks.js       方块注册表
  noise.js        Simplex 噪声
  audio.js        WebAudio 音效
  ui.js           HUD
tools/server.mjs  本地静态服务器
```

## 技术说明

- 世界以 16×64×16 的区块存储,围绕玩家流式生成/建网/卸载
- 渲染使用 `MeshLambertMaterial` + 顶点颜色(每面亮度 × AO),单张 Canvas 纹理图集
- 水与玻璃为透明材质层,树叶使用 alphaTest 镂空
- 存档格式 `webcraft.save.v1`,种子固定则地形可复现
