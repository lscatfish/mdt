import * as THREE from "../vendor/three.module.js";
import { CFG } from "./config.js";
import {
  AIR, WATER, GLASS, LEAVES,
  isOpaque, tileFor,
} from "./blocks.js";

const SX = CFG.CHUNK_SIZE;
const SY = CFG.CHUNK_HEIGHT;

// 六个面:角点(单位立方体 0..1)、UV 顺序、亮度
// uvOrder: BL=(u0,v0) TL=(u0,v1) TR=(u1,v1) BR=(u1,v0)
// 值是 uvPair 数组中的下标
const UV_BY_ORDER = {
  BL: 0,
  TL: 1,
  TR: 2,
  BR: 3,
};

const FACES = [
  {
    normal: [1, 0, 0],
    corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
    uvOrder: ["BL", "BR", "TR", "TL"],
    brightness: 0.62,
    u: [0, 0, -1],
    v: [0, 1, 0],
  },
  {
    normal: [-1, 0, 0],
    corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
    uvOrder: ["BL", "BR", "TR", "TL"],
    brightness: 0.62,
    u: [0, 0, 1],
    v: [0, 1, 0],
  },
  {
    normal: [0, 1, 0],
    corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
    uvOrder: ["BL", "TL", "TR", "BR"],
    brightness: 1.0,
    u: [0, 0, 1],
    v: [1, 0, 0],
  },
  {
    normal: [0, -1, 0],
    corners: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]],
    uvOrder: ["BL", "BR", "TR", "TL"],
    brightness: 0.5,
    u: [1, 0, 0],
    v: [0, 0, 1],
  },
  {
    normal: [0, 0, 1],
    corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
    uvOrder: ["BL", "BR", "TR", "TL"],
    brightness: 0.8,
    u: [1, 0, 0],
    v: [0, 1, 0],
  },
  {
    normal: [0, 0, -1],
    corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
    uvOrder: ["BL", "TL", "TR", "BR"],
    brightness: 0.8,
    u: [0, 1, 0],
    v: [1, 0, 0],
  },
];

function shouldDrawFace(block, neighbor, faceNormal) {
  if (block === WATER) {
    // 水面朝上;侧面/底面只在邻接透明方块时绘制
    if (faceNormal[1] > 0) return neighbor !== WATER;
    return neighbor === AIR || neighbor === GLASS || neighbor === LEAVES;
  }
  if (block === LEAVES) {
    return neighbor === AIR || neighbor === WATER || neighbor === GLASS;
  }
  if (block === GLASS) {
    return neighbor !== GLASS;
  }
  // 普通不透明方块:邻居透明就补面
  return !isOpaque(neighbor);
}

export class ChunkMesher {
  constructor(world, atlas) {
    this.world = world;
    this.tileUV = atlas.tileUV;
  }

  build(cx, cz) {
    const chunk = this.world.getChunk(cx, cz);
    if (!chunk) return null;

    const solid = { positions: [], normals: [], uvs: [], colors: [] };
    const leaves = { positions: [], normals: [], uvs: [], colors: [] };
    const glass = { positions: [], normals: [], uvs: [], colors: [] };
    const water = { positions: [], normals: [], uvs: [], colors: [] };
    const data = chunk.data;

    for (let y = 0; y < SY; y++) {
      for (let z = 0; z < SX; z++) {
        for (let x = 0; x < SX; x++) {
          const block = data[(y * SX + z) * SX + x];
          if (block === AIR) continue;

          let target = solid;
          if (block === LEAVES) target = leaves;
          else if (block === GLASS) target = glass;
          else if (block === WATER) target = water;

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const n = face.normal;
            const neighbor = this.world.getBlock(x + n[0], y + n[1], z + n[2]);
            if (!shouldDrawFace(block, neighbor, n)) continue;

            const tile = tileFor(block, n[1] > 0 ? "top" : n[1] < 0 ? "bottom" : "side");
            const useAO = block !== GLASS && block !== WATER;
            const ao = useAO
              ? [0, 1, 2, 3].map((i) => this.computeAO(face, face.corners[i], x, y, z))
              : null;

            this.emitQuad(target, face, x, y, z, tile, ao, block === WATER);
          }
        }
      }
    }

    return {
      solid: makeGeometry(solid),
      leaves: makeGeometry(leaves),
      glass: makeGeometry(glass),
      water: makeGeometry(water),
    };
  }

  emitQuad(target, face, x, y, z, tile, ao, isWater) {
    const [u0, v0, u1, v1] = this.tileUV(tile);
    const uvPair = [
      [u0, v0], // BL
      [u0, v1], // TL
      [u1, v1], // TR
      [u1, v0], // BR
    ];

    for (let i = 0; i < 4; i++) {
      let [ox, oy, oz] = face.corners[i];
      if (isWater) {
        if (face.normal[1] > 0) oy -= 0.12;
        else if (face.normal[1] === 0 && oy === 1) oy -= 0.12;
      }
      target.positions.push(x + ox, y + oy, z + oz);
      target.normals.push(face.normal[0], face.normal[1], face.normal[2]);

      const uv = uvPair[UV_BY_ORDER[face.uvOrder[i]]];
      target.uvs.push(uv[0], uv[1]);

      let light = face.brightness;
      if (ao) {
        const level = ao[i];
        light *= 0.5 + (level / 3) * 0.5;
      }
      target.colors.push(light, light, light);
    }
  }

  // 顶点环境光遮蔽(0-3),基于该角两侧与对角邻居的遮挡
  computeAO(face, corner, x, y, z) {
    const e1 = this.edgeVec(face.u, corner);
    const e2 = this.edgeVec(face.v, corner);
    const n = face.normal;
    const s1 = isOpaque(this.world.getBlock(x + n[0] + e1[0], y + n[1] + e1[1], z + n[2] + e1[2]));
    const s2 = isOpaque(this.world.getBlock(x + n[0] + e2[0], y + n[1] + e2[1], z + n[2] + e2[2]));
    const sc = isOpaque(this.world.getBlock(x + n[0] + e1[0] + e2[0], y + n[1] + e1[1] + e2[1], z + n[2] + e1[2] + e2[2]));
    if (s1 && s2) return 0;
    return 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (sc ? 1 : 0));
  }

  edgeVec(axis, corner) {
    const e = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      if (axis[i] !== 0) {
        e[i] = axis[i] * (corner[i] === 0 ? 1 : -1);
      }
    }
    return e;
  }
}

function makeGeometry(bucket) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bucket.positions), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(bucket.normals), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(bucket.uvs), 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(bucket.colors), 3));
  return geometry;
}

// 管理每个区块在场景中的四层网格(实心 / 树叶 / 玻璃 / 水)
export class ChunkRenderer {
  constructor(scene, world, atlas, materials) {
    this.scene = scene;
    this.world = world;
    this.mesher = new ChunkMesher(world, atlas);
    this.materials = materials;
    this.map = new Map();
  }

  has(cx, cz) {
    return this.map.has(this.world.key(cx, cz));
  }

  rebuild(cx, cz) {
    const key = this.world.key(cx, cz);
    this.remove(key);

    const built = this.mesher.build(cx, cz);
    if (!built) return;

    const group = { key, cx, cz, meshes: [] };
    const px = cx * SX;
    const pz = cz * SX;

    for (const [kind, material] of [
      ["solid", this.materials.solid],
      ["leaves", this.materials.leaves],
      ["glass", this.materials.glass],
      ["water", this.materials.water],
    ]) {
      const geometry = built[kind];
      if (!geometry || geometry.attributes.position.count === 0) {
        geometry?.dispose();
        continue;
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(px, 0, pz);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      group.meshes.push(mesh);
    }

    this.map.set(key, group);
  }

  remove(key) {
    const group = this.map.get(key);
    if (!group) return;
    for (const mesh of group.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.map.delete(key);
  }

  // 方块修改后,重建受影响区块(含边界邻居)
  rebuildAround(blockX, blockZ) {
    const cx = Math.floor(blockX / SX);
    const cz = Math.floor(blockZ / SX);
    const lx = blockX - cx * SX;
    const lz = blockZ - cz * SX;
    const set = new Set([this.world.key(cx, cz)]);
    if (lx === 0) set.add(this.world.key(cx - 1, cz));
    if (lx === SX - 1) set.add(this.world.key(cx + 1, cz));
    if (lz === 0) set.add(this.world.key(cx, cz - 1));
    if (lz === SX - 1) set.add(this.world.key(cx, cz + 1));
    for (const key of set) {
      const g = this.map.get(key);
      if (g) this.rebuild(g.cx, g.cz);
    }
  }

  clear() {
    for (const key of [...this.map.keys()]) this.remove(key);
  }
}
