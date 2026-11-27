import * as THREE from 'three';

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- procedural noise ---------- */
export function hash(ix: number, iy: number): number {
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
export function fbm(x: number, y: number, oct = 5): number {
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
/** Terrain height. Water sits at 0. Mountains rise towards -z. */
export function heightAt(x: number, z: number): number {
  const back = smooth(22, 92, -z);
  const hills = fbm(x * 0.05 + 7, z * 0.05 + 3) * 4.2;
  const r = ridged(x * 0.028 + 11, z * 0.028 - 5);
  const peaks = Math.pow(r, 1.5) * 21 * back * (0.55 + 0.45 * smooth(0, 45, Math.abs(x) + 8));
  const sides = smooth(22, 58, Math.abs(x)) * 11 * (0.6 + fbm(x * 0.04, z * 0.04));
  const q = Math.pow((x - LAKE.x) / LAKE.rx, 2) + Math.pow((z - LAKE.z) / LAKE.rz, 2);
  const carve = Math.max(0, 1 - q);
  const shore = smooth(0, 1, 1 - q);
  return 1.6 + hills * (1 - 0.5 * carve) + peaks * (1 - 0.9 * carve) + sides - 7.5 * shore;
}

export function skyTexture(): THREE.CanvasTexture {
  return canvasTexture(8, 512, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#1478e6');
    gr.addColorStop(0.28, '#3ea4f2');
    gr.addColorStop(0.44, '#9fd8f7');
    gr.addColorStop(0.5, '#d6f0fb');
    gr.addColorStop(0.56, '#bfe6d6');
    gr.addColorStop(1, '#7fc79a');
    g.fillStyle = gr;
    g.fillRect(0, 0, 8, 512);
  });
}

export const SUN_DIR = new THREE.Vector3(0.5, 0.26, -0.82).normalize();
export const HORIZON = 0xcdebf6;
