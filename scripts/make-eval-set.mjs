// Generates the synthetic evaluation set: 40 scenes with FAKE data and known ground truth.
// Run: node scripts/make-eval-set.mjs   (needs Google Chrome; set CHROME_PATH if not at /usr/bin/google-chrome)
// Honest limit: these are drawn illustrations, a weak proxy for real photos. Real-photo results must be reported separately.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const W = 1200, H = 800;
const COLS = [200, 600, 1000], ROWS = [133, 400, 667];
const CELLS = ['top-left','top-center','top-right','middle-left','center','middle-right','bottom-left','bottom-center','bottom-right'];
const SCALE = { small: 0.55, medium: 1, large: 1.45 };

let seed = 20261126;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const cellXY = (cell) => { const i = CELLS.indexOf(cell); return [COLS[i % 3] + (rnd() - 0.5) * 50, ROWS[Math.floor(i / 3)] + (rnd() - 0.5) * 40]; };

const shadow = (w, h) => `<ellipse cx="0" cy="${h / 2 + 8}" rx="${w * 0.45}" ry="12" fill="#00000028"/>`;
const ITEMS = {
  card: (c) => `<g>${shadow(330, 208)}<rect x="-165" y="-104" width="330" height="208" rx="18" fill="${c}"/><rect x="-165" y="-60" width="330" height="36" fill="#0b1522" opacity=".75"/><rect x="-135" y="10" width="200" height="16" rx="5" fill="#e4edf6" opacity=".85"/><rect x="-135" y="50" width="110" height="12" rx="4" fill="#e4edf6" opacity=".6"/><rect x="95" y="-90" width="52" height="36" rx="8" fill="#e5c26a"/><text x="-135" y="-72" font-size="13" fill="#e4edf6" font-family="sans-serif">TEST CARD 0000</text></g>`,
  document: () => `<g>${shadow(300, 390)}<rect x="-150" y="-195" width="300" height="390" fill="#fbfaf6" stroke="#cfc8b8"/><rect x="-120" y="-160" width="130" height="14" rx="3" fill="#8b8576"/>${[...Array(9)].map((_, i) => `<rect x="-120" y="${-120 + i * 26}" width="${200 + (i % 3) * 25}" height="9" rx="3" fill="#b8b2a3"/>`).join('')}<text x="-120" y="150" font-size="12" fill="#8b8576" font-family="sans-serif">SAMPLE LETTER (FAKE)</text></g>`,
  screen: () => `<g><rect x="-210" y="-135" width="420" height="270" rx="12" fill="#222831"/><rect x="-194" y="-119" width="388" height="238" rx="6" fill="#4d7ea8"/><rect x="-176" y="-98" width="150" height="14" rx="4" fill="#cfe3f3"/><rect x="-176" y="-72" width="280" height="10" rx="4" fill="#a9c9e2"/><rect x="-176" y="-50" width="230" height="10" rx="4" fill="#a9c9e2"/><rect x="-176" y="-8" width="120" height="60" rx="6" fill="#2d5a80"/><rect x="-24" y="135" width="48" height="40" fill="#222831"/><rect x="-80" y="172" width="160" height="12" rx="6" fill="#222831"/></g>`,
  address: () => `<g>${shadow(380, 230)}<rect x="-190" y="-115" width="380" height="230" fill="#efe6d2" stroke="#c9bd9f"/><rect x="120" y="-100" width="52" height="62" fill="#c86b5a"/><text x="-160" y="-5" font-size="22" fill="#4a4333" font-family="serif">A. Example Person</text><text x="-160" y="26" font-size="22" fill="#4a4333" font-family="serif">12 Fake Street</text><text x="-160" y="57" font-size="22" fill="#4a4333" font-family="serif">Faketown 00000</text></g>`,
  face: () => `<g>${shadow(240, 300)}<rect x="-120" y="-150" width="240" height="300" rx="14" fill="#f5f2ea" stroke="#b5ad9c" stroke-width="3"/><circle cx="0" cy="-30" r="58" fill="#caa98a"/><path d="M-60 -50c0-50 120-50 120 0c-20-20-100-20-120 0z" fill="#3b2c22"/><circle cx="-20" cy="-34" r="5" fill="#2b2118"/><circle cx="20" cy="-34" r="5" fill="#2b2118"/><path d="M-18 0q18 14 36 0" stroke="#7a4a3a" stroke-width="4" fill="none"/><path d="M-100 140c10-70 60-92 100-92s90 22 100 92z" fill="#6c7a89"/></g>`,
};
const DISTRACT = {
  mug: () => `<g>${shadow(100, 90)}<rect x="-45" y="-45" width="90" height="90" rx="10" fill="#d8d3c8"/><path d="M45 -20c30 0 30 44 0 44" fill="none" stroke="#d8d3c8" stroke-width="10"/></g>`,
  plant: () => `<g>${shadow(120, 160)}<rect x="-40" y="10" width="80" height="70" rx="8" fill="#a8603f"/><path d="M0 10C-40-40-60-30-70-60c30 0 60 10 70 70zM0 10C40-50 60-40 70-70c-30 0-60 20-70 80z" fill="#4f8a4d"/></g>`,
  coaster: () => `<g>${shadow(120, 120)}<rect x="-60" y="-60" width="120" height="120" rx="10" fill="#8aa0b5"/></g>`,
  book: () => `<g>${shadow(220, 150)}<rect x="-110" y="-75" width="220" height="150" rx="6" fill="#7a3d3d"/><rect x="-96" y="-62" width="192" height="124" fill="#8c4a4a"/></g>`,
  keys: () => `<g>${shadow(120, 100)}<circle cx="-30" cy="0" r="22" fill="none" stroke="#9aa3ab" stroke-width="7"/><rect x="-6" y="-8" width="80" height="16" rx="5" fill="#b7bec5"/></g>`,
  tabletOff: () => `<g>${shadow(300, 210)}<rect x="-150" y="-105" width="300" height="210" rx="16" fill="#1a1d22"/><rect x="-138" y="-93" width="276" height="186" rx="8" fill="#0c0e11"/></g>`,
};
const WALLS = [['#d9d2c4', '#c9c0af'], ['#cfd8de', '#b9c5cd'], ['#e2d6cf', '#d2c4bb']];
const DESKS = [['#8a6a4a', '#6e5238'], ['#5c6b73', '#434f56'], ['#a58b6a', '#8a7253']];
const CARDCOL = ['#2f5d8a', '#7a2f4a', '#2f7a5d', '#4a4a52'];

const itemSvg = (kind, cell, size, colour) => {
  const [x, y] = cellXY(cell);
  const fn = ITEMS[kind] ?? DISTRACT[kind];
  return `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${((rnd() - 0.5) * 14).toFixed(1)}) scale(${SCALE[size]})">${fn(colour)}</g>`;
};
const scene = (parts, wi, di) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${WALLS[wi][0]}"/><stop offset="1" stop-color="${WALLS[wi][1]}"/></linearGradient><linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${DESKS[di][0]}"/><stop offset="1" stop-color="${DESKS[di][1]}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#w)"/><rect y="430" width="${W}" height="370" fill="url(#d)"/>${parts.join('')}</svg>`;

// Plan: 10 empty-of-private scenes, 30 with 1-2 private items. Sizes: ~1/3 small.
const KINDS = ['card', 'document', 'screen', 'address', 'face'];
const CAT = { card: 'card_like_object', document: 'document', screen: 'screen', address: 'address_like_text', face: 'face' };
const plan = [];
for (let i = 0; i < 10; i++) plan.push({ items: [], distract: 2 + (i % 2) });
for (let i = 0; i < 30; i++) {
  const n = i % 5 === 4 ? 2 : 1;
  const used = new Set(); const items = [];
  for (let k = 0; k < n; k++) {
    let cell; do { cell = pick(CELLS); } while (used.has(cell));
    used.add(cell);
    const kind = KINDS[(i + k * 2) % KINDS.length];
    const size = i % 3 === 0 ? 'small' : i % 3 === 1 ? 'medium' : 'large';
    items.push({ kind, cell, size: k === 1 ? pick(['small', 'medium']) : size });
  }
  plan.push({ items, distract: 1 + (i % 2) });
}

mkdirSync('public/eval/images', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const manifest = [];
let n = 0;
for (const p of plan) {
  n++;
  const id = `scene-${String(n).padStart(2, '0')}`;
  const wi = n % 3, di = (n + 1) % 3;
  const used = new Set(p.items.map((i) => i.cell));
  const parts = [];
  for (let d = 0; d < p.distract; d++) {
    const free = CELLS.filter((c) => !used.has(c)); const cell = pick(free); used.add(cell);
    parts.push(itemSvg(pick(Object.keys(DISTRACT)), cell, pick(['small', 'medium']), ''));
  }
  for (const it of p.items) parts.push(itemSvg(it.kind, it.cell, it.size, pick(CARDCOL)));
  await page.setContent(`<body style="margin:0">${scene(parts, wi, di)}</body>`);
  await page.screenshot({ path: `public/eval/images/${id}.png` });
  manifest.push({ id, file: `images/${id}.png`, truth: p.items.map((i) => ({ category: CAT[i.kind], cell: i.cell, size: i.size })) });
}
await browser.close();
writeFileSync('public/eval/manifest.json', JSON.stringify({ generated: 'synthetic, fake data only', images: manifest }, null, 2));
console.log(`wrote ${manifest.length} scenes`);
