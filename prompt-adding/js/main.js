// Game bootstrap: assembles all modules, runs the loop, exposes window.__game
// debug/test API. Browser-only.
import { BLOCK, BLOCK_NAMES, HOTBAR_BLOCKS, PHYS, VIEW_RADIUS, CHUNK_SIZE, FACE, FACE_TILE } from "./config.js";
import { World, chunkKey } from "./world.js";
import { Player, dirFromYawPitch } from "./physics.js";
import { raycastVoxel, placementPosition } from "./raycast.js";
import { buildChunkMesh } from "./mesher.js";
import { Renderer, daylightOf, skyColorFor, lightFactor, sunDirection } from "./renderer.js";
import { buildAtlas, getAtlasCanvas, texelAt } from "./textures.js";
import { Input } from "./input.js";
import { AudioFX } from "./audio.js";
import { HUD } from "./hud.js";

const DAY_LENGTH = 240; // seconds per full day/night cycle
const STORAGE_KEY = "webminecraft-save-v1";

const params = new URLSearchParams(location.search);
const testMode = params.get("test") === "1";
const seedParam = params.get("seed");
const seed = seedParam !== null && seedParam !== ""
  ? (Number.isNaN(Number(seedParam)) ? seedParam : Number(seedParam))
  : Math.floor(Math.random() * 2 ** 31);

const overlay = document.getElementById("overlay");
const overlayPanel = overlay.querySelector(".panel");
const glCanvas = document.getElementById("gl");
const hudCanvas = document.getElementById("hud");

let world, player, renderer, audio, input, hud;
let started = false;
let paused = false;
let hotbarIndex = 0;
let breakCooldown = 0;
let placeCooldown = 0;
let stepTimer = 0;
let fps = 60;
let lastTime = performance.now();
let currentHit = null;
let wasOnGround = true;

function fatal(msg) {
  overlayPanel.innerHTML = `<h1>⚠️ 无法启动</h1><p>${msg}</p>`;
  overlay.style.display = "flex";
}

try {
  const atlas = buildAtlas();
  world = new World(seed);
  const sx = 8.5;
  const sz = 8.5;
  const sy = world.height(sx, sz) + 1;
  player = new Player(sx, sy, sz, Math.PI * 0.3, -0.08);
  renderer = new Renderer(glCanvas, world);
  audio = new AudioFX();
  hud = new HUD(hudCanvas, atlas);
  input = new Input(glCanvas, {
    onLockChange: (locked) => {
      if (started && !locked && !testMode && !input.isTouch) {
        overlay.style.display = "flex";
      }
    },
    onHotbarDelta: (d) => { hotbarIndex = input.hotbarIndex; },
    onToggleFly: () => {
      player.flying = !player.flying;
      player.vel.y = 0;
      hud.showMessage(player.flying ? "🕊 飞行模式开启" : "🦶 已落地行走");
    },
    onJump: () => audio.ensure(),
    testMode,
  });
} catch (err) {
  fatal(err.message);
  console.error(err);
  throw err;
}

// ---------------------------------------------------------------- helpers

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  glCanvas.width = w;
  glCanvas.height = h;
  renderer.resize(w, h);
  hud.resize(w, h);
}
window.addEventListener("resize", resize);
resize();

function playerAABB() {
  const hw = PHYS.PLAYER_WIDTH / 2;
  return {
    minX: player.pos.x - hw, maxX: player.pos.x + hw,
    minY: player.pos.y, maxY: player.pos.y + PHYS.PLAYER_HEIGHT,
    minZ: player.pos.z - hw, maxZ: player.pos.z + hw,
  };
}

function blockIntersectsPlayer(bx, by, bz) {
  const a = playerAABB();
  return bx < a.maxX && bx + 1 > a.minX && by < a.maxY && by + 1 > a.minY && bz < a.maxZ && bz + 1 > a.minZ;
}

function aimRay() {
  const eye = player.eye;
  const d = dirFromYawPitch(player.yaw, player.pitch);
  return raycastVoxel(world, eye.x, eye.y, eye.z, d.x, d.y, d.z);
}

function streamChunks() {
  const pcx = Math.floor(player.pos.x / CHUNK_SIZE);
  const pcz = Math.floor(player.pos.z / CHUNK_SIZE);
  let genBudget = 6;
  let meshBudget = 6;
  for (let r = 0; r <= VIEW_RADIUS; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = pcx + dx;
        const cz = pcz + dz;
        const c = world.chunks.get(chunkKey(cx, cz));
        if (!c || !c.generated) {
          if (genBudget-- <= 0) continue;
          world.ensureChunk(cx, cz);
        }
      }
    }
  }
  for (const key of world.meshDirty) {
    if (meshBudget-- <= 0) break;
    world.meshDirty.delete(key);
    const [cx, cz] = key.split(",").map(Number);
    if (!world.getChunkData(cx, cz)) continue;
    renderer.uploadChunkMesh(key, buildChunkMesh(world, cx, cz));
  }
  for (const key of renderer.chunkBuffers.keys()) {
    const [cx, cz] = key.split(",").map(Number);
    if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > VIEW_RADIUS + 2) {
      renderer.removeChunkMesh(key);
    }
  }
}

function interact(dt) {
  breakCooldown -= dt;
  placeCooldown -= dt;
  const breakHeld = input.leftHeld || input.touch.breakHeld;
  const placeHeld = input.rightHeld || input.touch.placeHeld;
  if (breakHeld && breakCooldown <= 0 && currentHit) {
    breakCooldown = 0.25;
    const was = world.getBlock(currentHit.x, currentHit.y, currentHit.z);
    if (was !== BLOCK.BEDROCK && was !== BLOCK.AIR) {
      world.setBlock(currentHit.x, currentHit.y, currentHit.z, BLOCK.AIR);
      audio.dig();
    }
  }
  if (placeHeld && placeCooldown <= 0 && currentHit) {
    placeCooldown = 0.25;
    const p = placementPosition(currentHit);
    const cur = world.getBlock(p.x, p.y, p.z);
    if ((cur === BLOCK.AIR || cur === BLOCK.WATER) && !blockIntersectsPlayer(p.x, p.y, p.z)) {
      world.setBlock(p.x, p.y, p.z, HOTBAR_BLOCKS[hotbarIndex]);
      audio.place();
    }
  }
}

function projectToScreen(x, y, z) {
  const pv = renderer.projView;
  const px = pv[0] * x + pv[4] * y + pv[8] * z + pv[12];
  const py = pv[1] * x + pv[5] * y + pv[9] * z + pv[13];
  const pw = pv[3] * x + pv[7] * y + pv[11] * z + pv[15];
  if (pw <= 0) return { visible: false };
  const ndcX = px / pw;
  const ndcY = py / pw;
  if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1) return { visible: false };
  return {
    visible: true,
    x: (ndcX * 0.5 + 0.5) * renderer.width,
    y: (1 - (ndcY * 0.5 + 0.5)) * renderer.height,
  };
}

// ---------------------------------------------------------------- save/load

function saveGame() {
  const data = {
    world: world.serialize(),
    player: {
      x: player.pos.x, y: player.pos.y, z: player.pos.z,
      yaw: player.yaw, pitch: player.pitch, flying: player.flying,
    },
    hotbarIndex,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  hud.showMessage("💾 已保存");
}

function loadGame() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    hud.showMessage("没有找到存档");
    return false;
  }
  try {
    const data = JSON.parse(raw);
    const newWorld = World.deserialize(data.world);
    world = newWorld;
    renderer.world = newWorld;
    for (const key of renderer.chunkBuffers.keys()) renderer.removeChunkMesh(key);
    if (data.player) {
      player.pos.x = data.player.x;
      player.pos.y = data.player.y;
      player.pos.z = data.player.z;
      player.yaw = data.player.yaw;
      player.pitch = data.player.pitch;
      player.flying = !!data.player.flying;
    }
    player.vel.x = player.vel.y = player.vel.z = 0;
    hotbarIndex = data.hotbarIndex ?? 0;
    hud.showMessage("📂 已读取存档");
    return true;
  } catch (err) {
    console.error("load failed", err);
    hud.showMessage("存档损坏");
    return false;
  }
}

// ---------------------------------------------------------------- main loop

function advanceTime(dt) {
  world.timeOfDay = (world.timeOfDay + dt / DAY_LENGTH) % 1;
}

function drawHUD() {
  const eye = player.eye;
  const sun = sunDirection(world.timeOfDay);
  const moon = sunDirection(world.timeOfDay + 0.5);
  const sunScreen = projectToScreen(eye.x + sun[0] * 400, eye.y + sun[1] * 400, eye.z + sun[2] * 400);
  const moonScreen = projectToScreen(eye.x + moon[0] * 400, eye.y + moon[1] * 400, eye.z + moon[2] * 400);
  const hours = Math.floor((world.timeOfDay * 24 + 6) % 24);
  const mins = Math.floor(((world.timeOfDay * 24 + 6) % 24 - hours) * 60);
  const targetName = currentHit ? BLOCK_NAMES[world.getBlock(currentHit.x, currentHit.y, currentHit.z)] : "—";
  hud.draw({
    fps,
    x: player.pos.x, y: player.pos.y, z: player.pos.z,
    yawDeg: (player.yaw * 180 / Math.PI) % 360,
    pitchDeg: player.pitch * 180 / Math.PI,
    chunk: `${Math.floor(player.pos.x / 16)},${Math.floor(player.pos.z / 16)}`,
    target: targetName,
    clock: `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`,
    seed: world.seed,
    flying: player.flying,
    onGround: player.onGround,
    muted: audio.muted,
    hotbarIndex,
    sunScreen,
    moonScreen,
    daylight: daylightOf(world.timeOfDay),
  });
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  if (dt > 0) fps = fps * 0.92 + (1 / dt) * 0.08;

  if (!paused) {
    advanceTime(dt);

    const snap = input.snapshot();
    player.sprint = snap.sprint;
    player.step(world, dt, snap);

    // look
    const look = input.consumeLook();
    player.yaw -= look.dx * 0.0022;
    player.pitch -= look.dy * 0.0022;
    const LIMIT = Math.PI / 2 - 0.01;
    if (player.pitch > LIMIT) player.pitch = LIMIT;
    if (player.pitch < -LIMIT) player.pitch = -LIMIT;

    // footsteps + jump sound
    const moving = Math.hypot(player.vel.x, player.vel.z) > 0.5 && player.onGround;
    stepTimer -= dt;
    if (moving && stepTimer <= 0) {
      stepTimer = 0.42;
      audio.step();
    }
    if (!player.onGround && wasOnGround && player.vel.y > 0.2) audio.jump();
    wasOnGround = player.onGround;

    interact(dt);
    streamChunks();
  }

  currentHit = aimRay();

  const eye = player.eye;
  renderer.render(
    { x: eye.x, y: eye.y, z: eye.z, yaw: player.yaw, pitch: player.pitch, viewRadius: VIEW_RADIUS },
    world.timeOfDay,
    currentHit,
  );
  drawHUD();
}

// ---------------------------------------------------------------- UI wiring

document.getElementById("btnPlay").addEventListener("click", () => {
  started = true;
  overlay.style.display = "none";
  audio.ensure();
  if (!testMode && !input.isTouch) {
    try {
      const p = glCanvas.requestPointerLock && glCanvas.requestPointerLock();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch { /* ok */ }
  }
});
document.getElementById("btnSave").addEventListener("click", () => { saveGame(); audio.ensure(); });
document.getElementById("btnLoad").addEventListener("click", () => { loadGame(); audio.ensure(); });
document.getElementById("btnMute").addEventListener("click", (e) => {
  audio.ensure();
  const muted = audio.toggleMute();
  e.target.textContent = muted ? "🔇" : "🔊";
});
document.getElementById("btnHelp").addEventListener("click", () => {
  overlay.style.display = overlay.style.display === "flex" ? "none" : "flex";
});
if (testMode) overlay.style.display = "none";

// ---------------------------------------------------------------- test API

window.__game = {
  world,
  player,
  renderer,
  input,
  audio,
  hud,
  cfg: { BLOCK, BLOCK_NAMES, HOTBAR_BLOCKS, PHYS, FACE, FACE_TILE },
  testMode,
  seed,

  getState() {
    return {
      pos: { ...player.pos },
      yaw: player.yaw,
      pitch: player.pitch,
      onGround: player.onGround,
      flying: player.flying,
      hotbarIndex,
      timeOfDay: world.timeOfDay,
      daylight: daylightOf(world.timeOfDay),
      paused,
      fps,
    };
  },
  advanceTime(dt) { advanceTime(dt); },
  setPaused(v) { paused = !!v; },
  setLook(yaw, pitch) { player.yaw = yaw; player.pitch = pitch; },
  lookAt(x, y, z) {
    const e = player.eye;
    const dx = x - e.x, dy = y - e.y, dz = z - e.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-9) return;
    player.yaw = Math.atan2(-dx, -dz);
    player.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  },
  setPos(x, y, z) {
    player.pos.x = x; player.pos.y = y; player.pos.z = z;
    player.vel.x = player.vel.y = player.vel.z = 0;
  },
  setTime(t) { world.timeOfDay = ((t % 1) + 1) % 1; },
  setHotbar(i) {
    hotbarIndex = ((i % 8) + 8) % 8;
    input.hotbarIndex = hotbarIndex;
  },
  // Deterministic single interaction step (same code path the loop uses).
  interactOnce() {
    currentHit = aimRay();
    breakCooldown = 0;
    placeCooldown = 0;
    interact(0.001);
    return currentHit;
  },

  getBlockAt(x, y, z) { return world.getBlock(x, y, z); },
  setBlockAt(x, y, z, id) { world.setBlock(x, y, z, id); },
  clearArea(x0, x1, y0, y1, z0, z1) {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        for (let y = y0; y <= y1; y++) world.setBlock(x, y, z, BLOCK.AIR);
      }
    }
  },
  spawnHeight(x, z) { return world.height(x, z); },

  raycastCenter() { return aimRay(); },
  breakCenter() {
    currentHit = aimRay();
    if (!currentHit) return false;
    const ok = world.setBlock(currentHit.x, currentHit.y, currentHit.z, BLOCK.AIR);
    return ok;
  },
  placeCenter() {
    currentHit = aimRay();
    if (!currentHit) return false;
    const p = placementPosition(currentHit);
    if (blockIntersectsPlayer(p.x, p.y, p.z)) return false;
    return world.setBlock(p.x, p.y, p.z, HOTBAR_BLOCKS[hotbarIndex]);
  },

  stepFrames(n) {
    for (let i = 0; i < n; i++) player.step(world, 1 / 60, {});
  },
  tick(dt) {
    const snap = input.snapshot();
    player.step(world, dt, snap);
    streamChunks();
  },
  renderFrame() {
    const eye = player.eye;
    renderer.render(
      { x: eye.x, y: eye.y, z: eye.z, yaw: player.yaw, pitch: player.pitch, viewRadius: VIEW_RADIUS },
      world.timeOfDay,
      aimRay(),
    );
  },
  flushMeshes(n = 100) {
    let budget = n;
    for (const key of world.meshDirty) {
      if (budget-- <= 0) break;
      world.meshDirty.delete(key);
      const [cx, cz] = key.split(",").map(Number);
      if (!world.getChunkData(cx, cz)) continue;
      renderer.uploadChunkMesh(key, buildChunkMesh(world, cx, cz));
    }
  },
  samplePixels(x, y, w, h) { return renderer.samplePixels(x, y, w, h); },
  samplePixel(x, y) { return renderer.samplePixel(x, y); },
  projectPoint(x, y, z) { return projectToScreen(x, y, z); },
  drawHUD() { drawHUD(); },
  expectedFaceColor(blockId, face) { return renderer.expectedFaceColor(blockId, face); },
  texelAt,
  skyColorRGB(t) { return skyColorFor(t).map((c) => c * 255); },
  daylightOf,
  lightFactor(t) { return lightFactor(t); },
  canvasSize() { return { w: renderer.width, h: renderer.height }; },

  save() { saveGame(); },
  load() { return loadGame(); },
  hasSave() { return !!localStorage.getItem(STORAGE_KEY); },
  clearSave() { localStorage.removeItem(STORAGE_KEY); },

  resetWorld(newSeed) {
    const w = new World(typeof newSeed === "number" ? newSeed : world.seed);
    world = w;
    renderer.world = w;
    for (const key of renderer.chunkBuffers.keys()) renderer.removeChunkMesh(key);
    const sx = 8.5, sz = 8.5;
    player.pos.x = sx;
    player.pos.y = w.height(sx, sz) + 1;
    player.pos.z = sz;
    player.vel.x = player.vel.y = player.vel.z = 0;
  },
};

console.log(`[webminecraft] seed=${world.seed} testMode=${testMode}`);

// 启动渲染循环（此前缺失：只有 frame 内部自注册，无首次调用导致黑屏）
requestAnimationFrame(frame);
