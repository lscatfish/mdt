/* ============================================================
 * main.js — 游戏主循环与玩法逻辑
 * ============================================================ */
(function (global) {
  'use strict';

  const SAVE_KEY = 'webcraft_save_v2';
  const VIEW_DIST = 5;        // 渲染半径（区块）
  const GEN_DIST = VIEW_DIST + 1;
  const REACH = 6;
  const CX = MCWorld.CX, CZ = MCWorld.CZ;
  const AIR = MCWorld.AIR, WATER = MCWorld.WATER;
  const HOTBAR = [1, 2, 3, 4, 5, 6, 7, 16, 8];

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s && s.v === 2 && typeof s.seed === 'number') return s;
      return null;
    } catch (e) { return null; }
  }

  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.started = false;
      this.running = true;
      this.time = 0;
      this.particles = [];
      this.selected = 0;
      this.hit = null;
      this.lastBreakTime = 0;
      this.lastPlaceTime = 0;
      this.prevInWater = false;
      this.fpsTimer = 0;
      this.fpsFrames = 0;
      this.fps = 0;
      this.meshQueue = [];
      this.cloudCX = null;
      this.cloudCZ = null;
      this.autosaveTimer = 0;
      this.audio = new MCAudio();
    }

    init() {
      // 纹理图集（供网格/渲染器使用）
      MCTextures.textures = MCTextures.buildAtlas();

      // 存档 & 世界
      const save = loadSave();
      const seed = save ? save.seed : ((Math.random() * 0x7fffffff) | 0);
      this.world = new MCWorld.World(seed);
      if (save && save.edits) this.world.edits = save.edits;
      this.seed = seed;

      this.renderer = new MCRenderer.Renderer(this.canvas);
      this.renderer.setFogDistance(VIEW_DIST * CX);

      // 玩家
      this.player = new MCPlayer.Player(this.world);
      const spawn = this.world.findSpawn();
      this.player.spawnAt(spawn);

      // 输入
      this.input = new MCPlayer.Input();
      this.input.attach(this.canvas);
      this.input.onLockChange = (locked) => this.onLockChange(locked);

      // UI
      this.buildHotbar();
      this.bindUI();

      window.addEventListener('resize', () => this.renderer.resize());
      window.addEventListener('beforeunload', () => this.save());

      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }

    buildHotbar() {
      const container = document.getElementById('hotbar-slots');
      container.innerHTML = '';
      for (let i = 0; i < HOTBAR.length; i++) {
        const div = document.createElement('div');
        div.className = 'slot' + (i === this.selected ? ' selected' : '');
        div.dataset.slot = i;
        const tile = MCTextures.Blocks[HOTBAR[i]].icon;
        const uv = MCTextures.textures.tileUVs[tile];
        div.style.backgroundImage = 'url(' + MCTextures.textures.canvas.toDataURL() + ')';
        div.style.backgroundSize = (8 * 48) + 'px ' + (4 * 48) + 'px';
        div.style.backgroundPosition = (-uv.col * 48) + 'px ' + (-uv.row * 48) + 'px';
        const num = document.createElement('span');
        num.className = 'slot-num';
        num.textContent = String(i + 1);
        div.appendChild(num);
        container.appendChild(div);
      }
      this.updateHotbar();
    }

    updateHotbar() {
      const slots = document.querySelectorAll('#hotbar-slots .slot');
      slots.forEach((el, i) => el.classList.toggle('selected', i === this.selected));
      document.getElementById('block-name').textContent = MCTextures.Blocks[HOTBAR[this.selected]].name;
    }

    bindUI() {
      const show = (id) => document.getElementById(id).classList.remove('hidden');
      const hide = (id) => document.getElementById(id).classList.add('hidden');

      const tryLock = () => {
        this.input.requestLock(this.canvas);
        // 若浏览器未能锁定鼠标（如某些环境不支持指针锁定），给出暂停面板以便重试
        setTimeout(() => {
          if (this.started && !this.input.locked) {
            document.getElementById('pause-screen').classList.remove('hidden');
          }
        }, 400);
      };

      document.getElementById('btn-play').addEventListener('click', () => {
        this.audio.ensure();
        this.started = true;
        hide('start-screen');
        show('crosshair');
        show('hotbar');
        show('debug');
        tryLock();
      });

      document.getElementById('btn-resume').addEventListener('click', () => {
        hide('pause-screen');
        tryLock();
      });

      const reset = () => {
        clearSave();
        location.reload();
      };
      document.getElementById('btn-reset-world').addEventListener('click', reset);
      document.getElementById('btn-pause-reset').addEventListener('click', reset);
      document.getElementById('help-close').addEventListener('click', () => hide('help'));

      // 画布点击重新锁定（暂停后）
      this.canvas.addEventListener('click', () => {
        if (this.started && !this.input.locked) this.input.requestLock(this.canvas);
      });
      // 点击暂停面板空白处也可重新进入
      document.getElementById('pause-screen').addEventListener('click', (e) => {
        if (e.target.id === 'pause-screen' && this.started) tryLock();
      });
    }

    onLockChange(locked) {
      if (!this.started) return;
      if (locked) {
        document.getElementById('pause-screen').classList.add('hidden');
        document.getElementById('help').classList.add('hidden');
      } else {
        this.save();
        document.getElementById('pause-screen').classList.remove('hidden');
      }
    }

    // ---------------- 射线拾取 ----------------
    raycast(ox, oy, oz, dx, dy, dz) {
      let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
      const stepX = dx > 0 ? 1 : -1;
      const stepY = dy > 0 ? 1 : -1;
      const stepZ = dz > 0 ? 1 : -1;
      const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
      const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
      const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
      let tMaxX = dx !== 0 ? ((dx > 0 ? x + 1 - ox : ox - x) * tDeltaX) : Infinity;
      let tMaxY = dy !== 0 ? ((dy > 0 ? y + 1 - oy : oy - y) * tDeltaY) : Infinity;
      let tMaxZ = dz !== 0 ? ((dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ) : Infinity;
      let nx = 0, ny = 0, nz = 0;

      for (let i = 0; i < 256; i++) {
        const id = this.world.getBlock(x, y, z);
        if (id === null) return null;               // 目标区块未加载
        if (id !== AIR) return { x, y, z, nx, ny, nz, id };
        if (tMaxX < tMaxY && tMaxX < tMaxZ) {
          if (tMaxX > REACH) return null;
          x += stepX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
        } else if (tMaxY < tMaxZ) {
          if (tMaxY > REACH) return null;
          y += stepY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
        } else {
          if (tMaxZ > REACH) return null;
          z += stepZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
        }
      }
      return null;
    }

    spawnParticles(x, y, z, id) {
      const tint = MCTextures.Blocks[id].tint;
      for (let i = 0; i < 12; i++) {
        this.particles.push({
          x: x + 0.5, y: y + 0.5, z: z + 0.5,
          vx: (Math.random() - 0.5) * 3.4,
          vy: Math.random() * 3.2 + 0.6,
          vz: (Math.random() - 0.5) * 3.4,
          life: 0.5 + Math.random() * 0.6,
          maxLife: 1.1,
          r: tint[0] / 255, g: tint[1] / 255, b: tint[2] / 255, a: 1
        });
      }
      if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
    }

    updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) { this.particles.splice(i, 1); continue; }
        p.vy -= 14 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const below = this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.1), Math.floor(p.z));
        if (below !== null && below !== AIR && below !== WATER) {
          p.y = Math.floor(p.y - 0.1) + 1.05;
          p.vy *= -0.25;
          p.vx *= 0.6; p.vz *= 0.6;
        }
        p.a = Math.min(1, p.life / 0.35);
      }
    }

    // ---------------- 破坏 / 放置 ----------------
    tryBreak(now) {
      if (!this.hit) return;
      const { x, y, z, id } = this.hit;
      if (id === 10) return; // 基岩不可破坏
      if (this.world.setBlock(x, y, z, AIR)) {
        this.spawnParticles(x, y, z, id);
        this.audio.breakBlock(id);
      }
    }

    tryPlace() {
      if (!this.hit) return;
      const { x, y, z, nx, ny, nz } = this.hit;
      const px = x + nx, py = y + ny, pz = z + nz;
      if (py < 0 || py >= MCWorld.H) return;
      const cur = this.world.getBlock(px, py, pz);
      if (cur === null) return;
      if (cur !== AIR && cur !== WATER) return;
      if (this.player.intersectsBlock(px, py, pz)) return;
      const id = HOTBAR[this.selected];
      if (this.world.setBlock(px, py, pz, id)) {
        this.audio.placeBlock();
      }
    }

    // ---------------- 区块流式加载 ----------------
    updateChunks() {
      const pcx = Math.floor(this.player.pos.x / CX);
      const pcz = Math.floor(this.player.pos.z / CZ);

      // 1. 收集需要生成/加载的区块，按距离排序
      const want = [];
      for (let dz = -GEN_DIST; dz <= GEN_DIST; dz++) {
        for (let dx = -GEN_DIST; dx <= GEN_DIST; dx++) {
          const cx = pcx + dx, cz = pcz + dz;
          if (!this.world.chunks.has(MCWorld.chunkKey(cx, cz))) {
            want.push([cx, cz, dx * dx + dz * dz]);
          }
        }
      }
      want.sort((a, b) => a[2] - b[2]);

      // 2. 每帧生成有限数量
      let genBudget = 3;
      for (const [cx, cz] of want) {
        if (genBudget <= 0) break;
        const chunk = this.world.generateChunk(cx, cz);
        // 新块到来，邻居边缘需要重算
        this.world.markDirty(cx - 1, cz);
        this.world.markDirty(cx + 1, cz);
        this.world.markDirty(cx, cz - 1);
        this.world.markDirty(cx, cz + 1);
        genBudget--;
      }

      // 3. 重建脏区块网格（有时间预算）
      let meshBudget = 2;
      const t0 = performance.now();
      for (const chunk of this.world.chunks.values()) {
        if (!chunk.dirty || !this.world.canMesh(chunk)) continue;
        if (meshBudget <= 0) break;
        if (performance.now() - t0 > 7) break;
        const meshes = MCMesher.buildChunkMesh(this.world, chunk);
        this.renderer.uploadChunkMesh(chunk, meshes);
        chunk.dirty = false;
        meshBudget--;
      }

      // 4. 卸载远处区块
      const keep = GEN_DIST + 2;
      for (const [key, chunk] of this.world.chunks) {
        const dx = chunk.cx - pcx, dz = chunk.cz - pcz;
        if (Math.abs(dx) > keep || Math.abs(dz) > keep) {
          this.renderer.disposeChunkMesh(chunk);
          this.world.unloadChunk(chunk.cx, chunk.cz);
        }
      }
    }

    // ---------------- 云 ----------------
    updateClouds() {
      const cx = Math.round(this.player.pos.x / 12) * 12;
      const cz = Math.round(this.player.pos.z / 12) * 12;
      if (cx !== this.cloudCX || cz !== this.cloudCZ) {
        this.cloudCX = cx;
        this.cloudCZ = cz;
        this.renderer.buildCloudMesh(cx / 12, cz / 12);
      }
    }

    // ---------------- 主循环 ----------------
    loop(now) {
      if (!this.running) return;
      requestAnimationFrame((t) => this.loop(t));
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.05) dt = 0.05;
      if (dt <= 0) dt = 0.001;
      this.time += dt;

      // 视角方向
      const yaw = this.player.yaw, pitch = this.player.pitch;
      const cp = Math.cos(pitch);
      const dir = [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];

      // 拾取目标（在操作前更新，保证点击当帧命中）
      this.hit = null;
      if (this.input.locked && this.started) {
        const eye = this.player.eyePos();
        this.hit = this.raycast(eye[0], eye[1], eye[2], dir[0], dir[1], dir[2]);
      }

      // 玩家更新（暂停时冻结移动与视角）
      if (this.input.locked && this.started) {
        this.player.update(dt, this.input, this.audio);
        if (this.player.inWater && !this.prevInWater && this.player.vel.y < -4) {
          this.audio.splash();
        }
        this.prevInWater = this.player.inWater;
        this.handleKeys();
        this.handleMouseActions(now);
      } else {
        this.input.consumeMouse();
        this.input.consumeJustPressed();
        this.input.consumeClicks();
        this.input.consumeWheel();
        this.player.vel.x = 0; this.player.vel.z = 0;
      }

      this.updateChunks();
      this.updateClouds();
      this.updateParticles(dt);

      // 渲染
      const eye = this.player.eyePos();
      const r = this.renderer;
      r.computeView(eye, yaw, pitch);
      r.beginFrame();
      r.drawSky();

      const drawList = [];
      const pcx = Math.floor(this.player.pos.x / CX);
      const pcz = Math.floor(this.player.pos.z / CZ);
      for (const chunk of this.world.chunks.values()) {
        const dx = chunk.cx - pcx, dz = chunk.cz - pcz;
        if (Math.abs(dx) <= VIEW_DIST + 1 && Math.abs(dz) <= VIEW_DIST + 1 && chunk.mesh) {
          drawList.push(chunk);
        }
      }
      r.drawChunks(drawList, 0);
      r.drawChunks(drawList, 1);
      r.drawChunks(drawList, 2);
      r.drawClouds(this.time * 0.55, this.time * 0.22);
      if (this.hit && (this.hit.id !== AIR)) {
        r.drawOutline(this.hit.x, this.hit.y, this.hit.z);
      }
      r.drawParticles(this.particles);

      // HUD
      this.updateHUD(dt);

      // 自动保存
      this.autosaveTimer += dt;
      if (this.autosaveTimer > 10) {
        this.autosaveTimer = 0;
        this.save();
      }
    }

    handleKeys() {
      for (const code of this.input.consumeJustPressed()) {
        if (code === 'KeyF') this.player.flying = !this.player.flying;
        else if (code === 'KeyM') {
          const muted = this.audio.toggleMute();
          document.getElementById('block-name').textContent = muted ? '声音: 关' : '声音: 开';
          setTimeout(() => this.updateHotbar(), 1200);
        }
        else if (code === 'KeyH') {
          document.getElementById('help').classList.toggle('hidden');
        }
        else if (code.startsWith('Digit')) {
          const n = parseInt(code.slice(5), 10);
          if (n >= 1 && n <= HOTBAR.length) {
            this.selected = n - 1;
            this.updateHotbar();
          }
        }
      }
      const wheel = this.input.consumeWheel();
      if (wheel !== 0) {
        this.selected = (this.selected + wheel + HOTBAR.length * 10) % HOTBAR.length;
        this.updateHotbar();
      }
    }

    handleMouseActions(now) {
      const clicks = this.input.consumeClicks();
      if (clicks.includes(0)) {
        this.tryBreak(now);
      }
      if (clicks.includes(2)) {
        this.tryPlace();
      }
      if (clicks.includes(1)) this.pickBlock();

      // 按住连挖/连放
      const nowMs = now;
      if (this.input.buttons[0] && nowMs - this.lastBreakTime > 260) {
        this.lastBreakTime = nowMs;
        this.tryBreak(nowMs);
      }
      if (this.input.buttons[2] && nowMs - this.lastPlaceTime > 260) {
        this.lastPlaceTime = nowMs;
        this.tryPlace();
      }
    }

    pickBlock() {
      if (!this.hit || this.hit.id === AIR || this.hit.id === WATER) return;
      const idx = HOTBAR.indexOf(this.hit.id);
      if (idx >= 0) {
        this.selected = idx;
      } else {
        // 把拾取的方块放进第 9 格
        HOTBAR[8] = this.hit.id;
        this.selected = 8;
        this.buildHotbar();
      }
      this.updateHotbar();
    }

    updateHUD(dt) {
      this.fpsTimer += dt;
      this.fpsFrames++;
      if (this.fpsTimer >= 0.4) {
        this.fps = Math.round(this.fpsFrames / this.fpsTimer);
        this.fpsTimer = 0;
        this.fpsFrames = 0;
        document.getElementById('dbg-fps').textContent = 'FPS: ' + this.fps;
        const p = this.player.pos;
        document.getElementById('dbg-pos').textContent =
          'XYZ: ' + p.x.toFixed(1) + ' / ' + p.y.toFixed(1) + ' / ' + p.z.toFixed(1) +
          (this.player.flying ? '  [飞行]' : '');
        document.getElementById('dbg-chunks').textContent =
          '区块: ' + this.world.chunks.size + ' · 种子: ' + this.seed;
        document.getElementById('water-overlay').classList.toggle('hidden', !this.player.submerged);
      }
    }

    save() {
      try {
        localStorage.setItem(SAVE_KEY, this.world.serializeEdits());
      } catch (e) {}
    }
  }

  // 启动
  function boot() {
    const canvas = document.getElementById('game');
    const game = new Game(canvas);
    global.MCGame = game; // 渲染器云层生成需要访问种子
    game.init();
    window.addEventListener('error', (e) => {
      const d = document.getElementById('debug');
      if (d) {
        d.classList.remove('hidden');
        document.getElementById('dbg-fps').textContent = '错误: ' + e.message;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
