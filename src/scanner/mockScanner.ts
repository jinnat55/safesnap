import type { ScanOutcome, ScanResult } from '../types';

/**
 * Development-only stand-in with the same output shape as the real scanner, so the UI and flow
 * can be built on machines where Gemini Nano does not run. It looks at the FILE NAME only.
 * The UI must show a visible "development mock" banner whenever this runs.
 */
export function mockResultFor(fileName: string): ScanResult {
  const name = fileName.toLowerCase();
  if (name.includes('none') || name.includes('clean')) {
    return { findings: [], imageQuality: 'clear' };
  }
  if (name.includes('doc') || name.includes('letter')) {
    return {
      findings: [{ category: 'document', cell: 'center', size: 'large', confidence: 'high' }],
      imageQuality: 'clear',
    };
  }
  if (name.includes('blur')) {
    return { findings: [], imageQuality: 'too_small_or_blurry' };
  }
  return {
    findings: [
      { category: 'card_like_object', cell: 'bottom-left', size: 'small', confidence: 'low' },
      { category: 'face', cell: 'top-right', size: 'medium', confidence: 'medium' },
    ],
    imageQuality: 'clear',
  };
}

export async function mockScan(file: File): Promise<ScanOutcome> {
  const started = performance.now();
  await new Promise((resolve) => setTimeout(resolve, 900));
  return {
    result: mockResultFor(file.name),
    source: 'MOCK',
    elapsedMs: Math.round(performance.now() - started),
  };
}
