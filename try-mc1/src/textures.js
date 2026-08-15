// 程序化生成 16x16 像素、4x4 tile 的纹理图集（经典 Minecraft 风格）
import * as THREE from 'three';

export const TILE_PX = 16;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 4;
export const ATLAS_PX = TILE_PX * ATLAS_COLS; // 64

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_PX;
  canvas.height = ATLAS_PX;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(ATLAS_PX, ATLAS_PX);
  const data = img.data;

  const put = (x, y, c, a = 255) => {
    const i = (y * ATLAS_PX + x) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = a;
  };

  // 在 tile 内用调色板 + 抖动绘制噪声纹理
  const noiseTile = (tile, palette, jitter = 20, seed = tile + 7) => {
    const rng = mulberry32(seed * 7919 + 17);
    const ox = (tile % ATLAS_COLS) * TILE_PX;
    const oy = ((tile / ATLAS_COLS) | 0) * TILE_PX;
    for (let py = 0; py < TILE_PX; py++) {
      for (let px = 0; px < TILE_PX; px++) {
        const c = palette[(rng() * palette.length) | 0];
        const v = (rng() - 0.5) * jitter;
        put(ox + px, oy + py, [
          Math.max(0, Math.min(255, c[0] + v)),
          Math.max(0, Math.min(255, c[1] + v)),
          Math.max(0, Math.min(255, c[2] + v))
        ]);
      }
    }
    return { ox, oy, rng };
  };

  // ---- 0 草方块顶部 ----
  noiseTile(0, [[91, 155, 51], [106, 168, 62], [78, 140, 46], [121, 184, 70]], 24);

  // ---- 1 草方块侧面（上绿下土 + 绿色垂滴） ----
  {
    const { ox, oy, rng } = noiseTile(1, [[134, 96, 67], [111, 78, 52], [151, 108, 76]], 24, 3);
    const greens = [[91, 155, 51], [106, 168, 62], [78, 140, 46], [121, 184, 70]];
    for (let py = 0; py < 4; py++) {
      for (let px = 0; px < TILE_PX; px++) {
        const c = greens[(rng() * greens.length) | 0];
        const v = (rng() - 0.5) * 22;
        put(ox + px, oy + py, [c[0] + v, c[1] + v, c[2] + v]);
      }
    }
    for (let py = 4; py < 9; py++) {
      for (let px = 0; px < TILE_PX; px++) {
        if (rng() < 0.05) {
          const c = greens[(rng() * greens.length) | 0];
          put(ox + px, oy + py, c);
        }
      }
    }
  }

  // ---- 2 泥土 ----
  noiseTile(2, [[134, 96, 67], [111, 78, 52], [151, 108, 76], [121, 84, 59]], 26);

  // ---- 3 石头 ----
  noiseTile(3, [[127, 127, 127], [139, 139, 139], [116, 116, 116], [147, 147, 147]], 22);

  // ---- 4 沙子 ----
  noiseTile(4, [[219, 207, 163], [229, 218, 176], [206, 194, 150], [238, 227, 186]], 14);

  // ---- 5 水 ----
  {
    const { ox, oy, rng } = noiseTile(5, [[47, 91, 190], [40, 79, 176], [58, 103, 202], [45, 86, 183]], 12);
    for (let py = 0; py < TILE_PX; py++) {
      for (let px = 0; px < TILE_PX; px++) {
        if (py % 4 === 0 && rng() < 0.55) put(ox + px, oy + py, [36, 70, 158]);
      }
    }
  }

  // ---- 6 原木顶部（年轮） ----
  {
    const { ox, oy, rng } = noiseTile(6, [[142, 104, 58], [152, 114, 66], [130, 94, 50]], 14);
    for (let py = 0; py < TILE_PX; py++) {
      for (let px = 0; px < TILE_PX; px++) {
        const d = Math.sqrt((px - 7.5) ** 2 + (py - 7.5) ** 2);
        if (((d | 0) % 3) === 0) put(ox + px, oy + py, [104, 74, 40]);
        void rng;
      }
    }
  }

  // ---- 7 原木侧面（纵向树皮纹） ----
  {
    const { ox, oy, rng } = noiseTile(7, [[132, 96, 52], [144, 106, 60]], 10);
    for (let px = 0; px < TILE_PX; px++) {
      const dark = px % 4 === 0;
      for (let py = 0; py < TILE_PX; py++) {
        if (dark) put(ox + px, oy + py, [92, 66, 36]);
        void rng;
      }
    }
  }

  // ---- 8 树叶（带透明孔洞，alphaTest 实现镂空） ----
  {
    const { ox, oy, rng } = noiseTile(8, [[64, 110, 35], [74, 126, 44], [52, 96, 30], [88, 140, 52]], 22);
    for (let py = 0; py < TILE_PX; py++) {
      for (let px = 0; px < TILE_PX; px++) {
        if (rng() < 0.15) put(ox + px, oy + py, [0, 0, 0], 0);
      }
    }
  }

  // ---- 9 木板 ----
  {
    const { ox, oy, rng } = noiseTile(9, [[166, 132, 80], [177, 142, 88], [155, 122, 72]], 14);
    for (let py = 0; py < TILE_PX; py++) {
      for (let px = 0; px < TILE_PX; px++) {
        if (py % 4 === 0) put(ox + px, oy + py, [108, 80, 45]);
        void rng;
      }
    }
  }

  // ---- 10 圆石 ----
  {
    const { ox, oy, rng } = noiseTile(10, [[127, 127, 127], [139, 139, 139], [116, 116, 116], [147, 147, 147]], 20);
    for (let py = 0; py < TILE_PX; py++) {
      for (let px = 0; px < TILE_PX; px++) {
        if (rng() < 0.18) put(ox + px, oy + py, [92, 92, 92]);
      }
    }
  }

  // ---- 11 玻璃（边框 + 对角线高光，内部透明） ----
  {
    const ox = (11 % ATLAS_COLS) * TILE_PX;
    const oy = ((11 / ATLAS_COLS) | 0) * TILE_PX;
    for (let py = 0; py < TILE_PX; py++) {
      for (let px = 0; px < TILE_PX; px++) {
        if (px === 0 || px === 15 || py === 0 || py === 15) put(ox + px, oy + py, [199, 228, 238], 235);
        else if (px === py || px + py === 15) put(ox + px, oy + py, [235, 245, 250], 130);
        else put(ox + px, oy + py, [0, 0, 0], 0);
      }
    }
  }

  // ---- 12 红砖 ----
  {
    const { ox, oy, rng } = noiseTile(12, [[152, 76, 58], [160, 82, 62], [144, 70, 54]], 16);
    for (let py = 0; py < TILE_PX; py++) {
      const offset = (py % 4) < 2 ? 0 : 4;
      for (let px = 0; px < TILE_PX; px++) {
        if (py % 4 === 0 || (px + offset) % 8 === 0) put(ox + px, oy + py, [190, 178, 168]);
        void rng;
      }
    }
  }

  // ---- 13 雪 ----
  noiseTile(13, [[240, 242, 245], [232, 235, 239], [247, 249, 251]], 8);

  // ---- 14 基岩 ----
  noiseTile(14, [[62, 62, 62], [78, 78, 78], [46, 46, 46], [92, 92, 92]], 26);

  // ---- 15 备用（未使用） ----
  noiseTile(15, [[180, 80, 200], [150, 60, 170]], 20);

  ctx.putImageData(img, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  return { texture, canvas };
}

// tile 在 64px 图集中的 UV 范围（半像素内缩防止边缘渗色）
export function tileUV(tile) {
  const col = tile % ATLAS_COLS;
  const row = (tile / ATLAS_COLS) | 0;
  const inset = 0.5 / ATLAS_PX;
  const u0 = col / ATLAS_COLS + inset;
  const u1 = (col + 1) / ATLAS_COLS - inset;
  const v0 = 1 - (row + 1) / ATLAS_ROWS + inset;
  const v1 = 1 - row / ATLAS_ROWS - inset;
  return [u0, v0, u1, v1];
}
