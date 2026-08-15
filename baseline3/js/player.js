/* 玩家：AABB 体素碰撞物理、游泳与飞行 */
(function () {
  'use strict';

  const HALF = 0.3;
  const HEIGHT = 1.8;
  const EYE = 1.62;
  const GRAVITY = 25;
  const JUMP = 8.6;
  const WALK = 4.4;
  const SPRINT = 6.6;
  const FLY = 11;

  function MCPlayer(world, x, y, z) {
    this.world = world;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.flying = false;
  }

  MCPlayer.prototype.eye = function () {
    return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z);
  };

  MCPlayer.prototype.setSpawn = function (wx, wz) {
    const h = this.world.heightAt(wx, wz);
    this.pos.set(wx + 0.5, h + 1, wz + 0.5);
    this.vel.set(0, 0, 0);
  };

  MCPlayer.prototype.aabbSolid = function (minX, minY, minZ, maxX, maxY, maxZ) {
    const w = this.world;
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (w.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  };

  MCPlayer.prototype.moveAxis = function (axis, dt) {
    const p = this.pos;
    const v = this.vel;
    const eps = 0.001;
    p[axis] += v[axis] * dt;
    const minX = Math.floor(p.x - HALF);
    const maxX = Math.floor(p.x + HALF);
    const minY = Math.floor(p.y);
    const maxY = Math.floor(p.y + HEIGHT - eps);
    const minZ = Math.floor(p.z - HALF);
    const maxZ = Math.floor(p.z + HALF);
    if (this.aabbSolid(minX, minY, minZ, maxX, maxY, maxZ)) {
      if (axis === 'y') {
        if (v.y < 0) { p.y = minY + 1; this.onGround = true; }
        else if (v.y > 0) { p.y = maxY - HEIGHT - eps; }
        v.y = 0;
      } else {
        if (axis === 'x') {
          if (v.x > 0) p.x = maxX + 1 - HALF - eps;
          else p.x = minX + HALF + eps;
          v.x = 0;
        } else {
          if (v.z > 0) p.z = maxZ + 1 - HALF - eps;
          else p.z = minZ + HALF + eps;
          v.z = 0;
        }
      }
    }
  };

  MCPlayer.prototype.update = function (dt, input) {
    const w = this.world;
    const p = this.pos;
    const v = this.vel;
    const b = MCBlocks;

    // 水体检测
    const feet = w.getBlock(Math.floor(p.x), Math.floor(p.y + 0.4), Math.floor(p.z));
    const head = w.getBlock(Math.floor(p.x), Math.floor(p.y + 1.4), Math.floor(p.z));
    this.inWater = feet === b.WATER || head === b.WATER;

    // 期望移动方向（相对视角）
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let ix = 0, iz = 0;
    if (input.forward) { ix -= sin; iz -= cos; }
    if (input.back) { ix += sin; iz += cos; }
    if (input.left) { ix -= cos; iz += sin; }
    if (input.right) { ix += cos; iz -= sin; }
    const len = Math.hypot(ix, iz) || 1;
    ix /= len; iz /= len;

    const sprint = input.sprint && input.forward && !this.inWater;
    const target = this.flying ? FLY : (this.inWater ? WALK * 0.55 : (sprint ? SPRINT : WALK));
    const accel = this.onGround ? 12 : (this.flying ? 10 : 3.5);

    v.x += (ix * target - v.x) * Math.min(1, accel * dt);
    v.z += (iz * target - v.z) * Math.min(1, accel * dt);

    if (this.flying) {
      let iy = 0;
      if (input.jump) iy += 1;
      if (input.sneak) iy -= 1;
      v.y += (iy * target - v.y) * Math.min(1, 10 * dt);
    } else if (this.inWater) {
      v.y -= GRAVITY * 0.28 * dt;
      if (input.jump) v.y += 26 * dt;
      v.y *= Math.max(0, 1 - 1.6 * dt);
      if (v.y < -6) v.y = -6;
    } else {
      v.y -= GRAVITY * dt;
      if (v.y < -54) v.y = -54;
      if (input.jump && this.onGround) {
        v.y = JUMP;
        this.onGround = false;
      }
    }

    // 分轴移动并碰撞
    this.onGround = false;
    this.moveAxis('x', dt);
    this.moveAxis('z', dt);
    this.moveAxis('y', dt);

    // 防止从高空掉出世界（无限向下）
    if (p.y < -40) this.setSpawn(Math.round(p.x), Math.round(p.z));
  };

  MCPlayer.prototype.forward = function () {
    const cos = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cos, Math.sin(this.pitch), -Math.cos(this.yaw) * cos);
  };

  window.MCPlayer = MCPlayer;
})();
