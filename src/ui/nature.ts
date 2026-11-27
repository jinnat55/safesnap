import * as THREE from 'three';
import { HORIZON, SUN_DIR, canvasTexture, fbm, hash, heightAt, skyTexture, smooth } from './terrain';

export interface Nature {
  dispose(): void;
}

/**
 * Full-page 3D landscape behind the whole app: snow peaks, lake, pine forest, flower meadow, clouds, sun.
 * The camera glides through the valley as the page scrolls. Purely decorative (aria-hidden by the caller).
 */
export function createNature(container: HTMLElement): Nature | null {
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
  scene.fog = new THREE.Fog(HORIZON, 40, 150);
  const disposables: Array<{ dispose(): void }> = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // Sky dome and reflection environment.
  const skyTex = keep(skyTexture());
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(190, 48, 32)), keep(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false })));
  scene.add(sky);
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
            r.addColorStop(0, 'rgba(255,252,235,1)');
            r.addColorStop(0.16, 'rgba(255,238,185,0.75)');
            r.addColorStop(0.5, 'rgba(255,214,150,0.2)');
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
  glow.scale.setScalar(120);
  scene.add(glow);

  // Terrain.
  const TW = 170;
  const TD = 170;
  const SX = small ? 150 : 220;
  const SZ = small ? 150 : 220;
  const geo = keep(new THREE.PlaneGeometry(TW, TD, SX, SZ));
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -TD / 2 + 50);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const pal = {
    sand: new THREE.Color(0xd2c498),
    meadow: new THREE.Color(0x8cbc5a),
    forest: new THREE.Color(0x3a7a44),
    deep: new THREE.Color(0x285a38),
    rock: new THREE.Color(0x857f76),
    snow: new THREE.Color(0xf6f9fc),
  };
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i);
    const slope = 1 - nrm.getY(i);
    const n = fbm(pos.getX(i) * 0.3, pos.getZ(i) * 0.3, 3);
    c.copy(pal.sand);
    c.lerp(pal.meadow, smooth(0.1, 0.9, h + n * 0.6));
    c.lerp(pal.forest, smooth(1.8, 4.5, h + n * 1.4));
    c.lerp(pal.deep, smooth(3.2, 7, h) * 0.6);
    c.lerp(pal.rock, smooth(6.5, 11, h + n * 2) * 0.9);
    c.lerp(pal.rock, smooth(0.16, 0.34, slope + n * 0.06));
    c.lerp(pal.snow, smooth(13, 18, h + n * 3) * (1 - smooth(0.22, 0.5, slope)));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(geo, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }))));

  // Lake.
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
  scene.add(new THREE.Mesh(wgeo, keep(new THREE.MeshPhysicalMaterial({ color: 0x2b86a3, roughness: 0.06, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6, bumpMap: ripple, bumpScale: 0.35, transparent: true, opacity: 0.94 }))));

  // Camera path through the valley, driven by scroll.
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
  const posPath = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 6, 28), new THREE.Vector3(-12, 4.6, 8), new THREE.Vector3(-26, 3.4, -10), new THREE.Vector3(-30, 2.8, -24)]);
  const lookPath = new THREE.CatmullRomCurve3([new THREE.Vector3(2, 8, -50), new THREE.Vector3(8, 6, -42), new THREE.Vector3(8, 4, -40), new THREE.Vector3(2, 3, -45)]);
  const pathPts = Array.from({ length: 16 }, (_, i) => posPath.getPoint(i / 15));
  const nearPath = (x: number, z: number, r: number) => pathPts.some((v) => (v.x - x) ** 2 + (v.z - z) ** 2 < r * r);

  // Pine forest.
  const TREES = small ? 900 : 2000;
  const coneA = keep(new THREE.ConeGeometry(0.55, 1.7, 7));
  coneA.translate(0, 1.0, 0);
  const coneB = keep(new THREE.ConeGeometry(0.4, 1.3, 7));
  coneB.translate(0, 1.85, 0);
  const treeMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }));
  const lower = new THREE.InstancedMesh(coneA, treeMat, TREES);
  const upper = new THREE.InstancedMesh(coneB, treeMat, TREES);
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
    if (h < 0.45 || h > 7.5 || fbm(x * 0.07 + 40, z * 0.07) < 0.43 || nearPath(x, z, 11)) continue;
    const slope = Math.abs(heightAt(x + 0.6, z) - h) + Math.abs(heightAt(x, z + 0.6) - h);
    if (slope > 1.1) continue;
    const s = 0.6 + hash(k, 5) * 0.9 + smooth(0, 40, -z) * 0.6;
    tp.set(x, h - 0.05, z);
    sc.set(s, s * (0.85 + hash(k, 8) * 0.5), s);
    q.setFromAxisAngle(up, hash(k, 3) * 6.28);
    m4.compose(tp, q, sc);
    lower.setMatrixAt(placed, m4);
    upper.setMatrixAt(placed, m4);
    col.setHSL(0.31 + hash(k, 12) * 0.06, 0.42 + hash(k, 2) * 0.2, 0.2 + hash(k, 6) * 0.12);
    lower.setColorAt(placed, col);
    upper.setColorAt(placed, col);
    placed++;
  }
  lower.count = upper.count = placed;
  scene.add(lower, upper);

  // Wildflower meadow on the low shore.
  const FLOWERS = small ? 1200 : 3200;
  const fgeo = keep(new THREE.SphereGeometry(0.11, 8, 6));
  const fmat = keep(new THREE.MeshStandardMaterial({ roughness: 0.6 }));
  const flowers = new THREE.InstancedMesh(fgeo, fmat, FLOWERS);
  const bloom = [0xffd23f, 0xffffff, 0xff7aa8, 0xb78cff, 0xff9a3c, 0x7fd1ff];
  let nf = 0;
  for (let k = 0; k < 90000 && nf < FLOWERS; k++) {
    const x = (hash(k, 7) - 0.5) * 120;
    const z = 34 - hash(k, 9) * 80;
    const h = heightAt(x, z);
    if (h < 0.25 || h > 2.4 || nearPath(x, z, 7)) continue;
    if (fbm(x * 0.12 + 5, z * 0.12 + 9) < 0.45) continue;
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

  // Clouds.
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

  let target = 0;
  let prog = 0;
  let px = 0;
  let py = 0;
  const p = new THREE.Vector3();
  const l = new THREE.Vector3();

  function aim(): void {
    posPath.getPoint(prog, p);
    lookPath.getPoint(prog, l);
    p.x += px * 1.6;
    p.y += -py * 0.6;
    p.y = Math.max(p.y, heightAt(p.x, p.z) + 2.2);
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
      ripple.offset.x = (t * 0.004) % 1;
      ripple.offset.y = (t * 0.002) % 1;
      for (let i = 0; i < clouds.length; i++) {
        clouds[i].position.x += dt * (0.6 + i * 0.07);
        if (clouds[i].position.x > 160) clouds[i].position.x = -160;
      }
    }
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
      lower.dispose();
      upper.dispose();
      flowers.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
