/* 可播种的确定性噪声：2D/3D 值噪声 + fBm */
(function () {
  'use strict';

  function MCNoise(seed) {
    this.seed = seed >>> 0;
  }

  function imul(a, b) {
    return Math.imul(a, b) >>> 0;
  }

  function hash2(x, y, seed) {
    let h = seed ^ imul(x, 374761393) ^ imul(y, 668265263);
    h = imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function hash3(x, y, z, seed) {
    let h = seed ^ imul(x, 374761393) ^ imul(y, 668265263) ^ imul(z, 2246822519);
    h = imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function smooth(t) { return t * t * (3 - 2 * t); }

  function lerp(a, b, t) { return a + (b - a) * t; }

  MCNoise.prototype.rand01 = function (x, y) {
    return hash2(x, y, this.seed) / 4294967296;
  };

  MCNoise.prototype.noise2 = function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smooth(xf), v = smooth(yf);
    const n00 = hash2(xi, yi, this.seed) / 4294967296;
    const n10 = hash2(xi + 1, yi, this.seed) / 4294967296;
    const n01 = hash2(xi, yi + 1, this.seed) / 4294967296;
    const n11 = hash2(xi + 1, yi + 1, this.seed) / 4294967296;
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
  };

  MCNoise.prototype.noise3 = function (x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = smooth(xf), v = smooth(yf), w = smooth(zf);
    let n000 = hash3(xi, yi, zi, this.seed) / 4294967296;
    let n100 = hash3(xi + 1, yi, zi, this.seed) / 4294967296;
    let n010 = hash3(xi, yi + 1, zi, this.seed) / 4294967296;
    let n110 = hash3(xi + 1, yi + 1, zi, this.seed) / 4294967296;
    let n001 = hash3(xi, yi, zi + 1, this.seed) / 4294967296;
    let n101 = hash3(xi + 1, yi, zi + 1, this.seed) / 4294967296;
    let n011 = hash3(xi, yi + 1, zi + 1, this.seed) / 4294967296;
    let n111 = hash3(xi + 1, yi + 1, zi + 1, this.seed) / 4294967296;
    const x00 = lerp(n000, n100, u), x10 = lerp(n010, n110, u);
    const x01 = lerp(n001, n101, u), x11 = lerp(n011, n111, u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
  };

  MCNoise.prototype.fbm2 = function (x, y, octaves) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise2(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };

  window.MCNoise = MCNoise;
})();
