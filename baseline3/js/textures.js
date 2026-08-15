/* 程序化像素纹理图集：不依赖任何外部图片资源 */
(function () {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const TILE = 16;
  const GRID = 8;
  const SIZE = TILE * GRID; // 128

  const TILE_INDEX = {
    grass_top: 0, grass_side: 1, dirt: 2, stone: 3, cobblestone: 4,
    planks: 5, log_top: 6, log_side: 7, leaves: 8, sand: 9, glass: 10,
    brick: 11, water: 12, snow_side: 13, snow_top: 14, bedrock: 15
  };

  function paint(canvas, index, painter) {
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(TILE, TILE);
    const rnd = mulberry32(1000 + index * 7919);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const p = painter(x, y, rnd);
        const o = (y * TILE + x) * 4;
        img.data[o] = p[0];
        img.data[o + 1] = p[1];
        img.data[o + 2] = p[2];
        img.data[o + 3] = p.length > 3 ? p[3] : 255;
      }
    }
    const tx = (index % GRID) * TILE;
    const ty = Math.floor(index / GRID) * TILE;
    ctx.putImageData(img, tx, ty);
  }

  function vary(rgb, rnd, amt) {
    const d = (rnd() * 2 - 1) * amt;
    return rgb.map(function (c) { return Math.max(0, Math.min(255, Math.round(c + d))); });
  }

  function speckle(base, rnd, colors, chance) {
    if (rnd() < chance) return colors[Math.floor(rnd() * colors.length)];
    return vary(base, rnd, 10);
  }

  const DIRT = [121, 85, 58];
  const GRASS_GREEN = [106, 191, 62];
  const DARK_GREEN = [40, 120, 34];
  const STONE = [136, 136, 140];
  const WOOD = [141, 106, 58];
  const LEAF = [46, 124, 34];

  function buildAtlas() {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;

    // 0 草方块顶面
    paint(canvas, TILE_INDEX.grass_top, function (x, y, rnd) {
      if (rnd() < 0.08) return [Math.round(GRASS_GREEN[0] * 0.8), Math.round(GRASS_GREEN[1] * 0.8), Math.round(GRASS_GREEN[2] * 0.75), 255];
      if (rnd() < 0.06) return [120, 200, 80, 255];
      return vary(GRASS_GREEN, rnd, 14);
    });

    // 1 草方块侧面（顶部绿色渐变 + 泥土）
    paint(canvas, TILE_INDEX.grass_side, function (x, y, rnd) {
      if (y <= 2 + Math.floor(rnd() * 2)) {
        const d = (rnd() * 2 - 1) * 12;
        return [GRASS_GREEN[0] + d, GRASS_GREEN[1] + d, GRASS_GREEN[2] + Math.round(d * 0.6), 255];
      }
      if (y < 6 && rnd() < 0.3) return [GRASS_GREEN[0] - 10, GRASS_GREEN[1] - 10, GRASS_GREEN[2] - 4, 255];
      return speckle(DIRT, rnd, [[150, 110, 78], [96, 66, 44]], 0.10);
    });

    // 2 泥土
    paint(canvas, TILE_INDEX.dirt, function (x, y, rnd) {
      return speckle(DIRT, rnd, [[154, 114, 82], [92, 62, 42], [132, 96, 66]], 0.12);
    });

    // 3 石头
    paint(canvas, TILE_INDEX.stone, function (x, y, rnd) {
      return speckle(STONE, rnd, [[110, 110, 114], [160, 160, 164]], 0.12);
    });

    // 4 圆石：网格细胞 + 高光
    paint(canvas, TILE_INDEX.cobblestone, function (x, y, rnd) {
      let v = speckle(STONE, rnd, [[110, 110, 114], [158, 158, 162]], 0.10);
      const gx = x % 4, gy = y % 4;
      if (gx === 3 || gy === 3) v = [72, 72, 76];
      else if (gx === 0 && gy === 0) v = [176, 176, 180];
      else if (gx === 1 && gy === 1 && rnd() < 0.3) v = [104, 104, 108];
      return v;
    });

    // 5 木板
    paint(canvas, TILE_INDEX.planks, function (x, y, rnd) {
      const row = Math.floor(y / 4);
      const base = vary(WOOD, rnd, 12);
      if (y % 4 === 3) return [96, 70, 40];
      if (y % 4 === 0 && rnd() < 0.2) return [110, 82, 45];
      if (rnd() < 0.06 && (x % 8 === 0)) return [100, 74, 42];
      return base;
    });

    // 6 原木顶面（年轮）
    paint(canvas, TILE_INDEX.log_top, function (x, y, rnd) {
      const cx = 7.5, cy = 7.5;
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      const ring = Math.floor(d);
      const v = vary(ring % 2 ? [152, 118, 66] : [112, 82, 44], rnd, 8);
      if (d < 2) return vary([190, 158, 100], rnd, 10);
      if (d > 7) return vary([90, 66, 36], rnd, 8);
      return v;
    });

    // 7 原木侧面（纵向树皮）
    paint(canvas, TILE_INDEX.log_side, function (x, y, rnd) {
      const stripe = x % 4;
      const v = vary(stripe < 2 ? [118, 86, 48] : [98, 72, 40], rnd, 14);
      if (rnd() < 0.04) return [64, 48, 28];
      return v;
    });

    // 8 树叶（带透明洞，配合 alphaTest）
    paint(canvas, TILE_INDEX.leaves, function (x, y, rnd) {
      if (rnd() < 0.14) return [0, 0, 0, 0];
      if (rnd() < 0.10) return [88, 168, 60, 255];
      if (rnd() < 0.08) return [24, 86, 24, 255];
      return vary(LEAF, rnd, 18);
    });

    // 9 沙子
    paint(canvas, TILE_INDEX.sand, function (x, y, rnd) {
      return speckle([217, 200, 144], rnd, [[240, 224, 168], [188, 170, 118]], 0.12);
    });

    // 10 玻璃（边框 + 高光，其余透明，配合 alphaTest）
    paint(canvas, TILE_INDEX.glass, function (x, y, rnd) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      if (edge) return [210, 236, 242, 255];
      if ((x === 2 && y === 5) || (x === 3 && y === 5) || (x === 3 && y === 6) || (x === 2 && y === 6)) return [245, 255, 255, 210];
      if (rnd() < 0.10) return [190, 220, 230, 130];
      return [0, 0, 0, 0];
    });

    // 11 红砖
    paint(canvas, TILE_INDEX.brick, function (x, y, rnd) {
      const row = Math.floor(y / 4);
      if (y % 4 === 3) return [164, 158, 150];
      if ((y % 4 === 0) && x % 8 === 0) return [164, 158, 150];
      return vary([168, 74, 54], rnd, 14);
    });

    // 12 水
    paint(canvas, TILE_INDEX.water, function (x, y, rnd) {
      const wave = (y % 4 === 0 && rnd() < 0.5);
      const base = wave ? [76, 130, 225] : [46, 94, 205];
      if (rnd() < 0.08) return [120, 168, 240];
      return vary(base, rnd, 8);
    });

    // 13 雪方块侧面
    paint(canvas, TILE_INDEX.snow_side, function (x, y, rnd) {
      if (y <= 3 + Math.floor(rnd() * 2)) return vary([232, 240, 248], rnd, 8);
      if (y < 7 && rnd() < 0.25) return [220, 230, 240];
      return speckle(DIRT, rnd, [[140, 102, 72]], 0.10);
    });

    // 14 雪顶面
    paint(canvas, TILE_INDEX.snow_top, function (x, y, rnd) {
      if (rnd() < 0.08) return [190, 210, 235];
      return vary([238, 244, 250], rnd, 6);
    });

    // 15 基岩
    paint(canvas, TILE_INDEX.bedrock, function (x, y, rnd) {
      const gx = x % 6, gy = y % 6;
      let v = vary([70, 70, 74], rnd, 16);
      if (gx === 5 || gy === 5) v = [30, 30, 32];
      else if (rnd() < 0.3) v = [104, 104, 108];
      return v;
    });

    return canvas;
  }

  function tileUV(name) {
    const idx = TILE_INDEX[name];
    const u0 = (idx % GRID) * TILE / SIZE;
    const v1 = 1 - Math.floor(idx / GRID) * TILE / SIZE;
    const u1 = u0 + TILE / SIZE;
    const v0 = v1 - TILE / SIZE;
    return { u0: u0, v0: v0, u1: u1, v1: v1 };
  }

  const atlasCanvas = buildAtlas();

  window.MCTextures = {
    canvas: atlasCanvas,
    TILE_INDEX: TILE_INDEX,
    tileUV: tileUV
  };
})();
