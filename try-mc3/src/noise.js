// 种子化确定性噪声：2D/3D 值噪声 + fBm 分形叠加。
// 全部基于整数散列，保证同一种子生成完全相同的世界。

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 整数坐标散列 -> [0, 2^32)
export function hash2i(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function hash3i(x, y, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 974634211) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lat2(x, y, seed) {
  return hash2i(x, y, seed) / 2147483647.5 - 1; // -> [-1, 1)
}

function lat3(x, y, z, seed) {
  return hash3i(x, y, z, seed) / 2147483647.5 - 1;
}

// 2D 值噪声，返回 [-1, 1]
export function noise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const a = lat2(xi, yi, seed) + (lat2(xi + 1, yi, seed) - lat2(xi, yi, seed)) * u;
  const b = lat2(xi, yi + 1, seed) + (lat2(xi + 1, yi + 1, seed) - lat2(xi, yi + 1, seed)) * u;
  return a + (b - a) * v;
}

// 3D 值噪声，返回 [-1, 1]
export function noise3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const c000 = lat3(xi, yi, zi, seed);
  const c100 = lat3(xi + 1, yi, zi, seed);
  const c010 = lat3(xi, yi + 1, zi, seed);
  const c110 = lat3(xi + 1, yi + 1, zi, seed);
  const c001 = lat3(xi, yi, zi + 1, seed);
  const c101 = lat3(xi + 1, yi, zi + 1, seed);
  const c011 = lat3(xi, yi + 1, zi + 1, seed);
  const c111 = lat3(xi + 1, yi + 1, zi + 1, seed);
  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

// 2D 分形噪声（fBm），返回 [-1, 1]
export function fbm2(x, y, seed, octaves) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
