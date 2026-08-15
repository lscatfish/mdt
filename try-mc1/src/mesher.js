// 区块网格构建：对每个体素做 6 方向面剔除，按 tile UV 生成 BufferGeometry。
// 不透明面（含 alphaTest 镂空的树叶/玻璃）与水面分属两个几何体。
import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT, BLOCK, BLOCK_DEFS, isOpaque } from './config.js';
import { tileUV } from './textures.js';

// 每个面 4 个角（逆时针，法线 = (B-A)x(C-A)），含基础光照强度
const FACES = [
  { dir: [1, 0, 0], shade: 0.68, corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { dir: [-1, 0, 0], shade: 0.68, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dir: [0, 1, 0], shade: 1.0, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], shade: 0.5, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], shade: 0.82, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], shade: 0.6, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }
];

function faceVisible(id, nid) {
  if (id === BLOCK.WATER) return nid === BLOCK.AIR;      // 水面/水边只朝空气
  if (id === BLOCK.GLASS) return nid === BLOCK.AIR || nid === BLOCK.WATER;
  return !isOpaque(nid); // 普通方块：邻居不透明才剔除
}

// 快速确定性哈希，用于轻微随机色调，打破重复感
function tintHash(x, y, z, f) {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ Math.imul(f + 1, 40503)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return 0.92 + 0.16 * (((h ^ (h >>> 16)) >>> 0) / 4294967296);
}

function pushFace(a, x, y, z, face, tile, shade) {
  const [u0, v0, u1, v1] = tileUV(tile);
  const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  for (let i = 0; i < 4; i++) {
    const c = face.corners[i];
    a.pos.push(x + c[0], y + c[1], z + c[2]);
    a.nor.push(face.dir[0], face.dir[1], face.dir[2]);
    a.col.push(shade, shade, shade);
    a.uv.push(uvs[i][0], uvs[i][1]);
  }
}

function makeGeometry(a) {
  if (a.pos.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(a.pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(a.nor), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(a.col), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(a.uv), 2));
  g.computeBoundingSphere();
  return g;
}

export function buildChunkGeometry(world, cx, cz) {
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;
  const opaque = { pos: [], nor: [], col: [], uv: [] };
  const translucent = { pos: [], nor: [], col: [], uv: [] };

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x;
        const wz = baseZ + z;
        const id = world.getBlock(wx, y, wz);
        if (id === BLOCK.AIR) continue;
        const def = BLOCK_DEFS[id];

        for (let fi = 0; fi < FACES.length; fi++) {
          const face = FACES[fi];
          const nid = world.getBlock(wx + face.dir[0], y + face.dir[1], wz + face.dir[2]);
          if (!faceVisible(id, nid)) continue;
          const tile = face.dir[1] === 1 ? def.tile.top : face.dir[1] === -1 ? def.tile.bottom : def.tile.side;
          const target = id === BLOCK.WATER ? translucent : opaque;
          pushFace(target, x, y, z, face, tile, face.shade * tintHash(wx, y, wz, fi));
        }
      }
    }
  }

  return { opaque: makeGeometry(opaque), water: makeGeometry(translucent) };
}
