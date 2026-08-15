// 程序化生成方块纹理图集（画布绘制，无需外部图片资源）
import * as THREE from '../vendor/three.module.js';
import { TILE } from './config.js';

export const ATLAS_TILES = 16;
export const ATLAS_SIZE = 256;
const TILE_PX = ATLAS_SIZE / ATLAS_TILES; // 16

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setPx(img, x, y, r, g, b, a = 255) {
  const i = (y * img.width + x) * 4;
  img.data[i] = r;
  img.data[i + 1] = g;
  img.data[i + 2] = b;
  img.data[i + 3] = a;
}

function fillTile(img, tile, r, g, b) {
  const tx = (tile % ATLAS_TILES) * TILE_PX;
  const ty = Math.floor(tile / ATLAS_TILES) * TILE_PX;
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      setPx(img, tx + x, ty + y, r, g, b);
    }
  }
}

function drawTile(img, tile, fn) {
  const tx = (tile % ATLAS_TILES) * TILE_PX;
  const ty = Math.floor(tile / ATLAS_TILES) * TILE_PX;
  const rng = mulberry32(1234 + tile * 7919);
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      fn(x, y, rng, (r, g, b, a) => setPx(img, tx + x, ty + y, r, g, b, a));
    }
  }
}

function speckleBase(x, y, rng, base, variance, set) {
  const n = (rng() - 0.5) * variance;
  set(
    Math.max(0, Math.min(255, base[0] + n)),
    Math.max(0, Math.min(255, base[1] + n)),
    Math.max(0, Math.min(255, base[2] + n))
  );
}

function tileGrassTop(x, y, rng, set) {
  const g = 105 + rng() * 50;
  set(74 + rng() * 18, g, 52 + rng() * 16);
}

function tileDirt(x, y, rng, set) {
  speckleBase(x, y, rng, [134, 96, 64], 40, set);
}

function tileGrassSide(x, y, rng, set) {
  if (y < 4 || (y < 6 && rng() > 0.35)) {
    const g = 100 + rng() * 42;
    set(70 + rng() * 16, g, 48 + rng() * 14);
  } else {
    speckleBase(x, y, rng, [134, 96, 64], 40, set);
  }
}

function tileStone(x, y, rng, set) {
  const n = (rng() - 0.5) * 26;
  const r = 128 + n;
  set(r, r, r + 2);
  if ((x * 7 + y * 13) % 23 === 0) set(r - 18, r - 18, r - 14);
}

function tileSand(x, y, rng, set) {
  speckleBase(x, y, rng, [214, 200, 142], 32, set);
}

function tileLogSide(x, y, rng, set) {
  const stripe = Math.floor(x / 3) % 3;
  const shade = stripe === 0 ? -18 : stripe === 1 ? 10 : -28;
  set(126 + shade + (rng() - 0.5) * 20, 92 + shade + (rng() - 0.5) * 20, 54 + shade + (rng() - 0.5) * 14);
}

function tileLogTop(x, y, rng, set) {
  const dx = x - 7.5;
  const dy = y - 7.5;
  const d = Math.sqrt(dx * dx + dy * dy);
  const ring = Math.floor(d) % 3;
  const shade = ring === 0 ? 52 : ring === 1 ? 22 : 0;
  set(148 + shade, 112 + shade, 66 + shade);
}

function tileLeaves(x, y, rng, set) {
  // 留出透明孔洞，配合 alphaTest 呈现树叶镂空效果
  if ((x * 13 + y * 7) % 11 === 0) return; // alpha = 0
  const g = 55 + rng() * 70;
  set(26 + rng() * 20, g, 24 + rng() * 22);
}

function tileBedrock(x, y, rng, set) {
  const n = (rng() - 0.5) * 50;
  const c = 60 + n;
  set(c, c, c + 4);
  if ((x + y) % 9 === 0) set(c + 28, c + 28, c + 34);
}

function tilePlanks(x, y, rng, set) {
  const row = Math.floor(y / 4);
  const shade = row % 2 === 0 ? 6 : -12;
  const base = 174 + shade + (rng() - 0.5) * 16;
  set(base, 136 + shade + (rng() - 0.5) * 16, 74 + shade + (rng() - 0.5) * 12);
  if (y % 4 === 0) set(110, 82, 44);
}

function tileGlass(x, y, rng, set) {
  const border = x === 0 || y === 0 || x === 15 || y === 15;
  if (border) {
    set(190, 226, 235, 235);
    return;
  }
  if ((x + y) % 9 === 0) set(205, 235, 240, 70);
}

function tileWater(x, y, rng, set) {
  const wave = Math.sin(x * 0.9 + y * 0.4) > 0 ? 8 : -8;
  set(40 + wave + rng() * 8, 86 + wave + rng() * 8, 190 + wave + rng() * 12);
}

function tileCobble(x, y, rng, set) {
  const n = (rng() - 0.5) * 34;
  set(118 + n, 118 + n, 122 + n);
  const gx = x % 6 === 0;
  const gy = y % 6 === 0;
  if (gx || gy) set(78, 78, 82);
}

function tileGravel(x, y, rng, set) {
  const c = rng();
  if (c < 0.2) set(90, 80, 76);
  else if (c < 0.4) set(160, 148, 140);
  else set(124, 114, 108);
}

function tileBrick(x, y, rng, set) {
  const row = Math.floor(y / 4);
  const offset = row % 2 === 0 ? 0 : 4;
  const bx = (x + offset) % 8;
  const mortar = y % 4 === 0 || bx === 0 || bx === 7;
  if (mortar) {
    set(172, 164, 158);
    return;
  }
  set(156 + (rng() - 0.5) * 26, 76 + (rng() - 0.5) * 20, 62 + (rng() - 0.5) * 18);
}

function tileCoalOre(x, y, rng, set) {
  tileStone(x, y, rng, set);
  const blob = ((x - 6) ** 2 + (y - 7) ** 2) < 20 + rng() * 6;
  if (blob) set(30 + rng() * 20, 30 + rng() * 20, 32 + rng() * 18);
}

function tileIronOre(x, y, rng, set) {
  tileStone(x, y, rng, set);
  const blob = ((x - 8) ** 2 + (y - 6) ** 2) < 18 + rng() * 7;
  if (blob) set(190 + rng() * 24, 150 + rng() * 22, 112 + rng() * 16);
}

const TILE_FUNCS = {
  [TILE.GRASS_TOP]: tileGrassTop,
  [TILE.DIRT]: tileDirt,
  [TILE.GRASS_SIDE]: tileGrassSide,
  [TILE.STONE]: tileStone,
  [TILE.SAND]: tileSand,
  [TILE.LOG_SIDE]: tileLogSide,
  [TILE.LOG_TOP]: tileLogTop,
  [TILE.LEAVES]: tileLeaves,
  [TILE.BEDROCK]: tileBedrock,
  [TILE.PLANKS]: tilePlanks,
  [TILE.GLASS]: tileGlass,
  [TILE.WATER]: tileWater,
  [TILE.COBBLE]: tileCobble,
  [TILE.GRAVEL]: tileGravel,
  [TILE.BRICK]: tileBrick,
  [TILE.COAL_ORE]: tileCoalOre,
  [TILE.IRON_ORE]: tileIronOre
};

export function createBlockAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(ATLAS_SIZE, ATLAS_SIZE);

  for (const [tile, fn] of Object.entries(TILE_FUNCS)) {
    drawTile(img, Number(tile), fn);
  }
  ctx.putImageData(img, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false; // UV 按画布左上角坐标计算
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
