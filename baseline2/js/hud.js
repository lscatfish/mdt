'use strict';
/* WebCraft · HUD：快捷栏 / 调试面板 / Toast */
(function () {
  let toastTimer = 0;
  let activeSlot = 0;

  const els = {
    hotbar: document.getElementById('hotbar'),
    crosshair: document.getElementById('crosshair'),
    debug: document.getElementById('debug-panel'),
    toast: document.getElementById('toast'),
    start: document.getElementById('start-screen'),
    pauseHint: document.getElementById('pause-hint'),
    seedInput: document.getElementById('seed-input')
  };

  function init(atlas, items) {
    els.hotbar.innerHTML = '';
    items.forEach((item, i) => {
      const tile = Blocks.iconTile(item.id);
      const col = tile % atlas.cols, row = Math.floor(tile / atlas.cols);
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === activeSlot ? ' active' : '');
      slot.title = item.label;
      slot.style.backgroundImage = 'url(' + atlas.dataURL + ')';
      slot.style.backgroundSize = (atlas.canvas.width * 3) + 'px ' + (atlas.canvas.height * 3) + 'px';
      slot.style.backgroundPosition = (-col * 48) + 'px ' + (-row * 48) + 'px';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = item.label;
      slot.appendChild(label);
      els.hotbar.appendChild(slot);
    });
  }

  function setSlot(i) {
    activeSlot = i;
    const slots = els.hotbar.children;
    for (let s = 0; s < slots.length; s++) {
      slots[s].classList.toggle('active', s === i);
    }
  }

  function toast(msg, duration) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    toastTimer = duration || 1.6;
  }

  function updateToast(dt) {
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) els.toast.classList.remove('show');
    }
  }

  function setDebugVisible(v) { els.debug.classList.toggle('hidden', !v); }
  function setDebugText(text) { els.debug.textContent = text; }
  function hideStart() { els.start.classList.add('hidden'); }
  function showStart() { els.start.classList.remove('hidden'); }
  function setPauseHint(v) { els.pauseHint.classList.toggle('hidden', !v); }
  function setCrosshair(v) { els.crosshair.classList.toggle('hidden', !v); }

  function randomSeedString() {
    return Math.floor(Math.random() * 0x7fffffff).toString(36);
  }

  window.HUD = {
    init, setSlot, toast, updateToast,
    setDebugVisible, setDebugText, hideStart, showStart,
    setPauseHint, setCrosshair, randomSeedString,
    els
  };
})();
