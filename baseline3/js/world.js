/* 方块定义、无限地形生成、区块网格构建与射线检测 */
(function () {
  'use strict';

  const CHUNK = 16;
  const HEIGHT = 80;
  const SEA = 20;

  const BLOCKS = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, PLANKS: 5,
    LOG: 6, LEAVES: 7, SAND: 8, GLASS: 9, WATER: 10, BRICK: 11,
    SNOW: 12, BEDROCK: 13
  };

  const INFO = {
    [BLOCKS.GRASS]: { name: '草方块', tiles: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, solid: true, opaque: true },
    [BLOCKS.DIRT]: { name: '泥土', tiles: { all: 'dirt' }, solid: true, opaque: true },
    [BLOCKS.STONE]: { name: '石头', tiles: { all: 'stone' }, solid: true, opaque: true },
    [BLOCKS.COBBLE]: { name: '圆石', tiles: { all: 'cobblestone' }, solid: true, opaque: true },
    [BLOCKS.PLANKS]: { name: '木板', tiles: { all: 'planks' }, solid: true, opaque: true },
    [BLOCKS.LOG]: { name: '原木', tiles: { top: 'log_top', side: 'log_side', bottom: 'log_top' }, solid: true, opaque: true },
    [BLOCKS.LEAVES]: { name: '树叶', tiles: { all: 'leaves' }, solid: true, opaque: false, cutout: true },
    [BLOCKS.SAND]: { name: '沙子', tiles: { all: 'sand' }, solid: true, opaque: true },
    [BLOCKS.GLASS]: { name: '玻璃', tiles: { all: 'glass' }, solid: true, opaque: false, cutout: true },
    [BLOCKS.WATER]: { name: '水', tiles: { all: 'water' }, solid: false, opaque: false },
    [BLOCKS.BRICK]: { name: '红砖', tiles: { all: 'brick' }, solid: true, opaque: true },
    [BLOCKS.SNOW]: { name: '雪块', tiles: { top: 'snow_top', side: 'snow_side', bottom: 'dirt' }, solid: true, opaque: true },
    [BLOCKS.BEDROCK]: { name: '基岩', tiles: { all: 'bedrock' }, solid: true, opaque: true, unbreakable: true }
  };

  function isOpaque(id) {
    const b = INFO[id];
    return !!b && b.opaque;
  }

  // 面定义：p0 为起始角，u/v 为面内轴，cross(u,v)=法线方向（保证逆时针绕序）
  const FACES = [
    { dir: [0, 1, 0], p0: [0, 1, 1], u: [1, 0, 0], v: [0, 0, -1] },   // 顶
    { dir: [0, -1, 0], p0: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1] },    // 底
    { dir: [1, 0, 0], p0: [1, 0, 1], u: [0, 0, -1], v: [0, 1, 0] },    // +X
    { dir: [-1, 0, 0], p0: [0, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },    // -X
    { dir: [0, 0, 1], p0: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },     // +Z
    { dir: [0, 0, -1], p0: [1, 0, 0], u: [-1, 0, 0], v: [0, 1, 0], flip: true } // -Z
  ];

  const AO_LEVEL = [0.45, 0.62, 0.8, 1.0];

  function key2(cx, cz) { return cx + ',' + cz; }
  function key3(x, y, z) { return x + ',' + y + ',' + z; }

  function MCWorld(seed) {
    this.seed = seed >>> 0;
    this.noise = new MCNoise(this.seed);
    this.chunks = new Map();        // 地形数据（已包含玩家修改）
    this.records = new Map();       // 网格记录
    this.queue = [];                // 待构建的 chunk
    this.diffs = new Map();         // 玩家修改（全局）
    this.chunkDiffs = new Map();    // 玩家修改（按区块索引）
    this.heightCache = new Map();
    this.renderDistance = 4;
    this.group = new THREE.Group();
    this.stats = { built: 0, faces: 0, chunks: 0 };
    this.buildBudget = 2;
    this._texture = null;
    this._materials = null;
  }

  /* ---------------- 基础读取 ---------------- */

  MCWorld.prototype.chunkOf = function (wx, wz) {
    const cx = Math.floor(wx / CHUNK);
    const cz = Math.floor(wz / CHUNK);
    return { cx: cx, cz: cz, lx: wx - cx * CHUNK, lz: wz - cz * CHUNK };
  };

  MCWorld.prototype.ensureChunk = function (cx, cz) {
    const k = key2(cx, cz);
    let data = this.chunks.get(k);
    if (!data) {
      data = this.generateChunk(cx, cz);
      const list = this.chunkDiffs.get(k);
      if (list) {
        for (const d of list) {
          const lx = d.x - cx * CHUNK, lz = d.z - cz * CHUNK;
          data[lx + lz * CHUNK + d.y * CHUNK * CHUNK] = d.id;
        }
      }
      this.chunks.set(k, data);
    }
    return data;
  };

  MCWorld.prototype.getBlock = function (x, y, z) {
    if (y < 0) return BLOCKS.BEDROCK;
    if (y >= HEIGHT) return BLOCKS.AIR;
    const c = this.chunkOf(x, z);
    const data = this.ensureChunk(c.cx, c.cz);
    return data[c.lx + c.lz * CHUNK + y * CHUNK * CHUNK];
  };

  MCWorld.prototype.isSolid = function (x, y, z) {
    const id = this.getBlock(x, y, z);
    const b = INFO[id];
    return !!b && b.solid;
  };

  MCWorld.prototype.setBlock = function (x, y, z, id) {
    if (y < 0 || y >= HEIGHT) return;
    const c = this.chunkOf(x, z);
    const data = this.ensureChunk(c.cx, c.cz);
    const idx = c.lx + c.lz * CHUNK + y * CHUNK * CHUNK;
    data[idx] = id;
    this.diffs.set(key3(x, y, z), id);
    const k = key2(c.cx, c.cz);
    let list = this.chunkDiffs.get(k);
    if (!list) { list = []; this.chunkDiffs.set(k, list); }
    for (let i = 0; i < list.length; i++) {
      if (list[i].x === x && list[i].y === y && list[i].z === z) {
        list[i].id = id;
        return this._markEdges(c);
      }
    }
    list.push({ x: x, y: y, z: z, id: id });
    this._markEdges(c);
  };

  MCWorld.prototype._markEdges = function (c) {
    this.markDirty(c.cx, c.cz);
    if (c.lx === 0) this.markDirty(c.cx - 1, c.cz);
    if (c.lx === CHUNK - 1) this.markDirty(c.cx + 1, c.cz);
    if (c.lz === 0) this.markDirty(c.cx, c.cz - 1);
    if (c.lz === CHUNK - 1) this.markDirty(c.cx, c.cz + 1);
  };

  MCWorld.prototype.markDirty = function (cx, cz) {
    if (this.records.has(key2(cx, cz))) {
      const r = this.records.get(key2(cx, cz));
      r.dirty = true;
      this.queue.push(r);
    }
  };

  /* ---------------- 地形生成 ---------------- */

  MCWorld.prototype.heightAt = function (wx, wz) {
    const k = wx + ',' + wz;
    if (this.heightCache.has(k)) return this.heightCache.get(k);
    const n = this.noise;
    const base = n.fbm2(wx * 0.004, wz * 0.004, 4);
    const continent = n.fbm2((wx + 1000) * 0.0022, (wz + 1000) * 0.0022, 3);
    const ridge = Math.abs(n.fbm2(wx * 0.009 + 500, wz * 0.009 + 500, 2) * 2 - 1);
    let h = 24 + (base - 0.42) * 40 + (continent - 0.5) * 46 + ridge * 16;
    h = Math.max(3, Math.min(HEIGHT - 10, Math.round(h)));
    this.heightCache.set(k, h);
    return h;
  };

  MCWorld.prototype.treeHeightAt = function (tx, tz) {
    return 4 + Math.floor(this.noise.rand01(tx * 3 + 77, tz * 3 + 19) * 3);
  };

  MCWorld.prototype.isTreeBase = function (tx, tz) {
    const h = this.heightAt(tx, tz);
    if (h <= SEA + 1) return false;
    const n = this.noise;
    const forest = n.fbm2((tx + 900) * 0.006, (tz + 900) * 0.006, 2);
    if (forest < 0.46) return false;
    return n.rand01(tx * 2 + 111, tz * 2 + 333) < 0.06 + forest * 0.07;
  };

  // 找一处没有树、不在水下的出生点（螺旋向外搜索）
  MCWorld.prototype.findSpawn = function (wx, wz) {
    for (let r = 0; r <= 40; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = wx + dx, z = wz + dz;
          const h = this.heightAt(x, z);
          if (h <= SEA + 1) continue;
          if (this.isTreeBase(x, z)) continue;
          return { x: x + 0.5, y: h + 1, z: z + 0.5 };
        }
      }
    }
    const h = this.heightAt(wx, wz);
    return { x: wx + 0.5, y: Math.max(h, SEA + 1) + 1, z: wz + 0.5 };
  };

  MCWorld.prototype.generateChunk = function (cx, cz) {
    const data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const bx = cx * CHUNK, bz = cz * CHUNK;
    const n = this.noise;

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = bx + lx, wz = bz + lz;
        const h = this.heightAt(wx, wz);
        const col = lx + lz * CHUNK;
        for (let y = 0; y < HEIGHT; y++) {
          let id = BLOCKS.AIR;
          if (y === 0) {
            id = BLOCKS.BEDROCK;
          } else if (y <= h) {
            if (y === h) {
              id = h <= SEA + 2 ? BLOCKS.SAND : BLOCKS.GRASS;
            } else if (y >= h - 2) {
              id = h <= SEA + 2 ? BLOCKS.SAND : BLOCKS.DIRT;
            } else {
              id = BLOCKS.STONE;
            }
          }
          data[col + y * CHUNK * CHUNK] = id;
        }
        // 洞穴
        for (let y = 2; y <= Math.max(2, h - 2); y++) {
          const c1 = n.noise3(wx * 0.085, y * 0.11, wz * 0.085);
          const c2 = n.noise3(wx * 0.04 + 77, y * 0.05 + 31, wz * 0.04 + 99);
          if (c1 > 0.63 || (c2 > 0.69 && y > 5)) {
            data[col + y * CHUNK * CHUNK] = BLOCKS.AIR;
          }
        }
        // 海洋
        if (h < SEA) {
          for (let y = h + 1; y <= SEA; y++) data[col + y * CHUNK * CHUNK] = BLOCKS.WATER;
        }
      }
    }

    // 树木：每列检查附近 ±2 范围内的树干，保证跨区块一致
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = bx + lx, wz = bz + lz;
        for (let tx = wx - 2; tx <= wx + 2; tx++) {
          for (let tz = wz - 2; tz <= wz + 2; tz++) {
            if (!this.isTreeBase(tx, tz)) continue;
            const th = this.treeHeightAt(tx, tz);
            const h = this.heightAt(tx, tz);
            const topY = h + th;
            const dx = Math.abs(wx - tx), dz = Math.abs(wz - tz);
            const col = lx + lz * CHUNK;
            // 树干
            if (dx === 0 && dz === 0) {
              for (let y = h + 1; y <= topY && y < HEIGHT; y++) {
                data[col + y * CHUNK * CHUNK] = BLOCKS.LOG;
              }
            }
            // 树冠
            for (let y = topY - 2; y <= topY + 1 && y < HEIGHT; y++) {
              if (y < h + 1) continue;
              const r = y === topY + 1 ? 1 : 2;
              if (dx > r || dz > r) continue;
              if (dx === 2 && dz === 2) continue; // 去掉最远对角，树冠更圆
              if (dx === 0 && dz === 0 && y <= topY) continue; // 树干保留
              const idx = col + y * CHUNK * CHUNK;
              if (data[idx] === BLOCKS.AIR) data[idx] = BLOCKS.LEAVES;
            }
          }
        }
      }
    }
    return data;
  };

  /* ---------------- 渲染（区块网格） ---------------- */

  MCWorld.prototype.initRenderer = function () {
    const canvas = MCTextures.canvas;
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    this._texture = texture;

    const solidMat = new THREE.MeshLambertMaterial({ map: texture, vertexColors: true });
    const cutoutMat = new THREE.MeshLambertMaterial({ map: texture, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const waterMat = new THREE.MeshLambertMaterial({
      map: texture, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide
    });
    this._materials = { solid: solidMat, cutout: cutoutMat, water: waterMat };
    return this._materials;
  };

  MCWorld.prototype._tileUV = function (name) {
    return MCTextures.tileUV(name);
  };

  MCWorld.prototype._blockFaceTiles = function (id, dir) {
    const info = INFO[id];
    const t = info.tiles;
    const tileName = t.all || (dir[1] === 1 ? t.top : (dir[1] === -1 ? (t.bottom || t.side) : t.side));
    return this._tileUV(tileName);
  };

  MCWorld.prototype._aoOccluded = function (x, y, z) {
    const id = this.getBlock(x, y, z);
    return isOpaque(id);
  };

  function disposeRecord(r) {
    for (const k of ['solid', 'cutout', 'water']) {
      const m = r[k];
      if (m) {
        m.geometry.dispose();
        m.parent && m.parent.remove(m);
      }
    }
    if (r.world && r.faces) r.world.stats.faces -= r.faces;
  }

  MCWorld.prototype.buildChunk = function (cx, cz) {
    const key = key2(cx, cz);
    const old = this.records.get(key);
    if (old) {
      disposeRecord(old);
      this.records.delete(key);
      this.stats.chunks--;
    }

    const data = this.ensureChunk(cx, cz);
    const bx = cx * CHUNK, bz = cz * CHUNK;
    const solPos = [], solNrm = [], solUv = [], solCol = [], solIdx = [];
    const cutPos = [], cutNrm = [], cutUv = [], cutCol = [], cutIdx = [];
    const watPos = [], watNrm = [], watUv = [], watCol = [], watIdx = [];
    let solV = 0, cutV = 0, watV = 0;

    const self = this;
    function aoColor(wx, wy, wz, face, i) {
      const su = (i === 1 || i === 2) ? 1 : -1;
      const sv = (i === 2 || i === 3) ? 1 : -1;
      const s1 = self._aoOccluded(wx + face.dir[0] + face.u[0] * su, wy + face.dir[1] + face.u[1] * su, wz + face.dir[2] + face.u[2] * su) ? 1 : 0;
      const s2 = self._aoOccluded(wx + face.dir[0] + face.v[0] * sv, wy + face.dir[1] + face.v[1] * sv, wz + face.dir[2] + face.v[2] * sv) ? 1 : 0;
      const cor = self._aoOccluded(wx + face.dir[0] + face.u[0] * su + face.v[0] * sv, wy + face.dir[1] + face.u[1] * su + face.v[1] * sv, wz + face.dir[2] + face.u[2] * su + face.v[2] * sv) ? 1 : 0;
      const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + cor);
      return AO_LEVEL[ao];
    }

    const P = {
      solid: { pos: solPos, nrm: solNrm, uv: solUv, col: solCol, idx: solIdx },
      cutout: { pos: cutPos, nrm: cutNrm, uv: cutUv, col: cutCol, idx: cutIdx },
      water: { pos: watPos, nrm: watNrm, uv: watUv, col: watCol, idx: watIdx }
    };

    function pushFace(target, wx, wy, wz, face, tileName, i, vBase) {
      const uv = self._tileUV(tileName);
      const uvs = [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]];
      const o = face.p0;
      const cu = [0, 1, 1, 0][i];
      const cv = [0, 0, 1, 1][i];
      const ox = o[0] + face.u[0] * cu + face.v[0] * cv;
      const oy = o[1] + face.u[1] * cu + face.v[1] * cv;
      const oz = o[2] + face.u[2] * cu + face.v[2] * cv;
      target.pos.push(wx + ox, wy + oy, wz + oz);
      target.nrm.push(face.dir[0], face.dir[1], face.dir[2]);
      let u = uvs[i][0], v = uvs[i][1];
      if (face.flip) u = uv.u0 + (uv.u1 - u);
      target.uv.push(u, v);
      const l = aoColor(wx, wy, wz, face, i);
      target.col.push(l, l, l);
      void vBase;
    }

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        for (let y = 0; y < HEIGHT; y++) {
          const id = data[lx + lz * CHUNK + y * CHUNK * CHUNK];
          if (id === BLOCKS.AIR) continue;
          const wx = bx + lx, wz = bz + lz;
          const info = INFO[id];
          const cutout = !!info.cutout;
          const water = id === BLOCKS.WATER;
          const target = water ? P.water : (cutout ? P.cutout : P.solid);
          const vBase = water ? watV : (cutout ? cutV : solV);

          for (const face of FACES) {
            const nid = self.getBlock(wx + face.dir[0], y + face.dir[1], wz + face.dir[2]);
            if (isOpaque(nid)) continue;
            let show = false;
            if (water) {
              show = nid === BLOCKS.AIR;
            } else if (cutout) {
              show = nid === BLOCKS.AIR || nid === BLOCKS.WATER;
            } else {
              show = true; // 邻居是空气/水/玻璃/树叶等非不透明块
            }
            if (!show) continue;
            const t = info.tiles;
            const tileName = t.all || (face.dir[1] === 1 ? t.top : (face.dir[1] === -1 ? (t.bottom || t.side) : t.side));
            const v0 = water ? watV : (cutout ? cutV : solV);
            for (let i = 0; i < 4; i++) pushFace(target, wx, y, wz, face, tileName, i, v0 + i);
            target.idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
            if (water) watV = v0 + 4; else if (cutout) cutV = v0 + 4; else solV = v0 + 4;
          }
        }
      }
    }

    const rec = { cx: cx, cz: cz, dirty: false, solid: null, cutout: null, water: null, faces: 0, world: this };
    const mats = this._materials;
    const addMesh = (name, pos, nrm, uv, col, idx) => {
      if (!pos.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, mats[name]);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      rec[name] = mesh;
      rec.faces += idx.length / 3;
    };
    addMesh('solid', solPos, solNrm, solUv, solCol, solIdx);
    addMesh('cutout', cutPos, cutNrm, cutUv, cutCol, cutIdx);
    addMesh('water', watPos, watNrm, watUv, watCol, watIdx);

    this.records.set(key, rec);
    this.stats.chunks++;
    this.stats.faces += rec.faces;
    this.stats.built++;
    return rec;
  };

  MCWorld.prototype._enqueueNeeded = function (pcx, pcz) {
    const R = this.renderDistance;
    for (let cz = pcz - R; cz <= pcz + R; cz++) {
      for (let cx = pcx - R; cx <= pcx + R; cx++) {
        const k = key2(cx, cz);
        if (!this.records.has(k)) {
          let inQueue = false;
          for (const q of this.queue) if (q.cx === cx && q.cz === cz) { inQueue = true; break; }
          if (!inQueue) this.queue.push({ cx: cx, cz: cz });
        }
      }
    }
  };

  MCWorld.prototype.update = function (px, pz) {
    const pcx = Math.floor(px / CHUNK);
    const pcz = Math.floor(pz / CHUNK);
    this._enqueueNeeded(pcx, pcz);

    // 移除过远的区块
    const R = this.renderDistance;
    for (const [k, rec] of this.records) {
      if (Math.abs(rec.cx - pcx) > R + 1 || Math.abs(rec.cz - pcz) > R + 1) {
        disposeRecord(rec);
        this.records.delete(k);
        this.stats.chunks--;
        // 保留 diff；地形数据可安全释放
      }
    }
    for (const [k, data] of this.chunks) {
      const p = k.split(',');
      const cx = +p[0], cz = +p[1];
      if (Math.abs(cx - pcx) > R + 3 || Math.abs(cz - pcz) > R + 3) {
        if (!this.records.has(k)) this.chunks.delete(k);
      }
    }

    // 排序：优先构建玩家附近的区块
    this.queue.sort((a, b) => {
      const da = (a.cx - pcx) * (a.cx - pcx) + (a.cz - pcz) * (a.cz - pcz);
      const db = (b.cx - pcx) * (b.cx - pcx) + (b.cz - pcz) * (b.cz - pcz);
      return da - db;
    });

    let budget = this.buildBudget;
    while (budget > 0 && this.queue.length) {
      const q = this.queue.shift();
      if (this.records.has(key2(q.cx, q.cz))) {
        if (!this.records.get(key2(q.cx, q.cz)).dirty) continue;
      }
      this.buildChunk(q.cx, q.cz);
      budget--;
    }
  };

  /* ---------------- 射线检测（DDA） ---------------- */

  MCWorld.prototype.raycast = function (ox, oy, oz, dx, dy, dz, maxDist) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxX = dx !== 0 ? (dx > 0 ? (x + 1 - ox) : (ox - x)) * tDeltaX : Infinity;
    let tMaxY = dy !== 0 ? (dy > 0 ? (y + 1 - oy) : (oy - y)) * tDeltaY : Infinity;
    let tMaxZ = dz !== 0 ? (dz > 0 ? (z + 1 - oz) : (oz - z)) * tDeltaZ : Infinity;
    let nx = 0, ny = 0, nz = 0;
    let t = 0;
    let first = true;

    while (t <= maxDist) {
      const id = this.getBlock(x, y, z);
      if (!first && id !== BLOCKS.AIR) {
        return { x: x, y: y, z: z, nx: nx, ny: ny, nz: nz, dist: t, id: id };
      }
      first = false;
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
      }
    }
    return null;
  };

  /* ---------------- 存档 ---------------- */

  MCWorld.prototype.toJSON = function () {
    const diffs = [];
    for (const [k, id] of this.diffs) {
      const p = k.split(',').map(Number);
      diffs.push([p[0], p[1], p[2], id]);
    }
    return { seed: this.seed, diffs: diffs };
  };

  MCWorld.prototype.loadJSON = function (json) {
    this.diffs.clear();
    this.chunkDiffs.clear();
    if (json && Array.isArray(json.diffs)) {
      for (const d of json.diffs) {
        const x = d[0], y = d[1], z = d[2], id = d[3];
        this.diffs.set(key3(x, y, z), id);
        const c = this.chunkOf(x, z);
        const k = key2(c.cx, c.cz);
        let list = this.chunkDiffs.get(k);
        if (!list) { list = []; this.chunkDiffs.set(k, list); }
        list.push({ x: x, y: y, z: z, id: id });
      }
    }
    // 清理所有已生成数据，让其按 diff 重新生成
    for (const [k, r] of this.records) {
      disposeRecord(r);
      this.records.delete(k);
    }
    this.chunks.clear();
    this.heightCache.clear();
    this.stats.chunks = 0;
    this.stats.faces = 0;
    this.stats.built = 0;
  };

  MCWorld.prototype.destroy = function () {
    for (const [k, r] of this.records) disposeRecord(r);
    this.records.clear();
    this.chunks.clear();
    this.heightCache.clear();
    this.diffs.clear();
  };

  window.MCBlocks = BLOCKS;
  window.MCWorld = MCWorld;
  window.MC_SEA = SEA;
  window.MC_HEIGHT = HEIGHT;
})();
