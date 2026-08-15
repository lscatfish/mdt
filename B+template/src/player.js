// 玩家：第一人称物理（AABB 与体素网格逐轴碰撞）、重力、跳跃、飞行、游泳
import { WATER } from './constants.js';

const GRAVITY = 27;
const JUMP_SPEED = 8.6;
const WALK_SPEED = 4.4;
const SPRINT_SPEED = 7.2;
const FLY_SPEED = 13;
const EPS = 0.001;

export class Player {
  constructor(world, x, y, z, yaw = 0) {
    this.world = world;
    this.pos = { x, y, z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = yaw;
    this.pitch = 0;
    this.halfWidth = 0.3;
    this.height = 1.8;
    this.eyeHeight = 1.62;
    this.onGround = false;
    this.flying = false;
    this.inWater = false;
    this.headInWater = false;
  }

  get eye() {
    return { x: this.pos.x, y: this.pos.y + this.eyeHeight, z: this.pos.z };
  }

  toggleFly() {
    this.flying = !this.flying;
    this.vel.y = 0;
    return this.flying;
  }

  forward() {
    const cp = Math.cos(this.pitch);
    return {
      x: -Math.sin(this.yaw) * cp,
      y: Math.sin(this.pitch),
      z: -Math.cos(this.yaw) * cp,
    };
  }

  right() {
    return { x: Math.cos(this.yaw), y: 0, z: -Math.sin(this.yaw) };
  }

  update(dt, input) {
    const f = this.forward();
    const r = this.right();

    const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
    const tx = (f.x * input.forward + r.x * input.strafe) * (this.flying ? FLY_SPEED : speed);
    const tz = (f.z * input.forward + r.z * input.strafe) * (this.flying ? FLY_SPEED : speed);

    const accel = this.onGround ? 40 : 10;
    const k = Math.min(1, accel * dt);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;

    // 水体状态
    const feetId = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.4), Math.floor(this.pos.z));
    const headId = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + this.eyeHeight), Math.floor(this.pos.z));
    this.inWater = feetId === WATER;
    this.headInWater = headId === WATER;

    if (this.flying) {
      const vy = (input.jump ? 1 : 0) + (input.sneak ? -1 : 0);
      this.vel.y += (vy * FLY_SPEED - this.vel.y) * Math.min(1, 10 * dt);
    } else if (this.inWater) {
      // 游泳：缓慢下沉 + 空格上浮
      const targetY = input.jump ? 4.2 : -1.2;
      this.vel.y += (targetY - this.vel.y) * Math.min(1, 8 * dt);
      if (input.jump && !this.headInWater) this.vel.y = 4.6;
    } else {
      this.vel.y -= GRAVITY * dt;
      if (this.vel.y < -50) this.vel.y = -50;
      if (input.jump && this.onGround) {
        this.vel.y = JUMP_SPEED;
        this.onGround = false;
      }
    }

    // 逐轴移动并解碰撞
    this.onGround = false;
    this.moveAxis('x', this.vel.x * dt);
    this.moveAxis('z', this.vel.z * dt);
    this.moveAxis('y', this.vel.y * dt);
  }

  aabb() {
    return {
      minX: this.pos.x - this.halfWidth,
      maxX: this.pos.x + this.halfWidth,
      minY: this.pos.y,
      maxY: this.pos.y + this.height,
      minZ: this.pos.z - this.halfWidth,
      maxZ: this.pos.z + this.halfWidth,
    };
  }

  moveAxis(axis, delta) {
    if (delta === 0) return;
    const before = this.pos[axis];
    this.pos[axis] += delta;
    const box = this.aabb();

    let x0 = Math.floor(box.minX), x1 = Math.floor(box.maxX);
    let y0 = Math.floor(box.minY), y1 = Math.floor(box.maxY);
    let z0 = Math.floor(box.minZ), z1 = Math.floor(box.maxZ);

    let hit = false;
    let boundary = 0;
    let minB = Infinity;
    let maxB = -Infinity;

    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          if (!this.world.collisionSolid(x, y, z)) continue;
          hit = true;
          if (axis === 'x') {
            if (delta > 0) minB = Math.min(minB, x);
            else maxB = Math.max(maxB, x + 1);
          } else if (axis === 'y') {
            if (delta > 0) minB = Math.min(minB, y);
            else maxB = Math.max(maxB, y + 1);
          } else {
            if (delta > 0) minB = Math.min(minB, z);
            else maxB = Math.max(maxB, z + 1);
          }
        }
      }
    }

    if (!hit) return;

    if (delta > 0) {
      if (axis === 'x') this.pos.x = minB - this.halfWidth - EPS;
      else if (axis === 'y') this.pos.y = minB - this.height - EPS;
      else this.pos.z = minB - this.halfWidth - EPS;
      this.vel[axis] = 0;
    } else {
      if (axis === 'x') this.pos.x = maxB + this.halfWidth + EPS;
      else if (axis === 'y') {
        this.pos.y = maxB + EPS;
        this.onGround = true;
      } else this.pos.z = maxB + this.halfWidth + EPS;
      this.vel[axis] = 0;
    }
  }
}
