// 区块网格构建：可见面剔除 + 顶点环境光遮蔽（AO）+ 面方向明暗
import {
  CHUNK_SIZE, WORLD_HEIGHT, FACES, BLOCKS,
  WATER, GLASS, LEAVES, cullsFace, aoOccludes,
} from './constants.js';

const AO_LOOKUP = [0.45, 0.62, 0.8, 1.0];

function hash3(x, y, z) {
  let h = (x * 73856093 ^ y * 19349663 ^ z * 83492791) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) & 1023) / 1023;
}

export function buildChunkMesh(THREE, world, chunk, atlas) {
  const { data, cx, cz } = chunk;
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;

  const groups = {
    solid: { pos: [], color: [], uv: [], normal: [] },
    water: { pos: [], color: [], uv: [], normal: [] },
    glass: { pos: [], color: [], uv: [], normal: [] },
  };

  // 快速邻居访问：块内直读，跨界走世界查询
  function get(lx, ly, lz) {
    if (ly < 0 || ly >= WORLD_HEIGHT) return 0;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
      return data[(lx + lz * CHUNK_SIZE) * WORLD_HEIGHT + ly];
    }
    return world.getBlock(baseX + lx, baseZ + lz, ly);
  }

  function occ(lx, ly, lz) {
    return aoOccludes(get(lx, ly, lz));
  }

  const { cols, rows } = atlas;

  function faceVisible(id, lx, ly, lz, face) {
    const dir = face.dir;
    const nid = get(lx + dir[0], ly + dir[1], lz + dir[2]);
    if (id === WATER) {
      if (nid === WATER) {
        // 水面下方补一层底面，使水下抬头能看到水面
        return dir[1] === -1 && get(lx, ly + 1, lz) !== WATER;
      }
      return !cullsFace(nid);
    }
    if (id === GLASS) {
      if (nid === GLASS) return false;
      return !cullsFace(nid);
    }
    return !cullsFace(nid);
  }

  function pushFace(id, lx, ly, lz, face) {
    const def = BLOCKS[id];
    const kind = id === WATER ? 'water' : id === GLASS ? 'glass' : 'solid';
    const group = groups[kind];
    const dir = face.dir;
    const px = lx + Math.max(dir[0], 0);
    const py = ly + Math.max(dir[1], 0);
    const pz = lz + Math.max(dir[2], 0);

    let tile;
    if (dir[1] === 1) tile = def.tiles[0];
    else if (dir[1] === -1) tile = def.tiles[1];
    else tile = def.tiles[2];

    const u0 = (tile % cols) / cols;
    const v0 = Math.floor(tile / cols) / rows;
    const uStep = 1 / cols;
    const vStep = 1 / rows;
    // 轻微内缩避免图集渗色
    const inset = 0.02 / 16;
    const ua = u0 + inset, ub = u0 + uStep - inset;
    const va = v0 + inset, vb = v0 + vStep - inset;

    const leafVar = id === LEAVES ? 0.88 + hash3(baseX + lx, ly, baseZ + lz) * 0.24 : 1;

    const corners = [];
    for (let i = 0; i < 4; i++) {
      const c = face.corners[i];
      const a = c[0], b = c[1];
      let wx = px, wy = py, wz = pz;
      if (face.t1 === 'x') wx += a;
      else if (face.t1 === 'y') wy += a;
      else wz += a;
      if (face.t2 === 'x') wx += b;
      else if (face.t2 === 'y') wy += b;
      else wz += b;

      // AO：侧边 1、侧边 2、对角
      let ao = 3;
      if (id !== LEAVES) {
        let s1x = lx, s1y = ly, s1z = lz, s2x = lx, s2y = ly, s2z = lz;
        const sgn1 = a === 0 ? -1 : 1;
        const sgn2 = b === 0 ? -1 : 1;
        if (face.t1 === 'x') s1x += sgn1;
        else if (face.t1 === 'y') s1y += sgn1;
        else s1z += sgn1;
        if (face.t2 === 'x') s2x += sgn2;
        else if (face.t2 === 'y') s2y += sgn2;
        else s2z += sgn2;
        const o1 = occ(s1x, s1y, s1z);
        const o2 = occ(s2x, s2y, s2z);
        const oc = occ(s1x + s2x - lx, s1y + s2y - ly, s1z + s2z - lz);
        ao = (o1 && o2) ? 0 : 3 - (o1 + o2 + oc);
      }

      let brightness = face.shade * AO_LOOKUP[ao] * leafVar;
      if (id === WATER) {
        brightness = (face.shade * 0.92 + 0.08) * (0.9 + hash3(baseX + lx, ly, baseZ + lz) * 0.12);
      }
      if (id === GLASS) brightness = 1;

      corners.push({
        x: baseX + wx, y: wy, z: baseZ + wz,
        u: a === 0 ? ua : ub,
        v: b === 0 ? va : vb,
        r: brightness, g: brightness, b: brightness,
        nx: dir[0], ny: dir[1], nz: dir[2],
      });
    }

    // 两个三角形 0-1-2 / 0-2-3（逆时针，面朝外）
    const tri = [0, 1, 2, 0, 2, 3];
    for (const vi of tri) {
      const v = corners[vi];
      group.pos.push(v.x, v.y, v.z);
      group.normal.push(v.nx, v.ny, v.nz);
      group.color.push(v.r, v.g, v.b);
      group.uv.push(v.u, v.v);
    }
  }

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const col = (lx + lz * CHUNK_SIZE) * WORLD_HEIGHT;
      for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
        const id = data[col + ly];
        if (id === 0) continue;
        for (const face of FACES) {
          if (faceVisible(id, lx, ly, lz, face)) {
            pushFace(id, lx, ly, lz, face);
          }
        }
      }
    }
  }

  const result = { group: null, solid: null, water: null, glass: null };
  const group = new THREE.Group();

  function makeMesh(kind, material) {
    const g = groups[kind];
    if (g.pos.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(g.pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(g.normal), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.color), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.uv), 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    return mesh;
  }

  result.solid = makeMesh('solid', atlas.solidMaterial);
  result.water = makeMesh('water', atlas.waterMaterial);
  result.glass = makeMesh('glass', atlas.glassMaterial);
  result.group = group;
  return result;
}
