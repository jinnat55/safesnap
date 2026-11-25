import { GRID_CELLS, type Category, type Finding, type GridCell, type InferenceSource, type Size } from '../types';

export interface TruthItem { category: Category; cell: GridCell; size: Size }
export interface ManifestImage { id: string; file: string; truth: TruthItem[] }

export interface ImageRun {
  id: string;
  truth: TruthItem[];
  findings: Finding[];
  elapsedMs: number;
  error?: string;
}

export interface Rate { hits: number; total: number; rate: number | null }
export interface EvalSummary {
  images: number;
  failedRuns: number;
  truthItems: number;
  /** A truth item counts as detected if any finding has the same category. */
  detected: Rate;
  /** Detected with the exact same grid cell. */
  exactCell: Rate;
  /** Detected within one cell (including diagonals). */
  nearCell: Rate;
  missed: number;
  /** Findings with a category that is not in the image's truth. */
  falseFindings: number;
  /** Images with no private items where SafeSnap still reported something. */
  cleanImages: Rate;
  bySize: Record<Size, Rate>;
  byCategory: Partial<Record<Category, Rate>>;
  medianMs: number | null;
}
export interface EvalResults {
  engine: InferenceSource;
  runAt: string;
  imageSet: string;
  summary: EvalSummary;
  runs: ImageRun[];
}

const rate = (hits: number, total: number): Rate => ({ hits, total, rate: total === 0 ? null : hits / total });
const coords = (c: GridCell) => { const i = GRID_CELLS.indexOf(c); return [i % 3, Math.floor(i / 3)] as const; };
export function cellDistance(a: GridCell, b: GridCell): number {
  const [ax, ay] = coords(a), [bx, by] = coords(b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

export function summarize(runs: ImageRun[]): EvalSummary {
  const ok = runs.filter((r) => !r.error);
  let detected = 0, exact = 0, near = 0, total = 0, falseFindings = 0, cleanTotal = 0, cleanFlagged = 0;
  const size: Record<Size, [number, number]> = { small: [0, 0], medium: [0, 0], large: [0, 0] };
  const cat: Partial<Record<Category, [number, number]>> = {};
  for (const r of ok) {
    const truthCats = new Set(r.truth.map((t) => t.category));
    falseFindings += r.findings.filter((f) => !truthCats.has(f.category)).length;
    if (r.truth.length === 0) { cleanTotal++; if (r.findings.length > 0) cleanFlagged++; }
    for (const t of r.truth) {
      total++;
      const same = r.findings.filter((f) => f.category === t.category);
      const hit = same.length > 0;
      if (hit) detected++;
      if (same.some((f) => f.cell === t.cell)) exact++;
      if (same.some((f) => cellDistance(f.cell, t.cell) <= 1)) near++;
      size[t.size][1]++; if (hit) size[t.size][0]++;
      const c = (cat[t.category] ??= [0, 0]); c[1]++; if (hit) c[0]++;
    }
  }
  const byCategory: Partial<Record<Category, Rate>> = {};
  for (const [k, v] of Object.entries(cat)) byCategory[k as Category] = rate(v![0], v![1]);
  return {
    images: runs.length,
    failedRuns: runs.length - ok.length,
    truthItems: total,
    detected: rate(detected, total),
    exactCell: rate(exact, total),
    nearCell: rate(near, total),
    missed: total - detected,
    falseFindings,
    cleanImages: rate(cleanFlagged, cleanTotal),
    bySize: { small: rate(...size.small), medium: rate(...size.medium), large: rate(...size.large) },
    byCategory,
    medianMs: median(ok.map((r) => r.elapsedMs)),
  };
}

export const pct = (r: Rate): string => (r.rate === null ? 'n/a' : `${Math.round(r.rate * 100)}%`);
