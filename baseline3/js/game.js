/* 主游戏：渲染循环、昼夜、输入、交互、UI、存档 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SAVE_KEY = 'webcraft-save-v1';
  const DAY_LEN = 600;      // 一个昼夜周期（秒）
  const REACH = 5.5;        // 交互距离
  const RENDER_DIST = 4;    // 视距（区块）

  const HOTBAR = [
    MCBlocks.GRASS, MCBlocks.DIRT, MCBlocks.STONE, MCBlocks.COBBLE,
    MCBlocks.PLANKS, MCBlocks.LOG, MCBlocks.LEAVES, MCBlocks.GLASS, MCBlocks.BRICK
  ];

  const BLOCK_INFO = {
    [MCBlocks.GRASS]: { name: '草方块' }, [MCBlocks.DIRT]: { name: '泥土' },
    [MCBlocks.STONE]: { name: '石头' }, [MCBlocks.COBBLE]: { name: '圆石' },
    [MCBlocks.PLANKS]: { name: '木板' }, [MCBlocks.LOG]: { name: '原木' },
    [MCBlocks.LEAVES]: { name: '树叶' }, [MCBlocks.SAND]: { name: '沙子' },
    [MCBlocks.GLASS]: { name: '玻璃' }, [MCBlocks.WATER]: { name: '水' },
    [MCBlocks.BRICK]: { name: '红砖' }, [MCBlocks.SNOW]: { name: '雪块' },
    [MCBlocks.BEDROCK]: { name: '基岩' }
  };

  // ---------------- 状态 ----------------
  let renderer, scene, camera, world, player;
  let clock, sky, hemi, sunLight, sunSprite, moonSprite, cloudGroup, highlight;
  let clouds = [];
  let playing = false;
  let time = DAY_LEN * 0.3;
  let selected = 0;
  let tooltipTimer = 0;
  let fpsCounter = { frames: 0, time: 0, fps: 0 };
  let mouse = { left: false, right: false, t: 0 };
  let input = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false };
  let audioCtx = null;

  const inputMap = {
    KeyW: 'forward', ArrowUp: 'forward',
    KeyS: 'back', ArrowDown: 'back',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    Space: 'jump',
    ShiftLeft: 'sprint', ShiftRight: 'sprint',
    ControlLeft: 'sneak', ControlRight: 'sneak'
  };

  // ---------------- 渲染器 / 场景 ----------------
  function setupRenderer() {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    $('game').appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x87ceeb, 30, RENDER_DIST * 16);

    camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 800);

    sky = new THREE.Color(0x87ceeb);
    scene.background = sky;

    hemi = new THREE.HemisphereLight(0xbfd9ff, 0x6b5a45, 0.7);
    scene.add(hemi);

    sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
    scene.add(sunLight);

    sunSprite = makeSkySprite('#fff7c2', 90);
    moonSprite = makeSkySprite('#e8ecf4', 70);
    sunSprite.scale.set(130, 130, 1);
    moonSprite.scale.set(90, 90, 1);
    scene.add(sunSprite, moonSprite);

    cloudGroup = new THREE.Group();
    scene.add(cloudGroup);
    buildClouds();

    highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.65, depthTest: true })
    );
    highlight.visible = false;
    scene.add(highlight);

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    clock = new THREE.Clock();
  }

  function makeSkySprite(color, r) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, r * 0.4, 64, 64, r);
    g.addColorStop(0, color);
    g.addColorStop(0.55, color);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
    return new THREE.Sprite(mat);
  }

  function buildClouds() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const ctx = c.getContext('2d');
    const rnd = mulberry(42);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 26; i++) {
      const x = rnd() * 128, y = 24 + rnd() * 22;
      const r = 8 + rnd() * 16;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.38, depthWrite: false });
    for (let i = 0; i < 36; i++) {
      const geo = new THREE.PlaneGeometry(24 + rnd() * 22, 12 + rnd() * 10);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((rnd() - 0.5) * 400, 82 + rnd() * 14, (rnd() - 0.5) * 400);
      mesh.rotation.z = (rnd() - 0.5) * 0.05;
      cloudGroup.add(mesh);
      clouds.push({ mesh: mesh, speed: 1.2 + rnd() * 1.6 });
    }
  }

  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------- 世界初始化 ----------------
  function initWorld(seed) {
    if (world) {
      scene.remove(world.group);
      world.destroy();
    }
    world = new MCWorld(seed);
    world.renderDistance = RENDER_DIST;
    world.initRenderer();
    scene.add(world.group);

    player = new MCPlayer(world, 0, 0, 0);
    const spawn = world.findSpawn(8, 8);
    player.pos.set(spawn.x, spawn.y, spawn.z);
    player.yaw = -Math.PI * 0.25;
  }

  function clearWorldGroup() {
    if (world && world.group) {
      scene.remove(world.group);
      world.destroy();
    }
  }

  // ---------------- 输入 ----------------
  function setupInput() {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (inputMap[e.code] !== undefined) {
        if (document.pointerLockElement) {
          input[inputMap[e.code]] = true;
          if (e.code === 'Space') e.preventDefault();
        }
      }
      if (e.code === 'KeyF' && document.pointerLockElement) {
        player.flying = !player.flying;
        player.vel.y = 0;
        showTooltip(player.flying ? '飞行模式：开' : '飞行模式：关');
      }
      if (e.code.startsWith('Digit') && document.pointerLockElement) {
        const n = +e.code.slice(5);
        if (n >= 1 && n <= HOTBAR.length) selectSlot(n - 1);
      }
    });

    document.addEventListener('keyup', (e) => {
      if (inputMap[e.code] !== undefined) input[inputMap[e.code]] = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement) return;
      const s = 0.0022;
      player.yaw -= e.movementX * s;
      player.pitch -= e.movementY * s;
      const lim = Math.PI / 2 - 0.01;
      player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
    });

    document.addEventListener('mousedown', (e) => {
      if (!document.pointerLockElement) return;
      if (e.button === 0) { mouse.left = true; mouse.t = 0; tryBreak(); }
      if (e.button === 2) { mouse.right = true; mouse.t = 0; tryPlace(); }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) mouse.left = false;
      if (e.button === 2) mouse.right = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('wheel', (e) => {
      if (!document.pointerLockElement) return;
      const d = e.deltaY > 0 ? 1 : -1;
      selectSlot((selected + d + HOTBAR.length) % HOTBAR.length);
    });

    $('game').addEventListener('click', () => {
      if (playing && !document.pointerLockElement) requestLock();
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = !!document.pointerLockElement;
      $('hud').classList.toggle('hidden', !locked);
      if (!locked) {
        for (const k in input) input[k] = false;
        mouse.left = false; mouse.right = false;
      }
      if (playing && !locked) showPause();
      if (locked) $('pause').classList.add('hidden');
    });

    document.addEventListener('pointerlockerror', () => {
      if (playing) showPause();
    });
  }

  function requestLock() {
    const el = renderer.domElement;
    try {
      const p = el.requestPointerLock();
      if (p && p.catch) p.catch(() => { if (playing) showPause(); });
    } catch (err) {
      if (playing) showPause();
    }
  }

  // ---------------- 交互 ----------------
  function rayTarget() {
    if (!player || !world) return null;
    const eye = player.eye();
    const dir = player.forward();
    return world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, REACH);
  }

  function tryBreak() {
    const hit = rayTarget();
    if (!hit) return;
    if (BLOCK_INFO[hit.id] && BLOCK_INFO[hit.id].unbreakable) return;
    if (hit.id === MCBlocks.BEDROCK) return;
    world.setBlock(hit.x, hit.y, hit.z, MCBlocks.AIR);
    sfxBreak();
  }

  function boxOverlapsPlayer(x, y, z) {
    const p = player.pos;
    const r = 0.3, h = 1.8;
    return x + 1 > p.x - r && x < p.x + r &&
           y + 1 > p.y && y < p.y + h &&
           z + 1 > p.z - r && z < p.z + r;
  }

  function tryPlace() {
    const hit = rayTarget();
    if (!hit) return;
    const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    if (y < 0 || y >= MC_HEIGHT) return;
    const existing = world.getBlock(x, y, z);
    if (BLOCK_INFO[existing] && BLOCK_INFO[existing].solid) return;
    if (boxOverlapsPlayer(x, y, z)) return;
    world.setBlock(x, y, z, HOTBAR[selected]);
    sfxPlace();
  }

  // ---------------- 音效（程序生成） ----------------
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function noiseBuffer(seconds, color) {
    const sr = audioCtx.sampleRate;
    const buf = audioCtx.createBuffer(1, Math.floor(sr * seconds), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.6) * (color === 'soft' ? 0.4 : 1);
    }
    return buf;
  }

  function sfxBreak() {
    ensureAudio();
    if (!audioCtx) return;
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer(0.12, 'hard');
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900 + Math.random() * 800;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    src.connect(filter).connect(gain).connect(audioCtx.destination);
    src.start();
  }

  function sfxPlace() {
    ensureAudio();
    if (!audioCtx) return;
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer(0.08, 'soft');
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    src.connect(filter).connect(gain).connect(audioCtx.destination);
    src.start();
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(70, audioCtx.currentTime + 0.07);
    const og = audioCtx.createGain();
    og.gain.setValueAtTime(0.25, audioCtx.currentTime);
    og.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
    osc.connect(og).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  }

  // ---------------- 昼夜循环 ----------------
  function skyParams() {
    const f = (time % DAY_LEN) / DAY_LEN;
    const angle = (f - 0.25) * Math.PI * 2;
    const e = Math.sin(angle); // 太阳高度
    const day = new THREE.Color(0x87ceeb);
    const sunset = new THREE.Color(0xf4a261);
    const night = new THREE.Color(0x0b1026);
    let color, sunI, amb;
    if (e >= 0.25) {
      color = day.clone();
    } else if (e >= -0.1) {
      color = day.clone().lerp(sunset, (0.25 - e) / 0.35);
    } else {
      color = sunset.clone().lerp(night, Math.min(1, (-0.1 - e) / 0.35));
    }
    sunI = smoothstep(-0.08, 0.22, e) * 1.25;
    amb = 0.16 + smoothstep(-0.25, 0.35, e) * 0.55;
    return { f: f, angle: angle, e: e, color: color, sunI: sunI, amb: amb };
  }

  function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function updateSky(dt) {
    const p = skyParams();
    sky.copy(p.color);
    scene.fog.color.copy(p.color);
    scene.fog.near = RENDER_DIST * 16 * 0.55;
    scene.fog.far = RENDER_DIST * 16 + 6;
    hemi.intensity = p.amb + 0.15;
    sunLight.intensity = p.sunI;

    const sunDir = new THREE.Vector3(Math.cos(p.angle), p.e, 0.35).normalize();
    sunLight.position.copy(sunDir).multiplyScalar(-120);

    const cam = camera.position;
    sunSprite.position.copy(cam).addScaledVector(sunDir, 420);
    const moonDir = new THREE.Vector3(Math.cos(p.angle + Math.PI), Math.sin(p.angle + Math.PI), 0.35).normalize();
    moonSprite.position.copy(cam).addScaledVector(moonDir, 420);
    sunSprite.material.opacity = smoothstep(-0.12, 0.05, p.e);
    moonSprite.material.opacity = smoothstep(-0.12, 0.05, -p.e);
    sunSprite.visible = sunSprite.material.opacity > 0.01;
    moonSprite.visible = moonSprite.material.opacity > 0.01;

    // 云随风漂移并在玩家附近循环
    for (const c of clouds) {
      c.mesh.position.x += c.speed * dt;
      const dx = c.mesh.position.x - cam.x;
      if (dx > 260) c.mesh.position.x -= 520;
      if (dx < -260) c.mesh.position.x += 520;
      const dz = c.mesh.position.z - cam.z;
      if (dz > 260) c.mesh.position.z -= 520;
      if (dz < -260) c.mesh.position.z += 520;
    }
  }

  // ---------------- HUD ----------------
  function blockIcon(blockId) {
    const src = MCTextures.canvas;
    const nameMap = {
      [MCBlocks.GRASS]: 'grass_side',
      [MCBlocks.DIRT]: 'dirt',
      [MCBlocks.STONE]: 'stone',
      [MCBlocks.COBBLE]: 'cobblestone',
      [MCBlocks.PLANKS]: 'planks',
      [MCBlocks.LOG]: 'log_side',
      [MCBlocks.LEAVES]: 'leaves',
      [MCBlocks.SAND]: 'sand',
      [MCBlocks.GLASS]: 'glass',
      [MCBlocks.BRICK]: 'brick',
      [MCBlocks.SNOW]: 'snow_side'
    };
    const name = nameMap[blockId] || 'grass_side';
    const idx = MCTextures.TILE_INDEX[name];
    const T = 16;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, (idx % 8) * T, Math.floor(idx / 8) * T, T, T, 0, 0, 64, 64);
    return c.toDataURL();
  }

  function buildHotbar() {
    const bar = $('hotbar');
    bar.innerHTML = '';
    HOTBAR.forEach((id, i) => {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot' + (i === selected ? ' active' : '');
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = i + 1;
      const img = document.createElement('img');
      img.src = blockIcon(id);
      img.draggable = false;
      slot.appendChild(num);
      slot.appendChild(img);
      bar.appendChild(slot);
    });
  }

  function selectSlot(i) {
    selected = i;
    const slots = $('hotbar').children;
    for (let j = 0; j < slots.length; j++) slots[j].classList.toggle('active', j === selected);
    showTooltip(BLOCK_INFO[HOTBAR[selected]].name);
  }

  function showTooltip(text) {
    const el = $('tooltip');
    el.textContent = text;
    el.classList.add('visible');
    tooltipTimer = 1.2;
  }

  function updateHUD(dt) {
    if (tooltipTimer > 0) {
      tooltipTimer -= dt;
      if (tooltipTimer <= 0) $('tooltip').classList.remove('visible');
    }
    fpsCounter.frames++;
    fpsCounter.time += dt;
    if (fpsCounter.time >= 0.5) {
      fpsCounter.fps = Math.round(fpsCounter.frames / fpsCounter.time);
      fpsCounter.frames = 0;
      fpsCounter.time = 0;
    }
    const p = player.pos;
    $('debug').textContent =
      `WebCraft  |  FPS ${fpsCounter.fps}\n` +
      `XYZ ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}\n` +
      `区块 ${world.stats.chunks}  面 ${world.stats.faces.toLocaleString()}` +
      (player.flying ? '\n飞行模式' : '') + (player.inWater ? '\n水中' : '');
    $('water-overlay').classList.toggle('show', player.inWater && player.eye().y < MC_SEA + 1);
  }

  // ---------------- 主循环 ----------------
  function updateHighlight() {
    const hit = rayTarget();
    if (hit) {
      highlight.visible = true;
      highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      highlight.visible = false;
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, clock.getDelta());

    if (playing) {
      if (document.pointerLockElement) {
        player.update(dt, input);
        time += dt;
        if (mouse.left || mouse.right) {
          mouse.t += dt;
          if (mouse.t > 0.25) {
            mouse.t = 0;
            if (mouse.left) tryBreak();
            if (mouse.right) tryPlace();
          }
        }
      }
      updateHighlight();
      updateHUD(dt);
    }
    world.update(player.pos.x, player.pos.z);

    const eye = player.eye();
    camera.position.copy(eye);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    updateSky(dt);
    renderer.render(scene, camera);
  }

  // ---------------- 存档 ----------------
  function saveGame() {
    if (!world) return;
    const data = {
      seed: world.seed,
      diffs: world.toJSON().diffs,
      pos: [player.pos.x, player.pos.y, player.pos.z],
      yaw: player.yaw,
      pitch: player.pitch,
      time: time
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (err) { console.warn('保存失败', err); }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) { return null; }
  }

  function startGame(continueGame) {
    const save = continueGame ? loadGame() : null;
    const seedInput = $('seed').value.trim();
    let seed = 0;
    if (save) {
      seed = save.seed >>> 0;
    } else if (seedInput) {
      seed = hashString(seedInput);
    } else {
      seed = (Math.random() * 0x7fffffff) >>> 0;
    }
    if (!save) $('seed').value = String(seed);

    clearWorldGroup();
    initWorld(seed);
    if (save) {
      world.loadJSON(save);
      if (Array.isArray(save.pos) && save.pos.length === 3) {
        player.pos.set(save.pos[0], save.pos[1], save.pos[2]);
        player.vel.set(0, 0, 0);
      }
      if (typeof save.yaw === 'number') player.yaw = save.yaw;
      if (typeof save.pitch === 'number') player.pitch = save.pitch;
      if (typeof save.time === 'number') time = save.time;
    } else {
      time = DAY_LEN * 0.3;
    }

    ensureAudio();
    buildHotbar();
    playing = true;
    $('menu').classList.add('hidden');
    $('pause').classList.add('hidden');
    requestLock();
  }

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function showPause() {
    if (!playing) return;
    $('pause').classList.remove('hidden');
    $('hud').classList.add('hidden');
    saveGame();
  }

  // ---------------- 启动 ----------------
  function boot() {
    setupRenderer();
    setupInput();

    // 初始世界（展示用），点击按钮后才正式开始
    const seed = (Math.random() * 0x7fffffff) >>> 0;
    initWorld(seed);
    player.yaw = Math.PI * 0.2;
    player.pitch = -0.15;
    world.update(player.pos.x, player.pos.z);
    camera.position.copy(player.eye());
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    updateSky(0);
    renderer.render(scene, camera);

    $('seed').value = String(seed);
    buildHotbar();

    const hasSave = !!loadGame();
    $('btn-continue').disabled = !hasSave;
    if (!hasSave) $('btn-continue').title = '还没有本地存档';

    $('btn-new').addEventListener('click', () => startGame(false));
    $('btn-continue').addEventListener('click', () => startGame(true));
    $('btn-resume').addEventListener('click', () => {
      $('pause').classList.add('hidden');
      requestLock();
    });
    $('btn-save').addEventListener('click', () => {
      saveGame();
      showTooltip('已保存');
      const tip = $('pause').querySelector('.tip');
      tip.textContent = '已保存到浏览器 localStorage ✓';
    });
    $('btn-reset').addEventListener('click', () => {
      try { localStorage.removeItem(SAVE_KEY); } catch (err) {}
      location.reload();
    });

    setInterval(() => { if (playing) saveGame(); }, 15000);
    window.addEventListener('beforeunload', () => { if (playing) saveGame(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && playing) saveGame();
    });

    // 调试 / 自动化测试接口
    window.__webcraft = {
      getState: () => ({
        playing: playing,
        locked: !!document.pointerLockElement,
        pos: player.pos.toArray(),
        yaw: player.yaw,
        pitch: player.pitch,
        selected: selected,
        time: time,
        chunks: world.stats.chunks,
        faces: world.stats.faces,
        triangles: renderer.info.render.triangles
      }),
      setLook: (yaw, pitch) => { player.yaw = yaw; player.pitch = pitch; },
      setTime: (t) => { time = t; },
      break: tryBreak,
      place: tryPlace,
      select: selectSlot,
      save: saveGame,
      world: () => world,
      player: () => player
    };

    animate();
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
