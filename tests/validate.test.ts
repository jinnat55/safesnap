import { describe, expect, it } from 'vitest';
import { parseScanResult } from '../src/scanner/validate';
import { mockResultFor } from '../src/scanner/mockScanner';

describe('parseScanResult', () => {
  it('accepts a valid result', () => {
    const r = parseScanResult(
      JSON.stringify({
        findings: [{ category: 'document', cell: 'center', size: 'large', confidence: 'high' }],
        imageQuality: 'clear',
      }),
    );
    expect(r.findings).toHaveLength(1);
    expect(r.imageQuality).toBe('clear');
  });

  it('drops invalid findings instead of repairing them', () => {
    const r = parseScanResult(
      JSON.stringify({
        findings: [
          { category: 'passport_number', cell: 'center', size: 'large', confidence: 'high' },
          { category: 'face', cell: 'nowhere', size: 'large', confidence: 'high' },
          { category: 'face', cell: 'center', size: 'large', confidence: 'high' },
        ],
        imageQuality: 'clear',
      }),
    );
    expect(r.findings).toEqual([{ category: 'face', cell: 'center', size: 'large', confidence: 'high' }]);
  });

  it('treats an unknown image quality as not reliable', () => {
    expect(parseScanResult(JSON.stringify({ findings: [], imageQuality: '??' })).imageQuality).toBe('too_small_or_blurry');
  });

  it('caps the number of findings', () => {
    const f = { category: 'face', cell: 'center', size: 'small', confidence: 'low' };
    const r = parseScanResult(JSON.stringify({ findings: Array(20).fill(f), imageQuality: 'clear' }));
    expect(r.findings).toHaveLength(8);
  });

  it('throws on invalid JSON and on a wrong shape', () => {
    expect(() => parseScanResult('not json')).toThrow('not valid JSON');
    expect(() => parseScanResult('{"nothing":1}')).toThrow('no findings list');
    expect(() => parseScanResult('42')).toThrow('unexpected shape');
  });
});

describe('mockResultFor', () => {
  it('is deterministic and uses only the file name', () => {
    expect(mockResultFor('clean.jpg').findings).toHaveLength(0);
    expect(mockResultFor('my-letter.png').findings[0].category).toBe('document');
    expect(mockResultFor('IMG_001.jpg').findings.length).toBeGreaterThan(0);
  });
});
