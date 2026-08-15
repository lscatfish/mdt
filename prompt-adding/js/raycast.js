// Voxel raycast (Amanatides & Woo grid traversal). Pure logic.
import { BLOCK, FACE, FACE_NORMAL, PHYS } from "./config.js";

// Cast a ray through the voxel grid.
// Returns { x, y, z, face, dist, hx, hy, hz } for the first non-air block,
// or null if nothing is hit within maxDist.
export function raycastVoxel(world, ox, oy, oz, dx, dy, dz, maxDist = PHYS.REACH) {
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tmx = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tdx : Infinity;
  let tmy = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tdy : Infinity;
  let tmz = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tdz : Infinity;
  let t = 0;
  let face = -1;

  for (let i = 0; i < 512; i++) {
    const b = world.getBlock(x, y, z);
    if (b !== BLOCK.AIR) {
      return { x, y, z, face, dist: t, hx: ox + dx * t, hy: oy + dy * t, hz: oz + dz * t };
    }
    if (tmx > maxDist && tmy > maxDist && tmz > maxDist) return null;
    if (tmx < tmy && tmx < tmz) {
      x += stepX;
      t = tmx;
      tmx += tdx;
      face = stepX > 0 ? FACE.NX : FACE.PX;
    } else if (tmy < tmz) {
      y += stepY;
      t = tmy;
      tmy += tdy;
      face = stepY > 0 ? FACE.NY : FACE.PY;
    } else {
      z += stepZ;
      t = tmz;
      tmz += tdz;
      face = stepZ > 0 ? FACE.NZ : FACE.PZ;
    }
  }
  return null;
}

// The adjacent block position for placing against a ray hit.
export function placementPosition(hit) {
  const n = FACE_NORMAL[hit.face];
  return { x: hit.x + n[0], y: hit.y + n[1], z: hit.z + n[2] };
}
