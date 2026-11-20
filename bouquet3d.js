/* =========================================================
   3D bouquet: procedural roses, spin / zoom, tap a rose.
   ========================================================= */
import * as THREE from "./vendor/three.js";
import { OrbitControls, mergeGeometries } from "./vendor/three.js";

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOutBack = (x) => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

export const ROSE_COLORS = {
  red:   { petal: "#a50d26", sheen: "#ff6f86" },
  pink:  { petal: "#f290b0", sheen: "#ffe0ea" },
  white: { petal: "#fbf4ea", sheen: "#ffffff" },
  sunflower: { petal: "#f5b301", sheen: "#fff1b8" },
};
const SUN_RAYS = 34, SUN_SEEDS = 80;

const PETALS = 24;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/* ---------- geometry ---------- */

// One rose petal. t = 0 (tight center) .. 1 (open outer petal).
function petalGeometry(t) {
  const H = lerp(0.55, 1.0, t);
  const W = lerp(0.55, 1.05, t);
  const Rc = lerp(0.12, 0.42, t);
  const lean = lerp(0.02, 0.5, Math.pow(t, 1.6));
  const curl = lerp(0, 0.22, t * t);
  const drop = t * 0.18;
  const cols = 9, rows = 12;
  const pos = [], col = [], idx = [];
  for (let r = 0; r < rows; r++) {
    const v = r / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const u = (c / (cols - 1)) * 2 - 1;
      const vv = v * (1 - 0.22 * u * u);                        // rounded tip
      const wv = W * Math.sin(Math.PI * (0.18 + 0.72 * vv));    // half-width at this height
      const theta = u * Math.min(wv / Rc, 2.3);                 // wrap around the center
      const radial = Rc + lean * Math.pow(vv, 1.6) * H + curl * Math.pow(Math.max(0, vv - 0.55), 2) * H * 4;
      const y = vv * H * (1 - 0.25 * lean * vv) - drop;
      pos.push(radial * Math.sin(theta), y, radial * Math.cos(theta));
      const shade = 0.74 + 0.26 * Math.pow(vv, 0.7) + 0.03 * Math.abs(u);
      col.push(shade, shade, shade);
    }
  }
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A leaf (points up +Y), folded along the midrib.
function leafGeometry(len = 1, width = 0.36, fold = 0.12, bend = 0.18) {
  const cols = 7, rows = 10, pos = [], col = [], idx = [];
  for (let r = 0; r < rows; r++) {
    const v = r / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const u = (c / (cols - 1)) * 2 - 1;
      const w = width * Math.sin(Math.PI * Math.pow(v, 0.8)) * (v < 0.05 ? 0.3 : 1);
      const x = u * w;
      const y = v * len;
      const z = -Math.abs(u) * fold * w + bend * v * v;
      pos.push(x, y, z);
      const s = 0.75 + 0.25 * v - 0.1 * Math.abs(u);
      col.push(s, s, s);
    }
  }
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Wrapping paper: a flared cone, low at the front, wavy top edge.
function paperGeometry(frontDrop, wave, phase, rTop) {
  const segT = 64, segS = 14, pos = [], uv = [], idx = [];
  const yb = -2.8;
  for (let i = 0; i <= segT; i++) {
    const th = (i / segT) * Math.PI * 2;
    const front = Math.pow(Math.max(0, Math.cos(th - Math.PI / 2 + phase)), 2);   // +z faces camera
    const topY = 0.3 + wave * Math.sin(th * 5 + phase * 3) - frontDrop * front;
    for (let j = 0; j <= segS; j++) {
      const s = j / segS;
      const y = lerp(yb, topY, s);
      const r = lerp(0.2, rTop, s) * (1 + 0.14 * Math.pow(s, 5)) + 0.015 * Math.sin(th * 23 + s * 9);
      pos.push(Math.cos(th) * r, y, Math.sin(th) * r);
      uv.push(i / segT, s);
    }
  }
  for (let i = 0; i < segT; i++)
    for (let j = 0; j < segS; j++) {
      const a = i * (segS + 1) + j, b = a + 1, c = a + segS + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.35);
  s.bezierCurveTo(-0.1, -0.22, -0.5, -0.05, -0.5, 0.18);
  s.bezierCurveTo(-0.5, 0.4, -0.22, 0.48, 0, 0.28);
  s.bezierCurveTo(0.22, 0.48, 0.5, 0.4, 0.5, 0.18);
  s.bezierCurveTo(0.5, -0.05, 0.1, -0.22, 0, -0.35);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3, curveSegments: 16 });
  g.center();
  return g;
}

// Shared across all bouquets
const SHARED = {
  petals: Array.from({ length: PETALS }, (_, i) => petalGeometry(i / (PETALS - 1))),
  sepal: leafGeometry(0.55, 0.09, 0.05, 0.25),
  leaf: leafGeometry(1, 0.36, 0.12, 0.2),
  floatPetal: petalGeometry(0.85),
  heart: heartGeometry(),
  bud: new THREE.SphereGeometry(1, 8, 6),
  ray: leafGeometry(0.62, 0.12, 0.05, 0.06),
  disk: new THREE.SphereGeometry(1, 28, 14),
  seed: new THREE.IcosahedronGeometry(1, 0),
};

/* ---------- the scene ---------- */

export class Bouquet3D {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(0, 4.6, 10.2);

    const hemi = new THREE.HemisphereLight(0xfff6f0, 0x8a6a64, 1.6);
    const key = new THREE.DirectionalLight(0xfff0e0, 2.1);
    key.position.set(3, 6, 5);
    const rim = new THREE.DirectionalLight(0xffc6d2, 1.1);
    rim.position.set(-5, 2, -4);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-2, -1, 6);
    this.scene.add(hemi, key, rim, fill);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 15;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.4;
    this.controls.rotateSpeed = 0.7;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.9;
    this.controls.update();
    let resume;
    this.controls.addEventListener("start", () => { this.controls.autoRotate = false; clearTimeout(resume); this.onInteract?.(); });
    this.controls.addEventListener("end", () => { resume = setTimeout(() => (this.controls.autoRotate = true), 5000); });

    this.raycaster = new THREE.Raycaster();
    this.effects = [];
    this.clock = { last: performance.now(), getElapsedTime: () => performance.now() / 1000, getDelta() { const n = performance.now(); const d = (n - this.last) / 1000; this.last = n; return d; } };
    this.group = null;

    // tap detection (ignore drags)
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
    el.addEventListener("pointerup", (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved < 8 && performance.now() - down.t < 500) this.tap(e);
      down = null;
    });

    new ResizeObserver(() => this.resize()).observe(container);
    window.__bouquet = this; // handy for debugging in the browser console
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* Build a bouquet from a plan: { roses:[{color}], wrap, ribbon, filler, seed } */
  build(plan, r, animate) {
    this.clear();
    const g = new THREE.Group();
    this.group = g;
    this.scene.add(g);
    this.start = this.clock.getElapsedTime();
    this.animate = animate;

    /* rose head placement on a dome */
    const n = plan.roses.length;
    const center = new THREE.Vector3(0, 0.2, 0);
    const R = 1.8, cap = 1 - Math.cos(THREE.MathUtils.degToRad(84));
    const conv = new THREE.Vector3(0, -2.0, 0);
    const up = new THREE.Vector3(0, 1, 0);
    const startPhi = r() * Math.PI * 2;
    this.roses = plan.roses.map((ro, k) => {
      const z = 1 - ((k + 0.5) / n) * cap;
      const ring = Math.sqrt(1 - z * z);
      const phi = startPhi + k * GOLDEN;
      const dir = new THREE.Vector3(ring * Math.cos(phi), z, ring * Math.sin(phi));
      const pos = center.clone().addScaledVector(dir, R + lerp(-0.12, 0.12, r()));
      pos.x += lerp(-0.08, 0.08, r()); pos.z += lerp(-0.08, 0.08, r());
      const axis = pos.clone().sub(conv).normalize().lerp(dir, 0.6).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(up, axis)
        .multiply(new THREE.Quaternion().setFromAxisAngle(up, r() * Math.PI * 2));
      return {
        color: ro.color, pos, axis, q,
        scale: lerp(0.47, 0.55, r()) * (ro.color === "sunflower" ? 1.3 : 1),
        phase: r() * Math.PI * 2,
        delay: animate ? 0.25 + k * 0.07 + r() * 0.15 : -10,
        pop: 0, popT: -10,
      };
    });

    /* petals: one instanced mesh per petal ring, one instance per rose */
    this.petalMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.55,
      sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color("#ffd9e2"),
    });
    const tint = new THREE.Color();
    this.petalMeshes = SHARED.petals.map((geo) => {
      const m = new THREE.InstancedMesh(geo, this.petalMat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.roses.forEach((ro, k) => m.setColorAt(k, tint.set(ROSE_COLORS[ro.color].petal)));
      m.frustumCulled = false;
      g.add(m);
      return m;
    });
    this.petalAngles = SHARED.petals.map((_, i) => i * GOLDEN * 1.0 + (i % 2) * 0.3);

    /* sepals (5 little green leaves under each head) */
    this.green = new THREE.MeshStandardMaterial({ vertexColors: true, color: "#5a8f4f", roughness: 0.7, side: THREE.DoubleSide });
    this.sepals = new THREE.InstancedMesh(SHARED.sepal, this.green, n * 5);
    this.sepals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sepals.frustumCulled = false;
    g.add(this.sepals);

    /* sunflowers (only built when the bouquet has some) */
    this.sun = null;
    if (this.roses.some((ro) => ro.color === "sunflower")) {
      const rays = new THREE.InstancedMesh(SHARED.ray, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), n * SUN_RAYS);
      const disk = new THREE.InstancedMesh(SHARED.disk, new THREE.MeshStandardMaterial({ color: "#3a2210", roughness: 0.95 }), n);
      const calyx = new THREE.InstancedMesh(SHARED.disk, new THREE.MeshStandardMaterial({ color: "#3f6b3a", roughness: 0.8 }), n);
      const seeds = new THREE.InstancedMesh(SHARED.seed, new THREE.MeshStandardMaterial({ roughness: 0.9 }), n * SUN_SEEDS);
      [rays, disk, calyx, seeds].forEach((mesh) => { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; g.add(mesh); });
      const yellows = ["#f7b500", "#f5a800", "#ffc21a", "#f29c00"];
      for (let k = 0; k < n; k++) {
        for (let i = 0; i < SUN_RAYS; i++) rays.setColorAt(k * SUN_RAYS + i, tint.set(yellows[(i * 3 + k) % yellows.length]).multiplyScalar(i % 2 ? 0.92 : 1));
        for (let j = 0; j < SUN_SEEDS; j++) {
          const f = j / SUN_SEEDS;
          seeds.setColorAt(k * SUN_SEEDS + j, tint.set(f < 0.15 ? "#6b5a1e" : j % 3 ? "#2a1608" : "#5b3a18"));
        }
      }
      this.sun = { rays, disk, calyx, seeds, tilts: Array.from({ length: SUN_RAYS }, () => lerp(-0.12, 0.12, r())) };
    }

    /* stems, merged into one mesh */
    const stems = this.roses.map((ro) => {
      const base = ro.pos.clone().addScaledVector(ro.axis, -0.12);
      const mid = base.clone().lerp(conv, 0.5).addScaledVector(ro.axis, 0.2);
      const c2 = conv.clone().add(new THREE.Vector3(lerp(-0.08, 0.08, r()), 0, lerp(-0.08, 0.08, r())));
      const end = new THREE.Vector3(lerp(-0.22, 0.22, r()), -3.35, lerp(-0.22, 0.22, r()));
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([base, mid, c2, end]), 24, 0.04, 5, false);
    });
    const stemMesh = new THREE.Mesh(mergeGeometries(stems), new THREE.MeshStandardMaterial({ color: "#3f6b3a", roughness: 0.8 }));
    stems.forEach((s) => s.dispose());
    g.add(stemMesh);

    /* leaves around the edge */
    const leafCount = 14;
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, side: THREE.DoubleSide });
    const leaves = new THREE.InstancedMesh(SHARED.leaf, leafMat, leafCount);
    const greens = ["#4f8a47", "#5f9a55", "#3f7a3c", "#6aa35e"];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < leafCount; i++) {
      const phi = (i / leafCount) * Math.PI * 2 + lerp(-0.2, 0.2, r());
      const pol = THREE.MathUtils.degToRad(lerp(66, 80, r()));
      const dir = new THREE.Vector3(Math.sin(pol) * Math.cos(phi), Math.cos(pol), Math.sin(pol) * Math.sin(phi));
      const p = center.clone().addScaledVector(dir, R * 0.8);
      const out = dir.clone().add(new THREE.Vector3(0, 0.55, 0)).normalize();
      q.setFromUnitVectors(up, out).multiply(new THREE.Quaternion().setFromAxisAngle(up, r() * Math.PI));
      const sc = lerp(0.75, 1.0, r());
      m4.compose(p, q, s.set(sc, sc, sc));
      leaves.setMatrixAt(i, m4);
      leaves.setColorAt(i, tint.set(greens[i % greens.length]));
    }
    g.add(leaves);

    /* greenery mound inside the bouquet so gaps show leaves, not bare stems */
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
      new THREE.MeshStandardMaterial({ color: "#2f5a2e", roughness: 0.9 })
    );
    mound.scale.set(1.75, 1.45, 1.75);
    mound.position.copy(center).add(new THREE.Vector3(0, -0.15, 0));
    g.add(mound);
    const fillCount = 70;
    const fill = new THREE.InstancedMesh(SHARED.leaf, leafMat, fillCount);
    for (let i = 0; i < fillCount; i++) {
      const phi = i * GOLDEN + r() * 0.4;
      const pol = Math.acos(1 - ((i + 0.5) / fillCount) * (1 - Math.cos(THREE.MathUtils.degToRad(72))));
      const dir = new THREE.Vector3(Math.sin(pol) * Math.cos(phi), Math.cos(pol), Math.sin(pol) * Math.sin(phi));
      const p = center.clone().add(new THREE.Vector3(dir.x * 1.45, dir.y * 1.25 - 0.15, dir.z * 1.45));
      q.setFromUnitVectors(up, dir.clone().add(new THREE.Vector3(lerp(-0.3, 0.3, r()), 0.2, lerp(-0.3, 0.3, r()))).normalize())
        .multiply(new THREE.Quaternion().setFromAxisAngle(up, r() * Math.PI));
      const sc = lerp(0.55, 0.8, r());
      m4.compose(p, q, s.set(sc, sc, sc));
      fill.setMatrixAt(i, m4);
      fill.setColorAt(i, tint.set(greens[(i * 7) % greens.length]).multiplyScalar(lerp(0.75, 1, r())));
    }
    g.add(fill);

    /* baby's breath */
    if (plan.filler) {
      const count = 70;
      const bb = new THREE.InstancedMesh(SHARED.bud, new THREE.MeshStandardMaterial({ color: "#fffdf7", roughness: 0.6 }), count);
      let k = 0;
      for (let c = 0; c < 10 && k < count; c++) {
        const phi = r() * Math.PI * 2, pol = THREE.MathUtils.degToRad(lerp(15, 70, r()));
        const dir = new THREE.Vector3(Math.sin(pol) * Math.cos(phi), Math.cos(pol), Math.sin(pol) * Math.sin(phi));
        const cc = center.clone().addScaledVector(dir, R + 0.5);
        for (let j = 0; j < 7 && k < count; j++, k++) {
          const p = cc.clone().add(new THREE.Vector3(lerp(-0.2, 0.2, r()), lerp(-0.15, 0.15, r()), lerp(-0.2, 0.2, r())));
          const sc = lerp(0.035, 0.06, r());
          m4.compose(p, q.identity(), s.set(sc, sc, sc));
          bb.setMatrixAt(k, m4);
        }
      }
      g.add(bb);
    }

    /* wrapping paper (two layers) */
    const paperMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, side: THREE.DoubleSide });
    const back = new THREE.Mesh(paperGeometry(-0.25, 0.1, Math.PI, 2.15), paperMat(plan.wrap.back));
    const front = new THREE.Mesh(paperGeometry(0.15, 0.07, 0, 1.9), paperMat(plan.wrap.front));
    front.scale.setScalar(1.02);
    g.add(back, front);

    /* ribbon + bow */
    const ribbonMat = new THREE.MeshStandardMaterial({ color: plan.ribbon, roughness: 0.35, metalness: 0.05 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 48), ribbonMat);
    band.rotation.x = Math.PI / 2; band.position.y = -1.95; band.scale.z = 2.2;
    g.add(band);
    const bow = new THREE.Group();
    const loopGeo = new THREE.TorusGeometry(0.2, 0.055, 8, 24);
    [-1, 1].forEach((side) => {
      const loop = new THREE.Mesh(loopGeo, ribbonMat);
      loop.position.set(side * 0.2, 0.02, 0);
      loop.scale.set(1.25, 0.75, 0.6);
      loop.rotation.z = side * 0.25;
      bow.add(loop);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.025), ribbonMat);
      tail.position.set(side * 0.1, -0.3, 0.02);
      tail.rotation.z = side * 0.3;
      bow.add(tail);
    });
    bow.add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), ribbonMat));
    bow.position.set(0, -1.95, 0.68);
    g.add(bow);

    this.updateRoses(0);
  }

  clear() {
    this.effects.forEach((fx) => { this.scene.remove(fx.mesh); fx.mesh.material.dispose(); });
    this.effects = [];
    if (!this.group) return;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry && !Object.values(SHARED).includes(o.geometry) && !SHARED.petals.includes(o.geometry)) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.group = null;
  }

  updateRoses(t) {
    const m = new THREE.Matrix4(), head = new THREE.Matrix4(), p = new THREE.Matrix4();
    const ry = new THREE.Matrix4(), rx = new THREE.Matrix4(), sway = new THREE.Quaternion();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
    const swayAxis = new THREE.Vector3(1, 0, 0);
    const now = this.clock.getElapsedTime();

    this.roses.forEach((ro, k) => {
      const b = clamp01((t - ro.delay) / 1.3);              // bloom progress 0..1
      const grow = b <= 0 ? 0.0001 : easeOutBack(clamp01(b * 1.4));
      const open = easeOutCubic(b);
      const since = now - ro.popT;
      const pop = since < 1.6 ? Math.sin(Math.min(1, since / 1.6) * Math.PI) * Math.exp(-since * 0.6) : 0;

      sway.setFromAxisAngle(swayAxis, Math.sin(now * 1.2 + ro.phase) * 0.035 + pop * 0.15);
      tmpQ.copy(ro.q).multiply(sway);
      pos.copy(ro.pos).addScaledVector(ro.axis, pop * 0.35);
      const s = ro.scale * grow * (1 + pop * 0.18);
      head.compose(pos, tmpQ, scl.set(s, s, s));
      const isSun = ro.color === "sunflower";

      if (this.sun) this.updateSunflower(k, isSun ? head : null, open, pop);
      for (let i = 0; i < PETALS; i++) {
        if (isSun) { this.petalMeshes[i].setMatrixAt(k, ZERO); continue; }
        const ti = i / (PETALS - 1);
        const closed = -(0.25 + 0.9 * ti) * (1 - open);       // bud -> open
        const extra = pop * 0.45 * ti;                         // tap: petals relax open
        ry.makeRotationY(this.petalAngles[i]);
        rx.makeRotationX(closed + extra);
        p.multiplyMatrices(ry, rx);
        m.multiplyMatrices(head, p);
        this.petalMeshes[i].setMatrixAt(k, m);
      }
      for (let j = 0; j < 5; j++) {
        ry.makeRotationY((j / 5) * Math.PI * 2);
        rx.makeRotationX(2.0 - 0.3 * open);
        p.multiplyMatrices(ry, rx);
        p.setPosition(0, -0.05, 0);
        m.multiplyMatrices(head, p);
        this.sepals.setMatrixAt(k * 5 + j, m);
      }
    });
    this.petalMeshes.forEach((mesh) => (mesh.instanceMatrix.needsUpdate = true));
    this.sepals.instanceMatrix.needsUpdate = true;
    if (this.sun) ["rays", "disk", "calyx", "seeds"].forEach((key) => (this.sun[key].instanceMatrix.needsUpdate = true));
  }

  // head = this sunflower's matrix, or null to hide sunflower parts on a rose
  updateSunflower(k, head, open, pop) {
    const { rays, disk, calyx, seeds, tilts } = this.sun;
    if (!head) {
      for (let i = 0; i < SUN_RAYS; i++) rays.setMatrixAt(k * SUN_RAYS + i, ZERO);
      for (let j = 0; j < SUN_SEEDS; j++) seeds.setMatrixAt(k * SUN_SEEDS + j, ZERO);
      disk.setMatrixAt(k, ZERO); calyx.setMatrixAt(k, ZERO);
      return;
    }
    const m = new THREE.Matrix4(), p = new THREE.Matrix4(), ry = new THREE.Matrix4(), rx = new THREE.Matrix4(), tr = new THREE.Matrix4();
    // petals: two rings that unfold from upright to flat
    for (let i = 0; i < SUN_RAYS; i++) {
      const inner = i % 2 === 1;
      const a = (i / SUN_RAYS) * Math.PI * 2;
      const flat = inner ? 1.25 : 1.42;
      const tilt = lerp(0.15, flat, open) + tilts[i] - pop * 0.25;
      ry.makeRotationY(a);
      tr.makeTranslation(0, inner ? 0.1 : 0.07, inner ? 0.3 : 0.33);
      rx.makeRotationX(tilt);
      p.multiplyMatrices(ry, tr).multiply(rx);
      if (inner) p.scale(new THREE.Vector3(0.95, 0.88, 0.95));
      m.multiplyMatrices(head, p);
      rays.setMatrixAt(k * SUN_RAYS + i, m);
    }
    // center disk, green back, and spiral seeds
    p.compose(new THREE.Vector3(0, 0.1, 0), new THREE.Quaternion(), new THREE.Vector3(0.4, 0.12, 0.4));
    disk.setMatrixAt(k, m.multiplyMatrices(head, p));
    p.compose(new THREE.Vector3(0, 0.02, 0), new THREE.Quaternion(), new THREE.Vector3(0.38, 0.14, 0.38));
    calyx.setMatrixAt(k, m.multiplyMatrices(head, p));
    const q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let j = 0; j < SUN_SEEDS; j++) {
      const rr = 0.36 * Math.sqrt((j + 0.5) / SUN_SEEDS);
      const ang = j * GOLDEN;
      const h = 0.1 + 0.12 * Math.sqrt(Math.max(0, 1 - (rr / 0.4) ** 2));
      const size = 0.028 + 0.012 * (rr / 0.36);
      p.compose(v.set(Math.cos(ang) * rr, h, Math.sin(ang) * rr), q, sc.set(size, size * 0.7, size));
      seeds.setMatrixAt(k * SUN_SEEDS + j, m.multiplyMatrices(head, p));
    }
  }

  tap(e) {
    if (!this.group) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets = [...this.petalMeshes];
    if (this.sun) targets.push(this.sun.rays, this.sun.disk);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit || hit.instanceId == null) return;
    const id = this.sun && hit.object === this.sun.rays ? Math.floor(hit.instanceId / SUN_RAYS) : hit.instanceId;
    const ro = this.roses[id];
    ro.popT = this.clock.getElapsedTime();
    this.onInteract?.();
    if (navigator.vibrate) navigator.vibrate(12);

    const world = ro.pos.clone().addScaledVector(ro.axis, 0.5).applyMatrix4(this.group.matrixWorld);
    const color = ROSE_COLORS[ro.color].petal;
    for (let i = 0; i < 14; i++) this.spawn("petal", world, color);
    for (let i = 0; i < 3; i++) this.spawn("heart", world, i === 1 ? "#ff7a99" : "#e0294a");
  }

  spawn(kind, at, color) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, side: THREE.DoubleSide, transparent: true });
    const mesh = new THREE.Mesh(kind === "heart" ? SHARED.heart : SHARED.floatPetal, mat);
    mesh.position.copy(at);
    const size = kind === "heart" ? lerp(0.34, 0.46, Math.random()) : lerp(0.24, 0.34, Math.random());
    mesh.scale.setScalar(size);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    const a = Math.random() * Math.PI * 2;
    const vel = kind === "heart"
      ? new THREE.Vector3(Math.cos(a) * 0.4, lerp(1.1, 1.6, Math.random()), Math.sin(a) * 0.4 + 0.3)
      : new THREE.Vector3(Math.cos(a) * lerp(0.8, 1.8, Math.random()), lerp(1.2, 2.4, Math.random()), Math.sin(a) * lerp(0.8, 1.8, Math.random()));
    this.scene.add(mesh);
    this.effects.push({ kind, mesh, vel, size, born: this.clock.getElapsedTime(), life: kind === "heart" ? 2.2 : 3.2, spin: new THREE.Vector3(Math.random() * 3, Math.random() * 3, Math.random() * 3) });
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const now = this.clock.getElapsedTime();
    this.controls.update();
    if (this.group) {
      const t = now - this.start;
      const intro = this.animate ? easeOutCubic(clamp01(t / 0.9)) : 1;
      this.group.scale.setScalar(0.75 + 0.25 * intro);
      this.group.position.y = (1 - intro) * -0.8 + Math.sin(now * 0.8) * 0.04;
      this.group.rotation.z = Math.sin(now * 0.6) * 0.015;
      this.updateRoses(t);
    }
    this.effects = this.effects.filter((fx) => {
      const age = now - fx.born;
      if (age > fx.life) { this.scene.remove(fx.mesh); fx.mesh.material.dispose(); return false; }
      if (fx.kind === "heart") {
        fx.mesh.position.addScaledVector(fx.vel, dt);
        fx.mesh.position.x += Math.sin(age * 4 + fx.born) * 0.006;
        fx.mesh.rotation.set(0, Math.sin(age * 2) * 0.5, Math.sin(age * 3) * 0.15);
        fx.mesh.quaternion.premultiply(this.camera.quaternion.clone());
        fx.mesh.scale.setScalar(fx.size * easeOutBack(clamp01(age * 3)));
      } else {
        fx.vel.y -= 2.2 * dt;                         // gravity
        fx.vel.multiplyScalar(1 - 1.6 * dt);          // air drag = flutter
        fx.mesh.position.addScaledVector(fx.vel, dt);
        fx.mesh.position.x += Math.sin(age * 5 + fx.born * 7) * 0.01;
        fx.mesh.rotation.x += fx.spin.x * dt; fx.mesh.rotation.y += fx.spin.y * dt; fx.mesh.rotation.z += fx.spin.z * dt;
      }
      fx.mesh.material.opacity = 1 - Math.pow(age / fx.life, 3);
      return true;
    });
    this.renderer.render(this.scene, this.camera);
  }
}
