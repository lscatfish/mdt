import { BLOCKS, tileFor, blockName } from "./blocks.js";

export class UI {
  constructor(atlas) {
    this.atlas = atlas;
    this.el = {
      hud: document.getElementById("hud"),
      loading: document.getElementById("loading"),
      loadProgress: document.getElementById("load-progress"),
      start: document.getElementById("start-screen"),
      pause: document.getElementById("pause-screen"),
      btnStart: document.getElementById("btn-start"),
      btnResume: document.getElementById("btn-resume"),
      btnNewWorld: document.getElementById("btn-new-world"),
      btnSound: document.getElementById("btn-sound"),
      debug: document.getElementById("debug"),
      hearts: document.getElementById("hearts"),
      toasts: document.getElementById("toasts"),
      slotName: document.getElementById("slot-name"),
      saveToast: document.getElementById("save-toast"),
      breakProgress: document.getElementById("break-progress"),
      breakFill: document.getElementById("break-fill"),
    };
    this.slots = [...document.querySelectorAll(".slot")];
    this.slotIcons = new Map();

    for (const [id, def] of Object.entries(BLOCKS)) {
      const tile = tileFor(Number(id), "side");
      this.slotIcons.set(Number(id), atlas.iconDataURL(tile));
    }
  }

  setLoading(percent, text = "") {
    this.el.loadProgress.textContent = text
      ? `${text} ${Math.round(percent * 100)}%`
      : `正在生成世界… ${Math.round(percent * 100)}%`;
  }

  showMenu() {
    this.el.loading.classList.add("hidden");
    this.el.start.classList.remove("hidden");
    this.el.pause.classList.add("hidden");
    this.el.hud.classList.add("hidden");
  }

  showPause() {
    this.el.pause.classList.remove("hidden");
    this.el.start.classList.add("hidden");
  }

  hidePause() {
    this.el.pause.classList.add("hidden");
  }

  showHud() {
    this.el.start.classList.add("hidden");
    this.el.pause.classList.add("hidden");
    this.el.hud.classList.remove("hidden");
  }

  setHotbar(hotbar, counts, selected, creative) {
    this.slots.forEach((slot, i) => {
      const id = hotbar[i];
      slot.classList.toggle("selected", i === selected);
      const icon = slot.querySelector(".slot-icon");
      icon.style.backgroundImage = `url(${this.slotIcons.get(id)})`;
      const count = slot.querySelector(".slot-count");
      if (id === 0) {
        count.textContent = "";
        slot.style.filter = "";
      } else if (creative) {
        count.textContent = "∞";
        slot.style.filter = "";
      } else {
        count.textContent = counts[id] > 0 ? String(counts[id]) : "";
        slot.style.filter = counts[id] > 0 ? "" : "grayscale(1) brightness(0.6)";
      }
    });
  }

  flashSlotName(name) {
    this.el.slotName.textContent = name;
    this.el.slotName.classList.add("show");
    clearTimeout(this._slotTimer);
    this._slotTimer = setTimeout(() => this.el.slotName.classList.remove("show"), 1400);
  }

  updateHealth(health) {
    let html = "";
    for (let i = 0; i < 10; i++) {
      const need = i * 2 + 1;
      if (health >= need + 1) html += '<span class="heart">♥</span>';
      else if (health === need) html += '<span class="heart" style="opacity:.45">♥</span>';
      else html += '<span class="heart empty">♥</span>';
    }
    this.el.hearts.innerHTML = html;
  }

  setBreakProgress(frac) {
    if (frac === null || frac <= 0) {
      this.el.breakProgress.classList.add("hidden");
      return;
    }
    this.el.breakProgress.classList.remove("hidden");
    this.el.breakFill.style.width = `${Math.round(frac * 100)}%`;
  }

  setDebug(text) {
    this.el.debug.classList.remove("hidden");
    this.el.debug.textContent = text;
  }

  hideDebug() {
    this.el.debug.classList.add("hidden");
  }

  toast(msg, ms = 2200) {
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = msg;
    this.el.toasts.appendChild(node);
    setTimeout(() => node.remove(), ms);
  }

  showSaveToast() {
    this.el.saveToast.classList.remove("hidden");
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.el.saveToast.classList.add("hidden"), 1600);
  }

  setSoundLabel(enabled) {
    this.el.btnSound.textContent = enabled ? "声音: 开" : "声音: 关";
  }
}
