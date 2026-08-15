export class Controls {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.keys = new Set();
    this.leftDown = false;
    this.rightDown = false;
    this.placeQueued = false;
    this.pickQueued = false;
    this.jumpTaps = 0;
    this.locked = false;

    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => this.onKeyUp(e));
    canvas.addEventListener("mousedown", (e) => this.onMouseDown(e));
    window.addEventListener("mouseup", (e) => this.onMouseUp(e));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("mousemove", (e) => this.onMouseMove(e));
    canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    document.addEventListener("pointerlockchange", () => this.onLockChange());
    document.addEventListener("pointerlockerror", () => {
      if (this.handlers.onLockError) this.handlers.onLockError();
    });
  }

  get input() {
    return {
      forward: this.keys.has("KeyW") || this.keys.has("ArrowUp"),
      back: this.keys.has("KeyS") || this.keys.has("ArrowDown"),
      left: this.keys.has("KeyA") || this.keys.has("ArrowLeft"),
      right: this.keys.has("KeyD") || this.keys.has("ArrowRight"),
      jump: this.keys.has("Space"),
      sneak: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
      sprint: this.keys.has("KeyR"),
    };
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* 浏览器冷却期内忽略 */
    }
  }

  exitLock() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  consumePlace() {
    const q = this.placeQueued;
    this.placeQueued = false;
    return q;
  }

  consumePick() {
    const q = this.pickQueued;
    this.pickQueued = false;
    return q;
  }

  consumeJumpTaps() {
    const n = this.jumpTaps;
    this.jumpTaps = 0;
    return n;
  }

  onKeyDown(e) {
    if (e.code === "Space") {
      e.preventDefault();
      if (!e.repeat) this.jumpTaps++;
    }
    if (e.code === "Tab") e.preventDefault();
    this.keys.add(e.code);
  }

  onKeyUp(e) {
    this.keys.delete(e.code);
  }

  onMouseDown(e) {
    if (e.button === 0) {
      this.leftDown = true;
      if (this.handlers.onPrimaryDown) this.handlers.onPrimaryDown();
    } else if (e.button === 2) {
      this.rightDown = true;
      this.placeQueued = true;
    } else if (e.button === 1) {
      e.preventDefault();
      this.pickQueued = true;
    }
  }

  onMouseUp(e) {
    if (e.button === 0) this.leftDown = false;
    if (e.button === 2) this.rightDown = false;
  }

  onMouseMove(e) {
    if (!this.locked) return;
    if (this.handlers.onMouseMove) this.handlers.onMouseMove(e.movementX, e.movementY);
  }

  onWheel(e) {
    e.preventDefault();
    if (this.handlers.onWheel) this.handlers.onWheel(Math.sign(e.deltaY));
  }

  onLockChange() {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked) {
      this.leftDown = false;
      this.rightDown = false;
      this.pickQueued = false;
    }
    if (this.handlers.onLockChange) this.handlers.onLockChange(this.locked);
  }
}
