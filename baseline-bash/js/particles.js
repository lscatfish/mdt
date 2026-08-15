// 破坏方块时的轻量粒子效果
import * as THREE from '../vendor/three.module.js';
import { BLOCK_DEFS } from './config.js';

const MAX_PARTICLES = 240;

export class Particles {
  constructor(scene) {
    this.particles = [];
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.PointsMaterial({
      size: 0.09,
      vertexColors: true,
      sizeAttenuation: true
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
  }

  spawnBlock(x, y, z, blockId, count = 18) {
    const def = BLOCK_DEFS[blockId];
    const base = def?.particleColor || [0.8, 0.8, 0.8];
    const cx = x + 0.5;
    const cy = y + 0.5;
    const cz = z + 0.5;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 0.7,
        y: cy + (Math.random() - 0.5) * 0.7,
        z: cz + (Math.random() - 0.5) * 0.7,
        vx: (Math.random() - 0.5) * 3.4,
        vy: Math.random() * 3.6 + 1.2,
        vz: (Math.random() - 0.5) * 3.4,
        life: 0.45 + Math.random() * 0.5,
        age: 0,
        r: Math.max(0, Math.min(1, base[0] + (Math.random() - 0.5) * 0.25)),
        g: Math.max(0, Math.min(1, base[1] + (Math.random() - 0.5) * 0.25)),
        b: Math.max(0, Math.min(1, base[2] + (Math.random() - 0.5) * 0.25))
      });
    }
  }

  update(dt) {
    let write = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life || p.y < -2) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= 13 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      if (write < MAX_PARTICLES) {
        this.positions[write * 3] = p.x;
        this.positions[write * 3 + 1] = p.y;
        this.positions[write * 3 + 2] = p.z;
        const fade = 1 - p.age / p.life;
        this.colors[write * 3] = p.r * fade;
        this.colors[write * 3 + 1] = p.g * fade;
        this.colors[write * 3 + 2] = p.b * fade;
        write++;
      }
    }
    this.geometry.setDrawRange(0, write);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}
