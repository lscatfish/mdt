/* ============================================================
 * mesher.js — 将区块体素数据转换为渲染顶点数组
 * 顶点布局: [x, y, z, u, v, r, g, b] 共 8 个 float
 * ============================================================ */
(function (global) {
  'use strict';

  // 每个面的四个角（角点局部坐标 0/1）与对应 UV 角
  // 侧面: 前两个角 y=0 (v=0)，后两个角 y=1 (v=1)
  const FACES = [
    { n: [1, 0, 0],  c: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] },
    { n: [-1, 0, 0], c: [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] },
    { n: [0, 1, 0],  c: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] },
    { n: [0, -1, 0], c: [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] },
    { n: [0, 0, 1],  c: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] },
    { n: [0, 0, -1], c: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] }
  ];

  const BASE_LIGHT = [0.68, 0.68, 1.0, 0.5, 0.8, 0.74]; // 与 FACES 顺序对应

  function occludesAO(id) {
    const b = MCTextures.Blocks[id];
    return b && b.opaque && id !== 16;
  }

  function isOpaque(id) {
    const b = MCTextures.Blocks[id];
    return !!(b && b.opaque);
  }

  // 顶点环境光遮蔽：faceIndex 角点的三个相邻方块中有多少个遮光体
  function aoLevel(world, chunk, bx, by, bz, f, cornerIdx) {
    const n = f.n;
    const c = f.c[cornerIdx];
    let count = 0;
    for (let a = 0; a < 3; a++) {
      if (n[a] !== 0) continue;
      const t = [0, 0, 0];
      t[a] = c[a] === 0 ? -1 : 1;
      const p = [bx + n[0] + t[0], by + n[1] + t[1], bz + n[2] + t[2]];
      const id = world.getBlockFast(chunk, p[0], p[1], p[2]);
      if (id !== null && occludesAO(id)) count++;
    }
    // 对角样本
    const t1 = [0, 0, 0], t2 = [0, 0, 0];
    let first = true;
    for (let a = 0; a < 3; a++) {
      if (n[a] !== 0) continue;
      const t = [0, 0, 0];
      t[a] = c[a] === 0 ? -1 : 1;
      if (first) { t1[a] = t[a]; first = false; } else { t2[a] = t[a]; }
    }
    const p = [bx + n[0] + t1[0] + t2[0], by + n[1] + t1[1] + t2[1], bz + n[2] + t1[2] + t2[2]];
    const id = world.getBlockFast(chunk, p[0], p[1], p[2]);
    if (id !== null && occludesAO(id)) count++;
    return [1.0, 0.82, 0.66, 0.5][count];
  }

  function faceVisible(world, chunk, bx, by, bz, f, forWater) {
    const nx = bx + f.n[0], ny = by + f.n[1], nz = bz + f.n[2];
    const id = world.getBlockFast(chunk, nx, ny, nz);
    if (id === null) return true; // 邻居未加载，先显示
    if (forWater) {
      if (id === 9) return false;                 // 水面相接不画
      return !(isOpaque(id) && id !== 16);        // 透过玻璃可见水面
    }
    return !isOpaque(id);
  }

  function cornerData(world, chunk, f, faceIdx, bx, by, bz, k, tile, waterTop, bright) {
    const uv = MCTextures.textures.tileUVs[tile];
    const corner = f.c[k];
    const cv = f.uv[k];
    let yOff = 0;
    if (waterTop && f.n[1] === 1) yOff = -0.125;
    const light = BASE_LIGHT[faceIdx] * (bright || 1) * aoLevel(world, chunk, bx, by, bz, f, k);
    const u = cv[0] === 0 ? uv.u0 : uv.u1;
    const v = cv[1] === 0 ? uv.v0 : uv.v1;
    return [bx + corner[0], by + corner[1] + yOff, bz + corner[2], u, v, light, light, light];
  }

  function emitFace(world, chunk, list, bx, by, bz, f, faceIdx, tile, waterTop, bright) {
    // 四边形拆成两个三角形，每个顶点独立 AO 颜色
    const v0 = cornerData(world, chunk, f, faceIdx, bx, by, bz, 0, tile, waterTop, bright);
    const v1 = cornerData(world, chunk, f, faceIdx, bx, by, bz, 1, tile, waterTop, bright);
    const v2 = cornerData(world, chunk, f, faceIdx, bx, by, bz, 2, tile, waterTop, bright);
    const v3 = cornerData(world, chunk, f, faceIdx, bx, by, bz, 3, tile, waterTop, bright);
    list.push(v0[0], v0[1], v0[2], v0[3], v0[4], v0[5], v0[6], v0[7]);
    list.push(v1[0], v1[1], v1[2], v1[3], v1[4], v1[5], v1[6], v1[7]);
    list.push(v2[0], v2[1], v2[2], v2[3], v2[4], v2[5], v2[6], v2[7]);
    list.push(v0[0], v0[1], v0[2], v0[3], v0[4], v0[5], v0[6], v0[7]);
    list.push(v2[0], v2[1], v2[2], v2[3], v2[4], v2[5], v2[6], v2[7]);
    list.push(v3[0], v3[1], v3[2], v3[3], v3[4], v3[5], v3[6], v3[7]);
  }

  function buildChunkMesh(world, chunk) {
    const opaque = [];
    const alpha = [];   // 玻璃
    const water = [];
    const H = MCWorld.H;
    const CX = MCWorld.CX, CZ = MCWorld.CZ;
    const data = chunk.data;

    for (let y = 0; y < H; y++) {
      for (let z = 0; z < CZ; z++) {
        for (let x = 0; x < CX; x++) {
          const id = data[(y * CZ + z) * CX + x];
          if (id === 0) continue;
          const def = MCTextures.Blocks[id];
          const wx = chunk.cx * CX + x;
          const wz = chunk.cz * CZ + z;

          if (id === 9) {
            // 水：顶面只在水面与空气接触处绘制
            for (let fi = 0; fi < 6; fi++) {
              const f = FACES[fi];
              if (!faceVisible(world, chunk, wx, y, wz, f, true)) continue;
              if (f.n[1] === 1) {
                emitFace(world, chunk, water, wx, y, wz, f, fi, def.top, true, 1.0);
              } else if (f.n[1] !== -1) {
                emitFace(world, chunk, water, wx, y, wz, f, fi, def.side, false, 0.82);
              }
            }
            // 水面方块额外绘制底面，使水下抬头能看到水面
            const above = world.getBlockFast(chunk, wx, y + 1, wz);
            if (above === 0) {
              emitFace(world, chunk, water, wx, y, wz, FACES[3], 3, def.side, false, 1.5);
            }
          } else if (id === 16) {
            // 玻璃：透明通道
            for (let fi = 0; fi < 6; fi++) {
              const f = FACES[fi];
              if (!faceVisible(world, chunk, wx, y, wz, f, false)) continue;
              const tile = f.n[1] !== 0 ? def.top : def.side;
              emitFace(world, chunk, alpha, wx, y, wz, f, fi, tile, false, 1.0);
            }
          } else {
            for (let fi = 0; fi < 6; fi++) {
              const f = FACES[fi];
              if (!faceVisible(world, chunk, wx, y, wz, f, false)) continue;
              const tile = f.n[1] === 1 ? def.top : (f.n[1] === -1 ? def.bottom : def.side);
              emitFace(world, chunk, opaque, wx, y, wz, f, fi, tile, false, 1.0);
            }
          }
        }
      }
    }

    return {
      opaque: opaque.length ? new Float32Array(opaque) : null,
      alpha: alpha.length ? new Float32Array(alpha) : null,
      water: water.length ? new Float32Array(water) : null,
      opaqueCount: opaque.length / 8,
      alphaCount: alpha.length / 8,
      waterCount: water.length / 8
    };
  }

  global.MCMesher = { buildChunkMesh };
})(window);
