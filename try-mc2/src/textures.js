import * as THREE from "../vendor/three.module.js";
import { TILE } from "./blocks.js";

const TILE_PX = 16;
const GRID = 16;
const SIZE = TILE_PX * GRID; // 256

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

function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r * factor)));
  g = Math.max(0, Math.min(255, Math.round(g * factor)));
  b = Math.max(0, Math.min(255, Math.round(b * factor)));
  return `rgb(${r},${g},${b})`;
}

function pixel(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

// 在指定 tile 位置铺一层带随机明暗的底色
function noisyFill(ctx, ox, oy, base, rand, variation = 0.09, darkSeedChance = 0) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const f = 1 - variation + rand() * variation * 2;
      if (darkSeedChance && rand() < darkSeedChance) {
        pixel(ctx, ox + x, oy + y, shade(base, f * 0.75));
      } else {
        pixel(ctx, ox + x, oy + y, shade(base, f));
      }
    }
  }
}

function drawGrassTop(ctx, ox, oy, rand) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = 0.9 + rand() * 0.2;
      pixel(ctx, ox + x, oy + y, shade("#67b83f", v));
    }
  }
}

function drawGrassSide(ctx, ox, oy, rand) {
  noisyFill(ctx, ox, oy, "#8a5a33", rand, 0.1);
  for (let x = 0; x < 16; x++) {
    const depth = 2 + Math.floor(rand() * 3);
    for (let y = 0; y < depth; y++) {
      pixel(ctx, ox + x, oy + y, shade("#67b83f", 0.9 + rand() * 0.2));
    }
  }
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rand() * 16);
    pixel(ctx, ox + x, oy + 2 + Math.floor(rand() * 2), shade("#67b83f", 0.85 + rand() * 0.2));
  }
}

function drawStone(ctx, ox, oy, rand) {
  noisyFill(ctx, ox, oy, "#8b8b8b", rand, 0.08);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rand() * 12);
    const y = Math.floor(rand() * 12);
    const w = 2 + Math.floor(rand() * 3);
    const h = 2 + Math.floor(rand() * 3);
    ctx.fillStyle = shade("#6f6f6f", 0.85 + rand() * 0.3);
    ctx.fillRect(ox + x, oy + y, w, h);
    ctx.fillStyle = shade("#a3a3a3", 0.85 + rand() * 0.3);
    ctx.fillRect(ox + x, oy + y, w, 1);
  }
}

function drawCobble(ctx, ox, oy, rand) {
  noisyFill(ctx, ox, oy, "#7d7d7d", rand, 0.07);
  const centers = [[3, 4], [10, 3], [5, 11], [13, 9], [11, 14]];
  for (const [cx, cy] of centers) {
    const rx = 2.2 + rand() * 1.2;
    const ry = 1.8 + rand() * 1.0;
    ctx.fillStyle = shade("#5f5f5f", 0.9 + rand() * 0.2);
    for (let y = -3; y <= 3; y++) {
      for (let x = -4; x <= 4; x++) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) {
          pixel(ctx, ox + cx + x, oy + cy + y, ctx.fillStyle);
        }
      }
    }
    ctx.fillStyle = shade("#9b9b9b", 0.9 + rand() * 0.2);
    for (let y = -2; y <= 1; y++) {
      for (let x = -3; x <= 2; x++) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 0.75) {
          pixel(ctx, ox + cx + x, oy + cy + y, ctx.fillStyle);
        }
      }
    }
  }
}

function drawPlanks(ctx, ox, oy, rand) {
  const board = "#b18445";
  for (let band = 0; band < 4; band++) {
    const by = band * 4;
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 16; x++) {
        const f = 0.88 + rand() * 0.2;
        pixel(ctx, ox + x, oy + by + y, shade(board, f));
      }
    }
    const seamX = 3 + Math.floor(rand() * 10);
    ctx.fillStyle = shade("#5d3f22", 0.95);
    ctx.fillRect(ox, oy + by + 3, 16, 1);
    ctx.fillRect(ox + seamX, oy + by, 1, 3);
  }
}

function drawLogSide(ctx, ox, oy, rand) {
  const tones = ["#6b4a26", "#5d3f22", "#755331", "#644728"];
  for (let x = 0; x < 16; x++) {
    const tone = tones[Math.floor(rand() * tones.length)];
    for (let y = 0; y < 16; y++) {
      const f = 0.85 + rand() * 0.25;
      pixel(ctx, ox + x, oy + y, shade(tone, f));
    }
  }
}

function drawLogTop(ctx, ox, oy, rand) {
  noisyFill(ctx, ox, oy, "#755331", rand, 0.08);
  ctx.fillStyle = shade("#8f6a3c", 1.05);
  ctx.fillRect(ox + 4, oy + 4, 8, 8);
  ctx.fillStyle = shade("#5d3f22", 0.95);
  ctx.fillRect(ox + 5, oy + 5, 6, 6);
  ctx.fillStyle = shade("#8f6a3c", 1.05);
  ctx.fillRect(ox + 6, oy + 6, 4, 4);
}

function drawLeaves(ctx, ox, oy, rand) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (rand() < 0.16) {
        ctx.clearRect(ox + x, oy + y, 1, 1);
        continue;
      }
      const g = 0.75 + rand() * 0.5;
      pixel(ctx, ox + x, oy + y, `rgb(${Math.round(30 * g)},${Math.round(110 * g)},${Math.round(40 * g)})`);
    }
  }
}

function drawGlass(ctx, ox, oy, rand) {
  ctx.clearRect(ox, oy, 16, 16);
  ctx.fillStyle = "rgba(205,230,240,0.95)";
  ctx.fillRect(ox, oy, 16, 1);
  ctx.fillRect(ox, oy + 15, 16, 1);
  ctx.fillRect(ox, oy, 1, 16);
  ctx.fillRect(ox + 15, oy, 1, 16);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 0; i < 3; i++) {
    const x = 2 + Math.floor(rand() * 10);
    const y = 2 + Math.floor(rand() * 10);
    ctx.fillRect(ox + x, oy + y, 2, 1);
    ctx.fillRect(ox + x + 2, oy + y + 1, 1, 1);
  }
}

function drawWater(ctx, ox, oy, rand) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const b = 150 + Math.floor(rand() * 70);
      pixel(ctx, ox + x, oy + y, `rgb(${30 + Math.floor(rand() * 20)},${90 + Math.floor(rand() * 30)},${b})`);
    }
  }
  for (let y = 2; y < 15; y += 3) {
    ctx.fillStyle = "rgba(210,235,255,0.35)";
    const w = 3 + Math.floor(rand() * 4);
    ctx.fillRect(ox + Math.floor(rand() * (16 - w)), oy + y, w, 1);
  }
}

function drawSnow(ctx, ox, oy, rand) {
  noisyFill(ctx, ox, oy, "#eef4f8", rand, 0.04, 0.08);
}

function drawBedrock(ctx, ox, oy, rand) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = 28 + Math.floor(rand() * 70);
      pixel(ctx, ox + x, oy + y, `rgb(${v},${v},${v + 4})`);
    }
  }
}

function drawBrick(ctx, ox, oy, rand) {
  ctx.fillStyle = "#b8a894";
  ctx.fillRect(ox, oy, 16, 16);
  const brick = "#9c4b32";
  for (let row = 0; row < 4; row++) {
    const by = row * 4;
    const off = row % 2 === 0 ? 0 : 4;
    for (let col = 0; col < 2; col++) {
      const bx = col * 8 + off;
      const w = bx >= 16 ? 4 : 7;
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < w; x++) {
          const px = bx + x;
          const py = by + y;
          if (px < 16) {
            const f = 0.82 + rand() * 0.3;
            pixel(ctx, ox + px, oy + py, shade(brick, f));
          }
        }
      }
    }
  }
}

function drawGravel(ctx, ox, oy, rand) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const r = rand();
      let c;
      if (r < 0.35) c = shade("#8a8a8a", 0.8 + rand() * 0.35);
      else if (r < 0.6) c = shade("#a88050", 0.8 + rand() * 0.35);
      else c = shade("#6f6257", 0.8 + rand() * 0.35);
      pixel(ctx, ox + x, oy + y, c);
    }
  }
}

const PAINTERS = {
  [TILE.GRASS_TOP]: drawGrassTop,
  [TILE.GRASS_SIDE]: drawGrassSide,
  [TILE.DIRT]: (c, x, y, r) => noisyFill(c, x, y, "#8a5a33", r, 0.1, 0.08),
  [TILE.STONE]: drawStone,
  [TILE.COBBLESTONE]: drawCobble,
  [TILE.PLANKS]: drawPlanks,
  [TILE.SAND]: (c, x, y, r) => noisyFill(c, x, y, "#d8c989", r, 0.07, 0.05),
  [TILE.LOG_SIDE]: drawLogSide,
  [TILE.LOG_TOP]: drawLogTop,
  [TILE.LEAVES]: drawLeaves,
  [TILE.GLASS]: drawGlass,
  [TILE.WATER]: drawWater,
  [TILE.SNOW]: drawSnow,
  [TILE.BEDROCK]: drawBedrock,
  [TILE.BRICK]: drawBrick,
  [TILE.GRAVEL]: drawGravel,
};

export function createTextureAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  const rand = mulberry32(20240713);

  for (let tile = 0; tile < GRID; tile++) {
    const ox = (tile % GRID) * TILE_PX;
    const oy = Math.floor(tile / GRID) * TILE_PX;
    const painter = PAINTERS[tile];
    if (painter) {
      painter(ctx, ox, oy, rand);
    } else {
      noisyFill(ctx, ox, oy, "#ff00ff", rand, 0);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const eps = 1 / (SIZE * 2);
  function tileUV(tile) {
    const col = tile % GRID;
    const row = Math.floor(tile / GRID);
    const u0 = col / GRID + eps;
    const u1 = (col + 1) / GRID - eps;
    const v0 = 1 - (row + 1) / GRID + eps;
    const v1 = 1 - row / GRID - eps;
    return [u0, v0, u1, v1];
  }

  function iconDataURL(tile, size = 48) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const cx = c.getContext("2d");
    cx.imageSmoothingEnabled = false;
    const col = tile % GRID;
    const row = Math.floor(tile / GRID);
    cx.drawImage(canvas, col * TILE_PX, row * TILE_PX, TILE_PX, TILE_PX, 0, 0, size, size);
    return c.toDataURL();
  }

  return { canvas, texture, tileUV, iconDataURL };
}
