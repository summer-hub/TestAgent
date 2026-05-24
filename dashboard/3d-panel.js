/**
 * 3D Scene Panel — 嵌入仪表盘的 Three.js 可视化组件
 *
 * 使用方式：
 *   <div id="three-container"></div>
 *   <script type="module">
 *     import { ScenePanel } from './3d-panel.js';
 *     const panel = new ScenePanel('three-container');
 *     panel.loadData({ passRate: 98.5, passed: 48, failed: 6, fixed: 4, running: 2 });
 *   </script>
 */

export class ScenePanel {
  constructor(containerId) {
    this.container = typeof containerId === 'string'
      ? document.getElementById(containerId)
      : containerId;
    if (!this.container) throw new Error('Container not found');

    this._initThree();
    this._initScene();
    this._animate();
  }

  async _initThree() {
    const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js');
    this.THREE = THREE;

    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 300;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 50);
    this.camera.position.set(4, 3, 6);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.8;
    this.container.appendChild(this.renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0x334155, 0.6);
    this.scene.add(ambient);
    const main = new THREE.DirectionalLight(0xffffff, 1.5);
    main.position.set(3, 5, 4);
    this.scene.add(main);
    const fill = new THREE.DirectionalLight(0x3B82F6, 0.5);
    fill.position.set(-3, 1, 3);
    this.scene.add(fill);

    // Resize
    const ro = new ResizeObserver(() => {
      const w2 = this.container.clientWidth;
      const h2 = this.container.clientHeight;
      this.camera.aspect = w2 / h2;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w2, h2);
    });
    ro.observe(this.container);
  }

  _initScene() {
    if (!this.THREE) return;
    const T = this.THREE;

    // Data sphere
    const sphereMat = new T.MeshPhysicalMaterial({
      color: 0x0F172A, roughness: 0.1, metalness: 0.8,
      clearcoat: 0.3, transparent: true, opacity: 0.95,
    });
    this.sphere = new T.Mesh(new T.SphereGeometry(1.2, 32, 32), sphereMat);
    this.sphere.position.y = 0.3;
    this.scene.add(this.sphere);

    // Grid floor
    const grid = new T.GridHelper(6, 12, 0x1E293B, 0x334155);
    grid.position.y = -0.8;
    this.scene.add(grid);

    // Surface dots
    this.dotCount = 80;
    const dotGeo = new T.BufferGeometry();
    const pos = new Float32Array(this.dotCount * 3);
    this.dotData = [];
    for (let i = 0; i < this.dotCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.22;
      pos[i*3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i*3+1] = r * Math.cos(phi);
      pos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
      this.dotData.push({ theta, phi, r });
    }
    dotGeo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const dotMat = new T.PointsMaterial({
      color: 0x3B82F6, size: 0.07,
      transparent: true, opacity: 0.8,
      blending: T.AdditiveBlending,
    });
    this.dots = new T.Points(dotGeo, dotMat);
    this.sphere.add(this.dots);
  }

  loadData(data) {
    if (!data || !this.THREE) return;
    const T = this.THREE;

    const colors = new Float32Array(this.dotCount * 3);
    const counts = [
      { status: 'passed', pct: data.passed / data.totalTests, color: [0.13, 0.77, 0.37] },
      { status: 'failed', pct: data.failed / data.totalTests, color: [0.94, 0.27, 0.27] },
      { status: 'fixed',  pct: data.fixed / data.totalTests, color: [0.66, 0.33, 0.97] },
      { status: 'running', pct: data.running / data.totalTests, color: [0.23, 0.51, 0.96] },
    ];

    for (let i = 0; i < this.dotCount; i++) {
      let r = Math.random();
      let c = counts[0].color; // default
      let cum = 0;
      for (const item of counts) {
        cum += item.pct;
        if (r <= cum) { c = item.color; break; }
      }
      colors[i*3] = c[0];
      colors[i*3+1] = c[1];
      colors[i*3+2] = c[2];
    }

    this.dots.geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    this.dots.material = new T.PointsMaterial({
      size: 0.07, vertexColors: true,
      transparent: true, opacity: 0.8,
      blending: T.AdditiveBlending,
    });
  }

  _animate() {
    if (!this.THREE) { requestAnimationFrame(() => this._animate()); return; }

    const t = performance.now() / 1000;

    if (this.sphere) {
      this.sphere.rotation.y = t * 0.3;
      this.sphere.position.y = 0.3 + Math.sin(t * 0.8) * 0.08;
    }

    // 表面点微动
    if (this.dots) {
      const pos = this.dots.geometry.attributes.position;
      for (let i = 0; i < this.dotCount; i++) {
        const d = this.dotData[i];
        const r = d.r + Math.sin(t * 0.5 + i) * 0.01;
        pos.array[i*3] = r * Math.sin(d.phi) * Math.cos(d.theta + t * 0.01);
        pos.array[i*3+1] = r * Math.cos(d.phi);
        pos.array[i*3+2] = r * Math.sin(d.phi) * Math.sin(d.theta + t * 0.01);
      }
      pos.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this._animate());
  }

  dispose() {
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
