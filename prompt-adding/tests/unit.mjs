// Unit tests for the pure-logic game modules. Run: node tests/unit.mjs
// Covers: PRNG/noise determinism, voxel read/write, terrain generation,
// raycast grid alignment (exact boundary hits), physics landing/walls,
// mesh geometry alignment, and save serialization round-trips.

import { BLOCK, FACE, PHYS, WORLD_HEIGHT } from "../js/config.js";
import { SimplexNoise2D, fbm, mulberry32, hashString } from "../js/noise.js";
import { World, chunkKey, bytesToBase64, base64ToBytes } from "../js/world.js";
import { raycastVoxel, placementPosition } from "../js/raycast.js";
import { Player, dirFromYawPitch } from "../js/physics.js";
import { buildChunkMesh, VERTEX_FLOATS } from "../js/mesher.js";

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
function assertClose(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) {
    throw new Error(`${msg || "assertClose"}: |${a} - ${b}| > ${tol}`);
  }
}
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok    " + name);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log("  FAIL  " + name + "  -> " + e.message);
  }
}

// ---- helpers ------------------------------------------------------------

// A world with a flat planks floor at y=10 for x,z in [0,24), cleared
// from y=0 to y=40 so no natural terrain interferes.
function flatWorld(seed = 7) {
  const world = new World(seed);
  for (let x = 0; x < 24; x++) {
    for (let z = 0; z < 24; z++) {
      for (let y = 0; y <= 40; y++) world.setBlock(x, y, z, BLOCK.AIR);
      world.setBlock(x, 10, z, BLOCK.PLANKS);
    }
  }
  return world;
}

// A world where chunk (0,0) is entirely air (no terrain interference).
function emptyChunkWorld(seed = 21) {
  const world = new World(seed);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y < 64; y++) world.setBlock(x, y, z, BLOCK.AIR);
    }
  }
  return world;
}

// flatWorld with a stone wall column at x=15, y in [10,14], z in [9,12].
function wallWorld() {
  const world = flatWorld(11);
  for (let z = 9; z <= 12; z++) {
    for (let y = 10; y <= 14; y++) world.setBlock(15, y, z, BLOCK.STONE);
  }
  return world;
}

// ---------------------------------------------------------------- PRNG/noise

test("mulberry32 deterministic sequence", () => {
  const a = mulberry32(1234);
  const b = mulberry32(1234);
  for (let i = 0; i < 8; i++) assert(a() === b(), "sequence diverged at " + i);
  const c = mulberry32(1235);
  assert(c() !== a(), "different seeds should differ");
});

test("hashString deterministic 32-bit", () => {
  const h1 = hashString("world seed");
  const h2 = hashString("world seed");
  assert(h1 === h2);
  assert(Number.isInteger(h1) && h1 >= 0 && h1 <= 0xffffffff);
});

test("simplex noise deterministic and bounded", () => {
  const n1 = new SimplexNoise2D(99);
  const n2 = new SimplexNoise2D(99);
  const pts = [[0, 0], [1.5, -2.5], [100.25, 7.75], [-50.5, 60.1]];
  for (const [x, y] of pts) {
    const v = n1.noise(x, y);
    assert(v === n2.noise(x, y), "noise not deterministic");
    assert(v >= -1 && v <= 1, "noise out of range: " + v);
  }
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      const v = n1.noise(x * 0.37, y * 0.91);
      assert(v >= -1 && v <= 1, "noise out of range");
    }
  }
});

test("fbm bounded", () => {
  const n = new SimplexNoise2D(5);
  for (let i = 0; i < 200; i++) {
    const v = fbm(n, i * 0.13, i * 0.71, 4);
    assert(Math.abs(v) <= 1.000001, "fbm out of range: " + v);
  }
});

// ------------------------------------------------------------------ world

test("chunk coords use floor division (negative safe)", () => {
  assert(World.chunkCoords(-1, 0)[0] === -1);
  assert(World.chunkCoords(-16, 0)[0] === -1);
  assert(World.chunkCoords(-17, 0)[0] === -2);
  assert(World.chunkCoords(15, 15)[0] === 0 && World.chunkCoords(15, 15)[1] === 0);
  assert(World.chunkCoords(16, 0)[0] === 1);
});

test("setBlock/getBlock round-trip across chunk borders", () => {
  const world = new World(3);
  const cases = [
    [8, 40, 8], [15, 40, 15], [16, 40, 16], [-1, 12, 5], [-16, 12, -16], [33, 55, -17],
  ];
  for (const [x, y, z] of cases) {
    assert(world.setBlock(x, y, z, BLOCK.PLANKS));
    assert(world.getBlock(x, y, z) === BLOCK.PLANKS, `get/set failed at ${x},${y},${z}`);
    world.setBlock(x, y, z, BLOCK.AIR);
    assert(world.getBlock(x, y, z) === BLOCK.AIR);
  }
  // Out-of-world y reads as air, writes rejected.
  assert(world.getBlock(0, -1, 0) === BLOCK.AIR);
  assert(world.getBlock(0, WORLD_HEIGHT, 0) === BLOCK.AIR);
  assert(!world.setBlock(0, -1, 0, BLOCK.STONE));
});

test("peekBlock does not generate; getBlock does", () => {
  const world = new World(4);
  const key = chunkKey(0, 0);
  assert(!world.chunks.has(key), "chunk should not exist yet");
  assert(world.peekBlock(8, 40, 8) === BLOCK.AIR);
  assert(!world.chunks.has(key), "peek must not generate");
  world.getBlock(8, 40, 8);
  assert(world.chunks.has(key), "getBlock must generate");
});

test("terrain generation deterministic for a seed", () => {
  const a = new World(42);
  const b = new World(42);
  for (const [cx, cz] of [[0, 0], [1, 0], [0, 1], [-1, -1]]) {
    a.getBlock(cx * 16 + 8, 40, cz * 16 + 8); // ensure generated
    b.getBlock(cx * 16 + 8, 40, cz * 16 + 8);
    const da = a.getChunkData(cx, cz);
    const db = b.getChunkData(cx, cz);
    assert(da && db, "chunk must be generated");
    assert(da.length === db.length);
    for (let i = 0; i < da.length; i += 977) assert(da[i] === db[i], "chunk data mismatch");
  }
});

test("terrain: bedrock, grass/sand surface, dirt, stone, water", () => {
  const world = new World(50);
  // bedrock everywhere at y=0
  assert(world.getBlock(7, 0, 7) === BLOCK.BEDROCK);
  assert(world.getBlock(101, 0, -40) === BLOCK.BEDROCK);
  // column rules
  const checked = { grass: false, sand: false, water: false, dirt: false, stone: false };
  for (let x = 0; x < 400; x++) {
    const z = (x * 7) % 300 - 150;
    const h = world.height(x, z);
    assert(h >= 1 && h <= WORLD_HEIGHT - 12, "height out of range: " + h);
    if (h > 21) {
      assert(world.getBlock(x, h, z) === BLOCK.GRASS, "high column should be grass");
      assert(world.getBlock(x, h - 1, z) === BLOCK.DIRT, "should be dirt below grass");
      assert(world.getBlock(x, h - 4, z) === BLOCK.STONE, "should be stone below dirt");
      checked.grass = checked.dirt = checked.stone = true;
    } else if (h <= 21) {
      assert(world.getBlock(x, h, z) === BLOCK.SAND, "low column should be sand");
      if (h < 20) {
        assert(world.getBlock(x, h + 1, z) === BLOCK.WATER, "should be water above low sand");
        checked.water = true;
      }
      checked.sand = true;
    }
  }
  for (const k of Object.keys(checked)) assert(checked[k], "missing terrain feature: " + k);
});

test("trees spawn deterministically", () => {
  const a = new World(77);
  const b = new World(77);
  const count = (world) => {
    let n = 0;
    for (let x = 0; x < 256; x++) {
      for (let z = 0; z < 256; z++) {
        if (world.getBlock(x, 40, z) === BLOCK.LOG) n++;
      }
    }
    return n;
  };
  assert(count(a) > 0, "expected at least one tree");
  assert(count(a) === count(b), "tree placement must be deterministic");
});

// ---------------------------------------------------------------- raycast

test("raycast down hits floor top EXACTLY on grid boundary", () => {
  const world = flatWorld();
  const hit = raycastVoxel(world, 10.5, 15.5, 10.5, 0, -1, 0);
  assert(hit, "expected a hit");
  assert(hit.x === 10 && hit.y === 10 && hit.z === 10, "wrong block hit");
  assert(hit.face === FACE.PY, "wrong face (should be top)");
  assertClose(hit.dist, 4.5, 1e-9);
  assertClose(hit.hy, 11.0, 1e-9, "hit point must lie exactly on y=11 boundary");
  assertClose(hit.hx, 10.5, 1e-9);
});

test("raycast up hits floor bottom exactly on boundary", () => {
  const world = flatWorld();
  const hit = raycastVoxel(world, 10.5, 5.5, 10.5, 0, 1, 0);
  assert(hit);
  assert(hit.face === FACE.NY, "wrong face (should be bottom)");
  assertClose(hit.hy, 10.0, 1e-9, "hit point must lie exactly on y=10 boundary");
});

test("raycast horizontal hits wall face exactly on boundary", () => {
  const world = wallWorld();
  const hit = raycastVoxel(world, 10.5, 11.5, 10.5, 1, 0, 0);
  assert(hit);
  assert(hit.x === 15 && hit.face === FACE.NX, "wrong block/face");
  assertClose(hit.hx, 15.0, 1e-9, "hit x must equal wall face x=15 exactly");
  assertClose(hit.dist, 4.5, 1e-9);
  // and from the other side
  const hit2 = raycastVoxel(world, 16.5, 11.5, 10.5, -1, 0, 0);
  assert(hit2);
  assert(hit2.x === 15 && hit2.face === FACE.PX);
  assertClose(hit2.hx, 16.0, 1e-9, "hit x must equal wall face x=16 exactly");
});

test("raycast diagonal stops at first solid cell with exact face x", () => {
  const world = flatWorld(13);
  for (let y = 10; y <= 14; y++) {
    for (let z = 0; z <= 4; z++) world.setBlock(2, y, z, BLOCK.STONE);
  }
  const len = Math.hypot(1, 0.2);
  const hit = raycastVoxel(world, 1.5, 11.5, 1.5, 1 / len, 0, 0.2 / len);
  assert(hit, "expected hit");
  assert(hit.x === 2 && hit.z === 1, "wrong cell");
  assert(hit.face === FACE.NX);
  assertClose(hit.hx, 2.0, 1e-9, "hit x must lie exactly on x=2");
  assert(hit.hz > 1 && hit.hz < 2, "hit z must lie inside cell z=1");
});

test("raycast returns null beyond reach", () => {
  const world = flatWorld();
  assert(raycastVoxel(world, 10.5, 30, 10.5, 0, -1, 0) === null);
  assert(raycastVoxel(world, 10.5, 11.5, 10.5, 0, 0, 1) === null);
});

test("placement position is the adjacent cell", () => {
  const world = flatWorld();
  const hit = raycastVoxel(world, 10.5, 15.5, 10.5, 0, -1, 0);
  const p = placementPosition(hit);
  assert(p.x === 10 && p.y === 11 && p.z === 10, "placement against top face");
  const world2 = wallWorld();
  const hit2 = raycastVoxel(world2, 10.5, 11.5, 10.5, 1, 0, 0);
  const p2 = placementPosition(hit2);
  assert(p2.x === 14 && p2.y === 11 && p2.z === 10, "placement against -X face");
});

// ---------------------------------------------------------------- physics

test("player falls and lands EXACTLY on block top", () => {
  const world = flatWorld();
  const p = new Player(10.5, 20, 10.5);
  for (let i = 0; i < 600 && !p.onGround; i++) p.step(world, 1 / 60, {});
  assert(p.onGround, "player should land");
  assertClose(p.pos.y, 11 + PHYS.STEP_EPS, 1e-3, "feet must rest exactly on y=11");
  assert(p.vel.y === 0, "vertical velocity must be zero at rest");
  // stays stable
  for (let i = 0; i < 120; i++) p.step(world, 1 / 60, {});
  assertClose(p.pos.y, 11 + PHYS.STEP_EPS, 1e-3);
});

test("player stops exactly at wall face (no half-block offset)", () => {
  const world = wallWorld();
  const p = new Player(10.5, 11 + PHYS.STEP_EPS, 10.5, -Math.PI / 2, 0); // faces +X
  for (let i = 0; i < 120; i++) p.step(world, 1 / 60, { fwd: true });
  assertClose(p.pos.x, 15 - PHYS.PLAYER_WIDTH / 2 - PHYS.STEP_EPS, 1e-3,
    "player must stop exactly at x=15 wall face minus half-width");
  assertClose(p.pos.z, 10.5, 1e-9);
  assert(p.onGround);
});

test("jump rises then lands; head clamped by ceiling", () => {
  const world = flatWorld();
  for (let x = 9; x <= 12; x++) {
    for (let z = 9; z <= 12; z++) world.setBlock(x, 13, z, BLOCK.STONE);
  }
  const p = new Player(10.5, 11 + PHYS.STEP_EPS, 10.5);
  p.step(world, 1 / 60, {}); // settle onto the ground first
  assert(p.onGround, "player should be on the ground");
  p.step(world, 1 / 60, { jump: true });
  assert(p.vel.y > 0, "jump must give upward velocity");
  for (let i = 0; i < 1; i++) p.step(world, 1 / 60, {});
  assert(p.pos.y + PHYS.PLAYER_HEIGHT <= 13 - PHYS.STEP_EPS + 1e-9, "head must not enter ceiling block");
  assertClose(p.pos.y, 13 - PHYS.PLAYER_HEIGHT - PHYS.STEP_EPS, 1e-3, "head should rest against ceiling");
  // eventually lands back on the floor
  for (let i = 0; i < 600 && !p.onGround; i++) p.step(world, 1 / 60, {});
  assert(p.onGround);
  assertClose(p.pos.y, 11 + PHYS.STEP_EPS, 1e-3);
});

test("flying mode moves vertically without gravity", () => {
  const world = flatWorld();
  const p = new Player(10.5, 11 + PHYS.STEP_EPS, 10.5);
  p.flying = true;
  const y0 = p.pos.y;
  p.step(world, 1 / 60, { jump: true });
  assert(p.pos.y > y0 + 0.1, "fly-up should raise the player");
  p.step(world, 1 / 60, { flyDown: true });
  assertClose(p.pos.y, y0, 1e-3, "fly-down should return to start height");
});

test("look direction vectors are orthonormal-ish and consistent", () => {
  const f = dirFromYawPitch(0, 0);
  assertClose(f.x, 0, 1e-12);
  assertClose(f.y, 0, 1e-12);
  assertClose(f.z, -1, 1e-12);
  const up = dirFromYawPitch(0, Math.PI / 2);
  assertClose(up.y, 1, 1e-12);
  const len = Math.hypot(f.x, f.y, f.z);
  assertClose(len, 1, 1e-12);
});

// ----------------------------------------------------------------- mesher

test("single block mesh: 6 faces, vertices exactly on unit cube", () => {
  const world = emptyChunkWorld();
  world.setBlock(8, 40, 8, BLOCK.PLANKS);
  const { opaque } = buildChunkMesh(world, 0, 0);
  assert(opaque.length === 6 * 6 * VERTEX_FLOATS, `expected 36 vertices, got ${opaque.length / VERTEX_FLOATS}`);
  // every vertex lies exactly on the unit cube of the block
  for (let i = 0; i < opaque.length; i += VERTEX_FLOATS) {
    const [x, y, z] = [opaque[i], opaque[i + 1], opaque[i + 2]];
    assert(x >= 8 && x <= 9 && y >= 40 && y <= 41 && z >= 8 && z <= 9,
      `vertex (${x},${y},${z}) outside block bounds`);
  }
  // the top face occupies exactly the 4 distinct corners at y=41
  const topPositions = new Set();
  for (let i = 0; i < opaque.length; i += VERTEX_FLOATS) {
    if (opaque[i + 1] === 41) topPositions.add(`${opaque[i]},${opaque[i + 1]},${opaque[i + 2]}`);
  }
  assert(topPositions.size === 4, `expected 4 distinct top corners, got ${topPositions.size}`);
  for (const [cx, cy, cz] of [[8, 41, 8], [8, 41, 9], [9, 41, 8], [9, 41, 9]]) {
    assert(topPositions.has(`${cx},${cy},${cz}`), `missing top corner ${cx},${cy},${cz}`);
  }
  // all 8 cube corners must appear
  const seen = new Set();
  for (let i = 0; i < opaque.length; i += VERTEX_FLOATS) {
    seen.add(`${opaque[i]},${opaque[i + 1]},${opaque[i + 2]}`);
  }
  for (const [cx, cy, cz] of [[8, 40, 8], [8, 40, 9], [8, 41, 8], [8, 41, 9],
    [9, 40, 8], [9, 40, 9], [9, 41, 8], [9, 41, 9]]) {
    assert(seen.has(`${cx},${cy},${cz}`), `missing cube corner ${cx},${cy},${cz}`);
  }
});

test("adjacent blocks cull the shared faces", () => {
  const world = emptyChunkWorld(22);
  world.setBlock(8, 40, 8, BLOCK.PLANKS);
  world.setBlock(9, 40, 8, BLOCK.PLANKS);
  const { opaque } = buildChunkMesh(world, 0, 0);
  // 12 faces - 2 shared = 10 faces = 60 vertices
  assert(opaque.length === 10 * 6 * VERTEX_FLOATS,
    `expected 60 vertices, got ${opaque.length / VERTEX_FLOATS}`);
});

test("translucent blocks (water/glass) go to the translucent buffer", () => {
  const world = emptyChunkWorld(23);
  world.setBlock(8, 40, 8, BLOCK.WATER);
  world.setBlock(8, 40, 9, BLOCK.GLASS);
  const { opaque, translucent } = buildChunkMesh(world, 0, 0);
  assert(opaque.length === 0, "no opaque vertices expected");
  // water loses its +Z face (against glass); glass keeps all 6 → 11 faces
  assert(translucent.length === 11 * 6 * VERTEX_FLOATS,
    "water-vs-glass culling: expected 11 faces");
});

// ------------------------------------------------------------- serialization

test("base64 helpers round-trip bytes", () => {
  const data = new Uint8Array(16384);
  for (let i = 0; i < data.length; i++) data[i] = (i * 31) & 0xff;
  const back = base64ToBytes(bytesToBase64(data));
  assert(back.length === data.length);
  for (let i = 0; i < data.length; i += 101) assert(back[i] === data[i]);
});

test("world serialize/deserialize round-trip preserves edits", () => {
  const world = flatWorld(31);
  world.setBlock(3, 12, 4, BLOCK.STONE);
  world.setBlock(-5, 30, -5, BLOCK.SAND);
  world.timeOfDay = 0.37;
  const snapshot = world.serialize();
  const restored = World.deserialize(snapshot);
  assert(restored.seed === world.seed);
  assert(restored.timeOfDay === 0.37);
  for (let x = 0; x < 24; x++) {
    for (let z = 0; z < 24; z++) {
      for (let y = 0; y <= 18; y += 3) {
        assert(restored.getBlock(x, y, z) === world.getBlock(x, y, z),
          `mismatch at ${x},${y},${z}`);
      }
    }
  }
  assert(restored.getBlock(3, 12, 4) === BLOCK.STONE);
  assert(restored.getBlock(-5, 30, -5) === BLOCK.SAND);
});

// ------------------------------------------------------------------ report

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log("  - " + f.name + ": " + f.error.message);
  process.exit(1);
}
