// 确定性的种子噪声：2D / 3D 值噪声 + 分形叠加(FBM)
// 同一 seed 永远生成相同地形，且与计算顺序无关。

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

export class Noise {
  constructor(seed = 1) {
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;

    // xorshift32 洗牌
    let s = (seed >>> 0) || 0x9e3779b9;
    const rnd = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }

    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = perm[i & 255];
  }

  /** 0..1 的散列值（用于树木等随机决策） */
  hash01(x, y, z = 0) {
    const p = this.perm;
    return p[p[p[(x & 255)] ^ (y & 255)] ^ (z & 255)] / 255;
  }

  /** 2D 值噪声，返回 -1..1 */
  noise2(x, z) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const fx = x - x0;
    const fz = z - z0;
    const u = fade(fx);
    const v = fade(fz);
    const p = this.perm;

    const a = p[p[(x0 & 255)] ^ (z0 & 255)];
    const b = p[p[((x0 + 1) & 255)] ^ (z0 & 255)];
    const c = p[p[(x0 & 255)] ^ ((z0 + 1) & 255)];
    const d = p[p[((x0 + 1) & 255)] ^ ((z0 + 1) & 255)];

    return lerp(lerp(a, b, u), lerp(c, d, u), v) / 127.5 - 1;
  }

  /** 分形 2D 噪声，返回约 -1..1 */
  fbm2(x, z, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise2(x * freq, z * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** 3D 值噪声，返回 -1..1 */
  noise3(x, y, z) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const fx = x - x0;
    const fy = y - y0;
    const fz = z - z0;
    const u = fade(fx);
    const v = fade(fy);
    const w = fade(fz);
    const p = this.perm;

    const c = (xi, yi, zi) =>
      p[p[p[(xi & 255)] ^ (yi & 255)] ^ (zi & 255)];

    const n000 = c(x0, y0, z0);
    const n100 = c(x0 + 1, y0, z0);
    const n010 = c(x0, y0 + 1, z0);
    const n110 = c(x0 + 1, y0 + 1, z0);
    const n001 = c(x0, y0, z0 + 1);
    const n101 = c(x0 + 1, y0, z0 + 1);
    const n011 = c(x0, y0 + 1, z0 + 1);
    const n111 = c(x0 + 1, y0 + 1, z0 + 1);

    const x00 = lerp(n000, n100, u);
    const x10 = lerp(n010, n110, u);
    const x01 = lerp(n001, n101, u);
    const x11 = lerp(n011, n111, u);

    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) / 127.5 - 1;
  }

  /** 分形 3D 噪声，返回约 -1..1 */
  fbm3(x, y, z, octaves = 2, lacunarity = 2, gain = 0.5) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise3(x * freq, y * freq, z * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
