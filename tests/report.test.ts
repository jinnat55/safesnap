import { describe, expect, it } from 'vitest';
import { buildReport, describeFinding } from '../src/report/report';
import type { ScanOutcome } from '../src/types';

const outcome = (over: Partial<ScanOutcome['result']> = {}, source: ScanOutcome['source'] = 'ON_DEVICE'): ScanOutcome => ({
  result: { findings: [], imageQuality: 'clear', ...over },
  source,
  elapsedMs: 10,
});

describe('buildReport', () => {
  it('never says a photo is safe, even when nothing is found', () => {
    const r = buildReport(outcome());
    const text = [r.headline, ...r.advice, r.note].join(' ');
    expect(r.headline).toContain('can’t be certain');
    expect(text).not.toMatch(/\bsafe\b/i);
    expect(text).not.toMatch(/no risk|nothing to worry|all clear/i);
  });

  it('describes position as an estimate and uses the grid', () => {
    const r = buildReport(
      outcome({ findings: [{ category: 'card_like_object', cell: 'bottom-left', size: 'small', confidence: 'low' }] }),
    );
    expect(r.items[0].sentence).toBe('Small card-like object, bottom left (low confidence).');
    expect(r.note).toMatch(/not verified/);
    expect(r.advice.join(' ')).toMatch(/Small items are the easiest to miss/);
  });

  it('advises a retake when the image is too small or blurry', () => {
    const r = buildReport(outcome({ imageQuality: 'too_small_or_blurry' }));
    expect(r.advice.join(' ')).toMatch(/retake/);
  });

  it('pluralizes the headline', () => {
    const f = { category: 'face', cell: 'center', size: 'large', confidence: 'high' } as const;
    expect(buildReport(outcome({ findings: [f] })).headline).toBe('I may have found 1 possible private item.');
    expect(buildReport(outcome({ findings: [f, f] })).headline).toBe('I may have found 2 possible private items.');
  });

  it('states which engine ran, and flags the mock', () => {
    expect(buildReport(outcome({}, 'ON_DEVICE')).engineLine).toMatch(/did not leave your computer/);
    expect(buildReport(outcome({}, 'IN_CLOUD')).engineLine).toMatch(/sent to Google/);
    expect(buildReport(outcome({}, 'MOCK')).engineLine).toMatch(/not a real scan/);
  });

  it('omits the confidence note for high confidence', () => {
    expect(describeFinding({ category: 'face', cell: 'center', size: 'medium', confidence: 'high' })).toBe(
      'A face or part of a face, center.',
    );
  });
});
