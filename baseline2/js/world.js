'use strict';
/* WebCraft · 无限体素世界：区块生成 / 网格化 / 交互 / 存档 */
(function () {
  const SX = 16, SY = 128, SZ = 16;
  const SEA_LEVEL = 40;
  const RENDER_RADIUS = 5;
  const SAVE_KEY = 'webcraft-save-v1';
  const B = Blocks.BLOCK;

  function floorDiv(a, b) { return Math.floor(a / b); }
  function key(cx, cz) { return cx + ',' + cz; }

  /* 六个面的几何定义：法线、纹理方向、亮度、角点（相对坐标/uv/AO 偏移符号） */
  const FACES = [
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], shade: 1.00, c: [
      { p: [-.5, .5, .5], uv: [0, 0], du: -1, dv: 1 },
      { p: [.5, .5, .5], uv: [1, 0], du: 1, dv: 1 },
      { p: [.5, .5, -.5], uv: [1, 1], du: 1, dv: -1 },
      { p: [-.5, .5, -.5], uv: [0, 1], du: -1, dv: -1 } ] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], shade: 0.55, c: [
      { p: [-.5, -.5, -.5], uv: [0, 0], du: -1, dv: -1 },
      { p: [.5, -.5, -.5], uv: [1, 0], du: 1, dv: -1 },
      { p: [.5, -.5, .5], uv: [1, 1], du: 1, dv: 1 },
      { p: [-.5, -.5, .5], uv: [0, 1], du: -1, dv: 1 } ] },
    { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], shade: 0.62, c: [
      { p: [.5, -.5, -.5], uv: [0, 0], du: -1, dv: -1 },
      { p: [.5, .5, -.5], uv: [0, 1], du: -1, dv: 1 },
      { p: [.5, .5, .5], uv: [1, 1], du: 1, dv: 1 },
      { p: [.5, -.5, .5], uv: [1, 0], du: 1, dv: -1 } ] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], shade: 0.62, c: [
      { p: [-.5, -.5, .5], uv: [0, 0], du: 1, dv: -1 },
      { p: [-.5, .5, .5], uv: [0, 1], du: 1, dv: 1 },
      { p: [-.5, .5, -.5], uv: [1, 1], du: -1, dv: 1 },
      { p: [-.5, -.5, -.5], uv: [1, 0], du: -1, dv: -1 } ] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], shade: 0.80, c: [
      { p: [-.5, -.5, .5], uv: [0, 0], du: -1, dv: -1 },
      { p: [.5, -.5, .5], uv: [1, 0], du: 1, dv: -1 },
      { p: [.5, .5, .5], uv: [1, 1], du: 1, dv: 1 },
      { p: [-.5, .5, .5], uv: [0, 1], du: -1, dv: 1 } ] },
    { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0], shade: 0.80, c: [
      { p: [.5, -.5, -.5], uv: [0, 0], du: 1, dv: -1 },
      { p: [-.5, -.5, -.5], uv: [1, 0], du: -1, dv: -1 },
      { p: [-.5, .5, -.5], uv: [1, 1], du: -1, dv: 1 },
      { p: [.5, .5, -.5], uv: [0, 1], du: 1, dv: 1 } ] }
  ];

  const AO_CURVE = [1.0, 0.82, 0.66, 0.52];

  class MeshBuilder {
    constructor() {
      this.pos = []; this.uv = []; this.col = []; this.idx = [];
    }
    quad(corners) {
      const base = this.pos.length / 3;
      for (let i = 0; i < 4; i++) {
        const c = corners[i];
        this.pos.push(c.p[0], c.p[1], c.p[2]);
        this.uv.push(c.uv[0], c.uv[1]);
        this.col.push(c.b, c.b, c.b);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    geometry() {
      if (this.pos.length === 0) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(this.idx), 1));
      g.computeBoundingSphere();
      return g;
    }
  }

  class World {
    constructor(seed, atlas) {
      this.seed = seed >>> 0;
      this.atlas = atlas;
      this.chunks = new Map();
      this.heightCache = new Map();
      this.overrides = new Map();
      this.unsaved = new Map();
      this.meshQueue = new Set();
      this.scene = null;
      this.time = 0.30 * 480;   // 早晨开局
      this.dayLength = 480;     // 秒
      this.lastUnload = 0;
      this.materials = this.makeMaterials();
    }

    makeMaterials() {
      const t = this.atlas.texture;
      return {
        opaque: new THREE.MeshBasicMaterial({
          map: t, vertexColors: true, side: THREE.FrontSide
        }),
        cutout: new THREE.MeshBasicMaterial({
          map: t, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide
        }),
        glass: new THREE.MeshBasicMaterial({
          map: t, vertexColors: true, transparent: true,
          alphaTest: 0.02, depthWrite: false, side: THREE.FrontSide
        }),
        water: new THREE.MeshBasicMaterial({
          map: t, vertexColors: true, transparent: true, opacity: 0.62,
          depthWrite: false, side: THREE.DoubleSide
        })
      };
    }

    setScene(scene) { this.scene = scene; }

    /* ---------------- 地形 ---------------- */
    terrainHeight(x, z) {
      const hk = x + ',' + z;
      const cached = this.heightCache.get(hk);
      if (cached !== undefined) return cached;

      const cont = Noise.fbm2(this.seed + 11, x * 0.0042, z * 0.0042, 4);      // 大陆起伏
      const detail = Noise.fbm2(this.seed + 47, x * 0.013, z * 0.013, 3);      // 小丘陵
      const mountains = Noise.ridged2(this.seed + 83, x * 0.0017 + 71, z * 0.0017 + 39, 4);
      const m = Math.pow(mountains, 3.2) * 58;

      let h = SEA_LEVEL + Math.round((cont - 0.5) * 22 + (detail - 0.5) * 8 + m);
      if (h < 3) h = 3;
      if (h > 112) h = 112;

      this.heightCache.set(hk, h);
      if (this.heightCache.size > 200000) this.heightCache.clear();
      return h;
    }

    ensureChunk(cx, cz) {
      const k = key(cx, cz);
      let c = this.chunks.get(k);
      if (!c) {
        c = {
          cx, cz, key: k,
          data: new Uint8Array(SX * SY * SZ),
          meshed: false,
          meshes: { opaque: null, cutout: null, glass: null, water: null }
        };
        this.chunks.set(k, c);
        this.generateChunk(c);
        this.queueMesh(cx, cz);
        /* 已生成邻居的边界网格需要重算（新方块会遮挡旧面） */
        for (const [nx, nz] of [[cx - 1, cz], [cx + 1, cz], [cx, cz - 1], [cx, cz + 1]]) {
          if (this.chunks.has(key(nx, nz))) this.queueMesh(nx, nz);
        }
      }
      return c;
    }

    generateChunk(c) {
      const baseX = c.cx * SX, baseZ = c.cz * SZ;
      const data = c.data;

      /* 1. 基础地层 */
      for (let lz = 0; lz < SZ; lz++) {
        for (let lx = 0; lx < SX; lx++) {
          const wx = baseX + lx, wz = baseZ + lz;
          const h = this.terrainHeight(wx, wz);
          const beach = h <= SEA_LEVEL + 1;
          const snowy = h >= 78;
          const dirtDepth = 3 + (Noise.hash2(wx, wz, this.seed ^ 0x51ab) > 0.5 ? 1 : 0);
          const sandDepth = beach ? 3 : 0;

          for (let y = 0; y < SY; y++) {
            const idx = (y * SZ + lz) * SX + lx;
            let block;
            if (y === 0) block = B.BEDROCK;
            else if (y < h - dirtDepth) block = B.STONE;
            else if (y < h) block = (y >= h - sandDepth) ? B.SAND : B.DIRT;
            else if (y === h) block = beach ? B.SAND : (snowy ? B.SNOW : B.GRASS);
            else if (y <= SEA_LEVEL) block = B.WATER;
            else block = B.AIR;
            data[idx] = block;
          }
        }
      }

      /* 2. 洞穴（仅陆地，y 限制在山体内部） */
      this.carveCaves(c);

      /* 3. 植被：树、花、草 */
      this.placeVegetation(c);

      /* 4. 存档覆盖（玩家修改永远优先） */
      const ov = this.overrides.get(c.key);
      if (ov) data.set(ov);
    }

    carveCaves(c) {
      const seed = this.seed + 777;
      const baseX = c.cx * SX, baseZ = c.cz * SZ;
      for (let lz = 0; lz < SZ; lz++) {
        for (let lx = 0; lx < SX; lx++) {
          const wx = baseX + lx, wz = baseZ + lz;
          const h = this.terrainHeight(wx, wz);
          if (h <= SEA_LEVEL + 3) continue;
          const yMax = Math.min(h - 5, 96);
          for (let y = 3; y < yMax; y++) {
            const n = Noise.value3(seed, wx * 0.085, y * 0.11, wz * 0.085);
            const dither = Noise.hash3(wx, y, wz, seed) * 0.24;
            if (n + dither > 0.63) {
              dataIndex(c, lx, y, lz, B.AIR);
            }
          }
        }
      }
    }

    /* 局部写块；越界时返回 false（植被只写本区块，跨区块由对应区块自己生成） */
    localSet(c, wx, wy, wz, id) {
      if (wy < 0 || wy >= SY) return false;
      const lx = wx - c.cx * SX, lz = wz - c.cz * SZ;
      if (lx < 0 || lx >= SX || lz < 0 || lz >= SZ) return false;
      c.data[(wy * SZ + lz) * SX + lx] = id;
      return true;
    }

    placeVegetation(c) {
      const baseX = c.cx * SX, baseZ = c.cz * SZ;
      /* 树干位于本区块 ±2 范围内的树，树冠可能伸入本区块 */
      for (let tz = -2; tz <= SZ + 1; tz++) {
        for (let tx = -2; tx <= SX + 1; tx++) {
          const wx = baseX + tx, wz = baseZ + tz;
          const h = this.terrainHeight(wx, wz);
          if (h <= SEA_LEVEL + 1 || h >= 76) continue;
          const roll = Noise.hash2(wx, wz, this.seed ^ 0xabcd);
          if (roll >= 0.012) continue;

          const trunk = 4 + Math.floor(Noise.hash2(wx, wz, this.seed ^ 0x1357) * 3);
          if (h + trunk + 2 >= SY) continue;

          for (let dy = 1; dy <= trunk; dy++) this.localSet(c, wx, h + dy, wz, B.LOG);
          const top = h + trunk;
          for (let oy = top - 2; oy <= top + 1; oy++) {
            const r = (oy === top + 1) ? 1 : 2;
            for (let ox = -2; ox <= 2; ox++) {
              for (let oz = -2; oz <= 2; oz++) {
                if (Math.abs(ox) > r || Math.abs(oz) > r) continue;
                /* 只在空气处放树叶，保留树干 */
                const idx = indexOf(c, wx + ox, oy, wz + oz);
                if (idx >= 0 && c.data[idx] === B.AIR) c.data[idx] = B.LEAVES;
              }
            }
          }
        }
      }

      /* 花与草丛 */
      for (let lz = 0; lz < SZ; lz++) {
        for (let lx = 0; lx < SX; lx++) {
          const wx = baseX + lx, wz = baseZ + lz;
          const h = this.terrainHeight(wx, wz);
          if (h <= SEA_LEVEL + 1 || h >= 76) continue;
          if (dataIndex(c, lx, h, lz) !== B.GRASS) continue;
          const roll = Noise.hash2(wx, wz, this.seed ^ 0x2468);
          if (roll < 0.009) this.localSet(c, wx, h + 1, wz, B.FLOWER_RED);
          else if (roll < 0.018) this.localSet(c, wx, h + 1, wz, B.FLOWER_YELLOW);
          else if (roll < 0.05) this.localSet(c, wx, h + 1, wz, B.TALL_GRASS);
        }
      }
    }

    /* ---------------- 方块读写 ---------------- */
    getBlock(x, y, z) {
      if (y < 0 || y >= SY) return B.AIR;
      const c = this.ensureChunk(floorDiv(x, SX), floorDiv(z, SZ));
      return c.data[((y * SZ) + (z - c.cz * SZ)) * SX + (x - c.cx * SX)];
    }

    setBlock(x, y, z, id) {
      if (y < 0 || y >= SY) return -1;
      const cx = floorDiv(x, SX), cz = floorDiv(z, SZ);
      const c = this.ensureChunk(cx, cz);
      const lx = x - cx * SX, lz = z - cz * SZ;
      const idx = (y * SZ + lz) * SX + lx;
      const old = c.data[idx];
      if (old === id) return old;
      c.data[idx] = id;
      this.unsaved.set(c.key, c.data);
      this.queueMesh(cx, cz);
      if (lx === 0 && this.chunks.has(key(cx - 1, cz))) this.queueMesh(cx - 1, cz);
      if (lx === SX - 1 && this.chunks.has(key(cx + 1, cz))) this.queueMesh(cx + 1, cz);
      if (lz === 0 && this.chunks.has(key(cx, cz - 1))) this.queueMesh(cx, cz - 1);
      if (lz === SZ - 1 && this.chunks.has(key(cx, cz + 1))) this.queueMesh(cx, cz + 1);
      return old;
    }

    queueMesh(cx, cz) { this.meshQueue.add(key(cx, cz)); }

    /* ---------------- 网格构建 ---------------- */
    tileUV(tile) {
      const { canvas, cols, cell } = this.atlas;
      const W = canvas.width, H = canvas.height;
      const col = tile % cols, row = Math.floor(tile / cols);
      const px0 = col * cell, py0 = row * cell;
      return {
        u0: (px0 + 0.5) / W, u1: (px0 + cell - 0.5) / W,
        v0: 1 - (py0 + cell - 0.5) / H, v1: 1 - (py0 + 0.5) / H
      };
    }

    emitFace(builder, id, lx, ly, lz, wx, wy, wz, faceIdx, waterAdjust) {
      const face = FACES[faceIdx];
      const tile = Blocks.tileFor(id, faceIdx);
      const tuv = this.tileUV(tile);
      const corners = [];

      for (let i = 0; i < 4; i++) {
        const c = face.c[i];
        let py = c.p[1];
        if (waterAdjust && py > 0.4) py = 0.875;

        let bright;
        if (waterAdjust) {
          bright = face.shade * 0.94;
        } else {
          const s1x = wx + face.u[0] * c.du, s1y = wy + face.u[1] * c.du, s1z = wz + face.u[2] * c.du;
          const s2x = wx + face.v[0] * c.dv, s2y = wy + face.v[1] * c.dv, s2z = wz + face.v[2] * c.dv;
          const ox = s1x + face.v[0] * c.dv, oy = s1y + face.v[1] * c.dv, oz = s1z + face.v[2] * c.dv;
          let occ = 0;
          if (Blocks.isOccluder(this.getBlock(s1x, s1y, s1z))) occ++;
          if (Blocks.isOccluder(this.getBlock(s2x, s2y, s2z))) occ++;
          if (Blocks.isOccluder(this.getBlock(ox, oy, oz))) occ++;
          bright = face.shade * AO_CURVE[occ];
        }

        corners.push({
          p: [lx + c.p[0], ly + py, lz + c.p[2]],
          uv: [c.uv[0] === 0 ? tuv.u0 : tuv.u1, c.uv[1] === 0 ? tuv.v0 : tuv.v1],
          b: bright
        });
      }
      builder.quad(corners);
    }

    emitCross(builder, id, lx, ly, lz) {
      const tile = Blocks.tileFor(id, 0);
      const tuv = this.tileUV(tile);
      const quads = [
        [[-.5, -.5, -.5], [.5, -.5, .5], [.5, .9, .5], [-.5, .9, -.5]],
        [[-.5, -.5, .5], [.5, -.5, -.5], [.5, .9, -.5], [-.5, .9, .5]]
      ];
      for (const q of quads) {
        const corners = q.map((p, i) => ({
          p: [lx + p[0], ly + p[1], lz + p[2]],
          uv: (i === 0 || i === 3) ? [tuv.u0, (i === 0 ? tuv.v0 : tuv.v1)]
                                    : [tuv.u1, (i === 1 ? tuv.v0 : tuv.v1)],
          b: 1.0
        }));
        builder.quad(corners);
      }
    }

    buildChunkMesh(c) {
      const ob = new MeshBuilder();   // 不透明
      const cb = new MeshBuilder();   // 树叶 + 花草
      const gb = new MeshBuilder();   // 玻璃
      const wb = new MeshBuilder();   // 水
      const data = c.data;

      for (let y = 0; y < SY; y++) {
        for (let z = 0; z < SZ; z++) {
          for (let x = 0; x < SX; x++) {
            const id = data[(y * SZ + z) * SX + x];
            if (id === B.AIR) continue;
            const kind = Blocks.info(id).kind;
            const wx = c.cx * SX + x, wy = y, wz = c.cz * SZ + z;

            if (kind === 'cross') {
              this.emitCross(cb, id, x, y, z);
              continue;
            }

            const builder = kind === 'solid' ? ob
                          : kind === 'cutout' ? cb
                          : kind === 'glass' ? gb
                          : kind === 'water' ? wb : null;
            if (!builder) continue;

            for (let f = 0; f < 6; f++) {
              const face = FACES[f];
              const nb = this.getBlock(wx + face.n[0], y + face.n[1], wz + face.n[2]);
              let visible;
              if (kind === 'water') {
                visible = nb !== B.WATER && !Blocks.isOccluder(nb) && nb !== B.GLASS;
              } else if (kind === 'glass') {
                visible = nb !== B.GLASS && !Blocks.isOccluder(nb);
              } else {
                visible = !Blocks.isOccluder(nb);
              }
              if (visible) this.emitFace(builder, id, x, y, z, wx, wy, wz, f, kind === 'water');
            }
          }
        }
      }

      this.disposeMeshes(c);
      c.meshes.opaque = this.makeMesh(c, ob, this.materials.opaque, 0);
      c.meshes.cutout = this.makeMesh(c, cb, this.materials.cutout, 0);
      c.meshes.glass = this.makeMesh(c, gb, this.materials.glass, 1);
      c.meshes.water = this.makeMesh(c, wb, this.materials.water, 2);
      c.meshed = true;
    }

    makeMesh(c, builder, material, renderOrder) {
      const geo = builder.geometry();
      if (!geo) return null;
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(c.cx * SX, 0, c.cz * SZ);
      mesh.renderOrder = renderOrder;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (this.scene) this.scene.add(mesh);
      return mesh;
    }

    disposeMeshes(c) {
      if (!this.scene) return;
      for (const name of ['opaque', 'cutout', 'glass', 'water']) {
        const m = c.meshes[name];
        if (m) {
          this.scene.remove(m);
          m.geometry.dispose();
          c.meshes[name] = null;
        }
      }
    }

    /* 释放整个世界（重新开始时调用） */
    dispose() {
      for (const c of this.chunks.values()) this.disposeMeshes(c);
      this.meshQueue.clear();
      this.chunks.clear();
      this.heightCache.clear();
    }

    /* ---------------- 流式更新 ---------------- */
    processMeshQueue(maxMs, px, pz) {
      if (!this.scene) return;
      const arr = Array.from(this.meshQueue);
      if (arr.length === 0) return;
      arr.sort((a, b) => {
        const [ax, az] = a.split(',').map(Number);
        const [bx, bz] = b.split(',').map(Number);
        const da = (ax * SX + 8 - px) ** 2 + (az * SZ + 8 - pz) ** 2;
        const db = (bx * SX + 8 - px) ** 2 + (bz * SZ + 8 - pz) ** 2;
        return da - db;
      });

      const start = performance.now();
      const maxDist = (RENDER_RADIUS + 1) * SX + 8;
      for (const k of arr) {
        if (performance.now() - start > maxMs) break;
        const c = this.chunks.get(k);
        if (!c) { this.meshQueue.delete(k); continue; }
        const dx = c.cx * SX + 8 - px, dz = c.cz * SZ + 8 - pz;
        if (dx * dx + dz * dz > maxDist * maxDist) {
          /* 太远：先移出队列，玩家靠近时 update() 会重新入队 */
          this.meshQueue.delete(k);
          continue;
        }
        this.buildChunkMesh(c);
        this.meshQueue.delete(k);
      }
    }

    update(playerPos, elapsed) {
      const px = playerPos.x, pz = playerPos.z;
      const pcx = floorDiv(px, SX), pcz = floorDiv(pz, SZ);

      /* 生成最近缺失的区块（每帧至多 2 个，避免卡顿） */
      const missing = [];
      for (let r = 0; r <= RENDER_RADIUS; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const cx = pcx + dx, cz = pcz + dz;
            if (!this.chunks.has(key(cx, cz))) missing.push([cx, cz]);
          }
        }
      }
      missing.sort((a, b) => (a[0] * SX - px) ** 2 + (a[1] * SZ - pz) ** 2
                           - (b[0] * SX - px) ** 2 - (b[1] * SZ - pz) ** 2);
      for (let i = 0; i < Math.min(2, missing.length); i++) {
        this.ensureChunk(missing[i][0], missing[i][1]);
      }

      /* 近处未建网格的区块入队 */
      for (const [k, c] of this.chunks) {
        if (c.meshed) continue;
        const dx = c.cx * SX + 8 - px, dz = c.cz * SZ + 8 - pz;
        if (dx * dx + dz * dz <= maxNearSq()) this.queueMesh(c.cx, c.cz);
      }

      /* 卸载远处网格（保留方块数据） */
      this.lastUnload += elapsed;
      if (this.lastUnload > 0.5) {
        this.lastUnload = 0;
        for (const c of this.chunks.values()) {
          if (!c.meshed) continue;
          const dx = c.cx * SX + 8 - px, dz = c.cz * SZ + 8 - pz;
          if (dx * dx + dz * dz > ((RENDER_RADIUS + 1) * SX) ** 2) {
            this.disposeMeshes(c);
            c.meshed = false;
          }
        }
      }
    }

    /* ---------------- 射线拾取 ---------------- */
    raycast(origin, dir, maxDist) {
      let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
      const sx = dir.x > 0 ? 1 : -1;
      const sy = dir.y > 0 ? 1 : -1;
      const sz = dir.z > 0 ? 1 : -1;
      const tdx = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
      const tdy = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
      const tdz = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
      let tmx = dir.x !== 0 ? (dir.x > 0 ? (x + 1 - origin.x) : (origin.x - x)) * tdx : Infinity;
      let tmy = dir.y !== 0 ? (dir.y > 0 ? (y + 1 - origin.y) : (origin.y - y)) * tdy : Infinity;
      let tmz = dir.z !== 0 ? (dir.z > 0 ? (z + 1 - origin.z) : (origin.z - z)) * tdz : Infinity;
      let nx = 0, ny = 0, nz = 0, t = 0;

      while (t <= maxDist) {
        if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
        else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
        else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
        if (t > maxDist) return null;
        const id = this.getBlock(x, y, z);
        if (id !== B.AIR) return { x, y, z, nx, ny, nz, dist: t, block: id };
      }
      return null;
    }

    /* ---------------- 存档 ---------------- */
    applySave(save) {
      this.time = save.time !== undefined ? save.time : this.time;
      if (save.overrides) {
        for (const [k, v] of save.overrides) this.overrides.set(k, v);
      }
    }

    save() {
      try {
        const list = [];
        let count = 0;
        for (const [k, data] of this.unsaved) {
          if (count++ >= 64) break;
          const [cx, cz] = k.split(',').map(Number);
          list.push({ cx, cz, data: bytesToBase64(data) });
        }
        if (list.length === 0) return true;
        const payload = JSON.stringify({ v: 1, seed: this.seed, time: this.time, chunks: list });
        localStorage.setItem(SAVE_KEY, payload);
        this.unsaved.clear();
        return true;
      } catch (err) {
        console.warn('存档失败', err);
        return false;
      }
    }

    clearSave() {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      this.unsaved.clear();
    }

    static load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const s = JSON.parse(raw);
        if (!s || s.v !== 1 || !Array.isArray(s.chunks)) return null;
        const overrides = new Map();
        for (const e of s.chunks) {
          if (e && typeof e.data === 'string') {
            overrides.set(key(e.cx | 0, e.cz | 0), base64ToBytes(e.data));
          }
        }
        return { seed: s.seed >>> 0, time: s.time || 0, overrides };
      } catch (err) {
        console.warn('读取存档失败', err);
        return null;
      }
    }
  }

  /* ---------------- 工具函数 ---------------- */
  function indexOf(c, wx, wy, wz) {
    if (wy < 0 || wy >= SY) return -1;
    const lx = wx - c.cx * SX, lz = wz - c.cz * SZ;
    if (lx < 0 || lx >= SX || lz < 0 || lz >= SZ) return -1;
    return (wy * SZ + lz) * SX + lx;
  }

  function dataIndex(c, lx, ly, lz, id) {
    c.data[(ly * SZ + lz) * SX + lx] = id;
  }

  function maxNearSq() {
    return (RENDER_RADIUS * SX + 8) ** 2;
  }

  function bytesToBase64(bytes) {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  window.World = World;
  window.WorldConst = { SX, SY, SZ, SEA_LEVEL, RENDER_RADIUS };
})();
