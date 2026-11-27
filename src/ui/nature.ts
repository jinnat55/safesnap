import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HORIZON, SUN_DIR, canvasTexture, fbm, hash, heightAt, skyTexture, smooth } from './terrain';

export type SceneryKind = 'valley' | 'sea';

export interface Nature {
  dispose(): void;
}

interface Ctx {
  scene: THREE.Scene;
  keep: <T extends { dispose(): void }>(x: T) => T;
  small: boolean;
  reduced: boolean;
}
interface Built {
  pos: THREE.CatmullRomCurve3;
  look: THREE.CatmullRomCurve3;
  ground: (x: number, z: number) => number;
  tick: (t: number) => void;
  extra: Array<{ dispose(): void }>;
}

const pathPoints = (c: THREE.CatmullRomCurve3) => Array.from({ length: 16 }, (_, i) => c.getPoint(i / 15));

/* ------------------------------------------------------------------ valley */
function buildValley({ scene, keep, small, reduced }: Ctx): Built {
  const TW = 170;
  const TD = 170;
  const SX = small ? 150 : 220;
  const geo = keep(new THREE.PlaneGeometry(TW, TD, SX, SX));
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -TD / 2 + 50);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const pal = { sand: new THREE.Color(0xf0d9a0), meadow: new THREE.Color(0x7fd13b), forest: new THREE.Color(0x2fa84f), deep: new THREE.Color(0x1b7a3c), rock: new THREE.Color(0x9a7b52) };
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i);
    const slope = 1 - nrm.getY(i);
    const n = fbm(pos.getX(i) * 0.3, pos.getZ(i) * 0.3, 3);
    c.copy(pal.sand);
    c.lerp(pal.meadow, smooth(0.05, 0.7, h + n * 0.6));
    c.lerp(pal.forest, smooth(1.6, 5, h + n * 1.6));
    c.lerp(pal.deep, smooth(5, 14, h + n * 2) * 0.85);
    c.lerp(pal.rock, smooth(0.2, 0.42, slope + n * 0.07) * 0.55);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(geo, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }))));

  const ripple = keep(
    canvasTexture(
      256,
      256,
      (g) => {
        g.fillStyle = '#808080';
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 420; i++) {
          const v = i % 2 ? 255 : 0;
          g.strokeStyle = `rgba(${v},${v},${v},0.12)`;
          g.lineWidth = 1 + hash(i, 4) * 2;
          const x = hash(i, 1) * 256;
          const y = hash(i, 2) * 256;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 8 + hash(i, 3) * 26, y + (hash(i, 5) - 0.5) * 3);
          g.stroke();
        }
      },
      false,
    ),
  );
  ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping;
  ripple.repeat.set(16, 16);
  const wgeo = keep(new THREE.PlaneGeometry(TW, TD));
  wgeo.rotateX(-Math.PI / 2);
  wgeo.translate(0, 0, -TD / 2 + 50);
  scene.add(new THREE.Mesh(wgeo, keep(new THREE.MeshPhysicalMaterial({ color: 0x16b4c8, roughness: 0.05, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6, bumpMap: ripple, bumpScale: 0.35, transparent: true, opacity: 0.94 }))));

  const posPath = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 6, 28), new THREE.Vector3(-12, 4.6, 8), new THREE.Vector3(-26, 3.4, -10), new THREE.Vector3(-30, 2.8, -24)]);
  const lookPath = new THREE.CatmullRomCurve3([new THREE.Vector3(2, 8, -50), new THREE.Vector3(8, 6, -42), new THREE.Vector3(8, 4, -40), new THREE.Vector3(2, 3, -45)]);
  const pts = pathPoints(posPath);
  const near = (x: number, z: number, r: number) => pts.some((v) => (v.x - x) ** 2 + (v.z - z) ** 2 < r * r);

  const TREES = small ? 900 : 2200;
  const canopyGeo = keep(new THREE.IcosahedronGeometry(1, 2));
  canopyGeo.translate(0, 2.1, 0);
  const trunkGeo = keep(new THREE.CylinderGeometry(0.1, 0.15, 1.7, 6));
  trunkGeo.translate(0, 0.85, 0);
  const canopy = new THREE.InstancedMesh(canopyGeo, keep(new THREE.MeshStandardMaterial({ roughness: 0.85 })), TREES);
  const trunks = new THREE.InstancedMesh(trunkGeo, keep(new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.95 })), TREES);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const tp = new THREE.Vector3();
  const col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  let placed = 0;
  for (let k = 0; k < 60000 && placed < TREES; k++) {
    const x = (hash(k, 91) - 0.5) * 140;
    const z = 30 - hash(k, 17) * 110;
    const h = heightAt(x, z);
    if (h < 0.4 || h > 15 || fbm(x * 0.07 + 40, z * 0.07) < 0.4 || near(x, z, 20) || z > 10) continue;
    const slope = Math.abs(heightAt(x + 0.6, z) - h) + Math.abs(heightAt(x, z + 0.6) - h);
    if (slope > 1.6) continue;
    const s = 0.8 + hash(k, 5) * 0.9 + smooth(0, 40, -z) * 0.7;
    tp.set(x, h - 0.05, z);
    sc.set(s * (0.9 + hash(k, 8) * 0.3), s * (0.85 + hash(k, 4) * 0.4), s * (0.9 + hash(k, 6) * 0.3));
    q.setFromAxisAngle(up, hash(k, 3) * 6.28);
    m4.compose(tp, q, sc);
    canopy.setMatrixAt(placed, m4);
    trunks.setMatrixAt(placed, m4);
    col.setHSL(0.22 + hash(k, 12) * 0.13, 0.55 + hash(k, 2) * 0.25, 0.3 + hash(k, 6) * 0.14);
    canopy.setColorAt(placed, col);
    placed++;
  }
  canopy.count = trunks.count = placed;
  scene.add(canopy, trunks);

  const FLOWERS = small ? 1200 : 3200;
  const flowers = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.11, 8, 6)), keep(new THREE.MeshStandardMaterial({ roughness: 0.6 })), FLOWERS);
  const bloom = [0xffd23f, 0xffffff, 0xff7aa8, 0xb78cff, 0xff9a3c, 0x7fd1ff];
  let nf = 0;
  for (let k = 0; k < 90000 && nf < FLOWERS; k++) {
    const x = (hash(k, 7) - 0.5) * 120;
    const z = 34 - hash(k, 9) * 80;
    const h = heightAt(x, z);
    if (h < 0.25 || h > 2.4 || near(x, z, 12) || fbm(x * 0.12 + 5, z * 0.12 + 9) < 0.45) continue;
    tp.set(x, h + 0.18, z);
    const s = 0.8 + hash(k, 11) * 1.1;
    sc.set(s, s, s);
    m4.compose(tp, q.identity(), sc);
    flowers.setMatrixAt(nf, m4);
    col.setHex(bloom[Math.floor(hash(k, 13) * bloom.length)]);
    flowers.setColorAt(nf, col);
    nf++;
  }
  flowers.count = nf;
  scene.add(flowers);

  return {
    pos: posPath,
    look: lookPath,
    ground: heightAt,
    tick: (t) => {
      if (reduced) return;
      ripple.offset.x = (t * 0.004) % 1;
      ripple.offset.y = (t * 0.002) % 1;
    },
    extra: [canopy, trunks, flowers],
  };
}

/* --------------------------------------------------------------------- sea */
const ISLANDS = [
  { x: -26, z: -34, r: 20, h: 7.8 },
  { x: 38, z: -66, r: 30, h: 13 },
  { x: -42, z: 24, r: 24, h: 3.8 },
  { x: 52, z: 8, r: 16, h: 3.2 },
  { x: -8, z: -135, r: 60, h: 24 },
];
function seaHeight(x: number, z: number): number {
  let h = -2.4;
  const n = 0.8 + 0.5 * fbm(x * 0.06, z * 0.06);
  for (const i of ISLANDS) h += i.h * Math.exp((-((x - i.x) ** 2 + (z - i.z) ** 2) / (i.r * i.r)) * 1.6) * n;
  return h;
}

function palmCrown(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const f = new THREE.PlaneGeometry(1, 1, 2, 7);
    const p = f.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < p.count; v++) {
      const u = p.getX(v) + 0.5;
      const l = p.getY(v) + 0.5;
      const w = (u - 0.5) * 0.9 * (1 - 0.75 * l);
      p.setXYZ(v, w, -l * l * 1.5 + l * 0.5 - Math.abs(w) * 0.5, l * 3.1);
    }
    f.rotateY((i / 8) * Math.PI * 2 + hash(i, 9) * 0.4);
    f.translate(0, 3.6, 0);
    parts.push(f.toNonIndexed());
    f.dispose();
  }
  const merged = mergeGeometries(parts)!;
  merged.computeVertexNormals();
  parts.forEach((g) => g.dispose());
  return merged;
}

function buildSea({ scene, keep, small, reduced }: Ctx): Built {
  // Islands and seabed.
  const TW = 300;
  const TD = 260;
  const S = small ? 130 : 200;
  const geo = keep(new THREE.PlaneGeometry(TW, TD, S, Math.round(S * 0.87)));
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -60);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, seaHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const pal = { bed: new THREE.Color(0x3fb7b4), wet: new THREE.Color(0xd8c48e), sand: new THREE.Color(0xf6e4b4), grass: new THREE.Color(0x86d63f), forest: new THREE.Color(0x2fa84f), deep: new THREE.Color(0x1b7a3c) };
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i);
    const n = fbm(pos.getX(i) * 0.25, pos.getZ(i) * 0.25, 3);
    c.copy(pal.bed);
    c.lerp(pal.wet, smooth(-1.6, -0.1, h));
    c.lerp(pal.sand, smooth(0, 0.5, h));
    c.lerp(pal.grass, smooth(0.9, 1.7, h + n * 0.6));
    c.lerp(pal.forest, smooth(2.2, 5, h + n));
    c.lerp(pal.deep, smooth(6, 16, h) * 0.8);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(geo, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }))));

  // Animated ocean surface: shallow turquoise near land, deep blue far out, foam on crests and shores.
  const WS = small ? 90 : 150;
  const wgeo = keep(new THREE.PlaneGeometry(TW, TD, WS, WS));
  wgeo.rotateX(-Math.PI / 2);
  wgeo.translate(0, 0, -60);
  const wp = wgeo.attributes.position as THREE.BufferAttribute;
  const n = wp.count;
  const ox = new Float32Array(n);
  const oz = new Float32Array(n);
  const shallow = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ox[i] = wp.getX(i);
    oz[i] = wp.getZ(i);
    shallow[i] = smooth(-3.2, 0.1, seaHeight(ox[i], oz[i]));
  }
  const wcol = new Float32Array(n * 3);
  wgeo.setAttribute('color', new THREE.BufferAttribute(wcol, 3));
  const deep = new THREE.Color(0x0a5fb0);
  const mid = new THREE.Color(0x10a6d8);
  const lagoon = new THREE.Color(0x3fe0d0);
  const foam = new THREE.Color(0xffffff);
  const tmp = new THREE.Color();
  const wave = (x: number, z: number, t: number) => 0.24 * Math.sin(0.33 * x + 0.9 * t) + 0.17 * Math.sin(0.27 * z + 1.3 * t + 1.7) + 0.1 * Math.sin(0.8 * (x + z) + 2 * t) + 0.05 * Math.sin(1.7 * x - 1.1 * z + 2.6 * t);
  const colorWater = (i: number, y: number, t: number) => {
    const sh = shallow[i];
    tmp.copy(deep).lerp(mid, smooth(0, 0.55, sh)).lerp(lagoon, smooth(0.5, 1, sh));
    const crest = smooth(0.3, 0.5, y) * 0.55;
    const shoreFoam = smooth(0.9, 1, sh) * (0.45 + 0.4 * Math.sin(ox[i] * 0.5 + oz[i] * 0.4 + t * 2));
    tmp.lerp(foam, Math.min(0.85, Math.max(crest, shoreFoam * 0.7)));
    wcol[i * 3] = tmp.r;
    wcol[i * 3 + 1] = tmp.g;
    wcol[i * 3 + 2] = tmp.b;
  };
  const animate = (t: number) => {
    for (let i = 0; i < n; i++) {
      const y = wave(ox[i], oz[i], t) * (0.35 + 0.65 * (1 - shallow[i] * 0.6));
      wp.setY(i, y);
      colorWater(i, y, t);
    }
    wp.needsUpdate = true;
    (wgeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    wgeo.computeVertexNormals();
  };
  animate(0);
  scene.add(new THREE.Mesh(wgeo, keep(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.5, transparent: true, opacity: 0.9 }))));

  const posPath = new THREE.CatmullRomCurve3([new THREE.Vector3(6, 5, 38), new THREE.Vector3(-12, 4.4, 22), new THREE.Vector3(-30, 4.2, 6), new THREE.Vector3(-22, 3.6, -6)]);
  const lookPath = new THREE.CatmullRomCurve3([new THREE.Vector3(-4, 3, -70), new THREE.Vector3(-18, 3, -52), new THREE.Vector3(-26, 4, -34), new THREE.Vector3(-30, 5, -34)]);
  const pts = pathPoints(posPath);
  const near = (x: number, z: number, r: number) => pts.some((v) => (v.x - x) ** 2 + (v.z - z) ** 2 < r * r);

  // Palm trees on every island.
  const PALMS = small ? 120 : 280;
  const trunkGeo = keep(new THREE.CylinderGeometry(0.12, 0.2, 3.6, 6));
  trunkGeo.translate(0, 1.8, 0);
  const crownGeo = keep(palmCrown());
  const trunks = new THREE.InstancedMesh(trunkGeo, keep(new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.95 })), PALMS);
  const crowns = new THREE.InstancedMesh(crownGeo, keep(new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide })), PALMS);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const tp = new THREE.Vector3();
  const col = new THREE.Color();
  let placed = 0;
  for (let k = 0; k < 40000 && placed < PALMS; k++) {
    const x = (hash(k, 71) - 0.5) * 220;
    const z = 40 - hash(k, 29) * 140;
    const h = seaHeight(x, z);
    if (h < 0.55 || h > 6 || near(x, z, 10) || fbm(x * 0.09 + 3, z * 0.09) < 0.4) continue;
    const s = 0.8 + hash(k, 5) * 0.7 + smooth(0, 60, -z) * 0.5;
    tp.set(x, h - 0.05, z);
    sc.setScalar(s);
    q.setFromEuler(e.set((hash(k, 2) - 0.5) * 0.35, hash(k, 3) * 6.28, (hash(k, 4) - 0.5) * 0.35));
    m4.compose(tp, q, sc);
    trunks.setMatrixAt(placed, m4);
    crowns.setMatrixAt(placed, m4);
    col.setHSL(0.27 + hash(k, 8) * 0.08, 0.6, 0.3 + hash(k, 6) * 0.1);
    crowns.setColorAt(placed, col);
    placed++;
  }
  trunks.count = crowns.count = placed;
  scene.add(trunks, crowns);

  // Boulders along the shores.
  const ROCKS = 140;
  const rocks = new THREE.InstancedMesh(keep(new THREE.DodecahedronGeometry(1, 0)), keep(new THREE.MeshStandardMaterial({ color: 0x8c8479, roughness: 0.9, flatShading: true })), ROCKS);
  let nr = 0;
  for (let k = 0; k < 40000 && nr < ROCKS; k++) {
    const x = (hash(k, 41) - 0.5) * 220;
    const z = 40 - hash(k, 43) * 140;
    const h = seaHeight(x, z);
    if (h < -0.3 || h > 0.5 || near(x, z, 8)) continue;
    tp.set(x, h, z);
    const s = 0.4 + hash(k, 6) * 1.1;
    sc.set(s, s * 0.7, s);
    q.setFromEuler(e.set(hash(k, 1), hash(k, 2) * 6, 0));
    m4.compose(tp, q, sc);
    rocks.setMatrixAt(nr++, m4);
  }
  rocks.count = nr;
  scene.add(rocks);

  return {
    pos: posPath,
    look: lookPath,
    ground: (x, z) => Math.max(0, seaHeight(x, z)),
    tick: (t) => {
      if (!reduced) animate(t);
    },
    extra: [trunks, crowns, rocks],
  };
}

/**
 * Full-page 3D scenery behind the whole app. The camera glides along a path as the page scrolls.
 * Decorative only (aria-hidden by the caller).
 */
export function createNature(container: HTMLElement, kind: SceneryKind = 'valley'): Nature | null {
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return null;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = window.innerWidth < 700;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(HORIZON, 1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HORIZON, 70, 230);
  const disposables: Array<{ dispose(): void }> = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const skyTex = keep(skyTexture());
  scene.add(new THREE.Mesh(keep(new THREE.SphereGeometry(190, 48, 32)), keep(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }))));
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c8).multiplyScalar(14) }));
  ball.position.copy(SUN_DIR).multiplyScalar(40);
  envScene.add(ball);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.8;

  const sun = new THREE.DirectionalLight(0xffe6bd, 2.8);
  sun.position.copy(SUN_DIR).multiplyScalar(60);
  scene.add(sun, new THREE.HemisphereLight(0xcfe8ff, 0x7aa07a, 0.8));

  const glow = new THREE.Sprite(
    keep(
      new THREE.SpriteMaterial({
        map: keep(
          canvasTexture(256, 256, (g) => {
            const r = g.createRadialGradient(128, 128, 4, 128, 128, 128);
            r.addColorStop(0, 'rgba(255,252,235,0.95)');
            r.addColorStop(0.12, 'rgba(255,238,185,0.5)');
            r.addColorStop(0.5, 'rgba(255,214,150,0.08)');
            r.addColorStop(1, 'rgba(255,214,150,0)');
            g.fillStyle = r;
            g.fillRect(0, 0, 256, 256);
          }),
        ),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    ),
  );
  glow.position.copy(SUN_DIR).multiplyScalar(150);
  glow.scale.setScalar(90);
  scene.add(glow);

  const cloudTex = keep(
    canvasTexture(256, 128, (g) => {
      for (let i = 0; i < 14; i++) {
        const x = 40 + hash(i, 21) * 176;
        const y = 50 + hash(i, 22) * 40;
        const r = 20 + hash(i, 23) * 28;
        const gr = g.createRadialGradient(x, y, 2, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.8)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 256, 128);
      }
    }),
  );
  const cloudMat = keep(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.6, depthWrite: false, fog: false, toneMapped: false }));
  const clouds: THREE.Sprite[] = [];
  for (let i = 0; i < 9; i++) {
    const sp = new THREE.Sprite(cloudMat);
    sp.position.set(-120 + i * 28 + hash(i, 1) * 12, 38 + hash(i, 2) * 26, -110 - hash(i, 3) * 40);
    sp.scale.set(70 + hash(i, 4) * 40, 28 + hash(i, 5) * 14, 1);
    scene.add(sp);
    clouds.push(sp);
  }

  const built = kind === 'sea' ? buildSea({ scene, keep, small, reduced }) : buildValley({ scene, keep, small, reduced });

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
  let target = 0;
  let prog = 0;
  let px = 0;
  let py = 0;
  const p = new THREE.Vector3();
  const l = new THREE.Vector3();

  function aim(): void {
    built.pos.getPoint(prog, p);
    built.look.getPoint(prog, l);
    p.x += px * 1.6;
    p.y += -py * 0.6;
    p.y = Math.max(p.y, built.ground(p.x, p.z) + 2.2);
    camera.position.copy(p);
    camera.lookAt(l);
  }
  function readScroll(): void {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    target = Math.min(1, Math.max(0, window.scrollY / max));
  }

  let t = 0;
  let raf = 0;
  let last = performance.now();
  let pending = false;
  function frame(dt: number): void {
    t += dt;
    prog += (target - prog) * Math.min(1, dt * 3);
    if (!reduced) {
      for (let i = 0; i < clouds.length; i++) {
        clouds[i].position.x += dt * (0.6 + i * 0.07);
        if (clouds[i].position.x > 160) clouds[i].position.x = -160;
      }
    }
    built.tick(t);
    aim();
    renderer.render(scene, camera);
  }
  function loop(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt);
    raf = requestAnimationFrame(loop);
  }
  function renderOnce(): void {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      prog = target;
      frame(0.016);
    });
  }

  const onScroll = (): void => {
    readScroll();
    if (reduced) renderOnce();
  };
  const onMove = (e: PointerEvent): void => {
    px = (e.clientX / window.innerWidth - 0.5) * 2;
    py = (e.clientY / window.innerHeight - 0.5) * 2;
    if (reduced) renderOnce();
  };
  const resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 62 : 48;
    camera.updateProjectionMatrix();
    if (reduced) renderOnce();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('resize', resize);
  readScroll();
  prog = target;
  resize();
  if (reduced) renderOnce();
  else raf = requestAnimationFrame(loop);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', resize);
      disposables.forEach((d) => d.dispose());
      built.extra.forEach((d) => d.dispose());
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
