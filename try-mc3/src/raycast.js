// 体素射线检测（Amanatides & Woo DDA），用于方块瞄准。
import { BY_ID, IDs } from './blocks.js';

export function raycast(world, origin, dir, maxDist) {
  let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;
  const stepZ = dir.z > 0 ? 1 : -1;

  const tDX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

  let tMX = (dir.x !== 0 ? (stepX > 0 ? x + 1 - origin.x : origin.x - x) : Infinity) * tDX;
  let tMY = (dir.y !== 0 ? (stepY > 0 ? y + 1 - origin.y : origin.y - y) : Infinity) * tDY;
  let tMZ = (dir.z !== 0 ? (stepZ > 0 ? z + 1 - origin.z : origin.z - z) : Infinity) * tDZ;

  let nx = 0, ny = 0, nz = 0;
  let t = 0;

  for (let i = 0; i < 220; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== IDs.AIR && !BY_ID[id].liquid) {
      return { x, y, z, id, nx, ny, nz };
    }
    if (tMX < tMY && tMX < tMZ) {
      x += stepX; t = tMX; tMX += tDX;
      nx = -stepX; ny = 0; nz = 0;
    } else if (tMY < tMZ) {
      y += stepY; t = tMY; tMY += tDY;
      nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ; t = tMZ; tMZ += tDZ;
      nx = 0; ny = 0; nz = -stepZ;
    }
    if (t > maxDist) return null;
  }
  return null;
}
