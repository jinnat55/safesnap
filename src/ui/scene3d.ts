import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GRID_CELLS, type Finding } from '../types';
import { SUN_DIR, canvasTexture, clamp01, skyTexture } from './terrain';

export type StageState = 'idle' | 'ready' | 'scanning' | 'result';

export interface Scene3D {
  setPhoto(url: string | null): void;
  setState(state: StageState): void;
  setHits(findings: Finding[]): void;
  dispose(): void;
}

// The hero objects float over the full-page landscape: an instant print, a big lens and a small camera.
const ORANGE = 0xff8a2b;
const HIT = 0xe5384f;
const MAX_W = 4.2;
const MAX_H = 3.1;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** A seaside photo shown on the print before a photo is chosen: lighthouse, rocks and gulls at golden hour. */
function placeholderTexture(): THREE.CanvasTexture {
  return canvasTexture(1200, 800, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 520);
    sky.addColorStop(0, '#3f7fe0');
    sky.addColorStop(0.55, '#ffb98a');
    sky.addColorStop(1, '#ffe2a8');
    g.fillStyle = sky;
    g.fillRect(0, 0, 1200, 520);
    const sun = g.createRadialGradient(300, 440, 6, 300, 440, 260);
    sun.addColorStop(0, 'rgba(255,255,230,1)');
    sun.addColorStop(0.3, 'rgba(255,225,150,0.8)');
    sun.addColorStop(1, 'rgba(255,200,130,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, 1200, 560);
    const sea = g.createLinearGradient(0, 520, 0, 800);
    sea.addColorStop(0, '#f3b27a');
    sea.addColorStop(0.25, '#2fa6c4');
    sea.addColorStop(1, '#0b5f9a');
    g.fillStyle = sea;
    g.fillRect(0, 520, 1200, 280);
    g.fillStyle = 'rgba(255,240,200,0.55)';
    for (let i = 0; i < 26; i++) g.fillRect(250 + ((i * 37) % 120) - 60, 540 + i * 9, 70 - i * 1.5, 3);
    g.fillStyle = '#5a4636';
    g.beginPath();
    g.moveTo(640, 800);
    g.lineTo(700, 600);
    g.lineTo(820, 560);
    g.lineTo(980, 610);
    g.lineTo(1200, 560);
    g.lineTo(1200, 800);
    g.closePath();
    g.fill();
    const tx = 840;
    g.fillStyle = '#f7f2e8';
    g.beginPath();
    g.moveTo(tx - 34, 565);
    g.lineTo(tx + 34, 565);
    g.lineTo(tx + 22, 250);
    g.lineTo(tx - 22, 250);
    g.closePath();
    g.fill();
    g.fillStyle = '#d6423a';
    for (const y of [300, 400, 500]) {
      g.beginPath();
      g.moveTo(tx - 22 - (y - 250) * 0.045, y);
      g.lineTo(tx + 22 + (y - 250) * 0.045, y);
      g.lineTo(tx + 22 + (y + 40 - 250) * 0.045, y + 40);
      g.lineTo(tx - 22 - (y + 40 - 250) * 0.045, y + 40);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#2b2f36';
    g.fillRect(tx - 30, 232, 60, 18);
    g.fillStyle = '#ffe58a';
    g.fillRect(tx - 18, 196, 36, 36);
    g.fillStyle = '#d6423a';
    g.beginPath();
    g.moveTo(tx - 28, 196);
    g.lineTo(tx, 160);
    g.lineTo(tx + 28, 196);
    g.closePath();
    g.fill();
    g.strokeStyle = '#2b2f36';
    g.lineWidth = 4;
    for (const [x, y] of [[420, 150], [500, 120], [560, 175]] as const) {
      g.beginPath();
      g.moveTo(x - 22, y + 6);
      g.quadraticCurveTo(x - 10, y - 12, x, y);
      g.quadraticCurveTo(x + 10, y - 12, x + 22, y + 6);
      g.stroke();
    }
  });
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
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const skyTex = skyTexture();
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c8).multiplyScalar(14) }));
  ball.position.copy(SUN_DIR).multiplyScalar(40);
  envScene.add(ball);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.95;

  const key = new THREE.DirectionalLight(0xfff2dc, 2.2);
  key.position.set(-6, 8, 14);
  const rim = new THREE.DirectionalLight(0xffe2b0, 1.6);
  rim.position.set(8, 5, -6);
  scene.add(key, rim, new THREE.HemisphereLight(0xcfe8ff, 0x7aa07a, 0.7));

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
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
  let lensGlows: THREE.MeshBasicMaterial[] = [];
  let lensRings: THREE.MeshStandardMaterial[] = [];
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
  let camZ = 20;

  const track = <T extends { dispose(): void }>(x: T): T => {
    dispose.push(x);
    return x;
  };

  /** A coated camera lens seen from the front: knurled barrel, engraved ring, curved glass, aperture. Radius 3.1, barrel runs back along -z. */
  function buildLens(): THREE.Group {
    const lens = new THREE.Group();
    const R = 3.1;
    const dark = track(new THREE.MeshStandardMaterial({ color: 0x39424a, metalness: 1, roughness: 0.34, envMapIntensity: 1.6 }));
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
    const grip = track(new THREE.MeshStandardMaterial({ color: 0x2a3036, metalness: 0.9, roughness: 0.45, envMapIntensity: 1.4, bumpMap: knurl, bumpScale: 1.6 }));
    const barrel = new THREE.Mesh(track(new THREE.CylinderGeometry(R, R, 3.2, 128, 1, true)), grip);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -1.6;
    const frontRing = new THREE.Mesh(track(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.5, 128)), dark);
    frontRing.rotation.x = Math.PI / 2;
    const ringMat = track(new THREE.MeshStandardMaterial({ color: ORANGE, emissive: ORANGE, emissiveIntensity: 0.3, metalness: 0.6, roughness: 0.3 }));
    lensRings.push(ringMat);
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(R - 0.12, 0.05, 16, 160)), ringMat);
    ring.position.z = 0.27;
    const face = new THREE.Mesh(track(new THREE.RingGeometry(2.05, R - 0.2, 128)), track(new THREE.MeshStandardMaterial({ color: 0x4a545c, metalness: 1, roughness: 0.3, envMapIntensity: 2.0 })));
    face.position.z = 0.26;
    const engraved = track(
      canvasTexture(1024, 1024, (g) => {
        g.translate(512, 512);
        g.fillStyle = 'rgba(240,245,245,0.9)';
        g.font = '600 34px "Atkinson Hyperlegible", system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const text = 'SAFESNAP  •  PRIVACY CHECK  1:1.4  •  ON DEVICE FIRST  •  ';
        const step = (Math.PI * 2) / text.length;
        for (let i = 0; i < text.length; i++) {
          g.save();
          g.rotate(i * step);
          g.translate(0, -440);
          g.fillText(text[i], 0, 0);
          g.restore();
        }
      }),
    );
    const label = new THREE.Mesh(track(new THREE.PlaneGeometry((R - 0.2) * 2.32, (R - 0.2) * 2.32)), track(new THREE.MeshBasicMaterial({ map: engraved, transparent: true, depthWrite: false, toneMapped: false })));
    label.position.z = 0.262;
    const hood = new THREE.Mesh(track(new THREE.CylinderGeometry(2.05, 1.85, 0.7, 64, 1, true)), track(new THREE.MeshStandardMaterial({ color: 0x050607, metalness: 0.9, roughness: 0.3, side: THREE.BackSide })));
    hood.rotation.x = Math.PI / 2;
    hood.position.z = -0.1;
    const sphereR = 5;
    const glass = new THREE.Mesh(
      track(new THREE.SphereGeometry(sphereR, 80, 40, 0, Math.PI * 2, 0, Math.asin(1.9 / sphereR))),
      track(new THREE.MeshPhysicalMaterial({ color: 0x04090e, metalness: 0.1, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [250, 700], envMapIntensity: 3.6 })),
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
        for (const [r, cc] of [[220, 'rgba(80,240,200,0.4)'], [165, 'rgba(255,110,170,0.35)'], [110, 'rgba(255,190,110,0.3)']] as const) {
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
    const glowMat = track(new THREE.MeshBasicMaterial({ map: depth, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8, toneMapped: false }));
    lensGlows.push(glowMat);
    const inner = new THREE.Mesh(track(new THREE.CircleGeometry(1.85, 64)), glowMat);
    inner.position.z = 0.3;
    const streak = new THREE.Mesh(
      track(new THREE.CircleGeometry(1.85, 64)),
      track(
        new THREE.MeshBasicMaterial({
          map: track(
            canvasTexture(128, 128, (g) => {
              const gr = g.createLinearGradient(16, 16, 112, 112);
              gr.addColorStop(0.2, 'rgba(255,255,255,0)');
              gr.addColorStop(0.32, 'rgba(255,255,255,0.65)');
              gr.addColorStop(0.42, 'rgba(255,255,255,0)');
              gr.addColorStop(0.64, 'rgba(255,255,255,0)');
              gr.addColorStop(0.72, 'rgba(170,255,230,0.32)');
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
    lens.add(barrel, frontRing, ring, face, label, hood, glass, inner, streak);
    return lens;
  }

  /** A small rangefinder camera body that carries a lens. */
  function buildCamera(group: THREE.Group): void {
    const bump = track(
      canvasTexture(
        128,
        128,
        (g) => {
          g.fillStyle = '#808080';
          g.fillRect(0, 0, 128, 128);
          for (let i = 0; i < 900; i++) {
            g.fillStyle = i % 2 ? '#a8a8a8' : '#5a5a5a';
            g.beginPath();
            g.arc(((i * 53) % 128), ((i * 97) % 128), 1.2 + (i % 3) * 0.5, 0, 6.28);
            g.fill();
          }
        },
        false,
      ),
    );
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(3, 1);
    const leather = track(new THREE.MeshStandardMaterial({ color: 0x1d2220, roughness: 0.7, metalness: 0.05, bumpMap: bump, bumpScale: 1.4 }));
    const chrome = track(new THREE.MeshStandardMaterial({ color: 0xe4e8ea, metalness: 1, roughness: 0.16, envMapIntensity: 1.3 }));
    const body = new THREE.Mesh(track(new RoundedBoxGeometry(3.3, 1.25, 1.15, 5, 0.1)), leather);
    body.position.y = -0.28;
    const top = new THREE.Mesh(track(new RoundedBoxGeometry(3.3, 0.5, 1.15, 5, 0.12)), chrome);
    top.position.y = 0.56;
    const base = new THREE.Mesh(track(new RoundedBoxGeometry(3.3, 0.14, 1.15, 4, 0.06)), chrome);
    base.position.y = -0.95;
    const hump = new THREE.Mesh(track(new RoundedBoxGeometry(1.0, 0.36, 0.72, 4, 0.08)), chrome);
    hump.position.set(-0.75, 0.96, -0.05);
    group.add(body, top, base, hump);
    const shutter = track(new THREE.MeshStandardMaterial({ color: ORANGE, metalness: 0.5, roughness: 0.3, emissive: ORANGE, emissiveIntensity: 0.15 }));
    const btn = new THREE.Mesh(track(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 24)), shutter);
    btn.position.set(0.95, 0.88, 0.1);
    const dial = new THREE.Mesh(track(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 48)), chrome);
    dial.position.set(1.15, 0.91, -0.1);
    group.add(btn, dial);
    const strap = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.62, 0.1, 0), new THREE.Vector3(-2.3, -0.5, 0.2), new THREE.Vector3(-2.5, -1.6, 0.3), new THREE.Vector3(-2.1, -2.6, 0.2)]);
    const strapMesh = new THREE.Mesh(track(new THREE.TubeGeometry(strap, 30, 0.07, 6, false)), leather);
    strapMesh.scale.set(1, 1, 3.2);
    group.add(strapMesh);
    const lens = buildLens();
    lens.scale.set(0.37, 0.37, 0.55);
    lens.position.set(0.2, -0.2, 0.95);
    group.add(lens);
  }

  function build(): void {
    root.remove(content);
    dispose.forEach((d) => d.dispose());
    dispose = [];
    hits = [];
    lensGlows = [];
    lensRings = [];
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

    // One camera: body with a large coated lens, resting beside the print and facing it.
    const cam = new THREE.Group();
    cam.position.set(2.75, 0.45, -0.3);
    cam.scale.setScalar(1.28);
    cam.rotation.set(0.06, -0.42, -0.02);
    buildCamera(cam);
    content.add(cam);

    const printGroup = new THREE.Group();
    printGroup.position.set(-1.9, 0.1, 0.6);
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
    camZ = Math.max(7.6 / (2 * tan), 11.4 / (2 * tan * a));
    camera.aspect = a;
    camera.updateProjectionMatrix();
    placeCamera();
  }

  function placeCamera(): void {
    camera.position.set(px * 0.9, 0.4 - py * 0.4, camZ);
    camera.lookAt(0, 0.2, 0);
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
    const targetY = 0.12 + px * 0.2 + (1 - e) * -0.6;
    const targetX = 0.03 - py * 0.08;
    const k = Math.min(1, dt * 5);
    root.rotation.y += (targetY - root.rotation.y) * k;
    root.rotation.x += (targetX - root.rotation.x) * k;
    root.position.y = reduced ? 0 : Math.sin(t * 0.9) * 0.07;
    placeCamera();
    if (sheenTex) sheenTex.offset.x = 0.15 - px * 0.35;
    const scanning = state === 'scanning' && !reduced;
    if (brackets) brackets.emissiveIntensity = scanning ? 0.5 + 0.6 * Math.sin(t * 6) ** 2 : 0.4;
    for (const m of lensRings) m.emissiveIntensity = scanning ? 0.4 + 0.9 * Math.sin(t * 5) ** 2 : 0.3;
    for (const m of lensGlows) m.opacity = scanning ? 0.85 + 0.15 * Math.sin(t * 5) : 0.8;
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
      skyTex.dispose();
      placeholder.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
