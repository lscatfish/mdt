/* 第一人称玩家：移动、重力、体素碰撞 */
(function (global) {
  'use strict';

  const BLOCK = Blocks.BLOCK;
  const EPS = 0.001;

  class Player {
    constructor(world, spawn) {
      this.world = world;
      this.pos = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
      this.vel = new THREE.Vector3();
      this.yaw = 0;
      this.pitch = 0;
      this.onGround = false;
      this.flying = false;

      this.halfWidth = 0.3;
      this.height = 1.8;
      this.eyeHeight = 1.62;
      this.speed = 4.3;
      this.flySpeed = 9;
    }

    headBlock() {
      const w = this.world;
      return w.getBlock(
        Math.floor(this.pos.x),
        Math.floor(this.pos.y + this.eyeHeight),
        Math.floor(this.pos.z)
      );
    }

    feetBlock() {
      const w = this.world;
      return w.getBlock(
        Math.floor(this.pos.x),
        Math.floor(this.pos.y + 0.25),
        Math.floor(this.pos.z)
      );
    }

    inWater() {
      return this.headBlock() === BLOCK.WATER || this.feetBlock() === BLOCK.WATER;
    }

    forwardFlat() {
      return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    }

    rightFlat() {
      return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    }

    eyePosition() {
      return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
    }

    aabbOverlapsBlock(px, py, pz, bx, by, bz) {
      const half = this.halfWidth;
      return px + half > bx && px - half < bx + 1 &&
             py + this.height > by && py < by + 1 &&
             pz + half > bz && pz - half < bz + 1;
    }

    collideAxis(axis, delta) {
      const pos = this.pos;
      const vel = this.vel;
      if (Math.abs(delta) < 1e-9) return;

      pos[axis] += delta;
      const half = this.halfWidth;
      const min = new THREE.Vector3(pos.x - half, pos.y, pos.z - half);
      const max = new THREE.Vector3(pos.x + half, pos.y + this.height, pos.z + half);

      const bx0 = Math.floor(min.x);
      const bx1 = Math.floor(max.x - EPS);
      const by0 = Math.floor(min.y);
      const by1 = Math.floor(max.y - EPS);
      const bz0 = Math.floor(min.z);
      const bz1 = Math.floor(max.z - EPS);

      for (let by = by0; by <= by1; by++) {
        for (let bz = bz0; bz <= bz1; bz++) {
          for (let bx = bx0; bx <= bx1; bx++) {
            const id = this.world.getBlock(bx, by, bz);
            if (!Blocks.isSolid(id)) continue;
            if (!this.aabbOverlapsBlock(pos.x, pos.y, pos.z, bx, by, bz)) continue;

            if (axis === 'y') {
              if (delta < 0) {
                pos.y = by + 1;
                this.onGround = true;
              } else {
                pos.y = by - this.height - EPS;
              }
              vel.y = 0;
            } else if (axis === 'x') {
              if (delta > 0) pos.x = bx - half - EPS;
              else pos.x = bx + 1 + half + EPS;
              vel.x = 0;
            } else {
              if (delta > 0) pos.z = bz - half - EPS;
              else pos.z = bz + 1 + half + EPS;
              vel.z = 0;
            }
            return;
          }
        }
      }
    }

    update(dt, input) {
      const world = this.world;
      const water = this.inWater();
      const wasOnGround = this.onGround;
      const forward = this.forwardFlat();
      const right = this.rightFlat();

      let moveX = input.moveStrafe;
      let moveZ = input.moveForward;
      const len = Math.hypot(moveX, moveZ);
      if (len > 1) { moveX /= len; moveZ /= len; }

      let speed = this.flying ? this.flySpeed : this.speed;
      if (input.sneak && !this.flying) speed = 1.6;
      if (input.sprint && !this.flying && !input.sneak) speed = 5.8;
      if (water) speed = 2.4;

      const wishX = (forward.x * moveZ + right.x * moveX) * speed;
      const wishZ = (forward.z * moveZ + right.z * moveX) * speed;

      const accel = wasOnGround || this.flying ? 12 : 5.5;
      const k = Math.min(1, dt * accel);
      this.vel.x += (wishX - this.vel.x) * k;
      this.vel.z += (wishZ - this.vel.z) * k;

      if (this.flying) {
        let wishY = 0;
        if (input.jump) wishY += this.flySpeed;
        if (input.sneak) wishY -= this.flySpeed;
        this.vel.y += (wishY - this.vel.y) * Math.min(1, dt * 10);
        this.onGround = false;
      } else {
        const gravity = water ? -8 : -24;
        this.vel.y += gravity * dt;
        if (this.vel.y < -38) this.vel.y = -38;

        if (input.jump) {
          if (wasOnGround) {
            this.vel.y = 8.2;
            this.onGround = false;
          } else if (water) {
            this.vel.y = Math.max(this.vel.y + 26 * dt, 0);
            this.vel.y = Math.min(this.vel.y, 3.4);
          }
        }
      }

      // 每帧重新检测是否着地
      this.onGround = false;

      // 分轴碰撞，避免斜向穿墙
      this.collideAxis('y', this.vel.y * dt);
      this.collideAxis('x', this.vel.x * dt);
      this.collideAxis('z', this.vel.z * dt);

      // 防止掉出世界底部
      if (this.pos.y < -8) {
        this.pos.y = world.heightAt(Math.floor(this.pos.x), Math.floor(this.pos.z)) + 4;
        this.vel.set(0, 0, 0);
      }

      // 在液面附近缓慢上浮，让玩家能游出来
      if (water && !this.flying && !this.onGround) {
        if (this.vel.y < -3.5) this.vel.y = -3.5;
      }
    }

    toggleFly() {
      this.flying = !this.flying;
      if (this.flying) this.vel.y = 0;
      return this.flying;
    }
  }

  global.Player = Player;
})(window);
