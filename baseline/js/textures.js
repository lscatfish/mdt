/* ============================================================
 * textures.js — 程序化生成的 16x16 纹理图集与方块定义
 * ============================================================ */
(function (global) {
  'use strict';

  const TILE = 16;
  const COLS = 8;
  const ROWS = 4;

  // 图集格子编号
  const T = {
    GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, COBBLE: 4,
    PLANKS: 5, LOG_SIDE: 6, LOG_TOP: 7, LEAVES: 8, SAND: 9,
    WATER: 10, BEDROCK: 11, COAL: 12, IRON: 13, GOLD: 14,
    DIAMOND: 15, SNOW: 16, GLASS: 17, GRAVEL: 18, BRICK: 19,
    CLOUD: 20
  };

  function makeTile() {
    const c = document.createElement('canvas');
    c.width = c.height = TILE;
    return { c, ctx: c.getContext('2d') };
  }

  function px(ctx, x, y, r, g, b, a) {
    if (a === undefined) a = 255;
    ctx.fillStyle = 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + (a / 255) + ')';
    ctx.fillRect(x, y, 1, 1);
  }

  // 带抖动的像素
  function noisyFill(ctx, rng, r, g, b, v) {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const d = (rng() - 0.5) * v;
        px(ctx, x, y, r + d, g + d, b + d);
      }
    }
  }

  // 在底色上撒斑点
  function speckle(ctx, rng, r, g, b, n, span) {
    for (let i = 0; i < n; i++) {
      const x = (rng() * TILE) | 0;
      const y = (rng() * TILE) | 0;
      const w = 1 + ((rng() * span) | 0);
      const h = 1 + ((rng() * span) | 0);
      const d = (rng() - 0.5) * 40;
      ctx.fillStyle = 'rgba(' + (r + d | 0) + ',' + (g + d | 0) + ',' + (b + d | 0) + ',1)';
      ctx.fillRect(x, y, w, h);
    }
  }

  function drawGrassTop(ctx, rng) {
    noisyFill(ctx, rng, 122, 190, 76, 34);
    speckle(ctx, rng, 70, 140, 40, 14, 2);
  }

  function drawGrassSide(ctx, rng) {
    // 泥土底
    noisyFill(ctx, rng, 139, 90, 43, 38);
    speckle(ctx, rng, 110, 70, 30, 16, 2);
    // 顶部草皮（锯齿边缘）
    for (let x = 0; x < TILE; x++) {
      const depth = 2 + ((rng() * 3) | 0);
      for (let y = 0; y < depth; y++) {
        const d = (rng() - 0.5) * 40;
        px(ctx, x, y, 108 + d, 170 + d, 62 + d);
      }
    }
  }

  function drawDirt(ctx, rng) {
    noisyFill(ctx, rng, 139, 90, 43, 42);
    speckle(ctx, rng, 110, 70, 30, 18, 2);
    speckle(ctx, rng, 160, 115, 65, 8, 1);
  }

  function drawStone(ctx, rng) {
    noisyFill(ctx, rng, 136, 136, 136, 30);
    speckle(ctx, rng, 105, 105, 105, 12, 3);
    speckle(ctx, rng, 165, 165, 165, 10, 2);
  }

  function drawCobble(ctx, rng) {
    drawStone(ctx, rng);
    // 石块轮廓
    ctx.strokeStyle = 'rgba(70,70,70,0.9)';
    ctx.lineWidth = 1;
    const blobs = [[1,1,5,4],[7,0,5,5],[1,6,4,4],[6,6,5,4],[10,2,5,4],[11,8,4,4],[0,11,5,4],[5,11,5,4]];
    for (const b of blobs) {
      ctx.strokeRect(b[0] + 0.5, b[1] + 0.5, b[2], b[3]);
    }
  }

  function drawPlanks(ctx, rng) {
    noisyFill(ctx, rng, 176, 138, 74, 26);
    ctx.fillStyle = 'rgba(96,66,30,0.9)';
    for (let y = 3; y < TILE; y += 4) ctx.fillRect(0, y, TILE, 1);
    // 板与板错缝
    ctx.fillStyle = 'rgba(120,84,40,0.5)';
    ctx.fillRect(7, 0, 1, 4);
    ctx.fillRect(3, 4, 1, 4);
    ctx.fillRect(11, 8, 1, 4);
    ctx.fillRect(6, 12, 1, 4);
  }

  function drawLogSide(ctx, rng) {
    noisyFill(ctx, rng, 104, 76, 38, 22);
    for (let x = 0; x < TILE; x += 2) {
      const d = (rng() - 0.5) * 30;
      ctx.fillStyle = 'rgba(' + (78 + d | 0) + ',' + (54 + d | 0) + ',' + (26 + d | 0) + ',1)';
      ctx.fillRect(x, 0, 1, TILE);
    }
  }

  function drawLogTop(ctx, rng) {
    noisyFill(ctx, rng, 178, 140, 78, 18);
    ctx.strokeStyle = 'rgba(110,80,38,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(1.5, 1.5, 13, 13);
    ctx.beginPath();
    ctx.arc(8, 8, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(8, 8, 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawLeaves(ctx, rng) {
    noisyFill(ctx, rng, 52, 126, 44, 40);
    speckle(ctx, rng, 28, 88, 26, 18, 2);
    speckle(ctx, rng, 90, 160, 60, 12, 1);
  }

  function drawSand(ctx, rng) {
    noisyFill(ctx, rng, 218, 205, 154, 28);
    speckle(ctx, rng, 190, 172, 120, 12, 2);
  }

  function drawWater(ctx, rng) {
    noisyFill(ctx, rng, 61, 110, 224, 34);
    speckle(ctx, rng, 90, 150, 240, 10, 3);
  }

  function drawBedrock(ctx, rng) {
    noisyFill(ctx, rng, 58, 58, 58, 46);
    speckle(ctx, rng, 20, 20, 20, 14, 3);
    speckle(ctx, rng, 96, 96, 96, 10, 3);
  }

  function drawOre(ctx, rng, r, g, b) {
    drawStone(ctx, rng);
    const spots = [[3, 4], [9, 5], [6, 10], [11, 11], [12, 2]];
    for (const s of spots) {
      const n = 2 + ((rng() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const x = s[0] + ((rng() * 4) | 0) - 1;
        const y = s[1] + ((rng() * 4) | 0) - 1;
        if (x >= 0 && y >= 0 && x < TILE && y < TILE) {
          const d = (rng() - 0.5) * 46;
          px(ctx, x, y, r + d, g + d, b + d);
        }
      }
    }
  }

  function drawSnow(ctx, rng) {
    noisyFill(ctx, rng, 242, 246, 250, 18);
    speckle(ctx, rng, 220, 228, 238, 8, 1);
  }

  function drawGlass(ctx, rng) {
    ctx.clearRect(0, 0, TILE, TILE);
    // 白色边框
    ctx.fillStyle = 'rgba(235,244,250,0.92)';
    ctx.fillRect(0, 0, TILE, 1);
    ctx.fillRect(0, TILE - 1, TILE, 1);
    ctx.fillRect(0, 0, 1, TILE);
    ctx.fillRect(TILE - 1, 0, 1, TILE);
    // 对角高光
    ctx.fillStyle = 'rgba(235,244,250,0.55)';
    for (let i = 1; i < 6; i++) ctx.fillRect(i, i, 2, 1);
    for (let i = 3; i < 8; i++) ctx.fillRect(TILE - 3 - i, i + 2, 2, 1);
    // 中心淡色
    ctx.fillStyle = 'rgba(210,230,242,0.10)';
    ctx.fillRect(2, 2, TILE - 4, TILE - 4);
  }

  function drawGravel(ctx, rng) {
    noisyFill(ctx, rng, 128, 120, 116, 40);
    speckle(ctx, rng, 88, 80, 76, 16, 2);
    speckle(ctx, rng, 168, 158, 150, 12, 2);
  }

  function drawBrick(ctx, rng) {
    noisyFill(ctx, rng, 150, 82, 60, 28);
    ctx.fillStyle = 'rgba(196,180,170,0.85)';
    ctx.fillRect(0, 3, TILE, 1);
    ctx.fillRect(0, 7, TILE, 1);
    ctx.fillRect(0, 11, TILE, 1);
    ctx.fillRect(0, 15, TILE, 1);
    ctx.fillRect(7, 0, 1, 3);
    ctx.fillRect(3, 4, 1, 3);
    ctx.fillRect(11, 4, 1, 3);
    ctx.fillRect(7, 8, 1, 3);
    ctx.fillRect(3, 12, 1, 3);
    ctx.fillRect(11, 12, 1, 3);
  }

  function drawCloud(ctx, rng) {
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(2, 5, 12, 6);
    ctx.fillRect(5, 2, 8, 12);
    ctx.fillRect(1, 7, 3, 4);
    ctx.fillRect(12, 7, 3, 4);
    ctx.clearRect(0, 0, 1, 2);
    ctx.clearRect(15, 0, 1, 2);
  }

  const DRAWERS = [
    drawGrassTop, drawGrassSide, drawDirt, drawStone, drawCobble,
    drawPlanks, drawLogSide, drawLogTop, drawLeaves, drawSand,
    drawWater, drawBedrock, drawOre, drawOre, drawOre,
    drawOre, drawSnow, drawGlass, drawGravel, drawBrick,
    drawCloud
  ];

  function buildAtlas() {
    const canvas = document.createElement('canvas');
    canvas.width = COLS * TILE;
    canvas.height = ROWS * TILE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const tileUVs = [];
    const count = DRAWERS.length;
    for (let i = 0; i < count; i++) {
      const col = i % COLS;
      const row = (i / COLS) | 0;
      const rng = MCNoise.mulberry32(987654321 + i * 7777);
      const t = makeTile();
      if (i === T.COAL) drawOre(t.ctx, rng, 58, 58, 58);
      else if (i === T.IRON) drawOre(t.ctx, rng, 216, 175, 147);
      else if (i === T.GOLD) drawOre(t.ctx, rng, 245, 212, 66);
      else if (i === T.DIAMOND) drawOre(t.ctx, rng, 93, 231, 228);
      else DRAWERS[i](t.ctx, rng);
      ctx.drawImage(t.c, col * TILE, row * TILE);
      tileUVs.push({
        col, row,
        u0: (col * TILE + 0.5) / canvas.width,
        u1: ((col + 1) * TILE - 0.5) / canvas.width,
        // 纹理上传时启用 UNPACK_FLIP_Y_WEBGL：v=1 对应画布顶部
        v0: ((ROWS - row - 1) * TILE + 0.5) / canvas.height,
        v1: ((ROWS - row) * TILE - 0.5) / canvas.height
      });
    }
    return { canvas, tileUVs, cols: COLS, rows: ROWS, tile: TILE };
  }

  // ---------------- 方块定义 ----------------
  // face 图集索引: top / bottom / side
  function B(id, name, solid, opaque, top, bottom, side, tint, icon) {
    return {
      id, name, solid, opaque,
      top: top === undefined ? side : top,
      bottom: bottom === undefined ? side : bottom,
      side,
      tint,
      icon: icon === undefined ? (side === undefined ? top : side) : icon
    };
  }

  const Blocks = [
    B(0, '空气', false, false, undefined, undefined, undefined, [255, 255, 255]),
    B(1, '草方块', true, true, T.GRASS_TOP, T.DIRT, T.GRASS_SIDE, [110, 170, 60]),
    B(2, '泥土', true, true, T.DIRT, T.DIRT, T.DIRT, [134, 96, 67]),
    B(3, '石头', true, true, T.STONE, T.STONE, T.STONE, [125, 125, 125]),
    B(4, '圆石', true, true, T.COBBLE, T.COBBLE, T.COBBLE, [120, 120, 120]),
    B(5, '木板', true, true, T.PLANKS, T.PLANKS, T.PLANKS, [176, 138, 74]),
    B(6, '原木', true, true, T.LOG_TOP, T.LOG_TOP, T.LOG_SIDE, [104, 76, 38]),
    B(7, '树叶', true, true, T.LEAVES, T.LEAVES, T.LEAVES, [52, 126, 44]),
    B(8, '沙子', true, true, T.SAND, T.SAND, T.SAND, [218, 205, 154]),
    B(9, '水', false, false, T.WATER, T.WATER, T.WATER, [70, 120, 220]),
    B(10, '基岩', true, true, T.BEDROCK, T.BEDROCK, T.BEDROCK, [58, 58, 58]),
    B(11, '煤矿石', true, true, T.COAL, T.COAL, T.COAL, [58, 58, 58]),
    B(12, '铁矿石', true, true, T.IRON, T.IRON, T.IRON, [216, 175, 147]),
    B(13, '金矿石', true, true, T.GOLD, T.GOLD, T.GOLD, [245, 212, 66]),
    B(14, '钻石矿石', true, true, T.DIAMOND, T.DIAMOND, T.DIAMOND, [93, 231, 228]),
    B(15, '雪块', true, true, T.SNOW, T.SNOW, T.SNOW, [242, 246, 250]),
    B(16, '玻璃', true, true, T.GLASS, T.GLASS, T.GLASS, [210, 230, 242]),
    B(17, '沙砾', true, true, T.GRAVEL, T.GRAVEL, T.GRAVEL, [128, 120, 116]),
    B(18, '砖块', true, true, T.BRICK, T.BRICK, T.BRICK, [150, 82, 60])
  ];

  global.MCTextures = { T, Blocks, buildAtlas };
})(window);
