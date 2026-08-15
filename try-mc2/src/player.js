import * as THREE from "../vendor/three.module.js";
import { CFG } from "./config.js";
import { WATER, isSolid } from "./blocks.js";

const HW = CFG.PLAYER_WIDTH / 2; // 0.3
const HH = CFG.PLAYER_HEIGHT / 2; // 0.9
const EPS = 1e-4;

export class Player {
  constructor(world, spawn) {
    this.world = world;
    this.spawn = spawn.clone();
    this.pos = spawn.clone();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.05;
    this.onGround = false;
    this.inWater = false;
    this.eyeInWater = false;
    this.eyeHeight = CFG.EYE_HEIGHT;
    this.health = 20;
    this.mode = "survival"; // 'survival' | 'creative'
    this.flying = false;
    this.fallDistance = 0;
    this.lastJumpTime = -1;
    this.stepTimer = 0;
    this.onHurt = null; // 回调
  }

  get eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  get creative() {
    return this.mode === "creative";
  }

  lookAt(offsetX, offsetY) {
    const sensitivity = 0.0022;
    this.yaw -= offsetX * sensitivity;
    this.pitch -= offsetY * sensitivity;
    const lim = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  cameraQuaternion(out) {
    return out.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
  }

  update(dt, input) {
    const world = this.world;

    // 视线朝向的目标眼高(潜行时降低)
    const targetEye = input.sneak && !this.creative ? CFG.EYE_HEIGHT - 0.17 : CFG.EYE_HEIGHT;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 12);

    // 前后左右方向
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    const moveF = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const moveR = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    wish.addScaledVector(forward, moveF).addScaledVector(right, moveR);
    if (wish.lengthSq() > 1) wish.normalize();

    // 水中状态
    const feetBlock = world.getBlock(
      Math.floor(this.pos.x),
      Math.floor(this.pos.y + 0.2),
      Math.floor(this.pos.z),
    );
    const headBlock = world.getBlock(
      Math.floor(this.pos.x),
      Math.floor(this.pos.y + CFG.EYE_HEIGHT),
      Math.floor(this.pos.z),
    );
    this.inWater = feetBlock === WATER;
    this.eyeInWater = headBlock === WATER;

    let speed = input.sneak && !this.creative ? CFG.SNEAK_SPEED : CFG.WALK_SPEED;
    if (input.sprint && moveF > 0 && !input.sneak) speed = CFG.SPRINT_SPEED;
    if (this.inWater) speed *= 0.62;

    // 水平速度平滑趋近
    const accel = this.onGround ? 12 : 6;
    const k = Math.min(1, dt * accel);
    this.vel.x += (wish.x * speed - this.vel.x) * k;
    this.vel.z += (wish.z * speed - this.vel.z) * k;

    if (this.creative && this.flying) {
      const fy = (input.jump ? 1 : 0) - (input.sneak ? 1 : 0);
      this.vel.y += (fy * CFG.FLY_SPEED - this.vel.y) * Math.min(1, dt * 8);
      this.onGround = false;
    } else if (this.creative) {
      // 创造模式:仍然有重力,但无跌落伤害
      this.vel.y -= CFG.GRAVITY * dt;
      if (this.onGround && input.jump) {
        this.vel.y = CFG.JUMP_SPEED;
        this.onGround = false;
      }
    } else if (this.inWater) {
      this.vel.y -= CFG.GRAVITY * 0.12 * dt;
      this.vel.y *= Math.max(0, 1 - dt * 1.8);
      if (input.jump) this.vel.y = Math.min(this.vel.y + 28 * dt, 4.2);
      this.vel.y = Math.max(this.vel.y, -6);
      this.fallDistance = 0;
    } else {
      this.vel.y -= CFG.GRAVITY * dt;
      if (this.onGround && input.jump) {
        this.vel.y = CFG.JUMP_SPEED;
        this.onGround = false;
        this.fallDistance = 0;
      }
      this.vel.y = Math.max(this.vel.y, -55);
    }

    // 三段式 AABB 碰撞
    this.onGround = false;
    this.moveAxis(0, this.vel.x * dt);
    this.moveAxis(1, this.vel.y * dt);
    this.moveAxis(2, this.vel.z * dt);

    if (this.onGround) {
      this.vel.y = 0;
      if (this.fallDistance > 3 && this.mode === "survival") {
        const dmg = Math.floor(this.fallDistance - 3);
        this.hurt(dmg);
      }
      this.fallDistance = 0;
    } else if (this.vel.y < 0 && this.mode === "survival" && !this.inWater) {
      this.fallDistance += -this.vel.y * dt;
    }

    // 脚步声
    if (this.onGround && wish.lengthSq() > 0.1) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = input.sprint ? 0.32 : 0.44;
        return "step";
      }
    }
    return null;
  }

  moveAxis(axis, amount) {
    if (amount === 0) return;
    const p = this.pos;
    p.setComponent(axis, p.getComponent(axis) + amount);

    const minX = p.x - HW;
    const maxX = p.x + HW;
    const minY = p.y;
    const maxY = p.y + HH * 2;
    const minZ = p.z - HW;
    const maxZ = p.z + HW;

    const x0 = Math.floor(minX);
    const x1 = Math.floor(maxX);
    const y0 = Math.floor(minY);
    const y1 = Math.floor(maxY);
    const z0 = Math.floor(minZ);
    const z1 = Math.floor(maxZ);

    for (let by = y0; by <= y1; by++) {
      for (let bz = z0; bz <= z1; bz++) {
        for (let bx = x0; bx <= x1; bx++) {
          if (!isSolid(this.world.getBlock(bx, by, bz))) continue;
          if (minX < bx + 1 && maxX > bx && minY < by + 1 && maxY > by && minZ < bz + 1 && maxZ > bz) {
            if (axis === 0) {
              p.x = amount > 0 ? bx - HW - EPS : bx + 1 + HW + EPS;
              this.vel.x = 0;
            } else if (axis === 1) {
              if (amount < 0) {
                p.y = by + 1 + EPS;
                this.onGround = true;
              } else {
                p.y = by - HH * 2 - EPS;
              }
              this.vel.y = 0;
            } else {
              p.z = amount > 0 ? bz - HW - EPS : bz + 1 + HW + EPS;
              this.vel.z = 0;
            }
            return;
          }
        }
      }
    }
  }

  hurt(amount) {
    if (this.mode !== "survival" || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    if (this.onHurt) this.onHurt(amount);
    if (this.health <= 0) this.respawn();
  }

  respawn() {
    this.pos.copy(this.spawn);
    this.vel.set(0, 0, 0);
    this.health = 20;
    this.fallDistance = 0;
    this.flying = false;
    if (this.onHurt) this.onHurt(-1); // -1 表示重生
  }
}
