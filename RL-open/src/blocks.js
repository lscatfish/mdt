// 方块定义与程序化像素纹理图集。
// 所有纹理在运行时用 Canvas 按“像素画”方式生成，无需任何外部图片资源。
import * as THREE from 'three';

export const AIR = 0;

export const TILE = {};
let nextTile = 0;

/** 创建一张 16x16 的像素纹理块 */
function paint(painter) {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  painter(ctx);
  return canvas;
}

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

// ---------- 各纹理的像素画绘制 ----------

function tileGrassTop() {
  const rand = rng(42);
  const colors = ['#5da549', '#6db355', '#4f9440', '#79bf5f', '#579b3e'];
  return paint((ctx) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        px(ctx, x, y, colors[Math.floor(rand() * colors.length)]);
      }
    }
  });
}

function tileDirt() {
  const rand = rng(7);
  const colors = ['#8a5a34', '#7d4f2c', '#96653d', '#6f4526', '#a06f45'];
  return paint((ctx) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        px(ctx, x, y, colors[Math.floor(rand() * colors.length)]);
      }
    }
  });
}

function tileGrassSide() {
  const rand = rng(99);
  const dirt = ['#8a5a34', '#7d4f2c', '#96653d', '#6f4526'];
  const green = ['#5da549', '#6db355', '#4f9440', '#579b3e'];
  return paint((ctx) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        px(ctx, x, y, dirt[Math.floor(rand() * dirt.length)]);
      }
    }
    // 顶部 3~4 像素的草皮，带不规则边缘
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 16; x++) {
        const depth = y + Math.floor(rand() * 2);
        if (depth < 5) px(ctx, x, y, green[Math.floor(rand() * green.length)]);
      }
    }
  });
}

function tileStone() {
  const rand = rng(1234);
  const colors = ['#8d8d8d', '#7f7f7f', '#9a9a9a', '#757575', '#848484'];
  return paint((ctx) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        px(ctx, x, y, colors[Math.floor(rand() * colors.length)]);
      }
    }
    // 少量深色裂纹点
    for (let i = 0; i < 26; i++) {
      px(ctx, Math.floor(rand() * 16), Math.floor(rand() * 16), '#5d5d5d');
    }
  });
}

function tileCobble() {
  const rand = rng(555);
  return paint((ctx) => {
    // 深色砂浆底
    ctx.fillStyle = '#4c4c4c';
    ctx.fillRect(0, 0, 16, 16);
    // 2x2 块 8px 的圆石
    for (let cy = 0; cy < 2; cy++) {
      for (let cx = 0; cx < 2; cx++) {
        const ox = cx * 8;
        const oy = cy * 8;
        for (let y = 0; y < 7; y++) {
          for (let x = 0; x < 7; x++) {
            const edge = x === 0 || y === 0 || x === 6 || y === 6;
            const col = edge
              ? ['#5f5f5f', '#555555'][Math.floor(rand() * 2)]
              : ['#8d8d8d', '#7f7f7f', '#9a9a9a', '#757575'][Math.floor(rand() * 4)];
            px(ctx, ox + x + 1, oy + y + 1, col);
          }
        }
      }
    }
  });
}

function tileSand() {
  const rand = rng(888);
  const colors = ['#dbd09a', '#d4c78e', '#e3d9a8', '#c9bb82', '#e8dfb4'];
  return paint((ctx) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        px(ctx, x, y, colors[Math.floor(rand() * colors.length)]);
      }
    }
  });
}

function tileLogSide() {
  const rand = rng(202);
  const colors = ['#6b4a26', '#7a5630', '#5d3f20', '#6f4d28'];
  return paint((ctx) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const col = colors[Math.floor(rand() * 4)];
        const stripe = (x % 4 === 0) ? '#4e3318' : col;
        px(ctx, x, y, stripe);
      }
    }
  });
}

function tileLogTop() {
  const rand = rng(303);
  return paint((ctx) => {
    ctx.fillStyle = '#5d3f20';
    ctx.fillRect(0, 0, 16, 16);
    const ring = (r, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(8 - r, 8 - r, r * 2 + 1, r * 2 + 1);
    };
    ring(6, '#7a5630');
    ring(5, '#8a6238');
    ring(4, '#7a5630');
    ring(3, '#8a6238');
    ring(2, '#7a5630');
    ring(1, '#8a6238');
    for (let i = 0; i < 8; i++) {
      px(ctx, 7 + Math.floor(rand() * 3), 7 + Math.floor(rand() * 3), '#5d3f20');
    }
  });
}

function tileLeaves() {
  const rand = rng(77);
  const colors = ['#3e7a22', '#4d8f2b', '#356b1d', '#58a136', '#2f6119'];
  return paint((ctx) => {
    ctx.clearRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (rand() < 0.82) {
          px(ctx, x, y, colors[Math.floor(rand() * colors.length)]);
        }
      }
    }
  });
}

function tilePlanks() {
  const rand = rng(444);
  return paint((ctx) => {
    for (let y = 0; y < 16; y++) {
      const seam = y % 4 === 0;
      for (let x = 0; x < 16; x++) {
        const base = ['#b58a4e', '#ad8147', '#c19356', '#a87d43'][Math.floor(rand() * 4)];
        px(ctx, x, y, seam ? '#8a6435' : base);
      }
    }
    for (let y = 1; y < 16; y += 4) {
      for (let i = 0; i < 6; i++) {
        const x = Math.floor(rand() * 16);
        px(ctx, x, y + Math.floor(rand() * 2), '#8a6435');
      }
    }
  });
}

function tileGlass() {
  return paint((ctx) => {
    ctx.clearRect(0, 0, 16, 16);
    ctx.strokeStyle = 'rgba(235,240,255,0.95)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, 15, 15);
    ctx.fillStyle = 'rgba(220,235,255,0.35)';
    for (const [x0, y0, x1, y1] of [[1, 4, 4, 2], [6, 12, 4, 3], [11, 2, 4, 2]]) {
      for (let i = 0; i < 5; i++) {
        const x = x0 + i;
        const y = y0 - i;
        if (x >= 0 && x < 16 && y >= 0 && y < 16 && y >= y0 - 4) px(ctx, x, y, 'rgba(230,240,255,0.45)');
      }
      ctx.fillRect(x0, y0, x1, 1);
    }
  });
}

function tileWater() {
  const rand = rng(1313);
  return paint((ctx) => {
    ctx.fillStyle = 'rgba(38,92,205,0.82)';
    ctx.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (rand() < 0.16) px(ctx, x, y, 'rgba(80,140,235,0.85)');
        else if (rand() < 0.06) px(ctx, x, y, 'rgba(20,60,160,0.9)');
      }
    }
  });
}

function tileBedrock() {
  const rand = rng(313);
  const colors = ['#3a3a3a', '#2e2e2e', '#454545', '#262626'];
  return paint((ctx) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        px(ctx, x, y, colors[Math.floor(rand() * colors.length)]);
      }
    }
  });
}

function register(name, painter) {
  const id = nextTile++;
  TILE[name] = id;
  return id;
}

const T_GRASS_TOP = register('grass_top', tileGrassTop);
const T_DIRT = register('dirt', tileDirt);
const T_GRASS_SIDE = register('grass_side', tileGrassSide);
const T_STONE = register('stone', tileStone);
const T_COBBLE = register('cobble', tileCobble);
const T_SAND = register('sand', tileSand);
const T_LOG_SIDE = register('log_side', tileLogSide);
const T_LOG_TOP = register('log_top', tileLogTop);
const T_LEAVES = register('leaves', tileLeaves);
const T_PLANKS = register('planks', tilePlanks);
const T_GLASS = register('glass', tileGlass);
const T_WATER = register('water', tileWater);
const T_BEDROCK = register('bedrock', tileBedrock);

// ---------- 方块定义 ----------
// culls: 是否遮挡相邻方块的接触面
// solid: 是否参与碰撞
// render: opaque | cutout | water | glass
export const BLOCKS = [
  null,
  {
    id: 1, name: '草方块', culls: true, solid: true, render: 'opaque',
    tex: { px: T_GRASS_SIDE, nx: T_GRASS_SIDE, py: T_GRASS_TOP, ny: T_DIRT, pz: T_GRASS_SIDE, nz: T_GRASS_SIDE }
  },
  {
    id: 2, name: '泥土', culls: true, solid: true, render: 'opaque',
    tex: { px: T_DIRT, nx: T_DIRT, py: T_DIRT, ny: T_DIRT, pz: T_DIRT, nz: T_DIRT }
  },
  {
    id: 3, name: '石头', culls: true, solid: true, render: 'opaque',
    tex: { px: T_STONE, nx: T_STONE, py: T_STONE, ny: T_STONE, pz: T_STONE, nz: T_STONE }
  },
  {
    id: 4, name: '圆石', culls: true, solid: true, render: 'opaque',
    tex: { px: T_COBBLE, nx: T_COBBLE, py: T_COBBLE, ny: T_COBBLE, pz: T_COBBLE, nz: T_COBBLE }
  },
  {
    id: 5, name: '沙子', culls: true, solid: true, render: 'opaque',
    tex: { px: T_SAND, nx: T_SAND, py: T_SAND, ny: T_SAND, pz: T_SAND, nz: T_SAND }
  },
  {
    id: 6, name: '原木', culls: true, solid: true, render: 'opaque',
    tex: { px: T_LOG_SIDE, nx: T_LOG_SIDE, py: T_LOG_TOP, ny: T_LOG_TOP, pz: T_LOG_SIDE, nz: T_LOG_SIDE }
  },
  {
    id: 7, name: '树叶', culls: true, solid: true, render: 'cutout',
    tex: { px: T_LEAVES, nx: T_LEAVES, py: T_LEAVES, ny: T_LEAVES, pz: T_LEAVES, nz: T_LEAVES }
  },
  {
    id: 8, name: '木板', culls: true, solid: true, render: 'opaque',
    tex: { px: T_PLANKS, nx: T_PLANKS, py: T_PLANKS, ny: T_PLANKS, pz: T_PLANKS, nz: T_PLANKS }
  },
  {
    id: 9, name: '玻璃', culls: false, solid: true, render: 'glass',
    tex: { px: T_GLASS, nx: T_GLASS, py: T_GLASS, ny: T_GLASS, pz: T_GLASS, nz: T_GLASS }
  },
  {
    id: 10, name: '水', culls: false, solid: false, render: 'water',
    tex: { px: T_WATER, nx: T_WATER, py: T_WATER, ny: T_WATER, pz: T_WATER, nz: T_WATER }
  },
  {
    id: 11, name: '基岩', culls: true, solid: true, unbreakable: true, render: 'opaque',
    tex: { px: T_BEDROCK, nx: T_BEDROCK, py: T_BEDROCK, ny: T_BEDROCK, pz: T_BEDROCK, nz: T_BEDROCK }
  }
];

/** 快捷栏中的方块 id 顺序 */
export const HOTBAR_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** 世界生成用到的方块 id */
export const B = {
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 5,
  LOG: 6,
  LEAVES: 7,
  GLASS: 9,
  WATER: 10,
  BEDROCK: 11
};

// ---------- 图集 ----------

const TILE_PX = 16;
const GRID = 16;
const TILE_STEP = 1 / GRID;
const UV_INSET = 0.02;

/** 生成图集并返回 { canvas, texture } */
export function createAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = GRID * TILE_PX;
  canvas.height = GRID * TILE_PX;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const painters = [];
  // 反向查找：tile id -> 绘制函数（与注册顺序一致）
  for (const [name, id] of Object.entries(TILE)) {
    const fn = {
      grass_top: tileGrassTop, dirt: tileDirt, grass_side: tileGrassSide,
      stone: tileStone, cobble: tileCobble, sand: tileSand, log_side: tileLogSide,
      log_top: tileLogTop, leaves: tileLeaves, planks: tilePlanks,
      glass: tileGlass, water: tileWater, bedrock: tileBedrock
    }[name];
    painters[id] = fn;
  }

  painters.forEach((fn, id) => {
    if (!fn) return;
    const col = id % GRID;
    const row = Math.floor(id / GRID);
    ctx.drawImage(fn(), col * TILE_PX, row * TILE_PX);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  return { canvas, texture };
}

/** 将某 tile 的 (u,v) 局部坐标换算为图集 UV。
 *  CanvasTexture 默认 flipY，v=1 对应画布顶部，因此行号需要反排。 */
export function tileUV(tileId, u, v) {
  const col = tileId % GRID;
  const row = Math.floor(tileId / GRID);
  const u0 = col * TILE_STEP + UV_INSET;
  const v0 = 1 - (row + 1) * TILE_STEP + UV_INSET;
  const span = TILE_STEP - UV_INSET * 2;
  return [u0 + u * span, v0 + v * span];
}
