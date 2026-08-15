import * as THREE from "../vendor/three.module.js";

const DAY_TOP = new THREE.Color(0.32, 0.54, 0.88);
const DAY_HORIZON = new THREE.Color(0.73, 0.81, 0.92);
const NIGHT_TOP = new THREE.Color(0.008, 0.012, 0.05);
const NIGHT_HORIZON = new THREE.Color(0.06, 0.07, 0.13);
const SUNSET = new THREE.Color(1.0, 0.46, 0.2);

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float nightFactor;

void main() {
  vec3 dir = normalize(vDir);
  float h = clamp(dir.y * 1.7, 0.0, 1.0);
  vec3 col = mix(horizonColor, topColor, pow(h, 0.55));

  vec3 sd = normalize(sunDir);
  float sunAmt = max(dot(dir, sd), 0.0);
  col += sunColor * pow(sunAmt, 380.0) * 2.6;
  col += sunColor * pow(sunAmt, 14.0) * 0.16;

  // 月亮
  float moonAmt = max(dot(dir, -sd), 0.0);
  col += vec3(0.85, 0.87, 0.95) * pow(moonAmt, 320.0) * 1.4;

  // 星星(基于方向网格的稳定散点)
  if (nightFactor > 0.02 && dir.y > 0.0) {
    vec3 cell = floor(dir * 240.0);
    float r1 = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float r2 = fract(sin(dot(cell, vec3(39.346, 11.135, 83.155))) * 26968.351);
    float star = step(0.9975, r1);
    float twinkle = 0.55 + 0.45 * r2;
    col += vec3(1.0, 1.0, 0.96) * star * twinkle * nightFactor * 1.1;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

function wrapAround(v, span) {
  return ((v % span) + span) % span;
}

class CloudLayer {
  constructor(scene) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 256;
    this.canvas.height = 256;
    const ctx = this.canvas.getContext("2d");
    ctx.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = 18 + Math.random() * 34;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const a = 0.10 + Math.random() * 0.16;
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.75, `rgba(255,255,255,${a * 0.55})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.planes = [];
    for (let i = 0; i < 9; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 108 + Math.random() * 4;
      scene.add(mesh);
      this.planes.push({ mesh, ox: (i % 3) * 460, oz: Math.floor(i / 3) * 460 });
    }
    this.drift = 0;
  }

  update(camX, camZ, dt, dayFactor) {
    const span = 460 * 3;
    this.drift = wrapAround(this.drift + dt * 2.4, span);
    const gx = Math.round(camX / span) * span + this.drift;
    const gz = Math.round(camZ / span) * span;
    for (const p of this.planes) {
      p.mesh.position.x = gx + p.ox;
      p.mesh.position.z = gz + p.oz;
      p.mesh.material.opacity = 0.22 + dayFactor * 0.34;
    }
  }
}

export class Sky {
  constructor(scene) {
    this.uniforms = {
      topColor: { value: DAY_TOP.clone() },
      horizonColor: { value: DAY_HORIZON.clone() },
      sunColor: { value: new THREE.Color(1, 0.95, 0.8) },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      nightFactor: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 18), this.material);
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.clouds = new CloudLayer(scene);
    this.dayFactor = 1;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.tmpColor = new THREE.Color();
    this.sunsetLow = new THREE.Color(1, 0.55, 0.3);
  }

  update(cameraPos, timeOfDay, dt) {
    const angle = timeOfDay * Math.PI * 2;
    const elev = Math.sin(angle);
    const az = timeOfDay * Math.PI * 2 - Math.PI / 2;
    const cosE = Math.cos(elev);
    this.sunDir.set(Math.cos(az) * cosE, Math.sin(elev), Math.sin(az) * cosE).normalize();
    this.uniforms.sunDir.value.copy(this.sunDir);

    this.dayFactor = THREE.MathUtils.clamp((elev + 0.12) / 0.4, 0, 1);
    this.dayFactor = this.dayFactor * this.dayFactor * (3 - 2 * this.dayFactor); // smoothstep
    const night = 1 - this.dayFactor;
    this.uniforms.nightFactor.value = night;

    this.uniforms.topColor.value.copy(NIGHT_TOP).lerp(DAY_TOP, this.dayFactor);
    this.uniforms.horizonColor.value.copy(NIGHT_HORIZON).lerp(DAY_HORIZON, this.dayFactor);
    const sunset = Math.exp(-Math.abs(elev) * 4.2) * (0.35 + this.dayFactor * 0.65);
    this.uniforms.horizonColor.value.lerp(SUNSET, sunset * 0.75);

    this.tmpColor.set(1, 0.95, 0.8).lerp(this.sunsetLow, sunset);
    this.uniforms.sunColor.value.copy(this.tmpColor);

    this.dome.position.copy(cameraPos);
    this.clouds.update(cameraPos.x, cameraPos.z, dt, this.dayFactor);
  }

  fogColor() {
    return this.uniforms.horizonColor.value.clone().lerp(this.uniforms.topColor.value, 0.35);
  }
}
