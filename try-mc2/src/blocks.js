// 方块注册表:ID、名称、贴图 tile 与物理/交互属性。

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const COBBLESTONE = 4;
export const PLANKS = 5;
export const SAND = 6;
export const WOOD_LOG = 7;
export const LEAVES = 8;
export const GLASS = 9;
export const WATER = 10;
export const SNOW = 11;
export const BEDROCK = 12;
export const BRICK = 13;
export const GRAVEL = 14;

// 纹理图集 tile 编号(16x16 图集,每 tile 16px)
export const TILE = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  PLANKS: 5,
  SAND: 6,
  LOG_SIDE: 7,
  LOG_TOP: 8,
  LEAVES: 9,
  GLASS: 10,
  WATER: 11,
  SNOW: 12,
  BEDROCK: 13,
  BRICK: 14,
  GRAVEL: 15,
};

export const BLOCKS = {
  [GRASS]: { name: "草方块", tiles: { top: TILE.GRASS_TOP, side: TILE.GRASS_SIDE, bottom: TILE.DIRT }, hardness: 0.45 },
  [DIRT]: { name: "泥土", tiles: { top: TILE.DIRT, side: TILE.DIRT, bottom: TILE.DIRT }, hardness: 0.45 },
  [STONE]: { name: "石头", tiles: { top: TILE.STONE, side: TILE.STONE, bottom: TILE.STONE }, hardness: 1.4 },
  [COBBLESTONE]: { name: "圆石", tiles: { top: TILE.COBBLESTONE, side: TILE.COBBLESTONE, bottom: TILE.COBBLESTONE }, hardness: 1.2 },
  [PLANKS]: { name: "木板", tiles: { top: TILE.PLANKS, side: TILE.PLANKS, bottom: TILE.PLANKS }, hardness: 0.7 },
  [SAND]: { name: "沙子", tiles: { top: TILE.SAND, side: TILE.SAND, bottom: TILE.SAND }, hardness: 0.4 },
  [WOOD_LOG]: { name: "原木", tiles: { top: TILE.LOG_TOP, side: TILE.LOG_SIDE, bottom: TILE.LOG_TOP }, hardness: 0.8 },
  [LEAVES]: { name: "树叶", tiles: { top: TILE.LEAVES, side: TILE.LEAVES, bottom: TILE.LEAVES }, hardness: 0.15 },
  [GLASS]: { name: "玻璃", tiles: { top: TILE.GLASS, side: TILE.GLASS, bottom: TILE.GLASS }, hardness: 0.25 },
  [WATER]: { name: "水", tiles: { top: TILE.WATER, side: TILE.WATER, bottom: TILE.WATER }, hardness: 0 },
  [SNOW]: { name: "雪块", tiles: { top: TILE.SNOW, side: TILE.SNOW, bottom: TILE.SNOW }, hardness: 0.2 },
  [BEDROCK]: { name: "基岩", tiles: { top: TILE.BEDROCK, side: TILE.BEDROCK, bottom: TILE.BEDROCK }, hardness: Infinity },
  [BRICK]: { name: "红砖", tiles: { top: TILE.BRICK, side: TILE.BRICK, bottom: TILE.BRICK }, hardness: 1.2 },
  [GRAVEL]: { name: "沙砾", tiles: { top: TILE.GRAVEL, side: TILE.GRAVEL, bottom: TILE.GRAVEL }, hardness: 0.45 },
};

// 生存模式初始快捷栏
export const DEFAULT_HOTBAR = [GRASS, DIRT, STONE, COBBLESTONE, PLANKS, WOOD_LOG, LEAVES, GLASS, BRICK];

export const DEFAULT_COUNTS = {
  [GRASS]: 64,
  [DIRT]: 48,
  [STONE]: 16,
  [COBBLESTONE]: 32,
  [PLANKS]: 32,
  [WOOD_LOG]: 16,
  [LEAVES]: 32,
  [GLASS]: 8,
  [BRICK]: 16,
  [SAND]: 0,
  [SNOW]: 0,
  [GRAVEL]: 0,
  [WATER]: 0,
};

// 会挡住视线的普通不透明方块(叶子除外)
export function isOpaque(id) {
  return id !== AIR && id !== WATER && id !== GLASS && id !== LEAVES;
}

// 玩家不能穿过的实体方块
export function isSolid(id) {
  return id !== AIR && id !== WATER && id !== GLASS && id !== LEAVES;
}

// 网格生成时视为透明的邻居(需要补面)
export function isTransparentForCulling(id) {
  return id === AIR || id === WATER || id === GLASS || id === LEAVES;
}

export function blockName(id) {
  const def = BLOCKS[id];
  return def ? def.name : "空气";
}

export function hardnessOf(id) {
  const def = BLOCKS[id];
  return def ? def.hardness : 0.5;
}

export function tileFor(id, face) {
  const def = BLOCKS[id];
  if (!def) return TILE.DIRT;
  return def.tiles[face] ?? def.tiles.side;
}
