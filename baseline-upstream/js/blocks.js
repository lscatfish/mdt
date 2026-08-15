/* 方块定义与程序化像素纹理图集 */
(function (global) {
  'use strict';

  const TILE = 16;          // 图集中每块纹理 16x16 像素
  const TILES = 16;         // 4x4 纹理表

  const BLOCK = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
    SAND: 4,
    WOOD: 5,
    LEAVES: 6,
    WATER: 7,
    PLANKS: 8,
    GLASS: 9,
    SNOW: 10,
    COBBLESTONE: 11,
    BRICK: 12,
    BEDROCK: 13
  };

  const TILE_INDEX = {
    GRASS_TOP: 0,
    GRASS_SIDE: 1,
    DIRT: 2,
    STONE: 3,
    SAND: 4,
    WOOD_SIDE: 5,
    WOOD_TOP: 6,
    LEAVES: 7,
    WATER: 8,
    PLANKS: 9,
    GLASS: 10,
    SNOW: 11,
    COBBLESTONE: 12,
    BRICK: 13,
    BEDROCK: 14,
    EXTRA: 15
  };

  const DEFS = {};
  function def(id, name, opt) { DEFS[id] = Object.assign({ id, name, solid: true, opaque: true, unbreakable: false }, opt); }

  def(BLOCK.AIR, '空气', { solid: false, opaque: false });
  def(BLOCK.GRASS, '草方块', { tiles: { top: 0, bottom: 2, side: 1 } });
  def(BLOCK.DIRT, '泥土', { tiles: { all: 2 } });
  def(BLOCK.STONE, '石头', { tiles: { all: 3 } });
  def(BLOCK.SAND, '沙子', { tiles: { all: 4 } });
  def(BLOCK.WOOD, '橡木原木', { tiles: { top: 6, bottom: 6, side: 5 } });
  def(BLOCK.LEAVES, '橡树树叶', { tiles: { all: 7 } });
  def(BLOCK.WATER, '水', { solid: false, opaque: false, transparent: true, tiles: { all: 8 } });
  def(BLOCK.PLANKS, '橡木木板', { tiles: { all: 9 } });
  def(BLOCK.GLASS, '玻璃', { transparent: true, tiles: { all: 10 } });
  def(BLOCK.SNOW, '雪块', { tiles: { all: 11 } });
  def(BLOCK.COBBLESTONE, '圆石', { tiles: { all: 12 } });
  def(BLOCK.BRICK, '红砖块', { tiles: { all: 13 } });
  def(BLOCK.BEDROCK, '基岩', { unbreakable: true, tiles: { all: 14 } });

  const HOTBAR = [
    BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.COBBLESTONE, BLOCK.SAND,
    BLOCK.WOOD, BLOCK.PLANKS, BLOCK.LEAVES, BLOCK.GLASS
  ];

  function getTileIndex(blockId, face) {
    const d = DEFS[blockId];
    if (!d || !d.tiles) return 0;
    if (d.tiles.all != null) return d.tiles.all;
    if (face === 'py') return d.tiles.top != null ? d.tiles.top : d.tiles.side;
    if (face === 'ny') return d.tiles.bottom != null ? d.tiles.bottom : d.tiles.side;
    return d.tiles.side;
  }

  /* ---------- 像素绘制工具 ---------- */

  function pixel(ctx, x0, y0, r, g, b, a) {
    ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (a == null ? 1 : a) + ')';
    ctx.fillRect(x0, y0, 1, 1);
  }

  function noisyCell(ctx, x0, y0, r, g, b, variation, rand) {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const n = Math.floor((rand() * 2 - 1) * variation);
        pixel(ctx, x0 + x, y0 + y,
          Math.max(0, Math.min(255, r + n)),
          Math.max(0, Math.min(255, g + n)),
          Math.max(0, Math.min(255, b + n)));
      }
    }
  }

  function scatter(ctx, x0, y0, rand, count, r, g, b, a) {
    for (let i = 0; i < count; i++) {
      const x = Math.floor(rand() * TILE);
      const y = Math.floor(rand() * TILE);
      pixel(ctx, x0 + x, y0 + y, r, g, b, a);
    }
  }

  function tilePos(tileIndex) {
    return { x: (tileIndex % 4) * TILE, y: Math.floor(tileIndex / 4) * TILE };
  }

  /* ---------- 每种纹理的绘制 ---------- */

  function drawGrassTop(ctx, p, rand) {
    noisyCell(ctx, p.x, p.y, 104, 168, 62, 14, rand);
    scatter(ctx, p.x, p.y, rand, 10, 72, 132, 42);
    scatter(ctx, p.x, p.y, rand, 5, 132, 190, 76);
  }

  function drawGrassSide(ctx, p, rand) {
    noisyCell(ctx, p.x, p.y, 133, 96, 67, 10, rand);
    scatter(ctx, p.x, p.y, rand, 9, 105, 74, 50);
    for (let x = 0; x < TILE; x++) {
      let depth = 3;
      const r = rand();
      if (r < 0.12) depth = 2;
      else if (r < 0.28) depth = 4;
      else if (r < 0.55) depth = 1;
      for (let y = 0; y < depth; y++) {
        const n = Math.floor((rand() * 2 - 1) * 11);
        pixel(ctx, p.x + x, p.y + y,
          Math.max(0, Math.min(255, 108 + n)),
          Math.max(0, Math.min(255, 166 + n)),
          Math.max(0, Math.min(255, 64 + n)));
      }
    }
  }

  function drawDirt(ctx, p, rand) {
    noisyCell(ctx, p.x, p.y, 133, 96, 67, 11, rand);
    scatter(ctx, p.x, p.y, rand, 14, 101, 72, 49);
    scatter(ctx, p.x, p.y, rand, 6, 158, 122, 86);
  }

  function drawStone(ctx, p, rand) {
    noisyCell(ctx, p.x, p.y, 128, 128, 130, 10, rand);
    scatter(ctx, p.x, p.y, rand, 12, 98, 98, 101);
    scatter(ctx, p.x, p.y, rand, 7, 158, 158, 162);
    for (let i = 0; i < 3; i++) {
      let x = Math.floor(rand() * 14), y = Math.floor(rand() * 14);
      const len = 3 + Math.floor(rand() * 4);
      for (let j = 0; j < len; j++) {
        pixel(ctx, p.x + x, p.y + y, 82, 82, 86);
        x += rand() < 0.6 ? 1 : 0;
        y += rand() < 0.7 ? 1 : 0;
        if (x >= TILE || y >= TILE) break;
      }
    }
  }

  function drawSand(ctx, p, rand) {
    noisyCell(ctx, p.x, p.y, 220, 207, 163, 10, rand);
    scatter(ctx, p.x, p.y, rand, 10, 196, 181, 136);
    scatter(ctx, p.x, p.y, rand, 8, 236, 226, 188);
  }

  function drawWoodSide(ctx, p, rand) {
    noisyCell(ctx, p.x, p.y, 103, 82, 50, 9, rand);
    for (let x = 0; x < TILE; x++) {
      const stripe = (x % 4 === 3);
      for (let y = 0; y < TILE; y++) {
        if (stripe) {
          const n = Math.floor((rand() * 2 - 1) * 7);
          pixel(ctx, p.x + x, p.y + y, 78 + n, 60 + n, 37 + n);
        } else if (rand() < 0.16) {
          const n = Math.floor((rand() * 2 - 1) * 8);
          pixel(ctx, p.x + x, p.y + y, 118 + n, 96 + n, 60 + n);
        }
      }
    }
  }

  function drawWoodTop(ctx, p, rand) {
    noisyCell(ctx, p.x, p.y, 126, 100, 62, 8, rand);
    const cx = 7.5, cy = 7.5;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
        const ring = Math.floor(d) % 3;
        if (ring === 1) {
          pixel(ctx, p.x + x, p.y + y, 96, 74, 45);
        } else if (ring === 2 && rand() < 0.4) {
          pixel(ctx, p.x + x, p.y + y, 82, 63, 39);
        }
      }
    }
  }

  function drawLeaves(ctx, p, rand) {
    noisyCell(ctx, p.x, p.y, 62, 136, 50, 16, rand);
    scatter(ctx, p.x, p.y, rand, 26, 30, 88, 30);
    scatter(ctx, p.x, p.y, rand, 14, 96, 178, 66);
    scatter(ctx, p.x, p.y, rand, 8, 18, 62, 22);
  }

  function drawWater(ctx, p, rand) {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const n = Math.floor((rand() * 2 - 1) * 8);
        const wave = ((x + y) % 7 === 0) ? 28 : 0;
        pixel(ctx, p.x + x, p.y + y,
          Math.max(0, Math.min(255, 46 + n + wave)),
          Math.max(0, Math.min(255, 104 + n + wave)),
          Math.max(0, Math.min(255, 230 + n + wave)), 0.72);
      }
    }
  }

  function drawPlanks(ctx, p, rand) {
    noisyCell(ctx, p.x, p.y, 174, 140, 84, 10, rand);
    for (let y = 0; y < TILE; y++) {
      if (y === 3 || y === 7 || y === 11 || y === 15) {
        for (let x = 0; x < TILE; x++) pixel(ctx, p.x + x, p.y + y, 96, 72, 42);
      }
    }
    for (let x = 0; x < TILE; x++) {
      if (x === 7) {
        for (let y = 0; y < TILE; y++) {
          if (y % 4 !== 3) pixel(ctx, p.x + x, p.y + y, 102, 76, 45);
        }
      }
    }
    scatter(ctx, p.x, p.y, rand, 8, 120, 90, 52);
  }

  function drawGlass(ctx, p, rand) {
    ctx.clearRect(p.x, p.y, TILE, TILE);
    for (let x = 0; x < TILE; x++) {
      for (let y = 0; y < TILE; y++) {
        const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
        const streak = (x + y === 7 || x + y === 8);
        if (edge) pixel(ctx, p.x + x, p.y + y, 226, 244, 244, 0.9);
        else if (streak) pixel(ctx, p.x + x, p.y + y, 210, 238, 240, 0.55);
        else if (rand() < 0.035) pixel(ctx, p.x + x, p.y + y, 190, 230, 235, 0.4);
      }
    }
  }

  function drawSnow(ctx, p, rand) {
    noisyCell(ctx, p.x, p.y, 238, 244, 248, 7, rand);
    scatter(ctx, p.x, p.y, rand, 8, 210, 224, 236);
  }

  function drawCobblestone(ctx, p, rand) {
    drawStone(ctx, p, rand);
    for (let i = 0; i < 7; i++) {
      const x = 1 + Math.floor(rand() * 12);
      const y = 1 + Math.floor(rand() * 12);
      const r = 78 + Math.floor(rand() * 30);
      const g = 78 + Math.floor(rand() * 30);
      const b = 82 + Math.floor(rand() * 28);
      const w = 2 + Math.floor(rand() * 3);
      const h = 1 + Math.floor(rand() * 3);
      for (let yy = y; yy < y + h && yy < TILE - 1; yy++) {
        for (let xx = x; xx < x + w && xx < TILE - 1; xx++) {
          if (rand() < 0.55) pixel(ctx, p.x + xx, p.y + yy, r, g, b);
        }
      }
    }
  }

  function drawBrick(ctx, p, rand) {
    const rows = [[0, 4], [4, 8], [8, 12], [12, 16]];
    rows.forEach(function (row, ri) {
      const y0 = row[0], y1 = row[1];
      const shift = (ri % 2) * 4;
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < TILE; x++) {
          const mortar = (y === y1 - 1) || ((x + shift) % 8 === 0);
          if (mortar) {
            pixel(ctx, p.x + x, p.y + y, 188, 182, 178);
          } else {
            const n = Math.floor((rand() * 2 - 1) * 10);
            pixel(ctx, p.x + x, p.y + y,
              Math.max(0, Math.min(255, 146 + n)),
              Math.max(0, Math.min(255, 60 + n)),
              Math.max(0, Math.min(255, 52 + n)));
          }
        }
      }
    });
    scatter(ctx, p.x, p.y, rand, 8, 112, 42, 36);
  }

  function drawBedrock(ctx, p, rand) {
    noisyCell(ctx, p.x, p.y, 66, 66, 70, 16, rand);
    scatter(ctx, p.x, p.y, rand, 16, 34, 34, 38);
    scatter(ctx, p.x, p.y, rand, 10, 100, 100, 106);
  }

  const DRAW_TILE = {
    0: drawGrassTop,
    1: drawGrassSide,
    2: drawDirt,
    3: drawStone,
    4: drawSand,
    5: drawWoodSide,
    6: drawWoodTop,
    7: drawLeaves,
    8: drawWater,
    9: drawPlanks,
    10: drawGlass,
    11: drawSnow,
    12: drawCobblestone,
    13: drawBrick,
    14: drawBedrock
  };

  /* ---------- 图集构建 ---------- */

  function buildAtlas(seed) {
    const canvas = document.createElement('canvas');
    canvas.width = TILES * TILE;
    canvas.height = TILES * TILE;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < TILES; i++) {
      const p = tilePos(i);
      const rand = NoiseUtil.mulberry32(seed + i * 1013904223);
      const draw = DRAW_TILE[i] || drawStone;
      draw(ctx, p, rand);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return { canvas, texture };
  }

  /* 快捷栏图标：从图集放大单个纹理，保持像素风 */
  function createBlockIcon(atlasCanvas, blockId, face) {
    const idx = getTileIndex(blockId, face || 'side');
    const p = tilePos(idx);
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlasCanvas, p.x, p.y, TILE, TILE, 0, 0, 64, 64);
    return c.toDataURL('image/png');
  }

  function isOpaque(id) { const d = DEFS[id]; return !!d && d.opaque; }
  function isSolid(id) { const d = DEFS[id]; return !!d && d.solid; }
  function isTransparent(id) { const d = DEFS[id]; return !!d && d.transparent; }
  function isUnbreakable(id) { const d = DEFS[id]; return !!d && d.unbreakable; }
  function blockName(id) { const d = DEFS[id]; return d ? d.name : '未知'; }

  global.Blocks = {
    TILE, TILES,
    BLOCK, DEFS, HOTBAR,
    getTileIndex, buildAtlas, createBlockIcon,
    isOpaque, isSolid, isTransparent, isUnbreakable, blockName
  };
})(window);
