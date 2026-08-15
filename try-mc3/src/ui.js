// UI：开始/暂停覆盖层、准星、快捷栏（canvas 图标）、方块名提示、调试面板、Toast。
import { BLOCKS } from './blocks.js';
import { TILES, atlasCanvas } from './textures.js';

export const HOTBAR_BLOCKS = ['grass', 'dirt', 'stone', 'cobblestone', 'planks', 'log', 'leaves', 'glass', 'brick'];

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(opts) {
    this.selected = 0;
    this.slots = [];
    this._nameTimer = null;
    this._toastTimer = null;
    this.el = {
      start: $('start'),
      pause: $('pause'),
      hotbar: $('hotbar'),
      crosshair: $('crosshair'),
      blockname: $('blockname'),
      debug: $('debug'),
      toast: $('toast'),
    };
    $('btn-start').addEventListener('click', opts.onStart);
    $('btn-resume').addEventListener('click', opts.onStart);
    $('btn-new').addEventListener('click', opts.onNewWorld);
    this.buildHotbar();
    this.setSelected(0);
  }

  buildHotbar() {
    this.el.hotbar.innerHTML = '';
    HOTBAR_BLOCKS.forEach((name, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const c = document.createElement('canvas');
      c.width = 44;
      c.height = 44;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      const block = BLOCKS[name];
      const ti = TILES[block.all || block.side || block.top];
      g.drawImage(atlasCanvas, ti * 16, 0, 16, 16, 0, 0, 44, 44);
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = i + 1;
      slot.append(c, num);
      slot.addEventListener('click', () => this.setSelected(i));
      this.el.hotbar.append(slot);
    });
    this.slots = [...this.el.hotbar.children];
  }

  setSelected(i) {
    this.selected = ((i % HOTBAR_BLOCKS.length) + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length;
    this.slots.forEach((s, k) => s.classList.toggle('selected', k === this.selected));
    const name = BLOCKS[HOTBAR_BLOCKS[this.selected]].name;
    this.el.blockname.textContent = name;
    this.el.blockname.style.opacity = 1;
    clearTimeout(this._nameTimer);
    this._nameTimer = setTimeout(() => { this.el.blockname.style.opacity = 0; }, 1600);
  }

  startPlay() {
    this.el.start.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.hotbar.classList.remove('hidden');
    this.el.crosshair.classList.remove('hidden');
    document.body.classList.add('playing');
  }

  showPause() {
    this.el.pause.classList.remove('hidden');
    this.el.hotbar.classList.add('hidden');
    this.el.crosshair.classList.add('hidden');
    document.body.classList.remove('playing');
  }

  showStart() {
    this.el.start.classList.remove('hidden');
    this.el.pause.classList.add('hidden');
    this.el.hotbar.classList.add('hidden');
    this.el.crosshair.classList.add('hidden');
    document.body.classList.remove('playing');
  }

  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.style.opacity = 1;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this.el.toast.style.opacity = 0; }, 1800);
  }

  setDebug(txt) {
    this.el.debug.textContent = txt;
  }

  debugVisible(v) {
    this.el.debug.classList.toggle('hidden', !v);
  }
}
