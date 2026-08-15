'use strict';
/* WebCraft · 程序化音效（WebAudio 合成，无外部资源） */
(function () {
  class Sfx {
    constructor() {
      this.ctx = null;
      this.noiseBuf = null;
      this.muted = false;
      this.lastStep = 0;
    }

    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        const len = Math.floor(this.ctx.sampleRate * 0.3);
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }

    noise(duration, filterType, freq, gain, decay) {
      if (!this.ensure()) return;
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);
      src.connect(f); f.connect(g); g.connect(ctx.destination);
      src.start(t);
      src.stop(t + duration + 0.02);
    }

    tone(type, from, to, duration, gain) {
      if (!this.ensure()) return;
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = type;
      const t = ctx.currentTime;
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);
      o.connect(g); g.connect(ctx.destination);
      o.start(t);
      o.stop(t + duration + 0.02);
    }

    breakBlock(block) {
      if (this.muted) return;
      const f = 280 + (block * 37) % 360;
      this.noise(0.14, 'bandpass', f, 0.28, 0.14);
    }

    placeBlock(block) {
      if (this.muted) return;
      const f = 170 + (block * 29) % 120;
      this.tone('triangle', f, f * 0.55, 0.12, 0.22);
      this.noise(0.06, 'lowpass', 600, 0.12, 0.06);
    }

    step() {
      if (this.muted) return;
      const now = performance.now();
      if (now - this.lastStep < 380) return;
      this.lastStep = now;
      this.noise(0.07, 'lowpass', 420, 0.045, 0.07);
    }

    splash() {
      if (this.muted) return;
      this.noise(0.28, 'lowpass', 900, 0.18, 0.28);
    }

    jump() {
      if (this.muted) return;
      this.tone('sine', 210, 340, 0.08, 0.05);
    }
  }

  window.SFX = new Sfx();
})();
