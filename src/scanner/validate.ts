import {
  CATEGORIES,
  CONFIDENCES,
  GRID_CELLS,
  IMAGE_QUALITIES,
  SIZES,
  ScanParseError,
  type Finding,
  type ScanResult,
} from '../types';

const MAX_FINDINGS = 8;

function oneOf<T extends readonly string[]>(list: T, value: unknown): T[number] | null {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
    ? (value as T[number])
    : null;
}

/**
 * Turns raw model text into a trusted ScanResult. Anything outside the schema is dropped,
 * never repaired: a privacy tool must not guess. Invalid JSON throws ScanParseError.
 */
export function parseScanResult(raw: string): ScanResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ScanParseError('The scan result was not valid JSON.');
  }
  if (typeof data !== 'object' || data === null) {
    throw new ScanParseError('The scan result had an unexpected shape.');
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.findings)) {
    throw new ScanParseError('The scan result had no findings list.');
  }
  const findings: Finding[] = [];
  for (const item of obj.findings.slice(0, MAX_FINDINGS)) {
    if (typeof item !== 'object' || item === null) continue;
    const f = item as Record<string, unknown>;
    const category = oneOf(CATEGORIES, f.category);
    const cell = oneOf(GRID_CELLS, f.cell);
    const size = oneOf(SIZES, f.size);
    const confidence = oneOf(CONFIDENCES, f.confidence);
    if (category && cell && size && confidence) {
      findings.push({ category, cell, size, confidence });
    }
  }
  const imageQuality = oneOf(IMAGE_QUALITIES, obj.imageQuality) ?? 'too_small_or_blurry';
  return { findings, imageQuality };
}
