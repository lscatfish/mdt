// 全局配置与方块定义

export const CHUNK_SIZE_X = 16;
export const CHUNK_SIZE_Y = 96;
export const CHUNK_SIZE_Z = 16;
export const WORLD_HEIGHT = CHUNK_SIZE_Y;
export const SEA_LEVEL = 24;

export const RENDER_DISTANCE = 5; // 以玩家为中心加载的区块半径（单位：区块）

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  LOG: 6,
  LEAVES: 7,
  BEDROCK: 8,
  PLANKS: 9,
  GLASS: 10,
  COBBLE: 11,
  GRAVEL: 12,
  BRICK: 13,
  COAL_ORE: 14,
  IRON_ORE: 15
};

// 纹理图集中的图块编号（16x16 像素一格）
export const TILE = {
  GRASS_TOP: 0,
  DIRT: 1,
  GRASS_SIDE: 2,
  STONE: 3,
  SAND: 4,
  LOG_SIDE: 5,
  LOG_TOP: 6,
  LEAVES: 7,
  BEDROCK: 8,
  PLANKS: 9,
  GLASS: 10,
  WATER: 11,
  COBBLE: 12,
  GRAVEL: 13,
  BRICK: 14,
  COAL_ORE: 15,
  IRON_ORE: 16
};

export const BLOCK_DEFS = {
  [BLOCK.GRASS]: {
    name: '草方块',
    top: TILE.GRASS_TOP,
    bottom: TILE.DIRT,
    side: TILE.GRASS_SIDE,
    solid: true,
    cullOpaque: true,
    particleColor: [0.39, 0.62, 0.27]
  },
  [BLOCK.DIRT]: {
    name: '泥土',
    top: TILE.DIRT,
    bottom: TILE.DIRT,
    side: TILE.DIRT,
    solid: true,
    cullOpaque: true,
    particleColor: [0.52, 0.37, 0.25]
  },
  [BLOCK.STONE]: {
    name: '石头',
    top: TILE.STONE,
    bottom: TILE.STONE,
    side: TILE.STONE,
    solid: true,
    cullOpaque: true,
    particleColor: [0.5, 0.5, 0.52]
  },
  [BLOCK.SAND]: {
    name: '沙子',
    top: TILE.SAND,
    bottom: TILE.SAND,
    side: TILE.SAND,
    solid: true,
    cullOpaque: true,
    particleColor: [0.85, 0.8, 0.58]
  },
  [BLOCK.WATER]: {
    name: '水',
    top: TILE.WATER,
    bottom: TILE.WATER,
    side: TILE.WATER,
    solid: false,
    cullOpaque: false,
    transparent: true,
    opacity: 0.7,
    particleColor: [0.25, 0.45, 0.85]
  },
  [BLOCK.LOG]: {
    name: '原木',
    top: TILE.LOG_TOP,
    bottom: TILE.LOG_TOP,
    side: TILE.LOG_SIDE,
    solid: true,
    cullOpaque: true,
    particleColor: [0.42, 0.31, 0.18]
  },
  [BLOCK.LEAVES]: {
    name: '树叶',
    top: TILE.LEAVES,
    bottom: TILE.LEAVES,
    side: TILE.LEAVES,
    solid: true,
    cullOpaque: true,
    alphaTest: 0.45,
    particleColor: [0.2, 0.48, 0.18]
  },
  [BLOCK.BEDROCK]: {
    name: '基岩',
    top: TILE.BEDROCK,
    bottom: TILE.BEDROCK,
    side: TILE.BEDROCK,
    solid: true,
    cullOpaque: true,
    unbreakable: true,
    particleColor: [0.2, 0.2, 0.22]
  },
  [BLOCK.PLANKS]: {
    name: '木板',
    top: TILE.PLANKS,
    bottom: TILE.PLANKS,
    side: TILE.PLANKS,
    solid: true,
    cullOpaque: true,
    particleColor: [0.68, 0.53, 0.29]
  },
  [BLOCK.GLASS]: {
    name: '玻璃',
    top: TILE.GLASS,
    bottom: TILE.GLASS,
    side: TILE.GLASS,
    solid: true,
    cullOpaque: true,
    alphaTest: 0.45,
    particleColor: [0.78, 0.9, 0.95]
  },
  [BLOCK.COBBLE]: {
    name: '圆石',
    top: TILE.COBBLE,
    bottom: TILE.COBBLE,
    side: TILE.COBBLE,
    solid: true,
    cullOpaque: true,
    particleColor: [0.42, 0.42, 0.44]
  },
  [BLOCK.GRAVEL]: {
    name: '沙砾',
    top: TILE.GRAVEL,
    bottom: TILE.GRAVEL,
    side: TILE.GRAVEL,
    solid: true,
    cullOpaque: true,
    particleColor: [0.46, 0.4, 0.38]
  },
  [BLOCK.BRICK]: {
    name: '红砖',
    top: TILE.BRICK,
    bottom: TILE.BRICK,
    side: TILE.BRICK,
    solid: true,
    cullOpaque: true,
    particleColor: [0.55, 0.28, 0.24]
  },
  [BLOCK.COAL_ORE]: {
    name: '煤矿石',
    top: TILE.COAL_ORE,
    bottom: TILE.COAL_ORE,
    side: TILE.COAL_ORE,
    solid: true,
    cullOpaque: true,
    particleColor: [0.3, 0.3, 0.3]
  },
  [BLOCK.IRON_ORE]: {
    name: '铁矿石',
    top: TILE.IRON_ORE,
    bottom: TILE.IRON_ORE,
    side: TILE.IRON_ORE,
    solid: true,
    cullOpaque: true,
    particleColor: [0.62, 0.52, 0.42]
  }
};

export const HOTBAR = [
  BLOCK.GRASS,
  BLOCK.DIRT,
  BLOCK.STONE,
  BLOCK.PLANKS,
  BLOCK.COBBLE,
  BLOCK.GLASS,
  BLOCK.SAND,
  BLOCK.LEAVES,
  BLOCK.LOG
];

export const MAX_BLOCK_ID = 15;
