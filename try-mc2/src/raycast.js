import { AIR } from "./blocks.js";

// Amanatides & Woo 体素 DDA 射线。
// 返回第一个非空气方块(含水/玻璃/树叶)与其命中面法线。
export function raycastVoxel(origin, dir, maxDist, world) {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;
  const stepZ = dir.z > 0 ? 1 : -1;

  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

  const nextX = dir.x > 0 ? x + 1 : x;
  const nextY = dir.y > 0 ? y + 1 : y;
  const nextZ = dir.z > 0 ? z + 1 : z;

  let tMaxX = dir.x !== 0 ? (nextX - origin.x) / dir.x : Infinity;
  let tMaxY = dir.y !== 0 ? (nextY - origin.y) / dir.y : Infinity;
  let tMaxZ = dir.z !== 0 ? (nextZ - origin.z) / dir.z : Infinity;

  let normalX = 0;
  let normalY = 0;
  let normalZ = 0;
  let t = 0;

  for (let i = 0; i < 256; i++) {
    const block = world.getBlock(x, y, z);
    if (block !== AIR) {
      return {
        x, y, z, block,
        nx: normalX, ny: normalY, nz: normalZ,
        distance: t,
        point: {
          x: origin.x + dir.x * t,
          y: origin.y + dir.y * t,
          z: origin.z + dir.z * t,
        },
      };
    }

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      t = tMaxX;
      tMaxX += tDeltaX;
      x += stepX;
      normalX = -stepX;
      normalY = 0;
      normalZ = 0;
    } else if (tMaxY < tMaxZ) {
      t = tMaxY;
      tMaxY += tDeltaY;
      y += stepY;
      normalX = 0;
      normalY = -stepY;
      normalZ = 0;
    } else {
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      z += stepZ;
      normalX = 0;
      normalY = 0;
      normalZ = -stepZ;
    }

    if (t > maxDist) break;
  }
  return null;
}
