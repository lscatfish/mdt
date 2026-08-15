// 区块网格构建：只生成暴露在空气中的面，逐顶点环境光遮蔽（AO）+ 面朝向明暗。
// 不透明方块与半透明方块（树叶/玻璃/水）分开输出为两个 BufferGeometry。
import * as THREE from '/vendor/three.module.js';
import { BY_ID, IDs, textureName, isOpaque } from './blocks.js';
import { tileUV, ATLAS_TEXTURE } from './textures.js';
import { CHUNK, WORLD_H } from './world.js';

// 面定义：normal、四个角（相对方块）、四角 uv、四角的 AO 三邻居偏移（s1, s2, c = s1+s2）
// 三角形：(0,1,2) (0,2,3)，绕序为从面外侧看逆时针。
const FACES = [
  { // +X
    normal: [1, 0, 0], shade: 0.8,
    corners: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
    ao: [
      [[0, 1, 0], [0, 0, 1], [0, 1, 1]],
      [[0, 1, 0], [0, 0, -1], [0, 1, -1]],
      [[0, -1, 0], [0, 0, -1], [0, -1, -1]],
      [[0, -1, 0], [0, 0, 1], [0, -1, 1]],
    ],
  },
  { // -X
    normal: [-1, 0, 0], shade: 0.8,
    corners: [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
    ao: [
      [[0, 1, 0], [0, 0, -1], [0, 1, -1]],
      [[0, 1, 0], [0, 0, 1], [0, 1, 1]],
      [[0, -1, 0], [0, 0, 1], [0, -1, 1]],
      [[0, -1, 0], [0, 0, -1], [0, -1, -1]],
    ],
  },
  { // +Y
    normal: [0, 1, 0], shade: 1.0,
    corners: [[1, 1, 1], [0, 1, 1], [0, 1, 0], [1, 1, 0]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
    ao: [
      [[-1, 0, 0], [0, 0, -1], [-1, 0, -1]],
      [[1, 0, 0], [0, 0, -1], [1, 0, -1]],
      [[1, 0, 0], [0, 0, 1], [1, 0, 1]],
      [[-1, 0, 0], [0, 0, 1], [-1, 0, 1]],
    ],
  },
  { // -Y
    normal: [0, -1, 0], shade: 0.45,
    corners: [[1, 0, 0], [0, 0, 0], [0, 0, 1], [1, 0, 1]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
    ao: [
      [[-1, 0, 0], [0, 0, 1], [-1, 0, 1]],
      [[1, 0, 0], [0, 0, 1], [1, 0, 1]],
      [[1, 0, 0], [0, 0, -1], [1, 0, -1]],
      [[-1, 0, 0], [0, 0, -1], [-1, 0, -1]],
    ],
  },
  { // +Z
    normal: [0, 0, 1], shade: 0.72,
    corners: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
    ao: [
      [[-1, 0, 0], [0, 1, 0], [-1, 1, 0]],
      [[1, 0, 0], [0, 1, 0], [1, 1, 0]],
      [[1, 0, 0], [0, -1, 0], [1, -1, 0]],
      [[-1, 0, 0], [0, -1, 0], [-1, -1, 0]],
    ],
  },
  { // -Z
    normal: [0, 0, -1], shade: 0.72,
    corners: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
    ao: [
      [[1, 0, 0], [0, 1, 0], [1, 1, 0]],
      [[-1, 0, 0], [0, 1, 0], [-1, 1, 0]],
      [[-1, 0, 0], [0, -1, 0], [-1, -1, 0]],
      [[1, 0, 0], [0, -1, 0], [1, -1, 0]],
    ],
  },
];

class GeoBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.indices = [];
    this.count = 0;
  }

  addFace(bx, by, bz, face, block, world) {
    const [nx, ny, nz] = face.normal;
    const [u0, u1] = tileUV(textureName(block, face.index));
    const tint = block.tint || [1, 1, 1];
    const base = this.count;

    for (let k = 0; k < 4; k++) {
      const [ox, oy, oz] = face.corners[k];
      const wx = bx + ox, wy = by + oy, wz = bz + oz;
      this.positions.push(wx, wy, wz);
      this.normals.push(nx, ny, nz);
      const [uu, vv] = face.uv[k];
      this.uvs.push(u0 + (u1 - u0) * uu, vv);

      // 顶点 AO
      let light = face.shade;
      const [[s1x, s1y, s1z], [s2x, s2y, s2z], [cx2, cy2, cz2]] = face.ao[k];
      const b1 = world.getBlock(wx + s1x, wy + s1y, wz + s1z);
      const b2 = world.getBlock(wx + s2x, wy + s2y, wz + s2z);
      if (isOpaque(b1) && isOpaque(b2)) {
        const bc = world.getBlock(wx + cx2, wy + cy2, wz + cz2);
        const ao = 3 - (isOpaque(bc) ? 1 : 0) - 2;
        light *= 0.65 + 0.35 * (ao / 3);
      }
      this.colors.push(light * tint[0], light * tint[1], light * tint[2]);
    }

    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.count += 4;
  }

  build() {
    if (!this.count) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    return g;
  }
}

export function buildChunkGeometry(chunk, world) {
  const { data, cx, cz } = chunk;
  const solid = new GeoBuilder();
  const trans = new GeoBuilder();

  for (let y = 0; y < WORLD_H; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const id = data[(y * CHUNK + z) * CHUNK + x];
        if (!id) continue;
        const block = BY_ID[id];
        const builder = block.transparent ? trans : solid;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const lx = x + face.normal[0];
          const ly = y + face.normal[1];
          const lz = z + face.normal[2];
          let nid;
          if (ly < 0 || ly >= WORLD_H) {
            nid = ly < 0 ? IDs.BEDROCK : IDs.AIR;
          } else if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK) {
            nid = world.getBlock(cx * CHUNK + lx, ly, cz * CHUNK + lz);
          } else {
            nid = data[(ly * CHUNK + lz) * CHUNK + lx];
          }
          if (isOpaque(nid)) continue;
          if (block.transparent && nid === id) continue; // 同类半透明方块之间不画面
          face.index = f;
          builder.addFace(x, y, z, face, block, world);
        }
      }
    }
  }

  return { solid: solid.build(), trans: trans.build() };
}

// 共享材质（所有区块复用）；微弱自发光防止阴影面全黑
export const MAT_OPAQUE = new THREE.MeshLambertMaterial({
  map: ATLAS_TEXTURE,
  vertexColors: true,
  emissive: 0x141414,
});
export const MAT_TRANS = new THREE.MeshLambertMaterial({
  map: ATLAS_TEXTURE,
  vertexColors: true,
  transparent: true,
  alphaTest: 0.15,
  depthWrite: false,
  emissive: 0x141414,
});
