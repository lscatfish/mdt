// Shared constants and block definitions. Pure logic — no DOM/WebGL.
// This module must stay importable from Node for unit tests.

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  LOG: 6,
  LEAVES: 7,
  PLANKS: 8,
  GLASS: 9,
  BEDROCK: 10,
};

export const BLOCK_NAMES = [
  "空气", "草方块", "泥土", "石头", "沙子", "水",
  "原木", "树叶", "木板", "玻璃", "基岩",
];

export const HOTBAR_BLOCKS = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SAND,
  BLOCK.LOG, BLOCK.PLANKS, BLOCK.LEAVES, BLOCK.GLASS,
];

export const WORLD_HEIGHT = 64;
export const CHUNK_SIZE = 16;
export const SEA_LEVEL = 20;

// Face enumeration. Order: +X, -X, +Y, -Y, +Z, -Z.
export const FACE = { PX: 0, NX: 1, PY: 2, NY: 3, PZ: 4, NZ: 5 };
export const FACE_NORMAL = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

// Texture atlas tile indices (16px tiles on a 256px atlas).
export const TILE = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  LOG_SIDE: 6,
  LOG_TOP: 7,
  LEAVES: 8,
  PLANKS: 9,
  GLASS: 10,
  BEDROCK: 11,
};
export const TILE_COUNT = 12;
export const TILE_PX = 16;
export const ATLAS_COLS = 16;
export const ATLAS_PX = ATLAS_COLS * TILE_PX;

// Which atlas tile each block face uses (indexed [blockId][face]).
const t = TILE;
export const FACE_TILE = {
  [BLOCK.GRASS]: [t.GRASS_SIDE, t.GRASS_SIDE, t.GRASS_TOP, t.DIRT, t.GRASS_SIDE, t.GRASS_SIDE],
  [BLOCK.DIRT]: [t.DIRT, t.DIRT, t.DIRT, t.DIRT, t.DIRT, t.DIRT],
  [BLOCK.STONE]: [t.STONE, t.STONE, t.STONE, t.STONE, t.STONE, t.STONE],
  [BLOCK.SAND]: [t.SAND, t.SAND, t.SAND, t.SAND, t.SAND, t.SAND],
  [BLOCK.WATER]: [t.WATER, t.WATER, t.WATER, t.WATER, t.WATER, t.WATER],
  [BLOCK.LOG]: [t.LOG_SIDE, t.LOG_SIDE, t.LOG_TOP, t.LOG_TOP, t.LOG_SIDE, t.LOG_SIDE],
  [BLOCK.LEAVES]: [t.LEAVES, t.LEAVES, t.LEAVES, t.LEAVES, t.LEAVES, t.LEAVES],
  [BLOCK.PLANKS]: [t.PLANKS, t.PLANKS, t.PLANKS, t.PLANKS, t.PLANKS, t.PLANKS],
  [BLOCK.GLASS]: [t.GLASS, t.GLASS, t.GLASS, t.GLASS, t.GLASS, t.GLASS],
  [BLOCK.BEDROCK]: [t.BEDROCK, t.BEDROCK, t.BEDROCK, t.BEDROCK, t.BEDROCK, t.BEDROCK],
};

// Render class of each block.
export const RENDER_OPAQUE = 0; // drawn in the opaque pass
export const RENDER_CUTOUT = 1; // opaque pass, alpha-discard (leaves)
export const RENDER_TRANSLUCENT = 2; // blended second pass (water, glass)
export const RENDER_CLASS = {
  [BLOCK.GRASS]: RENDER_OPAQUE,
  [BLOCK.DIRT]: RENDER_OPAQUE,
  [BLOCK.STONE]: RENDER_OPAQUE,
  [BLOCK.SAND]: RENDER_OPAQUE,
  [BLOCK.WATER]: RENDER_TRANSLUCENT,
  [BLOCK.LOG]: RENDER_OPAQUE,
  [BLOCK.LEAVES]: RENDER_CUTOUT,
  [BLOCK.PLANKS]: RENDER_OPAQUE,
  [BLOCK.GLASS]: RENDER_TRANSLUCENT,
  [BLOCK.BEDROCK]: RENDER_OPAQUE,
};

// Whether a block is solid for collision purposes.
export function isSolid(block) {
  return block !== BLOCK.AIR && block !== BLOCK.WATER;
}

// Culling rules: is the face of `a` (adjacent to block `b`, which may be AIR
// when out of world bounds) visible? Cutout leaves behave like opaque for culling.
function isOpaqueForCulling(block) {
  return block !== BLOCK.AIR && block !== BLOCK.WATER && block !== BLOCK.GLASS;
}

export function faceVisible(a, b) {
  if (b === BLOCK.AIR) return true;
  if (a === BLOCK.WATER) return b === BLOCK.AIR; // water surface only against air
  if (a === BLOCK.GLASS) return !isOpaqueForCulling(b); // glass against air/water/leaves
  return !isOpaqueForCulling(b) || b === BLOCK.WATER; // opaque vs air/water/glass
}

// Face geometry: 4 corners in CCW winding (front-face) per face, plus
// per-face shading. Corner order matters for triangle winding.
// corners are unit-cube coordinates (0..1) relative to the block origin.
export const FACE_CORNERS = [
  // +X
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  // -X
  [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  // +Y
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  // -Y
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  // +Z
  [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
  // -Z
  [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
];

export const FACE_SHADE = [0.7, 0.7, 1.0, 0.55, 0.8, 0.8];

// UV corners (tile-space 0..1), applied in the same corner order above.
export const FACE_UV = [
  [0, 0], [0, 1], [1, 1], [1, 0],
];

// Player physics constants (units: blocks, seconds).
export const PHYS = {
  EYE_HEIGHT: 1.62,
  PLAYER_WIDTH: 0.6,      // full AABB width
  PLAYER_HEIGHT: 1.8,     // full AABB height
  GRAVITY: 32,
  JUMP_SPEED: 9.0,
  WALK_SPEED: 4.3,
  SPRINT_SPEED: 6.5,
  FLY_SPEED: 11.0,
  FLY_VERT_SPEED: 8.0,
  REACH: 6.0,
  STEP_EPS: 1e-4,
};

export const VIEW_RADIUS = 8; // chunks rendered around the player
