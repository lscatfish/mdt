// Keyboard + mouse (pointer lock) + touch input. Browser-only.
export class Input {
  constructor(canvas, { onLockChange, onHotbarDelta, onToggleFly, onJump, testMode }) {
    this.canvas = canvas;
    this.testMode = !!testMode;
    this.onLockChange = onLockChange || (() => {});
    this.onHotbarDelta = onHotbarDelta || (() => {});
    this.onToggleFly = onToggleFly || (() => {});
    this.onJump = onJump || (() => {});

    this.keys = new Set();
    this.locked = false;
    this.dx = 0;
    this.dy = 0;
    this.leftHeld = false;
    this.rightHeld = false;
    this.jumpQueued = false;
    this.lastSpaceTime = -1;

    // touch state
    this.isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    this.touch = {
      moveX: 0, moveY: 0, moveActive: false,
      lookDx: 0, lookDy: 0, lookActive: false,
      jumpHeld: false, breakHeld: false, placeHeld: false, flyDownHeld: false,
    };
    this.hotbarIndex = 0;

    this._bindKeyboard();
    this._bindMouse();
    if (this.isTouch) this._bindTouch();
  }

  _bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "Space") {
        this.jumpQueued = true;
        const now = performance.now();
        if (now - this.lastSpaceTime < 260) this.onToggleFly();
        this.lastSpaceTime = now;
        this.onJump();
      }
      if (e.code === "KeyF") this.onToggleFly();
      if (/^Digit[1-8]$/.test(e.code)) {
        this.hotbarIndex = Number(e.code.slice(5)) - 1;
        this.onHotbarDelta(0); // notify (no delta)
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  _bindMouse() {
    const canvas = this.canvas;
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 2) { this.rightHeld = true; return; }
      if (e.button !== 0) return;
      this.leftHeld = true;
      if (!this.locked && !this.testMode) {
        try {
          const p = canvas.requestPointerLock && canvas.requestPointerLock();
          if (p && typeof p.catch === "function") p.catch(() => {});
        } catch { /* pointer lock rejected */ }
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.leftHeld = false;
      if (e.button === 2) this.rightHeld = false;
    });
    window.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
      this.onLockChange(this.locked);
    });
    document.addEventListener("mousemove", (e) => {
      if (this.locked) {
        this.dx += e.movementX || 0;
        this.dy += e.movementY || 0;
      }
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.hotbarIndex = (this.hotbarIndex + (e.deltaY > 0 ? 1 : -1) + 8) % 8;
      this.onHotbarDelta(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
  }

  _bindTouch() {
    const ui = document.getElementById("touchUI");
    ui.classList.remove("hidden");
    ui.innerHTML = `
      <div class="stick" id="stick"><div class="knob" id="knob"></div></div>
      <button class="tbtn" id="tBreak" style="right:24px;bottom:150px;">⛏</button>
      <button class="tbtn" id="tPlace" style="right:24px;bottom:76px;">🧱</button>
      <button class="tbtn" id="tJump" style="right:100px;bottom:76px;">⬆</button>
      <button class="tbtn" id="tFly" style="right:176px;bottom:76px;">🕊</button>
    `;
    const stick = ui.querySelector("#stick");
    const knob = ui.querySelector("#knob");
    const DEAD = 0.18;

    const stickHandlers = (e) => {
      const rect = stick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let vx = 0, vy = 0;
      if (e.touches.length > 0) {
        const t = e.touches[0];
        vx = (t.clientX - cx) / (rect.width / 2);
        vy = (t.clientY - cy) / (rect.height / 2);
      }
      const len = Math.hypot(vx, vy);
      if (len > 1) { vx /= len; vy /= len; }
      this.touch.moveActive = len > DEAD;
      this.touch.moveX = this.touch.moveActive ? vx : 0;
      this.touch.moveY = this.touch.moveActive ? vy : 0;
      knob.style.left = (31 + vx * 36) + "px";
      knob.style.top = (31 + vy * 36) + "px";
      e.preventDefault();
      e.stopPropagation();
    };
    stick.addEventListener("touchstart", stickHandlers, { passive: false });
    stick.addEventListener("touchmove", stickHandlers, { passive: false });
    stick.addEventListener("touchend", stickHandlers, { passive: false });

    // look = drag anywhere else
    let lastLook = null;
    document.addEventListener("touchstart", (e) => {
      if (e.target.closest && e.target.closest("#touchUI")) return;
      lastLook = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this.touch.lookActive = true;
    }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      if (!this.touch.lookActive) return;
      const t = e.touches[0];
      this.touch.lookDx += t.clientX - lastLook.x;
      this.touch.lookDy += t.clientY - lastLook.y;
      lastLook = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    document.addEventListener("touchend", () => {
      this.touch.lookActive = false;
      lastLook = null;
    }, { passive: true });

    const hold = (id, prop) => {
      const el = ui.querySelector(id);
      el.addEventListener("touchstart", (e) => { this.touch[prop] = true; e.preventDefault(); e.stopPropagation(); }, { passive: false });
      el.addEventListener("touchend", (e) => { this.touch[prop] = false; e.preventDefault(); }, { passive: false });
    };
    hold("#tBreak", "breakHeld");
    hold("#tPlace", "placeHeld");
    hold("#tJump", "jumpHeld");
    const flyBtn = ui.querySelector("#tFly");
    flyBtn.addEventListener("touchstart", (e) => {
      this.onToggleFly();
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
  }

  consumeLook() {
    const out = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    if (this.touch.lookActive) {
      out.dx += this.touch.lookDx;
      out.dy += this.touch.lookDy;
      this.touch.lookDx = 0;
      this.touch.lookDy = 0;
    }
    return out;
  }

  consumeJump() {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  // Movement/flight snapshot for one physics step.
  snapshot() {
    const k = this.keys;
    const t = this.touch;
    return {
      fwd: k.has("KeyW") || (t.moveActive && t.moveY < -0.3),
      back: k.has("KeyS") || (t.moveActive && t.moveY > 0.3),
      left: k.has("KeyA") || (t.moveActive && t.moveX < -0.3),
      right: k.has("KeyD") || (t.moveActive && t.moveX > 0.3),
      jump: this.consumeJump() || t.jumpHeld,
      sneak: k.has("ShiftLeft") || k.has("ShiftRight"),
      sprint: k.has("ControlLeft") || k.has("ControlRight"),
      flyUp: k.has("Space") || t.jumpHeld,
      flyDown: k.has("ShiftLeft") || t.flyDownHeld,
    };
  }
}
