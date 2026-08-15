// WebGL renderer: chunk meshes, sky/fog, day-night lighting, block highlight.
// Browser-only. Exposes samplePixels() (readPixels) for pixel-level tests.
import { CHUNK_SIZE, FACE_SHADE, FACE_TILE } from "./config.js";
import { texelAt, getAtlasCanvas } from "./textures.js";
import { dirFromYawPitch } from "./physics.js";

// ---- small mat4 helpers -------------------------------------------------

function mat4Perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = (far + near) / (near - far); out[11] = -1;
  out[12] = 0; out[13] = 0; out[14] = (2 * far * near) / (near - far); out[15] = 0;
}

function mat4Multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
}

function mat4LookAt(out, eye, center, up) {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  let xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  out[0] = xx; out[4] = xy; out[8] = xz; out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[1] = yx; out[5] = yy; out[9] = yz; out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[2] = zx; out[6] = zy; out[10] = zz; out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[3] = 0; out[7] = 0; out[11] = 0; out[15] = 1;
}

// ---- day/night ----------------------------------------------------------

const SKY_DAY = [0.53, 0.72, 0.97];
const SKY_NIGHT = [0.035, 0.055, 0.15];
const SKY_DUSK = [0.95, 0.55, 0.42];

export function daylightOf(timeOfDay) {
  const c = Math.cos(timeOfDay * Math.PI * 2);
  return Math.max(0, Math.min(1, (c + 0.15) / 1.15));
}

// RGB 0..1 sky/fog color for a given time of day.
export function skyColorFor(timeOfDay) {
  const day = daylightOf(timeOfDay);
  const dusk = Math.max(0, 1 - Math.abs(Math.cos(timeOfDay * Math.PI * 2)) * 1.6);
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const base = SKY_NIGHT[i] + (SKY_DAY[i] - SKY_NIGHT[i]) * day;
    out[i] = base + (SKY_DUSK[i] - base) * dusk * (1 - day) * 0.55;
  }
  return out;
}

export function lightFactor(timeOfDay) {
  return 0.35 + 0.65 * daylightOf(timeOfDay);
}

// Sun direction (world space, not normalized by length) for HUD disc.
export function sunDirection(timeOfDay) {
  const a = timeOfDay * Math.PI * 2 + Math.PI / 2;
  return [Math.cos(a) * 0.55, Math.sin(a), 0.42];
}

// ---- shaders ------------------------------------------------------------

const TERRAIN_VS = `
attribute vec3 aPos;
attribute vec2 aUV;
attribute float aShade;
uniform mat4 uProj;
uniform mat4 uView;
varying vec2 vUV;
varying float vShade;
varying float vDist;
void main() {
  vec4 viewPos = uView * vec4(aPos, 1.0);
  gl_Position = uProj * viewPos;
  vUV = aUV;
  vShade = aShade;
  vDist = length(viewPos.xyz);
}`;

const TERRAIN_FS = `
precision mediump float;
uniform sampler2D uAtlas;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uLight;
varying vec2 vUV;
varying float vShade;
varying float vDist;
void main() {
  vec4 tex = texture2D(uAtlas, vUV);
  if (tex.a < 0.1) discard; // only fully-transparent texels (leaf holes)
  vec3 color = tex.rgb * vShade * uLight;
  float fog = clamp((vDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(color, uFogColor, fog), tex.a);
}`;

const LINES_VS = `
attribute vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uOrigin;
uniform float uScale;
void main() {
  vec3 p = uOrigin + aPos * uScale;
  gl_Position = uProj * (uView * vec4(p, 1.0));
}`;

const LINES_FS = `
precision mediump float;
uniform vec4 uColor;
void main() { gl_FragColor = uColor; }`;

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error("shader compile error: " + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function makeProgram(gl, vsSrc, fsSrc, attribs) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc));
  for (const a of attribs) gl.bindAttribLocation(prog, a.location, a.name);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("program link error: " + gl.getProgramInfoLog(prog));
  }
  return prog;
}

// ---- renderer -----------------------------------------------------------

const VERTEX_FLOATS = 6;

export class Renderer {
  constructor(canvas, world) {
    this.world = world;
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl", {
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    }) || canvas.getContext("experimental-webgl", { preserveDrawingBuffer: true });
    if (!this.gl) throw new Error("WebGL not supported");
    const gl = this.gl;

    this.terrainProg = makeProgram(gl, TERRAIN_VS, TERRAIN_FS, [
      { location: 0, name: "aPos" }, { location: 1, name: "aUV" }, { location: 2, name: "aShade" },
    ]);
    this.linesProg = makeProgram(gl, LINES_VS, LINES_FS, [{ location: 0, name: "aPos" }]);

    this.uTerrain = {
      proj: gl.getUniformLocation(this.terrainProg, "uProj"),
      view: gl.getUniformLocation(this.terrainProg, "uView"),
      atlas: gl.getUniformLocation(this.terrainProg, "uAtlas"),
      fogColor: gl.getUniformLocation(this.terrainProg, "uFogColor"),
      fogNear: gl.getUniformLocation(this.terrainProg, "uFogNear"),
      fogFar: gl.getUniformLocation(this.terrainProg, "uFogFar"),
      light: gl.getUniformLocation(this.terrainProg, "uLight"),
    };
    this.uLines = {
      proj: gl.getUniformLocation(this.linesProg, "uProj"),
      view: gl.getUniformLocation(this.linesProg, "uView"),
      origin: gl.getUniformLocation(this.linesProg, "uOrigin"),
      scale: gl.getUniformLocation(this.linesProg, "uScale"),
      color: gl.getUniformLocation(this.linesProg, "uColor"),
    };

    // texture atlas
    const atlas = getAtlasCanvas();
    this.atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    // unit-cube wireframe (12 edges) centered at origin
    const lineVerts = [];
    const C = 0.5;
    const edges = [
      [-C, -C, -C, C, -C, -C], [-C, C, -C, C, C, -C], [-C, -C, C, C, -C, C], [-C, C, C, C, C, C],
      [-C, -C, -C, -C, C, -C], [C, -C, -C, C, C, -C], [-C, -C, C, -C, C, C], [C, -C, C, C, C, C],
      [-C, -C, -C, -C, -C, C], [C, -C, -C, C, -C, C], [-C, C, -C, -C, C, C], [C, C, -C, C, C, C],
    ];
    for (const e of edges) lineVerts.push(...e);
    this.lineBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lineVerts), gl.STATIC_DRAW);

    this.chunkBuffers = new Map(); // key -> {opaque:{buf,count}, translucent:{buf,count}}
    this.proj = new Float32Array(16);
    this.view = new Float32Array(16);
    this.projView = new Float32Array(16);
    this.width = 1;
    this.height = 1;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.clearDepth(1.0);
  }

  resize(w, h) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.gl.viewport(0, 0, this.width, this.height);
  }

  uploadChunkMesh(key, mesh) {
    const gl = this.gl;
    this.removeChunkMesh(key);
    const entry = { opaque: null, translucent: null };
    for (const kind of ["opaque", "translucent"]) {
      if (!mesh[kind].length) continue;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, mesh[kind], gl.STATIC_DRAW);
      entry[kind] = { buf, count: mesh[kind].length / VERTEX_FLOATS };
    }
    this.chunkBuffers.set(key, entry);
  }

  removeChunkMesh(key) {
    const entry = this.chunkBuffers.get(key);
    if (entry) {
      for (const kind of ["opaque", "translucent"]) {
        if (entry[kind]) this.gl.deleteBuffer(entry[kind].buf);
      }
      this.chunkBuffers.delete(key);
    }
  }

  render(camera, timeOfDay, highlight) {
    const gl = this.gl;
    const eye = camera;
    const fwd = dirFromYawPitch(camera.yaw, camera.pitch);
    const sky = skyColorFor(timeOfDay);
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    mat4Perspective(this.proj, (70 * Math.PI) / 180, this.width / this.height, 0.08, 600);
    mat4LookAt(this.view,
      [eye.x, eye.y, eye.z],
      [eye.x + fwd.x, eye.y + fwd.y, eye.z + fwd.z],
      [0, 1, 0]);
    mat4Multiply(this.projView, this.proj, this.view);

    const R = camera.viewRadius ?? 8;
    const pcx = Math.floor(eye.x / CHUNK_SIZE);
    const pcz = Math.floor(eye.z / CHUNK_SIZE);

    // collect visible chunks
    const drawOpaque = this._drawOpaque;
    const drawTrans = this._drawTrans;
    drawOpaque.length = 0;
    drawTrans.length = 0;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > R * R + 1) continue;
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = cx + "," + cz;
        const entry = this.chunkBuffers.get(key);
        if (!entry) continue;
        // cheap behind-camera cull using the chunk center
        const ccx = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
        const ccz = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
        const vx = ccx - eye.x;
        const vz = ccz - eye.z;
        if (vx * fwd.x + vz * fwd.z < -CHUNK_SIZE * 1.2) continue;
        const dist2 = vx * vx + vz * vz;
        if (entry.opaque) drawOpaque.push({ entry, dist2 });
        if (entry.translucent) drawTrans.push({ entry, dist2 });
      }
    }

    gl.useProgram(this.terrainProg);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.enableVertexAttribArray(2);
    gl.uniformMatrix4fv(this.uTerrain.proj, false, this.proj);
    gl.uniformMatrix4fv(this.uTerrain.view, false, this.view);
    gl.uniform1i(this.uTerrain.atlas, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform3fv(this.uTerrain.fogColor, sky);
    gl.uniform1f(this.uTerrain.fogNear, 34);
    gl.uniform1f(this.uTerrain.fogFar, Math.min(110, (R - 1.5) * CHUNK_SIZE));
    gl.uniform1f(this.uTerrain.light, lightFactor(timeOfDay));

    const stride = VERTEX_FLOATS * 4;
    const drawMesh = (kind) => {
      const buf = kind.buf;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 20);
      gl.drawArrays(gl.TRIANGLES, 0, kind.count);
    };

    gl.disable(gl.BLEND);
    gl.depthMask(true);
    for (const { entry } of drawOpaque) drawMesh(entry.opaque);

    // translucent: far to near
    drawTrans.sort((a, b) => b.dist2 - a.dist2);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const { entry } of drawTrans) drawMesh(entry.translucent);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // highlight box
    if (highlight) {
      gl.useProgram(this.linesProg);
      gl.uniformMatrix4fv(this.uLines.proj, false, this.proj);
      gl.uniformMatrix4fv(this.uLines.view, false, this.view);
      gl.uniform3f(this.uLines.origin, highlight.x + 0.5, highlight.y + 0.5, highlight.z + 0.5);
      gl.uniform1f(this.uLines.scale, 1.006);
      gl.uniform4f(this.uLines.color, 0.05, 0.05, 0.05, 0.85);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, 24);
    }
  }

  // Read pixels from the canvas (y down from top-left). For tests.
  samplePixels(x, y, w, h) {
    const gl = this.gl;
    const out = new Uint8Array(w * h * 4);
    gl.readPixels(x, this.height - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  }

  samplePixel(x, y) {
    return Array.from(this.samplePixels(x, y, 1, 1).slice(0, 3));
  }

  // Expected fragment color of a block face when fully lit (light=1):
  // center texel of the face tile × face shade. Used by tests to verify
  // that what is rendered matches the block the ray actually hit.
  expectedFaceColor(blockId, face) {
    const tile = FACE_TILE[blockId][face];
    const [r, g, b] = texelAt(tile, 0.5, 0.5);
    const s = FACE_SHADE[face];
    return [r / 255 * s, g / 255 * s, b / 255 * s];
  }

  _drawOpaque = [];
  _drawTrans = [];
}
