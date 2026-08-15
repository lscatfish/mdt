// 世界：确定性地形生成（高度图 + 3D 洞穴 + 树 + 水域）、区块流式加载、
// 方块读写、修改记录（存档）、区块网格生命周期管理。
import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, RENDER_DISTANCE, BLOCK } from './config.js';
import { fbm2, vfbm3 } from './noise.js';
import { buildChunkGeometry } from './mesher.js';

const IDX = (x, y, z) => y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;

export class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.chunks = new Map();   // "cx,cz" -> {cx, cz, data: Uint8Array}
    this.meshes = new Map();   // "cx,cz" -> {cx, cz, opaque, water}
    this.dirty = new Set();    // 等待重建网格的区块
    this.queued = new Set();   // 已排队等待生成的区块
    this.pending = [];         // 生成队列（按距离排序）
    this.modified = new Map(); // 玩家修改 "x,y,z" -> 方块 id
    this.scene = null;
    this.opaqueMat = null;
    this.waterMat = null;
    this.spawn = null;
  }

  key(cx, cz) { return cx + ',' + cz; }

  setRenderer(scene, opaqueMat, waterMat) {
    this.scene = scene;
    this.opaqueMat = opaqueMat;
    this.waterMat = waterMat;
  }

  // ---------- 方块数据 ----------
  getChunk(cx, cz) {
    const k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = { cx, cz, data: new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE) };
      this.chunks.set(k, c);
      this.generateChunk(c);
      this.markDirty(cx, cz);
    }
    return c;
  }

  getBlock(x, y, z) {
    if (y < 0) return BLOCK.BEDROCK;
    if (y >= WORLD_HEIGHT) return BLOCK.AIR;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const c = this.chunks.get(this.key(cx, cz));
    if (!c) return BLOCK.AIR;
    return c.data[IDX(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
  }

  setBlock(x, y, z, id, record = true) {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const c = this.getChunk(cx, cz);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    c.data[IDX(lx, y, lz)] = id;
    if (record) this.modified.set(x + ',' + y + ',' + z, id);
    this.markDirty(cx, cz);
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  markDirty(cx, cz) { this.dirty.add(this.key(cx, cz)); }

  // ---------- 确定性地形 ----------
  heightAt(x, z) {
    const c = fbm2(x * 0.0032, z * 0.0032, 4);
    const detail = fbm2(x * 0.0105 + 731, z * 0.0105 + 251, 3);
    let h = SEA_LEVEL + 3 + c * 11 + detail * 3.5;
    // 低频洋盆：约 1/6 的区域形成 6~20 格深的海洋
    const basin = fbm2(x * 0.0017 + 3100, z * 0.0017 + 2100, 2);
    if (basin < -0.28) {
      h -= 6 + Math.pow((basin + 0.28) / -0.72, 1.5) * 12;
    }
    const ridge = 1 - Math.abs(fbm2(x * 0.0021 + 1400, z * 0.0021 + 1400, 3));
    if (ridge > 0.7) h += Math.pow((ridge - 0.7) / 0.3, 2) * 24;
    h = Math.floor(h);
    return Math.max(2, Math.min(WORLD_HEIGHT - 9, h));
  }

  surfaceBlock(x, h, z) {
    if (h >= 48) return BLOCK.SNOW;
    if (h <= SEA_LEVEL + 1) return BLOCK.SAND;
    return BLOCK.GRASS;
  }

  isCave(x, y, z) {
    const n = vfbm3(x * 0.09, y * 0.11, z * 0.09, 3);
    if (n > 0.32) return true; // 约 5% 体积的蜿蜒洞穴
    // 深层偶尔出现更大的溶洞
    if (y > 12 && n > 0.20) {
      const m = vfbm3(x * 0.18 + 700, y * 0.22 + 300, z * 0.18 + 900, 2);
      if (m > 0.46) return true;
    }
    return false;
  }

  hash2(x, z, salt) {
    let h = (Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(this.seed, 1442695041) ^ salt) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  randTree(x, z) {
    return this.hash2(x, z, 17) < 0.02;
  }

  generateChunk(c) {
    const { cx, cz, data } = c;
    const heights = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const surfaces = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wz = cz * CHUNK_SIZE + lz;
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = cx * CHUNK_SIZE + lx;
        const h = this.heightAt(wx, wz);
        const surf = this.surfaceBlock(wx, h, wz);
        heights[lz * CHUNK_SIZE + lx] = h;
        surfaces[lz * CHUNK_SIZE + lx] = surf;
        const under = surf === BLOCK.SAND ? BLOCK.SAND : BLOCK.DIRT;

        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) id = BLOCK.BEDROCK;
          else if (y === h) id = surf;
          else if (y >= h - 3) id = under;
          else id = BLOCK.STONE;

          if (id !== BLOCK.BEDROCK && y < h && this.isCave(wx, y, wz)) id = BLOCK.AIR;
          if (id === BLOCK.AIR && y <= SEA_LEVEL) id = BLOCK.WATER;
          data[IDX(lx, y, lz)] = id;
        }
        // 海面填充：地表低于海平面时，h+1..SEA_LEVEL 全部是水
        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          data[IDX(lx, y, lz)] = BLOCK.WATER;
        }
      }
    }

    // 树木：按列哈希决定。树冠可能越过区块边界，因此本区块再对
    // 周边 2 格范围内的“外来树干列”做一次装饰，保证任意生成顺序下
    // 树冠完整，且不会触发相邻区块的递归生成。
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const h = heights[lz * CHUNK_SIZE + lx];
        if (surfaces[lz * CHUNK_SIZE + lx] !== BLOCK.GRASS) continue;
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        if (this.randTree(wx, wz)) this.plantTree(c, wx, h, wz);
      }
    }
    for (let lz = -2; lz < CHUNK_SIZE + 2; lz++) {
      for (let lx = -2; lx < CHUNK_SIZE + 2; lx++) {
        if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) continue; // 本区块列已处理
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        if (!this.randTree(wx, wz)) continue; // 廉价哈希先筛
        const h = this.heightAt(wx, wz);
        if (this.surfaceBlock(wx, h, wz) !== BLOCK.GRASS) continue;
        this.plantTree(c, wx, h, wz);
      }
    }
  }

  // 只直接写入 chunk 数据、绝不跨区块生成：越界部分由相邻区块自己的
  // “装饰带”补齐（每个区块都会扫描周边 2 格，结果与生成顺序无关）。
  plantTree(c, wx, topY, wz) {
    const { cx, cz, data } = c;
    const minX = cx * CHUNK_SIZE;
    const minZ = cz * CHUNK_SIZE;
    const maxX = minX + CHUNK_SIZE;
    const maxZ = minZ + CHUNK_SIZE;
    const inChunk = (x, z) => x >= minX && x < maxX && z >= minZ && z < maxZ;
    const put = (x, y, z, id) => { data[IDX(x - minX, y, z - minZ)] = id; };

    const trunkH = 4 + Math.floor(this.hash2(wx, wz, 91) * 3); // 4~6
    const top = topY + trunkH;
    if (top >= WORLD_HEIGHT - 2) return;

    for (let y = topY + 1; y <= top; y++) {
      if (inChunk(wx, wz)) put(wx, y, wz, BLOCK.LOG);
    }
    for (let dy = 0; dy <= 2; dy++) {
      const ly = top - 2 + dy;
      const r = dy === 2 ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx === 0 && dz === 0) continue; // 树干位置
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && this.hash2(wx + dx, wz + dz, 7) < 0.6) continue;
          const x = wx + dx;
          const z = wz + dz;
          if (!inChunk(x, z)) continue;
          const cur = data[IDX(x - minX, ly, z - minZ)];
          if (cur === BLOCK.AIR || cur === BLOCK.LEAVES) put(x, ly, z, BLOCK.LEAVES);
        }
      }
    }
  }

  computeSpawn() {
    for (let r = 0; r < 128; r++) {
      for (let d = -r; d <= r; d++) {
        const pts = [[d, r], [d, -r], [r, d], [-r, d]];
        for (const [dx, dz] of pts) {
          const x = 8 + dx;
          const z = 8 + dz;
          const h = this.heightAt(x, z);
          const surf = this.surfaceBlock(x, h, z);
          if ((surf !== BLOCK.GRASS && surf !== BLOCK.SNOW) || h <= SEA_LEVEL) continue;
          this.spawn = { x: x + 0.5, y: h + 1.0, z: z + 0.5 };
          return this.spawn;
        }
      }
    }
    this.spawn = { x: 8.5, y: 42, z: 8.5 };
    return this.spawn;
  }

  // 生成出生点附近 5x5 区块并同步构建最近 3x3 的网格，避免开局坠落
  prepareSpawn() {
    const s = this.computeSpawn();
    const pcx = Math.floor(s.x / CHUNK_SIZE);
    const pcz = Math.floor(s.z / CHUNK_SIZE);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) this.getChunk(pcx + dx, pcz + dz);
    }
    const near = [];
    for (const k of this.dirty) {
      const [cx, cz] = k.split(',').map(Number);
      const dist = (cx - pcx) ** 2 + (cz - pcz) ** 2;
      if (dist <= 4) near.push({ k, cx, cz, dist });
    }
    near.sort((a, b) => a.dist - b.dist);
    for (const n of near) {
      this.dirty.delete(n.k);
      this.buildMesh(n.cx, n.cz);
    }
  }

  // ---------- 区块流式加载 ----------
  updateChunks(px, pz) {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    const R = RENDER_DISTANCE;

    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        if (dx * dx + dz * dz > R * R) continue;
        const cx = pcx + dx;
        const cz = pcz + dz;
        const k = this.key(cx, cz);
        if (!this.chunks.has(k)) {
          if (!this.queued.has(k)) {
            this.queued.add(k);
            this.pending.push({ cx, cz, dist: dx * dx + dz * dz });
          }
        } else if (!this.meshes.has(k)) {
          this.markDirty(cx, cz);
        }
      }
    }

    this.pending.sort((a, b) => a.dist - b.dist);
    const genStart = performance.now();
    let budget = 3;
    while (budget > 0 && this.pending.length && performance.now() - genStart < 8) {
      const p = this.pending.shift();
      this.queued.delete(this.key(p.cx, p.cz));
      if (!this.chunks.has(this.key(p.cx, p.cz))) {
        this.getChunk(p.cx, p.cz);
        budget--;
      }
    }

    // 卸载远处网格（保留方块数据，存档不丢）
    const keepR = (R + 1.5) * (R + 1.5);
    for (const [k, entry] of this.meshes) {
      const dist = (entry.cx - pcx) ** 2 + (entry.cz - pcz) ** 2;
      if (dist > keepR) this.disposeMesh(k);
    }
  }

  remeshDirty(px, pz, timeBudgetMs = 14) {
    if (this.dirty.size === 0) return;
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    const R = RENDER_DISTANCE;
    const list = [];
    for (const k of this.dirty) {
      const [cx, cz] = k.split(',').map(Number);
      const dist = (cx - pcx) ** 2 + (cz - pcz) ** 2;
      if (dist <= (R + 1) * (R + 1)) list.push({ k, cx, cz, dist });
    }
    list.sort((a, b) => a.dist - b.dist);

    const t0 = performance.now();
    let count = 0;
    for (const item of list) {
      if (count >= 3 || performance.now() - t0 > timeBudgetMs) break;
      this.dirty.delete(item.k);
      if (!this.chunks.has(item.k)) continue;
      count++;
      this.buildMesh(item.cx, item.cz);
    }
  }

  buildMesh(cx, cz) {
    const k = this.key(cx, cz);
    this.disposeMesh(k);
    const result = buildChunkGeometry(this, cx, cz);
    const entry = { cx, cz, opaque: null, water: null };
    if (result.opaque) {
      const m = new THREE.Mesh(result.opaque, this.opaqueMat);
      m.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.scene.add(m);
      entry.opaque = m;
    }
    if (result.water) {
      const m = new THREE.Mesh(result.water, this.waterMat);
      m.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.renderOrder = 1;
      this.scene.add(m);
      entry.water = m;
    }
    this.meshes.set(k, entry);
  }

  disposeMesh(k) {
    const entry = this.meshes.get(k);
    if (!entry) return;
    for (const key of ['opaque', 'water']) {
      const m = entry[key];
      if (m) {
        this.scene.remove(m);
        m.geometry.dispose();
      }
    }
    this.meshes.delete(k);
  }

  disposeAll() {
    for (const k of Array.from(this.meshes.keys())) this.disposeMesh(k);
    this.dirty.clear();
    this.queued.clear();
    this.pending.length = 0;
  }

  // ---------- 存档 ----------
  getModifiedEntries() {
    return Array.from(this.modified.entries());
  }

  setModifiedEntries(entries) {
    this.modified = new Map(entries);
    const dirtyChunks = new Set();
    for (const [key, id] of entries) {
      const p = key.split(',').map(Number);
      if (p.length !== 3 || !p.every(Number.isFinite)) continue;
      const [x, y, z] = p;
      if (y < 0 || y >= WORLD_HEIGHT) continue;
      const cx = Math.floor(x / CHUNK_SIZE);
      const cz = Math.floor(z / CHUNK_SIZE);
      const c = this.getChunk(cx, cz);
      c.data[IDX(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)] = id;
      dirtyChunks.add(this.key(cx, cz));
    }
    for (const k of dirtyChunks) this.dirty.add(k);
  }
}
