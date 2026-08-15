// 第一人称玩家：AABB 逐轴碰撞、重力、跳跃、疾跑、游泳与飞行。
import { BY_ID } from './blocks.js';

export const EYE = 1.62;
export const HALF = 0.3;
export const HEIGHT = 1.8;

const WALK = 4.32;
const SPRINT = 5.61;
const FLY_SPEED = 10.9;
const SWIM_SPEED = 2.6;
const GRAVITY = 26;
const JUMP_V = 8.7;
const TERMINAL = 55;

export class Player {
  constructor(world, spawn) {
    this.world = world;
    this.pos = { x: spawn.x, y: spawn.y, z: spawn.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = -0.6;
    this.pitch = -0.08;
    this.onGround = false;
    this.inWater = false;
    this.flying = false;
    this.sprinting = false;
  }

  solidAt(x, y, z) {
    return BY_ID[this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))].solid;
  }

  checkGround() {
    const by = Math.floor(this.pos.y - 0.02);
    const minX = Math.floor(this.pos.x - HALF), maxX = Math.floor(this.pos.x + HALF);
    const minZ = Math.floor(this.pos.z - HALF), maxZ = Math.floor(this.pos.z + HALF);
    for (let bx = minX; bx <= maxX; bx++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        if (this.solidAt(bx, by, bz)) return true;
      }
    }
    return false;
  }

  // 沿单轴移动并解算碰撞（AABB 面扫描）
  moveAxis(d, axis) {
    if (d === 0) return;
    if (axis === 'y') {
      this.pos.y += d;
      const minX = Math.floor(this.pos.x - HALF), maxX = Math.floor(this.pos.x + HALF);
      const minZ = Math.floor(this.pos.z - HALF), maxZ = Math.floor(this.pos.z + HALF);
      if (d > 0) {
        const by = Math.floor(this.pos.y + HEIGHT);
        for (let bx = minX; bx <= maxX; bx++) {
          for (let bz = minZ; bz <= maxZ; bz++) {
            if (this.solidAt(bx, by, bz)) {
              this.pos.y = by - HEIGHT - 1e-4;
              this.vel.y = 0;
              return;
            }
          }
        }
      } else {
        const by = Math.floor(this.pos.y);
        for (let bx = minX; bx <= maxX; bx++) {
          for (let bz = minZ; bz <= maxZ; bz++) {
            if (this.solidAt(bx, by, bz)) {
              this.pos.y = by + 1 + 1e-4;
              this.vel.y = 0;
              return;
            }
          }
        }
      }
      return;
    }

    // x / z
    this.pos[axis] += d;
    const dir = d > 0 ? 1 : -1;
    const minY = Math.floor(this.pos.y);
    const maxY = Math.floor(this.pos.y + HEIGHT - 1e-9);
    const o = axis === 'x' ? 'z' : 'x';
    const minO = Math.floor(this.pos[o] - HALF);
    const maxO = Math.floor(this.pos[o] + HALF);
    const face = dir > 0 ? Math.floor(this.pos[axis] + HALF) : Math.floor(this.pos[axis] - HALF);
    for (let by = minY; by <= maxY; by++) {
      for (let bo = minO; bo <= maxO; bo++) {
        const bx = axis === 'x' ? face : bo;
        const bz = axis === 'x' ? bo : face;
        if (this.solidAt(bx, by, bz)) {
          this.pos[axis] = dir > 0 ? face - HALF - 1e-4 : face + 1 + HALF + 1e-4;
          this.vel[axis] = 0;
          return;
        }
      }
    }
  }

  update(dt, input) {
    const keys = input.keys;

    // 水体检测
    const fb = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.35), Math.floor(this.pos.z));
    const hb = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z));
    this.inWater = BY_ID[fb].liquid || BY_ID[hb].liquid;

    let fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    let str = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const len = Math.hypot(fwd, str);
    if (len > 0) { fwd /= len; str /= len; }

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wantX = fwd * -sin + str * cos;
    const wantZ = fwd * -cos - str * sin;

    const grounded = this.checkGround();
    const sneak = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const jump = keys.has('Space');

    let speed;
    if (this.flying) speed = FLY_SPEED;
    else if (this.inWater) speed = SWIM_SPEED;
    else speed = sneak && grounded ? 1.7 : (this.sprinting && grounded ? SPRINT : WALK);

    const control = this.flying || grounded ? 1 : 0.22;
    this.vel.x += (wantX * speed - this.vel.x) * Math.min(1, control * 12 * dt);
    this.vel.z += (wantZ * speed - this.vel.z) * Math.min(1, control * 12 * dt);
    if (this.inWater) {
      const drag = Math.max(0, 1 - 3 * dt);
      this.vel.x *= drag;
      this.vel.z *= drag;
    }

    if (this.flying) {
      const vy = (jump ? FLY_SPEED : 0) + (sneak ? -FLY_SPEED : 0);
      this.vel.y += (vy - this.vel.y) * Math.min(1, 10 * dt);
    } else if (this.inWater) {
      this.vel.y -= 6 * dt;
      if (this.vel.y < -3.2) this.vel.y = -3.2;
      if (jump) this.vel.y = Math.min(this.vel.y + 30 * dt, 4.5);
    } else {
      this.vel.y -= GRAVITY * dt;
      if (this.vel.y < -TERMINAL) this.vel.y = -TERMINAL;
      if (jump && grounded) this.vel.y = JUMP_V;
    }

    this.moveAxis(this.vel.x * dt, 'x');
    this.moveAxis(this.vel.z * dt, 'z');
    this.moveAxis(this.vel.y * dt, 'y');
    this.onGround = this.checkGround();
  }
}
