// Chunk meshing: turn voxel data into vertex buffers.
// Vertex layout: 6 floats per vertex — position.xyz, uv.xy, shade.
// Faces are culled between blocks per config.faceVisible; vertices are
// placed EXACTLY on the unit-cube boundaries of each block (no offsets),
// so display geometry and block coordinates stay perfectly aligned.
// Pure logic — no DOM. Unit-testable in Node.

import {
  BLOCK, CHUNK_SIZE, WORLD_HEIGHT,
  FACE_CORNERS, FACE_NORMAL, FACE_SHADE, FACE_TILE, FACE_UV,
  RENDER_CLASS, RENDER_TRANSLUCENT, faceVisible,
  ATLAS_COLS, TILE_PX,
} from "./config.js";

const VERTEX_FLOATS = 6;
const VERTICES_PER_FACE = 6; // two triangles
const TRIANGLE_INDEX = [0, 1, 2, 0, 2, 3];

// Tile-space UV (0..1) for one tile corner; half-texel inset avoids bleeding.
function tileUV(tile, u, v) {
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const inset = 0.5 / TILE_PX;
  return [
    (col + inset + u * (1 - 2 * inset)) / ATLAS_COLS,
    (row + inset + v * (1 - 2 * inset)) / ATLAS_COLS,
  ];
}

// Build mesh for one chunk. Uses world.peekBlock so missing neighbour
// chunks read as air (border faces stay visible; no generation recursion).
// Returns { opaque: Float32Array, translucent: Float32Array }.
export function buildChunkMesh(world, cx, cz) {
  const data = world.getChunkData(cx, cz);
  if (!data) return { opaque: new Float32Array(0), translucent: new Float32Array(0) };
  const opaque = [];
  const translucent = [];
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;

  for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const b = data[(ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
        if (b === BLOCK.AIR) continue;
        const target = RENDER_CLASS[b] === RENDER_TRANSLUCENT ? translucent : opaque;
        const wx = x0 + lx;
        const wy = ly;
        const wz = z0 + lz;
        for (let f = 0; f < 6; f++) {
          const n = FACE_NORMAL[f];
          const nb = world.peekBlock(wx + n[0], wy + n[1], wz + n[2]);
          if (!faceVisible(b, nb)) continue;
          const tile = FACE_TILE[b][f];
          const shade = FACE_SHADE[f];
          const corners = FACE_CORNERS[f];
          for (const tri of TRIANGLE_INDEX) {
            const corner = corners[tri];
            const uv = tileUV(tile, FACE_UV[tri][0], FACE_UV[tri][1]);
            target.push(
              wx + corner[0], wy + corner[1], wz + corner[2],
              uv[0], uv[1], shade,
            );
          }
        }
      }
    }
  }
  return {
    opaque: new Float32Array(opaque),
    translucent: new Float32Array(translucent),
  };
}

export { VERTEX_FLOATS, VERTICES_PER_FACE };
