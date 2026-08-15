import { CFG } from "./config.js";
import { SeededNoise, hash2i } from "./noise.js";
import {
  AIR, WATER, GRASS, DIRT, STONE, SAND, SNOW, BEDROCK, WOOD_LOG, LEAVES,
} from "./blocks.js";

const SX = CFG.CHUNK_SIZE;
const SY = CFG.CHUNK_HEIGHT;

function keyOf(cx, cz) {
  return (cx + 1024) * 4096 + (cz + 1024);
}

export class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.noise = new SeededNoise(this.seed);
    this.chunks = new Map();
    this.dirty = new Set(); // 需要写入存档的区块 key
  }

  key(cx, cz) {
    return keyOf(cx, cz);
  }

  getChunk(cx, cz) {
    return this.chunks.get(keyOf(cx, cz)) || null;
  }

  ensureChunk(cx, cz) {
    const key = keyOf(cx, cz);
    if (!this.chunks.has(key)) {
      this.chunks.set(key, this.generateChunk(cx, cz));
    }
    return this.chunks.get(key);
  }

  generateChunk(cx, cz) {
    const data = new Uint8Array(SX * SY * SX);
    const baseX = cx * SX;
    const baseZ = cz * SX;

    for (let lz = 0; lz < SX; lz++) {
      const wz = baseZ + lz;
      for (let lx = 0; lx < SX; lx++) {
        const wx = baseX + lx;
        const h = this.heightAt(wx, wz);

        // 岩层与表土
        const topBlock = h <= CFG.SEA_LEVEL + 1 ? SAND : h > 44 ? SNOW : GRASS;
        for (let y = 0; y <= h; y++) {
          let id = STONE;
          if (y === 0 || y === 1) id = BEDROCK;
          else if (y === h) id = topBlock;
          else if (y >= h - 3) id = topBlock === SAND ? SAND : DIRT;
          data[(y * SX + lz) * SX + lx] = id;
        }

        // 海与湖
        for (let y = h + 1; y <= CFG.SEA_LEVEL; y++) {
          data[(y * SX + lz) * SX + lx] = WATER;
        }

        // 洞穴(3D 噪声,地表附近与深海不挖)
        if (h > 7) {
          for (let y = 3; y < h - 1; y++) {
            const n1 = this.noise.noise3(wx * 0.075, y * 0.09, wz * 0.075);
            const n2 = this.noise.noise3(wx * 0.16 + 900, y * 0.19 + 300, wz * 0.16 - 500);
            const n = n1 * 0.62 + n2 * 0.38;
            if (n > 0.6) {
              const idx = (y * SX + lz) * SX + lx;
              data[idx] = y <= CFG.SEA_LEVEL && h > CFG.SEA_LEVEL + 2 ? WATER : AIR;
            }
          }
        }

        // 树木(留 2 格边距,保证树冠不跨区块)
        if (
          topBlock === GRASS && h > CFG.SEA_LEVEL + 1 &&
          lx >= 2 && lx < SX - 2 && lz >= 2 && lz < SX - 2 &&
          hash2i(wx, wz, this.seed) < 0.011
        ) {
          this.plantTree(data, lx, h + 1, lz);
        }
      }
    }

    return { data, key: keyOf(cx, cz), cx, cz };
  }

  plantTree(data, x, baseY, z) {
    const trunkH = 4 + Math.floor(hash2i(x, z, this.seed ^ 0x5f3759df) * 3);
    const top = Math.min(SY - 1, baseY + trunkH);
    for (let y = baseY; y < top; y++) {
      data[(y * SX + z) * SX + x] = WOOD_LOG;
    }
    const cy = top - 2;
    for (let dy = -2; dy <= 1; dy++) {
      const r = dy === -2 ? 2 : 1;
      const y = cy + dy;
      if (y < 1 || y >= SY) continue;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r && hash2i(x + dx, z + dz, this.seed ^ 0xabcdef) < 0.55) continue;
          const idx = (y * SX + z + dz) * SX + (x + dx);
          if (idx >= 0 && idx < data.length && data[idx] === AIR) {
            data[idx] = LEAVES;
          }
        }
      }
    }
    // 树顶十字
    const ty = cy + 2;
    if (ty < SY) {
      data[(ty * SX + z) * SX + x] = LEAVES;
      if (x + 1 < SX) data[(ty * SX + z) * SX + (x + 1)] = LEAVES;
      if (x - 1 >= 0) data[(ty * SX + z) * SX + (x - 1)] = LEAVES;
      if (z + 1 < SX) data[(ty * SX + (z + 1)) * SX + x] = LEAVES;
      if (z - 1 >= 0) data[(ty * SX + (z - 1)) * SX + x] = LEAVES;
    }
  }

  heightAt(x, z) {
    const broad = this.noise.fbm2(x * 0.0035, z * 0.0035, 4);
    const hills = this.noise.fbm2(x * 0.007 + 900, z * 0.007 - 400, 3);
    const mountain = Math.max(0, hills);
    let h = Math.floor(17 + broad * 13 + mountain * mountain * 30);
    return Math.max(3, Math.min(SY - 10, h));
  }

  getBlock(x, y, z) {
    if (y < 0) return BEDROCK;
    if (y >= SY) return AIR;
    const cx = Math.floor(x / SX);
    const cz = Math.floor(z / SX);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return STONE; // 未生成区域视为实心,防止破面
    const lx = x - cx * SX;
    const lz = z - cz * SX;
    return chunk.data[(y * SX + lz) * SX + lx];
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= SY) return;
    const cx = Math.floor(x / SX);
    const cz = Math.floor(z / SX);
    const chunk = this.ensureChunk(cx, cz);
    const lx = x - cx * SX;
    const lz = z - cz * SX;
    chunk.data[(y * SX + lz) * SX + lx] = id;
    this.dirty.add(chunk.key);
  }

  unloadFar(centerCX, centerCZ, radius) {
    for (const [key, chunk] of this.chunks) {
      const dx = Math.abs(chunk.cx - centerCX);
      const dz = Math.abs(chunk.cz - centerCZ);
      if (Math.max(dx, dz) > radius) {
        this.chunks.delete(key);
        this.dirty.delete(key); // 丢弃脏标记:卸载前必须已经存档
      }
    }
  }

  // ---- 存档 ----
  serialize() {
    const dirty = [];
    for (const key of this.dirty) {
      for (const chunk of this.chunks.values()) {
        if (chunk.key === key) {
          dirty.push({ key, data: bytesToBase64(chunk.data) });
          break;
        }
      }
    }
    return { seed: this.seed, dirty };
  }

  applySaved(saved) {
    this.dirty.clear();
    if (!saved || !Array.isArray(saved.dirty)) return;
    for (const entry of saved.dirty) {
      const bytes = base64ToBytes(entry.data);
      if (!bytes || bytes.length !== SX * SY * SX) continue;
      const key = entry.key;
      const cx = Math.floor(key / 4096) - 1024;
      const cz = (key % 4096) - 1024;
      this.chunks.set(key, { data: bytes, key, cx, cz });
    }
  }
}

export function bytesToBase64(bytes) {
  let bin = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
