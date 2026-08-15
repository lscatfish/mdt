// 破坏方块时的小方块粒子。
import * as THREE from '/vendor/three.module.js';

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  }

  burst(x, y, z, color, count) {
    for (let i = 0; i < count; i++) {
      if (this.items.length > 260) break;
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color }));
      m.position.set(
        x + (Math.random() - 0.5) * 0.5,
        y + (Math.random() - 0.5) * 0.5,
        z + (Math.random() - 0.5) * 0.5
      );
      this.items.push({
        m,
        vx: (Math.random() - 0.5) * 5,
        vy: 2 + Math.random() * 4,
        vz: (Math.random() - 0.5) * 5,
        life: 0.4 + Math.random() * 0.5,
        maxLife: 0.9,
      });
      this.scene.add(m);
    }
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.m);
        p.m.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      p.vy -= 16 * dt;
      p.m.position.x += p.vx * dt;
      p.m.position.y += p.vy * dt;
      p.m.position.z += p.vz * dt;
      const s = Math.max(0.01, p.life * 1.6);
      p.m.scale.setScalar(s);
    }
  }
}
