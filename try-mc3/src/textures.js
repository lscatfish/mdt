// 程序化纹理：在 canvas 上逐像素画出 16x16 图块，拼成图集，
// 交给 three.js 作为 CanvasTexture（NearestFilter、无 mipmap，保持像素风）。
import * as THREE from '/vendor/three.module.js';
import { mulberry32, hash2i } from './noise.js';

export const TILE_NAMES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'cobblestone', 'sand',
  'log_side', 'log_top', 'leaves', 'planks', 'glass', 'water',
  'brick', 'coal_ore', 'iron_ore', 'bedrock',
];

// 每个图块的代表色（用于破坏粒子）
export const TILE_COLORS = {
  grass_top: 0x79bd4a, grass_side: 0x8a5a32, dirt: 0x8a5a32, stone: 0x8f8f8f,
  cobblestone: 0x9a9a9a, sand: 0xe2d7a4, log_side: 0x6b4a2b, log_top: 0x75522f,
  leaves: 0x3f7a2e, planks: 0xb08850, glass: 0xdfeafa, water: 0x386ee8,
  brick: 0x9c4a3a, coal_ore: 0x2e2e2e, iron_ore: 0xd3a26a, bedrock: 0x3c3c3c,
};

const P = 16;

function fill(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

function speckle(g, rng, colors, count) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[(rng() * colors.length) | 0];
    g.fillRect((rng() * P) | 0, (rng() * P) | 0, 1, 1);
  }
}

const TILE_DRAWS = {
  grass_top(g, rng) {
    fill(g, 0, 0, P, P, '#79bd4a');
    speckle(g, rng, ['#6aa63e', '#8ed05b', '#5d9c36', '#84c955'], 64);
  },
  grass_side(g, rng) {
    fill(g, 0, 0, P, P, '#8a5a32');
    speckle(g, rng, ['#6f4525', '#9c6b3e', '#7d5129', '#a4764a'], 40);
    for (let x = 0; x < P; x++) {
      const h = 3 + ((rng() * 3) | 0);
      fill(g, x, 0, 1, h, '#79bd4a');
      if (rng() < 0.35) fill(g, x, h, 1, 1, '#8ed05b');
    }
  },
  dirt(g, rng) {
    fill(g, 0, 0, P, P, '#8a5a32');
    speckle(g, rng, ['#6f4525', '#9c6b3e', '#7d5129', '#a4764a', '#5f3a1e'], 72);
  },
  stone(g, rng) {
    fill(g, 0, 0, P, P, '#8f8f8f');
    speckle(g, rng, ['#7c7c7c', '#9d9d9d', '#858585', '#a6a6a6'], 60);
    for (let i = 0; i < 6; i++) fill(g, (rng() * P) | 0, (rng() * P) | 0, 2, 1, '#6e6e6e');
  },
  cobblestone(g, rng) {
    fill(g, 0, 0, P, P, '#707070');
    for (let i = 0; i < 8; i++) {
      const sx = (rng() * P) | 0, sy = (rng() * P) | 0;
      const w = 3 + ((rng() * 4) | 0), h = 3 + ((rng() * 3) | 0);
      const shade = ['#9a9a9a', '#8e8e8e', '#a5a5a5'][(rng() * 3) | 0];
      fill(g, Math.min(sx, P - w), Math.min(sy, P - h), w, h, shade);
      fill(g, Math.min(sx, P - w), Math.min(sy, P - h), w, 1, '#5f5f5f');
      fill(g, Math.min(sx, P - w), Math.min(sy, P - h), 1, h, '#5f5f5f');
    }
  },
  sand(g, rng) {
    fill(g, 0, 0, P, P, '#e2d7a4');
    speckle(g, rng, ['#d3c68c', '#efe5ba', '#dccf96', '#cabb80'], 70);
  },
  log_side(g, rng) {
    for (let x = 0; x < P; x++) {
      fill(g, x, 0, 1, P, ['#5a3d22', '#75522f', '#64452a'][(rng() * 3) | 0]);
    }
    for (let x = 0; x < P; x += 4) fill(g, x, 0, 1, P, '#4a3018');
    speckle(g, rng, ['#82603a', '#4a3018'], 26);
  },
  log_top(g, rng) {
    fill(g, 0, 0, P, P, '#5a3d22');
    fill(g, 1, 1, 14, 14, '#8a653c');
    fill(g, 3, 3, 10, 10, '#75522f');
    fill(g, 5, 5, 6, 6, '#8a653c');
    fill(g, 7, 7, 2, 2, '#9a7446');
    speckle(g, rng, ['#5a3d22', '#8a653c'], 20);
  },
  leaves(g, rng) {
    fill(g, 0, 0, P, P, '#3f7a2e');
    speckle(g, rng, ['#2f5f22', '#4e9138', '#356b26', '#57a03e', '#27531c'], 84);
  },
  planks(g, rng) {
    fill(g, 0, 0, P, P, '#b08850');
    fill(g, 0, 0, P, 1, '#8a6638');
    fill(g, 0, 8, P, 1, '#8a6638');
    fill(g, 5, 1, 1, 7, '#8a6638');
    fill(g, 11, 9, 1, 7, '#8a6638');
    speckle(g, rng, ['#a07c46', '#c09a5e', '#966f3e'], 40);
  },
  glass(g, rng) {
    g.clearRect(0, 0, P, P);
    fill(g, 0, 0, P, 1, 'rgba(225,242,255,0.95)');
    fill(g, 0, 15, P, 1, 'rgba(225,242,255,0.95)');
    fill(g, 0, 0, 1, P, 'rgba(225,242,255,0.95)');
    fill(g, 15, 0, 1, P, 'rgba(225,242,255,0.95)');
    fill(g, 2, 3, 1, 4, 'rgba(255,255,255,0.6)');
    fill(g, 5, 10, 1, 3, 'rgba(255,255,255,0.5)');
    fill(g, 11, 5, 2, 1, 'rgba(255,255,255,0.55)');
    fill(g, 8, 13, 3, 1, 'rgba(255,255,255,0.45)');
  },
  water(g, rng) {
    fill(g, 0, 0, P, P, 'rgba(56,110,232,0.85)');
    speckle(g, rng, ['rgba(111,158,240,0.9)', 'rgba(58,98,216,0.9)', 'rgba(90,136,238,0.9)'], 30);
    for (let i = 0; i < 5; i++) fill(g, (rng() * P) | 0, (rng() * P) | 0, 2, 1, 'rgba(150,186,248,0.75)');
  },
  brick(g, rng) {
    fill(g, 0, 0, P, P, '#b5aca2');
    const shades = ['#9c4a3a', '#a45240', '#944434'];
    for (let r = 0; r < 4; r++) {
      const off = r % 2 === 1 ? 2 : 0;
      for (let c = 0; c < 4; c++) {
        const bx = ((c * 4 + off) % P);
        const shade = shades[(rng() * 3) | 0];
        fill(g, bx, r * 4, 3, 3, shade);
        fill(g, bx, r * 4, 3, 1, 'rgba(255,255,255,0.12)');
      }
    }
  },
  coal_ore(g, rng) {
    fill(g, 0, 0, P, P, '#8f8f8f');
    speckle(g, rng, ['#7c7c7c', '#9d9d9d'], 30);
    for (let i = 0; i < 5; i++) {
      const x = 1 + ((rng() * 13) | 0), y = 1 + ((rng() * 13) | 0);
      fill(g, x, y, 2, 1, '#2e2e2e');
      fill(g, x + 1, y + 1, 1, 1, '#1f1f1f');
    }
  },
  iron_ore(g, rng) {
    fill(g, 0, 0, P, P, '#8f8f8f');
    speckle(g, rng, ['#7c7c7c', '#9d9d9d'], 30);
    for (let i = 0; i < 5; i++) {
      const x = 1 + ((rng() * 13) | 0), y = 1 + ((rng() * 13) | 0);
      fill(g, x, y, 2, 2, '#d3a26a');
      fill(g, x, y, 2, 1, '#e8c08c');
      fill(g, x + 1, y + 1, 1, 1, '#b98a52');
    }
  },
  bedrock(g, rng) {
    fill(g, 0, 0, P, P, '#3c3c3c');
    for (let i = 0; i < 10; i++) {
      const x = (rng() * P) | 0, y = (rng() * P) | 0;
      const w = 2 + ((rng() * 3) | 0), h = 1 + ((rng() * 2) | 0);
      fill(g, Math.min(x, P - w), Math.min(y, P - h), w, h, ['#232323', '#505050', '#2c2c2c', '#454545'][(rng() * 4) | 0]);
    }
  },
};

function makeTile(name) {
  const seed = hash2i(name.length, 20240717, 12345 + [...name].reduce((s, c) => s + c.charCodeAt(0), 0));
  const rng = mulberry32(seed);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = P;
  const g = canvas.getContext('2d');
  TILE_DRAWS[name](g, rng);
  return canvas;
}

export const TILES = {};
const COLS = TILE_NAMES.length;
export const ATLAS_COLS = COLS;

export const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = COLS * P;
atlasCanvas.height = P;
const ag = atlasCanvas.getContext('2d');
ag.imageSmoothingEnabled = false;
TILE_NAMES.forEach((name, i) => {
  ag.drawImage(makeTile(name), i * P, 0);
  TILES[name] = i;
});

export const ATLAS_TEXTURE = new THREE.CanvasTexture(atlasCanvas);
ATLAS_TEXTURE.magFilter = THREE.NearestFilter;
ATLAS_TEXTURE.minFilter = THREE.NearestFilter;
ATLAS_TEXTURE.generateMipmaps = false;
ATLAS_TEXTURE.colorSpace = THREE.SRGBColorSpace;

// 返回纹理名在 0..1 UV 空间中的水平区间
export function tileUV(name) {
  const i = TILES[name];
  return [i / COLS, (i + 1) / COLS];
}
