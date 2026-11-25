import { describe, expect, it } from 'vitest';
import { cellDistance, median, summarize, type ImageRun } from '../src/eval/metrics';

const f = (category: any, cell: any) => ({ category, cell, size: 'medium', confidence: 'high' }) as const;
const run = (id: string, truth: ImageRun['truth'], findings: ImageRun['findings'], ms = 100): ImageRun => ({ id, truth, findings: [...findings], elapsedMs: ms });

describe('eval metrics', () => {
  it('measures detection, misses and exact-cell hits', () => {
    const s = summarize([
      run('a', [{ category: 'card_like_object', cell: 'center', size: 'small' }], [f('card_like_object', 'center')]),
      run('b', [{ category: 'face', cell: 'top-left', size: 'large' }], [f('face', 'top-center')]),
      run('c', [{ category: 'document', cell: 'bottom-right', size: 'medium' }], []),
    ]);
    expect(s.truthItems).toBe(3);
    expect(s.detected.hits).toBe(2);
    expect(s.exactCell.hits).toBe(1);
    expect(s.nearCell.hits).toBe(2);
    expect(s.missed).toBe(1);
    expect(s.bySize.small.rate).toBe(1);
    expect(s.bySize.medium.rate).toBe(0);
  });
  it('counts false findings and flagged clean images', () => {
    const s = summarize([
      run('a', [], [f('screen', 'center')]),
      run('b', [], []),
      run('c', [{ category: 'face', cell: 'center', size: 'small' }], [f('face', 'center'), f('document', 'top-left')]),
    ]);
    expect(s.falseFindings).toBe(2);
    expect(s.cleanImages).toEqual({ hits: 1, total: 2, rate: 0.5 });
  });
  it('excludes failed runs from rates but reports them', () => {
    const s = summarize([{ ...run('a', [{ category: 'face', cell: 'center', size: 'small' }], []), error: 'x' }]);
    expect(s.failedRuns).toBe(1);
    expect(s.detected.rate).toBeNull();
  });
  it('helpers', () => {
    expect(cellDistance('top-left', 'center')).toBe(1);
    expect(cellDistance('top-left', 'bottom-right')).toBe(2);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBeNull();
  });
});
