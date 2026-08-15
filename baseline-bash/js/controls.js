// 键鼠输入：指针锁定、移动、快捷栏选择、双击空格切换飞行
export class Controls {
  constructor(canvas, player, callbacks = {}) {
    this.canvas = canvas;
    this.player = player;
    this.keys = new Set();
    this.leftHeld = false;
    this.rightHeld = false;
    this.selected = 0;
    this.jumpQueued = false;
    this.lastSpaceTime = -1;
    this.locked = false;

    this.onSelect = callbacks.onSelect || (() => {});
    this.onLockChange = callbacks.onLockChange || (() => {});
    this.onEscape = callbacks.onEscape || (() => {});

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);

    this.attach();
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('wheel', this._onWheel);
    window.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      // 某些环境（无头浏览器/iframe）不允许指针锁定，忽略即可
    }
  }

  _onPointerLockChange() {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked) {
      this.keys.clear();
      this.leftHeld = false;
      this.rightHeld = false;
    }
    this.onLockChange(this.locked);
  }

  _onKeyDown(e) {
    if (!this.locked) {
      if (e.code === 'Space') e.preventDefault();
      return;
    }
    this.keys.add(e.code);

    if (e.code === 'Space') {
      e.preventDefault();
      const now = performance.now();
      if (now - this.lastSpaceTime < 280) {
        this.player.fly = !this.player.fly;
        this.lastSpaceTime = -1;
      } else {
        this.lastSpaceTime = now;
        this.jumpQueued = true;
      }
    }
    if (e.code === 'KeyF') {
      this.player.fly = !this.player.fly;
    }
    if (e.code === 'Escape') {
      this.onEscape();
    }
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= 9) this.setSelected(n - 1);
    }
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
  }

  _onMouseDown(e) {
    if (!this.locked) return;
    if (e.button === 0) {
      this.leftHeld = true;
      e.preventDefault();
    } else if (e.button === 2) {
      this.rightHeld = true;
    }
  }

  _onMouseUp(e) {
    if (e.button === 0) this.leftHeld = false;
    if (e.button === 2) this.rightHeld = false;
  }

  _onMouseMove(e) {
    if (!this.locked) return;
    const sensitivity = 0.0022;
    this.player.yaw -= e.movementX * sensitivity;
    this.player.pitch -= e.movementY * sensitivity;
    const limit = Math.PI / 2 - 0.01;
    this.player.pitch = Math.max(-limit, Math.min(limit, this.player.pitch));
  }

  _onWheel(e) {
    if (!this.locked) return;
    e.preventDefault();
    const dir = Math.sign(e.deltaY);
    this.setSelected((this.selected + dir + 9) % 9);
  }

  _onContextMenu(e) {
    e.preventDefault();
  }

  setSelected(i) {
    this.selected = ((i % 9) + 9) % 9;
    this.onSelect(this.selected);
  }

  /** 每帧读取并清除一次性跳跃指令 */
  readInput() {
    const up = this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0;
    const down = this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0;
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0;
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0;

    const input = {
      forward: up - down,
      strafe: right - left,
      sprint: this.keys.has('ControlLeft') || this.keys.has('ControlRight'),
      sneak: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      jump: this.jumpQueued,
      flyUp: this.player.fly ? (this.keys.has('Space') ? 1 : 0) : 0,
      flyDown: this.player.fly ? (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 1 : 0) : 0
    };
    this.jumpQueued = false;
    return input;
  }
}
