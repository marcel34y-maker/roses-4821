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
  lily: { petal: "#f6b3c9", sheen: "#ffffff" },
  peach:    { petal: "#f7ae86", sheen: "#ffe4d4" },
  lavender: { petal: "#c3a1dc", sheen: "#f1e6ff" },
  coral:    { petal: "#ef7a66", sheen: "#ffd6cc" },
  yellow:   { petal: "#f6d25e", sheen: "#fff4c8" },
  gardenia: { petal: "#fbf5e4", sheen: "#ffffff" },
};
const NOT_ROSES = ["sunflower", "lily", "gardenia"];
const isRose = (c) => !NOT_ROSES.includes(c);
const GARDENIA_RINGS = [
  { n: 6, tilt: 1.4,  s: 1.0,  off: 0 },
  { n: 6, tilt: 1.08, s: 0.86, off: 30 },
  { n: 5, tilt: 0.66, s: 0.64, off: 12 },
  { n: 3, tilt: 0.28, s: 0.44, off: 50 },
];
const GARDENIA_PETALS = GARDENIA_RINGS.reduce((a, r) => a + r.n, 0);
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

// Lily petal (tepal): long, pointed, curls back at the tip, white with a pink stripe and speckles.
function tepalGeometry(inner) {
  const L = inner ? 1.05 : 1.12, W = inner ? 0.3 : 0.22;
  const cols = 11, rows = 18, pos = [], col = [], idx = [];
  const white = [1, 0.97, 0.97], pink = [0.95, 0.45, 0.64], deep = [0.78, 0.2, 0.45], lime = [0.86, 0.92, 0.62];
  const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  for (let r = 0; r < rows; r++) {
    const v = r / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const u = (c / (cols - 1)) * 2 - 1;
      const w = W * Math.sin(Math.PI * Math.pow(v, 0.68)) * (v < 0.04 ? 0.5 : 1);
      const x = u * w;
      const y = v * L;
      let z = -u * u * w * 0.35;                                  // cupped across
      z += 0.9 * Math.pow(Math.max(0, v - 0.45), 2) * 2.2;          // tip curls back
      z += 0.025 * Math.sin(v * 22 + c) * Math.abs(u);              // wavy edges
      pos.push(x, y, z);
      const stripe = Math.pow(1 - Math.abs(u), 1.4) * smooth(0.04, 0.3, v) * (1 - 0.55 * smooth(0.7, 1, v));
      let cc = mix(white, pink, stripe * 0.95);
      if (v < 0.14) cc = mix(cc, lime, 1 - v / 0.14);
      const speck = Math.abs(Math.sin(r * 12.9898 + c * 78.233) * 43758.5453) % 1;
      if (speck < 0.09 && v > 0.15 && v < 0.62 && Math.abs(u) < 0.75) cc = deep;
      col.push(...cc);
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

// Lily center: 6 stamens with rusty anthers + a pistil, merged into one piece.
function stamenGeometry() {
  const parts = [];
  const paint = (geo, hex) => {
    const c = new THREE.Color(hex), n = geo.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    geo.deleteAttribute("uv");
    return geo;
  };
  for (let i = 0; i < 7; i++) {
    const pistil = i === 6;
    const a = (i / 6) * Math.PI * 2;
    const spread = pistil ? 0.05 : 0.32;
    const tip = new THREE.Vector3(Math.cos(a) * spread, pistil ? 0.85 : 0.72, Math.sin(a) * spread);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(tip.x * 0.3, tip.y * 0.6, tip.z * 0.3), tip);
    parts.push(paint(new THREE.TubeGeometry(curve, 8, pistil ? 0.022 : 0.014, 4, false), "#dfe9b8"));
    const head = new THREE.SphereGeometry(1, 8, 6);
    head.scale(pistil ? 0.045 : 0.025, pistil ? 0.04 : 0.025, pistil ? 0.045 : 0.075);
    head.lookAt(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)));
    head.translate(tip.x, tip.y, tip.z);
    parts.push(paint(head, pistil ? "#cfe0a0" : "#8a3510"));
  }
  return mergeGeometries(parts);
}

// Closed lily bud: a long green spindle that blushes at the tip.
function budGeometry() {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push(new THREE.Vector2(0.13 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.9) + 0.012, t));
  }
  const g = new THREE.LatheGeometry(pts, 12);
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  const base = new THREE.Color("#9cc46a"), mid = new THREE.Color("#d4e7a4"), tip = new THREE.Color("#f3e9e2"), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const t = g.attributes.position.getY(i);
    c.copy(base).lerp(mid, clamp01(t * 1.6)).lerp(tip, clamp01((t - 0.65) / 0.35) * 0.7);
    arr.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

// Gardenia petal: broad, rounded, waxy, with a little pinwheel twist.
function gardeniaPetalGeometry() {
  const L = 0.62, W = 0.3, cols = 9, rows = 12, pos = [], col = [], idx = [];
  for (let r = 0; r < rows; r++) {
    const v = r / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const u = (c / (cols - 1)) * 2 - 1;
      const vv = v * (1 - 0.28 * u * u);
      const w = W * Math.sin(Math.PI * (0.12 + 0.72 * vv));
      const x = u * w, y = vv * L;
      let z = -u * u * w * 0.28;                       // gently cupped
      z += u * w * vv * 0.35;                          // pinwheel twist
      z += 0.5 * Math.pow(Math.max(0, vv - 0.6), 2);   // tip relaxes back
      pos.push(x, y, z);
      const cream = clamp01(1 - vv / 0.35);
      col.push(1, 0.985 - 0.04 * cream, 0.95 - 0.16 * cream);
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

// Silver-dollar eucalyptus: a round, slightly cupped leaf.
function roundLeafGeometry() {
  const g = leafGeometry(0.42, 0.24, 0.05, 0.05);
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
  tepalOuter: tepalGeometry(false),
  tepalInner: tepalGeometry(true),
  stamens: stamenGeometry(),
  lilyBud: budGeometry(),
  dollar: roundLeafGeometry(),
  willow: leafGeometry(1.25, 0.12, 0.05, 0.3),
  gardeniaPetal: gardeniaPetalGeometry(),
  drop: new THREE.SphereGeometry(1, 10, 8),
  spark: new THREE.OctahedronGeometry(1, 0),
  glossy: leafGeometry(0.85, 0.3, 0.14, 0.1),
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
    this.pick = null;
    this.released = [];
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
    this.pick = null;
    this.released = [];

    /* rose head placement on a dome */
    const n = plan.roses.length;
    const vase = !!plan.vase;
    this.vase = vase;
    this.baseScale = vase ? 0.8 : 1;
    this.baseY = vase ? -0.55 : 0;
    const center = vase ? new THREE.Vector3(0, 1.45, 0) : new THREE.Vector3(0, 0.2, 0);
    const R = 1.8, cap = 1 - Math.cos(THREE.MathUtils.degToRad(vase ? 100 : 84));
    const stretchY = vase ? 0.9 : 1;
    const conv = vase ? new THREE.Vector3(0, -0.1, 0) : new THREE.Vector3(0, -2.0, 0);
    const up = new THREE.Vector3(0, 1, 0);
    const startPhi = r() * Math.PI * 2;
    this.roses = plan.roses.map((ro, k) => {
      const z = 1 - ((k + 0.5) / n) * cap;
      const ring = Math.sqrt(1 - z * z);
      const phi = startPhi + k * GOLDEN;
      const dir = new THREE.Vector3(ring * Math.cos(phi), z, ring * Math.sin(phi));
      const pos = center.clone().addScaledVector(dir, R + lerp(-0.12, 0.12, r()) + (vase ? (ro.color === "lily" || ro.color === "gardenia" ? 0.35 : -0.1) : 0));
      pos.y = center.y + (pos.y - center.y) * stretchY;
      pos.x += lerp(-0.08, 0.08, r()); pos.z += lerp(-0.08, 0.08, r());
      const axis = pos.clone().sub(conv).normalize().lerp(dir, 0.6).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(up, axis)
        .multiply(new THREE.Quaternion().setFromAxisAngle(up, r() * Math.PI * 2));
      return {
        color: ro.color, pos, axis, q,
        scale: lerp(0.47, 0.55, r()) * (ro.color === "sunflower" ? 1.3 : ro.color === "lily" ? 1.75 : ro.color === "gardenia" ? 1.95 : (plan.vase && !plan.roses.some((x) => x.color === "lily") ? 1.18 : 1)),
        tint: lerp(0, 1, r()),
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

    /* lilies (only built when the bouquet has some) */
    this.lily = null;
    if (this.roses.some((ro) => ro.color === "lily")) {
      const lilyMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color("#ffffff") });
      const outer = new THREE.InstancedMesh(SHARED.tepalOuter, lilyMat, n * 3);
      const inner = new THREE.InstancedMesh(SHARED.tepalInner, lilyMat, n * 3);
      const stamens = new THREE.InstancedMesh(SHARED.stamens, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), n);
      [outer, inner, stamens].forEach((mesh) => { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; g.add(mesh); });
      this.roses.forEach((ro, k) => {
        // some lilies blush pinker, some stay nearly white
        tint.setRGB(1, lerp(0.8, 1, ro.tint), lerp(0.86, 1, ro.tint));
        for (let j = 0; j < 3; j++) { outer.setColorAt(k * 3 + j, tint); inner.setColorAt(k * 3 + j, tint); }
      });
      this.lily = { outer, inner, stamens };
    }

    /* gardenias (only built when the bouquet has some) */
    this.gard = null;
    if (this.roses.some((ro) => ro.color === "gardenia")) {
      const petals = new THREE.InstancedMesh(SHARED.gardeniaPetal, new THREE.MeshPhysicalMaterial({
        vertexColors: true, side: THREE.DoubleSide, roughness: 0.32, emissive: new THREE.Color("#fff6e8"), emissiveIntensity: 0.14, clearcoat: 0.6, clearcoatRoughness: 0.3, sheen: 0.5, sheenColor: new THREE.Color("#ffffff"),
      }), n * GARDENIA_PETALS);
      const leaves = new THREE.InstancedMesh(SHARED.glossy, new THREE.MeshPhysicalMaterial({
        vertexColors: true, color: "#2c5a33", side: THREE.DoubleSide, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15,
      }), n * 3);
      [petals, leaves].forEach((mesh) => { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; g.add(mesh); });
      this.roses.forEach((ro, k) => {
        tint.setRGB(1, lerp(0.97, 1, ro.tint), lerp(0.9, 0.98, ro.tint));
        for (let j = 0; j < GARDENIA_PETALS; j++) petals.setColorAt(k * GARDENIA_PETALS + j, tint);
      });
      this.gard = { petals, leaves };
    }

    /* stems, merged into one mesh */
    const stemFor = (pos, axis, extraTop = 0) => {
      const base = pos.clone().addScaledVector(axis, -0.12 - extraTop);
      if (vase) {
        // stems cross inside the glass, like real cut flowers
        const a = r() * Math.PI * 2, rad = lerp(0.1, 0.5, r());
        const mouth = new THREE.Vector3(Math.cos(a) * rad, -0.1, Math.sin(a) * rad);
        const bottom = new THREE.Vector3(-Math.cos(a) * rad * 0.9, -2.45, -Math.sin(a) * rad * 0.9);
        const mid = base.clone().lerp(mouth, 0.5).addScaledVector(axis, 0.15);
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([base, mid, mouth, bottom]), 28, 0.04, 5, false);
      }
      const mid = base.clone().lerp(conv, 0.5).addScaledVector(axis, 0.2);
      const c2 = conv.clone().add(new THREE.Vector3(lerp(-0.08, 0.08, r()), 0, lerp(-0.08, 0.08, r())));
      const end = new THREE.Vector3(lerp(-0.22, 0.22, r()), -3.35, lerp(-0.22, 0.22, r()));
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([base, mid, c2, end]), 24, 0.04, 5, false);
    };
    const stems = this.roses.map((ro) => stemFor(ro.pos, ro.axis));

    /* lily buds standing up out of the arrangement */
    const budCount = plan.buds || 0;
    if (budCount) {
      const buds = new THREE.InstancedMesh(SHARED.lilyBud, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), budCount);
      const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ss = new THREE.Vector3();
      for (let i = 0; i < budCount; i++) {
        const phi = (i / budCount) * Math.PI * 2 + lerp(-0.3, 0.3, r()), pol = THREE.MathUtils.degToRad(lerp(18, 62, r()));
        const dir = new THREE.Vector3(Math.sin(pol) * Math.cos(phi), Math.cos(pol), Math.sin(pol) * Math.sin(phi));
        const p = center.clone().add(new THREE.Vector3(dir.x * 2.2, dir.y * 2.0 + 0.2, dir.z * 2.2));
        const axis = p.clone().sub(conv).normalize().lerp(dir, 0.4).normalize();
        qq.setFromUnitVectors(up, axis);
        const sc = lerp(0.7, 0.95, r());
        mm.compose(p, qq, ss.set(sc, sc, sc));
        buds.setMatrixAt(i, mm);
        stems.push(stemFor(p, axis, -0.12));
      }
      g.add(buds);
    }
    const stemMesh = new THREE.Mesh(mergeGeometries(stems), new THREE.MeshStandardMaterial({ color: vase ? "#6f9a52" : "#3f6b3a", roughness: 0.7 }));
    stems.forEach((s) => s.dispose());
    g.add(stemMesh);

    /* leaves around the edge */
    const leafCount = vase ? 0 : 14;
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
    if (vase) { mound.material.color.set("#5d7c6a"); mound.scale.set(1.05, 0.95, 1.05); mound.position.y -= 0.5; }
    g.add(mound);
    const fillCount = vase ? 0 : 70;
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

    if (vase) this.addEucalyptus(g, center, r);

    /* baby's breath */
    if (plan.filler && !vase) {
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

    if (vase) { this.addVase(g); this.updateRoses(0); return; }

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

  addEucalyptus(g, center, r) {
    const up = new THREE.Vector3(0, 1, 0);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), tint = new THREE.Color();
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    const silver = ["#8fa79b", "#9fb5aa", "#7f998d", "#a9bdb2", "#86a094"];

    // silver-dollar leaves: a shell around the flowers + sprigs spilling out over the edges
    const sprigs = 12, perSprig = 11, shell = 190;
    const dollars = new THREE.InstancedMesh(SHARED.dollar, leafMat, shell + sprigs * perSprig);
    let k = 0;
    for (let i = 0; i < shell; i++, k++) {
      const phi = i * GOLDEN + r() * 0.3;
      const pol = Math.acos(1 - ((i + 0.5) / shell) * (1 - Math.cos(THREE.MathUtils.degToRad(118))));
      const dir = new THREE.Vector3(Math.sin(pol) * Math.cos(phi), Math.cos(pol), Math.sin(pol) * Math.sin(phi));
      const rad = lerp(1.15, 1.6, r());
      const p = center.clone().add(new THREE.Vector3(dir.x * rad, dir.y * rad * 0.85 - 0.25, dir.z * rad));
      q.setFromUnitVectors(up, dir.clone().add(new THREE.Vector3(lerp(-0.4, 0.4, r()), lerp(-0.2, 0.4, r()), lerp(-0.4, 0.4, r()))).normalize())
        .multiply(new THREE.Quaternion().setFromAxisAngle(up, r() * Math.PI));
      const sc = lerp(0.8, 1.15, r());
      dollars.setMatrixAt(k, m.compose(p, q, s.set(sc, sc, sc)));
      dollars.setColorAt(k, tint.set(silver[i % silver.length]));
    }
    for (let j = 0; j < sprigs; j++) {
      const phi = (j / sprigs) * Math.PI * 2 + r() * 0.4;
      const out = new THREE.Vector3(Math.cos(phi), lerp(-0.15, 0.55, r()), Math.sin(phi)).normalize();
      const start = center.clone().addScaledVector(out, 1.25).add(new THREE.Vector3(0, -0.2, 0));
      for (let i = 0; i < perSprig; i++, k++) {
        const t = i / (perSprig - 1);
        const p = start.clone().addScaledVector(out, t * 1.35);
        p.y -= t * t * 0.35;                                     // droops under its own weight
        const side = new THREE.Vector3(-out.z, 0, out.x).multiplyScalar((i % 2 ? 1 : -1) * 0.1);
        p.add(side);
        q.setFromUnitVectors(up, out.clone().add(side.clone().multiplyScalar(6)).add(new THREE.Vector3(0, 0.3, 0)).normalize());
        const sc = lerp(0.95, 0.6, t);
        dollars.setMatrixAt(k, m.compose(p, q, s.set(sc, sc, sc)));
        dollars.setColorAt(k, tint.set(silver[(i + j) % silver.length]));
      }
    }
    g.add(dollars);

    // long willow-eucalyptus leaves poking out
    const willowCount = 24;
    const willows = new THREE.InstancedMesh(SHARED.willow, leafMat, willowCount);
    const darks = ["#5d7a66", "#6c8a73", "#526f5c"];
    for (let i = 0; i < willowCount; i++) {
      const phi = r() * Math.PI * 2, pol = THREE.MathUtils.degToRad(lerp(20, 105, r()));
      const dir = new THREE.Vector3(Math.sin(pol) * Math.cos(phi), Math.cos(pol), Math.sin(pol) * Math.sin(phi));
      const p = center.clone().add(new THREE.Vector3(dir.x * 1.5, dir.y * 1.3 - 0.2, dir.z * 1.5));
      q.setFromUnitVectors(up, dir.clone().add(new THREE.Vector3(0, 0.3, 0)).normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(up, r() * Math.PI));
      const sc = lerp(0.8, 1.2, r());
      willows.setMatrixAt(i, m.compose(p, q, s.set(sc, sc, sc)));
      willows.setColorAt(i, tint.set(darks[i % darks.length]));
    }
    g.add(willows);

    // seeded eucalyptus: little clusters of berries
    const clusters = 12, perCluster = 16;
    const berries = new THREE.InstancedMesh(SHARED.bud, new THREE.MeshStandardMaterial({ roughness: 0.8 }), clusters * perCluster);
    const berryColors = ["#a9ae86", "#c0b394", "#919e78", "#b7a48c"];
    k = 0;
    for (let c = 0; c < clusters; c++) {
      const phi = r() * Math.PI * 2, pol = THREE.MathUtils.degToRad(lerp(35, 118, r()));
      const dir = new THREE.Vector3(Math.sin(pol) * Math.cos(phi), Math.cos(pol), Math.sin(pol) * Math.sin(phi));
      const cc = center.clone().add(new THREE.Vector3(dir.x * 1.95, dir.y * 1.55 - 0.3, dir.z * 1.95));
      for (let i = 0; i < perCluster; i++, k++) {
        const p = cc.clone().add(new THREE.Vector3(lerp(-0.22, 0.22, r()), lerp(-0.2, 0.15, r()), lerp(-0.22, 0.22, r())));
        const sc = lerp(0.03, 0.05, r());
        berries.setMatrixAt(k, m.compose(p, q.identity(), s.set(sc, sc, sc)));
        berries.setColorAt(k, tint.set(berryColors[(c + i) % berryColors.length]));
      }
    }
    g.add(berries);
  }

  addVase(g) {
    const glass = (opacity, color = "#eef7f6") => new THREE.MeshPhysicalMaterial({
      color, transparent: true, opacity, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.82, 2.7, 56, 1, true), glass(0.2));
    body.position.y = -1.35;
    body.renderOrder = 3;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.028, 8, 56), glass(0.55, "#ffffff"));
    rim.rotation.x = Math.PI / 2;
    rim.renderOrder = 3;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.2, 56), glass(0.38, "#dfeeed"));
    base.position.y = -2.6;
    base.renderOrder = 2;
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.78, 1.65, 56), glass(0.14, "#cfe8ea"));
    water.position.y = -2.5 + 0.825;
    water.renderOrder = 1;
    // a soft vertical highlight so the glass reads as glass
    const shine = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 2.3), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, depthWrite: false }));
    shine.position.set(0.5, -1.3, 0.66);
    shine.rotation.y = 0.65;
    shine.renderOrder = 4;
    g.add(water, base, body, rim, shine);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.2, 40), new THREE.MeshBasicMaterial({ color: "#7a3a44", transparent: true, opacity: 0.08, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -2.72;
    g.add(shadow);
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

    // where a picked-up flower floats to: just in front of the camera, in bouquet space
    const picking = this.pick || this.released.length;
    let target, camLocal;
    if (picking) {
      this.group.updateMatrixWorld();
      const fwd = new THREE.Vector3();
      this.camera.getWorldDirection(fwd);
      const dist = this.camera.position.distanceTo(this.controls.target);
      target = this.group.worldToLocal(this.camera.position.clone().addScaledVector(fwd, dist * 0.68));
      camLocal = this.group.worldToLocal(this.camera.position.clone());
    }
    const faceQ = new THREE.Quaternion(), spinQ = new THREE.Quaternion(), upY = new THREE.Vector3(0, 1, 0);

    this.roses.forEach((ro, k) => {
      const b = clamp01((t - ro.delay) / 1.3);              // bloom progress 0..1
      const grow = b <= 0 ? 0.0001 : easeOutBack(clamp01(b * 1.4));
      const open = easeOutCubic(b);
      const since = now - ro.popT;
      const pop = since < 1.6 ? Math.sin(Math.min(1, since / 1.6) * Math.PI) * Math.exp(-since * 0.6) : 0;

      sway.setFromAxisAngle(swayAxis, Math.sin(now * 1.2 + ro.phase) * 0.035 + pop * 0.15);
      tmpQ.copy(ro.q).multiply(sway);
      pos.copy(ro.pos).addScaledVector(ro.axis, pop * 0.35);
      let s = ro.scale * grow * (1 + pop * 0.18);
      const pb = picking ? this.pickBlend(k, now) : 0;
      if (pb > 0) {
        const facing = camLocal.clone().sub(target).normalize();
        faceQ.setFromUnitVectors(upY, facing).multiply(spinQ.setFromAxisAngle(upY, now * 0.7));
        pos.lerp(target, pb);
        tmpQ.slerp(faceQ, pb);
        s *= 1 + 0.3 * pb;
      }
      head.compose(pos, tmpQ, scl.set(s, s, s));
      const isSun = ro.color === "sunflower";
      const isLily = ro.color === "lily";

      if (this.sun) this.updateSunflower(k, isSun ? head : null, open, pop);
      if (this.lily) this.updateLily(k, isLily ? head : null, open, pop);
      if (this.gard) this.updateGardenia(k, ro.color === "gardenia" ? head : null, open, pop);
      for (let i = 0; i < PETALS; i++) {
        if (!isRose(ro.color)) { this.petalMeshes[i].setMatrixAt(k, ZERO); continue; }
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
        this.sepals.setMatrixAt(k * 5 + j, isLily || ro.color === "gardenia" ? ZERO : m);
      }
    });
    this.petalMeshes.forEach((mesh) => (mesh.instanceMatrix.needsUpdate = true));
    this.sepals.instanceMatrix.needsUpdate = true;
    if (this.sun) ["rays", "disk", "calyx", "seeds"].forEach((key) => (this.sun[key].instanceMatrix.needsUpdate = true));
    if (this.lily) ["outer", "inner", "stamens"].forEach((key) => (this.lily[key].instanceMatrix.needsUpdate = true));
    if (this.gard) ["petals", "leaves"].forEach((key) => (this.gard[key].instanceMatrix.needsUpdate = true));
  }

  // rings of waxy petals spiraling open, with three glossy leaves underneath
  updateGardenia(k, head, open, pop) {
    const { petals, leaves } = this.gard;
    if (!head) {
      for (let j = 0; j < GARDENIA_PETALS; j++) petals.setMatrixAt(k * GARDENIA_PETALS + j, ZERO);
      for (let j = 0; j < 3; j++) leaves.setMatrixAt(k * 3 + j, ZERO);
      return;
    }
    const m = new THREE.Matrix4(), p = new THREE.Matrix4(), ry = new THREE.Matrix4(), rx = new THREE.Matrix4(), sc = new THREE.Matrix4();
    let idx = 0;
    GARDENIA_RINGS.forEach((ring, ri) => {
      for (let i = 0; i < ring.n; i++, idx++) {
        const tilt = lerp(0.1, ring.tilt, open) + pop * 0.18 * (ri < 2 ? 1 : 0.5);
        ry.makeRotationY(THREE.MathUtils.degToRad(ring.off + (i * 360) / ring.n));
        rx.makeRotationX(tilt);
        sc.makeScale(ring.s, ring.s, ring.s);
        p.multiplyMatrices(ry, rx).multiply(sc);
        p.setPosition(0, 0.02 * ri, 0);
        petals.setMatrixAt(k * GARDENIA_PETALS + idx, m.multiplyMatrices(head, p));
      }
    });
    for (let j = 0; j < 3; j++) {
      ry.makeRotationY((j / 3) * Math.PI * 2 + 0.5);
      rx.makeRotationX(1.95);
      p.multiplyMatrices(ry, rx).multiply(sc.makeScale(0.75, 0.75, 0.75));
      p.setPosition(0, -0.06, 0);
      leaves.setMatrixAt(k * 3 + j, m.multiplyMatrices(head, p));
    }
  }

  // six petals that open from a closed trumpet into a star, tips curling back
  updateLily(k, head, open, pop) {
    const { outer, inner, stamens } = this.lily;
    if (!head) {
      for (let j = 0; j < 3; j++) { outer.setMatrixAt(k * 3 + j, ZERO); inner.setMatrixAt(k * 3 + j, ZERO); }
      stamens.setMatrixAt(k, ZERO);
      return;
    }
    const m = new THREE.Matrix4(), p = new THREE.Matrix4(), ry = new THREE.Matrix4(), rx = new THREE.Matrix4(), tr = new THREE.Matrix4();
    for (let i = 0; i < 6; i++) {
      const isInner = i % 2 === 1;
      const tilt = lerp(0.12, isInner ? 0.92 : 1.05, open) + pop * 0.2;
      ry.makeRotationY((i / 6) * Math.PI * 2);
      tr.makeTranslation(0, 0, 0.04);
      rx.makeRotationX(tilt);
      p.multiplyMatrices(ry, tr).multiply(rx);
      m.multiplyMatrices(head, p);
      (isInner ? inner : outer).setMatrixAt(k * 3 + (i >> 1), m);
    }
    const st = 0.3 + 0.7 * open;
    p.makeScale(st, st, st);
    stamens.setMatrixAt(k, m.multiplyMatrices(head, p));
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
    if (this.lily) targets.push(this.lily.outer, this.lily.inner);
    if (this.gard) targets.push(this.gard.petals);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit || hit.instanceId == null) { if (this.pick) this.putBack(); return; }
    let id = hit.instanceId;
    if (this.sun && hit.object === this.sun.rays) id = Math.floor(id / SUN_RAYS);
    if (this.lily && (hit.object === this.lily.outer || hit.object === this.lily.inner)) id = Math.floor(id / 3);
    if (this.gard && hit.object === this.gard.petals) id = Math.floor(id / GARDENIA_PETALS);
    this.onInteract?.();
    if (this.pick && this.pick.k === id) { this.putBack(); return; }
    this.pickUp(id);
  }

  /* ----- picking a flower up to look at it ----- */
  pickBlend(k, now) {
    if (this.pick && this.pick.k === k) return easeOutCubic(clamp01((now - this.pick.t) / 0.7));
    const r = this.released.find((x) => x.k === k);
    if (!r) return 0;
    const b = r.from * (1 - easeOutCubic(clamp01((now - r.t) / 0.6)));
    if (b <= 0) this.released = this.released.filter((x) => x !== r);
    return b;
  }

  pickUp(k) {
    const now = this.clock.getElapsedTime();
    if (this.pick) this.putBack();
    this.released = this.released.filter((x) => x.k !== k);
    this.pick = { k, t: now };
    this.controls.autoRotate = false;
    const ro = this.roses[k];
    ro.popT = now;
    if (navigator.vibrate) navigator.vibrate(12);
    const world = ro.pos.clone().addScaledVector(ro.axis, 0.5).applyMatrix4(this.group.matrixWorld);
    const color = ROSE_COLORS[ro.color].petal;
    for (let i = 0; i < 12; i++) this.spawn("petal", world, color);
    for (let i = 0; i < 3; i++) this.spawn("heart", world, i === 1 ? "#ff7a99" : "#e0294a");
    this.onPick?.(ro.color);
  }

  putBack() {
    if (!this.pick) return;
    const now = this.clock.getElapsedTime();
    this.released.push({ k: this.pick.k, t: now, from: this.pickBlend(this.pick.k, now) });
    this.pick = null;
    this.onPutBack?.();
  }

  /* ----- water the flowers: rain, then every flower perks up and sparkles ----- */
  water() {
    if (!this.group || this.watering) return;
    this.watering = true;
    this.onInteract?.();
    this.group.updateMatrixWorld();
    const top = new THREE.Vector3(0, 3.6, 0).applyMatrix4(this.group.matrixWorld);
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 2.1;
      const at = top.clone().add(new THREE.Vector3(Math.cos(a) * r, Math.random() * 1.6, Math.sin(a) * r));
      this.spawn("drop", at, "#9fd3f0", Math.random() * 0.5);
    }
    setTimeout(() => {
      const now = this.clock.getElapsedTime();
      this.roses.forEach((ro, k) => {
        ro.popT = now + k * 0.05;
        if (k === this.pick?.k) return;
        const world = ro.pos.clone().addScaledVector(ro.axis, 0.45).applyMatrix4(this.group.matrixWorld);
        for (let i = 0; i < 3; i++) this.spawn("spark", world.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.7)), i % 2 ? "#fff6c8" : "#ffffff", k * 0.05 + Math.random() * 0.3);
        if (k % 3 === 0) for (let i = 0; i < 3; i++) this.spawn("petal", world, ROSE_COLORS[ro.color].petal, k * 0.05);
      });
      if (navigator.vibrate) navigator.vibrate([10, 40, 10]);
      this.watering = false;
    }, 900);
  }

  /* ----- send love: hearts float up out of the whole bouquet ----- */
  love() {
    if (!this.group) return;
    this.onInteract?.();
    this.group.updateMatrixWorld();
    const colors = ["#e0294a", "#ff7a99", "#ff4f7b", "#ffb3c6"];
    for (let i = 0; i < 22; i++) {
      const ro = this.roses[Math.floor(Math.random() * this.roses.length)];
      const world = ro.pos.clone().addScaledVector(ro.axis, 0.4).applyMatrix4(this.group.matrixWorld);
      this.spawn("heart", world, colors[i % colors.length], Math.random() * 1.2);
    }
    if (navigator.vibrate) navigator.vibrate(20);
  }

  spawn(kind, at, color, delay = 0) {
    if (kind === "drop" || kind === "spark") {
      const mat = kind === "drop"
        ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, transparent: true, opacity: 0.8, clearcoat: 1 })
        : new THREE.MeshBasicMaterial({ color, transparent: true });
      const mesh = new THREE.Mesh(kind === "drop" ? SHARED.drop : SHARED.spark, mat);
      mesh.position.copy(at);
      mesh.visible = false;
      const size = kind === "drop" ? lerp(0.035, 0.05, Math.random()) : lerp(0.05, 0.09, Math.random());
      if (kind === "drop") mesh.scale.set(size, size * 1.8, size);
      this.scene.add(mesh);
      this.effects.push({ kind, mesh, size, vel: new THREE.Vector3(0, -lerp(3, 4.5, Math.random()), 0), born: this.clock.getElapsedTime() + delay, life: kind === "drop" ? 1.1 : 1.0, spin: new THREE.Vector3(0, 4, 0) });
      return;
    }
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, side: THREE.DoubleSide, transparent: true });
    const mesh = new THREE.Mesh(kind === "heart" ? SHARED.heart : SHARED.floatPetal, mat);
    mesh.position.copy(at);
    mesh.visible = delay <= 0;
    const size = kind === "heart" ? lerp(0.34, 0.46, Math.random()) : lerp(0.24, 0.34, Math.random());
    mesh.scale.setScalar(size);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    const a = Math.random() * Math.PI * 2;
    const vel = kind === "heart"
      ? new THREE.Vector3(Math.cos(a) * 0.4, lerp(1.1, 1.6, Math.random()), Math.sin(a) * 0.4 + 0.3)
      : new THREE.Vector3(Math.cos(a) * lerp(0.8, 1.8, Math.random()), lerp(1.2, 2.4, Math.random()), Math.sin(a) * lerp(0.8, 1.8, Math.random()));
    this.scene.add(mesh);
    this.effects.push({ kind, mesh, vel, size, born: this.clock.getElapsedTime() + delay, life: kind === "heart" ? 2.2 : 3.2, spin: new THREE.Vector3(Math.random() * 3, Math.random() * 3, Math.random() * 3) });
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const now = this.clock.getElapsedTime();
    this.controls.update();
    if (this.group) {
      const t = now - this.start;
      const intro = this.animate ? easeOutCubic(clamp01(t / 0.9)) : 1;
      this.group.scale.setScalar((0.75 + 0.25 * intro) * (this.baseScale || 1));
      this.group.position.y = (this.baseY || 0) + (1 - intro) * -0.8 + Math.sin(now * 0.8) * 0.04;
      this.group.rotation.z = Math.sin(now * 0.6) * 0.015;
      this.updateRoses(t);
    }
    this.effects = this.effects.filter((fx) => {
      const age = now - fx.born;
      if (age < 0) return true;                       // waiting for its delay
      fx.mesh.visible = true;
      if (age > fx.life) { this.scene.remove(fx.mesh); fx.mesh.material.dispose(); return false; }
      if (fx.kind === "drop") {
        fx.vel.y -= 6 * dt;
        fx.mesh.position.addScaledVector(fx.vel, dt);
        fx.mesh.material.opacity = 0.8 * (1 - Math.pow(age / fx.life, 4));
        return true;
      }
      if (fx.kind === "spark") {
        const tw = Math.sin((age / fx.life) * Math.PI);
        fx.mesh.scale.setScalar(fx.size * tw * (1 + 0.3 * Math.sin(age * 30)));
        fx.mesh.rotation.y += 5 * dt;
        fx.mesh.position.y += 0.25 * dt;
        fx.mesh.material.opacity = tw;
        return true;
      }
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
