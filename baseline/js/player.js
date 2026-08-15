/* ============================================================
 * player.js — 输入管理与第一人称玩家物理
 * ============================================================ */
(function (global) {
  'use strict';

  const W = MCWorld.WATER;
  const Blocks = () => MCTextures.Blocks;

  function isSolid(id) {
    if (id === null || id === undefined) return true; // 未加载区域视为实心，防止坠落
    const b = Blocks()[id];
    return !!(b && b.solid);
  }

  class Input {
    constructor() {
      this.keys = new Set();
      this.justPressed = new Set();
      this.buttons = { 0: false, 1: false, 2: false };
      this.justClicked = new Set();
      this.mouseDX = 0;
      this.mouseDY = 0;
      this.wheel = 0;
      this.locked = false;
      this.onLockChange = null;
    }

    attach(canvas) {
      document.addEventListener('keydown', (e) => {
        if (!this.keys.has(e.code)) this.justPressed.add(e.code);
        this.keys.add(e.code);
        if (['Space', 'Tab', 'KeyF', 'KeyM', 'KeyH', 'ControlLeft', 'ControlRight'].includes(e.code)) {
          e.preventDefault();
        }
      });
      document.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
      window.addEventListener('blur', () => { this.keys.clear(); this.buttons[0] = false; this.buttons[2] = false; });

      canvas.addEventListener('mousemove', (e) => {
        if (this.locked) {
          this.mouseDX += e.movementX || 0;
          this.mouseDY += e.movementY || 0;
        }
      });
      canvas.addEventListener('mousedown', (e) => {
        if (this.locked) {
          if (e.button === 0 || e.button === 2) {
            this.buttons[e.button] = true;
            this.justClicked.add(e.button);
          }
          e.preventDefault();
        }
      });
      document.addEventListener('mouseup', (e) => {
        if (e.button === 0 || e.button === 2) this.buttons[e.button] = false;
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('wheel', (e) => {
        if (this.locked) {
          this.wheel += e.deltaY > 0 ? 1 : -1;
          e.preventDefault();
        }
      }, { passive: false });

      document.addEventListener('pointerlockchange', () => {
        this.locked = document.pointerLockElement === canvas;
        if (this.onLockChange) this.onLockChange(this.locked);
      });
    }

    requestLock(canvas) {
      const p = canvas.requestPointerLock && canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    }

    consumeMouse() {
      const dx = this.mouseDX, dy = this.mouseDY;
      this.mouseDX = 0; this.mouseDY = 0;
      return [dx, dy];
    }

    consumeJustPressed() {
      const arr = Array.from(this.justPressed);
      this.justPressed.clear();
      return arr;
    }

    consumeClicks() {
      const arr = Array.from(this.justClicked);
      this.justClicked.clear();
      return arr;
    }

    consumeWheel() {
      const w = this.wheel;
      this.wheel = 0;
      return w;
    }

    isDown(code) { return this.keys.has(code); }
  }

  class Player {
    constructor(world) {
      this.world = world;
      this.halfW = 0.3;
      this.height = 1.8;
      this.eye = 1.62;
      this.pos = { x: 0.5, y: 40, z: 0.5 };
      this.vel = { x: 0, y: 0, z: 0 };
      this.yaw = Math.PI;   // 初始朝向 +Z 方向
      this.pitch = -0.08;
      this.onGround = false;
      this.flying = false;
      this.inWater = false;
      this.submerged = false;
      this.stepTimer = 0;
      this.stepDist = 0;
    }

    spawnAt(p) {
      this.pos.x = p.x; this.pos.y = p.y; this.pos.z = p.z;
      this.vel.x = 0; this.vel.y = 0; this.vel.z = 0;
    }

    update(dt, input, audio) {
      // 鼠标视角
      const [dx, dy] = input.consumeMouse();
      const sens = 0.0021;
      this.yaw -= dx * sens;
      this.pitch -= dy * sens;
      const lim = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));

      // 双击空格切换飞行
      if (input.justPressed.has('Space') && this.lastSpaceTime && performance.now() - this.lastSpaceTime < 280) {
        this.flying = !this.flying;
        this.vel.y = 0;
        input.justPressed.delete('Space');
      }
      if (input.justPressed.has('Space')) this.lastSpaceTime = performance.now();

      // 水域检测
      const feetBlock = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.35), Math.floor(this.pos.z));
      const headBlock = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + this.eye), Math.floor(this.pos.z));
      this.inWater = feetBlock === W;
      this.submerged = headBlock === W;

      // 输入方向
      const f = input.isDown('KeyW') ? 1 : 0 - (input.isDown('KeyS') ? 1 : 0);
      const s = input.isDown('KeyD') ? 1 : 0 - (input.isDown('KeyA') ? 1 : 0);
      const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
      let wx = (-sinY * f + cosY * s);
      let wz = (-cosY * f - sinY * s);
      const len = Math.hypot(wx, wz);
      if (len > 1) { wx /= len; wz /= len; }
      const moving = len > 0.01;
      const sprinting = input.isDown('ControlLeft') || input.isDown('ControlRight');
      const sneaking = input.isDown('ShiftLeft') || input.isDown('ShiftRight');

      // 物理子步进，避免高速穿透
      const steps = Math.max(1, Math.ceil(dt / 0.016));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) this.step(h, input, wx, wz, moving, sprinting, sneaking, audio);
    }

    step(dt, input, wx, wz, moving, sprinting, sneaking, audio) {
      const jumpHeld = input.isDown('Space');

      if (this.flying) {
        const speed = sprinting ? 21 : 11;
        const vy = (jumpHeld ? 1 : 0) - (sneaking ? 1 : 0);
        const targetX = wx * speed, targetZ = wz * speed, targetY = vy * speed * 0.75;
        const k = 1 - Math.exp(-9 * dt);
        this.vel.x += (targetX - this.vel.x) * k;
        this.vel.z += (targetZ - this.vel.z) * k;
        this.vel.y += (targetY - this.vel.y) * k;
      } else if (this.inWater) {
        const speed = 3.2;
        const k = 1 - Math.exp(-5 * dt);
        this.vel.x += (wx * speed - this.vel.x) * k;
        this.vel.z += (wz * speed - this.vel.z) * k;
        let targetY = this.vel.y;
        if (jumpHeld) targetY = 3.4;
        else targetY = Math.max(-2.4, this.vel.y - 10 * dt);
        const ky = 1 - Math.exp(-6 * dt);
        this.vel.y += (targetY - this.vel.y) * ky;
      } else {
        // 水平运动
        let speed = sneaking ? 1.8 : 4.4;
        if (sprinting && moving && !sneaking) speed *= 1.5;
        const accel = this.onGround ? 11 : 2.6;
        const k = 1 - Math.exp(-accel * dt);
        this.vel.x += (wx * speed - this.vel.x) * k;
        this.vel.z += (wz * speed - this.vel.z) * k;

        // 跳跃
        if (jumpHeld && this.onGround) {
          this.vel.y = 8.6;
          this.onGround = false;
        }
        this.vel.y -= 28 * dt;
        if (this.vel.y < -52) this.vel.y = -52;
      }

      // 碰撞与移动
      this.onGround = false;
      this.moveAxis('x', dt);
      this.moveAxis('z', dt);
      this.moveAxis('y', dt);

      // 掉落出世界
      if (this.pos.y < -12) {
        const s = this.world.findSpawn();
        this.spawnAt(s);
        this.vel.y = 0;
      }

      // 脚步声
      if (!this.flying && this.onGround && moving) {
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          if (audio) audio.step();
          this.stepTimer = sneaking ? 0.5 : 0.32;
        }
      } else {
        this.stepTimer = Math.min(this.stepTimer, 0.1);
      }
    }

    moveAxis(axis, dt) {
      const d = this.vel[axis] * dt;
      if (d === 0) return;
      this.pos[axis] += d;
      const half = this.halfW;
      const minX = Math.floor(this.pos.x - half), maxX = Math.floor(this.pos.x + half);
      const minY = Math.floor(this.pos.y), maxY = Math.floor(this.pos.y + this.height);
      const minZ = Math.floor(this.pos.z - half), maxZ = Math.floor(this.pos.z + half);
      const eps = 0.001;

      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          for (let bx = minX; bx <= maxX; bx++) {
            const id = this.world.getBlock(bx, by, bz);
            if (!isSolid(id)) continue;
            if (axis === 'x') {
              if (d > 0 && this.pos.x + half > bx) { this.pos.x = bx - half - eps; this.vel.x = 0; }
              else if (d < 0 && this.pos.x - half < bx + 1) { this.pos.x = bx + 1 + half + eps; this.vel.x = 0; }
            } else if (axis === 'z') {
              if (d > 0 && this.pos.z + half > bz) { this.pos.z = bz - half - eps; this.vel.z = 0; }
              else if (d < 0 && this.pos.z - half < bz + 1) { this.pos.z = bz + 1 + half + eps; this.vel.z = 0; }
            } else {
              if (d > 0 && this.pos.y + this.height > by) { this.pos.y = by - this.height - eps; this.vel.y = 0; }
              else if (d < 0 && this.pos.y < by + 1) {
                this.pos.y = by + 1 + eps;
                this.vel.y = 0;
                this.onGround = true;
              }
            }
          }
        }
      }
    }

    aabb() {
      return {
        minX: this.pos.x - this.halfW, maxX: this.pos.x + this.halfW,
        minY: this.pos.y, maxY: this.pos.y + this.height,
        minZ: this.pos.z - this.halfW, maxZ: this.pos.z + this.halfW
      };
    }

    intersectsBlock(bx, by, bz) {
      const a = this.aabb();
      return a.minX < bx + 1 && a.maxX > bx &&
             a.minY < by + 1 && a.maxY > by &&
             a.minZ < bz + 1 && a.maxZ > bz;
    }

    eyePos() {
      return [this.pos.x, this.pos.y + this.eye, this.pos.z];
    }
  }

  global.MCPlayer = { Player, Input };
})(window);
