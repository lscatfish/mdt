// WebAudio 合成音效：挖掘（带通噪声）、放置（低频闷响 + 短噪声）。
let ctx = null;
let master = null;
let muted = false;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.3;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.3;
}

export function isMuted() {
  return muted;
}

function noiseBuffer(dur) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function playBreak() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.16);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 650 + Math.random() * 500;
  f.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.01, t + 0.16);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
}

export function playPlace() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;

  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.08);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.01, t + 0.09);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + 0.1);

  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(0.04);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1200;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.25, t);
  g2.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
  n.connect(lp);
  lp.connect(g2);
  g2.connect(master);
  n.start(t);
}
