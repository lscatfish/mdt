// 游戏主体：渲染循环、区块流式加载、昼夜循环、射线拾取、
// 方块破坏/放置、快捷栏、输入与存档。
import * as THREE from 'three';
import { AIR, B, BLOCKS, HOTBAR_IDS, createAtlas } from './blocks.js';
import { buildChunkGeometries } from './mesher.js';
import { Player, EYE_HEIGHT } from './player.js';
import { CHUNK, World } from './world.js';

const RENDER_DISTANCE = 5;
const REACH = 6;
const DAY_LENGTH = 420; // 一个昼夜 7 分钟
const SAVE_KEY = 'webcraft-save-v1';

const chKey = (x, z) => `${x},${z}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** 把字符串种子转为 32 位整数 */
export function hashSeed(text) {
  const s = String(text ?? '').trim();
  if (!s) return (Math.random() * 0xffffffff) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Game {
  constructor(canvas, dom) {
    this.canvas = canvas;
    this.dom = dom;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0d1230');
    this.scene.fog = new THREE.Fog('#0d1230', 30, 100);

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.rotation.order = 'YXZ';

    // 光照
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5f, 0.8);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.target.position.set(0, 0, 0);
    this.scene.add(this.hemi, this.sun, this.sun.target);

    // 太阳与月亮
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff1b0, fog: false, depthWrite: false, transparent: true, opacity: 0.96 });
    this.sunSprite = new THREE.Mesh(new THREE.CircleGeometry(15, 24), sunMat);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xd8e2ff, fog: false, depthWrite: false, transparent: true, opacity: 0.9 });
    this.moonSprite = new THREE.Mesh(new THREE.CircleGeometry(10, 24), moonMat);
    this.sunSprite.visible = false;
    this.moonSprite.visible = false;
    this.scene.add(this.sunSprite, this.moonSprite);

    // 云
    this.clouds = [];
    this.makeClouds();

    // 准星指向的方块高亮框
    this.selection = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.75 })
    );
    this.selection.visible = false;
    this.scene.add(this.selection);

    // 状态
    this.started = false;
    this.locked = false;
    this.world = null;
    this.player = null;
    this.views = new Map();
    this.materials = null;
    this.atlas = null;
    this.selectedSlot = 0;
    this.timeOfDay = 0.14;
    this.lastTime = performance.now();
    this.fps = 0;
    this.frames = 0;
    this.fpsTime = 0;
    this.mouseButtons = new Set();
    this.actionInterval = null;
    this.saveTimer = null;

    this.input = {
      forward: false, back: false, left: false, right: false,
      jump: false, down: false, sprint: false
    };

    this.bindEvents();
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('beforeunload', () => { if (this.started) this.saveNow(true); });

    requestAnimationFrame((t) => this.loop(t));
  }

  makeClouds() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.5,
      fog: false, depthWrite: false
    });
    const rand = (() => {
      let s = 0x51ab;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    })();

    for (let i = 0; i < 16; i++) {
      const group = new THREE.Group();
      const boxes = 2 + Math.floor(rand() * 3);
      for (let b = 0; b < boxes; b++) {
        const w = 8 + rand() * 14;
        const h = 2 + rand() * 2.5;
        const d = 6 + rand() * 10;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set((rand() - 0.5) * 18, (rand() - 0.5) * 2, (rand() - 0.5) * 16);
        group.add(mesh);
      }
      group.position.set(0, 46 + rand() * 14, (rand() - 0.5) * 400);
      group.userData = { offset: rand() * 400, z: group.position.z };
      this.scene.add(group);
      this.clouds.push(group);
    }
  }

  bindEvents() {
    const canvas = this.canvas;

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.started) {
        this.dom.paused.classList.toggle('hidden', this.locked);
        if (!this.locked) this.clearActions();
      }
    });

    document.addEventListener('pointerlockerror', () => {
      if (this.started) {
        this.dom.paused.classList.remove('hidden');
        this.notice('无法锁定鼠标，请点击“继续游戏”重试');
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.started) return;
      const sens = 0.0022;
      this.player.yaw -= e.movementX * sens;
      this.player.pitch = clamp(this.player.pitch - e.movementY * sens, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    });

    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (!this.started) return;
      if (!this.locked) {
        this.requestLock();
        return;
      }
      this.mouseButtons.add(e.button);
      this.doAction(e.button);
      this.startActionInterval();
    });

    window.addEventListener('mouseup', (e) => {
      this.mouseButtons.delete(e.button);
      if (this.mouseButtons.size === 0) this.clearActions();
    });

    canvas.addEventListener('wheel', (e) => {
      if (!this.started) return;
      e.preventDefault();
      if (e.deltaY > 0) this.selectSlot((this.selectedSlot + 1) % HOTBAR_IDS.length);
      else if (e.deltaY < 0) this.selectSlot((this.selectedSlot - 1 + HOTBAR_IDS.length) % HOTBAR_IDS.length);
    }, { passive: false });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onKey(e, down) {
    const c = e.code;
    if (this.started && ['Space', 'Tab', 'KeyF', 'KeyR'].includes(c)) e.preventDefault();

    switch (c) {
      case 'KeyW': this.input.forward = down; break;
      case 'KeyS': this.input.back = down; break;
      case 'KeyA': this.input.left = down; break;
      case 'KeyD': this.input.right = down; break;
      case 'Space': this.input.jump = down; break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.input.down = down;
        this.input.sprint = down;
        break;
      case 'KeyF':
        if (down && this.started && this.player) {
          const fly = this.player.toggleFly();
          this.notice(fly ? '飞行模式：开启' : '飞行模式：关闭');
        }
        break;
      case 'KeyR':
        if (down && this.started && this.player) {
          this.player.respawn();
          this.notice('已回到出生点');
        }
        break;
      default:
        if (down) {
          const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'].indexOf(c);
          if (n >= 0) this.selectSlot(n);
        }
    }
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') {
        p.catch(() => this.notice('浏览器未允许锁定鼠标，请再次点击画面'));
      }
    } catch {
      this.notice('当前环境不支持鼠标锁定');
    }
  }

  startActionInterval() {
    if (this.actionInterval) return;
    this.actionInterval = setInterval(() => {
      if (this.mouseButtons.has(0)) this.doAction(0);
      if (this.mouseButtons.has(2)) this.doAction(2);
    }, 240);
  }

  clearActions() {
    this.mouseButtons.clear();
    if (this.actionInterval) {
      clearInterval(this.actionInterval);
      this.actionInterval = null;
    }
  }

  doAction(button) {
    const hit = this.raycast();
    if (!hit) return;
    if (button === 0) {
      const block = BLOCKS[hit.id];
      if (block && !block.unbreakable) {
        this.world.setBlock(hit.x, hit.y, hit.z, AIR);
      }
    } else if (button === 2) {
      this.placeBlock(hit);
    }
  }

  placeBlock(hit) {
    const x = hit.x + hit.normal[0];
    const y = hit.y + hit.normal[1];
    const z = hit.z + hit.normal[2];
    if (y < 0 || y >= 64) return;

    const existing = this.world.getBlock(x, y, z);
    const existingBlock = BLOCKS[existing];
    if (existingBlock && existingBlock.solid) return; // 只能替换水/空气

    // 不能放进玩家身体
    const p = this.player.aabb();
    if (
      x + 1 > p.minX + 0.001 && x < p.maxX - 0.001 &&
      y + 1 > p.minY + 0.001 && y < p.maxY - 0.001 &&
      z + 1 > p.minZ + 0.001 && z < p.maxZ - 0.001
    ) return;

    this.world.setBlock(x, y, z, HOTBAR_IDS[this.selectedSlot]);
  }

  /** DDA 体素射线，返回命中的方块与法线 */
  raycast() {
    const origin = this.camera.position;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);

    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = Math.sign(dir.x) || 0;
    const stepY = Math.sign(dir.y) || 0;
    const stepZ = Math.sign(dir.z) || 0;

    const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;

    let tMaxX = stepX !== 0 ? ((stepX > 0 ? x + 1 - origin.x : origin.x - x) * tDeltaX) : Infinity;
    let tMaxY = stepY !== 0 ? ((stepY > 0 ? y + 1 - origin.y : origin.y - y) * tDeltaY) : Infinity;
    let tMaxZ = stepZ !== 0 ? ((stepZ > 0 ? z + 1 - origin.z : origin.z - z) * tDeltaZ) : Infinity;

    let t = 0;
    let normal = [0, 0, 0];
    let id = AIR;

    for (let i = 0; i < 80; i++) {
      if (t > REACH) return null;
      id = this.world.getBlock(x, y, z);
      if (id !== AIR) {
        // 视角位于水内时忽略起点水块，避免选中自身
        if (!(id === B.WATER && i === 0)) {
          return { x, y, z, id, normal };
        }
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        normal = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        normal = [0, -stepY, 0];
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        normal = [0, 0, -stepZ];
      }
    }
    return null;
  }

  selectSlot(i) {
    if (i === this.selectedSlot) return;
    this.selectedSlot = i;
    if (this.dom.hotbar) {
      const slots = this.dom.hotbar.querySelectorAll('.hotbar-slot');
      slots.forEach((s, n) => s.classList.toggle('selected', n === i));
    }
  }

  buildHotbar() {
    if (!this.atlas) return;
    const hotbar = this.dom.hotbar;
    hotbar.innerHTML = '';
    HOTBAR_IDS.forEach((id, n) => {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot' + (n === this.selectedSlot ? ' selected' : '');

      const icon = document.createElement('canvas');
      icon.width = 64;
      icon.height = 64;
      const ctx = icon.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const tileId = BLOCKS[id].tex.py;
      const col = tileId % 16;
      const row = Math.floor(tileId / 16);
      ctx.drawImage(this.atlas.canvas, col * 16, row * 16, 16, 16, 0, 0, 64, 64);
      slot.appendChild(icon);

      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = String(n + 1);
      slot.appendChild(key);

      hotbar.appendChild(slot);
    });
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  notice(text) {
    const el = this.dom.notice;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // ---------------- 游戏生命周期 ----------------

  begin(seedText) {
    if (this.started) return;
    this.started = true;
    this.seed = hashSeed(seedText);
    this.seedText = this.seed;

    this.world = new World(this.seed);
    this.atlas = createAtlas();
    this.buildHotbar();

    const tex = this.atlas.texture;
    this.materials = {
      opaque: new THREE.MeshLambertMaterial({ map: tex, vertexColors: true }),
      cutout: new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, alphaTest: 0.45 }),
      glass: new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: true, opacity: 0.32 }),
      water: new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: true, opacity: 0.72 })
    };

    this.applySave();

    const spawnY = this.world.findSpawnHeight();
    this.player = new Player(this.world, this.world.spawnX ?? 8, spawnY, this.world.spawnZ ?? 8);
    this.player.pitch = -0.05;

    // 预生成出生点附近一圈，避免出生瞬间脚下悬空
    const pcx = Math.floor(this.player.pos.x / CHUNK);
    const pcz = Math.floor(this.player.pos.z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.world.getChunk(pcx + dx, pcz + dz);
      }
    }

    this.world.onChange = () => this.scheduleSave();
    this.dom.menu.classList.add('hidden');
    this.dom.hud.classList.remove('hidden');
    this.dom.saveBtn.disabled = false;
    this.dom.loadingFill.style.width = '0%';
    this.dom.loadingLabel.textContent = '正在生成地形…';
    this.updateInfo(true);
    this.requestLock();

    // 兜底：若锁定请求被静默拒绝，则显示暂停菜单供用户重试
    clearTimeout(this.lockFallback);
    this.lockFallback = setTimeout(() => {
      if (this.started && !this.locked) {
        this.dom.paused.classList.remove('hidden');
        this.notice('点击“继续游戏”以锁定鼠标');
      }
    }, 900);
  }

  applySave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Number(data.seed) === this.seed && Array.isArray(data.changes)) {
        this.world.applyChanges(data.changes);
      }
    } catch {
      /* 存档损坏则忽略 */
    }
  }

  saveNow(silent = false) {
    if (!this.world) return;
    try {
      const payload = {
        seed: this.world.seed,
        changes: this.world.serializeChanges()
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      if (!silent) this.notice('世界已保存');
    } catch {
      if (!silent) this.notice('保存失败');
    }
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(true), 1500);
  }

  // ---------------- 区块流式加载 ----------------

  updateChunks() {
    const R = RENDER_DISTANCE;
    const pcx = Math.floor(this.player.pos.x / CHUNK);
    const pcz = Math.floor(this.player.pos.z / CHUNK);

    const desired = new Set();
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz <= R * R) desired.add(chKey(pcx + dx, pcz + dz));
      }
    }

    // 卸载远处的区块
    for (const [k, view] of this.views) {
      if (!desired.has(k)) {
        this.removeView(view);
        this.views.delete(k);
      }
    }

    // 注册新区块
    for (const k of desired) {
      if (!this.views.has(k)) {
        const [cx, cz] = k.split(',').map(Number);
        this.world.getChunk(cx, cz);
        this.views.set(k, { cx, cz, meshes: null, built: false });
      }
    }

    // 按距离排序，每帧限量构建
    const queue = [];
    for (const view of this.views.values()) {
      const chunk = this.world.getChunk(view.cx, view.cz);
      if (!view.built || chunk.dirty) {
        const dx = view.cx - pcx;
        const dz = view.cz - pcz;
        queue.push({ view, dist: dx * dx + dz * dz });
      }
    }
    queue.sort((a, b) => a.dist - b.dist);

    let budget = this.loadedAll ? 2 : 3;
    for (const item of queue) {
      if (budget-- <= 0) break;
      this.buildView(item.view);
    }

    const built = [...this.views.values()].filter((v) => v.built).length;
    const total = this.views.size;
    this.loadedAll = built >= total && total > 0;
    this.dom.loadingFill.style.width = `${total ? (built / total) * 100 : 0}%`;
    if (this.loadedAll) {
      this.dom.loadingWrap.classList.add('hidden');
    } else {
      this.dom.loadingLabel.textContent = `正在生成地形… ${built}/${total} 区块`;
    }
  }

  buildView(view) {
    if (view.meshes) this.removeView(view);
    const geometries = buildChunkGeometries(this.world, view.cx, view.cz);
    view.meshes = {};

    for (const kind of ['opaque', 'cutout', 'glass', 'water']) {
      const geometry = geometries[kind];
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, this.materials[kind]);
      mesh.position.set(view.cx * CHUNK, 0, view.cz * CHUNK);
      mesh.frustumCulled = false;
      view.meshes[kind] = mesh;
      this.scene.add(mesh);
    }
    view.built = true;
    this.world.getChunk(view.cx, view.cz).dirty = false;
  }

  removeView(view) {
    if (!view.meshes) return;
    for (const mesh of Object.values(view.meshes)) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    view.meshes = null;
    view.built = false;
  }

  // ---------------- 昼夜与天空 ----------------

  updateSky(dt) {
    this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH) % 1;
    const angle = this.timeOfDay * Math.PI * 2;
    const elevation = Math.sin(angle);

    const day = smoothstep(-0.06, 0.25, elevation);
    const dayColor = new THREE.Color('#7fb2ff');
    const nightColor = new THREE.Color('#0b1028');
    const sunsetColor = new THREE.Color('#ff8f4d');

    const sky = dayColor.clone().lerp(nightColor, 1 - day);
    const horizon = Math.pow(1 - Math.min(1, Math.abs(elevation) / 0.32), 2);
    sky.lerp(sunsetColor, horizon * 0.55);

    this.scene.background = sky;
    if (this.scene.fog) this.scene.fog.color.copy(sky);

    this.hemi.intensity = 0.18 + day * 0.62;
    this.sun.intensity = 0.03 + day * 1.65;

    const sunDir = new THREE.Vector3(Math.cos(angle), elevation, 0.35).normalize();
    this.sun.position.copy(this.camera.position).addScaledVector(sunDir, 200);
    this.sun.target.position.copy(this.camera.position);

    this.sunSprite.visible = elevation > -0.08;
    if (this.sunSprite.visible) {
      this.sunSprite.position.copy(this.camera.position).addScaledVector(sunDir, 900);
      this.sunSprite.lookAt(this.camera.position);
    }

    const moonDir = new THREE.Vector3(-Math.cos(angle), -elevation, -0.35).normalize();
    this.moonSprite.visible = elevation < 0.1;
    if (this.moonSprite.visible) {
      this.moonSprite.position.copy(this.camera.position).addScaledVector(moonDir, 900);
      this.moonSprite.lookAt(this.camera.position);
    }
  }

  updateClouds(dt) {
    const px = Math.round(this.player.pos.x);
    for (const cloud of this.clouds) {
      const u = cloud.userData;
      const span = 500;
      cloud.position.x = px + (((u.offset + this.timeOfDay * DAY_LENGTH * 3) % span) - span / 2);
      cloud.position.z = u.z + Math.round(this.player.pos.z);
    }
  }

  // ---------------- 主循环 ----------------

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // FPS
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTime);
      this.frames = 0;
      this.fpsTime = 0;
    }

    if (this.started && this.player) {
      this.player.update(dt, this.input);
      this.camera.position.set(this.player.pos.x, this.player.pos.y + EYE_HEIGHT, this.player.pos.z);
      this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);

      this.updateChunks();
      this.updateSky(dt);
      this.updateClouds(dt);
      this.updateSelection();
      this.updateInfo();
    }

    this.renderer.render(this.scene, this.camera);
  }

  updateSelection() {
    if (!this.locked) {
      this.selection.visible = false;
      return;
    }
    const hit = this.raycast();
    if (hit && hit.id !== AIR) {
      this.selection.visible = true;
      this.selection.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      this.selection.visible = false;
    }
  }

  updateInfo(force = false) {
    const now = performance.now();
    if (!force && now - (this.lastInfo || 0) < 250) return;
    this.lastInfo = now;

    const p = this.player.pos;
    const mode = this.player.fly ? '飞行' : '步行';
    this.dom.info.textContent =
      `种子 ${this.seed}  ·  FPS ${this.fps}\n` +
      `位置 ${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}  ·  ${mode}`;
  }
}
