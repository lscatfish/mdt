/* 确定性噪声工具：种子随机数 + 2D/3D 柏林噪声 */
(function (global) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 整数坐标 -> 稳定的 [0,1) 哈希 */
  function hash2(x, z, seed) {
    let h = seed ^ Math.imul(x, 0x27d4eb2f) ^ Math.imul(z, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  class Perlin {
    constructor(seed) {
      this.seed = seed | 0;
      this.perm = new Uint8Array(512);
      const p = new Uint8Array(256);
      const rand = mulberry32(this.seed);
      for (let i = 0; i < 256; i++) p[i] = i;
      for (let i = 255; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
      }
      for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }

    grad(hash, x, y) {
      switch (hash & 7) {
        case 0: return x + y;
        case 1: return x - y;
        case 2: return -x + y;
        case 3: return -x - y;
        case 4: return x;
        case 5: return -x;
        case 6: return y;
        default: return -y;
      }
    }

    grad3(hash, x, y, z) {
      const h = hash & 15;
      const u = h < 8 ? x : y;
      const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
      return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    noise2(x, y) {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      x -= Math.floor(x);
      y -= Math.floor(y);
      const u = fade(x), v = fade(y);
      const p = this.perm;
      const aa = p[p[X] + Y], ab = p[p[X] + Y + 1];
      const ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
      return lerp(
        lerp(this.grad(aa, x, y), this.grad(ba, x - 1, y), u),
        lerp(this.grad(ab, x, y - 1), this.grad(bb, x - 1, y - 1), u),
        v
      );
    }

    noise3(x, y, z) {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      const Z = Math.floor(z) & 255;
      x -= Math.floor(x);
      y -= Math.floor(y);
      z -= Math.floor(z);
      const u = fade(x), v = fade(y), w = fade(z);
      const p = this.perm;
      const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
      const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
      return lerp(
        lerp(
          lerp(this.grad3(p[AA], x, y, z), this.grad3(p[BA], x - 1, y, z), u),
          lerp(this.grad3(p[AB], x, y - 1, z), this.grad3(p[BB], x - 1, y - 1, z), u),
          v
        ),
        lerp(
          lerp(this.grad3(p[AA + 1], x, y, z - 1), this.grad3(p[BA + 1], x - 1, y, z - 1), u),
          lerp(this.grad3(p[AB + 1], x, y - 1, z - 1), this.grad3(p[BB + 1], x - 1, y - 1, z - 1), u),
          v
        ),
        w
      );
    }

    fbm2(x, y, octaves, lacunarity, gain) {
      lacunarity = lacunarity == null ? 2 : lacunarity;
      gain = gain == null ? 0.5 : gain;
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += amp * this.noise2(x * freq, y * freq);
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
      }
      return sum / norm;
    }

    fbm3(x, y, z, octaves, lacunarity, gain) {
      lacunarity = lacunarity == null ? 2 : lacunarity;
      gain = gain == null ? 0.5 : gain;
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += amp * this.noise3(x * freq, y * freq, z * freq);
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
      }
      return sum / norm;
    }
  }

  global.NoiseUtil = {
    mulberry32: mulberry32,
    hash2: hash2,
    Perlin: Perlin
  };
})(window);
