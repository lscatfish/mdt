// 第一人称玩家：AABB 物理（重力/跳跃/游泳/飞行）、分轴碰撞、
// Amanatides & Woo 体素射线检测（用于瞄准方块）。
import * as THREE from 'three';
import { BLOCK, isSolid } from './config.js';

export const EYE_HEIGHT = 1.62;
const HALF = 0.3;
const HEIGHT = 1.8;
const GRAVITY = 27;
const JUMP_SPEED = 9.4;
const WALK_SPEED = 4.3;
const SPRINT_SPEED = 5.9;
const WATER_SPEED = 2.6;
const FLY_SPEED = 9;
const FLY_FAST_SPEED = 18;

export class Player {
  constructor(x, y, z, yaw = 0, pitch = 0) {
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = yaw;
    this.pitch = pitch;
    this.onGround = false;
    this.inWater = false;
    this.flying = false;
    this.fallPeak = y;
    this.justLanded = false;
    this.bobPhase = 0;
  }

  bounds() {
    return {
      minX: this.pos.x - HALF, maxX: this.pos.x + HALF,
      minY: this.pos.y, maxY: this.pos.y + HEIGHT,
      minZ: this.pos.z - HALF, maxZ: this.pos.z + HALF
    };
  }

  checkWater(world) {
    return world.getBlock(
      Math.floor(this.pos.x),
      Math.floor(this.pos.y + 0.8),
      Math.floor(this.pos.z)
    ) === BLOCK.WATER;
  }

  update(dt, keys, world) {
    this.justLanded = false;
    const wasOnGround = this.onGround;
    this.inWater = this.checkWater(world);

    // ---- 水平移动 ----
    const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sprint = keys.has('ControlLeft') || keys.has('ControlRight');
    const speed = this.flying
      ? (sprint ? FLY_FAST_SPEED : FLY_SPEED)
      : this.inWater
        ? WATER_SPEED
        : (sprint ? SPRINT_SPEED : WALK_SPEED);

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let tx = -sin * f + cos * s;
    let tz = -cos * f - sin * s;
    const len = Math.hypot(tx, tz);
    if (len > 0) { tx = (tx / len) * speed; tz = (tz / len) * speed; }
    const groundK = this.inWater ? 6 : (this.onGround ? 14 : 4);
    this.vel.x += (tx - this.vel.x) * Math.min(1, groundK * dt);
    this.vel.z += (tz - this.vel.z) * Math.min(1, groundK * dt);

    // ---- 垂直移动 ----
    if (this.flying) {
      const up = (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0);
      this.vel.y += (up * speed - this.vel.y) * Math.min(1, 10 * dt);
    } else if (this.inWater) {
      this.vel.y -= 11 * dt;
      if (this.vel.y < -4.5) this.vel.y = -4.5;
      if (keys.has('Space')) this.vel.y += 26 * dt;
      if (this.vel.y > 3.3) this.vel.y = 3.3;
      this.onGround = false;
    } else {
      this.vel.y -= GRAVITY * dt;
      if (this.vel.y < -55) this.vel.y = -55;
      if (keys.has('Space') && this.onGround) {
        this.vel.y = JUMP_SPEED;
        this.onGround = false;
      }
    }

    if (!this.onGround && this.pos.y > this.fallPeak) this.fallPeak = this.pos.y;

    // ---- 分轴碰撞（子步防穿模） ----
    this.moveSub(1, this.vel.y * dt, world);
    this.moveSub(0, this.vel.x * dt, world);
    this.moveSub(2, this.vel.z * dt, world);

    if (!wasOnGround && this.onGround) {
      if (this.fallPeak - this.pos.y > 4.5) this.justLanded = true;
      this.fallPeak = this.pos.y;
    }
    if (this.onGround) this.fallPeak = this.pos.y;
  }

  moveSub(axis, delta, world) {
    if (delta === 0) return;
    const step = 0.25;
    const n = Math.ceil(Math.abs(delta) / step);
    const d = delta / n;
    for (let i = 0; i < n; i++) this.moveAxis(axis, d, world);
  }

  moveAxis(axis, delta, world) {
    this.pos.setComponent(axis, this.pos.getComponent(axis) + delta);
    const b = this.bounds();
    const x0 = Math.floor(b.minX);
    const x1 = Math.floor(b.maxX - 1e-7);
    const y0 = Math.floor(b.minY);
    const y1 = Math.floor(b.maxY - 1e-7);
    const z0 = Math.floor(b.minZ);
    const z1 = Math.floor(b.maxZ - 1e-7);

    let hit = null;
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (!isSolid(world.getBlock(x, y, z))) continue;
          const v = axis === 0 ? x : axis === 1 ? y : z;
          if (hit === null) hit = v;
          else if (delta > 0) hit = Math.min(hit, v);
          else hit = Math.max(hit, v);
        }
      }
    }

    if (hit !== null) {
      if (axis === 1) {
        if (delta < 0) this.onGround = true;
        if (delta > 0) this.vel.y = 0;
      } else {
        this.vel.setComponent(axis, 0);
      }
      if (delta > 0) {
        const v = hit - (axis === 1 ? HEIGHT : HALF) - 0.001;
        this.pos.setComponent(axis, v);
      } else {
        const v = hit + 1 + (axis === 1 ? 0 : HALF) + 0.001;
        this.pos.setComponent(axis, v);
      }
      return true;
    }
    if (axis === 1 && delta < 0) this.onGround = false;
    return false;
  }
}

// Voxel DDA 射线检测：返回命中的方块坐标、法线与方块 id
export function raycast(world, origin, dir, maxDist = 6) {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);
  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;
  const stepZ = dir.z > 0 ? 1 : -1;
  const tdx = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tdy = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tdz = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
  let tmx = dir.x !== 0 ? (dir.x > 0 ? (x + 1 - origin.x) * tdx : (origin.x - x) * tdx) : Infinity;
  let tmy = dir.y !== 0 ? (dir.y > 0 ? (y + 1 - origin.y) * tdy : (origin.y - y) * tdy) : Infinity;
  let tmz = dir.z !== 0 ? (dir.z > 0 ? (z + 1 - origin.z) * tdz : (origin.z - z) * tdz) : Infinity;

  let nx = 0, ny = 0, nz = 0;
  let t = 0;
  for (let i = 0; i < 320; i++) {
    if (t > maxDist) return null;
    if (tmx < tmy && tmx < tmz) {
      x += stepX; t = tmx; tmx += tdx; nx = -stepX; ny = 0; nz = 0;
    } else if (tmy < tmz) {
      y += stepY; t = tmy; tmy += tdy; ny = -stepY; nx = 0; nz = 0;
    } else {
      z += stepZ; t = tmz; tmz += tdz; nz = -stepZ; nx = 0; ny = 0;
    }
    if (t > maxDist) return null;
    const id = world.getBlock(x, y, z);
    if (id === BLOCK.AIR || id === BLOCK.WATER) continue;
    return { x, y, z, nx, ny, nz, id, t };
  }
  return null;
}
