import { pct, type EvalResults } from '../eval/metrics';
import { el } from './render';

const ENGINE_NAME = { ON_DEVICE: 'on-device model (Gemini Nano)', IN_CLOUD: 'cloud model', MOCK: 'development mock' } as const;

/** Shows measured results from a real run, or says plainly that none exist yet. A mock run is never shown. */
export async function renderMeasured(): Promise<void> {
  const body = document.getElementById('measured-body');
  if (!body) return;
  let results: EvalResults | null = null;
  try {
    const res = await fetch('/eval/results.json', { cache: 'no-cache' });
    if (res.ok) results = (await res.json()) as EvalResults;
  } catch {
    results = null;
  }
  if (!results || results.engine === 'MOCK') {
    body.replaceChildren(el('p', { className: 'muted', text: 'No measured results have been published yet. SafeSnap will not claim an accuracy it has not measured.' }));
    return;
  }
  const s = results.summary;
  const stat = (value: string, label: string) => el('div', { className: 'stat' }, [el('b', { text: value }), el('span', { text: label })]);
  body.replaceChildren(
    el('p', { className: 'muted', text: `Measured on ${s.images} synthetic test scenes with fake data, using the ${ENGINE_NAME[results.engine]}. Drawn scenes are easier than real photos, so treat these as a floor for testing, not a promise.` }),
    el('div', { className: 'stats' }, [
      stat(pct(s.detected), `of private items found (${s.missed} missed)`),
      stat(pct(s.bySize.small), 'of small items found'),
      stat(pct(s.nearCell), 'placed within one grid cell'),
      stat(pct(s.cleanImages), 'of clean photos wrongly flagged'),
    ]),
    el('p', { className: 'muted', text: `Median time ${s.medianMs ?? 'n/a'} ms. Full per-scene results are in the evaluation runner.` }),
  );
}
