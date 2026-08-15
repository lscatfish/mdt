/* 游戏主循环、输入控制、交互与渲染 */
(function () {
  'use strict';

  const BLOCK = Blocks.BLOCK;
  const CS = WorldConst.CS;
  const HEIGHT = WorldConst.HEIGHT;

  /* ---------- DOM ---------- */
  const canvas = document.getElementById('game');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('start-btn');
  const hud = document.getElementById('hud');
  const debugEl = document.getElementById('debug');
  const blockNameEl = document.getElementById('block-name');
  const hotbarEl = document.getElementById('hotbar');
  const crosshairEl = document.getElementById('crosshair');

  /* ---------- 渲染器与场景 ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const skyColor = new THREE.Color(0x8fc7ff);
  scene.background = skyColor;
  scene.fog = new THREE.Fog(0x9fc9f5, CS * 4 * 0.4, CS * 4 * 1.05);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 400);
  camera.rotation.order = 'YXZ';

  /* ---------- 世界 ---------- */
  const params = new URLSearchParams(window.location.search);
  let seed = parseInt(params.get('seed'), 10);
  if (!Number.isFinite(seed)) seed = Math.floor(Math.random() * 0x7fffffff);
  seed = seed >>> 0;

  const world = new World(seed, scene);
  const spawn = world.findSpawn();
  world.initialLoad(Math.floor(spawn.x / CS), Math.floor(spawn.z / CS), 2);

  window.addEventListener('beforeunload', function () { world.saveChanges(); });

  const player = new Player(world, spawn);
  player.yaw = Math.PI * 0.25;

  /* ---------- 云层 ---------- */
  const cloudGroup = new THREE.Group();
  {
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const rand = NoiseUtil.mulberry32(seed ^ 0xabcdef);
    for (let i = 0; i < 8; i++) {
      const w = 14 + rand() * 22;
      const d = 10 + rand() * 14;
      const cloud = new THREE.Mesh(new THREE.PlaneGeometry(w, d), cloudMat);
      cloud.rotation.x = -Math.PI / 2;
      cloud.position.set((rand() - 0.5) * 130, 84 + rand() * 8, (rand() - 0.5) * 130);
      cloudGroup.add(cloud);
    }
    scene.add(cloudGroup);
  }

  /* ---------- 准星与选中框 ---------- */
  let hit = null;
  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
    new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7 })
  );
  highlight.visible = false;
  scene.add(highlight);

  /* ---------- 快捷栏 ---------- */
  let selectedSlot = 0;
  Blocks.HOTBAR.forEach(function (id, i) {
    const slot = document.createElement('div');
    slot.className = 'slot' + (i === selectedSlot ? ' selected' : '');
    slot.style.backgroundImage = 'url("' + Blocks.createBlockIcon(world.atlasCanvas, id, 'side') + '")';
    const key = document.createElement('span');
    key.className = 'key';
    key.textContent = String(i + 1);
    slot.appendChild(key);
    slot.dataset.name = Blocks.blockName(id);
    hotbarEl.appendChild(slot);
  });

  function selectedBlock() { return Blocks.HOTBAR[selectedSlot]; }

  function updateHotbar() {
    const slots = hotbarEl.children;
    for (let i = 0; i < slots.length; i++) {
      slots[i].classList.toggle('selected', i === selectedSlot);
    }
    blockNameEl.textContent = Blocks.blockName(selectedBlock());
  }
  updateHotbar();

  /* ---------- 输入 ---------- */
  const keys = new Set();
  const input = { moveForward: 0, moveStrafe: 0, jump: false, sneak: false, sprint: false };
  let locked = false;
  let sprintActive = false;
  let lastWPress = 0;

  function refreshInput() {
    const k = keys;
    input.moveForward = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    input.moveStrafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    input.jump = k.has('Space');
    input.sneak = k.has('ShiftLeft') || k.has('ShiftRight');
    input.sprint = (sprintActive && k.has('KeyW')) || k.has('ControlLeft') || k.has('ControlRight');
  }

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Tab') e.preventDefault();
    if (e.code === 'Space' && locked) e.preventDefault();
    keys.add(e.code);

    if (locked && !e.repeat && e.code === 'KeyW') {
      const now = performance.now();
      if (now - lastWPress < 280) sprintActive = true;
      lastWPress = now;
    }
    refreshInput();

    if (locked && !e.repeat) {
      if (e.code === 'KeyF') {
        const fly = player.toggleFly();
        blockNameEl.textContent = fly ? '飞行模式：已开启 (F 关闭)' : '飞行模式：已关闭';
        setTimeout(updateHotbar, 900);
      }
      if (/^Digit[1-9]$/.test(e.code)) {
        selectedSlot = parseInt(e.code.slice(5), 10) - 1;
        updateHotbar();
      }
    }
  });

  window.addEventListener('keyup', function (e) {
    keys.delete(e.code);
    if (e.code === 'KeyW') sprintActive = false;
    refreshInput();
  });

  window.addEventListener('blur', function () {
    keys.clear();
    refreshInput();
  });

  document.addEventListener('mousemove', function (e) {
    if (!locked) return;
    const sensitivity = 0.0022;
    player.yaw -= e.movementX * sensitivity;
    player.pitch -= e.movementY * sensitivity;
    const limit = Math.PI / 2 - 0.01;
    player.pitch = Math.max(-limit, Math.min(limit, player.pitch));
  });

  document.addEventListener('mousedown', function (e) {
    if (!locked) return;
    if (e.button === 0) breakBlock();
    else if (e.button === 2) placeBlock();
  });

  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  document.addEventListener('wheel', function (e) {
    if (!locked) return;
    e.preventDefault();
    selectedSlot = (selectedSlot + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
    updateHotbar();
  }, { passive: false });

  startBtn.addEventListener('click', function () {
    try {
      const req = canvas.requestPointerLock();
      if (req && typeof req.catch === 'function') req.catch(function () {});
    } catch (e) {
      // 部分浏览器可能短暂拒绝锁定请求，用户再点一次即可
    }
  });

  document.addEventListener('pointerlockchange', function () {
    locked = document.pointerLockElement === canvas;
    overlay.classList.toggle('hidden', locked);
    hud.classList.toggle('hidden', !locked);
    keys.clear();
    refreshInput();
  });

  /* ---------- 体素射线检测（DDA） ---------- */
  function raycastVoxel(origin, dir, maxDist) {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = dir.x > 0 ? 1 : -1;
    const stepY = dir.y > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;

    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

    let tMaxX = dir.x !== 0 ? ((stepX > 0 ? x + 1 - origin.x : origin.x - x) * tDeltaX) : Infinity;
    let tMaxY = dir.y !== 0 ? ((stepY > 0 ? y + 1 - origin.y : origin.y - y) * tDeltaY) : Infinity;
    let tMaxZ = dir.z !== 0 ? ((stepZ > 0 ? z + 1 - origin.z : origin.z - z) * tDeltaZ) : Infinity;

    let normal = null;
    for (let i = 0; i < 160; i++) {
      let t;
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX;
        normal = new THREE.Vector3(-stepX, 0, 0);
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY;
        normal = new THREE.Vector3(0, -stepY, 0);
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ;
        normal = new THREE.Vector3(0, 0, -stepZ);
      }

      if (t > maxDist) return null;
      if (y < 0 || y >= HEIGHT) return null;

      const id = world.getBlock(x, y, z);
      if (id !== BLOCK.AIR && id !== BLOCK.WATER) {
        return { x, y, z, normal, dist: t };
      }
    }
    return null;
  }

  function breakBlock() {
    if (!hit) return;
    if (Blocks.isUnbreakable(world.getBlock(hit.x, hit.y, hit.z))) return;
    world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
    hit = null;
  }

  function placeBlock() {
    if (!hit) return;
    const id = selectedBlock();
    const nx = hit.x + hit.normal.x;
    const ny = hit.y + hit.normal.y;
    const nz = hit.z + hit.normal.z;
    if (ny < 0 || ny >= HEIGHT) return;

    // 不能把方块放在玩家身体里
    const p = player.pos;
    if (nx + 1 > p.x - player.halfWidth && nx < p.x + player.halfWidth &&
        ny + 1 > p.y && ny < p.y + player.height &&
        nz + 1 > p.z - player.halfWidth && nz < p.z + player.halfWidth) return;

    const current = world.getBlock(nx, ny, nz);
    if (current !== BLOCK.AIR && current !== BLOCK.WATER) return;

    world.setBlock(nx, ny, nz, id);
  }

  function updateHighlight() {
    const origin = player.eyePosition();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    hit = raycastVoxel(origin, dir, 6);

    if (hit) {
      highlight.visible = true;
      highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      const name = Blocks.blockName(world.getBlock(hit.x, hit.y, hit.z));
      blockNameEl.textContent = name + '  (' + hit.x + ', ' + hit.y + ', ' + hit.z + ')';
    } else {
      highlight.visible = false;
      updateHotbar();
    }
  }

  /* ---------- 调试信息 ---------- */
  let fps = 0, frames = 0, fpsTimer = 0;

  function updateDebug(dt) {
    frames++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      fps = Math.round(frames / fpsTimer);
      frames = 0;
      fpsTimer = 0;
      const pcx = Math.floor(player.pos.x / CS);
      const pcz = Math.floor(player.pos.z / CS);
      debugEl.textContent =
        'FPS ' + fps +
        '  XYZ ' + Math.floor(player.pos.x) + ' / ' + Math.floor(player.pos.y) + ' / ' + Math.floor(player.pos.z) +
        '  区块 ' + world.chunks.size +
        '  种子 ' + seed +
        '  视角 ' + (player.flying ? '飞行' : '步行');
    }
  }

  /* ---------- 主循环 ---------- */
  const clock = new THREE.Clock();
  let elapsed = 0;

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;

    refreshInput();

    if (locked) {
      player.update(dt, input);
      world.update(player.pos.x, player.pos.z, 2);
    } else {
      // 未锁定鼠标时也继续按需生成地形，但暂停玩家物理
      world.update(player.pos.x, player.pos.z, 1);
    }

    // 云层缓慢漂移并跟随玩家
    cloudGroup.position.x = Math.floor(player.pos.x / (CS * 2)) * CS * 2;
    cloudGroup.position.z = Math.floor(player.pos.z / (CS * 2)) * CS * 2;
    cloudGroup.position.y = Math.sin(elapsed * 0.05) * 0.4;

    camera.position.copy(player.eyePosition());
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;

    updateHighlight();
    updateDebug(dt);
    renderer.render(scene, camera);
  }

  /* ---------- 窗口尺寸 ---------- */
  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* 调试 / 自动化测试接口 */
  window.__webcraft = {
    world, player, camera, scene, renderer, seed,
    raycastVoxel, setSelectedSlot: function (i) {
      selectedSlot = ((i % 9) + 9) % 9;
      updateHotbar();
    }
  };

  animate();
})();
