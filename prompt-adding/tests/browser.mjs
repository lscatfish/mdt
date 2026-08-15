// Browser-level verification suite for the game.
// Requires: npm i -D playwright   (and a chromium build available to playwright)
// Spawns its own static server, runs every check in a headless browser, and
// exits non-zero on any failure.
//
// Run: node tests/browser.mjs
//
// Coverage:
//  - zero console errors on boot
//  - state assertions: landing collision, block read/write, raycast grid
//    alignment (exact boundary hits), break/place, save/load round-trip
//  - pixel-level assertions via WebGL readPixels: block face texel colors
//    (top + side faces, exact hit-uv texels), sky clear color day/night,
//    global night lighting factor, highlight-box projection alignment,
//    scene texture diversity
//  - input paths: keyboard, mouse break/place, wheel hotbar, double-space fly
//  - day/night time advance, start-overlay flow
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 8345;
const BASE = `http://127.0.0.1:${PORT}`;
const URL = `${BASE}/?test=1&seed=42`;

let passed = 0;
let failed = 0;
const failures = [];
function ok(name, pass, detail = "") {
  if (pass) { passed++; console.log("  ok    " + name); }
  else {
    failed++;
    failures.push(name + (detail ? "  ->  " + detail : ""));
    console.log("  FAIL  " + name + (detail ? "  ->  " + detail : ""));
  }
}

async function waitForServer(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE + "/");
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

const server = spawn(process.execPath, ["server.mjs", String(PORT)], { stdio: "ignore" });
let browser = null;
try {
  if (!(await waitForServer())) throw new Error("static server did not start");
  console.log("server up at " + BASE);

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(
    () => window.__game && typeof window.__game.setPaused === "function",
    null, { timeout: 10000 },
  );
  await page.waitForTimeout(400);

  // ------------------------------------------------------------- in-page suite
  const report = await page.evaluate(async () => {
    const g = window.__game;
    const results = [];
    const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? "" });
    const near = (a, b, tol) => Math.abs(a - b) <= tol;
    const W = g.canvasSize().w, H = g.canvasSize().h;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    g.setPaused(true);

    // ---- boot state
    ok("seed matches", g.world.seed === 42, "seed=" + g.world.seed);
    ok("webgl context", !!g.renderer.gl);

    // ---- landing collision: fall and rest exactly on the surface
    g.setPos(8.5, 60, 8.5);
    g.stepFrames(240);
    const s = g.getState();
    ok("player lands", s.onGround);
    let groundY = -1;
    for (let y = 59; y >= 1; y--) {
      const b = g.getBlockAt(8, y, 8);
      if (b !== 0 && b !== 5) { groundY = y; break; }
    }
    ok("feet rest exactly on block top", near(s.pos.y, groundY + 1 + 1e-4, 1e-3),
      `feet=${s.pos.y.toFixed(4)} groundY=${groundY}`);
    ok("vy zero at rest", g.player.vel.y === 0, "vy=" + g.player.vel.y);

    // ---- block read/write
    g.clearArea(8, 12, 10, 18, 8, 12);
    g.setBlockAt(10, 10, 10, 8);
    ok("block write/erase", g.getBlockAt(10, 10, 10) === 8);
    g.setBlockAt(10, 10, 10, 0);
    ok("block erase", g.getBlockAt(10, 10, 10) === 0);

    // ---- raycast: exact grid boundary
    g.setBlockAt(10, 10, 10, 8);
    g.setPos(10.5, 12, 10.5);
    g.setLook(0, -Math.PI / 2 + 1e-9);
    const hit = g.raycastCenter();
    ok("raycast hits (10,10,10) top face", hit && hit.x === 10 && hit.y === 10 && hit.z === 10 && hit.face === 2,
      JSON.stringify(hit));
    ok("raycast hit point lies EXACTLY on y=11", hit && Math.abs(hit.hy - 11) < 1e-9, "hy=" + (hit && hit.hy));

    // ---- break/place through the aim ray
    const broke = g.breakCenter();
    ok("breakCenter removes the targeted block", broke && g.getBlockAt(10, 10, 10) === 0);
    // rebuild the floors under both test camera positions
    g.setBlockAt(10, 10, 10, 8);
    g.setBlockAt(8, 10, 8, 8);
    g.flushMeshes(50);

    // ---- pixel: top face center texel (planks), straight down
    g.setPos(8.5, 12, 8.5);
    g.setLook(0, -Math.PI / 2 + 1e-9);
    g.setTime(0);
    g.renderFrame();
    const pxA = g.samplePixel(W >> 1, H >> 1);
    const expA = g.expectedFaceColor(8, 2).map((v) => v * 255);
    ok("center pixel == planks top center texel",
      expA.every((v, i) => near(pxA[i], v, 4)),
      `sample=${pxA} expected=${expA.map((v) => v | 0)}`);

    // ---- pixel: side face at the exact hit uv (tower block at eye level)
    g.clearArea(0, 20, 10, 13, 0, 20);
    for (let x = 0; x <= 20; x++) for (let z = 0; z <= 20; z++) g.setBlockAt(x, 10, z, 8);
    g.setBlockAt(12, 13, 12, 8);
    g.flushMeshes(200);
    g.setPos(12.5, 11.5, 15.5);
    g.setLook(0, 0);
    g.renderFrame();
    const hitC = g.raycastCenter();
    ok("raycast hits tower (12,13,12) +Z face", hitC && hitC.x === 12 && hitC.y === 13 && hitC.z === 12 && hitC.face === 4,
      JSON.stringify(hitC));
    const vC = hitC.hy - 13;
    const pxC = g.samplePixel(W >> 1, H >> 1);
    const tileC = g.cfg.FACE_TILE[8][4];
    const expC = g.texelAt(tileC, 0.5, vC).slice(0, 3).map((v) => v * 0.8);
    ok("center pixel == side texel at hit uv x0.8",
      expC.every((v, i) => near(pxC[i], v, 6)),
      `sample=${pxC} expected=${expC.map((v) => v | 0)} v=${vC.toFixed(3)}`);

    // ---- pixel: sky clear color, day vs night
    g.clearArea(12, 13, 14, 62, 14, 16); // tall chimney above the camera
    g.flushMeshes(50);
    g.setLook(0, 1.55);
    g.setTime(0);
    g.renderFrame();
    const pxE = g.samplePixel(W >> 1, H >> 1);
    const expE = g.skyColorRGB(0);
    ok("noon sky pixel == clear color", expE.every((v, i) => near(pxE[i], v, 3)),
      `sample=${pxE} expected=${expE.map((v) => v | 0)}`);
    g.setTime(0.5);
    g.renderFrame();
    const pxF = g.samplePixel(W >> 1, H >> 1);
    const expF = g.skyColorRGB(0.5);
    ok("midnight sky pixel == clear color", expF.every((v, i) => near(pxF[i], v, 3)),
      `sample=${pxF} expected=${expF.map((v) => v | 0)}`);

    // ---- pixel: global night lighting factor on block color
    g.setTime(0);
    g.setPos(8.5, 12, 8.5);
    g.setLook(0, -Math.PI / 2 + 1e-9);
    g.renderFrame();
    const day = g.samplePixel(W >> 1, H >> 1);
    g.setTime(0.5);
    g.renderFrame();
    const night = g.samplePixel(W >> 1, H >> 1);
    const ratio = day.map((v, i) => night[i] / v);
    ok("night pixel == day pixel x0.35", ratio.every((r) => near(r, 0.35, 0.06)),
      `ratio=${ratio.map((r) => r.toFixed(2))}`);

    // ---- highlight box projected exactly on the hit block
    g.setTime(0);
    g.renderFrame();
    const hh = g.raycastCenter();
    const dark = (x, y) => { const p = g.samplePixel(x, y); return p[0] < 75 && p[1] < 75 && p[2] < 75; };
    let edgeHits = 0;
    for (const sy of [H / 2 - 99, H / 2 + 99]) {
      let found = false;
      for (let x = W / 2 - 6; x <= W / 2 + 6 && !found; x++) if (dark(x, sy)) found = true;
      if (found) edgeHits++;
    }
    ok("highlight box edges at projected block edges (2/2)", hh && edgeHits === 2, "edges=" + edgeHits);

    // ---- save/load round-trip
    g.setBlockAt(10, 11, 10, 4);
    g.setTime(0.37);
    g.save();
    g.setBlockAt(10, 11, 10, 0);
    g.setTime(0);
    const loaded = g.load();
    ok("save exists", g.hasSave());
    ok("load succeeds and restores block + time + player",
      loaded === true && g.getBlockAt(10, 11, 10) === 4 && near(g.getState().timeOfDay, 0.37, 1e-9),
      "block=" + g.getBlockAt(10, 11, 10) + " t=" + g.getState().timeOfDay.toFixed(3));

    // ---- day/night advance
    const t0 = g.getState().timeOfDay;
    g.advanceTime(5);
    ok("advanceTime(5) moves time by 5/240",
      near(((g.getState().timeOfDay - t0 + 1) % 1), 5 / 240, 1e-9));

    // ---- input paths (real DOM events + deterministic interact step)
    const ev = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    ev("keydown", "KeyW");
    ok("keydown W -> fwd", g.input.snapshot().fwd === true);
    ev("keyup", "KeyW");
    g.input.lastSpaceTime = -1e9;
    const fly0 = g.player.flying;
    ev("keydown", "Space"); ev("keyup", "Space");
    ev("keydown", "Space"); ev("keyup", "Space");
    ok("double-space toggles fly", g.player.flying === !fly0);
    g.setHotbar(0);
    document.getElementById("gl").dispatchEvent(new WheelEvent("wheel", { deltaY: 120, cancelable: true }));
    ok("wheel selects next hotbar slot", g.getState().hotbarIndex === 1);

    g.clearArea(0, 20, 10, 13, 0, 20);
    for (let x = 0; x <= 20; x++) for (let z = 0; z <= 20; z++) g.setBlockAt(x, 10, z, 8);
    g.flushMeshes(200);
    g.setPos(10.5, 12, 10.5);
    g.setLook(0, -Math.PI / 2 + 1e-9);
    const canvas = document.getElementById("gl");
    canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
    g.interactOnce();
    ok("mouse break path breaks the aimed block", g.getBlockAt(10, 10, 10) === 0,
      "block=" + g.getBlockAt(10, 10, 10));
    window.dispatchEvent(new MouseEvent("mouseup", { button: 0, bubbles: true }));
    g.setHotbar(0);
    canvas.dispatchEvent(new MouseEvent("mousedown", { button: 2, bubbles: true }));
    g.interactOnce();
    ok("mouse place path fills the hit cell", g.getBlockAt(10, 10, 10) === g.cfg.HOTBAR_BLOCKS[0],
      "block=" + g.getBlockAt(10, 10, 10));
    window.dispatchEvent(new MouseEvent("mouseup", { button: 2, bubbles: true }));

    // ---- scene diversity (real terrain view)
    g.resetWorld(42);
    const h0 = g.spawnHeight(8.5, 8.5);
    g.setPos(8.5, h0 + 1, 8.5);
    g.setLook(0.9, -0.15);
    for (let i = 0; i < 20; i++) g.tick(0.016);
    g.flushMeshes(400);
    g.renderFrame();
    const topRow = g.samplePixel(W >> 1, 5);
    const skyExp = g.skyColorRGB(0);
    ok("scene top pixel == sky", skyExp.every((v, i) => near(topRow[i], v, 3)));
    const set = new Set();
    let green = 0;
    for (let gy = 0; gy < 36; gy++) {
      for (let gx = 0; gx < 64; gx++) {
        const p = g.samplePixel(Math.floor((gx + 0.5) * W / 64), Math.floor((gy + 0.5) * H / 36));
        set.add(p.join(","));
        if (p[1] > 90 && p[1] < 200 && p[0] < 120 && p[2] < 90) green++;
      }
    }
    ok("scene textured (distinct colors > 150, grass present)",
      set.size > 150 && green > 20, `colors=${set.size} green=${green}`);

    return { results, allPass: results.every((r) => r.pass) };
  });

  // --------------------------------------------------------- overlay flow
  await page.goto(`${BASE}/?seed=7`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__game && typeof window.__game.setPaused === "function",
    null, { timeout: 10000 });
  const overlay = await page.evaluate(async () => {
    const el = document.getElementById("overlay");
    const before = getComputedStyle(el).display;
    document.getElementById("btnPlay").click();
    await new Promise((r) => setTimeout(r, 250));
    return { before, after: getComputedStyle(el).display };
  });
  ok("start overlay hides after btnPlay", overlay.before === "flex" && overlay.after === "none",
    JSON.stringify(overlay));

  // ------------------------------------------------------------------- report
  for (const r of report.results) ok(r.name, r.pass, r.detail);
  ok("zero console errors", consoleErrors.length === 0, consoleErrors.join(" | ").slice(0, 400));
} catch (err) {
  console.error("browser suite crashed:", err);
  failed++;
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
