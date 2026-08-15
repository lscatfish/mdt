// HUD 与菜单：快捷栏（图集图标）、准星、调试面板、提示、主菜单/暂停菜单
import { BLOCK_NAMES, BLOCK_DEFS, SELECTABLE } from './config.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(atlasCanvas) {
    this.el = {
      hud: $('hud'),
      menu: $('menu'),
      pause: $('pause-menu'),
      loading: $('loading'),
      loadingText: $('loading-text'),
      seedInput: $('seed-input'),
      btnNew: $('btn-new'),
      btnContinue: $('btn-continue'),
      btnResume: $('btn-resume'),
      btnSave: $('btn-save'),
      btnMenu: $('btn-menu'),
      menuNote: $('menu-note'),
      hotbar: $('hotbar'),
      debug: $('debug'),
      toast: $('toast')
    };
    this.selected = 0;
    this.debugVisible = false;
    this.toastTimer = 0;
    this.slots = [];
    this.onNew = null;
    this.onContinue = null;
    this.onResume = null;
    this.onSave = null;
    this.onMenu = null;
    this.onSelect = null;

    this.buildHotbar(atlasCanvas);

    this.el.btnNew.addEventListener('click', () => this.onNew && this.onNew(this.el.seedInput.value));
    this.el.btnContinue.addEventListener('click', () => this.onContinue && this.onContinue());
    this.el.btnResume.addEventListener('click', () => this.onResume && this.onResume());
    this.el.btnSave.addEventListener('click', () => this.onSave && this.onSave());
    this.el.btnMenu.addEventListener('click', () => this.onMenu && this.onMenu());
    this.el.seedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.el.btnNew.click(); }
    });
  }

  buildHotbar(atlasCanvas) {
    this.el.hotbar.innerHTML = '';
    this.slots = [];
    SELECTABLE.forEach((id, i) => {
      const div = document.createElement('div');
      div.className = 'slot';
      div.title = BLOCK_NAMES[id] || '';

      const cv = document.createElement('canvas');
      cv.width = 48;
      cv.height = 48;
      const c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      const tile = BLOCK_DEFS[id].tile.top;
      const sx = (tile % 4) * 16;
      const sy = ((tile / 4) | 0) * 16;
      c.drawImage(atlasCanvas, sx, sy, 16, 16, 0, 0, 48, 48);

      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = i < 9 ? String(i + 1) : i === 9 ? '0' : '·';

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = BLOCK_NAMES[id];

      div.append(cv, key, name);
      div.addEventListener('click', () => this.onSelect && this.onSelect(i));
      this.el.hotbar.appendChild(div);
      this.slots.push(div);
    });
    this.setSelected(0);
  }

  setSelected(i) {
    this.selected = i;
    this.slots.forEach((s, j) => s.classList.toggle('selected', j === i));
  }

  showGame() {
    this.el.hud.hidden = false;
    this.el.menu.hidden = true;
    this.el.pause.hidden = true;
    this.el.loading.hidden = true;
  }

  showMenu(note = '') {
    this.el.hud.hidden = true;
    this.el.menu.hidden = false;
    this.el.pause.hidden = true;
    this.el.loading.hidden = true;
    this.el.menuNote.textContent = note;
  }

  showPause() {
    this.el.pause.hidden = false;
    this.el.loading.hidden = true;
  }

  showLoading(text = '正在生成世界…') {
    this.el.loading.hidden = false;
    this.el.loadingText.textContent = text;
    this.el.menu.hidden = true;
    this.el.pause.hidden = true;
  }

  setContinueVisible(v) {
    this.el.btnContinue.hidden = !v;
  }

  toast(msg, ms = 2200) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), ms);
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.el.debug.style.display = this.debugVisible ? 'block' : 'none';
  }

  setDebug(text) {
    if (this.debugVisible) this.el.debug.textContent = text;
  }
}
