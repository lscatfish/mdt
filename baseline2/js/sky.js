'use strict';
/* WebCraft · 天空（渐变着色器 + 太阳月亮星星 + 云层） */
(function () {
  function makeCloudTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const rng = Noise.mulberry32(424242);
    for (let i = 0; i < 90; i++) {
      const x = rng() * size, y = rng() * size;
      const r = 14 + rng() * 46;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return canvas;
  }

  function createSky(scene) {
    const sunDir = new THREE.Vector3(0, 1, 0);
    const uniforms = {
      uSunDir: { value: sunDir },
      uDay: { value: 1 }
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: [
        'varying vec3 vDir;',
        'void main() {',
        '  vDir = normalize(position);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vDir;',
        'uniform vec3 uSunDir;',
        'uniform float uDay;',
        'float hash13(vec3 p) {',
        '  p = fract(p * 0.1031);',
        '  p += dot(p, p.zyx + 31.32);',
        '  return fract((p.x + p.y) * p.z);',
        '}',
        'void main() {',
        '  float h = clamp(vDir.y, -1.0, 1.0);',
        '  vec3 dayZen   = vec3(0.28, 0.55, 0.94);',
        '  vec3 dayHor   = vec3(0.66, 0.80, 0.96);',
        '  vec3 ngtZen   = vec3(0.008, 0.016, 0.05);',
        '  vec3 ngtHor   = vec3(0.035, 0.045, 0.10);',
        '  vec3 day   = mix(dayHor, dayZen, smoothstep(0.0, 0.45, h));',
        '  vec3 night = mix(ngtHor, ngtZen, smoothstep(0.0, 0.60, h));',
        '  vec3 col = mix(night, day, uDay);',
        '  float warm = smoothstep(-0.05, 0.12, uSunDir.y) * (1.0 - smoothstep(0.18, 0.50, uSunDir.y));',
        '  col = mix(col, vec3(1.0, 0.45, 0.16), warm * 0.45);',
        '  float sd = dot(vDir, uSunDir);',
        '  col += vec3(1.0, 0.95, 0.75) * smoothstep(0.99925, 0.99975, sd) * uDay;',
        '  col += vec3(1.0, 0.55, 0.25) * smoothstep(0.992, 0.99925, sd) * 0.20 * uDay;',
        '  float md = dot(vDir, -uSunDir);',
        '  col += vec3(0.82, 0.86, 1.0) * smoothstep(0.9994, 0.99982, md) * (1.0 - uDay) * 0.9;',
        '  float star = step(0.9985, hash13(floor(vDir * 220.0)));',
        '  col += vec3(star) * (1.0 - uDay) * 0.85;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });

    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 15), material);
    skyMesh.renderOrder = -100;
    scene.add(skyMesh);

    /* 云层 */
    const cloudTex = new THREE.CanvasTexture(makeCloudTexture());
    cloudTex.wrapS = THREE.RepeatWrapping;
    cloudTex.wrapT = THREE.RepeatWrapping;
    cloudTex.repeat.set(3, 3);
    cloudTex.magFilter = THREE.LinearFilter;
    cloudTex.minFilter = THREE.LinearMipmapLinearFilter;

    function makeCloud(y, repeat, opacity, speed) {
      const tex = cloudTex.clone();
      tex.repeat.set(repeat, repeat);
      tex.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity,
        depthWrite: false, fog: false
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      mesh.renderOrder = 0;
      scene.add(mesh);
      return { mesh, tex, speed };
    }
    const cloudA = makeCloud(116, 3, 0.40, 0.5);
    const cloudB = makeCloud(128, 5, 0.22, -0.32);

    const fogColor = new THREE.Color();
    const horizonColor = new THREE.Color();

    function update(tOfDay, dt, camera) {
      const angle = tOfDay * Math.PI * 2 - Math.PI / 2;
      sunDir.set(Math.cos(angle), Math.sin(angle), 0.22).normalize();
      const day = Noise.smoothstep(-0.12, 0.16, sunDir.y);
      uniforms.uDay.value = day;

      /* 云朵跟随玩家 + 缓慢漂移 */
      for (const cloud of [cloudA, cloudB]) {
        cloud.mesh.position.x = camera.position.x;
        cloud.mesh.position.z = camera.position.z;
        cloud.tex.offset.x += cloud.speed * dt * 0.0008;
        cloud.tex.offset.y += cloud.speed * dt * 0.0003;
        cloud.mesh.material.color.setScalar(0.55 + day * 0.45);
        cloud.mesh.material.opacity = cloud === cloudA ? 0.40 : 0.22;
      }

      /* 供雾效使用的地平线颜色 */
      const warm = Noise.smoothstep(-0.05, 0.12, sunDir.y) *
                   (1 - Noise.smoothstep(0.18, 0.50, sunDir.y));
      horizonColor.setRGB(
        0.66 * day + 0.035 * (1 - day) + warm * 0.34,
        0.80 * day + 0.045 * (1 - day) + warm * 0.15,
        0.96 * day + 0.100 * (1 - day)
      );
      fogColor.copy(horizonColor).multiplyScalar(0.92).offsetHSL(0, 0, 0.02);
      return { fogColor, day };
    }

    return { update, sunDir, cloudA, cloudB };
  }

  window.createSky = createSky;
})();
