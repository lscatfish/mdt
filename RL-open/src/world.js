// 体素世界：区块存储、程序化地形生成、方块读写与存档数据。
import { Noise } from './noise.js';
import { AIR, B, BLOCKS } from './blocks.js';

export const CHUNK = 16;
export const HEIGHT = 64;
export const WATER_LEVEL = 19;

const idx = (x, y, z) => x + z * CHUNK + y * CHUNK * CHUNK;
const key = (x, z) => `${x},${z}`;

export class World {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.noise = new Noise(this.seed);
    this.chunks = new Map();
    this.changes = new Map(); // "x,y,z" -> blockId（玩家修改）
    this.onChange = null;
  }

  /** 地表高度（只计算地形函数，不生成区块） */
  heightAt(x, z) {
    const n = this.noise;
    const continent = n.fbm2(x * 0.0033, z * 0.0033, 4);
    const hills = n.fbm2(x * 0.016, z * 0.016, 3) * 0.5;
    const detail = n.fbm2(x * 0.05, z * 0.05, 2) * 0.16;

    let h = 24 + continent * 13 + hills * 9 + detail * 3;

    // 少量陡峭山峰
    const ridge = 1 - Math.abs(n.fbm2(x * 0.0021, z * 0.0021, 2));
    if (ridge > 0.78) h += (ridge - 0.78) * 85;

    h = Math.floor(h);
    return Math.max(4, Math.min(HEIGHT - 3, h));
  }

  getChunk(cx, cz) {
    const k = key(cx, cz);
    let chunk = this.chunks.get(k);
    if (!chunk) {
      chunk = this.generateChunk(cx, cz);
      this.chunks.set(k, chunk);
    }
    return chunk;
  }

  generateChunk(cx, cz) {
    const data = new Uint8Array(CHUNK * HEIGHT * CHUNK);
    const surface = new Int16Array(CHUNK * CHUNK).fill(-1);

    for (let lz = 0; lz < CHUNK; lz++) {
      const wz = cz * CHUNK + lz;
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = cx * CHUNK + lx;
        const h = this.heightAt(wx, wz);

        // 1) 固体填充
        for (let y = 0; y <= h; y++) {
          data[idx(lx, y, lz)] = y === 0 ? B.BEDROCK : B.STONE;
        }

        // 2) 洞穴侵蚀（保留地表两层）
        for (let y = 3; y < h - 1; y++) {
          const cave = this.noise.fbm3(wx * 0.055, y * 0.09, wz * 0.055, 2);
          const worm = this.noise.noise3(wx * 0.11, y * 0.2, wz * 0.11);
          if (cave > 0.56 && worm > -0.45) {
            data[idx(lx, y, lz)] = AIR;
          }
        }

        // 3) 地表装饰：草地/沙滩 + 表层泥土
        const top = h;
        const above = top + 1;
        if (above <= WATER_LEVEL + 1) {
          data[idx(lx, top, lz)] = B.SAND;
        } else {
          data[idx(lx, top, lz)] = B.GRASS;
        }
        for (let y = top - 1; y >= top - 3 && y >= 1; y--) {
          if (data[idx(lx, y, lz)] !== AIR) data[idx(lx, y, lz)] = B.DIRT;
        }

        // 4) 海平面以下填水，以上为空气
        for (let y = top + 1; y < HEIGHT; y++) {
          data[idx(lx, y, lz)] = y <= WATER_LEVEL ? B.WATER : AIR;
        }

        surface[lx + lz * CHUNK] = top;
      }
    }

    // 5) 树木（留 2 格边距，避免跨区块写入）
    for (let lz = 2; lz <= CHUNK - 3; lz++) {
      const wz = cz * CHUNK + lz;
      for (let lx = 2; lx <= CHUNK - 3; lx++) {
        const wx = cx * CHUNK + lx;
        const top = surface[lx + lz * CHUNK];
        if (top < 0) continue;
        if (data[idx(lx, top, lz)] !== B.GRASS) continue;
        if (this.noise.hash01(wx, wz, this.seed) >= 0.016) continue;

        const treeH = 4 + Math.floor(this.noise.hash01(wx, wz, this.seed + 1) * 3); // 4~6
        const leafBase = top + treeH - 2;
        if (leafBase + 2 >= HEIGHT - 2) continue;

        for (let y = top + 1; y <= top + treeH; y++) {
          data[idx(lx, y, lz)] = B.LOG;
        }
        for (let ly = leafBase; ly <= leafBase + 2; ly++) {
          const radius = ly === leafBase + 2 ? 1 : 2;
          for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
              if (Math.abs(dx) === radius && Math.abs(dz) === radius) continue; // 去角
              const i = idx(lx + dx, ly, lz + dz);
              if (data[i] === AIR) data[i] = B.LEAVES;
            }
          }
        }
      }
    }

    return { cx, cz, data, dirty: false };
  }

  /** 读取方块；y<0 视为基岩，y>=HEIGHT 视为空气 */
  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return AIR;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const lx = x - cx * CHUNK;
    const lz = z - cz * CHUNK;
    return this.getChunk(cx, cz).data[idx(lx, y, lz)];
  }

  /** 写入方块（玩家操作入口）。返回是否发生变化。 */
  setBlock(x, y, z, id) {
    if (y < 0 || y >= HEIGHT) return false;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const lx = x - cx * CHUNK;
    const lz = z - cz * CHUNK;
    const chunk = this.getChunk(cx, cz);
    const i = idx(lx, y, lz);
    if (chunk.data[i] === id) return false;

    chunk.data[i] = id;
    chunk.dirty = true;
    this.changes.set(`${x},${y},${z}`, id);

    // 边界方块需要刷新相邻区块
    if (lx === 0) this.getChunk(cx - 1, cz).dirty = true;
    if (lx === CHUNK - 1) this.getChunk(cx + 1, cz).dirty = true;
    if (lz === 0) this.getChunk(cx, cz - 1).dirty = true;
    if (lz === CHUNK - 1) this.getChunk(cx, cz + 1).dirty = true;

    if (this.onChange) this.onChange();
    return true;
  }

  isSolid(x, y, z) {
    const block = BLOCKS[this.getBlock(x, y, z)];
    return !!block && block.solid;
  }

  /** 在出生点附近寻找“上方是空气的实心方块”作为落脚点，返回脚部高度 */
  findSpawnHeight() {
    // 先按高度函数快速搜索陆地，避免为搜索而生成大片海洋区块
    for (let r = 0; r <= 200; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = 8 + dx;
          const z = 8 + dz;
          const h = this.heightAt(x, z);
          if (h < WATER_LEVEL) continue; // 地表在水下
          const top = this.getBlock(x, h, z);
          const block = BLOCKS[top];
          if (block && block.solid && top !== B.LEAVES && this.getBlock(x, h + 1, z) === AIR) {
            this.spawnX = x;
            this.spawnZ = z;
            return h + 1;
          }
        }
      }
    }

    // 附近全是海：退而求其次，找任何一列实心块上方是空气的位置
    for (let r = 0; r <= 16; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = 8 + dx;
          const z = 8 + dz;
          for (let y = HEIGHT - 2; y >= 1; y--) {
            const id = this.getBlock(x, y, z);
            const block = BLOCKS[id];
            if (block && block.solid && id !== B.LEAVES) {
              if (this.getBlock(x, y + 1, z) === AIR) {
                this.spawnX = x;
                this.spawnZ = z;
                return y + 1;
              }
              break;
            }
          }
        }
      }
    }
    return this.heightAt(8, 8) + 2;
  }

  serializeChanges() {
    const out = [];
    for (const [k, id] of this.changes) {
      const [x, y, z] = k.split(',').map(Number);
      out.push([x, y, z, id]);
    }
    return out;
  }

  applyChanges(list) {
    for (const [x, y, z, id] of list) {
      if (Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && id >= 0 && id < BLOCKS.length) {
        this.setBlock(x, y, z, id);
      }
    }
  }
}
