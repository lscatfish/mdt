// 游戏主程序：渲染循环、区块流式加载、输入、交互（破坏/放置）、调试接口。
import * as THREE from '/vendor/three.module.js';
import { World, CHUNK, WORLD_H } from './world.js';
import { BLOCKS, BY_ID, IDs, textureName } from './blocks.js';
import { TILE_COLORS } from './textures.js';
import { buildChunkGeometry, MAT_OPAQUE, MAT_TRANS } from './chunkmesh.js';
import { Player, EYE, HALF, HEIGHT } from './player.js';
import { raycast } from './raycast.js';
import { Sky } from './sky.js';
import { Particles } from './particles.js';
import { initAudio, playBreak, playPlace, setMuted, isMuted } from './sounds.js';
import { UI, HOTBAR_BLOCKS } from './ui.js';

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const seedParam = params.get('seed');

// ---------- 渲染器 / 场景 / 相机 ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- 世界与玩家 ----------
let saved = World.load();
if (seedParam !== null) saved = { seed: (Number(seedParam) || 0) | 0, edits: new Map() };
const world = new World(saved.seed, saved.edits);
world.persist = !DEMO && seedParam === null;
world.save(); // 记录种子，保证下次进入同一世界

const sky = new Sky(scene);
const particles = new Particles(scene);

const spawn = world.findSpawn();
const player = new Player(world, spawn);

// ---------- 方块瞄准高亮 ----------
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.75 })
);
highlight.visible = false;
scene.add(highlight);

// ---------- 输入状态 ----------
const input = {
  keys: new Set(),
  mouseLeft: false,
  mouseRight: false,
};

let state = 'start'; // start | playing | paused
let noLock = DEMO;   // 指针锁定不可用时退回拖拽视角
let dragging = false;
let lastSpaceTime = 0;
let gameTime = 0.28; // 上午
let debugOn = false;

const ui = new UI({
  onStart: startGame,
  onNewWorld: () => {
    world.resetStorage();
    location.reload();
  },
});

const BLOCKS_ORDER = HOTBAR_BLOCKS.map((n) => BLOCKS[n].id);

// ---------- 区块流式加载 ----------
const RENDER_R = 5;
const GEN_BUDGET = 2;
const MESH_BUDGET = 2;
const meshes = new Map(); // "cx,cz" -> { solid, trans, needsMesh, dispose() }

function buildChunk(cx, cz) {
  const key = cx + ',' + cz;
  const chunk = world.ensureChunk(cx, cz);
  const result = buildChunkGeometry(chunk, world);
  const entry = meshes.get(key);
  if (entry) entry.dispose();

  const fresh = {
    solid: null,
    trans: null,
    needsMesh: false,
    dispose() {
      if (this.solid) { scene.remove(this.solid); this.solid.geometry.dispose(); }
      if (this.trans) { scene.remove(this.trans); this.trans.geometry.dispose(); }
    },
  };
  if (result.solid) {
    fresh.solid = new THREE.Mesh(result.solid, MAT_OPAQUE);
    fresh.solid.position.set(cx * CHUNK, 0, cz * CHUNK);
    fresh.solid.matrixAutoUpdate = false;
    fresh.solid.updateMatrix();
    scene.add(fresh.solid);
  }
  if (result.trans) {
    fresh.trans = new THREE.Mesh(result.trans, MAT_TRANS);
    fresh.trans.position.set(cx * CHUNK, 0, cz * CHUNK);
    fresh.trans.matrixAutoUpdate = false;
    fresh.trans.updateMatrix();
    scene.add(fresh.trans);
  }
  meshes.set(key, fresh);
}

function updateChunks() {
  const pcx = Math.floor(player.pos.x / CHUNK);
  const pcz = Math.floor(player.pos.z / CHUNK);
  const tasks = [];
  for (let r = 0; r <= RENDER_R + 1; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = pcx + dx, cz = pcz + dz;
        const key = cx + ',' + cz;
        const entry = meshes.get(key);
        if (!entry) {
          tasks.push({ cx, cz, dist: r, kind: world.chunks.has(key) ? 'mesh' : 'gen' });
        } else if (entry.needsMesh) {
          tasks.push({ cx, cz, dist: r, kind: 'mesh' });
        }
      }
    }
  }
  tasks.sort((a, b) => a.dist - b.dist);

  let gen = 0, mesh = 0;
  for (const t of tasks) {
    if (t.dist > RENDER_R) continue;
    if (t.kind === 'gen' && gen < GEN_BUDGET) {
      gen++;
      buildChunk(t.cx, t.cz);
    } else if (t.kind === 'mesh' && mesh < MESH_BUDGET) {
      mesh++;
      buildChunk(t.cx, t.cz);
    }
  }

  for (const [key, entry] of meshes) {
    const [cx, cz] = key.split(',').map(Number);
    if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > RENDER_R + 1) {
      entry.dispose();
      meshes.delete(key);
      world.chunks.delete(key);
    }
  }
}

function remeshAround(x, y, z) {
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  const lx = ((x % CHUNK) + CHUNK) % CHUNK;
  const lz = ((z % CHUNK) + CHUNK) % CHUNK;
  const keys = [cx + ',' + cz];
  if (lx === 0) keys.push((cx - 1) + ',' + cz);
  if (lx === CHUNK - 1) keys.push((cx + 1) + ',' + cz);
  if (lz === 0) keys.push(cx + ',' + (cz - 1));
  if (lz === CHUNK - 1) keys.push(cx + ',' + (cz + 1));
  for (const key of keys) {
    const entry = meshes.get(key);
    if (entry) entry.needsMesh = true;
  }
}

// ---------- 交互 ----------
const _dir = new THREE.Vector3();
let breakingKey = '';
let breakProgress = 0;
let placeTimer = 0;

function intersectsPlayer(px, py, pz) {
  const p = player.pos;
  return px + 1 > p.x - HALF && px < p.x + HALF
      && py + 1 > p.y && py < p.y + HEIGHT
      && pz + 1 > p.z - HALF && pz < p.z + HALF;
}

function doBreak(hit) {
  const color = TILE_COLORS[textureName(BY_ID[hit.id], 0)] || 0x888888;
  world.setBlock(hit.x, hit.y, hit.z, IDs.AIR);
  remeshAround(hit.x, hit.y, hit.z);
  particles.burst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, color, 14);
  playBreak();
}

function doPlace(hit) {
  if (!hit) return false;
  const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
  if (py < 0 || py >= WORLD_H) return false;
  const id = BLOCKS_ORDER[ui.selected];
  const cur = world.getBlock(px, py, pz);
  if (cur !== IDs.AIR && !BY_ID[cur].liquid) return false;
  if (intersectsPlayer(px, py, pz)) return false;
  world.setBlock(px, py, pz, id);
  remeshAround(px, py, pz);
  playPlace();
  return true;
}

function updateInteraction(dt) {
  camera.getWorldDirection(_dir);
  const hit = raycast(world, camera.position, _dir, 7);

  if (hit) {
    highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    highlight.visible = true;
  } else {
    highlight.visible = false;
  }

  // 破坏（按住左键）
  if (input.mouseLeft && hit) {
    const key = hit.x + ',' + hit.y + ',' + hit.z;
    if (key !== breakingKey) {
      breakingKey = key;
      breakProgress = 0;
    }
    const hardness = BY_ID[hit.id].hardness;
    if (hardness !== Infinity) {
      breakProgress += dt * 1000;
      if (breakProgress >= hardness) {
        doBreak(hit);
        breakingKey = '';
        breakProgress = 0;
      }
    }
  } else {
    breakingKey = '';
    breakProgress = 0;
  }

  // 放置（按住右键连发）
  if (input.mouseRight) {
    placeTimer -= dt;
    if (placeTimer <= 0) {
      placeTimer = 0.22;
      doPlace(hit);
    }
  }
}

// ---------- 开始 / 暂停 ----------
function pregenAround(x, z, r) {
  const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) world.ensureChunk(pcx + dx, pcz + dz);
  }
}

function startGame() {
  initAudio();
  pregenAround(player.pos.x, player.pos.z, 1);
  state = 'playing';
  ui.startPlay();
  if (!DEMO) {
    try {
      canvas.requestPointerLock();
    } catch { /* 不支持则退回拖拽视角 */ }
  }
}

let hadLock = false;

document.addEventListener('pointerlockchange', () => {
  if (DEMO) return;
  if (document.pointerLockElement === canvas) {
    hadLock = true;
    return;
  }
  // 曾经锁定过、现在丢失 → 暂停；从未锁定（不支持的环境）→ 保持拖拽视角
  if (hadLock && state === 'playing') {
    state = 'paused';
    ui.showPause();
  }
});

document.addEventListener('pointerlockerror', () => {
  noLock = true;
});

// ---------- 键盘 ----------
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  input.keys.add(e.code);

  if (state === 'start' && (e.code === 'Enter' || e.code === 'Space')) {
    startGame();
    return;
  }
  if (state !== 'playing') return;

  if (e.code === 'F3') {
    e.preventDefault();
    debugOn = !debugOn;
    ui.debugVisible(debugOn);
  } else if (e.code === 'KeyF') {
    player.flying = !player.flying;
    player.vel.y = 0;
    ui.toast(player.flying ? '飞行模式：开' : '飞行模式：关');
  } else if (e.code === 'KeyM') {
    setMuted(!isMuted());
    ui.toast(isMuted() ? '声音：关' : '声音：开');
  } else if (e.code.startsWith('Digit')) {
    const n = Number(e.code.slice(5));
    if (n >= 1 && n <= HOTBAR_BLOCKS.length) ui.setSelected(n - 1);
  } else if (e.code === 'Space' && !e.repeat) {
    const now = performance.now();
    if (now - lastSpaceTime < 300) {
      player.flying = !player.flying;
      player.vel.y = 0;
      ui.toast(player.flying ? '飞行模式：开' : '飞行模式：关');
    }
    lastSpaceTime = now;
  }
});

document.addEventListener('keyup', (e) => {
  input.keys.delete(e.code);
});

window.addEventListener('blur', () => {
  input.keys.clear();
  input.mouseLeft = false;
  input.mouseRight = false;
});

// ---------- 鼠标 ----------
canvas.addEventListener('mousedown', (e) => {
  if (state !== 'playing') return;
  dragging = true;
  if (e.button === 0) input.mouseLeft = true;
  if (e.button === 2) {
    input.mouseRight = true;
    placeTimer = 0;
  }
  if (e.button === 1) {
    // 中键拾取方块
    camera.getWorldDirection(_dir);
    const hit = raycast(world, camera.position, _dir, 7);
    if (hit) {
      const idx = HOTBAR_BLOCKS.indexOf(Object.keys(BLOCKS).find((k) => BLOCKS[k].id === hit.id));
      if (idx >= 0) ui.setSelected(idx);
    }
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.mouseLeft = false;
  if (e.button === 2) input.mouseRight = false;
  if (e.button === 0) dragging = false;
});

window.addEventListener('mousemove', (e) => {
  if (state !== 'playing') return;
  if (document.pointerLockElement === canvas) {
    player.yaw -= e.movementX * 0.0024;
    player.pitch -= e.movementY * 0.0024;
  } else if (noLock && dragging) {
    player.yaw -= e.movementX * 0.0035;
    player.pitch -= e.movementY * 0.0035;
  }
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch));
});

window.addEventListener('wheel', (e) => {
  if (state !== 'playing') return;
  ui.setSelected(ui.selected + (e.deltaY > 0 ? 1 : -1));
}, { passive: true });

window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('pagehide', () => world.saveNow());

// ---------- 主循环 ----------
let lastT = performance.now();
let fps = 0, fpsAcc = 0, fpsFrames = 0;
const DAY_LENGTH = 600;

function facingName() {
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  if (Math.abs(fz) >= Math.abs(fx)) return fz < 0 ? '北' : '南';
  return fx < 0 ? '西' : '东';
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  player.sprinting = input.keys.has('ControlLeft');

  if (state === 'playing') {
    gameTime = (gameTime + dt / DAY_LENGTH) % 1;
    player.update(dt, input);
    updateChunks();
    updateInteraction(dt);
  }

  sky.update(gameTime, camera.position);
  particles.update(dt);

  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);

  const targetFov = player.sprinting && !player.flying && player.onGround ? 80 : 70;
  if (Math.abs(camera.fov - targetFov) > 0.01) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, 10 * dt);
    camera.updateProjectionMatrix();
  }

  for (const entry of meshes.values()) {
    if (entry.trans) entry.trans.renderOrder = -entry.trans.position.distanceToSquared(camera.position);
  }

  renderer.render(scene, camera);

  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc >= 0.5) {
    fps = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0;
    fpsFrames = 0;
    if (debugOn) {
      ui.setDebug(
        `FPS: ${fps}\n` +
        `位置: ${player.pos.x.toFixed(1)} / ${player.pos.y.toFixed(1)} / ${player.pos.z.toFixed(1)}\n` +
        `朝向: ${facingName()}  飞行: ${player.flying ? '开' : '关'}  水中: ${player.inWater ? '是' : '否'}\n` +
        `已加载区块: ${world.chunks.size}  网格: ${meshes.size}\n` +
        `种子: ${world.seed}`
      );
    }
  }
}

// ---------- 启动 ----------
if (DEMO) {
  startGame();
}
requestAnimationFrame(frame);

// ---------- 调试 / 测试接口 ----------
window.__mc3 = {
  getState: () => ({
    pos: { ...player.pos },
    yaw: player.yaw,
    pitch: player.pitch,
    chunks: world.chunks.size,
    meshes: meshes.size,
    fps,
    state,
    flying: player.flying,
    onGround: player.onGround,
    inWater: player.inWater,
    selected: ui.selected,
    seed: world.seed,
    breakProgress,
  }),
  teleport: (x, y, z) => {
    player.pos.x = x; player.pos.y = y; player.pos.z = z;
    player.vel.x = 0; player.vel.y = 0; player.vel.z = 0;
  },
  breakBlock: () => {
    camera.getWorldDirection(_dir);
    const hit = raycast(world, camera.position, _dir, 7);
    if (hit) doBreak(hit);
  },
  placeBlock: () => {
    camera.getWorldDirection(_dir);
    const hit = raycast(world, camera.position, _dir, 7);
    if (hit) doPlace(hit);
  },
  debugSet: (x, y, z, id) => {
    world.setBlock(x, y, z, id);
    remeshAround(x, y, z);
  },
  setTime: (t) => { gameTime = t; },
  getBlock: (x, y, z) => world.getBlock(x, y, z),
  // 同步渲染一帧并采样 9x9 像素颜色（测试/调试用）
  sampleScreen: () => {
    camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
    sky.update(gameTime, camera.position);
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const grid = [];
    for (let gy = 0; gy < 9; gy++) {
      const row = [];
      for (let gx = 0; gx < 9; gx++) {
        const sx = Math.floor(((gx + 0.5) / 9) * w);
        const sy = Math.floor(((gy + 0.5) / 9) * h);
        const i = (sy * w + sx) * 4;
        row.push([px[i], px[i + 1], px[i + 2]]);
      }
      grid.push(row);
    }
    return { w, h, grid };
  },
  world,
  player,
};
