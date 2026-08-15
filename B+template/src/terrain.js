// 程序化地形生成：丘陵、山脉、沙漠、海洋、洞穴、矿石、树木
import {
  CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL,
  AIR, GRASS, DIRT, STONE, SAND, LOG, LEAVES, WATER, BEDROCK, COAL_ORE, IRON_ORE,
} from './constants.js';
import { Simplex2, Simplex3, fbm2, fbm3, hash2i, smoothstep } from './noise.js';

let nContinent, nDetail, nMount, nTemp, nMoist, nCave, nOre;

export function initTerrain(seed) {
  nContinent = new Simplex2(seed);
  nDetail = new Simplex2(seed + 101);
  nMount = new Simplex2(seed + 202);
  nTemp = new Simplex2(seed + 303);
  nMoist = new Simplex2(seed + 404);
  nCave = new Simplex3(seed + 505);
  nOre = new Simplex3(seed + 606);
}

export function heightAt(wx, wz) {
  const c = fbm2(nContinent, wx * 0.006, wz * 0.006, 4);
  const d = fbm2(nDetail, wx * 0.02, wz * 0.02, 3);
  const m = fbm2(nMount, wx * 0.0045 + 99.7, wz * 0.0045 + 77.3, 3);
  const mask = smoothstep(0.16, 0.62, m * 0.5 + 0.5);
  const mountain = mask * Math.pow(Math.max(0, m * 0.5 + 0.5), 1.6) * 30;
  const h = Math.round(20 + c * 9 + d * 4 + mountain);
  return Math.max(3, Math.min(WORLD_HEIGHT - 9, h));
}

export function biomeAt(wx, wz) {
  const temp = fbm2(nTemp, wx * 0.004 + 1234.5, wz * 0.004, 3);
  const moist = fbm2(nMoist, wx * 0.005 + 555.1, wz * 0.005 + 222.2, 3);
  return {
    desert: temp > 0.3 && moist < 0.18,
    forest: moist > 0.12 && !(temp > 0.3 && moist < 0.18),
    temp,
    moist,
  };
}

function caveAt(wx, y, wz) {
  return fbm3(nCave, wx * 0.055, y * 0.075, wz * 0.055, 2);
}

function oreAt(wx, y, wz) {
  return fbm3(nOre, wx * 0.085, y * 0.095, wz * 0.085, 2);
}

function blockAt(wx, y, wz, h, sandy, topId) {
  if (y === 0) return BEDROCK;
  if (y === h) return topId;
  if (y >= h - 3) return sandy ? SAND : DIRT;
  // 洞穴：地表下留 2 层保护
  if (y > 1 && y < h - 2 && caveAt(wx, y, wz) > 0.61) return AIR;
  if (y < 22) {
    const o = oreAt(wx, y, wz);
    if (o > 0.56) return COAL_ORE;
    if (o < -0.56) return IRON_ORE;
  }
  return STONE;
}

export function generateTerrain(world, cx, cz) {
  const chunk = world.getChunk(cx, cz);
  const data = chunk.data;
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = baseX + lx;
      const wz = baseZ + lz;
      const h = heightAt(wx, wz);
      const bio = biomeAt(wx, wz);
      const sandy = bio.desert || h <= SEA_LEVEL + 1;
      const topId = bio.desert ? SAND : GRASS;

      for (let y = 0; y <= h; y++) {
        const i = (lx + lz * CHUNK_SIZE) * WORLD_HEIGHT + y;
        if (data[i] === AIR) data[i] = blockAt(wx, y, wz, h, sandy, topId);
      }
      // 水体
      if (h < SEA_LEVEL) {
        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          const i = (lx + lz * CHUNK_SIZE) * WORLD_HEIGHT + y;
          if (data[i] === AIR) data[i] = WATER;
        }
      }
    }
  }
  return chunk;
}

function setDeco(world, x, y, z, id) {
  if (y < 0 || y >= WORLD_HEIGHT) return;
  world.setBlockRaw(x, y, z, id);
}

function placeTree(world, x, z, h, rng) {
  const trunk = 4 + ((rng() * 3) | 0);
  const top = h + trunk;
  for (let dy = 0; dy < trunk; dy++) setDeco(world, x, h + 1 + dy, z, LOG);

  const baseY = h + trunk - 2;
  // 两层 3x3 树叶 + 两层收缩树叶 + 树梢
  for (let dy = 0; dy < 2; dy++) {
    const y = baseY + dy;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && hash2i(x + dx, z + dz, 7) < 0.5) continue;
        if (world.getBlock(x + dx, y, z + dz) === AIR) setDeco(world, x + dx, y, z + dz, LEAVES);
      }
    }
  }
  for (let dy = 2; dy < 3; dy++) {
    const y = baseY + dy;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (Math.abs(dx) === 1 && Math.abs(dz) === 1 && hash2i(x + dx, z + dz, 13) < 0.5) continue;
        if (world.getBlock(x + dx, y, z + dz) === AIR) setDeco(world, x + dx, y, z + dz, LEAVES);
      }
    }
  }
  setDeco(world, x, baseY + 3, z, LEAVES);
  setDeco(world, x, baseY + 4, z, LEAVES);
}

export function decorateChunk(world, cx, cz) {
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = baseX + lx;
      const wz = baseZ + lz;
      const h = heightAt(wx, wz);
      const topId = world.getBlock(wx, h, wz);
      if (topId !== GRASS) continue;
      const bio = biomeAt(wx, wz);
      const chance = bio.forest ? 0.02 : 0.0035;
      const r = hash2i(wx, wz, 31);
      if (r < chance && h < WORLD_HEIGHT - 12) {
        placeTree(world, wx, wz, h, () => hash2i(wx * 3 + r, wz * 5 + r, 91));
      }
    }
  }
}

// 找出生点：从高处向下扫描第一个实心方块
export function findSpawnHeight(world, x, z) {
  for (let y = WORLD_HEIGHT - 1; y > 0; y--) {
    const id = world.getBlock(x, y, z);
    if (id !== AIR && id !== WATER) return y;
  }
  return SEA_LEVEL;
}
