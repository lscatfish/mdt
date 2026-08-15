// 用 WebAudio 现场合成的简单音效,零外部资源。
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.noiseBuffer = null;
  }

  ensure() {
    if (!this.enabled) return null;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  getNoise(ctx) {
    if (!this.noiseBuffer) {
      const len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer;
  }

  noiseBurst(duration, freq, gain, type = "lowpass") {
    const ctx = this.ensure();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + duration);
  }

  tone(freqStart, freqEnd, duration, gain, type = "triangle") {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }

  breakBlock() {
    this.noiseBurst(0.12, 650, 0.5);
    this.tone(150, 70, 0.09, 0.3, "square");
  }

  place() {
    this.tone(190, 120, 0.07, 0.4, "square");
    this.noiseBurst(0.05, 1200, 0.25);
  }

  step() {
    this.noiseBurst(0.045, 500, 0.07);
  }

  splash() {
    this.noiseBurst(0.22, 950, 0.25);
  }

  hurt() {
    this.tone(240, 75, 0.22, 0.4, "sawtooth");
  }

  respawn() {
    this.tone(160, 320, 0.3, 0.25, "sine");
  }
}
