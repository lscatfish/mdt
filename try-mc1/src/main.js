// 主入口：渲染器/场景、游戏循环、输入与方块交互、昼夜循环、天空/云、
// 菜单与存档编排。
import * as THREE from 'three';
import {
  BLOCK, BLOCK_NAMES, SELECTABLE, DAY_LENGTH, REACH, WORLD_HEIGHT, isSolid
} from './config.js';
import { World } from './world.js';
import { Player, raycast, EYE_HEIGHT } from './player.js';
import { createAtlas } from './textures.js';
import { HUD } from './hud.js';
import { sfx } from './audio.js';

const SAVE_KEY = 'mcweb_save_v1';

// ---------- 渲染器 / 场景 ----------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const skyColor = new THREE.Color(0x0a0e2a);
scene.background = skyColor;
scene.fog = new THREE.Fog(skyColor.clone(), 45, 95);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 500);
camera.rotation.order = 'YXZ';

const atlas = createAtlas();
const opaqueMat = new THREE.MeshLambertMaterial({
  map: atlas.texture, vertexColors: true, alphaTest: 0.5, side: THREE.FrontSide
});
const waterMat = new THREE.MeshLambertMaterial({
  map: atlas.texture, vertexColors: true, transparent: true,
  opacity: 0.66, depthWrite: false, side: THREE.DoubleSide
});

// ---------- 光照 ----------
const hemiLight = new THREE.HemisphereLight(0xbfd8ff, 0x6b5a3c, 0.6);
scene.add(hemiLight);
const sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
scene.add(sunLight);
scene.add(sunLight.target);
const sunDir = new THREE.Vector3();

// ---------- 天空物体 ----------
const sunQuad = new THREE.Mesh(
  new THREE.PlaneGeometry(48, 48),
  new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0, fog: false, depthWrite: false })
);
const moonQuad = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0, fog: false, depthWrite: false })
);
scene.add(sunQuad, moonQuad);

const starPositions = new Float32Array(650 * 3);
for (let i = 0; i < 650; i++) {
  const a = Math.random() * Math.PI * 2;
  const e = 0.02 + Math.random() * Math.PI * 0.48;
  const r = 360 + Math.random() * 60;
  starPositions[i * 3] = Math.cos(a) * Math.cos(e) * r;
  starPositions[i * 3 + 1] = Math.sin(e) * r;
  starPositions[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
}
const starGeom = new THREE.BufferGeometry();
starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMat = new THREE.PointsMaterial({
  color: 0xffffff, size: 1.6, sizeAttenuation: true,
  transparent: true, opacity: 0, depthWrite: false, fog: false
});
const stars = new THREE.Points(starGeom, starMat);
scene.add(stars);

const cloudMat = new THREE.MeshLambertMaterial({
  color: 0xffffff, transparent: true, opacity: 0.8, fog: false, emissive: 0x101010
});
const clouds = new THREE.Group();
for (let i = 0; i < 36; i++) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(9 + Math.random() * 18, 1.2 + Math.random() * 1.4, 9 + Math.random() * 18),
    cloudMat
  );
  m.position.set((Math.random() - 0.5) * 220, 80 + Math.random() * 16, (Math.random() - 0.5) * 220);
  clouds.add(m);
}
scene.add(clouds);

// ---------- 瞄准高亮 ----------
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x080808, transparent: true, opacity: 0.9 })
);
highlight.visible = false;
scene.add(highlight);

// ---------- HUD ----------
const hud = new HUD(atlas.canvas);

// ---------- 游戏状态 ----------
let world = null;
let player = null;
let gameStarted = false;
let paused = true;
let selectedIndex = 0;
let worldTime = DAY_LENGTH * 0.18;
let last = performance.now();
let fpsEMA = 60;
let breaking = false;
let breakProgress = 0;
let currentHit = null;
let placeCooldown = 0;
let cameraShake = 0;
let lastAutoSave = performance.now();
let debugTimer = 0;
let lastBedrockToast = 0;
let bob = 0;
const keys = new Set();
let lastSpaceAt = -1e9;

// ---------- 工具 ----------
const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function pointerLocked() {
  return document.pointerLockElement === canvas;
}

function lockPointer() {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* 无指针锁时忽略 */ }
}

function seedFromString(s) {
  s = String(s ?? '').trim();
  if (s === '') return (Math.random() * 0xffffffff) >>> 0;
  if (/^-?\d+$/.test(s)) return Number(s) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------- 世界 / 玩家创建 ----------
function startNewWorld(seedText) {
  const seed = seedFromString(seedText);
  const old = world;
  world = new World(seed);
  world.setRenderer(scene, opaqueMat, waterMat);
  if (old) old.disposeAll();
  hud.showLoading('正在生成世界…');
  requestAnimationFrame(() => {
    try {
      world.prepareSpawn();
    } catch (err) {
      console.error(err);
      hud.showMenu('世界生成失败，请重试');
      return;
    }
    player = new Player(world.spawn.x, world.spawn.y, world.spawn.z, Math.random() * Math.PI * 2, -0.15);
    worldTime = DAY_LENGTH * 0.18;
    enterGame();
  });
}

function loadWorld() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { data = null; }
  if (!data) { hud.toast('没有找到存档'); return; }
  const old = world;
  world = new World(data.seed >>> 0);
  world.setRenderer(scene, opaqueMat, waterMat);
  if (old) old.disposeAll();
  hud.showLoading('正在读取世界…');
  requestAnimationFrame(() => {
    try {
      world.setModifiedEntries(Array.isArray(data.modified) ? data.modified : []);
      world.prepareSpawn();
    } catch (err) {
      console.error(err);
      hud.showMenu('存档读取失败');
      return;
    }
    const p = data.player || {};
    player = new Player(
      Number.isFinite(p.x) ? p.x : world.spawn.x,
      Number.isFinite(p.y) ? p.y : world.spawn.y,
      Number.isFinite(p.z) ? p.z : world.spawn.z,
      Number.isFinite(p.yaw) ? p.yaw : 0,
      Number.isFinite(p.pitch) ? p.pitch : -0.15
    );
    worldTime = Number.isFinite(data.time) ? data.time : DAY_LENGTH * 0.18;
    enterGame();
  });
}

function enterGame() {
  gameStarted = true;
  paused = false;
  breaking = false;
  breakProgress = 0;
  currentHit = null;
  hud.setSelected(selectedIndex);
  hud.setContinueVisible(true);
  hud.showGame();
  sfx.pop();
  lockPointer();
}

function saveWorld(toast = true) {
  if (!world || !player) return false;
  const data = {
    version: 1,
    seed: world.seed,
    time: worldTime,
    player: {
      x: player.pos.x, y: player.pos.y, z: player.pos.z,
      yaw: player.yaw, pitch: player.pitch, flying: player.flying
    },
    modified: world.getModifiedEntries()
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    if (toast) hud.toast('世界已保存');
    return true;
  } catch {
    if (toast) hud.toast('保存失败（存储空间不足？）');
    return false;
  }
}

function resumeGame() {
  if (!gameStarted) return;
  paused = false;
  hud.showGame();
  lockPointer();
}

function backToMenu() {
  if (world && player) saveWorld(false);
  paused = true;
  gameStarted = false;
  breaking = false;
  hud.showMenu('世界已保存，可以随时继续');
}

// ---------- 方块交互 ----------
function intersectsPlayer(x, y, z) {
  const b = player.bounds();
  return x + 1 > b.minX && x < b.maxX && y + 1 > b.minY && y < b.maxY && z + 1 > b.minZ && z < b.maxZ;
}

function doBreak(hit) {
  if (hit.id === BLOCK.BEDROCK) {
    const now = performance.now();
    if (now - lastBedrockToast > 1500) {
      hud.toast('基岩坚不可摧');
      lastBedrockToast = now;
    }
    return;
  }
  world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
  sfx.break();
  cameraShake = 0.18;
}

function placeBlock() {
  if (!currentHit || placeCooldown > 0 || !player || !world) return;
  const id = SELECTABLE[selectedIndex];
  const x = currentHit.x + currentHit.nx;
  const y = currentHit.y + currentHit.ny;
  const z = currentHit.z + currentHit.nz;
  if (y < 0 || y >= WORLD_HEIGHT) return;
  const cur = world.getBlock(x, y, z);
  if (cur !== BLOCK.AIR && cur !== BLOCK.WATER) return;
  if (isSolid(id) && intersectsPlayer(x, y, z)) { hud.toast('这里放不下'); return; }
  world.setBlock(x, y, z, id);
  sfx.place();
  placeCooldown = 0.22;
}

function pickBlock() {
  if (!currentHit) return;
  const i = SELECTABLE.indexOf(currentHit.id);
  if (i >= 0) {
    selectedIndex = i;
    hud.setSelected(i);
    sfx.select();
  } else {
    hud.toast('这个方块无法放进快捷栏');
  }
}

function selectBlock(delta) {
  selectedIndex = (selectedIndex + delta + SELECTABLE.length) % SELECTABLE.length;
  hud.setSelected(selectedIndex);
  sfx.select();
}

function selectByKey(n) {
  const i = n === 0 ? 9 : n - 1;
  if (i < 0 || i >= SELECTABLE.length) return;
  selectedIndex = i;
  hud.setSelected(i);
  sfx.select();
}

function toggleFly() {
  if (!player) return;
  player.flying = !player.flying;
  player.vel.y = 0;
  hud.toast(player.flying ? '飞行模式：开（空格上升 / Shift 下降）' : '飞行模式：关');
}

// ---------- 瞄准与破坏进度 ----------
function updateTarget(dt) {
  if (!player || !world) {
    highlight.visible = false;
    currentHit = null;
    return;
  }
  const cp = Math.cos(player.pitch);
  const sp = Math.sin(player.pitch);
  const dir = new THREE.Vector3(-Math.sin(player.yaw) * cp, sp, -Math.cos(player.yaw) * cp);
  currentHit = raycast(world, camera.position, dir, REACH);

  if (currentHit) {
    highlight.visible = true;
    highlight.position.set(currentHit.x + 0.5, currentHit.y + 0.5, currentHit.z + 0.5);
  } else {
    highlight.visible = false;
  }

  if (breaking) {
    if (currentHit) {
      breakProgress += dt;
      if (breakProgress >= 0.3) {
        doBreak(currentHit);
        breakProgress = 0;
      }
    } else {
      breakProgress = 0;
    }
    const p = Math.min(1, breakProgress / 0.3);
    highlight.material.color.setRGB(0.06 + 0.7 * p, 0.06 + 0.7 * p, 0.06 + 0.7 * p);
  } else {
    highlight.material.color.setHex(0x080808);
  }
}

// ---------- 天空 / 昼夜 ----------
const NIGHT_SKY = new THREE.Color(0x0a0e2a);
const DAY_SKY = new THREE.Color(0x7faeff);
const NIGHT_LIGHT = new THREE.Color(0x8fa3d9);

function updateSky() {
  const ang = (worldTime / DAY_LENGTH) * Math.PI * 2;
  const sunH = Math.sin(ang);
  sunDir.set(Math.cos(ang), sunH, 0.32).normalize();
  const dayK = smoothstep(-0.06, 0.22, sunH);

  skyColor.copy(NIGHT_SKY).lerp(DAY_SKY, dayK);
  scene.fog.color.copy(skyColor);
  scene.fog.near = 45;
  scene.fog.far = 95;

  sunLight.position.copy(sunDir).multiplyScalar(150);
  sunLight.color.setHex(0xffffff).lerp(NIGHT_LIGHT, 1 - dayK);
  sunLight.intensity = 0.08 + dayK * 1.05;
  hemiLight.intensity = 0.14 + dayK * 0.5;
  stars.material.opacity = (1 - dayK) * 0.9;
  cloudMat.opacity = 0.35 + dayK * 0.5;

  const R = 360;
  sunQuad.position.copy(sunDir).multiplyScalar(R);
  sunQuad.lookAt(camera.position);
  sunQuad.material.opacity = smoothstep(-0.14, 0.06, sunH);

  moonQuad.position.copy(sunDir).multiplyScalar(-R);
  moonQuad.lookAt(camera.position);
  moonQuad.material.opacity = smoothstep(0.14, -0.06, sunH);

  // 水下迷雾
  if (player && player.inWater) {
    scene.fog.color.setHex(0x0d2f5e);
    scene.fog.near = 1;
    scene.fog.far = 24;
  }
}

// ---------- 调试面板 ----------
function updateDebug() {
  if (!world || !player) return;
  const dayH = ((worldTime / DAY_LENGTH) % 1) * 24;
  const hh = Math.floor(dayH);
  const mm = Math.floor((dayH - hh) * 60);
  const target = currentHit
    ? `${BLOCK_NAMES[currentHit.id]} @ ${currentHit.x},${currentHit.y},${currentHit.z}`
    : '无';
  hud.setDebug([
    `FPS ${fpsEMA.toFixed(0)}   区块 ${world.chunks.size}   网格 ${world.meshes.size}   待重建 ${world.dirty.size}`,
    `XYZ ${player.pos.x.toFixed(2)} / ${player.pos.y.toFixed(2)} / ${player.pos.z.toFixed(2)}`,
    `区块 (${Math.floor(player.pos.x / 16)}, ${Math.floor(player.pos.z / 16)})   朝向 ${(player.yaw * 180 / Math.PI).toFixed(1)}°`,
    `目标 ${target}`,
    `种子 ${world.seed}   时间 ${hh}:${String(mm).padStart(2, '0')}`,
    `飞行 ${player.flying ? '开' : '关'}   水中 ${player.inWater ? '是' : '否'}   着地 ${player.onGround ? '是' : '否'}`
  ].join('\n'));
}

// ---------- 输入 ----------
document.addEventListener('keydown', (e) => {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.code === 'Space') e.preventDefault();
  keys.add(e.code);

  if (e.code === 'Space') {
    const now = performance.now();
    if (gameStarted && !paused && player && !player.inWater && now - lastSpaceAt < 280) {
      toggleFly();
      lastSpaceAt = -1e9;
    } else {
      lastSpaceAt = now;
    }
  } else if (e.code === 'KeyF' && gameStarted && !paused && player) {
    toggleFly();
  } else if (e.code === 'F3') {
    hud.toggleDebug();
  } else if (/^Digit[0-9]$/.test(e.code)) {
    selectByKey(parseInt(e.code.slice(5), 10));
  }
});
document.addEventListener('keyup', (e) => keys.delete(e.code));

canvas.addEventListener('mousedown', (e) => {
  sfx.unlock();
  if (!gameStarted || paused) return;
  if (!pointerLocked()) { lockPointer(); return; }
  if (e.button === 0) { breaking = true; breakProgress = 0; }
  else if (e.button === 2) placeBlock();
  else if (e.button === 1) pickBlock();
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) breaking = false; });

document.addEventListener('mousemove', (e) => {
  if (!pointerLocked() || !gameStarted || paused || !player) return;
  const sens = 0.0021;
  player.yaw -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  const lim = Math.PI / 2 - 0.01;
  player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
});

canvas.addEventListener('wheel', (e) => {
  if (!gameStarted || paused) return;
  e.preventDefault();
  selectBlock(Math.sign(e.deltaY) || 1);
}, { passive: false });

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('pointerlockchange', () => {
  if (!pointerLocked() && gameStarted && !paused) {
    paused = true;
    breaking = false;
    breakProgress = 0;
    hud.showPause();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('beforeunload', () => {
  if (gameStarted && world && player) saveWorld(false);
});

// ---------- HUD 回调 ----------
hud.onNew = (seedText) => startNewWorld(seedText);
hud.onContinue = () => loadWorld();
hud.onResume = () => resumeGame();
hud.onSave = () => saveWorld(true);
hud.onMenu = () => backToMenu();
hud.onSelect = (i) => { selectedIndex = i; hud.setSelected(i); sfx.select(); };

// ---------- 主循环 ----------
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0.0001;
  if (dt > 0.05) dt = 0.05;
  fpsEMA += (1 / dt - fpsEMA) * 0.05;

  if (gameStarted && !paused && player && world) {
    player.update(dt, keys, world);
    if (player.justLanded) {
      cameraShake = Math.max(cameraShake, 0.3);
      sfx.land();
    }
    if (player.pos.y < -12) {
      player.pos.set(world.spawn.x, world.spawn.y + 1, world.spawn.z);
      player.vel.set(0, 0, 0);
      hud.toast('掉出了世界，已送回出生点');
    }

    world.updateChunks(player.pos.x, player.pos.z);
    world.remeshDirty(player.pos.x, player.pos.z);
    worldTime = (worldTime + dt) % DAY_LENGTH;
    placeCooldown = Math.max(0, placeCooldown - dt);

    // 行走视角晃动
    const hs = Math.hypot(player.vel.x, player.vel.z);
    if (player.onGround && !player.flying && hs > 0.4) {
      player.bobPhase += dt * (7 + hs * 2.2);
    }
    const bobTarget = player.onGround && !player.flying ? Math.sin(player.bobPhase * 2) * 0.045 * Math.min(1, hs / 4.3) : 0;
    bob += (bobTarget - bob) * Math.min(1, 12 * dt);

    camera.position.set(player.pos.x, player.pos.y + EYE_HEIGHT + bob, player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
    updateTarget(dt);

    if (now - lastAutoSave > 30000) {
      lastAutoSave = now;
      saveWorld(false);
      hud.toast('已自动保存');
    }
  } else if (player && !gameStarted) {
    camera.position.set(player.pos.x, player.pos.y + EYE_HEIGHT, player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
  }

  updateSky();
  clouds.position.x += paused ? 0 : dt * 0.5;
  if (clouds.position.x > 260) clouds.position.x -= 520;

  cameraShake = Math.max(0, cameraShake - 2.4 * dt);
  if (cameraShake > 0) {
    camera.position.x += (Math.random() - 0.5) * cameraShake * 0.6;
    camera.position.y += (Math.random() - 0.5) * cameraShake * 0.6;
  }

  debugTimer -= dt;
  if (debugTimer <= 0) {
    debugTimer = 0.25;
    updateDebug();
  }

  renderer.render(scene, camera);
}

// ---------- 启动 ----------
hud.showMenu();
hud.setContinueVisible(!!localStorage.getItem(SAVE_KEY));
requestAnimationFrame(frame);

// 调试/自动化测试接口
window.__mc = {
  world: () => world,
  player: () => player,
  renderer: () => renderer,
  scene: () => scene,
  camera: () => camera,
  getState: () => ({ gameStarted, paused, selectedIndex, worldTime }),
  startNewWorld,
  loadWorld,
  saveWorld,
  selectBlock,
  placeBlock,
  pickBlock,
  toggleFly,
  raycast: () => currentHit,
  breakBlock: () => { if (currentHit) doBreak(currentHit); },
  seedFromString
};
