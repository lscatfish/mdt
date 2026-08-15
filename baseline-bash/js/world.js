// 世界：区块管理、地形生成、方块读写、体素射线检测
import * as THREE from '../vendor/three.module.js';
import {
  BLOCK,
  BLOCK_DEFS,
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  WORLD_HEIGHT,
  SEA_LEVEL,
  RENDER_DISTANCE
} from './config.js';
import { fbm2, fbm3, valueNoise2 } from './noise.js';
import { Chunk, buildChunkGeometry, createBlockMaterials, disposeChunkMesh } from './chunk.js';

/** 与区块生成完全一致的高度函数，用于快速查询地表 */
export function computeHeight(wx, wz, seed) {
  const continents = fbm2(wx * 0.004, wz * 0.004, 4, seed + 1);
  const hills = fbm2(wx * 0.02, wz * 0.02, 4, seed + 2);
  const detail = fbm2(wx * 0.06, wz * 0.06, 3, seed + 3);
  let h = 22 + (continents - 0.5) * 30 + (hills - 0.5) * 10 + (detail - 0.5) * 3;

  const mountains = fbm2(wx * 0.0016, wz * 0.0016, 4, seed + 4);
  if (mountains > 0.58) {
    const t = (mountains - 0.58) / 0.42;
    h += t * t * 52;
  }
  return Math.max(3, Math.min(WORLD_HEIGHT - 4, Math.floor(h)));
}

export class World {
  constructor(scene, seed, savedEdits = {}) {
    this.scene = scene;
    this.seed = seed;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.chunks = new Map();
    this.buildQueue = new Set();
    this.edits = new Map(Object.entries(savedEdits || {}).map(([k, v]) => [k, v]));
  }

  key(cx, cz) {
    return `${cx},${cz}`;
  }

  getChunk(cx, cz) {
    return this.chunks.get(this.key(cx, cz)) || null;
  }

  chunkFromWorld(wx, wz) {
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    return { cx, cz };
  }

  ensureChunk(cx, cz) {
    const key = this.key(cx, cz);
    if (this.chunks.has(key)) return this.chunks.get(key);

    const chunk = new Chunk(cx, cz);
    this.generateChunkData(chunk);
    this.applyEdits(chunk);
    this.chunks.set(key, chunk);

    // 新生成的区块会遮挡邻居边界上的旧面，需要重建已渲染的邻居
    for (const [nx, nz] of [
      [cx - 1, cz],
      [cx + 1, cz],
      [cx, cz - 1],
      [cx, cz + 1]
    ]) {
      const neighbor = this.getChunk(nx, nz);
      if (neighbor && neighbor.mesh && !neighbor.dirty) {
        neighbor.dirty = true;
        this.buildQueue.add(this.key(nx, nz));
      }
    }
    return chunk;
  }

  getBlock(wx, wy, wz) {
    if (wy < 0) return BLOCK.BEDROCK;
    if (wy >= WORLD_HEIGHT) return BLOCK.AIR;
    const { cx, cz } = this.chunkFromWorld(wx, wz);
    const chunk = this.ensureChunk(cx, cz);
    return chunk.getLocal(wx - cx * CHUNK_SIZE_X, wy, wz - cz * CHUNK_SIZE_Z);
  }

  isSolid(wx, wy, wz) {
    const def = BLOCK_DEFS[this.getBlock(wx, wy, wz)];
    return !!def && def.solid;
  }

  /** AABB 是否与任何实体方块相交 */
  isBoxBlocked(minX, minY, minZ, maxX, maxY, maxZ) {
    const x0 = Math.floor(minX);
    const x1 = Math.floor(maxX);
    const y0 = Math.floor(minY);
    const y1 = Math.floor(maxY);
    const z0 = Math.floor(minZ);
    const z1 = Math.floor(maxZ);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (this.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  generateChunkData(chunk) {
    const { cx, cz } = chunk;
    const baseX = cx * CHUNK_SIZE_X;
    const baseZ = cz * CHUNK_SIZE_Z;
    const heights = new Array(CHUNK_SIZE_Z);

    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      heights[lz] = new Array(CHUNK_SIZE_X);
      const wz = baseZ + lz;
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        const wx = baseX + lx;
        const h = computeHeight(wx, wz, this.seed);
        heights[lz][lx] = h;

        const sandy = h <= SEA_LEVEL + 1;
        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) {
            id = BLOCK.BEDROCK;
          } else if (y <= h - 4) {
            id = BLOCK.STONE;
          } else if (y < h) {
            id = sandy ? BLOCK.SAND : BLOCK.DIRT;
          } else {
            id = sandy ? BLOCK.SAND : BLOCK.GRASS;
          }
          chunk.setLocal(lx, y, lz, id);
        }
        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          chunk.setLocal(lx, y, lz, BLOCK.WATER);
        }
      }
    }

    // 洞穴（低于海平面的洞穴被水灌满，模拟含水洞穴）
    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        const h = heights[lz][lx];
        if (h < 6) continue;
        for (let y = 3; y <= h - 2; y++) {
          if (this.shouldCarve(baseX + lx, y, baseZ + lz)) {
            chunk.setLocal(lx, y, lz, y <= SEA_LEVEL ? BLOCK.WATER : BLOCK.AIR);
          }
        }
      }
    }

    // 矿脉
    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        const h = heights[lz][lx];
        if (h < 6) continue;
        for (let y = 2; y <= h - 3; y++) {
          if (chunk.getLocal(lx, y, lz) !== BLOCK.STONE) continue;
          const wx = baseX + lx;
          const wz = baseZ + lz;
          const coal = fbm3(wx * 0.11 + 50, y * 0.11, wz * 0.11, 3, this.seed + 701);
          if (coal > 0.8) {
            chunk.setLocal(lx, y, lz, BLOCK.COAL_ORE);
            continue;
          }
          const iron = fbm3(wx * 0.12 - 20, y * 0.12, wz * 0.12 + 30, 3, this.seed + 811);
          if (iron > 0.84) {
            chunk.setLocal(lx, y, lz, BLOCK.IRON_ORE);
          }
        }
      }
    }

    // 树木（限制在区块内 2 格边缘，避免叶子跨界）
    for (let lz = 2; lz <= CHUNK_SIZE_Z - 3; lz++) {
      for (let lx = 2; lx <= CHUNK_SIZE_X - 3; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const h = heights[lz][lx];
        if (h <= SEA_LEVEL + 2 || h > WORLD_HEIGHT - 9) continue;
        if (chunk.getLocal(lx, h, lz) !== BLOCK.GRASS) continue;

        const forest = fbm2(wx * 0.028, wz * 0.028, 3, this.seed + 901);
        const chance = valueNoise2(wx * 17.3, wz * 17.3, this.seed + 997);
        if (forest < 0.55 || chance > 0.035) continue;

        const trunkH = 4 + Math.floor(valueNoise2(wx * 3.7, wz * 3.7, this.seed + 1009) * 3); // 4-6
        const top = h + trunkH;
        for (let y = h + 1; y <= top; y++) chunk.setLocal(lx, y, lz, BLOCK.LOG);

        for (let dy = -2; dy <= 1; dy++) {
          const ly = top + dy;
          if (ly < 0 || ly >= WORLD_HEIGHT) continue;
          const radius = dy === -2 || dy === 1 ? 1 : 2;
          for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
              if (dx === 0 && dz === 0 && dy < 0) continue; // 树干位置保留
              if (radius === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) {
                if (valueNoise2(wx + dx, wz + dz, this.seed + 1103) > 0.5) continue;
              }
              const tx = lx + dx;
              const tz = lz + dz;
              if (tx < 0 || tz < 0 || tx >= CHUNK_SIZE_X || tz >= CHUNK_SIZE_Z) continue;
              if (chunk.getLocal(tx, ly, tz) === BLOCK.AIR) {
                chunk.setLocal(tx, ly, tz, BLOCK.LEAVES);
              }
            }
          }
        }
      }
    }
  }

  shouldCarve(wx, wy, wz) {
    const c1 = fbm3(wx * 0.09, wy * 0.14, wz * 0.09, 3, this.seed + 501);
    const c2 = fbm3(wx * 0.2, wy * 0.3, wz * 0.2, 2, this.seed + 607);
    return c1 + c2 > 1.32;
  }

  applyEdits(chunk) {
    for (const [key, id] of this.edits) {
      const parts = key.split(',');
      if (parts.length !== 3) continue;
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      const z = Number(parts[2]);
      if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) continue;
      const { cx, cz } = this.chunkFromWorld(x, z);
      if (cx !== chunk.cx || cz !== chunk.cz) continue;
      chunk.setLocal(x - cx * CHUNK_SIZE_X, y, z - cz * CHUNK_SIZE_Z, id);
    }
  }

  markDirty(cx, cz) {
    const key = this.key(cx, cz);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return;
    chunk.dirty = true;
    this.buildQueue.add(key);
  }

  /** 写入方块；recordEdit 为 true 时记录到存档 */
  setBlock(wx, wy, wz, id, { recordEdit = false } = {}) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return false;
    const { cx, cz } = this.chunkFromWorld(wx, wz);
    const chunk = this.ensureChunk(cx, cz);
    const lx = wx - cx * CHUNK_SIZE_X;
    const lz = wz - cz * CHUNK_SIZE_Z;

    if (recordEdit) {
      const key = `${wx},${wy},${wz}`;
      if (id === BLOCK.AIR) this.edits.set(key, BLOCK.AIR);
      else this.edits.set(key, id);
    }

    chunk.setLocal(lx, wy, lz, id);
    this.markDirty(cx, cz);

    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE_X - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE_Z - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  /** 以玩家为中心维护已加载区块，并处理重建队列 */
  update(playerX, playerZ, buildBudget = 2) {
    const { cx: pcx, cz: pcz } = this.chunkFromWorld(playerX, playerZ);
    const radius = RENDER_DISTANCE;

    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const chunk = this.ensureChunk(cx, cz);
        if (!chunk.mesh && !this.buildQueue.has(this.key(cx, cz))) {
          chunk.dirty = true;
          this.buildQueue.add(this.key(cx, cz));
        }
      }
    }

    // 卸载远处的区块
    for (const [key, chunk] of this.chunks) {
      const dist = Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz));
      if (dist > radius + 2) {
        disposeChunkMesh(chunk);
        chunk.mesh = null;
        this.chunks.delete(key);
        this.buildQueue.delete(key);
      }
    }

    if (this.buildQueue.size > 0) {
      const sorted = [...this.buildQueue].sort((a, b) => {
        const [ax, az] = a.split(',').map(Number);
        const [bx, bz] = b.split(',').map(Number);
        return (
          (ax - pcx) ** 2 + (az - pcz) ** 2 - ((bx - pcx) ** 2 + (bz - pcz) ** 2)
        );
      });

      let built = 0;
      for (const key of sorted) {
        if (built >= buildBudget) break;
        const [cx, cz] = key.split(',').map(Number);
        const chunk = this.getChunk(cx, cz);
        if (!chunk) continue;
        this.buildQueue.delete(key);
        if (!chunk.dirty) continue;
        this.buildChunk(chunk);
        built++;
      }
    }
  }

  buildChunk(chunk) {
    disposeChunkMesh(chunk);
    const geometry = buildChunkGeometry(this, chunk);
    chunk.dirty = false;
    if (!geometry) return;

    if (!this.materials) {
      throw new Error('World.buildChunk: materials not set');
    }
    const mesh = new THREE.Mesh(geometry, this.materials);
    mesh.matrixAutoUpdate = false;
    mesh.position.set(chunk.cx * CHUNK_SIZE_X, 0, chunk.cz * CHUNK_SIZE_Z);
    mesh.updateMatrix();
    this.group.add(mesh);
    chunk.mesh = mesh;
  }

  setMaterials(materials) {
    this.materials = materials;
  }

  /** 从世界顶端向下找第一个非水实体方块 */
  findTopSolidY(wx, wz) {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const id = this.getBlock(wx, y, wz);
      if (id !== BLOCK.AIR && id !== BLOCK.WATER && BLOCK_DEFS[id]?.solid) {
        return y + 1;
      }
    }
    return 1;
  }

  findSpawnPosition() {
    for (let r = 0; r <= 400; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const wx = 8 + dx;
          const wz = 8 + dz;
          const h = computeHeight(wx, wz, this.seed);
          if (h <= SEA_LEVEL + 2 || h > 70) continue;
          const top = this.findTopSolidY(wx, wz);
          if (top === h + 1 || top > SEA_LEVEL + 1) {
            return { x: wx + 0.5, y: top + 0.1, z: wz + 0.5 };
          }
        }
      }
    }
    const fallbackY = this.findTopSolidY(8, 8);
    return { x: 8.5, y: fallbackY + 0.1, z: 8.5 };
  }

  /**
   * Amanatides & Woo 体素射线遍历。
   * 返回首个命中实体方块的坐标与命中面法线。
   */
  raycast(origin, direction, maxDistance = 7) {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    const stepX = direction.x > 0 ? 1 : -1;
    const stepY = direction.y > 0 ? 1 : -1;
    const stepZ = direction.z > 0 ? 1 : -1;

    const tDeltaX = direction.x !== 0 ? Math.abs(1 / direction.x) : Infinity;
    const tDeltaY = direction.y !== 0 ? Math.abs(1 / direction.y) : Infinity;
    const tDeltaZ = direction.z !== 0 ? Math.abs(1 / direction.z) : Infinity;

    let tMaxX = direction.x > 0 ? (x + 1 - origin.x) * tDeltaX : direction.x < 0 ? (origin.x - x) * tDeltaX : Infinity;
    let tMaxY = direction.y > 0 ? (y + 1 - origin.y) * tDeltaY : direction.y < 0 ? (origin.y - y) * tDeltaY : Infinity;
    let tMaxZ = direction.z > 0 ? (z + 1 - origin.z) * tDeltaZ : direction.z < 0 ? (origin.z - z) * tDeltaZ : Infinity;

    let face = [0, 0, 0];
    let t = 0;
    const maxSteps = 128;

    for (let i = 0; i < maxSteps; i++) {
      const id = this.getBlock(x, y, z);
      const def = BLOCK_DEFS[id];
      if (def?.solid) {
        return { x, y, z, normal: [...face], blockId: id, distance: t };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        face = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        face = [0, -stepY, 0];
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        face = [0, 0, -stepZ];
      }
      if (t > maxDistance) break;
    }
    return null;
  }

  toSaveData() {
    return { seed: this.seed, edits: Object.fromEntries(this.edits) };
  }

  dispose() {
    for (const [, chunk] of this.chunks) disposeChunkMesh(chunk);
    this.scene.remove(this.group);
  }
}
