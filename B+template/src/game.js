// 游戏主控：Three.js 场景、区块流式加载、输入、方块交互、HUD
import * as THREE from '../vendor/three.module.js';
import {
  CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, REACH, HOTBAR, BLOCKS,
  AIR, WATER, BEDROCK,
} from './constants.js';
import { World } from './world.js';
import { initTerrain, findSpawnHeight, heightAt } from './terrain.js';
import { buildChunkMesh } from './mesher.js';
import { buildAtlasTexture, drawBlockIcon } from './textures.js';
import { Player } from './player.js';
import { AudioFX } from './audio.js';

const RENDER_DISTANCE = 5;
const UNLOAD_DISTANCE = RENDER_DISTANCE + 2;
const FILL_PER_FRAME = 2;
const MESH_PER_FRAME = 3;
const PHYS_STEP = 1 / 60;

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const SKY_FRAG = `
varying vec3 vDir;
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 bottomColor;
void main() {
  float h = normalize(vDir).y;
  vec3 col = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(col, bottomColor, pow(clamp(-h, 0.0, 1.0), 0.5));
  float sunAmt = pow(max(dot(normalize(vDir), normalize(vec3(0.5, 0.42, 0.3))), 0.0), 220.0);
  col += vec3(1.0, 0.93, 0.78) * sunAmt * 0.55;
  col = pow(col, vec3(0.4545)); // linear -> sRGB
  gl_FragColor = vec4(col, 1.0);
}`;

function floorDiv(a, b) {
  return Math.floor(a / b);
}

function makeCloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  for (let i = 0; i < 34; i++) {
    const x = Math.random() * 256;
    const y = 30 + Math.random() * 68;
    const r = 14 + Math.random() * 22;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Game {
  constructor(root, opts = {}) {
    this.root = root;
    this.seed = (opts.seed ?? ((Math.random() * 0x7fffffff) | 0));
    this.input = { forward: 0, strafe: 0, jump: false, sneak: false, sprint: false };
    this.keys = new Set();
    this.locked = false;
    this.started = false;
    this.spawnReady = false;
    this.loadingDone = false;
    this.selected = 0;
    this.target = null;
    this.breakHeld = false;
    this.placeHeld = false;
    this.breakTimer = 0;
    this.placeTimer = 0;
    this.audio = new AudioFX();
    this.acc = 0;
    this.debugTimer = 0;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.fps = 0;
    this.clouds = [];
    this.time = 0;
  }

  init() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.root.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xcfe4f2, 55, 165);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 600);
    this.camera.rotation.order = 'YXZ';

    this.setupLights();
    this.setupSky();
    this.setupClouds();
    this.setupHighlight();
    this.setupMaterials();

    initTerrain(this.seed);
    this.world = new World(this.seed);
    this.player = new Player(this.world, 0.5, SEA_LEVEL + 10, 0.5, Math.PI * 0.72);

    this.setupUI();
    this.setupInput();

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('beforeunload', () => this.world.saveEdits());
    this.saveInterval = setInterval(() => this.world.saveEdits(), 30000);
  }

  setupLights() {
    const hemi = new THREE.HemisphereLight(0xcfeeff, 0x9b8a6a, 0.9);
    const sun = new THREE.DirectionalLight(0xfff2da, 2.0);
    sun.position.set(100, 140, 60);
    const amb = new THREE.AmbientLight(0xffffff, 0.18);
    this.scene.add(hemi, sun, amb);
    this.sun = sun;
  }

  setupSky() {
    const geo = new THREE.SphereGeometry(500, 24, 12);
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        topColor: { value: new THREE.Color(0x4b9bdd) },
        horizonColor: { value: new THREE.Color(0xd6ebf5) },
        bottomColor: { value: new THREE.Color(0x96a3b8) },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.scene.add(sky);
  }

  setupClouds() {
    const texture = makeCloudTexture();
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(220, 120);
    for (let i = 0; i < 6; i++) {
      const cloud = new THREE.Mesh(geo, mat);
      cloud.position.set(((i % 3) - 1) * 260, 66 + (i % 3) * 4 + (i > 2 ? 2 : 0), (Math.floor(i / 3) - 0.5) * 280 - 100);
      cloud.renderOrder = 1;
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  setupHighlight() {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    const mat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.65 });
    this.highlight = new THREE.LineSegments(geo, mat);
    this.highlight.visible = false;
    this.scene.add(this.highlight);
  }

  setupMaterials() {
    const { texture, cols, rows } = buildAtlasTexture(THREE);
    this.atlas = {
      texture,
      cols,
      rows,
      solidMaterial: new THREE.MeshLambertMaterial({ map: texture, vertexColors: true }),
      waterMaterial: new THREE.MeshLambertMaterial({
        map: texture, vertexColors: true, transparent: true, opacity: 0.74, depthWrite: false,
      }),
      glassMaterial: new THREE.MeshLambertMaterial({
        map: texture, vertexColors: true, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
      }),
    };
  }

  setupUI() {
    this.menu = document.getElementById('menu');
    this.startBtn = document.getElementById('start-btn');
    this.crosshair = document.getElementById('crosshair');
    this.hud = document.getElementById('hud');
    this.debugEl = document.getElementById('debug');
    this.blockNameEl = document.getElementById('block-name');
    this.hotbarEl = document.getElementById('hotbar');
    this.loadingEl = document.getElementById('loading');
    this.loadingText = document.getElementById('loading-text');

    // 快捷栏
    this.slots = HOTBAR.map((id, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = (i + 1) % 10;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = BLOCKS[id].name;
      slot.appendChild(drawBlockIcon(id));
      slot.appendChild(num);
      slot.appendChild(name);
      slot.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.selectSlot(i);
      });
      this.hotbarEl.appendChild(slot);
      return slot;
    });
    this.selectSlot(0);
  }

  selectSlot(i) {
    this.selected = i;
    this.slots.forEach((s, j) => s.classList.toggle('selected', j === i));
  }

  setupInput() {
    const canvas = this.renderer.domElement;

    this.startBtn.addEventListener('click', () => {
      this.audio.ensure();
      this.started = true;
      this.requestLock();
    });

    canvas.addEventListener('mousedown', (e) => {
      if ((!this.locked && !this.virtualLock) || !this.spawnReady) return;
      if (e.button === 0) {
        this.breakHeld = true;
        this.doBreak();
        this.breakTimer = 0.26;
      } else if (e.button === 2) {
        this.placeHeld = true;
        this.doPlace();
        this.placeTimer = 0.3;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.breakHeld = false;
      if (e.button === 2) this.placeHeld = false;
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) {
        this.virtualLock = false;
        this.enterGameUI();
        this.audio.ensure();
      } else if (!this.virtualLock) {
        this.exitGameUI();
      }
    });

    document.addEventListener('pointerlockerror', () => {
      // 指针锁定不可用：降级为鼠标增量视角
      this.virtualLock = true;
      this.enterGameUI();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked && !this.virtualLock) return;
      const sens = 0.0023;
      this.player.yaw -= e.movementX * sens;
      this.player.pitch -= e.movementY * sens;
      const lim = Math.PI / 2 - 0.001;
      this.player.pitch = Math.max(-lim, Math.min(lim, this.player.pitch));
    });

    window.addEventListener('wheel', (e) => {
      if (!this.locked && !this.virtualLock) return;
      const n = HOTBAR.length;
      this.selectSlot(((this.selected + (e.deltaY > 0 ? 1 : -1)) % n + n) % n);
    });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        this.keys.add(e.code);
        return;
      }
      this.keys.add(e.code);
      if (this.virtualLock && e.code === 'Escape') {
        this.virtualLock = false;
        this.exitGameUI();
        return;
      }
      if (!this.locked && !this.virtualLock) return;
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) this.selectSlot(n - 1);
        if (n === 0) this.selectSlot(9);
      }
      if (e.code === 'KeyF') {
        const flying = this.player.toggleFly();
        this.showBlockName(flying ? '飞行模式 开' : '飞行模式 关');
      }
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  enterGameUI() {
    this.menu.classList.add('hidden');
    this.crosshair.classList.remove('hidden');
    this.hud.classList.remove('hidden');
  }

  exitGameUI() {
    if (this.started) {
      this.menu.classList.remove('hidden');
      this.startBtn.textContent = '继续游戏';
    }
    this.crosshair.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.breakHeld = false;
    this.placeHeld = false;
    this.keys.clear();
  }

  requestLock() {
    try {
      const promise = this.renderer.domElement.requestPointerLock();
      if (promise && promise.catch) {
        promise.catch(() => {
          this.virtualLock = true;
          this.enterGameUI();
        });
      }
    } catch (e) {
      this.virtualLock = true;
      this.enterGameUI();
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---------- 区块流式加载 ----------
  loadChunks() {
    const pcx = floorDiv(this.player.pos.x, CHUNK_SIZE);
    const pcz = floorDiv(this.player.pos.z, CHUNK_SIZE);
    const R = RENDER_DISTANCE;

    const want = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > R * R) continue;
        const cx = pcx + dx, cz = pcz + dz;
        const chunk = this.world.chunks.get(this.world.key(cx, cz));
        if (!chunk || !chunk.filled) {
          want.push([cx, cz, dx * dx + dz * dz]);
        } else if (!chunk.meshGroup) {
          // 已填充但网格缺失（曾离开视野被卸载）：重新请求
          this.world.requestMesh(cx, cz);
        }
      }
    }
    want.sort((a, b) => a[2] - b[2]);

    for (let i = 0; i < Math.min(FILL_PER_FRAME, want.length); i++) {
      const [cx, cz] = want[i];
      this.world.fillChunk(cx, cz);
      this.world.requestMesh(cx, cz);
      // 邻居也重建，避免区块接缝处临时缺面
      this.world.requestMesh(cx - 1, cz);
      this.world.requestMesh(cx + 1, cz);
      this.world.requestMesh(cx, cz - 1);
      this.world.requestMesh(cx, cz + 1);
    }

    for (let i = 0; i < MESH_PER_FRAME; i++) {
      const key = this.world.nextMeshJob();
      if (!key) break;
      this.rebuildChunk(key);
    }

    // 初始出生点（等待出生区块生成完毕）
    if (!this.spawnReady) {
      const spawnChunk = this.world.chunks.get(this.world.key(0, 0));
      if (spawnChunk && spawnChunk.filled) {
        const { x, z } = this.pickSpawn();
        const targetChunk = this.world.chunks.get(
          this.world.key(floorDiv(x, CHUNK_SIZE), floorDiv(z, CHUNK_SIZE))
        );
        if (targetChunk && targetChunk.filled) {
          const gy = findSpawnHeight(this.world, x, z);
          this.player.pos.x = x + 0.5;
          this.player.pos.z = z + 0.5;
          this.player.pos.y = gy + 1.01;
          this.spawnReady = true;
        }
      }
    }

    // 卸载远处区块
    const unloadDist2 = UNLOAD_DISTANCE * UNLOAD_DISTANCE;
    let savedEdits = false;
    for (const chunk of this.world.chunks.values()) {
      const dx = chunk.cx - pcx, dz = chunk.cz - pcz;
      if (dx * dx + dz * dz > unloadDist2) {
        if (chunk.edited && !savedEdits) {
          this.world.saveEdits();
          savedEdits = true;
        }
        this.disposeChunk(chunk);
      }
    }

    this.updateLoading();
  }

  pickSpawn() {
    for (let r = 0; r < 48; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (heightAt(dx, dz) >= SEA_LEVEL + 2) return { x: dx, z: dz };
        }
      }
    }
    return { x: 0, z: 0 };
  }

  updateLoading() {
    if (this.loadingDone) return;
    const R = RENDER_DISTANCE;
    const pcx = floorDiv(this.player.pos.x, CHUNK_SIZE);
    const pcz = floorDiv(this.player.pos.z, CHUNK_SIZE);
    let filled = 0;
    let total = 0;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > R * R) continue;
        total++;
        const c = this.world.chunks.get(this.world.key(pcx + dx, pcz + dz));
        if (c && c.filled) filled++;
      }
    }
    this.loadingText.textContent = `正在生成世界… ${Math.min(99, Math.round((filled / total) * 100))}%`;
    if (this.spawnReady && filled >= 24) {
      this.loadingDone = true;
      this.loadingEl.classList.add('hidden');
    }
  }

  rebuildChunk(key) {
    const chunk = this.world.chunks.get(key);
    if (!chunk || !chunk.filled) return;
    this.disposeChunk(chunk);
    const built = buildChunkMesh(THREE, this.world, chunk, this.atlas);
    chunk.meshGroup = built.group;
    this.scene.add(built.group);
  }

  disposeChunk(chunk) {
    if (!chunk.meshGroup) return;
    this.scene.remove(chunk.meshGroup);
    chunk.meshGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    chunk.meshGroup = null;
  }

  // ---------- 方块交互 ----------
  updateTarget() {
    const eye = this.player.eye;
    const f = this.player.forward();
    const hit = this.world.raycast(eye.x, eye.y, eye.z, f.x, f.y, f.z, REACH);
    this.target = hit;
    if (hit) {
      this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      this.highlight.visible = true;
    } else {
      this.highlight.visible = false;
    }
  }

  doBreak() {
    if (!this.target) return;
    const { x, y, z, id } = this.target;
    if (id === BEDROCK || id === AIR) return;
    if (this.world.setBlock(x, y, z, AIR)) this.audio.dig();
  }

  doPlace() {
    if (!this.target) return;
    const nx = this.target.x + this.target.nx;
    const ny = this.target.y + this.target.ny;
    const nz = this.target.z + this.target.nz;
    if (ny < 0 || ny >= WORLD_HEIGHT) return;
    const cur = this.world.getBlock(nx, ny, nz);
    if (cur !== AIR && cur !== WATER) return;

    // 不与玩家碰撞
    const p = this.player.aabb();
    if (nx + 1 > p.minX + 0.002 && nx < p.maxX - 0.002 &&
        ny + 1 > p.minY + 0.002 && ny < p.maxY - 0.002 &&
        nz + 1 > p.minZ + 0.002 && nz < p.maxZ - 0.002) return;

    const id = HOTBAR[this.selected];
    if (this.world.setBlock(nx, ny, nz, id)) this.audio.place();
  }

  updateInteraction(dt) {
    this.updateTarget();
    if (this.breakHeld) {
      this.breakTimer -= dt;
      if (this.breakTimer <= 0) {
        this.doBreak();
        this.breakTimer = 0.26;
      }
    }
    if (this.placeHeld) {
      this.placeTimer -= dt;
      if (this.placeTimer <= 0) {
        this.doPlace();
        this.placeTimer = 0.3;
      }
    }

    // 方块名称提示
    if (this.target && (this.locked || this.virtualLock)) {
      this.blockNameEl.textContent = BLOCKS[this.target.id].name;
      this.blockNameEl.classList.add('show');
    } else {
      this.blockNameEl.classList.remove('show');
    }
  }

  showBlockName(text) {
    this.blockNameEl.textContent = text;
    this.blockNameEl.classList.add('show');
    clearTimeout(this.blockNameTimer);
    this.blockNameTimer = setTimeout(() => this.blockNameEl.classList.remove('show'), 1400);
  }

  // ---------- 主循环 ----------
  start() {
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.time += dt;

    this.updateClouds(dt);
    this.loadChunks();

    if (this.spawnReady) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= PHYS_STEP && steps < 6) {
        this.step(PHYS_STEP);
        this.acc -= PHYS_STEP;
        steps++;
      }
      if (steps === 6) this.acc = 0;
      this.updateInteraction(dt);
    }

    // 相机
    const eye = this.player.eye;
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.rotation.y = this.player.yaw;
    this.camera.rotation.x = this.player.pitch;

    this.renderer.render(this.scene, this.camera);

    // FPS
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    this.debugTimer -= dt;
    if (this.debugTimer <= 0) {
      this.updateDebug();
      this.debugTimer = 0.25;
    }
  }

  step(dt) {
    const k = this.keys;
    this.input.forward = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    this.input.strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    this.input.jump = k.has('Space');
    this.input.sneak = k.has('ShiftLeft') || k.has('ShiftRight');
    this.input.sprint = k.has('ControlLeft') || k.has('ControlRight') || this.input.sneak;

    const wasGround = this.player.onGround;
    const wasWater = this.player.inWater;
    this.player.update(dt, this.input);

    if (this.input.jump && wasGround && !this.player.flying) this.audio.jump();
    if (this.player.inWater && !wasWater) this.audio.splash();
  }

  updateClouds(dt) {
    for (const cloud of this.clouds) {
      cloud.position.x += dt * 1.6;
      if (cloud.position.x > 520) cloud.position.x -= 1040;
    }
  }

  updateDebug() {
    const p = this.player;
    const pcx = floorDiv(p.pos.x, CHUNK_SIZE);
    const pcz = floorDiv(p.pos.z, CHUNK_SIZE);
    const targetName = this.target ? BLOCKS[this.target.id].name : '—';
    this.debugEl.textContent =
      `WebCraft · 种子 ${this.seed}\n` +
      `FPS ${this.fps}\n` +
      `坐标 ${p.pos.x.toFixed(1)}, ${p.pos.y.toFixed(1)}, ${p.pos.z.toFixed(1)}\n` +
      `区块 ${pcx}, ${pcz} · 已生成 ${this.world.chunks.size}\n` +
      `指向 ${targetName}\n` +
      `${p.flying ? '飞行模式' : p.inWater ? '游泳中' : '步行'}`;
  }
}
