/**
 * AI Test Agent — 3D 场景可视化
 * Three.js 真 3D 渲染：设备模型 + 粒子轨迹 + 数据球
 *
 * 使用：
 *   import { create3DScene } from './3d-scene.js';
 *   const scene = create3DScene(document.getElementById('container'));
 *   scene.loadTestData(testResults);
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

export function create3DScene(container) {
  if (!container) throw new Error('Container element required');

  // ===== Scene Setup =====
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020617);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(8, 6, 12);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  // ===== Lights =====
  const ambientLight = new THREE.AmbientLight(0x334155, 0.6);
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0xffffff, 2);
  mainLight.position.set(5, 10, 7);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 1024;
  mainLight.shadow.mapSize.height = 1024;
  scene.add(mainLight);

  const fillLight = new THREE.DirectionalLight(0x3B82F6, 0.8);
  fillLight.position.set(-5, 0, 5);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xA855F7, 0.4);
  rimLight.position.set(0, -3, -8);
  scene.add(rimLight);

  // 点光源跟随交互
  const cursorLight = new THREE.PointLight(0x3B82F6, 0.5, 15);
  cursorLight.position.set(0, 0, 5);
  scene.add(cursorLight);

  // ===== Floor Grid =====
  const gridHelper = new THREE.GridHelper(14, 20, 0x1E293B, 0x334155);
  gridHelper.position.y = -2.5;
  scene.add(gridHelper);

  // ===== 3D Device Model =====
  function createDevice() {
    const group = new THREE.Group();

    // 手机壳体 — 圆角用 Box 组合模拟
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1E293B,
      roughness: 0.3,
      metalness: 0.8,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 6.4, 0.4), bodyMat);
    body.castShadow = true;
    group.add(body);

    // 屏幕
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x020617,
      emissive: 0x3B82F6,
      emissiveIntensity: 0.15,
      roughness: 0.1,
      metalness: 0.1,
    });
    const screen = new THREE.Mesh(new THREE.BoxGeometry(2.8, 5.6, 0.05), screenMat);
    screen.position.z = 0.23;
    group.add(screen);

    // 屏幕内容 — 模拟 UI 元素
    const uiMat = new THREE.MeshStandardMaterial({
      color: 0x22C55E,
      emissive: 0x22C55E,
      emissiveIntensity: 0.3,
    });
    for (let i = 0; i < 6; i++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.12, 0.02),
        new THREE.MeshStandardMaterial({
          color: 0x1E293B,
          emissive: 0x3B82F6,
          emissiveIntensity: 0.1 + i * 0.05,
        })
      );
      bar.position.set(0, 1.5 - i * 0.5, 0.26);
      group.add(bar);
    }

    // 摄像头
    const camMat = new THREE.MeshStandardMaterial({
      color: 0x0F172A,
      roughness: 0.5,
      metalness: 0.3,
    });
    const cameraLens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), camMat);
    cameraLens.position.set(0, 2.8, 0.23);
    group.add(cameraLens);

    // 底部按钮
    const btnMat = new THREE.MeshStandardMaterial({
      color: 0x64748B,
      roughness: 0.5,
    });
    const btn = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), btnMat);
    btn.position.set(0, -2.8, 0.23);
    group.add(btn);

    group.position.set(-3, 0.5, 0);
    return group;
  }

  const device = createDevice();
  scene.add(device);

  // ===== Test Result Sphere (数据球) =====
  function createDataSphere() {
    const geometry = new THREE.SphereGeometry(1.8, 64, 64);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x0F172A,
      roughness: 0.2,
      metalness: 0.6,
      clearcoat: 0.3,
      transparent: true,
      opacity: 0.95,
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(0, 0.5, 0);
    sphere.castShadow = true;
    return sphere;
  }

  const dataSphere = createDataSphere();
  scene.add(dataSphere);

  // 球体表面的测试结果点
  function addResultPoints(sphere, results) {
    const count = results?.length || 60;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.82; // 略大于球体半径

      // 模拟结果：80% 通过（绿）, 15% 失败（红）, 5% 修复（紫）
      const rand = Math.random();
      let color;
      if (rand < 0.8) color = [0.13, 0.77, 0.37]; // green
      else if (rand < 0.95) color = [0.94, 0.27, 0.27]; // red
      else color = [0.66, 0.33, 0.97]; // purple

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
      sizes[i] = 0.06 + Math.random() * 0.04;
    }

    const pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pointGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    pointGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const pointMat = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(pointGeo, pointMat);
    sphere.add(points);
  }

  addResultPoints(dataSphere);

  // ===== 粒子系统：测试执行轨迹 =====
  function createParticleTrail() {
    const count = 300;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 2 + Math.random() * 4;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 6;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      colors[i * 3] = 0.23;
      colors[i * 3 + 1] = 0.51 + Math.random() * 0.3;
      colors[i * 3 + 2] = 0.96;

      velocities.push({
        x: (Math.random() - 0.5) * 0.02,
        y: (Math.random() - 0.5) * 0.02,
        z: (Math.random() - 0.5) * 0.02,
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particleSystem = new THREE.Points(geometry, material);
    particleSystem.userData = { velocities };
    return particleSystem;
  }

  const particles = createParticleTrail();
  scene.add(particles);

  // ===== 浮动数据环（装饰） =====
  function createOrbitRing(radius, color, yOffset) {
    const geometry = new THREE.RingGeometry(radius - 0.02, radius + 0.02, 64);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = yOffset;
    return ring;
  }

  scene.add(createOrbitRing(3.5, 0x3B82F6, -1.5));
  scene.add(createOrbitRing(4.0, 0xA855F7, 1.0));
  scene.add(createOrbitRing(4.5, 0x22C55E, -0.5));

  // ===== Connection Lines (设备 ↔ 数据球) =====
  function createConnectionLine(start, end, color) {
    const points = [
      new THREE.Vector3(start.x, start.y, start.z),
      new THREE.Vector3(
        (start.x + end.x) / 2,
        (start.y + end.y) / 2 + 1.5,
        (start.z + end.z) / 2
      ),
      new THREE.Vector3(end.x, end.y, end.z),
    ];
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 20, 0.02, 8, false);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.2,
    });
    return new THREE.Mesh(geometry, material);
  }

  const devicePos = { x: -3, y: 0.5, z: 0 };
  const spherePos = { x: 0, y: 0.5, z: 0 };
  scene.add(createConnectionLine(devicePos, spherePos, 0x3B82F6));

  // ===== Resize Handler =====
  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  // ===== Mouse Interaction =====
  let mouseX = 0, mouseY = 0;
  container.addEventListener('mousemove', (e) => {
    const rect = container.getBoundingClientRect();
    mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    cursorLight.position.set(
      mouseX * 6,
      mouseY * 4,
      5
    );
  });

  // ===== Animation Loop =====
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // 设备悬浮
    device.position.y = 0.5 + Math.sin(t * 0.8) * 0.15;
    device.rotation.z = Math.sin(t * 0.5) * 0.03;

    // 数据球自转
    dataSphere.rotation.y = t * 0.15;
    dataSphere.rotation.x = Math.sin(t * 0.1) * 0.05;

    // 粒子浮动
    const pos = particles.geometry.attributes.position;
    const vel = particles.userData.velocities;
    for (let i = 0; i < pos.count; i++) {
      pos.array[i * 3] += vel[i].x;
      pos.array[i * 3 + 1] += vel[i].y;
      pos.array[i * 3 + 2] += vel[i].z;

      // 边界环绕
      if (Math.abs(pos.array[i * 3]) > 6) vel[i].x *= -1;
      if (Math.abs(pos.array[i * 3 + 1]) > 4) vel[i].y *= -1;
      if (Math.abs(pos.array[i * 3 + 2]) > 6) vel[i].z *= -1;
    }
    pos.needsUpdate = true;

    // 轨道环旋转
    scene.children.forEach(child => {
      if (child.isMesh && child.geometry.type === 'RingGeometry') {
        child.rotation.z = t * 0.1;
      }
    });

    // 连接线脉冲
    scene.children.forEach(child => {
      if (child.isMesh && child.geometry.type === 'TubeGeometry') {
        child.material.opacity = 0.15 + Math.sin(t * 2) * 0.1;
      }
    });

    // 柔和相机跟随鼠标
    camera.position.x += (mouseX * 2 - camera.position.x + 8) * 0.02;
    camera.position.y += (mouseY * 1.5 - camera.position.y + 6) * 0.02;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  animate();

  // ===== API =====
  return {
    scene,
    camera,
    renderer,
    dispose: () => {
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
