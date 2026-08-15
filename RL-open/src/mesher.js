// 区块网格构建：只生成可见面（背面剔除），按渲染类型分组。
// 分类：opaque（不透明）| cutout（树叶，带 alpha 裁剪）| glass | water
import * as THREE from 'three';
import { AIR, BLOCKS, tileUV } from './blocks.js';
import { CHUNK, HEIGHT } from './world.js';

// 6 个面：外法线、四角坐标（逆时针，面向外）、局部 UV 与明暗
const FACES = [
  { name: 'px', dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.80 },
  { name: 'nx', dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.80 },
  { name: 'py', dir: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 1.00 },
  { name: 'ny', dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.55 },
  { name: 'pz', dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.72 },
  { name: 'nz', dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.72 }
];

const isCullSolid = (id) => {
  const b = BLOCKS[id];
  return !!b && b.culls;
};

/** 决定 block 的某一面是否需要渲染 */
function shouldRenderFace(blockId, neighborId) {
  if (neighborId === AIR) return true;
  const block = BLOCKS[blockId];
  if (!block) return false;

  if (block.culls) {
    // 不透明块（含树叶）：邻居只要不是“遮挡型”块就画
    return !isCullSolid(neighborId);
  }
  // 透明块（水/玻璃）
  if (isCullSolid(neighborId)) return false;
  if (neighborId === AIR) return true;
  // 两种不同透明块相邻时只画 id 较大的一方，避免共面重叠
  return blockId > neighborId;
}

function makeGeometry(groups) {
  const { positions, normals, uvs, colors, indices } = groups;
  if (indices.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}

function createGroups() {
  return {
    positions: [], normals: [], uvs: [], colors: [], indices: []
  };
}

/** 构建一个区块的 4 组网格，返回 { opaque, cutout, glass, water } */
export function buildChunkGeometries(world, cx, cz) {
  const chunk = world.getChunk(cx, cz);
  const groups = {
    opaque: createGroups(),
    cutout: createGroups(),
    glass: createGroups(),
    water: createGroups()
  };

  const baseX = cx * CHUNK;
  const baseZ = cz * CHUNK;

  for (let y = 0; y < HEIGHT; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const i = x + z * CHUNK + y * CHUNK * CHUNK;
        const blockId = chunk.data[i];
        if (blockId === AIR) continue;
        const block = BLOCKS[blockId];
        if (!block) continue;

        const group = groups[block.render] || groups.opaque;
        const wx = baseX + x;
        const wz = baseZ + z;

        for (const face of FACES) {
          const nx = wx + face.dir[0];
          const ny = y + face.dir[1];
          const nz = wz + face.dir[2];
          const neighborId = world.getBlock(nx, ny, nz);
          if (!shouldRenderFace(blockId, neighborId)) continue;

          const tile = block.tex[face.name];
          const base = group.positions.length / 3;
          const [r, g, b] = [face.shade, face.shade, face.shade];

          for (let v = 0; v < 4; v++) {
            const [dx, dy, dz] = face.corners[v];
            group.positions.push(x + dx, y + dy, z + dz);
            group.normals.push(face.dir[0], face.dir[1], face.dir[2]);
            const [u, vv] = face.uv[v];
            const [au, av] = tileUV(tile, u, vv);
            group.uvs.push(au, av);
            group.colors.push(r, g, b);
          }
          group.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  const result = {};
  for (const name of ['opaque', 'cutout', 'glass', 'water']) {
    result[name] = makeGeometry(groups[name]);
  }
  return result;
}
