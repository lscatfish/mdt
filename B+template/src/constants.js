// 方块定义与全局常量
export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
export const SEA_LEVEL = 24;
export const REACH = 6.5;

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const SAND = 4;
export const LOG = 5;
export const LEAVES = 6;
export const PLANKS = 7;
export const COAL_ORE = 8;
export const IRON_ORE = 9;
export const BEDROCK = 10;
export const WATER = 11;
export const GLASS = 12;
export const COBBLESTONE = 13;

// tiles: [top, bottom, side]
export const BLOCKS = [];
function def(id, name, tiles, opts = {}) {
  BLOCKS[id] = {
    id,
    name,
    tiles,
    opaque: opts.opaque !== false,
    solid: opts.solid !== false,     // 参与碰撞
    culls: opts.culls !== false,     // 是否遮挡相邻面
    aoOccludes: opts.aoOccludes !== false,
    kind: opts.kind || 'solid',      // solid | water | glass
  };
}

def(GRASS, '草方块', [0, 2, 1]);
def(DIRT, '泥土', [2, 2, 2]);
def(STONE, '石头', [3, 3, 3]);
def(COBBLESTONE, '圆石', [14, 14, 14]);
def(SAND, '沙子', [4, 4, 4]);
def(LOG, '原木', [6, 6, 5]);
def(LEAVES, '树叶', [7, 7, 7], { opaque: false, aoOccludes: false });
def(PLANKS, '木板', [8, 8, 8]);
def(COAL_ORE, '煤矿石', [9, 9, 9]);
def(IRON_ORE, '铁矿石', [10, 10, 10]);
def(BEDROCK, '基岩', [11, 11, 11]);
def(WATER, '水', [12, 12, 12], { opaque: false, solid: false, culls: false, aoOccludes: false, kind: 'water' });
def(GLASS, '玻璃', [13, 13, 13], { opaque: false, aoOccludes: false, kind: 'glass' });

// 快捷栏方块
export const HOTBAR = [GRASS, DIRT, STONE, COBBLESTONE, PLANKS, LOG, LEAVES, SAND, GLASS, WATER];

// 颜色调色板（用于快捷栏 2D 图标）
export const BLOCK_COLORS = {
  [GRASS]:      { top: '#72c14f', side: '#8a6a3f', bottom: '#8a6a3f', topDeco: '#9adf70' },
  [DIRT]:       { top: '#8a6a3f', side: '#7c5f38', bottom: '#7c5f38' },
  [STONE]:      { top: '#8f8f91', side: '#7b7b7e', bottom: '#7b7b7e' },
  [COBBLESTONE]:{ top: '#8b8b8d', side: '#737376', bottom: '#737376' },
  [SAND]:       { top: '#e2d49d', side: '#d3c288', bottom: '#d3c288' },
  [LOG]:        { top: '#a88a52', side: '#6f532e', bottom: '#a88a52' },
  [LEAVES]:     { top: '#3f7a2e', side: '#356728', bottom: '#356728' },
  [PLANKS]:     { top: '#b08a4d', side: '#8f6d3a', bottom: '#8f6d3a' },
  [COAL_ORE]:   { top: '#6f6f72', side: '#626266', bottom: '#626266' },
  [IRON_ORE]:   { top: '#8c7f74', side: '#7a6e64', bottom: '#7a6e64' },
  [BEDROCK]:    { top: '#4a4a4e', side: '#3b3b3f', bottom: '#3b3b3f' },
  [WATER]:      { top: '#3f72d8', side: '#3560bc', bottom: '#3560bc' },
  [GLASS]:      { top: '#cfe8f5', side: '#b8d8e8', bottom: '#b8d8e8' },
};

// 方块面：dir 为法线，corners 按逆时针（从面外侧观察），坐标为面内两个切向轴的 0/1 偏移
// tangents 给出两个切向轴（x/y/z）
export const FACES = [
  { dir: [1, 0, 0], t1: 'y', t2: 'z', corners: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.86 },
  { dir: [-1, 0, 0], t1: 'y', t2: 'z', corners: [[0, 0], [0, 1], [1, 1], [1, 0]], shade: 0.86 },
  { dir: [0, 1, 0], t1: 'x', t2: 'z', corners: [[0, 0], [0, 1], [1, 1], [1, 0]], shade: 1.0 },
  { dir: [0, -1, 0], t1: 'x', t2: 'z', corners: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.6 },
  { dir: [0, 0, 1], t1: 'x', t2: 'y', corners: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.8 },
  { dir: [0, 0, -1], t1: 'x', t2: 'y', corners: [[0, 0], [0, 1], [1, 1], [1, 0]], shade: 0.8 },
];

export function isSolid(id) {
  const b = BLOCKS[id];
  return !!b && b.solid;
}

export function isOpaque(id) {
  const b = BLOCKS[id];
  return !!b && b.opaque;
}

export function cullsFace(id) {
  const b = BLOCKS[id];
  return !!b && b.culls;
}

export function aoOccludes(id) {
  const b = BLOCKS[id];
  return !!b && b.aoOccludes;
}
