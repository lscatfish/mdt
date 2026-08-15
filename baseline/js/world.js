/* ============================================================
 * world.js — 体素世界：区块化存储、程序化地形生成、编辑存档
 * ============================================================ */
(function (global) {
  'use strict';

  const CX = 16;                 // 区块 X 尺寸
  const CZ = 16;                 // 区块 Z 尺寸
  const H = 96;                  // 世界高度
  const SEA_LEVEL = 32;          // 海平面（水方块顶面在此高度+1）
  const SNOW_LEVEL = 56;         // 积雪线

  const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 8, WATER = 9,
        BEDROCK = 10, COAL = 11, IRON = 12, GOLD = 13, DIAMOND = 14,
        SNOW = 15, LEAVES = 7, LOG = 6, GRAVEL = 17;

  function chunkKey(cx, cz) { return cx + ',' + cz; }

  class Chunk {
    constructor(cx, cz) {
      this.cx = cx; this.cz = cz;
      this.data = new Uint8Array(CX * H * CZ);
      this.dirty = true;         // 需要重新构建网格
      this.generated = false;
      this.mesh = null;
    }
    idx(x, y, z) { return (y * CZ + z) * CX + x; }
    get(x, y, z) { return this.data[(y * CZ + z) * CX + x]; }
    set(x, y, z, v) { this.data[(y * CZ + z) * CX + x] = v; }
  }

  class World {
    constructor(seed) {
      this.seed = seed | 0;
      this.noise = MCNoise.makeNoise(this.seed);
      this.chunks = new Map();   // key -> Chunk
      this.edits = {};           // key -> [[idx, blockId], ...]
    }

    heightAt(wx, wz) {
      const n = this.noise;
      const base = n.fbm2(wx * 0.0035, wz * 0.0035, 3, 2.0, 0.5);       // -1..1 丘陵
      const mountain = n.ridged2(wx * 0.0016 + 11.7, wz * 0.0016 - 7.3, 3, 2.0, 0.55); // 0..~ 山脉
      const continent = n.fbm2(wx * 0.0012 + 37.7, wz * 0.0012 - 13.1, 2, 2.0, 0.5); // 大陆/海洋
      const detail = n.noise2(wx * 0.012, wz * 0.012) * 2.2;
      let h = 34 + base * 9 + Math.pow(mountain, 2) * 40 + continent * 8 + detail;
      h = Math.max(5, Math.min(84, Math.floor(h)));
      return h;
    }

    isCaveAt(wx, wy, wz, surfaceH) {
      if (wy < 4 || wy > surfaceH - 4 || wy > H - 6) return false;
      const n = this.noise.noise3(wx * 0.055, wy * 0.085, wz * 0.055);
      const n2 = this.noise.noise3(wx * 0.015 + 50, wy * 0.03 + 50, wz * 0.015 + 50);
      return n > 0.58 && n2 > -0.15;
    }

    generateChunk(cx, cz) {
      const chunk = new Chunk(cx, cz);
      const n = this.noise;
      const x0 = cx * CX, z0 = cz * CZ;

      // 高度图
      const hmap = new Int16Array(CX * CZ);
      for (let z = 0; z < CZ; z++) {
        for (let x = 0; x < CX; x++) {
          hmap[z * CX + x] = this.heightAt(x0 + x, z0 + z);
        }
      }

      const data = chunk.data;
      for (let z = 0; z < CZ; z++) {
        for (let x = 0; x < CX; x++) {
          const wx = x0 + x, wz = z0 + z;
          const h = hmap[z * CX + x];
          const coastal = h <= SEA_LEVEL + 1;
          const snowy = h >= SNOW_LEVEL;

          for (let y = 0; y <= h; y++) {
            let id = STONE;
            if (y === 0) id = BEDROCK;
            else if (y <= 2 && n.hash2(wx, wz) > 0.5) id = BEDROCK;
            else if (y < h) {
              if (y >= h - 3 - (n.hash2(wx * 3.1, wz * 7.7) * 2 | 0)) id = DIRT;
              else if (this.isCaveAt(wx, y, wz, h)) id = AIR;
              else if (y < h - 3) id = this.oreAt(wx, y, wz);
            } else {
              // 表层
              if (snowy) id = SNOW;
              else if (coastal) id = SAND;
              else id = GRASS;
            }
            data[chunk.idx(x, y, z)] = id;
          }
          // 海平面以下填充水
          for (let y = h + 1; y <= SEA_LEVEL; y++) {
            data[chunk.idx(x, y, z)] = WATER;
          }
        }
      }

      // 树木
      this.plantTrees(chunk, hmap);

      chunk.generated = true;
      chunk.dirty = true;
      this.chunks.set(chunkKey(cx, cz), chunk);

      // 应用玩家的编辑
      const edits = this.edits[chunkKey(cx, cz)];
      if (edits) {
        for (const e of edits) data[e[0]] = e[1];
      }
      return chunk;
    }

    oreAt(wx, y, wz) {
      const n = this.noise;
      const r = n.hash2(wx * 13.37 + y * 7.13, wz * 3.31 + y * 1.7);
      if (y < 14 && r < 0.008) return DIAMOND;
      if (y < 26 && r < 0.014) return GOLD;
      if (y < 42 && r < 0.022) return IRON;
      if (y < 64 && r < 0.032) return COAL;
      if (y > 62 && n.hash2(wx, wz + 777) < 0.03) return GRAVEL;
      return STONE;
    }

    plantTrees(chunk, hmap) {
      const n = this.noise;
      const attempts = 14;
      for (let i = 0; i < attempts; i++) {
        const x = (n.hash2(chunk.cx * 16 + i * 3.3, chunk.cz * 16 - i * 1.7) * CX) | 0;
        const z = (n.hash2(chunk.cx * 16 - i * 5.1, chunk.cz * 16 + i * 2.9) * CZ) | 0;
        if (n.hash2(chunk.cx + i * 7.7, chunk.cz - i * 9.1) > 0.085) continue;
        const h = hmap[z * CX + x];
        if (h <= SEA_LEVEL + 1 || h >= SNOW_LEVEL - 2) continue;
        if (h + 6 >= H) continue;
        if (chunk.get(x, h, z) !== GRASS) continue;
        // 平地概率更高
        const slope = Math.abs(hmap[z * CX + x] - hmap[z * CX + Math.min(x + 1, CX - 1)]) +
                      Math.abs(hmap[z * CX + x] - hmap[Math.min(z + 1, CZ - 1) * CX + x]);
        if (slope > 1) continue;

        const th = 4 + ((n.hash2(x, z) * 3) | 0); // 树干高度
        for (let y = h + 1; y <= h + th; y++) chunk.set(x, y, z, LOG);
        const top = h + th;
        for (let dy = -2; dy <= 1; dy++) {
          const yy = top + dy;
          if (yy > h + 1) {
            const r = dy <= -1 ? 2 : 1;
            for (let dx = -r; dx <= r; dx++) {
              for (let dz = -r; dz <= r; dz++) {
                if (dx === 0 && dz === 0 && dy <= 0) continue;
                const xx = x + dx, zz = z + dz;
                if (xx < 0 || zz < 0 || xx >= CX || zz >= CZ) continue;
                if (chunk.get(xx, yy, zz) === AIR) chunk.set(xx, yy, zz, LEAVES);
              }
            }
          }
        }
        chunk.set(x, top + 2, z, LEAVES);
      }
    }

    // 读取世界方块；区块未加载时返回 null
    getBlock(x, y, z) {
      if (y < 0 || y >= H) return y < 0 ? BEDROCK : AIR;
      const c = this.chunks.get(chunkKey(Math.floor(x / CX), Math.floor(z / CZ)));
      if (!c || !c.generated) return null;
      return c.get(x - c.cx * CX, y, z - c.cz * CZ);
    }

    getBlockFast(chunk, x, y, z) {
      // 与 getBlock 相同，但已知目标区块，用于网格构建
      if (y < 0 || y >= H) return y < 0 ? BEDROCK : AIR;
      const cx = Math.floor(x / CX), cz = Math.floor(z / CZ);
      if (cx === chunk.cx && cz === chunk.cz) {
        return chunk.get(x - cx * CX, y, z - cz * CZ);
      }
      return this.getBlock(x, y, z);
    }

    setBlock(x, y, z, id, record) {
      if (y < 0 || y >= H) return false;
      const cx = Math.floor(x / CX), cz = Math.floor(z / CZ);
      const c = this.chunks.get(chunkKey(cx, cz));
      if (!c || !c.generated) return false;
      const lx = x - cx * CX, lz = z - cz * CZ;
      c.set(lx, y, lz, id);
      c.dirty = true;
      this.markNeighborIfEdge(c, lx, lz);

      if (record !== false) {
        const key = chunkKey(cx, cz);
        if (!this.edits[key]) this.edits[key] = [];
        this.edits[key].push([c.idx(lx, y, lz), id]);
      }
      return true;
    }

    markNeighborIfEdge(c, lx, lz) {
      if (lx === 0) this.markDirty(c.cx - 1, c.cz);
      if (lx === CX - 1) this.markDirty(c.cx + 1, c.cz);
      if (lz === 0) this.markDirty(c.cx, c.cz - 1);
      if (lz === CZ - 1) this.markDirty(c.cx, c.cz + 1);
    }

    markDirty(cx, cz) {
      const c = this.chunks.get(chunkKey(cx, cz));
      if (c) c.dirty = true;
    }

    // 网格可构建：四面邻居均已生成
    canMesh(c) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = this.chunks.get(chunkKey(c.cx + dx, c.cz + dz));
        if (!n || !n.generated) return false;
      }
      return true;
    }

    unloadChunk(cx, cz) {
      const key = chunkKey(cx, cz);
      const c = this.chunks.get(key);
      if (!c) return;
      // GL 缓冲由渲染器负责释放（见 Game.updateChunks）
      c.mesh = null;
      this.chunks.delete(key);
    }

    // 出生点：螺旋向外寻找高于海平面的陆地
    findSpawn() {
      for (let r = 0; r <= 64; r += 4) {
        for (let x = -r; x <= r; x += 4) {
          const zs = (x === -r || x === r) ? [] : [-r, r];
          if (x === -r || x === r) {
            for (let z = -r; z <= r; z += 4) zs.push(z);
          }
          for (const z of zs) {
            const h = this.heightAt(x, z);
            if (h > MCWorld.SEA_LEVEL + 1) {
              const cx = Math.floor(x / CX), cz = Math.floor(z / CZ);
              if (!this.chunks.has(MCWorld.chunkKey(cx, cz))) this.generateChunk(cx, cz);
              return { x: x + 0.5, y: h + 1.01, z: z + 0.5 };
            }
          }
        }
      }
      // 极端情况：整片海洋，落在海面
      return { x: 0.5, y: SEA_LEVEL + 2, z: 0.5 };
    }

    serializeEdits() {
      const out = {};
      for (const key in this.edits) {
        const list = this.edits[key];
        if (list && list.length) out[key] = list;
      }
      return JSON.stringify({ v: 2, seed: this.seed, edits: out });
    }
  }

  global.MCWorld = { World, Chunk, CX, CZ, H, SEA_LEVEL, AIR, WATER, chunkKey };
})(window);
