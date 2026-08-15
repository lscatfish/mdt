'use strict';
/* WebCraft · 主循环与游戏装配 */
(function () {
  const B = Blocks.BLOCK;
  const HOTBAR_ITEMS = [
    { id: B.GRASS, label: '草方块' },
    { id: B.DIRT, label: '泥土' },
    { id: B.STONE, label: '石头' },
    { id: B.SAND, label: '沙子' },
    { id: B.PLANKS, label: '木板' },
    { id: B.LOG, label: '原木' },
    { id: B.LEAVES, label: '树叶' },
    { id: B.COBBLE, label: '圆石' },
    { id: B.BRICK, label: '砖块' },
    { id: B.GLASS, label: '玻璃' }
  ];

  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9fc7e8, 25, 78);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1600);
  camera.rotation.order = 'YXZ';

  const sky = window.createSky(scene);
  const atlas = Blocks.createAtlas();
  HUD.init(atlas, HOTBAR_ITEMS);
  HUD.els.seedInput.value = HUD.randomSeedString();

  /* 方块选择高亮框 */
  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 })
  );
  highlight.visible = false;
  scene.add(highlight);

  let world = null, player = null, running = false;
  let breakTimer = 0, placeTimer = 0;
  let debugAcc = 0, fpsFrames = 0, fps = 0, debugTimer = 0, saveTimer = 0;
  let prevOnGround = false, prevInWater = false;
  const rayDir = new THREE.Vector3();

  /* 输入控制只创建一次；回调里动态引用当前玩家 */
  const controls = new Controls(canvas);
  controls.onToggleFly = () => {
    if (!player) return;
    player.setFly(!player.fly);
    HUD.toast(player.fly ? '飞行模式：开（Shift 下降）' : '飞行模式：关');
  };
  controls.onToggleDebug = () => {
    const shown = !HUD.els.debug.classList.contains('hidden');
    HUD.setDebugVisible(!shown);
  };
  controls.onSlot = (i) => HUD.setSlot(i);
  controls.onRespawn = () => {
    if (!player) return;
    player.respawn();
    HUD.toast('已返回出生点');
  };
  controls.onMute = () => {
    SFX.muted = !SFX.muted;
    HUD.toast(SFX.muted ? '音效：关' : '音效：开');
  };
  controls.onLockChange = (locked) => {
    HUD.setPauseHint(running && !locked);
    HUD.setCrosshair(locked);
    if (!locked) { breakTimer = 0; placeTimer = 0; }
  };

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function startGame(seed, save) {
    if (world) world.dispose();
    world = new World(seed, atlas);
    world.setScene(scene);
    if (save) world.applySave(save);

    player = new Player(world);
    controls.state.slot = 0;
    controls.state.breakHeld = false;
    controls.state.placeHeld = false;
    controls.keys.clear();

    /* 同步生成出生点周围一圈，避免开局卡顿 */
    for (let r = 0; r <= 1; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          world.ensureChunk(Math.floor(player.pos.x / 16) + dx,
                            Math.floor(player.pos.z / 16) + dz);
        }
      }
    }

    breakTimer = 0;
    placeTimer = 0;
    prevOnGround = player.onGround;
    prevInWater = player.inWater;
    HUD.els.seedInput.value = seed.toString();

    controls.enable();
    HUD.hideStart();
    HUD.setSlot(0);
    HUD.setCrosshair(controls.isLocked());
    running = true;
    controls.requestLock();
    SFX.ensure();
  }

  function updateTargeting(dt) {
    if (!controls.isLocked()) { highlight.visible = false; return; }

    camera.getWorldDirection(rayDir);
    const hit = world.raycast(camera.position, rayDir, 6);
    if (!hit) {
      highlight.visible = false;
      breakTimer = 0;
      placeTimer = 0;
      return;
    }

    highlight.visible = true;
    highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);

    if (controls.state.breakHeld) {
      breakTimer -= dt;
      if (breakTimer <= 0) {
        breakTimer = 0.28;
        const def = Blocks.info(hit.block);
        if (hit.block !== B.BEDROCK && hit.block !== B.WATER && def.solid !== undefined && hit.block !== B.AIR) {
          world.setBlock(hit.x, hit.y, hit.z, B.AIR);
          SFX.breakBlock(hit.block);
        }
      }
    } else {
      breakTimer = 0;
    }

    if (controls.state.placeHeld) {
      placeTimer -= dt;
      if (placeTimer <= 0) {
        placeTimer = 0.28;
        tryPlace(hit);
      }
    } else {
      placeTimer = 0;
    }
  }

  function tryPlace(hit) {
    const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
    if (py < 0 || py >= window.WorldConst.SY) return;
    const dest = world.getBlock(px, py, pz);
    if (dest !== B.AIR && dest !== B.WATER &&
        dest !== B.FLOWER_RED && dest !== B.FLOWER_YELLOW && dest !== B.TALL_GRASS) return;
    if (player.intersectsBlock(px, py, pz)) return;
    const id = HOTBAR_ITEMS[controls.state.slot].id;
    world.setBlock(px, py, pz, id);
    SFX.placeBlock(id);
  }

  function updateDebug(dt) {
    debugTimer -= dt;
    if (debugTimer > 0) return;
    debugTimer = 0.25;

    const dir = player.yaw * 180 / Math.PI;
    const dirName = (dir >= 45 && dir < 135) ? '东' :
                    (dir >= 135 || dir < -135) ? '南' :
                    (dir >= -135 && dir < -45) ? '西' : '北';
    const lines = [
      'WebCraft  FPS: ' + Math.round(fps),
      'XYZ: ' + player.pos.x.toFixed(1) + ' / ' + player.pos.y.toFixed(1) + ' / ' + player.pos.z.toFixed(1),
      '朝向: ' + dirName + ' (' + Math.round(dir) + '°)',
      '区块: ' + Math.floor(player.pos.x / 16) + ', ' + Math.floor(player.pos.z / 16),
      '已加载区块: ' + world.chunks.size,
      '待建网格: ' + world.meshQueue.size,
      '绘制调用: ' + renderer.info.render.calls,
      '三角形: ' + renderer.info.render.triangles,
      '种子: ' + world.seed,
      '飞行: ' + (player.fly ? '开' : '关') + '  时间: ' +
        Math.floor((world.time / world.dayLength) % 1 * 24) + ':00'
    ];
    HUD.setDebugText(lines.join('\n'));
  }

  let last = performance.now();
  function animate(now) {
    requestAnimationFrame(animate);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    if (dt < 0) dt = 0;

    if (running && player) {
      const look = controls.poll();
      player.yaw -= look.dx * window.ControlsSens;
      player.pitch -= look.dy * window.ControlsSens;
      const maxPitch = Math.PI / 2 - 0.01;
      player.pitch = Math.max(-maxPitch, Math.min(maxPitch, player.pitch));

      const moving = player.update(dt, controls.state, camera);

      world.time += dt;
      const tod = (world.time / world.dayLength) % 1;
      world.update(player.pos, dt);

      const info = sky.update(tod, dt, camera);
      scene.fog.color.copy(info.fogColor);
      renderer.setClearColor(info.fogColor);

      world.processMeshQueue(7, player.pos.x, player.pos.z);
      updateTargeting(dt);

      /* 音效反馈 */
      if (player.onGround && moving && !player.inWater) SFX.step();
      if (player.onGround && !prevOnGround) SFX.jump();
      if (player.inWater && !prevInWater) SFX.splash();
      prevOnGround = player.onGround;
      prevInWater = player.inWater;

      /* FOV：疾跑轻微放大 */
      const sprinting = controls.state.sprint && moving && !controls.state.sneak;
      const targetFov = player.fly ? 82 : (70 + (sprinting ? 8 : 0));
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 9);
      camera.updateProjectionMatrix();

      /* 调试与统计 */
      fpsFrames++;
      debugAcc += dt;
      if (debugAcc >= 0.5) {
        fps = fpsFrames / debugAcc;
        fpsFrames = 0;
        debugAcc = 0;
      }
      updateDebug(dt);

      /* 自动存档 */
      saveTimer += dt;
      if (saveTimer >= 10) {
        saveTimer = 0;
        world.save();
      }
    } else {
      const tod = (world ? world.time / world.dayLength : 0.3) % 1;
      const info = sky.update(tod, dt, camera);
      scene.fog.color.copy(info.fogColor);
      renderer.setClearColor(info.fogColor);
    }

    HUD.updateToast(dt);
    renderer.render(scene, camera);
  }

  /* ---------------- 启动与存档 ---------------- */
  function readSeed() {
    const text = HUD.els.seedInput.value.trim();
    const seed = text ? hashString(text) : (Math.random() * 0x7fffffff) | 0;
    HUD.els.seedInput.value = seed.toString();
    return seed;
  }

  document.getElementById('btn-start').addEventListener('click', () => {
    const save = World.load();
    const seed = save ? save.seed : readSeed();
    startGame(seed, save);
  });

  document.getElementById('btn-new').addEventListener('click', () => {
    try { localStorage.removeItem('webcraft-save-v1'); } catch (e) { /* ignore */ }
    startGame(readSeed(), null);
  });

  const save = World.load();
  document.getElementById('btn-start').textContent =
    save ? '继续游戏（载入存档）' : '开始游戏';

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function saveNow() {
    if (world) world.save();
  }
  window.addEventListener('beforeunload', saveNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });

  /* 初始天空渲染 */
  const info0 = sky.update(0.3, 0, camera);
  scene.fog.color.copy(info0.fogColor);
  renderer.setClearColor(info0.fogColor);

  /* 调试钩子（控制台可访问 game.world / game.player） */
  window.__webcraft = {
    get world() { return world; },
    get player() { return player; },
    get controls() { return controls; },
    get camera() { return camera; },
    get scene() { return scene; },
    get renderer() { return renderer; }
  };

  requestAnimationFrame(animate);
})();
