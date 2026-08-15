// Procedural texture atlas drawn on a canvas. Browser-only (uses canvas 2D).
// Deterministic: pixel content depends only on tile ids + fixed salts.
// Also exports texelAt() so tests can compute the EXACT expected screen
// color of a face (same texel the GPU's NEAREST sampler picks).

import { ATLAS_PX, ATLAS_COLS, TILE_PX, TILE } from "./config.js";

// Seeded per-tile rng (deterministic across loads).
function tileRng(tile, salt = 0) {
  let s = (tile * 0x45d9f3b + salt * 0x119de1f3 + 0x27f1) >>> 0;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
}

function setPx(data, x, y, r, g, b, a = 255) {
  const i = (y * TILE_PX + x) * 4;
  data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
}

// Fill the whole tile with noisy base color.
function noiseFill(data, r, g, b, jitter, rng) {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const j = Math.round((rng() * 2 - 1) * jitter);
      setPx(data, x, y, r + j, g + j, b + j);
    }
  }
}

function darken(data, x, y, amount) {
  const i = (y * TILE_PX + x) * 4;
  data[i] *= amount; data[i + 1] *= amount; data[i + 2] *= amount;
}

const painters = {
  [TILE.GRASS_TOP](data, rng) { noiseFill(data, 96, 158, 54, 10, rng); },
  [TILE.DIRT](data, rng) { noiseFill(data, 134, 96, 67, 10, rng); },
  [TILE.GRASS_SIDE](data, rng) {
    noiseFill(data, 134, 96, 67, 10, rng);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < TILE_PX; x++) setPx(data, x, y, 96, 158, 54);
    }
    // ragged grass edge on row 3
    for (let x = 0; x < TILE_PX; x++) {
      if (rng() < 0.75) setPx(data, x, 3, 96, 158, 54);
      else if (rng() < 0.3) setPx(data, x, 4, 96, 158, 54);
    }
  },
  [TILE.STONE](data, rng) {
    noiseFill(data, 127, 127, 127, 9, rng);
    for (let b = 0; b < 7; b++) { // darker patches
      const cx = 2 + Math.floor(rng() * 12);
      const cy = 2 + Math.floor(rng() * 12);
      const r = 1 + Math.floor(rng() * 3);
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= TILE_PX || y >= TILE_PX) continue;
          if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) darken(data, x, y, 0.78);
        }
      }
    }
    for (let s = 0; s < 14; s++) { // light speckles
      const x = Math.floor(rng() * TILE_PX);
      const y = Math.floor(rng() * TILE_PX);
      const i = (y * TILE_PX + x) * 4;
      data[i] = Math.min(255, data[i] + 26);
      data[i + 1] = Math.min(255, data[i + 1] + 26);
      data[i + 2] = Math.min(255, data[i + 2] + 26);
    }
  },
  [TILE.SAND](data, rng) { noiseFill(data, 221, 208, 164, 7, rng); },
  [TILE.WATER](data, rng) {
    noiseFill(data, 58, 108, 190, 5, rng);
    // translucent: uniform alpha
    for (let i = 3; i < data.length; i += 4) data[i] = 180;
    for (let s = 0; s < 20; s++) { // sparkles
      const x = Math.floor(rng() * TILE_PX);
      const y = Math.floor(rng() * TILE_PX);
      setPx(data, x, y, 90, 140, 210, 180);
    }
  },
  [TILE.LOG_SIDE](data, rng) {
    noiseFill(data, 104, 82, 51, 7, rng);
    for (let x = 0; x < TILE_PX; x++) {
      const stripe = (x % 5 === 0) ? 0.62 : 0.9;
      for (let y = 0; y < TILE_PX; y++) {
        if (x % 5 === 0 || (rng() < 0.04)) darken(data, x, y, stripe);
      }
    }
  },
  [TILE.LOG_TOP](data, rng) {
    noiseFill(data, 158, 127, 76, 7, rng);
    const cx = 7.5, cy = 7.5;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > 5.4 && d <= 6.8) darken(data, x, y, 0.62);
        else if (d <= 5.4 && rng() < 0.5) darken(data, x, y, 0.9);
      }
    }
  },
  [TILE.LEAVES](data, rng) {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        if (rng() < 0.86) {
          const j = Math.round((rng() * 2 - 1) * 13);
          setPx(data, x, y, 54 + j, 124 + j, 46 + j);
        } else {
          setPx(data, x, y, 0, 0, 0, 0); // cutout holes
        }
      }
    }
  },
  [TILE.PLANKS](data, rng) {
    noiseFill(data, 170, 133, 80, 6, rng);
    for (let x = 0; x < TILE_PX; x++) {
      for (let y = 0; y < TILE_PX; y++) {
        if (y === 0 || y === 7 || y === 8 || y === 15) darken(data, x, y, 0.55);
        if (x === 4 && y < 8) darken(data, x, y, 0.75);
        if (x === 11 && y >= 8) darken(data, x, y, 0.75);
      }
    }
  },
  [TILE.GLASS](data, rng) {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const border = x === 0 || x === TILE_PX - 1 || y === 0 || y === TILE_PX - 1;
        if (border) setPx(data, x, y, 224, 236, 241, 235);
        else if (x === 4 && y === 5 || x === 11 && y === 10) setPx(data, x, y, 235, 245, 250, 150);
        else setPx(data, x, y, 205, 228, 235, 38);
      }
    }
  },
  [TILE.BEDROCK](data, rng) {
    noiseFill(data, 66, 66, 66, 15, rng);
    for (let b = 0; b < 9; b++) {
      const cx = Math.floor(rng() * TILE_PX);
      const cy = Math.floor(rng() * TILE_PX);
      const r = 1 + Math.floor(rng() * 2);
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= TILE_PX || y >= TILE_PX) continue;
          darken(data, x, y, 0.72);
        }
      }
    }
  },
};

let atlasCanvas = null;
let atlasImageData = null;

export function buildAtlas() {
  atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = ATLAS_PX;
  atlasCanvas.height = ATLAS_PX;
  const ctx = atlasCanvas.getContext("2d");
  const img = ctx.createImageData(TILE_PX, TILE_PX);
  for (const [tileStr, painter] of Object.entries(painters)) {
    const tile = Number(tileStr);
    // reset tile buffer to opaque black first
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0; img.data[i + 3] = 255;
    }
    painter(img.data, tileRng(tile));
    const col = tile % ATLAS_COLS;
    const row = Math.floor(tile / ATLAS_COLS);
    ctx.putImageData(img, col * TILE_PX, row * TILE_PX);
  }
  atlasImageData = ctx.getImageData(0, 0, ATLAS_PX, ATLAS_PX);
  return atlasCanvas;
}

export function getAtlasCanvas() { return atlasCanvas; }

// Exact RGBA of the texel at tile-space (u,v) ∈ [0,1)² — the same texel
// the GPU NEAREST sampler picks for that uv.
export function texelAt(tile, u, v) {
  if (!atlasImageData) throw new Error("atlas not built");
  const px = Math.min(TILE_PX - 1, Math.max(0, Math.floor(u * TILE_PX)));
  const py = Math.min(TILE_PX - 1, Math.max(0, Math.floor(v * TILE_PX)));
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const i = ((row * TILE_PX + py) * ATLAS_PX + col * TILE_PX + px) * 4;
  const d = atlasImageData.data;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
}
