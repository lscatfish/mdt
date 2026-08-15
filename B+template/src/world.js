// 世界：区块存储、方块读写、DDA 射线检测、存档
import { CHUNK_SIZE, WORLD_HEIGHT, AIR, isSolid } from './constants.js';
import { generateTerrain, decorateChunk } from './terrain.js';

const STRIDE = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;
const STORE_KEY = 'webcraft-save-v1';

function floorDiv(a, b) {
  return Math.floor(a / b);
}

export class World {
  constructor(seed) {
    this.seed = seed;
    this.chunks = new Map();   // "cx,cz" -> chunk
    this.meshQueue = [];       // 待重建网格的 chunk key 队列
    this.meshQueued = new Set();
    this.onDisposeMesh = null;
    this.loadedEdits = this.loadEdits();
  }

  key(cx, cz) {
    return cx + ',' + cz;
  }

  getChunk(cx, cz) {
    const key = this.key(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      const saved = this.loadedEdits.get(key);
      chunk = {
        cx,
        cz,
        key,
        data: saved ? this.decodeData(saved) : new Uint8Array(STRIDE),
        filled: !!saved,
        dirty: true,
        edited: !!saved,
        meshGroup: null,
      };
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  hasChunk(cx, cz) {
    return this.chunks.has(this.key(cx, cz));
  }

  localIndex(lx, y, lz) {
    return (lx + lz * CHUNK_SIZE) * WORLD_HEIGHT + y;
  }

  getBlock(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR;
    const cx = floorDiv(x, CHUNK_SIZE);
    const cz = floorDiv(z, CHUNK_SIZE);
    const chunk = this.chunks.get(this.key(cx, cz));
    if (!chunk) return AIR;
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    return chunk.data[this.localIndex(lx, y, lz)];
  }

  // 碰撞查询：世界边界与未生成区块视为实心
  collisionSolid(x, y, z) {
    if (y < 0) return true;
    if (y >= WORLD_HEIGHT) return false;
    const cx = floorDiv(x, CHUNK_SIZE);
    const cz = floorDiv(z, CHUNK_SIZE);
    const chunk = this.chunks.get(this.key(cx, cz));
    if (!chunk || !chunk.filled) return true;
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    return isSolid(chunk.data[this.localIndex(lx, y, lz)]);
  }

  // 直接写入，用于树木等跨区块装饰；不触发网格重建
  setBlockRaw(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const cx = floorDiv(x, CHUNK_SIZE);
    const cz = floorDiv(z, CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    chunk.data[this.localIndex(lx, y, lz)] = id;
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const cx = floorDiv(x, CHUNK_SIZE);
    const cz = floorDiv(z, CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    const i = this.localIndex(lx, y, lz);
    if (chunk.data[i] === id) return false;
    chunk.data[i] = id;
    chunk.edited = true;
    this.markDirty(cx, cz, lx, lz);
    return true;
  }

  markDirty(cx, cz, lx, lz) {
    this.requestMesh(cx, cz);
    if (lx === 0) this.requestMesh(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.requestMesh(cx + 1, cz);
    if (lz === 0) this.requestMesh(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.requestMesh(cx, cz + 1);
  }

  requestMesh(cx, cz) {
    const key = this.key(cx, cz);
    if (this.meshQueued.has(key)) return;
    this.meshQueued.add(key);
    this.meshQueue.push(key);
  }

  nextMeshJob() {
    if (this.meshQueue.length === 0) return null;
    const key = this.meshQueue.shift();
    this.meshQueued.delete(key);
    return key;
  }

  fillChunk(cx, cz) {
    const chunk = this.getChunk(cx, cz);
    if (!chunk.filled) {
      generateTerrain(this, cx, cz);
      decorateChunk(this, cx, cz);
      chunk.filled = true;
      chunk.dirty = true;
    }
    return chunk;
  }

  // DDA 体素射线检测；跳过水与空气
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxX = dx !== 0 ? (dx > 0 ? (x + 1 - ox) : (ox - x)) / Math.abs(dx) : Infinity;
    let tMaxY = dy !== 0 ? (dy > 0 ? (y + 1 - oy) : (oy - y)) / Math.abs(dy) : Infinity;
    let tMaxZ = dz !== 0 ? (dz > 0 ? (z + 1 - oz) : (oz - z)) / Math.abs(dz) : Infinity;
    let nx = 0, ny = 0, nz = 0;
    let t = 0;

    for (let i = 0; i < 256; i++) {
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
      }
      if (t > maxDist) return null;
      if (y < 0 || y >= WORLD_HEIGHT) continue;
      const id = this.getBlock(x, y, z);
      if (id !== AIR) {
        return { x, y, z, nx, ny, nz, id, t };
      }
    }
    return null;
  }

  // ---------- 存档 ----------
  saveEdits() {
    const records = [];
    for (const chunk of this.chunks.values()) {
      if (!chunk.edited) continue;
      records.push([chunk.key, this.encodeData(chunk.data)]);
    }
    if (records.length === 0) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ seed: this.seed, chunks: records }));
    } catch (e) {
      console.warn('存档失败', e);
    }
  }

  loadEdits() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return new Map();
      const obj = JSON.parse(raw);
      const map = new Map();
      for (const [key, b64] of obj.chunks) {
        try {
          this.decodeData(b64);
          map.set(key, b64);
        } catch (e) { /* 跳过损坏记录 */ }
      }
      return map;
    } catch (e) {
      return new Map();
    }
  }

  encodeData(data) {
    let bin = '';
    const step = 8192;
    for (let i = 0; i < data.length; i += step) {
      bin += String.fromCharCode.apply(null, data.subarray(i, Math.min(i + step, data.length)));
    }
    return btoa(bin);
  }

  decodeData(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(STRIDE);
    for (let i = 0; i < STRIDE; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
}
