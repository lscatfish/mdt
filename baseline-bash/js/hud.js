// HUD：开始/暂停界面、准星、快捷栏、调试信息与提示
import { BLOCK_DEFS, HOTBAR } from './config.js';

export class Hud {
  constructor() {
    this.startOverlay = document.getElementById('start-overlay');
    this.pauseOverlay = document.getElementById('pause-overlay');
    this.hud = document.getElementById('hud');
    this.hotbarEl = document.getElementById('hotbar');
    this.blockNameEl = document.getElementById('block-name');
    this.debugEl = document.getElementById('debug');
    this.toastEl = document.getElementById('toast');

    this.slots = [];
    this.buildHotbar();
  }

  buildHotbar() {
    this.hotbarEl.innerHTML = '';
    HOTBAR.forEach((id, i) => {
      const def = BLOCK_DEFS[id];
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.name = def.name;
      const color = def.particleColor || [1, 1, 1];
      const css = `rgb(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)})`;
      slot.innerHTML = `
        <div class="icon" style="background:
          linear-gradient(135deg, ${css} 0%, ${css} 45%, rgba(0,0,0,.35) 45%, rgba(0,0,0,.35) 55%, ${css} 55%)"></div>
        <div class="key">${i + 1}</div>`;
      this.hotbarEl.appendChild(slot);
      this.slots.push(slot);
    });
  }

  setSelected(index) {
    this.slots.forEach((s, i) => s.classList.toggle('selected', i === index));
    const id = HOTBAR[index];
    if (id) this.blockNameEl.textContent = BLOCK_DEFS[id].name;
  }

  showStart() {
    this.startOverlay.classList.remove('hidden');
    this.pauseOverlay.classList.add('hidden');
    this.hud.classList.add('hidden');
  }

  showPause() {
    this.startOverlay.classList.add('hidden');
    this.pauseOverlay.classList.remove('hidden');
    this.hud.classList.add('hidden');
  }

  showPlaying() {
    this.startOverlay.classList.add('hidden');
    this.pauseOverlay.classList.add('hidden');
    this.hud.classList.remove('hidden');
  }

  updateDebug(fps, x, y, z, chunks, pending) {
    this.debugEl.textContent = `FPS ${fps}   XYZ ${x.toFixed(1)} / ${y.toFixed(1)} / ${z.toFixed(1)}   区块 ${chunks} (待构建 ${pending})`;
  }

  toast(text, ms = 1600) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }
}
