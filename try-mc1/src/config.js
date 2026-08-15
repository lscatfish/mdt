// 全局常量与方块定义
export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
export const SEA_LEVEL = 26;
export const RENDER_DISTANCE = 5; // 单位：区块（16 格）
export const DAY_LENGTH = 240; // 一昼夜秒数
export const REACH = 6; // 交互距离（格）

export const BLOCK = Object.freeze({
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  LOG: 6,
  LEAVES: 7,
  PLANKS: 8,
  COBBLE: 9,
  GLASS: 10,
  BRICK: 11,
  SNOW: 12,
  BEDROCK: 13
});

// 图集 tile 编号（4x4，16px/tile）
export const TILE = Object.freeze({
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  LOG_TOP: 6,
  LOG_SIDE: 7,
  LEAVES: 8,
  PLANKS: 9,
  COBBLE: 10,
  GLASS: 11,
  BRICK: 12,
  SNOW: 13,
  BEDROCK: 14
});

export const BLOCK_NAMES = {
  [BLOCK.AIR]: '空气',
  [BLOCK.GRASS]: '草方块',
  [BLOCK.DIRT]: '泥土',
  [BLOCK.STONE]: '石头',
  [BLOCK.SAND]: '沙子',
  [BLOCK.WATER]: '水',
  [BLOCK.LOG]: '原木',
  [BLOCK.LEAVES]: '树叶',
  [BLOCK.PLANKS]: '木板',
  [BLOCK.COBBLE]: '圆石',
  [BLOCK.GLASS]: '玻璃',
  [BLOCK.BRICK]: '红砖',
  [BLOCK.SNOW]: '雪块',
  [BLOCK.BEDROCK]: '基岩'
};

// tile: {top, side, bottom}
export const BLOCK_DEFS = {
  [BLOCK.GRASS]: { name: '草方块', tile: { top: TILE.GRASS_TOP, side: TILE.GRASS_SIDE, bottom: TILE.DIRT } },
  [BLOCK.DIRT]: { name: '泥土', tile: { top: TILE.DIRT, side: TILE.DIRT, bottom: TILE.DIRT } },
  [BLOCK.STONE]: { name: '石头', tile: { top: TILE.STONE, side: TILE.STONE, bottom: TILE.STONE } },
  [BLOCK.SAND]: { name: '沙子', tile: { top: TILE.SAND, side: TILE.SAND, bottom: TILE.SAND } },
  [BLOCK.WATER]: { name: '水', tile: { top: TILE.WATER, side: TILE.WATER, bottom: TILE.WATER } },
  [BLOCK.LOG]: { name: '原木', tile: { top: TILE.LOG_TOP, side: TILE.LOG_SIDE, bottom: TILE.LOG_TOP } },
  [BLOCK.LEAVES]: { name: '树叶', tile: { top: TILE.LEAVES, side: TILE.LEAVES, bottom: TILE.LEAVES } },
  [BLOCK.PLANKS]: { name: '木板', tile: { top: TILE.PLANKS, side: TILE.PLANKS, bottom: TILE.PLANKS } },
  [BLOCK.COBBLE]: { name: '圆石', tile: { top: TILE.COBBLE, side: TILE.COBBLE, bottom: TILE.COBBLE } },
  [BLOCK.GLASS]: { name: '玻璃', tile: { top: TILE.GLASS, side: TILE.GLASS, bottom: TILE.GLASS } },
  [BLOCK.BRICK]: { name: '红砖', tile: { top: TILE.BRICK, side: TILE.BRICK, bottom: TILE.BRICK } },
  [BLOCK.SNOW]: { name: '雪块', tile: { top: TILE.SNOW, side: TILE.SNOW, bottom: TILE.SNOW } },
  [BLOCK.BEDROCK]: { name: '基岩', tile: { top: TILE.BEDROCK, side: TILE.BEDROCK, bottom: TILE.BEDROCK } }
};

// 快捷栏可放置的方块
export const SELECTABLE = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SAND, BLOCK.PLANKS,
  BLOCK.COBBLE, BLOCK.BRICK, BLOCK.GLASS, BLOCK.LOG, BLOCK.WATER, BLOCK.SNOW
];

// 遮挡面剔除时视为“不透明”：水与玻璃会让相邻面显示
export function isOpaque(id) {
  return id !== BLOCK.AIR && id !== BLOCK.WATER && id !== BLOCK.GLASS;
}

// 物理碰撞：水可穿过，玻璃等实体
export function isSolid(id) {
  return id !== BLOCK.AIR && id !== BLOCK.WATER;
}
