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

// Photography palette: shutter orange, scan teal, safelight red.
const ORANGE = 0xff8a2b;
const HIT = 0xff3d5a;
const MAX_W = 4.5;
const MAX_H = 3.3;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Golden-hour landscape shown on the print before a photo is chosen. Decorative; the real prompt is DOM text. */
function placeholderTexture(): THREE.CanvasTexture {
  return canvasTexture(1200, 800, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 800);
    sky.addColorStop(0, '#0f3d4a');
    sky.addColorStop(0.45, '#2a8c8f');
    sky.addColorStop(0.7, '#f2a65a');
    sky.addColorStop(1, '#ffd08a');
    g.fillStyle = sky;
    g.fillRect(0, 0, 1200, 800);
    const sun = g.createRadialGradient(780, 520, 10, 780, 520, 260);
    sun.addColorStop(0, 'rgba(255,248,220,1)');
    sun.addColorStop(0.25, 'rgba(255,214,140,0.85)');
    sun.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, 1200, 800);
    const ridge = (base: number, amp: number, color: string, seed: number) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, 800);
      for (let x = 0; x <= 1200; x += 20) {
        g.lineTo(x, base + Math.sin(x * 0.006 + seed) * amp + Math.sin(x * 0.017 + seed * 2) * amp * 0.4);
      }
      g.lineTo(1200, 800);
      g.closePath();
      g.fill();
    };
    ridge(560, 40, '#3b6f73', 1);
    ridge(620, 34, '#1f4b55', 2.4);
    ridge(690, 26, '#0b2a33', 4.1);
  });
}

/** Studio environment with coloured softboxes, so glass and metal pick up real-looking reflections. */
function studioEnvironment(): THREE.Scene {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x05090c);
  const box = (w: number, h: number, color: number, intensity: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  box(14, 8, 0xffb070, 9, -12, 9, 10); // warm key softbox
  box(3, 16, 0x35f0dd, 7, 14, 1, -4); // teal strip, right-back
  box(18, 3, 0xffffff, 6, 0, 14, 2); // overhead strip
  box(6, 6, 0xff4fa0, 3, 10, -6, 8); // magenta kicker
  box(20, 4, 0x2a6f8a, 2, 0, -12, 4); // cool floor bounce
  return s;
}

export function createScene(container: HTMLElement): Scene3D | null {
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return null;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = studioEnvironment();
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  envScene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    (m.material as THREE.Material | undefined)?.dispose();
  });

  const key = new THREE.SpotLight(0xffc592, 70, 40, 0.7, 0.8, 1.6);
  key.position.set(-6, 6, 9);
  key.target.position.set(0, 0, 0);
  const rim = new THREE.PointLight(0x35f0dd, 40, 30, 1.6);
  rim.position.set(7, 2, -3);
  scene.add(key, key.target, rim, new THREE.AmbientLight(0x8fb7c4, 0.35));

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
  const root = new THREE.Group();
  scene.add(root);

  const placeholder = placeholderTexture();
  let photoTexture: THREE.Texture | null = null;
  let aspect = 1.5;
  let printW = MAX_W + 0.9;
  let printH = MAX_H + 1.6;
  let content = new THREE.Group();
  let dispose: Array<{ dispose(): void }> = [];
  let beam: THREE.Group | null = null;
  let brackets: THREE.MeshStandardMaterial | null = null;
  let sheenTex: THREE.CanvasTexture | null = null;
  let lensGlow: THREE.MeshBasicMaterial | null = null;
  let lensRing: THREE.MeshStandardMaterial | null = null;
  let photoW = MAX_W;
  let photoH = MAX_H;
  let photoCenterY = 0;
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

  const track = <T extends { dispose(): void }>(x: T): T => {
    dispose.push(x);
    return x;
  };

  /** A camera lens seen from the front, behind the print: knurled barrel, engraved ring, coated glass. */
  function buildLens(group: THREE.Group): void {
    const R = 3.1;
    const dark = track(new THREE.MeshStandardMaterial({ color: 0x39424a, metalness: 1, roughness: 0.34, envMapIntensity: 2 }));
    const knurl = track(
      canvasTexture(
        512,
        64,
        (g) => {
          g.fillStyle = '#808080';
          g.fillRect(0, 0, 512, 64);
          for (let i = 0; i < 512; i += 8) {
            g.fillStyle = '#e0e0e0';
            g.fillRect(i, 0, 3, 64);
            g.fillStyle = '#303030';
            g.fillRect(i + 4, 0, 3, 64);
          }
        },
        false,
      ),
    );
    knurl.wrapS = knurl.wrapT = THREE.RepeatWrapping;
    knurl.repeat.set(3, 1);
    const grip = track(new THREE.MeshStandardMaterial({ color: 0x2a3036, metalness: 0.9, roughness: 0.45, envMapIntensity: 1.6, bumpMap: knurl, bumpScale: 1.6 }));

    const barrelGeo = track(new THREE.CylinderGeometry(R, R, 3.2, 128, 1, true));
    const barrel = new THREE.Mesh(barrelGeo, grip);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -1.6;
    group.add(barrel);

    const frontRing = new THREE.Mesh(track(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.5, 128)), dark);
    frontRing.rotation.x = Math.PI / 2;
    frontRing.position.z = 0;
    group.add(frontRing);

    // Orange accent ring (shutter orange).
    lensRing = track(new THREE.MeshStandardMaterial({ color: ORANGE, emissive: ORANGE, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.3 }));
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(R - 0.12, 0.05, 16, 160)), lensRing);
    ring.position.z = 0.27;
    group.add(ring);

    // Engraved ring: text around the front face.
    const engraved = track(
      canvasTexture(1024, 1024, (g) => {
        g.clearRect(0, 0, 1024, 1024);
        g.translate(512, 512);
        g.fillStyle = 'rgba(235,240,240,0.85)';
        g.font = '600 34px "Atkinson Hyperlegible", system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const text = 'SAFESNAP  •  PRIVACY CHECK  1:1.4  •  ON DEVICE FIRST  •  ';
        const rad = 440;
        const step = (Math.PI * 2) / text.length;
        for (let i = 0; i < text.length; i++) {
          g.save();
          g.rotate(i * step);
          g.translate(0, -rad);
          g.fillText(text[i], 0, 0);
          g.restore();
        }
      }),
    );
    const face = new THREE.Mesh(
      track(new THREE.RingGeometry(2.05, R - 0.2, 128)),
      track(new THREE.MeshStandardMaterial({ color: 0x4a545c, metalness: 1, roughness: 0.3, envMapIntensity: 2.2 })),
    );
    face.position.z = 0.26;
    group.add(face);
    const text = new THREE.Mesh(
      track(new THREE.PlaneGeometry((R - 0.2) * 2 * 1.16, (R - 0.2) * 2 * 1.16)),
      track(new THREE.MeshBasicMaterial({ map: engraved, transparent: true, depthWrite: false, toneMapped: false })),
    );
    text.position.z = 0.262;
    group.add(text);

    // Inner hood wall.
    const hood = new THREE.Mesh(track(new THREE.CylinderGeometry(2.05, 1.85, 0.7, 96, 1, true)), track(new THREE.MeshStandardMaterial({ color: 0x050607, metalness: 0.9, roughness: 0.3, side: THREE.BackSide })));
    hood.rotation.x = Math.PI / 2;
    hood.position.z = -0.1;
    group.add(hood);

    // Curved front glass element, coated: dark body with iridescent reflections.
    const sphereR = 5;
    const cap = Math.asin(1.9 / sphereR);
    const glass = new THREE.Mesh(
      track(new THREE.SphereGeometry(sphereR, 96, 48, 0, Math.PI * 2, 0, cap)),
      track(new THREE.MeshPhysicalMaterial({ color: 0x03070b, metalness: 0.1, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [250, 700], envMapIntensity: 4, reflectivity: 1 })),
    );
    glass.rotation.x = Math.PI / 2;
    glass.position.z = 0.0 - sphereR + 0.28;
    group.add(glass);

    // Inner elements and aperture seen through the glass.
    const depth = track(
      canvasTexture(768, 768, (g) => {
        const c = 384;
        const bg = g.createRadialGradient(c, c, 10, c, c, c);
        bg.addColorStop(0, 'rgba(60,20,90,0.9)');
        bg.addColorStop(0.35, 'rgba(10,60,80,0.75)');
        bg.addColorStop(0.7, 'rgba(120,40,110,0.35)');
        bg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = bg;
        g.fillRect(0, 0, 768, 768);
        for (const [r, col] of [[330, 'rgba(53,240,221,0.35)'], [250, 'rgba(255,79,160,0.3)'], [170, 'rgba(255,170,90,0.28)'], [100, 'rgba(120,180,255,0.3)']] as const) {
          g.strokeStyle = col;
          g.lineWidth = 6;
          g.beginPath();
          g.arc(c, c, r, 0, Math.PI * 2);
          g.stroke();
        }
        // Nine aperture blades.
        g.fillStyle = 'rgba(0,0,0,0.92)';
        g.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(c + Math.cos(a) * 90, c + Math.sin(a) * 90);
        }
        g.closePath();
        g.arc(c, c, 140, 0, Math.PI * 2, true);
        g.fill('evenodd');
      }),
    );
    lensGlow = track(new THREE.MeshBasicMaterial({ map: depth, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8, toneMapped: false }));
    const inner = new THREE.Mesh(track(new THREE.CircleGeometry(1.85, 96)), lensGlow);
    inner.position.z = 0.3;
    group.add(inner);

    // Specular streak across the curved glass.
    const streak = new THREE.Mesh(
      track(new THREE.CircleGeometry(1.85, 96)),
      track(
        new THREE.MeshBasicMaterial({
          map: track(
            canvasTexture(256, 256, (g) => {
              const gr = g.createLinearGradient(30, 30, 226, 226);
              gr.addColorStop(0.18, 'rgba(255,255,255,0)');
              gr.addColorStop(0.3, 'rgba(255,255,255,0.55)');
              gr.addColorStop(0.38, 'rgba(255,255,255,0)');
              gr.addColorStop(0.62, 'rgba(255,255,255,0)');
              gr.addColorStop(0.7, 'rgba(120,255,240,0.25)');
              gr.addColorStop(0.78, 'rgba(255,255,255,0)');
              g.fillStyle = gr;
              g.fillRect(0, 0, 256, 256);
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
    group.add(streak);

    // Soft halo behind the lens, so it glows against the dark page.
    const halo = new THREE.Mesh(
      track(new THREE.PlaneGeometry(R * 3.4, R * 3.4)),
      track(
        new THREE.MeshBasicMaterial({
          map: track(
            canvasTexture(256, 256, (g) => {
              const r = g.createRadialGradient(128, 128, 20, 128, 128, 128);
              r.addColorStop(0, 'rgba(255,138,43,0.5)');
              r.addColorStop(0.5, 'rgba(45,226,208,0.14)');
              r.addColorStop(1, 'rgba(0,0,0,0)');
              g.fillStyle = r;
              g.fillRect(0, 0, 256, 256);
            }),
          ),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    );
    halo.position.z = -0.9;
    group.add(halo);
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
    const side = 0.36;
    const top = 0.36;
    const chin = 1.0;
    printW = photoW + side * 2;
    printH = photoH + top + chin;
    photoCenterY = (chin - top) / 2; // photo sits above the chin

    // The lens, offset behind the print.
    const lens = new THREE.Group();
    lens.position.set(1.0, 0.8, -1.6);
    lens.scale.setScalar(0.86);
    buildLens(lens);
    content.add(lens);

    const printGroup = new THREE.Group();
    printGroup.position.set(-1.0, -1.2, 0);
    content.add(printGroup);

    // Instant-print paper.
    const paper = new THREE.Mesh(
      track(new RoundedBoxGeometry(printW, printH, 0.09, 4, 0.05)),
      track(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.3, emissive: 0xfff6e6, emissiveIntensity: 0.55 })),
    );
    printGroup.add(paper);

    const photoGroup = new THREE.Group();
    photoGroup.position.set(0, photoCenterY, 0.05);
    printGroup.add(photoGroup);

    const photoMat = track(new THREE.MeshBasicMaterial({ map: photoTexture ?? placeholder, toneMapped: false }));
    const photo = new THREE.Mesh(track(new THREE.PlaneGeometry(photoW, photoH)), photoMat);
    photo.position.z = 0.001;
    photoGroup.add(photo);

    // Glossy sweep across the photo.
    sheenTex = track(
      canvasTexture(512, 256, (g) => {
        const grad = g.createLinearGradient(0, 0, 512, 256);
        grad.addColorStop(0.3, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
        grad.addColorStop(0.7, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 512, 256);
      }),
    );
    sheenTex.wrapS = THREE.RepeatWrapping;
    sheenTex.repeat.set(0.7, 1);
    const sheen = new THREE.Mesh(
      track(new THREE.PlaneGeometry(photoW, photoH)),
      track(new THREE.MeshBasicMaterial({ map: sheenTex, transparent: true, depthWrite: false, toneMapped: false })),
    );
    sheen.position.z = 0.004;
    photoGroup.add(sheen);

    // 3×3 grid lines: dark and light pair so they read on any photo.
    const lineDark = track(new THREE.MeshBasicMaterial({ color: 0x04141a, transparent: true, opacity: 0.4, toneMapped: false }));
    const lineLight = track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false }));
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

    // Viewfinder corner brackets floating in front of the print (shutter orange).
    brackets = track(new THREE.MeshStandardMaterial({ color: ORANGE, emissive: ORANGE, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.4, side: THREE.DoubleSide }));
    const L = 0.55;
    const th = 0.09;
    const arm = new THREE.Shape();
    arm.moveTo(0, 0);
    arm.lineTo(L, 0);
    arm.lineTo(L, -th);
    arm.lineTo(th, -th);
    arm.lineTo(th, -L);
    arm.lineTo(0, -L);
    arm.closePath();
    const armGeo = track(new THREE.ExtrudeGeometry(arm, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2 }));
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const b = new THREE.Mesh(armGeo, brackets);
        b.scale.set(-sx, sy, 1);
        b.position.set(sx * (photoW / 2 + 0.16), sy * (photoH / 2 + 0.16), 0.42);
        photoGroup.add(b);
      }
    }

    // Scan beam: a sheet of teal light with a bright leading edge.
    beam = new THREE.Group();
    const trail = new THREE.Mesh(
      track(new THREE.PlaneGeometry(photoW + 0.3, 1.0)),
      track(
        new THREE.MeshBasicMaterial({
          map: track(
            canvasTexture(8, 128, (g) => {
              const grad = g.createLinearGradient(0, 0, 0, 128);
              grad.addColorStop(0, 'rgba(45,226,208,0)');
              grad.addColorStop(0.85, 'rgba(45,226,208,0.5)');
              grad.addColorStop(1, 'rgba(220,255,250,0.95)');
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
    const edge = new THREE.Mesh(track(new THREE.BoxGeometry(photoW + 0.3, 0.03, 0.03)), track(new THREE.MeshBasicMaterial({ color: 0xdffffb, toneMapped: false })));
    beam.add(trail, edge);
    beam.position.z = 0.2;
    beam.visible = false;
    photoGroup.add(beam);

    hitGroup = new THREE.Group();
    photoGroup.add(hitGroup);

    // Contact shadow on the lens face behind the print.
    const shadow = new THREE.Mesh(
      track(new THREE.PlaneGeometry(printW * 1.3, printH * 1.3)),
      track(
        new THREE.MeshBasicMaterial({
          map: track(
            canvasTexture(256, 256, (g) => {
              const r = g.createRadialGradient(128, 128, 20, 128, 128, 128);
              r.addColorStop(0, 'rgba(0,0,0,0.6)');
              r.addColorStop(1, 'rgba(0,0,0,0)');
              g.fillStyle = r;
              g.fillRect(0, 0, 256, 256);
            }),
          ),
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    );
    shadow.position.set(0.35, -0.45, -0.5);
    printGroup.add(shadow);

    applyHits();
    fit();
    requestRender();
  }

  function fit(): void {
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const a = size.w / size.h;
    const needW = 8.6;
    const needH = 7.6;
    const d = Math.max(needH / (2 * tan), needW / (2 * tan * a));
    camera.aspect = a;
    camera.position.set(0, 0, d);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
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
      const cw = photoW / 3 - 0.1;
      const ch = photoH / 3 - 0.1;
      const geo = track(new RoundedBoxGeometry(cw, ch, 0.08, 3, 0.05));
      const low = f.confidence === 'low';
      const mesh = new THREE.Mesh(
        geo,
        track(new THREE.MeshPhysicalMaterial({ color: HIT, emissive: HIT, emissiveIntensity: low ? 0.3 : 0.6, transparent: true, opacity: low ? 0.3 : 0.5, roughness: 0.15, clearcoat: 1 })),
      );
      const edges = new THREE.LineSegments(track(new THREE.EdgesGeometry(geo)), track(new THREE.LineBasicMaterial({ color: 0xffd0d8 })));
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
    root.scale.setScalar(0.9 + 0.1 * e);
    const targetY = -0.22 + px * 0.3 + (1 - e) * -0.8;
    const targetX = 0.07 - py * 0.16;
    const k = Math.min(1, dt * 5);
    root.rotation.y += (targetY - root.rotation.y) * k;
    root.rotation.x += (targetX - root.rotation.x) * k;
    root.position.y = reduced ? 0 : Math.sin(t * 0.9) * 0.06;
    if (sheenTex) sheenTex.offset.x = 0.15 - px * 0.35;
    const scanning = state === 'scanning' && !reduced;
    if (brackets) brackets.emissiveIntensity = scanning ? 0.6 + 0.6 * Math.sin(t * 6) ** 2 : 0.55;
    if (lensRing) lensRing.emissiveIntensity = scanning ? 0.5 + 0.9 * Math.sin(t * 5) ** 2 : 0.35;
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
      placeholder.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
