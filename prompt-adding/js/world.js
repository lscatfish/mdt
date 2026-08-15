// Voxel world: chunk storage, procedural terrain generation, serialization.
// Pure logic — no DOM. Importable from Node for unit tests.

import { BLOCK, CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL } from "./config.js";
import { SimplexNoise2D, fbm, mulberry32, hashString } from "./noise.js";

export const chunkKey = (cx, cz) => cx + "," + cz;

export function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToBytes(b64) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    this.generated = false;
    // Local indices written by neighbours' trees before this chunk's own
    // terrain generation — the terrain pass must not overwrite them.
    this.foreign = new Set();
  }
}

export class World {
  constructor(seed = 12345) {
    this.seed = typeof seed === "string" ? hashString(seed) : (seed >>> 0);
    this.noise = new SimplexNoise2D(this.seed);
    this.noiseDetail = new SimplexNoise2D((this.seed ^ 0x9e3779b9) >>> 0);
    this.chunks = new Map();
    this.meshDirty = new Set(); // chunk keys whose mesh must be rebuilt
    this.timeOfDay = 0.0; // 0 = noon, 0.5 = midnight
  }

  static chunkCoords(x, z) {
    return [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
  }

  static localIndex(lx, ly, lz) {
    return (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
  }

  // Pure terrain height at world column (x, z): y of the top solid block.
  height(x, z) {
    const e = fbm(this.noise, x * 0.006, z * 0.006, 4);
    const m = fbm(this.noiseDetail, x * 0.05 + 37.7, z * 0.05 + 11.3, 3);
    let h = Math.round(SEA_LEVEL + 4 + 20 * e + 4 * m);
    if (h < 1) h = 1;
    if (h > WORLD_HEIGHT - 12) h = WORLD_HEIGHT - 12;
    return h;
  }

  ensureStorage(cx, cz) {
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (!c) {
      c = new Chunk(cx, cz);
      this.chunks.set(key, c);
    }
    return c;
  }

  ensureChunk(cx, cz) {
    const c = this.ensureStorage(cx, cz);
    if (!c.generated) this.generateChunk(cx, cz);
    return c;
  }

  generateChunk(cx, cz) {
    const c = this.ensureStorage(cx, cz);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        heights[lz * CHUNK_SIZE + lx] = this.height(x0 + lx, z0 + lz);
      }
    }
    // Terrain pass.
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const h = heights[lz * CHUNK_SIZE + lx];
        const sandy = h <= SEA_LEVEL + 1;
        const top = Math.max(h, SEA_LEVEL);
        for (let y = 0; y <= top; y++) {
          const idx = World.localIndex(lx, y, lz);
          if (c.foreign.has(idx)) continue;
          let b;
          if (y === 0) b = BLOCK.BEDROCK;
          else if (y === h) b = sandy ? BLOCK.SAND : BLOCK.GRASS;
          else if (y > h) b = BLOCK.WATER;
          else if (y >= h - 3 && !sandy) b = BLOCK.DIRT;
          else b = BLOCK.STONE;
          c.data[idx] = b;
        }
      }
    }
    // Trees pass (tree origins belong to this chunk).
    const rng = mulberry32((this.seed ^ Math.imul(cx, 374761393) ^ Math.imul(cz, 668265263)) >>> 0);
    const candidates = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < candidates; i++) {
      const lx = Math.floor(rng() * CHUNK_SIZE);
      const lz = Math.floor(rng() * CHUNK_SIZE);
      if (rng() > 0.5) continue;
      const h = heights[lz * CHUNK_SIZE + lx];
      if (h < SEA_LEVEL + 2 || h > WORLD_HEIGHT - 10) continue;
      if (c.data[World.localIndex(lx, h, lz)] !== BLOCK.GRASS) continue;
      const wx = x0 + lx;
      const wz = z0 + lz;
      const trunk = 4 + Math.floor(rng() * 2);
      for (let dy = 0; dy < trunk; dy++) {
        this.setBlockRaw(wx, h + 1 + dy, wz, BLOCK.LOG);
      }
      for (let dy = trunk - 2; dy <= trunk + 1; dy++) {
        const r = dy >= trunk ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (dy >= trunk && Math.abs(dx) === 1 && Math.abs(dz) === 1) continue;
            if (Math.abs(dx) === r && Math.abs(dz) === r && rng() < 0.5) continue;
            const by = h + 1 + dy;
            if (by < 0 || by >= WORLD_HEIGHT) continue;
            if (this.peekBlock(wx + dx, by, wz + dz) === BLOCK.AIR) {
              this.setBlockRaw(wx + dx, by, wz + dz, BLOCK.LEAVES);
            }
          }
        }
      }
    }
    c.foreign.clear();
    c.generated = true;
    this.meshDirty.add(chunkKey(cx, cz));
  }

  // Read a block; generates the containing chunk if needed.
  getBlock(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return BLOCK.AIR;
    const [cx, cz] = World.chunkCoords(x, z);
    const c = this.ensureChunk(cx, cz);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    return c.data[World.localIndex(lx, y, lz)];
  }

  // Read a block WITHOUT generating (missing chunk reads as AIR).
  peekBlock(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return BLOCK.AIR;
    const [cx, cz] = World.chunkCoords(x, z);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c || !c.generated) return BLOCK.AIR;
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    return c.data[World.localIndex(lx, y, lz)];
  }

  getChunkData(cx, cz) {
    const c = this.chunks.get(chunkKey(cx, cz));
    return c && c.generated ? c.data : null;
  }

  // Player-driven edit: generates the chunk, writes, schedules remesh.
  setBlock(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const [cx, cz] = World.chunkCoords(x, z);
    const c = this.ensureChunk(cx, cz);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    const idx = World.localIndex(lx, y, lz);
    if (c.data[idx] === id) return false;
    c.data[idx] = id;
    this.meshDirty.add(chunkKey(cx, cz));
    if (lx === 0) this.meshDirty.add(chunkKey(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) this.meshDirty.add(chunkKey(cx + 1, cz));
    if (lz === 0) this.meshDirty.add(chunkKey(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) this.meshDirty.add(chunkKey(cx, cz + 1));
    return true;
  }

  // Generation-time write (trees): never triggers generation.
  setBlockRaw(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const [cx, cz] = World.chunkCoords(x, z);
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (!c) {
      c = new Chunk(cx, cz);
      this.chunks.set(key, c);
    }
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    const idx = World.localIndex(lx, y, lz);
    if (c.generated) {
      c.data[idx] = id;
      this.meshDirty.add(key);
      if (lx === 0) this.meshDirty.add(chunkKey(cx - 1, cz));
      if (lx === CHUNK_SIZE - 1) this.meshDirty.add(chunkKey(cx + 1, cz));
      if (lz === 0) this.meshDirty.add(chunkKey(cx, cz - 1));
      if (lz === CHUNK_SIZE - 1) this.meshDirty.add(chunkKey(cx, cz + 1));
    } else {
      c.foreign.add(idx);
      c.data[idx] = id;
    }
  }

  serialize() {
    const chunks = [];
    for (const [key, c] of this.chunks) {
      if (!c.generated) continue;
      const [cx, cz] = key.split(",").map(Number);
      chunks.push({ cx, cz, b64: bytesToBase64(c.data) });
    }
    return { v: 1, seed: this.seed, timeOfDay: this.timeOfDay, chunks };
  }

  static deserialize(obj) {
    const world = new World(obj.seed);
    world.timeOfDay = typeof obj.timeOfDay === "number" ? obj.timeOfDay : 0;
    for (const { cx, cz, b64 } of obj.chunks || []) {
      const c = world.ensureStorage(cx, cz);
      const data = base64ToBytes(b64);
      if (data.length === c.data.length) c.data.set(data);
      c.generated = true;
      world.meshDirty.add(chunkKey(cx, cz));
    }
    return world;
  }
}
