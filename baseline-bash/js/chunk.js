// 区块数据 + 可见面网格构建（面剔除 / 顶点 AO / 纹理图集 UV）
import * as THREE from '../vendor/three.module.js';
import {
  BLOCK,
  BLOCK_DEFS,
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  MAX_BLOCK_ID
} from './config.js';
import { ATLAS_SIZE, ATLAS_TILES } from './textures.js';

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z);
    this.mesh = null;
    this.dirty = true;
  }

  localIndex(x, y, z) {
    return x + z * CHUNK_SIZE_X + y * CHUNK_SIZE_X * CHUNK_SIZE_Z;
  }

  getLocal(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= CHUNK_SIZE_X || y >= CHUNK_SIZE_Y || z >= CHUNK_SIZE_Z) {
      return BLOCK.AIR;
    }
    return this.blocks[this.localIndex(x, y, z)];
  }

  setLocal(x, y, z, id) {
    if (x < 0 || y < 0 || z < 0 || x >= CHUNK_SIZE_X || y >= CHUNK_SIZE_Y || z >= CHUNK_SIZE_Z) {
      return;
    }
    this.blocks[this.localIndex(x, y, z)] = id;
  }
}

// 六个面的角点与法线（角点顺序保证三角形正面朝外）
const FACES = [
  { normal: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.68 },
  { normal: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.68 },
  { normal: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.55 },
  { normal: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.82 },
  { normal: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.82 }
];

const AO_BRIGHTNESS = [0.42, 0.62, 0.8, 1.0];

function isAoOpaque(id) {
  const def = BLOCK_DEFS[id];
  return !!def && def.cullOpaque;
}

/** 计算某个面角点的环境光遮蔽值（0-3） */
function cornerAO(world, x, y, z, faceIndex) {
  const face = FACES[faceIndex];
  const n = face.normal;
  const tangentAxes = [0, 1, 2].filter((a) => n[a] === 0);

  const aoValues = face.corners.map((c) => {
    const dirs = tangentAxes.map((a) => (c[a] === 0 ? -1 : 1));
    const side1 = [x + c[0], y + c[1], z + c[2]];
    const side2 = [x + c[0], y + c[1], z + c[2]];
    side1[tangentAxes[0]] += dirs[0];
    side2[tangentAxes[1]] += dirs[1];

    const s1 = isAoOpaque(world.getBlock(side1[0], side1[1], side1[2])) ? 1 : 0;
    const s2 = isAoOpaque(world.getBlock(side2[0], side2[1], side2[2])) ? 1 : 0;

    if (s1 && s2) return 0;
    const cornerPos = [x + c[0], y + c[1], z + c[2]];
    cornerPos[tangentAxes[0]] += dirs[0];
    cornerPos[tangentAxes[1]] += dirs[1];
    const cSolid = isAoOpaque(world.getBlock(cornerPos[0], cornerPos[1], cornerPos[2])) ? 1 : 0;
    return 3 - (s1 + s2 + cSolid);
  });

  return aoValues;
}

/** 图集内取 UV，并做半像素内缩防止边缘渗色 */
function tileUV(tile, u, v, out) {
  const cell = 1 / ATLAS_TILES;
  const inset = 0.5 / ATLAS_SIZE;
  const tu = (tile % ATLAS_TILES) * cell + inset + u * (cell - inset * 2);
  const tv = Math.floor(tile / ATLAS_TILES) * cell + inset + v * (cell - inset * 2);
  out[0] = tu;
  out[1] = tv;
}

function faceUVs(faceIndex, corner, uv) {
  if (faceIndex === 2) {
    // 顶面
    uv[0] = corner[0];
    uv[1] = 1 - corner[2];
  } else if (faceIndex === 3) {
    // 底面
    uv[0] = corner[0];
    uv[1] = corner[2];
  } else {
    const n = FACES[faceIndex].normal;
    const uAxis = n[0] === 0 ? 0 : 2;
    uv[0] = corner[uAxis];
    uv[1] = corner[1];
  }
}

/**
 * 为一个区块构建合并后的 BufferGeometry。
 * 每个方块类型一个 group，材质数组索引与方块 id - 1 对应。
 */
export function buildChunkGeometry(world, chunk) {
  const buckets = new Map();

  for (let y = 0; y < CHUNK_SIZE_Y; y++) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const id = chunk.getLocal(x, y, z);
        if (id === BLOCK.AIR) continue;
        const def = BLOCK_DEFS[id];
        if (!def) continue;

        const wx = chunk.cx * CHUNK_SIZE_X + x;
        const wy = y;
        const wz = chunk.cz * CHUNK_SIZE_Z + z;
        const isWater = id === BLOCK.WATER;

        for (let f = 0; f < FACES.length; f++) {
          const n = FACES[f].normal;
          const nid = world.getBlock(wx + n[0], wy + n[1], wz + n[2]);
          const neighborOpaque = isAoOpaque(nid);

          if (isWater) {
            if (nid === BLOCK.WATER || neighborOpaque) continue;
          } else if (neighborOpaque) {
            continue;
          }

          const tile = f === 2 ? def.top : f === 3 ? def.bottom : def.side;
          let bucket = buckets.get(id);
          if (!bucket) {
            bucket = { positions: [], normals: [], colors: [], uvs: [], indices: [] };
            buckets.set(id, bucket);
          }

          const ao = isWater ? [3, 3, 3, 3] : cornerAO(world, wx, wy, wz, f);
          const offset = bucket.positions.length / 3;
          const uv = [0, 0];

          for (let vi = 0; vi < 4; vi++) {
            const c = FACES[f].corners[vi];
            bucket.positions.push(wx + c[0], wy + c[1], wz + c[2]);
            bucket.normals.push(n[0], n[1], n[2]);
            const brightness = FACES[f].shade * AO_BRIGHTNESS[ao[vi]];
            bucket.colors.push(brightness, brightness, brightness);
            faceUVs(f, c, uv);
            const atlasUV = [0, 0];
            tileUV(tile, uv[0], uv[1], atlasUV);
            bucket.uvs.push(atlasUV[0], atlasUV[1]);
          }
          bucket.indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
        }
      }
    }
  }

  if (buckets.size === 0) return null;

  const positions = [];
  const normals = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const groups = [];

  for (const [id, bucket] of buckets) {
    const vertexOffset = positions.length / 3;
    const indexStart = indices.length;

    positions.push(...bucket.positions);
    normals.push(...bucket.normals);
    colors.push(...bucket.colors);
    uvs.push(...bucket.uvs);
    for (const idx of bucket.indices) indices.push(idx + vertexOffset);

    groups.push({
      start: indexStart,
      count: indices.length - indexStart,
      materialIndex: id - 1
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geometry.groups = groups;
  geometry.computeBoundingSphere();
  return geometry;
}

/** 构建材质数组：材质索引 = 方块 id - 1 */
export function createBlockMaterials(atlasTexture) {
  const materials = new Array(MAX_BLOCK_ID).fill(null);
  for (const [idStr, def] of Object.entries(BLOCK_DEFS)) {
    const id = Number(idStr);
    const isWater = id === BLOCK.WATER;
    materials[id - 1] = new THREE.MeshLambertMaterial({
      map: atlasTexture,
      color: 0xffffff,
      vertexColors: true,
      alphaTest: def.alphaTest ?? 0,
      transparent: def.transparent ?? isWater,
      opacity: def.opacity ?? 1,
      side: isWater ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: !(def.transparent ?? isWater)
    });
  }
  return materials;
}

export function disposeChunkMesh(chunk) {
  if (chunk.mesh) {
    chunk.mesh.removeFromParent();
    chunk.mesh.geometry.dispose();
    chunk.mesh = null;
  }
}
