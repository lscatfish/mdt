// 天空系统：昼夜循环的太阳方向光、天光半球光、天空/雾颜色渐变、日月球体与飘动云层。
import * as THREE from '/vendor/three.module.js';
import { mulberry32 } from './noise.js';

export class Sky {
  constructor(scene) {
    this.scene = scene;

    this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sun.target.position.set(0, 0, 0);
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.6);
    scene.add(this.hemi);

    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(30, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false })
    );
    this.moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(22, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xdfe9ff, fog: false })
    );
    scene.add(this.sunMesh, this.moonMesh);

    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, fog: false });
    const rng = mulberry32(20240517);
    for (let i = 0; i < 30; i++) {
      const w = 24 + rng() * 40;
      const d = 14 + rng() * 24;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, d), cloudMat);
      m.position.set((rng() - 0.5) * 420, 92 + rng() * 14, (rng() - 0.5) * 420);
      this.clouds.add(m);
    }
    scene.add(this.clouds);

    this.skyColor = new THREE.Color(0x7fb7ff);
    this.scene.background = this.skyColor;
    this.scene.fog = new THREE.Fog(this.skyColor.getHex(), 40, 78);

    this._sunDir = new THREE.Vector3();
    this._cA = new THREE.Color();
    this._cB = new THREE.Color();
  }

  update(t, camPos) {
    const theta = t * Math.PI * 2;
    const s = Math.sin(theta);
    // 倾斜大圆轨道：正午太阳偏离天顶，侧面也能获得方向光
    const az = 0.45;
    this._sunDir.set(Math.cos(theta), s * Math.cos(az), s * Math.sin(az)).normalize();

    this.sun.position.copy(camPos).addScaledVector(this._sunDir, 240);
    this.sun.target.position.copy(camPos);
    this.sunMesh.position.copy(camPos).addScaledVector(this._sunDir, 480);
    this.moonMesh.position.copy(camPos).addScaledVector(this._sunDir, -480);

    if (s > 0.12) {
      const k = Math.min(1, (s - 0.12) / 0.45);
      this._cA.setHex(0xff9e4f);
      this._cB.setHex(0x7fb7ff);
      this.skyColor.copy(this._cA).lerp(this._cB, k);
      this.sun.intensity = 0.25 + 1.45 * k;
      this._cA.setHex(0xff8a3a);
      this._cB.setHex(0xfff4dc);
      this.sun.color.copy(this._cA).lerp(this._cB, k);
      this.hemi.intensity = 0.5 + 0.4 * k;
    } else if (s < -0.12) {
      this.skyColor.setHex(0x0b1028);
      this.sun.intensity = 0.07;
      this.sun.color.setHex(0x8ea2ff);
      this.hemi.intensity = 0.15;
    } else {
      this.skyColor.setHex(0xff9e4f);
      this.sun.intensity = 0.3;
      this.sun.color.setHex(0xff8a3a);
      this.hemi.intensity = 0.32;
    }

    this.scene.fog.color.copy(this.skyColor);

    // 云层跟随玩家，缓慢漂移
    this.clouds.position.set(
      Math.round(camPos.x / 220) * 220 + ((t * 20) % 220) - 110,
      0,
      Math.round(camPos.z / 220) * 220
    );
  }
}
