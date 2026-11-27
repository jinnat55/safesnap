import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GRID_CELLS, type Finding } from '../types';

export type StageState = 'idle' | 'ready' | 'scanning' | 'result';

export interface Scene3D {
  setPhoto(url: string | null): void;
  setState(state: StageState): void;
  setHits(findings: Finding[]): void;
  dispose(): void;
}

// Natural palette: morning sky, lake, pine forest, snow peaks, shutter orange.
const ORANGE = 0xff8a2b;
const HIT = 0xe5384f;
const HORIZON = 0xe3efe9;
const MAX_W = 4.2;
const MAX_H = 3.1;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- procedural terrain noise ---------- */
function hash(ix: number, iy: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct = 5): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise(x * f, y * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}
function ridged(x: number, y: number): number {
  let s = 0;
  let a = 0.55;
  let f = 1;
  for (let i = 0; i < 5; i++) {
    s += a * (1 - Math.abs(2 * noise(x * f, y * f) - 1));
    f *= 2.1;
    a *= 0.5;
  }
  return s;
}

const LAKE = { x: 0, z: -8, rx: 34, rz: 30 };
/** Terrain height in local coordinates. Water sits at 0. Mountains rise towards -z. */
function heightAt(x: number, z: number): number {
  const back = smooth(26, 95, -z);
  const hills = fbm(x * 0.05 + 7, z * 0.05 + 3) * 3.2;
  const r = ridged(x * 0.028 + 11, z * 0.028 - 5);
  const peaks = Math.pow(r, 2.2) * 30 * back * (0.55 + 0.45 * smooth(0, 45, Math.abs(x) + 8));
  const sides = smooth(22, 58, Math.abs(x)) * 9 * (0.6 + fbm(x * 0.04, z * 0.04));
  const q = Math.pow((x - LAKE.x) / LAKE.rx, 2) + Math.pow((z - LAKE.z) / LAKE.rz, 2);
  const carve = Math.max(0, 1 - q);
  const shore = smooth(0, 1, 1 - q);
  return 1.6 + hills * (1 - 0.5 * carve) + peaks * (1 - 0.9 * carve) + sides - 7.5 * shore;
}

function skyTexture(): THREE.CanvasTexture {
  return canvasTexture(8, 512, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#3d8fd6');
    gr.addColorStop(0.28, '#74b9e8');
    gr.addColorStop(0.46, '#bfe0ef');
    gr.addColorStop(0.5, '#e3efe9');
    gr.addColorStop(0.56, '#d6e8dd');
    gr.addColorStop(1, '#9ec7b0');
    g.fillStyle = gr;
    g.fillRect(0, 0, 8, 512);
  });
}

function placeholderTexture(): THREE.CanvasTexture {
  return canvasTexture(1200, 800, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 800);
    sky.addColorStop(0, '#5aa7e6');
    sky.addColorStop(0.5, '#cfe7f2');
    sky.addColorStop(0.72, '#fbe3b8');
    sky.addColorStop(1, '#fbe3b8');
    g.fillStyle = sky;
    g.fillRect(0, 0, 1200, 800);
    const sun = g.createRadialGradient(840, 470, 6, 840, 470, 240);
    sun.addColorStop(0, 'rgba(255,255,235,1)');
    sun.addColorStop(0.3, 'rgba(255,232,170,0.8)');
    sun.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, 1200, 800);
    const ridge = (base: number, amp: number, color: string, seed: number) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, 800);
      for (let x = 0; x <= 1200; x += 16) g.lineTo(x, base + Math.sin(x * 0.007 + seed) * amp + Math.sin(x * 0.019 + seed * 2) * amp * 0.4);
      g.lineTo(1200, 800);
      g.closePath();
      g.fill();
    };
    ridge(470, 70, '#9db9c9', 1);
    ridge(560, 50, '#5f8f7a', 2.4);
    ridge(650, 36, '#2f6b49', 4.1);
  });
}

export function createScene(container: HTMLElement): Scene3D | null {
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return null;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(HORIZON, 1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HORIZON, 34, 120);

  // Sky dome, also used as the reflection environment for glass, chrome and water.
  const skyTex = skyTexture();
  const sunDir = new THREE.Vector3(0.5, 0.26, -0.82).normalize();
  const skyGeo = new THREE.SphereGeometry(150, 48, 32);
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  scene.add(sky);

  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })));
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c8).multiplyScalar(14) }));
  sunBall.position.copy(sunDir).multiplyScalar(40);
  envScene.add(sunBall);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.9;

  const sun = new THREE.DirectionalLight(0xffe6bd, 2.6);
  sun.position.copy(sunDir).multiplyScalar(60);
  const front = new THREE.DirectionalLight(0xfff6e8, 1.1);
  front.position.set(-6, 8, 14);
  scene.add(sun, front, new THREE.HemisphereLight(0xcfe8ff, 0x7aa07a, 0.7));

  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: canvasTexture(256, 256, (g) => {
        const r = g.createRadialGradient(128, 128, 4, 128, 128, 128);
        r.addColorStop(0, 'rgba(255,252,235,1)');
        r.addColorStop(0.18, 'rgba(255,236,180,0.7)');
        r.addColorStop(0.5, 'rgba(255,214,150,0.18)');
        r.addColorStop(1, 'rgba(255,214,150,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, 256, 256);
      }),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  sunGlow.position.copy(sunDir).multiplyScalar(110);
  sunGlow.scale.setScalar(90);
  scene.add(sunGlow);

  /* ---------- landscape ---------- */
  const world = new THREE.Group();
  world.position.set(0, -3.4, -2);
  scene.add(world);
  const worldDispose: Array<{ dispose(): void }> = [];

  const TW = 150;
  const TD = 120;
  const SX = 240;
  const SZ = 180;
  const terrainGeo = new THREE.PlaneGeometry(TW, TD, SX, SZ);
  terrainGeo.rotateX(-Math.PI / 2);
  terrainGeo.translate(0, 0, -TD / 2 + 14);
  const pos = terrainGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  terrainGeo.computeVertexNormals();
  const nrm = terrainGeo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const palette = {
    sand: new THREE.Color(0xcdbf94),
    meadow: new THREE.Color(0x86b45c),
    forest: new THREE.Color(0x3d7a47),
    deep: new THREE.Color(0x2b5e3b),
    rock: new THREE.Color(0x857f76),
    snow: new THREE.Color(0xf6f9fc),
  };
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i);
    const slope = 1 - nrm.getY(i);
    const n = fbm(pos.getX(i) * 0.3, pos.getZ(i) * 0.3, 3);
    c.copy(palette.sand);
    c.lerp(palette.meadow, smooth(0.1, 0.9, h + n * 0.6));
    c.lerp(palette.forest, smooth(1.6, 4.5, h + n * 1.4));
    c.lerp(palette.deep, smooth(3.2, 7, h) * 0.6);
    c.lerp(palette.rock, smooth(6.5, 11, h + n * 2) * 0.9);
    c.lerp(palette.rock, smooth(0.16, 0.34, slope + n * 0.06));
    c.lerp(palette.snow, smooth(14, 19, h + n * 3) * (1 - smooth(0.22, 0.5, slope)));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  world.add(new THREE.Mesh(terrainGeo, terrainMat));
  worldDispose.push(terrainGeo, terrainMat);

  // Lake with gently moving ripples.
  const ripple = canvasTexture(
    256,
    256,
    (g) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 420; i++) {
        g.strokeStyle = `rgba(${i % 2 ? 255 : 0},${i % 2 ? 255 : 0},${i % 2 ? 255 : 0},0.12)`;
        g.lineWidth = 1 + Math.random() * 2;
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 8 + Math.random() * 26, y + (Math.random() - 0.5) * 3);
        g.stroke();
      }
    },
    false,
  );
  ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping;
  ripple.repeat.set(14, 10);
  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x2b86a3, roughness: 0.06, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6, bumpMap: ripple, bumpScale: 0.35, transparent: true, opacity: 0.93 });
  const waterGeo = new THREE.PlaneGeometry(TW, TD);
  waterGeo.rotateX(-Math.PI / 2);
  waterGeo.translate(0, 0, -TD / 2 + 14);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = 0;
  world.add(water);
  worldDispose.push(waterGeo, waterMat, ripple);

  // Pine forest: two stacked cones per tree, instanced.
  const TREES = reduced ? 1100 : 1800;
  const coneA = new THREE.ConeGeometry(0.55, 1.7, 7);
  coneA.translate(0, 1.0, 0);
  const coneB = new THREE.ConeGeometry(0.4, 1.3, 7);
  coneB.translate(0, 1.85, 0);
  const treeMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
  const lower = new THREE.InstancedMesh(coneA, treeMat, TREES);
  const upper = new THREE.InstancedMesh(coneB, treeMat, TREES);
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const tp = new THREE.Vector3();
  const col = new THREE.Color();
  let placed = 0;
  for (let k = 0; k < 40000 && placed < TREES; k++) {
    const x = (hash(k, 91) - 0.5) * 120;
    const z = -12 - hash(k, 17) * 80;
    const h = heightAt(x, z);
    const dens = fbm(x * 0.07 + 40, z * 0.07);
    if (h < 0.45 || h > 7.5 || dens < 0.42) continue;
    const e = 0.6;
    const slope = Math.abs(heightAt(x + e, z) - h) + Math.abs(heightAt(x, z + e) - h);
    if (slope > 1.1) continue;
    const s = 0.55 + hash(k, 5) * 0.8 + smooth(0, 40, -z) * 0.6;
    tp.set(x, h - 0.05, z);
    scl.set(s, s * (0.85 + hash(k, 8) * 0.5), s);
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(k, 3) * 6.28);
    m4.compose(tp, quat, scl);
    lower.setMatrixAt(placed, m4);
    upper.setMatrixAt(placed, m4);
    col.setHSL(0.31 + hash(k, 12) * 0.06, 0.42 + hash(k, 2) * 0.2, 0.2 + hash(k, 6) * 0.12);
    lower.setColorAt(placed, col);
    upper.setColorAt(placed, col);
    placed++;
  }
  lower.count = upper.count = placed;
  world.add(lower, upper);
  worldDispose.push(coneA, coneB, treeMat);

  // Soft clouds.
  const cloudTex = canvasTexture(256, 128, (g) => {
    for (let i = 0; i < 14; i++) {
      const x = 40 + Math.random() * 176;
      const y = 50 + Math.random() * 40;
      const r = 20 + Math.random() * 28;
      const gr = g.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.75)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 128);
    }
  });
  const clouds: THREE.Sprite[] = [];
  for (let i = 0; i < 7; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.55, depthWrite: false, fog: false, toneMapped: false }));
    sp.position.set(-70 + i * 24 + hash(i, 1) * 10, 26 + hash(i, 2) * 22, -80 - hash(i, 3) * 25);
    sp.scale.set(60 + hash(i, 4) * 30, 24 + hash(i, 5) * 10, 1);
    scene.add(sp);
    clouds.push(sp);
  }

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
  const root = new THREE.Group();
  scene.add(root);

  const placeholder = placeholderTexture();
  let photoTexture: THREE.Texture | null = null;
  let aspect = 1.5;
  let content = new THREE.Group();
  let dispose: Array<{ dispose(): void }> = [];
  let beam: THREE.Group | null = null;
  let brackets: THREE.MeshStandardMaterial | null = null;
  let sheenTex: THREE.CanvasTexture | null = null;
  let lensGlow: THREE.MeshBasicMaterial | null = null;
  let lensRing: THREE.MeshStandardMaterial | null = null;
  let photoW = MAX_W;
  let photoH = MAX_H;
  let hitGroup = new THREE.Group();
  let hits: Array<{ mesh: THREE.Object3D; start: number }> = [];
  let current: Finding[] = [];

  let state: StageState = 'idle';
  let t = 0;
  let intro = reduced ? 1 : 0;
  let scanStart = 0;
  let px = 0;
  let py = 0;
  let size = { w: 1, h: 1 };
  let camBase = { y: 1.4, z: 20, lookY: -0.4 };

  const track = <T extends { dispose(): void }>(x: T): T => {
    dispose.push(x);
    return x;
  };

  /** A rangefinder-style camera: chrome top plate, leather body, orange shutter button, coated lens. */
  function buildCamera(group: THREE.Group): void {
    const leatherBump = track(
      canvasTexture(
        128,
        128,
        (g) => {
          g.fillStyle = '#808080';
          g.fillRect(0, 0, 128, 128);
          for (let i = 0; i < 900; i++) {
            g.fillStyle = Math.random() > 0.5 ? '#a8a8a8' : '#5a5a5a';
            g.beginPath();
            g.arc(Math.random() * 128, Math.random() * 128, 1.2 + Math.random() * 1.6, 0, 6.28);
            g.fill();
          }
        },
        false,
      ),
    );
    leatherBump.wrapS = leatherBump.wrapT = THREE.RepeatWrapping;
    leatherBump.repeat.set(3, 1);
    const leather = track(new THREE.MeshStandardMaterial({ color: 0x1d2220, roughness: 0.7, metalness: 0.05, bumpMap: leatherBump, bumpScale: 1.4 }));
    const chrome = track(new THREE.MeshStandardMaterial({ color: 0xe4e8ea, metalness: 1, roughness: 0.16, envMapIntensity: 1.3 }));
    const black = track(new THREE.MeshStandardMaterial({ color: 0x121416, metalness: 0.7, roughness: 0.35 }));

    const body = new THREE.Mesh(track(new RoundedBoxGeometry(3.3, 1.25, 1.15, 5, 0.1)), leather);
    body.position.y = -0.28;
    const top = new THREE.Mesh(track(new RoundedBoxGeometry(3.3, 0.5, 1.15, 5, 0.12)), chrome);
    top.position.y = 0.56;
    const base = new THREE.Mesh(track(new RoundedBoxGeometry(3.3, 0.14, 1.15, 4, 0.06)), chrome);
    base.position.y = -0.95;
    const hump = new THREE.Mesh(track(new RoundedBoxGeometry(1.0, 0.36, 0.72, 4, 0.08)), chrome);
    hump.position.set(-0.75, 0.96, -0.05);
    group.add(body, top, base, hump);

    // Shutter button and dial.
    const shutterMat = track(new THREE.MeshStandardMaterial({ color: ORANGE, metalness: 0.5, roughness: 0.3, emissive: ORANGE, emissiveIntensity: 0.15 }));
    const btn = new THREE.Mesh(track(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 24)), shutterMat);
    btn.position.set(0.95, 0.88, 0.1);
    const collar = new THREE.Mesh(track(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 32)), chrome);
    collar.position.set(0.95, 0.83, 0.1);
    const dial = new THREE.Mesh(track(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 48)), chrome);
    dial.position.set(1.15, 0.91, -0.1);
    group.add(btn, collar, dial);

    // Rangefinder windows.
    const glassMat = track(new THREE.MeshPhysicalMaterial({ color: 0x0a1418, roughness: 0.03, metalness: 0.2, clearcoat: 1, envMapIntensity: 2.5 }));
    for (const [x, w] of [[-1.1, 0.34], [-0.55, 0.2]] as const) {
      const win = new THREE.Mesh(track(new RoundedBoxGeometry(w, 0.28, 0.04, 2, 0.015)), glassMat);
      win.position.set(x, 0.58, 0.575);
      group.add(win);
    }

    // Leather strap, curving from a side lug.
    const strap = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.62, 0.1, 0), new THREE.Vector3(-2.3, -0.5, 0.2), new THREE.Vector3(-2.5, -1.6, 0.3), new THREE.Vector3(-2.1, -2.6, 0.2)]);
    const strapMesh = new THREE.Mesh(track(new THREE.TubeGeometry(strap, 30, 0.07, 6, false)), leather);
    strapMesh.scale.set(1, 1, 3.2);
    group.add(strapMesh);

    // Lens barrel and coated front glass.
    const lens = new THREE.Group();
    const R = 3.1;
    const grip = track(new THREE.MeshStandardMaterial({ color: 0x23282c, metalness: 0.9, roughness: 0.4, envMapIntensity: 1.6 }));
    const barrel = new THREE.Mesh(track(new THREE.CylinderGeometry(R, R, 3.2, 96, 1, true)), grip);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -1.6;
    const frontRing = new THREE.Mesh(track(new THREE.CylinderGeometry(R + 0.08, R + 0.08, 0.5, 96)), black);
    frontRing.rotation.x = Math.PI / 2;
    lensRing = track(new THREE.MeshStandardMaterial({ color: ORANGE, emissive: ORANGE, emissiveIntensity: 0.25, metalness: 0.6, roughness: 0.3 }));
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(R - 0.14, 0.06, 12, 128)), lensRing);
    ring.position.z = 0.27;
    const face = new THREE.Mesh(track(new THREE.RingGeometry(2.05, R - 0.2, 96)), track(new THREE.MeshStandardMaterial({ color: 0x5a646b, metalness: 1, roughness: 0.3, envMapIntensity: 1.8 })));
    face.position.z = 0.26;
    const hood = new THREE.Mesh(track(new THREE.CylinderGeometry(2.05, 1.85, 0.7, 64, 1, true)), track(new THREE.MeshStandardMaterial({ color: 0x050607, metalness: 0.9, roughness: 0.3, side: THREE.BackSide })));
    hood.rotation.x = Math.PI / 2;
    hood.position.z = -0.1;
    const sphereR = 5;
    const glass = new THREE.Mesh(
      track(new THREE.SphereGeometry(sphereR, 64, 32, 0, Math.PI * 2, 0, Math.asin(1.9 / sphereR))),
      track(new THREE.MeshPhysicalMaterial({ color: 0x050b10, metalness: 0.1, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [250, 700], envMapIntensity: 3.2 })),
    );
    glass.rotation.x = Math.PI / 2;
    glass.position.z = -sphereR + 0.28;
    const depth = track(
      canvasTexture(512, 512, (g) => {
        const m = 256;
        const bg = g.createRadialGradient(m, m, 6, m, m, m);
        bg.addColorStop(0, 'rgba(70,30,110,0.9)');
        bg.addColorStop(0.4, 'rgba(10,70,90,0.7)');
        bg.addColorStop(0.8, 'rgba(120,50,110,0.3)');
        bg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = bg;
        g.fillRect(0, 0, 512, 512);
        for (const [r, cc] of [[220, 'rgba(80,240,200,0.35)'], [165, 'rgba(255,110,170,0.3)'], [110, 'rgba(255,190,110,0.28)']] as const) {
          g.strokeStyle = cc;
          g.lineWidth = 5;
          g.beginPath();
          g.arc(m, m, r, 0, Math.PI * 2);
          g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,0.92)';
        g.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(m + Math.cos(a) * 60, m + Math.sin(a) * 60);
        }
        g.closePath();
        g.arc(m, m, 95, 0, Math.PI * 2, true);
        g.fill('evenodd');
      }),
    );
    lensGlow = track(new THREE.MeshBasicMaterial({ map: depth, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8, toneMapped: false }));
    const inner = new THREE.Mesh(track(new THREE.CircleGeometry(1.85, 64)), lensGlow);
    inner.position.z = 0.3;
    const streak = new THREE.Mesh(
      track(new THREE.CircleGeometry(1.85, 64)),
      track(
        new THREE.MeshBasicMaterial({
          map: track(
            canvasTexture(128, 128, (g) => {
              const gr = g.createLinearGradient(16, 16, 112, 112);
              gr.addColorStop(0.2, 'rgba(255,255,255,0)');
              gr.addColorStop(0.32, 'rgba(255,255,255,0.6)');
              gr.addColorStop(0.42, 'rgba(255,255,255,0)');
              gr.addColorStop(0.64, 'rgba(255,255,255,0)');
              gr.addColorStop(0.72, 'rgba(170,255,230,0.3)');
              gr.addColorStop(0.8, 'rgba(255,255,255,0)');
              g.fillStyle = gr;
              g.fillRect(0, 0, 128, 128);
            }),
          ),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    );
    streak.position.z = 0.34;
    lens.add(barrel, frontRing, ring, face, hood, glass, inner, streak);
    lens.scale.set(0.27, 0.27, 0.42);
    lens.position.set(0.15, -0.25, 0.9);
    group.add(lens);
  }

  function build(): void {
    root.remove(content);
    dispose.forEach((d) => d.dispose());
    dispose = [];
    hits = [];
    content = new THREE.Group();
    root.add(content);

    if (aspect >= MAX_W / MAX_H) {
      photoW = MAX_W;
      photoH = MAX_W / aspect;
    } else {
      photoH = MAX_H;
      photoW = MAX_H * aspect;
    }
    const side = 0.34;
    const topM = 0.34;
    const chin = 0.95;
    const printW = photoW + side * 2;
    const printH = photoH + topM + chin;

    // The camera, resting in the lower right and facing the print.
    const cameraObj = new THREE.Group();
    cameraObj.position.set(3.05, -1.25, 1.2);
    cameraObj.scale.setScalar(0.88);
    cameraObj.rotation.set(0.08, -0.5, -0.03);
    buildCamera(cameraObj);
    content.add(cameraObj);

    const printGroup = new THREE.Group();
    printGroup.position.set(-1.9, 0.75, 0);
    content.add(printGroup);

    const paper = new THREE.Mesh(
      track(new RoundedBoxGeometry(printW, printH, 0.09, 4, 0.05)),
      track(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.3, emissive: 0xfff8ea, emissiveIntensity: 0.4 })),
    );
    printGroup.add(paper);

    const photoGroup = new THREE.Group();
    photoGroup.position.set(0, (chin - topM) / 2, 0.05);
    printGroup.add(photoGroup);

    const photo = new THREE.Mesh(track(new THREE.PlaneGeometry(photoW, photoH)), track(new THREE.MeshBasicMaterial({ map: photoTexture ?? placeholder, toneMapped: false })));
    photo.position.z = 0.001;
    photoGroup.add(photo);

    sheenTex = track(
      canvasTexture(512, 256, (g) => {
        const grad = g.createLinearGradient(0, 0, 512, 256);
        grad.addColorStop(0.3, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.28)');
        grad.addColorStop(0.7, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 512, 256);
      }),
    );
    sheenTex.wrapS = THREE.RepeatWrapping;
    sheenTex.repeat.set(0.7, 1);
    const sheen = new THREE.Mesh(track(new THREE.PlaneGeometry(photoW, photoH)), track(new THREE.MeshBasicMaterial({ map: sheenTex, transparent: true, depthWrite: false, toneMapped: false })));
    sheen.position.z = 0.004;
    photoGroup.add(sheen);

    const lineDark = track(new THREE.MeshBasicMaterial({ color: 0x0b2a1c, transparent: true, opacity: 0.4, toneMapped: false }));
    const lineLight = track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, toneMapped: false }));
    for (const f of [1, 2]) {
      const x = -photoW / 2 + (photoW * f) / 3;
      const y = -photoH / 2 + (photoH * f) / 3;
      for (const [mat, th, z] of [[lineDark, 0.03, 0.008], [lineLight, 0.012, 0.01]] as const) {
        const v = new THREE.Mesh(track(new THREE.BoxGeometry(th, photoH, 0.004)), mat);
        v.position.set(x, 0, z);
        const h = new THREE.Mesh(track(new THREE.BoxGeometry(photoW, th, 0.004)), mat);
        h.position.set(0, y, z);
        photoGroup.add(v, h);
      }
    }

    brackets = track(new THREE.MeshStandardMaterial({ color: ORANGE, emissive: ORANGE, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.4, side: THREE.DoubleSide }));
    const L = 0.5;
    const th = 0.085;
    const arm = new THREE.Shape();
    arm.moveTo(0, 0);
    arm.lineTo(L, 0);
    arm.lineTo(L, -th);
    arm.lineTo(th, -th);
    arm.lineTo(th, -L);
    arm.lineTo(0, -L);
    arm.closePath();
    const armGeo = track(new THREE.ExtrudeGeometry(arm, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2 }));
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const b = new THREE.Mesh(armGeo, brackets);
        b.scale.set(-sx, sy, 1);
        b.position.set(sx * (photoW / 2 + 0.15), sy * (photoH / 2 + 0.15), 0.4);
        photoGroup.add(b);
      }
    }

    beam = new THREE.Group();
    const trail = new THREE.Mesh(
      track(new THREE.PlaneGeometry(photoW + 0.3, 1.0)),
      track(
        new THREE.MeshBasicMaterial({
          map: track(
            canvasTexture(8, 128, (g) => {
              const grad = g.createLinearGradient(0, 0, 0, 128);
              grad.addColorStop(0, 'rgba(255,214,120,0)');
              grad.addColorStop(0.85, 'rgba(255,200,90,0.5)');
              grad.addColorStop(1, 'rgba(255,255,235,0.95)');
              g.fillStyle = grad;
              g.fillRect(0, 0, 8, 128);
            }),
          ),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    );
    trail.position.y = 0.5;
    const edge = new THREE.Mesh(track(new THREE.BoxGeometry(photoW + 0.3, 0.03, 0.03)), track(new THREE.MeshBasicMaterial({ color: 0xfffbe8, toneMapped: false })));
    beam.add(trail, edge);
    beam.position.z = 0.2;
    beam.visible = false;
    photoGroup.add(beam);

    hitGroup = new THREE.Group();
    photoGroup.add(hitGroup);

    applyHits();
    fit();
    requestRender();
  }

  function fit(): void {
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const a = size.w / size.h;
    const needW = 10.2;
    const needH = 6.6;
    const d = Math.max(needH / (2 * tan), needW / (2 * tan * a));
    camera.aspect = a;
    camBase = { y: 1.0, z: d, lookY: 0.9 };
    camera.updateProjectionMatrix();
    placeCamera();
  }

  function placeCamera(): void {
    camera.position.set(px * 1.1, camBase.y - py * 0.5, camBase.z);
    camera.lookAt(0, camBase.lookY, 0);
  }

  function resize(): void {
    const r = container.getBoundingClientRect();
    size = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
    renderer.setSize(size.w, size.h, false);
    fit();
    requestRender();
  }

  function cellCenter(cell: Finding['cell']): [number, number] {
    const i = GRID_CELLS.indexOf(cell);
    return [-photoW / 2 + (photoW * (i % 3 + 0.5)) / 3, photoH / 2 - (photoH * (Math.floor(i / 3) + 0.5)) / 3];
  }

  function applyHits(): void {
    hitGroup.clear();
    hits = [];
    current.forEach((f, i) => {
      const [x, y] = cellCenter(f.cell);
      const geo = track(new RoundedBoxGeometry(photoW / 3 - 0.1, photoH / 3 - 0.1, 0.08, 3, 0.05));
      const low = f.confidence === 'low';
      const mesh = new THREE.Mesh(geo, track(new THREE.MeshPhysicalMaterial({ color: HIT, emissive: HIT, emissiveIntensity: low ? 0.25 : 0.5, transparent: true, opacity: low ? 0.35 : 0.55, roughness: 0.15, clearcoat: 1 })));
      const edges = new THREE.LineSegments(track(new THREE.EdgesGeometry(geo)), track(new THREE.LineBasicMaterial({ color: 0xffe3e8 })));
      const holder = new THREE.Group();
      holder.add(mesh, edges);
      holder.position.set(x, y, 0.06);
      hitGroup.add(holder);
      hits.push({ mesh: holder, start: t + i * 0.18 });
    });
  }

  function update(dt: number): void {
    t += dt;
    intro = Math.min(1, intro + dt / 1.6);
    const e = easeOut(intro);
    root.scale.setScalar(0.92 + 0.08 * e);
    const targetY = 0.1 + px * 0.16 + (1 - e) * -0.6;
    const targetX = 0.03 - py * 0.08;
    const k = Math.min(1, dt * 5);
    root.rotation.y += (targetY - root.rotation.y) * k;
    root.rotation.x += (targetX - root.rotation.x) * k;
    root.position.y = reduced ? 0 : Math.sin(t * 0.9) * 0.07;
    placeCamera();
    if (!reduced) {
      ripple.offset.x = (t * 0.004) % 1;
      ripple.offset.y = (t * 0.002) % 1;
      clouds.forEach((cl, i) => {
        cl.position.x += dt * (0.5 + i * 0.08);
        if (cl.position.x > 110) cl.position.x = -110;
      });
    }
    if (sheenTex) sheenTex.offset.x = 0.15 - px * 0.35;
    const scanning = state === 'scanning' && !reduced;
    if (brackets) brackets.emissiveIntensity = scanning ? 0.5 + 0.6 * Math.sin(t * 6) ** 2 : 0.4;
    if (lensRing) lensRing.emissiveIntensity = scanning ? 0.4 + 0.9 * Math.sin(t * 5) ** 2 : 0.25;
    if (lensGlow) lensGlow.opacity = scanning ? 0.85 + 0.15 * Math.sin(t * 5) : 0.8;
    if (beam) {
      beam.visible = state === 'scanning';
      if (beam.visible) {
        const p = reduced ? 0.5 : easeInOut(((t - scanStart) % 2.4) / 2.4);
        beam.position.y = photoH / 2 + 0.3 - p * (photoH + 0.6);
      }
    }
    for (const h of hits) {
      const p = reduced ? 1 : easeOut(clamp01((t - h.start) / 0.7));
      h.mesh.position.z = 0.06 + 0.3 * p + (reduced ? 0 : Math.sin(t * 2 + h.start * 5) * 0.012 * p);
    }
  }

  function render(): void {
    renderer.render(scene, camera);
  }

  let pending = false;
  function requestRender(): void {
    if (!reduced || pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      update(0.016);
      render();
    });
  }

  let raf = 0;
  let last = performance.now();
  function loop(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    raf = requestAnimationFrame(loop);
  }

  const onMove = (e: PointerEvent): void => {
    const r = container.getBoundingClientRect();
    px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    py = ((e.clientY - r.top) / r.height - 0.5) * 2;
    requestRender();
  };
  const onLeave = (): void => {
    px = 0;
    py = 0;
    requestRender();
  };
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerleave', onLeave);
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  build();
  resize();
  if (reduced) requestRender();
  else raf = requestAnimationFrame(loop);

  return {
    setPhoto(url) {
      photoTexture?.dispose();
      photoTexture = null;
      if (!url) {
        aspect = 1.5;
        build();
        return;
      }
      new THREE.TextureLoader().load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        const img = tex.image as { width: number; height: number };
        aspect = Math.min(2.4, Math.max(0.55, img.width / img.height));
        photoTexture = tex;
        build();
      });
    },
    setState(next) {
      if (next === 'scanning' && state !== 'scanning') scanStart = t;
      state = next;
      requestRender();
    },
    setHits(findings) {
      current = findings;
      applyHits();
      requestRender();
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerleave', onLeave);
      dispose.forEach((d) => d.dispose());
      worldDispose.forEach((d) => d.dispose());
      lower.dispose();
      upper.dispose();
      skyGeo.dispose();
      skyTex.dispose();
      cloudTex.dispose();
      placeholder.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
