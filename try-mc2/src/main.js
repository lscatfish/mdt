import * as THREE from "../vendor/three.module.js";
import { CFG } from "./config.js";
import { World } from "./world.js";
import {
  AIR, WATER, BEDROCK,
  DEFAULT_HOTBAR, DEFAULT_COUNTS, hardnessOf, blockName,
} from "./blocks.js";
import { createTextureAtlas } from "./textures.js";
import { ChunkRenderer } from "./mesher.js";
import { raycastVoxel } from "./raycast.js";
import { Player } from "./player.js";
import { Controls } from "./controls.js";
import { Sky } from "./sky.js";
import { GameAudio } from "./audio.js";
import { UI } from "./ui.js";

const SX = CFG.CHUNK_SIZE;
const GEN_R = CFG.GEN_DISTANCE;
const RENDER_R = CFG.RENDER_DISTANCE;

const canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x8fc3e8, 40, 96);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 700);
camera.rotation.order = "YXZ";

// ---------- 存档 ----------
const SOUND_KEY = "webcraft.sound";
let saved = null;
try {
  const raw = localStorage.getItem(CFG.SAVE_KEY);
  if (raw) saved = JSON.parse(raw);
} catch { saved = null; }

const seed = saved && Number.isInteger(saved.seed) ? saved.seed : ((Math.random() * 0x7fffffff) | 0);
const world = new World(seed);
if (saved) world.applySaved(saved.dirty);

// ---------- 资源与场景 ----------
const atlas = createTextureAtlas();
const materials = {
  solid: new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true }),
  leaves: new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
  glass: new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, transparent: true, opacity: 0.42, side: THREE.DoubleSide }),
  water: new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, transparent: true, opacity: 0.74, depthWrite: false, side: THREE.DoubleSide }),
};

const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x8a7a62, 0.7);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
scene.add(sunLight);
scene.add(sunLight.target);

const sky = new Sky(scene);
const chunkRenderer = new ChunkRenderer(scene, world, atlas, materials);
const audio = new GameAudio();
audio.enabled = localStorage.getItem(SOUND_KEY) !== "0";
const ui = new UI(atlas);

// ---------- 玩家状态 ----------
function findSpawn() {
  let best = null;
  for (let dz = -64; dz <= 64; dz += 4) {
    for (let dx = -64; dx <= 64; dx += 4) {
      const h = world.heightAt(dx, dz);
      if (h > CFG.SEA_LEVEL + 1 && (!best || h > best.h)) {
        best = { x: dx + 0.5, z: dz + 0.5, h };
      }
    }
  }
  if (!best) {
    const h = world.heightAt(0, 0);
    best = { x: 0.5, z: 0.5, h };
  }
  return best;
}
const spawnPoint = findSpawn();
const spawnFeetY = spawnPoint.h + 1 + 0.01;
const player = new Player(world, new THREE.Vector3(spawnPoint.x, spawnFeetY, spawnPoint.z));
if (saved?.player) {
  const p = saved.player;
  player.pos.set(p.x, p.y, p.z);
  player.yaw = p.yaw ?? 0;
  player.pitch = p.pitch ?? 0;
  player.health = Math.max(1, p.health ?? 20);
  player.mode = p.mode === "creative" ? "creative" : "survival";
}
player.onHurt = (amount) => {
  if (amount < 0) {
    audio.respawn();
    ui.toast("你重生在了出生点");
    flashHurt(false);
  } else {
    audio.hurt();
    flashHurt(true);
  }
};

let hotbar = Array.isArray(saved?.hotbar) ? saved.hotbar : [...DEFAULT_HOTBAR];
let counts = saved?.counts && typeof saved.counts === "object" ? { ...DEFAULT_COUNTS, ...saved.counts } : { ...DEFAULT_COUNTS };
let selected = Math.max(0, Math.min(8, saved?.selected ?? 0));
let timeOfDay = typeof saved?.time === "number" ? saved.time : 0.3;
let state = "loading"; // loading | menu | playing | paused
let debugOn = false;

// ---------- 辅助 UI ----------
const hurtEl = document.createElement("div");
hurtEl.style.cssText =
  "position:fixed;inset:0;z-index:15;pointer-events:none;background:radial-gradient(ellipse at center,transparent 45%,rgba(255,30,30,.55) 100%);opacity:0;transition:opacity .12s";
document.body.appendChild(hurtEl);
let hurtTimer = null;
function flashHurt(on) {
  hurtEl.style.opacity = on ? "1" : "0";
  clearTimeout(hurtTimer);
  if (on) hurtTimer = setTimeout(() => (hurtEl.style.opacity = "0"), 140);
}

const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.75 }),
);
highlight.visible = false;
scene.add(highlight);

function selectSlot(i) {
  selected = (i + 9) % 9;
  refreshHotbar();
  ui.flashSlotName(blockName(hotbar[selected]));
}

function refreshHotbar() {
  ui.setHotbar(hotbar, counts, selected, player.creative);
}

function toggleMode() {
  player.mode = player.creative ? "survival" : "creative";
  if (player.mode === "survival") player.flying = false;
  ui.toast(player.creative ? "已切换: 创造模式(可飞行、无限方块)" : "已切换: 生存模式");
  refreshHotbar();
}

// ---------- 输入 ----------
const controls = new Controls(canvas, {
  onMouseMove: (dx, dy) => player.lookAt(dx, dy),
  onWheel: (dir) => {
    if (state === "playing") selectSlot(selected + dir);
  },
  onLockChange: (locked) => {
    if (locked) {
      state = "playing";
      ui.showHud();
    } else if (state === "playing") {
      state = "paused";
      ui.setBreakProgress(null);
      ui.showPause();
    }
  },
  onLockError: () => ui.toast("无法锁定鼠标,请稍后再试"),
});

window.addEventListener("keydown", (e) => {
  if (e.code.startsWith("Digit")) {
    const n = Number(e.code.slice(5));
    if (n >= 1 && n <= 9 && state === "playing") selectSlot(n - 1);
  } else if (e.code === "F3") {
    e.preventDefault();
    debugOn = !debugOn;
    if (!debugOn) ui.hideDebug();
  } else if (e.code === "KeyC" && state === "playing") {
    toggleMode();
  } else if (e.code === "KeyM") {
    audio.enabled = !audio.enabled;
    localStorage.setItem(SOUND_KEY, audio.enabled ? "1" : "0");
    ui.setSoundLabel(audio.enabled);
    ui.toast(audio.enabled ? "声音: 开" : "声音: 关");
    if (audio.enabled) audio.ensure();
  }
});

ui.el.btnStart.addEventListener("click", () => {
  audio.ensure();
  controls.requestLock();
});
ui.el.btnResume.addEventListener("click", () => {
  audio.ensure();
  controls.requestLock();
});
ui.el.btnNewWorld.addEventListener("click", () => {
  localStorage.removeItem(CFG.SAVE_KEY);
  location.reload();
});
ui.el.btnSound.addEventListener("click", () => {
  audio.enabled = !audio.enabled;
  localStorage.setItem(SOUND_KEY, audio.enabled ? "1" : "0");
  ui.setSoundLabel(audio.enabled);
  if (audio.enabled) audio.ensure();
});
ui.setSoundLabel(audio.enabled);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- 区块流式加载 ----------
let genQueue = [];
let meshQueue = [];
let queueCenter = null;
let meshScanNeeded = false;

function neighborsReady(cx, cz) {
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!world.getChunk(cx + dx, cz + dz)) return false;
    }
  }
  return true;
}

function buildQueues(cx, cz) {
  genQueue = [];
  meshQueue = [];
  queueCenter = [cx, cz];
  for (let dz = -GEN_R; dz <= GEN_R; dz++) {
    for (let dx = -GEN_R; dx <= GEN_R; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dz));
      if (d > GEN_R) continue;
      const key = world.key(cx + dx, cz + dz);
      if (!world.chunks.has(key)) genQueue.push({ cx: cx + dx, cz: cz + dz, d });
    }
  }
  genQueue.sort((a, b) => a.d - b.d);
  meshScanNeeded = true;
}

function scanMeshQueue() {
  meshQueue = [];
  const [cx, cz] = queueCenter;
  for (let dz = -RENDER_R; dz <= RENDER_R; dz++) {
    for (let dx = -RENDER_R; dx <= RENDER_R; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dz));
      if (d > RENDER_R) continue;
      const ccx = cx + dx;
      const ccz = cz + dz;
      if (!world.getChunk(ccx, ccz)) continue;
      if (chunkRenderer.has(ccx, ccz)) continue;
      if (!neighborsReady(ccx, ccz)) continue;
      meshQueue.push({ cx: ccx, cz: ccz, d });
    }
  }
  meshQueue.sort((a, b) => a.d - b.d);
  meshScanNeeded = false;
}

function processStreaming(budgetMs) {
  const start = performance.now();
  while (genQueue.length && performance.now() - start < budgetMs) {
    const item = genQueue.shift();
    world.ensureChunk(item.cx, item.cz);
  }
  if (!genQueue.length && meshScanNeeded) scanMeshQueue();
  while (meshQueue.length && performance.now() - start < budgetMs) {
    const item = meshQueue.shift();
    if (neighborsReady(item.cx, item.cz) && !chunkRenderer.has(item.cx, item.cz)) {
      chunkRenderer.rebuild(item.cx, item.cz);
    }
  }
}

async function initialLoad(centerCX, centerCZ) {
  buildQueues(centerCX, centerCZ);
  const totalGen = genQueue.length;
  let done = 0;
  while (genQueue.length) {
    const item = genQueue.shift();
    world.ensureChunk(item.cx, item.cz);
    done++;
    if (done % 3 === 0 || genQueue.length === 0) {
      ui.setLoading((done / totalGen) * 0.75);
      await new Promise((r) => requestAnimationFrame(r));
    }
  }
  scanMeshQueue();
  const totalMesh = meshQueue.length;
  while (meshQueue.length) {
    const item = meshQueue.shift();
    if (neighborsReady(item.cx, item.cz)) chunkRenderer.rebuild(item.cx, item.cz);
    done++;
    if (done % 2 === 0 || meshQueue.length === 0) {
      ui.setLoading(Math.min(1, done / (totalGen + totalMesh)));
      await new Promise((r) => requestAnimationFrame(r));
    }
  }
}

// ---------- 交互 ----------
let breakTarget = null;
let breakProgress = 0;
let breakWarned = false;
let placeCooldown = 0;
let lastJumpTap = -1;

function updateInteraction(dt) {
  const eye = player.eyePos;
  const dir = camera.getWorldDirection(new THREE.Vector3());
  const hit = raycastVoxel(eye, dir, CFG.REACH, world);

  if (hit) {
    highlight.visible = true;
    highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  } else {
    highlight.visible = false;
  }

  // ---- 中键拾取方块 ----
  if (controls.consumePick() && hit) {
    const idx = hotbar.indexOf(hit.block);
    if (idx >= 0) {
      selectSlot(idx);
    } else if (player.creative || (counts[hit.block] || 0) > 0) {
      hotbar[selected] = hit.block;
      refreshHotbar();
      ui.flashSlotName(blockName(hit.block));
    }
  }

  // ---- 破坏 ----
  if (controls.leftDown && hit) {
    const same = breakTarget && breakTarget.x === hit.x && breakTarget.y === hit.y && breakTarget.z === hit.z;
    if (!same) {
      breakTarget = { ...hit };
      breakProgress = 0;
      breakWarned = false;
    }
    if (!player.creative && hit.block === BEDROCK) {
      if (!breakWarned) {
        ui.toast("基岩牢不可破");
        breakWarned = true;
      }
      ui.setBreakProgress(null);
      return;
    }
    const hardness = player.creative ? 0 : hardnessOf(hit.block);
    breakProgress += hardness > 0 ? dt / hardness : 1;
    if (breakProgress >= 1) {
      breakBlock(hit);
      breakTarget = null;
      breakProgress = 0;
      ui.setBreakProgress(null);
    } else {
      ui.setBreakProgress(breakProgress);
    }
  } else {
    breakTarget = null;
    breakProgress = 0;
    ui.setBreakProgress(null);
  }

  // ---- 放置 ----
  placeCooldown -= dt;
  const wantPlace = controls.consumePlace() || (controls.rightDown && placeCooldown <= 0);
  if (wantPlace && hit) {
    const tx = hit.x + hit.nx;
    const ty = hit.y + hit.ny;
    const tz = hit.z + hit.nz;
    const target = world.getBlock(tx, ty, tz);
    const id = hotbar[selected];
    if (id !== AIR && (target === AIR || target === WATER) && ty >= 0 && ty < CFG.CHUNK_HEIGHT) {
      if (!blockIntersectsPlayer(tx, ty, tz)) {
        if (player.creative || (counts[id] || 0) > 0) {
          world.setBlock(tx, ty, tz, id);
          chunkRenderer.rebuildAround(tx, tz);
          audio.place();
          if (!player.creative) {
            counts[id]--;
            refreshHotbar();
          }
          placeCooldown = CFG.PLACE_COOLDOWN;
        } else {
          ui.toast("没有更多" + blockName(id));
          placeCooldown = 0.3;
        }
      }
    }
  }
}

function breakBlock(hit) {
  world.setBlock(hit.x, hit.y, hit.z, AIR);
  chunkRenderer.rebuildAround(hit.x, hit.z);
  audio.breakBlock();
  if (!player.creative && hit.block !== WATER) {
    counts[hit.block] = Math.min(64, (counts[hit.block] || 0) + 1);
    refreshHotbar();
  }
}

function blockIntersectsPlayer(bx, by, bz) {
  const minX = player.pos.x - 0.3;
  const maxX = player.pos.x + 0.3;
  const minY = player.pos.y;
  const maxY = player.pos.y + 1.8;
  const minZ = player.pos.z - 0.3;
  const maxZ = player.pos.z + 0.3;
  return minX < bx + 1 && maxX > bx && minY < by + 1 && maxY > by && minZ < bz + 1 && maxZ > bz;
}

// ---------- 存档 ----------
function saveGame(silent = false) {
  try {
    const data = {
      version: 1,
      seed: world.seed,
      time: timeOfDay,
      player: {
        x: player.pos.x, y: player.pos.y, z: player.pos.z,
        yaw: player.yaw, pitch: player.pitch,
        health: player.health, mode: player.mode,
      },
      hotbar, counts, selected,
      dirty: world.serialize().dirty,
    };
    localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(data));
    world.dirty.clear();
    if (!silent) ui.showSaveToast();
  } catch (err) {
    ui.toast("存档失败: " + err.message);
  }
}

let autosaveTimer = 0;
let fpsAccum = 0;
let fpsFrames = 0;
let fps = 0;
let debugTimer = 0;
let lastCX = null;
let lastCZ = null;

// ---------- 主循环 ----------
let lastTime = performance.now();
let menuYaw = 0;

function update(dt) {
  const event = player.update(dt, controls.input);
  if (event === "step") audio.step();

  // 双击空格切换飞行(创造模式)
  const taps = controls.consumeJumpTaps();
  if (taps > 0) {
    const now = performance.now();
    if (now - lastJumpTap < 320 && player.creative) {
      player.flying = !player.flying;
      player.vel.y = 0;
      player.fallDistance = 0;
      ui.toast(player.flying ? "飞行模式: 开" : "飞行模式: 关");
      lastJumpTap = -1;
    } else {
      lastJumpTap = now;
    }
  }

  // 区块流式加载
  const pcx = Math.floor(player.pos.x / SX);
  const pcz = Math.floor(player.pos.z / SX);
  if (pcx !== lastCX || pcz !== lastCZ) {
    lastCX = pcx;
    lastCZ = pcz;
    buildQueues(pcx, pcz);
    // 卸载远处的网格与数据
    for (const [key, group] of chunkRenderer.map) {
      if (Math.max(Math.abs(group.cx - pcx), Math.abs(group.cz - pcz)) > RENDER_R + 1) {
        chunkRenderer.remove(key);
      }
    }
    if (world.dirty.size === 0) {
      world.unloadFar(pcx, pcz, GEN_R + 1);
    }
  }
  processStreaming(6);

  updateInteraction(dt);

  // 时间与天空
  timeOfDay = (timeOfDay + dt / CFG.DAY_LENGTH) % 1;
  autosaveTimer += dt;
  if (autosaveTimer >= CFG.AUTOSAVE_INTERVAL) {
    autosaveTimer = 0;
    if (world.dirty.size > 0) {
      saveGame();
      world.unloadFar(pcx, pcz, GEN_R + 1);
    }
  }
}

function updateCameraAndSky(dt) {
  if (state === "playing") {
    camera.position.set(player.pos.x, player.pos.y + player.eyeHeight, player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
    // 冲刺时轻微拉大 FOV
    const targetFov = controls.input.sprint && controls.input.forward ? 86 : 75;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8);
      camera.updateProjectionMatrix();
    }
  } else if (state === "menu") {
    menuYaw += dt * 0.06;
    camera.position.set(player.pos.x, player.pos.y + CFG.EYE_HEIGHT, player.pos.z);
    camera.rotation.set(-0.08, menuYaw, 0, "YXZ");
  }

  sky.update(camera.position, timeOfDay, state === "playing" ? dt : 0);

  const day = sky.dayFactor;
  hemi.intensity = 0.22 + day * 0.55;
  sunLight.intensity = 0.35 + day * 1.15;
  sunLight.color.setRGB(0.75 + day * 0.25, 0.75 + day * 0.2, 0.8 + day * 0.2);
  sunLight.position.copy(camera.position).addScaledVector(sky.sunDir, 160);
  sunLight.target.position.copy(camera.position);

  if (player.eyeInWater && state === "playing") {
    scene.fog.color.setRGB(0.08, 0.3, 0.52);
    scene.fog.near = 0.5;
    scene.fog.far = 26;
  } else {
    scene.fog.color.copy(sky.fogColor());
    scene.fog.near = RENDER_R * SX * 0.62;
    scene.fog.far = RENDER_R * SX * 1.6;
  }
}

function updateDebug(dt) {
  fpsAccum += dt;
  fpsFrames++;
  debugTimer += dt;
  if (debugTimer >= 0.5) {
    fps = Math.round(fpsFrames / fpsAccum);
    fpsAccum = 0;
    fpsFrames = 0;
    debugTimer = 0;
  }
  if (!debugOn) return;
  const pcx = Math.floor(player.pos.x / SX);
  const pcz = Math.floor(player.pos.z / SX);
  const yaw = ((player.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const facing = ["北", "西", "南", "东"][Math.floor(yaw / (Math.PI / 2) + 0.5) % 4];
  ui.setDebug(
    `WebCraft  FPS: ${fps}\n` +
    `位置: ${player.pos.x.toFixed(1)} / ${player.pos.y.toFixed(1)} / ${player.pos.z.toFixed(1)}\n` +
    `区块: ${pcx}, ${pcz}  朝向: ${facing}\n` +
    `模式: ${player.creative ? "创造" : "生存"}  生命: ${player.health}\n` +
    `种子: ${world.seed}  时间: ${(timeOfDay * 24).toFixed(1)} 时\n` +
    `已加载区块: ${world.chunks.size}  已建网格: ${chunkRenderer.map.size}\n` +
    `渲染调用: ${renderer.info.render.calls}  三角形: ${renderer.info.render.triangles}`,
  );
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (state === "playing") {
    update(dt);
    updateDebug(dt);
  }
  updateCameraAndSky(dt);
  renderer.render(scene, camera);
}

// ---------- 启动 ----------
(async function bootstrap() {
  try {
    const centerCX = Math.floor(player.pos.x / SX);
    const centerCZ = Math.floor(player.pos.z / SX);
    await initialLoad(centerCX, centerCZ);
    refreshHotbar();
    ui.updateHealth(player.health);
    state = "menu";
    ui.showMenu();
    menuYaw = player.yaw;
    animate(performance.now());
  } catch (err) {
    console.error(err);
    ui.setLoading(0, "初始化失败");
    ui.el.loadProgress.textContent = "初始化失败: " + err.message;
  }
})();

window.addEventListener("beforeunload", () => {
  if (state === "playing" || state === "paused") saveGame(true);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (state === "playing" || state === "paused")) saveGame(true);
});

// 调试/自动化测试钩子(不影响正常游玩)
window.__webcraft = {
  get state() { return state; },
  get selected() { return selected; },
  world,
  player,
  controls,
  chunkRenderer,
  camera,
  scene,
  setPlaying() {
    state = "playing";
    ui.showHud();
  },
  setMenu() {
    state = "menu";
    ui.showMenu();
  },
  save: () => saveGame(),
};
