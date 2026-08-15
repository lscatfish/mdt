/* ============================================================
 * renderer.js — 自研 WebGL 渲染器
 * 天空穹顶 / 不透明世界 / 玻璃 / 水面 / 云 / 方块描边 / 粒子
 * ============================================================ */
(function (global) {
  'use strict';

  // ---------------- 矩阵工具 ----------------
  function mat4Identity(o) {
    o.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    return o;
  }
  function mat4Perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    o.fill(0);
    o[0] = f / aspect; o[5] = f;
    o[10] = (far + near) / (near - far);
    o[11] = -1;
    o[14] = (2 * far * near) / (near - far);
    return o;
  }
  function mat4Mul(o, a, b) {
    const r = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        r[i * 4 + j] =
          a[i * 4 + 0] * b[0 * 4 + j] +
          a[i * 4 + 1] * b[1 * 4 + j] +
          a[i * 4 + 2] * b[2 * 4 + j] +
          a[i * 4 + 3] * b[3 * 4 + j];
      }
    }
    o.set(r);
    return o;
  }
  function mat4Translate(o, x, y, z) {
    const t = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
    return mat4Mul(o, o, t);
  }
  function mat4RotX(o, rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    const r = new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
    return mat4Mul(o, o, r);
  }
  function mat4RotY(o, rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    const r = new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
    return mat4Mul(o, o, r);
  }

  // ---------------- 着色器 ----------------
  const WORLD_VS = [
    'attribute vec3 aPos;',
    'attribute vec2 aUV;',
    'attribute vec3 aColor;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'uniform float uFogDensity;',
    'uniform vec2 uShift;',
    'varying vec2 vUV;',
    'varying vec3 vColor;',
    'varying float vFog;',
    'void main(){',
    '  vec3 p = aPos; p.x += uShift.x; p.z += uShift.y;',
    '  vec4 wp = uView * vec4(p, 1.0);',
    '  gl_Position = uProj * wp;',
    '  vUV = aUV; vColor = aColor;',
    '  float d = length(wp.xyz);',
    '  float f = uFogDensity * d;',
    '  vFog = 1.0 - exp(-f * f);',
    '}'
  ].join('\n');

  const OPAQUE_FS = [
    'precision mediump float;',
    'varying vec2 vUV;',
    'varying vec3 vColor;',
    'varying float vFog;',
    'uniform sampler2D uTex;',
    'uniform vec3 uFogColor;',
    'void main(){',
    '  vec4 t = texture2D(uTex, vUV);',
    '  vec3 c = t.rgb * vColor;',
    '  gl_FragColor = vec4(mix(c, uFogColor, clamp(vFog, 0.0, 1.0)), 1.0);',
    '}'
  ].join('\n');

  const ALPHA_FS = [
    'precision mediump float;',
    'varying vec2 vUV;',
    'varying vec3 vColor;',
    'varying float vFog;',
    'uniform sampler2D uTex;',
    'uniform vec3 uFogColor;',
    'uniform float uAlpha;',
    'void main(){',
    '  vec4 t = texture2D(uTex, vUV);',
    '  if (t.a < 0.5) discard;',
    '  vec3 c = t.rgb * vColor;',
    '  c = mix(c, uFogColor, clamp(vFog, 0.0, 1.0));',
    '  gl_FragColor = vec4(c, t.a * uAlpha);',
    '}'
  ].join('\n');

  const SKY_VS = [
    'attribute vec3 aDir;',
    'uniform mat4 uProj;',
    'uniform mat4 uViewRot;',
    'varying vec3 vDir;',
    'void main(){',
    '  vDir = aDir;',
    '  gl_Position = uProj * uViewRot * vec4(aDir, 1.0);',
    '}'
  ].join('\n');

  const SKY_FS = [
    'precision mediump float;',
    'varying vec3 vDir;',
    'uniform vec3 uSunDir;',
    'void main(){',
    '  vec3 d = normalize(vDir);',
    '  float h = clamp(d.y, -1.0, 1.0);',
    '  vec3 zenith = vec3(0.30, 0.55, 0.92);',
    '  vec3 horizon = vec3(0.76, 0.85, 0.96);',
    '  vec3 below = vec3(0.66, 0.72, 0.82);',
    '  vec3 base = h >= 0.0 ? mix(horizon, zenith, pow(h, 0.55)) : below;',
    '  float sun = max(dot(d, uSunDir), 0.0);',
    '  base += vec3(1.0, 0.92, 0.7) * pow(sun, 350.0) * 1.6;',
    '  base += vec3(1.0, 0.85, 0.55) * pow(sun, 8.0) * 0.28;',
    '  gl_FragColor = vec4(base, 1.0);',
    '}'
  ].join('\n');

  const LINE_VS = [
    'attribute vec3 aPos;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'void main(){ gl_Position = uProj * uView * vec4(aPos, 1.0); }'
  ].join('\n');

  const LINE_FS = [
    'precision mediump float;',
    'uniform vec4 uColor;',
    'void main(){ gl_FragColor = uColor; }'
  ].join('\n');

  const POINT_VS = [
    'attribute vec3 aPos;',
    'attribute vec4 aColor;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'uniform float uPointSize;',
    'varying vec4 vColor;',
    'void main(){',
    '  gl_Position = uProj * uView * vec4(aPos, 1.0);',
    '  gl_PointSize = uPointSize;',
    '  vColor = aColor;',
    '}'
  ].join('\n');

  const POINT_FS = [
    'precision mediump float;',
    'varying vec4 vColor;',
    'void main(){',
    '  vec2 pc = gl_PointCoord - vec2(0.5);',
    '  float d = length(pc);',
    '  if (d > 0.5) discard;',
    '  float a = smoothstep(0.5, 0.1, d) * vColor.a;',
    '  gl_FragColor = vec4(vColor.rgb, a);',
    '}'
  ].join('\n');

  // 天空盒：立方体 8 角（归一化方向）
  const SKY_VERTS = new Float32Array([
    -1, -1, -1,  1, -1, -1,  1, 1, -1,  -1, 1, -1,   // 后
    -1, -1,  1,  1, -1,  1,  1, 1,  1,  -1, 1,  1,   // 前
    -1, 1, -1,   1, 1, -1,  1, 1, 1,   -1, 1, 1,    // 顶
    -1, -1, -1,  1, -1, -1, 1, -1, 1,  -1, -1, 1,   // 底
    -1, -1, -1, -1, 1, -1,  -1, 1, 1,  -1, -1, 1,   // 左
    1, -1, -1,  1, 1, -1,   1, 1, 1,   1, -1, 1     // 右
  ]);
  const SKY_INDICES = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
    8, 10, 9, 8, 11, 10, 12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19, 20, 22, 21, 20, 23, 22
  ]);

  // 1x1x1 立方体描边（12 条棱）
  const CUBE_EDGES = new Float32Array([
    0, 0, 0, 1, 0, 0,  0, 0, 0, 0, 1, 0,  0, 0, 0, 0, 0, 1,
    1, 0, 0, 1, 1, 0,  1, 0, 0, 1, 0, 1,
    0, 1, 0, 1, 1, 0,  0, 1, 0, 0, 1, 1,
    0, 0, 1, 1, 0, 1,  0, 0, 1, 0, 1, 1,
    1, 1, 1, 1, 1, 0,  1, 1, 1, 0, 1, 1,  1, 1, 1, 1, 0, 1
  ]);

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(s), src);
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function makeProgram(gl, vsSrc, fsSrc) {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  function makeBuffer(gl, data) {
    if (!data) return null;
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buf: b, count: data.length / 8 };
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.gl = canvas.getContext('webgl', { antialias: true, alpha: false }) ||
                canvas.getContext('experimental-webgl', { antialias: true });
      if (!this.gl) throw new Error('当前浏览器不支持 WebGL');
      const gl = this.gl;

      this.worldProg = makeProgram(gl, WORLD_VS, OPAQUE_FS);
      this.alphaProg = makeProgram(gl, WORLD_VS, ALPHA_FS);
      this.skyProg = makeProgram(gl, SKY_VS, SKY_FS);
      this.lineProg = makeProgram(gl, LINE_VS, LINE_FS);
      this.pointProg = makeProgram(gl, POINT_VS, POINT_FS);

      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, MCTextures.textures.canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // 天空盒
      this.skyVBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyVBuf);
      gl.bufferData(gl.ARRAY_BUFFER, SKY_VERTS, gl.STATIC_DRAW);
      this.skyIBuf = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.skyIBuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, SKY_INDICES, gl.STATIC_DRAW);

      // 动态缓冲
      this.dynBuf = gl.createBuffer();   // 描边 / 粒子共用
      this.cloudBuf = null;
      this.cloudCount = 0;

      this.proj = new Float32Array(16);
      this.view = new Float32Array(16);
      this.viewRot = new Float32Array(16);
      this.sunDir = [0.45, 0.62, -0.45];
      const l = Math.hypot(this.sunDir[0], this.sunDir[1], this.sunDir[2]);
      this.sunDir = this.sunDir.map(v => v / l);

      this.fogColor = [0.76, 0.85, 0.96];
      this.fogDensity = 1 / 90;

      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);
      gl.clearColor(this.fogColor[0], this.fogColor[1], this.fogColor[2], 1);
      this.resize();
    }

    resize() {
      const gl = this.gl;
      const w = this.canvas.clientWidth || window.innerWidth;
      const h = this.canvas.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.max(1, Math.floor(w * dpr));
      this.canvas.height = Math.max(1, Math.floor(h * dpr));
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      mat4Perspective(this.proj, 75 * Math.PI / 180, this.canvas.width / this.canvas.height, 0.08, 2000);
    }

    setFogDistance(blocks) {
      this.fogDensity = 2.5 / Math.max(16, blocks);
    }

    computeView(eye, yaw, pitch) {
      mat4Identity(this.view);
      mat4Translate(this.view, -eye[0], -eye[1], -eye[2]);
      mat4RotY(this.view, -yaw);
      mat4RotX(this.view, -pitch);
      // 纯旋转视图（天空用）
      mat4Identity(this.viewRot);
      mat4RotY(this.viewRot, -yaw);
      mat4RotX(this.viewRot, -pitch);
    }

    bindWorldAttribs(prog, buf) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.buf);
      const stride = 32;
      const aPos = gl.getAttribLocation(prog, 'aPos');
      const aUV = gl.getAttribLocation(prog, 'aUV');
      const aColor = gl.getAttribLocation(prog, 'aColor');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(aUV);
      gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(aColor);
      gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride, 20);
    }

    drawBuffer(prog, buf, alphaVal) {
      if (!buf) return;
      const gl = this.gl;
      gl.useProgram(prog);
      gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uProj'), false, this.proj);
      gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uView'), false, this.view);
      gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
      gl.uniform3fv(gl.getUniformLocation(prog, 'uFogColor'), this.fogColor);
      gl.uniform1f(gl.getUniformLocation(prog, 'uFogDensity'), this.fogDensity);
      if (alphaVal !== null && alphaVal !== undefined) {
        gl.uniform1f(gl.getUniformLocation(prog, 'uAlpha'), alphaVal);
        gl.uniform2f(gl.getUniformLocation(prog, 'uShift'), 0, 0);
      }
      this.bindWorldAttribs(prog, buf);
      gl.drawArrays(gl.TRIANGLES, 0, buf.count);
      gl.disableVertexAttribArray(gl.getAttribLocation(prog, 'aPos'));
      gl.disableVertexAttribArray(gl.getAttribLocation(prog, 'aUV'));
      gl.disableVertexAttribArray(gl.getAttribLocation(prog, 'aColor'));
    }

    uploadChunkMesh(chunk, meshes) {
      const gl = this.gl;
      if (chunk.mesh) this.disposeChunkMesh(chunk);
      chunk.mesh = {
        opaque: makeBuffer(gl, meshes.opaque),
        alpha: makeBuffer(gl, meshes.alpha),
        water: makeBuffer(gl, meshes.water)
      };
    }

    disposeChunkMesh(chunk) {
      if (!chunk.mesh) return;
      const gl = this.gl;
      const m = chunk.mesh;
      for (const k in m) {
        if (m[k] && m[k].buf) gl.deleteBuffer(m[k].buf);
      }
      chunk.mesh = null;
    }

    drawChunks(chunks, pass) {
      const gl = this.gl;
      let prog, key, alphaVal;
      if (pass === 0) { prog = this.worldProg; key = 'opaque'; alphaVal = null; }
      else if (pass === 1) { prog = this.alphaProg; key = 'alpha'; alphaVal = 1.0; }
      else { prog = this.alphaProg; key = 'water'; alphaVal = 0.78; }

      if (pass === 0) {
        gl.disable(gl.BLEND);
        gl.depthMask(true);
      } else {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(true);
      }
      gl.enable(gl.DEPTH_TEST);

      for (const c of chunks) {
        if (!c.mesh || !c.mesh[key]) continue;
        this.drawBuffer(prog, c.mesh[key], alphaVal);
      }
      if (pass !== 0) {
        gl.disable(gl.BLEND);
        gl.depthMask(true);
      }
    }

    drawSky() {
      const gl = this.gl;
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.BLEND);
      gl.useProgram(this.skyProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.skyProg, 'uProj'), false, this.proj);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.skyProg, 'uViewRot'), false, this.viewRot);
      gl.uniform3fv(gl.getUniformLocation(this.skyProg, 'uSunDir'), this.sunDir);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyVBuf);
      const loc = gl.getAttribLocation(this.skyProg, 'aDir');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 12, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.skyIBuf);
      gl.drawElements(gl.TRIANGLES, SKY_INDICES.length, gl.UNSIGNED_SHORT, 0);
      gl.disableVertexAttribArray(loc);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
    }

    buildCloudMesh(cx, cz) {
      const gl = this.gl;
      const uv = MCTextures.textures.tileUVs[MCTextures.T.CLOUD];
      const verts = [];
      const cell = 12;
      const R = 42;             // 42 个格子 ≈ 半径 500 格
      const y = 94;
      const seed = (global.MCGame && global.MCGame.world ? global.MCGame.world.seed : 1) ^ 0x51f0e;
      const cloudNoise = MCNoise.makeNoise(seed);
      const n = cloudNoise.noise2;
      for (let iz = -R; iz < R; iz++) {
        for (let ix = -R; ix < R; ix++) {
          const gx = cx + ix, gz = cz + iz;
          const v = n(gx * 0.09, gz * 0.09);
          if (v < 0.16) continue;
          const x = gx * cell, z = gz * cell;
          const s = cell * (0.7 + ((v + 1) * 0.35));
          verts.push(
            x, y, z, uv.u0, uv.v0, 1, 1, 1,
            x + s, y, z, uv.u1, uv.v0, 1, 1, 1,
            x + s, y, z + s, uv.u1, uv.v1, 1, 1, 1,
            x, y, z, uv.u0, uv.v0, 1, 1, 1,
            x + s, y, z + s, uv.u1, uv.v1, 1, 1, 1,
            x, y, z + s, uv.u0, uv.v1, 1, 1, 1
          );
        }
      }
      if (this.cloudBuf) gl.deleteBuffer(this.cloudBuf);
      const data = new Float32Array(verts);
      this.cloudBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cloudBuf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      this.cloudCount = data.length / 8;
    }

    drawClouds(shiftX, shiftZ) {
      if (!this.cloudBuf) return;
      const gl = this.gl;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.useProgram(this.alphaProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.alphaProg, 'uProj'), false, this.proj);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.alphaProg, 'uView'), false, this.view);
      gl.uniform1i(gl.getUniformLocation(this.alphaProg, 'uTex'), 0);
      gl.uniform3fv(gl.getUniformLocation(this.alphaProg, 'uFogColor'), this.fogColor);
      gl.uniform1f(gl.getUniformLocation(this.alphaProg, 'uFogDensity'), this.fogDensity);
      gl.uniform1f(gl.getUniformLocation(this.alphaProg, 'uAlpha'), 0.92);
      gl.uniform2f(gl.getUniformLocation(this.alphaProg, 'uShift'), shiftX, shiftZ);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cloudBuf);
      const aPos = gl.getAttribLocation(this.alphaProg, 'aPos');
      const aUV = gl.getAttribLocation(this.alphaProg, 'aUV');
      const aColor = gl.getAttribLocation(this.alphaProg, 'aColor');
      const stride = 32;
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(aUV);
      gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(aColor);
      gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride, 20);
      gl.drawArrays(gl.TRIANGLES, 0, this.cloudCount);
      gl.disableVertexAttribArray(aPos);
      gl.disableVertexAttribArray(aUV);
      gl.disableVertexAttribArray(aColor);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    drawOutline(bx, by, bz) {
      const gl = this.gl;
      const e = 0.004;
      const data = [];
      const base = CUBE_EDGES;
      for (let i = 0; i < base.length; i += 3) {
        data.push(
          bx - e + base[i] * (1 + 2 * e),
          by - e + base[i + 1] * (1 + 2 * e),
          bz - e + base[i + 2] * (1 + 2 * e)
        );
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
      gl.useProgram(this.lineProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProg, 'uProj'), false, this.proj);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProg, 'uView'), false, this.view);
      gl.uniform4f(gl.getUniformLocation(this.lineProg, 'uColor'), 0.05, 0.05, 0.05, 1);
      const loc = gl.getAttribLocation(this.lineProg, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 12, 0);
      gl.drawArrays(gl.LINES, 0, base.length / 3);
      gl.disableVertexAttribArray(loc);
    }

    drawParticles(list) {
      if (!list || !list.length) return;
      const gl = this.gl;
      const data = new Float32Array(list.length * 7);
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const o = i * 7;
        data[o] = p.x; data[o + 1] = p.y; data[o + 2] = p.z;
        data[o + 3] = p.r; data[o + 4] = p.g; data[o + 5] = p.b; data[o + 6] = p.a;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.useProgram(this.pointProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.pointProg, 'uProj'), false, this.proj);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.pointProg, 'uView'), false, this.view);
      gl.uniform1f(gl.getUniformLocation(this.pointProg, 'uPointSize'), 9);
      const aPos = gl.getAttribLocation(this.pointProg, 'aPos');
      const aColor = gl.getAttribLocation(this.pointProg, 'aColor');
      const stride = 28;
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(aColor);
      gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 12);
      gl.drawArrays(gl.POINTS, 0, list.length);
      gl.disableVertexAttribArray(aPos);
      gl.disableVertexAttribArray(aColor);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    beginFrame() {
      const gl = this.gl;
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
  }

  global.MCRenderer = { Renderer };
})(window);
