// 游戏主循环与各系统装配
import * as THREE from '../vendor/three.module.js';
import { BLOCK, BLOCK_DEFS, HOTBAR } from './config.js';
import { createBlockAtlas } from './textures.js';
import { createBlockMaterials } from './chunk.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Controls } from './controls.js';
import { Particles } from './particles.js';
import { Sfx } from './audio.js';
import { Hud } from './hud.js';

const SAVE_SEED_KEY = 'webcraft_seed_v1';
const SAVE_PREFIX = 'webcraft_edits_v1_';
const MAX_SAVED_EDITS = 20000;

export class Game {
  constructor() {
    this.seed = this.loadSeed();
    this.savedEdits = this.loadEdits(this.seed);

    this.viewport = document.getElementById('viewport');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.domElement.id = 'game-canvas';
    this.viewport.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fc9ff);
    this.scene.fog = new THREE.Fog(0xbfe0ff, 40, 150);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.rotation.order = 'YXZ';

    this.setupLights();
    this.clouds = this.setupClouds();

    const atlas = createBlockAtlas();
    this.materials = createBlockMaterials(atlas);
    this.world = new World(this.scene, this.seed, this.savedEdits);
    this.world.setMaterials(this.materials);

    this.highlight = this.setupHighlight();
    this.particles = new Particles(this.scene);
    this.sfx = new Sfx();
    this.hud = new Hud();

    const spawn = this.world.findSpawnPosition();
    this.player = new Player(this.world, this.camera, spawn);

    this.controls = new Controls(this.renderer.domElement, this.player, {
      onSelect: (i) => this.hud.setSelected(i),
      onLockChange: (locked) => this.onLockChange(locked)
    });

    this.started = false;
    this.lastTime = performance.now();
    this.breakCooldown = 0;
    this.placeCooldown = 0;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.fps = 0;
    this.fpsClock = 0;
    this.saveTimer = 0;
    this.rayDistance = 6.5;

    this.bindUI();
    window.addEventListener('resize', () => this.onResize());

    this.hud.setSelected(0);
    this.hud.showStart();
    this.renderer.setAnimationLoop((time) => this.animate(time));
  }

  setupLights() {
    const hemi = new THREE.HemisphereLight(0xdfefff, 0x8a7a5c, 0.9);
    const sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
    sun.position.set(80, 160, 50);
    this.scene.add(hemi, sun);
  }

  setupClouds() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 128;
      const r = 10 + Math.random() * 26;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const group = new THREE.Group();
    const make = (width, height, y, opacity, speed) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      mesh.userData.speed = speed;
      group.add(mesh);
      return mesh;
    };
    const c1 = make(260, 80, 82, 0.5, 1.4);
    const c2 = make(200, 70, 72, 0.38, 0.9);
    this.scene.add(group);
    return [c1, c2];
  }

  setupHighlight() {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    const line = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0x101010, transparent: true, opacity: 0.65 })
    );
    line.visible = false;
    this.scene.add(line);
    return line;
  }

  bindUI() {
    const startBtn = document.getElementById('start-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const newWorldBtn = document.getElementById('new-world-btn');
    const hintBtn = document.getElementById('help-btn');

    startBtn.addEventListener('click', () => {
      this.sfx.ensure();
      this.controls.requestLock();
    });
    resumeBtn.addEventListener('click', () => {
      this.sfx.ensure();
      this.controls.requestLock();
    });
    newWorldBtn.addEventListener('click', () => {
      const seed = (Math.random() * 2147483647) | 0;
      localStorage.setItem(SAVE_SEED_KEY, String(seed));
      localStorage.removeItem(SAVE_PREFIX + seed);
      location.reload();
    });
    if (hintBtn) {
      hintBtn.addEventListener('click', () => {
        this.hud.toast('WASD 移动 · 空格 跳跃 · 双击空格/F 飞行 · 鼠标左键挖掘 · 右键放置 · 1-9/滚轮选方块', 2600);
      });
    }
  }

  onLockChange(locked) {
    this.started = this.started || locked;
    if (locked) {
      this.hud.showPlaying();
      this.lastTime = performance.now();
    } else if (this.started) {
      this.hud.showPause();
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate(time) {
    const now = time || performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) dt = 0.0001;

    const locked = this.controls.locked;

    if (locked) {
      const input = this.controls.readInput();
      this.player.update(dt, input);
      this.updateInteraction(dt);
    }

    // 无论暂停与否，都继续在后台补建区块
    this.world.update(this.player.position.x, this.player.position.z, locked ? 2 : 3);
    this.particles.update(dt);
    this.updateClouds(dt);
    this.updateHighlight();

    this.renderer.render(this.scene, this.camera);

    // FPS
    this.fpsAccum += dt;
    this.fpsFrames++;
    this.fpsClock += dt;
    if (this.fpsClock >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      this.fpsClock = 0;
    }
    this.hud.updateDebug(
      this.fps,
      this.player.position.x,
      this.player.position.y,
      this.player.position.z,
      this.world.chunks.size,
      this.world.buildQueue.size
    );

    // 防抖保存
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 2;
      this.persist();
    }
  }

  updateClouds(dt) {
    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.speed * dt;
      const width = cloud.geometry.parameters.width;
      if (cloud.position.x > width) cloud.position.x -= width * 2;
      if (cloud.position.x < -width) cloud.position.x += width * 2;
    }
  }

  currentRay() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return this.world.raycast(this.camera.position, dir, this.rayDistance);
  }

  updateHighlight() {
    const hit = this.currentRay();
    if (hit) {
      this.highlight.visible = true;
      this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      this.highlight.visible = false;
    }
  }

  updateInteraction(dt) {
    this.breakCooldown -= dt;
    this.placeCooldown -= dt;

    if (this.controls.leftHeld && this.breakCooldown <= 0) {
      this.breakCooldown = 0.28;
      this.tryBreak();
    }
    if (this.controls.rightHeld && this.placeCooldown <= 0) {
      this.placeCooldown = 0.32;
      this.tryPlace();
    }
  }

  tryBreak() {
    const hit = this.currentRay();
    if (!hit) return;
    if (BLOCK_DEFS[hit.blockId]?.unbreakable) {
      this.hud.toast('基岩坚不可摧');
      return;
    }
    this.world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR, { recordEdit: true });
    this.particles.spawnBlock(hit.x, hit.y, hit.z, hit.blockId, 16);
    this.sfx.playBreak();
  }

  tryPlace() {
    const hit = this.currentRay();
    if (!hit) return;
    const tx = hit.x + hit.normal[0];
    const ty = hit.y + hit.normal[1];
    const tz = hit.z + hit.normal[2];
    if (ty < 0 || ty >= 96) return;

    const current = this.world.getBlock(tx, ty, tz);
    if (current !== BLOCK.AIR && current !== BLOCK.WATER) return;
    if (this.player.intersectsBlock(tx, ty, tz)) {
      this.hud.toast('这里放不下：与玩家重叠');
      return;
    }

    const id = HOTBAR[this.controls.selected];
    this.world.setBlock(tx, ty, tz, id, { recordEdit: true });
    this.sfx.playPlace();
  }

  loadSeed() {
    const raw = localStorage.getItem(SAVE_SEED_KEY);
    let seed = raw === null || raw === '' ? NaN : Number(raw);
    if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) {
      seed = (Math.random() * 2147483647) | 0;
      localStorage.setItem(SAVE_SEED_KEY, String(seed));
    }
    return seed;
  }

  loadEdits(seed) {
    try {
      return JSON.parse(localStorage.getItem(SAVE_PREFIX + seed) || '{}');
    } catch {
      return {};
    }
  }

  persist() {
    if (this.world.edits.size === 0) {
      localStorage.removeItem(SAVE_PREFIX + this.seed);
      return;
    }
    let entries = [...this.world.edits];
    if (entries.length > MAX_SAVED_EDITS) entries = entries.slice(-MAX_SAVED_EDITS);
    try {
      localStorage.setItem(SAVE_PREFIX + this.seed, JSON.stringify(Object.fromEntries(entries)));
    } catch {
      this.hud.toast('本地存储空间不足，本次修改不会保存');
    }
  }
}
