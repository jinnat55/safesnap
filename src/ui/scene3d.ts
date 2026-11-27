import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GRID_CELLS, type Finding } from '../types';

export type StageState = 'idle' | 'ready' | 'scanning' | 'result';

export interface Scene3D {
  setPhoto(url: string | null): void;
  setState(state: StageState): void;
  setHits(findings: Finding[]): void;
  dispose(): void;
}

const BLUE = 0x2f62f0;
const CORAL = 0xff5a3c;
const MAX_W = 5.4;
const MAX_H = 3.7;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, 1.5 * Math.PI, false);
  return s;
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft studio placeholder shown before a photo is chosen. Decorative only; the real prompt is DOM text. */
function placeholderTexture(): THREE.CanvasTexture {
  return canvasTexture(1200, 800, (g) => {
    const bg = g.createLinearGradient(0, 0, 0, 800);
    bg.addColorStop(0, '#cfe2ff');
    bg.addColorStop(0.55, '#f4f8ff');
    bg.addColorStop(1, '#ffe6d6');
    g.fillStyle = bg;
    g.fillRect(0, 0, 1200, 800);
    g.strokeStyle = 'rgba(47, 98, 240, 0.16)';
    g.lineWidth = 3;
    for (let i = 1; i <= 4; i++) {
      g.beginPath();
      g.arc(600, 400, i * 70, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = 'rgba(47, 98, 240, 0.08)';
    g.beginPath();
    g.arc(600, 400, 56, 0, Math.PI * 2);
    g.fill();
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
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(3, 5, 7);
  scene.add(key, new THREE.AmbientLight(0xdfe9ff, 0.6));

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const root = new THREE.Group();
  scene.add(root);

  const placeholder = placeholderTexture();
  let photoTexture: THREE.Texture | null = null;
  let aspect = 1.5;
  let slabW = MAX_W + 0.5;
  let slabH = MAX_H + 0.5;
  let content = new THREE.Group();
  let dispose: Array<{ dispose(): void }> = [];
  let beam: THREE.Group | null = null;
  let brackets: THREE.MeshStandardMaterial | null = null;
  let sheenTex: THREE.CanvasTexture | null = null;
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

  const track = <T extends { dispose(): void }>(x: T): T => {
    dispose.push(x);
    return x;
  };

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
    slabW = photoW + 0.5;
    slabH = photoH + 0.5;

    // Photographic print: white paper slab with the photo on its face.
    const slab = new THREE.Mesh(
      track(new RoundedBoxGeometry(slabW, slabH, 0.16, 5, 0.12)),
      track(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.25 })),
    );
    content.add(slab);
    // Two more prints behind it, so the object reads as a physical stack with depth.
    for (const [col, dx, dy, rz, z] of [[0xe3edff, 0.16, -0.1, 0.045, -0.22], [0xffe7da, -0.2, 0.08, -0.06, -0.44]] as const) {
      const sheet = new THREE.Mesh(
        track(new RoundedBoxGeometry(slabW, slabH, 0.12, 4, 0.1)),
        track(new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.45, clearcoat: 0.4 })),
      );
      sheet.position.set(dx, dy, z);
      sheet.rotation.z = rz;
      content.add(sheet);
    }

    const photoMat = track(new THREE.MeshBasicMaterial({ map: photoTexture ?? placeholder, toneMapped: false }));
    const photo = new THREE.Mesh(track(new THREE.PlaneGeometry(photoW, photoH)), photoMat);
    photo.position.z = 0.082;
    content.add(photo);

    // Moving glare on the print, like light sliding over glossy paper.
    sheenTex = track(
      canvasTexture(512, 256, (g) => {
        const grad = g.createLinearGradient(0, 0, 512, 256);
        grad.addColorStop(0.3, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.34)');
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
    sheen.position.z = 0.086;
    content.add(sheen);

    // 3×3 grid lines: dark and white pair so they read on any photo.
    const lineDark = track(new THREE.MeshBasicMaterial({ color: 0x0a1a33, transparent: true, opacity: 0.35, toneMapped: false }));
    const lineLight = track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false }));
    for (const f of [1, 2]) {
      const x = -photoW / 2 + (photoW * f) / 3;
      const y = -photoH / 2 + (photoH * f) / 3;
      for (const [mat, th, z] of [[lineDark, 0.03, 0.09], [lineLight, 0.012, 0.092]] as const) {
        const v = new THREE.Mesh(track(new THREE.BoxGeometry(th, photoH, 0.004)), mat);
        v.position.set(x, 0, z);
        const h = new THREE.Mesh(track(new THREE.BoxGeometry(photoW, th, 0.004)), mat);
        h.position.set(0, y, z);
        content.add(v, h);
      }
    }

    // Glass bezel floating in front of the print.
    const outer = roundedRect(photoW + 1.0, photoH + 1.0, 0.34);
    const hole = roundedRect(photoW + 0.06, photoH + 0.06, 0.1);
    outer.holes.push(new THREE.Path(hole.getPoints(24)));
    const bezel = new THREE.Mesh(
      track(new THREE.ExtrudeGeometry(outer, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 6, curveSegments: 24 })),
      track(
        new THREE.MeshPhysicalMaterial({
          color: 0xeef4ff,
          roughness: 0.04,
          metalness: 0,
          transmission: 0.92,
          thickness: 0.8,
          ior: 1.55,
          clearcoat: 1,
          attenuationColor: new THREE.Color(0xa9c6ff),
          attenuationDistance: 3.2,
          envMapIntensity: 1.8,
          specularIntensity: 1,
        }),
      ),
    );
    bezel.position.z = 0.34;
    content.add(bezel);

    // Thin luminous rim around the opening, so the glass has a crisp edge against a bright page.
    const rimOuter = roundedRect(photoW + 0.2, photoH + 0.2, 0.14);
    rimOuter.holes.push(new THREE.Path(roundedRect(photoW + 0.1, photoH + 0.1, 0.11).getPoints(24)));
    const rim = new THREE.Mesh(
      track(new THREE.ExtrudeGeometry(rimOuter, { depth: 0.02, bevelEnabled: false, curveSegments: 24 })),
      track(new THREE.MeshBasicMaterial({ color: BLUE, toneMapped: false })),
    );
    rim.position.z = 0.5;
    content.add(rim);

    // Viewfinder corner brackets.
    brackets = track(new THREE.MeshStandardMaterial({ color: BLUE, emissive: BLUE, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.25, side: THREE.DoubleSide }));
    const L = 0.62;
    const th = 0.1;
    const arm = new THREE.Shape();
    arm.moveTo(0, 0);
    arm.lineTo(L, 0);
    arm.lineTo(L, -th);
    arm.lineTo(th, -th);
    arm.lineTo(th, -L);
    arm.lineTo(0, -L);
    arm.closePath();
    const armGeo = track(new THREE.ExtrudeGeometry(arm, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2 }));
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const b = new THREE.Mesh(armGeo, brackets);
        b.scale.set(-sx, sy, 1);
        b.position.set(sx * (photoW / 2 + 0.2), sy * (photoH / 2 + 0.2), 0.52);
        content.add(b);
      }
    }

    // Scan beam: a sheet of light with a bright leading edge.
    beam = new THREE.Group();
    const trail = new THREE.Mesh(
      track(new THREE.PlaneGeometry(photoW + 0.5, 1.0)),
      track(
        new THREE.MeshBasicMaterial({
          map: track(
            canvasTexture(8, 128, (g) => {
              const grad = g.createLinearGradient(0, 0, 0, 128);
              grad.addColorStop(0, 'rgba(79,139,255,0)');
              grad.addColorStop(0.85, 'rgba(79,139,255,0.5)');
              grad.addColorStop(1, 'rgba(255,255,255,0.95)');
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
    const edge = new THREE.Mesh(track(new THREE.BoxGeometry(photoW + 0.5, 0.03, 0.03)), track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })));
    beam.add(trail, edge);
    beam.position.z = 0.28;
    beam.visible = false;
    content.add(beam);

    hitGroup = new THREE.Group();
    content.add(hitGroup);

    // Soft drop shadow on the backdrop.
    const shadow = new THREE.Mesh(
      track(new THREE.PlaneGeometry(slabW * 1.25, slabH * 1.25)),
      track(
        new THREE.MeshBasicMaterial({
          map: track(
            canvasTexture(256, 256, (g) => {
              const r = g.createRadialGradient(128, 128, 10, 128, 128, 128);
              r.addColorStop(0, 'rgba(20,45,110,0.42)');
              r.addColorStop(1, 'rgba(20,45,110,0)');
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
    shadow.position.set(0.3, -0.55, -0.9);
    content.add(shadow);

    applyHits();
    fit();
    requestRender();
  }

  function fit(): void {
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const inset = parseFloat(getComputedStyle(container).getPropertyValue('--bottom-inset')) || 0;
    const usableH = Math.max(1, size.h - inset);
    const a = size.w / usableH;
    const needW = slabW + 2.1;
    const needH = slabH + 2.0;
    const d = Math.max(needH / (2 * tan), needW / (2 * tan * a));
    // Shift the camera down so the object sits in the upper, usable part of the stage.
    const shift = (inset / size.h) * d * tan;
    camera.aspect = size.w / size.h;
    camera.position.set(0, -shift, d);
    camera.lookAt(0, -shift, 0);
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
      const cw = photoW / 3 - 0.12;
      const ch = photoH / 3 - 0.12;
      const geo = track(new RoundedBoxGeometry(cw, ch, 0.1, 3, 0.06));
      const low = f.confidence === 'low';
      const mesh = new THREE.Mesh(
        geo,
        track(new THREE.MeshPhysicalMaterial({ color: CORAL, emissive: CORAL, emissiveIntensity: low ? 0.25 : 0.5, transparent: true, opacity: low ? 0.3 : 0.5, roughness: 0.2, clearcoat: 1 })),
      );
      const edges = new THREE.LineSegments(track(new THREE.EdgesGeometry(geo)), track(new THREE.LineBasicMaterial({ color: CORAL })));
      const holder = new THREE.Group();
      holder.add(mesh, edges);
      holder.position.set(x, y, 0.1);
      hitGroup.add(holder);
      hits.push({ mesh: holder, start: t + i * 0.18 });
    });
  }

  function update(dt: number): void {
    t += dt;
    intro = Math.min(1, intro + dt / 1.5);
    const e = easeOut(intro);
    root.scale.setScalar(0.88 + 0.12 * e);
    const targetY = -0.2 + px * 0.2 + (1 - e) * -0.7;
    const targetX = 0.06 - py * 0.12;
    const k = Math.min(1, dt * 5);
    root.rotation.y += (targetY - root.rotation.y) * k;
    root.rotation.x += (targetX - root.rotation.x) * k;
    root.position.y = reduced ? 0 : Math.sin(t * 0.9) * 0.05;
    if (sheenTex) sheenTex.offset.x = 0.15 - px * 0.3;
    if (brackets) brackets.emissiveIntensity = state === 'scanning' && !reduced ? 0.6 + 0.5 * Math.sin(t * 6) ** 2 : 0.5;
    if (beam) {
      beam.visible = state === 'scanning';
      if (beam.visible) {
        const p = reduced ? 0.5 : easeInOut(((t - scanStart) % 2.4) / 2.4);
        beam.position.y = photoH / 2 + 0.3 - p * (photoH + 0.6);
      }
    }
    for (const h of hits) {
      const p = reduced ? 1 : easeOut(clamp01((t - h.start) / 0.7));
      h.mesh.position.z = 0.1 + 0.34 * p + (reduced ? 0 : Math.sin(t * 2 + h.start * 5) * 0.012 * p);
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
