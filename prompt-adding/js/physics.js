// Player physics: AABB collision against the voxel grid, gravity, jump, fly.
// Pure logic — no DOM. Unit-testable in Node.
import { isSolid, PHYS } from "./config.js";

const WORLD_FALL_LIMIT = 128;

// Forward direction vector for a yaw/pitch camera orientation.
export function dirFromYawPitch(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

export class Player {
  constructor(x, y, z, yaw = 0, pitch = 0) {
    this.pos = { x, y, z }; // feet position (block units)
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = yaw;
    this.pitch = pitch;
    this.onGround = false;
    this.flying = false;
    this.sprint = false;
  }

  get eye() {
    return { x: this.pos.x, y: this.pos.y + PHYS.EYE_HEIGHT, z: this.pos.z };
  }

  // Does the player AABB at (px,py,pz) [feet] overlap any solid block?
  collidesAt(world, px, py, pz) {
    const hw = PHYS.PLAYER_WIDTH / 2;
    const minX = px - hw;
    const maxX = px + hw;
    const minY = py;
    const maxY = py + PHYS.PLAYER_HEIGHT;
    const minZ = pz - hw;
    const maxZ = pz + hw;
    const x0 = Math.floor(minX);
    const x1 = Math.floor(maxX - PHYS.STEP_EPS);
    const y0 = Math.floor(minY);
    const y1 = Math.floor(maxY - PHYS.STEP_EPS);
    const z0 = Math.floor(minZ);
    const z1 = Math.floor(maxZ - PHYS.STEP_EPS);
    for (let by = y0; by <= y1; by++) {
      for (let bz = z0; bz <= z1; bz++) {
        for (let bx = x0; bx <= x1; bx++) {
          if (isSolid(world.getBlock(bx, by, bz))) return true;
        }
      }
    }
    return false;
  }

  // Advance one physics step.
  // input: { fwd, back, left, right, jump, sneak, flyUp, flyDown } booleans.
  step(world, dt, input = {}) {
    const speed = this.flying
      ? PHYS.FLY_SPEED
      : this.sprint ? PHYS.SPRINT_SPEED : PHYS.WALK_SPEED;

    let mx = 0, mz = 0;
    if (input.fwd) { mx += -Math.sin(this.yaw); mz += -Math.cos(this.yaw); }
    if (input.back) { mx += Math.sin(this.yaw); mz += Math.cos(this.yaw); }
    if (input.right) { mx += Math.cos(this.yaw); mz += -Math.sin(this.yaw); }
    if (input.left) { mx += -Math.cos(this.yaw); mz += Math.sin(this.yaw); }
    const len = Math.hypot(mx, mz);
    if (len > 1e-9) { mx /= len; mz /= len; }
    if (input.sneak && !this.flying) { mx *= 0.4; mz *= 0.4; }
    this.vel.x = mx * speed;
    this.vel.z = mz * speed;

    if (this.flying) {
      this.vel.y = 0;
      if (input.jump) this.vel.y += PHYS.FLY_VERT_SPEED;
      if (input.flyDown) this.vel.y -= PHYS.FLY_VERT_SPEED;
      this.moveAxis(world, dt, "x");
      this.moveAxis(world, dt, "z");
      this.moveAxis(world, dt, "y");
      this.onGround = false;
    } else {
      if (input.jump && this.onGround) this.vel.y = PHYS.JUMP_SPEED;
      this.vel.y -= PHYS.GRAVITY * dt;
      if (this.vel.y < -40) this.vel.y = -40;
      this.moveAxis(world, dt, "x");
      this.moveAxis(world, dt, "z");
      this.moveAxis(world, dt, "y");
      // Ground probe: 1cm below the feet.
      this.onGround = this.collidesAt(world, this.pos.x, this.pos.y - 0.01, this.pos.z);
    }
    // Keep the player inside world height.
    if (this.pos.y < -WORLD_FALL_LIMIT) this.pos.y = -WORLD_FALL_LIMIT;
  }

  moveAxis(world, dt, axis) {
    const d = this.vel[axis] * dt;
    if (d === 0) return;
    const EPS = PHYS.STEP_EPS;
    const hw = PHYS.PLAYER_WIDTH / 2;
    this.pos[axis] += d;
    if (!this.collidesAt(world, this.pos.x, this.pos.y, this.pos.z)) return;
    // Snap back to the grid boundary of the penetrated block.
    if (axis === "x") {
      if (d > 0) {
        this.pos.x = Math.floor(this.pos.x + hw) - hw - EPS;
        while (this.collidesAt(world, this.pos.x, this.pos.y, this.pos.z)) this.pos.x -= 1;
      } else {
        this.pos.x = Math.ceil(this.pos.x - hw) + hw + EPS;
        while (this.collidesAt(world, this.pos.x, this.pos.y, this.pos.z)) this.pos.x += 1;
      }
    } else if (axis === "z") {
      if (d > 0) {
        this.pos.z = Math.floor(this.pos.z + hw) - hw - EPS;
        while (this.collidesAt(world, this.pos.x, this.pos.y, this.pos.z)) this.pos.z -= 1;
      } else {
        this.pos.z = Math.ceil(this.pos.z - hw) + hw + EPS;
        while (this.collidesAt(world, this.pos.x, this.pos.y, this.pos.z)) this.pos.z += 1;
      }
    } else {
      if (d > 0) {
        this.pos.y = Math.floor(this.pos.y + PHYS.PLAYER_HEIGHT) - PHYS.PLAYER_HEIGHT - EPS;
        while (this.collidesAt(world, this.pos.x, this.pos.y, this.pos.z)) this.pos.y -= 1;
      } else {
        this.pos.y = Math.floor(this.pos.y) + 1 + EPS;
        while (this.collidesAt(world, this.pos.x, this.pos.y, this.pos.z)) this.pos.y += 1;
      }
    }
    this.vel[axis] = 0;
  }
}
