// 第一人称玩家：移动、重力、AABB 体素碰撞与飞行模式。
import * as THREE from 'three';
import { B } from './blocks.js';

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;

const HALF = PLAYER_WIDTH / 2;
const EPS = 0.001;

const GRAVITY = 26;
const JUMP_SPEED = 8.4;
const WALK_SPEED = 4.6;
const SPRINT_SPEED = 7.0;
const FLY_SPEED = 11;
const MAX_FALL = 55;

export class Player {
  constructor(world, spawnX, spawnY, spawnZ, yaw = 0, pitch = 0) {
    this.world = world;
    this.pos = new THREE.Vector3(spawnX + 0.5, spawnY, spawnZ + 0.5);
    this.vel = new THREE.Vector3();
    this.yaw = yaw;
    this.pitch = pitch;
    this.onGround = false;
    this.fly = false;
    this.spawn = this.pos.clone();
  }

  aabb(pos = this.pos) {
    return {
      minX: pos.x - HALF, maxX: pos.x + HALF,
      minY: pos.y, maxY: pos.y + PLAYER_HEIGHT,
      minZ: pos.z - HALF, maxZ: pos.z + HALF
    };
  }

  collides(aabb) {
    const x0 = Math.floor(aabb.minX);
    const x1 = Math.floor(aabb.maxX - EPS);
    const y0 = Math.floor(aabb.minY);
    const y1 = Math.floor(aabb.maxY - EPS);
    const z0 = Math.floor(aabb.minZ);
    const z1 = Math.floor(aabb.maxZ - EPS);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (this.world.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  moveAxis(axis, amount) {
    if (amount === 0) return;
    this.pos[axis] += amount;
    const aabb = this.aabb();

    const x0 = Math.floor(aabb.minX);
    const x1 = Math.floor(aabb.maxX - EPS);
    const y0 = Math.floor(aabb.minY);
    const y1 = Math.floor(aabb.maxY - EPS);
    const z0 = Math.floor(aabb.minZ);
    const z1 = Math.floor(aabb.maxZ - EPS);

    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (!this.world.isSolid(x, y, z)) continue;

          if (axis === 'x') {
            this.pos.x = amount > 0 ? x - HALF - EPS : x + 1 + HALF + EPS;
          } else if (axis === 'y') {
            if (amount > 0) {
              this.pos.y = y - PLAYER_HEIGHT - EPS;
            } else {
              this.pos.y = y + 1 + EPS;
              this.onGround = true;
            }
          } else {
            this.pos.z = amount > 0 ? z - HALF - EPS : z + 1 + HALF + EPS;
          }
          this.vel[axis] = 0;
          return;
        }
      }
    }
  }

  update(dt, input) {
    if (dt <= 0) return;
    const wasOnGround = this.onGround;
    this.onGround = false;

    const feetInWater =
      this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z)) === B.WATER;
    const headInWater =
      this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + PLAYER_HEIGHT * 0.65), Math.floor(this.pos.z)) === B.WATER;
    const inWater = feetInWater || headInWater;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);

    if (this.fly) {
      this.vel.x = 0;
      this.vel.z = 0;
      this.vel.y = 0;

      const forward = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
      const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const up = (input.jump ? 1 : 0) - (input.down ? 1 : 0);

      // 飞行方向取水平视线方向
      const dir = new THREE.Vector3(
        sin * forward + Math.sin(this.yaw + Math.PI / 2) * strafe,
        0,
        -cos * forward - Math.cos(this.yaw + Math.PI / 2) * strafe
      );
      if (dir.lengthSq() > 0) dir.normalize().multiplyScalar(FLY_SPEED);
      this.vel.x = dir.x;
      this.vel.z = dir.z;
      this.vel.y = up * FLY_SPEED;
    } else {
      // 地面加速度（简单直接速度控制，手感接近原版）
      const speed = (input.sprint ? SPRINT_SPEED : WALK_SPEED) * (inWater ? 0.55 : 1);
      const forward = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
      const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);

      let mx = 0;
      let mz = 0;
      if (forward !== 0 || strafe !== 0) {
        const dir = new THREE.Vector3(
          sin * forward + Math.sin(this.yaw + Math.PI / 2) * strafe,
          0,
          -cos * forward - Math.cos(this.yaw + Math.PI / 2) * strafe
        );
        dir.normalize().multiplyScalar(speed);
        mx = dir.x;
        mz = dir.z;
      }
      this.vel.x = mx;
      this.vel.z = mz;

      if (inWater) {
        // 游泳：缓慢下沉，按住空格上浮
        this.vel.y -= 7 * dt;
        if (input.jump) {
          this.vel.y = Math.min(this.vel.y + 26 * dt, 3.4);
        }
      } else {
        if (input.jump && wasOnGround) {
          this.vel.y = JUMP_SPEED;
        }
        this.vel.y -= GRAVITY * dt;
      }
      if (this.vel.y < -MAX_FALL) this.vel.y = -MAX_FALL;
    }

    // 分轴移动并碰撞，避免卡墙角与穿墙
    this.moveAxis('x', this.vel.x * dt);
    this.moveAxis('z', this.vel.z * dt);
    this.moveAxis('y', this.vel.y * dt);

    // 防掉出世界
    if (this.pos.y < -20) {
      this.respawn();
    }
  }

  respawn() {
    this.pos.copy(this.spawn);
    this.vel.set(0, 0, 0);
  }

  toggleFly() {
    this.fly = !this.fly;
    this.vel.set(0, 0, 0);
    return this.fly;
  }
}
