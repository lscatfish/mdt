// WebAudio 合成音效：破坏、放置、切换、落地（无需外部资源）
let ac = null;

function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}

function noiseBurst(duration = 0.13, volume = 0.3, cutoff = 1000) {
  const a = ctx();
  if (!a) return;
  try {
    const frames = Math.floor(a.sampleRate * duration);
    const buf = a.createBuffer(1, frames, a.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = a.createBufferSource();
    src.buffer = buf;
    const filter = a.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = a.createGain();
    gain.gain.setValueAtTime(volume, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + duration);
    src.connect(filter).connect(gain).connect(a.destination);
    src.start();
  } catch { /* 忽略音频错误 */ }
}

function tone(f0, f1, duration = 0.1, volume = 0.18, type = 'square') {
  const a = ctx();
  if (!a) return;
  try {
    const osc = a.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, a.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), a.currentTime + duration);
    const gain = a.createGain();
    gain.gain.setValueAtTime(volume, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + duration);
    osc.connect(gain).connect(a.destination);
    osc.start();
    osc.stop(a.currentTime + duration + 0.02);
  } catch { /* 忽略音频错误 */ }
}

export const sfx = {
  unlock() { ctx(); },
  break() {
    noiseBurst(0.13, 0.3, 1100);
    tone(180, 60, 0.12, 0.22, 'square');
  },
  place() {
    tone(330, 190, 0.09, 0.2, 'square');
    noiseBurst(0.05, 0.1, 2500);
  },
  select() {
    tone(640, 640, 0.04, 0.07, 'square');
  },
  land() {
    tone(90, 45, 0.15, 0.3, 'sine');
    noiseBurst(0.08, 0.14, 300);
  },
  pop() {
    tone(480, 920, 0.1, 0.12, 'sine');
  }
};
