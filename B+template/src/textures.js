// 程序化生成 16×16 像素方块纹理图集，无需外部素材
import { BLOCK_COLORS } from './constants.js';

export const TILE_SIZE = 16;
export const ATLAS_COLS = 8;

const TILES = [
  'grassTop', 'grassSide', 'dirt', 'stone', 'sand',
  'logSide', 'logTop', 'leaves', 'planks', 'coalOre',
  'ironOre', 'bedrock', 'water', 'glass', 'cobble',
];

function makePixelLayer() {
  const data = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
  return { data };
}

function setPx(layer, x, y, r, g, b, a = 255) {
  const i = (y * TILE_SIZE + x) * 4;
  layer.data[i] = r;
  layer.data[i + 1] = g;
  layer.data[i + 2] = b;
  layer.data[i + 3] = a;
}

function jitter(c, amount) {
  const v = (Math.random() * 2 - 1) * amount;
  return Math.max(0, Math.min(255, c + v));
}

function fill(layer, rgb, jit = 0) {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      setPx(layer, x, y, jitter(rgb[0], jit), jitter(rgb[1], jit), jitter(rgb[2], jit));
    }
  }
}

function speckle(layer, rgb, count, jit = 30) {
  for (let i = 0; i < count; i++) {
    const x = (Math.random() * TILE_SIZE) | 0;
    const y = (Math.random() * TILE_SIZE) | 0;
    setPx(layer, x, y, jitter(rgb[0], jit), jitter(rgb[1], jit), jitter(rgb[2], jit));
  }
}

function blob(layer, cx, cy, r, rgb) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= TILE_SIZE || y >= TILE_SIZE) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r + 0.4) setPx(layer, x, y, rgb[0], rgb[1], rgb[2]);
    }
  }
}

function drawGrassTop(l) {
  fill(l, [112, 174, 66], 14);
  for (let i = 0; i < 26; i++) {
    const x = (Math.random() * TILE_SIZE) | 0;
    const y = (Math.random() * TILE_SIZE) | 0;
    const shade = Math.random();
    if (shade < 0.4) setPx(l, x, y, 84, 140, 50);
    else if (shade < 0.75) setPx(l, x, y, 132, 196, 80);
    else setPx(l, x, y, 150, 210, 92);
  }
}

function drawGrassSide(l) {
  fill(l, [132, 94, 62], 16);
  speckle(l, [112, 78, 52], 18);
  speckle(l, [150, 108, 72], 12);
  for (let y = 0; y < 4; y++) {
    const depth = Math.random() < 0.3 ? 1 : 0;
    for (let x = 0; x < TILE_SIZE; x++) {
      if (y + depth >= 4) continue;
      setPx(l, x, y, jitter(96 + (4 - y) * 14, 16), jitter(158 + (4 - y) * 14, 16), jitter(58, 14));
    }
  }
}

function drawDirt(l) {
  fill(l, [134, 96, 66], 10);
  speckle(l, [110, 76, 50], 22, 24);
  speckle(l, [156, 114, 80], 18, 24);
  speckle(l, [92, 64, 44], 8, 18);
}

function drawStone(l) {
  fill(l, [127, 127, 130], 8);
  speckle(l, [108, 108, 112], 24, 22);
  speckle(l, [146, 146, 150], 20, 22);
  speckle(l, [96, 96, 100], 12, 16);
}

function drawCobble(l) {
  drawStone(l);
  // 鹅卵石圆形轮廓
  const circles = [[3, 4, 2], [10, 3, 2], [5, 10, 2], [12, 11, 2], [8, 7, 2]];
  for (const [cx, cy, r] of circles) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= TILE_SIZE || y >= TILE_SIZE) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d > r - 0.6 && d <= r + 0.6) setPx(l, x, y, 86, 86, 90);
      }
    }
  }
}

function drawSand(l) {
  fill(l, [220, 205, 158], 8);
  speckle(l, [200, 184, 134], 20, 20);
  speckle(l, [236, 224, 180], 16, 20);
  speckle(l, [184, 168, 122], 10, 16);
}

function drawLogSide(l) {
  fill(l, [104, 79, 50], 8);
  for (const x of [1, 4, 7, 10, 13]) {
    const w = Math.random() < 0.35 ? 2 : 1;
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let dx = 0; dx < w; dx++) {
        setPx(l, x + dx, y, 76, 56, 34);
      }
    }
  }
  speckle(l, [126, 98, 64], 10, 18);
}

function drawLogTop(l) {
  fill(l, [172, 142, 86], 8);
  const cx = 8, cy = 8;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const d = Math.hypot(x - cx + 0.5, y - cy + 0.5);
      const ring = Math.floor(d);
      if (ring % 2 === 0) setPx(l, x, y, 146, 116, 66);
      if (d > 7) setPx(l, x, y, 104, 79, 50);
    }
  }
}

function drawLeaves(l) {
  fill(l, [56, 120, 40], 18);
  speckle(l, [40, 92, 30], 30, 30);
  speckle(l, [78, 150, 54], 24, 26);
  speckle(l, [30, 74, 24], 12, 18);
  // 少量“空隙”深色像素
  speckle(l, [24, 60, 20], 8, 10);
}

function drawPlanks(l) {
  fill(l, [178, 136, 82], 8);
  for (let y = 0; y < TILE_SIZE; y += 4) {
    for (let x = 0; x < TILE_SIZE; x++) setPx(l, x, y, 120, 88, 50);
  }
  for (const x of [4, 12]) {
    for (let y = 0; y < TILE_SIZE; y += 4) {
      setPx(l, x, y, 128, 94, 54);
      setPx(l, x, y + 1, 128, 94, 54);
    }
  }
  speckle(l, [150, 112, 64], 10, 14);
}

function drawCoalOre(l) {
  drawStone(l);
  blob(l, 4, 5, 2, [38, 38, 40]);
  blob(l, 9, 4, 2, [50, 50, 52]);
  blob(l, 11, 11, 2, [42, 42, 44]);
  blob(l, 3, 11, 2, [30, 30, 33]);
}

function drawIronOre(l) {
  drawStone(l);
  blob(l, 5, 5, 2, [206, 156, 122]);
  blob(l, 10, 10, 2, [188, 138, 106]);
  blob(l, 10, 4, 2, [218, 172, 136]);
}

function drawBedrock(l) {
  fill(l, [74, 74, 78], 14);
  for (let i = 0; i < 7; i++) {
    blob(l, (Math.random() * 16) | 0, (Math.random() * 16) | 0, 1 + (Math.random() * 2 | 0),
      [46 + Math.random() * 20 | 0, 46 + Math.random() * 20 | 0, 50 + Math.random() * 20 | 0]);
  }
}

function drawWater(l) {
  fill(l, [52, 98, 196], 10);
  for (let y = 0; y < TILE_SIZE; y++) {
    const wave = Math.sin(y * 0.9) > 0;
    for (let x = 0; x < TILE_SIZE; x++) {
      if ((x + y) % 5 === 0) setPx(l, x, y, wave ? 86 : 38, wave ? 132 : 82, wave ? 222 : 180);
    }
  }
}

function drawGlass(l) {
  // 透明底 + 白色边框与高光
  for (let i = 3; i < (TILE_SIZE * TILE_SIZE) * 4; i += 4) l.data[i] = 0;
  for (let x = 0; x < TILE_SIZE; x++) {
    setPx(l, x, 0, 235, 244, 250, 235);
    setPx(l, x, TILE_SIZE - 1, 235, 244, 250, 235);
    setPx(l, 0, x, 235, 244, 250, 235);
    setPx(l, TILE_SIZE - 1, x, 235, 244, 250, 235);
  }
  for (let i = 1; i < 7; i++) setPx(l, 3 + i, 3 + i, 255, 255, 255, 70);
  for (let i = 0; i < 4; i++) setPx(l, 4 + i, 12 - i, 255, 255, 255, 50);
}

const DRAWERS = {
  grassTop: drawGrassTop,
  grassSide: drawGrassSide,
  dirt: drawDirt,
  stone: drawStone,
  sand: drawSand,
  logSide: drawLogSide,
  logTop: drawLogTop,
  leaves: drawLeaves,
  planks: drawPlanks,
  coalOre: drawCoalOre,
  ironOre: drawIronOre,
  bedrock: drawBedrock,
  water: drawWater,
  glass: drawGlass,
  cobble: drawCobble,
};

function renderTile(name) {
  const layer = makePixelLayer();
  DRAWERS[name](layer);
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(layer.data, TILE_SIZE, TILE_SIZE), 0, 0);
  return canvas;
}

export function buildAtlasTexture(THREE) {
  const atlas = document.createElement('canvas');
  atlas.width = TILE_SIZE * ATLAS_COLS;
  atlas.height = TILE_SIZE * Math.ceil(TILES.length / ATLAS_COLS);
  const ctx = atlas.getContext('2d');
  TILES.forEach((name, i) => {
    const cx = (i % ATLAS_COLS) * TILE_SIZE;
    const cy = Math.floor(i / ATLAS_COLS) * TILE_SIZE;
    ctx.drawImage(renderTile(name), cx, cy);
  });

  const texture = new THREE.CanvasTexture(atlas);
  texture.flipY = false; // 画布 y 轴向下，按行号直接对应 UV
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, cols: ATLAS_COLS, rows: Math.ceil(TILES.length / ATLAS_COLS) };
}

// 生成快捷栏 2D 等距方块图标
export function drawBlockIcon(id, size = 48) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = BLOCK_COLORS[id];
  if (!c) return canvas;

  const s = size;
  const top = [[s * 0.5, s * 0.16], [s * 0.95, s * 0.42], [s * 0.5, s * 0.68], [s * 0.05, s * 0.42]];
  const left = [top[3], top[2], [s * 0.5, s * 0.95], [s * 0.05, s * 0.7]];
  const right = [top[2], top[1], [s * 0.95, s * 0.7], [s * 0.5, s * 0.95]];

  function poly(pts, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  poly(top, c.top);
  poly(left, c.bottom);
  poly(right, c.side);

  // 矿石 / 特殊纹理点缀
  if (id === 8 || id === 9) {
    ctx.fillStyle = id === 8 ? 'rgba(0,0,0,.75)' : 'rgba(226,176,132,.9)';
    for (const [x, y, r] of [[0.3, 0.5, 0.04], [0.62, 0.62, 0.05], [0.72, 0.42, 0.04]]) {
      ctx.beginPath();
      ctx.arc(s * x, s * y, s * r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (id === 5) {
    ctx.strokeStyle = 'rgba(60,42,22,.6)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(s * (0.16 + i * 0.1), s * 0.46);
      ctx.lineTo(s * (0.16 + i * 0.1), s * 0.88);
      ctx.stroke();
    }
  } else if (id === 12) {
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(s * 0.14, s * 0.3, s * 0.72, s * 0.52);
    ctx.beginPath();
    ctx.moveTo(s * 0.22, s * 0.72);
    ctx.lineTo(s * 0.78, s * 0.34);
    ctx.stroke();
  }

  return canvas;
}
