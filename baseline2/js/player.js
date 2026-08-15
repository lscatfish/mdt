'use strict';
/* WebCraft · 玩家物理（碰撞 / 重力 / 游泳 / 飞行） */
(function () {
  const GRAVITY = 26;
  const JUMP_SPEED = 8.4;
  const WALK_SPEED = 4.35;
  const SPRINT_SPEED = 5.8;
  const FLY_SPEED = 11;
  const EYE_HEIGHT = 1.62;
  const B = Blocks.BLOCK;
  const { SX, SY, SZ, SEA_LEVEL } = window.WorldConst;

  class Player {
    constructor(world) {
      this.world = world;
      this.pos = new THREE.Vector3();
      this.vel = new THREE.Vector3();
      this.yaw = 0;
      this.pitch = 0;
      this.hw = 0.3;          // 半宽
      this.height = 1.8;
      this.onGround = false;
      this.inWater = false;
      this.fly = false;
      this.bobPhase = 0;
      this.headBobY = 0;
      this.respawn();
    }

    blockAt(x, y, z) {
      return this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    }

    collides(px, py, pz) {
      const minX = px - this.hw, maxX = px + this.hw;
      const minY = py, maxY = py + this.height;
      const minZ = pz - this.hw, maxZ = pz + this.hw;
      const x0 = Math.floor(minX), x1 = Math.floor(maxX);
      const y0 = Math.floor(minY), y1 = Math.floor(maxY);
      const z0 = Math.floor(minZ), z1 = Math.floor(maxZ);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          for (let z = z0; z <= z1; z++) {
            if (Blocks.isSolid(this.world.getBlock(x, y, z))) return true;
          }
        }
      }
      return false;
    }

    intersectsBlock(bx, by, bz) {
      /* 只要目标格子与玩家碰撞盒有交集就禁止放置（无论格内现在是空气/水） */
      return (this.pos.x + this.hw > bx && this.pos.x - this.hw < bx + 1 &&
              this.pos.y + this.height > by && this.pos.y < by + 1 &&
              this.pos.z + this.hw > bz && this.pos.z - this.hw < bz + 1);
    }

    respawn() {
      this.findSpawn();
      this.vel.set(0, 0, 0);
      this.fly = false;
      this.onGround = false;
    }

    findSpawn() {
      const xs = 8.5, zs = 8.5;
      for (let r = 0; r < 40; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const x = Math.floor(xs) + dx, z = Math.floor(zs) + dz;
            const h = this.world.terrainHeight(x, z);
            if (h > SEA_LEVEL + 1) {
              this.pos.set(x + 0.5, h + 1.01, z + 0.5);
              /* 往上抬一点，确保没有卡在树冠里 */
              while (this.collides(this.pos.x, this.pos.y, this.pos.z) && this.pos.y < SY - 3) {
                this.pos.y += 0.2;
              }
              return;
            }
          }
        }
      }
      this.pos.set(xs, 70, zs);
    }

    setFly(fly) {
      this.fly = fly;
      this.vel.set(0, 0, 0);
    }

    update(dt, input, camera) {
      dt = Math.min(dt, 0.1);
      const k = input;

      /* 水面判定 */
      const feetWater = this.blockAt(this.pos.x, this.pos.y + 0.3, this.pos.z) === B.WATER;
      const headWater = this.blockAt(this.pos.x, this.pos.y + EYE_HEIGHT, this.pos.z) === B.WATER;
      this.inWater = feetWater || headWater;

      /* 期望移动方向（相对朝向） */
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const move = new THREE.Vector3();
      move.addScaledVector(fwd, k.ay);
      move.addScaledVector(right, k.ax);
      if (move.lengthSq() > 1) move.normalize();
      const moving = move.lengthSq() > 1e-6;

      const sprint = k.sprint && !k.sneak;

      if (this.fly) {
        /* 创造飞行：平滑逼近目标速度 */
        let speed = FLY_SPEED * (sprint ? 1.9 : 1);
        if (k.sneak) speed *= 0.4;
        const tx = move.x * speed, tz = move.z * speed;
        const lerp = Math.min(1, dt * 8);
        this.vel.x += (tx - this.vel.x) * lerp;
        this.vel.z += (tz - this.vel.z) * lerp;
        const vyTarget = (k.jump ? 1 : 0) + (k.sneak ? -0.55 : 0);
        this.vel.y += (vyTarget * FLY_SPEED - this.vel.y) * lerp;
      } else if (this.inWater) {
        /* 游泳 */
        const speed = WALK_SPEED * 0.62;
        const lerp = Math.min(1, dt * 5);
        this.vel.x += (move.x * speed - this.vel.x) * lerp;
        this.vel.z += (move.z * speed - this.vel.z) * lerp;
        this.vel.y -= 10 * dt;
        this.vel.y *= Math.max(0, 1 - 1.4 * dt);
        if (k.jump) this.vel.y += (3.4 - this.vel.y) * Math.min(1, dt * 8);
        this.vel.y = Math.max(-4.5, Math.min(4.5, this.vel.y));
      } else {
        /* 行走 */
        let speed = sprint ? SPRINT_SPEED : WALK_SPEED;
        if (k.sneak) speed = WALK_SPEED * 0.42;
        const accel = (this.onGround ? 13 : 5) * dt;
        const kx = Math.min(1, accel);
        this.vel.x += (move.x * speed - this.vel.x) * kx;
        this.vel.z += (move.z * speed - this.vel.z) * kx;
        if (!moving || this.onGround) {
          const fr = Math.max(0, 1 - (this.onGround ? 9 : 0.4) * dt);
          this.vel.x *= fr;
          this.vel.z *= fr;
        }
        this.vel.y -= GRAVITY * dt;
        if (this.vel.y < -45) this.vel.y = -45;
        if (k.jump && this.onGround) {
          this.vel.y = JUMP_SPEED;
          this.onGround = false;
        }
      }

      /* 逐轴积分 + 碰撞 */
      this.integrateAxis('x', this.vel.x * dt);
      this.integrateAxis('y', this.vel.y * dt);
      this.integrateAxis('z', this.vel.z * dt);

      /* 落地 / 头部视角摇晃 */
      const groundCollide = this.collides(this.pos.x, this.pos.y - 0.06, this.pos.z);
      this.onGround = groundCollide;
      if (!this.fly && !this.inWater && this.onGround) {
        const hSpeed = Math.hypot(this.vel.x, this.vel.z);
        if (hSpeed > 0.8) {
          this.bobPhase += dt * (4 + hSpeed * 1.4);
          this.headBobY = Math.sin(this.bobPhase) * 0.055 * Math.min(1, hSpeed / WALK_SPEED);
        } else {
          this.headBobY *= Math.max(0, 1 - dt * 8);
        }
      } else {
        this.headBobY *= Math.max(0, 1 - dt * 6);
      }

      camera.position.set(
        this.pos.x,
        this.pos.y + EYE_HEIGHT + this.headBobY,
        this.pos.z
      );
      camera.rotation.set(this.pitch, this.yaw, 0);
      return moving;
    }

    integrateAxis(axis, delta) {
      if (delta === 0) return false;
      /* 步进细分：高速移动（下坠/飞行疾跑）时防止穿透 1 格方块 */
      const maxStep = 0.35;
      const n = Math.ceil(Math.abs(delta) / maxStep);
      const step = delta / n;
      let collided = false;
      for (let i = 0; i < n; i++) {
        if (this.moveStep(axis, step)) { collided = true; break; }
      }
      return collided;
    }

    moveStep(axis, delta) {
      this.pos[axis] += delta;
      if (this.collides(this.pos.x, this.pos.y, this.pos.z)) {
        const dir = delta > 0 ? 1 : -1;
        let steps = 0;
        while (this.collides(this.pos.x, this.pos.y, this.pos.z) && steps < 60) {
          this.pos[axis] -= dir * 0.02;
          steps++;
        }
        if (steps >= 60) this.pos[axis] -= delta;  // 兜底：完全回退
        this.vel[axis] = 0;
        return true;
      }
      return false;
    }
  }

  window.Player = Player;
  window.PlayerConst = { EYE_HEIGHT, WALK_SPEED, SPRINT_SPEED };
})();
