'use strict';
/* WebCraft · 方块定义 + 程序化纹理图集 */
(function () {
  const BLOCK = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4,
    LOG: 5, LEAVES: 6, WATER: 7, PLANKS: 8, COBBLE: 9,
    BRICK: 10, GLASS: 11, BEDROCK: 12, FLOWER_RED: 13,
    FLOWER_YELLOW: 14, TALL_GRASS: 15, SNOW: 16
  };

  /* 面朝向 */
  const FACE = { TOP: 0, BOTTOM: 1, PLUS_X: 2, MINUS_X: 3, PLUS_Z: 4, MINUS_Z: 5 };

  const TILE_NAMES = [
    'grassTop', 'grassSide', 'dirt', 'stone', 'sand',
    'logTop', 'logSide', 'leaves', 'water', 'planks',
    'cobble', 'brick', 'glass', 'bedrock',
    'flowerRed', 'flowerYellow', 'tallGrass', 'snow'
  ];
  const TILE = {};
  TILE_NAMES.forEach((name, i) => { TILE[name] = i; });

  /* kind: solid(不透明立方体) | cutout(树叶/花草) | glass | water | cross */
  const DEFS = [
    { id: 0, name: '空气', solid: false, occlude: false, kind: 'air' },
    { id: 1, name: '草方块', solid: true, occlude: true, kind: 'solid',
      tiles: { top: TILE.grassTop, bottom: TILE.dirt, side: TILE.grassSide } },
    { id: 2, name: '泥土', solid: true, occlude: true, kind: 'solid', tile: TILE.dirt },
    { id: 3, name: '石头', solid: true, occlude: true, kind: 'solid', tile: TILE.stone },
    { id: 4, name: '沙子', solid: true, occlude: true, kind: 'solid', tile: TILE.sand },
    { id: 5, name: '原木', solid: true, occlude: true, kind: 'solid',
      tiles: { top: TILE.logTop, bottom: TILE.logTop, side: TILE.logSide } },
    { id: 6, name: '树叶', solid: true, occlude: true, kind: 'cutout', tile: TILE.leaves },
    { id: 7, name: '水', solid: false, occlude: false, kind: 'water', tile: TILE.water },
    { id: 8, name: '木板', solid: true, occlude: true, kind: 'solid', tile: TILE.planks },
    { id: 9, name: '圆石', solid: true, occlude: true, kind: 'solid', tile: TILE.cobble },
    { id: 10, name: '砖块', solid: true, occlude: true, kind: 'solid', tile: TILE.brick },
    { id: 11, name: '玻璃', solid: true, occlude: false, kind: 'glass', tile: TILE.glass },
    { id: 12, name: '基岩', solid: true, occlude: true, kind: 'solid', tile: TILE.bedrock },
    { id: 13, name: '红花', solid: false, occlude: false, kind: 'cross', tile: TILE.flowerRed },
    { id: 14, name: '黄花', solid: false, occlude: false, kind: 'cross', tile: TILE.flowerYellow },
    { id: 15, name: '草丛', solid: false, occlude: false, kind: 'cross', tile: TILE.tallGrass },
    { id: 16, name: '雪块', solid: true, occlude: true, kind: 'solid', tile: TILE.snow }
  ];

  function info(id) { return DEFS[id] || DEFS[0]; }
  function isSolid(id) { return info(id).solid; }
  function isOccluder(id) { return info(id).occlude; }

  function tileFor(id, face) {
    const d = info(id);
    if (!d.tile && !d.tiles) return 0;
    if (d.tiles) {
      if (face === FACE.TOP) return d.tiles.top;
      if (face === FACE.BOTTOM) return d.tiles.bottom;
      return d.tiles.side;
    }
    return d.tile;
  }

  /* 快捷栏图标用哪个贴图 */
  function iconTile(id) {
    const d = info(id);
    if (d.tiles) return (id === BLOCK.GRASS) ? d.tiles.top : d.tiles.side;
    return d.tile || 0;
  }

  /* ---------------- 程序化纹理 ---------------- */
  const CELL = 16;
  const COLS = 10;

  function clamp255(v) {
    v = Math.round(v);
    return v < 0 ? 0 : (v > 255 ? 255 : v);
  }

  function tileCanvas() {
    const c = document.createElement('canvas');
    c.width = CELL; c.height = CELL;
    return c;
  }

  /* 用噪声填充整张 16x16 */
  function noiseFill(ctx, rng, r, g, b, spread, extra) {
    const img = ctx.createImageData(CELL, CELL);
    const d = img.data;
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const n = (rng() - 0.5) * 2 * spread;
        let rr = r + n, gg = g + n, bb = b + n;
        if (extra) { const e = extra(x, y, rng); rr += e[0]; gg += e[1]; bb += e[2]; }
        const i = (y * CELL + x) * 4;
        d[i] = clamp255(rr); d[i + 1] = clamp255(gg); d[i + 2] = clamp255(bb); d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  const GENERATORS = {
    [TILE.grassTop](ctx, rng) {
      noiseFill(ctx, rng, 96, 148, 62, 20, (x, y) =>
        (rng() < 0.04) ? [18, 24, 8] : (rng() < 0.06 ? [-16, -20, -8] : [0, 0, 0]));
    },
    [TILE.grassSide](ctx, rng) {
      noiseFill(ctx, rng, 120, 86, 54, 16, (x, y) =>
        (rng() < 0.05) ? [24, 18, 10] : (rng() < 0.06 ? [-22, -14, -8] : [0, 0, 0]));
      const img = ctx.getImageData(0, 0, CELL, CELL);
      const d = img.data;
      for (let x = 0; x < CELL; x++) {
        const depth = 2 + (rng() < 0.35 ? 1 : 0);
        for (let y = 0; y < CELL; y++) {
          let green = false;
          if (y < depth - 1) green = true;
          else if (y === depth - 1) green = rng() < 0.72;
          else if (y === depth) green = rng() < 0.16;
          if (green) {
            const i = (y * CELL + x) * 4;
            const n = (rng() - 0.5) * 36;
            d[i] = clamp255(98 + n);
            d[i + 1] = clamp255(150 + n);
            d[i + 2] = clamp255(62 + n * 0.7);
            d[i + 3] = 255;
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [TILE.dirt](ctx, rng) {
      noiseFill(ctx, rng, 122, 88, 56, 16, (x, y) =>
        (rng() < 0.06) ? [30, 22, 12] : (rng() < 0.08 ? [-28, -18, -10] : [0, 0, 0]));
    },
    [TILE.stone](ctx, rng) {
      noiseFill(ctx, rng, 126, 126, 130, 13, (x, y) => {
        if (rng() < 0.045) return [-46, -46, -42];
        if (rng() < 0.04) return [26, 26, 28];
        return [0, 0, 0];
      });
    },
    [TILE.sand](ctx, rng) {
      noiseFill(ctx, rng, 218, 198, 140, 14, (x, y) =>
        (rng() < 0.05) ? [-18, -14, -8] : (y % 5 === 0 && rng() < 0.3 ? [10, 8, 4] : [0, 0, 0]));
    },
    [TILE.logTop](ctx, rng) {
      noiseFill(ctx, rng, 158, 126, 78, 12);
      const img = ctx.getImageData(0, 0, CELL, CELL);
      const d = img.data;
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const dx = x - 7.5, dy = y - 7.5;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const i = (y * CELL + x) * 4;
          if (dist > 7) {
            d[i] = 108; d[i + 1] = 82; d[i + 2] = 50;
          } else if (Math.floor(dist * 2.2) % 2 === 0) {
            d[i] = clamp255(166 + (rng() - 0.5) * 18);
            d[i + 1] = clamp255(132 + (rng() - 0.5) * 18);
            d[i + 2] = clamp255(84 + (rng() - 0.5) * 14);
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [TILE.logSide](ctx, rng) {
      noiseFill(ctx, rng, 110, 88, 56, 12);
      const img = ctx.getImageData(0, 0, CELL, CELL);
      const d = img.data;
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const i = (y * CELL + x) * 4;
          if ((x % 4 === 2 || x % 4 === 3) && rng() < 0.85) {
            const n = (rng() - 0.5) * 22;
            d[i] = clamp255(80 + n); d[i + 1] = clamp255(64 + n); d[i + 2] = clamp255(40 + n);
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [TILE.leaves](ctx, rng) {
      noiseFill(ctx, rng, 66, 116, 40, 22);
      const img = ctx.getImageData(0, 0, CELL, CELL);
      const d = img.data;
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const i = (y * CELL + x) * 4;
          const roll = rng();
          if (roll < 0.14) d[i + 3] = 0;                 // 镂空
          else if (roll > 0.93) {                         // 深色叶簇
            d[i] = clamp255(d[i] - 34);
            d[i + 1] = clamp255(d[i + 1] - 44);
            d[i + 2] = clamp255(d[i + 2] - 14);
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [TILE.water](ctx, rng) {
      noiseFill(ctx, rng, 44, 82, 196, 14, (x, y) =>
        (rng() < 0.04) ? [30, 42, 36] : (rng() < 0.05 ? [-16, -10, -30] : [0, 0, 0]));
      const img = ctx.getImageData(0, 0, CELL, CELL);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 220;
      ctx.putImageData(img, 0, 0);
    },
    [TILE.planks](ctx, rng) {
      noiseFill(ctx, rng, 172, 138, 88, 12);
      const img = ctx.getImageData(0, 0, CELL, CELL);
      const d = img.data;
      for (let y = 0; y < CELL; y++) {
        const row = y >> 2;
        for (let x = 0; x < CELL; x++) {
          const i = (y * CELL + x) * 4;
          const seamV = ((x + row * 4) % 8 === 7);
          const seamH = (y % 4 === 0);
          if ((seamV && !seamH) || (seamH && rng() < 0.9)) {
            const n = (rng() - 0.5) * 14;
            d[i] = clamp255(94 + n); d[i + 1] = clamp255(72 + n); d[i + 2] = clamp255(46 + n);
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [TILE.cobble](ctx, rng) {
      noiseFill(ctx, rng, 116, 116, 120, 14);
      const img = ctx.getImageData(0, 0, CELL, CELL);
      const d = img.data;
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const i = (y * CELL + x) * 4;
          const edgeX = (x % 4 === 0), edgeY = (y % 4 === 0);
          if ((edgeX || edgeY) && rng() < 0.78) {
            const n = (rng() - 0.5) * 20;
            d[i] = clamp255(58 + n); d[i + 1] = clamp255(58 + n); d[i + 2] = clamp255(62 + n);
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [TILE.brick](ctx, rng) {
      noiseFill(ctx, rng, 152, 72, 54, 12);
      const img = ctx.getImageData(0, 0, CELL, CELL);
      const d = img.data;
      for (let y = 0; y < CELL; y++) {
        const row = y >> 2;
        for (let x = 0; x < CELL; x++) {
          const i = (y * CELL + x) * 4;
          const seamH = (y % 4 === 3);
          const seamV = (!seamH && ((x + row * 4) % 8 === 7));
          if (seamH || seamV) {
            const n = (rng() - 0.5) * 18;
            d[i] = clamp255(190 + n); d[i + 1] = clamp255(184 + n); d[i + 2] = clamp255(174 + n);
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [TILE.glass](ctx) {
      const img = ctx.createImageData(CELL, CELL);
      const d = img.data;
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const i = (y * CELL + x) * 4;
          const border = (x === 0 || y === 0 || x === 15 || y === 15);
          const streak = (x + y) % 9 === 0 || (x - y) % 11 === 0;
          d[i] = 190; d[i + 1] = 224; d[i + 2] = 240;
          d[i + 3] = border ? 240 : (streak ? 90 : 40);
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [TILE.bedrock](ctx, rng) {
      noiseFill(ctx, rng, 64, 64, 68, 30, (x, y) =>
        (rng() < 0.1) ? [-34, -34, -30] : (rng() < 0.1 ? [30, 30, 34] : [0, 0, 0]));
    },
    [TILE.flowerRed](ctx) {
      const img = ctx.createImageData(CELL, CELL);
      const d = img.data;
      const set = (x, y, r, g, b, a) => {
        if (x < 0 || y < 0 || x >= CELL || y >= CELL) return;
        const i = (y * CELL + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
      };
      for (let y = 7; y < CELL; y++) { set(7, y, 46, 116, 40, 255); set(8, y, 46, 116, 40, 255); }
      for (let y = 1; y < 9; y++) {
        for (let x = 2; x < 14; x++) {
          const dx = x - 8, dy = y - 4.5;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= 4.4) set(x, y, 214, 52, 52, 255);
        }
      }
      for (let y = 3; y < 7; y++) {
        for (let x = 6; x < 10; x++) {
          const dx = x - 8, dy = y - 4.5;
          if (dx * dx + dy * dy <= 2.6) set(x, y, 244, 214, 74, 255);
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [TILE.flowerYellow](ctx) {
      const img = ctx.createImageData(CELL, CELL);
      const d = img.data;
      const set = (x, y, r, g, b, a) => {
        if (x < 0 || y < 0 || x >= CELL || y >= CELL) return;
        const i = (y * CELL + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
      };
      for (let y = 7; y < CELL; y++) { set(7, y, 46, 116, 40, 255); set(8, y, 46, 116, 40, 255); }
      for (let y = 1; y < 9; y++) {
        for (let x = 2; x < 14; x++) {
          const dx = x - 8, dy = y - 4.5;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= 4.2) set(x, y, 238, 214, 72, 255);
        }
      }
      for (let y = 3; y < 7; y++) {
        for (let x = 6; x < 10; x++) {
          const dx = x - 8, dy = y - 4.5;
          if (dx * dx + dy * dy <= 2.4) set(x, y, 222, 160, 54, 255);
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [TILE.tallGrass](ctx) {
      const img = ctx.createImageData(CELL, CELL);
      const d = img.data;
      const set = (x, y, r, g, b, a) => {
        if (x < 0 || y < 0 || x >= CELL || y >= CELL) return;
        const i = (y * CELL + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
      };
      for (let x = 2; x < 14; x++) {
        const top = 3 + (x % 3);
        for (let y = top; y < CELL; y++) {
          const lean = ((x + y) >> 1) % 2;
          set(x + (lean ? 1 : 0), y, 78 + (x % 3) * 14, 148 + (y % 4) * 8, 48, 255);
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [TILE.snow](ctx, rng) {
      noiseFill(ctx, rng, 236, 240, 248, 9, (x, y) =>
        (rng() < 0.05) ? [-18, -16, -10] : [0, 0, 0]);
    }
  };

  function createAtlas() {
    const rows = Math.ceil(TILE_NAMES.length / COLS);
    const canvas = document.createElement('canvas');
    canvas.width = COLS * CELL;
    canvas.height = rows * CELL;
    const ctx = canvas.getContext('2d');

    TILE_NAMES.forEach((name, idx) => {
      const tc = tileCanvas();
      const tctx = tc.getContext('2d');
      const rng = Noise.mulberry32(20240601 + idx * 7919);
      GENERATORS[idx](tctx, rng);
      ctx.drawImage(tc, (idx % COLS) * CELL, Math.floor(idx / COLS) * CELL);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    return {
      canvas, texture, dataURL: canvas.toDataURL(),
      cols: COLS, cell: CELL, rows,
      tiles: TILE
    };
  }

  window.Blocks = {
    BLOCK, FACE, DEFS, TILE, TILE_NAMES,
    info, isSolid, isOccluder, tileFor, iconTile, createAtlas
  };
})();
