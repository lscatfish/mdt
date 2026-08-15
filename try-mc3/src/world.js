// 世界：无限水平、64 格高的体素世界。
// 生成完全由种子决定：地形 = fBm 高度场 + 生物群系；树木按列散列确定性放置；
// 洞穴/矿石用 3D 值噪声。玩家改动记录在 edits 中并持久化到 localStorage。
import { fbm2, noise3, hash2i } from './noise.js';
import { IDs } from './blocks.js';

export const CHUNK = 16;
export const WORLD_H = 64;
export const SEA = 33;

const STORAGE_KEY = 'webcraft.v1';

const mod = (a, n) => ((a % n) + n) % n;

export class World {
  constructor(seed, edits) {
    this.seed = seed | 0;
    this.persist = true;
    this.chunks = new Map();   // "cx,cz" -> { cx, cz, data: Uint8Array }
    this.columns = new Map();  // "x,z"   -> Uint8Array(64) 列缓存
    this.trees = new Map();    // "x,z"   -> { trunkH } | null 树木缓存
    this.edits = edits || new Map(); // "cx,cz" -> Map("idx" -> id)
    this._saveTimer = null;
  }

  key(cx, cz) { return cx + ',' + cz; }

  // ---------- 生成函数（确定性） ----------

  heightAt(x, z) {
    const n1 = fbm2(x * 0.0035, z * 0.0035, this.seed, 4);
    const n2 = fbm2(x * 0.016 + 91.7, z * 0.016 + 33.1, this.seed + 11, 2);
    return Math.floor(SEA + 5 + n1 * 13 + n2 * 4.5);
  }

  biomeAt(x, z) {
    const t = fbm2(x * 0.0016 + 700, z * 0.0016 + 300, this.seed + 21, 2);
    const m = fbm2(x * 0.0016 + 1300, z * 0.0016 + 900, this.seed + 31, 2);
    return t > 0.12 && m < 0.08 ? 'desert' : 'grass';
  }

  treeAt(x, z) {
    const key = x + ',' + z;
    if (this.trees.has(key)) return this.trees.get(key);
    let info = null;
    if (this.biomeAt(x, z) === 'grass') {
      const h = this.heightAt(x, z);
      const r = hash2i(x, z, this.seed + 123) / 4294967295;
      if (h > SEA + 1 && r < 0.0075) {
        info = { trunkH: 4 + (hash2i(x, z, this.seed + 456) % 3) };
      }
    }
    this.trees.set(key, info);
    if (this.trees.size > 40000) this.trees.clear();
    return info;
  }

  caveAt(x, y, z) {
    const n = noise3(x * 0.05, y * 0.07, z * 0.05, this.seed + 61)
            + 0.5 * noise3(x * 0.11 + 40, y * 0.14 + 40, z * 0.11 + 40, this.seed + 71);
    return n > 0.88;
  }

  // 生成并缓存一整列（x, z 处的 64 格）
  getColumn(x, z) {
    const key = x + ',' + z;
    const hit = this.columns.get(key);
    if (hit) return hit;

    const col = new Uint8Array(WORLD_H);
    const h = this.heightAt(x, z);
    const biome = this.biomeAt(x, z);
    const beach = h <= SEA + 1;
    const surface = biome === 'desert' || beach ? IDs.SAND : IDs.GRASS;

    for (let y = 0; y < WORLD_H; y++) {
      let id = IDs.AIR;
      if (y === 0) {
        id = IDs.BEDROCK;
      } else if (y <= h) {
        if (y <= h - 4) {
          id = IDs.STONE;
          if (this.caveAt(x, y, z)) {
            id = IDs.AIR;
          } else if (y < 48 && noise3(x * 0.09 + 50, y * 0.11, z * 0.09, this.seed + 41) > 0.85) {
            id = IDs.COAL_ORE;
          } else if (y < 40 && noise3(x * 0.07 + 80, y * 0.09, z * 0.07, this.seed + 51) > 0.88) {
            id = IDs.IRON_ORE;
          }
        } else if (y <= h - 1) {
          id = IDs.DIRT;
        } else {
          id = surface;
        }
      } else if (y <= SEA) {
        id = IDs.WATER;
      }
      col[y] = id;
    }

    // 树木：检查周围 5x5 列中存在的树（树叶半径 2）
    if (h > SEA) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const t = this.treeAt(x + dx, z + dz);
          if (!t) continue;
          const th = this.heightAt(x + dx, z + dz);
          const topY = th + t.trunkH; // 树干顶端方块 y
          if (dx === 0 && dz === 0) {
            for (let y = th + 1; y <= topY; y++) if (y < WORLD_H) col[y] = IDs.LOG;
          }
          for (let ly = 0; ly < 4; ly++) {
            const cy = topY - 1 + ly;
            const r = ly === 1 || ly === 2 ? 2 : 1;
            if (cy < 0 || cy >= WORLD_H) continue;
            for (let lx = -r; lx <= r; lx++) {
              for (let lz = -r; lz <= r; lz++) {
                if (r === 2 && Math.abs(lx) === 2 && Math.abs(lz) === 2) continue;
                const px = x + dx + lx, pz = z + dz + lz;
                if (px !== x || pz !== z) continue;
                if (col[cy] === IDs.AIR) col[cy] = IDs.LEAVES;
              }
            }
          }
        }
      }
    }

    this.columns.set(key, col);
    if (this.columns.size > 60000) this.columns.clear();
    return col;
  }

  // ---------- 查询与修改 ----------

  getBlock(x, y, z) {
    if (y < 0) return IDs.BEDROCK;
    if (y >= WORLD_H) return IDs.AIR;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const key = this.key(cx, cz);
    const chunk = this.chunks.get(key);
    if (chunk) return chunk.data[(y * CHUNK + mod(z, CHUNK)) * CHUNK + mod(x, CHUNK)];
    const e = this.edits.get(key);
    if (e) {
      const v = e.get((y * CHUNK + mod(z, CHUNK)) * CHUNK + mod(x, CHUNK));
      if (v !== undefined) return v;
    }
    return this.getColumn(x, z)[y];
  }

  ensureChunk(cx, cz) {
    const key = this.key(cx, cz);
    let chunk = this.chunks.get(key);
    if (chunk) return chunk;
    const data = new Uint8Array(CHUNK * WORLD_H * CHUNK);
    for (let dz = 0; dz < CHUNK; dz++) {
      for (let dx = 0; dx < CHUNK; dx++) {
        const col = this.getColumn(cx * CHUNK + dx, cz * CHUNK + dz);
        for (let y = 0; y < WORLD_H; y++) data[(y * CHUNK + dz) * CHUNK + dx] = col[y];
      }
    }
    const e = this.edits.get(key);
    if (e) for (const [idx, id] of e) data[idx] = id;
    chunk = { cx, cz, data };
    this.chunks.set(key, chunk);
    return chunk;
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= WORLD_H) return false;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const key = this.key(cx, cz);
    const idx = (y * CHUNK + mod(z, CHUNK)) * CHUNK + mod(x, CHUNK);
    let e = this.edits.get(key);
    if (!e) { e = new Map(); this.edits.set(key, e); }
    e.set(idx, id);
    const chunk = this.chunks.get(key);
    if (chunk) chunk.data[idx] = id;
    this.saveDebounced();
    return true;
  }

  findSpawn() {
    for (let r = 0; r < 64; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = 8 + dx, z = 8 + dz;
          const h = this.heightAt(x, z);
          if (h <= SEA + 2 || h >= WORLD_H - 4) continue;
          // 避开树木
          let nearTree = false;
          for (let tx = -3; tx <= 3 && !nearTree; tx++) {
            for (let tz = -3; tz <= 3 && !nearTree; tz++) {
              if (this.treeAt(x + tx, z + tz)) nearTree = true;
            }
          }
          if (nearTree) continue;
          return { x: x + 0.5, y: h + 1.0, z: z + 0.5 };
        }
      }
    }
    return { x: 8.5, y: 62, z: 8.5 };
  }

  // ---------- 存档 ----------

  static load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        const edits = new Map();
        for (const [key, map] of Object.entries(obj.edits || {})) {
          edits.set(key, new Map(Object.entries(map).map(([i, v]) => [Number(i), v])));
        }
        return { seed: obj.seed | 0, edits };
      }
    } catch { /* 损坏则忽略 */ }
    return { seed: (Math.random() * 0x7fffffff) | 0, edits: new Map() };
  }

  save() {
    if (!this.persist) return;
    const edits = {};
    for (const [key, map] of this.edits) {
      const o = {};
      for (const [i, v] of map) o[i] = v;
      edits[key] = o;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, seed: this.seed, edits }));
    } catch { /* 存储满则放弃 */ }
  }

  saveDebounced() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => { this._saveTimer = null; this.save(); }, 1200);
  }

  saveNow() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    this.save();
  }

  resetStorage() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* 忽略 */ }
  }
}
