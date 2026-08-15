/* ============================================================
 * audio.js — 用 WebAudio 程序化合成简易音效
 * ============================================================ */
(function (global) {
  'use strict';

  class MCAudio {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.noiseBuf = null;
    }

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        // 预生成 0.5s 白噪声
        const len = this.ctx.sampleRate | 0;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) {
        this.ctx = null;
      }
    }

    toggleMute() {
      this.muted = !this.muted;
      return this.muted;
    }

    noise(duration, filterFreq, gain, type) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter();
      f.type = type || 'lowpass';
      f.frequency.value = filterFreq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);
      src.connect(f); f.connect(g); g.connect(this.ctx.destination);
      src.start(t, Math.random() * 0.3, duration + 0.05);
    }

    tone(freq, duration, gain, type, slideTo) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t);
      o.stop(t + duration + 0.02);
    }

    breakBlock(id) {
      this.ensure();
      const soft = (id === 7 || id === 8 || id === 17); // 树叶/沙子/沙砾
      if (soft) this.noise(0.14, 900, 0.25);
      else {
        this.noise(0.18, 1400 - Math.min(id * 30, 600), 0.35);
        this.tone(180, 0.08, 0.06, 'triangle', 90);
      }
    }

    placeBlock() {
      this.ensure();
      this.tone(320, 0.09, 0.18, 'triangle', 180);
      this.noise(0.08, 2000, 0.12, 'highpass');
    }

    step() {
      if (!this.ctx || this.muted) return;
      this.noise(0.06, 500, 0.05);
    }

    splash() {
      if (!this.ctx || this.muted) return;
      this.noise(0.25, 1200, 0.2);
    }
  }

  global.MCAudio = MCAudio;
})(window);
