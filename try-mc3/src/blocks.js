// 方块注册表：每种方块一个定义。
// face 约定（与 chunkmesh.js 的 FACES 顺序一致）: 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
//
// 关键属性：
//   solid       是否参与碰撞（空气/水为 false）
//   opaque      是否完全不透光 —— 用于面剔除与 AO（玻璃/树叶/水为 false）
//   transparent 是否走半透明渲染通道（树叶/玻璃/水为 true）
//   liquid      液体（不可被射线选中、不可碰撞）
//   hardness    徒手挖掘耗时（毫秒），Infinity = 不可破坏
//   top/side/bottom/all  各面的纹理名（缺省 all 时取 top/bottom/side）

const B = (id, name, props) => ({
  id, name, hardness: 600, opaque: true, solid: true, ...props,
});

export const BLOCKS = {
  air:         { id: 0, name: '空气', opaque: false, solid: false, hardness: 0 },
  grass:       B(1, '草方块', { hardness: 450, top: 'grass_top', bottom: 'dirt', side: 'grass_side' }),
  dirt:        B(2, '泥土', { hardness: 400, all: 'dirt' }),
  stone:       B(3, '石头', { hardness: 1100, all: 'stone' }),
  cobblestone: B(4, '圆石', { hardness: 1200, all: 'cobblestone' }),
  sand:        B(5, '沙子', { hardness: 350, all: 'sand' }),
  log:         B(6, '原木', { hardness: 850, top: 'log_top', bottom: 'log_top', side: 'log_side' }),
  leaves:      B(7, '树叶', { hardness: 200, all: 'leaves', opaque: false, transparent: true }),
  planks:      B(8, '木板', { hardness: 750, all: 'planks' }),
  glass:       B(9, '玻璃', { hardness: 300, all: 'glass', opaque: false, transparent: true }),
  water:       { id: 10, name: '水', liquid: true, opaque: false, solid: false, transparent: true, hardness: 0, all: 'water', tint: [0.72, 0.84, 1.0] },
  brick:       B(11, '砖块', { hardness: 1300, all: 'brick' }),
  coal_ore:    B(12, '煤矿石', { hardness: 1100, all: 'coal_ore' }),
  iron_ore:    B(13, '铁矿石', { hardness: 1400, all: 'iron_ore' }),
  bedrock:     { id: 14, name: '基岩', opaque: true, solid: true, hardness: Infinity, all: 'bedrock' },
};

export const BY_ID = Object.values(BLOCKS).sort((a, b) => a.id - b.id);

export const IDs = {};
for (const [name, block] of Object.entries(BLOCKS)) IDs[name.toUpperCase()] = block.id;

export function isOpaque(id) {
  const b = BY_ID[id];
  return !!b && b.opaque;
}

// 返回某个面对应的纹理名
export function textureName(block, face) {
  if (block.all) return block.all;
  if (face === 2) return block.top;
  if (face === 3) return block.bottom;
  return block.side;
}
