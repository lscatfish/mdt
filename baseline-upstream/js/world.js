/* 体素世界：区块生成、网格构建、方块读写 */
(function (global) {
  'use strict';

  const CS = 16;       // 区块边长
  const HEIGHT = 96;   // 世界高度
  const WATER_LEVEL = 33;
  const STORAGE_KEY = 'webcraft_world_v1';
  const BLOCK = Blocks.BLOCK;

  const FACES = [
    { key: 'px', n: [1, 0, 0],  u: [0, 0, -1], v: [0, 1, 0],  origin: [1, 0, 1], shade: 0.74 },
    { key: 'nx', n: [-1, 0, 0], u: [0, 0, 1],  v: [0, 1, 0],  origin: [0, 0, 0], shade: 0.74 },
    { key: 'py', n: [0, 1, 0],  u: [1, 0, 0],  v: [0, 0, -1], origin: [0, 1, 1], shade: 1.00 },
    { key: 'ny', n: [0, -1, 0], u: [1, 0, 0],  v: [0, 0, 1],  origin: [0, 0, 0], shade: 0.52 },
    { key: 'pz', n: [0, 0, 1],  u: [1, 0, 0],  v: [0, 1, 0],  origin: [0, 0, 1], shade: 0.84 },
    { key: 'nz', n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0],  origin: [1, 0, 0], shade: 0.84 }
  ];

  const AO_BRIGHTNESS = [0.45, 0.62, 0.80, 1.00];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function bytesToBase64(bytes) {
    let bin = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + step, bytes.length)));
    }
    return btoa(bin);
  }

  function base64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  class Chunk {
    constructor(world, cx, cz) {
      this.world = world;
      this.cx = cx;
      this.cz = cz;
      this.data = new Uint8Array(CS * CS * HEIGHT);
      this.generated = false;
      this.dirty = true;
      this.meshBuilt = false;
      this.inQueue = false;
      this.opaqueMesh = null;
      this.transparentMesh = null;
    }

    idx(x, y, z) { return (y * CS + z) * CS + x; }

    getLocal(x, y, z) {
      if (y < 0 || y >= HEIGHT) return BLOCK.AIR;
      return this.data[this.idx(x, y, z)];
    }

    setLocal(x, y, z, id) {
      if (y < 0 || y >= HEIGHT) return;
      this.data[this.idx(x, y, z)] = id;
    }

    generate() {
      const world = this.world;
      const baseX = this.cx * CS, baseZ = this.cz * CS;
      const data = this.data;

      for (let lx = 0; lx < CS; lx++) {
        for (let lz = 0; lz < CS; lz++) {
          const wx = baseX + lx, wz = baseZ + lz;
          const h = world.heightAt(wx, wz);

          for (let y = 0; y <= h; y++) {
            let id = BLOCK.STONE;
            if (y === 0) id = BLOCK.BEDROCK;
            else if (y >= h - 3) id = BLOCK.DIRT;

            if (h <= WATER_LEVEL + 1) {
              // 海滩 / 海底：表层铺沙
              if (y === h) id = BLOCK.SAND;
              else if (y >= h - 2) id = BLOCK.SAND;
            } else if (y === h) {
              if (h >= 62) id = BLOCK.SNOW;
              else id = BLOCK.GRASS;
            }
            data[this.idx(lx, y, lz)] = id;
          }

          // 水面填充
          for (let y = h + 1; y <= WATER_LEVEL; y++) {
            data[this.idx(lx, y, lz)] = BLOCK.WATER;
          }
        }
      }

      // 地下洞穴（使用 3D 噪声侵蚀）
      for (let lx = 0; lx < CS; lx++) {
        for (let lz = 0; lz < CS; lz++) {
          const wx = baseX + lx, wz = baseZ + lz;
          const h = world.heightAt(wx, wz);
          for (let y = 4; y <= Math.max(4, h - 3); y++) {
            const cave = world.perlin.fbm3(wx * 0.075, y * 0.115, wz * 0.075, 2, 2, 0.55);
            if (cave > 0.40 && data[this.idx(lx, y, lz)] !== BLOCK.BEDROCK) {
              data[this.idx(lx, y, lz)] = BLOCK.AIR;
            }
          }
        }
      }

      // 树木
      for (let lx = 2; lx <= CS - 3; lx++) {
        for (let lz = 2; lz <= CS - 3; lz++) {
          const wx = baseX + lx, wz = baseZ + lz;
          const h = world.heightAt(wx, wz);
          if (h <= WATER_LEVEL + 1 || data[this.idx(lx, h, lz)] !== BLOCK.GRASS) continue;

          const r = NoiseUtil.hash2(wx, wz, world.seed ^ 0x9e3779b9);
          if (r > 0.012) continue;

          const trunkH = 4 + Math.floor(r * 1000) % 3;
          for (let i = 1; i <= trunkH; i++) this.setLocal(lx, h + i, lz, BLOCK.WOOD);

          for (let dy = trunkH - 2; dy <= trunkH + 1; dy++) {
            const radius = dy >= trunkH ? (dy === trunkH + 1 ? 1 : 2) : 2;
            for (let dx = -radius; dx <= radius; dx++) {
              for (let dz = -radius; dz <= radius; dz++) {
                if (dx === 0 && dz === 0 && dy <= trunkH) continue;
                if (Math.abs(dx) === radius && Math.abs(dz) === radius && NoiseUtil.hash2(wx + dx, wz + dz, 77) < 0.55) continue;
                const y = h + dy;
                if (this.getLocal(lx + dx, y, lz + dz) === BLOCK.AIR) {
                  this.setLocal(lx + dx, y, lz + dz, BLOCK.LEAVES);
                }
              }
            }
          }
        }
      }

      // 应用玩家保存过的修改
      const saved = world.changes.get(this.key());
      if (saved) this.data.set(saved);

      this.generated = true;
      this.dirty = true;
    }

    key() { return this.cx + ',' + this.cz; }

    disposeMeshes() {
      if (this.opaqueMesh) {
        this.opaqueMesh.geometry.dispose();
        this.world.group.remove(this.opaqueMesh);
        this.opaqueMesh = null;
      }
      if (this.transparentMesh) {
        this.transparentMesh.geometry.dispose();
        this.world.group.remove(this.transparentMesh);
        this.transparentMesh = null;
      }
      this.meshBuilt = false;
    }

    buildMesh() {
      this.disposeMeshes();
      const result = buildChunkGeometry(this.world, this);
      if (result.opaque.count > 0) {
        const geo = geometryFromArrays(result.opaque);
        this.opaqueMesh = new THREE.Mesh(geo, this.world.opaqueMaterial);
        this.opaqueMesh.matrixAutoUpdate = false;
        this.opaqueMesh.position.set(0, 0, 0);
        this.opaqueMesh.updateMatrix();
        this.world.group.add(this.opaqueMesh);
      }
      if (result.transparent.count > 0) {
        const geo = geometryFromArrays(result.transparent);
        this.transparentMesh = new THREE.Mesh(geo, this.world.transparentMaterial);
        this.transparentMesh.matrixAutoUpdate = false;
        this.transparentMesh.position.set(0, 0, 0);
        this.transparentMesh.updateMatrix();
        this.world.group.add(this.transparentMesh);
      }
      this.meshBuilt = true;
      this.dirty = false;
    }
  }

  class MeshArrays {
    constructor() {
      this.pos = [];
      this.uv = [];
      this.col = [];
      this.nor = [];
      this.idx = [];
      this.count = 0;
    }
  }

  function geometryFromArrays(arr) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(arr.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arr.col, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(arr.nor, 3));
    geo.setIndex(arr.idx);
    geo.computeBoundingSphere();
    return geo;
  }

  function buildChunkGeometry(world, chunk) {
    const opaque = new MeshArrays();
    const transparent = new MeshArrays();
    const TILES = Blocks.TILES;
    const data = chunk.data;

    function pushFace(arr, face, lx, y, lz, blockId) {
      const tile = Blocks.getTileIndex(blockId, face.key);
      const tileCol = tile % 4;
      const tileRow = Math.floor(tile / 4);
      const u0 = tileCol / TILES;
      const u1 = (tileCol + 1) / TILES;
      // three.js flipY=true：画布顶部对应 v=1
      const v0 = 1 - (tileRow + 1) / TILES;
      const v1 = 1 - tileRow / TILES;

      const n = face.n, u = face.u, v = face.v, o = face.origin;
      const base = arr.count * 4;

      for (let c = 0; c < 4; c++) {
        let qx, qy, qz, lu, lv;
        if (c === 0) { qx = o[0]; qy = o[1]; qz = o[2]; lu = 0; lv = 0; }
        else if (c === 1) { qx = o[0] + u[0]; qy = o[1] + u[1]; qz = o[2] + u[2]; lu = 1; lv = 0; }
        else if (c === 2) { qx = o[0] + u[0] + v[0]; qy = o[1] + u[1] + v[1]; qz = o[2] + u[2] + v[2]; lu = 1; lv = 1; }
        else { qx = o[0] + v[0]; qy = o[1] + v[1]; qz = o[2] + v[2]; lu = 0; lv = 1; }

        let ao = 3;
        if (Blocks.isOpaque(blockId)) {
          // 顶点环境光遮蔽：四个顶点分别采样两个邻边与斜对角
          let ax, ay, az, bx, by, bz, dx, dy, dz;
          if (c === 0) {
            ax = qx + u[0]; ay = qy + u[1]; az = qz + u[2];
            bx = qx + v[0]; by = qy + v[1]; bz = qz + v[2];
            dx = qx + u[0] + v[0]; dy = qy + u[1] + v[1]; dz = qz + u[2] + v[2];
          } else if (c === 1) {
            ax = qx - u[0]; ay = qy - u[1]; az = qz - u[2];
            bx = qx + v[0]; by = qy + v[1]; bz = qz + v[2];
            dx = qx - u[0] + v[0]; dy = qy - u[1] + v[1]; dz = qz - u[2] + v[2];
          } else if (c === 2) {
            ax = qx - u[0]; ay = qy - u[1]; az = qz - u[2];
            bx = qx - v[0]; by = qy - v[1]; bz = qz - v[2];
            dx = qx - u[0] - v[0]; dy = qy - u[1] - v[1]; dz = qz - u[2] - v[2];
          } else {
            ax = qx + u[0]; ay = qy + u[1]; az = qz + u[2];
            bx = qx - v[0]; by = qy - v[1]; bz = qz - v[2];
            dx = qx + u[0] - v[0]; dy = qy + u[1] - v[1]; dz = qz + u[2] - v[2];
          }
          const s1 = Blocks.isOpaque(world.getBlock(chunk.cx * CS + lx + ax, y + ay, chunk.cz * CS + lz + az)) ? 1 : 0;
          const s2 = Blocks.isOpaque(world.getBlock(chunk.cx * CS + lx + bx, y + by, chunk.cz * CS + lz + bz)) ? 1 : 0;
          const sc = Blocks.isOpaque(world.getBlock(chunk.cx * CS + lx + dx, y + dy, chunk.cz * CS + lz + dz)) ? 1 : 0;
          ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + sc);
        }

        const brightness = face.shade * AO_BRIGHTNESS[ao];

        arr.pos.push(chunk.cx * CS + lx + qx, y + qy, chunk.cz * CS + lz + qz);
        arr.nor.push(n[0], n[1], n[2]);
        arr.uv.push(u0 + lu * (u1 - u0), v0 + lv * (v1 - v0));
        arr.col.push(brightness, brightness, brightness);
      }

      arr.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      arr.count++;
    }

    function shouldDraw(blockId, neighborId) {
      if (Blocks.isOpaque(blockId)) {
        return !Blocks.isOpaque(neighborId);
      }
      // 透明方块（水 / 玻璃）：同种相邻不画，背后是不透明块不画
      if (Blocks.isOpaque(neighborId)) return false;
      return neighborId !== blockId;
    }

    for (let lx = 0; lx < CS; lx++) {
      for (let lz = 0; lz < CS; lz++) {
        for (let y = 0; y < HEIGHT; y++) {
          const id = data[chunk.idx(lx, y, lz)];
          if (id === BLOCK.AIR) continue;

          for (let f = 0; f < FACES.length; f++) {
            const face = FACES[f];
            const neighbor = world.getBlock(
              chunk.cx * CS + lx + face.n[0],
              y + face.n[1],
              chunk.cz * CS + lz + face.n[2]
            );
            if (!shouldDraw(id, neighbor)) continue;

            const target = Blocks.isOpaque(id) ? opaque : transparent;
            pushFace(target, face, lx, y, lz, id);
          }
        }
      }
    }

    return { opaque, transparent };
  }

  class World {
    constructor(seed, scene) {
      this.seed = seed >>> 0;
      this.storageKey = STORAGE_KEY + '_seed_' + this.seed;
      this.perlin = new NoiseUtil.Perlin(this.seed);
      this.group = new THREE.Group();
      this.group.name = 'world';
      scene.add(this.group);

      const atlas = Blocks.buildAtlas(this.seed);
      this.atlasCanvas = atlas.canvas;
      this.atlasTexture = atlas.texture;

      this.opaqueMaterial = new THREE.MeshBasicMaterial({
        map: this.atlasTexture,
        vertexColors: true,
        side: THREE.FrontSide
      });
      this.transparentMaterial = new THREE.MeshBasicMaterial({
        map: this.atlasTexture,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide
      });

      this.chunks = new Map();
      this.renderDistance = 4;
      this.meshQueue = [];
      this.changes = new Map();
      this.saveTimer = 0;
      this.loadChanges();
    }

    loadChanges() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        if (!raw) return;
        const obj = JSON.parse(raw);
        Object.keys(obj).forEach(function (k) {
          this.changes.set(k, base64ToBytes(obj[k]));
        }, this);
      } catch (e) {
        // 存档损坏时忽略，重新开始
      }
    }

    scheduleSave() {
      if (this.saveTimer) return;
      this.saveTimer = setTimeout(() => {
        this.saveTimer = 0;
        this.saveChanges();
      }, 300);
    }

    saveChanges() {
      try {
        const obj = {};
        this.changes.forEach(function (bytes, key) { obj[key] = bytesToBase64(bytes); });
        localStorage.setItem(this.storageKey, JSON.stringify(obj));
      } catch (e) {
        // localStorage 满或不可用时静默失败
      }
    }

    heightAt(wx, wz) {
      const p = this.perlin;
      let h = 42
        + p.fbm2(wx * 0.0038, wz * 0.0038, 4) * 34
        + p.fbm2(wx * 0.017 + 137.3, wz * 0.017 + 91.7, 2) * 6
        + p.fbm2(wx * 0.0009 + 51.7, wz * 0.0009 + 17.3, 2) * 10;
      return clamp(Math.floor(h), 4, HEIGHT - 14);
    }

    chunkKey(cx, cz) { return cx + ',' + cz; }

    getChunk(cx, cz) { return this.chunks.get(this.chunkKey(cx, cz)); }

    ensureChunkData(cx, cz) {
      let chunk = this.getChunk(cx, cz);
      if (!chunk) {
        chunk = new Chunk(this, cx, cz);
        this.chunks.set(chunk.key(), chunk);
        chunk.generate();
      }
      return chunk;
    }

    getBlock(wx, wy, wz) {
      if (wy < 0) return BLOCK.BEDROCK;
      if (wy >= HEIGHT) return BLOCK.AIR;
      const chunk = this.getChunk(Math.floor(wx / CS), Math.floor(wz / CS));
      if (!chunk) return BLOCK.AIR;
      return chunk.getLocal(wx - chunk.cx * CS, wy, wz - chunk.cz * CS);
    }

    setBlock(wx, wy, wz, id) {
      if (wy < 0 || wy >= HEIGHT) return false;
      const cx = Math.floor(wx / CS), cz = Math.floor(wz / CS);
      const chunk = this.getChunk(cx, cz);
      if (!chunk) return false;

      const lx = wx - cx * CS, lz = wz - cz * CS;
      chunk.setLocal(lx, wy, lz, id);
      chunk.dirty = true;
      this.changes.set(chunk.key(), chunk.data.slice());
      this.scheduleSave();

      // 位于区块边缘时，相邻区块也要重建（保证面剔除正确）
      if (lx === 0) this.markDirty(cx - 1, cz);
      if (lx === CS - 1) this.markDirty(cx + 1, cz);
      if (lz === 0) this.markDirty(cx, cz - 1);
      if (lz === CS - 1) this.markDirty(cx, cz + 1);

      // 编辑操作立刻重建相关区块，给玩家即时反馈
      this.buildChunkNow(chunk);
      if (lx === 0) this.buildChunkNow(this.getChunk(cx - 1, cz));
      if (lx === CS - 1) this.buildChunkNow(this.getChunk(cx + 1, cz));
      if (lz === 0) this.buildChunkNow(this.getChunk(cx, cz - 1));
      if (lz === CS - 1) this.buildChunkNow(this.getChunk(cx, cz + 1));
      return true;
    }

    markDirty(cx, cz) {
      const chunk = this.getChunk(cx, cz);
      if (chunk) {
        chunk.dirty = true;
        if (!chunk.inQueue && chunk.generated) {
          chunk.inQueue = true;
          this.meshQueue.push(chunk);
        }
      }
    }

    buildChunkNow(chunk) {
      if (!chunk || !chunk.generated) return;
      const qi = this.meshQueue.indexOf(chunk);
      if (qi !== -1) this.meshQueue.splice(qi, 1);
      chunk.inQueue = false;
      chunk.buildMesh();
    }

    neighborDataReady(chunk) {
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let i = 0; i < n.length; i++) {
        const nb = this.getChunk(chunk.cx + n[i][0], chunk.cz + n[i][1]);
        if (!nb || !nb.generated) return false;
      }
      return true;
    }

    /* 同步生成出生点附近区块，避免玩家开局坠落 */
    initialLoad(cx, cz, radius) {
      const R = radius;
      for (let dx = -R - 1; dx <= R + 1; dx++) {
        for (let dz = -R - 1; dz <= R + 1; dz++) {
          if (dx * dx + dz * dz <= (R + 1) * (R + 1)) this.ensureChunkData(cx + dx, cz + dz);
        }
      }
      const list = [];
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          if (dx * dx + dz * dz <= R * R) {
            const c = this.getChunk(cx + dx, cz + dz);
            if (c) list.push(c);
          }
        }
      }
      list.sort((a, b) => {
        const da = (a.cx - cx) ** 2 + (a.cz - cz) ** 2;
        const db = (b.cx - cx) ** 2 + (b.cz - cz) ** 2;
        return da - db;
      });
      for (const c of list) this.buildChunkNow(c);
    }

    update(playerX, playerZ, maxMeshPerFrame) {
      const pcx = Math.floor(playerX / CS);
      const pcz = Math.floor(playerZ / CS);
      const R = this.renderDistance;

      // 1. 准备可见范围 + 一圈邻接区块的数据
      for (let dx = -R - 1; dx <= R + 1; dx++) {
        for (let dz = -R - 1; dz <= R + 1; dz++) {
          if (dx * dx + dz * dz <= (R + 1) * (R + 1)) {
            this.ensureChunkData(pcx + dx, pcz + dz);
          }
        }
      }

      // 2. 需要建网格的区块，按离玩家距离排序
      const pending = [];
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          const dist = dx * dx + dz * dz;
          if (dist > R * R) continue;
          const chunk = this.getChunk(pcx + dx, pcz + dz);
          if (!chunk || chunk.meshBuilt && !chunk.dirty) continue;
          if (!this.neighborDataReady(chunk)) continue;
          if (!chunk.inQueue) {
            chunk.inQueue = true;
            pending.push(chunk);
          }
        }
      }
      pending.sort((a, b) => {
        const da = (a.cx - pcx) ** 2 + (a.cz - pcz) ** 2;
        const db = (b.cx - pcx) ** 2 + (b.cz - pcz) ** 2;
        return da - db;
      });
      for (const c of pending) this.meshQueue.push(c);

      // 3. 本帧最多构建几个区块
      let built = 0;
      while (built < maxMeshPerFrame && this.meshQueue.length) {
        const chunk = this.meshQueue.shift();
        if (!chunk) break;
        chunk.inQueue = false;
        if (this.chunks.get(chunk.key()) !== chunk) continue;
        if (!chunk.generated || !this.neighborDataReady(chunk)) continue;
        this.buildChunkNow(chunk);
        built++;
      }

      // 4. 卸载远处的区块
      const limit = (R + 2) * (R + 2);
      this.chunks.forEach((chunk, key) => {
        const dx = chunk.cx - pcx, dz = chunk.cz - pcz;
        if (dx * dx + dz * dz > limit) {
          chunk.disposeMeshes();
          this.chunks.delete(key);
        }
      });
    }

    findSpawn() {
      // 在出生点附近寻找上方空旷的草地
      for (let r = 0; r < 8; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const wx = 8 + dx, wz = 8 + dz;
            this.ensureChunkData(Math.floor(wx / CS), Math.floor(wz / CS));
            const h = this.heightAt(wx, wz);
            const ground = this.getBlock(wx, h, wz);
            if (ground !== BLOCK.GRASS && ground !== BLOCK.SAND) continue;
            if (this.getBlock(wx, h + 1, wz) !== BLOCK.AIR) continue;
            if (this.getBlock(wx, h + 2, wz) !== BLOCK.AIR) continue;
            if (this.getBlock(wx, h + 3, wz) !== BLOCK.AIR) continue;
            return { x: wx + 0.5, y: h + 1, z: wz + 0.5 };
          }
        }
      }
      return { x: 8.5, y: this.heightAt(8, 8) + 2, z: 8.5 };
    }
  }

  global.World = World;
  global.WorldConst = { CS, HEIGHT, WATER_LEVEL, STORAGE_KEY };
})(window);
