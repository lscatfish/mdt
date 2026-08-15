'use strict';
/* WebCraft · 输入控制：键鼠 + 触屏 */
(function () {
  const SENS = 0.0023;

  class Controls {
    constructor(canvas) {
      this.canvas = canvas;
      this.enabled = false;
      this.keys = new Set();
      this.lookDX = 0;
      this.lookDY = 0;
      this.state = {
        ax: 0, ay: 0, jump: false, sneak: false, sprint: false,
        breakHeld: false, placeHeld: false, slot: 0
      };
      this.onToggleFly = null;
      this.onToggleDebug = null;
      this.onSlot = null;
      this.onRespawn = null;
      this.onMute = null;
      this.onLockChange = null;

      this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      this.joyActive = false;
      this.joyAX = 0;
      this.joyAY = 0;
      this.touchJump = false;

      this._bindKeyboard();
      this._bindMouse();
      this._bindTouch();
    }

    enable() { this.enabled = true; }

    isLocked() {
      if (this.isTouch) return this.enabled;
      return document.pointerLockElement === this.canvas;
    }

    requestLock() {
      if (this.isTouch || !this.enabled) return;
      if (document.pointerLockElement === this.canvas) return;
      try {
        const p = this.canvas.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) { /* ignore */ }
    }

    poll() {
      const d = { dx: this.lookDX, dy: this.lookDY };
      this.lookDX = 0;
      this.lookDY = 0;

      if (this.joyActive) {
        this.state.ax = this.joyAX;
        this.state.ay = this.joyAY;
      } else {
        this.state.ax = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
        this.state.ay = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
      }
      this.state.jump = this.keys.has('Space') || this.touchJump;
      this.state.sneak = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      this.state.sprint = this.keys.has('ControlLeft') || this.keys.has('ControlRight');
      return d;
    }

    /* ---------------- 键盘 ---------------- */
    _bindKeyboard() {
      window.addEventListener('keydown', (e) => {
        if (!this.enabled) return;
        if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
        if (e.repeat) return;
        this.keys.add(e.code);

        if (e.code.startsWith('Digit')) {
          const n = parseInt(e.code.slice(5), 10);
          this._selectSlot(n === 0 ? 9 : n - 1);
        } else if (e.code === 'KeyF') {
          if (this.onToggleFly) this.onToggleFly();
        } else if (e.code === 'F3') {
          if (this.onToggleDebug) this.onToggleDebug();
        } else if (e.code === 'KeyR') {
          if (this.onRespawn) this.onRespawn();
        } else if (e.code === 'KeyM') {
          if (this.onMute) this.onMute();
        }
      });

      window.addEventListener('keyup', (e) => {
        this.keys.delete(e.code);
      });

      window.addEventListener('blur', () => {
        this.keys.clear();
        this.state.breakHeld = false;
        this.state.placeHeld = false;
        this.touchJump = false;
      });
    }

    _selectSlot(i) {
      if (i < 0 || i > 9) return;
      this.state.slot = i;
      if (this.onSlot) this.onSlot(i);
    }

    /* ---------------- 鼠标 ---------------- */
    _bindMouse() {
      const canvas = this.canvas;
      canvas.addEventListener('click', () => this.requestLock());

      document.addEventListener('pointerlockchange', () => {
        const locked = document.pointerLockElement === canvas;
        if (!locked) {
          this.state.breakHeld = false;
          this.state.placeHeld = false;
        }
        if (this.onLockChange) this.onLockChange(locked);
      });

      document.addEventListener('mousemove', (e) => {
        if (!this.isLocked() || this.isTouch) return;
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      });

      document.addEventListener('mousedown', (e) => {
        if (!this.isLocked()) return;
        if (e.button === 0) this.state.breakHeld = true;
        if (e.button === 2) this.state.placeHeld = true;
      });

      document.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.state.breakHeld = false;
        if (e.button === 2) this.state.placeHeld = false;
      });

      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      window.addEventListener('wheel', (e) => {
        if (!this.enabled) return;
        const dir = e.deltaY > 0 ? 1 : -1;
        this._selectSlot((this.state.slot + dir + 10) % 10);
      }, { passive: true });
    }

    /* ---------------- 触屏 ---------------- */
    _bindTouch() {
      const ui = document.getElementById('touch-ui');
      if (!this.isTouch) { ui.classList.add('hidden'); return; }
      ui.classList.remove('hidden');

      const zone = document.getElementById('joy-zone');
      const base = document.getElementById('joy-base');
      const knob = document.getElementById('joy-knob');
      const look = document.getElementById('touch-look');
      const R = 46;

      zone.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.joyActive = true;
        const rect = base.getBoundingClientRect();
        this.joyCX = rect.left + rect.width / 2;
        this.joyCY = rect.top + rect.height / 2;
        this._updateJoy(e.clientX, e.clientY, knob);
      });

      window.addEventListener('pointermove', (e) => {
        if (this.joyActive) this._updateJoy(e.clientX, e.clientY, knob);
      });

      const endJoy = () => {
        this.joyActive = false;
        this.joyAX = 0;
        this.joyAY = 0;
        knob.style.transform = 'translate(0px, 0px)';
      };
      window.addEventListener('pointerup', endJoy);
      window.addEventListener('pointercancel', endJoy);

      let lookX = 0, lookY = 0, looking = false;
      look.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        looking = true;
        lookX = e.clientX;
        lookY = e.clientY;
      });
      window.addEventListener('pointermove', (e) => {
        if (!looking) return;
        this.lookDX += e.clientX - lookX;
        this.lookDY += e.clientY - lookY;
        lookX = e.clientX;
        lookY = e.clientY;
      });
      const endLook = () => { looking = false; };
      window.addEventListener('pointerup', endLook);
      window.addEventListener('pointercancel', endLook);

      const bindBtn = (id, downFn, upFn) => {
        const el = document.getElementById(id);
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); downFn(); });
        el.addEventListener('pointerup', (e) => { e.preventDefault(); if (upFn) upFn(); });
        el.addEventListener('pointercancel', (e) => { e.preventDefault(); if (upFn) upFn(); });
      };
      bindBtn('btn-jump', () => { this.touchJump = true; }, () => { this.touchJump = false; });
      bindBtn('btn-break', () => { this.state.breakHeld = true; }, () => { this.state.breakHeld = false; });
      bindBtn('btn-place', () => { this.state.placeHeld = true; }, () => { this.state.placeHeld = false; });
    }

    _updateJoy(cx, cy, knob) {
      let dx = cx - this.joyCX, dy = cy - this.joyCY;
      const len = Math.hypot(dx, dy);
      const R = 46;
      if (len > R) { dx = dx / len * R; dy = dy / len * R; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      const dead = 0.16;
      const mag = Math.min(1, Math.hypot(dx, dy) / R);
      if (mag < dead) { this.joyAX = 0; this.joyAY = 0; return; }
      const scaled = (mag - dead) / (1 - dead);
      this.joyAX = dx / R * scaled;
      this.joyAY = -dy / R * scaled;
    }
  }

  window.Controls = Controls;
  window.ControlsSens = SENS;
})();
