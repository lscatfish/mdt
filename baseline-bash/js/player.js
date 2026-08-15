// 第一人称玩家：移动、跳跃、飞行与 AABB 体素碰撞
import * as THREE from '../vendor/three.module.js';
import { BLOCK } from './config.js';

const PLAYER_HALF = 0.3;
const PLAYER_HEIGHT = 1.8;
const EYE_HEIGHT = 1.62;
const EPS = 0.001;

export class Player {
  constructor(world, camera, spawn) {
    this.world = world;
    this.camera = camera;
    this.spawn = spawn;
    this.position = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.fly = false;
    this.inWater = false;
  }

  collidesAt(px, py, pz) {
    return this.world.isBoxBlocked(
      px - PLAYER_HALF + EPS,
      py + EPS,
      pz - PLAYER_HALF + EPS,
      px + PLAYER_HALF - EPS,
      py + PLAYER_HEIGHT - EPS,
      pz + PLAYER_HALF - EPS
    );
  }

  hasSupport(px, py, pz) {
    return this.world.isBoxBlocked(
      px - PLAYER_HALF + EPS,
      py - 0.02,
      pz - PLAYER_HALF + EPS,
      px + PLAYER_HALF - EPS,
      py - 0.02,
      pz + PLAYER_HALF - EPS
    );
  }

  update(dt, input) {
    const pos = this.position;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);

    // 水中状态（胸部位置为水方块）
    const waterBlockId = this.world.getBlock(
      Math.floor(pos.x),
      Math.floor(pos.y + 0.5),
      Math.floor(pos.z)
    );
    this.inWater = waterBlockId === BLOCK.WATER;

    let speed = this.fly ? 11 : 4.3;
    if (!this.fly && input.sprint) speed = 6.4;
    if (!this.fly && input.sneak) speed = 2.0;
    if (!this.fly && this.inWater) speed = 2.2;

    const forwardX = -sin;
    const forwardZ = -cos;
    const rightX = cos;
    const rightZ = -sin;

    const wishX = forwardX * input.forward + rightX * input.strafe;
    const wishZ = forwardZ * input.forward + rightZ * input.strafe;
    const len = Math.hypot(wishX, wishZ) || 1;

    const targetVX = (wishX / len) * speed * Math.min(1, len);
    const targetVZ = (wishZ / len) * speed * Math.min(1, len);

    if (this.fly) {
      const targetVY = (input.flyUp - input.flyDown) * 11;
      const k = 1 - Math.exp(-10 * dt);
      this.velocity.x += (targetVX - this.velocity.x) * k;
      this.velocity.z += (targetVZ - this.velocity.z) * k;
      this.velocity.y += (targetVY - this.velocity.y) * k;
      this.onGround = false;
    } else {
      const k = 1 - Math.exp(-14 * dt);
      this.velocity.x += (targetVX - this.velocity.x) * k;
      this.velocity.z += (targetVZ - this.velocity.z) * k;

      const gravity = this.inWater ? 6 : 26;
      this.velocity.y -= gravity * dt;
      if (this.velocity.y < -50) this.velocity.y = -50;

      if (input.jump && (this.onGround || this.inWater)) {
        this.velocity.y = this.inWater ? 4.6 : 8.4;
        this.onGround = false;
      }
    }

    this.moveAxis('x', this.velocity.x * dt);
    this.moveAxis('z', this.velocity.z * dt);
    this.moveAxis('y', this.velocity.y * dt);

    if (!this.fly) {
      this.onGround = this.hasSupport(pos.x, pos.y, pos.z);
    }

    // 掉出世界后回到出生点
    if (pos.y < -20) {
      pos.copy(this.spawn);
      this.velocity.set(0, 0, 0);
    }

    this.camera.position.set(pos.x, pos.y + EYE_HEIGHT, pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  moveAxis(axis, delta) {
    if (delta === 0) return;
    const pos = this.position;
    const test = pos.clone();
    test[axis] += delta;

    if (this.collidesAt(test.x, test.y, test.z)) {
      if (axis === 'y') {
        if (delta < 0) {
          pos.y = Math.ceil(pos.y + delta) + EPS;
          this.velocity.y = 0;
          this.onGround = true;
        } else {
          pos.y = Math.floor(pos.y + PLAYER_HEIGHT + delta) - PLAYER_HEIGHT - EPS;
          this.velocity.y = 0;
        }
      } else {
        const half = PLAYER_HALF;
        if (delta > 0) {
          pos[axis] = Math.floor(pos[axis] + half + delta) - half - EPS;
        } else {
          pos[axis] = Math.ceil(pos[axis] - half + delta) + half + EPS;
        }
      }
    } else {
      pos.copy(test);
      if (axis === 'y' && delta < 0 && this.hasSupport(pos.x, pos.y, pos.z)) {
        this.onGround = true;
        this.velocity.y = 0;
      }
    }
  }

  /** 用于放置方块时判断是否会与自身重叠 */
  intersectsBlock(x, y, z) {
    return (
      x + 1 > this.position.x - PLAYER_HALF &&
      x < this.position.x + PLAYER_HALF &&
      y + 1 > this.position.y &&
      y < this.position.y + PLAYER_HEIGHT &&
      z + 1 > this.position.z - PLAYER_HALF &&
      z < this.position.z + PLAYER_HALF
    );
  }
}
